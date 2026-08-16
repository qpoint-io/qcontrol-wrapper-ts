/**
 * Exercises Monitor spawn routing: Windows starts qcontrol in the foreground
 * without a sudo hop because that platform does not elevate the monitor.
 */
import { describe, expect, test } from "bun:test";

import { Monitor } from "./monitor";
import { createPlatformAdapter } from "../platform";

describe("monitor platform behavior", () => {
  test("starts qcontrol in the foreground without a sudo hop on Windows", async () => {
    let directCalls = 0;
    let rootCalls = 0;
    const spawnedArgs: string[][] = [];
    const subprocess = {
      exited: Promise.resolve(0),
      exitCode: null,
      kill: () => {},
    } as unknown as Bun.Subprocess;

    const monitor = new Monitor({
      platform: createPlatformAdapter("win32"),
      spawnQcontrol: async (options) => {
        directCalls += 1;
        spawnedArgs.push(options?.args ?? []);
        return subprocess;
      },
      spawnQcontrolAsRoot: async () => {
        rootCalls += 1;
        return subprocess;
      },
    });

    await monitor.start();

    expect(directCalls).toBe(1);
    expect(rootCalls).toBe(0);
    expect(spawnedArgs).toEqual([["start", "-f"]]);
    await monitor.stop();
  });
});
