/**
 * Cloudflare Turnstile verification (optional).
 * Docs: https://developers.cloudflare.com/turnstile/
 */
import { ENV } from "./_core/env";

export function turnstileSiteKey(): string | null {
  const key = String(process.env.TURNSTILE_SITE_KEY || "").trim();
  return key || null;
}

export function turnstileSecretKey(): string | null {
  const key = String(process.env.TURNSTILE_SECRET_KEY || "").trim();
  return key || null;
}

/** When secret is set, registration must include a valid Turnstile token. */
export function turnstileRequired(): boolean {
  if (process.env.TURNSTILE_REQUIRED === "0") return false;
  if (turnstileSecretKey()) return true;
  return ENV.isProduction && process.env.TURNSTILE_REQUIRED === "1";
}

export async function verifyTurnstileToken(opts: {
  token: string | undefined | null;
  ip?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const secret = turnstileSecretKey();
  if (!secret) {
    // Not configured — skip (honeypot / checkbox still apply)
    return { ok: true };
  }
  const token = String(opts.token || "").trim();
  if (!token) {
    return { ok: false, message: " أكّد أنك لست روبوتاً ثم أعد المحاولة" };
  }

  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token);
    if (opts.ip && opts.ip !== "unknown") body.set("remoteip", opts.ip);

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!data.success) {
      return { ok: false, message: "فشل التحقق من «لست روبوتاً» — حدّث الصفحة وحاول مرة أخرى" };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "تعذر التحقق من الحماية ضد الروبوتات — حاول لاحقاً" };
  }
}
