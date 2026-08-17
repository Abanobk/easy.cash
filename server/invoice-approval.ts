import { eq } from "drizzle-orm";
import type { Db } from "./db";
import {
  customers,
  purchaseInvoiceItems,
  purchaseInvoices,
  salesInvoiceItems,
  salesInvoices,
  suppliers,
  journalEntries,
} from "../drizzle/schema";
import { postPurchaseInvoiceJournal, postSalesCogsJournal, postSalesInvoiceJournal } from "./auto-journal";
import { recalculateCustomerBalance, recalculateSupplierBalance } from "./contact-balances";
import { applyStockMovement } from "./inventory-stock";
import { updateAverageCostAfterPurchase } from "./inventory-cost";
import { tenantWhere } from "./tenant-scope";

export async function finalizeSalesInvoice(
  db: Db,
  tenantId: number,
  userId: number | undefined,
  invoiceId: number,
) {
  const [inv] = await db
    .select()
    .from(salesInvoices)
    .where(tenantWhere(salesInvoices, tenantId, eq(salesInvoices.id, invoiceId)));
  if (!inv) throw new Error("الفاتورة غير موجودة");
  if (inv.status !== "draft") throw new Error("الفاتورة معتمدة مسبقاً");

  const [customer] = await db
    .select({ name: customers.name })
    .from(customers)
    .where(tenantWhere(customers, tenantId, eq(customers.id, inv.customerId)));

  const lineItems = await db
    .select({
      itemId: salesInvoiceItems.itemId,
      quantity: salesInvoiceItems.quantity,
      batchId: salesInvoiceItems.batchId,
    })
    .from(salesInvoiceItems)
    .where(tenantWhere(salesInvoiceItems, tenantId, eq(salesInvoiceItems.invoiceId, invoiceId)));

  for (const line of lineItems) {
    await applyStockMovement(db, tenantId, {
      itemId: line.itemId,
      quantity: line.quantity,
      direction: "out",
      warehouseId: inv.warehouseId,
      batchId: line.batchId,
    });
  }

  const isCash = inv.paymentType === "cash";
  await db
    .update(salesInvoices)
    .set({ status: isCash ? "paid" : "confirmed" } as any)
    .where(tenantWhere(salesInvoices, tenantId, eq(salesInvoices.id, invoiceId)));

  await postSalesInvoiceJournal(db, tenantId, userId, {
    number: inv.number,
    date: String(inv.date).slice(0, 10),
    paymentType: inv.paymentType as "cash" | "credit",
    subtotal: String(inv.subtotal),
    discount: String(inv.discount),
    tax: String(inv.tax),
    total: String(inv.total),
    costCenterId: inv.costCenterId ?? undefined,
    customerName: customer?.name,
  });
  await postSalesCogsJournal(db, tenantId, userId, {
    number: inv.number,
    date: String(inv.date).slice(0, 10),
    costCenterId: inv.costCenterId ?? undefined,
    items: lineItems.map((i) => ({ itemId: i.itemId, quantity: String(i.quantity) })),
  });
  if (!isCash) {
    await recalculateCustomerBalance(db, tenantId, inv.customerId);
  }
}

export async function finalizePurchaseInvoice(
  db: Db,
  tenantId: number,
  userId: number | undefined,
  invoiceId: number,
) {
  const [inv] = await db
    .select()
    .from(purchaseInvoices)
    .where(tenantWhere(purchaseInvoices, tenantId, eq(purchaseInvoices.id, invoiceId)));
  if (!inv) throw new Error("الفاتورة غير موجودة");
  if (inv.status !== "draft") throw new Error("الفاتورة معتمدة مسبقاً");

  const [supplier] = await db
    .select({ name: suppliers.name })
    .from(suppliers)
    .where(tenantWhere(suppliers, tenantId, eq(suppliers.id, inv.supplierId)));

  const lineItems = await db
    .select({
      itemId: purchaseInvoiceItems.itemId,
      quantity: purchaseInvoiceItems.quantity,
      price: purchaseInvoiceItems.price,
      batchId: purchaseInvoiceItems.batchId,
    })
    .from(purchaseInvoiceItems)
    .where(tenantWhere(purchaseInvoiceItems, tenantId, eq(purchaseInvoiceItems.invoiceId, invoiceId)));

  for (const line of lineItems) {
    await applyStockMovement(db, tenantId, {
      itemId: line.itemId,
      quantity: line.quantity,
      direction: "in",
      warehouseId: inv.warehouseId,
      batchId: line.batchId,
    });
    await updateAverageCostAfterPurchase(
      db,
      tenantId,
      line.itemId,
      Number(line.quantity),
      Number(line.price),
      inv.warehouseId,
    );
  }

  const isCash = inv.paymentType === "cash";
  await db
    .update(purchaseInvoices)
    .set({ status: isCash ? "paid" : "confirmed" } as any)
    .where(tenantWhere(purchaseInvoices, tenantId, eq(purchaseInvoices.id, invoiceId)));

  await postPurchaseInvoiceJournal(db, tenantId, userId, {
    number: inv.number,
    date: String(inv.date).slice(0, 10),
    paymentType: inv.paymentType as "cash" | "credit",
    subtotal: String(inv.subtotal),
    discount: String(inv.discount),
    tax: String(inv.tax),
    total: String(inv.total),
    costCenterId: inv.costCenterId ?? undefined,
    supplierName: supplier?.name,
  });
  if (!isCash) {
    await recalculateSupplierBalance(db, tenantId, inv.supplierId);
  }
}

export async function finalizeJournalEntry(
  db: Db,
  tenantId: number,
  entryId: number,
) {
  const [entry] = await db
    .select()
    .from(journalEntries)
    .where(tenantWhere(journalEntries, tenantId, eq(journalEntries.id, entryId)));
  if (!entry) throw new Error("القيد غير موجود");
  if (entry.status !== "draft") throw new Error("القيد معتمد مسبقاً");
  await db
    .update(journalEntries)
    .set({ status: "posted" } as any)
    .where(tenantWhere(journalEntries, tenantId, eq(journalEntries.id, entryId)));
}
