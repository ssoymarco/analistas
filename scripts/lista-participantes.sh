#!/bin/bash
# ── Lista de participantes del concurso de jerseys (sección Wallpapers) ──────
#
# Saca TODOS los que dieron ❤️ Participar, con nombre, @username, correo,
# wallpaper elegido y fecha — listo para elegir ganador (selección por mérito,
# ver docs/terminos-dinamica-jerseys.md).
#
# Uso:   ./scripts/lista-participantes.sh            # tabla en pantalla
#        ./scripts/lista-participantes.sh > lista.csv # exportar CSV
#
# Requiere: gcloud autenticado con el proyecto analistas-8ba26 (ya lo está
# en esta Mac).

set -euo pipefail
TOKEN=$(gcloud auth print-access-token)
BASE="https://firestore.googleapis.com/v1/projects/analistas-8ba26/databases/(default)"

curl -s -X POST "$BASE/documents:runQuery" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"structuredQuery":{"from":[{"collectionId":"wallpaperEntries"}],"orderBy":[{"field":{"fieldPath":"createdAt"},"direction":"ASCENDING"}],"limit":10000}}' \
| python3 -c '
import json, sys, urllib.request

rows = [r["document"] for r in json.load(sys.stdin) if "document" in r]
token = sys.argv[1]
base = sys.argv[2]

def field(f, k, t="stringValue"):
    return f.get(k, {}).get(t, "")

print("fecha,uid,nombre,username,email,wallpaper,premio")
users_cache = {}
for r in rows:
    f = r["fields"]
    uid = field(f, "uid")
    if uid not in users_cache:
        try:
            req = urllib.request.Request(f"{base}/documents/users/{uid}", headers={"Authorization": f"Bearer {token}"})
            u = json.load(urllib.request.urlopen(req, timeout=10)).get("fields", {})
            users_cache[uid] = (
                field(u, "displayName") or field(u, "name"),
                field(u, "username"),
                field(u, "email"),
            )
        except Exception:
            users_cache[uid] = ("", "", "")
    name, username, email = users_cache[uid]
    created = field(f, "createdAt", "timestampValue")[:19].replace("T", " ")
    wallpaper = field(f, "wallpaperId")
    prize = field(f, "prizeId")
    print(f"{created},{uid},{name},@{username},{email},{wallpaper},{prize}")
' "$TOKEN" "$BASE"
