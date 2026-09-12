/** حساب سطر فاتورة زي ميجا: إجمالي → خصم نسبة → خصم نقدي → ضرائب → صافي */
export function calcInvoiceLineNet(opts: {
  quantity: number;
  price: number;
  /** خصم نسبة % */
  discountPercent?: number;
  /** خصم نقدي (مبلغ) */
  discountAmount?: number;
  tax1?: number;
  tax2?: number;
  tax3?: number;
}): { afterDiscount: number; taxAmount: number; total: number } {
  const q = Number(opts.quantity) || 0;
  const p = Number(opts.price) || 0;
  const pct = Number(opts.discountPercent) || 0;
  const cash = Number(opts.discountAmount) || 0;
  const t = (Number(opts.tax1) || 0) + (Number(opts.tax2) || 0) + (Number(opts.tax3) || 0);
  const afterPct = q * p * (1 - pct / 100);
  const afterDiscount = Math.max(0, afterPct - cash);
  const total = afterDiscount * (1 + t / 100);
  return {
    afterDiscount,
    taxAmount: total - afterDiscount,
    total,
  };
}

/** تكلفة الوحدة بعد الخصومات (قبل الضريبة) — لتحديث متوسط التكلفة */
export function calcPurchaseUnitCostAfterDiscount(opts: {
  quantity: number;
  price: number;
  discountPercent?: number;
  discountAmount?: number;
}): number {
  const q = Number(opts.quantity) || 0;
  if (q <= 0) return Number(opts.price) || 0;
  const { afterDiscount } = calcInvoiceLineNet({
    quantity: q,
    price: Number(opts.price) || 0,
    discountPercent: opts.discountPercent,
    discountAmount: opts.discountAmount,
  });
  return afterDiscount / q;
}
