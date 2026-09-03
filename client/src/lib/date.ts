/**
 * أعمدة date() بترجع من السيرفر كـ Date objects (superjson بيعيد بناءها على العميل)،
 * و`String(d).slice(0, 10)` عليها بيدي "Tue Sep 01" — السنة بتتقص وإعادة تحليلها بتدي سنة 2001.
 */
export function toDateStr(v: unknown, fallback = ""): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v ?? "").slice(0, 10);
  return s || fallback;
}
