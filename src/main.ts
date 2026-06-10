import { runQcontrol } from "./qcontrol";

export async function main(args = process.argv.slice(2)): Promise<number> {
  return runQcontrol({ args });
}

if (import.meta.main) {
  process.exitCode = await main();
}
