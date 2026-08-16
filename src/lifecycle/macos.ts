/**
 * launchd placement for `qctl start --service` and the matching `qctl stop`.
 *
 * Registers a system LaunchDaemon that runs `qctl start -f` as root with the
 * invoking user's config environment. Stop boots the job out and removes the
 * plist.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { getQctlEnvironment } from "../core/paths";
import { platformAdapter } from "../platform";
import { isCompiledWrapper, isPrivileged, runCommand, wrapperForegroundCommand } from "./process";
import { writeLifecycleState } from "./state";
import type { RuntimeOptions } from "./runtime";

const LAUNCH_DAEMON_LABEL = "com.qpoint.qctl";
const LAUNCH_DAEMON_PATH = `/Library/LaunchDaemons/${LAUNCH_DAEMON_LABEL}.plist`;
const LAUNCH_DAEMON_TARGET = `system/${LAUNCH_DAEMON_LABEL}`;
const LAUNCHD_LOG_DIR = "/Library/Logs/qctl";

/** Escapes launchd plist string values without taking a dependency on plist IO. */
function escapePlistString(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Builds the LaunchDaemon plist that keeps `qctl start -f` alive. */
export function buildLaunchDaemonPlist(
  command = wrapperForegroundCommand(),
  env = getQctlEnvironment(),
): string {
  const programArguments = command
    .map((value) => `    <string>${escapePlistString(value)}</string>`)
    .join("\n");
  const environment = Object.entries(env)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .filter(([key]) => [
      "HOME",
      "SUDO_USER",
      "QCONTROL_CONFIG_DIR",
      "QCONTROL_DATA_DIR",
      "QCONTROL_CACHE_DIR",
      "QCTL_CONFIG_DIR",
      "QCTL_DATA_DIR",
      "QCTL_CACHE_DIR",
      "QCTL_SOCKET_PATH",
      "XDG_CONFIG_HOME",
    ].includes(key))
    .map(([key, value]) => `    <key>${escapePlistString(key)}</key>\n    <string>${escapePlistString(value)}</string>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_DAEMON_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${programArguments}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${environment}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
    <key>Crashed</key>
    <true/>
  </dict>
  <key>StandardOutPath</key>
  <string>${escapePlistString(`${LAUNCHD_LOG_DIR}/stdout.log`)}</string>
  <key>StandardErrorPath</key>
  <string>${escapePlistString(`${LAUNCHD_LOG_DIR}/stderr.log`)}</string>
</dict>
</plist>
`;
}

/** Runs a launchctl or install command, prefixing sudo when this process is not root. */
async function runPrivileged(command: string[], stdio: Bun.SpawnOptions.Readable = "inherit"): Promise<number> {
  if (isPrivileged()) {
    return runCommand(command, stdio);
  }

  return runCommand(["sudo", "--", ...command], stdio);
}

/** Installs the plist, bootstraps it, and kickstarts the job. */
export async function startLaunchd(options: RuntimeOptions = {}): Promise<number> {
  if (!isCompiledWrapper()) {
    console.error("qctl start --service must run from the compiled qctl binary");
    return 1;
  }

  if (!platformAdapter.resolveInvokingUser()) {
    console.error("qctl start --service could not resolve the invoking user; run it with sudo from your account");
    return 1;
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "qctl-launchd-"));
  const temporaryPlist = join(temporaryDirectory, `${LAUNCH_DAEMON_LABEL}.plist`);

  try {
    await writeFile(temporaryPlist, buildLaunchDaemonPlist(wrapperForegroundCommand(options)), { mode: 0o644 });

    let exitCode = await runPrivileged([
      "/usr/bin/install",
      "-d",
      "-o",
      "root",
      "-g",
      "wheel",
      "-m",
      "755",
      dirname(LAUNCH_DAEMON_PATH),
      LAUNCHD_LOG_DIR,
    ]);
    if (exitCode !== 0) {
      return exitCode;
    }

    exitCode = await runPrivileged([
      "/usr/bin/install",
      "-o",
      "root",
      "-g",
      "wheel",
      "-m",
      "644",
      temporaryPlist,
      LAUNCH_DAEMON_PATH,
    ]);
    if (exitCode !== 0) {
      return exitCode;
    }

    const loaded = (await runPrivileged(["launchctl", "print", LAUNCH_DAEMON_TARGET], "ignore")) === 0;
    if (!loaded) {
      exitCode = await runPrivileged(["launchctl", "enable", LAUNCH_DAEMON_TARGET], "ignore");
      if (exitCode !== 0) {
        // enable can fail on a never-seen label; bootstrap still creates it.
      }

      exitCode = await runPrivileged(["launchctl", "bootstrap", "system", LAUNCH_DAEMON_PATH]);
      if (exitCode !== 0) {
        return exitCode;
      }
    }

    exitCode = await runPrivileged(["launchctl", "kickstart", "-k", LAUNCH_DAEMON_TARGET]);
    if (exitCode !== 0) {
      return exitCode;
    }

    await writeLifecycleState({ manager: "launchd" });
    console.log("qctl started (launchd)");
    return 0;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

/** Unloads the LaunchDaemon and deletes its plist. Missing jobs are success. */
export async function stopLaunchd(): Promise<number> {
  const loaded = (await runPrivileged(["launchctl", "print", LAUNCH_DAEMON_TARGET], "ignore")) === 0;
  if (loaded) {
    const exitCode = await runPrivileged(["launchctl", "bootout", LAUNCH_DAEMON_TARGET]);
    if (exitCode !== 0) {
      return exitCode;
    }
  }

  const removeExitCode = await runPrivileged(["/bin/rm", "-f", LAUNCH_DAEMON_PATH]);
  if (removeExitCode !== 0) {
    return removeExitCode;
  }

  console.log("qctl stopped (launchd)");
  return 0;
}
