/**
 * Exercises collector event routing: entity_id joins, out-of-order queueing,
 * snapshot replacement of process state, and the Windows named-pipe bind.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { Collector } from "./collector";
import type { Forwarder, QcontrolEvent, QcontrolInstallation, QcontrolProcess } from "./forwarder";

interface ForwardedRecord {
  event: QcontrolEvent;
  installation?: QcontrolInstallation;
  process?: QcontrolProcess;
}

const agent = {
  id: "claude-cli",
  name: "Claude Code",
  vendor: "Anthropic",
  kind: "cli" as const,
};

const timestamp = "2026-06-18T20:33:02.123456789Z";

/** Collects forwarded events so routing can be asserted without printing. */
function recordingForwarder(records: ForwardedRecord[]): Forwarder {
  return {
    forward(event, installation, process) {
      records.push({ event, installation, process });
    },
  };
}

/** Writes one JSONL record and waits until the collector has accepted it. */
async function sendEvent(socketPath: string, event: unknown, collector: Collector, forwarded: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = connect(socketPath);
    socket.once("error", reject);
    socket.once("connect", () => {
      socket.end(`${JSON.stringify(event)}\n`);
    });
    socket.once("close", () => resolve());
  });

  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (collector.stats.forwarded + collector.stats.queued + collector.stats.dropped >= forwarded) {
      return;
    }

    await Bun.sleep(10);
  }

  throw new Error(`collector did not accept ${String(forwarded)} event(s)`);
}

describe("collector event routing", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  test.skipIf(process.platform === "win32")("joins capture events through entity_id and does not mint one", async () => {
    const dir = await mkdtemp(join(tmpdir(), "qctl-collector-"));
    dirs.push(dir);
    const socketPath = join(dir, "collector.sock");
    const records: ForwardedRecord[] = [];
    const collector = new Collector({
      socketPath,
      forwarders: [recordingForwarder(records)],
    });

    await collector.start();
    try {
      const installation = {
        timestamp,
        type: "installation.discovered",
        payload: {
          id: "inst-1",
          agent,
          executable_path: "/usr/local/bin/claude",
          tap: { status: "tapped" },
        },
      };
      const started = {
        timestamp,
        entity_id: "pid:30442:start:1781814782",
        type: "process.started",
        payload: {
          pid: 30442,
          installation_id: "inst-1",
          exe: "/usr/local/bin/claude",
          started_at: timestamp,
          agent,
        },
      };
      const request = {
        timestamp,
        entity_id: "pid:30442:start:1781814782",
        type: "llm.request",
        payload: {
          context: { provider: "anthropic" },
          model: "claude-sonnet-4",
        },
      };

      await sendEvent(socketPath, request, collector, 1);
      expect(collector.stats.queued).toBe(1);
      expect(records).toEqual([]);

      await sendEvent(socketPath, installation, collector, 2);
      await sendEvent(socketPath, started, collector, 3);

      expect(records).toHaveLength(3);
      expect(records[0]?.event.type).toBe("installation.discovered");
      expect(records[1]?.event.type).toBe("process.started");
      expect(records[1]?.process?.entity_id).toBe("pid:30442:start:1781814782");
      expect(records[2]?.event.type).toBe("llm.request");
      expect(records[2]?.installation?.id).toBe("inst-1");
      expect(records[2]?.process?.entity_id).toBe("pid:30442:start:1781814782");
      expect(records[2]?.event).not.toHaveProperty("run");
    } finally {
      await collector.stop();
    }
  });

  test.skipIf(process.platform === "win32")("forwards process.started without an installation_id", async () => {
    const dir = await mkdtemp(join(tmpdir(), "qctl-collector-"));
    dirs.push(dir);
    const socketPath = join(dir, "collector.sock");
    const records: ForwardedRecord[] = [];
    const collector = new Collector({
      socketPath,
      forwarders: [recordingForwarder(records)],
    });

    await collector.start();
    try {
      await sendEvent(socketPath, {
        timestamp,
        entity_id: "pid:9:start:1",
        type: "process.started",
        payload: {
          pid: 9,
          exe: "/usr/bin/python3",
          started_at: timestamp,
        },
      }, collector, 1);

      expect(records).toHaveLength(1);
      expect(records[0]?.process?.entity_id).toBe("pid:9:start:1");
      expect(records[0]?.installation).toBeUndefined();
    } finally {
      await collector.stop();
    }
  });

  test.skipIf(process.platform === "win32")("replaces process state from a snapshot", async () => {
    const dir = await mkdtemp(join(tmpdir(), "qctl-collector-"));
    dirs.push(dir);
    const socketPath = join(dir, "collector.sock");
    const records: ForwardedRecord[] = [];
    const collector = new Collector({
      socketPath,
      forwarders: [recordingForwarder(records)],
    });

    await collector.start();
    try {
      await sendEvent(socketPath, {
        timestamp,
        type: "process.snapshot",
        payload: {
          processes: [
            {
              entity_id: "pid:11:start:2",
              pid: 11,
              installation_id: "inst-2",
              exe: "/usr/local/bin/codex",
              started_at: timestamp,
              agent,
            },
          ],
        },
      }, collector, 1);

      await sendEvent(socketPath, {
        timestamp,
        entity_id: "pid:11:start:2",
        type: "process.stopped",
        payload: {
          pid: 11,
          exe: "/usr/local/bin/codex",
          started_at: timestamp,
          duration_ms: 1200,
        },
      }, collector, 2);

      expect(records.map((record) => record.event.type)).toEqual(["process.snapshot", "process.stopped"]);
      expect(records[1]?.process?.entity_id).toBe("pid:11:start:2");
    } finally {
      await collector.stop();
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
