export function normalizeExchangeRate(rate: unknown) {
  const n = Number(rate);
  return n > 0 ? n : 1;
}

export function isForeignCurrency(code: string | undefined | null) {
  const c = (code || "EGP").toUpperCase();
  return c !== "EGP";
}

/** يحوّل مبلغاً بعملة الفاتورة إلى العملة الأساسية (جنيه) */
export function toBaseAmount(amount: unknown, currencyCode: string | undefined | null, exchangeRate: unknown) {
  const n = Number(amount) || 0;
  if (!isForeignCurrency(currencyCode)) return n;
  return n * normalizeExchangeRate(exchangeRate);
}

export function moneyBase(amount: unknown, currencyCode: string | undefined | null, exchangeRate: unknown) {
  return toBaseAmount(amount, currencyCode, exchangeRate).toFixed(2);
}
