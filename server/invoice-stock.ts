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

/**
 * كمية أثر المخزن لسطر الفاتورة — مطابقة نوع الاستلام في ميجا:
 * - استلام كلي → كامل quantity
 * - استلام جزئي → deliveredQuantity (إلزامي، 0 < d ≤ quantity)
 */
export function resolveInvoiceStockQuantity(opts: {
  deliveryOrReceiptType: "full" | "partial" | string | null | undefined;
  quantity: string | number;
  deliveredQuantity?: string | number | null;
  itemLabel?: string;
}): number {
  const qty = Number(opts.quantity) || 0;
  const type = String(opts.deliveryOrReceiptType || "full");
  if (type !== "partial") return qty;
  if (opts.deliveredQuantity == null || opts.deliveredQuantity === "") {
    throw new Error(
      opts.itemLabel
        ? `يجب تحديد الكمية المسلَّمة للصنف «${opts.itemLabel}» عند الاستلام الجزئي`
        : "يجب تحديد الكمية المسلَّمة عند الاستلام الجزئي",
    );
  }
  const delivered = Number(opts.deliveredQuantity) || 0;
  if (delivered <= 0) {
    throw new Error(
      opts.itemLabel
        ? `الكمية المسلَّمة للصنف «${opts.itemLabel}» يجب أن تكون أكبر من صفر`
        : "الكمية المسلَّمة يجب أن تكون أكبر من صفر",
    );
  }
  if (delivered > qty + 1e-9) {
    throw new Error(
      opts.itemLabel
        ? `الكمية المسلَّمة للصنف «${opts.itemLabel}» أكبر من كمية الفاتورة`
        : "الكمية المسلَّمة أكبر من كمية الفاتورة",
    );
  }
  return delivered;
}

/** حالة التسليم من أسطر الفاتورة بعد تحديد الكميات المسلَّمة */
export function computeDeliveryStatus(
  lines: Array<{ quantity: string | number; deliveredQuantity?: string | number | null }>,
  deliveryOrReceiptType: "full" | "partial" | string | null | undefined,
): "undelivered" | "partial" | "delivered" {
  if (!lines.length) return "undelivered";
  if (String(deliveryOrReceiptType || "full") !== "partial") return "delivered";
  let anyDelivered = false;
  let allFull = true;
  for (const line of lines) {
    const qty = Number(line.quantity) || 0;
    const d = line.deliveredQuantity == null || line.deliveredQuantity === ""
      ? 0
      : Number(line.deliveredQuantity) || 0;
    if (d > 0) anyDelivered = true;
    if (d + 1e-9 < qty) allFull = false;
  }
  if (!anyDelivered) return "undelivered";
  if (allFull) return "delivered";
  return "partial";
}

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
