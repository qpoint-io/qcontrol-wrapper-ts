# macOS package kit

Everything needed to build a qctl `.pkg` from an already-built binary.

## Scripts

| Script | Role |
|--------|------|
| `build.sh` | Build the `.pkg` from a compiled `qctl` |
| `inspect.sh` | Print payload/postinstall; smoke-check structure |

## Default install layout

With `--prefix /usr/local` (default):

| Path | Role |
|------|------|
| `$prefix/bin/qctl` | CLI binary |
| postinstall | `qctl init` then `qctl start --service` |

## Build

```bash
# Defaults: prefix /usr/local
scripts/macos-pkg/build.sh --binary bin/qctl --version 1.2.3

# Custom install prefix (e.g. /opt/qctl)
scripts/macos-pkg/build.sh --binary bin/qctl --version 1.2.3 \
  --prefix /opt/qctl

# Fully custom bin dir
scripts/macos-pkg/build.sh --binary bin/qctl --version 1.2.3 \
  --bin-dir /opt/qctl/bin

# Inspect
scripts/macos-pkg/inspect.sh dist/qctl-1.2.3-macos-arm64.pkg
```

`make pkg` calls `build.sh` with the default prefix after `make build`.

## Install

The package is unsigned, so install it from a terminal rather than double-clicking:

```bash
sudo installer -pkg dist/qctl-1.2.3-macos-arm64.pkg -target /
```

That copies `qctl` into place and runs the postinstall as root (`qctl init`, then `qctl start --service`).
