/**
 * Owns the elevated `qcontrol start -f` child that is the continuous monitor.
 *
 * The wrapper collector listens first; this process then asks qcontrol to run
 * its monitor in the foreground so fleet sinks in config.toml deliver into that
 * collector. Inventory, process watch, and tap reconcile stay inside qcontrol.
 */
import { getQctlEnvironment } from "./paths";
import { platformAdapter, type PlatformAdapter } from "../platform";
import { type QcontrolBundleOptions, spawnQcontrol, spawnQcontrolAsRoot } from "./qcontrol";

/** Configures process spawning details for a monitor instance. */
export interface MonitorOptions extends QcontrolBundleOptions {
  env?: NodeJS.ProcessEnv;
  platform?: PlatformAdapter;
  stderr?: Bun.SpawnOptions.Readable;
  stdin?: Bun.SpawnOptions.Writable;
  stdout?: Bun.SpawnOptions.Readable;
  stopSignal?: NodeJS.Signals;
  spawnQcontrol?: typeof spawnQcontrol;
  spawnQcontrolAsRoot?: typeof spawnQcontrolAsRoot;
}

/** Detects whether this process can already satisfy qcontrol's start elevation gate. */
function isCurrentProcessPrivileged(platform: PlatformAdapter): boolean {
  if (!platform.canElevateMonitor()) {
    return true;
  }

  const uid = typeof process.geteuid === "function" ? process.geteuid() : process.getuid?.();
  return uid === 0;
}

/**
 * Starts and stops a long-running `qcontrol start -f` subprocess so the wrapper
 * can host the collector without becoming a second monitor.
 */
export class Monitor {
  private process?: Bun.Subprocess;
  private readonly options: MonitorOptions;

  constructor(options: MonitorOptions = {}) {
    this.options = options;
  }

  /** Returns the active monitor process, if this instance currently owns one. */
  get subprocess(): Bun.Subprocess | undefined {
    return this.process;
  }

  /** Starts qcontrol's foreground monitor and returns the owned subprocess. */
  async start(): Promise<Bun.Subprocess> {
    if (this.process && this.process.exitCode === null) {
      return this.process;
    }

    const platform = this.options.platform ?? platformAdapter;
    const env = this.options.env ?? getQctlEnvironment(platform);
    const runAsRoot = platform.canElevateMonitor() && !isCurrentProcessPrivileged(platform);
    const spawnMonitor = runAsRoot
      ? (this.options.spawnQcontrolAsRoot ?? spawnQcontrolAsRoot)
      : (this.options.spawnQcontrol ?? spawnQcontrol);
    const child = await spawnMonitor({
      cacheDir: this.options.cacheDir,
      platform,
      env,
      stdin: this.options.stdin ?? (runAsRoot ? "inherit" : "ignore"),
      stdout: this.options.stdout ?? "ignore",
      // Sink connect failures and monitor diagnostics go to stderr. After the
      // wrapper re-execs as root it no longer needs sudo prompts, but those
      // messages still have to stay visible or a dead fleet sink is silent.
      stderr: this.options.stderr ?? "inherit",
      args: ["start", "-f"],
    });

    this.process = child;

    // A monitor is useful only while alive; clear stale ownership after exit.
    void child.exited.finally(() => {
      if (this.process === child) {
        this.process = undefined;
      }
    });

    return child;
  }

  /** Stops the monitor process owned by this instance and resolves after exit. */
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
