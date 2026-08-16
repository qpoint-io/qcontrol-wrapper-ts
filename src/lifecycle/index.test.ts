/**
 * Exercises start/stop placement routing, start-flag parsing, and status
 * reporting against injected collaborators so no service manager is required.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, spyOn, test } from "bun:test";

import { start, status, stop, type LifecycleDependencies } from ".";
import { resolveStartMode, StartUsageError } from "./mode";
import { isPidAlive, wrapperForegroundCommand } from "./process";
import { readLifecycleState, writeLifecyclePid, writeLifecycleState } from "./state";

/** Records placement calls so start/stop routing can be asserted without launching. */
function recordingDependencies(overrides: Partial<LifecycleDependencies> = {}): LifecycleDependencies & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    runForeground: async (options) => {
      calls.push(options?.raw ? "foreground --raw" : "foreground");
      return 0;
    },
    startDirect: async (options) => {
      calls.push(options?.raw ? "direct --raw" : "direct");
      return 0;
    },
    startService: async (options) => {
      calls.push(options?.raw ? "service --raw" : "service");
      return 0;
    },
    stopPlacement: async () => {
      calls.push("stop");
      return 0;
    },
    reexecAsRoot: async (args) => {
      calls.push(`sudo ${args.join(" ")}`);
      return 0;
    },
    isPrivileged: () => true,
    canElevate: () => true,
    ensureLayout: async () => {},
    ...overrides,
  };
}

describe("start flag parsing", () => {
  test("defaults to a detached background start", () => {
    expect(resolveStartMode([])).toEqual({ mode: "direct", raw: false });
  });

  test("selects foreground for -f and --foreground", () => {
    expect(resolveStartMode(["-f"])).toEqual({ mode: "foreground", raw: false });
    expect(resolveStartMode(["--foreground"])).toEqual({ mode: "foreground", raw: false });
  });

  test("selects service for --service", () => {
    expect(resolveStartMode(["--service"])).toEqual({ mode: "service", raw: false });
  });

  test("selects raw JSON output for --raw", () => {
    expect(resolveStartMode(["--raw"])).toEqual({ mode: "direct", raw: true });
    expect(resolveStartMode(["-f", "--raw"])).toEqual({ mode: "foreground", raw: true });
    expect(resolveStartMode(["--service", "--raw"])).toEqual({ mode: "service", raw: true });
  });

  test("rejects combining foreground and service", () => {
    expect(() => resolveStartMode(["-f", "--service"])).toThrow(StartUsageError);
  });
});

describe("start and stop routing", () => {
  test("routes each start mode to the matching placement", async () => {
    const foreground = recordingDependencies();
    await expect(start(["-f"], foreground)).resolves.toBe(0);
    expect(foreground.calls).toEqual(["foreground"]);

    const direct = recordingDependencies();
    await expect(start([], direct)).resolves.toBe(0);
    expect(direct.calls).toEqual(["direct"]);

    const service = recordingDependencies();
    await expect(start(["--service"], service)).resolves.toBe(0);
    expect(service.calls).toEqual(["service"]);

    const rawForeground = recordingDependencies();
    await expect(start(["-f", "--raw"], rawForeground)).resolves.toBe(0);
    expect(rawForeground.calls).toEqual(["foreground --raw"]);

    const rawDirect = recordingDependencies();
    await expect(start(["--raw"], rawDirect)).resolves.toBe(0);
    expect(rawDirect.calls).toEqual(["direct --raw"]);
  });

  test("forwards --raw onto the detached start -f command", () => {
    expect(wrapperForegroundCommand().slice(-2)).toEqual(["start", "-f"]);
    expect(wrapperForegroundCommand({ raw: true }).slice(-3)).toEqual(["start", "-f", "--raw"]);
  });

  test("re-execs through sudo when start is not already elevated", async () => {
    const dependencies = recordingDependencies({ isPrivileged: () => false });
    await expect(start(["--service"], dependencies)).resolves.toBe(0);
    expect(dependencies.calls).toEqual(["sudo start --service"]);
  });

  test("stop re-execs through sudo when not elevated", async () => {
    const dependencies = recordingDependencies({ isPrivileged: () => false });
    await expect(stop(dependencies)).resolves.toBe(0);
    expect(dependencies.calls).toEqual(["sudo stop"]);
  });
});

describe("status", () => {
  test("reports running with the recorded pid when that process is alive", async () => {
    const lines: string[] = [];
    const log = spyOn(console, "log").mockImplementation((message?: unknown) => {
      lines.push(String(message));
    });

    try {
      await expect(status({
        readState: async () => ({ manager: "direct", pid: 4242 }),
        isPidAlive: (pid) => pid === 4242,
      })).resolves.toBe(0);
      expect(lines).toEqual(["qctl is running (pid 4242)"]);
    } finally {
      log.mockRestore();
    }
  });

  test("reports offline when nothing is placed", async () => {
    const lines: string[] = [];
    const log = spyOn(console, "log").mockImplementation((message?: unknown) => {
      lines.push(String(message));
    });

    try {
      await expect(status({
        readState: async () => undefined,
        isPidAlive: () => true,
      })).resolves.toBe(0);
      expect(lines).toEqual(["qctl is offline"]);
    } finally {
      log.mockRestore();
    }
  });

  test("reports offline when the recorded pid is gone", async () => {
    const lines: string[] = [];
    const log = spyOn(console, "log").mockImplementation((message?: unknown) => {
      lines.push(String(message));
    });

    try {
      await expect(status({
        readState: async () => ({ manager: "direct", pid: 99 }),
        isPidAlive: () => false,
      })).resolves.toBe(0);
      expect(lines).toEqual(["qctl is offline"]);
    } finally {
      log.mockRestore();
    }
  });

  test("treats this process as alive and a reaped child as dead", async () => {
    expect(isPidAlive(process.pid)).toBe(true);

    const child = Bun.spawn({
      cmd: [process.execPath, "-e", "await Bun.sleep(30_000)"],
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
    const pid = child.pid;
    expect(isPidAlive(pid)).toBe(true);
    child.kill();
    await child.exited;
    expect(isPidAlive(pid)).toBe(false);
  });

  test("records a runtime pid without replacing the service marker", async () => {
    const dir = await mkdtemp(join(tmpdir(), "qctl-status-"));
    const original = process.env.QCTL_DATA_DIR;
    process.env.QCTL_DATA_DIR = dir;

    try {
      await writeLifecycleState({ manager: "launchd" });
      await writeLifecyclePid(1234);
      await expect(readLifecycleState()).resolves.toEqual({ manager: "launchd", pid: 1234 });
    } finally {
      if (original === undefined) {
        delete process.env.QCTL_DATA_DIR;
      } else {
        process.env.QCTL_DATA_DIR = original;
      }
      await rm(dir, { recursive: true, force: true });
    }
  });
});
