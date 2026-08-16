/**
 * Enforce strong secrets — no hardcoded fallbacks in production.
 */
import { ENV } from "./_core/env";

const KNOWN_WEAK = new Set([
  "",
  "easy-cash-secret-key-2024",
  "easy-cash-secret",
  "dev-only-change-me",
  "change-this-long-random-jwt-secret",
  "change-this-32-byte-encryption-key",
  "change-this-shared-integration-secret",
  "dev-shope-cash-secret",
]);

function isWeakSecret(value: string | undefined | null): boolean {
  const v = String(value || "").trim();
  if (!v) return true;
  if (v.length < 24) return true;
  if (KNOWN_WEAK.has(v)) return true;
  if (/^change-this/i.test(v)) return true;
  if (/^dev-only/i.test(v)) return true;
  return false;
}

export function resolveJwtSecret(): string {
  const secret = String(ENV.cookieSecret || "").trim();
  if (isWeakSecret(secret)) {
    if (ENV.isProduction && process.env.ALLOW_WEAK_SECRETS !== "1") {
      throw new Error(
        "[security] JWT_SECRET مفقود أو ضعيف. عيّن سراً عشوائياً طويلاً (≥24) في .env بدون قيم افتراضية.",
      );
    }
    console.warn("[security] JWT_SECRET ضعيف — مسموح فقط في التطوير (ALLOW_WEAK_SECRETS أو غير production)");
    return secret || `dev-insecure-${process.pid}`;
  }
  return secret;
}

export function resolveEncryptionKey(): string {
  const secret = String(process.env.ENCRYPTION_KEY || ENV.cookieSecret || "").trim();
  if (isWeakSecret(secret)) {
    if (ENV.isProduction && process.env.ALLOW_WEAK_SECRETS !== "1") {
      throw new Error(
        "[security] ENCRYPTION_KEY مفقود أو ضعيف. عيّن سراً عشوائياً طويلاً (≥24) في .env.",
      );
    }
    console.warn("[security] ENCRYPTION_KEY ضعيف — مسموح فقط في التطوير");
    return secret || resolveJwtSecret();
  }
  return secret;
}

/** Call once at process start before accepting traffic. */
export function assertSecuritySecretsAtBoot(): void {
  resolveJwtSecret();
  resolveEncryptionKey();
  const shope = String(process.env.SHOPE_INTEGRATION_SECRET || "").trim();
  if (shope && isWeakSecret(shope) && ENV.isProduction && process.env.ALLOW_WEAK_SECRETS !== "1") {
    throw new Error("[security] SHOPE_INTEGRATION_SECRET ضعيف — غيّره قبل الإنتاج.");
  }
}

export function paymobRequireHmac(): boolean {
  if (process.env.PAYMOB_ALLOW_UNSIGNED === "1") return false;
  return ENV.isProduction || process.env.PAYMOB_REQUIRE_HMAC === "1";
}
