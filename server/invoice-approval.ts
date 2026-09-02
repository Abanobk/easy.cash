import { eq } from "drizzle-orm";
import type { Db } from "./db";
import {
  customers,
  purchaseInvoiceItems,
  purchaseInvoiceItemBatches,
  purchaseInvoiceTaxes,
  purchaseInvoiceExpenses,
  purchaseInvoices,
  salesInvoiceItems,
  salesInvoiceItemBatches,
  salesInvoiceTaxes,
  salesInvoiceExpenses,
  salesInvoices,
  suppliers,
  journalEntries,
} from "../drizzle/schema";
import { postPurchaseInvoiceJournal, postSalesCogsJournal, postSalesInvoiceJournal } from "./auto-journal";
import { recalculateCustomerBalance, recalculateSupplierBalance } from "./contact-balances";
import { applyStockMovement } from "./inventory-stock";
import { updateAverageCostAfterPurchase } from "./inventory-cost";
import { tenantWhere } from "./tenant-scope";

/** drizzle/mysql2 يرجّع أعمدة date() ككائن Date حقيقي — String(x).slice(0,10) بيفقد السنة */
function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v || "").slice(0, 10);
}

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
      id: salesInvoiceItems.id,
      itemId: salesInvoiceItems.itemId,
      quantity: salesInvoiceItems.quantity,
      warehouseId: salesInvoiceItems.warehouseId,
      batchId: salesInvoiceItems.batchId,
    })
    .from(salesInvoiceItems)
    .where(tenantWhere(salesInvoiceItems, tenantId, eq(salesInvoiceItems.invoiceId, invoiceId)));

  for (const line of lineItems) {
    const lineWarehouseId = line.warehouseId ?? inv.warehouseId;
    const splits = await db
      .select()
      .from(salesInvoiceItemBatches)
      .where(tenantWhere(salesInvoiceItemBatches, tenantId, eq(salesInvoiceItemBatches.invoiceItemId, line.id)));
    if (splits.length) {
      for (const s of splits) {
        await applyStockMovement(db, tenantId, {
          itemId: line.itemId,
          quantity: s.quantity,
          direction: "out",
          warehouseId: lineWarehouseId,
          batchId: s.batchId,
        });
      }
    } else {
      await applyStockMovement(db, tenantId, {
        itemId: line.itemId,
        quantity: line.quantity,
        direction: "out",
        warehouseId: lineWarehouseId,
        batchId: line.batchId,
      });
    }
  }

  const isCash = inv.paymentType === "cash";
  await db
    .update(salesInvoices)
    .set({ status: isCash ? "paid" : "confirmed" } as any)
    .where(tenantWhere(salesInvoices, tenantId, eq(salesInvoices.id, invoiceId)));

  const extraTaxes = await db.select().from(salesInvoiceTaxes)
    .where(tenantWhere(salesInvoiceTaxes, tenantId, eq(salesInvoiceTaxes.invoiceId, invoiceId)));
  const extraExpenses = await db.select().from(salesInvoiceExpenses)
    .where(tenantWhere(salesInvoiceExpenses, tenantId, eq(salesInvoiceExpenses.invoiceId, invoiceId)));

  await postSalesInvoiceJournal(db, tenantId, userId, {
    number: inv.number,
    date: toDateStr(inv.date),
    paymentType: inv.paymentType as "cash" | "credit",
    subtotal: String(inv.subtotal),
    discount: String(inv.discount),
    tax: String(inv.tax),
    total: String(inv.total),
    costCenterId: inv.costCenterId ?? undefined,
    customerName: customer?.name,
    cashAmount: inv.cashAmount != null ? String(inv.cashAmount) : undefined,
    bankAmount: inv.bankAmount != null ? String(inv.bankAmount) : undefined,
    bankAccountId: inv.bankAccountId ?? undefined,
    taxes: extraTaxes.map((t) => ({ amount: String(t.amount), glAccountId: t.glAccountId ?? undefined, name: t.name ?? undefined })),
    expenses: extraExpenses.map((e) => ({
      amount: String(e.amount),
      creditAccountId: e.creditAccountId,
      currencyCode: e.currencyCode ?? undefined,
      exchangeRate: e.exchangeRate != null ? String(e.exchangeRate) : undefined,
      notes: e.notes,
    })),
  });
  await postSalesCogsJournal(db, tenantId, userId, {
    number: inv.number,
    date: toDateStr(inv.date),
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
      id: purchaseInvoiceItems.id,
      itemId: purchaseInvoiceItems.itemId,
      quantity: purchaseInvoiceItems.quantity,
      price: purchaseInvoiceItems.price,
      warehouseId: purchaseInvoiceItems.warehouseId,
      batchId: purchaseInvoiceItems.batchId,
    })
    .from(purchaseInvoiceItems)
    .where(tenantWhere(purchaseInvoiceItems, tenantId, eq(purchaseInvoiceItems.invoiceId, invoiceId)));

  for (const line of lineItems) {
    const lineWarehouseId = line.warehouseId ?? inv.warehouseId;
    const splits = await db
      .select()
      .from(purchaseInvoiceItemBatches)
      .where(tenantWhere(purchaseInvoiceItemBatches, tenantId, eq(purchaseInvoiceItemBatches.invoiceItemId, line.id)));
    if (splits.length) {
      for (const s of splits) {
        await applyStockMovement(db, tenantId, {
          itemId: line.itemId,
          quantity: s.quantity,
          direction: "in",
          warehouseId: lineWarehouseId,
          batchId: s.batchId,
          batchNumber: s.batchNumber,
          expiryDate: s.expiryDate as any,
        });
      }
    } else {
      await applyStockMovement(db, tenantId, {
        itemId: line.itemId,
        quantity: line.quantity,
        direction: "in",
        warehouseId: lineWarehouseId,
        batchId: line.batchId,
      });
    }
    await updateAverageCostAfterPurchase(
      db,
      tenantId,
      line.itemId,
      Number(line.quantity),
      Number(line.price),
      lineWarehouseId,
    );
  }

  const isCash = inv.paymentType === "cash";
  await db
    .update(purchaseInvoices)
    .set({ status: isCash ? "paid" : "confirmed" } as any)
    .where(tenantWhere(purchaseInvoices, tenantId, eq(purchaseInvoices.id, invoiceId)));

  const extraTaxes = await db.select().from(purchaseInvoiceTaxes)
    .where(tenantWhere(purchaseInvoiceTaxes, tenantId, eq(purchaseInvoiceTaxes.invoiceId, invoiceId)));
  const extraExpenses = await db.select().from(purchaseInvoiceExpenses)
    .where(tenantWhere(purchaseInvoiceExpenses, tenantId, eq(purchaseInvoiceExpenses.invoiceId, invoiceId)));

  await postPurchaseInvoiceJournal(db, tenantId, userId, {
    number: inv.number,
    date: toDateStr(inv.date),
    paymentType: inv.paymentType as "cash" | "credit",
    subtotal: String(inv.subtotal),
    discount: String(inv.discount),
    tax: String(inv.tax),
    total: String(inv.total),
    costCenterId: inv.costCenterId ?? undefined,
    supplierName: supplier?.name,
    cashAmount: inv.cashAmount != null ? String(inv.cashAmount) : undefined,
    bankAmount: inv.bankAmount != null ? String(inv.bankAmount) : undefined,
    bankAccountId: inv.bankAccountId ?? undefined,
    taxes: extraTaxes.map((t) => ({ amount: String(t.amount), glAccountId: t.glAccountId ?? undefined, name: t.name ?? undefined })),
    expenses: extraExpenses.map((e) => ({
      amount: String(e.amount),
      creditAccountId: e.creditAccountId,
      currencyCode: e.currencyCode ?? undefined,
      exchangeRate: e.exchangeRate != null ? String(e.exchangeRate) : undefined,
      notes: e.notes,
    })),
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
