import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "./db";
import { itemBatches, items, itemWarehouseStock, warehouses } from "../drizzle/schema";
import { tenantWhere, withTenantId } from "./tenant-scope";

function num(v: unknown) {
  return Number(v ?? 0);
}

export async function getDefaultWarehouseId(db: Db, tenantId: number) {
  const [w] = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(tenantWhere(warehouses, tenantId, eq(warehouses.isActive, true)))
    .orderBy(warehouses.id)
    .limit(1);
  return w?.id ?? null;
}

export async function resolveWarehouseId(
  db: Db,
  tenantId: number,
  warehouseId?: number | null,
) {
  if (warehouseId) return warehouseId;
  const def = await getDefaultWarehouseId(db, tenantId);
  if (!def) throw new Error("لا يوجد مخزن — أضف مخزناً من إعدادات المخازن");
  return def;
}

export async function syncItemTotalStock(db: Db, tenantId: number, itemId: number) {
  const [sumRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${itemWarehouseStock.quantity}), 0)` })
    .from(itemWarehouseStock)
    .where(tenantWhere(itemWarehouseStock, tenantId, eq(itemWarehouseStock.itemId, itemId)));
  await db
    .update(items)
    .set({ currentStock: sumRow?.total ?? "0" })
    .where(tenantWhere(items, tenantId, eq(items.id, itemId)));
}

export async function adjustWarehouseStock(
  db: Db,
  tenantId: number,
  opts: {
    itemId: number;
    warehouseId: number;
    delta: number;
    allowNegative?: boolean;
  },
) {
  const { itemId, warehouseId, delta, allowNegative } = opts;
  if (Math.abs(delta) < 0.000001) return;

  const [row] = await db
    .select()
    .from(itemWarehouseStock)
    .where(
      tenantWhere(
        itemWarehouseStock,
        tenantId,
        and(eq(itemWarehouseStock.itemId, itemId), eq(itemWarehouseStock.warehouseId, warehouseId)),
      ),
    );

  if (row) {
    const newQty = num(row.quantity) + delta;
    if (!allowNegative && newQty < -0.0001) {
      const [item] = await db
        .select({ name: items.name })
        .from(items)
        .where(tenantWhere(items, tenantId, eq(items.id, itemId)));
      throw new Error(`كمية غير كافية في المخزن للصنف «${item?.name || itemId}»`);
    }
    const stored = allowNegative ? newQty : Math.max(0, newQty);
    await db
      .update(itemWarehouseStock)
      .set({ quantity: String(stored) })
      .where(tenantWhere(itemWarehouseStock, tenantId, eq(itemWarehouseStock.id, row.id)));
  } else if (delta > 0) {
    await db.insert(itemWarehouseStock).values(
      withTenantId(tenantId, {
        itemId,
        warehouseId,
        quantity: String(delta),
      }) as any,
    );
  } else if (!allowNegative) {
    throw new Error(`لا يوجد رصيد مخزني للصنف #${itemId} في هذا المخزن`);
  }

  await syncItemTotalStock(db, tenantId, itemId);
}

export async function adjustBatchQuantity(
  db: Db,
  tenantId: number,
  batchId: number,
  delta: number,
  allowNegative = false,
) {
  if (Math.abs(delta) < 0.000001) return;
  const [batch] = await db
    .select()
    .from(itemBatches)
    .where(tenantWhere(itemBatches, tenantId, eq(itemBatches.id, batchId)));
  if (!batch) throw new Error("الدفعة غير موجودة");
  const newQty = num(batch.quantity) + delta;
  if (!allowNegative && newQty < -0.0001) throw new Error(`كمية الدفعة ${batch.batchNumber} غير كافية`);
  await db
    .update(itemBatches)
    .set({ quantity: String(allowNegative ? newQty : Math.max(0, newQty)) })
    .where(tenantWhere(itemBatches, tenantId, eq(itemBatches.id, batchId)));
}

/** خصم FEFO من دفعات الصنف عند البيع بدون تحديد دفعة */
export async function deductBatchesFefo(
  db: Db,
  tenantId: number,
  itemId: number,
  quantity: number,
) {
  let remaining = quantity;
  const batches = await db
    .select()
    .from(itemBatches)
    .where(tenantWhere(itemBatches, tenantId, eq(itemBatches.itemId, itemId)))
    .orderBy(asc(itemBatches.expiryDate), asc(itemBatches.id));

  for (const b of batches) {
    if (remaining <= 0) break;
    const avail = num(b.quantity);
    if (avail <= 0) continue;
    const take = Math.min(avail, remaining);
    await db
      .update(itemBatches)
      .set({ quantity: String(avail - take) })
      .where(tenantWhere(itemBatches, tenantId, eq(itemBatches.id, b.id)));
    remaining -= take;
  }
}

export async function receiveBatchStock(
  db: Db,
  tenantId: number,
  opts: {
    itemId: number;
    quantity: number;
    batchId?: number | null;
    batchNumber?: string | null;
    expiryDate?: string | null;
  },
) {
  const qty = num(opts.quantity);
  if (qty <= 0) return null;

  if (opts.batchId) {
    await adjustBatchQuantity(db, tenantId, opts.batchId, qty);
    return opts.batchId;
  }

  if (opts.batchNumber?.trim()) {
    const bn = opts.batchNumber.trim();
    const [existing] = await db
      .select()
      .from(itemBatches)
      .where(
        tenantWhere(
          itemBatches,
          tenantId,
          and(eq(itemBatches.itemId, opts.itemId), eq(itemBatches.batchNumber, bn)),
        ),
      );
    if (existing) {
      await adjustBatchQuantity(db, tenantId, existing.id, qty);
      return existing.id;
    }
    const [result] = await db.insert(itemBatches).values(
      withTenantId(tenantId, {
        itemId: opts.itemId,
        batchNumber: bn,
        expiryDate: opts.expiryDate as any,
        quantity: String(qty),
      }) as any,
    );
    return (result as { insertId: number }).insertId;
  }

  return null;
}

/** دفعات متاحة لصنف (كمية > 0) مرتبة FEFO */
export async function listAvailableBatches(
  db: Db,
  tenantId: number,
  itemId: number,
) {
  const batches = await db
    .select({
      id: itemBatches.id,
      batchNumber: itemBatches.batchNumber,
      expiryDate: itemBatches.expiryDate,
      quantity: itemBatches.quantity,
    })
    .from(itemBatches)
    .where(tenantWhere(itemBatches, tenantId, eq(itemBatches.itemId, itemId)))
    .orderBy(asc(itemBatches.expiryDate), asc(itemBatches.id));

  return batches
    .filter((b) => num(b.quantity) > 0)
    .map((b) => ({
      id: b.id,
      batchNumber: b.batchNumber,
      expiryDate: b.expiryDate,
      quantity: num(b.quantity),
    }));
}

/** حركة مخزنية موحّدة: مخزن + دفعة اختيارية */
export async function applyStockMovement(
  db: Db,
  tenantId: number,
  opts: {
    itemId: number;
    quantity: number | string;
    direction: "in" | "out";
    warehouseId?: number | null;
    batchId?: number | null;
    batchNumber?: string | null;
    expiryDate?: string | null;
    allowNegative?: boolean;
    useFefo?: boolean;
  },
) {
  const qty = Math.abs(num(opts.quantity));
  if (qty <= 0) return;

  const warehouseId = await resolveWarehouseId(db, tenantId, opts.warehouseId);
  const delta = opts.direction === "in" ? qty : -qty;

  await adjustWarehouseStock(db, tenantId, {
    itemId: opts.itemId,
    warehouseId,
    delta,
    allowNegative: opts.allowNegative,
  });

  if (opts.direction === "in") {
    await receiveBatchStock(db, tenantId, {
      itemId: opts.itemId,
      quantity: qty,
      batchId: opts.batchId,
      batchNumber: opts.batchNumber,
      expiryDate: opts.expiryDate,
    });
    return;
  }

  if (opts.batchId) {
    await adjustBatchQuantity(db, tenantId, opts.batchId, -qty, opts.allowNegative);
  } else if (opts.useFefo !== false) {
    await deductBatchesFefo(db, tenantId, opts.itemId, qty);
  }
}

export async function getWarehouseItemQty(
  db: Db,
  tenantId: number,
  itemId: number,
  warehouseId: number,
) {
  const [row] = await db
    .select({ quantity: itemWarehouseStock.quantity })
    .from(itemWarehouseStock)
    .where(
      tenantWhere(
        itemWarehouseStock,
        tenantId,
        and(eq(itemWarehouseStock.itemId, itemId), eq(itemWarehouseStock.warehouseId, warehouseId)),
      ),
    );
  return num(row?.quantity);
}

export async function transferStockBetweenWarehouses(
  db: Db,
  tenantId: number,
  opts: {
    itemId: number;
    quantity: number | string;
    fromWarehouseId: number;
    toWarehouseId: number;
    batchId?: number | null;
  },
) {
  const qty = num(opts.quantity);
  if (qty <= 0) throw new Error("كمية التحويل يجب أن تكون أكبر من صفر");
  if (opts.fromWarehouseId === opts.toWarehouseId) {
    throw new Error("مخزن المصدر والوجهة متطابقان");
  }

  await adjustWarehouseStock(db, tenantId, {
    itemId: opts.itemId,
    warehouseId: opts.fromWarehouseId,
    delta: -qty,
  });
  await adjustWarehouseStock(db, tenantId, {
    itemId: opts.itemId,
    warehouseId: opts.toWarehouseId,
    delta: qty,
  });
}

/** ترحيل رصيد الأصناف الحالي إلى المخزن الافتراضي (مرة واحدة للشركات القديمة) */
export async function backfillWarehouseStockFromItems(db: Db, tenantId: number) {
  const warehouseId = await getDefaultWarehouseId(db, tenantId);
  if (!warehouseId) return { added: 0, message: "لا يوجد مخزن" };

  const allItems = await db
    .select({ id: items.id, currentStock: items.currentStock })
    .from(items)
    .where(tenantWhere(items, tenantId, eq(items.isActive, true)));

  let added = 0;
  for (const item of allItems) {
    const qty = num(item.currentStock);
    if (qty <= 0) continue;
    const [existing] = await db
      .select({ id: itemWarehouseStock.id })
      .from(itemWarehouseStock)
      .where(
        tenantWhere(
          itemWarehouseStock,
          tenantId,
          and(eq(itemWarehouseStock.itemId, item.id), eq(itemWarehouseStock.warehouseId, warehouseId)),
        ),
      );
    if (existing) continue;
    await db.insert(itemWarehouseStock).values(
      withTenantId(tenantId, { itemId: item.id, warehouseId, quantity: String(qty) }) as any,
    );
    added++;
  }
  return { added, warehouseId };
}
