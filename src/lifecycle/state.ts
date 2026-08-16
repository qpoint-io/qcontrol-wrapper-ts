/**
 * Persists start/stop placement so `qctl stop` can reverse a direct detach or
 * a service registration without guessing which backend is live, and so
 * `qctl status` can report the live runtime pid.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { platformAdapter, type PlatformAdapter } from "../platform";

/** Backends that `qctl start` can leave behind for `qctl stop`. */
export type ServiceManager = "direct" | "launchd" | "systemd" | "windows_scm";

/** Snapshot of the last successful placement. */
export interface LifecycleState {
  manager: ServiceManager;
  pid?: number;
}

/** Narrows filesystem failures to Node errno errors without trusting throws. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

/** Returns the directory that holds the pid file, logs, and service marker. */
export function lifecycleStateDir(platform: PlatformAdapter = platformAdapter): string {
  return platform.dataPath(process.env);
}

/** Marker written after `start --service` so stop unregisters the unit. */
export function serviceMarkerPath(platform: PlatformAdapter = platformAdapter): string {
  return join(lifecycleStateDir(platform), "service.manager");
}

/** Pid recorded after a detached `start` so stop can signal the process. */
export function pidFilePath(platform: PlatformAdapter = platformAdapter): string {
  return join(lifecycleStateDir(platform), "start.pid");
}

/** Stderr log for a detached `start` child. */
export function startLogPath(platform: PlatformAdapter = platformAdapter): string {
  return join(lifecycleStateDir(platform), "start.log");
}

/** Reads placement state, treating missing files as "nothing is placed". */
export async function readLifecycleState(
  platform: PlatformAdapter = platformAdapter,
): Promise<LifecycleState | undefined> {
  const marker = await readOptionalFile(serviceMarkerPath(platform));
  const pidText = await readOptionalFile(pidFilePath(platform));
  const pid = pidText ? Number.parseInt(pidText, 10) : undefined;

  if (marker === "launchd" || marker === "systemd" || marker === "windows_scm") {
    return { manager: marker, pid: Number.isFinite(pid) ? pid : undefined };
  }

  if (pid !== undefined && Number.isFinite(pid)) {
    return { manager: "direct", pid };
  }

  return undefined;
}

/** Records which backend owns the current placement. */
export async function writeLifecycleState(
  state: LifecycleState,
  platform: PlatformAdapter = platformAdapter,
): Promise<void> {
  const directory = lifecycleStateDir(platform);
  await mkdir(directory, { recursive: true });
  await writeFile(serviceMarkerPath(platform), `${state.manager}\n`, "utf8");
  if (state.pid !== undefined) {
    await writeLifecyclePid(state.pid, platform);
  }
}

/**
 * Records the live runtime pid without changing the service marker.
 *
 * `start --service` writes the manager first; the `start -f` child then
 * records its own pid so `qctl status` can report it without querying
 * launchd/systemd/SCM.
 */
export async function writeLifecyclePid(
  pid: number,
  platform: PlatformAdapter = platformAdapter,
): Promise<void> {
  const directory = lifecycleStateDir(platform);
  await mkdir(directory, { recursive: true });
  await writeFile(pidFilePath(platform), `${String(pid)}\n`, "utf8");
}

/** Clears placement files so a later start is not blocked by a stale marker. */
export async function clearLifecycleState(
  platform: PlatformAdapter = platformAdapter,
): Promise<void> {
  await rm(serviceMarkerPath(platform), { force: true });
  await rm(pidFilePath(platform), { force: true });
}

/** Reads a state file, treating absence as undefined. */
async function readOptionalFile(path: string): Promise<string | undefined> {
  try {
    return (await readFile(path, "utf8")).trim();
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }

    return undefined;
  }
}
