import { eq } from "drizzle-orm";
import type { Db } from "./db";
import {
  customers,
  purchaseReturnItems,
  purchaseReturns,
  salesReturnItems,
  salesReturns,
  suppliers,
} from "../drizzle/schema";
import { applyStockMovement } from "./inventory-stock";
import {
  loadInvoiceItemStockMeta,
  requireInvoiceLineWarehouse,
} from "./invoice-stock";
import {
  cancelPostedJournalByReference,
  postPurchaseReturnJournal,
  postSalesReturnCogsJournal,
  postSalesReturnJournal,
} from "./auto-journal";
import { recalculateCustomerBalance, recalculateSupplierBalance } from "./contact-balances";
import { tenantWhere } from "./tenant-scope";

function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v || "").slice(0, 10);
}

/** اعتماد مردود بيع — إدخال مخزن + قيد (ميجا: اعتماد وليس حفظ) */
export async function finalizeSalesReturn(
  db: Db,
  tenantId: number,
  userId: number | undefined,
  returnId: number,
) {
  const [ret] = await db.select().from(salesReturns)
    .where(tenantWhere(salesReturns, tenantId, eq(salesReturns.id, returnId)));
  if (!ret) throw new Error("مردود البيع غير موجود");
  if (ret.status !== "draft") throw new Error("المردود معتمد مسبقاً");

  const lines = await db.select().from(salesReturnItems)
    .where(tenantWhere(salesReturnItems, tenantId, eq(salesReturnItems.returnId, returnId)));
  const meta = await loadInvoiceItemStockMeta(db, tenantId, lines.map((l) => l.itemId));

  for (const line of lines) {
    const m = meta.get(line.itemId);
    if (m && !m.affectsStock) continue;
    const wh = requireInvoiceLineWarehouse(line.warehouseId, ret.warehouseId, m?.name);
    await applyStockMovement(db, tenantId, {
      itemId: line.itemId,
      quantity: line.quantity,
      direction: "in",
      warehouseId: wh,
      batchId: line.batchId,
      requireWarehouse: true,
    });
  }

  await db.update(salesReturns).set({ status: "confirmed" } as any)
    .where(tenantWhere(salesReturns, tenantId, eq(salesReturns.id, returnId)));

  const [customer] = await db.select({ name: customers.name }).from(customers)
    .where(tenantWhere(customers, tenantId, eq(customers.id, ret.customerId)));

  await postSalesReturnJournal(db, tenantId, userId, {
    number: ret.number,
    date: toDateStr(ret.date),
    total: String(ret.total),
    customerName: customer?.name,
  });
  await postSalesReturnCogsJournal(db, tenantId, userId, {
    number: ret.number,
    date: toDateStr(ret.date),
    items: lines.map((it) => ({ itemId: it.itemId, quantity: String(it.quantity) })),
  });
  await recalculateCustomerBalance(db, tenantId, ret.customerId);
}

/** فك اعتماد مردود بيع */
export async function unfinalizeSalesReturn(
  db: Db,
  tenantId: number,
  returnId: number,
) {
  const [ret] = await db.select().from(salesReturns)
    .where(tenantWhere(salesReturns, tenantId, eq(salesReturns.id, returnId)));
  if (!ret) throw new Error("مردود البيع غير موجود");
  if (ret.status !== "confirmed") throw new Error("المردود ليس معتمداً");

  const lines = await db.select().from(salesReturnItems)
    .where(tenantWhere(salesReturnItems, tenantId, eq(salesReturnItems.returnId, returnId)));
  const meta = await loadInvoiceItemStockMeta(db, tenantId, lines.map((l) => l.itemId));

  for (const line of lines) {
    const m = meta.get(line.itemId);
    if (m && !m.affectsStock) continue;
    const wh = requireInvoiceLineWarehouse(line.warehouseId, ret.warehouseId, m?.name);
    await applyStockMovement(db, tenantId, {
      itemId: line.itemId,
      quantity: line.quantity,
      direction: "out",
      warehouseId: wh,
      batchId: line.batchId,
      requireWarehouse: true,
    });
  }

  await cancelPostedJournalByReference(db, tenantId, ret.number);
  await db.update(salesReturns).set({ status: "draft" } as any)
    .where(tenantWhere(salesReturns, tenantId, eq(salesReturns.id, returnId)));
  await recalculateCustomerBalance(db, tenantId, ret.customerId);
}

/** اعتماد مردود شراء — صرف مخزن + قيد */
export async function finalizePurchaseReturn(
  db: Db,
  tenantId: number,
  userId: number | undefined,
  returnId: number,
) {
  const [ret] = await db.select().from(purchaseReturns)
    .where(tenantWhere(purchaseReturns, tenantId, eq(purchaseReturns.id, returnId)));
  if (!ret) throw new Error("مردود الشراء غير موجود");
  if (ret.status !== "draft") throw new Error("المردود معتمد مسبقاً");

  const lines = await db.select().from(purchaseReturnItems)
    .where(tenantWhere(purchaseReturnItems, tenantId, eq(purchaseReturnItems.returnId, returnId)));
  const meta = await loadInvoiceItemStockMeta(db, tenantId, lines.map((l) => l.itemId));

  for (const line of lines) {
    const m = meta.get(line.itemId);
    if (m && !m.affectsStock) continue;
    const wh = requireInvoiceLineWarehouse(line.warehouseId, ret.warehouseId, m?.name);
    await applyStockMovement(db, tenantId, {
      itemId: line.itemId,
      quantity: line.quantity,
      direction: "out",
      warehouseId: wh,
      batchId: line.batchId,
      requireWarehouse: true,
    });
  }

  await db.update(purchaseReturns).set({ status: "confirmed" } as any)
    .where(tenantWhere(purchaseReturns, tenantId, eq(purchaseReturns.id, returnId)));

  const [supplier] = await db.select({ name: suppliers.name }).from(suppliers)
    .where(tenantWhere(suppliers, tenantId, eq(suppliers.id, ret.supplierId)));

  await postPurchaseReturnJournal(db, tenantId, userId, {
    number: ret.number,
    date: toDateStr(ret.date),
    total: String(ret.total),
    supplierName: supplier?.name,
    items: lines.map((it) => ({ itemId: it.itemId, quantity: String(it.quantity) })),
  });
  await recalculateSupplierBalance(db, tenantId, ret.supplierId);
}

export async function unfinalizePurchaseReturn(
  db: Db,
  tenantId: number,
  returnId: number,
) {
  const [ret] = await db.select().from(purchaseReturns)
    .where(tenantWhere(purchaseReturns, tenantId, eq(purchaseReturns.id, returnId)));
  if (!ret) throw new Error("مردود الشراء غير موجود");
  if (ret.status !== "confirmed") throw new Error("المردود ليس معتمداً");

  const lines = await db.select().from(purchaseReturnItems)
    .where(tenantWhere(purchaseReturnItems, tenantId, eq(purchaseReturnItems.returnId, returnId)));
  const meta = await loadInvoiceItemStockMeta(db, tenantId, lines.map((l) => l.itemId));

  for (const line of lines) {
    const m = meta.get(line.itemId);
    if (m && !m.affectsStock) continue;
    const wh = requireInvoiceLineWarehouse(line.warehouseId, ret.warehouseId, m?.name);
    await applyStockMovement(db, tenantId, {
      itemId: line.itemId,
      quantity: line.quantity,
      direction: "in",
      warehouseId: wh,
      batchId: line.batchId,
      requireWarehouse: true,
    });
  }

  await cancelPostedJournalByReference(db, tenantId, ret.number);
  await db.update(purchaseReturns).set({ status: "draft" } as any)
    .where(tenantWhere(purchaseReturns, tenantId, eq(purchaseReturns.id, returnId)));
  await recalculateSupplierBalance(db, tenantId, ret.supplierId);
}

export function lineReturnTotal(qty: string, price: string, discount = "0", cashDiscount = "0", tax = "0") {
  const q = Number(qty) || 0;
  const p = Number(price) || 0;
  const d = Number(discount) || 0;
  const cash = Number(cashDiscount) || 0;
  const t = Number(tax) || 0;
  const sub = Math.max(0, q * p * (1 - d / 100) - cash);
  return (sub * (1 + t / 100)).toFixed(2);
}
