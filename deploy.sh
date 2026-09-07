#!/usr/bin/env bash
#
# deploy.sh — Build backend image (linux/amd64) at local, upload to VPS, reload service.
#
# Usage:
#   ./deploy.sh                 # build + deploy using latest (git short sha)
#   ./deploy.sh --tag v1.2.3    # build + deploy a specific tag
#   ./deploy.sh --migrate       # also run TypeORM migrations after deploy
#   ./deploy.sh --rollback      # reload the previously deployed image
#
# Config is read from env vars or deploy.env if present.

set -euo pipefail

# ---------- Configuration (override via deploy.env or env) ----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/deploy.env" ]; then
  # shellcheck disable=SC1091
  set -a; source "$SCRIPT_DIR/deploy.env"; set +a
fi

: "${VPS_HOST:=103.20.102.93}"
: "${VPS_USER:=root}"
: "${APP_DIR:=/opt/stockvn}"
: "${SSH_KEY:=${HOME}/.ssh/stockvn_deploy}"
: "${COMPOSE_FILE:=docker-compose.prod.yml}"
: "${IMAGE_NAME:=stock-backend}"
: "${IMAGE_TAG:=$(git -C "$SCRIPT_DIR" rev-parse --short HEAD 2>/dev/null || echo "latest")}"

SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o LogLevel=quiet -o ConnectTimeout=20)
REMOTE="${VPS_USER}@${VPS_HOST}"
TARGET_PREFIX="${REMOTE}:${APP_DIR}"

# ---------- Flags ----------
DO_MIGRATE=false
DO_ROLLBACK=false
for arg in "$@"; do
  case "$arg" in
    --migrate) DO_MIGRATE=true ;;
    --rollback) DO_ROLLBACK=true ;;
    --tag=*) IMAGE_TAG="${arg#*=}" ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

# ---------- Helpers ----------
log()  { echo -e "\033[0;34m[deploy]\033[0m $*"; }
err()  { echo -e "\033[0;31m[error]\033[0m $*" >&2; }
vssh() { ssh "${SSH_OPTS[@]}" "$REMOTE" "$@"; }
vscp() { scp "${SSH_OPTS[@]}" "$@"; }

# Backend is not published to the host; check it through the frontend proxy
# which nginx routes to the backend container (host port 8080 -> /api/health).
healthcheck_backend() {
  # Source :8080 frontend expect backend up via compose depends; we poll upstream.
  log "Waiting for backend health via :8080/api/health ..."
  for _ in $(seq 1 40); do
    code=$(vssh "curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/api/health 2>/dev/null || echo 000")
    if [ "$code" = "200" ]; then
      log "Backend healthy (HTTP 200 via proxy)."
      return 0
    fi
    sleep 5
  done
  err "Backend health check failed."
  return 1
}

compose() { vssh "cd ${APP_DIR} && docker compose -f ${COMPOSE_FILE} --env-file .env.prod $1"; }

# ---------- Rollback mode ----------
if [ "$DO_ROLLBACK" = true ]; then
  log "Rolling back backend to previous tag..."
  prev=$(vssh "cat ${APP_DIR}/.last-backend-tag 2>/dev/null || echo ''")
  if [ -z "$prev" ]; then
    err "No previous tag recorded. Nothing to roll back."
    exit 1
  fi
  log "Previous tag: $prev (must already be loaded on the VPS)"
  vssh "docker tag ${IMAGE_NAME}:${prev} ${IMAGE_NAME}:latest"
  compose "up -d --remove-orphans backend"
  healthcheck_backend || exit 1
  log "Rollback complete."
  exit 0
fi

# ---------- Build (amd64) ----------
log "Building backend image (linux/amd64) tag=${IMAGE_TAG} ..."
docker buildx build --platform linux/amd64 -t "${IMAGE_NAME}:${IMAGE_TAG}" --load "$SCRIPT_DIR"
log "Build done."

# Confirm it is actually amd64 (protects against native arm64 builds)
ARCH=$(docker image inspect "${IMAGE_NAME}:${IMAGE_TAG}" --format "{{.Architecture}}")
if [ "$ARCH" != "amd64" ]; then
  err "Built image is ${ARCH}, expected amd64. Aborting."
  exit 1
fi

# ---------- Save + upload ----------
TAR="${IMAGE_NAME}.tar"
log "Saving image to ${TAR} ..."
docker save "${IMAGE_NAME}:${IMAGE_TAG}" -o "$TAR"
log "Uploading ${TAR} to VPS..."
vscp "$TAR" "$TARGET_PREFIX"

# ---------- Load + (re)tag + redeploy ----------
log "Loading image on VPS..."
vssh "docker load -i ${APP_DIR}/${TAR}"
vssh "docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${IMAGE_NAME}:latest"
rm -f "$TAR"

compose "up -d --remove-orphans backend"

healthcheck_backend || exit 1

# ---------- Optional migrations ----------
if [ "$DO_MIGRATE" = true ]; then
  log "Running database migrations..."
  vssh "cd ${APP_DIR} && docker compose -f ${COMPOSE_FILE} --env-file .env.prod exec -T backend node ./node_modules/typeorm/cli.js -d dist/database/data-source.js migration:run" || {
    err "Migration failed (schema unchanged). Backend may need attention."
  }
  healthcheck_backend || exit 1
fi

# ---------- Record last good tag ----------
vssh "printf '%s' '${IMAGE_TAG}' > ${APP_DIR}/.last-backend-tag"
log "Deployed backend tag=${IMAGE_TAG}."
log "✓ Backend is live. To roll back later, run: ./deploy.sh --rollback"