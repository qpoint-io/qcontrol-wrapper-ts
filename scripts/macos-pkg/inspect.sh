#!/bin/bash
#
# Inspect a qctl macOS installer package: print payload, identifier,
# version, and postinstall. Exits nonzero if the payload or postinstall does
# not match what the postinstall itself declares (so custom --prefix builds
# still verify correctly).
#
# Usage:
#   scripts/macos-pkg/inspect.sh <pkg-path>
set -euo pipefail

PKG="${1:-}"
if [ -z "$PKG" ]; then
    echo "usage: scripts/macos-pkg/inspect.sh <pkg-path>" >&2
    exit 2
fi
if [ ! -f "$PKG" ]; then
    echo "error: pkg not found: $PKG" >&2
    exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# --expand-full extracts Scripts into real files for postinstall inspection.
pkgutil --expand-full "$PKG" "$work/exp"

info="$work/exp/PackageInfo"
if [ ! -f "$info" ]; then
    echo "error: PackageInfo missing from pkg" >&2
    exit 1
fi

# Isolate the pkg-info element first, then pull its attributes.
pkg_info=$(grep -o '<pkg-info[^>]*>' "$info" | head -1)
identifier=$(echo "$pkg_info" | grep -o 'identifier="[^"]*"' | head -1 | sed 's/.*="\(.*\)"/\1/')
version=$(echo "$pkg_info" | grep -o ' version="[^"]*"' | head -1 | sed 's/.*="\(.*\)"/\1/')

echo "identifier: ${identifier:-<none>}"
echo "version: ${version:-<none>}"

echo "payload:"
payload="$(pkgutil --payload-files "$PKG")"
echo "$payload" | sed 's/^/  /'

postinstall="$work/exp/Scripts/postinstall"
echo "postinstall:"
if [ -f "$postinstall" ]; then
    sed 's/^/  /' "$postinstall"
else
    echo "  <missing>"
fi

status=0
if [ ! -f "$postinstall" ]; then
    echo "error: postinstall script missing" >&2
    exit 1
fi

# Derive expected payload paths from postinstall so --prefix builds stay valid.
# Typical lines: /usr/local/bin/qctl init
#                exec /usr/local/bin/qctl start --service
init_line=$(grep -E '[[:space:]]init([[:space:]]|$)' "$postinstall" | grep -v '^[[:space:]]*#' | head -1 || true)
start_line=$(grep -E 'start[[:space:]]+--service' "$postinstall" | grep -v '^[[:space:]]*#' | head -1 || true)

if [ -z "$init_line" ]; then
    echo "error: postinstall must invoke qctl init" >&2
    status=1
fi
if [ -z "$start_line" ]; then
    echo "error: postinstall must invoke qctl start --service" >&2
    status=1
fi

expected_bin=$(printf '%s\n%s\n' "$init_line" "$start_line" | grep -oE '/[^[:space:]]+/qctl' | head -1 || true)
if [ -n "$expected_bin" ]; then
    rel_bin="${expected_bin#/}"
    echo "expected binary payload: $rel_bin"
    if ! echo "$payload" | grep -q "$rel_bin"; then
        echo "error: expected payload $rel_bin not found" >&2
        status=1
    fi
else
    echo "error: could not parse binary path from postinstall" >&2
    status=1
fi

exit $status
