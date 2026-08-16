# Understanding the event schema and fetching the latest

qcontrol publishes a TypeScript description of the unified monitor stream. A wrapper that wants typed handlers should track that file alongside the bundled qcontrol version, rather than hand-writing event shapes.

This repo vendors the schema at [`src/types/qcontrol-events.ts`](../src/types/qcontrol-events.ts). The file header says not to edit it. `make update-qcontrol` refreshes it in the same step as the [binary](bundling-qcontrol.md).

## What this repo does

[`scripts/sync-qcontrol-types.sh`](../scripts/sync-qcontrol-types.sh) downloads:

```
https://downloads.qpoint.io/qcontrol/docs/events/events.ts
```

and overwrites `src/types/qcontrol-events.ts`. Override the URL with `QCONTROL_EVENTS_URL` if you are pointing at a different publication.

There is no qcontrol source checkout involved. The published file is the contract.

The wrapper's public handler types in [`src/core/forwarder.ts`](../src/core/forwarder.ts) are aliases onto that schema:

- `QcontrolEvent` → `EventRecord`
- `QcontrolInstallation` → `InstallationRecord`
- `QcontrolProcess` → `ProcessStarted` plus the envelope `entity_id`

## How events join

The stream is three layers, joined by two ids.

**Installation events** describe an *installed agent*: display name, vendor, kind, binary / bundle path, version, tap state, and surface configuration (plugins, MCP servers, skills, settings). That record is the agent-at-rest. Richer surface fields arrive on `installation.details` and join the discovered record on the same installation `id`.

**Process events** describe one OS process lifetime. Each one carries:

- `entity_id` — a globally unique id for that process (pid + host + start time). Treat it as an opaque key. Do not parse it.
- `installation_id` — the installed agent that process belongs to, when qcontrol could attribute one.

**Every other run event** (`llm.*`, `agent.*`, `mcp.*`, `file.*`, `connection.*`, `http.*`, `plugin.event`, `run.*`, …) carries the `entity_id` of the process that generated it. It does not repeat the installation. You join back.

```
installation   agent metadata (name, binary, plugins, MCP, skills, …)
      ▲
      │  process.installation_id
      │
process        entity_id + installation_id + pid, exe, argv, …
      ▲
      │  event.entity_id
      │
run event      llm.request, file.read, mcp.request, …
```

To connect everything, keep two lookup tables:

```
installation_id  →  installation
entity_id        →  entity (the process)
```

Given any run event:

```
entity       = entities[event.entity_id]
installation = installations[entity.installation_id]
```

That is the whole correlation model. This repo's [collector](handling-events.md) is one implementation of those two maps.

`entity_id` is authored by qcontrol. Copy it. Never invent one.

## Schema structure

Every record on the monitor sink is an `EventRecord`:

```ts
type EventRecord = EntityRecord | HostRecord;
```

Both sides share a small envelope (`timestamp`, optional `severity`). They split on which layer above they belong to:

| Kind | Layer | Identity | Typical `type` values |
|---|---|---|---|
| **Host** | Installations, plus the process inventory snapshot | Installation `id` on the payload. No `entity_id`. | `installation.discovered`, `installation.details`, `installation.snapshot`, `installation.tap_*`, `process.snapshot` |
| **Entity** | One process, or a run event from that process | Required envelope `entity_id`. Process records also carry `installation_id`. | `process.started`, `process.stopped`, `llm.*`, `agent.*`, `mcp.*`, `file.*`, `connection.*`, `http.*`, `plugin.event`, `run.*` |

The wire shape is a discriminated union on `type` with a `payload` object. Narrowing on `event.type` gives you the concrete payload — no casts:

```ts
import type { QcontrolEvent, QcontrolProcess } from "../src/core/forwarder";
import type { InstallationRecord } from "../src/types/qcontrol-events";

function handle(
  event: QcontrolEvent,
  installation?: InstallationRecord,
  process?: QcontrolProcess,
): void {
  switch (event.type) {
    case "llm.request":
      handleLlm(event.payload, process, installation); // payload is LlmRequest
      break;
    case "installation.discovered":
      handleInstall(event.payload); // payload is InstallationRecord
      break;
  }
}
```

Unhandled variants can fall through. New qcontrol event types then do not require a code change until you care about them.

Public-stream custom events arrive as `plugin.event`.

`tap.status` on an installation is `tapped`, `not_tapped`, or `requires_attention`.

## Keeping schema and binary together

The published `events.ts` describes the qcontrol build that emitted it. This repo updates both in one target so the checked-in types match `bin/qcontrol.bin`. If you split those jobs, a handler compiled against an older schema can still *run* against a newer binary (unknown `type` values just do not narrow), but payload fields you rely on may have moved.

Do not edit `qcontrol-events.ts` to "fix" a type. Change the wrapper, or wait for the next published schema.

## What you can ignore

- TypeScript. The same JSON is on the socket regardless of language. Use the file as documentation, or generate bindings another way.
- Vendoring the whole schema. You can define only the event types your product handles and treat the rest as `{ type: string; payload: unknown }`.
- Updating on every qcontrol bump. Do it when you adopt a new binary, or when you need a new field.
