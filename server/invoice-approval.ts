import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "./db";
import {
  bankTransactions,
  cashTransactions,
  customers,
  items,
  itemBatches,
  itemWarehouseStock,
  purchaseInvoiceItems,
  purchaseInvoiceItemBatches,
  purchaseInvoiceTaxes,
  purchaseInvoiceExpenses,
  purchaseInvoices,
  purchaseReturns,
  salesInvoiceItems,
  salesInvoiceItemBatches,
  salesInvoiceTaxes,
  salesInvoiceExpenses,
  salesInvoices,
  salesReturns,
  suppliers,
  journalEntries,
} from "../drizzle/schema";
import { cancelPostedJournalByReference, postPurchaseInvoiceJournal, postSalesCogsJournal, postSalesInvoiceJournal } from "./auto-journal";
import { recalculateCustomerBalance, recalculateSupplierBalance } from "./contact-balances";
import { applyStockMovement, resolveWarehouseId } from "./inventory-stock";
import {
  loadInvoiceItemStockMeta,
  requireInvoiceLineWarehouse,
  itemAffectsWarehouseStock,
  resolveInvoiceStockQuantity,
  computeDeliveryStatus,
} from "./invoice-stock";
import { updateAverageCostAfterPurchase, recalculateItemAverageCost } from "./inventory-cost";
import { assertDateNotInClosedPeriod } from "./fiscal-period-guard";
import { downstreamMessage, findDownstreamStockConsumers } from "./reversal-guards";
import { tenantWhere } from "./tenant-scope";

/** drizzle/mysql2 يرجّع أعمدة date() ككائن Date حقيقي — String(x).slice(0,10) بيفقد السنة */
function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v || "").slice(0, 10);
}

/**
 * `paid > 0` وحدها مش دليل كافي على "تحصيل" لازم نراجعه قبل فك الاعتماد — فاتورة البيع النقدية
 * بتتسجل paid = total من لحظة الإنشاء نفسها (مفيش معاملة منفصلة)، وكمان أي دفعة مقدمة وقت
 * إنشاء فاتورة آجلة بتتسجل جوه نفس معاملة الإنشاء. التحصيل "الحقيقي" اللي المفروض يمنع فك
 * الاعتماد هو بس اللي اتسجل بعدين كمعاملة نقدية/بنكية منفصلة (recordPayment) وسايبة أثر
 * في cashTransactions/bankTransactions بمرجع رقم الفاتورة.
 */
async function findSeparateInvoiceCollection(
  db: Db,
  tenantId: number,
  invoiceNumber: string,
  cashTypes: Array<typeof cashTransactions.type.enumValues[number]>,
  bankTypes: Array<typeof bankTransactions.type.enumValues[number]>,
): Promise<{ kind: "cash" | "bank"; number: string } | null> {
  const [cashHit] = await db.select({ number: cashTransactions.number }).from(cashTransactions)
    .where(tenantWhere(cashTransactions, tenantId, and(
      eq(cashTransactions.reference, invoiceNumber),
      inArray(cashTransactions.type, cashTypes),
    ))).limit(1);
  if (cashHit) return { kind: "cash", number: cashHit.number };
  const [bankHit] = await db.select({ number: bankTransactions.number }).from(bankTransactions)
    .where(tenantWhere(bankTransactions, tenantId, and(
      eq(bankTransactions.reference, invoiceNumber),
      inArray(bankTransactions.type, bankTypes),
    ))).limit(1);
  if (bankHit) return { kind: "bank", number: bankHit.number };
  return null;
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
      deliveredQuantity: salesInvoiceItems.deliveredQuantity,
      warehouseId: salesInvoiceItems.warehouseId,
      batchId: salesInvoiceItems.batchId,
    })
    .from(salesInvoiceItems)
    .where(tenantWhere(salesInvoiceItems, tenantId, eq(salesInvoiceItems.invoiceId, invoiceId)));

  const itemMeta = await loadInvoiceItemStockMeta(db, tenantId, lineItems.map((l) => l.itemId));
  for (const line of lineItems) {
    const meta = itemMeta.get(line.itemId);
    if (meta && !meta.affectsStock) continue;
    const lineWarehouseId = requireInvoiceLineWarehouse(line.warehouseId, inv.warehouseId, meta?.name);
    const stockQty = resolveInvoiceStockQuantity({
      deliveryOrReceiptType: (inv as any).deliveryType,
      quantity: line.quantity,
      deliveredQuantity: line.deliveredQuantity,
      itemLabel: meta?.name,
    });
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
          requireWarehouse: true,
        });
      }
    } else {
      await applyStockMovement(db, tenantId, {
        itemId: line.itemId,
        quantity: String(stockQty),
        direction: "out",
        warehouseId: lineWarehouseId,
        batchId: line.batchId,
        requireWarehouse: true,
      });
    }
  }

  const isCash = inv.paymentType === "cash";
  const deliveryStatus = computeDeliveryStatus(lineItems, (inv as any).deliveryType);
  await db
    .update(salesInvoices)
    .set({ status: isCash ? "paid" : "confirmed", deliveryStatus } as any)
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
      deliveredQuantity: purchaseInvoiceItems.deliveredQuantity,
      price: purchaseInvoiceItems.price,
      warehouseId: purchaseInvoiceItems.warehouseId,
      batchId: purchaseInvoiceItems.batchId,
    })
    .from(purchaseInvoiceItems)
    .where(tenantWhere(purchaseInvoiceItems, tenantId, eq(purchaseInvoiceItems.invoiceId, invoiceId)));

  const itemMeta = await loadInvoiceItemStockMeta(db, tenantId, lineItems.map((l) => l.itemId));
  for (const line of lineItems) {
    const meta = itemMeta.get(line.itemId);
    if (meta && !meta.affectsStock) continue;
    const lineWarehouseId = requireInvoiceLineWarehouse(line.warehouseId, inv.warehouseId, meta?.name);
    const stockQty = resolveInvoiceStockQuantity({
      deliveryOrReceiptType: (inv as any).receiptType,
      quantity: line.quantity,
      deliveredQuantity: line.deliveredQuantity,
      itemLabel: meta?.name,
    });
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
          requireWarehouse: true,
        });
      }
    } else {
      await applyStockMovement(db, tenantId, {
        itemId: line.itemId,
        quantity: String(stockQty),
        direction: "in",
        warehouseId: lineWarehouseId,
        batchId: line.batchId,
        requireWarehouse: true,
      });
    }
    await updateAverageCostAfterPurchase(
      db,
      tenantId,
      line.itemId,
      stockQty,
      Number(line.price),
      lineWarehouseId,
    );
  }

  const isCash = inv.paymentType === "cash";
  const deliveryStatus = computeDeliveryStatus(lineItems, (inv as any).receiptType);
  await db
    .update(purchaseInvoices)
    .set({ status: isCash ? "paid" : "confirmed", deliveryStatus } as any)
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

type ReversalLine = {
  invoiceItemId: number;
  itemId: number;
  itemName: string;
  quantity: string;
  warehouseId: number;
  batchId: number | null;
  splits: { batchId: number | null; quantity: string }[];
};

/** يتأكد إن كل أسطر الفاتورة ممكن تتراجع من غير ما ترجع بالمخزون تحت الصفر — قبل ما نغيّر أي حاجة فعليًا */
async function assertReversalStockAvailable(
  db: Db,
  tenantId: number,
  lines: ReversalLine[],
  invoiceDate: string,
) {
  /** رسالة موجِّهة بأسماء المستندات اللاحقة اللي صرفت الصنف — وإلا نص عام */
  const shortageError = async (itemId: number, generic: string) => {
    const docs = await findDownstreamStockConsumers(db, tenantId, { itemId, afterDate: invoiceDate });
    return new Error(docs.length ? downstreamMessage(generic, docs) : generic);
  };
  for (const line of lines) {
    const rows = line.splits.length ? line.splits : [{ batchId: line.batchId, quantity: line.quantity }];
    for (const s of rows) {
      const [wh] = await db.select({ quantity: itemWarehouseStock.quantity }).from(itemWarehouseStock)
        .where(tenantWhere(itemWarehouseStock, tenantId, and(
          eq(itemWarehouseStock.itemId, line.itemId), eq(itemWarehouseStock.warehouseId, line.warehouseId),
        )));
      if (Number(wh?.quantity ?? 0) < Number(s.quantity) - 0.0001) {
        throw await shortageError(line.itemId, `لا يمكن فك الاعتماد: جزء من مخزون «${line.itemName}» تم استخدامه بالفعل في هذا المخزن`);
      }
      if (s.batchId) {
        const [b] = await db.select({ quantity: itemBatches.quantity }).from(itemBatches)
          .where(tenantWhere(itemBatches, tenantId, eq(itemBatches.id, s.batchId)));
        if (Number(b?.quantity ?? 0) < Number(s.quantity) - 0.0001) {
          throw await shortageError(line.itemId, `لا يمكن فك الاعتماد: تشغيلة «${line.itemName}» تم استخدام جزء منها بالفعل`);
        }
      }
    }
  }
}

/** فك اعتماد فاتورة شراء: يعكس حركة المخزون والقيود ورصيد المورد، ويرجّعها مسودة قابلة للتعديل */
export async function unapprovePurchaseInvoice(db: Db, tenantId: number, invoiceId: number) {
  const [inv] = await db.select().from(purchaseInvoices)
    .where(tenantWhere(purchaseInvoices, tenantId, eq(purchaseInvoices.id, invoiceId)));
  if (!inv) throw new Error("الفاتورة غير موجودة");
  if (!["paid", "confirmed", "partial"].includes(inv.status as string)) {
    throw new Error("الفاتورة ليست معتمدة أصلاً");
  }
  const payment = await findSeparateInvoiceCollection(db, tenantId, inv.number, ["pay_supplier"], ["withdraw_supplier"]);
  if (payment) {
    const place = payment.kind === "cash" ? "معاملات نقدية → صرف لمورد" : "معاملات بنكية → صرف لمورد";
    throw new Error(`تم تسجيل سداد ${payment.number} على هذه الفاتورة — راجعه أولاً من ${place} قبل فك الاعتماد`);
  }
  const [ret] = await db.select({ id: purchaseReturns.id, number: purchaseReturns.number }).from(purchaseReturns)
    .where(tenantWhere(purchaseReturns, tenantId, eq(purchaseReturns.invoiceId, invoiceId))).limit(1);
  if (ret) throw new Error(`توجد فاتورة مردود شراء ${ret.number} مرتبطة بهذه الفاتورة — ألغِ اعتمادها أولاً`);
  await assertDateNotInClosedPeriod(db, tenantId, toDateStr(inv.date));

  const rawLines = await db.select().from(purchaseInvoiceItems)
    .where(tenantWhere(purchaseInvoiceItems, tenantId, eq(purchaseInvoiceItems.invoiceId, invoiceId)));
  const lines: ReversalLine[] = [];
  for (const l of rawLines) {
    const [item] = await db.select({ name: items.name, itemType: items.itemType }).from(items).where(tenantWhere(items, tenantId, eq(items.id, l.itemId)));
    if (!itemAffectsWarehouseStock(item?.itemType)) continue;
    const warehouseId = requireInvoiceLineWarehouse(l.warehouseId, inv.warehouseId, item?.name);
    const splitRows = await db.select().from(purchaseInvoiceItemBatches)
      .where(tenantWhere(purchaseInvoiceItemBatches, tenantId, eq(purchaseInvoiceItemBatches.invoiceItemId, l.id)));
    lines.push({
      invoiceItemId: l.id, itemId: l.itemId, itemName: item?.name || `#${l.itemId}`,
      quantity: l.quantity, warehouseId, batchId: l.batchId,
      splits: splitRows.map((s) => ({ batchId: s.batchId, quantity: s.quantity })),
    });
  }

  await assertReversalStockAvailable(db, tenantId, lines, toDateStr(inv.date));

  for (const line of lines) {
    if (line.splits.length) {
      for (const s of line.splits) {
        await applyStockMovement(db, tenantId, { itemId: line.itemId, quantity: s.quantity, direction: "out", warehouseId: line.warehouseId, batchId: s.batchId });
      }
    } else {
      await applyStockMovement(db, tenantId, { itemId: line.itemId, quantity: line.quantity, direction: "out", warehouseId: line.warehouseId, batchId: line.batchId });
    }
  }

  await db.update(purchaseInvoices)
    .set({ status: "draft", paid: "0", remaining: inv.total } as any)
    .where(tenantWhere(purchaseInvoices, tenantId, eq(purchaseInvoices.id, invoiceId)));

  for (const itemId of new Set(lines.map((l) => l.itemId))) {
    // computeWeightedAverageCost بيرجّع averageCost المخزّن زي ما هو لو مش صفر (كاش) — لازم نصفّره
    // الأول عشان recalculateItemAverageCost يعيد حسابه فعليًا من فواتير الشراء المتبقية بعد الاستبعاد
    await db.update(items).set({ averageCost: "0" } as any).where(tenantWhere(items, tenantId, eq(items.id, itemId)));
    await recalculateItemAverageCost(db, tenantId, itemId);
  }

  await cancelPostedJournalByReference(db, tenantId, inv.number);
  await recalculateSupplierBalance(db, tenantId, inv.supplierId);

  return { success: true as const };
}

/** فك اعتماد فاتورة بيع: نفس منطق فك اعتماد الشراء بس بعكس اتجاه حركة المخزون وقيدين (المبيعات + تكلفة البضاعة) */
export async function unapproveSalesInvoice(db: Db, tenantId: number, invoiceId: number) {
  const [inv] = await db.select().from(salesInvoices)
    .where(tenantWhere(salesInvoices, tenantId, eq(salesInvoices.id, invoiceId)));
  if (!inv) throw new Error("الفاتورة غير موجودة");
  if (!["paid", "confirmed", "partial"].includes(inv.status as string)) {
    throw new Error("الفاتورة ليست معتمدة أصلاً");
  }
  const collection = await findSeparateInvoiceCollection(db, tenantId, inv.number, ["receive_customer"], ["deposit_customer"]);
  if (collection) {
    const place = collection.kind === "cash" ? "معاملات نقدية → تحصيل من عميل" : "معاملات بنكية → تحصيل من عميل";
    throw new Error(`تم تسجيل تحصيل ${collection.number} على هذه الفاتورة — راجعه أولاً من ${place} قبل فك الاعتماد`);
  }
  const [ret] = await db.select({ id: salesReturns.id, number: salesReturns.number }).from(salesReturns)
    .where(tenantWhere(salesReturns, tenantId, eq(salesReturns.invoiceId, invoiceId))).limit(1);
  if (ret) throw new Error(`توجد فاتورة مردود بيع ${ret.number} مرتبطة بهذه الفاتورة — ألغِ اعتمادها أولاً`);
  await assertDateNotInClosedPeriod(db, tenantId, toDateStr(inv.date));

  const rawLines = await db.select().from(salesInvoiceItems)
    .where(tenantWhere(salesInvoiceItems, tenantId, eq(salesInvoiceItems.invoiceId, invoiceId)));
  const lines: ReversalLine[] = [];
  for (const l of rawLines) {
    const [item] = await db.select({ name: items.name, itemType: items.itemType }).from(items).where(tenantWhere(items, tenantId, eq(items.id, l.itemId)));
    if (!itemAffectsWarehouseStock(item?.itemType)) continue;
    const warehouseId = requireInvoiceLineWarehouse(l.warehouseId, inv.warehouseId, item?.name);
    const splitRows = await db.select().from(salesInvoiceItemBatches)
      .where(tenantWhere(salesInvoiceItemBatches, tenantId, eq(salesInvoiceItemBatches.invoiceItemId, l.id)));
    lines.push({
      invoiceItemId: l.id, itemId: l.itemId, itemName: item?.name || `#${l.itemId}`,
      quantity: l.quantity, warehouseId, batchId: l.batchId,
      splits: splitRows.map((s) => ({ batchId: s.batchId, quantity: s.quantity })),
    });
  }

  // بيع فك اعتماده معناه رجوع البضاعة للمخزون — مفيش حد أقصى يمنع ده (عكس الشراء اللي بيقلل رصيد فعلي محدود)
  for (const line of lines) {
    if (line.splits.length) {
      for (const s of line.splits) {
        await applyStockMovement(db, tenantId, { itemId: line.itemId, quantity: s.quantity, direction: "in", warehouseId: line.warehouseId, batchId: s.batchId });
      }
    } else {
      await applyStockMovement(db, tenantId, { itemId: line.itemId, quantity: line.quantity, direction: "in", warehouseId: line.warehouseId, batchId: line.batchId });
    }
  }

  await db.update(salesInvoices)
    .set({ status: "draft", paid: "0", remaining: inv.total } as any)
    .where(tenantWhere(salesInvoices, tenantId, eq(salesInvoices.id, invoiceId)));

  await cancelPostedJournalByReference(db, tenantId, inv.number);
  await cancelPostedJournalByReference(db, tenantId, `${inv.number}-COGS`);
  await recalculateCustomerBalance(db, tenantId, inv.customerId);

  return { success: true as const };
}
