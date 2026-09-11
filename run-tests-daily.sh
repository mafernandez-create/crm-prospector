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
REPO="mafernandez-create/crm-prospector"

KEY=$(bash "$GUARD" crm-tests-daily daily 0700) || exit 0
bash "$RED" || { echo "[$(date '+%F %T')] tests: sin conexion, se reintentara" >> "$LOG"; exit 0; }

if [ -f .env.local ]; then set -a; . ./.env.local; set +a; fi
export GH_TOKEN="$(gh auth token 2>/dev/null)"
export CRM_URL="${CRM_URL:-https://mafernandez-create.github.io/crm-prospector/}"

echo "[$(date '+%F %T')] === inicio tests ($KEY) ===" >> "$LOG"
set +e
node scripts/tests/run-all.js --all > tests-output.log 2>&1
STATUS=$?
set -e
tail -c 4000 tests-output.log >> "$LOG"

if [ "$STATUS" != "0" ]; then
  D=$(date '+%F %H:%M')
  { echo "Ejecucion LOCAL en el Mac — $D"; echo; echo '<details><summary>Output completo</summary>'; echo; echo '```'; tail -c 60000 tests-output.log; echo '```'; echo; echo '</details>'; } > issue-body.md
  gh label create "tests-failing" --repo "$REPO" --color B60205 --description "La bateria de tests diaria fallo" --force 2>/dev/null || true
  EXISTING=$(gh issue list --repo "$REPO" --label tests-failing --state open --limit 1 --json number --jq '.[0].number // empty' 2>/dev/null)
  if [ -n "$EXISTING" ]; then
    gh issue comment "$EXISTING" --repo "$REPO" --body-file issue-body.md || true
  else
    gh issue create --repo "$REPO" --title "🔴 Bateria de tests fallo en $D (local)" --body-file issue-body.md --label tests-failing || true
  fi
  echo "[$(date '+%F %T')] === tests FALLARON (exit $STATUS) — issue actualizado ===" >> "$LOG"
else
  EXISTING=$(gh issue list --repo "$REPO" --label tests-failing --state open --limit 1 --json number --jq '.[0].number // empty' 2>/dev/null)
  if [ -n "$EXISTING" ]; then
    gh issue comment "$EXISTING" --repo "$REPO" --body "✅ La bateria volvio a verde (local, $(date '+%F %H:%M')). Cerrando." || true
    gh issue close "$EXISTING" --repo "$REPO" --reason completed || true
  fi
  echo "[$(date '+%F %T')] === tests OK ===" >> "$LOG"
fi
# Se ejecuto con red -> dia hecho (los fallos se avisan por issue, no reintentando).
bash "$GUARD" crm-tests-daily marcar "$KEY"
exit 0
