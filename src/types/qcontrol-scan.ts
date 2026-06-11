/* eslint-disable */
/**
 * Auto-generated qcontrol event types. Do not edit.
 */

/**
 * One public event emitted by `qcontrol scan`.
 */
export type ScanEvent = {
  /**
   * RFC3339Nano event timestamp.
   */
  timestamp: Timestamp;
  /**
   * Event severity for generic display and filtering. Inventory and tap
   * result records are `info`; tap skips are `warn`; tap errors are `error`.
   *
   * @default "info"
   */
  severity?: Severity;
} & (
  | {
      type: "installation.discovered";
      payload: InstallationRecord;
    }
  | {
      type: "installation.details";
      payload: InstallationDetailsRecord;
    }
  | {
      type: "installation.tap_result";
      payload: InstallationTapResult;
    }
  | {
      type: "installation.tap_error";
      payload: InstallationTapError;
    }
  | {
      type: "installation.tap_skipped";
      payload: InstallationTapSkipped;
    }
  | {
      type: "process.started";
      payload: ProcessStarted;
    }
  | {
      type: "process.stopped";
      payload: ProcessStopped;
    }
);
export type Timestamp = string;
/**
 * Event severity, ordered `Debug < Info < Warn < Error`.
 *
 * The vocabulary mirrors `tracing::Level` so the same `--log-level` knob
 * drives both the tracing subscriber and the event emit-site filter.
 */
export type Severity = "debug" | "info" | "warn" | "error";
/**
 * Agent kind.
 */
export type AiSystemKind = "cli" | "ide" | "desktop_app" | "vscode_extension" | "other";
/**
 * Stable current-state tap status values.
 */
export type InstallationTapStatus = "tapped" | "not_tapped" | "unknown";
/**
 * Normalized qtap outcomes.
 */
export type TapOutcome = "fresh" | "no_op" | "refresh_shim" | "adopt_replaced" | "prune_and_tap" | "reclassified";
/**
 * Stable skip reasons carried by `installation.tap_skipped`.
 */
export type TapSkippedReason = "not_allowed" | "missing_on_disk" | "platform_mismatch" | "no_installation";
/**
 * How a launch or scan candidate was attributed to an agent. Shared by the
 * detector (`qagents`) and the public `run.started.payload.agent.matches`
 * output, so the granular detection reason reaches consumers unchanged.
 */
export type AgentMatchStrategy =
  | "executable_name"
  | "executable_path"
  | "bundle_path"
  | "arg_pattern"
  | "explicit_agent";
/**
 * Confidence in an agent match.
 */
export type MatchConfidence = "low" | "medium" | "high";

/**
 * One at-rest AI agent installation discovered by scan.
 *
 * This is an upsert/current-state record. If `scan --tap` changes or confirms
 * tap state, scan can emit tap action events and then re-emit
 * `installation.discovered` with updated tap state.
 */
export interface InstallationRecord {
  /**
   * Re-creatable installation identity.
   *
   * `sha256(canonical_executable_path + ":" + sha256(binary_contents))`,
   * lower-case hex. The path component is canonicalized (symlinks
   * resolved) so the id joins `run.*` and `process.*` records, which
   * observe the kernel-resolved path rather than the probed PATH entry.
   * Content-sensitive, so it changes whenever the binary changes (for
   * example on agent self-update), and never persisted — consumers
   * recompute it from the filesystem. For a tapped installation both the
   * path and the bytes are those of the original moved-aside binary (not
   * the qcontrol shim at `executable_path`), matching the events of the
   * agent the shim re-execs. Absent only when the binary could not be
   * hashed.
   */
  id?: string | null;
  /**
   * Agent identity.
   */
  agent: ScanAgent;
  /**
   * Discovered executable path.
   */
  executable_path: string;
  /**
   * Discovered app bundle or desktop app path.
   */
  app_path?: string | null;
  /**
   * Installation version when known.
   */
  version?: string | null;
  /**
   * Known config directory path when it exists.
   */
  config_path?: string | null;
  /**
   * Current tap state when scan evaluated it.
   */
  tap?: InstallationTapState | null;
}
/**
 * Agent identity attached to scan installation records by qagents.
 *
 * Scan agent objects do not carry a `match` array. Scan walks each agent
 * adapter's own installation probes, so the agent identity is known by
 * construction.
 */
export interface ScanAgent {
  /**
   * Canonical agent id.
   */
  id: string;
  /**
   * Agent display name.
   */
  name: string;
  /**
   * Vendor name.
   */
  vendor: string;
  /**
   * Agent kind.
   */
  kind: AiSystemKind;
}
/**
 * Current tap state for an installation.
 *
 * Tap state is state-only. Failures and skip reasons are reported by
 * `installation.tap_error` and `installation.tap_skipped`, not nested under
 * `installation.discovered.payload.tap`.
 */
export interface InstallationTapState {
  /**
   * Current tap status.
   */
  status: InstallationTapStatus;
  /**
   * Target path evaluated for tap state.
   */
  target?: string | null;
  /**
   * Tap mechanism token, such as `binary`.
   */
  tap_type?: string | null;
  /**
   * Shim path when tapped.
   */
  shim_path?: string | null;
  /**
   * Original target path when tapped.
   */
  original_path?: string | null;
  /**
   * Plugins persisted on the tap.
   */
  plugins?: string[];
}
/**
 * At-rest configuration details extracted from one discovered installation.
 *
 * Emitted only when scan runs with `--details`, after the corresponding
 * `installation.discovered` record, and only for installations whose agent
 * adapter supports inspection. Consumers join the two records on `id`.
 * Extraction is metadata-only: details come from reading config files on
 * disk, never from executing the discovered binary.
 */
export interface InstallationDetailsRecord {
  /**
   * Re-creatable installation identity, derived as on
   * `installation.discovered`. Absent only when the binary could not be
   * hashed.
   */
  id?: string | null;
  /**
   * Agent identity, identical to the joined `installation.discovered`
   * record's `agent` block.
   */
  agent: ScanAgent;
  /**
   * Installation version derived from on-disk evidence (never from
   * executing the binary).
   */
  version?: string | null;
  /**
   * Default model the installation is configured to use.
   */
  default_model?: string | null;
  /**
   * MCP servers registered for the installation, verbatim as found on
   * disk. May contain live credentials (env values, headers); treat scan
   * `--details` output as a secrets-bearing artifact.
   */
  mcp_servers?: McpServerDetail[];
  /**
   * Skills registered for the installation.
   */
  skills?: SkillDetail[];
  /**
   * Installed plugin identifiers.
   */
  plugins?: string[];
  /**
   * Agent-specific defaults that do not map to a shared typed field,
   * keyed as found in the agent's own config files.
   */
  settings?: {
    [k: string]: unknown;
  };
  /**
   * Human-readable notes for config sources that could not be read or
   * parsed. Presence of warnings means the sibling fields are partial.
   */
  warnings?: string[];
}
/**
 * One MCP server registration, verbatim as found in the agent's config.
 */
export interface McpServerDetail {
  /**
   * Server name as registered in the agent's config.
   */
  name: string;
  /**
   * Transport token as found in the config (for example `stdio`, `http`,
   * `sse`), when the config declares one.
   */
  transport?: string | null;
  /**
   * Launch command for stdio servers.
   */
  command?: string | null;
  /**
   * Launch arguments for stdio servers.
   */
  args?: string[];
  /**
   * Endpoint URL for remote servers.
   */
  url?: string | null;
  /**
   * Environment variables, verbatim including values.
   */
  env?: {
    [k: string]: unknown;
  };
  /**
   * HTTP headers for remote servers, verbatim including values.
   */
  headers?: {
    [k: string]: unknown;
  };
}
/**
 * One skill registered for an installation.
 */
export interface SkillDetail {
  /**
   * Skill name (directory or frontmatter name).
   */
  name: string;
  /**
   * Skill description when its definition declares one.
   */
  description?: string | null;
}
/**
 * Successful, previewed, repaired, or confirmed tap action.
 */
export interface InstallationTapResult {
  /**
   * Re-creatable installation identity, derived as on
   * `installation.discovered`: `sha256(target + ":" + sha256(binary))` over
   * the original (moved-aside) binary. Absent when the binary could not be
   * hashed.
   */
  id?: string | null;
  /**
   * Agent identity.
   */
  agent: ScanAgent;
  /**
   * Tap target path.
   */
  target: string;
  /**
   * Normalized qtap outcome.
   */
  outcome: TapOutcome;
  /**
   * Tap mechanism token.
   */
  tap_type?: string | null;
  /**
   * Shim path.
   */
  shim_path?: string | null;
  /**
   * Original target path.
   */
  original_path?: string | null;
  /**
   * Plugins used or previewed for the tap.
   */
  plugins?: string[];
  /**
   * Whether this was a non-mutating preview. `dry_run` is not an outcome:
   * dry-run previews carry the predicted outcome and set `dry_run` to `true`.
   */
  dry_run: boolean;
}
/**
 * Failed tap action.
 *
 * `installation.tap_error` does not carry a stable error-kind taxonomy in this
 * schema.
 */
export interface InstallationTapError {
  /**
   * Re-creatable installation identity, derived as on
   * `installation.discovered`. Absent when the binary could not be hashed
   * (common for tap errors where the binary is missing or unreadable).
   */
  id?: string | null;
  /**
   * Agent identity.
   */
  agent: ScanAgent;
  /**
   * Tap target path.
   */
  target: string;
  /**
   * Tap mechanism token.
   */
  tap_type?: string | null;
  /**
   * Plugins used or previewed for the tap.
   */
  plugins?: string[];
  /**
   * Whether this was a non-mutating preview.
   */
  dry_run: boolean;
  /**
   * Human-readable error text.
   */
  error: string;
}
/**
 * Intentionally skipped tap action.
 */
export interface InstallationTapSkipped {
  /**
   * Re-creatable installation identity, derived as on
   * `installation.discovered`. Absent when the binary could not be hashed —
   * notably for `missing_on_disk`, which by definition has no binary.
   */
  id?: string | null;
  /**
   * Agent identity.
   */
  agent: ScanAgent;
  /**
   * Tap target path, when one was known.
   */
  target?: string | null;
  /**
   * Stable skip reason.
   */
  reason: TapSkippedReason;
  /**
   * Whether this was part of a non-mutating preview.
   */
  dry_run: boolean;
}
/**
 * A running AI agent process observed by the `scan --processes` monitor.
 *
 * Unlike installation records, process events are detection-by-matching:
 * the monitor enumerates the host process table and classifies each entry
 * with the agent adapters, so identity carries the `matches` that
 * attributed the process to an agent (mirroring `run.started`).
 */
export interface ProcessStarted {
  /**
   * OS process id.
   */
  pid: number;
  /**
   * Content-derived installation id for the observed executable, keyed on
   * its canonical (symlink-resolved) path so it joins `run.*` and
   * `installation.*` records for the same install. Present when the
   * process binary could be hashed; omitted when hashing is unavailable.
   * See `qtap::fingerprint::installation_id`.
   */
  installation_id?: string | null;
  /**
   * Parent process id when known. Included for consumer-side correlation
   * (e.g. recognizing agents launched by `qcontrol run`); the monitor
   * itself does not filter on it.
   */
  ppid?: number | null;
  /**
   * Resolved executable path of the process.
   */
  exe: string;
  /**
   * Process command line as observed.
   */
  argv?: string[];
  /**
   * Working directory when known.
   */
  cwd?: string | null;
  /**
   * Agent identity assigned by the adapters.
   */
  agent: ScanAgent;
  /**
   * Why the process was attributed to the agent.
   */
  matches?: AiMatch[];
  /**
   * OS-reported process start time, as an RFC3339Nano timestamp.
   */
  started_at: Timestamp;
}
export interface AiMatch {
  strategy: AgentMatchStrategy;
  value: string;
  confidence: MatchConfidence;
}
/**
 * A running AI agent process that the `scan --processes` monitor observed
 * disappear from the host process table.
 *
 * Polling can only observe that the process is gone, so this event reports
 * run duration rather than an exit status.
 */
export interface ProcessStopped {
  /**
   * OS process id.
   */
  pid: number;
  /**
   * Content-derived installation id captured for the process while it was
   * observed. Omitted when hashing was unavailable.
   */
  installation_id?: string | null;
  /**
   * Resolved executable path of the process.
   */
  exe: string;
  /**
   * Agent identity assigned by the adapters.
   */
  agent: ScanAgent;
  /**
   * OS-reported process start time, as an RFC3339Nano timestamp.
   */
  started_at: Timestamp;
  /**
   * Run duration from `started_at` to when the monitor observed the
   * process gone, in milliseconds.
   */
  duration_ms: number;
}
