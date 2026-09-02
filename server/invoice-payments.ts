import { count, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Db } from "./db";
import {
  bankTransactions,
  cashTransactions,
  customers,
  purchaseInvoices,
  salesInvoices,
  suppliers,
} from "../drizzle/schema";
import { postBankTransactionJournal, postCashTransactionJournal } from "./auto-journal";
import { recalculateCustomerBalance, recalculateSupplierBalance } from "./contact-balances";
import { assertDateNotInClosedPeriod } from "./fiscal-period-guard";
import { tenantWhere, withTenantId } from "./tenant-scope";

async function nextCashNumber(db: Db, tenantId: number) {
  const [countResult] = await db
    .select({ count: count() })
    .from(cashTransactions)
    .where(tenantWhere(cashTransactions, tenantId));
  return `CT-${String(countResult.count + 1).padStart(5, "0")}`;
}

async function nextBankNumber(db: Db, tenantId: number) {
  const [countResult] = await db
    .select({ count: count() })
    .from(bankTransactions)
    .where(tenantWhere(bankTransactions, tenantId));
  return `BT-${String(countResult.count + 1).padStart(5, "0")}`;
}

/** يقبل إما amount واحد (نقدي بالكامل — التوافق مع الشاشات القديمة) أو تقسيم نقدي/بنكي صريح */
type PaymentOpts = {
  invoiceId: number;
  amount: string;
  date: string;
  description?: string;
  cashAmount?: string;
  bankAmount?: string;
  bankAccountId?: number;
};

export async function recordSalesInvoicePayment(
  db: Db,
  tenantId: number,
  userId: number,
  opts: PaymentOpts,
) {
  await assertDateNotInClosedPeriod(db, tenantId, opts.date);

  const [inv] = await db
    .select()
    .from(salesInvoices)
    .where(tenantWhere(salesInvoices, tenantId, eq(salesInvoices.id, opts.invoiceId)));
  if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير موجودة" });

  const remaining = parseFloat(inv.remaining || "0");
  const payAmount = parseFloat(opts.amount);
  const cashPortion = opts.cashAmount !== undefined ? parseFloat(opts.cashAmount || "0") : payAmount;
  const bankPortion = opts.bankAmount !== undefined ? parseFloat(opts.bankAmount || "0") : 0;
  if (payAmount <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "المبلغ يجب أن يكون أكبر من صفر" });
  }
  if (Math.abs(cashPortion + bankPortion - payAmount) > 0.01) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "مجموع النقدي والبنكي لازم يساوي إجمالي المبلغ" });
  }
  if (bankPortion > 0 && !opts.bankAccountId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "يجب اختيار حساب البنك للجزء البنكي من السداد" });
  }
  if (payAmount > remaining + 0.001) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "المبلغ أكبر من المتبقي على الفاتورة" });
  }

  const [customer] = await db
    .select({ name: customers.name })
    .from(customers)
    .where(tenantWhere(customers, tenantId, eq(customers.id, inv.customerId)));

  let cashNumber = "";
  if (cashPortion > 0) {
    const number = await nextCashNumber(db, tenantId);
    cashNumber = number;
    const description = opts.description || `تحصيل فاتورة ${inv.number}`;
    await db.insert(cashTransactions).values(
      withTenantId(tenantId, {
        number, type: "receive_customer", date: opts.date, customerId: inv.customerId,
        amount: String(cashPortion), description, reference: inv.number, createdBy: userId,
      }) as any,
    );
    await postCashTransactionJournal(db, tenantId, userId, {
      number, type: "receive_customer", date: opts.date, amount: String(cashPortion), description, customerName: customer?.name,
    });
  }
  if (bankPortion > 0) {
    const number = await nextBankNumber(db, tenantId);
    if (!cashNumber) cashNumber = number;
    const description = opts.description || `تحصيل بنكي لفاتورة ${inv.number}`;
    await db.insert(bankTransactions).values(
      withTenantId(tenantId, {
        number, type: "deposit_customer", bankAccountId: opts.bankAccountId, date: opts.date,
        customerId: inv.customerId, amount: String(bankPortion), description, reference: inv.number, createdBy: userId,
      }) as any,
    );
    await postBankTransactionJournal(db, tenantId, userId, {
      number, type: "deposit_customer", date: opts.date, amount: String(bankPortion), description,
      customerName: customer?.name, bankAccountId: opts.bankAccountId,
    });
  }

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

  return { success: true, cashNumber, status: newStatus, remaining: String(newRemaining) };
}

export async function recordPurchaseInvoicePayment(
  db: Db,
  tenantId: number,
  userId: number,
  opts: PaymentOpts,
) {
  await assertDateNotInClosedPeriod(db, tenantId, opts.date);

  const [inv] = await db
    .select()
    .from(purchaseInvoices)
    .where(tenantWhere(purchaseInvoices, tenantId, eq(purchaseInvoices.id, opts.invoiceId)));
  if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "الفاتورة غير موجودة" });

  const remaining = parseFloat(inv.remaining || "0");
  const payAmount = parseFloat(opts.amount);
  const cashPortion = opts.cashAmount !== undefined ? parseFloat(opts.cashAmount || "0") : payAmount;
  const bankPortion = opts.bankAmount !== undefined ? parseFloat(opts.bankAmount || "0") : 0;
  if (payAmount <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "المبلغ يجب أن يكون أكبر من صفر" });
  }
  if (Math.abs(cashPortion + bankPortion - payAmount) > 0.01) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "مجموع النقدي والبنكي لازم يساوي إجمالي المبلغ" });
  }
  if (bankPortion > 0 && !opts.bankAccountId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "يجب اختيار حساب البنك للجزء البنكي من السداد" });
  }
  if (payAmount > remaining + 0.001) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "المبلغ أكبر من المتبقي على الفاتورة" });
  }

  const [supplier] = await db
    .select({ name: suppliers.name })
    .from(suppliers)
    .where(tenantWhere(suppliers, tenantId, eq(suppliers.id, inv.supplierId)));

  let cashNumber = "";
  if (cashPortion > 0) {
    const number = await nextCashNumber(db, tenantId);
    cashNumber = number;
    const description = opts.description || `سداد فاتورة ${inv.number}`;
    await db.insert(cashTransactions).values(
      withTenantId(tenantId, {
        number, type: "pay_supplier", date: opts.date, supplierId: inv.supplierId,
        amount: String(cashPortion), description, reference: inv.number, createdBy: userId,
      }) as any,
    );
    await postCashTransactionJournal(db, tenantId, userId, {
      number, type: "pay_supplier", date: opts.date, amount: String(cashPortion), description, supplierName: supplier?.name,
    });
  }
  if (bankPortion > 0) {
    const number = await nextBankNumber(db, tenantId);
    if (!cashNumber) cashNumber = number;
    const description = opts.description || `سداد بنكي لفاتورة ${inv.number}`;
    await db.insert(bankTransactions).values(
      withTenantId(tenantId, {
        number, type: "withdraw_supplier", bankAccountId: opts.bankAccountId, date: opts.date,
        supplierId: inv.supplierId, amount: String(bankPortion), description, reference: inv.number, createdBy: userId,
      }) as any,
    );
    await postBankTransactionJournal(db, tenantId, userId, {
      number, type: "withdraw_supplier", date: opts.date, amount: String(bankPortion), description,
      supplierName: supplier?.name, bankAccountId: opts.bankAccountId,
    });
  }

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

  return { success: true, cashNumber, status: newStatus, remaining: String(newRemaining) };
}
