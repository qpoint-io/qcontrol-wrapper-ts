/**
 * Implements qctl's macOS platform identity and cache defaults while sharing
 * POSIX socket and executable mechanics with Linux.
 */
import { homedir } from "node:os";
import { join } from "node:path";

import { createPosixPlatformAdapter } from "./posix";
import type { PlatformAdapter } from "./types";

/** Creates the macOS adapter used by launchd-backed qctl runtimes. */
export function createMacosPlatformAdapter(): PlatformAdapter {
  return createPosixPlatformAdapter({
    kind: "macos",
    defaultCacheRoot(env) {
      if (env.XDG_CACHE_HOME) {
        return join(env.XDG_CACHE_HOME, "qcontrol-wrapper-ts");
      }

      return join(homedir(), "Library", "Caches", "qcontrol-wrapper-ts");
    },
  });
}
