#!/bin/sh
# Builds the Find My helper and code-signs it with a stable identity + identifier so
# macOS keeps its Accessibility permission across rebuilds. Identity defaults to the
# first "Apple Development" cert; override with FINDMY_SIGN_IDENTITY in the environment.
set -e
cd "$(dirname "$0")/.."
mkdir -p server/bin
swiftc -O -o server/bin/findmy-people server/findmy.swift
ID="${FINDMY_SIGN_IDENTITY:-Apple Development}"
if codesign --force --sign "$ID" --identifier com.coelho.findmy-people --timestamp=none server/bin/findmy-people 2>/dev/null; then
  echo "signed findmy-people (com.coelho.findmy-people)"
else
  echo "WARNING: could not sign with '$ID'; Accessibility must be re-granted after this rebuild" >&2
fi
