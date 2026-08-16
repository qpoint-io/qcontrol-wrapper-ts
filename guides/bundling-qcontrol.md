# Fetching and bundling the latest qcontrol

A wrapper ships qcontrol inside the app. Users should not have to install qcontrol separately.

This repo treats qcontrol as a build-time asset: download a published binary, embed it into the compiled wrapper, and write it out to a cache the first time the app needs to run it.

## What this repo does

1. **Download** a platform tarball from `https://downloads.qpoint.io/qcontrol/` into `bin/qcontrol.bin`.
2. **Embed** that file at compile time with Bun's `with { type: "file" }` import.
3. **Materialize** it at runtime into a content-addressed cache directory, chmod it, and exec that path.

`make build` depends on `bin/qcontrol.bin`, so a missing binary is fetched before the compile. `make update-qcontrol` re-downloads the binary and also refreshes the [event schema](event-schema.md).

Pin a version with `VERSION=1.2.3 make update-qcontrol`. The default is `latest`.

## Download

[`scripts/download-qcontrol.sh`](../scripts/download-qcontrol.sh) maps `uname` to the published artifact name (`qcontrol-${VERSION}-${os}-${arch}.tgz`), extracts the `qcontrol` (or `qcontrol.exe`) payload, and writes it to `bin/qcontrol.bin`.

Supported targets in this script: macOS amd64/arm64, Linux amd64/arm64, Windows x64. Extend or replace the script if you ship other platforms.

On Windows the tarball contains `qcontrol.exe`; the script still stores it at `bin/qcontrol.bin` so the Bun embed path stays the same across OSes. The runtime writes it back out as `qcontrol.exe`.

## Embed

[`src/core/qcontrol.ts`](../src/core/qcontrol.ts) imports the asset:

```ts
import embeddedQcontrolPath from "../../bin/qcontrol.bin" with { type: "file" };
```

[`src/assets.d.ts`](../src/assets.d.ts) is the TypeScript declaration that makes that import type-check. `bun build --compile` packages the bytes into `bin/qctl` (or `bin/qctl.exe`).

## Materialize at runtime

`getQcontrolPath()` writes the embedded bytes into the wrapper cache, keyed by asset name, size, and mtime. A matching cache hit is reused; a changed bundle invalidates the entry.

The cache root is a platform path (`defaultCacheRoot()` on the [platform adapter](../src/platform/types.ts)), overridable with `QCTL_CACHE_DIR`. The executable name is also an adapter concern (`qcontrol` vs `qcontrol.exe`).

Every spawn path goes through `prepareQcontrolRun()`, which materializes the binary before exec. You do not call the download script at runtime.

## What you can ignore

- Bun's file embed. Ship qcontrol next to your binary, download it on first run, or require a system install.
- The `bin/qcontrol.bin` naming trick. Use whatever layout your packager likes.
- The content-addressed cache. A fixed extract path is enough if you only ever bundle one version.
- Updating types in the same make target. Binary and schema can move on different cadences; this repo keeps them together so the checked-in types match the checked-in binary.

The only requirement is: when your app starts qcontrol, it has a real executable path to pass to the OS.
