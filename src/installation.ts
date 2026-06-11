/**
 * Owns qctl installation helpers that initialize qcontrol, register launchd's
 * privileged daemon job, and wire qctl's run event socket sink into qcontrol.
 */
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { runQcontrolAsRoot } from "./qcontrol";

const QCTL_SINK_MARKER = "# qctl run-event socket sink";
const QCTL_CONFIG_DIR_ENV = "QCTL_CONFIG_DIR";
const QCTL_SOCKET_PATH_ENV = "QCTL_SOCKET_PATH";
const LAUNCH_DAEMON_LABEL = "com.qpoint.qctl";
const LAUNCH_DAEMON_PATH = `/Library/LaunchDaemons/${LAUNCH_DAEMON_LABEL}.plist`;
const LAUNCH_DAEMON_TARGET = `system/${LAUNCH_DAEMON_LABEL}`;
const LAUNCHD_LOG_DIR = "/Library/Logs/qctl";
const RUNTIME_SOCKET_DIR = "/var/run/qctl";
const RUNTIME_SOCKET_NAME = "collector.sock";

/** Resolves the qcontrol configuration directory using qcontrol's XDG layout. */
function defaultQcontrolConfigDir(): string {
  if (process.env[QCTL_CONFIG_DIR_ENV]) {
    return process.env[QCTL_CONFIG_DIR_ENV];
  }

  if (process.env.XDG_CONFIG_HOME) {
    return join(process.env.XDG_CONFIG_HOME, "qcontrol");
  }

  return join(homedir(), ".config", "qcontrol");
}

/** Returns the historic config-local socket path so uninstall can migrate it out. */
function legacyQctlSocketPath(): string {
  return join(defaultQcontrolConfigDir(), "qctl.sock");
}

/** Resolves qctl's runtime socket outside persistent qcontrol configuration. */
function defaultQctlSocketPath(): string {
  if (process.env[QCTL_SOCKET_PATH_ENV]) {
    return process.env[QCTL_SOCKET_PATH_ENV];
  }

  return join(RUNTIME_SOCKET_DIR, RUNTIME_SOCKET_NAME);
}

/** Resolves the stable socket path used by package-installed system daemons. */
function systemQctlSocketPath(): string {
  return join(RUNTIME_SOCKET_DIR, RUNTIME_SOCKET_NAME);
}

/** Escapes launchd plist string values without taking a dependency on plist IO. */
function escapePlistString(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * Resolves the binary launchd should execute, refusing script-mode installs that
 * would point a system daemon at Bun instead of the compiled qctl wrapper.
 */
function getQctlExecutablePath(): string {
  const configuredPath = process.env.QCTL_EXECUTABLE;
  if (configuredPath) {
    return resolve(configuredPath);
  }

  if (basename(process.execPath) === "bun") {
    throw new Error(
      "qctl install must run from the compiled qctl binary, or QCTL_EXECUTABLE must point to it",
    );
  }

  return resolve(process.execPath);
}

/** Controls which qctl paths and environment variables are written to launchd. */
interface LaunchDaemonPlistOptions {
  includeUserConfigEnvironment?: boolean;
  socketPath?: string;
}

/** Builds the root LaunchDaemon plist that runs qctl's daemon command in place. */
function buildLaunchDaemonPlist(options: LaunchDaemonPlistOptions = {}): string {
  const configDir = defaultQcontrolConfigDir();
  const includeUserConfigEnvironment = options.includeUserConfigEnvironment ?? true;
  const values = {
    executable: escapePlistString(getQctlExecutablePath()),
    configDir: escapePlistString(configDir),
    socketPath: escapePlistString(options.socketPath ?? getQctlSocketPath()),
    xdgConfigHome: escapePlistString(dirname(configDir)),
    stdoutPath: escapePlistString(join(LAUNCHD_LOG_DIR, "stdout.log")),
    stderrPath: escapePlistString(join(LAUNCHD_LOG_DIR, "stderr.log")),
  };
  const userConfigEnvironment = includeUserConfigEnvironment
    ? `    <key>${QCTL_CONFIG_DIR_ENV}</key>\n    <string>${values.configDir}</string>\n    <key>XDG_CONFIG_HOME</key>\n    <string>${values.xdgConfigHome}</string>\n`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_DAEMON_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${values.executable}</string>
    <string>daemon</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${userConfigEnvironment}    <key>${QCTL_SOCKET_PATH_ENV}</key>
    <string>${values.socketPath}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${values.stdoutPath}</string>
  <key>StandardErrorPath</key>
  <string>${values.stderrPath}</string>
</dict>
</plist>
`;
}

/** Runs a child process with inherited stdio so sudo and launchctl remain usable. */
async function runCommand(
  command: string[],
  stdio: Bun.SpawnOptions.Readable = "inherit",
): Promise<number> {
  return Bun.spawn({
    cmd: command,
    stdin: "inherit",
    stdout: stdio,
    stderr: stdio,
  }).exited;
}

/** Runs a command through sudo, preserving interactive password prompts. */
function runAsRoot(
  command: string[],
  stdio?: Bun.SpawnOptions.Readable,
): Promise<number> {
  return runCommand(["sudo", "--", ...command], stdio);
}

/** Detects whether launchd already has qctl's system daemon in its bootstrap set. */
async function isLaunchDaemonLoaded(): Promise<boolean> {
  return (
    (await runCommand(
      ["launchctl", "print", LAUNCH_DAEMON_TARGET],
      "ignore",
    )) === 0
  );
}

/** Installs the root-owned launchd plist without leaving user-writable service files. */
async function installLaunchDaemon(plist: string): Promise<number> {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "qctl-launchd-"));
  const temporaryPlist = join(
    temporaryDirectory,
    `${LAUNCH_DAEMON_LABEL}.plist`,
  );

  try {
    await writeFile(temporaryPlist, plist, { mode: 0o644 });

    let exitCode = await runAsRoot([
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
      RUNTIME_SOCKET_DIR,
    ]);
    if (exitCode !== 0) {
      return exitCode;
    }

    exitCode = await runAsRoot([
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

    return 0;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

/** Removes the LaunchDaemon plist after ensuring launchd no longer owns the job. */
async function removeLaunchDaemon(): Promise<number> {
  const stopExitCode = await stop();
  if (stopExitCode !== 0) {
    return stopExitCode;
  }

  const removePlistExitCode = await runAsRoot(["/bin/rm", "-f", LAUNCH_DAEMON_PATH]);
  if (removePlistExitCode !== 0) {
    return removePlistExitCode;
  }

  await runAsRoot(["/bin/rm", "-f", getQctlSocketPath(), legacyQctlSocketPath()]);
  await runAsRoot(["/bin/rmdir", RUNTIME_SOCKET_DIR], "ignore");

  return 0;
}

/** Returns the qcontrol run configuration file that owns event sink settings. */
export function getQcontrolRunConfigPath(): string {
  return join(defaultQcontrolConfigDir(), "run.toml");
}

/** Returns the Unix socket path where qctl listens for qcontrol run events. */
export function getQctlSocketPath(): string {
  return defaultQctlSocketPath();
}

/** Formats the socket path as the URL string expected by qcontrol sinks. */
export function getQctlSinkUrl(): string {
  return `unix://${pathToFileURL(getQctlSocketPath()).pathname}`;
}

/** Returns qctl socket URLs that should be treated as wrapper-owned sinks. */
function getQctlSinkUrls(): string[] {
  return [
    getQctlSinkUrl(),
    `unix://${pathToFileURL(legacyQctlSocketPath()).pathname}`,
  ];
}

/** Narrows filesystem failures to Node errno errors without trusting throws. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

/** Identifies TOML table headers so sink removal stays scoped to one table. */
function isTomlTableHeader(line: string): boolean {
  return /^\s*\[.*\]\s*(?:#.*)?$/.test(line);
}

/** Identifies qcontrol sink tables without interpreting unrelated TOML content. */
function isSinkTableHeader(line: string): boolean {
  return /^\s*\[\[sinks\]\]\s*(?:#.*)?$/.test(line);
}

/** Detects a qctl socket URL inside a sink table, regardless of TOML spacing. */
function sinkBlockTargetsQctlSocket(lines: string[], sinkUrls: string[]): boolean {
  return lines.some((line) => sinkUrls.some((sinkUrl) => line.includes(sinkUrl)));
}

/**
 * Removes qctl-owned sink tables from a run.toml document while preserving every
 * unrelated table, comment, and setting in the user's qcontrol configuration.
 */
function removeQctlSinkBlock(
  config: string,
  sinkUrls: string[],
): { config: string; removed: boolean } {
  const lines = config.split("\n");
  const retainedLines: string[] = [];
  let removed = false;

  for (let index = 0; index < lines.length; ) {
    if (!isSinkTableHeader(lines[index])) {
      retainedLines.push(lines[index]);
      index += 1;
      continue;
    }

    // A sink table owns all lines until the next TOML table header.
    let nextIndex = index + 1;
    while (nextIndex < lines.length && !isTomlTableHeader(lines[nextIndex])) {
      nextIndex += 1;
    }

    const sinkBlock = lines.slice(index, nextIndex);
    if (!sinkBlockTargetsQctlSocket(sinkBlock, sinkUrls)) {
      retainedLines.push(...sinkBlock);
      index = nextIndex;
      continue;
    }

    removed = true;
    if (retainedLines.at(-1)?.trim() === QCTL_SINK_MARKER) {
      retainedLines.pop();
    }
    index = nextIndex;
  }

  return { config: retainedLines.join("\n"), removed };
}

/**
 * Adds qctl's run-event sink to run.toml exactly once while preserving any
 * existing user-managed qcontrol configuration.
 */
async function appendQctlSinkConfig(): Promise<void> {
  const runConfigPath = getQcontrolRunConfigPath();
  const sinkUrl = getQctlSinkUrl();
  const sinkUrls = getQctlSinkUrls();

  let existingConfig = "";
  try {
    existingConfig = await readFile(runConfigPath, "utf8");
  } catch (error) {
    // Missing config is expected on first install; other read failures matter.
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  const migratedConfig = removeQctlSinkBlock(existingConfig, sinkUrls);
  if (migratedConfig.removed) {
    existingConfig = migratedConfig.config;
    await writeFile(runConfigPath, existingConfig, "utf8");
  } else if (existingConfig.includes(sinkUrl)) {
    return;
  }

  await mkdir(defaultQcontrolConfigDir(), { recursive: true });

  // Keep appended TOML separated from user content without excess whitespace.
  const separator =
    existingConfig.length === 0
      ? ""
      : existingConfig.endsWith("\n")
        ? "\n"
        : "\n\n";
  await appendFile(
    runConfigPath,
    `${separator}${QCTL_SINK_MARKER}\n[[sinks]]\nurl = ${JSON.stringify(sinkUrl)}\n`,
    { mode: 0o644 },
  );
}

/** Removes qctl's run-event sink from run.toml when it is present. */
async function removeQctlSinkConfig(): Promise<void> {
  const runConfigPath = getQcontrolRunConfigPath();
  const sinkUrls = getQctlSinkUrls();

  let existingConfig: string;
  try {
    existingConfig = await readFile(runConfigPath, "utf8");
  } catch (error) {
    // Uninstall should be idempotent when qcontrol was never initialized.
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
    return;
  }

  const updated = removeQctlSinkBlock(existingConfig, sinkUrls);
  if (!updated.removed) {
    return;
  }

  await writeFile(runConfigPath, updated.config, "utf8");
}

/** Installs root-owned host assets without mutating per-user qcontrol state. */
export async function installSystem(): Promise<number> {
  return installLaunchDaemon(buildLaunchDaemonPlist({
    includeUserConfigEnvironment: false,
    socketPath: systemQctlSocketPath(),
  }));
}

/** Initializes qcontrol with elevated privileges, then installs qctl's sink hook. */
export async function install(): Promise<number> {
  const systemExitCode = await installSystem();
  if (systemExitCode !== 0) {
    return systemExitCode;
  }

  await appendQctlSinkConfig();
  return 0;
}

/** Removes qctl's sink hook, then deinitializes qcontrol host integration. */
export async function uninstall(): Promise<number> {
  const launchDaemonExitCode = await removeLaunchDaemon();
  if (launchDaemonExitCode !== 0) {
    return launchDaemonExitCode;
  }

  await removeQctlSinkConfig();
  // return runQcontrolAsRoot({ args: ["deinit"] });
  return 0;
}

/** Loads the root LaunchDaemon and asks launchd to run the daemon immediately. */
export async function start(): Promise<number> {
  if (!(await isLaunchDaemonLoaded())) {
    const bootstrapExitCode = await runAsRoot([
      "launchctl",
      "bootstrap",
      "system",
      LAUNCH_DAEMON_PATH,
    ]);
    if (bootstrapExitCode !== 0) {
      return bootstrapExitCode;
    }
  }

  return runAsRoot(["launchctl", "kickstart", "-k", LAUNCH_DAEMON_TARGET]);
}

/** Unloads the root LaunchDaemon so KeepAlive cannot restart the scanner. */
export async function stop(): Promise<number> {
  if (!(await isLaunchDaemonLoaded())) {
    return 0;
  }

  return runAsRoot(["launchctl", "bootout", LAUNCH_DAEMON_TARGET]);
}
