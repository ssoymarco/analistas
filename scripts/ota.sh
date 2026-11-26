#!/bin/bash
# Publish an over-the-air update to ONE platform and ONE installed app version.
#
#   scripts/ota.sh <ios|android> <app version> "<message>"
#   e.g. scripts/ota.sh android 1.2.2 "feat: datos nuevos"
#
# An update only reaches installed apps whose version equals `expo.version` in
# app.json when it is published (runtimeVersion policy "appVersion"). This sets
# that version just for the publish and always puts app.json back, so it can't
# be left (or committed) at an old version by accident.
#
# DRY_RUN=1 shows what would be published without calling EAS.
set -euo pipefail

PLATFORM="${1:-}"; VERSION="${2:-}"; MESSAGE="${3:-}"
if [[ "$PLATFORM" != "ios" && "$PLATFORM" != "android" ]] || [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || [[ -z "$MESSAGE" ]]; then
  echo 'Uso: scripts/ota.sh <ios|android> <versión, p. ej. 1.4.0> "<mensaje>"' >&2
  exit 1
fi

cd "$(dirname "$0")/.."
if ! git diff --quiet -- app.json; then
  echo "app.json tiene cambios sin guardar; revísalos antes de publicar." >&2
  exit 1
fi

restore() { git checkout -q -- app.json; }
trap restore EXIT

# Change only expo.version (the first "version" key of the file) and verify it.
node -e '
  const fs = require("fs");
  const want = process.argv[1];
  const text = fs.readFileSync("app.json", "utf8");
  const next = text.replace(/("version"\s*:\s*")[^"]+(")/, `$1${want}$2`);
  if (JSON.parse(next).expo.version !== want) { console.error("No pude fijar expo.version"); process.exit(1); }
  fs.writeFileSync("app.json", next);
' "$VERSION"

echo "→ Publicando para $PLATFORM, versión instalada $VERSION (rama production)"
if [[ "${DRY_RUN:-}" == "1" ]]; then
  echo "DRY_RUN: expo.version = $(node -p 'require("./app.json").expo.version')"
  echo "DRY_RUN: eas update --branch production --platform $PLATFORM --message \"$MESSAGE\""
else
  eas update --branch production --platform "$PLATFORM" --message "$MESSAGE"
fi
