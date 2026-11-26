#!/bin/bash
# Export the app for web with the harness Metro config (native modules stubbed,
# Firebase pointed at the local emulators). The config lives in the repo root
# only while this script runs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="${1:-$ROOT/scripts/fb-tests/.build/web-dist}"
cd "$ROOT"
if [ -e metro.config.js ]; then echo "metro.config.js already exists in the repo root — refusing to overwrite it" >&2; exit 1; fi
cp scripts/fb-tests/web/metro.harness.js metro.config.js
trap 'rm -f "$ROOT/metro.config.js"' EXIT
rm -rf "$OUT"
npx expo export --platform web --dev --output-dir "$OUT"
echo "web build ready: $OUT"
