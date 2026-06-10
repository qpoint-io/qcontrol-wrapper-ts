import { runQcontrol } from "./qcontrol";

export async function main(args = process.argv.slice(2)): Promise<number> {
  switch (args[0]) {
    case "install":
    case "uninstall":
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
