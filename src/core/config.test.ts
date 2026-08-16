/**
 * Exercises qctl config-directory creation and the collector sink that
 * `ensureQctlLayout` seeds or repairs in config.toml.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { defaultQctlConfig, ensureQctlLayout, getQctlConfigFilePath } from "./config";
import { getQctlSinkUrl } from "./paths";

const originalConfigDir = process.env.QCTL_CONFIG_DIR;
const originalDataDir = process.env.QCTL_DATA_DIR;
const originalCacheDir = process.env.QCTL_CACHE_DIR;
const originalSocketPath = process.env.QCTL_SOCKET_PATH;

describe("qctl config layout", () => {
  const dirs: string[] = [];

  beforeEach(() => {
    delete process.env.QCTL_CONFIG_DIR;
    delete process.env.QCTL_DATA_DIR;
    delete process.env.QCTL_CACHE_DIR;
    delete process.env.QCTL_SOCKET_PATH;
  });

  afterEach(async () => {
    restoreEnv("QCTL_CONFIG_DIR", originalConfigDir);
    restoreEnv("QCTL_DATA_DIR", originalDataDir);
    restoreEnv("QCTL_CACHE_DIR", originalCacheDir);
    restoreEnv("QCTL_SOCKET_PATH", originalSocketPath);
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  test("creates directories and seeds config.toml with the collector sink", async () => {
    const dir = await mkdtemp(join(tmpdir(), "qctl-layout-"));
    dirs.push(dir);
    process.env.QCTL_CONFIG_DIR = join(dir, "config");
    process.env.QCTL_DATA_DIR = join(dir, "data");
    process.env.QCTL_CACHE_DIR = join(dir, "cache");
    process.env.QCTL_SOCKET_PATH = "/tmp/qctl-test.sock";

    await ensureQctlLayout();

    const config = await readFile(getQctlConfigFilePath(), "utf8");
    expect(config).toBe(defaultQctlConfig(getQctlSinkUrl()));
    expect(config).toContain(`url = ${JSON.stringify(getQctlSinkUrl())}`);
  });

  test("appends the collector sink to an existing config.toml", async () => {
    const dir = await mkdtemp(join(tmpdir(), "qctl-layout-"));
    dirs.push(dir);
    process.env.QCTL_CONFIG_DIR = join(dir, "config");
    process.env.QCTL_DATA_DIR = join(dir, "data");
    process.env.QCTL_CACHE_DIR = join(dir, "cache");
    process.env.QCTL_SOCKET_PATH = "/tmp/qctl-test.sock";
    await mkdir(join(dir, "config"), { recursive: true });
    await writeFile(join(dir, "config", "config.toml"), "[tap]\nmode = \"inspect\"\n", "utf8");

    await ensureQctlLayout();

    const config = await readFile(getQctlConfigFilePath(), "utf8");
    expect(config).toContain('mode = "inspect"');
    expect(config).toContain(`url = ${JSON.stringify(getQctlSinkUrl())}`);
    expect(config.match(/\[\[sinks\]\]/g)).toHaveLength(1);
  });

  test("is idempotent when the collector sink is already present", async () => {
    const dir = await mkdtemp(join(tmpdir(), "qctl-layout-"));
    dirs.push(dir);
    process.env.QCTL_CONFIG_DIR = join(dir, "config");
    process.env.QCTL_DATA_DIR = join(dir, "data");
    process.env.QCTL_CACHE_DIR = join(dir, "cache");
    process.env.QCTL_SOCKET_PATH = "/tmp/qctl-test.sock";

    await ensureQctlLayout();
    await ensureQctlLayout();

    const config = await readFile(getQctlConfigFilePath(), "utf8");
    expect(config.match(/\[\[sinks\]\]/g)).toHaveLength(1);
  });

  test("rewrites a percent-encoded qctl collector sink instead of appending", async () => {
    const dir = await mkdtemp(join(tmpdir(), "qctl-layout-"));
    dirs.push(dir);
    process.env.QCTL_CONFIG_DIR = join(dir, "config");
    process.env.QCTL_DATA_DIR = join(dir, "data");
    process.env.QCTL_CACHE_DIR = join(dir, "cache");
    process.env.QCTL_SOCKET_PATH = "/Users/alice/Library/Application Support/qctl/collector.sock";
    await mkdir(join(dir, "config"), { recursive: true });
    await writeFile(
      join(dir, "config", "config.toml"),
      `# qctl configuration\n\n# qctl collector sink\n[[sinks]]\nurl = "unix:///Users/alice/Library/Application%20Support/qctl/collector.sock"\n`,
      "utf8",
    );

    await ensureQctlLayout();

    const config = await readFile(getQctlConfigFilePath(), "utf8");
    expect(config).toContain(`url = ${JSON.stringify(getQctlSinkUrl())}`);
    expect(config).not.toContain("Application%20Support");
    expect(config.match(/\[\[sinks\]\]/g)).toHaveLength(1);
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
