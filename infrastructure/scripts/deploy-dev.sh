#!/usr/bin/env bash
# Automated deployment of the permanent Verevia DEV environment (Phase 8),
# see docs/PHASE_8_AUTOMATED_DEV_DEPLOYMENT_REPORT.md.
#
# Runs ON the VPS as the `verevia-deploy` user, either invoked manually or
# — the normal path — as the SSH forced command bound to the GitHub
# Actions deployment key (see ~/.ssh/authorized_keys on the VPS): GitHub
# Actions runs `ssh -i <deploy-key> verevia-deploy@vps.verevia.app
# "<git-short-sha>"`; the forced command always executes THIS script
# regardless of what the client sends, but preserves the client's string
# in $SSH_ORIGINAL_COMMAND — read below and validated before use, since a
# forced-command argument is attacker-influenceable if the key ever leaks
# and must be treated as untrusted input, not as a trusted deploy trigger.
#
# Every step aborts loudly (non-zero exit, `set -e`) on failure — no
# silent error handling. A failed migration aborts the WHOLE deployment
# and leaves the previously-running api/web containers untouched (they
# are only updated in the final step, after migrate has already
# succeeded).

set -euo pipefail

DEPLOY_TAG="${1:-${SSH_ORIGINAL_COMMAND:-dev}}"

# Only a bare git short SHA (7-40 hex chars) or the literal "dev" is
# accepted — this value becomes a Docker image tag and an env var, and (see
# above) may originate from an untrusted forced-command argument.
if ! [[ "$DEPLOY_TAG" =~ ^(dev|[0-9a-f]{7,40})$ ]]; then
  echo "Refusing invalid deploy tag: $DEPLOY_TAG" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_DIR="$REPO_ROOT/infrastructure/docker"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.dev-deploy.yml"
ENV_FILE="$COMPOSE_DIR/.env"

echo "==> Verevia DEV deployment starting: tag=${DEPLOY_TAG}"

echo "==> [1/8] Updating deployment checkout (scripts/compose only — application code comes from the pulled images)"
# Robust against whatever state an unattended checkout happens to be in
# (e.g. left on a feature branch after manual testing) — always ends up
# exactly at origin/main. This checkout only ever holds deploy tooling
# (compose file, this script, .env), never anything worth preserving
# locally, so a hard reset here is the right tradeoff: reliability for an
# unattended CI trigger over caution that has no real local state to lose.
git -C "$REPO_ROOT" fetch origin main
git -C "$REPO_ROOT" checkout main
git -C "$REPO_ROOT" reset --hard origin/main

echo "==> [2/8] Backing up DEV database before touching anything"
if ! "$SCRIPT_DIR/backup-dev-db.sh" "$ENV_FILE" "$DEPLOY_TAG"; then
  echo "Backup failed — aborting deployment, nothing changed." >&2
  exit 1
fi

echo "==> [3/8] Recording deploy tag in .env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found." >&2
  exit 1
fi
sed -i '/^DEPLOY_TAG=/d' "$ENV_FILE"
echo "DEPLOY_TAG=${DEPLOY_TAG}" >> "$ENV_FILE"

cd "$COMPOSE_DIR"

echo "==> [4/8] Pulling images for tag ${DEPLOY_TAG}"
docker compose -f "$COMPOSE_FILE" pull postgres api web migrate

echo "==> [5/8] Ensuring Postgres is running and healthy"
docker compose -f "$COMPOSE_FILE" up -d postgres
if ! timeout 60 sh -c 'until docker inspect --format "{{.State.Health.Status}}" verevia-dev-postgres 2>/dev/null | grep -q healthy; do sleep 1; done'; then
  echo "Postgres did not become healthy in time — aborting." >&2
  exit 1
fi

echo "==> [6/8] Running migrations (prisma migrate deploy + seed)"
if ! docker compose -f "$COMPOSE_FILE" run --rm migrate; then
  echo "Migration failed — aborting deployment. Existing api/web containers were NOT touched and remain running on the previous version." >&2
  exit 1
fi

echo "==> [7/8] Rolling out api + web (tag ${DEPLOY_TAG})"
docker compose -f "$COMPOSE_FILE" up -d api web

echo "==> [8/8] Healthchecks + smoke test"
if ! timeout 60 sh -c 'until docker inspect --format "{{.State.Health.Status}}" verevia-dev-api 2>/dev/null | grep -q healthy; do sleep 1; done'; then
  echo "api container did not become healthy after rollout." >&2
  exit 1
fi
if ! timeout 60 sh -c 'until docker inspect --format "{{.State.Health.Status}}" verevia-dev-web 2>/dev/null | grep -q healthy; do sleep 1; done'; then
  echo "web container did not become healthy after rollout." >&2
  exit 1
fi

API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://api.verevia.app/health)
if [ "$API_STATUS" != "200" ]; then
  echo "Smoke test failed: https://api.verevia.app/health returned ${API_STATUS}, expected 200." >&2
  exit 1
fi

WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://app.verevia.app/)
case "$WEB_STATUS" in
  200|307|308) ;;
  *)
    echo "Smoke test failed: https://app.verevia.app/ returned ${WEB_STATUS}, expected 200/307/308." >&2
    exit 1
    ;;
esac

echo "==> Deployment successful: ${DEPLOY_TAG}"
docker compose -f "$COMPOSE_FILE" ps
