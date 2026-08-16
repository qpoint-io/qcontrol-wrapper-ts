/**
 * Shares POSIX endpoint and executable behavior used by macOS and Linux while
 * leaving platform identity to the concrete adapters.
 */
import { chmod, lstat, mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { InvokingUser, PlatformAdapter } from "./types";

/** Narrows filesystem failures to Node errno errors without trusting throws. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

/**
 * Removes a stale POSIX socket while refusing to unlink regular files that may
 * have been created by a user or another qctl component.
 */
async function removeStaleSocket(socketPath: string): Promise<void> {
  try {
    const socketStat = await lstat(socketPath);
    if (!socketStat.isSocket()) {
      throw new Error(`refusing to replace non-socket path: ${socketPath}`);
    }
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }

    return;
  }

  await rm(socketPath);
}

/** Options that make a POSIX adapter concrete for one supported platform. */
interface PosixPlatformOptions {
  kind: "macos" | "linux";
}

/** Resolves a non-root user's home when sudo has replaced HOME with root's. */
function defaultHomeForUsername(kind: "macos" | "linux", username: string): string {
  return kind === "macos" ? `/Users/${username}` : `/home/${username}`;
}

/** Home used for qctl directories, preferring the sudo invoking user. */
function directoryHome(adapter: Pick<PlatformAdapter, "resolveInvokingUser">, kind: "macos" | "linux", env: NodeJS.ProcessEnv): string {
  const user = adapter.resolveInvokingUser(env);
  return user?.home ?? env.HOME ?? homedir();
}

/** Creates the POSIX adapter behavior shared by macOS and Linux. */
export function createPosixPlatformAdapter(options: PosixPlatformOptions): PlatformAdapter {
  const adapter: PlatformAdapter = {
    kind: options.kind,
    qcontrolExecutableName: "qcontrol",

    async applyCollectorMode(endpointPath, mode) {
      if (mode === undefined) {
        return;
      }

      await chmod(endpointPath, mode);
    },

    canElevateMonitor() {
      return true;
    },

    configPath(env = process.env) {
      if (env.QCTL_CONFIG_DIR) {
        return env.QCTL_CONFIG_DIR;
      }

      if (env.XDG_CONFIG_HOME) {
        return join(env.XDG_CONFIG_HOME, "qctl");
      }

      return join(directoryHome(adapter, options.kind, env), ".config", "qctl");
    },

    dataPath(env = process.env) {
      if (env.QCTL_DATA_DIR || env.QCTL_STATE_DIR) {
        return env.QCTL_DATA_DIR ?? env.QCTL_STATE_DIR as string;
      }

      const home = directoryHome(adapter, options.kind, env);
      if (options.kind === "macos") {
        return join(home, "Library", "Application Support", "qctl");
      }

      if (env.XDG_DATA_HOME) {
        return join(env.XDG_DATA_HOME, "qctl");
      }

      return join(home, ".local", "share", "qctl");
    },

    defaultCacheRoot(env = process.env) {
      if (env.QCTL_CACHE_DIR || env.QCONTROL_WRAPPER_CACHE_DIR) {
        return env.QCTL_CACHE_DIR ?? env.QCONTROL_WRAPPER_CACHE_DIR as string;
      }

      if (env.XDG_CACHE_HOME) {
        return join(env.XDG_CACHE_HOME, "qctl");
      }

      const home = directoryHome(adapter, options.kind, env);
      if (options.kind === "macos") {
        return join(home, "Library", "Caches", "qctl");
      }

      return join(home, ".cache", "qctl");
    },

    defaultCollectorEndpoint(env = process.env) {
      return env.QCTL_SOCKET_PATH ?? join(adapter.dataPath(env), "collector.sock");
    },

    async cleanupCollectorEndpoint(endpointPath) {
      await removeStaleSocket(endpointPath);
    },

    async prepareCollectorEndpoint(endpointPath) {
      await mkdir(dirname(endpointPath), { recursive: true });
      await removeStaleSocket(endpointPath);
    },

    async prepareExecutable(binaryPath) {
      await chmod(binaryPath, 0o755);
    },

    resolveInvokingUser(env = process.env): InvokingUser | undefined {
      const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
      const username = env.SUDO_USER || (uid !== 0 ? (env.USER || env.LOGNAME) : undefined);
      if (!username || username === "root") {
        return undefined;
      }

      const home = env.SUDO_USER
        ? defaultHomeForUsername(options.kind, username)
        : (env.HOME ?? homedir());

      return { username, home };
    },

    shouldOpenDaemonEndpoint() {
      return process.getuid?.() === 0;
    },

    sinkUrl(endpointPath) {
      // qcontrol strips the `unix://` prefix and uses the remainder as a
      // filesystem path. Do not percent-encode: macOS data lives under
      // `Application Support`, and `%20` would point at a different file.
      return `unix://${endpointPath}`;
    },
  };

  return adapter;
}
