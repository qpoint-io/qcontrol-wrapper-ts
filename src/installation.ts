/**
 * Owns qctl installation helpers that initialize qcontrol and wire qctl's run
 * event socket sink into the user's qcontrol configuration.
 */
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { runQcontrolAsRoot } from "./qcontrol";

const QCTL_SINK_MARKER = "# qctl run-event socket sink";

/** Resolves the qcontrol configuration directory using qcontrol's XDG layout. */
function defaultQcontrolConfigDir(): string {
  if (process.env.XDG_CONFIG_HOME) {
    return join(process.env.XDG_CONFIG_HOME, "qcontrol");
  }

  return join(homedir(), ".config", "qcontrol");
}

/** Returns the qcontrol run configuration file that owns event sink settings. */
export function getQcontrolRunConfigPath(): string {
  return join(defaultQcontrolConfigDir(), "run.toml");
}

/** Returns the Unix socket path where qctl listens for qcontrol run events. */
export function getQctlSocketPath(): string {
  return join(defaultQcontrolConfigDir(), "qctl.sock");
}

/** Formats the socket path as the URL string expected by qcontrol sink config. */
function getQctlSinkUrl(): string {
  return `unix://${pathToFileURL(getQctlSocketPath()).pathname}`;
}

/** Narrows filesystem failures to Node errno errors without trusting throws. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

/** Identifies TOML table headers so sink removal stays scoped to one table. */
function isTomlTableHeader(line: string): boolean {
  return /^\s*\[.*\]\s*(?:#.*)?$/.test(line);
}

/** Identifies qcontrol sink tables without interpreting unrelated TOML content. */
function isSinkTableHeader(line: string): boolean {
  return /^\s*\[\[sinks\]\]\s*(?:#.*)?$/.test(line);
}

/** Detects the qctl socket URL inside a sink table, regardless of TOML spacing. */
function sinkBlockTargetsQctlSocket(lines: string[], sinkUrl: string): boolean {
  return lines.some((line) => line.includes(sinkUrl));
}

/**
 * Removes qctl-owned sink tables from a run.toml document while preserving every
 * unrelated table, comment, and setting in the user's qcontrol configuration.
 */
function removeQctlSinkBlock(config: string, sinkUrl: string): { config: string; removed: boolean } {
  const lines = config.split("\n");
  const retainedLines: string[] = [];
  let removed = false;

  for (let index = 0; index < lines.length;) {
    if (!isSinkTableHeader(lines[index])) {
      retainedLines.push(lines[index]);
      index += 1;
      continue;
    }

    // A sink table owns all lines until the next TOML table header.
    let nextIndex = index + 1;
    while (nextIndex < lines.length && !isTomlTableHeader(lines[nextIndex])) {
      nextIndex += 1;
    }

    const sinkBlock = lines.slice(index, nextIndex);
    if (!sinkBlockTargetsQctlSocket(sinkBlock, sinkUrl)) {
      retainedLines.push(...sinkBlock);
      index = nextIndex;
      continue;
    }

    removed = true;
    if (retainedLines.at(-1)?.trim() === QCTL_SINK_MARKER) {
      retainedLines.pop();
    }
    index = nextIndex;
  }

  return { config: retainedLines.join("\n"), removed };
}

/**
 * Adds qctl's run-event sink to run.toml exactly once while preserving any
 * existing user-managed qcontrol configuration.
 */
async function appendQctlSinkConfig(): Promise<void> {
  const runConfigPath = getQcontrolRunConfigPath();
  const sinkUrl = getQctlSinkUrl();

  let existingConfig = "";
  try {
    existingConfig = await readFile(runConfigPath, "utf8");
  } catch (error) {
    // Missing config is expected on first install; other read failures matter.
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  if (existingConfig.includes(sinkUrl)) {
    return;
  }

  await mkdir(defaultQcontrolConfigDir(), { recursive: true });

  // Keep appended TOML separated from user content without excess whitespace.
  const separator =
    existingConfig.length === 0
      ? ""
      : existingConfig.endsWith("\n")
        ? "\n"
        : "\n\n";
  await appendFile(
    runConfigPath,
    `${separator}${QCTL_SINK_MARKER}\n[[sinks]]\nurl = ${JSON.stringify(sinkUrl)}\n`,
    { mode: 0o644 },
  );
}

/** Removes qctl's run-event sink from run.toml when it is present. */
async function removeQctlSinkConfig(): Promise<void> {
  const runConfigPath = getQcontrolRunConfigPath();
  const sinkUrl = getQctlSinkUrl();

  let existingConfig: string;
  try {
    existingConfig = await readFile(runConfigPath, "utf8");
  } catch (error) {
    // Uninstall should be idempotent when qcontrol was never initialized.
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
    return;
  }

  const updated = removeQctlSinkBlock(existingConfig, sinkUrl);
  if (!updated.removed) {
    return;
  }

  await writeFile(runConfigPath, updated.config, "utf8");
}

/** Initializes qcontrol with elevated privileges, then installs qctl's sink hook. */
export async function install(): Promise<number> {
  const initExitCode = await runQcontrolAsRoot({ args: ["init"] });
  if (initExitCode !== 0) {
    return initExitCode;
  }

  await appendQctlSinkConfig();
  return 0;
}

/** Removes qctl's sink hook, then deinitializes qcontrol host integration. */
export async function uninstall(): Promise<number> {
  await removeQctlSinkConfig();
  return runQcontrolAsRoot({ args: ["deinit"] });
}
