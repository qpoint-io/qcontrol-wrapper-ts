/**
 * Implements the Windows Service Control Manager-backed lifecycle command graph
 * used by qctl on Windows hosts.
 */
import { mkdir } from "node:fs/promises";
import { basename, dirname, resolve, win32 } from "node:path";

import type { InstallationActions, InstallationDependencies } from "./types";

const SERVICE_NAME = "qctl";
const SERVICE_DISPLAY_NAME = "qctl";
const SERVICE_DESCRIPTION = "Collects qcontrol events and forwards them through qctl.";
const SERVICE_PIPE_NAME = "qctl-collector";
const SERVICE_START_TIMEOUT_MS = 30_000;
const SERVICE_STOP_TIMEOUT_MS = 30_000;
const SERVICE_POLL_INTERVAL_MS = 500;
const QCTL_EXECUTABLE_ENV = "QCTL_EXECUTABLE";
const QCTL_SERVICE_HOST_ENV = "QCTL_SERVICE_HOST";
const QCTL_SOCKET_PATH_ENV = "QCTL_SOCKET_PATH";
const QCONTROL_WRAPPER_CACHE_DIR_ENV = "QCONTROL_WRAPPER_CACHE_DIR";

/** Captures the SCM service states needed for idempotent lifecycle commands. */
export type WindowsServiceState = "missing" | "running" | "stopped" | "other";

/** Runs one Windows host command and returns its process exit code. */
type WindowsCommandRunner = (
  command: string[],
  stdio?: Bun.SpawnOptions.Readable,
) => Promise<number>;

/** Runs one qctl lifecycle command through Windows UAC elevation. */
type WindowsElevationRunner = (args: string[]) => Promise<number>;

/** Binds lifecycle behavior to SCM commands and service-owned filesystem paths. */
export interface WindowsLifecycleOptions {
  ensureServiceDirectories: () => Promise<void>;
  getQctlExecutablePath: () => string;
  getServiceHostPath: () => string;
  isElevated: () => Promise<boolean>;
  readServiceState: () => Promise<WindowsServiceState>;
  runCommand: WindowsCommandRunner;
  runElevated: WindowsElevationRunner;
  serviceDescription: string;
  serviceDisplayName: string;
  serviceName: string;
  startTimeoutMs: number;
  stopPollIntervalMs: number;
  stopTimeoutMs: number;
}

/** Quotes one Windows argv value for command lines stored inside SCM. */
export function quoteWindowsArgument(value: string): string {
  if (value.length > 0 && !/[\s"]/.test(value)) {
    return value;
  }

  let quoted = '"';
  let backslashes = 0;

  for (const character of value) {
    if (character === "\\") {
      backslashes += 1;
      continue;
    }

    if (character === '"') {
      quoted += "\\".repeat(backslashes * 2 + 1);
      quoted += character;
      backslashes = 0;
      continue;
    }

    quoted += "\\".repeat(backslashes);
    quoted += character;
    backslashes = 0;
  }

  return `${quoted}${"\\".repeat(backslashes * 2)}"`;
}

/** Quotes a value as a single-quoted PowerShell string literal. */
function quotePowerShellString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Allows tests and nonstandard hosts to provide ProgramData explicitly. */
function programDataRoot(env = process.env): string {
  return env.ProgramData ?? "C:\\ProgramData";
}

/** Returns the service-owned cache root used by LocalSystem qctl processes. */
function serviceCacheDirectory(): string {
  return win32.join(programDataRoot(), "qctl", "cache");
}

/** Returns the persistent directory where the service host writes daemon logs. */
function serviceLogDirectory(): string {
  return win32.join(programDataRoot(), "qctl", "logs");
}

/**
 * Resolves the compiled qctl binary whose sibling service host should be
 * registered with SCM.
 */
function getQctlExecutablePath(): string {
  const configuredPath = process.env[QCTL_EXECUTABLE_ENV];
  if (configuredPath) {
    return resolve(configuredPath);
  }

  const executableName = basename(process.execPath).toLowerCase();
  if (executableName === "bun" || executableName === "bun.exe") {
    throw new Error(
      "qctl install must run from the compiled qctl binary, or QCTL_EXECUTABLE must point to it",
    );
  }

  return resolve(process.execPath);
}

/** Resolves the small native host that speaks SCM's service protocol. */
function getServiceHostPath(): string {
  const configuredPath = process.env[QCTL_SERVICE_HOST_ENV];
  if (configuredPath) {
    return resolve(configuredPath);
  }

  return win32.join(dirname(getQctlExecutablePath()), "qctl-service.exe");
}

/** Creates service-owned directories before SCM starts the LocalSystem daemon. */
async function ensureServiceDirectories(): Promise<void> {
  await Promise.all([
    mkdir(serviceCacheDirectory(), { recursive: true }),
    mkdir(serviceLogDirectory(), { recursive: true }),
  ]);
}

/** Runs an external Windows command with inherited stdio for operator feedback. */
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

/** Captures stdout from commands whose success is represented by host state. */
async function runCommandForOutput(command: string[]): Promise<{ exitCode: number; stdout: string }> {
  const child = Bun.spawn({
    cmd: command,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
  });

  return {
    exitCode: await child.exited,
    stdout: await new Response(child.stdout).text(),
  };
}

/** Reads SCM state without treating an unregistered service as a hard failure. */
async function readServiceState(): Promise<WindowsServiceState> {
  const result = await runCommandForOutput(["sc.exe", "query", SERVICE_NAME]);
  if (result.exitCode !== 0) {
    return "missing";
  }

  if (/\bSTATE\s*:\s*\d+\s+RUNNING\b/i.test(result.stdout)) {
    return "running";
  }

  if (/\bSTATE\s*:\s*\d+\s+STOPPED\b/i.test(result.stdout)) {
    return "stopped";
  }

  return "other";
}

/** Detects whether the current process token can mutate SCM service state. */
async function isElevated(): Promise<boolean> {
  return (
    (await runCommand(
      [
        "powershell.exe",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent()); if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { exit 0 }; exit 1",
      ],
      "ignore",
    )) === 0
  );
}

/** Relaunches qctl through ShellExecute's runas verb so Windows shows UAC. */
async function runElevated(args: string[]): Promise<number> {
  // A future UX pass can relay the elevated child's stdout/stderr through temp
  // files so the original shell gets sudo-like output after UAC completes.
  const powershellArguments = args.map(quotePowerShellString).join(", ");
  const command = [
    `$process = Start-Process -FilePath ${quotePowerShellString(getQctlExecutablePath())}`,
    `-ArgumentList @(${powershellArguments})`,
    "-Verb RunAs -Wait -PassThru;",
    "if ($null -eq $process.ExitCode) { exit 0 }; exit $process.ExitCode",
  ].join(" ");

  return runCommand([
    "powershell.exe",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    command,
  ]);
}

/** Returns production SCM collaborators for the Windows lifecycle graph. */
function defaultWindowsLifecycleOptions(): WindowsLifecycleOptions {
  return {
    ensureServiceDirectories,
    getQctlExecutablePath,
    getServiceHostPath,
    isElevated,
    readServiceState,
    runCommand,
    runElevated,
    serviceDescription: SERVICE_DESCRIPTION,
    serviceDisplayName: SERVICE_DISPLAY_NAME,
    serviceName: SERVICE_NAME,
    startTimeoutMs: SERVICE_START_TIMEOUT_MS,
    stopPollIntervalMs: SERVICE_POLL_INTERVAL_MS,
    stopTimeoutMs: SERVICE_STOP_TIMEOUT_MS,
  };
}

/** Builds the user-neutral environment used for system qcontrol setup. */
function systemQcontrolEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    [QCTL_SOCKET_PATH_ENV]: SERVICE_PIPE_NAME,
    [QCONTROL_WRAPPER_CACHE_DIR_ENV]: serviceCacheDirectory(),
  };
}

/** Creates or updates qctl's SCM registration without starting the service. */
async function installWindowsService(options: WindowsLifecycleOptions): Promise<number> {
  await options.ensureServiceDirectories();

  const serviceState = await options.readServiceState();
  const serviceHostPath = quoteWindowsArgument(options.getServiceHostPath());
  const serviceCommand = serviceState === "missing"
    ? [
      "sc.exe",
      "create",
      options.serviceName,
      "binPath=",
      serviceHostPath,
      "start=",
      "demand",
      "obj=",
      "LocalSystem",
      "DisplayName=",
      options.serviceDisplayName,
    ]
    : [
      "sc.exe",
      "config",
      options.serviceName,
      "binPath=",
      serviceHostPath,
      "start=",
      "demand",
      "obj=",
      "LocalSystem",
      "DisplayName=",
      options.serviceDisplayName,
    ];

  let exitCode = await options.runCommand(serviceCommand);
  if (exitCode !== 0) {
    return exitCode;
  }

  exitCode = await options.runCommand(["sc.exe", "description", options.serviceName, options.serviceDescription]);
  if (exitCode !== 0) {
    return exitCode;
  }

  return options.runCommand([
    "sc.exe",
    "failure",
    options.serviceName,
    "reset=",
    "86400",
    "actions=",
    "restart/60000/restart/60000//0",
  ]);
}

/** Waits for SCM to observe a running service after start is requested. */
async function waitForRunningService(options: WindowsLifecycleOptions): Promise<number> {
  const deadline = Date.now() + options.startTimeoutMs;

  while (Date.now() < deadline) {
    const serviceState = await options.readServiceState();
    if (serviceState === "running") {
      return 0;
    }

    if (serviceState === "missing" || serviceState === "stopped") {
      break;
    }

    await Bun.sleep(options.stopPollIntervalMs);
  }

  console.error(`qctl start timed out waiting for Windows service '${options.serviceName}' to start.`);
  return 1;
}

/** Waits for SCM to observe a stopped/deleted service after stop is requested. */
async function waitForStoppedService(options: WindowsLifecycleOptions): Promise<number> {
  const deadline = Date.now() + options.stopTimeoutMs;

  while (Date.now() < deadline) {
    const serviceState = await options.readServiceState();
    if (serviceState === "stopped" || serviceState === "missing") {
      return 0;
    }

    await Bun.sleep(options.stopPollIntervalMs);
  }

  console.error(`qctl stop timed out waiting for Windows service '${options.serviceName}' to stop.`);
  return 1;
}

/** Stops qctl's SCM service while preserving idempotence when it is inactive. */
async function stopWindowsService(options: WindowsLifecycleOptions): Promise<number> {
  const serviceState = await options.readServiceState();
  if (serviceState === "missing" || serviceState === "stopped") {
    return 0;
  }

  const stopExitCode = await options.runCommand(["sc.exe", "stop", options.serviceName]);
  if (stopExitCode !== 0) {
    return stopExitCode;
  }

  return waitForStoppedService(options);
}

/** Deletes the SCM registration after the service process has exited. */
async function removeWindowsService(options: WindowsLifecycleOptions): Promise<number> {
  if ((await options.readServiceState()) === "missing") {
    return 0;
  }

  const stopExitCode = await stopWindowsService(options);
  if (stopExitCode !== 0) {
    return stopExitCode;
  }

  return options.runCommand(["sc.exe", "delete", options.serviceName]);
}

/** Runs a lifecycle command elevated when the current process lacks admin rights. */
async function elevateIfNeeded(command: string, options: WindowsLifecycleOptions): Promise<number | undefined> {
  if (await options.isElevated()) {
    return undefined;
  }

  return options.runElevated([command]);
}

/** Creates Windows lifecycle helpers around explicit dependencies. */
export function createWindowsLifecycleActions(
  dependencies: InstallationDependencies,
  options: WindowsLifecycleOptions = defaultWindowsLifecycleOptions(),
): InstallationActions {
  const installSystem = async (): Promise<number> => {
    const elevatedExitCode = await elevateIfNeeded("install-system", options);
    if (elevatedExitCode !== undefined) {
      return elevatedExitCode;
    }

    const initExitCode = await dependencies.runQcontrol({
      args: ["init", "--system"],
      cacheDir: serviceCacheDirectory(),
      env: systemQcontrolEnvironment(),
    });
    if (initExitCode !== 0) {
      return initExitCode;
    }

    return installWindowsService(options);
  };

  const initUser = async (): Promise<number> => {
    const initExitCode = await dependencies.runQcontrol({ args: ["init", "--user"] });
    if (initExitCode !== 0) {
      return initExitCode;
    }

    await dependencies.appendQctlSinkConfig();
    return 0;
  };

  const install = async (): Promise<number> => {
    const systemExitCode = await installSystem();
    if (systemExitCode !== 0) {
      return systemExitCode;
    }

    return initUser();
  };

  const uninstallSystem = async (): Promise<number> => {
    const elevatedExitCode = await elevateIfNeeded("uninstall-system", options);
    if (elevatedExitCode !== undefined) {
      return elevatedExitCode;
    }

    return removeWindowsService(options);
  };

  const uninstall = async (): Promise<number> => {
    const serviceExitCode = await uninstallSystem();
    if (serviceExitCode !== 0) {
      return serviceExitCode;
    }

    await dependencies.removeQctlSinkConfig();
    return 0;
  };

  const start = async (): Promise<number> => {
    if ((await options.readServiceState()) === "running") {
      return 0;
    }

    const elevatedExitCode = await elevateIfNeeded("start", options);
    if (elevatedExitCode !== undefined) {
      return elevatedExitCode;
    }

    const startExitCode = await options.runCommand(["sc.exe", "start", options.serviceName]);
    if (startExitCode !== 0) {
      return startExitCode;
    }

    return waitForRunningService(options);
  };

  const stop = async (): Promise<number> => {
    const serviceState = await options.readServiceState();
    if (serviceState === "missing" || serviceState === "stopped") {
      return 0;
    }

    const elevatedExitCode = await elevateIfNeeded("stop", options);
    if (elevatedExitCode !== undefined) {
      return elevatedExitCode;
    }

    return stopWindowsService(options);
  };

  return {
    dependencies,
    initUser,
    install,
    installSystem,
    start,
    stop,
    uninstall,
    uninstallSystem,
  };
}
