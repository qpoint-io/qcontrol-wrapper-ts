/**
 * Exercises embedded qcontrol materialization: executable names, cache-root
 * defaults, and writing the bundled binary into a temp cache.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { defaultCacheRoot, getQcontrolPath, qcontrolExecutableName } from "./qcontrol";

const originalLocalAppData = process.env.LOCALAPPDATA;
const originalQcontrolCache = process.env.QCONTROL_WRAPPER_CACHE_DIR;
const originalXdgCacheHome = process.env.XDG_CACHE_HOME;

beforeEach(() => {
  delete process.env.QCONTROL_WRAPPER_CACHE_DIR;
});

afterEach(() => {
  restoreEnv("LOCALAPPDATA", originalLocalAppData);
  restoreEnv("QCONTROL_WRAPPER_CACHE_DIR", originalQcontrolCache);
  restoreEnv("XDG_CACHE_HOME", originalXdgCacheHome);
});

describe("qcontrol materialization", () => {
  test("names the materialized qcontrol executable for each platform", () => {
    expect(qcontrolExecutableName("win32")).toBe("qcontrol.exe");
    expect(qcontrolExecutableName("darwin")).toBe("qcontrol");
    expect(qcontrolExecutableName("linux")).toBe("qcontrol");
  });

  test("uses LocalAppData as the Windows cache root when available", () => {
    process.env.LOCALAPPDATA = "C:\\Users\\User\\AppData\\Local";

    expect(defaultCacheRoot("win32")).toBe(join("C:\\Users\\User\\AppData\\Local", "qctl", "cache"));
  });

  test("uses XDG cache roots on Linux", () => {
    process.env.XDG_CACHE_HOME = "/tmp/xdg-cache";

    expect(defaultCacheRoot("linux")).toBe(join("/tmp/xdg-cache", "qctl"));
  });

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

/** Restores process environment keys without leaving test-only empty values. */
function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
