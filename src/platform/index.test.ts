/**
 * Exercises platform-adapter selection and the path conventions each adapter
 * owns: config overrides and the default collector endpoint.
 */
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createPlatformAdapter } from ".";

describe("platform helpers", () => {
  test("rejects unsupported host platforms", () => {
    expect(() => createPlatformAdapter("freebsd")).toThrow("unsupported platform: freebsd");
  });

  test("honors QCTL_CONFIG_DIR for qctl's config path", () => {
    const macos = createPlatformAdapter("darwin");

    expect(macos.configPath({ QCTL_CONFIG_DIR: "/tmp/qctl-config" })).toBe("/tmp/qctl-config");
  });

  test("places the default collector socket in the qctl data directory", () => {
    const macos = createPlatformAdapter("darwin");

    expect(macos.defaultCollectorEndpoint({ HOME: "/Users/alice" })).toBe(
      join("/Users/alice", "Library", "Application Support", "qctl", "collector.sock"),
    );
  });
});
