#!/usr/bin/env bash
# Backup the Verevia DEV PostgreSQL database (Phase 7), see
# docs/PHASE_7_DEV_DEPLOYMENT_REPORT.md.
#
# Deliberately simple: a single pg_dump into a timestamped file under
# /srv/verevia/backups. No retention/rotation, no offsite copy — both are
# explicitly deferred as a later work package (see the Phase 7 spec,
# section 23). This is the "we have SOMETHING" baseline, not a complete
# backup strategy.
#
# No password on the command line or in this script: reads
# POSTGRES_SUPERUSER/POSTGRES_SUPERUSER_PASSWORD from the deployment's own
# .env file (infrastructure/docker/.env within the checkout at
# /srv/verevia/dev — NOT next to this script, which lives under
# infrastructure/scripts/), exported into pg_dump's environment only for
# the duration of the dump (PGPASSWORD), never logged or echoed.
#
# Usage (on the VPS, default path assumes the standard /srv/verevia/dev
# checkout location; pass a different .env path as $1 to override):
#   /srv/verevia/dev/infrastructure/scripts/backup-dev-db.sh
# Typically invoked via cron, e.g. a nightly:
#   0 3 * * * /srv/verevia/dev/infrastructure/scripts/backup-dev-db.sh >> /srv/verevia/backups/dev-backup.log 2>&1

set -euo pipefail

ENV_FILE="${1:-/srv/verevia/dev/infrastructure/docker/.env}"
BACKUP_DIR="/srv/verevia/backups"
CONTAINER="verevia-dev-postgres"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

if [ -z "${POSTGRES_SUPERUSER:-}" ] || [ -z "${POSTGRES_SUPERUSER_PASSWORD:-}" ]; then
  echo "Error: POSTGRES_SUPERUSER/POSTGRES_SUPERUSER_PASSWORD not set in $ENV_FILE." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="${BACKUP_DIR}/verevia-dev-${TIMESTAMP}.sql.gz"

echo "Backing up verevia-dev-postgres (database: verevia) to ${OUT_FILE} ..."

docker exec -e PGPASSWORD="${POSTGRES_SUPERUSER_PASSWORD}" "$CONTAINER" \
  pg_dump -U "${POSTGRES_SUPERUSER}" -d verevia --no-owner --no-privileges \
  | gzip > "$OUT_FILE"

chmod 600 "$OUT_FILE"
echo "Done: $(du -h "$OUT_FILE" | cut -f1) written."
