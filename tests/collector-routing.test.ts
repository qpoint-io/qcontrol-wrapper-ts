import { mkdtemp, rm } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { describe, expect, test } from "bun:test";

import { Collector } from "../src/collector";
import type { Forwarder, QcontrolEvent, QcontrolInstallation, QcontrolProcess } from "../src/forwarder";

interface ForwardedRecord {
  event: QcontrolEvent;
  installation?: QcontrolInstallation;
  process?: QcontrolProcess;
}

/** Creates a local stream endpoint name that works on the current platform. */
async function createSocketPath(): Promise<{ path: string; cleanup: () => Promise<void> }> {
  if (process.platform === "win32") {
    return {
      path: `\\\\.\\pipe\\qctl-routing-test-${String(process.pid)}-${String(Date.now())}`,
      cleanup: async () => {},
    };
  }

  const dir = await mkdtemp(join(tmpdir(), "qctl-routing-test-"));
  return {
    path: join(dir, "collector.sock"),
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/** Sends newline-delimited qcontrol records to a collector endpoint. */
async function writeRecords(socketPath: string, records: unknown[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = connect(socketPath);
    socket.once("connect", () => {
      socket.end(`${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
    });
    socket.once("error", reject);
    socket.once("close", () => {
      resolve();
    });
  });
}

/** Waits for async socket delivery without making tests sleep their full timeout. */
async function waitForForwarded(records: ForwardedRecord[], count: number): Promise<void> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (records.length >= count) {
      return;
    }

    await sleep(10);
  }

  throw new Error(`timed out waiting for ${String(count)} forwarded records; saw ${String(records.length)}`);
}

describe("collector routing", () => {
  test("uses run.started as an explicit launch root without scan records", async () => {
    const endpoint = await createSocketPath();
    const forwarded: ForwardedRecord[] = [];
    const forwarder: Forwarder = {
      forward(event, installation, process) {
        forwarded.push({ event, installation, process });
      },
    };
    const collector = new Collector({ socketPath: endpoint.path, forwarders: [forwarder] });

    const run = {
      id: "run-1",
      run_pid: 100,
      agent_pid: 200,
      started_at: "2026-06-22T15:37:52.000000000Z",
      version: "test",
      agent_id: "codex-cli",
      installation_id: "installation-1",
    };
    const runStarted = {
      timestamp: "2026-06-22T15:37:52.100000000Z",
      severity: "info",
      run,
      type: "run.started",
      payload: {
        exe: "C:\\Users\\User\\.codex\\packages\\standalone\\bin\\codex.exe",
        cmd: "codex",
        args: ["exec", "what model are you?"],
        cwd: "C:\\Users\\User\\code\\qcontrol-wrapper-ts",
        agent: {
          id: "codex-cli",
          name: "Codex CLI",
          vendor: "OpenAI",
          kind: "cli",
          matches: [{ strategy: "executable_path", value: "codex.exe", confidence: "high" }],
        },
      },
    };
    const runEvent = {
      timestamp: "2026-06-22T15:37:53.100000000Z",
      severity: "info",
      run,
      type: "mcp.notification",
      payload: {
        session: { host: "chatgpt.com", transport: "http" },
        method: "notifications/initialized",
        source: "client",
      },
    };

    await collector.start();
    try {
      await writeRecords(endpoint.path, [runStarted, runEvent]);
      await waitForForwarded(forwarded, 2);
    } finally {
      await collector.stop();
      await endpoint.cleanup();
    }

    expect(forwarded[0]?.event.type).toBe("run.started");
    expect(forwarded[0]?.installation?.id).toBe("installation-1");
    expect(forwarded[0]?.process?.pid).toBe(200);
    expect(forwarded[0]?.process?.installation_id).toBe("installation-1");
    expect(forwarded[0]?.process?.entity_id).toBe("pid:200:start:1782142672");

    expect(forwarded[1]?.event.type).toBe("mcp.notification");
    expect(forwarded[1]?.installation?.id).toBe("installation-1");
    expect(forwarded[1]?.process?.pid).toBe(200);
    expect(collector.stats.pending).toBe(0);
  });
});
