import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Db } from "./db";
import {
  bankTransactionAllocations,
  bankTransactions,
  cashTransactionAllocations,
  cashTransactions,
  customers,
  purchaseInvoices,
  salesInvoices,
  suppliers,
} from "../drizzle/schema";
import {
  cancelPostedJournalByReference,
  postBankTransactionJournal,
  postCashTransactionJournal,
} from "./auto-journal";
import { allocateCustomerPaymentFifo, allocateSupplierPaymentFifo } from "./payment-allocation";
import { recalculateCustomerBalance, recalculateSupplierBalance } from "./contact-balances";
import { assertDateNotInClosedPeriod } from "./fiscal-period-guard";
import { tenantWhere, withTenantId } from "./tenant-scope";

/** drizzle/mysql2 يرجّع أعمدة date() ككائن Date حقيقي — String(x).slice(0,10) بيفقد السنة */
function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v || "").slice(0, 10);
}

/**
 * اعتماد حركة نقدية — ميجا: حفظ=مسودة بلا قيد، اعتماد=قيد مرحّل + توزيع FIFO على الفواتير المفتوحة.
 */
export async function finalizeCashTransaction(
  db: Db,
  tenantId: number,
  userId: number | undefined,
  id: number,
) {
  const [tx] = await db.select().from(cashTransactions)
    .where(tenantWhere(cashTransactions, tenantId, eq(cashTransactions.id, id)));
  if (!tx) throw new TRPCError({ code: "NOT_FOUND", message: "الحركة النقدية غير موجودة" });
  if (tx.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "الحركة معتمدة مسبقاً" });

  const actionDate = toDateStr(tx.date);
  await assertDateNotInClosedPeriod(db, tenantId, actionDate);

  let customerName: string | undefined;
  let supplierName: string | undefined;
  if (tx.customerId) {
    const [c] = await db.select({ name: customers.name }).from(customers)
      .where(tenantWhere(customers, tenantId, eq(customers.id, tx.customerId)));
    customerName = c?.name;
  }
  if (tx.supplierId) {
    const [s] = await db.select({ name: suppliers.name }).from(suppliers)
      .where(tenantWhere(suppliers, tenantId, eq(suppliers.id, tx.supplierId)));
    supplierName = s?.name;
  }

  await postCashTransactionJournal(db, tenantId, userId, {
    number: tx.number,
    type: tx.type as "receive" | "pay" | "receive_customer" | "pay_supplier" | "pay_customer",
    date: actionDate,
    amount: String(tx.amount),
    description: tx.description || undefined,
    customerName,
    supplierName,
  });

  let allocations: { invoiceId: number; invoiceNumber: string; amount: string }[] | undefined;
  let unallocated: string | undefined;
  let documentType: "sales_invoice" | "purchase_invoice" | undefined;

  if (tx.type === "receive_customer" && tx.customerId) {
    documentType = "sales_invoice";
    const result = await allocateCustomerPaymentFifo(db, tenantId, tx.customerId, String(tx.amount), {
      referenceInvoiceNumber: tx.reference || undefined,
    });
    allocations = result.allocations;
    unallocated = result.unallocated;
  } else if (tx.type === "pay_supplier" && tx.supplierId) {
    documentType = "purchase_invoice";
    const result = await allocateSupplierPaymentFifo(db, tenantId, tx.supplierId, String(tx.amount), {
      referenceInvoiceNumber: tx.reference || undefined,
    });
    allocations = result.allocations;
    unallocated = result.unallocated;
  }

  // سجل التوزيع ده هو الوحيد اللي بيعرفنا لاحقاً أي فاتورة اتأثرت بالحركة دي، عشان فك الاعتماد
  if (documentType && allocations?.length) {
    for (const a of allocations) {
      await db.insert(cashTransactionAllocations).values(
        withTenantId(tenantId, {
          transactionId: id,
          documentType,
          documentId: a.invoiceId,
          invoiceNumber: a.invoiceNumber,
          amount: a.amount,
        }) as any,
      );
    }
  }

  await db.update(cashTransactions).set({ status: "confirmed" } as any)
    .where(tenantWhere(cashTransactions, tenantId, eq(cashTransactions.id, id)));

  return { success: true as const, allocations, unallocated };
}

/**
 * فك اعتماد حركة نقدية — عكس توزيع الدفعة (FIFO) وإلغاء القيد المرحّل وإرجاع الحركة لمسودة.
 */
export async function unfinalizeCashTransaction(db: Db, tenantId: number, id: number) {
  const [tx] = await db.select().from(cashTransactions)
    .where(tenantWhere(cashTransactions, tenantId, eq(cashTransactions.id, id)));
  if (!tx) throw new TRPCError({ code: "NOT_FOUND", message: "الحركة النقدية غير موجودة" });
  if (tx.status !== "confirmed") throw new TRPCError({ code: "BAD_REQUEST", message: "الحركة ليست معتمدة" });

  await assertDateNotInClosedPeriod(db, tenantId, toDateStr(tx.date));

  const allocRows = await db.select().from(cashTransactionAllocations)
    .where(tenantWhere(cashTransactionAllocations, tenantId, eq(cashTransactionAllocations.transactionId, id)));

  await reverseAllocationRows(db, tenantId, allocRows);

  await db.delete(cashTransactionAllocations)
    .where(tenantWhere(cashTransactionAllocations, tenantId, eq(cashTransactionAllocations.transactionId, id)));

  if (tx.customerId) await recalculateCustomerBalance(db, tenantId, tx.customerId);
  if (tx.supplierId) await recalculateSupplierBalance(db, tenantId, tx.supplierId);

  await cancelPostedJournalByReference(db, tenantId, tx.number);

  await db.update(cashTransactions).set({ status: "draft" } as any)
    .where(tenantWhere(cashTransactions, tenantId, eq(cashTransactions.id, id)));

  return { success: true as const };
}

/**
 * اعتماد حركة بنكية — نفس نمط الحركة النقدية بس على حساب بنكي.
 */
export async function finalizeBankTransaction(
  db: Db,
  tenantId: number,
  userId: number | undefined,
  id: number,
) {
  const [tx] = await db.select().from(bankTransactions)
    .where(tenantWhere(bankTransactions, tenantId, eq(bankTransactions.id, id)));
  if (!tx) throw new TRPCError({ code: "NOT_FOUND", message: "الحركة البنكية غير موجودة" });
  if (tx.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "الحركة معتمدة مسبقاً" });

  const actionDate = toDateStr(tx.date);
  await assertDateNotInClosedPeriod(db, tenantId, actionDate);

  let customerName: string | undefined;
  let supplierName: string | undefined;
  if (tx.customerId) {
    const [c] = await db.select({ name: customers.name }).from(customers)
      .where(tenantWhere(customers, tenantId, eq(customers.id, tx.customerId)));
    customerName = c?.name;
  }
  if (tx.supplierId) {
    const [s] = await db.select({ name: suppliers.name }).from(suppliers)
      .where(tenantWhere(suppliers, tenantId, eq(suppliers.id, tx.supplierId)));
    supplierName = s?.name;
  }

  await postBankTransactionJournal(db, tenantId, userId, {
    number: tx.number,
    type: tx.type as "deposit" | "withdraw" | "deposit_customer" | "withdraw_supplier" | "withdraw_customer",
    date: actionDate,
    amount: String(tx.amount),
    description: tx.description || undefined,
    customerName,
    supplierName,
    bankAccountId: tx.bankAccountId,
  });

  let allocations: { invoiceId: number; invoiceNumber: string; amount: string }[] | undefined;
  let unallocated: string | undefined;
  let documentType: "sales_invoice" | "purchase_invoice" | undefined;

  if (tx.type === "deposit_customer" && tx.customerId) {
    documentType = "sales_invoice";
    const result = await allocateCustomerPaymentFifo(db, tenantId, tx.customerId, String(tx.amount), {
      referenceInvoiceNumber: tx.reference || undefined,
    });
    allocations = result.allocations;
    unallocated = result.unallocated;
  } else if (tx.type === "withdraw_supplier" && tx.supplierId) {
    documentType = "purchase_invoice";
    const result = await allocateSupplierPaymentFifo(db, tenantId, tx.supplierId, String(tx.amount), {
      referenceInvoiceNumber: tx.reference || undefined,
    });
    allocations = result.allocations;
    unallocated = result.unallocated;
  }

  if (documentType && allocations?.length) {
    for (const a of allocations) {
      await db.insert(bankTransactionAllocations).values(
        withTenantId(tenantId, {
          transactionId: id,
          documentType,
          documentId: a.invoiceId,
          invoiceNumber: a.invoiceNumber,
          amount: a.amount,
        }) as any,
      );
    }
  }

  await db.update(bankTransactions).set({ status: "confirmed" } as any)
    .where(tenantWhere(bankTransactions, tenantId, eq(bankTransactions.id, id)));

  return { success: true as const, allocations, unallocated };
}

/**
 * فك اعتماد حركة بنكية — عكس توزيع الدفعة وإلغاء القيد وإرجاعها لمسودة.
 */
export async function unfinalizeBankTransaction(db: Db, tenantId: number, id: number) {
  const [tx] = await db.select().from(bankTransactions)
    .where(tenantWhere(bankTransactions, tenantId, eq(bankTransactions.id, id)));
  if (!tx) throw new TRPCError({ code: "NOT_FOUND", message: "الحركة البنكية غير موجودة" });
  if (tx.status !== "confirmed") throw new TRPCError({ code: "BAD_REQUEST", message: "الحركة ليست معتمدة" });

  await assertDateNotInClosedPeriod(db, tenantId, toDateStr(tx.date));

  const allocRows = await db.select().from(bankTransactionAllocations)
    .where(tenantWhere(bankTransactionAllocations, tenantId, eq(bankTransactionAllocations.transactionId, id)));

  await reverseAllocationRows(db, tenantId, allocRows);

  await db.delete(bankTransactionAllocations)
    .where(tenantWhere(bankTransactionAllocations, tenantId, eq(bankTransactionAllocations.transactionId, id)));

  if (tx.customerId) await recalculateCustomerBalance(db, tenantId, tx.customerId);
  if (tx.supplierId) await recalculateSupplierBalance(db, tenantId, tx.supplierId);

  await cancelPostedJournalByReference(db, tenantId, tx.number);

  await db.update(bankTransactions).set({ status: "draft" } as any)
    .where(tenantWhere(bankTransactions, tenantId, eq(bankTransactions.id, id)));

  return { success: true as const };
}

/** عكس أثر مجموعة سجلات توزيع (FIFO) على الفواتير المرتبطة — مشترك بين النقدية والبنك */
async function reverseAllocationRows(
  db: Db,
  tenantId: number,
  allocRows: { documentType: "sales_invoice" | "purchase_invoice"; documentId: number; invoiceNumber: string; amount: string }[],
) {
  // تحقق مبدئي قبل أي تعديل: كل فاتورة اتأثرت لازم تكون لسه في حالة يمكن الرجوع فيها بأمان
  for (const row of allocRows) {
    if (row.documentType === "sales_invoice") {
      const [inv] = await db.select({ status: salesInvoices.status })
        .from(salesInvoices)
        .where(tenantWhere(salesInvoices, tenantId, eq(salesInvoices.id, row.documentId)));
      if (!inv || inv.status === "draft" || inv.status === "cancelled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `لا يمكن فك الاعتماد: الفاتورة ${row.invoiceNumber} تغيّرت حالتها بعد هذه الحركة — راجعها يدوياً أولاً`,
        });
      }
    } else {
      const [inv] = await db.select({ status: purchaseInvoices.status })
        .from(purchaseInvoices)
        .where(tenantWhere(purchaseInvoices, tenantId, eq(purchaseInvoices.id, row.documentId)));
      if (!inv || inv.status === "draft" || inv.status === "cancelled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `لا يمكن فك الاعتماد: الفاتورة ${row.invoiceNumber} تغيّرت حالتها بعد هذه الحركة — راجعها يدوياً أولاً`,
        });
      }
    }
  }

  for (const row of allocRows) {
    const amount = parseFloat(row.amount);
    if (row.documentType === "sales_invoice") {
      const [inv] = await db.select().from(salesInvoices)
        .where(tenantWhere(salesInvoices, tenantId, eq(salesInvoices.id, row.documentId)));
      if (!inv) continue;
      const newPaid = Math.max(0, parseFloat(inv.paid || "0") - amount);
      const newRemaining = Math.min(parseFloat(inv.total || "0"), parseFloat(inv.remaining || "0") + amount);
      const newStatus = newRemaining >= parseFloat(inv.total || "0") - 0.001 ? "confirmed" : "partial";
      await db.update(salesInvoices)
        .set({ paid: String(newPaid), remaining: String(newRemaining), status: newStatus })
        .where(tenantWhere(salesInvoices, tenantId, eq(salesInvoices.id, inv.id)));
    } else {
      const [inv] = await db.select().from(purchaseInvoices)
        .where(tenantWhere(purchaseInvoices, tenantId, eq(purchaseInvoices.id, row.documentId)));
      if (!inv) continue;
      const newPaid = Math.max(0, parseFloat(inv.paid || "0") - amount);
      const newRemaining = Math.min(parseFloat(inv.total || "0"), parseFloat(inv.remaining || "0") + amount);
      const newStatus = newRemaining >= parseFloat(inv.total || "0") - 0.001 ? "confirmed" : "partial";
      await db.update(purchaseInvoices)
        .set({ paid: String(newPaid), remaining: String(newRemaining), status: newStatus })
        .where(tenantWhere(purchaseInvoices, tenantId, eq(purchaseInvoices.id, inv.id)));
    }
  }
}
