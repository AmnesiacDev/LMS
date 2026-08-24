#!/usr/bin/env bash
#
# Deploy algogambit.online — backend API and frontend bundle.
#
# Run from cron as:
#   0 3 * * * /var/www/lms/Backend/deploy/deploy.sh >> /var/log/lms-deploy.log 2>&1
#
# 03:00, not midnight: Utilities/scheduler.js registers cron.schedule("0 0 * * *")
# to materialize the session series. Restarting the process at exactly midnight
# races that job and can drop a day's sessions.
#
# Cron does not source .bashrc or .profile, so nvm-installed node is not on PATH
# and the frontend's required build vars are unset. Both are handled below.

set -euo pipefail

BACKEND_DIR="${BACKEND_DIR:-/var/www/lms/Backend}"
FRONTEND_DIR="${FRONTEND_DIR:-/var/www/lms/FrontEnd}"
WEB_ROOT="${WEB_ROOT:-/var/www/algogambit}"
PM2_APP="${PM2_APP:-lms-backend}"

# The frontend build hard-fails if either of these is missing or points at
# localhost — see validateBuildEnvironment in FrontEnd/vite.config.js.
export VITE_API_BASE="${VITE_API_BASE:-https://algogambit.online}"
export VITE_SOCKET_URL="${VITE_SOCKET_URL:-https://algogambit.online}"

# Put nvm's node on PATH when running headless.
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
fi

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

log "=== deploy start ==="
log "node $(node -v)  npm $(npm -v)"

# ─── Backend ─────────────────────────────────────────────────────────────────
log "--- backend ---"
cd "$BACKEND_DIR"

before=$(git rev-parse HEAD)
git fetch --quiet origin
git pull --ff-only origin main
after=$(git rev-parse HEAD)

if [ "$before" = "$after" ]; then
  log "backend already at $after"
else
  log "backend $before -> $after"
fi

npm ci --omit=dev
pm2 restart "$PM2_APP" --update-env
pm2 save

# ─── Frontend ────────────────────────────────────────────────────────────────
# dist/ is gitignored, so the bundle is built here rather than pulled.
log "--- frontend ---"
cd "$FRONTEND_DIR"

git fetch --quiet origin
git pull --ff-only origin main

npm ci
npm run build

# Copy rather than move so the old bundle survives a failed build above:
# `set -e` means a build failure never reaches this line.
log "publishing dist -> $WEB_ROOT"
rsync -a --delete dist/ "$WEB_ROOT/"

# ─── Verify ──────────────────────────────────────────────────────────────────
log "--- verify ---"

health=$(curl -s -o /dev/null -w '%{http_code}' https://algogambit.online/api/v1/health)
log "health: $health"

# 401 is the pass condition: the route exists and is demanding auth. A 404
# means the router did not load and the deploy did not take.
canvas=$(curl -s -o /dev/null -w '%{http_code}' https://algogambit.online/api/v1/session-canvas/me)
log "session-canvas/me: $canvas (expect 401, NOT 404)"

sio=$(curl -s "https://algogambit.online/socket.io/?EIO=4&transport=polling" | head -c 1)
log "socket.io first byte: '$sio' (expect 0, not '<')"

log "=== deploy done ==="
