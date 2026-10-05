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
. /Users/ma.fernandez/Proyectos/_automation/fallos.sh

KEY=$(bash "$GUARD" crm-placsp-daily daily 0500) || exit 0
# Sin red no es un fallo del agente: launchd reintenta a los 30 min y sale 0.
# Pero una manana entera sin red pierde el periodo en silencio, asi que queda
# apuntado en el diario comun una sola vez por periodo (4-oct-2026: tres agentes
# perdieron la pasada del 5-oct por esto y salud.sh decia "diario vacio").
bash "$RED" || { fallos_sin_red "$GUARD" crm-placsp-daily "$KEY" "$LOG"; exit 0; }
fallos_red_ok "$GUARD" crm-placsp-daily

if [ -f .env.local ]; then set -a; . ./.env.local; set +a; fi
export GH_TOKEN="$(gh auth token 2>/dev/null)"
export GITHUB_REPOSITORY="mafernandez-create/crm-prospector"
export LIMITE="${LIMITE:-500}"
export STALE_DAYS="${STALE_DAYS:-4}"

echo "[$(date '+%F %T')] === inicio crm placsp-daily ($KEY) ===" >> "$LOG"
fallos_init crm-placsp-daily "$LOG"

# El fetch puede fallar sin que el dia haya que repetirlo: quien vigila los dias
# sin ingerir es el freshness-check, que abre issue. Por eso es `paso` y no
# `paso_critico`, y por eso el dia se marca abajo pase lo que pase.
paso "fetch PLACSP" node scripts/placsp-fetch.js

# El freshness va SIEMPRE, aunque el fetch acabe de fallar: es justo entonces
# cuando tiene que abrir el issue. Y si el que falla es el freshness, se queda
# sin vigilante: antes eso era un `|| true` invisible.
paso "freshness-check" node scripts/placsp-freshness.js

# Dia hecho a proposito: reintentar cada 30 min no aporta nada aqui (la fuente
# publica no cambia) y ya hay canal de alerta propio.
bash "$GUARD" crm-placsp-daily marcar "$KEY"

fallos_salida
rc=$?
echo "[$(date '+%F %T')] === fin crm placsp-daily (salida $rc) ===" >> "$LOG"
exit "$rc"
