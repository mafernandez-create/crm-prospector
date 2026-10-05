#!/bin/bash
# crm (repo crm-prospector) · Tests Daily — LOCAL. Ejecuta la bateria y, si falla, abre/comenta
# un issue "tests-failing" en GitHub; si vuelve a verde, lo cierra. Diario 07:00.
set -uo pipefail
cd "$(dirname "$0")" || exit 1
export TZ="Europe/Madrid"
export PATH="$HOME/.nvm/versions/node/v24.14.1/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

GUARD="/Users/ma.fernandez/Proyectos/_automation/guard.sh"
RED="/Users/ma.fernandez/Proyectos/_automation/red_ok.sh"
LOG="$HOME/Library/Logs/crm-tests-daily.log"
. /Users/ma.fernandez/Proyectos/_automation/fallos.sh
REPO="mafernandez-create/crm-prospector"

KEY=$(bash "$GUARD" crm-tests-daily daily 0700) || exit 0
# Sin red no es un fallo del agente: launchd reintenta a los 30 min y sale 0.
# Pero una manana entera sin red pierde el periodo en silencio, asi que queda
# apuntado en el diario comun una sola vez por periodo (4-oct-2026: tres agentes
# perdieron la pasada del 5-oct por esto y salud.sh decia "diario vacio").
bash "$RED" || { fallos_sin_red "$GUARD" crm-tests-daily "$KEY" "$LOG"; exit 0; }
fallos_red_ok "$GUARD" crm-tests-daily

if [ -f .env.local ]; then set -a; . ./.env.local; set +a; fi
export GH_TOKEN="$(gh auth token 2>/dev/null)"
export CRM_URL="${CRM_URL:-https://mafernandez-create.github.io/crm-prospector/}"

echo "[$(date '+%F %T')] === inicio tests ($KEY) ===" >> "$LOG"
fallos_init crm-tests-daily "$LOG"
# Ojo: aqui habia un `set +e` / `set -e`. El `-e` nunca habia estado activo
# (arriba es `set -uo pipefail`), asi que encenderlo dejaba el resto del script
# a merced de cualquier comando que devolviera !=0, y lo unico que lo sujetaba
# eran los `|| true` que este cambio retira. Se queda fuera.
node scripts/tests/run-all.js --all > tests-output.log 2>&1
STATUS=$?
tail -c 4000 tests-output.log >> "$LOG"

if [ "$STATUS" != "0" ]; then
  D=$(date '+%F %H:%M')
  { echo "Ejecucion LOCAL en el Mac — $D"; echo; echo '<details><summary>Output completo</summary>'; echo; echo '```'; tail -c 60000 tests-output.log; echo '```'; echo; echo '</details>'; } > issue-body.md
  # La bateria en rojo queda apuntada en el diario central, no solo en el issue.
  fallos_aviso "bateria de tests en rojo" "$STATUS"
  gh label create "tests-failing" --repo "$REPO" --color B60205 --description "La bateria de tests diaria fallo" --force 2>/dev/null || true
  EXISTING=$(gh issue list --repo "$REPO" --label tests-failing --state open --limit 1 --json number --jq '.[0].number // empty' 2>/dev/null)
  if [ -n "$EXISTING" ]; then
    paso_critico "avisar en issue #$EXISTING" gh issue comment "$EXISTING" --repo "$REPO" --body-file issue-body.md
  else
    paso_critico "abrir issue de tests" gh issue create --repo "$REPO" --title "🔴 Bateria de tests fallo en $D (local)" --body-file issue-body.md --label tests-failing
  fi
  echo "[$(date '+%F %T')] === tests FALLARON (exit $STATUS) — issue actualizado ===" >> "$LOG"
else
  EXISTING=$(gh issue list --repo "$REPO" --label tests-failing --state open --limit 1 --json number --jq '.[0].number // empty' 2>/dev/null)
  if [ -n "$EXISTING" ]; then
    paso "comentar vuelta a verde" gh issue comment "$EXISTING" --repo "$REPO" --body "✅ La bateria volvio a verde (local, $(date '+%F %H:%M')). Cerrando."
    paso_critico "cerrar issue #$EXISTING" gh issue close "$EXISTING" --repo "$REPO" --reason completed
  fi
  echo "[$(date '+%F %T')] === tests OK ===" >> "$LOG"
fi
# Dia hecho a proposito aunque algo haya fallado: la bateria ESCRIBE EN
# PRODUCCION, asi que reintentarla cada 30 min seria peor que el fallo. El aviso
# va por issue y por el diario central; de ahi `fallos_salida` y no `fallos_cerrar`.
bash "$GUARD" crm-tests-daily marcar "$KEY"

fallos_salida
rc=$?
echo "[$(date '+%F %T')] === fin tests (salida $rc) ===" >> "$LOG"
exit "$rc"
