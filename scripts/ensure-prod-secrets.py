#!/usr/bin/env python3
"""Ensure production .env has strong secrets. Never prints secret values."""
from __future__ import annotations

import re
import secrets
import subprocess
import sys
from pathlib import Path

ENV_PATH = Path("/root/easy-cash/.env")
COMPOSE_DIR = Path("/root/easy-cash")

KNOWN_WEAK = {
    "",
    "easy-cash-secret-key-2024",
    "easy-cash-secret",
    "dev-only-change-me",
    "change-this-long-random-jwt-secret",
    "change-this-32-byte-encryption-key",
    "change-this-shared-integration-secret",
    "dev-shope-cash-secret",
}


def is_weak(value: str) -> bool:
    v = (value or "").strip().strip("\"'")
    if len(v) < 24:
        return True
    if v in KNOWN_WEAK:
        return True
    if v.startswith("change-this") or v.startswith("dev-only") or v.startswith("replace-with"):
        return True
    return False


def parse_env(text: str) -> dict[str, str]:
    vals: dict[str, str] = {}
    for line in text.splitlines():
        if not line.strip() or line.strip().startswith("#") or "=" not in line:
            continue
        key, raw = line.split("=", 1)
        vals[key.strip()] = raw.strip().strip("\"'")
    return vals


def set_key(text: str, key: str, value: str) -> str:
    line = f"{key}={value}"
    pat = re.compile(rf"^{re.escape(key)}=.*$", re.M)
    if pat.search(text):
        return pat.sub(line, text)
    if not text.endswith("\n"):
        text += "\n"
    return text + line + "\n"


def main() -> int:
    if not ENV_PATH.exists():
        print("MISSING_ENV", ENV_PATH)
        return 2

    text = ENV_PATH.read_text()
    vals = parse_env(text)
    changed: list[str] = []

    if is_weak(vals.get("JWT_SECRET", "")):
        text = set_key(text, "JWT_SECRET", secrets.token_urlsafe(48))
        changed.append("JWT_SECRET")

    if is_weak(vals.get("ENCRYPTION_KEY", "")):
        # Independent key; Paymob secrets may need re-entry if old key was weak/default
        text = set_key(text, "ENCRYPTION_KEY", secrets.token_urlsafe(48))
        changed.append("ENCRYPTION_KEY")

    if is_weak(vals.get("SHOPE_INTEGRATION_SECRET", "")):
        text = set_key(text, "SHOPE_INTEGRATION_SECRET", secrets.token_urlsafe(48))
        changed.append("SHOPE_INTEGRATION_SECRET")

    app_url = (vals.get("APP_URL") or "https://cash.easytecheg.net").strip().strip("\"'")
    if is_weak(vals.get("CORS_ORIGINS", "")) and not vals.get("CORS_ORIGINS"):
        text = set_key(text, "CORS_ORIGINS", app_url)
        changed.append("CORS_ORIGINS")

    if changed:
        ENV_PATH.write_text(text)
        print("UPDATED_KEYS", ",".join(changed))
    else:
        print("OK_ALREADY_STRONG")

    r = subprocess.run(
        ["docker", "compose", "up", "-d", "--force-recreate", "app"],
        cwd=str(COMPOSE_DIR),
        capture_output=True,
        text=True,
    )
    print("compose_rc", r.returncode)
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-1500:])
        return r.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
