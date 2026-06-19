/**
 * Selects the platform adapter used by qctl so operating-system conditionals
 * stay at the boundary instead of spreading through runtime modules.
 */
import { createMacosPlatformAdapter } from "./macos";
import { createLinuxPlatformAdapter } from "./linux";
import { createWindowsPlatformAdapter } from "./windows";

export type { PlatformAdapter } from "./types";

/** Creates a platform adapter for explicit tests or the current host. */
export function createPlatformAdapter(platform: NodeJS.Platform = process.platform) {
  if (platform === "win32") {
    return createWindowsPlatformAdapter();
  }

  if (platform === "darwin") {
    return createMacosPlatformAdapter();
  }

  if (platform === "linux") {
    return createLinuxPlatformAdapter();
  }

  throw new Error(`unsupported platform: ${platform}`);
}

/** Default adapter for the active process. */
export const platformAdapter = createPlatformAdapter();
