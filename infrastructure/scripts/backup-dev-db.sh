#!/usr/bin/env bash
# Backup the Verevia DEV PostgreSQL database (Phase 7, extended Phase 8
# with SHA-tagged filenames + retention), see
# docs/PHASE_7_DEV_DEPLOYMENT_REPORT.md /
# docs/PHASE_8_AUTOMATED_DEV_DEPLOYMENT_REPORT.md.
#
# Deliberately simple: a `pg_dump` into a timestamped file under
# /srv/verevia/backups, plus a basic count-based retention. No offsite
# copy — that's explicitly deferred as a later work package (see the
# Phase 7 spec, section 23, and Phase 8 section 26).
#
# No password on the command line or in this script: reads
# POSTGRES_SUPERUSER/POSTGRES_SUPERUSER_PASSWORD from the deployment's own
# .env file, exported into pg_dump's environment only for the duration of
# the dump (PGPASSWORD), never logged or echoed.
#
# Usage (on the VPS):
#   backup-dev-db.sh [env-file] [tag]
#   env-file defaults to /srv/verevia/dev/infrastructure/docker/.env
#   tag (e.g. a git short SHA) is appended to the filename if given —
#   deploy-dev.sh passes the deployed commit's SHA; a plain cron/manual
#   run can omit it.
# Typically invoked via cron, e.g. a nightly:
#   0 3 * * * /srv/verevia/dev/infrastructure/scripts/backup-dev-db.sh >> /srv/verevia/backups/dev-backup.log 2>&1

set -euo pipefail

ENV_FILE="${1:-/srv/verevia/dev/infrastructure/docker/.env}"
TAG="${2:-}"
BACKUP_DIR="/srv/verevia/backups"
CONTAINER="verevia-dev-postgres"
# Count-based retention: keep the most recent N Verevia-DEV dumps. 14 is a
# reasonable default for a ~100 GB VPS given each dump is currently
# kilobytes-to-low-megabytes (fictional pilot data) — revisit if the
# dataset grows meaningfully. Only ever touches files matching this
# script's own naming prefix, never anything else under /srv/verevia/backups
# (e.g. a future prod-backup script's files).
RETENTION_COUNT="${RETENTION_COUNT:-14}"
FILENAME_PREFIX="verevia-dev-"

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
if [ -n "$TAG" ]; then
  OUT_FILE="${BACKUP_DIR}/${FILENAME_PREFIX}${TIMESTAMP}-${TAG}.sql.gz"
else
  OUT_FILE="${BACKUP_DIR}/${FILENAME_PREFIX}${TIMESTAMP}.sql.gz"
fi

echo "Backing up verevia-dev-postgres (database: verevia) to ${OUT_FILE} ..."

docker exec -e PGPASSWORD="${POSTGRES_SUPERUSER_PASSWORD}" "$CONTAINER" \
  pg_dump -U "${POSTGRES_SUPERUSER}" -d verevia --no-owner --no-privileges \
  | gzip > "$OUT_FILE"

chmod 600 "$OUT_FILE"
echo "Done: $(du -h "$OUT_FILE" | cut -f1) written."

# Retention: delete the oldest matching dumps beyond RETENTION_COUNT.
# shellcheck disable=SC2012
EXISTING_COUNT=$(ls -1 "${BACKUP_DIR}/${FILENAME_PREFIX}"*.sql.gz 2>/dev/null | wc -l | tr -d ' ')
if [ "$EXISTING_COUNT" -gt "$RETENTION_COUNT" ]; then
  TO_DELETE=$((EXISTING_COUNT - RETENTION_COUNT))
  echo "Retention: ${EXISTING_COUNT} dumps present, keeping newest ${RETENTION_COUNT}, removing ${TO_DELETE}."
  # shellcheck disable=SC2012
  ls -1t "${BACKUP_DIR}/${FILENAME_PREFIX}"*.sql.gz | tail -n "$TO_DELETE" | while IFS= read -r old_file; do
    echo "  removing $(basename "$old_file")"
    rm -f -- "$old_file"
  done
fi
