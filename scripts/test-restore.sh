#!/usr/bin/env bash
# Monthly restore drill (info/INFRASTRUCTURE.md §5).
#
# Pulls the most recent nightly Postgres dump from B2, restores it into
# a throwaway scratch database alongside the live one, runs a few smoke
# queries to confirm row counts look sane, then drops the scratch DB.
#
# Run by hand (or via cron, monthly):
#   ./scripts/test-restore.sh
#
# Exit code 0 = restore succeeded and smoke queries returned data.
# Anything non-zero = something is wrong with the backup chain — fix
# before relying on B2 as your only off-box copy.

set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"

# shellcheck source=/dev/null
[[ -f .env ]] && set -a && . ./.env && set +a

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:=toplisters}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is required (e.g. toplisters-backups)}"
BACKUP_PREFIX="${BACKUP_PREFIX:-postgres}"
CONTAINER="${POSTGRES_CONTAINER:-toplisters-postgres}"
SCRATCH_DB="${POSTGRES_DB}_restore_test"
LOCAL_TMP="$(mktemp -d)"
trap 'rm -rf "$LOCAL_TMP"' EXIT

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "✗ $1 is required but not installed" >&2
    exit 1
  }
}

require_cmd rclone
require_cmd docker

echo "→ Locating most recent dump in b2:${BACKUP_BUCKET}/${BACKUP_PREFIX}/"
LATEST_DUMP=$(rclone lsf --files-only "b2:${BACKUP_BUCKET}/${BACKUP_PREFIX}/" \
  | grep -E '\.sql\.gz$' \
  | sort \
  | tail -n1)
if [[ -z "$LATEST_DUMP" ]]; then
  echo "✗ No dumps found in b2:${BACKUP_BUCKET}/${BACKUP_PREFIX}/" >&2
  exit 1
fi
echo "  Latest: ${LATEST_DUMP}"

echo "→ Downloading to ${LOCAL_TMP}/"
rclone copy "b2:${BACKUP_BUCKET}/${BACKUP_PREFIX}/${LATEST_DUMP}" "$LOCAL_TMP"
DUMP_PATH="${LOCAL_TMP}/${LATEST_DUMP}"

echo "→ Decompressing"
gunzip -k "$DUMP_PATH"
SQL_PATH="${DUMP_PATH%.gz}"

echo "→ Creating scratch DB ${SCRATCH_DB}"
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -c "DROP DATABASE IF EXISTS ${SCRATCH_DB};" \
  -c "CREATE DATABASE ${SCRATCH_DB} OWNER ${POSTGRES_USER};"

echo "→ Restoring dump into ${SCRATCH_DB}"
docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$SCRATCH_DB" < "$SQL_PATH" >/dev/null

echo "→ Running smoke queries"
SMOKE_OUTPUT=$(docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -At \
  --username "$POSTGRES_USER" --dbname "$SCRATCH_DB" <<-'EOSQL'
SELECT 'jobs:' || COUNT(*) FROM jobs;
SELECT 'cities:' || COUNT(*) FROM cities;
SELECT 'subscribers:' || COUNT(*) FROM subscribers;
SELECT 'jobs_active:' || COUNT(*) FROM jobs WHERE is_active = true;
EOSQL
)
echo "$SMOKE_OUTPUT" | sed 's/^/  /'

JOB_COUNT=$(echo "$SMOKE_OUTPUT" | awk -F: '/^jobs:/{print $2}')
if [[ -z "$JOB_COUNT" || "$JOB_COUNT" -lt 1 ]]; then
  echo "✗ Restored DB has no jobs — backup is suspect" >&2
  docker exec "$CONTAINER" psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -c "DROP DATABASE IF EXISTS ${SCRATCH_DB};"
  exit 1
fi

echo "→ Dropping scratch DB ${SCRATCH_DB}"
docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -c "DROP DATABASE ${SCRATCH_DB};"

echo "✓ Restore drill passed (${LATEST_DUMP}, jobs=${JOB_COUNT})"
