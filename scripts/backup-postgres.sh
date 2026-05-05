#!/usr/bin/env bash
# Daily Postgres backup → Backblaze B2 via rclone.
# Set up via cron on the host (NOT inside the container):
#   crontab -e
#   15 3 * * * /srv/toplisters/scripts/backup-postgres.sh >> /var/log/toplisters-backup.log 2>&1
#
# Requirements on the host:
#   apt install rclone
#   rclone config   # add a remote called "b2" using Backblaze B2 creds
#
# Env vars (set in /srv/toplisters/.env, sourced below):
#   POSTGRES_USER, POSTGRES_DB, POSTGRES_PASSWORD
#   BACKUP_BUCKET (e.g. "toplisters-backups")
#   BACKUP_PREFIX (e.g. "postgres")
#   BACKUP_KEEP_LOCAL_DAYS (default 7)
#
# Strategy: pg_dump inside the running postgres container → gzip on the
# host → upload to B2. Local copy retained 7 days as a fallback.

set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"

# shellcheck source=/dev/null
[[ -f .env ]] && set -a && . ./.env && set +a

DATE=$(date -u +%Y%m%d-%H%M%S)
LOCAL_DIR="${BACKUP_LOCAL_DIR:-/var/backups/toplisters}"
mkdir -p "$LOCAL_DIR"
DUMP_PATH="${LOCAL_DIR}/toplisters-${DATE}.sql.gz"

echo "→ Dumping ${POSTGRES_DB:-toplisters} to ${DUMP_PATH}"
docker exec toplisters-postgres pg_dump \
  -U "${POSTGRES_USER:-toplisters}" \
  -d "${POSTGRES_DB:-toplisters}" \
  | gzip > "$DUMP_PATH"

if [[ -n "${BACKUP_BUCKET:-}" ]]; then
  echo "→ Uploading to b2:${BACKUP_BUCKET}/${BACKUP_PREFIX:-postgres}/"
  rclone copy "$DUMP_PATH" "b2:${BACKUP_BUCKET}/${BACKUP_PREFIX:-postgres}/"
else
  echo "⚠ BACKUP_BUCKET not set — skipping B2 upload, keeping local only"
fi

KEEP_DAYS="${BACKUP_KEEP_LOCAL_DAYS:-7}"
find "$LOCAL_DIR" -name 'toplisters-*.sql.gz' -mtime "+$KEEP_DAYS" -delete
echo "✓ Backup complete: $(du -h "$DUMP_PATH" | cut -f1) — kept locally for ${KEEP_DAYS} days"
