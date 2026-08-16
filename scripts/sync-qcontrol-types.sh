#!/usr/bin/env sh

set -eu

# Download published TypeScript event types so the wrapper schema stays aligned
# with the bundled qcontrol binary. Apps using this repo as a reference do not
# need a qcontrol source checkout.

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
URL=${QCONTROL_EVENTS_URL:-https://downloads.qpoint.io/qcontrol/docs/events/events.ts}
DEST=$ROOT/src/types/qcontrol-events.ts

tmpdir=$(mktemp -d)

cleanup() {
    rm -rf "$tmpdir"
}
trap cleanup EXIT INT TERM

mkdir -p "$(dirname "$DEST")"

printf 'Downloading qcontrol event types from %s\n' "$URL"
curl -fsSL "$URL" >"$tmpdir/events.ts"
mv "$tmpdir/events.ts" "$DEST"

printf 'Synced qcontrol event types to %s\n' "$DEST"
