/**
 * Implements qctl's Linux platform identity while sharing POSIX endpoint and
 * directory mechanics with macOS.
 */
import { createPosixPlatformAdapter } from "./posix";
import type { PlatformAdapter } from "./types";

/** Creates the Linux adapter used by systemd-backed qctl runtimes. */
export function createLinuxPlatformAdapter(): PlatformAdapter {
  return createPosixPlatformAdapter({ kind: "linux" });
}
