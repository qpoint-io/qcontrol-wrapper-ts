/**
 * Creates qctl's config/data/cache directories and seeds config.toml so
 * qcontrol's monitor has a fleet sink pointing at qctl's collector.
 */
import { appendFile, chown, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { getQctlSinkUrl } from "./paths";
import { createPlatformAdapter, platformAdapter, type PlatformAdapter } from "../platform";

const QCTL_SINK_MARKER = "# qctl collector sink";

/** Adapts legacy helper inputs to the shared platform contract. */
function platformAdapterFor(platform: NodeJS.Platform | PlatformAdapter): PlatformAdapter {
  return typeof platform === "string" ? createPlatformAdapter(platform) : platform;
}

/** Narrows filesystem failures to Node errno errors without trusting throws. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

/** Returns the config.toml path qctl writes and qcontrol reads via QCONTROL_CONFIG_DIR. */
export function getQctlConfigFilePath(platform: NodeJS.Platform | PlatformAdapter = platformAdapter): string {
  return join(platformAdapterFor(platform).configPath(), "config.toml");
}

/** Seeds a white-label config.toml that only enables qctl's collector sink. */
export function defaultQctlConfig(sinkUrl: string): string {
  return `# qctl configuration
# qcontrol reads this file because qctl sets QCONTROL_CONFIG_DIR.

[tap]
mode = "observe"

[auto_tap]
enabled = false

[tray]
enabled = true

[dash]
enabled = false

${QCTL_SINK_MARKER}
[[sinks]]
url = ${JSON.stringify(sinkUrl)}
`;
}

/**
 * Creates qctl's directory tree and ensures config.toml names the collector.
 *
 * Missing files get the stock document. Existing files keep unrelated settings
 * and only gain a sink table when the collector URL is absent. When running
 * via sudo, created paths are given back to the invoking user so later
 * non-root qctl commands can still write them.
 */
export async function ensureQctlLayout(
  platform: NodeJS.Platform | PlatformAdapter = platformAdapter,
): Promise<void> {
  const adapter = platformAdapterFor(platform);
  const directories = [adapter.configPath(), adapter.dataPath(), adapter.defaultCacheRoot()];
  for (const directory of directories) {
    await mkdir(directory, { recursive: true });
    await chownToInvoker(directory);
  }

  const configPath = getQctlConfigFilePath(adapter);
  const sinkUrl = getQctlSinkUrl(adapter);
  const existing = await readOptionalFile(configPath);
  if (existing === undefined) {
    await writeFile(configPath, defaultQctlConfig(sinkUrl), { mode: 0o644 });
    await chownToInvoker(configPath);
    return;
  }

  const rewritten = replaceMarkedSinkUrl(existing, sinkUrl);
  if (rewritten !== undefined) {
    if (rewritten !== existing) {
      await writeFile(configPath, rewritten, { mode: 0o644 });
      await chownToInvoker(configPath);
    }
    return;
  }

  if (existing.includes(sinkUrl)) {
    return;
  }

  const separator = existing.length === 0 ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
  await appendFile(configPath, `${separator}${QCTL_SINK_MARKER}\n[[sinks]]\nurl = ${JSON.stringify(sinkUrl)}\n`);
  await chownToInvoker(configPath);
}

/**
 * Rewrites the qctl-owned sink URL when the marker is already present.
 *
 * Older builds percent-encoded spaces in `unix://` paths. qcontrol does not
 * decode those, so a stale URL must be replaced rather than appended.
 */
function replaceMarkedSinkUrl(existing: string, sinkUrl: string): string | undefined {
  const markerAt = existing.indexOf(QCTL_SINK_MARKER);
  if (markerAt < 0) {
    return undefined;
  }

  const urlAt = existing.indexOf("url = ", markerAt);
  if (urlAt < 0) {
    return undefined;
  }

  const lineEnd = existing.indexOf("\n", urlAt);
  const end = lineEnd === -1 ? existing.length : lineEnd;
  return `${existing.slice(0, urlAt)}url = ${JSON.stringify(sinkUrl)}${existing.slice(end)}`;
}

/** Reads a config document, treating a missing file as unset. */
async function readOptionalFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }

    return undefined;
  }
}

/**
 * Reassigns root-created paths to the sudo invoking user. No-op when not root
 * or when sudo did not publish SUDO_UID.
 */
async function chownToInvoker(path: string): Promise<void> {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) {
    return;
  }

  const uid = process.env.SUDO_UID;
  if (!uid) {
    return;
  }

  const gid = process.env.SUDO_GID ?? uid;
  await chown(path, Number(uid), Number(gid));
}
