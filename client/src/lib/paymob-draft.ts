const STORAGE_KEY = "easy-cash-paymob-draft";

export type PaymobDraftPaymentMethod = {
  methodType: "card" | "wallet";
  integrationId: string;
  isEnabled: boolean;
};

export type PaymobDraft = {
  mode: "test" | "live";
  publicKey: string;
  secretKey: string;
  hmacSecret: string;
  paymentMethods: PaymobDraftPaymentMethod[];
  currency: string;
  isEnabled: boolean;
  editMode: boolean;
  replacePublicKey: boolean;
  replaceSecret: boolean;
  replaceHmac: boolean;
  savedAt: number;
};

export function loadPaymobDraft(): PaymobDraft | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PaymobDraft;
    if (!parsed || typeof parsed !== "object") return null;
    if (Date.now() - (parsed.savedAt || 0) > 24 * 60 * 60 * 1000) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function savePaymobDraft(draft: Omit<PaymobDraft, "savedAt">) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    /* quota */
  }
}

export function clearPaymobDraft() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function paymobDraftHasContent(draft: PaymobDraft) {
  return Boolean(
    draft.publicKey.trim() ||
    draft.secretKey.trim() ||
    draft.hmacSecret.trim() ||
    draft.paymentMethods.some((m) => m.integrationId.trim()),
  );
}
