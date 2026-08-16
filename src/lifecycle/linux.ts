/**
 * systemd placement for `qctl start --service` and the matching `qctl stop`.
 *
 * Writes `/etc/systemd/system/qctl.service` to run `qctl start -f`, enables it
 * at boot, and starts it now. Stop disables the unit and removes the file.
 */
import { getQctlEnvironment } from "../core/paths";
import { platformAdapter } from "../platform";
import { isCompiledWrapper, isPrivileged, runCommand, wrapperForegroundCommand } from "./process";
import { writeLifecycleState } from "./state";
import type { RuntimeOptions } from "./runtime";

const UNIT_PATH = "/etc/systemd/system/qctl.service";
const ENV_PATH = "/etc/qctl/monitor.env";

/** Shell-escapes one Environment= value for a systemd unit drop-in file. */
function escapeEnvValue(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** Renders the system unit that execs the compiled wrapper in the foreground. */
export function buildSystemdUnit(command = wrapperForegroundCommand()): string {
  const exec = command.map((part) => (part.includes(" ") ? `"${part}"` : part)).join(" ");
  return `[Unit]
Description=qctl collector and qcontrol monitor
After=network.target

[Service]
Type=simple
ExecStart=${exec}
Restart=on-failure
RestartSec=2
EnvironmentFile=-${ENV_PATH}
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
`;
}

/** Renders the invoking-user environment systemd injects into `qctl start -f`. */
export function buildSystemdEnvironment(env = getQctlEnvironment()): string {
  return ["HOME", "SUDO_USER", "QCONTROL_CONFIG_DIR", "QCONTROL_DATA_DIR", "QCONTROL_CACHE_DIR", "QCTL_CONFIG_DIR", "QCTL_DATA_DIR", "QCTL_CACHE_DIR", "QCTL_SOCKET_PATH", "XDG_CONFIG_HOME"]
    .flatMap((key) => {
      const value = env[key];
      return typeof value === "string" && value.length > 0 ? [`${key}=${escapeEnvValue(value)}`] : [];
    })
    .join("\n")
    .concat("\n");
}

/** Runs systemctl/install through sudo when this process is not root. */
async function runPrivileged(command: string[], stdio: Bun.SpawnOptions.Readable = "inherit"): Promise<number> {
  if (isPrivileged()) {
    return runCommand(command, stdio);
  }

  return runCommand(["sudo", "--", ...command], stdio);
}

/** Writes a root-owned file via a privileged shell so we do not need a temp hop. */
async function writeRootFile(path: string, contents: string): Promise<number> {
  const command = ["sh", "-c", `mkdir -p "$(dirname "$1")" && cat > "$1"`, "qctl", path];
  const child = Bun.spawn({
    cmd: isPrivileged() ? command : ["sudo", "--", ...command],
    stdin: new Blob([contents]),
    stdout: "inherit",
    stderr: "inherit",
  });
  return child.exited;
}

/** Installs, enables, and starts the systemd unit. */
export async function startSystemd(options: RuntimeOptions = {}): Promise<number> {
  if (!isCompiledWrapper()) {
    console.error("qctl start --service must run from the compiled qctl binary");
    return 1;
  }

  if (!platformAdapter.resolveInvokingUser()) {
    console.error("qctl start --service could not resolve the invoking user; run it with sudo from your account");
    return 1;
  }

  let exitCode = await writeRootFile(UNIT_PATH, buildSystemdUnit(wrapperForegroundCommand(options)));
  if (exitCode !== 0) {
    return exitCode;
  }

  exitCode = await writeRootFile(ENV_PATH, buildSystemdEnvironment());
  if (exitCode !== 0) {
    return exitCode;
  }

  exitCode = await runPrivileged(["systemctl", "daemon-reload"]);
  if (exitCode !== 0) {
    return exitCode;
  }

  exitCode = await runPrivileged(["systemctl", "enable", "--now", "qctl.service"]);
  if (exitCode !== 0) {
    return exitCode;
  }

  await writeLifecycleState({ manager: "systemd" });
  console.log("qctl started (systemd)");
  return 0;
}

/** Disables the unit and deletes the files `start --service` created. */
export async function stopSystemd(): Promise<number> {
  await runPrivileged(["systemctl", "disable", "--now", "qctl.service"], "ignore");
  const removeExitCode = await runPrivileged(["rm", "-f", UNIT_PATH, ENV_PATH]);
  if (removeExitCode !== 0) {
    return removeExitCode;
  }

  await runPrivileged(["systemctl", "daemon-reload"], "ignore");
  console.log("qctl stopped (systemd)");
  return 0;
}
