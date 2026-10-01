#!/usr/bin/env bash
# One-shot prereq installer for Ubuntu.
# Idempotent — safe to re-run. Installs: apt deps, uv, node 22, pnpm, pm2.
#
# Usage:
#   chmod +x bootstrap.sh
#   ./bootstrap.sh

set -euo pipefail

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }

[ "$(id -u)" -eq 0 ] && SUDO="" || SUDO="sudo"

bold "→ apt update + base packages"
$SUDO apt-get update -y
$SUDO apt-get install -y \
  python3.12 python3.12-venv python3-pip \
  ffmpeg curl git build-essential iproute2 ca-certificates gnupg

bold "→ uv (python pkg manager)"
if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  # shellcheck disable=SC1091
  [ -f "$HOME/.local/bin/env" ] && . "$HOME/.local/bin/env"
  export PATH="$HOME/.local/bin:$PATH"
else
  info "uv already installed: $(uv --version)"
fi

bold "→ node 22 (NodeSource)"
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -qE '^v(2[2-9]|[3-9][0-9])'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash -
  $SUDO apt-get install -y nodejs
else
  info "node already installed: $(node -v)"
fi

bold "→ pnpm + pm2 (global)"
$SUDO npm i -g pnpm pm2

bold "→ versions"
info "python  : $(python3 --version 2>&1)"
info "uv      : $(uv --version 2>&1)"
info "node    : $(node -v)"
info "pnpm    : $(pnpm -v)"
info "pm2     : $(pm2 -v)"
info "ffmpeg  : $(ffmpeg -version | head -n1)"

bold "✓ prereqs ready"
info "next: copy backend/.env.example → backend/.env (fill keys),"
info "      copy frontend/.env.example → frontend/.env.local,"
info "      then ./setup.sh"
info ""
info "if uv not on PATH in new shells, add to ~/.bashrc:"
info "  export PATH=\"\$HOME/.local/bin:\$PATH\""
