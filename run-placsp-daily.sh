#!/bin/bash
# crm (repo crm-prospector) · PLACSP Daily Crosscheck — LOCAL (sustituye a GitHub Actions).
# fetch+filter+cross-check contra Supabase + chequeo de frescura (abre/cierra issue).
# Diario 05:00 (Madrid) + al encender + reintento 30 min + espera de red.
set -uo pipefail
cd "$(dirname "$0")" || exit 1
export TZ="Europe/Madrid"
export PATH="$HOME/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

GUARD="/Users/ma.fernandez/Proyectos/_automation/guard.sh"
RED="/Users/ma.fernandez/Proyectos/_automation/red_ok.sh"
LOG="$HOME/Library/Logs/crm-placsp-daily.log"

KEY=$(bash "$GUARD" crm-placsp-daily daily 0500) || exit 0
bash "$RED" || { echo "[$(date '+%F %T')] placsp-daily: sin conexion, se reintentara" >> "$LOG"; exit 0; }

if [ -f .env.local ]; then set -a; . ./.env.local; set +a; fi
export GH_TOKEN="$(gh auth token 2>/dev/null)"
export GITHUB_REPOSITORY="mafernandez-create/crm-prospector"
export LIMITE="${LIMITE:-500}"
export STALE_DAYS="${STALE_DAYS:-4}"

echo "[$(date '+%F %T')] === inicio crm placsp-daily ($KEY) ===" >> "$LOG"
node scripts/placsp-fetch.js >> "$LOG" 2>&1
code=$?
# freshness siempre (aunque el fetch fallara): alerta si lleva dias sin ingerir
node scripts/placsp-freshness.js >> "$LOG" 2>&1 || true
# Se ejecuto (con red); se marca el dia hecho pase lo que pase con el fetch.
# Los fallos se vigilan con el freshness-check, no reintentando cada 30 min.
bash "$GUARD" crm-placsp-daily marcar "$KEY"
echo "[$(date '+%F %T')] === fin crm placsp-daily (fetch exit $code) ===" >> "$LOG"
exit 0
