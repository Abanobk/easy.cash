#!/usr/bin/env bash
# ربط Easy Cash بـ Ollama على TrueNAS (شبكة Docker مباشرة — بدون host.docker.internal)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
OLLAMA_CONTAINER="${OLLAMA_CONTAINER:-ix-ollama-ollama-1}"
APP_CONTAINER="${APP_CONTAINER:-easy-cash-app}"
OLLAMA_MODEL="${OLLAMA_MODEL:-qwen3:14b}"
OLLAMA_MODEL_HEAVY="${OLLAMA_MODEL_HEAVY:-qwen3:14b}"
OLLAMA_VISION_MODEL="${OLLAMA_VISION_MODEL:-}"

if ! docker inspect "$OLLAMA_CONTAINER" >/dev/null 2>&1; then
  echo "❌ حاوية Ollama غير موجودة: $OLLAMA_CONTAINER"
  echo "   اعرض الحاويات: docker ps --format '{{.Names}}' | grep -i ollama"
  exit 1
fi

read -r OLLAMA_NET OLLAMA_IP < <(
  docker inspect "$OLLAMA_CONTAINER" -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{$v.IPAddress}}{{end}}' | awk '{print $1, $2; exit}'
)

if [ -z "${OLLAMA_NET:-}" ] || [ -z "${OLLAMA_IP:-}" ]; then
  echo "❌ تعذّر قراءة شبكة Ollama"
  exit 1
fi

echo "[ollama] شبكة: $OLLAMA_NET | IP: $OLLAMA_IP | حاوية: $OLLAMA_CONTAINER"

if docker inspect "$APP_CONTAINER" >/dev/null 2>&1; then
  if ! docker inspect "$APP_CONTAINER" -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' | grep -qw "$OLLAMA_NET"; then
    echo "[ollama] ربط $APP_CONTAINER بشبكة $OLLAMA_NET ..."
    docker network connect "$OLLAMA_NET" "$APP_CONTAINER" 2>/dev/null || true
  fi
fi

OLLAMA_URL="http://${OLLAMA_CONTAINER}:11434"
if ! docker exec "$APP_CONTAINER" wget -qO- --timeout=8 "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
  OLLAMA_URL="http://${OLLAMA_IP}:11434"
  echo "[ollama] الاسم الداخلي لم ينجح — استخدام IP: $OLLAMA_URL"
  docker exec "$APP_CONTAINER" wget -qO- --timeout=8 "$OLLAMA_URL/api/tags" >/dev/null
fi

touch "$ENV_FILE"
grep -v '^OLLAMA_' "$ENV_FILE" > "${ENV_FILE}.tmp" || true
mv "${ENV_FILE}.tmp" "$ENV_FILE"
cat >> "$ENV_FILE" <<EOF

# Ollama (TrueNAS — شبكة Docker مباشرة — مطابقة Easy Tech Flutter)
OLLAMA_DOCKER_NETWORK=$OLLAMA_NET
OLLAMA_BASE_URL=$OLLAMA_URL
OLLAMA_MODEL=$OLLAMA_MODEL
OLLAMA_MODEL_HEAVY=$OLLAMA_MODEL_HEAVY
OLLAMA_VISION_MODEL=${OLLAMA_VISION_MODEL:-qwen2.5vl}
OLLAMA_ENABLED=1
EOF

echo ""
echo "✅ تم — أضيف لـ $ENV_FILE:"
grep '^OLLAMA_' "$ENV_FILE"
echo ""
# تأكيد وجود qwen3:14b على Ollama (نفس Flutter App 2)
if docker exec "$OLLAMA_CONTAINER" ollama list 2>/dev/null | grep -qi 'qwen3:14b'; then
  echo "[ollama] qwen3:14b موجود ✓"
else
  echo "[ollama] تحذير: qwen3:14b غير ظاهر في القائمة — إن لزم: docker exec $OLLAMA_CONTAINER ollama pull qwen3:14b"
fi
if docker exec "$OLLAMA_CONTAINER" ollama list 2>/dev/null | grep -Eiq 'qwen2\.5vl|qwen2\.5-vl|vision|llava'; then
  echo "[ollama] vision model موجود ✓"
else
  echo "[ollama] تحذير: موديل vision غير موجود — اسحب: docker exec $OLLAMA_CONTAINER ollama pull qwen2.5vl"
fi
echo ""
echo "الخطوة التالية:"
echo "  cd $ROOT && docker compose up -d --force-recreate app"
