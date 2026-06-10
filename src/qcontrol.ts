/**
 * Manages the embedded qcontrol binary: materializing it into an executable
 * cache location, spawning it, and preserving terminal signal behavior.
 */
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import embeddedQcontrolPath from "../vendor/qcontrol.bin" with { type: "file" };

/** Controls where the embedded qcontrol executable is materialized. */
export interface QcontrolBundleOptions {
  cacheDir?: string;
}

/**
 * Captures process execution settings shared by direct and root qcontrol runs.
 */
export interface RunQcontrolOptions extends QcontrolBundleOptions {
  args?: string[];
  env?: NodeJS.ProcessEnv;
  stdin?: Bun.SpawnOptions.Writable;
  stdout?: Bun.SpawnOptions.Readable;
  stderr?: Bun.SpawnOptions.Readable;
  forwardSignals?: boolean;
}

/** Represents the fully assembled executable and argument vector passed to Bun. */
type QcontrolCommand = string[];

/**
 * Identifies the vendored qcontrol asset strongly enough to invalidate stale
 * cache entries when the bundled binary changes.
 */
interface QcontrolBundleMetadata {
  assetName: string;
  size: number;
  lastModified: number;
}

/** Resolves the cache root using explicit wrapper, XDG, and platform defaults. */
function defaultCacheRoot(): string {
  if (process.env.QCONTROL_WRAPPER_CACHE_DIR) {
    return process.env.QCONTROL_WRAPPER_CACHE_DIR;
  }

  if (process.env.XDG_CACHE_HOME) {
    return join(process.env.XDG_CACHE_HOME, "qcontrol-wrapper-ts");
  }

  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Caches", "qcontrol-wrapper-ts");
  }

  return join(homedir(), ".cache", "qcontrol-wrapper-ts");
}

/** Builds cache metadata from Bun's view of the embedded binary asset. */
function getBundleMetadata(binary: Bun.BunFile): QcontrolBundleMetadata {
  return {
    assetName: basename(embeddedQcontrolPath),
    size: binary.size,
    lastModified: binary.lastModified,
  };
}

/** Produces a filesystem-safe cache directory name for a specific binary asset. */
function cacheKey(metadata: QcontrolBundleMetadata): string {
  return `${metadata.assetName}-${metadata.size}-${metadata.lastModified}`.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
}

/** Reads optional cache metadata, treating invalid or missing metadata as stale. */
async function readMetadata(path: string): Promise<QcontrolBundleMetadata | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as QcontrolBundleMetadata;
  } catch {
    return undefined;
  }
}

/** Compares all metadata fields that participate in cache invalidation. */
function metadataMatches(left: QcontrolBundleMetadata, right: QcontrolBundleMetadata): boolean {
  return (
    left.assetName === right.assetName &&
    left.size === right.size &&
    left.lastModified === right.lastModified
  );
}

/** Confirms that both the cached binary and metadata describe the embedded asset. */
async function cachedBinaryMatches(binaryPath: string, metadataPath: string, metadata: QcontrolBundleMetadata): Promise<boolean> {
  try {
    const [binaryStat, cachedMetadata] = await Promise.all([stat(binaryPath), readMetadata(metadataPath)]);
    return binaryStat.size === metadata.size && cachedMetadata !== undefined && metadataMatches(cachedMetadata, metadata);
  } catch {
    return false;
  }
}

/**
 * Returns an executable path for the bundled qcontrol binary, materializing it
 * into a content-addressed cache when no valid cached copy exists.
 */
export async function getQcontrolPath(options: QcontrolBundleOptions = {}): Promise<string> {
  const binary = Bun.file(embeddedQcontrolPath);
  const metadata = getBundleMetadata(binary);
  const cacheDir = join(options.cacheDir ?? defaultCacheRoot(), cacheKey(metadata));
  const binaryPath = join(cacheDir, "qcontrol");
  const metadataPath = join(cacheDir, "qcontrol.meta.json");

  if (await cachedBinaryMatches(binaryPath, metadataPath, metadata)) {
    return binaryPath;
  }

  await mkdir(cacheDir, { recursive: true });
  await rm(binaryPath, { force: true });
  await rm(metadataPath, { force: true });

  const temporaryPath = join(cacheDir, `qcontrol.${process.pid}.tmp`);
  await Bun.write(temporaryPath, binary);
  await chmod(temporaryPath, 0o755);

  try {
    await rename(temporaryPath, binaryPath);
  } catch (error) {
    // Another process may have populated this cache entry after our first check.
    if (await cachedBinaryMatches(binaryPath, metadataPath, metadata)) {
      await rm(temporaryPath, { force: true });
      return binaryPath;
    }

    throw error;
  }

  await writeFile(metadataPath, `${JSON.stringify(metadata)}\n`, { mode: 0o644 });

  return binaryPath;
}

/** Spawns qcontrol directly with caller-provided stdio, env, and arguments. */
export async function spawnQcontrol(options: RunQcontrolOptions = {}): Promise<Bun.Subprocess> {
  const qcontrolPath = await getQcontrolPath(options);

  return spawnCommand([qcontrolPath, ...(options.args ?? [])], options);
}

/** Spawns qcontrol through sudo for commands that need privileged setup. */
export async function spawnQcontrolAsRoot(options: RunQcontrolOptions = {}): Promise<Bun.Subprocess> {
  const qcontrolPath = await getQcontrolPath(options);

  return spawnCommand(["sudo", "--", qcontrolPath, ...(options.args ?? [])], options);
}

/** Centralizes Bun spawn defaults so every qcontrol path inherits CLI behavior. */
function spawnCommand(cmd: QcontrolCommand, options: RunQcontrolOptions): Bun.Subprocess {
  return Bun.spawn({
    cmd,
    env: options.env ?? process.env,
    stdin: options.stdin ?? "inherit",
    stdout: options.stdout ?? "inherit",
    stderr: options.stderr ?? "inherit",
  });
}

/** Runs qcontrol and resolves with its exit code after signal cleanup. */
export async function runQcontrol(options: RunQcontrolOptions = {}): Promise<number> {
  return waitForQcontrol(await spawnQcontrol(options), options);
}

/** Runs qcontrol through sudo and resolves with its exit code after signal cleanup. */
export async function runQcontrolAsRoot(options: RunQcontrolOptions = {}): Promise<number> {
  return waitForQcontrol(await spawnQcontrolAsRoot(options), options);
}

/**
 * Waits for qcontrol while forwarding terminal termination signals so Ctrl-C and
 * supervisor stops reach the child process rather than only the wrapper.
 */
async function waitForQcontrol(child: Bun.Subprocess, options: RunQcontrolOptions): Promise<number> {
  if (options.forwardSignals === false) {
    return child.exited;
  }

  const forwardSignal = (signal: NodeJS.Signals) => {
    child.kill(signal);
  };

  process.once("SIGINT", forwardSignal);
  process.once("SIGTERM", forwardSignal);

  try {
    return await child.exited;
  } finally {
    // The wrapper can run many child processes in tests or long-lived callers.
    process.off("SIGINT", forwardSignal);
    process.off("SIGTERM", forwardSignal);
  }
}
