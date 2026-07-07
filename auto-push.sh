#!/bin/bash
# Auto-commit y push del CRM cuando se detectan cambios
# La ruta se deriva de la ubicación del propio script (independiente de dónde esté el repo)
CRM_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$CRM_DIR/.auto-push.log"

cd "$CRM_DIR" || exit 1

# Solo actuar si hay cambios en index.html
if git diff --quiet index.html; then
    exit 0
fi

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$TIMESTAMP] Cambios detectados, haciendo commit..." >> "$LOG"

git add index.html
git commit -m "Auto-guardado CRM $TIMESTAMP" >> "$LOG" 2>&1
git push origin main >> "$LOG" 2>&1

echo "[$TIMESTAMP] Push completado" >> "$LOG"
