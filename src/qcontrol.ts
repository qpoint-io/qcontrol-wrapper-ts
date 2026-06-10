import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import embeddedQcontrolPath from "../vendor/qcontrol.bin" with { type: "file" };

export interface QcontrolBundleOptions {
  cacheDir?: string;
}

export interface RunQcontrolOptions extends QcontrolBundleOptions {
  args?: string[];
  env?: NodeJS.ProcessEnv;
  stdin?: Bun.SpawnOptions.Writable;
  stdout?: Bun.SpawnOptions.Readable;
  stderr?: Bun.SpawnOptions.Readable;
  forwardSignals?: boolean;
}

interface QcontrolBundleMetadata {
  assetName: string;
  size: number;
  lastModified: number;
}

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

function getBundleMetadata(binary: Bun.BunFile): QcontrolBundleMetadata {
  return {
    assetName: basename(embeddedQcontrolPath),
    size: binary.size,
    lastModified: binary.lastModified,
  };
}

function cacheKey(metadata: QcontrolBundleMetadata): string {
  return `${metadata.assetName}-${metadata.size}-${metadata.lastModified}`.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
}

async function readMetadata(path: string): Promise<QcontrolBundleMetadata | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as QcontrolBundleMetadata;
  } catch {
    return undefined;
  }
}

function metadataMatches(left: QcontrolBundleMetadata, right: QcontrolBundleMetadata): boolean {
  return (
    left.assetName === right.assetName &&
    left.size === right.size &&
    left.lastModified === right.lastModified
  );
}

async function cachedBinaryMatches(binaryPath: string, metadataPath: string, metadata: QcontrolBundleMetadata): Promise<boolean> {
  try {
    const [binaryStat, cachedMetadata] = await Promise.all([stat(binaryPath), readMetadata(metadataPath)]);
    return binaryStat.size === metadata.size && cachedMetadata !== undefined && metadataMatches(cachedMetadata, metadata);
  } catch {
    return false;
  }
}

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
    if (await cachedBinaryMatches(binaryPath, metadataPath, metadata)) {
      await rm(temporaryPath, { force: true });
      return binaryPath;
    }

    throw error;
  }

  await writeFile(metadataPath, `${JSON.stringify(metadata)}\n`, { mode: 0o644 });

  return binaryPath;
}

export async function spawnQcontrol(options: RunQcontrolOptions = {}): Promise<Bun.Subprocess> {
  const qcontrolPath = await getQcontrolPath(options);

  return Bun.spawn({
    cmd: [qcontrolPath, ...(options.args ?? [])],
    env: options.env ?? process.env,
    stdin: options.stdin ?? "inherit",
    stdout: options.stdout ?? "inherit",
    stderr: options.stderr ?? "inherit",
  });
}

export async function runQcontrol(options: RunQcontrolOptions = {}): Promise<number> {
  const child = await spawnQcontrol(options);

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
    process.off("SIGINT", forwardSignal);
    process.off("SIGTERM", forwardSignal);
  }
}
