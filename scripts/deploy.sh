#!/usr/bin/env bash
# نشر Easy Cash من الماك → السيرفر
#
# سريع (افتراضي) — rsync يرفع الملفات المتغيّرة فقط:
#   ./scripts/deploy.sh
#   ./scripts/deploy.sh --fast
#   pnpm deploy:fast
#
# كامل (tar لكل المشروع — أبطأ):
#   ./scripts/deploy.sh --full
#
# رفع فقط بدون Docker rebuild (للتجربة):
#   ./scripts/deploy.sh --sync-only
#
# SSH مباشر (Tailscale):
#   USE_DIRECT_SSH=1 SSH_HOST=100.96.29.105 ./scripts/deploy.sh
#
# مرة واحدة:
#   brew install cloudflared rsync
#   cloudflared access login

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE="rsync"   # rsync | tar
SYNC_ONLY=0
NO_CACHE=0

for arg in "$@"; do
  case "$arg" in
    --fast|-f) MODE="rsync" ;;
    --full|--tar) MODE="tar" ;;
    --sync-only) SYNC_ONLY=1 ;;
    --no-cache) NO_CACHE=1 ;;
    -h|--help)
      sed -n '2,22p' "$0"
      exit 0
      ;;
  esac
done

if [ "$(uname -s 2>/dev/null)" = "Darwin" ]; then
  export COPYFILE_DISABLE=1
fi

DEPLOY_PATH="${DEPLOY_PATH:-/root/easy-cash}"
SSH_HOST="${SSH_HOST:-${SSH_DEPLOY_HOST:-ssh-deploy.easytecheg.net}}"
SSH_USER="${SSH_USER:-${SSH_DEPLOY_USER:-root}}"
CF_HOST="${CF_TUNNEL_HOST:-ssh-deploy.easytecheg.net}"
APP_PORT="${APP_PORT:-8099}"

CTRL_DIR="${TMPDIR:-/tmp}/easy-cash-ssh-$$"
CTRL_PATH="$CTRL_DIR/control"
mkdir -p "$CTRL_DIR"
chmod 700 "$CTRL_DIR"

cleanup() {
  if [ -S "$CTRL_PATH" ]; then
    ssh -S "$CTRL_PATH" -O exit "$SSH_USER@$SSH_HOST" >/dev/null 2>&1 || true
  fi
  rm -rf "$CTRL_DIR"
}
trap cleanup EXIT

SSH_BASE=(
  -o ControlMaster=auto
  -o "ControlPath=$CTRL_PATH"
  -o ControlPersist=10m
  -o IdentitiesOnly=yes
  -o IdentityAgent=none
  -o StrictHostKeyChecking=no
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=8
)

# مفتاح نشر غير تفاعلي (GitHub Actions / mac) — يتجاوز طلب كلمة السر
SSH_IDENTITY_FILE="${SSH_IDENTITY_FILE:-$HOME/.ssh/github_deploy_easyshope}"
if [ -f "$SSH_IDENTITY_FILE" ]; then
  SSH_BASE+=(-i "$SSH_IDENTITY_FILE")
fi

if [ -z "${USE_DIRECT_SSH:-}" ] || [ "$USE_DIRECT_SSH" = "0" ]; then
  if ! command -v cloudflared >/dev/null 2>&1; then
    echo "❌ cloudflared غير مثبّت. ثبّته: brew install cloudflared && cloudflared access login"
    echo "   أو: USE_DIRECT_SSH=1 SSH_HOST=100.96.29.105 ./scripts/deploy.sh"
    exit 1
  fi
  SSH_BASE+=(-o "ProxyCommand=cloudflared access tcp --hostname $CF_HOST")
fi

_ssh() {
  ssh "${SSH_BASE[@]}" "$SSH_USER@$SSH_HOST" "$@"
}

# ملف خيارات SSH + wrapper لـ rsync (openrsync على macOS يكسّر -e لو السلسلة فيها مسافات)
{
  printf 'SSH_OPTS=('
  for opt in "${SSH_BASE[@]}"; do
    printf ' %q' "$opt"
  done
  printf ')\n'
} > "$CTRL_DIR/ssh_opts.sh"

cat > "$CTRL_DIR/rsh.sh" <<'WRAP'
#!/usr/bin/env bash
set -euo pipefail
# shellcheck disable=SC1091
source "$(dirname "$0")/ssh_opts.sh"
exec ssh "${SSH_OPTS[@]}" "$@"
WRAP
chmod +x "$CTRL_DIR/rsh.sh"

_pack() {
  if command -v gtar >/dev/null 2>&1; then
    gtar -czf - --format=gnu --owner=0 --group=0 \
      --exclude=node_modules \
      --exclude=.pnpm-store \
      --exclude=dist \
      --exclude=.git \
      --exclude=.manus-logs \
      --exclude=.env \
      --exclude=.env.local \
      --exclude=.env.production \
      --exclude=mega-kam-backup \
      --exclude=backups \
      --exclude=.DS_Store \
      --exclude=.cursor \
      --exclude=.claude \
      .
  else
    tar czf - \
      --exclude=node_modules \
      --exclude=.pnpm-store \
      --exclude=dist \
      --exclude=.git \
      --exclude=.manus-logs \
      --exclude=.env \
      --exclude=.env.local \
      --exclude=.env.production \
      --exclude=mega-kam-backup \
      --exclude=backups \
      --exclude=.DS_Store \
      --exclude=.cursor \
      --exclude=.claude \
      .
  fi
}

_upload_tar() {
  echo "[deploy] Upload via tar → $DEPLOY_PATH ..."
  _ssh "set -euo pipefail; cd '$DEPLOY_PATH'; test -f .env && cp -p .env .env.deploy-backup || true"
  _pack | _ssh "set -euo pipefail; tar xzf - -C '$DEPLOY_PATH'"
  _ssh "set -euo pipefail; cd '$DEPLOY_PATH'; if test -f .env.deploy-backup; then mv -f .env.deploy-backup .env; elif ! test -f .env; then cp .env.example .env; fi"
  echo "[deploy] Files uploaded (server .env preserved)."
}

_upload_rsync() {
  echo "[deploy] Fast upload (rsync — changed files only) → $DEPLOY_PATH ..."
  # بدون --stats/--info (openrsync/macOS حسّاس). الـ wrapper يضمن ProxyCommand سليم.
  rsync -az --delete --progress \
    -e "$CTRL_DIR/rsh.sh" \
    "${RSYNC_EXCLUDES[@]}" \
    ./ "${SSH_USER}@${SSH_HOST}:${DEPLOY_PATH}/"
  echo "[deploy] rsync done (server .env never overwritten — excluded)."
}

RSYNC_EXCLUDES=(
  --exclude=node_modules/
  --exclude=.pnpm-store/
  --exclude=dist/
  --exclude=.git/
  --exclude=.manus-logs/
  --exclude=.env
  --exclude=.env.local
  --exclude=.env.production
  --exclude=.env.deploy-backup
  --exclude=mega-kam-backup/
  --exclude=backups/
  --exclude=.DS_Store
  --exclude=._*
  --exclude=.cursor/
  --exclude=.claude/
  --exclude=coverage/
  --exclude=*.log
  --exclude=last_deploy.txt
)

echo "[deploy] Opening one SSH session..."
if [ -f "$SSH_IDENTITY_FILE" ]; then
  ssh "${SSH_BASE[@]}" -o ControlMaster=yes "$SSH_USER@$SSH_HOST" "echo ssh-ready"
else
  ssh -t "${SSH_BASE[@]}" -o ControlMaster=yes "$SSH_USER@$SSH_HOST" "echo ssh-ready"
fi

_ssh "mkdir -p '$DEPLOY_PATH'"

UPLOAD_OK=0
if [ "$MODE" = "rsync" ] && command -v rsync >/dev/null 2>&1; then
  if _upload_rsync; then
    UPLOAD_OK=1
  else
    echo "⚠️  rsync فشل (غالباً openrsync على الماك) — تحويل تلقائي لرفع tar..."
    MODE="tar"
  fi
fi

if [ "$UPLOAD_OK" != "1" ]; then
  _upload_tar
fi

_ssh "set -euo pipefail; cd '$DEPLOY_PATH'; test -f .env || cp .env.example .env"

if [ "$SYNC_ONLY" = "1" ]; then
  echo ""
  echo "✅ Sync only — files uploaded, Docker not rebuilt."
  echo "   لإعادة البناء لاحقاً: ./scripts/deploy.sh --fast"
  exit 0
fi

BUILD_FLAGS="--build --force-recreate --no-deps"
if [ "$NO_CACHE" = "1" ]; then
  BUILD_FLAGS="--build --force-recreate --no-deps --pull"
fi

echo "[deploy] Building & starting Docker on server (cached layers = أسرع في المرات الجاية)..."
_ssh "bash -s" <<REMOTE
set -euo pipefail
cd '$DEPLOY_PATH'
test -f .env || cp .env.example .env
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
if docker compose version >/dev/null 2>&1; then
  docker compose up -d --no-recreate mysql 2>/dev/null || docker compose up -d mysql
  if [ "$NO_CACHE" = "1" ]; then
    docker compose build --no-cache --pull app
    docker compose up -d --force-recreate --no-deps app
  else
    docker compose up -d --build --force-recreate --no-deps app
  fi
elif command -v docker-compose >/dev/null 2>&1; then
  docker-compose up -d --no-recreate mysql 2>/dev/null || docker-compose up -d mysql
  if [ "$NO_CACHE" = "1" ]; then
    docker-compose build --no-cache --pull app
    docker-compose up -d --force-recreate --no-deps app
  else
    docker-compose up -d --build --force-recreate --no-deps app
  fi
else
  echo 'Docker Compose not found'
  exit 1
fi
for i in \$(seq 1 60); do
  if curl -fsS http://127.0.0.1:${APP_PORT}/api/health 2>/dev/null | grep -q 'easy-cash-erp'; then
    break
  fi
  sleep 3
done
if ! curl -fsS http://127.0.0.1:${APP_PORT}/api/health 2>/dev/null | grep -q 'easy-cash-erp'; then
  echo ""
  echo "Health check failed on port ${APP_PORT}. Recent app logs:"
  if docker compose version >/dev/null 2>&1; then
    docker compose logs --tail=80 app || true
  else
    docker-compose logs --tail=80 app || true
  fi
  exit 1
fi
curl -fsS http://127.0.0.1:${APP_PORT}/api/health
printf '%s deploy-from-mac\n' "\$(date -u +'%Y-%m-%dT%H:%M:%SZ')" | tee '$DEPLOY_PATH/last_deploy.txt' >/dev/null
if [ -x scripts/setup-ollama-truenas.sh ]; then
  echo "[deploy] Linking Ollama network for Easy Cash..."
  scripts/setup-ollama-truenas.sh || echo "[deploy] Ollama setup skipped (container may be offline)"
  echo "[deploy] Restarting app to load Ollama .env ..."
  if docker compose version >/dev/null 2>&1; then
    docker compose up -d --force-recreate --no-deps app
  else
    docker-compose up -d --force-recreate --no-deps app
  fi
  for i in \$(seq 1 30); do
    if curl -fsS http://127.0.0.1:${APP_PORT}/api/health 2>/dev/null | grep -q 'easy-cash-erp'; then
      break
    fi
    sleep 2
  done
fi
REMOTE

echo ""
echo "✅ Done — https://cash.easytecheg.net"
echo "   تكليف الشحنة: https://cash.easytecheg.net/kam/import-costing"
echo "   Migrations run automatically on app start (docker-entrypoint.sh)."
echo ""
echo "💡 نصيحة: أسرع رفع = rsync (الافتراضي). أبطأ جزء عادة Docker build على السيرفر."
echo "   رفع بس من غير بناء: ./scripts/deploy.sh --sync-only"
