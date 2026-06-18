import { describe, expect, test } from "bun:test";

import { getQctlSinkUrl } from "../src/installation";
import { main, resolveQcontrolArgs } from "../src/main";

describe("qcontrol run sink defaults", () => {
  test("leaves non-run commands unchanged", async () => {
    await expect(resolveQcontrolArgs(["--version"], {
      isQctlSinkAvailable: async () => true,
    })).resolves.toEqual(["--version"]);
  });

  test("leaves run commands unchanged when a sink is explicit", async () => {
    const dependencies = {
      isQctlSinkAvailable: async () => true,
    };

    await expect(resolveQcontrolArgs(["run", "--sink", "stdout", "--", "codex"], dependencies))
      .resolves.toEqual(["run", "--sink", "stdout", "--", "codex"]);
    await expect(resolveQcontrolArgs(["run", "--sink=stdout", "--", "codex"], dependencies))
      .resolves.toEqual(["run", "--sink=stdout", "--", "codex"]);
  });

  test("leaves run commands unchanged when the daemon sink is unavailable", async () => {
    await expect(resolveQcontrolArgs(["run", "--", "codex"], {
      isQctlSinkAvailable: async () => false,
    })).resolves.toEqual(["run", "--", "codex"]);
  });

  test("defaults run commands to the daemon collector sink when available", async () => {
    const sinkUrl = getQctlSinkUrl();

    await expect(resolveQcontrolArgs(["run", "--", "codex"], {
      isQctlSinkAvailable: async () => true,
    })).resolves.toEqual(["run", "--sink", sinkUrl, "--", "codex"]);
  });

  test("passes resolved run arguments to qcontrol", async () => {
    const calls: unknown[] = [];
    const sinkUrl = getQctlSinkUrl();
    const exitCode = await main(["run", "--", "codex"], {
      isQctlSinkAvailable: async () => true,
      runQcontrol: async (options) => {
        calls.push(options);
        return 0;
      },
    });

    expect(exitCode).toBe(0);
    expect(calls).toEqual([{ args: ["run", "--sink", sinkUrl, "--", "codex"] }]);
  });
});
