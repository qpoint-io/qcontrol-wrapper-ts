/**
 * Exercises qctl path helpers: invoking-user environment mapping and the
 * collector sink URL/socket formatting for each platform.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { getQctlEnvironment, getQctlSinkUrl, getQctlSocketPath } from "./paths";
import { createPlatformAdapter } from "../platform";

const originalSocketPath = process.env.QCTL_SOCKET_PATH;

beforeEach(() => {
  delete process.env.QCTL_SOCKET_PATH;
});

afterEach(() => {
  restoreEnv("QCTL_SOCKET_PATH", originalSocketPath);
});

describe("qctl environment", () => {
  test("points qcontrol at qctl-owned directories for the invoking user", () => {
    const env = getQctlEnvironment(createPlatformAdapter("darwin"), {
      SUDO_USER: "alice",
      USER: "root",
      HOME: "/var/root",
    });

    expect(env.SUDO_USER).toBe("alice");
    expect(env.HOME).toBe("/Users/alice");
    expect(env.QCTL_CONFIG_DIR).toBe("/Users/alice/.config/qctl");
    expect(env.QCONTROL_CONFIG_DIR).toBe("/Users/alice/.config/qctl");
    expect(env.QCTL_DATA_DIR).toBe("/Users/alice/Library/Application Support/qctl");
    expect(env.QCONTROL_DATA_DIR).toBe("/Users/alice/Library/Application Support/qctl");
    expect(env.QCTL_CACHE_DIR).toBe("/Users/alice/Library/Caches/qctl");
    expect(env.QCONTROL_CACHE_DIR).toBe("/Users/alice/Library/Caches/qctl");
  });

  test("honors an explicit QCTL_CONFIG_DIR override", () => {
    const env = getQctlEnvironment(createPlatformAdapter("darwin"), {
      QCTL_CONFIG_DIR: "/opt/qctl-config",
      SUDO_USER: "alice",
    });

    expect(env.QCTL_CONFIG_DIR).toBe("/opt/qctl-config");
    expect(env.QCONTROL_CONFIG_DIR).toBe("/opt/qctl-config");
  });
});

describe("collector sink endpoints", () => {
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

  test("does not percent-encode spaces in unix sink paths", () => {
    process.env.QCTL_SOCKET_PATH = "/Users/alice/Library/Application Support/qctl/collector.sock";
    const macos = createPlatformAdapter("darwin");

    expect(getQctlSinkUrl(macos)).toBe(
      "unix:///Users/alice/Library/Application Support/qctl/collector.sock",
    );
  });

  test("preserves Linux socket sink formatting", () => {
    process.env.QCTL_SOCKET_PATH = "/tmp/qctl-test.sock";
    const linux = createPlatformAdapter("linux");

    expect(getQctlSocketPath(linux)).toBe("/tmp/qctl-test.sock");
    expect(getQctlSinkUrl(linux)).toBe("unix:///tmp/qctl-test.sock");
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
