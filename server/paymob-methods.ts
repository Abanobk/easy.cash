import { eq } from "drizzle-orm";
import { paymobPaymentMethods } from "../drizzle/schema";
import { getDb } from "./db";

export type PaymobMethodType = "card" | "wallet";

export type PaymobPaymentMethodRow = {
  id: number;
  methodType: PaymobMethodType;
  integrationId: number;
  isEnabled: boolean;
  labelAr: string;
};

export const PAYMOB_METHOD_LABELS: Record<PaymobMethodType, string> = {
  card: "بطاقة ائتمان",
  wallet: "محفظة إلكترونية",
};

const DEFAULT_METHODS: PaymobMethodType[] = ["card", "wallet"];

function rowToDto(row: {
  id: number;
  methodType: PaymobMethodType;
  integrationId: number;
  isEnabled: boolean;
}): PaymobPaymentMethodRow {
  return {
    id: row.id,
    methodType: row.methodType,
    integrationId: Number(row.integrationId) || 0,
    isEnabled: Boolean(row.isEnabled),
    labelAr: PAYMOB_METHOD_LABELS[row.methodType],
  };
}

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function ensurePaymobPaymentMethods(
  db: Db,
  publicConfig?: Record<string, unknown>,
) {
  const existing = await db.select().from(paymobPaymentMethods);
  if (existing.length > 0) {
    return existing.map((r) => rowToDto(r as { id: number; methodType: PaymobMethodType; integrationId: number; isEnabled: boolean }));
  }

  const cardId = Number(publicConfig?.cardIntegrationId ?? 0);
  const walletId = Number(publicConfig?.walletIntegrationId ?? 0);
  const legacyAuto = publicConfig?.paymentMethodMode === "auto_card";

  for (const methodType of DEFAULT_METHODS) {
    const integrationId = methodType === "card" ? cardId : walletId;
    const isEnabled = methodType === "card"
      ? (legacyAuto ? false : integrationId > 0)
      : integrationId > 0;
    await db.insert(paymobPaymentMethods).values({
      methodType,
      integrationId: integrationId > 0 ? integrationId : 0,
      isEnabled,
    });
  }

  const rows = await db.select().from(paymobPaymentMethods);
  return rows.map((r) => rowToDto(r as { id: number; methodType: PaymobMethodType; integrationId: number; isEnabled: boolean }));
}

export async function listPaymobPaymentMethods(
  db: Db,
  publicConfig?: Record<string, unknown>,
) {
  return ensurePaymobPaymentMethods(db, publicConfig);
}

export const LIVE_UNIFIED_CARD_INTEGRATION_ID = 5084536;

/** Legacy Accept API integration IDs — invalid for Intention / Unified Checkout. */
export const LEGACY_PAYMOB_CARD_INTEGRATION_IDS = [4310645, 5126391] as const;

export function isLegacyPaymobCardIntegrationId(id: number): boolean {
  return (LEGACY_PAYMOB_CARD_INTEGRATION_IDS as readonly number[]).includes(id);
}

export function validatePaymobPaymentMethodsForIntention(
  methods: PaymobPaymentMethodRow[],
  mode: "test" | "live",
): { ok: true } | { ok: false; message: string } {
  const card = methods.find((m) => m.methodType === "card" && m.isEnabled);
  if (!card?.integrationId || card.integrationId <= 0) {
    return {
      ok: false,
      message: `فعّل صف بطاقة ائتمان وأدخل رقم التكامل ${LIVE_UNIFIED_CARD_INTEGRATION_ID} (MIGS-online).`,
    };
  }
  if (mode === "live" && isLegacyPaymobCardIntegrationId(card.integrationId)) {
    return {
      ok: false,
      message: `رقم البطاقة ${card.integrationId} قديم ولا يعمل مع Unified Checkout. غيّره إلى ${LIVE_UNIFIED_CARD_INTEGRATION_ID} في جدول طرق الدفع ثم احفظ.`,
    };
  }
  return { ok: true };
}

export function enabledPaymobIntegrationIds(methods: PaymobPaymentMethodRow[]) {
  return methods
    .filter((m) => m.isEnabled && m.integrationId > 0)
    .map((m) => m.integrationId);
}

/** Intention API: card integration ID + wallet ID or "wallet" alias. */
export function buildPaymobIntentionPaymentMethods(methods: PaymobPaymentMethodRow[]): Array<number | string> {
  const result: Array<number | string> = [];
  const card = methods.find((m) => m.methodType === "card" && m.isEnabled && m.integrationId > 0);
  const wallet = methods.find((m) => m.methodType === "wallet" && m.isEnabled);

  if (card) result.push(card.integrationId);
  else result.push("card");

  if (wallet) {
    if (wallet.integrationId > 0) result.push(wallet.integrationId);
    else result.push("wallet");
  }

  return result;
}

export function buildPaymobIntentionFallbacks(methods: PaymobPaymentMethodRow[]): Array<Array<number | string>> {
  const card = methods.find((m) => m.methodType === "card" && m.isEnabled && m.integrationId > 0);
  const wallet = methods.find((m) => m.methodType === "wallet" && m.isEnabled);
  const fallbacks: Array<Array<number | string>> = [];

  if (card && wallet) {
    if (wallet.integrationId > 0) {
      fallbacks.push([card.integrationId, wallet.integrationId]);
      fallbacks.push([card.integrationId, "wallet"]);
    } else {
      fallbacks.push([card.integrationId, "wallet"]);
    }
    fallbacks.push([card.integrationId]);
  } else if (card) {
    fallbacks.push([card.integrationId]);
    fallbacks.push(["card"]);
  }

  const primary = buildPaymobIntentionPaymentMethods(methods);
  const all = [primary, ...fallbacks];
  const seen = new Set<string>();
  return all.filter((entry) => {
    const key = JSON.stringify(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function walletEnabled(methods: PaymobPaymentMethodRow[]) {
  return methods.some((m) => m.methodType === "wallet" && m.isEnabled);
}

export function intentionIncludesWallet(intentionPayload: unknown): boolean {
  const body = intentionPayload as {
    payment_methods?: Array<{ integration_id?: number; name?: string; method_type?: string; type?: string }>;
    payment_keys?: Array<{ integration?: number; gateway_type?: string; name?: string }>;
    available_payment_methods?: unknown[];
  };
  const methods = body.payment_methods || [];
  if (methods.some((m) => /wallet|mobile|vodafone|orange|cash|uig/i.test(String(m.name || m.method_type || m.type || "")))) {
    return true;
  }
  const keys = body.payment_keys || [];
  if (keys.some((k) => /wallet|mobile|vodafone|orange|cash|uig/i.test(String(k.gateway_type || k.name || "")))) {
    return true;
  }
  if (Array.isArray(body.available_payment_methods) && body.available_payment_methods.length > 1) {
    return true;
  }
  const raw = JSON.stringify(body).toLowerCase();
  return /"wallet"|vodafone|orange cash|mobile wallet|uig-online/.test(raw);
}

export function hasEnabledCardMethod(methods: PaymobPaymentMethodRow[]) {
  return methods.some((m) => m.methodType === "card" && m.isEnabled && m.integrationId > 0);
}

export async function savePaymobPaymentMethods(
  db: Db,
  input: Array<{ methodType: PaymobMethodType; integrationId: number; isEnabled: boolean }>,
) {
  for (const item of input) {
    const integrationId = Math.max(0, Number(item.integrationId) || 0);
    const isEnabled = item.methodType === "wallet"
      ? Boolean(item.isEnabled)
      : Boolean(item.isEnabled) && integrationId > 0;
    await db
      .insert(paymobPaymentMethods)
      .values({
        methodType: item.methodType,
        integrationId,
        isEnabled,
      })
      .onDuplicateKeyUpdate({
        set: {
          integrationId,
          isEnabled,
        },
      });
  }
  return listPaymobPaymentMethods(db);
}

export async function getPaymobPaymentMethodByType(
  db: Db,
  methodType: PaymobMethodType,
) {
  const [row] = await db
    .select()
    .from(paymobPaymentMethods)
    .where(eq(paymobPaymentMethods.methodType, methodType))
    .limit(1);
  return row ? rowToDto(row as { id: number; methodType: PaymobMethodType; integrationId: number; isEnabled: boolean }) : null;
}
