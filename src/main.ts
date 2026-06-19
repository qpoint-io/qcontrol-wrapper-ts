/**
 * Provides the qctl command entry point and routes wrapper-owned commands before
 * falling through to the embedded qcontrol binary.
 */
import { Collector } from "./collector";
import { ConsoleForwarder } from "./forwarder";
import {
  getQctlSinkUrl,
  initUser,
  install,
  installSystem,
  isQctlSinkAvailable,
  start,
  stop,
  uninstall,
} from "./installation";
import { platformAdapter } from "./platform";
import { runQcontrol } from "./qcontrol";
import { Scanner } from "./scanner";

/** Collaborators used by main so pass-through behavior remains unit-testable. */
interface MainDependencies {
  isQctlSinkAvailable: typeof isQctlSinkAvailable;
  runQcontrol: typeof runQcontrol;
}

const defaultMainDependencies: MainDependencies = {
  isQctlSinkAvailable,
  runQcontrol,
};

/**
 * Starts qctl's local event pipeline by binding the collector socket before the
 * scanner begins emitting qcontrol events into that sink.
 */
export async function daemon(): Promise<number> {
  const forwarder = new ConsoleForwarder();
  const collector = new Collector({
    forwarders: [forwarder],
    socketMode: platformAdapter.shouldOpenDaemonEndpoint() ? 0o666 : undefined,
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

/** Detects whether qcontrol run already has an explicit sink before its command separator. */
function hasExplicitRunSink(args: string[]): boolean {
  for (const arg of args.slice(1)) {
    if (arg === "--") {
      return false;
    }

    if (arg === "--sink" || arg.startsWith("--sink=")) {
      return true;
    }
  }

  return false;
}

/**
 * Defaults `qcontrol run` output into qctl's daemon collector when the collector
 * is already running and the user did not choose a sink explicitly.
 */
export async function resolveQcontrolArgs(
  args: string[],
  dependencies: Pick<MainDependencies, "isQctlSinkAvailable"> = defaultMainDependencies,
): Promise<string[]> {
  if (args[0] !== "run" || hasExplicitRunSink(args)) {
    return args;
  }

  if (!(await dependencies.isQctlSinkAvailable())) {
    return args;
  }

  return ["run", "--sink", getQctlSinkUrl(), ...args.slice(1)];
}

/**
 * Dispatches CLI arguments to qctl lifecycle helpers or forwards unknown
 * commands unchanged to qcontrol, preserving the child process exit code.
 */
export async function main(
  args = process.argv.slice(2),
  dependencies: MainDependencies = defaultMainDependencies,
): Promise<number> {
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
      return dependencies.runQcontrol({ args: await resolveQcontrolArgs(args, dependencies) });
  }
}

if (import.meta.main) {
  process.exitCode = await main();
}
