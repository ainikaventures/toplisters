#!/usr/bin/env bash
# Production deploy. Runs on the server, called by GitHub Actions on push
# to main (or by hand: `ssh user@server "/srv/toplisters/deploy.sh"`).
#
# Idempotent: safe to re-run. On failure, the previous container keeps
# serving traffic (compose `--no-deps` + healthcheck-aware restart).

set -euo pipefail

cd "$(dirname "$0")"

COMPOSE="docker compose -f docker/docker-compose.prod.yml --env-file .env"

echo "→ Pulling latest from origin/main…"
git fetch --quiet origin main
git reset --hard origin/main

echo "→ Building images (web, worker)…"
$COMPOSE build web worker

echo "→ Starting / refreshing infra (postgres, redis, caddy)…"
$COMPOSE up -d postgres redis caddy

echo "→ Waiting for postgres to be healthy…"
until $COMPOSE exec -T postgres pg_isready -U "${POSTGRES_USER:-toplisters}" >/dev/null 2>&1; do
  sleep 1
done

echo "→ Running Prisma migrations…"
$COMPOSE run --rm web npx prisma migrate deploy

echo "→ Rolling web + worker (no-downtime)…"
$COMPOSE up -d --no-deps --remove-orphans web worker

echo "→ Waiting for web health…"
for i in {1..30}; do
  if curl -fsS http://localhost:3000/jobs >/dev/null 2>&1; then
    echo "✓ Web is healthy"
    break
  fi
  if [[ $i -eq 30 ]]; then
    echo "✗ Web failed to come up. Logs:"
    $COMPOSE logs --tail=50 web
    exit 1
  fi
  sleep 2
done

echo "→ Pruning unused images…"
docker image prune -f >/dev/null

echo "✓ Deploy complete: $(git rev-parse --short HEAD)"
