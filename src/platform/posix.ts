/**
 * Shares POSIX endpoint and executable behavior used by macOS and Linux while
 * leaving platform identity and cache defaults to the concrete adapters.
 */
import { chmod, lstat, mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import type { PlatformAdapter } from "./types";

const RUNTIME_SOCKET_DIR = "/var/run/qctl";
const RUNTIME_SOCKET_NAME = "collector.sock";

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
  defaultCacheRoot: (env: NodeJS.ProcessEnv) => string;
}

/** Creates the POSIX adapter behavior shared by macOS and Linux. */
export function createPosixPlatformAdapter(options: PosixPlatformOptions): PlatformAdapter {
  return {
    kind: options.kind,
    qcontrolExecutableName: "qcontrol",

    async applyCollectorMode(endpointPath, mode) {
      if (mode === undefined) {
        return;
      }

      await chmod(endpointPath, mode);
    },

    canUseRootScanner() {
      return true;
    },

    configPath(env = process.env) {
      if (env.QCTL_CONFIG_DIR) {
        return env.QCTL_CONFIG_DIR;
      }

      if (env.XDG_CONFIG_HOME) {
        return join(env.XDG_CONFIG_HOME, "qcontrol");
      }

      return join(homedir(), ".config", "qcontrol");
    },

    defaultCacheRoot(env = process.env) {
      if (env.QCONTROL_WRAPPER_CACHE_DIR) {
        return env.QCONTROL_WRAPPER_CACHE_DIR;
      }

      return options.defaultCacheRoot(env);
    },

    defaultCollectorEndpoint(env = process.env) {
      return env.QCTL_SOCKET_PATH ?? join(RUNTIME_SOCKET_DIR, RUNTIME_SOCKET_NAME);
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

    qctlSinkUrls(currentEndpoint, legacyPosixEndpoint) {
      return [this.sinkUrl(currentEndpoint), this.sinkUrl(legacyPosixEndpoint)];
    },

    shouldOpenDaemonEndpoint() {
      return process.getuid?.() === 0;
    },

    sinkUrl(endpointPath) {
      return `unix://${pathToFileURL(endpointPath).pathname}`;
    },
  };
}
