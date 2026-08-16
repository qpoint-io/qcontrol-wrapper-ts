/**
 * Implements qctl's Windows platform behavior for cache paths and named-pipe
 * sinks.
 */
import { homedir } from "node:os";
import { join } from "node:path";

import type { InvokingUser, PlatformAdapter } from "./types";

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

/** Detects LocalSystem / service-account sessions that are not a real invoker. */
function isMachineAccount(username: string | undefined, home: string): boolean {
  const normalized = username?.toUpperCase();
  return normalized === "SYSTEM" || normalized === "LOCALSYSTEM" || /[/\\]systemprofile\b/i.test(home);
}

/** Creates the Windows adapter used by CLI, collector, monitor, and bundling. */
export function createWindowsPlatformAdapter(): PlatformAdapter {
  return {
    kind: "windows",
    qcontrolExecutableName: "qcontrol.exe",

    async applyCollectorMode() {},

    canElevateMonitor() {
      return false;
    },

    configPath(env = process.env) {
      if (env.QCTL_CONFIG_DIR) {
        return env.QCTL_CONFIG_DIR;
      }

      if (env.APPDATA) {
        return join(env.APPDATA, "qctl");
      }

      const user = this.resolveInvokingUser(env);
      return join(user?.home ?? homedir(), "AppData", "Roaming", "qctl");
    },

    dataPath(env = process.env) {
      if (env.QCTL_DATA_DIR || env.QCTL_STATE_DIR) {
        return env.QCTL_DATA_DIR ?? env.QCTL_STATE_DIR as string;
      }

      if (env.LOCALAPPDATA) {
        return join(env.LOCALAPPDATA, "qctl");
      }

      const user = this.resolveInvokingUser(env);
      return join(user?.home ?? homedir(), "AppData", "Local", "qctl");
    },

    defaultCacheRoot(env = process.env) {
      if (env.QCTL_CACHE_DIR || env.QCONTROL_WRAPPER_CACHE_DIR) {
        return env.QCTL_CACHE_DIR ?? env.QCONTROL_WRAPPER_CACHE_DIR as string;
      }

      return join(this.dataPath(env), "cache");
    },

    defaultCollectorEndpoint(env = process.env) {
      return normalizePipePath(env.QCTL_SOCKET_PATH ?? WINDOWS_PIPE_NAME);
    },

    async cleanupCollectorEndpoint() {},

    async prepareCollectorEndpoint() {},

    async prepareExecutable() {},

    resolveInvokingUser(env = process.env): InvokingUser | undefined {
      const username = env.USERNAME || env.USER;
      const home = env.USERPROFILE || env.HOME || homedir();
      if (!username || isMachineAccount(username, home)) {
        return undefined;
      }

      return { username, home };
    },

    shouldOpenDaemonEndpoint() {
      return false;
    },

    sinkUrl(endpointPath) {
      return `pipe://${pipeName(endpointPath)}`;
    },
  };
}
