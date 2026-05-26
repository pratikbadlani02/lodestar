#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
#  FIX: TimescaleDB extension + setup_mac.sh bash bug
#  Run from ~/quant-platform/
# ═══════════════════════════════════════════════════════════
set -e

PLATFORM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PLATFORM_DIR"

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${G}[✓]${NC} $*"; }
warn()  { echo -e "${Y}[!]${NC} $*"; }
step()  { echo -e "\n${Y}▶${NC} $*"; }

# Load .env safely (no source — uses env -i style parse)
if [[ -f "$PLATFORM_DIR/.env" ]]; then
  export $(grep -v '^#' "$PLATFORM_DIR/.env" | grep '=' | xargs -0 2>/dev/null || true)
fi
# Manual parse is safer
while IFS='=' read -r key val; do
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  export "$key"="$val"
done < <(grep -v '^$' "$PLATFORM_DIR/.env" | grep -v '^#')

DB_USER="${POSTGRES_USER:-quantuser}"
DB_PASS="${POSTGRES_PASSWORD:-changeme}"
DB_NAME="${POSTGRES_DB:-quantdb}"

BREW=$(command -v brew)
BREW_PREFIX=$($BREW --prefix)
PG_BIN="$BREW_PREFIX/opt/postgresql@17/bin"
PG_CONFIG="$BREW_PREFIX/var/postgresql@17/postgresql.conf"
CURRENT_USER=$(whoami)

# ── Fix 1: Ensure TimescaleDB is in shared_preload_libraries ──
step "Checking TimescaleDB in shared_preload_libraries"

if [[ ! -f "$PG_CONFIG" ]]; then
  warn "postgresql.conf not found at $PG_CONFIG — checking alternate path"
  PG_CONFIG=$("$PG_BIN/psql" -U "$CURRENT_USER" -d postgres -tAc "SHOW config_file;" 2>/dev/null | tr -d ' ')
  echo "   found: $PG_CONFIG"
fi

if ! grep -qE "^\s*shared_preload_libraries\s*=.*timescaledb" "$PG_CONFIG"; then
  info "Adding timescaledb to shared_preload_libraries"
  # Remove any existing (commented or not) shared_preload_libraries line
  sed -i.bak '/^[[:space:]]*#*[[:space:]]*shared_preload_libraries/d' "$PG_CONFIG"
  echo "shared_preload_libraries = 'timescaledb'" >> "$PG_CONFIG"
else
  info "shared_preload_libraries already configured"
fi

# ── Fix 2: Restart PostgreSQL to pick up config ──
step "Restarting PostgreSQL"
$BREW services restart postgresql@17
sleep 4

# Verify it came back up
for i in 1 2 3 4 5; do
  if "$PG_BIN/pg_isready" -U "$CURRENT_USER" -d postgres &>/dev/null; then
    info "PostgreSQL ready"
    break
  fi
  sleep 2
done

# ── Fix 3: Create TimescaleDB extension ──
step "Creating TimescaleDB extension in $DB_NAME"
"$PG_BIN/psql" -U "$CURRENT_USER" -d "$DB_NAME" \
  -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"

# Verify
"$PG_BIN/psql" -U "$CURRENT_USER" -d "$DB_NAME" \
  -c "SELECT extname, extversion FROM pg_extension WHERE extname='timescaledb';"

# ── Fix 4: Clean up partial migration state ──
step "Cleaning any partial migration state"
"$PG_BIN/psql" -U "$CURRENT_USER" -d "$DB_NAME" -c "DROP TABLE IF EXISTS ohlcv CASCADE;" 2>/dev/null || true
"$PG_BIN/psql" -U "$CURRENT_USER" -d "$DB_NAME" -c "DROP TABLE IF EXISTS alembic_version CASCADE;" 2>/dev/null || true

# Drop enums too (they persist even if tables are dropped)
for t in tradingmode backteststatus strategystatus orderstatus ordertype orderside; do
  "$PG_BIN/psql" -U "$CURRENT_USER" -d "$DB_NAME" -c "DROP TYPE IF EXISTS $t CASCADE;" 2>/dev/null || true
done
info "Cleaned partial state"

# ── Fix 5: Re-run migration ──
step "Running migrations"
source "$PLATFORM_DIR/venv/bin/activate"
DATABASE_URL="postgresql+asyncpg://$DB_USER:$DB_PASS@localhost/$DB_NAME" \
  alembic upgrade head

info "Migrations succeeded!"

# ── Fix 6: Seed default strategies ──
step "Seeding default strategies"
DATABASE_URL="postgresql+asyncpg://$DB_USER:$DB_PASS@localhost/$DB_NAME" \
  python scripts/seed_strategies.py || warn "seed skipped (may already exist)"

# ── Fix 7: Load launchd agents (if not already) ──
step "Loading launchd agents"
PLIST_DIR="$HOME/Library/LaunchAgents"
mkdir -p "$PLIST_DIR"
UID_NUM=$(id -u)

for p in api worker beat; do
  SRC="$PLATFORM_DIR/launchd/com.quant.${p}.plist"
  DST="$PLIST_DIR/com.quant.${p}.plist"
  VENV="$PLATFORM_DIR/venv"
  sed "s|__HOME__|$HOME|g; s|__VENV__|$VENV|g; s|__PLATFORM__|$PLATFORM_DIR|g; s|__BREW_PREFIX__|$BREW_PREFIX|g" "$SRC" > "$DST"
  launchctl bootout "gui/$UID_NUM/com.quant.${p}" 2>/dev/null || true
  launchctl bootstrap "gui/$UID_NUM" "$DST"
  info "Loaded com.quant.$p"
done

# ── Fix 8: Build frontend and configure nginx ──
step "Building frontend"
cd "$PLATFORM_DIR/frontend"
if [[ ! -d node_modules ]]; then
  npm install --silent
fi
npm run build
cd "$PLATFORM_DIR"

step "Configuring Nginx"
NGINX_DIR="$BREW_PREFIX/etc/nginx/servers"
mkdir -p "$NGINX_DIR"
sed "s|__HOME__|$HOME|g; s|__PLATFORM__|$PLATFORM_DIR|g" "$PLATFORM_DIR/nginx/quant.conf" > "$NGINX_DIR/quant.conf"
$BREW services start nginx 2>/dev/null || $BREW services restart nginx

cat <<EOF

${G}═══════════════════════════════════════════════════════════${NC}
${G}  ✅ Fix complete — platform should be running${NC}
${G}═══════════════════════════════════════════════════════════${NC}

  Dashboard:  http://localhost:8080
  API docs:   http://localhost:8080/api/docs

  Verify:
    ./manage.sh status
    ./manage.sh health
    curl http://localhost:8080/api/health

EOF
