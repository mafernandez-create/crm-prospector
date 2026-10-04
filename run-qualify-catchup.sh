#!/bin/bash
# crm (repo crm-prospector) · Batch Qualify — CATCH-UP LOCAL.
#
# El recálculo real de scoring/cuadrantes corre en servidor
# (.github/workflows/batch-qualify-node.yml, cron 30 2 * * * UTC). Pero GitHub
# encola los `schedule` y los suelta cuando hay runners: medido entre el 23-sep
# y el 4-oct-2026, el retraso fue de 5h14 a 6h46, así que la recalificación
# aterrizaba entre las 09:44 y las 11:16 hora española — ya empezada la mañana.
#
# Este wrapper NO recalcula en local: dispara ese mismo workflow en cuanto el
# Mac arranca y tiene red, para que los cuadrantes estén al día antes de
# empezar a trabajar. El cron de GitHub se deja puesto como red de seguridad
# (si el Mac pasa días apagado, la recalificación sigue ocurriendo sola).
#
# El guard de la casa da el "catch-up" sin duplicar: una vez al día a partir de
# las 07:00. Si hoy ya hubo una ejecución correcta en GitHub, no dispara otra.
set -uo pipefail
cd "$(dirname "$0")" || exit 1
export TZ="Europe/Madrid"
export PATH="$HOME/.local/bin:$HOME/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

GUARD="/Users/ma.fernandez/Proyectos/_automation/guard.sh"
RED="/Users/ma.fernandez/Proyectos/_automation/red_ok.sh"
LOG="$HOME/Library/Logs/crm-qualify-catchup.log"
REPO="mafernandez-create/crm-prospector"
WF="batch-qualify-node.yml"

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

KEY=$(bash "$GUARD" crm-qualify-catchup daily 0700) || exit 0
bash "$RED" || { log "sin conexion, se reintentara"; exit 0; }

export GH_TOKEN="$(gh auth token 2>/dev/null)"
[ -n "$GH_TOKEN" ] || { log "ERROR: sin token de gh, no se marca el dia"; exit 1; }

log "=== inicio catch-up ($KEY) ==="

# ¿Ha recalificado ya GitHub en las ultimas 12 horas? Entonces no duplicamos.
#
# La ventana es de 12h y NO "lo que lleve el dia de hoy": el cron de GitHub esta
# a las 22:00 UTC, asi que la ejecucion de esta manana se encolo AYER en fecha
# UTC. Comparar por dia natural daria siempre "no ha corrido" y dispararia un
# recalculo redundante cada manana.
DESDE=$(date -u -v-12H '+%Y-%m-%dT%H:%M:%SZ')
RUNS=$(gh run list --repo "$REPO" --workflow="$WF" --limit 10 \
         --json createdAt,status,conclusion 2>/dev/null \
       | jq -r --arg desde "$DESDE" \
           '[.[] | select(.createdAt >= $desde)]
            | "\([.[] | select(.conclusion == "success")] | length) \([.[] | select(.status != "completed")] | length)"' \
         2>/dev/null) || RUNS=""
OK_RECIENTE=$(echo "$RUNS" | awk '{print $1+0}')
EN_CURSO=$(echo "$RUNS" | awk '{print $2+0}')

if [ "${OK_RECIENTE:-0}" -gt 0 ]; then
  log "GitHub ya recalifico en las ultimas 12h ($OK_RECIENTE correcta/s). No se dispara."
  bash "$GUARD" crm-qualify-catchup marcar "$KEY"
  exit 0
fi
if [ "${EN_CURSO:-0}" -gt 0 ]; then
  log "GitHub tiene $EN_CURSO ejecucion/es en cola o en curso. Se espera; el dia NO se marca."
  exit 0
fi

# Dispara el recalculo COMPLETO, igual que el cron nocturno.
if ! gh workflow run "$WF" --repo "$REPO" -f filtro=todos -f limite=2000 -f dry_run=no 2>>"$LOG"; then
  log "ERROR: no se pudo disparar el workflow. El dia NO se marca; se reintentara."
  exit 1
fi
log "workflow disparado; esperando a que arranque..."

# Espera a que aparezca el run y sigue su resultado (parada dura: 10 min).
sleep 15
RUN_ID=$(gh run list --repo "$REPO" --workflow="$WF" --event=workflow_dispatch \
           --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null)
if [ -z "$RUN_ID" ]; then
  log "AVISO: disparado pero no se localizo el run. El dia NO se marca."
  exit 1
fi

if gh run watch "$RUN_ID" --repo "$REPO" --exit-status --interval 15 >/dev/null 2>&1; then
  RESUMEN=$(gh run view "$RUN_ID" --repo "$REPO" --log 2>/dev/null \
              | grep -oE "(Procesados|Actualizados|Cambios de cuadrante): +[0-9]+" \
              | sed 's/  */ /g' | paste -sd' · ' -)
  log "OK (run $RUN_ID) ${RESUMEN:-sin resumen}"
  bash "$GUARD" crm-qualify-catchup marcar "$KEY"
  exit 0
else
  log "ERROR: el run $RUN_ID fallo. El dia NO se marca; se reintentara."
  exit 1
fi
