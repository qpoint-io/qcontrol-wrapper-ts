/**
 * Owns the qcontrol scan watcher lifecycle that reports discovered agent
 * installations and process events to qctl's Unix socket sink.
 */
import { getQctlSinkUrl } from "./installation";
import { type QcontrolBundleOptions, spawnQcontrol, spawnQcontrolAsRoot } from "./qcontrol";

/** Configures process spawning details for a scanner instance. */
export interface ScannerOptions extends QcontrolBundleOptions {
  autotap?: boolean;
  env?: NodeJS.ProcessEnv;
  stderr?: Bun.SpawnOptions.Readable;
  stdin?: Bun.SpawnOptions.Writable;
  stdout?: Bun.SpawnOptions.Readable;
  stopSignal?: NodeJS.Signals;
}

/** Detects whether qcontrol scan can tap targets without another sudo hop. */
function isCurrentProcessPrivileged(): boolean {
  const uid = typeof process.geteuid === "function" ? process.geteuid() : process.getuid?.();
  return uid === 0;
}

/** Builds the scan watcher command once so privilege handling cannot drift from args. */
function getWatchScanArgs(autotap: boolean): string[] {
  const args = ["scan", "--processes", "--watch", "--sink", getQctlSinkUrl()];
  if (autotap) {
    args.push("--tap");
  }

  return args;
}

/** Builds the one-shot scan command used to refresh qcontrol's process view. */
function getRefreshScanArgs(): string[] {
  return ["scan", "--processes", "--sink", getQctlSinkUrl()];
}

/**
 * Starts and stops a long-running `qcontrol scan` subprocess for callers that
 * need scanner lifecycle control without tying it to the qctl CLI entry point.
 */
export class Scanner {
  private process?: Bun.Subprocess;
  private readonly options: ScannerOptions;

  constructor(options: ScannerOptions = {}) {
    this.options = options;
  }

  /** Returns the active scanner process, if this instance currently owns one. */
  get subprocess(): Bun.Subprocess | undefined {
    return this.process;
  }

  /** Starts qcontrol's scan watcher and returns the owned subprocess. */
  async start(): Promise<Bun.Subprocess> {
    if (this.process && this.process.exitCode === null) {
      return this.process;
    }

    const runAsRoot = this.options.autotap === true && !isCurrentProcessPrivileged();
    const spawnScanner = runAsRoot ? spawnQcontrolAsRoot : spawnQcontrol;
    const child = await spawnScanner({
      cacheDir: this.options.cacheDir,
      env: this.options.env,
      stdin: this.options.stdin ?? (runAsRoot ? "inherit" : "ignore"),
      stdout: this.options.stdout ?? "ignore",
      stderr: this.options.stderr ?? (runAsRoot ? "inherit" : "ignore"),
      args: getWatchScanArgs(this.options.autotap === true),
    });

    this.process = child;

    // A scanner is useful only while alive; clear stale ownership after exit.
    void child.exited.finally(() => {
      if (this.process === child) {
        this.process = undefined;
      }
    });

    return child;
  }

  /** Starts a one-shot process scan against qctl's sink without taking ownership. */
  async refresh(): Promise<Bun.Subprocess> {
    return spawnQcontrol({
      cacheDir: this.options.cacheDir,
      env: this.options.env,
      stdin: this.options.stdin ?? "ignore",
      stdout: this.options.stdout ?? "ignore",
      stderr: this.options.stderr ?? "ignore",
      args: getRefreshScanArgs(),
    });
  }

  /** Stops the scanner process owned by this instance and resolves after exit. */
  async stop(): Promise<number | undefined> {
    const child = this.process;
    if (!child) {
      return undefined;
    }

    this.process = undefined;
    if (child.exitCode === null) {
      child.kill(this.options.stopSignal ?? "SIGTERM");
    }

    return child.exited;
  }
}
