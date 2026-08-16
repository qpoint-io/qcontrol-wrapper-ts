# Binding to the event socket and handling events

This is the customization point. Everything else in the repo exists to get a typed event into a function you control.

The shape is: listen on a local socket, parse newline-delimited JSON, join each run event back to its process and installed agent, then run your business logic.

## Order

Bind first, then start qcontrol. The monitor connects to the fleet sink as soon as it comes up. A missing socket looks like a dead sink, not a retry-friendly queue.

In this repo that order lives in [`runForeground()`](../src/lifecycle/runtime.ts):

```ts
await collector.start();
const child = await monitor.start(); // qcontrol start -f
```

[`Monitor`](../src/core/monitor.ts) is only the child-process owner. It does not know about events.

## The socket

[`Collector`](../src/core/collector.ts) binds the path from [`getQctlSocketPath()`](../src/core/paths.ts), which is a platform adapter method:

- macOS / Linux: a Unix socket, default `{data}/collector.sock`, URL form `unix:///...`
- Windows: a named pipe, default `\\.\pipe\qctl-collector`, URL form `pipe://qctl-collector`

That URL is what [`config.ts`](../src/core/config.ts) writes into `config.toml`. Override the path with `QCTL_SOCKET_PATH`.

On POSIX, a privileged daemon owns the socket file. When the wrapper is root, it chmods the socket `0o666` so the elevated monitor can connect to a sink that still lives in the invoking user's data directory. That mode is an adapter decision (`shouldOpenDaemonEndpoint()`), not a hardcoded `chmod` in the collector.

Transport is newline-delimited JSON. Partial lines are buffered across socket chunks. A malformed line is dropped and logged; it does not tear down the listener.

## Connecting events to processes and installations

Run events do not carry the agent. They carry an `entity_id`. Process records carry that `entity_id` plus an `installation_id`. Installation records are the agent: name, binary, plugins, MCP servers, skills, and the rest of the surface.

The join is two maps. See [How events join](event-schema.md#how-events-join) for the model; this collector is the reference implementation.

```
installation_id  →  installation
entity_id        →  entity (the process)
```

You can parse the stream yourself and maintain those tables in your own process. This collector does it so a `Forwarder` receives the event already joined. It names the second map `processes`; that is the `entity_id → entity` table.

| Map | Filled by | Key |
|---|---|---|
| installations | `installation.discovered`; replaced by `installation.snapshot` | installation `id` |
| processes | `process.started` / `process.snapshot`; evicted after `process.stopped` plus a short grace window | `entity_id` |

Delivery rules, in terms of those maps:

- An installation event updates `installations[id]` and forwards immediately.
- A process event waits only if it names an `installation_id` that is not in the installation map yet. Then it stores `processes[entity_id]`.
- Every other run event waits on `entity_id` until that process is in the map. The collector then looks up `process.installation_id` and attaches both records.

Installation context is attached when the process has an `installation_id`. It is not required — a process qcontrol could not attribute still forwards.

Unresolved events sit in a queue (default TTL five minutes, default cap 10,000, 1,000 per dependency key) so out-of-order delivery at startup does not drop captures. Shed events are logged.

Snapshots *replace* both maps. See [re-generating a snapshot](snapshots.md) for when to ask qcontrol for a fresh one.

## Your business logic is a Forwarder

```ts
export interface Forwarder {
  forward(
    event: QcontrolEvent,
    installation?: QcontrolInstallation,
    process?: QcontrolProcess,
  ): void;
}
```

- `event` is the parsed monitor record, typed as the [unified schema](event-schema.md).
- `process` is `entities[event.entity_id]` — the `process.started` payload plus that `entity_id` — when the collector has it.
- `installation` is `installations[process.installation_id]`, when the process named one and the collector has it.

A handler that needs the agent name, binary, plugins, or MCP config reads `installation`. A handler that needs pid, argv, or working directory reads `process`. The run event itself stays just the action.

This repo's default implementation is [`PrettyPrinter`](../src/forwarders/pretty.ts): one summary line on stdout. `--raw` selects [`RawPrinter`](../src/forwarders/raw.ts) instead. Those are examples, not the product.

A custom forwarder looks like this:

```ts
import type {
  Forwarder,
  QcontrolEvent,
  QcontrolInstallation,
  QcontrolProcess,
} from "../core/forwarder";

export class CustomForwarder implements Forwarder {
  forward(
    event: QcontrolEvent,
    installation?: QcontrolInstallation,
    process?: QcontrolProcess,
  ): void {
    switch (event.type) {
      case "llm.request":
        // event.payload is LlmRequest
        // process is the OS process that issued it
        // installation is the agent (name, binary, plugins, MCP, skills, …)
        break;
      default:
        break;
    }
  }
}
```

Wire it where this app wires `PrettyPrinter`, in `runForeground()`:

```ts
const collector = new Collector({
  forwarders: [new CustomForwarder()],
  socketMode: platformAdapter.shouldOpenDaemonEndpoint() ? 0o666 : undefined,
});
```

You can pass several forwarders. They are called in array order. Fan-out (log + API + queue) is just more entries.

Secrets and destination URLs belong in the forwarder, or in the constructor call from `runForeground()`. They do not belong in qcontrol's config.

## What you can ignore

- The collector's two maps. If you do not need to join back to the process or the installed agent, parse NDJSON and handle `event.type` yourself. If you do, copy the maps — they are the whole trick.
- Pretty / raw printers. They exist so `qctl start -f` is watchable in a terminal.
- The queue TTL and size caps. Tune or delete them.
- Multiple forwarders. One is enough.

What you cannot skip, if you want events at all: a listener that is up before `qcontrol start -f`, on the URL written into qcontrol's sink config.
