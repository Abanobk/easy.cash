#!/bin/sh
set -eu

# Build DATABASE_URL with URL-encoded password (handles ! @ # etc. in .env)
if [ -z "${DATABASE_URL:-}" ] && [ -n "${MYSQL_PASSWORD:-}" ]; then
  DB_USER="${MYSQL_USER:-easy_cash}"
  DB_HOST="${MYSQL_HOST:-mysql}"
  DB_PORT="${MYSQL_PORT:-3306}"
  DB_NAME="${MYSQL_DATABASE:-easy_cash}"
  ENC_PW="$(node -e "process.stdout.write(encodeURIComponent(process.argv[1]))" "$MYSQL_PASSWORD")"
  export DATABASE_URL="mysql://${DB_USER}:${ENC_PW}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
fi

if [ -n "${DATABASE_URL:-}" ]; then
  echo "Running database migrations..."
  for i in $(seq 1 30); do
    if node scripts/run-migrations.mjs; then
      break
    fi
    if [ "$i" -eq 30 ]; then
      echo "Migrations failed after 30 attempts"
      exit 1
    fi
    echo "Migration attempt ${i} failed, retrying in 3s..."
    sleep 3
  done
fi

exec "$@"
