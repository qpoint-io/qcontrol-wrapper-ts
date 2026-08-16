/**
 * Implements qctl's macOS platform identity while sharing POSIX endpoint and
 * directory mechanics with Linux.
 */
import { createPosixPlatformAdapter } from "./posix";
import type { PlatformAdapter } from "./types";

/** Creates the macOS adapter used by launchd-backed qctl runtimes. */
export function createMacosPlatformAdapter(): PlatformAdapter {
  return createPosixPlatformAdapter({ kind: "macos" });
}
