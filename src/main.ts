/**
 * Provides the qctl command entry point and routes wrapper-owned commands before
 * falling through to the embedded qcontrol binary.
 */
import { install, uninstall } from "./installation";
import { runQcontrol } from "./qcontrol";

/**
 * Dispatches CLI arguments to qctl lifecycle helpers or forwards unknown
 * commands unchanged to qcontrol, preserving the child process exit code.
 */
export async function main(args = process.argv.slice(2)): Promise<number> {
  switch (args[0]) {
    case "install":
      return install();
    case "uninstall":
      return uninstall();
    case "start":
    case "stop":
      console.log(`${args[0]} not yet implemented`);
      return 0;
    default:
      return runQcontrol({ args });
  }
}

if (import.meta.main) {
  process.exitCode = await main();
}
