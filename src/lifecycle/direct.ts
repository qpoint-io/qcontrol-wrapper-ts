/**
 * Default `qctl start` placement: detach `qctl start -f` and return.
 */
import { mkdir, open } from "node:fs/promises";

import { startLogPath, writeLifecycleState } from "./state";
import { isPidAlive, isProcessGone, wrapperForegroundCommand } from "./process";
import { getQctlEnvironment } from "../core/paths";
import { platformAdapter } from "../platform";
import type { RuntimeOptions } from "./runtime";

/** Spawns a detached foreground runtime and records its pid for `qctl stop`. */
export async function startDirect(options: RuntimeOptions = {}): Promise<number> {
  const command = wrapperForegroundCommand(options);
  const logPath = startLogPath();
  await mkdir(platformAdapter.dataPath(process.env), { recursive: true });
  const log = await open(logPath, "a");

  try {
    const child = Bun.spawn({
      cmd: command,
      env: getQctlEnvironment(),
      stdin: "ignore",
      stdout: log.fd,
      stderr: log.fd,
      detached: true,
    });
    child.unref();
    await writeLifecycleState({ manager: "direct", pid: child.pid });
    console.log(`qctl started (pid ${String(child.pid)})`);
    return 0;
  } finally {
    await log.close();
  }
}

/** Signals a detached start pid. Already-gone processes are success. */
export async function stopDirect(pid: number): Promise<number> {
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    if (isProcessGone(error)) {
      return 0;
    }

    throw error;
  }

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) {
      console.log(`qctl stopped (pid ${String(pid)})`);
      return 0;
    }

    await Bun.sleep(50);
  }

  console.error(`qctl did not stop after SIGTERM (pid ${String(pid)})`);
  return 1;
}
