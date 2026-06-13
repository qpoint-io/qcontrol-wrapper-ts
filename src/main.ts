/**
 * Provides the qctl command entry point and routes wrapper-owned commands before
 * falling through to the embedded qcontrol binary.
 */
import { Collector } from "./collector";
import { ConsoleForwarder } from "./forwarder";
import { initUser, install, installSystem, start, stop, uninstall } from "./installation";
import { runQcontrol } from "./qcontrol";
import { Scanner } from "./scanner";

/** Detects the root-owned launchd runtime that must share its socket with users. */
function shouldOpenDaemonSocket(): boolean {
  return process.getuid?.() === 0;
}

/**
 * Starts qctl's local event pipeline by binding the collector socket before the
 * scanner begins emitting qcontrol events into that sink.
 */
export async function daemon(): Promise<number> {
  const forwarder = new ConsoleForwarder();
  const collector = new Collector({
    forwarders: [forwarder],
    socketMode: shouldOpenDaemonSocket() ? 0o666 : undefined,
  });
  const scanner = new Scanner();

  await collector.start();

  try {
    const child = await scanner.start();
    let stopPromise: Promise<void> | undefined;

    const stopRuntime = (): Promise<void> => {
      stopPromise ??= (async () => {
        await scanner.stop();
        await collector.stop();
      })();

      return stopPromise;
    };

    const handleSignal = () => {
      // Signals should stop the child first so the socket remains available for
      // final events until qcontrol has exited.
      void stopRuntime();
    };

    // TODO: watch for any condition that would require a refresh scanner
    // and then call scanner.refresh()

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

/**
 * Dispatches CLI arguments to qctl lifecycle helpers or forwards unknown
 * commands unchanged to qcontrol, preserving the child process exit code.
 */
export async function main(args = process.argv.slice(2)): Promise<number> {
  switch (args[0]) {
    case "install":
      return install();
    case "install-system":
      return installSystem();
    case "init-user":
      return initUser();
    case "uninstall":
      return uninstall();
    case "start":
      return start();
    case "stop":
      return stop();
    case "daemon":
      return daemon();
    default:
      return runQcontrol({ args });
  }
}

if (import.meta.main) {
  process.exitCode = await main();
}
