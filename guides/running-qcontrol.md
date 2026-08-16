# Running qcontrol, and forwarding commands transparently

Two related jobs, often done by the same binary:

1. **Start qcontrol as a child** of your app, pointed at *your* config and *your* event sink.
2. **Forward the rest of qcontrol's CLI** through your binary so white-label users never invoke `qcontrol` directly.

This repo does both from [`src/main.ts`](../src/main.ts). `start`, `status`, and `stop` are wrapper-owned. Everything else — including `init`, `monitor`, `run`, and `--help` — is passed through unchanged.

## What this repo does

```ts
switch (args[0]) {
  case "start":  return start(args.slice(1));
  case "status": return status();
  case "stop":   return stop();
  default:       return runQcontrol({ args });
}
```

`qctl init` is a passthrough. The wrapper does not implement initialization. qcontrol does, using the directories and `config.toml` the wrapper already created.

## Config and directories, then the child

Before any qcontrol process is launched, [`ensureQctlLayout()`](../src/core/config.ts) creates the wrapper's config, data, and cache directories and seeds `config.toml` with a `[[sinks]]` entry whose URL is the collector socket.

qcontrol is then pointed at those directories through environment variables, not flags:

| Wrapper env | Passed through to qcontrol as |
|---|---|
| `QCTL_CONFIG_DIR` | `QCONTROL_CONFIG_DIR` |
| `QCTL_DATA_DIR` | `QCONTROL_DATA_DIR` |
| `QCTL_CACHE_DIR` | `QCONTROL_CACHE_DIR` |

[`getQctlEnvironment()`](../src/core/paths.ts) builds that map. When the wrapper is running via `sudo`, it also restores the invoking user's `HOME` so paths do not jump to `/var/root`.

Default locations (override any of them with the `QCTL_*` variables above):

| Kind | macOS | Linux | Windows |
|---|---|---|---|
| Config | `~/.config/qctl/config.toml` | `~/.config/qctl/config.toml` | `%APPDATA%\qctl\config.toml` |
| Data | `~/Library/Application Support/qctl` | `~/.local/share/qctl` | `%LOCALAPPDATA%\qctl` |
| Cache | `~/Library/Caches/qctl` | `~/.cache/qctl` | `%LOCALAPPDATA%\qctl\cache` |
| Collector | `{data}/collector.sock` | `{data}/collector.sock` | `pipe://qctl-collector` |

Existing `config.toml` files are left intact except for adding or updating the marked collector sink. Unrelated settings are yours (or qcontrol's) to keep.

The stock document this repo writes is intentionally small: observe-mode tap, tray on, dash off, and one sink. Change that document if you are white-labeling.

## Spawning qcontrol

[`src/core/qcontrol.ts`](../src/core/qcontrol.ts) is the spawn layer:

- `getQcontrolPath()` — [materialize](bundling-qcontrol.md) the embedded binary.
- `spawnQcontrol` / `runQcontrol` — exec it with the wrapper environment, inherit stdio, forward `SIGINT`/`SIGTERM` so Ctrl-C reaches the child.
- `spawnQcontrolAsRoot` / `runQcontrolAsRoot` — the same through `sudo --preserve-env=...`, used when a one-shot qcontrol command needs privilege.

Passthrough commands use `runQcontrol`. The long-running monitor is a different helper: [`Monitor`](../src/core/monitor.ts) always runs `qcontrol start -f`, and the [foreground runtime](handling-events.md) starts the collector *before* that child.

On macOS and Linux, `qctl start` re-execs the *wrapper* through `sudo` first ([`reexecAsRoot`](../src/lifecycle/process.ts)) so the collector and the monitor share an elevated process. Windows does not elevate here.

## Transparent forwarding

Unknown argv is handed to qcontrol with no rewriting. This repo does not inject `--sink` on `qcontrol run`. Fleet destinations live in `config.toml`; the running monitor fans events out to those sinks.

That is why `qctl init` works without a wrapper implementation: the compiled binary materializes qcontrol, sets `QCONTROL_CONFIG_DIR` and friends, and execs `qcontrol init`. The [macOS installer](macos-installer.md) relies on that.

## What you can ignore

- Owning `start` / `stop` / `status` in the same binary. A GUI or service host can spawn qcontrol itself and never expose a CLI.
- Passthrough. If you do not want users running `qcontrol` subcommands, do not forward them.
- The specific `config.toml` defaults. You need a sink URL qcontrol will write to. The rest is product policy.
- Re-execing the whole wrapper as root. You can elevate only the qcontrol child. This app elevates the wrapper so the privileged monitor can connect to a socket the wrapper also owns.
