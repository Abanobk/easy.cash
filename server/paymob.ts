import crypto from "crypto";
import type { Request } from "express";
import { ENV } from "./_core/env";

export type PaymobPublicConfig = {
  publicKey: string;
  publicKeyLast8?: string;
  cardIntegrationId: number;
  currency: string;
};

export type PaymobSecretConfig = {
  secretKey: string;
  hmacSecret?: string;
};

function getEncryptionKey() {
  const secret = ENV.cookieSecret || "easy-cash-secret";
  return crypto.createHash("sha256").update(secret).digest();
}

export function encodeSecret(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decodeSecret<T>(encoded: string): T {
  if (encoded.startsWith("v1:")) {
    const [, iv, tag, data] = encoded.split(":");
    const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
    return JSON.parse(decrypted) as T;
  }
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as T;
}

export function paymobCheckoutUrl(publicKey: string, clientSecret: string) {
  const params = new URLSearchParams({ publicKey, clientSecret });
  return `https://accept.paymob.com/unifiedcheckout/?${params.toString()}`;
}

export function isLikelyPaymobPublicKey(value: unknown) {
  const key = String(value || "").trim();
  return /(^|_)pk(_|l_|t_|test_|live_)/i.test(key) || /^pkt_/i.test(key) || /^pkl_/i.test(key);
}

export function assertPaymobPublicKey(publicKey: unknown) {
  if (!isLikelyPaymobPublicKey(publicKey)) {
    throw new Error(
      "Paymob Public Key غير صحيح. افتح Paymob > Developers > API Keys وانسخ Public Key الذي يبدأ بـ pk أو egy_pk."
    );
  }
}

export function paymobErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "Paymob رفض طلب الدفع";
  const body = payload as Record<string, unknown>;
  const direct = body.message || body.detail || body.error;
  if (typeof direct === "string") return direct;
  const errors = Object.entries(body)
    .map(([key, value]): string => {
      if (Array.isArray(value)) return `${key}: ${value.join(", ")}`;
      if (typeof value === "string") return `${key}: ${value}`;
      if (value && typeof value === "object") return `${key}: ${paymobErrorMessage(value)}`;
      return "";
    })
    .filter(Boolean);
  return errors.join(" | ") || "Paymob رفض طلب الدفع";
}

function paymobField(obj: Record<string, unknown>, path: string) {
  if (path === "order.id" && obj.order && typeof obj.order !== "object") return obj.order;
  return path.split(".").reduce<unknown>((current, key) => (current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined), obj);
}

export function paymobHmacMatches(obj: Record<string, unknown>, hmacSecret: string, receivedHmac: string) {
  if (!hmacSecret) return !ENV.isProduction;
  if (!receivedHmac) return false;
  const fields = [
    "amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction",
    "id", "integration_id", "is_3d_secure", "is_auth", "is_capture", "is_refunded",
    "is_standalone_payment", "is_voided", "order.id", "owner", "pending",
    "source_data.pan", "source_data.sub_type", "source_data.type", "success",
  ];
  const message = fields.map((field) => String(paymobField(obj, field) ?? "")).join("");
  const expected = crypto.createHmac("sha512", hmacSecret).update(message).digest("hex");
  const received = receivedHmac.toLowerCase();
  return expected.length === received.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export function parsePaymentReference(reference: string) {
  if (!reference.startsWith("easy_cash_payment:")) return null;
  const id = Number.parseInt(reference.split(":")[1] || "", 10);
  return Number.isFinite(id) ? id : null;
}

export function paymobTransactionState(obj: Record<string, unknown>) {
  return {
    success: obj.success === true || obj.success === "true",
    pending: obj.pending === true || obj.pending === "true",
    transactionId: String(obj.id || obj.transaction_id || ""),
  };
}

export function splitName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "Customer", lastName: parts.slice(1).join(" ") || "Guest" };
}

export function absoluteUrl(req: Request, path: string) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const forwardedHost = req.headers["x-forwarded-host"];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const hostHeader = forwardedHost ?? req.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const base = process.env.APP_URL || `${proto || "https"}://${host || "cash.easytecheg.net"}`;
  return `${base.replace(/\/$/, "")}${path}`;
}

export function amountToCents(amount: string | number) {
  return Math.round(Number(amount) * 100);
}
