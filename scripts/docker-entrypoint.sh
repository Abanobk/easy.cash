#!/bin/sh
set -eu

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
