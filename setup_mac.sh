#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
#  QUANT PLATFORM — macOS One-Command Installer
#  Tested on: macOS 13+, Apple Silicon + Intel
# ═══════════════════════════════════════════════════════════
set -euo pipefail

PLATFORM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$PLATFORM_DIR/logs"
VENV="$PLATFORM_DIR/venv"
PLIST_DIR="$HOME/Library/LaunchAgents"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*"; exit 1; }
step()  { echo -e "\n${BLUE}▶ $*${NC}"; }

# ── Preflight ────────────────────────────────────────────────
if [[ "$(uname)" != "Darwin" ]]; then
  error "This script is for macOS only."
fi

[[ -f "$PLATFORM_DIR/.env" ]] || { cp "$PLATFORM_DIR/.env.example" "$PLATFORM_DIR/.env"; warn ".env created — please edit it with your credentials before continuing!"; }
source <(grep -v '^#' "$PLATFORM_DIR/.env" | grep '=' | sed 's/^/export /')
DB_USER="${POSTGRES_USER:-quantuser}"
DB_PASS="${POSTGRES_PASSWORD:-changeme}"
DB_NAME="${POSTGRES_DB:-quantdb}"

# ── 1. Homebrew ──────────────────────────────────────────────
step "Checking Homebrew"
if ! command -v brew &>/dev/null; then
  info "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
    grep -q 'brew shellenv' ~/.zshrc 2>/dev/null || echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zshrc
  fi
fi
BREW=$(command -v brew)
BREW_PREFIX=$($BREW --prefix)
info "Homebrew at $BREW_PREFIX"

# ── 2. System packages ───────────────────────────────────────
step "Installing PostgreSQL, TimescaleDB, Redis, nginx, node, python"

# Python 3.12
#$BREW list [email protected] &>/dev/null || $BREW install [email protected]
#PY_BIN="$BREW_PREFIX/opt/[email protected]/bin/python3.12"
PY_BIN="/Users/pbadlani/.pyenv/shims/python3.12"

# PostgreSQL 16
$BREW list postgresql@17 &>/dev/null || $BREW install postgresql@17
export PATH="$BREW_PREFIX/opt/postgresql@17/bin:$PATH"
grep -q 'postgresql@17/bin' ~/.zshrc 2>/dev/null || \
  echo "export PATH=\"$BREW_PREFIX/opt/postgresql@17/bin:\$PATH\"" >> ~/.zshrc

# TimescaleDB
$BREW list timescaledb &>/dev/null || { $BREW tap timescale/tap || true; $BREW install timescaledb; }

# Redis
$BREW list redis &>/dev/null || $BREW install redis

# Nginx
$BREW list nginx &>/dev/null || $BREW install nginx

# Node (for frontend)
$BREW list node &>/dev/null || $BREW install node

info "System packages installed"

# ── 3. Start services ────────────────────────────────────────
step "Starting PostgreSQL and Redis"
$BREW services start postgresql@17 2>/dev/null || $BREW services restart postgresql@17
$BREW services start redis 2>/dev/null || $BREW services restart redis
sleep 3

# ── 4. TimescaleDB config ────────────────────────────────────
step "Configuring TimescaleDB"
PG_CONFIG="$BREW_PREFIX/var/postgresql@17/postgresql.conf"
if [[ -f "$PG_CONFIG" ]] && ! grep -q "timescaledb" "$PG_CONFIG"; then
  echo "shared_preload_libraries = 'timescaledb'" >> "$PG_CONFIG"
  $BREW services restart postgresql@17
  sleep 3
  info "TimescaleDB added to shared_preload_libraries"
fi
timescaledb-tune --quiet --yes --pg-config="$BREW_PREFIX/opt/postgresql@17/bin/pg_config" 2>/dev/null || warn "timescaledb-tune skipped"

# ── 5. Database bootstrap ────────────────────────────────────
step "Setting up database"
CURRENT_USER=$(whoami)
PG_BIN="$BREW_PREFIX/opt/postgresql@17/bin"

"$PG_BIN/psql" -U "$CURRENT_USER" -d postgres -tAc \
  "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
  "$PG_BIN/psql" -U "$CURRENT_USER" -d postgres \
    -c "CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS';"

"$PG_BIN/psql" -U "$CURRENT_USER" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
  "$PG_BIN/psql" -U "$CURRENT_USER" -d postgres \
    -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

"$PG_BIN/psql" -U "$CURRENT_USER" -d "$DB_NAME" \
  -c "CREATE EXTENSION IF NOT EXISTS timescaledb;" 2>/dev/null || true

info "Database $DB_NAME ready"

# ── 6. Python venv + deps ────────────────────────────────────
step "Setting up Python environment"
cd "$PLATFORM_DIR"
if [[ ! -d "$VENV" ]]; then
  "$PY_BIN" -m venv "$VENV"
fi
source "$VENV/bin/activate"
pip install --upgrade pip wheel setuptools -q
pip install -r requirements.txt -q
info "Python dependencies installed"

# ── 7. Migrations ────────────────────────────────────────────
step "Running database migrations"
DATABASE_URL="postgresql+asyncpg://$DB_USER:$DB_PASS@localhost/$DB_NAME" \
  "$VENV/bin/alembic" upgrade head
info "Migrations applied"

# ── 8. Log dirs ──────────────────────────────────────────────
mkdir -p "$LOG_DIR"/{nginx,api,worker,beat}

# ── 9. Build frontend ────────────────────────────────────────
step "Building React dashboard"
cd "$PLATFORM_DIR/frontend"
if [[ ! -d node_modules ]]; then
  npm install --silent
fi
npm run build
cd "$PLATFORM_DIR"
info "Frontend built to frontend/dist/"

# ── 10. Install launchd agents ───────────────────────────────
step "Installing launchd agents"
mkdir -p "$PLIST_DIR"
for p in api worker beat; do
  SRC="$PLATFORM_DIR/launchd/com.quant.${p}.plist"
  DST="$PLIST_DIR/com.quant.${p}.plist"
  sed "s|__HOME__|$HOME|g; s|__VENV__|$VENV|g; s|__PLATFORM__|$PLATFORM_DIR|g; s|__BREW_PREFIX__|$BREW_PREFIX|g" "$SRC" > "$DST"
  launchctl bootout "gui/$(id -u)/com.quant.${p}" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$DST"
  info "Loaded com.quant.$p"
done

# ── 11. nginx config ─────────────────────────────────────────
step "Configuring Nginx"
NGINX_DIR="$BREW_PREFIX/etc/nginx/servers"
mkdir -p "$NGINX_DIR"
sed "s|__HOME__|$HOME|g; s|__PLATFORM__|$PLATFORM_DIR|g" "$PLATFORM_DIR/nginx/quant.conf" > "$NGINX_DIR/quant.conf"
$BREW services start nginx 2>/dev/null || $BREW services restart nginx
info "Nginx running on :8080"

# ── 12. Seed default strategies ──────────────────────────────
step "Seeding default strategies (paused by default)"
cd "$PLATFORM_DIR"
DATABASE_URL="postgresql+asyncpg://$DB_USER:$DB_PASS@localhost/$DB_NAME" \
  "$VENV/bin/python" scripts/seed_strategies.py || warn "Strategy seed skipped (may already exist)"

# ── Done ─────────────────────────────────────────────────────
cat <<EOF

${GREEN}═══════════════════════════════════════════════════════════${NC}
${GREEN}  ✅  Quant Platform Setup Complete${NC}
${GREEN}═══════════════════════════════════════════════════════════${NC}

  Dashboard:     http://localhost:8080
  API docs:      http://localhost:8080/api/docs
  Flower:        http://localhost:5555
  Logs:          $LOG_DIR

  Login (change in .env):
    username: ${ADMIN_USERNAME:-admin}
    password: ${ADMIN_PASSWORD:-admin}

  Next steps:
    ./manage.sh status       # check all services
    ./manage.sh health       # API health checks
    ./manage.sh logs api     # tail API logs

  ${YELLOW}⚠  Mode: $(grep -q "^ALPACA_LIVE_CONFIRMED=true" .env && grep -q "^ALPACA_BASE_URL=https://api.alpaca.markets" .env && echo "LIVE TRADING" || echo "PAPER TRADING (safe)")${NC}

EOF
