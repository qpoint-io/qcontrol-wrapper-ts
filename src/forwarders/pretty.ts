/**
 * Prints one access-log style line per collected event: installation name,
 * optional pid, event type, then the type-specific summary. Intended for
 * watching the monitor stream in a terminal.
 */

import type {
  Forwarder,
  QcontrolEvent,
  QcontrolInstallation,
  QcontrolProcess,
} from "../core/forwarder";
import type { ScanAgent } from "../types/qcontrol-events";
import { summarizeEvent } from "./summarize";
import { truncate } from "./text";

/** Default line budget for a modern terminal; summaries are clipped to fit. */
export const DEFAULT_LINE_WIDTH = 120;

/** Configures line width and the sink used by PrettyPrinter. */
export interface PrettyPrinterOptions {
  /** Maximum characters per printed line, including the prefix. */
  lineWidth?: number;
  /** Destination for each formatted line; defaults to stdout. */
  write?: (line: string) => void;
}

/**
 * Terminal forwarder that writes one compact summary line per event instead
 * of the raw JSON payload.
 */
export class PrettyPrinter implements Forwarder {
  private readonly lineWidth: number;
  private readonly write: (line: string) => void;

  constructor(options: PrettyPrinterOptions = {}) {
    this.lineWidth = options.lineWidth ?? DEFAULT_LINE_WIDTH;
    this.write = options.write ?? ((line) => {
      console.log(line);
    });
  }

  /** Formats the event as a single line and writes it to the configured sink. */
  forward(
    event: QcontrolEvent,
    installation?: QcontrolInstallation,
    process?: QcontrolProcess,
  ): void {
    this.write(formatEventLine(event, installation, process, this.lineWidth));
  }
}

/**
 * Builds `installation [pid] event summary`, omitting the pid when the event
 * is not attached to a process. The summary is truncated so the whole line
 * stays within `lineWidth`.
 */
export function formatEventLine(
  event: QcontrolEvent,
  installation?: QcontrolInstallation,
  process?: QcontrolProcess,
  lineWidth = DEFAULT_LINE_WIDTH,
): string {
  const name = resolveInstallationName(event, installation, process);
  const pid = resolvePid(event, process);
  const prefix = formatPrefix(name, pid, event.type);
  const summary = summarizeEvent(event);

  if (!summary) {
    return prefix.length > lineWidth ? truncate(prefix, lineWidth) : prefix;
  }

  const available = lineWidth - prefix.length - 1;
  if (available <= 0) {
    return truncate(prefix, lineWidth);
  }

  return `${prefix} ${truncate(summary, available)}`;
}

/**
 * Chooses a display name for the first column: resolved installation, then
 * the event's own agent, then the process agent, then `-` like Combined Log
 * Format's empty-field placeholder.
 */
function resolveInstallationName(
  event: QcontrolEvent,
  installation?: QcontrolInstallation,
  process?: QcontrolProcess,
): string {
  return (
    agentLabel(installation?.agent) ??
    agentLabel(eventAgent(event)) ??
    agentLabel(process?.agent) ??
    "-"
  );
}

/** Returns the OS pid when the collector (or the process event itself) has one. */
function resolvePid(event: QcontrolEvent, process?: QcontrolProcess): number | undefined {
  if (process?.pid !== undefined) {
    return process.pid;
  }

  if (event.type === "process.started" || event.type === "process.stopped") {
    return event.payload.pid;
  }

  return undefined;
}

/** Renders `name [pid] event` or `name event` when no process is attached. */
function formatPrefix(name: string, pid: number | undefined, eventType: string): string {
  return pid === undefined ? `${name} ${eventType}` : `${name} [${pid}] ${eventType}`;
}

/** Prefers the human display name, then the stable agent id. */
function agentLabel(agent?: ScanAgent | null): string | undefined {
  if (!agent) {
    return undefined;
  }

  return agent.name || agent.id || undefined;
}

/**
 * Reads an agent block off installation and tap payloads so those host
 * events can name themselves before the collector has indexed them.
 */
function eventAgent(event: QcontrolEvent): ScanAgent | undefined {
  switch (event.type) {
    case "installation.discovered":
    case "installation.details":
    case "installation.tap_result":
    case "installation.tap_error":
    case "installation.tap_skipped":
      return event.payload.agent;
    default:
      return undefined;
  }
}
