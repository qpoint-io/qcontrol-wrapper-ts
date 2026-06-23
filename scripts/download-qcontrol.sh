#!/usr/bin/env sh

set -eu

# Download URL format mirrors https://get.qpoint.io/qcontrol/download.

VERSION=${VERSION:-latest}
OUTPUT=${1:-bin/qcontrol.bin}

OS=
ARCH=
BINARY_NAME=qcontrol

case "$(uname -s)" in
Linux)
    OS="linux"
    ;;
Darwin)
    OS="macos"
    ;;
MINGW* | MSYS* | CYGWIN*)
    OS="windows"
    BINARY_NAME=qcontrol.exe
    ;;
*)
    printf >&2 'unsupported operating system: %s\n' "$(uname -sr)"
    exit 1
    ;;
esac

case "$(uname -m)" in
x86_64)
    if [ "$OS" = "windows" ]; then
        ARCH="x64"
    else
        ARCH="amd64"
    fi
    ;;
aarch64 | arm64)
    if [ "$OS" = "windows" ]; then
        printf >&2 'unsupported Windows architecture: %s\n' "$(uname -m)"
        exit 1
    fi
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
chmod +x "$tmpdir/$BINARY_NAME"
mv "$tmpdir/$BINARY_NAME" "$OUTPUT"

printf 'Installed %s at %s\n' "$("$OUTPUT" --version)" "$OUTPUT"
