#!/usr/bin/env bash
# Lodestar — Postgres backup
#
# Dumps the database referenced by $DATABASE_URL_SYNC to a timestamped gzipped
# file in $BACKUP_DIR (default: ./backups). Designed to run from cron or a
# GitHub Actions schedule against the Render Postgres connection string.
#
# Usage:
#   ./scripts/backup_db.sh                 # local .env, writes to ./backups
#   DATABASE_URL_SYNC=... ./scripts/backup_db.sh
#   BACKUP_DIR=/path ./scripts/backup_db.sh
#
# Cron example (03:00 daily):
#   0 3 * * * cd /path/to/lodestar && ./scripts/backup_db.sh
#
# Render free Postgres has no managed backups and expires after 90 days, so
# *some* offsite copy is mandatory if you care about your data.

set -euo pipefail

PLATFORM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$PLATFORM_DIR/backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"

# Pull DATABASE_URL_SYNC from .env if not already set in the environment.
if [[ -z "${DATABASE_URL_SYNC:-}" ]] && [[ -f "$PLATFORM_DIR/.env" ]]; then
  # shellcheck disable=SC1090
  set -a; source <(grep -E '^DATABASE_URL_SYNC=' "$PLATFORM_DIR/.env"); set +a
fi

if [[ -z "${DATABASE_URL_SYNC:-}" ]]; then
  echo "error: DATABASE_URL_SYNC is not set" >&2
  exit 1
fi

# pg_dump accepts standard postgres:// URLs but chokes on the SA-style
# postgresql+psycopg2:// prefix — normalize it.
PG_URL="$DATABASE_URL_SYNC"
PG_URL="${PG_URL/postgresql+psycopg2:\/\//postgresql://}"
PG_URL="${PG_URL/postgres:\/\//postgresql://}"

mkdir -p "$BACKUP_DIR"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/lodestar-$TS.sql.gz"

echo "▶ dumping to $OUT"
pg_dump --no-owner --no-privileges --clean --if-exists "$PG_URL" | gzip > "$OUT"

# Prune anything older than $KEEP_DAYS days.
find "$BACKUP_DIR" -type f -name 'lodestar-*.sql.gz' -mtime "+$KEEP_DAYS" -delete

# Show final size + a quick file list.
size="$(du -h "$OUT" | awk '{print $1}')"
echo "✓ wrote $size"
ls -lh "$BACKUP_DIR" | tail -n +2 | tail -5
