/* eslint-disable */
/**
 * Auto-generated qcontrol event types. Do not edit.
 */

/**
 * One public record emitted by `qcontrol run`.
 */
export type RunRecord = (
  | RunStartedEvent
  | McpEvent
  | IoEvent
  | LlmEvent
  | AgentEvent
  | RunDiagnosticEvent
  | CustomPluginEvent
) & {
  /**
   * RFC3339Nano event timestamp.
   */
  timestamp: Timestamp;
  /**
   * Event severity for generic display and filtering.
   *
   * @default "info"
   */
  severity?: Severity;
  /**
   * Compact context for the owning `qcontrol run` invocation.
   */
  run: RunContext;
};
/**
 * Run lifecycle event produced by `qcontrol run` itself.
 */
export type RunStartedEvent = {
  type: "run.started";
  payload: RunStarted;
};
/**
 * Agent kind.
 */
export type AiSystemKind = "cli" | "ide" | "desktop_app" | "vscode_extension" | "other";
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
 * One MCP observer event. Tagged on the wire `type` field; each variant's
 * payload is the direct `payload` object.
 *
 * `qcontrol run` wraps MCP events in the public run output shape.
 */
export type McpEvent =
  | {
      type: "mcp.request";
      payload: McpRequest;
    }
  | {
      type: "mcp.response";
      payload: McpResponse;
    }
  | {
      type: "mcp.error";
      payload: McpError;
    }
  | {
      type: "mcp.notification";
      payload: McpNotification;
    }
  | {
      type: "mcp.session_close";
      payload: SessionClose;
    }
  | {
      type: "mcp.diagnostic";
      payload: Diagnostic;
    }
  | {
      type: "mcp.oauth";
      payload: OAuth;
    };
/**
 * MCP transport framing.
 */
export type Transport = "http" | "stdio";
/**
 * Any JSON value, passed through verbatim from the observed traffic.
 */
export type RawJson = unknown;
/**
 * Which side of the JSON-RPC exchange sent a notification.
 */
export type Source = "client" | "server";
export type SessionCloseReason = "transport_close" | "delete" | "timeout";
/**
 * A non-fatal problem the observer hit while parsing or correlating traffic.
 */
export type Diagnostic = DiagnosticCategory & {
  session: SessionContext;
  /**
   * Which side of the HTTP exchange.
   */
  phase?: Phase | null;
  /**
   * JSON-RPC id, when extractable from a partial parse.
   */
  request_id?: string | null;
  /**
   * Body content for categories where it aids debugging. Best-effort
   * UTF-8; non-UTF-8 bytes are replaced.
   */
  body?: string | null;
};
export type DiagnosticCategory =
  | {
      http_status: number;
      category: "transport_failure";
    }
  | {
      detail: string;
      category: "parse_failure";
    }
  | {
      bytes: number;
      category: "buffer_limit_exceeded";
    }
  | {
      category: "malformed_sse_line";
    }
  | {
      field: string;
      category: "duplicate_sse_field";
    }
  | {
      category: "invalid_sse_utf8";
    }
  | {
      category: "invalid_sse_retry";
    }
  | {
      bytes: number;
      category: "truncated_sse_data";
    }
  | {
      event_type: string;
      category: "sse_control_event";
    };
/**
 * Which side of the HTTP exchange a diagnostic relates to.
 */
export type Phase = "request" | "response";
/**
 * Step in the observed OAuth authorization flow.
 */
export type OAuthStep =
  | "challenge"
  | "resource_discovery"
  | "server_discovery"
  | "registration"
  | "token_exchange"
  | "token_refresh";
/**
 * One IO event.
 *
 * The variant determines the wire `type` value and the concrete payload type.
 * Each variant has its own payload struct so future event-specific fields can
 * be added without widening unrelated payloads.
 */
export type IoEvent =
  | {
      type: "file.open";
      payload: FileOpen;
    }
  | {
      type: "file.read";
      payload: FileRead;
    }
  | {
      type: "file.write";
      payload: FileWrite;
    }
  | {
      type: "file.close";
      payload: FileClose;
    }
  | {
      type: "exec.spawn";
      payload: ExecSpawn;
    }
  | {
      type: "exec.exit";
      payload: ExecExit;
    }
  | {
      type: "connection.open";
      payload: ConnectionOpen;
    }
  | {
      type: "connection.update";
      payload: ConnectionUpdate;
    }
  | {
      type: "connection.close";
      payload: ConnectionClose;
    }
  | {
      type: "connection.mitm_success";
      payload: ConnectionMitmSuccess;
    }
  | {
      type: "connection.mitm_failure";
      payload: ConnectionMitmFailure;
    }
  | {
      type: "connection.proxy_error";
      payload: ConnectionProxyError;
    }
  | {
      type: "connection.intake_fallback";
      payload: ConnectionIntakeFallback;
    }
  | {
      type: "http.request";
      payload: HttpRequest;
    }
  | {
      type: "http.response";
      payload: HttpResponse;
    }
  | {
      type: "http.exchange_close";
      payload: HttpExchangeClose;
    }
  | {
      type: "sse.open";
      payload: SseOpen;
    }
  | {
      type: "sse.event";
      payload: SseEvent;
    }
  | {
      type: "sse.close";
      payload: SseClose;
    }
  | {
      type: "websocket.open";
      payload: WebSocketOpen;
    }
  | {
      type: "websocket.send";
      payload: WebSocketMessage;
    }
  | {
      type: "websocket.recv";
      payload: WebSocketMessage;
    }
  | {
      type: "websocket.close";
      payload: WebSocketClose;
    }
  | {
      type: "websocket.trace";
      payload: WebSocketTrace;
    };
/**
 * Structural process termination status for an `exec.exit` event.
 */
export type ExitStatus =
  | {
      code: number;
      kind: "exited";
    }
  | {
      signal: number;
      kind: "signaled";
    };
/**
 * @example "tcp", "unknown"
 */
export type IoTransport = string;
/**
 * Direction from the wrapped process' point of view.
 */
export type Direction = "outbound" | "inbound";
/**
 * @example "http/1", "http/2", "unknown"
 */
export type IoProtocol = string;
/**
 * @example "tls", "domain", "protocol", "unknown"
 */
export type ConnectionUpdateReason = string;
/**
 * @example "http/1.0", "http/1.1", "http/2", "unknown"
 */
export type HttpVersion = string;
/**
 * @example "complete", "aborted", "parse_error", "connection_closed", "upgraded", "unknown"
 */
export type HttpCloseReason = string;
/**
 * @example "text", "binary", "unknown"
 */
export type WebSocketMessageKind = string;
/**
 * @example "client", "server", "unknown"
 */
export type WebSocketCloseInitiator = string;
/**
 * One normalized LLM provider telemetry event.
 *
 * The variant determines the wire `type` value and the concrete type of the
 * adjacent `payload` object.
 */
export type LlmEvent =
  | {
      type: "llm.request";
      payload: LlmRequest;
    }
  | {
      type: "llm.response";
      payload: LlmResponse;
    }
  | {
      type: "llm.usage";
      payload: Usage;
    }
  | {
      type: "llm.rate_limit";
      payload: RateLimit;
    }
  | {
      type: "llm.provider_matched";
      payload: LlmProviderMatched;
    }
  | {
      type: "llm.provider_unmatched";
      payload: LlmProviderUnmatched;
    };
/**
 * Lifecycle state represented by an LLM response event.
 */
export type ResponsePhase = "completed" | "error" | "transport_error";
/**
 * One normalized agent telemetry event.
 *
 * `agent.*` events describe user-visible agent activity normalized by
 * qcontrol; the underlying model API exchanges are reported separately as
 * `llm.*` events.
 *
 * The variant determines the wire `type` value and the concrete type of the
 * adjacent `payload` object.
 */
export type AgentEvent =
  | {
      type: "agent.message";
      payload: Message;
    }
  | {
      type: "agent.tool_call";
      payload: ToolCall;
    }
  | {
      type: "agent.tool_decision";
      payload: ToolDecision;
    }
  | {
      type: "agent.tool_result";
      payload: ToolResult;
    };
/**
 * Role of a conversation message sender.
 */
export type Role = "user" | "assistant" | "system" | "tool";
/**
 * Structured identity of a tool referenced by a tool-lifecycle event.
 *
 * The `kind` discriminator separates host-builtin tools (e.g. `Bash`,
 * `exec_command`), MCP-routed tools (server + local name), and skills.
 */
export type Tool =
  | {
      /**
       * Tool identifier as reported by the source agent.
       */
      name: string;
      kind: "builtin";
    }
  | {
      /**
       * MCP server identifier.
       */
      server: string;
      /**
       * Tool name local to the MCP server (without any `mcp__<server>__` prefix).
       */
      name: string;
      kind: "mcp";
    }
  | {
      /**
       * Skill slug. May be plain (`grill-me`) or plugin-namespaced
       * (`frontend-design:frontend-design`).
       */
      name: string;
      /**
       * Best-effort path to the skill's `SKILL.md` on disk.
       */
      path?: string | null;
      kind: "skill";
    }
  | {
      kind: "unknown";
    };
/**
 * Approval outcome for a tool invocation.
 */
export type ToolDecisionOutcome = "approved" | "denied";
/**
 * Presentation-oriented output returned by a completed tool invocation.
 */
export type ToolResultOutputBlock = {
  text: string;
  type: "text";
};
/**
 * Event payloads in the `run.*` family.
 *
 * Public run-output events about qcontrol setup and event-pipeline behavior.
 * They are not accepted over the plugin socket; the `run` field identifies the
 * owning run. Debug-severity diagnostics are emitted only when the run event
 * severity filter allows debug output. Error and warn diagnostics are intended
 * to remain visible at the default level.
 */
export type RunDiagnosticEvent =
  | {
      type: "run.adapter_error";
      payload: AdapterError;
    }
  | {
      type: "run.plugin_load_success";
      payload: PluginLoadSuccess;
    }
  | {
      type: "run.plugin_load_failure";
      payload: PluginLoadFailure;
    }
  | {
      type: "run.agent_injection_success";
      payload: AgentInjectionSuccess;
    }
  | {
      type: "run.agent_injection_failure";
      payload: AgentInjectionFailure;
    };
export type Timestamp = string;
/**
 * Event severity, ordered `Debug < Info < Warn < Error`.
 *
 * The vocabulary mirrors `tracing::Level` so the same `--log-level` knob
 * drives both the tracing subscriber and the event emit-site filter.
 */
export type Severity = "debug" | "info" | "warn" | "error";

/**
 * Flattened launch metadata for the root child process.
 *
 * Emitted after the wrapped root child starts successfully; the launch anchor
 * for the run. Does not contain a process id; the spawned agent pid lives in
 * `run.agent_pid`.
 */
export interface RunStarted {
  /**
   * Resolved root command executable path.
   */
  exe: string;
  /**
   * Original argv0 token used to launch the root child.
   */
  cmd: string;
  /**
   * Original argv1-and-later arguments used to launch the root child.
   *
   * @default []
   */
  args?: string[];
  /**
   * Working directory used for the root child.
   */
  cwd: string;
  /**
   * Agent attribution for the launched command.
   */
  agent?: RunAgentAttribution | null;
}
/**
 * Agent attribution for a launched root child.
 */
export interface RunAgentAttribution {
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
  /**
   * Launch attribution matches.
   */
  matches: RunAgentMatch[];
}
/**
 * One reason the launched command was attributed to an agent.
 */
export interface RunAgentMatch {
  /**
   * Match strategy.
   */
  strategy: AgentMatchStrategy;
  /**
   * Matched value. For `explicit_agent`, this is the canonical agent id.
   */
  value: string;
  /**
   * Match confidence.
   */
  confidence: MatchConfidence;
}
/**
 * A JSON-RPC request.
 */
export interface McpRequest {
  session: SessionContext;
  /**
   * JSON-RPC method name.
   */
  method: string;
  /**
   * JSON-RPC id, always stringified.
   */
  request_id: string;
  /**
   * Extracted from `tools/call` params.
   */
  tool_name?: string | null;
  /**
   * Extracted from `prompts/get` params.
   */
  prompt_name?: string | null;
  /**
   * Extracted from `resources/read`, `resources/subscribe`, and
   * `resources/unsubscribe` params.
   */
  resource_uri?: string | null;
  /**
   * Raw JSON-RPC `params` passthrough.
   */
  params?: RawJson | null;
}
/**
 * Shared MCP session context attached to every variant.
 *
 * Serialized as a nested `session` object on every MCP payload. The inner
 * `mcp` object therefore looks like
 * `{"session":{...},"method":"...","request_id":"...",...}`.
 *
 * Several MCP variants also carry `tool_name`, `prompt_name`, and
 * `resource_uri` when qcontrol can extract or correlate them from the
 * original request.
 */
export interface SessionContext {
  /**
   * `MCP-Session-Id` header value. Absent while pending (e.g. during
   * `initialize`).
   */
  session_id?: string | null;
  /**
   * Server hostname extracted from request headers.
   */
  host?: string | null;
  /**
   * MCP transport framing.
   */
  transport: Transport;
  /**
   * Negotiated MCP protocol version. Absent until `initialize` completes.
   */
  protocol_version?: string | null;
  /**
   * Server name the upstream advertised in its `initialize` response
   * (`serverInfo.name`, e.g. `"Pulse Remote API"`). Absent until
   * `initialize` completes.
   *
   * "Advertised" makes the provenance unambiguous: the server reported
   * this name itself. It is distinct from the user's config alias carried
   * on `agent.tool_call` (`Tool::Mcp.server`, derived from the
   * `mcp__<alias>__<tool>` naming convention) and the two may differ.
   */
  advertised_server_name?: string | null;
}
/**
 * A successful JSON-RPC response. Correlated with the originating request
 * when possible.
 */
export interface McpResponse {
  session: SessionContext;
  /**
   * Method name copied from the correlated request. Null when uncorrelated.
   */
  method?: string | null;
  /**
   * JSON-RPC id, always stringified.
   */
  request_id: string;
  /**
   * Copied from the correlated `tools/call` request.
   */
  tool_name?: string | null;
  /**
   * Copied from the correlated `prompts/get` request.
   */
  prompt_name?: string | null;
  /**
   * Copied from the correlated `resources/*` request.
   */
  resource_uri?: string | null;
  /**
   * MCP `result.isError` flag for `tools/call` responses.
   *
   * Reports the tool-execution outcome embedded in the JSON-RPC `result`
   * object (the tool itself failed but the JSON-RPC call succeeded).
   * Distinct from a JSON-RPC transport/protocol error, which is delivered
   * as a separate [`McpError`] variant. `None` for non-`tools/call`
   * methods or when the wire payload omitted the field.
   */
  is_error?: boolean | null;
  /**
   * Raw JSON-RPC `result` passthrough.
   */
  result?: RawJson | null;
}
/**
 * A JSON-RPC error response. Correlated with the originating request when
 * possible.
 */
export interface McpError {
  session: SessionContext;
  /**
   * Method name copied from the correlated request. Null when uncorrelated.
   */
  method?: string | null;
  /**
   * JSON-RPC id, always stringified. Null when the error has no id.
   */
  request_id?: string | null;
  /**
   * Copied from the correlated `tools/call` request.
   */
  tool_name?: string | null;
  /**
   * Copied from the correlated `prompts/get` request.
   */
  prompt_name?: string | null;
  /**
   * Copied from the correlated `resources/*` request.
   */
  resource_uri?: string | null;
  /**
   * JSON-RPC error object passthrough.
   */
  error: JsonRpcError;
}
/**
 * JSON-RPC error object: `{code, message, data?}`.
 */
export interface JsonRpcError {
  /**
   * JSON-RPC error code.
   */
  code: number;
  /**
   * JSON-RPC error message.
   */
  message: string;
  /**
   * Additional error data.
   */
  data?: RawJson | null;
}
/**
 * A JSON-RPC notification. Fire-and-forget — no `request_id`.
 */
export interface McpNotification {
  session: SessionContext;
  /**
   * JSON-RPC method name.
   */
  method: string;
  /**
   * Who sent this notification.
   */
  source: Source;
  /**
   * Extracted from `notifications/resources/updated` params.
   */
  resource_uri?: string | null;
  /**
   * Raw JSON-RPC `params` passthrough.
   */
  params?: RawJson | null;
}
/**
 * A session ended.
 */
export interface SessionClose {
  session: SessionContext;
  /**
   * Why the session ended.
   */
  reason: SessionCloseReason;
}
/**
 * OAuth authorization flow event observed around MCP HTTP exchanges.
 */
export interface OAuth {
  session: SessionContext;
  /**
   * OAuth flow step observed.
   */
  step: OAuthStep;
  /**
   * HTTP status code observed.
   */
  status: number;
  /**
   * OAuth error code, when failed.
   */
  error?: string | null;
  /**
   * OAuth error description.
   */
  error_description?: string | null;
  /**
   * Resource metadata URL.
   */
  resource_metadata_url?: string | null;
  /**
   * OAuth scope string.
   */
  scope?: string | null;
  /**
   * Authorization servers advertised by discovery.
   */
  authorization_servers?: string[] | null;
  /**
   * OAuth issuer.
   */
  issuer?: string | null;
  /**
   * OAuth client id.
   */
  client_id?: string | null;
}
/**
 * `file.open` payload.
 */
export interface FileOpen {
  /**
   * Shared file identity.
   */
  file: FileInfo;
  /**
   * Raw `open()` flags.
   */
  flags: number;
  /**
   * Raw `open()` mode.
   */
  mode: number;
  /**
   * Raw `open()` return value: fd on success, negative on failure.
   */
  result: number;
}
/**
 * File identity shared across all file events.
 *
 * The plugin assigns `id` only after a successful open has created a tracked
 * session. Subsequent read/write/close events always carry the same identity
 * snapshot that was captured at open time.
 *
 * Public payloads carry metadata only; raw file bytes are not included.
 */
export interface FileInfo {
  /**
   * Plugin-assigned file session id. Present after a successful tracked open.
   */
  id?: number | null;
  /**
   * File descriptor.
   */
  fd: number;
  /**
   * Path observed at open time; not re-resolved after renames or moves.
   */
  path: string;
}
/**
 * `file.read` payload.
 */
export interface FileRead {
  file: FileInfo;
  /**
   * Bytes requested for the read.
   */
  count: number;
  /**
   * Raw `read()` return value.
   */
  result: number;
}
/**
 * `file.write` payload.
 */
export interface FileWrite {
  file: FileInfo;
  /**
   * Bytes requested for the write.
   */
  count: number;
  /**
   * Raw `write()` return value.
   */
  result: number;
}
/**
 * `file.close` payload.
 */
export interface FileClose {
  file: FileInfo;
  /**
   * Raw `close()` return value.
   */
  result: number;
}
/**
 * `exec.spawn` payload.
 */
export interface ExecSpawn {
  /**
   * Spawn id; matches the `id` on the corresponding `exec.exit`.
   */
  id: number;
  /**
   * Executable path passed to `execve`.
   */
  path: string;
  /**
   * Argument vector, including `argv[0]`.
   */
  argv: string[];
  /**
   * Working directory when the runtime observed one.
   */
  cwd?: string | null;
}
/**
 * `exec.exit` payload.
 */
export interface ExecExit {
  /**
   * Spawn id from the matching `exec.spawn`.
   */
  id: number;
  /**
   * Executable path.
   */
  path: string;
  /**
   * OS pid of the child.
   */
  pid: number;
  status: ExitStatus;
}
/**
 * `connection.open` payload.
 *
 * Emitted once when a new connection is observed.
 */
export interface ConnectionOpen {
  /**
   * Connection snapshot at open time.
   */
  connection: Connection;
}
/**
 * Connection metadata shared across `connection.open`, `.update`, and `.close`.
 *
 * `connection.*` events describe TCP-like connections observed by the
 * in-process proxy.
 */
export interface Connection {
  /**
   * Plugin-assigned connection id, assigned at open. Stable across updates
   * and close.
   */
  id: number;
  /**
   * In-process proxy fd, not the wrapped program's fd.
   */
  fd: number;
  /**
   * Transport family.
   */
  transport: IoTransport;
  /**
   * Direction from the wrapped process's point of view: `outbound` or
   * `inbound`.
   */
  direction: Direction;
  /**
   * Local endpoint.
   */
  src: Endpoint;
  /**
   * Peer endpoint.
   */
  dst: Endpoint;
  /**
   * Resolved domain, once known.
   */
  domain?: string | null;
  /**
   * Application-layer protocol, once detected.
   */
  protocol?: IoProtocol | null;
  /**
   * TLS metadata.
   */
  tls: ConnectionTls;
}
/**
 * Host/port pair. Either field may be null when not observed.
 */
export interface Endpoint {
  /**
   * IP address or hostname.
   */
  host?: string | null;
  /**
   * Port number.
   */
  port?: number | null;
}
/**
 * TLS session metadata captured for a connection.
 */
export interface ConnectionTls {
  /**
   * Whether TLS is enabled on the connection.
   */
  enabled: boolean;
  /**
   * TLS version, once known.
   */
  version?: string | null;
  /**
   * Negotiated cipher, once known.
   */
  cipher?: string | null;
}
/**
 * `connection.update` payload.
 *
 * Emitted when previously unknown connection metadata becomes known, such as
 * TLS state, domain, or protocol.
 */
export interface ConnectionUpdate {
  /**
   * Which metadata became known.
   */
  reason: ConnectionUpdateReason;
  /**
   * Full snapshot at the time of the change.
   */
  connection: Connection;
}
/**
 * `connection.close` payload.
 */
export interface ConnectionClose {
  /**
   * Final connection snapshot.
   */
  connection: Connection;
  /**
   * Raw `close()` syscall return.
   */
  result: number;
}
/**
 * `connection.mitm_success` payload.
 *
 * Fires after qproxy completes both legs of a TLS MITM handshake — the
 * downstream session accepted the proxy's cert and the upstream session
 * negotiated cleanly. Debug severity, since every intercepted handshake
 * produces one (high cardinality is acceptable because debug is opt-in).
 */
export interface ConnectionMitmSuccess {
  connection: Connection;
  /**
   * SNI value the client requested, when present.
   */
  sni?: string | null;
  /**
   * Authority the proxy bridged the handshake to (`host:port`).
   */
  upstream?: string | null;
  /**
   * Negotiated ALPN protocol on the upstream leg, when one was selected.
   */
  alpn?: string | null;
}
/**
 * `connection.mitm_failure` payload.
 *
 * Fires when qproxy could not complete a MITM handshake. Error severity,
 * always surfaced (operators who run a default `--log-level=info` should
 * still see failures because they explain missing downstream telemetry).
 */
export interface ConnectionMitmFailure {
  connection: Connection;
  /**
   * SNI value the client requested, when present.
   */
  sni?: string | null;
  /**
   * Authority the proxy was bridging to (`host:port`).
   */
  upstream?: string | null;
  /**
   * Short identifier for which leg failed (`upstream_tls`,
   * `downstream_tls`, `alpn_mismatch`, ...).
   */
  stage: string;
  /**
   * Human-readable failure reason. The contents are not stable — they
   * surface root-cause detail for an operator and should not be matched
   * programmatically.
   */
  reason: string;
}
/**
 * `connection.proxy_error` payload.
 *
 * Fires when qproxy hits a non-MITM failure during connection handling —
 * upstream connect failure, runtime session open failure, listener accept
 * failure. Error severity, always surfaced. `stage` identifies which
 * pipeline step failed so operators can root-cause without parsing the
 * reason string.
 */
export interface ConnectionProxyError {
  connection: Connection;
  /**
   * Upstream authority (`host:port`) the operation targeted, if known.
   */
  upstream?: string | null;
  /**
   * Short identifier for the failed step (`upstream_connect`,
   * `runtime_session_open`, `listener_accept`, ...).
   */
  stage: string;
  /**
   * Human-readable failure reason. Not stable; for operator diagnosis
   * only.
   */
  reason: string;
}
/**
 * `connection.intake_fallback` payload.
 *
 * Fires when qproxy could not run its preferred intake strategy and fell
 * back to a degraded one — most commonly when TLS MITM fails and the
 * proxy bridges the connection raw instead. Warn severity, always
 * surfaced because the resulting connection is not observable.
 */
export interface ConnectionIntakeFallback {
  connection: Connection;
  /**
   * Upstream authority (`host:port`) the operation targeted.
   */
  upstream?: string | null;
  /**
   * The intake strategy that was attempted (e.g. `tls_mitm`).
   */
  from: string;
  /**
   * The strategy actually used (e.g. `raw_connect`).
   */
  to: string;
  /**
   * Why the fallback was taken.
   */
  reason: string;
}
/**
 * `http.request` payload.
 */
export interface HttpRequest {
  /**
   * Shared HTTP exchange identity.
   */
  exchange: HttpExchange;
  /**
   * Connection-level context.
   */
  connection: HttpConnection;
  /**
   * HTTP method.
   */
  method: string;
  /**
   * Request scheme when available.
   */
  scheme?: string | null;
  /**
   * Host and optional port the request targeted.
   */
  authority?: string | null;
  /**
   * Decoded request path.
   */
  path?: string | null;
  /**
   * Original request target as seen on the wire.
   */
  raw_target?: string | null;
  /**
   * Header lines with `name` and `value`.
   */
  headers: HeaderField[];
}
/**
 * HTTP exchange identity shared across request, response, and close events.
 *
 * `http.*` events report request/response exchanges parsed from HTTP traffic
 * on observed connections.
 */
export interface HttpExchange {
  /**
   * Plugin-assigned exchange id for the request+response lifecycle. Matches
   * across request, response, and close events.
   */
  id: number;
  /**
   * Foreign key to a tracked `Connection`, when correlation is possible.
   */
  connection_id?: number | null;
  /**
   * Proxy-side file descriptor.
   */
  fd: number;
  /**
   * HTTP/2 stream id; null on HTTP/1.x.
   */
  stream_id?: number | null;
  /**
   * HTTP wire version.
   */
  version: HttpVersion;
}
/**
 * Connection-level context attached to an `http.request` event: optional
 * `domain`, optional `protocol`, and `tls` metadata.
 */
export interface HttpConnection {
  /**
   * Resolved domain, when known.
   */
  domain?: string | null;
  /**
   * Application-layer protocol, when detected.
   */
  protocol?: IoProtocol | null;
  /**
   * TLS metadata.
   */
  tls: HttpTls;
}
/**
 * TLS metadata as seen at the HTTP layer.
 */
export interface HttpTls {
  /**
   * Whether TLS is enabled.
   */
  enabled: boolean;
  /**
   * TLS version, when known.
   */
  version?: string | null;
}
/**
 * One HTTP header line as `(name, value)`.
 */
export interface HeaderField {
  /**
   * Header name.
   */
  name: string;
  /**
   * Header value.
   */
  value: string;
}
/**
 * `http.response` payload.
 */
export interface HttpResponse {
  exchange: HttpExchange;
  /**
   * Compact request reference.
   */
  request_ref: HttpRequestRef;
  /**
   * HTTP status code.
   */
  status_code: number;
  /**
   * Header lines with `name` and `value`.
   */
  headers: HeaderField[];
}
/**
 * Compact reference to the originating request.
 */
export interface HttpRequestRef {
  /**
   * HTTP method.
   */
  method: string;
  /**
   * Decoded request path.
   */
  path?: string | null;
  /**
   * Original request target as seen on the wire.
   */
  raw_target?: string | null;
}
/**
 * `http.exchange_close` payload.
 *
 * Emitted once per exchange, after the request and any response have been
 * observed or after the connection ended without a response.
 */
export interface HttpExchangeClose {
  exchange: HttpExchange;
  /**
   * Compact request reference.
   */
  request_ref: HttpRequestRef;
  /**
   * Why the exchange ended, distinct from any HTTP/1.x reason phrase.
   */
  reason: HttpCloseReason;
  /**
   * Whether the request body was fully observed.
   */
  request_done: boolean;
  /**
   * Whether the response body was fully observed.
   */
  response_done: boolean;
  /**
   * Last-known response status code, populated even when no response event fired.
   */
  status_code?: number | null;
}
/**
 * `sse.open` payload.
 */
export interface SseOpen {
  stream: SseStream;
  /**
   * Response content type that identified the stream as SSE.
   */
  content_type: string;
}
/**
 * SSE stream identity shared across open, event, and close events.
 *
 * `sse.*` events report parsed Server-Sent Events inside an HTTP
 * `text/event-stream` response. The HTTP exchange id carried the
 * `text/event-stream` response body. This keeps parsed SSE records joinable
 * with their `http.*.exchange.id` metadata without embedding event data bytes.
 */
export interface SseStream {
  /**
   * HTTP exchange id that carried the response body. Joins to
   * `http.*.exchange.id`.
   */
  http_exchange_id: number;
  /**
   * Foreign key to a tracked `Connection`, when correlation is possible.
   */
  connection_id?: number | null;
  /**
   * Proxy-side file descriptor.
   */
  fd: number;
  /**
   * HTTP version of the owning exchange.
   */
  version: HttpVersion;
}
/**
 * `sse.event` payload.
 */
export interface SseEvent {
  stream: SseStream;
  /**
   * Parsed `event:` field, absent when the stream used the default event type.
   */
  event_name?: string | null;
  /**
   * Parsed `id:` field, absent when none was observed.
   */
  id?: string | null;
  /**
   * Parsed `retry:` value in milliseconds.
   */
  retry_ms?: number | null;
  /**
   * Parsed logical event data length after multiline `data:` joining. The
   * data bytes are not included.
   */
  data_byte_len: number;
}
/**
 * `sse.close` payload.
 */
export interface SseClose {
  stream: SseStream;
  /**
   * Why the owning HTTP response stream ended. Uses the same values as
   * `http.exchange_close.reason`.
   */
  reason: HttpCloseReason;
}
/**
 * `websocket.open` payload.
 */
export interface WebSocketOpen {
  stream: WebSocketStream;
  /**
   * Negotiated subprotocol, when present.
   */
  subprotocol?: string | null;
  /**
   * Negotiated extensions header, when present.
   */
  extensions?: string | null;
}
/**
 * WebSocket stream identity shared across open, message, and close events.
 *
 * `websocket.*` events report logical post-upgrade WebSocket streams created
 * by HTTP upgrade handshakes. Stable lifecycle events carry this shared
 * `stream` object; `websocket.trace` may carry only connection metadata before
 * the stream is known. The HTTP exchange id created the upgrade. This keeps
 * WebSocket records joinable with the HTTP handshake events without exposing
 * post-upgrade payload bytes.
 */
export interface WebSocketStream {
  /**
   * HTTP exchange id that created the upgraded stream. Joins to
   * `http.*.exchange.id`.
   */
  http_exchange_id: number;
  /**
   * Foreign key to a tracked `Connection`, when correlation is possible.
   */
  connection_id?: number | null;
  /**
   * Proxy-side file descriptor.
   */
  fd: number;
  /**
   * HTTP version of the upgrade exchange.
   */
  version: HttpVersion;
}
/**
 * `websocket.send` and `websocket.recv` payload.
 *
 * `websocket.send` is a client-to-server logical message; `websocket.recv` is
 * a server-to-client logical message with the same shape.
 */
export interface WebSocketMessage {
  stream: WebSocketStream;
  /**
   * Logical message kind.
   */
  kind: WebSocketMessageKind;
  /**
   * Logical message payload length after frame reassembly and decoding. The
   * bytes are not included.
   */
  byte_len: number;
}
/**
 * `websocket.close` payload.
 */
export interface WebSocketClose {
  stream: WebSocketStream;
  /**
   * Side that sent the first observed close frame, or unknown on transport teardown.
   */
  initiator: WebSocketCloseInitiator;
  /**
   * Close status code, absent when none was observed.
   */
  code?: number | null;
  /**
   * UTF-8 close reason, when present.
   */
  reason?: string | null;
  /**
   * Whether both sides completed the close handshake.
   */
  clean: boolean;
}
/**
 * Debug-only trace point for qproxy's WebSocket upgrade and frame pipeline.
 *
 * The payload is metadata-only: it identifies the state transition or failure
 * point that qproxy reached, while deliberately excluding headers and message
 * bytes that can contain credentials or user content.
 */
export interface WebSocketTrace {
  /**
   * Stable state-transition or failure label, such as `observer_attached` or
   * `frame_parse_failed`.
   */
  stage: string;
  /**
   * Connection metadata when qproxy can identify the owning connection.
   */
  connection?: Connection | null;
  /**
   * WebSocket stream identity once the HTTP exchange is known.
   */
  stream?: WebSocketStream | null;
  /**
   * Direction for frame and relay diagnostics (`client_to_server` or
   * `server_to_client`).
   */
  direction?: string | null;
  /**
   * Sanitized request path used only for handshake correlation.
   */
  path?: string | null;
  /**
   * HTTP response status when the trace point is response-bound.
   */
  status_code?: number | null;
  /**
   * Size of the chunk, frame, or logical message under discussion. The
   * bytes are not included.
   */
  byte_len?: number | null;
  /**
   * Buffered parser bytes remaining or accumulated at the trace point.
   */
  buffered_len?: number | null;
  /**
   * WebSocket opcode for frame parser diagnostics.
   */
  opcode?: number | null;
  /**
   * Whether RSV1/permessage-deflate compression is involved.
   */
  compressed?: boolean | null;
  /**
   * Negotiated extension summary, never raw sensitive headers.
   */
  extensions?: string | null;
  /**
   * Stable outcome label such as `attached`, `opened`, `skipped`, `failed`,
   * or `finished`.
   */
  outcome?: string | null;
  /**
   * Bounded operator-facing reason. This is diagnostic text, not a stable
   * enum for programmatic branching.
   */
  reason?: string | null;
}
/**
 * Model API request submitted by the agent for one turn.
 */
export interface LlmRequest {
  /**
   * Shared LLM context.
   */
  context: LlmEventContext;
  /**
   * Model identifier for this request.
   */
  model: string;
  /**
   * Correlation id used to match a later response event.
   */
  request_id?: string | null;
  /**
   * System instructions submitted to the model when the source exposes them.
   */
  system_instructions?: string | null;
}
/**
 * Shared session context attached to every normalized LLM payload.
 *
 * Carries the same fields as the `agent.*` context (`session_id`, `name`, and
 * optional `raw`): `llm.*` describes the provider/API turn while `agent.*`
 * describes the agent's behavior around it.
 *
 * Wire-identical to [`AgentEventContext`] today, but kept as a distinct type
 * so the two families can evolve their context shapes independently. A
 * `From<AgentEventContext>` conversion is provided for adapters that build
 * one context value and emit both `agent.*` and `llm.*` events from it.
 */
export interface LlmEventContext {
  /**
   * Stable conversation/session identifier from the source agent.
   */
  session_id: string;
  /**
   * Agent family that emitted the event, such as `claude` or `codex`.
   */
  name: string;
  /**
   * Lossless source attributes retained for consumers that need raw detail.
   */
  raw?: {
    [k: string]: unknown;
  } | null;
}
/**
 * Model API response, completion, or error telemetry.
 */
export interface LlmResponse {
  /**
   * Shared LLM context.
   */
  context: LlmEventContext;
  /**
   * Model that generated the response, if the source event included it.
   */
  model?: string | null;
  /**
   * Correlation id copied from the originating API request.
   */
  request_id?: string | null;
  /**
   * Response lifecycle phase.
   */
  phase: ResponsePhase;
  /**
   * Wall time in milliseconds for the turn or response phase.
   */
  duration_ms?: number | null;
  /**
   * Tokens sent to the model.
   */
  input_tokens?: number | null;
  /**
   * Tokens generated by the model, excluding reasoning tokens.
   */
  output_tokens?: number | null;
  /**
   * Reasoning or thinking tokens reported separately by the provider.
   */
  reasoning_tokens?: number | null;
  /**
   * Tokens read from provider cache.
   */
  cache_read_tokens?: number | null;
  /**
   * Tokens written to provider cache.
   */
  cache_write_tokens?: number | null;
  /**
   * Provider-reported cost in USD.
   */
  cost_usd?: number | null;
  /**
   * Error message or code when the response phase is an error.
   */
  error?: string | null;
}
/**
 * Token and context-window usage reported by a provider or agent runtime.
 */
export interface Usage {
  /**
   * Shared LLM context.
   */
  context: LlmEventContext;
  /**
   * Model associated with this usage update, when known.
   */
  model?: string | null;
  /**
   * Correlation id copied from the originating request or response.
   */
  request_id?: string | null;
  /**
   * Tokens sent to the model.
   */
  input_tokens?: number | null;
  /**
   * Tokens generated by the model, excluding reasoning tokens.
   */
  output_tokens?: number | null;
  /**
   * Reasoning or thinking tokens reported separately by the provider.
   */
  reasoning_tokens?: number | null;
  /**
   * Tokens read from provider cache.
   */
  cache_read_tokens?: number | null;
  /**
   * Tokens written to provider cache.
   */
  cache_write_tokens?: number | null;
  /**
   * Provider-reported total tokens.
   */
  total_tokens?: number | null;
  /**
   * Model context-window size, when a provider or app runtime reports it.
   */
  model_context_window?: number | null;
  /**
   * Provider-specific usage details that are safe to surface.
   */
  raw?: {
    [k: string]: unknown;
  } | null;
}
/**
 * Provider or app-runtime rate-limit snapshot.
 */
export interface RateLimit {
  /**
   * Shared LLM context.
   */
  context: LlmEventContext;
  /**
   * Correlation id copied from the originating request or response, if any.
   */
  request_id?: string | null;
  /**
   * Provider-specific decoder scheme, such as `openai_http` or `codex_app_server`.
   */
  scheme: string;
  /**
   * Provider-specific buckets keyed by stable bucket names.
   */
  buckets: {
    [k: string]: RateLimitBucket;
  };
  /**
   * Provider plan or subscription class, if exposed safely.
   */
  plan_type?: string | null;
  /**
   * Provider limit-reached classification, if currently limited.
   */
  rate_limit_reached_type?: string | null;
  /**
   * Provider-specific rate-limit details that are safe to surface.
   */
  raw?: {
    [k: string]: unknown;
  } | null;
}
/**
 * One provider rate-limit bucket.
 */
export interface RateLimitBucket {
  /**
   * Absolute bucket limit when reported.
   */
  limit?: number | null;
  /**
   * Remaining quota when reported.
   */
  remaining?: number | null;
  /**
   * Unix timestamp when the bucket resets.
   */
  reset_unix?: number | null;
  /**
   * Provider-specific bucket state.
   */
  status?: string | null;
  /**
   * Normalized utilization in the range 0.0..=1.0 when known.
   */
  utilization?: number | null;
  /**
   * Provider-reported used percentage when it reports percentages directly.
   */
  used_percent?: number | null;
  /**
   * Window length in minutes for rolling-window limits.
   */
  window_duration_mins?: number | null;
}
/**
 * Payload for `llm.provider_matched`.
 *
 * Fires when an HTTP request reaching the proxy matched a supported LLM
 * provider request shape. Answers the operator question "did qcontrol see
 * my request, and did it recognize the API?". Always debug severity.
 */
export interface LlmProviderMatched {
  /**
   * Stable provider family identifier (e.g. `anthropic`, `openai`).
   */
  provider: string;
  /**
   * Stable request-shape identifier (e.g. `anthropic_messages`,
   * `openai_responses_http`). Matches `qllm::RequestKind::label`.
   */
  request_kind: string;
  /**
   * HTTP method, if available from the wire metadata.
   */
  method?: string | null;
  /**
   * Request path the classifier accepted.
   */
  path?: string | null;
}
/**
 * Payload for `llm.provider_unmatched`.
 *
 * Fires when an HTTP request reached the proxy but didn't match any known
 * LLM provider shape. This is the "we saw the request but didn't recognize
 * the API" signal — common when a new provider isn't supported yet.
 */
export interface LlmProviderUnmatched {
  /**
   * HTTP method, if available from the wire metadata.
   */
  method?: string | null;
  /**
   * Request path the classifier saw.
   */
  path?: string | null;
  /**
   * Host the request targeted, parsed from the `Host` header.
   */
  host?: string | null;
}
/**
 * Conversation message observed in agent telemetry.
 */
export interface Message {
  /**
   * Shared agent context.
   */
  context: AgentEventContext;
  /**
   * Role responsible for the message content.
   */
  role: Role;
  /**
   * Message text after the adapter applies the agent's redaction policy.
   */
  prompt?: string | null;
  /**
   * Character length reported by the source agent when available.
   */
  prompt_char_length?: number | null;
}
/**
 * Shared agent session context attached to every normalized agent payload.
 *
 * Serialized as a nested `context` object on every `agent` payload, matching
 * the way MCP events keep common fields under `mcp.session`.
 */
export interface AgentEventContext {
  /**
   * Stable conversation/session identifier from the source agent.
   */
  session_id: string;
  /**
   * Agent family that emitted the event, such as `claude` or `codex`.
   */
  name: string;
  /**
   * Lossless source attributes retained for consumers that need raw detail.
   */
  raw?: {
    [k: string]: unknown;
  } | null;
}
/**
 * Tool invocation requested by the model.
 */
export interface ToolCall {
  /**
   * Shared agent context.
   */
  context: AgentEventContext;
  /**
   * Structured identity of the invoked tool.
   */
  tool: Tool;
  /**
   * Agent-provided invocation id for correlating with a result event.
   */
  call_id?: string | null;
  /**
   * Arguments supplied to the tool.
   */
  arguments?: {
    [k: string]: unknown;
  } | null;
}
/**
 * Decision made before a tool invocation is allowed to execute.
 */
export interface ToolDecision {
  /**
   * Shared agent context.
   */
  context: AgentEventContext;
  /**
   * Structured identity of the tool the decision applies to.
   */
  tool: Tool;
  /**
   * Agent-provided invocation id for correlating with a result event.
   */
  call_id?: string | null;
  /**
   * Whether execution was allowed.
   */
  decision: ToolDecisionOutcome;
  /**
   * What made the decision, such as `config`, `user`, or `policy`.
   */
  source: string;
}
/**
 * Completed tool execution telemetry.
 */
export interface ToolResult {
  /**
   * Shared agent context.
   */
  context: AgentEventContext;
  /**
   * Structured identity of the completed tool.
   */
  tool: Tool;
  /**
   * Agent-provided invocation id copied from the matching decision event.
   */
  call_id?: string | null;
  /**
   * Whether the tool invocation succeeded.
   */
  success: boolean;
  /**
   * Execution wall time in milliseconds.
   */
  duration_ms?: number | null;
  /**
   * Presentation-oriented output returned by the completed tool invocation.
   */
  output?: ToolResultOutputBlock[] | null;
  /**
   * Machine-readable output returned by the completed tool invocation.
   */
  structured_output?: {
    [k: string]: unknown;
  };
}
/**
 * Payload for `run.adapter_error`.
 *
 * Describes a recoverable failure inside the qagents adapter pipeline —
 * the run keeps going, but a record was lost or a side effect couldn't
 * complete. Operators investigating "why didn't I see event X?" can scan
 * for these to find pipeline-layer drops.
 *
 * Payloads carried by failed plugin-socket lines are not echoed back into
 * the event stream — those can contain intercepted request fragments,
 * headers, or user content. `byte_len` + `sample_hash` give operators a
 * way to correlate diagnostics across log lines without revealing
 * content; the raw bytes remain only in `tracing::debug!`.
 */
export interface AdapterError {
  /**
   * Pipeline component the error came from (`plugin_socket_decode`,
   * `plugin_socket_read`, `mitm_revert`, ...). Operators can grep on
   * this without parsing the free-form reason.
   */
  source: string;
  /**
   * Short error class (`json_decode`, `socket_read`, `socket_accept`,
   * `mitm_revert`, ...). Bounded vocabulary — safe to branch on
   * programmatically.
   */
  reason: string;
  /**
   * Byte length of the input that triggered the error, when the source
   * has one (e.g. malformed plugin socket line). Absent for sources
   * without an input payload (e.g. socket accept failures).
   */
  byte_len?: number | null;
  /**
   * Short non-cryptographic hex hash of the input that triggered the
   * error, for cross-line correlation without echoing content.
   * Currently emitted only for decode failures.
   */
  sample_hash?: string | null;
}
/**
 * Payload for `run.plugin_load_success`.
 *
 * Fires once per resolved plugin path when the path is accessible at the
 * expected location. The actual symbol-load / version check happens inside
 * the agent process; this event reports that the CLI successfully resolved
 * and prepared the plugin for the agent to pick up.
 */
export interface PluginLoadSuccess {
  /**
   * Plugin identifier as written in `QCONTROL_PLUGINS` (a path or a
   * builtin name).
   */
  name: string;
  /**
   * Resolved filesystem path the agent will dlopen.
   */
  path: string;
}
/**
 * Payload for `run.plugin_load_failure`.
 *
 * Fires once per resolved plugin path when the CLI cannot stage the
 * plugin for the agent — most commonly because the path doesn't exist
 * or isn't readable.
 */
export interface PluginLoadFailure {
  /**
   * Plugin identifier as written in `QCONTROL_PLUGINS`.
   */
  name: string;
  /**
   * Resolved filesystem path the CLI attempted to verify.
   */
  path: string;
  /**
   * Human-readable failure reason. Not stable; for operator diagnosis.
   */
  reason: string;
}
/**
 * Payload for `run.agent_injection_success`.
 *
 * Fires once when the CLI has configured the chosen loader for the
 * wrapped command and the child has started. "Success" here means
 * "qcontrol set up injection and the child appears to have launched"
 * — silent runtime failures (LD_PRELOAD ignored, SIP-blocked
 * DYLD_INSERT_LIBRARIES) are not directly visible from the parent and
 * must be inferred from missing downstream `agent.*` / `mcp.*` events.
 */
export interface AgentInjectionSuccess {
  /**
   * Loader name (`preload`, `frida`).
   */
  loader: string;
  /**
   * Command line the child was launched with, joined with spaces. Free
   * form; useful for operators correlating the event with the run.
   */
  target: string;
}
/**
 * Payload for `run.agent_injection_failure`.
 *
 * Fires when the CLI could not set up injection or the child failed to
 * launch at all — agent file extraction failure, spawn failure, etc.
 * "Silent" runtime injection failures inside the child are not covered
 * by this event; they remain in `tracing` logs.
 */
export interface AgentInjectionFailure {
  /**
   * Loader name (`preload`, `frida`).
   */
  loader: string;
  /**
   * Command line the child was launched with, joined with spaces.
   */
  target: string;
  /**
   * Short identifier for which step failed (`extract_agent`,
   * `configure_loader`, `spawn`, ...). For now this is a free-form
   * label set by the emitter.
   */
  stage: string;
  /**
   * Human-readable failure reason. Not stable.
   */
  reason: string;
}
/**
 * An event emitted by a custom user plugin.
 *
 * Plugins may define their own event types. Any plugin event that isn't one of
 * qcontrol's built-in event families is reported as `plugin.event`, carrying
 * the plugin's name, the plugin-defined event type, and an arbitrary payload.
 */
export interface CustomPluginEvent {
  /**
   * Always `plugin.event`; keeps plugin-defined event names out of
   * qcontrol's built-in event namespace.
   */
  type: "plugin.event";
  payload: CustomPluginPayload;
}
export interface CustomPluginPayload {
  /**
   * Plugin that emitted the custom event.
   */
  plugin_name: string;
  /**
   * Plugin-defined event type.
   */
  event: string;
  /**
   * Plugin-defined event data.
   */
  payload: {
    [k: string]: unknown;
  };
}
/**
 * Compact run context repeated on every run-produced event.
 */
export interface RunContext {
  /**
   * Stable opaque id for this `qcontrol run` invocation.
   */
  id: string;
  /**
   * OS pid of the `qcontrol run` process.
   */
  run_pid: number;
  /**
   * OS pid of the spawned agent process.
   */
  agent_pid?: number | null;
  /**
   * RFC3339Nano timestamp captured once at startup.
   */
  started_at: Timestamp;
  /**
   * qcontrol version that produced the event.
   */
  version: string;
  /**
   * Effective plugin display names for the run.
   *
   * @default []
   */
  plugins?: string[];
  /**
   * Canonical AI agent id when one was resolved. Omitted for generic runs
   * such as `--adapter none`.
   */
  agent_id?: string | null;
  /**
   * Content-derived installation id of the resolved agent binary, keyed on
   * its canonical (symlink-resolved) path so it joins `process.*` and
   * `installation.*` records for the same install. Present only when an AI
   * agent was resolved; omitted for generic runs such as `--adapter none`.
   * See `qtap::fingerprint::installation_id`.
   */
  installation_id?: string | null;
}
