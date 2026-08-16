# Repository Guidance

This repo is a reference implementation of wrapping qcontrol: a custom app
that bundles qcontrol, listens for its event stream, and sits business
logic on top. It is not a product. User-facing docs live in `README.md`
plus `guides/*.md`. Keep that framing. Do not revive a "ship this binary
as-is" voice.

## Docs

- `README.md` is the intro, the four-step startup sequence, the guide TOC,
  and the file-level reference index.
- Task write-ups live at `guides/{task}.md`. Do not add a parallel `docs/`
  tree or a second README for the same topic.
- `scripts/macos-pkg/README.md` is a pointer at `guides/macos-installer.md`.
- `src/types/qcontrol-events.ts` is generated. Do not edit it by hand;
  refresh it with `make update-qcontrol` (see `guides/event-schema.md`).

When docs change, update the matching guide and the README TOC/reference
if the file list or task names moved.

## Source Layout

Reusable wrapper logic lives in `src/core`: collector, forwarder contract,
monitor host, qcontrol spawning, and the config/path helpers those pieces
share. `src/forwarders` holds Forwarder implementations; `PrettyPrinter` is
the default, and `--raw` selects `RawPrinter`. Custom product logic belongs
in a new Forwarder and is wired in `src/lifecycle/runtime.ts`.

`src/lifecycle` owns start/stop/status placement (foreground, detached,
launchd/systemd/Windows SCM). `src/platform` owns OS-specific adapters.
`src/main.ts` owns `start` / `status` / `stop` and forwards every other
command — including `init` — to the embedded qcontrol binary.

Shared modules should import core pieces from `src/core/*` rather than
growing a parallel copy.

Tests colocate with the module they exercise (`src/core/collector.test.ts`
next to `src/core/collector.ts`). Do not add a separate top-level `tests/`
tree.

## Event Join

The monitor stream is three layers joined by two ids:

- Installation events are the installed agent (name, binary, plugins, MCP,
  skills, …), keyed by installation `id`.
- Process events are one OS process lifetime. They carry `entity_id` (opaque
  globally unique process id) and `installation_id`.
- Every other run event carries only `entity_id`.

The collector maintains `installation_id → installation` and
`entity_id → entity`. Snapshots replace those maps; they do not merge.
See `guides/event-schema.md` and `guides/handling-events.md`. Copy
`entity_id` from qcontrol; never invent or parse it.

## Platform Boundaries

Keep platform-specific behavior behind the platform adapter interfaces.
Shared modules should not add ad hoc `process.platform`, OS path,
environment-variable, or service-manager branches when an adapter method
can own the decision.

When new OS-specific behavior is needed:

1. Add or extend a method on the relevant platform adapter contract.
2. Implement it in each concrete platform adapter.
3. Keep shared code calling the adapter method.
4. Preserve OS-native conventions inside the adapter implementation.

Examples:

- qctl config/data/cache paths belong behind `configPath()`, `dataPath()`,
  and `defaultCacheRoot()`.
- collector endpoints belong behind `defaultCollectorEndpoint()` and
  `sinkUrl()`.
- invoking-user identity for elevated runs belongs behind
  `resolveInvokingUser()`.
- executable names, cache paths, socket/pipe cleanup, and privilege
  behavior belong behind platform adapters.

Shared start/stop orchestration should route platform placement through
lifecycle adapters rather than inline service-manager checks.
