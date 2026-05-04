#!/usr/bin/env bash
# Meeting-assistant Ubuntu launcher.
# Scans desired ports; if busy, picks random free port in 20000-29999.
# Syncs backend <-> frontend env so NEXT_PUBLIC_API_BASE + ALLOWED_ORIGIN match.
# Installs deps, runs migrations, builds frontend, starts both under pm2.
#
# Usage:
#   ./setup.sh
#   BACK_PORT=8001 FRONT_PORT=3001 ./setup.sh
#   SERVER_IP=192.168.1.50 ./setup.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACK_DEFAULT="${BACK_PORT:-8000}"
FRONT_DEFAULT="${FRONT_PORT:-3000}"
SERVER_IP="${SERVER_IP:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
SERVER_IP="${SERVER_IP:-127.0.0.1}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
die()  { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || die "missing tool: $1 (see INSTALL.md)"; }
for c in uv pnpm pm2 node ffmpeg ss sed awk grep; do need "$c"; done

[ -f "$ROOT/backend/.env" ]        || die "backend/.env missing — copy backend/.env.example and fill keys"
[ -f "$ROOT/frontend/.env.local" ] || die "frontend/.env.local missing — copy frontend/.env.example and fill it"

is_free() {
  # returns 0 if nothing listens on $1
  ! ss -ltnH "sport = :$1" 2>/dev/null | grep -q LISTEN
}

pick_free() {
  local desired="$1" excl="${2:-}" p
  if [ "$desired" != "$excl" ] && is_free "$desired"; then
    echo "$desired"; return
  fi
  for _ in $(seq 1 200); do
    p=$(( (RANDOM % 10000) + 20000 ))
    [ "$p" = "$excl" ] && continue
    is_free "$p" && { echo "$p"; return; }
  done
  die "could not find a free port"
}

BACK_PORT_FINAL="$(pick_free "$BACK_DEFAULT")"
FRONT_PORT_FINAL="$(pick_free "$FRONT_DEFAULT" "$BACK_PORT_FINAL")"

bold "→ ports"
info "backend : $BACK_PORT_FINAL  (desired $BACK_DEFAULT)"
info "frontend: $FRONT_PORT_FINAL (desired $FRONT_DEFAULT)"
info "ip      : $SERVER_IP"

upsert() {
  # upsert KEY VALUE FILE — replace existing KEY=... line, else append
  local k="$1" v="$2" f="$3"
  if grep -qE "^${k}=" "$f"; then
    # use | as sed delimiter; escape | in value just in case
    local v_esc
    v_esc=$(printf '%s' "$v" | sed 's/[|&\\]/\\&/g')
    sed -i "s|^${k}=.*|${k}=${v_esc}|" "$f"
  else
    printf '\n%s=%s\n' "$k" "$v" >> "$f"
  fi
}

bold "→ patching env files"
ALLOWED="http://${SERVER_IP}:${FRONT_PORT_FINAL},http://localhost:${FRONT_PORT_FINAL}"
upsert PORT            "$BACK_PORT_FINAL" "$ROOT/backend/.env"
upsert HOST            "0.0.0.0"          "$ROOT/backend/.env"
upsert ALLOWED_ORIGIN  "$ALLOWED"         "$ROOT/backend/.env"

upsert PORT                  "$FRONT_PORT_FINAL"                          "$ROOT/frontend/.env.local"
upsert NEXT_PUBLIC_API_BASE  "http://${SERVER_IP}:${BACK_PORT_FINAL}/api" "$ROOT/frontend/.env.local"

bold "→ backend deps + migrations"
( cd "$ROOT/backend" && uv sync && uv run alembic upgrade head )

bold "→ frontend deps + build"
( cd "$ROOT/frontend" && pnpm install && pnpm build )

bold "→ writing ecosystem.config.js"
cat > "$ROOT/ecosystem.config.js" <<EOF
module.exports = {
  apps: [
    {
      name: "ma-backend",
      cwd: "${ROOT}/backend",
      script: "uv",
      args: "run uvicorn app.main:app --host 0.0.0.0 --port ${BACK_PORT_FINAL}",
      interpreter: "none",
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: "ma-frontend",
      cwd: "${ROOT}/frontend",
      script: "pnpm",
      args: "start",
      interpreter: "none",
      env: { PORT: "${FRONT_PORT_FINAL}" },
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
EOF

bold "→ pm2 (re)start"
pm2 delete ma-backend ma-frontend >/dev/null 2>&1 || true
pm2 start "$ROOT/ecosystem.config.js"
pm2 save >/dev/null

echo
bold "✓ done"
info "backend : http://${SERVER_IP}:${BACK_PORT_FINAL}/api"
info "frontend: http://${SERVER_IP}:${FRONT_PORT_FINAL}"
info "logs    : pm2 logs"
info "status  : pm2 status"
info "boot    : pm2 startup systemd -u \$USER --hp \$HOME   # one-time"
