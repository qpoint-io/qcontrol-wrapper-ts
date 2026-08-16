/**
 * Builds a single-line, access-log style summary for each qcontrol event
 * type. Summaries are payload-only: installation name and pid belong on the
 * pretty-printer prefix, not in this trailing text.
 */

import type { QcontrolEvent } from "../core/forwarder";
import type {
  AdapterError,
  AgentInjectionFailure,
  AgentInjectionSuccess,
  Connection,
  ConnectionClose,
  ConnectionIntakeFallback,
  ConnectionMitmFailure,
  ConnectionMitmSuccess,
  ConnectionOpen,
  ConnectionProxyError,
  ConnectionUpdate,
  CustomPluginPayload,
  Diagnostic,
  ExecExit,
  ExecSpawn,
  FileClose,
  FileInfo,
  FileOpen,
  FileRead,
  FileWrite,
  HttpExchangeClose,
  HttpRequest,
  HttpRequestRef,
  HttpResponse,
  InstallationDetailsRecord,
  InstallationRecord,
  InstallationSnapshot,
  InstallationTapError,
  InstallationTapResult,
  InstallationTapSkipped,
  LlmProviderMatched,
  LlmProviderUnmatched,
  LlmRequest,
  LlmResponse,
  Message,
  McpError,
  McpNotification,
  McpRequest,
  McpResponse,
  OAuth,
  PluginLoadFailure,
  PluginLoadSuccess,
  ProcessSnapshot,
  ProcessStarted,
  ProcessStopped,
  RateLimit,
  SessionClose,
  SessionContext,
  SseClose,
  SseEvent,
  SseOpen,
  Tool,
  ToolCall,
  ToolDecision,
  ToolResult,
  Usage,
  WebSocketClose,
  WebSocketMessage,
  WebSocketOpen,
  WebSocketTrace,
} from "../types/qcontrol-events";
import {
  basename,
  formatBytes,
  formatDuration,
  joinParts,
  quote,
  shortPath,
} from "./text";

/**
 * Returns the compact trailing text for one event so the pretty printer can
 * keep every type on a single terminal line without dumping the full payload.
 */
export function summarizeEvent(event: QcontrolEvent): string {
  switch (event.type) {
    case "process.started":
      return summarizeProcessStarted(event.payload);
    case "process.stopped":
      return summarizeProcessStopped(event.payload);
    case "process.snapshot":
      return summarizeProcessSnapshot(event.payload);
    case "mcp.request":
      return summarizeMcpRequest(event.payload);
    case "mcp.response":
      return summarizeMcpResponse(event.payload);
    case "mcp.error":
      return summarizeMcpError(event.payload);
    case "mcp.notification":
      return summarizeMcpNotification(event.payload);
    case "mcp.session_close":
      return summarizeMcpSessionClose(event.payload);
    case "mcp.diagnostic":
      return summarizeMcpDiagnostic(event.payload);
    case "mcp.oauth":
      return summarizeMcpOAuth(event.payload);
    case "file.open":
      return summarizeFileOpen(event.payload);
    case "file.read":
      return summarizeFileRead(event.payload);
    case "file.write":
      return summarizeFileWrite(event.payload);
    case "file.close":
      return summarizeFileClose(event.payload);
    case "exec.spawn":
      return summarizeExecSpawn(event.payload);
    case "exec.exit":
      return summarizeExecExit(event.payload);
    case "connection.open":
      return summarizeConnectionOpen(event.payload);
    case "connection.update":
      return summarizeConnectionUpdate(event.payload);
    case "connection.close":
      return summarizeConnectionClose(event.payload);
    case "connection.mitm_success":
      return summarizeConnectionMitmSuccess(event.payload);
    case "connection.mitm_failure":
      return summarizeConnectionMitmFailure(event.payload);
    case "connection.proxy_error":
      return summarizeConnectionProxyError(event.payload);
    case "connection.intake_fallback":
      return summarizeConnectionIntakeFallback(event.payload);
    case "http.request":
      return summarizeHttpRequest(event.payload);
    case "http.response":
      return summarizeHttpResponse(event.payload);
    case "http.exchange_close":
      return summarizeHttpExchangeClose(event.payload);
    case "sse.open":
      return summarizeSseOpen(event.payload);
    case "sse.event":
      return summarizeSseEvent(event.payload);
    case "sse.close":
      return summarizeSseClose(event.payload);
    case "websocket.open":
      return summarizeWebSocketOpen(event.payload);
    case "websocket.send":
      return summarizeWebSocketMessage("send", event.payload);
    case "websocket.recv":
      return summarizeWebSocketMessage("recv", event.payload);
    case "websocket.close":
      return summarizeWebSocketClose(event.payload);
    case "websocket.trace":
      return summarizeWebSocketTrace(event.payload);
    case "llm.request":
      return summarizeLlmRequest(event.payload);
    case "llm.response":
      return summarizeLlmResponse(event.payload);
    case "llm.usage":
      return summarizeLlmUsage(event.payload);
    case "llm.rate_limit":
      return summarizeLlmRateLimit(event.payload);
    case "llm.provider_matched":
      return summarizeLlmProviderMatched(event.payload);
    case "llm.provider_unmatched":
      return summarizeLlmProviderUnmatched(event.payload);
    case "agent.message":
      return summarizeAgentMessage(event.payload);
    case "agent.tool_call":
      return summarizeAgentToolCall(event.payload);
    case "agent.tool_decision":
      return summarizeAgentToolDecision(event.payload);
    case "agent.tool_result":
      return summarizeAgentToolResult(event.payload);
    case "run.adapter_error":
      return summarizeRunAdapterError(event.payload);
    case "run.plugin_load_success":
      return summarizeRunPluginLoadSuccess(event.payload);
    case "run.plugin_load_failure":
      return summarizeRunPluginLoadFailure(event.payload);
    case "run.agent_injection_success":
      return summarizeRunAgentInjectionSuccess(event.payload);
    case "run.agent_injection_failure":
      return summarizeRunAgentInjectionFailure(event.payload);
    case "plugin.event":
      return summarizePluginEvent(event.payload);
    case "installation.discovered":
      return summarizeInstallationDiscovered(event.payload);
    case "installation.details":
      return summarizeInstallationDetails(event.payload);
    case "installation.snapshot":
      return summarizeInstallationSnapshot(event.payload);
    case "installation.tap_result":
      return summarizeInstallationTapResult(event.payload);
    case "installation.tap_error":
      return summarizeInstallationTapError(event.payload);
    case "installation.tap_skipped":
      return summarizeInstallationTapSkipped(event.payload);
    default: {
      // Keeps the switch exhaustive: a new qcontrol event type fails typecheck.
      const _exhaustive: never = event;
      return "";
    }
  }
}

/** Summarizes a newly observed process by executable and optional extra argv. */
function summarizeProcessStarted(payload: ProcessStarted): string {
  return formatCommand(payload.exe, payload.argv);
}

/** Summarizes a vanished process by executable and observed run duration. */
function summarizeProcessStopped(payload: ProcessStopped): string {
  return joinParts(shortPath(payload.exe), formatDuration(payload.duration_ms));
}

/**
 * Summarizes a process inventory snapshot as names when the set is small,
 * otherwise as a count so the line stays one column wide.
 */
function summarizeProcessSnapshot(payload: ProcessSnapshot): string {
  const processes = payload.processes ?? [];
  if (processes.length === 0) {
    return "0 processes";
  }

  const names = processes.map((entry) => entry.agent?.name ?? basename(entry.exe));
  if (names.length <= 3) {
    return names.join(", ");
  }

  return `${names.length} processes`;
}

/** Summarizes an MCP request as server, method, and extracted target. */
function summarizeMcpRequest(payload: McpRequest): string {
  return joinParts(formatMcpServer(payload.session), payload.method, mcpTarget(payload));
}

/** Summarizes an MCP response, calling out tool-level errors separately from transport success. */
function summarizeMcpResponse(payload: McpResponse): string {
  const outcome = payload.is_error ? "error" : "ok";
  return joinParts(formatMcpServer(payload.session), payload.method, mcpTarget(payload), outcome);
}

/** Summarizes a JSON-RPC error with its code and message. */
function summarizeMcpError(payload: McpError): string {
  return joinParts(
    formatMcpServer(payload.session),
    payload.method,
    mcpTarget(payload),
    payload.error.code,
    payload.error.message,
  );
}

/** Summarizes a fire-and-forget MCP notification by source and method. */
function summarizeMcpNotification(payload: McpNotification): string {
  return joinParts(
    formatMcpServer(payload.session),
    payload.source,
    payload.method,
    payload.resource_uri,
  );
}

/** Summarizes an MCP session teardown by reason and server identity. */
function summarizeMcpSessionClose(payload: SessionClose): string {
  return joinParts(formatMcpServer(payload.session), payload.reason);
}

/** Summarizes an observer diagnostic using the category-specific fields. */
function summarizeMcpDiagnostic(payload: Diagnostic): string {
  switch (payload.category) {
    case "transport_failure":
      return joinParts("transport_failure", payload.http_status, formatMcpServer(payload.session));
    case "parse_failure":
      return joinParts("parse_failure", payload.detail);
    case "buffer_limit_exceeded":
      return joinParts("buffer_limit_exceeded", formatBytes(payload.bytes));
    case "malformed_sse_line":
      return "malformed_sse_line";
    case "duplicate_sse_field":
      return joinParts("duplicate_sse_field", payload.field);
    case "invalid_sse_utf8":
      return "invalid_sse_utf8";
    case "invalid_sse_retry":
      return "invalid_sse_retry";
    case "truncated_sse_data":
      return joinParts("truncated_sse_data", formatBytes(payload.bytes));
    case "sse_control_event":
      return joinParts("sse_control_event", payload.event_type);
    default: {
      const _exhaustive: never = payload;
      return "";
    }
  }
}

/** Summarizes an observed OAuth step with status and optional error code. */
function summarizeMcpOAuth(payload: OAuth): string {
  return joinParts(formatMcpServer(payload.session), payload.step, payload.status, payload.error);
}

/** Summarizes a file open as path plus fd on success or the negative errno. */
function summarizeFileOpen(payload: FileOpen): string {
  if (payload.result < 0) {
    return joinParts(formatFile(payload.file), `err=${payload.result}`);
  }

  return joinParts(formatFile(payload.file), `fd=${payload.file.fd}`);
}

/** Summarizes a read by path and bytes actually transferred. */
function summarizeFileRead(payload: FileRead): string {
  return summarizeFileTransfer(payload.file, payload.result);
}

/** Summarizes a write by path and bytes actually transferred. */
function summarizeFileWrite(payload: FileWrite): string {
  return summarizeFileTransfer(payload.file, payload.result);
}

/** Summarizes a file close by the path captured at open. */
function summarizeFileClose(payload: FileClose): string {
  return formatFile(payload.file);
}

/** Summarizes a spawned child as executable plus remaining argv. */
function summarizeExecSpawn(payload: ExecSpawn): string {
  return formatCommand(payload.path, payload.argv);
}

/** Summarizes a child exit as executable plus status (exit code or signal). */
function summarizeExecExit(payload: ExecExit): string {
  const status =
    payload.status.kind === "exited"
      ? `exit ${payload.status.code}`
      : `signal ${payload.status.signal}`;
  return joinParts(shortPath(payload.path), status);
}

/** Summarizes a new connection as direction, transport, and peer. */
function summarizeConnectionOpen(payload: ConnectionOpen): string {
  return joinParts(payload.connection.direction, payload.connection.transport, formatPeer(payload.connection));
}

/** Summarizes a connection metadata update by what became known and the peer. */
function summarizeConnectionUpdate(payload: ConnectionUpdate): string {
  return joinParts(payload.reason, formatPeer(payload.connection));
}

/** Summarizes a connection close by direction and peer. */
function summarizeConnectionClose(payload: ConnectionClose): string {
  return joinParts(payload.connection.direction, formatPeer(payload.connection));
}

/** Summarizes a successful MITM handshake by SNI/upstream and negotiated ALPN. */
function summarizeConnectionMitmSuccess(payload: ConnectionMitmSuccess): string {
  return joinParts(payload.sni ?? payload.upstream ?? formatPeer(payload.connection), payload.alpn);
}

/** Summarizes a failed MITM handshake by stage and operator-facing reason. */
function summarizeConnectionMitmFailure(payload: ConnectionMitmFailure): string {
  return joinParts(
    payload.stage,
    payload.sni ?? payload.upstream ?? formatPeer(payload.connection),
    payload.reason,
  );
}

/** Summarizes a non-MITM proxy failure by pipeline stage and reason. */
function summarizeConnectionProxyError(payload: ConnectionProxyError): string {
  return joinParts(payload.stage, payload.upstream ?? formatPeer(payload.connection), payload.reason);
}

/** Summarizes a degraded intake path as the attempted and actual strategies. */
function summarizeConnectionIntakeFallback(payload: ConnectionIntakeFallback): string {
  return joinParts(
    `${payload.from} -> ${payload.to}`,
    payload.upstream ?? formatPeer(payload.connection),
    payload.reason,
  );
}

/** Summarizes an HTTP request as a Combined-Log-style request line. */
function summarizeHttpRequest(payload: HttpRequest): string {
  return joinParts(payload.method, formatHttpTarget(payload), payload.exchange.version);
}

/** Summarizes an HTTP response as method, path, and status code. */
function summarizeHttpResponse(payload: HttpResponse): string {
  return joinParts(formatHttpRef(payload.request_ref), payload.status_code);
}

/** Summarizes an exchange close with the close reason and last-known status. */
function summarizeHttpExchangeClose(payload: HttpExchangeClose): string {
  return joinParts(formatHttpRef(payload.request_ref), payload.reason, payload.status_code);
}

/** Summarizes an SSE stream open by the content type that identified it. */
function summarizeSseOpen(payload: SseOpen): string {
  return payload.content_type;
}

/** Summarizes one SSE record by event name and logical data length. */
function summarizeSseEvent(payload: SseEvent): string {
  return joinParts(payload.event_name ?? "message", formatBytes(payload.data_byte_len));
}

/** Summarizes an SSE stream close with the owning HTTP close reason. */
function summarizeSseClose(payload: SseClose): string {
  return payload.reason;
}

/** Summarizes a WebSocket upgrade by negotiated subprotocol when present. */
function summarizeWebSocketOpen(payload: WebSocketOpen): string {
  return payload.subprotocol ?? "open";
}

/** Summarizes a logical WebSocket message by kind and decoded size. */
function summarizeWebSocketMessage(_direction: "send" | "recv", payload: WebSocketMessage): string {
  return joinParts(payload.kind, formatBytes(payload.byte_len));
}

/** Summarizes a WebSocket close by initiator, code, and whether the handshake completed. */
function summarizeWebSocketClose(payload: WebSocketClose): string {
  return joinParts(payload.initiator, payload.code, payload.clean ? "clean" : "unclean", payload.reason);
}

/** Summarizes a WebSocket pipeline trace as stage and outcome. */
function summarizeWebSocketTrace(payload: WebSocketTrace): string {
  return joinParts(payload.stage, payload.outcome, payload.reason ?? payload.path);
}

/** Summarizes an LLM request by model identifier. */
function summarizeLlmRequest(payload: LlmRequest): string {
  return payload.model;
}

/** Summarizes an LLM response by phase, duration, and token counts when present. */
function summarizeLlmResponse(payload: LlmResponse): string {
  return joinParts(
    payload.model,
    payload.phase,
    payload.duration_ms != null ? formatDuration(payload.duration_ms) : undefined,
    formatTokenCounts(payload),
    payload.error,
  );
}

/** Summarizes a usage snapshot by model and the reported token totals. */
function summarizeLlmUsage(payload: Usage): string {
  return joinParts(payload.model, formatTokenCounts(payload), payload.total_tokens != null ? `total=${payload.total_tokens}` : undefined);
}

/**
 * Summarizes a rate-limit snapshot by scheme, plan, and the most relevant
 * bucket so operators can see remaining quota without the full map.
 */
function summarizeLlmRateLimit(payload: RateLimit): string {
  const bucketName = payload.rate_limit_reached_type ?? firstBucketName(payload.buckets);
  const bucket = bucketName ? payload.buckets[bucketName] : undefined;
  const quota =
    bucket && bucket.remaining != null && bucket.limit != null
      ? `${bucket.remaining}/${bucket.limit}`
      : bucket?.used_percent != null
        ? `${Math.round(bucket.used_percent)}%`
        : undefined;

  return joinParts(payload.scheme, payload.plan_type, payload.rate_limit_reached_type, quota);
}

/** Summarizes a recognized provider API as family, request shape, and path. */
function summarizeLlmProviderMatched(payload: LlmProviderMatched): string {
  return joinParts(payload.provider, payload.request_kind, payload.method, payload.path);
}

/** Summarizes an unrecognized provider request by host and path. */
function summarizeLlmProviderUnmatched(payload: LlmProviderUnmatched): string {
  return joinParts(payload.method, payload.host, payload.path);
}

/** Summarizes an agent conversation message by role and a quoted prompt snippet. */
function summarizeAgentMessage(payload: Message): string {
  return joinParts(
    payload.role,
    payload.prompt ? quote(payload.prompt) : undefined,
    payload.prompt_char_length != null ? `${payload.prompt_char_length}c` : undefined,
  );
}

/** Summarizes a tool invocation by identity and the most useful argument. */
function summarizeAgentToolCall(payload: ToolCall): string {
  return joinParts(formatTool(payload.tool), toolArgumentHint(payload.arguments));
}

/** Summarizes a pre-execution tool decision as identity, outcome, and source. */
function summarizeAgentToolDecision(payload: ToolDecision): string {
  return joinParts(formatTool(payload.tool), payload.decision, `by ${payload.source}`);
}

/** Summarizes a completed tool call by identity, success, and duration. */
function summarizeAgentToolResult(payload: ToolResult): string {
  return joinParts(
    formatTool(payload.tool),
    payload.success ? "ok" : "fail",
    payload.duration_ms != null ? formatDuration(payload.duration_ms) : undefined,
  );
}

/** Summarizes a recoverable run-pipeline error by source and reason class. */
function summarizeRunAdapterError(payload: AdapterError): string {
  return joinParts(payload.source, payload.reason);
}

/** Summarizes a staged plugin that the agent can load. */
function summarizeRunPluginLoadSuccess(payload: PluginLoadSuccess): string {
  return joinParts(payload.name, shortPath(payload.path));
}

/** Summarizes a plugin that could not be staged, with the operator reason. */
function summarizeRunPluginLoadFailure(payload: PluginLoadFailure): string {
  return joinParts(payload.name, payload.reason);
}

/** Summarizes a successful injection setup by loader and launched command. */
function summarizeRunAgentInjectionSuccess(payload: AgentInjectionSuccess): string {
  return joinParts(payload.loader, payload.target);
}

/** Summarizes a failed injection setup by loader, failed step, and reason. */
function summarizeRunAgentInjectionFailure(payload: AgentInjectionFailure): string {
  return joinParts(payload.loader, payload.stage, payload.reason);
}

/** Summarizes a custom plugin event as plugin name and plugin-defined type. */
function summarizePluginEvent(payload: CustomPluginPayload): string {
  return joinParts(payload.plugin_name, payload.event);
}

/** Summarizes a discovered install by path, tap health, and version. */
function summarizeInstallationDiscovered(payload: InstallationRecord): string {
  return joinParts(shortPath(payload.executable_path), payload.tap.status, payload.version);
}

/** Summarizes installation details as version, default model, and inventory counts. */
function summarizeInstallationDetails(payload: InstallationDetailsRecord): string {
  const mcp = payload.mcp_servers?.length;
  const skills = payload.skills?.length;
  const plugins = payload.plugins?.length;
  return joinParts(
    payload.version ? `v${payload.version}` : undefined,
    payload.default_model ? `model=${payload.default_model}` : undefined,
    mcp ? `mcp=${mcp}` : undefined,
    skills ? `skills=${skills}` : undefined,
    plugins ? `plugins=${plugins}` : undefined,
    payload.warnings?.length ? `warnings=${payload.warnings.length}` : undefined,
  );
}

/**
 * Summarizes an installation snapshot as names when the set is small,
 * otherwise as a count.
 */
function summarizeInstallationSnapshot(payload: InstallationSnapshot): string {
  const installations = payload.installations ?? [];
  if (installations.length === 0) {
    return "0 installations";
  }

  const names = installations.map((record) => record.agent.name);
  if (names.length <= 3) {
    return names.join(", ");
  }

  return `${names.length} installations`;
}

/** Summarizes a tap action by outcome, target, and dry-run when previewing. */
function summarizeInstallationTapResult(payload: InstallationTapResult): string {
  return joinParts(
    payload.outcome,
    shortPath(payload.target),
    payload.dry_run ? "dry-run" : undefined,
  );
}

/** Summarizes a failed tap by target and the operator-facing error. */
function summarizeInstallationTapError(payload: InstallationTapError): string {
  return joinParts(shortPath(payload.target), payload.error);
}

/** Summarizes a skipped tap by stable reason and target when known. */
function summarizeInstallationTapSkipped(payload: InstallationTapSkipped): string {
  return joinParts(payload.reason, payload.target ? shortPath(payload.target) : undefined);
}

/** Prefers the server's advertised name, then host, so MCP lines name a peer. */
function formatMcpServer(session: SessionContext): string | undefined {
  return session.advertised_server_name ?? session.host ?? undefined;
}

/** Picks the most specific MCP target extracted from the original request. */
function mcpTarget(
  payload: Pick<McpRequest, "tool_name" | "prompt_name" | "resource_uri">,
): string | undefined {
  return payload.tool_name ?? payload.prompt_name ?? payload.resource_uri ?? undefined;
}

/** Renders a file identity as a shortened path, falling back to the fd. */
function formatFile(file: FileInfo): string {
  if (file.path) {
    return shortPath(file.path);
  }

  return `fd=${file.fd}`;
}

/** Renders a successful transfer as bytes, or the negative errno on failure. */
function summarizeFileTransfer(file: FileInfo, result: number): string {
  if (result < 0) {
    return joinParts(formatFile(file), `err=${result}`);
  }

  return joinParts(formatFile(file), formatBytes(result));
}

/**
 * Renders an executable plus remaining argv, dropping argv[0] when it is
 * just the same path so the line is not doubled.
 */
function formatCommand(path: string, argv?: string[]): string {
  const executable = shortPath(path);
  if (!argv || argv.length === 0) {
    return executable;
  }

  const rest =
    argv[0] === path || basename(argv[0] ?? "") === basename(path) ? argv.slice(1) : argv;
  if (rest.length === 0) {
    return executable;
  }

  return joinParts(executable, rest.join(" "));
}

/**
 * Picks the interesting peer for a connection: domain when known, otherwise
 * the remote endpoint. Inbound connections report the source instead.
 */
function formatPeer(connection: Connection): string {
  const endpoint = connection.direction === "inbound" ? connection.src : connection.dst;
  const host = connection.domain ?? endpoint.host;
  if (!host) {
    return endpoint.port != null ? `:${endpoint.port}` : "?";
  }

  return endpoint.port != null ? `${host}:${endpoint.port}` : host;
}

/** Builds `scheme://authority/path` when those pieces exist, else the raw target. */
function formatHttpTarget(payload: HttpRequest): string {
  const path = payload.path ?? payload.raw_target ?? "/";
  if (payload.authority) {
    const scheme = payload.scheme ? `${payload.scheme}://` : "";
    return `${scheme}${payload.authority}${path}`;
  }

  return path;
}

/** Renders the compact request reference carried on response and close events. */
function formatHttpRef(ref: HttpRequestRef): string {
  return joinParts(ref.method, ref.path ?? ref.raw_target);
}

/** Formats present token counters as `in=` / `out=` tokens for LLM lines. */
function formatTokenCounts(payload: {
  input_tokens?: number | null;
  output_tokens?: number | null;
}): string | undefined {
  const parts: string[] = [];
  if (payload.input_tokens != null) {
    parts.push(`in=${payload.input_tokens}`);
  }
  if (payload.output_tokens != null) {
    parts.push(`out=${payload.output_tokens}`);
  }

  return parts.length > 0 ? parts.join(" ") : undefined;
}

/** Returns the first bucket key so an unlabeled snapshot still shows a quota. */
function firstBucketName(buckets: RateLimit["buckets"]): string | undefined {
  return Object.keys(buckets)[0];
}

/** Renders a structured tool identity, using `server/name` for MCP tools. */
function formatTool(tool: Tool): string {
  switch (tool.kind) {
    case "builtin":
      return tool.name;
    case "mcp":
      return `${tool.server}/${tool.name}`;
    case "skill":
      return tool.name;
    case "unknown":
      return "unknown";
    default: {
      const _exhaustive: never = tool;
      return "unknown";
    }
  }
}

/**
 * Picks one high-signal argument (command, path, query, …) so a tool-call
 * line shows what was invoked without dumping the full argument object.
 */
function toolArgumentHint(args?: { [k: string]: unknown } | null): string | undefined {
  if (!args) {
    return undefined;
  }

  const keys = ["command", "cmd", "file_path", "path", "file", "query", "pattern", "url", "uri"];
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.length > 0) {
      return value.includes("/") || value.includes("\\") ? shortPath(value, 48) : value;
    }
  }

  return undefined;
}
