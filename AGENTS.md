# Repository Guidance

## Source Layout

Reusable wrapper logic lives in `src/core`: collector, forwarder contract,
monitor host, qcontrol spawning, and the config/path helpers those pieces
share. `src/forwarders` holds Forwarder implementations; `PrettyPrinter` is the
default, and `--raw` selects `RawPrinter`. `src/lifecycle` owns start/stop placement. `src/platform` owns
OS-specific adapters. Shared modules should import core pieces from
`src/core/*` rather than growing a parallel copy.

Tests colocate with the module they exercise (`src/core/collector.test.ts`
next to `src/core/collector.ts`). Do not add a separate top-level `tests/`
tree.

## Platform Boundaries

Keep platform-specific behavior behind the platform adapter interfaces. Shared
modules should not add ad hoc `process.platform`, OS path, environment-variable,
or service-manager branches when an adapter method can own the decision.

When new OS-specific behavior is needed:

1. Add or extend a method on the relevant platform adapter contract.
2. Implement it in each concrete platform adapter.
3. Keep shared code calling the adapter method.
4. Preserve OS-native conventions inside the adapter implementation.

Examples:

- qctl config/data/cache paths belong behind `configPath()`, `dataPath()`,
  and `defaultCacheRoot()`.
- collector endpoints belong behind `defaultCollectorEndpoint()` and `sinkUrl()`.
- invoking-user identity for elevated runs belongs behind
  `resolveInvokingUser()`.
- executable names, cache paths, socket/pipe cleanup, and privilege behavior
  belong behind platform adapters.

Shared start/stop orchestration should route platform placement through
lifecycle adapters rather than inline service-manager checks.
