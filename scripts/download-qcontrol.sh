#!/usr/bin/env sh

set -eu

# Download URL format mirrors https://get.qpoint.io/qcontrol/download.

VERSION=${VERSION:-latest}
OUTPUT=${1:-vendor/qcontrol.bin}

OS=
ARCH=

case "$(uname -s)" in
Linux)
    OS="linux"
    ;;
Darwin)
    OS="macos"
    ;;
MINGW* | MSYS* | CYGWIN*)
    OS="win"
    ;;
*)
    printf >&2 'unsupported operating system: %s\n' "$(uname -sr)"
    exit 1
    ;;
esac

case "$(uname -m)" in
x86_64)
    ARCH="amd64"
    ;;
aarch64 | arm64)
    ARCH="arm64"
    ;;
*)
    printf >&2 'unsupported architecture: %s\n' "$(uname -m)"
    exit 1
    ;;
esac

url="https://downloads.qpoint.io/qcontrol/qcontrol-${VERSION}-${OS}-${ARCH}.tgz"
tmpdir=$(mktemp -d)

cleanup() {
    rm -rf "$tmpdir"
}
trap cleanup EXIT INT TERM

mkdir -p "$(dirname "$OUTPUT")"

printf 'Downloading qcontrol %s for %s/%s\n' "$VERSION" "$OS" "$ARCH"
curl -fsSL "$url" >"$tmpdir/qcontrol.tgz"
tar -xzf "$tmpdir/qcontrol.tgz" -C "$tmpdir"
chmod +x "$tmpdir/qcontrol"
mv "$tmpdir/qcontrol" "$OUTPUT"

printf 'Installed %s at %s\n' "$("$OUTPUT" --version)" "$OUTPUT"
