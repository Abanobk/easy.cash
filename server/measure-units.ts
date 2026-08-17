import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "./db";
import { TRPCError } from "@trpc/server";
import { items, measureUnits } from "../drizzle/schema";
import { tenantWhere, withTenantId } from "./tenant-scope";

/** وحدات افتراضية شائعة عند أول استخدام للمستأجر (مرجع الاستخدام اليومي / Mega) */
export const DEFAULT_MEASURE_UNITS = [
  "قطعة",
  "كيلو",
  "جرام",
  "طن",
  "لتر",
  "مللي",
  "متر",
  "متر مربع",
  "علبة",
  "كرتونة",
  "جالون",
  "رول",
  "شيكارة",
  "عبوة",
  "دستة",
  "زوج",
] as const;

export function normalizeMeasureUnitName(value: string): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

/** يزرع الوحدات الافتراضية + أي وحدات مستخدمة فعلاً في الأصناف */
export async function ensureMeasureUnits(
  db: Db,
  tenantId: number,
): Promise<void> {
  const [cnt] = await db
    .select({ n: sql<number>`count(*)` })
    .from(measureUnits)
    .where(tenantWhere(measureUnits, tenantId));
  const existingCount = Number(cnt?.n ?? 0);

  if (existingCount === 0) {
    let order = 0;
    for (const name of DEFAULT_MEASURE_UNITS) {
      await db.insert(measureUnits).values(withTenantId(tenantId, {
        name,
        sortOrder: order++,
        isActive: true,
      }) as any).catch(() => undefined);
    }
  }

  const used = await db
    .selectDistinct({ unit: items.unit })
    .from(items)
    .where(tenantWhere(items, tenantId));

  for (const row of used) {
    const name = normalizeMeasureUnitName(row.unit || "");
    if (!name) continue;
    await db.insert(measureUnits).values(withTenantId(tenantId, {
      name,
      sortOrder: 999,
      isActive: true,
    }) as any).catch(() => undefined);
  }
}

export async function listMeasureUnits(
  db: Db,
  tenantId: number,
  opts?: { activeOnly?: boolean },
) {
  await ensureMeasureUnits(db, tenantId);
  const where = opts?.activeOnly
    ? tenantWhere(measureUnits, tenantId, eq(measureUnits.isActive, true))
    : tenantWhere(measureUnits, tenantId);
  return db
    .select()
    .from(measureUnits)
    .where(where)
    .orderBy(asc(measureUnits.sortOrder), asc(measureUnits.name), asc(measureUnits.id));
}

/** يتحقق أن الوحدة مسجّلة ونشطة — لمنع إدخال وحدة غير معتمدة في الشركة */
export async function assertActiveMeasureUnit(
  db: Db,
  tenantId: number,
  unitRaw: string | undefined | null,
): Promise<string> {
  await ensureMeasureUnits(db, tenantId);
  const name = normalizeMeasureUnitName(unitRaw || "") || "قطعة";
  const [row] = await db
    .select({ id: measureUnits.id, name: measureUnits.name })
    .from(measureUnits)
    .where(tenantWhere(
      measureUnits,
      tenantId,
      and(eq(measureUnits.name, name), eq(measureUnits.isActive, true)),
    ))
    .limit(1);
  if (!row) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `وحدة القياس «${name}» غير مسجّلة في خصائص الشركة. سجّلها من: إعدادات عامة → خصائص عامة → وحدات القياس`,
    });
  }
  return row.name;
}

/** للاستيراد: يضمن وجود الوحدة (يُنشئها إن لزم) ثم يعيد الاسم المعتمد */
export async function ensureMeasureUnitExists(
  db: Db,
  tenantId: number,
  unitRaw: string | undefined | null,
): Promise<string> {
  await ensureMeasureUnits(db, tenantId);
  const name = normalizeMeasureUnitName(unitRaw || "") || "قطعة";
  const [row] = await db
    .select({ name: measureUnits.name })
    .from(measureUnits)
    .where(tenantWhere(measureUnits, tenantId, eq(measureUnits.name, name)))
    .limit(1);
  if (row) {
    await db
      .update(measureUnits)
      .set({ isActive: true })
      .where(tenantWhere(measureUnits, tenantId, eq(measureUnits.name, name)));
    return row.name;
  }
  await db.insert(measureUnits).values(withTenantId(tenantId, {
    name,
    sortOrder: 999,
    isActive: true,
  }) as any);
  return name;
}
