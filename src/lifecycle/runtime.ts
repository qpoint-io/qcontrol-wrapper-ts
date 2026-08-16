/**
 * Runs the wrapper's continuous runtime in this process: bind the collector,
 * then `qcontrol start -f`. This is `qctl start -f`. PrettyPrinter is the
 * default stdout forwarder; `--raw` selects RawPrinter instead.
 */
import { Collector } from "../core/collector";
import { Monitor } from "../core/monitor";
import type { Forwarder } from "../core/forwarder";
import { PrettyPrinter } from "../forwarders/pretty";
import { RawPrinter } from "../forwarders/raw";
import { platformAdapter } from "../platform";
import { writeLifecyclePid } from "./state";

/** Options for the in-process collector-plus-monitor runtime. */
export interface RuntimeOptions {
  /** Selects RawPrinter over the default PrettyPrinter. */
  raw?: boolean;
}

/** Starts the collector-plus-monitor pipeline and blocks until it exits. */
export async function runForeground(options: RuntimeOptions = {}): Promise<number> {
  const forwarder: Forwarder = options.raw ? new RawPrinter() : new PrettyPrinter();
  const collector = new Collector({
    forwarders: [forwarder],
    socketMode: platformAdapter.shouldOpenDaemonEndpoint() ? 0o666 : undefined,
  });
  const monitor = new Monitor();

  // Record this process so `qctl status` works for foreground and service
  // placements, which otherwise never write a pid file.
  await writeLifecyclePid(process.pid);
  await collector.start();

  try {
    const child = await monitor.start();
    let stopPromise: Promise<void> | undefined;

    const stopRuntime = (): Promise<void> => {
      stopPromise ??= (async () => {
        await monitor.stop();
        await collector.stop();
      })();

      return stopPromise;
    };

    const handleSignal = () => {
      // Stop the monitor first so the socket remains available for final events
      // until qcontrol has exited.
      void stopRuntime();
    };

    process.once("SIGINT", handleSignal);
    process.once("SIGTERM", handleSignal);

    try {
      return await child.exited;
    } finally {
      process.off("SIGINT", handleSignal);
      process.off("SIGTERM", handleSignal);
      await stopRuntime();
    }
  } catch (error) {
    await collector.stop();
    throw error;
  }
}
