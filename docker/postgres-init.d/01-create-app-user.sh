#!/bin/bash
# Postgres first-init bootstrap: creates the limited `toplisters_app`
# runtime role + grants. The container's POSTGRES_USER (default
# `toplisters`) stays as the database owner — Prisma migrations run as
# that user (via MIGRATION_DATABASE_URL); the web + worker connect as
# toplisters_app via DATABASE_URL.
#
# This script auto-runs on FIRST initialization (when the data volume
# is empty). For existing dev volumes that pre-date this script, run
# `scripts/setup-app-user.sh` manually — the SQL is idempotent.

set -euo pipefail

if [[ -z "${TOPLISTERS_APP_PASSWORD:-}" ]]; then
  echo "✗ TOPLISTERS_APP_PASSWORD is not set; skipping app-user bootstrap." >&2
  exit 0
fi

psql -v ON_ERROR_STOP=1 \
     --username "${POSTGRES_USER}" \
     --dbname "${POSTGRES_DB}" \
     --port "${PGPORT:-5433}" \
     -v app_password="${TOPLISTERS_APP_PASSWORD}" \
     -v dbname="${POSTGRES_DB}" <<-'EOSQL'
-- psql variable substitution (`:'app_password'`) doesn't reach inside
-- dollar-quoted blocks, so we use top-level conditional `\if` instead
-- of a DO block. \gset captures the EXISTS() result into a psql var.
SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'toplisters_app') AS role_exists \gset
\if :role_exists
ALTER ROLE toplisters_app WITH LOGIN PASSWORD :'app_password';
\else
CREATE ROLE toplisters_app WITH LOGIN PASSWORD :'app_password';
\endif

GRANT CONNECT ON DATABASE :"dbname" TO toplisters_app;
GRANT USAGE ON SCHEMA public TO toplisters_app;

-- DML on every existing table / sequence (no-op on first init when there
-- are no tables yet; relevant when the script is re-run via setup-app-user.sh
-- against an existing dev DB).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO toplisters_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO toplisters_app;

-- Future tables created by the owner (Prisma migrations) auto-grant the
-- same DML to toplisters_app. This is the bit that makes runtime work
-- after the first migration adds tables.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO toplisters_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO toplisters_app;
EOSQL

echo "✓ toplisters_app role bootstrapped"
