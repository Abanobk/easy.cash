import { getTenantSlugFromPath } from "@/lib/tenant";

export type CashTxType = "receive" | "pay" | "receive_customer" | "pay_supplier" | "pay_customer";
export type BankTxType = "deposit" | "withdraw" | "deposit_customer" | "withdraw_supplier" | "withdraw_customer";
export type CheckTxType = "incoming" | "outgoing";

export function stripTenantPrefix(pathname: string) {
  const slug = getTenantSlugFromPath(pathname);
  const base = pathname.split("?")[0];
  if (!slug) return base;
  const prefix = `/${slug}`;
  if (base === prefix) return "/";
  if (base.startsWith(`${prefix}/`)) return base.slice(prefix.length);
  return base;
}

export const CASH_ROUTE_CONFIG: Record<
  string,
  { type: CashTxType; title: string; addLabel: string; formTitle: string }
> = {
  "/cash/receive": {
    type: "receive",
    title: "استلام نقدية",
    addLabel: "سند قبض جديد",
    formTitle: "سند قبض نقدي",
  },
  "/cash/pay": {
    type: "pay",
    title: "صرف نقدية",
    addLabel: "سند صرف جديد",
    formTitle: "سند صرف نقدي",
  },
  "/cash/receive-customer": {
    type: "receive_customer",
    title: "استلام نقدية من عميل",
    addLabel: "تحصيل من عميل",
    formTitle: "تحصيل نقدي من عميل",
  },
  "/cash/pay-customer": {
    type: "pay_customer",
    title: "رد نقدية لعميل",
    addLabel: "رد فلوس لعميل",
    formTitle: "رد نقدي للعميل",
  },
  "/cash/pay-supplier": {
    type: "pay_supplier",
    title: "صرف نقدية لمورد",
    addLabel: "صرف لمورد",
    formTitle: "صرف نقدي لمورد",
  },
};

export function getCashRouteConfig(pathname: string) {
  return CASH_ROUTE_CONFIG[stripTenantPrefix(pathname)];
}

const BANK_TYPE_QUERY_MAP: Record<string, BankTxType> = {
  deposit: "deposit",
  withdraw: "withdraw",
  "deposit-customer": "deposit_customer",
  "withdraw-vendor": "withdraw_supplier",
  "withdraw-customer": "withdraw_customer",
};

export const BANK_TYPE_META: Record<BankTxType, { title: string; addLabel: string; formTitle: string }> = {
  deposit: { title: "إيداع بنكي", addLabel: "إيداع جديد", formTitle: "إيداع بنكي" },
  withdraw: { title: "سحب بنكي", addLabel: "سحب جديد", formTitle: "سحب بنكي" },
  deposit_customer: {
    title: "إيداع بنكي من عميل",
    addLabel: "تحصيل بنكي من عميل",
    formTitle: "إيداع بنكي من عميل",
  },
  withdraw_supplier: {
    title: "سحب بنكي لمورد",
    addLabel: "سداد بنكي لمورد",
    formTitle: "سحب بنكي لمورد",
  },
  withdraw_customer: {
    title: "رد بنكي لعميل",
    addLabel: "رد فلوس بنكي لعميل",
    formTitle: "سحب بنكي لرد عميل",
  },
};

export function getBankTypeFromSearch(search: string): BankTxType | undefined {
  const key = new URLSearchParams(search).get("type");
  return key ? BANK_TYPE_QUERY_MAP[key] : undefined;
}

const CHECK_TYPE_QUERY_MAP: Record<string, CheckTxType> = {
  in: "incoming",
  out: "outgoing",
};

export const CHECK_TYPE_META: Record<CheckTxType, { title: string; addLabel: string; formTitle: string }> = {
  incoming: { title: "الشيكات الواردة", addLabel: "شيك وارد جديد", formTitle: "شيك وارد" },
  outgoing: { title: "الشيكات الصادرة", addLabel: "شيك صادر جديد", formTitle: "شيك صادر" },
};

export function getCheckTypeFromSearch(search: string): CheckTxType | undefined {
  const key = new URLSearchParams(search).get("type");
  return key ? CHECK_TYPE_QUERY_MAP[key] : undefined;
}
