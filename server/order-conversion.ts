import { and, count, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
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

export async function convertSalesOrderToInvoice(
  db: MySql2Database,
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
  const invoiceDate = opts.date || String(order.date).slice(0, 10);
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

export async function convertPurchaseOrderToInvoice(
  db: MySql2Database,
  tenantId: number,
  userId: number | undefined,
  orderId: number,
  opts: { paymentType?: "cash" | "credit"; date?: string } = {},
) {
  const [order] = await db
    .select()
    .from(purchaseOrders)
    .where(tenantWhere(purchaseOrders, tenantId, eq(purchaseOrders.id, orderId)));
  if (!order) throw new Error("أمر الشراء غير موجود");
  if (order.convertedInvoiceId) throw new Error("تم تحويل هذا الأمر لفاتورة مسبقاً");
  if (order.status === "cancelled") throw new Error("أمر ملغي");

  const lines = await db
    .select()
    .from(purchaseOrderItems)
    .where(tenantWhere(purchaseOrderItems, tenantId, eq(purchaseOrderItems.orderId, orderId)));
  if (!lines.length) throw new Error("أمر الشراء بدون أصناف");

  const [countResult] = await db.select({ count: count() }).from(purchaseInvoices).where(tenantWhere(purchaseInvoices, tenantId));
  const number = `PI-${String(countResult.count + 1).padStart(5, "0")}`;
  const invoiceDate = opts.date || String(order.date).slice(0, 10);
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

  const [result] = await db.insert(purchaseInvoices).values(
    withTenantId(tenantId, {
      number,
      supplierId: order.supplierId,
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
      notes: order.notes,
      createdBy: userId,
      status: isCash ? "paid" : "confirmed",
    }) as any,
  );
  const invId = (result as { insertId: number }).insertId;

  for (const line of lines) {
    await db.insert(purchaseInvoiceItems).values(
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
      direction: "in",
      warehouseId: order.warehouseId,
    });
    await updateAverageCostAfterPurchase(db, tenantId, line.itemId, num(line.quantity), num(line.price));
  }

  await postPurchaseInvoiceJournal(db, tenantId, userId, {
    number,
    date: invoiceDate,
    paymentType,
    subtotal: String(order.subtotal),
    discount: String(order.discount),
    tax: String(order.tax),
    total: String(order.total),
    supplierName: supplier?.name,
  });
  if (!isCash) {
    await recalculateSupplierBalance(db, tenantId, order.supplierId);
  }

  await db
    .update(purchaseOrders)
    .set({ status: "received", convertedInvoiceId: invId } as any)
    .where(tenantWhere(purchaseOrders, tenantId, eq(purchaseOrders.id, orderId)));

  return { invoiceId: invId, number };
}
