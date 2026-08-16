/**
 * Resolves `qctl start` flags into the same placement modes qcontrol uses.
 */

/** How `start` places the wrapper's collector-plus-monitor runtime. */
export type StartMode = "direct" | "foreground" | "service";

/** Parsed `qctl start` flags after mutual-exclusion checks. */
export interface StartFlags {
  mode: StartMode;
  /**
   * When true, the foreground runtime prints raw JSON events instead of
   * pretty one-line summaries. Also forwarded to a detached or service
   * `start -f` so its log stream matches.
   */
  raw: boolean;
}

/**
 * Maps `start` argv to a placement mode and printer choice.
 *
 * `-f`/`--foreground` and `--service` are exclusive, matching qcontrol.
 * `--raw` can combine with any placement.
 */
export function resolveStartMode(args: string[]): StartFlags {
  let foreground = false;
  let service = false;
  let raw = false;

  for (const arg of args) {
    if (arg === "-f" || arg === "--foreground") {
      foreground = true;
      continue;
    }

    if (arg === "--service") {
      service = true;
      continue;
    }

    if (arg === "--raw") {
      raw = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new StartUsageError(usageText());
    }

    throw new StartUsageError(`unknown start option: ${arg}\n\n${usageText()}`);
  }

  if (foreground && service) {
    throw new StartUsageError("--foreground and --service are mutually exclusive");
  }

  if (foreground) {
    return { mode: "foreground", raw };
  }

  if (service) {
    return { mode: "service", raw };
  }

  return { mode: "direct", raw };
}

/** Prints the qcontrol-shaped start surface without a clap dependency. */
export function usageText(): string {
  return `Usage:
  qctl start             Start in the background
  qctl start -f          Run in this terminal
  qctl start --service   Install as a login service and start now
  qctl start --raw       Print raw JSON events instead of summaries
  qctl status            Show whether qctl is running
  qctl stop              Stop, and remove the service if one was installed`;
}

/** Signals a user-facing start argv error that should exit 2. */
export class StartUsageError extends Error {
  readonly exitCode = 2;

  constructor(message: string) {
    super(message);
    this.name = "StartUsageError";
  }
}
