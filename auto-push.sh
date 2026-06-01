#!/bin/bash
# Auto-commit y push del CRM cuando se detectan cambios
CRM_DIR="/Users/ma.fernandez/Documents/02_Proyectos_Claude/Trabajo_GPF/crm"
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
