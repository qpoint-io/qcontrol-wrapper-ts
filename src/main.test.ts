/**
 * Exercises the wrapper CLI: pass-through to qcontrol, and keeping start,
 * status, and stop as wrapper-owned commands.
 */
import { describe, expect, test } from "bun:test";

import { main } from "./main";

describe("qcontrol pass-through", () => {
  test("forwards unknown commands to qcontrol unchanged", async () => {
    const calls: unknown[] = [];
    const exitCode = await main(["scan", "--details"], {
      runQcontrol: async (options) => {
        calls.push(options);
        return 0;
      },
      start: async () => 0,
      status: async () => 0,
      stop: async () => 0,
    });

    expect(exitCode).toBe(0);
    expect(calls).toEqual([{ args: ["scan", "--details"] }]);
  });

  test("forwards daemon to qcontrol instead of treating it as start -f", async () => {
    const calls: unknown[] = [];
    const exitCode = await main(["daemon"], {
      runQcontrol: async (options) => {
        calls.push(options);
        return 0;
      },
      start: async () => 0,
      status: async () => 0,
      stop: async () => 0,
    });

    expect(exitCode).toBe(0);
    expect(calls).toEqual([{ args: ["daemon"] }]);
  });

  test("forwards install to qcontrol", async () => {
    const calls: unknown[] = [];
    const exitCode = await main(["install"], {
      runQcontrol: async (options) => {
        calls.push(options);
        return 0;
      },
      start: async () => 0,
      status: async () => 0,
      stop: async () => 0,
    });

    expect(exitCode).toBe(0);
    expect(calls).toEqual([{ args: ["install"] }]);
  });

  test("does not inject a sink flag into run commands", async () => {
    const calls: unknown[] = [];
    const exitCode = await main(["run", "--", "codex"], {
      runQcontrol: async (options) => {
        calls.push(options);
        return 0;
      },
      start: async () => 0,
      status: async () => 0,
      stop: async () => 0,
    });

    expect(exitCode).toBe(0);
    expect(calls).toEqual([{ args: ["run", "--", "codex"] }]);
  });
});

describe("main lifecycle dispatch", () => {
  test("keeps start, status, and stop in the wrapper", async () => {
    const startCalls: string[][] = [];
    const statusCalls: number[] = [];
    const stopCalls: number[] = [];
    const qcontrolCalls: unknown[] = [];

    await expect(main(["start", "-f"], {
      runQcontrol: async (options) => {
        qcontrolCalls.push(options);
        return 0;
      },
      start: async (args) => {
        startCalls.push(args);
        return 0;
      },
      status: async () => 0,
      stop: async () => {
        stopCalls.push(1);
        return 0;
      },
    })).resolves.toBe(0);

    await expect(main(["status"], {
      runQcontrol: async () => 0,
      start: async () => 0,
      status: async () => {
        statusCalls.push(1);
        return 0;
      },
      stop: async () => 0,
    })).resolves.toBe(0);

    await expect(main(["stop"], {
      runQcontrol: async () => 0,
      start: async () => 0,
      status: async () => 0,
      stop: async () => {
        stopCalls.push(1);
        return 0;
      },
    })).resolves.toBe(0);

    expect(startCalls).toEqual([["-f"]]);
    expect(statusCalls).toEqual([1]);
    expect(stopCalls).toEqual([1]);
    expect(qcontrolCalls).toEqual([]);
  });
});
