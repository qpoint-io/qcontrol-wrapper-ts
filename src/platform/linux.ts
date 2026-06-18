/**
 * Implements qctl's Linux platform identity and cache defaults while sharing
 * POSIX socket and executable mechanics with macOS.
 */
import { homedir } from "node:os";
import { join } from "node:path";

import { createPosixPlatformAdapter } from "./posix";
import type { PlatformAdapter } from "./types";

/** Creates the Linux adapter used by foreground qctl runtimes. */
export function createLinuxPlatformAdapter(): PlatformAdapter {
  return createPosixPlatformAdapter({
    kind: "linux",
    defaultCacheRoot(env) {
      if (env.XDG_CACHE_HOME) {
        return join(env.XDG_CACHE_HOME, "qcontrol-wrapper-ts");
      }

      return join(homedir(), ".cache", "qcontrol-wrapper-ts");
    },
  });
}
