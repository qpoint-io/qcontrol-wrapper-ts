# qcontrol wrapper template

This repository is a working TypeScript wrapper around `qcontrol` for applications that need to collect qcontrol events and report them to a custom destination. Keep the wrapper, collector, monitor host, and embedded qcontrol handling in place, then implement your product-specific reporting logic as a forwarder.

The default implementation already handles the parts that should not need to be rebuilt for each integration:

- bundles and materializes the upstream `qcontrol` binary
- proxies unknown CLI commands through to `qcontrol`
- creates qctl-owned config, data, and cache directories
- writes `config.toml` with a fleet sink pointing at qctl's collector
- starts `qcontrol start -f` so the elevated monitor owns inventory, taps, and event fan-out
- collects newline-delimited JSON records from a local socket or named pipe
- resolves installation and process context before delivery
- forwards complete event records to one or more `Forwarder` implementations

qctl creates its own directories and config; qcontrol is pointed at them through `QCONTROL_CONFIG_DIR`, `QCONTROL_DATA_DIR`, and `QCONTROL_CACHE_DIR`. On macOS, `make pkg` builds a `.pkg` that installs `qctl` to `/usr/local/bin` and runs `qctl init` then `qctl start --service` from postinstall.

## Architecture

`qctl` is the wrapper binary built from `src/main.ts`. Wrapper-owned commands match qcontrol's start surface:

- `qctl start` — start in the background
- `qctl start -f` — run in this terminal
- `qctl start --service` — register an OS service and start now
- `qctl status` — show whether qctl is running, and the pid when it is
- `qctl stop` — stop, and remove the service if one was registered

Foreground runs print one summary line per event. Pass `--raw` to print JSON lines instead. Every other argument vector is passed through to the embedded `qcontrol` binary unchanged. Do not inject `--sink` on `qcontrol run`: fleet destinations live in `config.toml`, and the running monitor fans events out to those sinks.

At runtime `start -f` starts two components:

1. `Collector` listens on qctl's local sink.
2. `Monitor` runs `qcontrol start -f` so qcontrol's elevated monitor writes the unified event stream to that sink.

The collector receives qcontrol's socket records, parses each JSON event, resolves dependency records, and calls the configured forwarders.

## Custom logic belongs in a forwarder

Do not replace the collector, monitor host, socket protocol, or qcontrol spawning code unless the platform behavior itself needs to change. Those pieces are the reusable foundation of this template.

Application-specific behavior should live behind the `Forwarder` interface in `src/core/forwarder.ts`:

```ts
export interface Forwarder {
  forward(
    event: QcontrolEvent,
    installation?: QcontrolInstallation,
    process?: QcontrolProcess,
  ): void;
}
```

A forwarder receives the parsed qcontrol event and any context the collector was able to resolve. This is where you should transform events, filter noise, enrich payloads for your backend, write to logs, publish to a queue, or call an API.

A typical custom forwarder looks like this:

```ts
import {
  type Forwarder,
  type QcontrolEvent,
  type QcontrolInstallation,
  type QcontrolProcess,
} from "./core/forwarder";

export class CustomForwarder implements Forwarder {
  forward(
    event: QcontrolEvent,
    installation?: QcontrolInstallation,
    process?: QcontrolProcess,
  ): void {
    // Send the event to your destination here.
  }
}
```

Then wire it into `runForeground()` in `src/lifecycle/runtime.ts` in place of
the default `PrettyPrinter` from `src/forwarders/pretty.ts`:

```ts
const forwarder = new CustomForwarder();
const collector = new Collector({
  forwarders: [forwarder],
  socketMode: platformAdapter.shouldOpenDaemonEndpoint() ? 0o666 : undefined,
});
```

You can pass multiple forwarders if you need fan-out. They are called in array order.

## Event context

qcontrol emits a single monitor stream. Host records (`installation.*`, `process.snapshot`) describe inventory. Entity records (`process.started`, `process.stopped`, `llm.*`, `agent.*`, `mcp.*`, `io.*`, and similar) carry a required top-level `entity_id` that identifies one OS process lifetime.

Treat `entity_id` as opaque. The collector copies it from qcontrol; it never invents or parses the value.

The collector keeps indexes of discovered installations and live processes so downstream forwarders do not need to rebuild that resolution.

The forwarder arguments mean:

- `event`: the parsed qcontrol event object exactly as received from the socket sink.
- `installation`: the installation payload associated with the event, when available.
- `process`: the process payload associated with the event, when available.

`installation.discovered` forwards immediately. `process.started` waits only when it names an `installation_id` that has not been seen yet. Capture events wait on `entity_id` until the matching `process.started` or `process.snapshot` entry exists. Installation context is attached when the process has an `installation_id`; it is not required.

`installation.snapshot` and `process.snapshot` replace the collector's current inventory. Request a fresh snapshot from a running monitor with `qcontrol monitor --snapshot` after reconnecting.

Unresolved events are queued briefly to handle out-of-order delivery. The default queue TTL is five minutes and the default maximum queue size is 10,000 events.

## Event types

The forwarder arguments are fully typed. `QcontrolEvent` is a discriminated union over the unified monitor schema, so narrowing on `event.type` gives you the concrete payload type — no casts needed. Payload types can also be imported by name for handler signatures:

```ts
import type { InstallationRecord, LlmRequest } from "./types/qcontrol-events";

function handleLlmRequest(payload: LlmRequest, process?: QcontrolProcess): void {
  // payload.model, payload.system_instructions, ...
}

function handleInstallation(payload: InstallationRecord): void {
  // payload.executable_path, payload.tap.status, ...
}

forward(event: QcontrolEvent, installation?: QcontrolInstallation, process?: QcontrolProcess): void {
  switch (event.type) {
    case "llm.request":
      handleLlmRequest(event.payload, process); // event.payload is LlmRequest here
      break;
    case "installation.discovered":
      handleInstallation(event.payload); // event.payload is InstallationRecord here
      break;
  }
}
```

Unhandled event types fall through silently, so new qcontrol event types do not require code changes.

The underlying types live in `src/types/qcontrol-events.ts` (`EventRecord`): the unified monitor consumer schema. Public-stream custom events arrive as `plugin.event`.

`QcontrolProcess` carries qcontrol's `entity_id` plus the `process.started` payload fields. `tap.status` on an installation is `tapped`, `not_tapped`, or `requires_attention`.

The file is published by qcontrol and updated together with the bundled qcontrol version; do not edit it by hand. `make update-qcontrol` downloads the binary and fetches the TypeScript types from `https://downloads.qpoint.io/qcontrol/docs/events/events.ts`.

## Development

Developer prerequisites:

- Bun for dependency installation, tests, and compiled wrapper builds.
- Make, if you use the repository Makefile.

Install dependencies:

```sh
bun install
```

Build the wrapper binary:

```sh
make build
```

`make build` ensures `bin/qcontrol.bin` exists, downloading qcontrol when needed, then compiles the wrapper to `bin/qctl`.
On Windows, the download script fetches the upstream `qcontrol-latest-windows-x64.tgz` artifact and stores its `qcontrol.exe` payload at `bin\qcontrol.bin` for Bun to embed.

Useful development commands:

```sh
bun run typecheck
bun run test
bun run dev -- --help
make update-qcontrol
make pkg
make clean
```

`make pkg` packages the already-built `bin/qctl` into `dist/qctl-<version>-macos-arm64.pkg`. Inspect a built package with `scripts/macos-pkg/inspect.sh dist/qctl-<version>-macos-arm64.pkg`.

During development, `bun run dev -- <args>` runs the wrapper from source.

## Directories

On first `qctl start` (or any command that launches qcontrol), qctl creates its own tree and seeds `config.toml` with a `[[sinks]]` entry for the collector:

| Kind | macOS | Linux | Windows |
|---|---|---|---|
| Config | `~/.config/qctl/config.toml` | `~/.config/qctl/config.toml` | `%APPDATA%\qctl\config.toml` |
| Data | `~/Library/Application Support/qctl` | `~/.local/share/qctl` | `%LOCALAPPDATA%\qctl` |
| Cache | `~/Library/Caches/qctl` | `~/.cache/qctl` | `%LOCALAPPDATA%\qctl\cache` |
| Collector | `{data}/collector.sock` | `{data}/collector.sock` | `pipe://qctl-collector` |

Those paths are exported to qcontrol as `QCONTROL_CONFIG_DIR`, `QCONTROL_DATA_DIR`, and `QCONTROL_CACHE_DIR`. Existing `config.toml` files are left intact except for adding the collector sink if it is missing.

## Running

```sh
make build
./bin/qctl start        # background
./bin/qctl start -f     # this terminal (pretty summaries)
./bin/qctl start -f --raw
./bin/qctl start --service
./bin/qctl status
./bin/qctl stop
```

`start` re-execs through sudo on macOS and Linux so `qcontrol start -f` can run elevated. `--service` must run from the compiled `qctl` binary. It registers a LaunchDaemon, systemd unit, or Windows service that runs `qctl start -f`. `qctl stop` unregisters that unit.

## Configuration overrides

The wrapper supports these environment variables for integration and deployment work:

- `QCTL_CONFIG_DIR`: qctl config directory (contains `config.toml`). Passed to qcontrol as `QCONTROL_CONFIG_DIR`.
- `QCTL_DATA_DIR`: qctl data directory (start pid, service marker, collector socket on POSIX). `QCTL_STATE_DIR` is accepted as an alias. Passed to qcontrol as `QCONTROL_DATA_DIR`.
- `QCTL_CACHE_DIR`: qctl cache directory. `QCONTROL_WRAPPER_CACHE_DIR` is accepted as an alias. Passed to qcontrol as `QCONTROL_CACHE_DIR`.
- `QCTL_SOCKET_PATH`: collector endpoint. On Windows, a short pipe name such as `qctl-collector` is normalized to `\\.\pipe\qctl-collector`.
- `VERSION`: qcontrol version used by `scripts/download-qcontrol.sh`; defaults to `latest`.

## Notes for template users

The safest customization point is the forwarder implementation and its configuration. If the destination needs secrets or endpoints, load those inside the forwarder or pass them into the forwarder constructor from `runForeground()`.
