/** Western (English) digits + readable thousand separators for the whole ERP UI */

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** Convert Arabic/Persian digits → 0-9 */
export function toWesternDigits(input: string): string {
  return String(input ?? "").replace(/[٠-٩۰-۹]/g, (ch) => {
    const a = ARABIC_DIGITS.indexOf(ch);
    if (a >= 0) return String(a);
    const p = PERSIAN_DIGITS.indexOf(ch);
    return p >= 0 ? String(p) : ch;
  });
}

/**
 * Parse user input that may contain Arabic digits, Arabic decimal (٫),
 * Arabic thousands (٬ or ،), or Western separators.
 */
export function parseNumber(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : NaN;
  if (raw == null) return NaN;
  let s = toWesternDigits(String(raw)).trim();
  if (!s) return NaN;
  // Arabic decimal / thousands separators → Western
  s = s.replace(/٫/g, ".").replace(/[٬،\s]/g, "");
  // keep only one decimal point
  s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Normalize a typed numeric string to Western digits (keeps . and -) */
export function normalizeNumericInput(raw: string): string {
  let s = toWesternDigits(raw);
  s = s.replace(/٫/g, ".").replace(/[٬،]/g, ",");
  // allow digits, one dot, optional leading minus, and temporary commas while typing
  return s.replace(/[^\d.,\-]/g, "");
}

type FormatOpts = {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  /** If true, always show fraction digits (default for money) */
  money?: boolean;
};

/**
 * Format numbers for display: English digits + comma thousands.
 * Example: 10000 → "10,000" / 10000.5 → "10,000.50" (money)
 */
export function formatNumber(
  value: number | string | null | undefined,
  opts: FormatOpts = {},
): string {
  const n = typeof value === "number" ? value : parseNumber(value);
  if (!Number.isFinite(n)) return opts.money ? "0.00" : "0";

  const money = opts.money === true;
  const min = opts.minimumFractionDigits ?? (money ? 2 : 0);
  const max = opts.maximumFractionDigits ?? (money ? 2 : Math.max(min, 4));

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
    useGrouping: true,
  }).format(n);
}

/** Alias for money amounts — always 2 decimals, English grouping */
export function formatMoney(value: number | string | null | undefined): string {
  return formatNumber(value, { money: true });
}
