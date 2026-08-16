/**
 * Owns `qctl start` / `qctl stop` / `qctl status` placement: foreground,
 * detached, or OS service, matching qcontrol's start surface without the
 * install/config flow.
 */
import { ensureQctlLayout } from "../core/config";
import { platformAdapter } from "../platform";
import { startDirect, stopDirect } from "./direct";
import { startLaunchd, stopLaunchd } from "./macos";
import { startSystemd, stopSystemd } from "./linux";
import { StartUsageError, resolveStartMode, usageText, type StartMode } from "./mode";
import { isPidAlive, isPrivileged, reexecAsRoot } from "./process";
import { runForeground, type RuntimeOptions } from "./runtime";
import { clearLifecycleState, readLifecycleState, type LifecycleState } from "./state";
import { startWindowsService, stopWindowsService } from "./windows";

export { resolveStartMode, usageText, StartUsageError } from "./mode";
export { runForeground, type RuntimeOptions } from "./runtime";
export type { StartMode };

/** Testable collaborators so main can exercise routing without launchd or SCM. */
export interface LifecycleDependencies {
  runForeground: (options?: RuntimeOptions) => Promise<number>;
  startDirect: (options?: RuntimeOptions) => Promise<number>;
  startService: (options?: RuntimeOptions) => Promise<number>;
  stopPlacement: () => Promise<number>;
  reexecAsRoot: (args: string[]) => Promise<number>;
  isPrivileged: () => boolean;
  canElevate: () => boolean;
  ensureLayout: () => Promise<void>;
}

const defaultLifecycleDependencies: LifecycleDependencies = {
  runForeground,
  startDirect,
  startService: startServiceForPlatform,
  stopPlacement: stopPlacementForPlatform,
  reexecAsRoot,
  isPrivileged,
  canElevate: () => platformAdapter.canElevateMonitor(),
  ensureLayout: () => ensureQctlLayout(),
};

/** Places the wrapper runtime according to `start` flags. */
export async function start(
  args: string[],
  dependencies: LifecycleDependencies = defaultLifecycleDependencies,
): Promise<number> {
  let mode: StartMode;
  let raw: boolean;
  try {
    ({ mode, raw } = resolveStartMode(args));
  } catch (error) {
    if (error instanceof StartUsageError) {
      console.error(error.message);
      return error.exitCode;
    }

    throw error;
  }

  // Create dirs and config.toml as the current user before any sudo re-exec so
  // the invoking account owns the tree.
  await dependencies.ensureLayout();

  if (dependencies.canElevate() && !dependencies.isPrivileged()) {
    return dependencies.reexecAsRoot(["start", ...args]);
  }

  const options: RuntimeOptions = { raw };
  switch (mode) {
    case "foreground":
      return dependencies.runForeground(options);
    case "direct":
      return dependencies.startDirect(options);
    case "service":
      return dependencies.startService(options);
  }
}

/** Reverses the current placement, unregistering a service when one exists. */
export async function stop(
  dependencies: LifecycleDependencies = defaultLifecycleDependencies,
): Promise<number> {
  if (dependencies.canElevate() && !dependencies.isPrivileged()) {
    return dependencies.reexecAsRoot(["stop"]);
  }

  return dependencies.stopPlacement();
}

/** Testable collaborators so status can be exercised without a live pid file. */
export interface StatusDependencies {
  readState: () => Promise<LifecycleState | undefined>;
  isPidAlive: (pid: number) => boolean;
}

const defaultStatusDependencies: StatusDependencies = {
  readState: () => readLifecycleState(),
  isPidAlive,
};

/**
 * Reports whether a recorded start pid is still alive.
 *
 * Status is a local pid-file check and does not re-exec through sudo. A
 * missing or dead pid is offline, including a stale file left after a crash.
 */
export async function status(
  dependencies: StatusDependencies = defaultStatusDependencies,
): Promise<number> {
  const state = await dependencies.readState();
  const pid = state?.pid;
  if (pid !== undefined && dependencies.isPidAlive(pid)) {
    console.log(`qctl is running (pid ${String(pid)})`);
    return 0;
  }

  console.log("qctl is offline");
  return 0;
}

/** Selects the platform service backend for `start --service`. */
async function startServiceForPlatform(options: RuntimeOptions = {}): Promise<number> {
  switch (platformAdapter.kind) {
    case "macos":
      return startLaunchd(options);
    case "linux":
      return startSystemd(options);
    case "windows":
      return startWindowsService(options);
  }
}

/** Stops whichever backend the service marker (or pid file) says is live. */
async function stopPlacementForPlatform(): Promise<number> {
  const state = await readLifecycleState();
  let exitCode = 0;

  switch (state?.manager) {
    case "launchd":
      exitCode = await stopLaunchd();
      break;
    case "systemd":
      exitCode = await stopSystemd();
      break;
    case "windows_scm":
      exitCode = await stopWindowsService();
      break;
    case "direct":
      exitCode = state.pid === undefined ? 0 : await stopDirect(state.pid);
      break;
    default:
      console.log("qctl is not running");
      return 0;
  }

  if (exitCode === 0) {
    await clearLifecycleState();
  }

  return exitCode;
}
