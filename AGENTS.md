# Repository Guidance

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

- qcontrol config paths belong behind `PlatformAdapter.configPath()`.
- collector endpoints belong behind `defaultCollectorEndpoint()` and `sinkUrl()`.
- executable names, cache paths, socket/pipe cleanup, and privilege behavior
  belong behind platform adapters.

Installer and service-manager code may use native OS tools directly, but shared
lifecycle orchestration should route platform decisions through platform
lifecycle modules rather than inline platform checks.
