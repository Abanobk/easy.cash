import { and, count, eq } from "drizzle-orm";
import type { Db } from "./db";
import {
  customers,
  purchaseInvoiceItems,
  purchaseInvoices,
  purchaseOrderItems,
  purchaseOrders,
  salesInvoiceItems,
  salesInvoices,
  salesOrderItems,
  salesOrders,
  suppliers,
} from "../drizzle/schema";
import { postPurchaseInvoiceJournal, postSalesCogsJournal, postSalesInvoiceJournal } from "./auto-journal";
import { recalculateCustomerBalance, recalculateSupplierBalance } from "./contact-balances";
import { applyStockMovement } from "./inventory-stock";
import { updateAverageCostAfterPurchase } from "./inventory-cost";
import { tenantWhere, withTenantId } from "./tenant-scope";
import { assertDateNotInClosedPeriod } from "./fiscal-period-guard";
import { assertCustomerCreditLimit } from "./credit-limit-guard";

function num(v: unknown) {
  return Number(v ?? 0);
}

/** drizzle/mysql2 يرجّع أعمدة date() ككائن Date حقيقي — String(x).slice(0,10) بيفقد السنة */
function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v || "").slice(0, 10);
}

export async function convertSalesOrderToInvoice(
  db: Db,
  tenantId: number,
  userId: number | undefined,
  orderId: number,
  opts: { paymentType?: "cash" | "credit"; date?: string } = {},
) {
  const [order] = await db
    .select()
    .from(salesOrders)
    .where(tenantWhere(salesOrders, tenantId, eq(salesOrders.id, orderId)));
  if (!order) throw new Error("أمر البيع غير موجود");
  if (order.convertedInvoiceId) throw new Error("تم تحويل هذا الأمر لفاتورة مسبقاً");
  if (order.status === "cancelled") throw new Error("أمر ملغي");

  const lines = await db
    .select()
    .from(salesOrderItems)
    .where(tenantWhere(salesOrderItems, tenantId, eq(salesOrderItems.orderId, orderId)));
  if (!lines.length) throw new Error("أمر البيع بدون أصناف");

  const [countResult] = await db.select({ count: count() }).from(salesInvoices).where(tenantWhere(salesInvoices, tenantId));
  const number = `SI-${String(countResult.count + 1).padStart(5, "0")}`;
  const invoiceDate = opts.date || toDateStr(order.date);
  const paymentType = opts.paymentType || "credit";
  const isCash = paymentType === "cash";

  await assertDateNotInClosedPeriod(db, tenantId, invoiceDate);
  if (!order.warehouseId) {
    throw new Error("يجب تحديد المخزن على أمر البيع قبل التحويل لفاتورة");
  }
  if (!isCash) {
    await assertCustomerCreditLimit(db, tenantId, order.customerId, String(order.total));
  }

  const [customer] = await db
    .select({ name: customers.name, salesRepId: customers.salesRepId, branchId: customers.branchId })
    .from(customers)
    .where(tenantWhere(customers, tenantId, eq(customers.id, order.customerId)));

  const [result] = await db.insert(salesInvoices).values(
    withTenantId(tenantId, {
      number,
      customerId: order.customerId,
      orderId: order.id,
      date: invoiceDate as any,
      warehouseId: order.warehouseId,
      paymentType,
      subtotal: order.subtotal,
      discount: order.discount,
      tax: order.tax,
      total: order.total,
      paid: isCash ? order.total : "0",
      remaining: isCash ? "0" : order.total,
      salesRepId: customer?.salesRepId,
      branchId: customer?.branchId,
      notes: order.notes,
      createdBy: userId,
      status: isCash ? "paid" : "confirmed",
    }) as any,
  );
  const invId = (result as { insertId: number }).insertId;

  for (const line of lines) {
    await db.insert(salesInvoiceItems).values(
      withTenantId(tenantId, {
        invoiceId: invId,
        itemId: line.itemId,
        quantity: line.quantity,
        price: line.price,
        discount: line.discount,
        tax: line.tax,
        total: line.total,
      }) as any,
    );
    await applyStockMovement(db, tenantId, {
      itemId: line.itemId,
      quantity: line.quantity,
      direction: "out",
      warehouseId: order.warehouseId,
    });
  }

  await postSalesInvoiceJournal(db, tenantId, userId, {
    number,
    date: invoiceDate,
    paymentType,
    subtotal: String(order.subtotal),
    discount: String(order.discount),
    tax: String(order.tax),
    total: String(order.total),
    customerName: customer?.name,
  });
  await postSalesCogsJournal(db, tenantId, userId, {
    number,
    date: invoiceDate,
    items: lines.map((l) => ({ itemId: l.itemId, quantity: String(l.quantity) })),
  });
  if (!isCash) {
    await recalculateCustomerBalance(db, tenantId, order.customerId);
  }

  await db
    .update(salesOrders)
    .set({ status: "delivered", convertedInvoiceId: invId } as any)
    .where(tenantWhere(salesOrders, tenantId, eq(salesOrders.id, orderId)));

  return { invoiceId: invId, number };
}

/**
 * تحويل أمر شراء (كلي أو جزئي) لفاتورة شراء حقيقية.
 * لو opts.items اتبعتت، بتحدد لكل بند قد إيه يتحول دلوقتي (يجب ما يتعداش الباقي)؛
 * لو مبعتتش، الافتراضي تحويل كل الباقي من كل الأسطر — نفس سلوك "تحويل كامل" القديم.
 * الأمر بيفضل مفتوح ("جزئي") لحد ما كل الأسطر توصل لكميتها الكاملة.
 */
export async function convertPurchaseOrderToInvoice(
  db: Db,
  tenantId: number,
  userId: number | undefined,
  orderId: number,
  opts: { paymentType?: "cash" | "credit"; date?: string; items?: { orderItemId: number; quantity: string }[] } = {},
) {
  const [order] = await db
    .select()
    .from(purchaseOrders)
    .where(tenantWhere(purchaseOrders, tenantId, eq(purchaseOrders.id, orderId)));
  if (!order) throw new Error("أمر الشراء غير موجود");
  if (order.status === "cancelled") throw new Error("أمر ملغي");
  if (order.status === "received") throw new Error("تم استلام هذا الأمر بالكامل مسبقاً");

  const lines = await db
    .select()
    .from(purchaseOrderItems)
    .where(tenantWhere(purchaseOrderItems, tenantId, eq(purchaseOrderItems.orderId, orderId)));
  if (!lines.length) throw new Error("أمر الشراء بدون أصناف");

  const requestMap = new Map<number, number>();
  for (const it of opts.items ?? []) requestMap.set(it.orderItemId, num(it.quantity));

  const toConvert: Array<{ line: (typeof lines)[number]; qty: number }> = [];
  for (const line of lines) {
    const remaining = Math.max(0, num(line.quantity) - num(line.convertedQuantity));
    const requested = opts.items?.length ? (requestMap.get(line.id) ?? 0) : remaining;
    if (requested <= 0.0001) continue;
    if (requested - remaining > 0.0001) {
      throw new Error(`الكمية المطلوب تحويلها لصنف #${line.itemId} أكبر من الباقي (${remaining})`);
    }
    toConvert.push({ line, qty: requested });
  }
  if (!toConvert.length) throw new Error("لا توجد كمية متبقية لتحويلها من هذا الأمر");

  const [countResult] = await db.select({ count: count() }).from(purchaseInvoices).where(tenantWhere(purchaseInvoices, tenantId));
  const number = `PI-${String(countResult.count + 1).padStart(5, "0")}`;
  const invoiceDate = opts.date || toDateStr(order.date);
  const paymentType = opts.paymentType || "credit";
  const isCash = paymentType === "cash";

  await assertDateNotInClosedPeriod(db, tenantId, invoiceDate);
  if (!order.warehouseId) {
    throw new Error("يجب تحديد المخزن على أمر الشراء قبل التحويل لفاتورة");
  }

  const [supplier] = await db
    .select({ name: suppliers.name })
    .from(suppliers)
    .where(tenantWhere(suppliers, tenantId, eq(suppliers.id, order.supplierId)));

  // الإجماليات بتتحسب من الكمية المُحوَّلة فعليًا دلوقتي — مش إجمالي الأمر كله (مهم للتحويل الجزئي)
  let subtotal = 0;
  let taxTotal = 0;
  let grandTotal = 0;
  const computedLines = toConvert.map(({ line, qty }) => {
    const price = num(line.price);
    const discountPct = num(line.discount);
    const taxPct = num(line.tax);
    const lineSub = qty * price * (1 - discountPct / 100);
    const lineTotal = lineSub * (1 + taxPct / 100);
    subtotal += lineSub;
    taxTotal += lineTotal - lineSub;
    grandTotal += lineTotal;
    return { line, qty, lineTotal };
  });

  const [result] = await db.insert(purchaseInvoices).values(
    withTenantId(tenantId, {
      number,
      supplierId: order.supplierId,
      orderId: order.id,
      date: invoiceDate as any,
      warehouseId: order.warehouseId,
      paymentType,
      subtotal: subtotal.toFixed(2),
      discount: "0",
      tax: taxTotal.toFixed(2),
      total: grandTotal.toFixed(2),
      paid: isCash ? grandTotal.toFixed(2) : "0",
      remaining: isCash ? "0" : grandTotal.toFixed(2),
      notes: order.notes,
      createdBy: userId,
      status: isCash ? "paid" : "confirmed",
    }) as any,
  );
  const invId = (result as { insertId: number }).insertId;

  for (const { line, qty, lineTotal } of computedLines) {
    await db.insert(purchaseInvoiceItems).values(
      withTenantId(tenantId, {
        invoiceId: invId,
        itemId: line.itemId,
        quantity: String(qty),
        price: line.price,
        discount: line.discount,
        tax: line.tax,
        total: lineTotal.toFixed(2),
      }) as any,
    );
    await applyStockMovement(db, tenantId, {
      itemId: line.itemId,
      quantity: qty,
      direction: "in",
      warehouseId: order.warehouseId,
    });
    await updateAverageCostAfterPurchase(db, tenantId, line.itemId, qty, num(line.price), order.warehouseId);
    await db
      .update(purchaseOrderItems)
      .set({ convertedQuantity: String(num(line.convertedQuantity) + qty) } as any)
      .where(tenantWhere(purchaseOrderItems, tenantId, eq(purchaseOrderItems.id, line.id)));
  }

  await postPurchaseInvoiceJournal(db, tenantId, userId, {
    number,
    date: invoiceDate,
    paymentType,
    subtotal: subtotal.toFixed(2),
    discount: "0",
    tax: taxTotal.toFixed(2),
    total: grandTotal.toFixed(2),
    supplierName: supplier?.name,
  });
  if (!isCash) {
    await recalculateSupplierBalance(db, tenantId, order.supplierId);
  }

  const freshLines = await db
    .select()
    .from(purchaseOrderItems)
    .where(tenantWhere(purchaseOrderItems, tenantId, eq(purchaseOrderItems.orderId, orderId)));
  const allDone = freshLines.every((l) => num(l.convertedQuantity) >= num(l.quantity) - 0.0001);
  const anyDone = freshLines.some((l) => num(l.convertedQuantity) > 0.0001);
  const newStatus = allDone ? "received" : anyDone ? "partial" : order.status;

  await db
    .update(purchaseOrders)
    .set({ status: newStatus, convertedInvoiceId: invId } as any)
    .where(tenantWhere(purchaseOrders, tenantId, eq(purchaseOrders.id, orderId)));

  return { invoiceId: invId, number, status: newStatus };
}
