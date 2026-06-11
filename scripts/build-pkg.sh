#!/usr/bin/env sh

set -eu

# Build a macOS installer package for the compiled qctl wrapper.

PKG_IDENTIFIER=${PKG_IDENTIFIER:-io.qpoint.qctl}
VERSION=$(bun -e 'console.log(require("./package.json").version)')
ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BUILD_ROOT="$ROOT_DIR/build/pkgroot"
DIST_DIR="$ROOT_DIR/dist"
PKG_PATH="$DIST_DIR/qctl-$VERSION.pkg"
SCRIPT_ARGS=

if [ -d "$ROOT_DIR/packaging/scripts" ]; then
  SCRIPT_ARGS="--scripts $ROOT_DIR/packaging/scripts"
fi

cd "$ROOT_DIR"

make build

rm -rf "$BUILD_ROOT"
mkdir -p "$BUILD_ROOT/usr/local/bin" "$DIST_DIR"
install -m 755 bin/qctl "$BUILD_ROOT/usr/local/bin/qctl"
if command -v xattr >/dev/null 2>&1; then
  xattr -cr "$BUILD_ROOT" || true
fi

COPYFILE_DISABLE=true pkgbuild \
  --identifier "$PKG_IDENTIFIER" \
  --version "$VERSION" \
  --root "$BUILD_ROOT" \
  --filter '\.DS_Store$' \
  --filter '(^|/)\._' \
  $SCRIPT_ARGS \
  --install-location / \
  "$PKG_PATH"

printf 'Built %s\n' "$PKG_PATH"
