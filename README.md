# qcontrol wrapper reference

You are wrapping [qcontrol](https://qpoint.io) with a custom application — to white-label it, or to add additional business logic on the event stream it produces. This repository is a reference-only example of doing just that.

Anything this app does can be copied, or used only as a reference. Ignore any part. Bring your own language, layout, packaging, or patterns. The stack here (Bun, TypeScript, a CLI named `qctl`) is incidental.

## What has to happen

At a high level, a wrapper owns qcontrol as a bundled child, not as a separate product the user installs. When your app starts, this is the sequence that needs to occur:

1. **Generate a qcontrol config** that names a socket (or named pipe) your app will listen on. qcontrol writes events to that sink; your app does not poll qcontrol for them.
2. **Bind a listener on that socket first.** qcontrol connects as soon as its monitor starts, so the endpoint has to exist before the child is launched.
3. **Materialize the bundled qcontrol binary and run it as a subprocess** (`qcontrol start -f`). On macOS and Linux the monitor usually needs root, so this app re-execs through `sudo` before spawning that child.
4. **Handle events as they arrive.** This is where white-label behavior and custom business logic live. In this repo that is a `Forwarder`; the default implementation just pretty-prints the stream.

Run events join back to a process (`entity_id`) and from there to an installed agent (`installation_id`). The [event schema](guides/event-schema.md#how-events-join) is the model; the [collector](guides/handling-events.md#connecting-events-to-processes-and-installations) is one implementation of the two lookup tables.

This app's example "business logic" is printing events. Replace that. Keep, rewrite, or throw away everything around it.

## Guides

This repo is structured as a reference for the things a real wrapper might need. Every task is optional. Steal the pieces you care about:

- [Fetching and bundling the latest qcontrol](guides/bundling-qcontrol.md)
- [Running qcontrol, and forwarding commands transparently](guides/running-qcontrol.md)
- [Understanding the event schema and fetching the latest](guides/event-schema.md)
- [Binding to the event socket and handling events](guides/handling-events.md)
- [Running the app as a daemonized service](guides/daemon-service.md)
- [Building a native macOS installer package](guides/macos-installer.md)
- [Re-generating a snapshot if the listener gets stale](guides/snapshots.md)

## Reference

Index of the files a builder is most likely to open. Each entry is what that file does in *this* app, not a prescription for yours.

### Core

| File | Role |
|---|---|
| [`src/core/config.ts`](src/core/config.ts) | Creates the wrapper's config/data/cache directories and seeds `config.toml` with a fleet sink pointing at the collector. |
| [`src/core/paths.ts`](src/core/paths.ts) | Resolves the collector endpoint and the `QCONTROL_*` environment every qcontrol child inherits. |
| [`src/core/qcontrol.ts`](src/core/qcontrol.ts) | Materializes the embedded qcontrol binary into a cache and exposes spawn/run helpers. |
| [`src/core/monitor.ts`](src/core/monitor.ts) | Owns the long-running `qcontrol start -f` subprocess. |
| [`src/core/collector.ts`](src/core/collector.ts) | Binds the local sink, parses newline-delimited JSON, resolves installation/process context, and calls forwarders. |
| [`src/core/forwarder.ts`](src/core/forwarder.ts) | The `Forwarder` contract and the event / installation / process types handlers receive. |
| [`src/core/index.ts`](src/core/index.ts) | Re-exports the core modules. |

### Event handling

| File | Role |
|---|---|
| [`src/types/qcontrol-events.ts`](src/types/qcontrol-events.ts) | Generated unified monitor schema. Do not edit by hand. |
| [`src/forwarders/pretty.ts`](src/forwarders/pretty.ts) | Default forwarder: one summary line per event on stdout. |
| [`src/forwarders/raw.ts`](src/forwarders/raw.ts) | Alternate forwarder: one JSON object per line, with resolved context attached. |
| [`src/forwarders/summarize.ts`](src/forwarders/summarize.ts) | Per-type one-line summaries used by the pretty printer. |
| [`src/forwarders/text.ts`](src/forwarders/text.ts) | Truncation helpers for terminal output. |
| [`src/forwarders/index.ts`](src/forwarders/index.ts) | Re-exports the example forwarders. |

### Service lifecycle

| File | Role |
|---|---|
| [`src/lifecycle/index.ts`](src/lifecycle/index.ts) | `start` / `stop` / `status` orchestration and platform service routing. |
| [`src/lifecycle/mode.ts`](src/lifecycle/mode.ts) | Parses `start` flags into foreground, detached, or service placement. |
| [`src/lifecycle/runtime.ts`](src/lifecycle/runtime.ts) | In-process collector-plus-monitor loop (`start -f`). Wires the example forwarder. |
| [`src/lifecycle/direct.ts`](src/lifecycle/direct.ts) | Detached background start: spawn `start -f` and return. |
| [`src/lifecycle/macos.ts`](src/lifecycle/macos.ts) | Registers a LaunchDaemon that runs `start -f`. |
| [`src/lifecycle/linux.ts`](src/lifecycle/linux.ts) | Registers a systemd unit that runs `start -f`. |
| [`src/lifecycle/windows.ts`](src/lifecycle/windows.ts) | Registers a Windows service whose binPath is `start -f`. |
| [`src/lifecycle/state.ts`](src/lifecycle/state.ts) | Pid file and service-manager marker so `stop` and `status` know what was placed. |
| [`src/lifecycle/process.ts`](src/lifecycle/process.ts) | Privilege checks, sudo re-exec, and the argv used to re-invoke this wrapper. |

### Platform and packaging

| File | Role |
|---|---|
| [`src/platform/types.ts`](src/platform/types.ts) | `PlatformAdapter` contract: paths, sink URL, elevation, socket/pipe prep. |
| [`src/platform/index.ts`](src/platform/index.ts) | Selects the adapter for the current OS. |
| [`src/platform/posix.ts`](src/platform/posix.ts) | Shared macOS/Linux paths, Unix sockets, and executable bits. |
| [`src/platform/macos.ts`](src/platform/macos.ts) | macOS adapter. |
| [`src/platform/linux.ts`](src/platform/linux.ts) | Linux adapter. |
| [`src/platform/windows.ts`](src/platform/windows.ts) | Windows paths and named-pipe sinks. |
| [`src/main.ts`](src/main.ts) | CLI entry: owns `start` / `status` / `stop`, forwards every other command to qcontrol. |
| [`src/assets.d.ts`](src/assets.d.ts) | TypeScript declaration so Bun can embed `*.bin` files. |
| [`scripts/download-qcontrol.sh`](scripts/download-qcontrol.sh) | Fetches a platform qcontrol tarball into `bin/qcontrol.bin`. |
| [`scripts/sync-qcontrol-types.sh`](scripts/sync-qcontrol-types.sh) | Downloads the published TypeScript event schema. |
| [`scripts/macos-pkg/build.sh`](scripts/macos-pkg/build.sh) | Builds a macOS `.pkg` from an already-compiled wrapper binary. |
| [`scripts/macos-pkg/inspect.sh`](scripts/macos-pkg/inspect.sh) | Prints and smoke-checks a built `.pkg`. |

## Running this repo locally

This is only for exploring the example. Your app does not need this toolchain.

```sh
bun install
make build          # downloads qcontrol if needed, compiles bin/qctl
make update-qcontrol
bun test
bun run typecheck
```

`make update-qcontrol` refreshes both the bundled binary and the generated event types. `make pkg` (macOS) packages `bin/qctl` into `dist/`.

## License

[MIT](LICENSE) © 2026 Qpoint, Inc.
