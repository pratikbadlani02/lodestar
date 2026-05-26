#!/usr/bin/env bash
# Quant Platform — operations CLI
set -e

PLATFORM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLISTS=(com.quant.api)
UID_NUM=$(id -u)

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; C='\033[0;36m'; NC='\033[0m'
hdr() { echo -e "\n${C}━━ $* ━━${NC}"; }

cmd="${1:-help}"; shift || true

case "$cmd" in

  start)
    hdr "Starting services"
    for p in "${PLISTS[@]}"; do
      launchctl bootstrap "gui/$UID_NUM" "$PLIST_DIR/${p}.plist" 2>/dev/null && \
        echo -e "${G}▶${NC} $p" || echo -e "${Y}⚠${NC} $p already running"
    done
    brew services start nginx 2>/dev/null || true
    ;;

  stop)
    hdr "Stopping services"
    for p in "${PLISTS[@]}"; do
      launchctl bootout "gui/$UID_NUM/$p" 2>/dev/null && \
        echo -e "${G}■${NC} $p stopped" || echo -e "${Y}⚠${NC} $p was not running"
    done
    ;;

  restart)
    "$0" stop; sleep 2; "$0" start
    ;;

  status)
    hdr "Service status"
    for p in "${PLISTS[@]}"; do
      info=$(launchctl list 2>/dev/null | grep "$p" || true)
      if [[ -n "$info" ]]; then
        pid=$(echo "$info" | awk '{print $1}')
        if [[ "$pid" == "-" ]]; then
          echo -e "  ${Y}○${NC} $p  (stopped)"
        else
          echo -e "  ${G}●${NC} $p  (PID $pid)"
        fi
      else
        echo -e "  ${R}○${NC} $p  (not loaded)"
      fi
    done
    echo ""
    echo "  Homebrew services:"
    brew services list 2>/dev/null | grep -E "postgresql|redis|nginx" | \
      awk '{printf "    %-20s %s\n", $1, $2}'
    ;;

  logs)
    target="${1:-api}"
    case "$target" in
      api)    tail -f "$PLATFORM_DIR/logs/api/api.log" ;;
      nginx)  tail -f "$PLATFORM_DIR/logs/nginx/access.log" ;;
      errors) tail -f "$PLATFORM_DIR"/logs/*/*.err.log ;;
      all)    tail -f "$PLATFORM_DIR"/logs/*/*.log ;;
      *)      echo "Usage: $0 logs [api|nginx|errors|all]" ;;
    esac
    ;;

  health)
    hdr "Health checks"
    curl -s http://localhost:8080/api/health | python3 -m json.tool 2>/dev/null || \
      echo -e "${R}API unreachable${NC}"
    ;;

  db-shell)
    source <(grep -v '^#' "$PLATFORM_DIR/.env" | grep '=' | sed 's/^/export /')
    psql -U "${POSTGRES_USER:-quantuser}" -d "${POSTGRES_DB:-quantdb}"
    ;;

  redis-cli)
    redis-cli
    ;;

  migrate)
    cd "$PLATFORM_DIR"
    source <(grep -v '^#' .env | grep '=' | sed 's/^/export /')
    "$PLATFORM_DIR/venv/bin/alembic" upgrade head
    ;;

  dashboard)
    open http://localhost:8080
    ;;

  kill)
    reason="${1:-manual kill via manage.sh}"
    hdr "Activating kill switch"
    token=$(curl -s -X POST http://localhost:8080/api/auth/login \
      -d "username=${ADMIN_USERNAME:-admin}&password=${ADMIN_PASSWORD:-admin}" \
      | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])" 2>/dev/null)
    [[ -z "$token" ]] && { echo -e "${R}Auth failed — check .env${NC}"; exit 1; }
    curl -s -X POST http://localhost:8080/api/control/kill \
      -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json" \
      -d "{\"reason\":\"$reason\"}" | python3 -m json.tool
    ;;

  liquidate)
    reason="${1:-emergency liquidate via manage.sh}"
    hdr "EMERGENCY LIQUIDATE"
    read -p "This will close ALL positions. Type YES to confirm: " confirm
    [[ "$confirm" != "YES" ]] && { echo "Aborted."; exit 0; }
    token=$(curl -s -X POST http://localhost:8080/api/auth/login \
      -d "username=${ADMIN_USERNAME:-admin}&password=${ADMIN_PASSWORD:-admin}" \
      | python3 -c "import json,sys; print(json.load(sys.stdin)['access_token'])" 2>/dev/null)
    curl -s -X POST http://localhost:8080/api/control/liquidate \
      -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json" \
      -d "{\"reason\":\"$reason\"}" | python3 -m json.tool
    ;;

  help|*)
    cat <<EOF
${C}Quant Platform — operations CLI${NC}

Usage: ./manage.sh <command> [args]

Service control:
  start            Load all launchd services
  stop             Unload all launchd services
  restart          Stop then start
  status           Show service status

Logs:
  logs api         Tail API logs (includes the in-process scheduler)
  logs nginx       Tail nginx access log
  logs errors      Tail all error logs
  logs all         Tail every log

Operations:
  health           Run API health check
  dashboard        Open dashboard in browser
  db-shell         Open psql
  redis-cli        Open redis-cli
  migrate          Run Alembic migrations

Emergency:
  kill [reason]              Activate kill switch (halts trading)
  liquidate [reason]         EMERGENCY: close all positions (interactive)
EOF
    ;;
esac
