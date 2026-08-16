import { count, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { MySql2Database } from "drizzle-orm/mysql2";
import {
  cashTransactions,
  customers,
  purchaseInvoices,
  salesInvoices,
  suppliers,
} from "../drizzle/schema";
import { postCashTransactionJournal } from "./auto-journal";
import { recalculateCustomerBalance, recalculateSupplierBalance } from "./contact-balances";
import { assertDateNotInClosedPeriod } from "./fiscal-period-guard";
import { tenantWhere, withTenantId } from "./tenant-scope";

async function nextCashNumber(db: MySql2Database, tenantId: number) {
  const [countResult] = await db
    .select({ count: count() })
    .from(cashTransactions)
    .where(tenantWhere(cashTransactions, tenantId));
  return `CT-${String(countResult.count + 1).padStart(5, "0")}`;
}

export async function recordSalesInvoicePayment(
  db: MySql2Database,
  tenantId: number,
  userId: number,
  opts: { invoiceId: number; amount: string; date: string; description?: string },
) {
  await assertDateNotInClosedPeriod(db, tenantId, opts.date);

  const [inv] = await db
    .select()
    .from(salesInvoices)
    .where(tenantWhere(salesInvoices, tenantId, eq(salesInvoices.id, opts.invoiceId)));
  if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير موجودة" });

  const remaining = parseFloat(inv.remaining || "0");
  const payAmount = parseFloat(opts.amount);
  if (payAmount <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "المبلغ يجب أن يكون أكبر من صفر" });
  }
  if (payAmount > remaining + 0.001) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "المبلغ أكبر من المتبقي على الفاتورة" });
  }

  const number = await nextCashNumber(db, tenantId);
  const description = opts.description || `تحصيل فاتورة ${inv.number}`;

  await db.insert(cashTransactions).values(
    withTenantId(tenantId, {
      number,
      type: "receive_customer",
      date: opts.date,
      customerId: inv.customerId,
      amount: opts.amount,
      description,
      reference: inv.number,
      createdBy: userId,
    }) as any,
  );

  const [customer] = await db
    .select({ name: customers.name })
    .from(customers)
    .where(tenantWhere(customers, tenantId, eq(customers.id, inv.customerId)));

  await postCashTransactionJournal(db, tenantId, userId, {
    number,
    type: "receive_customer",
    date: opts.date,
    amount: opts.amount,
    description,
    customerName: customer?.name,
  });

  const newPaid = parseFloat(inv.paid || "0") + payAmount;
  const newRemaining = Math.max(0, remaining - payAmount);
  const newStatus = newRemaining <= 0.001 ? "paid" : "partial";

  await db
    .update(salesInvoices)
    .set({
      paid: String(newPaid),
      remaining: String(newRemaining),
      status: newStatus,
    })
    .where(tenantWhere(salesInvoices, tenantId, eq(salesInvoices.id, opts.invoiceId)));

  await recalculateCustomerBalance(db, tenantId, inv.customerId);

  return { success: true, cashNumber: number, status: newStatus, remaining: String(newRemaining) };
}

export async function recordPurchaseInvoicePayment(
  db: MySql2Database,
  tenantId: number,
  userId: number,
  opts: { invoiceId: number; amount: string; date: string; description?: string },
) {
  await assertDateNotInClosedPeriod(db, tenantId, opts.date);

  const [inv] = await db
    .select()
    .from(purchaseInvoices)
    .where(tenantWhere(purchaseInvoices, tenantId, eq(purchaseInvoices.id, opts.invoiceId)));
  if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير موجودة" });

  const remaining = parseFloat(inv.remaining || "0");
  const payAmount = parseFloat(opts.amount);
  if (payAmount <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "المبلغ يجب أن يكون أكبر من صفر" });
  }
  if (payAmount > remaining + 0.001) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "المبلغ أكبر من المتبقي على الفاتورة" });
  }

  const number = await nextCashNumber(db, tenantId);
  const description = opts.description || `سداد فاتورة ${inv.number}`;

  await db.insert(cashTransactions).values(
    withTenantId(tenantId, {
      number,
      type: "pay_supplier",
      date: opts.date,
      supplierId: inv.supplierId,
      amount: opts.amount,
      description,
      reference: inv.number,
      createdBy: userId,
    }) as any,
  );

  const [supplier] = await db
    .select({ name: suppliers.name })
    .from(suppliers)
    .where(tenantWhere(suppliers, tenantId, eq(suppliers.id, inv.supplierId)));

  await postCashTransactionJournal(db, tenantId, userId, {
    number,
    type: "pay_supplier",
    date: opts.date,
    amount: opts.amount,
    description,
    supplierName: supplier?.name,
  });

  const newPaid = parseFloat(inv.paid || "0") + payAmount;
  const newRemaining = Math.max(0, remaining - payAmount);
  const newStatus = newRemaining <= 0.001 ? "paid" : "partial";

  await db
    .update(purchaseInvoices)
    .set({
      paid: String(newPaid),
      remaining: String(newRemaining),
      status: newStatus,
    })
    .where(tenantWhere(purchaseInvoices, tenantId, eq(purchaseInvoices.id, opts.invoiceId)));

  await recalculateSupplierBalance(db, tenantId, inv.supplierId);

  return { success: true, cashNumber: number, status: newStatus, remaining: String(newRemaining) };
}
