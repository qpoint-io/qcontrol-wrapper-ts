# qcontrol wrapper template

This repository is a working TypeScript wrapper around `qcontrol` for applications that need to collect qcontrol events and report them to a custom destination. It is intended to be used as the foundation for that kind of app: keep the wrapper, collector, scanner, install flow, and embedded qcontrol handling in place, then implement your product-specific reporting logic as a forwarder.

The default implementation already handles the parts that should not need to be rebuilt for each integration:

- bundles and materializes the upstream `qcontrol` binary
- proxies unknown CLI commands through to `qcontrol`
- installs a macOS LaunchDaemon for the long-running scanner
- configures qcontrol's run-event Unix socket sink
- collects newline-delimited JSON records from that socket
- resolves installation and process context before delivery
- forwards complete event records to one or more `Forwarder` implementations

## Architecture

`qctl` is the wrapper binary built from `src/main.ts`. Wrapper-owned commands are handled locally:

- `qctl install`
- `qctl uninstall`
- `qctl start`
- `qctl stop`
- `qctl daemon`

Any other arguments are passed through to the embedded `qcontrol` binary unchanged.

At runtime the daemon starts two components:

1. `Collector` listens on qctl's Unix socket sink.
2. `Scanner` runs `qcontrol scan --processes --watch --sink <socket>`.

The collector receives qcontrol's socket records, parses each JSON event, resolves dependency records, and calls the configured forwarders.

## Custom logic belongs in a forwarder

Do not replace the collector, scanner, installer, socket protocol, or qcontrol spawning code unless the platform behavior itself needs to change. Those pieces are the reusable foundation of this template.

Application-specific behavior should live behind the `Forwarder` interface in `src/forwarder.ts`:

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
} from "./forwarder";

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

Then wire it into `daemon()` in `src/main.ts`:

```ts
const forwarder = new CustomForwarder();
const collector = new Collector({
  forwarders: [forwarder],
  socketMode: shouldOpenDaemonSocket() ? 0o666 : undefined,
});
```

You can pass multiple forwarders if you need fan-out. They are called in array order.

## Event context

qcontrol emits root records such as `installation.discovered` and `process.started`, then emits runtime events that refer back to those records. The collector keeps indexes of discovered installations and started processes so downstream forwarders do not need to rebuild that dependency resolution.

The forwarder arguments mean:

- `event`: the parsed qcontrol event object exactly as received from the socket sink.
- `installation`: the installation payload associated with the event, when available.
- `process`: the process payload associated with the event, when available.

For `installation.discovered`, the installation argument is the event's own payload. For `process.started`, both the related installation and process payload are provided after the installation has been seen. For other runtime events, the collector waits until both dependencies can be resolved before forwarding.

Dependency lookup uses qcontrol metadata in this order:

- installation id from `event.run.installation_id`, then `event.payload.installation_id`
- process pid from `event.run.agent_pid`, then `event.run.run_pid`, then `event.payload.pid`

Unresolved events are queued briefly to handle out-of-order delivery. The default queue TTL is five minutes and the default maximum queue size is 10,000 events.

## Event types

The forwarder arguments are fully typed. `QcontrolEvent` is a discriminated union over every run and scan record, so narrowing on `event.type` gives you the concrete payload type — no casts needed. Payload types can also be imported by name for handler signatures:

```ts
import type { LlmRequest } from "./types/qcontrol-run";
import type { InstallationRecord } from "./types/qcontrol-scan";

function handleLlmRequest(payload: LlmRequest, process?: QcontrolProcess): void {
  // payload.model, payload.system_instructions, ...
}

function handleInstallation(payload: InstallationRecord): void {
  // payload.executable_path, payload.tap, ...
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

The underlying types live in `src/types/`:

- `qcontrol-run.ts` (`RunRecord`): records from `qcontrol run` workloads
- `qcontrol-scan.ts` (`ScanEvent`): records from `qcontrol scan`
- `plugin.ts` (`PluginEvent`): custom events from third-party qcontrol plugins

`QcontrolProcess` additionally carries `entity_id` (`pid:<pid>:start:<unix-epoch-seconds>`), a globally unique process identifier the collector derives from `pid` and `started_at`.

The files are auto-generated from qcontrol's event schemas and updated together with the bundled qcontrol version; do not edit them by hand.

## Development

Install dependencies:

```sh
bun install
```

Build the wrapper binary:

```sh
make build
```

`make build` ensures `vendor/qcontrol.bin` exists, downloading qcontrol when needed, then compiles the wrapper to `bin/qctl`.

Useful development commands:

```sh
bun run typecheck
bun run dev -- --help
make update-qcontrol
make clean
```

Build the macOS installer package:

```sh
make pkg
```

The package is written to `dist/qctl-<version>.pkg` with package identifier `io.qpoint.qctl`. It installs the compiled wrapper at `/usr/local/bin/qctl` and runs a root-only `postinstall` hook that invokes `/usr/local/bin/qctl install-system`. That system setup installs the root-owned LaunchDaemon/log/runtime assets only, with the daemon listening on the stable package socket `/var/run/qctl/collector.sock`; qcontrol trust/user initialization and per-user qcontrol sink setup are intentionally separate. Each user who should send qcontrol events to qctl should run `/usr/local/bin/qctl init-user` once that user initialization command is available.

Inspect a package before installing it:

```sh
scripts/verify-pkg.sh dist/qctl-0.1.0.pkg
pkgutil --payload-files dist/qctl-0.1.0.pkg
```

Install the package locally:

```sh
sudo installer -pkg dist/qctl-0.1.0.pkg -target /
```

Verify the installed binary:

```sh
/usr/local/bin/qctl --version
```

During development, `bun run dev -- <args>` runs the wrapper from source. Installation should be performed with the compiled binary unless `QCTL_EXECUTABLE` points at a compiled wrapper, because launchd must execute a stable binary path.

## Operator instructions

These instructions assume the custom forwarder has already been implemented and the wrapper has been built.

1. Build the binary:

   ```sh
   make build
   ```

2. Install qctl and qcontrol host integration:

   ```sh
   ./bin/qctl install
   ```

   The install command initializes qcontrol with sudo, appends qctl's socket sink to the user's qcontrol `run.toml`, and installs the root LaunchDaemon at `/Library/LaunchDaemons/com.qpoint.qctl.plist`.

3. Start the daemon:

   ```sh
   ./bin/qctl start
   ```

   This bootstraps the LaunchDaemon into the system launchd domain and kickstarts it immediately.

4. Check daemon logs if needed:

   ```sh
   tail -f /Library/Logs/qctl/stdout.log
   tail -f /Library/Logs/qctl/stderr.log
   ```

5. Stop the daemon:

   ```sh
   ./bin/qctl stop
   ```

6. Uninstall qctl's daemon and socket sink:

   ```sh
   ./bin/qctl uninstall
   ```

The daemon socket defaults to `/var/run/qctl/collector.sock`. qcontrol run configuration defaults to `$XDG_CONFIG_HOME/qcontrol/run.toml` or `~/.config/qcontrol/run.toml`.

## Configuration overrides

The wrapper supports these environment variables for integration and deployment work:

- `QCTL_EXECUTABLE`: compiled qctl binary path to write into the LaunchDaemon plist during install.
- `QCTL_CONFIG_DIR`: qcontrol config directory used by install and the daemon.
- `QCTL_SOCKET_PATH`: Unix socket path used by the collector and qcontrol sink config.
- `QCONTROL_WRAPPER_CACHE_DIR`: cache root where the embedded qcontrol binary is materialized.
- `VERSION`: qcontrol version used by `scripts/download-qcontrol.sh`; defaults to `latest`.

## Notes for template users

Keep the wrapper contract stable for operators: `install`, `start`, `stop`, and `uninstall` should continue to work after the custom forwarder is added. The safest customization point is the forwarder implementation and its configuration. If the destination needs secrets or endpoints, load those inside the forwarder or pass them into the forwarder constructor from `daemon()`.
