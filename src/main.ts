/**
 * Provides the qctl command entry point and routes wrapper-owned start/stop/
 * status before falling through to the embedded qcontrol binary.
 */
import { runQcontrol } from "./core/qcontrol";
import { start, status, stop } from "./lifecycle";

/** Collaborators used by main so pass-through behavior remains unit-testable. */
interface MainDependencies {
  runQcontrol: typeof runQcontrol;
  start: typeof start;
  status: typeof status;
  stop: typeof stop;
}

const defaultMainDependencies: MainDependencies = {
  runQcontrol,
  start,
  status,
  stop,
};

/**
 * Dispatches CLI arguments to wrapper lifecycle helpers or forwards unknown
 * commands unchanged to qcontrol, preserving the child process exit code.
 */
export async function main(
  args = process.argv.slice(2),
  dependencies: MainDependencies = defaultMainDependencies,
): Promise<number> {
  switch (args[0]) {
    case "start":
      return dependencies.start(args.slice(1));
    case "status":
      return dependencies.status();
    case "stop":
      return dependencies.stop();
    default:
      return dependencies.runQcontrol({ args });
  }
}

if (import.meta.main) {
  process.exitCode = await main();
}
