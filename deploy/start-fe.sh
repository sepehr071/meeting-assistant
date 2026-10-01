#!/usr/bin/env bash
# pm2 launcher for the Next.js frontend (template).
# Sources nvm so node 22 is found at runtime AND at boot (systemd PATH lacks
# nvm), then exec's `next start` bound to localhost (nginx proxies to it).
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
cd "${APP_DIR:-/opt/meeting-assistant}/frontend"
export NODE_ENV=production
exec node_modules/.bin/next start -H 127.0.0.1 -p 3001
