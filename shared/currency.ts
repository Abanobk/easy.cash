export function normalizeRate(rate: unknown) {
  const n = Number(rate);
  return n > 0 ? n : 1;
}

export function isForeignCurrency(code: string | undefined | null) {
  return (code || "EGP").toUpperCase() !== "EGP";
}

export function toBaseAmount(amount: number, currencyCode: string, exchangeRate: unknown) {
  if (!isForeignCurrency(currencyCode)) return amount;
  return amount * normalizeRate(exchangeRate);
}

function fmtAmount(n: unknown) {
  return Number(n || 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** عرض مبلغ فاتورة في القوائم (عملة أجنبية + ما يعادلها بالجنيه) */
export function formatInvoiceListTotal(row: {
  total: unknown;
  foreignTotal?: unknown | null;
  currencyCode?: string | null;
}) {
  const code = (row.currencyCode || "EGP").toUpperCase();
  if (!isForeignCurrency(code)) {
    return `${fmtAmount(row.total)} ج.م`;
  }
  const foreign = row.foreignTotal != null ? Number(row.foreignTotal) : Number(row.total);
  return `${fmtAmount(foreign)} ${code} (≈ ${fmtAmount(row.total)} ج.م)`;
}

/** رمز العملة للطباعة والتقارير */
export function currencyLabel(code: string | undefined | null) {
  const c = (code || "EGP").toUpperCase();
  return c === "EGP" ? "ج.م" : c;
}
