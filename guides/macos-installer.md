# Building a native macOS installer package

A white-label macOS app often needs a `.pkg` that drops the wrapper on disk and starts it. This repo's package installs the compiled `qctl` binary and lets qcontrol initialize the machine, then registers the [LaunchDaemon](daemon-service.md).

There is no Windows or Linux installer in this tree. Copy the idea, not the scripts, if you need those.

## What this repo does

`make pkg` compiles `bin/qctl` if needed, then runs [`scripts/macos-pkg/build.sh`](../scripts/macos-pkg/build.sh). The artifact lands in `dist/qctl-<version>-macos-arm64.pkg`. The version is the exact git tag when you are on one, otherwise the short SHA.

The package does **not** build the binary itself. It only stages an already-compiled `qctl`.

Default install layout (`--prefix /usr/local`):

| Path | Role |
|---|---|
| `/usr/local/bin/qctl` | The wrapper CLI, with qcontrol embedded. |
| postinstall | `qctl init`, then `qctl start --service`. |

`qctl init` is a [passthrough](running-qcontrol.md). The wrapper materializes qcontrol, points it at the wrapper-owned config/data/cache directories, and execs `qcontrol init`. qcontrol performs whatever system initialization it needs. The wrapper does not implement an `init` command.

`qctl start --service` is wrapper-owned: it registers `com.qpoint.qctl` as a LaunchDaemon that runs `qctl start -f`.

## Build

```sh
make build
make pkg
```

Or call the script directly:

```sh
scripts/macos-pkg/build.sh --binary bin/qctl --version 1.2.3

# Custom install prefix
scripts/macos-pkg/build.sh --binary bin/qctl --version 1.2.3 \
  --prefix /opt/qctl

# Fully custom bin dir
scripts/macos-pkg/build.sh --binary bin/qctl --version 1.2.3 \
  --bin-dir /opt/qctl/bin
```

The install path is baked into the generated postinstall, so a prefix change does not need a separate policy file. Identifier is `io.qpoint.qctl`. Change that when you white-label.

Inspect a built package:

```sh
scripts/macos-pkg/inspect.sh dist/qctl-1.2.3-macos-arm64.pkg
```

[`inspect.sh`](../scripts/macos-pkg/inspect.sh) prints identifier, version, payload, and postinstall, then checks that postinstall calls `qctl init` and `qctl start --service`, and that the binary those lines name is actually in the payload.

## Install

The package is unsigned. Install it from a terminal rather than double-clicking:

```sh
sudo installer -pkg dist/qctl-<version>-macos-arm64.pkg -target /
```

That copies `qctl` into place and runs the postinstall as root. Because postinstall runs `start --service`, the machine is left with a LaunchDaemon and a live collector/monitor.

## What you can ignore

- pkgbuild, this identifier, this prefix. Any packager that drops your binary and runs "initialize qcontrol, then start my service" is the same pattern.
- Calling the binary `qctl`.
- Signing and notarization. This example does not do them. A real product will.
- Bundling a separate qcontrol installer. The wrapper binary already contains qcontrol.
