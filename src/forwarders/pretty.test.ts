/**
 * Exercises PrettyPrinter line formatting: prefix layout, missing context,
 * and width truncation of the summary tail.
 */
import { describe, expect, test } from "bun:test";

import type { QcontrolInstallation, QcontrolProcess } from "../core/forwarder";
import { PrettyPrinter, formatEventLine } from "./pretty";
import type { ScanAgent } from "../types/qcontrol-events";

const timestamp = "2026-06-18T20:33:02.123456789Z";
const entityId = "pid:30442:start:1781814782";

const agent: ScanAgent = {
  id: "claude-cli",
  name: "Claude Code",
  vendor: "Anthropic",
  kind: "cli",
};

const installation: QcontrolInstallation = {
  id: "inst-1",
  agent,
  executable_path: "/usr/local/bin/claude",
  version: "1.2.0",
  tap: { status: "tapped" },
};

const processRecord: QcontrolProcess = {
  entity_id: entityId,
  pid: 30442,
  installation_id: "inst-1",
  exe: "/usr/local/bin/claude",
  started_at: timestamp,
  agent,
};

/** Builds an entity-scoped event with the shared envelope fields. */
function entity<T extends { type: string; payload: unknown }>(event: T): T & { timestamp: string; entity_id: string } {
  return { timestamp, entity_id: entityId, ...event };
}

/** Builds a host-scoped inventory event with no process lifetime. */
function host<T extends { type: string; payload: unknown }>(event: T): T & { timestamp: string } {
  return { timestamp, ...event };
}

const llmRequest = entity({
  type: "llm.request" as const,
  payload: {
    context: { session_id: "sess-1", name: "claude" },
    model: "claude-sonnet-4",
  },
});

describe("formatEventLine", () => {
  test("starts with installation name, pid, event type, then summary", () => {
    const line = formatEventLine(llmRequest, installation, processRecord);
    expect(line).toBe("Claude Code [30442] llm.request claude-sonnet-4");
  });

  test("omits the pid value when the event is not attached to a process", () => {
    const event = host({
      type: "installation.discovered" as const,
      payload: installation,
    });
    const line = formatEventLine(event, installation);
    expect(line).toBe("Claude Code installation.discovered /usr/local/bin/claude tapped 1.2.0");
  });

  test("uses '-' when no installation or agent name is available", () => {
    const event = host({
      type: "process.snapshot" as const,
      payload: { processes: [] },
    });
    expect(formatEventLine(event)).toBe("- process.snapshot 0 processes");
  });

  test("falls back to the process agent when installation context is missing", () => {
    const line = formatEventLine(llmRequest, undefined, processRecord);
    expect(line.startsWith("Claude Code")).toBe(true);
    expect(line).toContain("30442");
    expect(line).toContain("llm.request");
  });

  test("truncates the summary so the line fits the requested width", () => {
    const line = formatEventLine(llmRequest, installation, processRecord, 40);
    expect(line.length).toBeLessThanOrEqual(40);
    expect(line.startsWith("Claude Code [30442] llm.request")).toBe(true);
    expect(line.endsWith("…")).toBe(true);
  });
});

describe("PrettyPrinter", () => {
  test("writes one formatted line per forwarded event", () => {
    const lines: string[] = [];
    const printer = new PrettyPrinter({
      write: (line) => {
        lines.push(line);
      },
    });

    printer.forward(llmRequest, installation, processRecord);

    expect(lines).toEqual(["Claude Code [30442] llm.request claude-sonnet-4"]);
  });
});
