import { inArray } from "drizzle-orm";
import type { Db } from "./db";
import { items } from "../drizzle/schema";
import { tenantWhere } from "./tenant-scope";

/**
 * مطابقة ميجا كاش: الأصناف من نوع «وحدة خدمية» لا تؤثر على المخازن
 * (فواتير البيع/الشراء — الموقع التسويقي + شاشة الصنف).
 */
export function itemAffectsWarehouseStock(itemType: string | null | undefined): boolean {
  const t = String(itemType ?? "").trim();
  if (!t) return true;
  if (t === "وحدة خدمية") return false;
  if (t.includes("خدم")) return false;
  return true;
}

/** مخزن السطر أو رأس الفاتورة — بدون سقوط صامت لأول مخزن (سلوك ميجا). */
export function requireInvoiceLineWarehouse(
  lineWarehouseId: number | null | undefined,
  headerWarehouseId: number | null | undefined,
  itemLabel?: string,
): number {
  const id = lineWarehouseId ?? headerWarehouseId ?? null;
  if (id == null || !Number.isFinite(Number(id)) || Number(id) <= 0) {
    throw new Error(
      itemLabel
        ? `يجب تحديد المخزن للصنف «${itemLabel}» قبل الاعتماد`
        : "يجب تحديد المخزن للأصناف المخزنية قبل الاعتماد",
    );
  }
  return Number(id);
}

export type InvoiceItemStockMeta = {
  id: number;
  name: string;
  itemType: string | null;
  affectsStock: boolean;
};

export async function loadInvoiceItemStockMeta(
  db: Db,
  tenantId: number,
  itemIds: number[],
): Promise<Map<number, InvoiceItemStockMeta>> {
  const uniq = [...new Set(itemIds.filter((id) => Number.isFinite(id) && id > 0))];
  const map = new Map<number, InvoiceItemStockMeta>();
  if (!uniq.length) return map;
  const rows = await db
    .select({ id: items.id, name: items.name, itemType: items.itemType })
    .from(items)
    .where(tenantWhere(items, tenantId, inArray(items.id, uniq)));
  for (const row of rows) {
    map.set(row.id, {
      id: row.id,
      name: row.name,
      itemType: row.itemType ?? null,
      affectsStock: itemAffectsWarehouseStock(row.itemType),
    });
  }
  return map;
}
