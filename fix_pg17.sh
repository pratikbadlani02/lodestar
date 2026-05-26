#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
#  FIX: PostgreSQL 17 + missing quantdb + TimescaleDB
#  Run from ~/quant-platform/
# ═══════════════════════════════════════════════════════════
set -euo pipefail

PLATFORM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PLATFORM_DIR"

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${G}[✓]${NC} $*"; }
warn()  { echo -e "${Y}[!]${NC} $*"; }
step()  { echo -e "\n${Y}▶ $*${NC}"; }
die()   { echo -e "${R}[✗]${NC} $*"; exit 1; }

# ── Detect PostgreSQL version and prefix ─────────────────
BREW=$(command -v brew)
BREW_PREFIX=$($BREW --prefix)

# Find whichever pg is installed and running
if $BREW list postgresql@17 &>/dev/null; then
  PG_VER=17
elif $BREW list postgresql@16 &>/dev/null; then
  PG_VER=16
elif $BREW list postgresql@15 &>/dev/null; then
  PG_VER=15
else
  die "No Homebrew PostgreSQL installation found"
fi

PG_BIN="$BREW_PREFIX/opt/postgresql@${PG_VER}/bin"
PG_DATA="$BREW_PREFIX/var/postgresql@${PG_VER}"
PG_CONFIG="$PG_DATA/postgresql.conf"
CURRENT_USER=$(whoami)

info "Detected PostgreSQL $PG_VER"
info "Data dir: $PG_DATA"

# ── Parse .env safely ────────────────────────────────────
DB_USER="quantuser"
DB_PASS="changeme"
DB_NAME="quantdb"

if [[ -f "$PLATFORM_DIR/.env" ]]; then
  while IFS='=' read -r key raw_val; do
    [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
    val="${raw_val%%#*}"         # strip inline comments
    val="${val#"${val%%[! ]*}"}" # ltrim
    val="${val%"${val##*[! ]}"}" # rtrim
    case "$key" in
      POSTGRES_USER)     DB_USER="$val" ;;
      POSTGRES_PASSWORD) DB_PASS="$val" ;;
      POSTGRES_DB)       DB_NAME="$val" ;;
    esac
  done < "$PLATFORM_DIR/.env"
fi

info "DB: $DB_NAME  USER: $DB_USER"

# ── Step 1: Make sure PostgreSQL 17 is running ───────────
step "Ensuring PostgreSQL $PG_VER is running"
$BREW services start "postgresql@${PG_VER}" 2>/dev/null || \
  $BREW services restart "postgresql@${PG_VER}"
sleep 3

for i in 1 2 3 4 5; do
  "$PG_BIN/pg_isready" -q && break
  sleep 2
done
"$PG_BIN/pg_isready" || die "PostgreSQL did not start"
info "PostgreSQL $PG_VER is running"

# ── Step 2: Add timescaledb to shared_preload_libraries ──
step "Configuring shared_preload_libraries"

if grep -qE "^shared_preload_libraries\s*=.*timescaledb" "$PG_CONFIG"; then
  info "TimescaleDB already in shared_preload_libraries"
else
  # Remove any existing (active or commented) line first
  sed -i '' "/shared_preload_libraries/d" "$PG_CONFIG"
  echo "shared_preload_libraries = 'timescaledb'" >> "$PG_CONFIG"
  info "Added timescaledb to shared_preload_libraries"

  # Restart to pick up config
  $BREW services restart "postgresql@${PG_VER}"
  sleep 4
  "$PG_BIN/pg_isready" || die "PostgreSQL failed to restart"
  info "PostgreSQL restarted"
fi

# ── Step 3: Verify timescaledb loads ─────────────────────
step "Verifying TimescaleDB loads"
LOADED=$("$PG_BIN/psql" -U "$CURRENT_USER" -d postgres \
  -tAc "SHOW shared_preload_libraries;" 2>/dev/null)
echo "   shared_preload_libraries = $LOADED"
if [[ "$LOADED" != *timescaledb* ]]; then
  die "TimescaleDB is not in shared_preload_libraries after restart. Check $PG_CONFIG"
fi
info "TimescaleDB is loaded"

# ── Step 4: Create DB role ────────────────────────────────
step "Creating database role '$DB_USER'"
"$PG_BIN/psql" -U "$CURRENT_USER" -d postgres -c \
  "DO \$\$ BEGIN
     IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='$DB_USER') THEN
       CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS';
     ELSE
       ALTER ROLE $DB_USER WITH PASSWORD '$DB_PASS';
     END IF;
   END \$\$;" 2>/dev/null
info "Role '$DB_USER' ready"

# ── Step 5: Create database ───────────────────────────────
step "Creating database '$DB_NAME'"
EXISTS=$("$PG_BIN/psql" -U "$CURRENT_USER" -d postgres \
  -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME';")
if [[ "$EXISTS" != "1" ]]; then
  "$PG_BIN/psql" -U "$CURRENT_USER" -d postgres \
    -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
  info "Database '$DB_NAME' created"
else
  info "Database '$DB_NAME' already exists"
fi

# ── Step 6: Enable TimescaleDB extension ─────────────────
step "Enabling TimescaleDB extension in '$DB_NAME'"
"$PG_BIN/psql" -U "$CURRENT_USER" -d "$DB_NAME" \
  -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"

# Verify
VERSION=$("$PG_BIN/psql" -U "$CURRENT_USER" -d "$DB_NAME" \
  -tAc "SELECT extversion FROM pg_extension WHERE extname='timescaledb';")
if [[ -z "$VERSION" ]]; then
  die "TimescaleDB extension failed to install. Check 'timescaledb_move.sh' was run first."
fi
info "TimescaleDB extension enabled (version $VERSION)"

# ── Step 7: Update DATABASE_URL to use pg17 port ─────────
step "Checking DATABASE_URL in .env"
# Update pg version-specific URLs if needed
CURRENT_URL=$(grep "^DATABASE_URL=" .env | head -1 | cut -d= -f2-)
if [[ "$CURRENT_URL" == *"@localhost/"* ]]; then
  info "DATABASE_URL looks fine (localhost:5432 is default): $CURRENT_URL"
fi

# ── Step 8: Drop any partial alembic state ───────────────
step "Cleaning partial migration state"
"$PG_BIN/psql" -U "$CURRENT_USER" -d "$DB_NAME" \
  -c "DROP TABLE IF EXISTS alembic_version CASCADE;" 2>/dev/null || true

# Drop all app tables in reverse dependency order
for t in account_snapshots audit_log backtest_trades backtests positions orders strategy_runs strategies ohlcv; do
  "$PG_BIN/psql" -U "$CURRENT_USER" -d "$DB_NAME" \
    -c "DROP TABLE IF EXISTS $t CASCADE;" 2>/dev/null || true
done

# Drop enums
for e in tradingmode backteststatus strategystatus orderstatus ordertype orderside; do
  "$PG_BIN/psql" -U "$CURRENT_USER" -d "$DB_NAME" \
    -c "DROP TYPE IF EXISTS $e CASCADE;" 2>/dev/null || true
done
info "Cleaned"

# ── Step 9: Update requirements.txt (fix redis extra) ────
step "Fixing requirements.txt"
sed -i '' 's/redis\[asyncio\]/redis/' requirements.txt
info "redis[asyncio] → redis (asyncio support built-in since redis>=4.2)"

# ── Step 10: Re-install any missing packages ─────────────
step "Ensuring venv is up to date"
source "$PLATFORM_DIR/venv/bin/activate"
pip install -r requirements.txt -q
info "Dependencies up to date"

# ── Step 11: Run Alembic ─────────────────────────────────
step "Running Alembic migrations"
DATABASE_URL="postgresql+asyncpg://$DB_USER:$DB_PASS@localhost/$DB_NAME" \
  alembic upgrade head
info "Migrations complete"

# ── Step 12: Seed strategies ─────────────────────────────
step "Seeding default strategies"
DATABASE_URL="postgresql+asyncpg://$DB_USER:$DB_PASS@localhost/$DB_NAME" \
  python scripts/seed_strategies.py || warn "seed skipped"

# ── Step 13: Reload launchd agents ───────────────────────
step "Installing launchd agents"
PLIST_DIR="$HOME/Library/LaunchAgents"
UID_NUM=$(id -u)
mkdir -p "$PLIST_DIR"

for p in api worker beat; do
  SRC="$PLATFORM_DIR/launchd/com.quant.${p}.plist"
  DST="$PLIST_DIR/com.quant.${p}.plist"
  sed "s|__HOME__|$HOME|g; \
       s|__VENV__|$PLATFORM_DIR/venv|g; \
       s|__PLATFORM__|$PLATFORM_DIR|g; \
       s|__BREW_PREFIX__|$BREW_PREFIX|g" "$SRC" > "$DST"
  launchctl bootout "gui/$UID_NUM/com.quant.${p}" 2>/dev/null || true
  launchctl bootstrap "gui/$UID_NUM" "$DST"
  info "Loaded com.quant.$p"
done

# ── Step 14: Build frontend ───────────────────────────────
step "Building React dashboard"
cd "$PLATFORM_DIR/frontend"
[[ -d node_modules ]] || npm install --silent
npm run build
cd "$PLATFORM_DIR"
info "Frontend built"

# ── Step 15: Nginx ────────────────────────────────────────
step "Configuring Nginx"
NGINX_DIR="$BREW_PREFIX/etc/nginx/servers"
mkdir -p "$NGINX_DIR"
sed "s|__HOME__|$HOME|g; s|__PLATFORM__|$PLATFORM_DIR|g" \
  "$PLATFORM_DIR/nginx/quant.conf" > "$NGINX_DIR/quant.conf"
$BREW services start nginx 2>/dev/null || $BREW services restart nginx
info "Nginx configured"

# ── Done ─────────────────────────────────────────────────
cat <<'DONE'

╔══════════════════════════════════════════════╗
║  ✅  Setup complete!                         ║
╚══════════════════════════════════════════════╝

  Dashboard:  http://localhost:8080
  API docs:   http://localhost:8080/api/docs

  Verify:
    ./manage.sh status
    ./manage.sh health

DONE
