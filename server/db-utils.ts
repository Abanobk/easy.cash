/** يحذف المفاتيح الفارغة/غير المعرفة حتى لا تُرسل للـ DB قيم "" تكسر insert */
export function compactRow<T extends Record<string, unknown>>(row: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) continue;
      out[key] = trimmed;
      continue;
    }
    if (typeof value === "number" && Number.isNaN(value)) continue;
    out[key] = value;
  }
  return out as Partial<T>;
}

/** رسالة خطأ مفهومة من فشل استعلام Drizzle/MySQL */
export function dbErrorMessage(error: unknown, fallback = "فشل حفظ البيانات"): string {
  const err = error as { message?: string; cause?: { message?: string; code?: string } };
  const raw = `${err?.cause?.message || ""} ${err?.message || ""}`.trim();
  if (/Duplicate|ER_DUP_ENTRY/i.test(raw)) return "الكود أو البيان مستخدم مسبقاً";
  if (/Unknown column/i.test(raw)) return "قاعدة البيانات تحتاج تحديث. أعد نشر النظام أو تواصل مع الدعم.";
  if (/Incorrect decimal|Incorrect integer|Data truncated/i.test(raw)) {
    return "قيمة غير صحيحة في أحد الحقول الرقمية";
  }
  if (/cannot be null|doesn't have a default/i.test(raw)) return "حقل إلزامي ناقص";
  if (raw && !/^Failed query:/i.test(raw) && raw.length < 180) return raw;
  const causeOnly = err?.cause?.message;
  if (causeOnly && causeOnly.length < 180) return causeOnly;
  return fallback;
}
