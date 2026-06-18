import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { connect } from "node:net";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { Collector } from "../src/collector";
import { getQctlSinkUrl, getQctlSocketPath } from "../src/installation";
import { createPlatformAdapter } from "../src/platform";
import { defaultCacheRoot, getQcontrolPath, qcontrolExecutableName } from "../src/qcontrol";
import { Scanner } from "../src/scanner";

const originalLocalAppData = process.env.LOCALAPPDATA;
const originalQcontrolCache = process.env.QCONTROL_WRAPPER_CACHE_DIR;
const originalQctlSocketPath = process.env.QCTL_SOCKET_PATH;
const originalXdgCacheHome = process.env.XDG_CACHE_HOME;

beforeEach(() => {
  delete process.env.QCONTROL_WRAPPER_CACHE_DIR;
  delete process.env.QCTL_SOCKET_PATH;
});

afterEach(() => {
  restoreEnv("LOCALAPPDATA", originalLocalAppData);
  restoreEnv("QCONTROL_WRAPPER_CACHE_DIR", originalQcontrolCache);
  restoreEnv("QCTL_SOCKET_PATH", originalQctlSocketPath);
  restoreEnv("XDG_CACHE_HOME", originalXdgCacheHome);
});

/** Restores process environment keys without leaving test-only empty values. */
function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

describe("platform helpers", () => {
  test("names the materialized qcontrol executable for each platform", () => {
    expect(qcontrolExecutableName("win32")).toBe("qcontrol.exe");
    expect(qcontrolExecutableName("darwin")).toBe("qcontrol");
    expect(qcontrolExecutableName("linux")).toBe("qcontrol");
  });

  test("uses LocalAppData as the Windows cache root when available", () => {
    process.env.LOCALAPPDATA = "C:\\Users\\User\\AppData\\Local";

    expect(defaultCacheRoot("win32")).toBe(join("C:\\Users\\User\\AppData\\Local", "qcontrol-wrapper-ts"));
  });

  test("resolves a Windows named-pipe sink endpoint", () => {
    const windows = createPlatformAdapter("win32");

    expect(getQctlSocketPath(windows)).toBe("\\\\.\\pipe\\qctl-collector");
    expect(getQctlSinkUrl(windows)).toBe("pipe://qctl-collector");
  });

  test("preserves macOS socket sink formatting", () => {
    process.env.QCTL_SOCKET_PATH = "/tmp/qctl-test.sock";
    const macos = createPlatformAdapter("darwin");

    expect(getQctlSocketPath(macos)).toBe("/tmp/qctl-test.sock");
    expect(getQctlSinkUrl(macos)).toBe("unix:///tmp/qctl-test.sock");
  });

  test("preserves Linux socket sink formatting", () => {
    process.env.QCTL_SOCKET_PATH = "/tmp/qctl-test.sock";
    const linux = createPlatformAdapter("linux");

    expect(getQctlSocketPath(linux)).toBe("/tmp/qctl-test.sock");
    expect(getQctlSinkUrl(linux)).toBe("unix:///tmp/qctl-test.sock");
  });

  test("uses XDG cache roots on Linux", () => {
    process.env.XDG_CACHE_HOME = "/tmp/xdg-cache";

    expect(defaultCacheRoot("linux")).toBe(join("/tmp/xdg-cache", "qcontrol-wrapper-ts"));
  });

  test("rejects unsupported host platforms", () => {
    expect(() => createPlatformAdapter("freebsd")).toThrow("unsupported platform: freebsd");
  });
});

describe("qcontrol materialization", () => {
  test("materializes qcontrol with the host executable suffix", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "qctl-test-cache-"));
    try {
      const qcontrolPath = await getQcontrolPath({ cacheDir });

      expect(basename(qcontrolPath)).toBe(qcontrolExecutableName());
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });
});

describe("collector endpoints", () => {
  test.skipIf(process.platform !== "win32")("binds a Windows named pipe", async () => {
    const pipePath = `\\\\.\\pipe\\qctl-test-${String(process.pid)}-${String(Date.now())}`;
    const collector = new Collector({ socketPath: pipePath });

    await collector.start();
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = connect(pipePath);
        socket.once("connect", () => {
          socket.end();
          resolve();
        });
        socket.once("error", reject);
      });
    } finally {
      await collector.stop();
    }
  });
});

describe("scanner platform behavior", () => {
  test("does not use the root scanner path on Windows", async () => {
    let directCalls = 0;
    let rootCalls = 0;
    const spawnedArgs: string[][] = [];
    const subprocess = {
      exited: Promise.resolve(0),
      exitCode: null,
      kill: () => {},
    } as unknown as Bun.Subprocess;

    const scanner = new Scanner({
      autotap: true,
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

    await scanner.start();

    expect(directCalls).toBe(1);
    expect(rootCalls).toBe(0);
    expect(spawnedArgs).toEqual([["scan", "--processes", "--watch", "--sink", "pipe://qctl-collector", "--tap"]]);
    await scanner.stop();
  });
});
