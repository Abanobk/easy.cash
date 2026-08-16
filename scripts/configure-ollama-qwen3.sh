#!/usr/bin/env bash
# ضبط Ollama على TrueNAS ليطابق Easy Tech + Vision لصور الشيكات
# من الماك (باسورد مرة واحدة):
#   ./scripts/configure-ollama-qwen3.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEPLOY_PATH="${DEPLOY_PATH:-/root/easy-cash}"
SSH_HOST="${SSH_HOST:-${SSH_DEPLOY_HOST:-ssh-deploy.easytecheg.net}}"
SSH_USER="${SSH_USER:-${SSH_DEPLOY_USER:-root}}"
CF_HOST="${CF_TUNNEL_HOST:-ssh-deploy.easytecheg.net}"
APP_PORT="${APP_PORT:-8099}"
OLLAMA_MODEL="${OLLAMA_MODEL:-qwen3:14b}"
OLLAMA_MODEL_HEAVY="${OLLAMA_MODEL_HEAVY:-qwen3:14b}"
# الاسم الصحيح على مكتبة Ollama: qwen2.5vl (بدون شرطة) — ليس qwen2.5-vl
OLLAMA_VISION_MODEL="${OLLAMA_VISION_MODEL:-qwen2.5vl}"
OLLAMA_CONTAINER="${OLLAMA_CONTAINER:-ix-ollama-ollama-1}"

CTRL_DIR="${TMPDIR:-/tmp}/easy-cash-ollama-ssh-$$"
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
  -o ControlPersist=15m
  -o IdentitiesOnly=yes
  -o IdentityAgent=none
  -o StrictHostKeyChecking=no
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=12
)

if [ -z "${USE_DIRECT_SSH:-}" ] || [ "$USE_DIRECT_SSH" = "0" ]; then
  if ! command -v cloudflared >/dev/null 2>&1; then
    echo "❌ cloudflared غير مثبّت. أو: USE_DIRECT_SSH=1 SSH_HOST=100.96.29.105 $0"
    exit 1
  fi
  SSH_BASE+=(-o "ProxyCommand=cloudflared access tcp --hostname $CF_HOST")
fi

_ssh() {
  ssh "${SSH_BASE[@]}" "$SSH_USER@$SSH_HOST" "$@"
}

echo "[ollama] Opening SSH (password once)..."
ssh -t "${SSH_BASE[@]}" -o ControlMaster=yes "$SSH_USER@$SSH_HOST" "echo ssh-ready"

echo "[ollama] Pull models + write .env + recreate app (may take several minutes)..."
_ssh "bash -s" <<REMOTE
set -euo pipefail
cd '$DEPLOY_PATH'
test -f .env || cp .env.example .env

OLLAMA_CONTAINER='$OLLAMA_CONTAINER'
OLLAMA_MODEL='$OLLAMA_MODEL'
OLLAMA_MODEL_HEAVY='$OLLAMA_MODEL_HEAVY'
OLLAMA_VISION_MODEL='$OLLAMA_VISION_MODEL'

echo "[ollama] Ensuring text model: \$OLLAMA_MODEL"
if docker inspect "\$OLLAMA_CONTAINER" >/dev/null 2>&1; then
  if ! docker exec "\$OLLAMA_CONTAINER" ollama list 2>/dev/null | grep -Fq "\$OLLAMA_MODEL"; then
    docker exec "\$OLLAMA_CONTAINER" ollama pull "\$OLLAMA_MODEL"
  else
    echo "[ollama] \$OLLAMA_MODEL already present"
  fi

  echo "[ollama] Ensuring vision model: \$OLLAMA_VISION_MODEL (download may take a while)..."
  if ! docker exec "\$OLLAMA_CONTAINER" ollama list 2>/dev/null | grep -Fq "\$OLLAMA_VISION_MODEL"; then
    docker exec "\$OLLAMA_CONTAINER" ollama pull "\$OLLAMA_VISION_MODEL"
  else
    echo "[ollama] \$OLLAMA_VISION_MODEL already present"
  fi

  echo "[ollama] Installed models:"
  docker exec "\$OLLAMA_CONTAINER" ollama list || true
else
  echo "❌ Ollama container not found: \$OLLAMA_CONTAINER"
  exit 1
fi

# اكتب إعدادات OLLAMA في .env
grep -v '^OLLAMA_' .env > .env.tmp || true
mv .env.tmp .env

# اربط شبكة Ollama واضبط BASE_URL إن أمكن
if [ -x scripts/setup-ollama-truenas.sh ]; then
  OLLAMA_MODEL="\$OLLAMA_MODEL" OLLAMA_MODEL_HEAVY="\$OLLAMA_MODEL_HEAVY" \\
    OLLAMA_VISION_MODEL="\$OLLAMA_VISION_MODEL" \\
    scripts/setup-ollama-truenas.sh || true
fi

# تأكد من وجود VISION بعد السكربت (setup قد يمسحها لو قديم)
grep -v '^OLLAMA_' .env > .env.tmp || true
mv .env.tmp .env

# اقرأ الشبكة/الـ URL من الحاوية إن أمكن
OLLAMA_NET=\$(docker inspect "\$OLLAMA_CONTAINER" -f '{{range \$k,\$v := .NetworkSettings.Networks}}{{\$k}}{{end}}' 2>/dev/null | awk '{print \$1; exit}')
OLLAMA_URL="http://\${OLLAMA_CONTAINER}:11434"
if [ -n "\${OLLAMA_NET:-}" ]; then
  if docker inspect easy-cash-app >/dev/null 2>&1; then
    docker network connect "\$OLLAMA_NET" easy-cash-app 2>/dev/null || true
  fi
fi

cat >> .env <<EOF

# Ollama — Easy Tech text + vision للشيكات/الإيصالات
OLLAMA_DOCKER_NETWORK=\${OLLAMA_NET:-ix-ollama_default}
OLLAMA_BASE_URL=\$OLLAMA_URL
OLLAMA_MODEL=\$OLLAMA_MODEL
OLLAMA_MODEL_HEAVY=\$OLLAMA_MODEL_HEAVY
OLLAMA_VISION_MODEL=\$OLLAMA_VISION_MODEL
OLLAMA_ENABLED=1
EOF

echo "[ollama] Recreate app..."
if docker compose version >/dev/null 2>&1; then
  docker compose up -d --force-recreate --no-deps app
else
  docker-compose up -d --force-recreate --no-deps app
fi

for i in \$(seq 1 40); do
  if curl -fsS http://127.0.0.1:${APP_PORT}/api/health 2>/dev/null | grep -q 'easy-cash-erp'; then
    break
  fi
  sleep 3
done
echo "[ollama] Health: \$(curl -fsS http://127.0.0.1:${APP_PORT}/api/health 2>/dev/null || echo fail)"
echo "[ollama] Active env:"
grep '^OLLAMA_' .env || true
REMOTE

echo ""
echo "✅ Done"
echo "   Text:    $OLLAMA_MODEL"
echo "   Heavy:   $OLLAMA_MODEL_HEAVY"
echo "   Vision:  $OLLAMA_VISION_MODEL"
echo "   App:     https://cash.easytecheg.net"
