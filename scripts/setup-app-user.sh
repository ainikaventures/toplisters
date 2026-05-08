#!/usr/bin/env bash
# Idempotently create / refresh the `toplisters_app` runtime role on an
# already-initialised dev (or prod) Postgres. The same SQL also runs
# automatically on first init via docker/postgres-init.d/, but that
# entrypoint is skipped when the data volume already exists — this
# script is the manual path for that case.
#
# Usage:
#   ./scripts/setup-app-user.sh            # uses .env at repo root
#   POSTGRES_HOST=remote ./scripts/setup-app-user.sh

set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"

# shellcheck source=/dev/null
[[ -f .env ]] && set -a && . ./.env && set +a

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:=toplisters}"
: "${TOPLISTERS_APP_PASSWORD:?TOPLISTERS_APP_PASSWORD is required}"
CONTAINER="${POSTGRES_CONTAINER:-toplisters-postgres}"

echo "→ Bootstrapping toplisters_app role in ${POSTGRES_DB} (container ${CONTAINER})"

docker exec -i \
  -e TOPLISTERS_APP_PASSWORD="$TOPLISTERS_APP_PASSWORD" \
  "$CONTAINER" \
  psql -v ON_ERROR_STOP=1 \
       --username "$POSTGRES_USER" \
       --dbname "$POSTGRES_DB" \
       --port "${POSTGRES_PORT:-5433}" \
       -v app_password="$TOPLISTERS_APP_PASSWORD" \
       -v dbname="$POSTGRES_DB" <<-'EOSQL'
SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'toplisters_app') AS role_exists \gset
\if :role_exists
ALTER ROLE toplisters_app WITH LOGIN PASSWORD :'app_password';
\else
CREATE ROLE toplisters_app WITH LOGIN PASSWORD :'app_password';
\endif

GRANT CONNECT ON DATABASE :"dbname" TO toplisters_app;
GRANT USAGE ON SCHEMA public TO toplisters_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO toplisters_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO toplisters_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO toplisters_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO toplisters_app;
EOSQL

echo "✓ toplisters_app role ready"
