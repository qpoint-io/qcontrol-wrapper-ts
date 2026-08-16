#!/bin/bash
#
# Build a macOS .pkg for qctl from an already-built binary.
#
# Single source of truth for pkg creation (`make pkg` and CI both call this).
# Does not build the binary — only packages it.
#
# Default install layout (--prefix /usr/local):
#   $prefix/bin/qctl
#   postinstall → qctl init && qctl start --service
#
# Usage:
#   scripts/macos-pkg/build.sh --binary bin/qctl --version 1.2.3 \
#       [--output-dir dist] [--prefix /usr/local] [--bin-dir DIR]
set -euo pipefail

BINARY="bin/qctl"
VERSION=""
OUTPUT_DIR="dist"
IDENTIFIER="io.qpoint.qctl"

# Install locations (absolute on the target Mac). Defaults follow --prefix.
PREFIX="/usr/local"
BIN_DIR=""

while [ $# -gt 0 ]; do
    case "$1" in
        --binary) BINARY="$2"; shift 2 ;;
        --version) VERSION="$2"; shift 2 ;;
        --output-dir) OUTPUT_DIR="$2"; shift 2 ;;
        --prefix) PREFIX="$2"; shift 2 ;;
        --bin-dir) BIN_DIR="$2"; shift 2 ;;
        -h|--help)
            sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *) echo "unknown argument: $1" >&2; exit 2 ;;
    esac
done

if [ -z "$VERSION" ]; then
    echo "error: --version is required" >&2
    exit 2
fi
if [ ! -f "$BINARY" ]; then
    echo "error: binary not found: $BINARY" >&2
    echo "hint: run make build first" >&2
    exit 1
fi

# Resolve install paths (absolute; no trailing slash).
PREFIX="${PREFIX%/}"
if [ -z "$BIN_DIR" ]; then
    BIN_DIR="$PREFIX/bin"
fi
BIN_DIR="${BIN_DIR%/}"

# Require absolute target paths so staging under / is unambiguous.
case "$BIN_DIR" in
    /*) ;;
    *) echo "error: --bin-dir must be absolute (got: $BIN_DIR)" >&2; exit 2 ;;
esac

INSTALL_BIN="$BIN_DIR/qctl"

# Staging mirrors the on-disk install tree; pkgbuild --install-location / maps 1:1.
staging="$(mktemp -d)"
scripts_dir="$(mktemp -d)"
trap 'rm -rf "$staging" "$scripts_dir"' EXIT

mkdir -p "$staging$BIN_DIR"
install -m 0755 "$BINARY" "$staging$INSTALL_BIN"

# Minimal postinstall: the install path is baked from this build so prefix
# changes do not require a separate policy file.
cat > "$scripts_dir/postinstall" <<EOF
#!/bin/bash
set -euo pipefail
${INSTALL_BIN} init
exec ${INSTALL_BIN} start --service
EOF
chmod 0755 "$scripts_dir/postinstall"

mkdir -p "$OUTPUT_DIR"
pkg_path="$OUTPUT_DIR/qctl-$VERSION-macos-arm64.pkg"

pkgbuild \
    --root "$staging" \
    --identifier "$IDENTIFIER" \
    --version "$VERSION" \
    --install-location / \
    --scripts "$scripts_dir" \
    "$pkg_path"

echo "built $pkg_path"
echo "  binary: $INSTALL_BIN"
