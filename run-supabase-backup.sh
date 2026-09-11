#!/bin/bash
# crm (repo crm-prospector) · Supabase Backup Weekly — LOCAL. pg_dump (PG17) cifrado con GPG.
# pg_dump y gpg vienen de ~/.local/pgtools (micromamba, sin sudo).
# Lunes 06:00 (Madrid) + al encender + reintento + espera de red.
# La copia cifrada se guarda en ./backups (retiene las 8 ultimas).
set -uo pipefail
cd "$(dirname "$0")" || exit 1
export TZ="Europe/Madrid"
export PATH="$HOME/.local/pgtools/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

GUARD="/Users/ma.fernandez/Proyectos/_automation/guard.sh"
RED="/Users/ma.fernandez/Proyectos/_automation/red_ok.sh"
LOG="$HOME/Library/Logs/crm-supabase-backup.log"
BACKUPS="$(pwd)/backups"   # junto al script, sea donde sea el repo

KEY=$(bash "$GUARD" crm-supabase-backup weekly 1 0600) || exit 0
bash "$RED" || { echo "[$(date '+%F %T')] backup: sin conexion, se reintentara" >> "$LOG"; exit 0; }

if [ -f .env.local ]; then set -a; . ./.env.local; set +a; fi
mkdir -p "$BACKUPS"

STAMP=$(date -u +"%Y%m%d-%H%M")
OUT="$BACKUPS/supabase-backup-${STAMP}.sql"
echo "[$(date '+%F %T')] === inicio backup Supabase ($KEY) ===" >> "$LOG"

pg_dump --dbname="${SUPABASE_DB_URL:-}" --schema=public --no-owner --no-privileges --format=plain --file="$OUT" >> "$LOG" 2>&1
code=$?
if [ $code -ne 0 ]; then
  echo "[$(date '+%F %T')] === backup pg_dump FALLO (exit $code) ===" >> "$LOG"
  rm -f "$OUT"
  exit 1
fi

gzip -f "$OUT"
gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase "${BACKUP_PASSPHRASE:-}" --output "${OUT}.gz.gpg" "${OUT}.gz" >> "$LOG" 2>&1
gcode=$?
rm -f "${OUT}.gz"
if [ $gcode -ne 0 ]; then
  echo "[$(date '+%F %T')] === backup GPG FALLO (exit $gcode) ===" >> "$LOG"
  exit 1
fi

ls -1t "$BACKUPS"/supabase-backup-*.sql.gz.gpg 2>/dev/null | tail -n +9 | xargs -r rm -f

bash "$GUARD" crm-supabase-backup marcar "$KEY"
echo "[$(date '+%F %T')] === backup OK -> $(ls -lh "${OUT}.gz.gpg" | awk '{print $5}') ===" >> "$LOG"
exit 0
