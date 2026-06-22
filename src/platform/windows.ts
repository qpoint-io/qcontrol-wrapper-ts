/**
 * Implements qctl's Windows platform behavior for cache paths, named-pipe
 * sinks, and non-privileged scanner execution.
 */
import { homedir } from "node:os";
import { join } from "node:path";

import type { PlatformAdapter } from "./types";

const WINDOWS_PIPE_NAME = "qctl-collector";
const WINDOWS_PIPE_PREFIX = "\\\\.\\pipe\\";

/** Converts Windows pipe names and URLs into the path Node listens on. */
function normalizePipePath(value: string): string {
  if (value.startsWith(WINDOWS_PIPE_PREFIX)) {
    return value;
  }

  if (value.startsWith("pipe://")) {
    return `${WINDOWS_PIPE_PREFIX}${value.slice("pipe://".length)}`;
  }

  if (!value.includes("\\") && !value.includes("/")) {
    return `${WINDOWS_PIPE_PREFIX}${value}`;
  }

  return value;
}

/** Extracts the endpoint spelling qcontrol expects for Windows pipe sinks. */
function pipeName(endpointPath: string): string {
  return endpointPath.startsWith(WINDOWS_PIPE_PREFIX)
    ? endpointPath.slice(WINDOWS_PIPE_PREFIX.length)
    : endpointPath;
}

/** Creates the Windows adapter used by CLI, collector, scanner, and bundling. */
export function createWindowsPlatformAdapter(): PlatformAdapter {
  return {
    kind: "windows",
    qcontrolExecutableName: "qcontrol.exe",

    async applyCollectorMode() {},

    canUseRootScanner() {
      return false;
    },

    configPath(env = process.env) {
      if (env.QCTL_CONFIG_DIR) {
        return env.QCTL_CONFIG_DIR;
      }

      if (env.APPDATA) {
        return join(env.APPDATA, "qcontrol");
      }

      if (env.LOCALAPPDATA) {
        return join(env.LOCALAPPDATA, "qcontrol");
      }

      return join(homedir(), "AppData", "Roaming", "qcontrol");
    },

    defaultCacheRoot(env = process.env) {
      if (env.QCONTROL_WRAPPER_CACHE_DIR) {
        return env.QCONTROL_WRAPPER_CACHE_DIR;
      }

      if (env.LOCALAPPDATA) {
        return join(env.LOCALAPPDATA, "qcontrol-wrapper-ts");
      }

      if (env.XDG_CACHE_HOME) {
        return join(env.XDG_CACHE_HOME, "qcontrol-wrapper-ts");
      }

      return join(homedir(), ".cache", "qcontrol-wrapper-ts");
    },

    defaultCollectorEndpoint(env = process.env) {
      return normalizePipePath(env.QCTL_SOCKET_PATH ?? WINDOWS_PIPE_NAME);
    },

    async cleanupCollectorEndpoint() {},

    async prepareCollectorEndpoint() {},

    async prepareExecutable() {},

    qctlSinkUrls(currentEndpoint) {
      return [this.sinkUrl(currentEndpoint)];
    },

    shouldOpenDaemonEndpoint() {
      return false;
    },

    sinkUrl(endpointPath) {
      return `pipe://${pipeName(endpointPath)}`;
    },
  };
}
