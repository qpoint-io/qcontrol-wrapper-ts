#!/usr/bin/env sh

set -eu

# Verify the package metadata and payload path expected by qctl releases.

EXPECTED_IDENTIFIER=${EXPECTED_IDENTIFIER:-io.qpoint.qctl}
PKG=${1:-dist/qctl-$(bun -e 'console.log(require("./package.json").version)').pkg}
TMPDIR=$(mktemp -d)

cleanup() {
  rm -rf "$TMPDIR"
}
trap cleanup EXIT INT TERM

pkgutil --expand "$PKG" "$TMPDIR/expanded"

identifier=$(python3 - "$TMPDIR/expanded/PackageInfo" <<'PY'
import sys
import xml.etree.ElementTree as ET
print(ET.parse(sys.argv[1]).getroot().attrib.get("identifier", ""))
PY
)
if [ "$identifier" != "$EXPECTED_IDENTIFIER" ]; then
  printf >&2 'unexpected package identifier: got %s, expected %s\n' "$identifier" "$EXPECTED_IDENTIFIER"
  exit 1
fi

if ! pkgutil --payload-files "$PKG" | sed 's#^\./##' | grep -qx 'usr/local/bin/qctl'; then
  printf >&2 'package payload is missing usr/local/bin/qctl\n'
  exit 1
fi

printf 'Verified %s (%s)\n' "$PKG" "$EXPECTED_IDENTIFIER"
