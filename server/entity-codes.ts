import { and, eq, like, ne, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "./db";

type CodeTable = {
  id: any;
  tenantId: any;
  code: any;
};

/**
 * بادئات التسلسل التلقائي — حرف مختلف لكل فئة:
 * عملاء C · موردون S · أصناف P
 * (الفواتير والمستندات لها بادئات منفصلة: SI / PI / SO / PO / CT …)
 */
export const ENTITY_CODE_PREFIX = {
  customer: "C",
  supplier: "S",
  item: "P",
} as const;

export type EntityCodeKind = keyof typeof ENTITY_CODE_PREFIX;

/**
 * بحث بالكود يتجاهل الحرف/البادئة.
 * مثال: "0005" أو "5" يجد C-0005 و S-0005 و SI-00005.
 */
export function codeSearchCondition(column: any, rawSearch: string): SQL | undefined {
  const q = String(rawSearch || "").trim();
  if (!q) return undefined;

  const parts: SQL[] = [like(column, `%${q}%`)];

  if (/^\d+$/.test(q)) {
    const stripped = q.replace(/^0+/, "") || "0";
    parts.push(like(column, `%-${q}`));
    parts.push(like(column, `${q}`));
    if (stripped !== q) {
      parts.push(like(column, `%-${stripped}`));
      for (const w of [4, 5]) {
        const padded = stripped.padStart(w, "0");
        if (padded !== q) {
          parts.push(like(column, `%-${padded}`));
          parts.push(like(column, `%${padded}%`));
        }
      }
    }
    // طابق الرقم في آخر الكود عدديًا (يتجاهل C- / SI- والأصفار الزائدة)
    parts.push(sql`CAST(NULLIF(REGEXP_SUBSTR(${column}, '[0-9]+$'), '') AS UNSIGNED) = ${Number(stripped)}`);
  } else {
    // لو كتب C0005 أو c-0005 بدون تنسيق موحّد
    const digitsOnly = q.replace(/[^0-9]/g, "");
    if (digitsOnly) {
      const stripped = digitsOnly.replace(/^0+/, "") || "0";
      parts.push(like(column, `%-${digitsOnly}`));
      parts.push(like(column, `%${digitsOnly}%`));
      parts.push(sql`CAST(NULLIF(REGEXP_SUBSTR(${column}, '[0-9]+$'), '') AS UNSIGNED) = ${Number(stripped)}`);
    }
  }

  return or(...parts);
}

/** بحث اسم/هاتف + كود (يتجاهل البادئة) */
export function partySearchCondition(
  cols: { name: any; phone?: any; code?: any; phone2?: any },
  rawSearch: string,
): SQL | undefined {
  const q = String(rawSearch || "").trim();
  if (!q) return undefined;
  const parts: SQL[] = [like(cols.name, `%${q}%`)];
  if (cols.phone) parts.push(like(cols.phone, `%${q}%`));
  if (cols.phone2) parts.push(like(cols.phone2, `%${q}%`));
  if (cols.code) {
    const codeCond = codeSearchCondition(cols.code, q);
    if (codeCond) parts.push(codeCond);
  }
  return or(...parts);
}

/**
 * يستخرج أكبر رقم سيريال من الأكواد الموجودة.
 * يحسب: أرقام فقط، أو بادئة النوع + أرقام (مثل C-00012 أو C00012).
 */
function maxSerialFromCodes(
  codes: Array<string | null | undefined>,
  prefix?: string,
): number {
  const p = (prefix || "").trim().toUpperCase();
  const prefRe = p
    ? new RegExp(`^${escapeRegExp(p)}[-_]?0*(\\d+)$`, "i")
    : null;
  let max = 0;
  for (const raw of codes) {
    const code = (raw || "").trim();
    if (!code) continue;

    if (prefRe) {
      const m = code.match(prefRe);
      if (m) {
        const n = Number(m[1]);
        if (!Number.isNaN(n) && n > max) max = n;
        continue;
      }
      // أكواد قديمة رقمية فقط لنفس الجدول — نكمّل التسلسل منها
      const pure = code.match(/^0*(\d+)$/);
      if (pure) {
        const n = Number(pure[1]);
        if (!Number.isNaN(n) && n > max) max = n;
      }
      continue;
    }

    const pure = code.match(/^0*(\d+)$/);
    const trailing = code.match(/(\d+)$/);
    const n = pure ? Number(pure[1]) : trailing ? Number(trailing[1]) : NaN;
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return max;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatSerial(prefix: string | undefined, n: number, width: number): string {
  const body = String(n).padStart(width, "0");
  const p = (prefix || "").trim().toUpperCase();
  return p ? `${p}-${body}` : body;
}

async function loadCodes(
  db: Db,
  table: CodeTable,
  tenantId: number,
): Promise<string[]> {
  const rows = await db
    .select({ code: table.code })
    .from(table as any)
    .where(eq(table.tenantId, tenantId));
  return rows.map((r) => (r.code as string | null) || "");
}

export async function assertUniqueEntityCode(
  db: Db,
  table: CodeTable,
  tenantId: number,
  code: string,
  excludeId?: number,
) {
  const trimmed = code.trim();
  if (!trimmed) return;
  const where = excludeId != null
    ? and(eq(table.tenantId, tenantId), eq(table.code, trimmed), ne(table.id, excludeId))
    : and(eq(table.tenantId, tenantId), eq(table.code, trimmed));
  const [existing] = await db
    .select({ id: table.id })
    .from(table as any)
    .where(where)
    .limit(1);
  if (existing) {
    throw new Error("كود موجود مسبقاً، اختر كوداً آخر");
  }
}

export type ResolveEntityCodeOptions = {
  /** بادئة التسلسل: C للعملاء، S للموردين، P للمنتجات */
  prefix?: string;
  excludeId?: number;
};

/**
 * إن وُجد كود يُستخدم كما هو، وإلا يُولَّد سيريال تلقائي منفصل لكل نوع:
 * عملاء C-0001، موردون S-0001، منتجات P-0001…
 */
export async function resolveEntityCode(
  db: Db,
  table: CodeTable,
  tenantId: number,
  inputCode?: string | null,
  options?: ResolveEntityCodeOptions | number,
): Promise<string> {
  // توافق مع الاستدعاء القديم: resolveEntityCode(..., excludeId)
  const opts: ResolveEntityCodeOptions =
    typeof options === "number" ? { excludeId: options } : (options || {});
  const prefix = (opts.prefix || "").trim().toUpperCase() || undefined;
  const excludeId = opts.excludeId;

  const trimmed = (inputCode || "").trim();
  if (trimmed) {
    await assertUniqueEntityCode(db, table, tenantId, trimmed, excludeId);
    return trimmed;
  }

  const existing = await loadCodes(db, table, tenantId);
  const max = maxSerialFromCodes(existing, prefix);
  const width = Math.max(4, String(max + 1).length);
  const used = new Set(existing.map((c) => c.trim()).filter(Boolean));

  for (let i = 1; i <= 1000; i++) {
    const candidate = formatSerial(prefix, max + i, width);
    if (!used.has(candidate)) return candidate;
  }

  const fallbackPrefix = prefix || "X";
  return `${fallbackPrefix}-${Date.now().toString().slice(-8)}`;
}

export type BarcodeTable = {
  id: any;
  tenantId: any;
  barcode: any;
};

/**
 * باركود رقمي تسلسلي يولّده النظام نفسه (مش مأخوذ من مصدر خارجي زي ميجا كاش) —
 * بيكمل من أكبر باركود رقمي بحت موجود عند نفس العميل. مفيد لما العميل يفضّل
 * يبدأ ترقيم باركود خاص بيه بدل ما يعتمد على أرقام مرجعية من نظام قديم.
 */
export async function resolveNextBarcode(
  db: Db,
  table: BarcodeTable,
  tenantId: number,
): Promise<string> {
  const [row] = await db
    .select({ max: sql<number | null>`MAX(CAST(${table.barcode} AS UNSIGNED))` })
    .from(table as any)
    .where(and(eq(table.tenantId, tenantId), sql`${table.barcode} REGEXP '^[0-9]+$'`));
  const max = Number(row?.max || 0);
  const width = Math.max(6, String(max + 1).length);
  return String(max + 1).padStart(width, "0");
}

/** اختصار: توليد كود حسب نوع الكيان */
export async function resolveTypedEntityCode(
  db: Db,
  table: CodeTable,
  tenantId: number,
  kind: EntityCodeKind,
  inputCode?: string | null,
  excludeId?: number,
): Promise<string> {
  return resolveEntityCode(db, table, tenantId, inputCode, {
    prefix: ENTITY_CODE_PREFIX[kind],
    excludeId,
  });
}
