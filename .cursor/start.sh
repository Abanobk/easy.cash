#!/usr/bin/env bash
# Per-boot runtime initialization for Easy Cash (ERP).
# Starts MySQL and reconciles the database. Must be idempotent.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DB_NAME="easy_cash"
DB_USER="easy_cash"
DB_PASS="easy_cash_dev"
DB_URL="mysql://${DB_USER}:${DB_PASS}@127.0.0.1:3306/${DB_NAME}"

echo "==> Starting MySQL"
sudo service mysql start || true
for i in $(seq 1 60); do
  if sudo mysqladmin ping >/dev/null 2>&1; then break; fi
  sleep 1
done

echo "==> Ensuring database and user exist"
sudo mysql <<SQL || true
CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'127.0.0.1';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL

echo "==> Applying database migrations (idempotent)"
DATABASE_URL="${DB_URL}" node scripts/run-migrations.mjs || true

echo "==> Start complete"
