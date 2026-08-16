/**
 * Covers one specialized summarizeEvent string per qcontrol event type, plus
 * a few payload variants the table does not already pin down.
 */
import { describe, expect, test } from "bun:test";

import type { QcontrolEvent, QcontrolInstallation } from "../core/forwarder";
import { summarizeEvent } from "./summarize";
import type {
  Connection,
  Diagnostic,
  FileInfo,
  HttpExchange,
  InstallationRecord,
  ProcessStarted,
  ScanAgent,
  SessionContext,
} from "../types/qcontrol-events";

const timestamp = "2026-06-18T20:33:02.123456789Z";
const entityId = "pid:30442:start:1781814782";

const agent: ScanAgent = {
  id: "claude-cli",
  name: "Claude Code",
  vendor: "Anthropic",
  kind: "cli",
};

const session: SessionContext = {
  session_id: "sess-1",
  host: "api.example.com",
  advertised_server_name: "Pulse",
  transport: "http",
  protocol_version: "2024-11-05",
};

const file: FileInfo = {
  id: 1,
  fd: 8,
  path: "/Users/tyler/Code/qcontrol-wrapper-ts/src/main.ts",
};

const connection: Connection = {
  id: 7,
  fd: 12,
  transport: "tcp",
  direction: "outbound",
  src: { host: "10.0.0.2", port: 54321 },
  dst: { host: "160.79.104.10", port: 443 },
  domain: "api.anthropic.com",
  protocol: "http/2",
  tls: { enabled: true, version: "1.3", cipher: "TLS_AES_128_GCM_SHA256" },
};

const exchange: HttpExchange = {
  id: 3,
  connection_id: 7,
  fd: 12,
  version: "http/2",
};

const installation: QcontrolInstallation = {
  id: "inst-1",
  agent,
  executable_path: "/usr/local/bin/claude",
  version: "1.2.0",
  tap: { status: "tapped" },
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

describe("summarizeEvent", () => {
  const cases = [
    {
      type: "process.started",
      event: entity({
        type: "process.started",
        payload: {
          pid: 30442,
          exe: "/usr/local/bin/claude",
          argv: ["/usr/local/bin/claude", "--resume"],
          started_at: timestamp,
          agent,
        } satisfies ProcessStarted,
      }),
      summary: "/usr/local/bin/claude --resume",
    },
    {
      type: "process.stopped",
      event: entity({
        type: "process.stopped",
        payload: {
          pid: 30442,
          exe: "/usr/local/bin/claude",
          started_at: timestamp,
          duration_ms: 1200,
        },
      }),
      summary: "/usr/local/bin/claude 1.2s",
    },
    {
      type: "process.snapshot",
      event: host({
        type: "process.snapshot",
        payload: {
          processes: [
            { entity_id: "e1", pid: 1, exe: "/usr/local/bin/claude", started_at: timestamp, agent },
            {
              entity_id: "e2",
              pid: 2,
              exe: "/usr/local/bin/codex",
              started_at: timestamp,
              agent: { id: "codex", name: "Codex", vendor: "OpenAI", kind: "cli" },
            },
          ],
        },
      }),
      summary: "Claude Code, Codex",
    },
    {
      type: "mcp.request",
      event: entity({
        type: "mcp.request",
        payload: {
          session,
          method: "tools/call",
          request_id: "1",
          tool_name: "grep",
        },
      }),
      summary: "Pulse tools/call grep",
    },
    {
      type: "mcp.response",
      event: entity({
        type: "mcp.response",
        payload: {
          session,
          method: "tools/call",
          request_id: "1",
          tool_name: "grep",
          is_error: false,
        },
      }),
      summary: "Pulse tools/call grep ok",
    },
    {
      type: "mcp.error",
      event: entity({
        type: "mcp.error",
        payload: {
          session,
          method: "tools/call",
          request_id: "1",
          tool_name: "grep",
          error: { code: -32601, message: "Method not found" },
        },
      }),
      summary: "Pulse tools/call grep -32601 Method not found",
    },
    {
      type: "mcp.notification",
      event: entity({
        type: "mcp.notification",
        payload: {
          session,
          method: "notifications/resources/updated",
          source: "server",
          resource_uri: "file:///tmp/notes.md",
        },
      }),
      summary: "Pulse server notifications/resources/updated file:///tmp/notes.md",
    },
    {
      type: "mcp.session_close",
      event: entity({
        type: "mcp.session_close",
        payload: { session, reason: "transport_close" },
      }),
      summary: "Pulse transport_close",
    },
    {
      type: "mcp.diagnostic",
      event: entity({
        type: "mcp.diagnostic",
        payload: {
          category: "parse_failure",
          detail: "unexpected token",
          session,
        } satisfies Diagnostic,
      }),
      summary: "parse_failure unexpected token",
    },
    {
      type: "mcp.oauth",
      event: entity({
        type: "mcp.oauth",
        payload: {
          session,
          step: "token_exchange",
          status: 400,
          error: "invalid_grant",
        },
      }),
      summary: "Pulse token_exchange 400 invalid_grant",
    },
    {
      type: "file.open",
      event: entity({
        type: "file.open",
        payload: { file, flags: 0, mode: 0, result: 8 },
      }),
      summary: "src/main.ts fd=8",
    },
    {
      type: "file.read",
      event: entity({
        type: "file.read",
        payload: { file, count: 4096, result: 4096 },
      }),
      summary: "src/main.ts 4.0kb",
    },
    {
      type: "file.write",
      event: entity({
        type: "file.write",
        payload: { file, count: 128, result: 128 },
      }),
      summary: "src/main.ts 128b",
    },
    {
      type: "file.close",
      event: entity({
        type: "file.close",
        payload: { file, result: 0 },
      }),
      summary: "src/main.ts",
    },
    {
      type: "exec.spawn",
      event: entity({
        type: "exec.spawn",
        payload: {
          id: 9,
          path: "/bin/ls",
          argv: ["/bin/ls", "-la", "/tmp"],
          cwd: "/Users/tyler",
        },
      }),
      summary: "/bin/ls -la /tmp",
    },
    {
      type: "exec.exit",
      event: entity({
        type: "exec.exit",
        payload: {
          id: 9,
          path: "/bin/ls",
          pid: 41002,
          status: { kind: "exited", code: 0 },
        },
      }),
      summary: "/bin/ls exit 0",
    },
    {
      type: "connection.open",
      event: entity({
        type: "connection.open",
        payload: { connection },
      }),
      summary: "outbound tcp api.anthropic.com:443",
    },
    {
      type: "connection.update",
      event: entity({
        type: "connection.update",
        payload: { reason: "tls", connection },
      }),
      summary: "tls api.anthropic.com:443",
    },
    {
      type: "connection.close",
      event: entity({
        type: "connection.close",
        payload: { connection, result: 0 },
      }),
      summary: "outbound api.anthropic.com:443",
    },
    {
      type: "connection.mitm_success",
      event: entity({
        type: "connection.mitm_success",
        payload: {
          connection,
          sni: "api.anthropic.com",
          upstream: "api.anthropic.com:443",
          alpn: "h2",
        },
      }),
      summary: "api.anthropic.com h2",
    },
    {
      type: "connection.mitm_failure",
      event: entity({
        type: "connection.mitm_failure",
        payload: {
          connection,
          sni: "api.anthropic.com",
          stage: "upstream_tls",
          reason: "handshake failed",
        },
      }),
      summary: "upstream_tls api.anthropic.com handshake failed",
    },
    {
      type: "connection.proxy_error",
      event: entity({
        type: "connection.proxy_error",
        payload: {
          connection,
          upstream: "api.anthropic.com:443",
          stage: "upstream_connect",
          reason: "connection refused",
        },
      }),
      summary: "upstream_connect api.anthropic.com:443 connection refused",
    },
    {
      type: "connection.intake_fallback",
      event: entity({
        type: "connection.intake_fallback",
        payload: {
          connection,
          upstream: "api.anthropic.com:443",
          from: "tls_mitm",
          to: "raw_connect",
          reason: "handshake failed",
        },
      }),
      summary: "tls_mitm -> raw_connect api.anthropic.com:443 handshake failed",
    },
    {
      type: "http.request",
      event: entity({
        type: "http.request",
        payload: {
          exchange,
          connection: { domain: "api.anthropic.com", protocol: "http/2", tls: { enabled: true } },
          method: "POST",
          scheme: "https",
          authority: "api.anthropic.com",
          path: "/v1/messages",
          headers: [],
        },
      }),
      summary: "POST https://api.anthropic.com/v1/messages http/2",
    },
    {
      type: "http.response",
      event: entity({
        type: "http.response",
        payload: {
          exchange,
          request_ref: { method: "POST", path: "/v1/messages" },
          status_code: 200,
          headers: [],
        },
      }),
      summary: "POST /v1/messages 200",
    },
    {
      type: "http.exchange_close",
      event: entity({
        type: "http.exchange_close",
        payload: {
          exchange,
          request_ref: { method: "POST", path: "/v1/messages" },
          reason: "complete",
          request_done: true,
          response_done: true,
          status_code: 200,
        },
      }),
      summary: "POST /v1/messages complete 200",
    },
    {
      type: "sse.open",
      event: entity({
        type: "sse.open",
        payload: {
          stream: { http_exchange_id: 3, connection_id: 7, fd: 12, version: "http/2" },
          content_type: "text/event-stream",
        },
      }),
      summary: "text/event-stream",
    },
    {
      type: "sse.event",
      event: entity({
        type: "sse.event",
        payload: {
          stream: { http_exchange_id: 3, connection_id: 7, fd: 12, version: "http/2" },
          event_name: "message",
          data_byte_len: 2048,
        },
      }),
      summary: "message 2.0kb",
    },
    {
      type: "sse.close",
      event: entity({
        type: "sse.close",
        payload: {
          stream: { http_exchange_id: 3, connection_id: 7, fd: 12, version: "http/2" },
          reason: "complete",
        },
      }),
      summary: "complete",
    },
    {
      type: "websocket.open",
      event: entity({
        type: "websocket.open",
        payload: {
          stream: { http_exchange_id: 3, connection_id: 7, fd: 12, version: "http/1.1" },
          subprotocol: "chat",
        },
      }),
      summary: "chat",
    },
    {
      type: "websocket.send",
      event: entity({
        type: "websocket.send",
        payload: {
          stream: { http_exchange_id: 3, connection_id: 7, fd: 12, version: "http/1.1" },
          kind: "text",
          byte_len: 128,
        },
      }),
      summary: "text 128b",
    },
    {
      type: "websocket.recv",
      event: entity({
        type: "websocket.recv",
        payload: {
          stream: { http_exchange_id: 3, connection_id: 7, fd: 12, version: "http/1.1" },
          kind: "binary",
          byte_len: 2048,
        },
      }),
      summary: "binary 2.0kb",
    },
    {
      type: "websocket.close",
      event: entity({
        type: "websocket.close",
        payload: {
          stream: { http_exchange_id: 3, connection_id: 7, fd: 12, version: "http/1.1" },
          initiator: "client",
          code: 1000,
          reason: "done",
          clean: true,
        },
      }),
      summary: "client 1000 clean done",
    },
    {
      type: "websocket.trace",
      event: entity({
        type: "websocket.trace",
        payload: {
          stage: "observer_attached",
          outcome: "attached",
          path: "/ws",
        },
      }),
      summary: "observer_attached attached /ws",
    },
    {
      type: "llm.request",
      event: llmRequest,
      summary: "claude-sonnet-4",
    },
    {
      type: "llm.response",
      event: entity({
        type: "llm.response",
        payload: {
          context: { session_id: "sess-1", name: "claude" },
          model: "claude-sonnet-4",
          phase: "completed",
          duration_ms: 1200,
          input_tokens: 1200,
          output_tokens: 400,
        },
      }),
      summary: "claude-sonnet-4 completed 1.2s in=1200 out=400",
    },
    {
      type: "llm.usage",
      event: entity({
        type: "llm.usage",
        payload: {
          context: { session_id: "sess-1", name: "claude" },
          model: "claude-sonnet-4",
          input_tokens: 1200,
          output_tokens: 400,
          total_tokens: 1600,
        },
      }),
      summary: "claude-sonnet-4 in=1200 out=400 total=1600",
    },
    {
      type: "llm.rate_limit",
      event: entity({
        type: "llm.rate_limit",
        payload: {
          context: { session_id: "sess-1", name: "claude" },
          scheme: "openai_http",
          plan_type: "plus",
          rate_limit_reached_type: "requests",
          buckets: {
            requests: { limit: 60, remaining: 5, used_percent: 91.6 },
          },
        },
      }),
      summary: "openai_http plus requests 5/60",
    },
    {
      type: "llm.provider_matched",
      event: entity({
        type: "llm.provider_matched",
        payload: {
          provider: "anthropic",
          request_kind: "anthropic_messages",
          method: "POST",
          path: "/v1/messages",
        },
      }),
      summary: "anthropic anthropic_messages POST /v1/messages",
    },
    {
      type: "llm.provider_unmatched",
      event: entity({
        type: "llm.provider_unmatched",
        payload: {
          method: "POST",
          path: "/v1/foo",
          host: "api.unknown.com",
        },
      }),
      summary: "POST api.unknown.com /v1/foo",
    },
    {
      type: "agent.message",
      event: entity({
        type: "agent.message",
        payload: {
          context: { session_id: "sess-1", name: "claude" },
          role: "user",
          prompt: "Please refactor the collector routing",
          prompt_char_length: 37,
        },
      }),
      summary: 'user "Please refactor the collector routing" 37c',
    },
    {
      type: "agent.tool_call",
      event: entity({
        type: "agent.tool_call",
        payload: {
          context: { session_id: "sess-1", name: "claude" },
          tool: { kind: "builtin", name: "Bash" },
          arguments: { command: "ls -la" },
        },
      }),
      summary: "Bash ls -la",
    },
    {
      type: "agent.tool_decision",
      event: entity({
        type: "agent.tool_decision",
        payload: {
          context: { session_id: "sess-1", name: "claude" },
          tool: { kind: "mcp", server: "github", name: "list_issues" },
          decision: "approved",
          source: "user",
        },
      }),
      summary: "github/list_issues approved by user",
    },
    {
      type: "agent.tool_result",
      event: entity({
        type: "agent.tool_result",
        payload: {
          context: { session_id: "sess-1", name: "claude" },
          tool: { kind: "builtin", name: "Bash" },
          success: true,
          duration_ms: 230,
        },
      }),
      summary: "Bash ok 230ms",
    },
    {
      type: "run.adapter_error",
      event: entity({
        type: "run.adapter_error",
        payload: {
          source: "plugin_socket_decode",
          reason: "json_decode",
          byte_len: 48,
        },
      }),
      summary: "plugin_socket_decode json_decode",
    },
    {
      type: "run.plugin_load_success",
      event: entity({
        type: "run.plugin_load_success",
        payload: {
          name: "qhttp",
          path: "/opt/qcontrol/plugins/qhttp.so",
        },
      }),
      summary: "qhttp /opt/qcontrol/plugins/qhttp.so",
    },
    {
      type: "run.plugin_load_failure",
      event: entity({
        type: "run.plugin_load_failure",
        payload: {
          name: "qhttp",
          path: "/missing/qhttp.so",
          reason: "not readable",
        },
      }),
      summary: "qhttp not readable",
    },
    {
      type: "run.agent_injection_success",
      event: entity({
        type: "run.agent_injection_success",
        payload: {
          loader: "preload",
          target: "claude --resume",
        },
      }),
      summary: "preload claude --resume",
    },
    {
      type: "run.agent_injection_failure",
      event: entity({
        type: "run.agent_injection_failure",
        payload: {
          loader: "preload",
          target: "claude",
          stage: "spawn",
          reason: "command not found",
        },
      }),
      summary: "preload spawn command not found",
    },
    {
      type: "plugin.event",
      event: entity({
        type: "plugin.event",
        payload: {
          plugin_name: "my-plugin",
          event: "custom.thing",
          payload: { ok: true },
        },
      }),
      summary: "my-plugin custom.thing",
    },
    {
      type: "installation.discovered",
      event: host({
        type: "installation.discovered",
        payload: installation satisfies InstallationRecord,
      }),
      summary: "/usr/local/bin/claude tapped 1.2.0",
    },
    {
      type: "installation.details",
      event: host({
        type: "installation.details",
        payload: {
          id: "inst-1",
          agent,
          version: "1.2.0",
          default_model: "claude-sonnet-4",
          mcp_servers: [{ name: "github" }, { name: "pulse" }],
          skills: [{ name: "review" }],
          plugins: ["qhttp"],
        },
      }),
      summary: "v1.2.0 model=claude-sonnet-4 mcp=2 skills=1 plugins=1",
    },
    {
      type: "installation.snapshot",
      event: host({
        type: "installation.snapshot",
        payload: {
          installations: [
            installation,
            {
              agent: { id: "codex", name: "Codex", vendor: "OpenAI", kind: "cli" },
              executable_path: "/usr/local/bin/codex",
              tap: { status: "not_tapped" },
            },
          ],
        },
      }),
      summary: "Claude Code, Codex",
    },
    {
      type: "installation.tap_result",
      event: host({
        type: "installation.tap_result",
        payload: {
          id: "inst-1",
          agent,
          target: "/usr/local/bin/claude",
          outcome: "fresh",
          dry_run: true,
        },
      }),
      summary: "fresh /usr/local/bin/claude dry-run",
    },
    {
      type: "installation.tap_error",
      event: host({
        type: "installation.tap_error",
        payload: {
          agent,
          target: "/usr/local/bin/claude",
          dry_run: false,
          error: "permission denied",
        },
      }),
      summary: "/usr/local/bin/claude permission denied",
    },
    {
      type: "installation.tap_skipped",
      event: host({
        type: "installation.tap_skipped",
        payload: {
          agent,
          target: "/usr/local/bin/claude",
          reason: "not_allowed",
          dry_run: false,
        },
      }),
      summary: "not_allowed /usr/local/bin/claude",
    },
  ] satisfies Array<{ type: QcontrolEvent["type"]; event: QcontrolEvent; summary: string }>;

  type CoveredType = (typeof cases)[number]["type"];
  type MissingType = Exclude<QcontrolEvent["type"], CoveredType>;
  type AssertAllEventTypesCovered = [MissingType] extends [never] ? true : MissingType;
  const _allEventTypesCovered: AssertAllEventTypesCovered = true;
  void _allEventTypesCovered;

  for (const { type, event, summary } of cases) {
    test(`${type} has a specialized summary`, () => {
      expect(event.type).toBe(type);
      expect(summarizeEvent(event)).toBe(summary);
    });
  }

  test("mcp.response reports tool-level errors", () => {
    expect(
      summarizeEvent(
        entity({
          type: "mcp.response",
          payload: {
            session,
            method: "tools/call",
            request_id: "1",
            tool_name: "grep",
            is_error: true,
          },
        }),
      ),
    ).toBe("Pulse tools/call grep error");
  });

  test("exec.exit reports signals", () => {
    expect(
      summarizeEvent(
        entity({
          type: "exec.exit",
          payload: {
            id: 9,
            path: "/bin/ls",
            pid: 41002,
            status: { kind: "signaled", signal: 15 },
          },
        }),
      ),
    ).toBe("/bin/ls signal 15");
  });

  test("mcp.diagnostic covers transport failures", () => {
    expect(
      summarizeEvent(
        entity({
          type: "mcp.diagnostic",
          payload: {
            category: "transport_failure",
            http_status: 502,
            session,
          },
        }),
      ),
    ).toBe("transport_failure 502 Pulse");
  });

  test("file.open reports failed opens", () => {
    expect(
      summarizeEvent(
        entity({
          type: "file.open",
          payload: { file, flags: 0, mode: 0, result: -2 },
        }),
      ),
    ).toBe("src/main.ts err=-2");
  });

  test("agent.tool_call shortens filesystem arguments", () => {
    expect(
      summarizeEvent(
        entity({
          type: "agent.tool_call",
          payload: {
            context: { session_id: "sess-1", name: "claude" },
            tool: { kind: "builtin", name: "Read" },
            arguments: { file_path: "/Users/tyler/Code/qcontrol-wrapper-ts/src/core/collector.ts" },
          },
        }),
      ),
    ).toBe("Read core/collector.ts");
  });
});
