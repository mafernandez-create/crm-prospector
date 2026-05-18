#!/bin/bash
# Abre el CRM con ?auto-qualify=1 para disparar la cualificación automática.
# Llamado por launchd: a las 02:00 diarias y al encender el ordenador.
# Guard de 20 h: evita ejecuciones dobles si launchd y el cron coinciden.

GUARD_FILE="$HOME/.crm_batch_lastrun"
TWENTY_HOURS=72000  # 20 * 3600 segundos
NOW=$(date +%s)

if [ -f "$GUARD_FILE" ]; then
    LAST=$(cat "$GUARD_FILE" 2>/dev/null || echo 0)
    DIFF=$((NOW - LAST))
    if [ "$DIFF" -lt "$TWENTY_HOURS" ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Auto-qualify omitido — última ejecución hace ${DIFF}s (mín 72000s)" >> /Users/ma.fernandez/Documents/crm/.auto-qualify.log
        exit 0
    fi
fi

echo "$NOW" > "$GUARD_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Abriendo CRM con auto-qualify=1..." >> /Users/ma.fernandez/Documents/crm/.auto-qualify.log

# Abre en Chrome (crea nueva pestaña si ya está abierto)
open -a "Google Chrome" "file:///Users/ma.fernandez/Documents/crm/index.html?auto-qualify=1"
