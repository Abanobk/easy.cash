import crypto from "crypto";
import type { Request } from "express";
import { resolveEncryptionKey } from "./security-secrets";
import { intentionIncludesWallet, LIVE_UNIFIED_CARD_INTEGRATION_ID } from "./paymob-methods";

export type PaymobPublicConfig = {
  publicKey: string;
  publicKeyLast8?: string;
  currency: string;
};

export type PaymobSecretConfig = {
  secretKey: string;
  hmacSecret?: string;
};

function getEncryptionKey() {
  return crypto.createHash("sha256").update(resolveEncryptionKey()).digest();
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

export function normalizePaymobSecretKey(secretKey: unknown): string {
  return String(secretKey || "").trim();
}

export function assertPaymobSecretKey(secretKey: unknown) {
  const key = normalizePaymobSecretKey(secretKey);
  if (!key) {
    throw new Error(
      "Secret Key غير محفوظ. من السوبر أدمن → Paymob أعد إدخال Secret Key من Developers > API Keys (يبدأ بـ sk_)."
    );
  }
  if (isLikelyPaymobPublicKey(key)) {
    throw new Error(
      "أدخلت Public Key مكان Secret Key. انسخ Secret Key (يبدأ بـ sk_) وليس Public Key ولا API Token القديم."
    );
  }
  if (!/(^sk_|^sak_|^egy_sk)/i.test(key) && key.length < 24) {
    throw new Error(
      "Secret Key غير صحيح. من Paymob > Developers > API Keys انسخ Secret Key (يبدأ بـ sk_test_ أو sk_live_)."
    );
  }
  return key;
}

export function loadPaymobSecrets(encryptedSecret: string): PaymobSecretConfig {
  try {
    const decoded = decodeSecret<PaymobSecretConfig>(encryptedSecret);
    return {
      secretKey: normalizePaymobSecretKey(decoded.secretKey),
      hmacSecret: String(decoded.hmacSecret || "").trim(),
    };
  } catch {
    throw new Error(
      "تعذر قراءة مفاتيح Paymob المحفوظة. أعد إدخال Secret Key من السوبر أدمن (قد يكون JWT_SECRET أو ENCRYPTION_KEY تغيّر على السيرفر)."
    );
  }
}

export function paymobPaymentMethods(ids: Array<number | string>): Array<number | string> {
  return ids.filter((id) => {
    if (typeof id === "string") return id.trim().length > 0;
    return Number.isFinite(id) && id > 0;
  });
}

export function paymobPaymentMethodLabel(ids: Array<number | string>) {
  const methods = paymobPaymentMethods(ids);
  return methods.length > 0 ? methods.join(" + ") : "—";
}

export function normalizeEgyptPhone(phone: string | null | undefined): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("20") && digits.length >= 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length >= 11) return `+2${digits}`;
  if (digits.length >= 10) return `+20${digits.replace(/^0+/, "")}`;
  return "+201000000000";
}

async function postPaymobIntentionWithFallbacks(
  secretKey: string,
  primaryInputs: Array<number | string>,
  fallbackInputs: Array<Array<number | string>> | undefined,
  bodyWithoutMethods: Record<string, unknown>,
  mode?: "test" | "live",
  preferWallet?: boolean,
) {
  const key = assertPaymobSecretKey(secretKey);
  const attempts = [
    paymobPaymentMethods(primaryInputs),
    ...(fallbackInputs || []).map((entry) => paymobPaymentMethods(entry)),
  ].filter((entry) => entry.length > 0);

  const uniqueAttempts: Array<Array<number | string>> = [];
  const seen = new Set<string>();
  for (const entry of attempts) {
    const token = JSON.stringify(entry);
    if (seen.has(token)) continue;
    seen.add(token);
    uniqueAttempts.push(entry);
  }

  if (uniqueAttempts.length === 0) {
    throw new Error("لا توجد طرق دفع مفعّلة. أدخل رقم تكامل البطاقة (5084536) وفعّل الصف.");
  }

  let lastError: Error | null = null;
  let lastPayload: unknown;
  let lastMethods: Array<number | string> = [];
  const successes: Array<{
    data: { id?: string; client_secret: string; intention_order_id?: string };
    paymentMethods: Array<number | string>;
  }> = [];

  for (const paymentMethods of uniqueAttempts) {
    const response = await fetch("https://accept.paymob.com/v1/intention/", {
      method: "POST",
      headers: paymobAuthHeaders(key),
      body: JSON.stringify({ ...bodyWithoutMethods, payment_methods: paymentMethods }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && (data as { client_secret?: string }).client_secret) {
      successes.push({
        data: data as { id?: string; client_secret: string; intention_order_id?: string },
        paymentMethods,
      });
      continue;
    }
    lastPayload = data;
    lastMethods = paymentMethods;
    lastError = new Error(paymobErrorMessage(data, { mode, integrationIds: paymentMethods }));
  }

  if (successes.length === 0) {
    throw lastError ?? new Error(paymobErrorMessage(lastPayload, { mode, integrationIds: lastMethods }));
  }

  const pick = preferWallet
    ? successes.find((entry) => intentionIncludesWallet(entry.data)) ?? successes[0]
    : successes[0];

  return {
    ...pick.data,
    _paymentMethodsUsed: pick.paymentMethods,
  };
}

export async function testPaymobIntention(
  secretKey: string,
  paymentMethodInputs: Array<number | string>,
  currency: string,
  mode?: "test" | "live",
  fallbackInputs?: Array<Array<number | string>>,
  preferWallet?: boolean,
) {
  return postPaymobIntentionWithFallbacks(
    secretKey,
    paymentMethodInputs,
    fallbackInputs,
    {
      amount: 100,
      currency: currency || "EGP",
      items: [{ name: "Easy Cash test", amount: 100, description: "Connection test", quantity: 1 }],
      billing_data: {
        first_name: "Easy", last_name: "Cash", phone_number: "+201000000000",
        email: "test@easycash.app", country: "EG", city: "Cairo",
        street: "NA", building: "NA", apartment: "NA", floor: "NA",
      },
      special_reference: `easy-cash-test-${Date.now()}`,
      expiration: 600,
    },
    mode,
    preferWallet,
  );
}

export async function createPaymobIntention(
  secretKey: string,
  paymentMethodInputs: Array<number | string>,
  bodyWithoutMethods: Record<string, unknown>,
  mode?: "test" | "live",
  fallbackInputs?: Array<Array<number | string>>,
  preferWallet?: boolean,
) {
  return postPaymobIntentionWithFallbacks(
    secretKey,
    paymentMethodInputs,
    fallbackInputs,
    bodyWithoutMethods,
    mode,
    preferWallet,
  );
}

export function paymobAuthHeaders(secretKey: string) {
  return {
    Authorization: `Token ${normalizePaymobSecretKey(secretKey)}`,
    "Content-Type": "application/json",
  };
}

export function paymobErrorMessage(
  payload: unknown,
  hint?: { mode?: string; integrationIds?: Array<number | string> },
): string {
  if (!payload || typeof payload !== "object") return "Paymob رفض طلب الدفع";
  const body = payload as Record<string, unknown>;
  const direct = String(body.message || body.detail || body.error || "");
  const allText = JSON.stringify(body);

  if (/authentication credentials were not provided/i.test(direct)) {
    return "مفتاح Paymob السري غير صحيح أو غير محفوظ. أعد إدخال Secret Key من Developers → API Keys.";
  }
  if (/integration id/i.test(direct) || /integration id/i.test(allText)) {
    const modeLabel = hint?.mode === "live" ? "Live (مباشر)" : "Test (تجريبي)";
    const ids = hint?.integrationIds?.length ? ` (${hint.integrationIds.join(", ")})` : "";
    const hasLegacyIds = hint?.integrationIds?.some((id) => typeof id === "number" && [4310645, 4310646, 5126391].includes(id));
    const onlyStringAliases = hint?.integrationIds?.every((id) => typeof id === "string");
    if (onlyStringAliases && hint?.integrationIds?.includes("card")) {
      return `رقم بطاقة ائتمان غير صحيح في الإعدادات (مثل 4310645). غيّره إلى ${LIVE_UNIFIED_CARD_INTEGRATION_ID} في جدول طرق الدفع ثم احفظ.`;
    }
    if (hasLegacyIds) {
      return `أرقام${ids} من طرق الدفع القديمة في Paymob — لا تعمل مع Unified Checkout / Intention API. للبطاقة استخدم 5084536 (MIGS-online). للمحفظة فعّل الصف وسيُرسل "wallet" تلقائياً (رقم 4310646 للمرجع فقط).`;
    }
    return `رقم التكامل${ids} غير مدعوم لـ Unified Checkout في وضع ${modeLabel}. للبطاقة: 5084536. للمحفظة: فعّل الصف بدون تغيير الرقم — يُستخدم alias "wallet".`;
  }
  if (direct) return direct;

  const errors = Object.entries(body)
    .map(([key, value]): string => {
      if (Array.isArray(value)) return `${key}: ${value.join(", ")}`;
      if (typeof value === "string") return `${key}: ${value}`;
      if (value && typeof value === "object") return `${key}: ${paymobErrorMessage(value, hint)}`;
      return "";
    })
    .filter(Boolean);
  return errors.join(" | ") || "Paymob رفض طلب الدفع";
}

export function assertPaymobKeysMatchMode(
  mode: "test" | "live",
  publicKey: string,
  secretKey?: string,
) {
  const blob = `${publicKey} ${secretKey || ""}`;
  const looksLive = /_live_|egy_pk_live|sk_live|egy_sk_live/i.test(blob);
  const looksTest = /_test_|egy_pk_test|sk_test|egy_sk_test/i.test(blob);
  if (mode === "live" && looksTest && !looksLive) {
    throw new Error("الوضع Live لكن المفاتيح تبدو Test. استخدم مفاتيح Live من Paymob أو غيّر الوضع إلى Test.");
  }
  if (mode === "test" && looksLive && !looksTest) {
    throw new Error("الوضع Test لكن المفاتيح Live. طابق الوضع مع نوع المفاتيح من Paymob.");
  }
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
    amountCents: extractPaymobPaidAmountCents(obj),
  };
}

export function extractPaymobPaidAmountCents(obj: Record<string, unknown>): number | null {
  const raw = obj.amount_cents ?? paymobField(obj, "order.amount_cents");
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
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
