import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Db } from "./db";
import {
  checkPaymentAllocations,
  checks,
  customers,
  purchaseInvoices,
  salesInvoices,
  suppliers,
} from "../drizzle/schema";
import {
  cancelPostedJournalByReference,
  postCheckBounceJournal,
  postCheckClearJournal,
  postCheckReceiveJournal,
} from "./auto-journal";
import { recalculateCustomerBalance, recalculateSupplierBalance } from "./contact-balances";
import { assertDateNotInClosedPeriod } from "./fiscal-period-guard";
import { allocateCustomerPaymentFifo, allocateSupplierPaymentFifo } from "./payment-allocation";
import { tenantWhere, withTenantId } from "./tenant-scope";

/** drizzle/mysql2 يرجّع أعمدة date() ككائن Date حقيقي — String(x).slice(0,10) بيفقد السنة */
function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v || "").slice(0, 10);
}

export async function createCheckWithJournal(
  db: Db,
  tenantId: number,
  userId: number,
  input: {
    type: "incoming" | "outgoing";
    checkNumber: string;
    bankAccountId?: number;
    customerId?: number;
    supplierId?: number;
    amount: string;
    dueDate: string;
    date: string;
    description?: string;
    number: string;
  },
) {
  await assertDateNotInClosedPeriod(db, tenantId, input.date);

  if (input.type === "incoming" && !input.customerId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "يجب اختيار العميل للشيك الوارد" });
  }
  if (input.type === "outgoing" && !input.supplierId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "يجب اختيار المورد للشيك الصادر" });
  }

  let customerName: string | undefined;
  let supplierName: string | undefined;

  if (input.customerId) {
    const [c] = await db
      .select({ name: customers.name })
      .from(customers)
      .where(tenantWhere(customers, tenantId, eq(customers.id, input.customerId)));
    customerName = c?.name;
  }
  if (input.supplierId) {
    const [s] = await db
      .select({ name: suppliers.name })
      .from(suppliers)
      .where(tenantWhere(suppliers, tenantId, eq(suppliers.id, input.supplierId)));
    supplierName = s?.name;
  }

  const [insertResult] = await db.insert(checks).values(
    withTenantId(tenantId, {
      number: input.number,
      checkNumber: input.checkNumber,
      type: input.type,
      bankAccountId: input.bankAccountId,
      customerId: input.customerId,
      supplierId: input.supplierId,
      amount: input.amount,
      dueDate: input.dueDate as any,
      date: input.date as any,
      status: "pending",
      description: input.description,
      createdBy: userId,
    }) as any,
  );

  await postCheckReceiveJournal(db, tenantId, userId, {
    number: input.number,
    type: input.type,
    date: input.date,
    amount: input.amount,
    description: input.description,
    customerName,
    supplierName,
  });

  if (input.type === "incoming") {
    const checkId = Number((insertResult as { insertId?: number })?.insertId);
    let resolvedId = checkId;
    if (!resolvedId) {
      const [row] = await db
        .select({ id: checks.id })
        .from(checks)
        .where(tenantWhere(checks, tenantId, eq(checks.number, input.number)))
        .orderBy(desc(checks.id))
        .limit(1);
      resolvedId = row?.id ?? 0;
    }
    if (resolvedId) {
      const { ensureCheckRouting } = await import("./check-routing");
      await ensureCheckRouting(db, tenantId, resolvedId, userId);
    }
  }

  return { success: true, number: input.number };
}

export async function clearCheck(
  db: Db,
  tenantId: number,
  userId: number,
  checkId: number,
  opts?: { date?: string },
) {
  const [chk] = await db
    .select()
    .from(checks)
    .where(tenantWhere(checks, tenantId, eq(checks.id, checkId)));
  if (!chk) throw new TRPCError({ code: "NOT_FOUND", message: "الشيك غير موجود" });
  if (chk.status !== "pending" && chk.status !== "deposited") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن تحصيل هذا الشيك في حالته الحالية" });
  }

  const actionDate = opts?.date || toDateStr(chk.date);
  await assertDateNotInClosedPeriod(db, tenantId, actionDate);

  let customerName: string | undefined;
  let supplierName: string | undefined;
  if (chk.customerId) {
    const [c] = await db
      .select({ name: customers.name })
      .from(customers)
      .where(tenantWhere(customers, tenantId, eq(customers.id, chk.customerId)));
    customerName = c?.name;
  }
  if (chk.supplierId) {
    const [s] = await db
      .select({ name: suppliers.name })
      .from(suppliers)
      .where(tenantWhere(suppliers, tenantId, eq(suppliers.id, chk.supplierId)));
    supplierName = s?.name;
  }

  await postCheckClearJournal(db, tenantId, userId, {
    number: chk.number,
    type: chk.type as "incoming" | "outgoing",
    date: actionDate,
    amount: String(chk.amount),
    description: chk.description || undefined,
    customerName,
    supplierName,
    fromDeposited: chk.status === "deposited",
    bankAccountId: chk.bankAccountId ?? undefined,
  });

  let allocations: { invoiceId: number; invoiceNumber: string; amount: string }[] | undefined;
  let unallocated: string | undefined;
  let documentType: "sales_invoice" | "purchase_invoice" | undefined;

  if (chk.type === "incoming" && chk.customerId) {
    documentType = "sales_invoice";
    const result = await allocateCustomerPaymentFifo(
      db,
      tenantId,
      chk.customerId,
      String(chk.amount),
      { referenceInvoiceNumber: chk.checkNumber },
    );
    allocations = result.allocations;
    unallocated = result.unallocated;
  } else if (chk.type === "outgoing" && chk.supplierId) {
    documentType = "purchase_invoice";
    const result = await allocateSupplierPaymentFifo(
      db,
      tenantId,
      chk.supplierId,
      String(chk.amount),
      { referenceInvoiceNumber: chk.checkNumber },
    );
    allocations = result.allocations;
    unallocated = result.unallocated;
  }

  // سجل التوزيع ده هو الوحيد اللي بيعرفنا لاحقاً أي فاتورة اتأثرت بتحصيل الشيك ده، عشان فك الاعتماد
  if (documentType && allocations?.length) {
    for (const a of allocations) {
      await db.insert(checkPaymentAllocations).values(
        withTenantId(tenantId, {
          checkId,
          documentType,
          documentId: a.invoiceId,
          invoiceNumber: a.invoiceNumber,
          amount: a.amount,
        }) as any,
      );
    }
  }

  await db
    .update(checks)
    .set({ status: "cleared", statusBeforeClear: chk.status as "pending" | "deposited" })
    .where(tenantWhere(checks, tenantId, eq(checks.id, checkId)));

  if (chk.type === "incoming") {
    const { syncRoutingAfterClearOrBounce } = await import("./check-routing");
    await syncRoutingAfterClearOrBounce(db, tenantId, checkId, "cleared", userId);
  }

  return { success: true, allocations, unallocated };
}

export async function bounceCheck(
  db: Db,
  tenantId: number,
  userId: number,
  checkId: number,
  opts?: { date?: string },
) {
  const [chk] = await db
    .select()
    .from(checks)
    .where(tenantWhere(checks, tenantId, eq(checks.id, checkId)));
  if (!chk) throw new TRPCError({ code: "NOT_FOUND", message: "الشيك غير موجود" });
  if (chk.status === "cleared" || chk.status === "cancelled") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن إرجاع هذا الشيك" });
  }

  const actionDate = opts?.date || new Date().toISOString().slice(0, 10);
  await assertDateNotInClosedPeriod(db, tenantId, actionDate);

  let customerName: string | undefined;
  let supplierName: string | undefined;
  if (chk.customerId) {
    const [c] = await db
      .select({ name: customers.name })
      .from(customers)
      .where(tenantWhere(customers, tenantId, eq(customers.id, chk.customerId)));
    customerName = c?.name;
  }
  if (chk.supplierId) {
    const [s] = await db
      .select({ name: suppliers.name })
      .from(suppliers)
      .where(tenantWhere(suppliers, tenantId, eq(suppliers.id, chk.supplierId)));
    supplierName = s?.name;
  }

  await postCheckBounceJournal(db, tenantId, userId, {
    number: chk.number,
    type: chk.type as "incoming" | "outgoing",
    date: actionDate,
    amount: String(chk.amount),
    description: chk.description || undefined,
    customerName,
    supplierName,
    fromDeposited: chk.status === "deposited",
  });

  await db
    .update(checks)
    .set({ status: "bounced" })
    .where(tenantWhere(checks, tenantId, eq(checks.id, checkId)));

  if (chk.type === "incoming") {
    const { syncRoutingAfterClearOrBounce } = await import("./check-routing");
    await syncRoutingAfterClearOrBounce(db, tenantId, checkId, "rejected", userId);
  }

  return { success: true };
}

/**
 * فك اعتماد تحصيل شيك — عكس توزيع الدفعة (FIFO) وإلغاء قيد التحصيل وإرجاع الشيك لحالته قبل التحصيل.
 * شيك اتحصّل قبل وجود سجل check_payment_allocations (statusBeforeClear = null) لا يمكن فك اعتماده
 * تلقائياً بأمان — مفيش سجل يوضح أي فاتورة اتأثرت، فبنرفض بدل ما نخمّن.
 */
export async function unapproveCheck(db: Db, tenantId: number, checkId: number) {
  const [chk] = await db
    .select()
    .from(checks)
    .where(tenantWhere(checks, tenantId, eq(checks.id, checkId)));
  if (!chk) throw new TRPCError({ code: "NOT_FOUND", message: "الشيك غير موجود" });
  if (chk.status !== "cleared") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن فك اعتماد شيك غير محصّل" });
  }
  if (!chk.statusBeforeClear) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "هذا الشيك تم تحصيله قبل توفر سجل توزيع الدفعات — لا يمكن فك اعتماد تحصيله تلقائياً بأمان، يُرجى المعالجة يدوياً",
    });
  }

  const actionDate = toDateStr(chk.date);
  await assertDateNotInClosedPeriod(db, tenantId, actionDate);

  const allocRows = await db
    .select()
    .from(checkPaymentAllocations)
    .where(tenantWhere(checkPaymentAllocations, tenantId, eq(checkPaymentAllocations.checkId, checkId)));

  // تحقق مبدئي قبل أي تعديل: كل فاتورة اتأثرت لازم تكون لسه في حالة يمكن الرجوع فيها بأمان
  for (const row of allocRows) {
    if (row.documentType === "sales_invoice") {
      const [inv] = await db
        .select({ status: salesInvoices.status, number: salesInvoices.number })
        .from(salesInvoices)
        .where(tenantWhere(salesInvoices, tenantId, eq(salesInvoices.id, row.documentId)));
      if (!inv || inv.status === "draft" || inv.status === "cancelled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `لا يمكن فك اعتماد التحصيل: الفاتورة ${row.invoiceNumber} تغيّرت حالتها بعد تحصيل هذا الشيك — راجعها يدوياً أولاً`,
        });
      }
    } else {
      const [inv] = await db
        .select({ status: purchaseInvoices.status, number: purchaseInvoices.number })
        .from(purchaseInvoices)
        .where(tenantWhere(purchaseInvoices, tenantId, eq(purchaseInvoices.id, row.documentId)));
      if (!inv || inv.status === "draft" || inv.status === "cancelled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `لا يمكن فك اعتماد التحصيل: الفاتورة ${row.invoiceNumber} تغيّرت حالتها بعد تحصيل هذا الشيك — راجعها يدوياً أولاً`,
        });
      }
    }
  }

  for (const row of allocRows) {
    const amount = parseFloat(row.amount);
    if (row.documentType === "sales_invoice") {
      const [inv] = await db
        .select()
        .from(salesInvoices)
        .where(tenantWhere(salesInvoices, tenantId, eq(salesInvoices.id, row.documentId)));
      if (!inv) continue;
      const newPaid = Math.max(0, parseFloat(inv.paid || "0") - amount);
      const newRemaining = Math.min(parseFloat(inv.total || "0"), parseFloat(inv.remaining || "0") + amount);
      const newStatus = newRemaining >= parseFloat(inv.total || "0") - 0.001 ? "confirmed" : "partial";
      await db
        .update(salesInvoices)
        .set({ paid: String(newPaid), remaining: String(newRemaining), status: newStatus })
        .where(tenantWhere(salesInvoices, tenantId, eq(salesInvoices.id, inv.id)));
    } else {
      const [inv] = await db
        .select()
        .from(purchaseInvoices)
        .where(tenantWhere(purchaseInvoices, tenantId, eq(purchaseInvoices.id, row.documentId)));
      if (!inv) continue;
      const newPaid = Math.max(0, parseFloat(inv.paid || "0") - amount);
      const newRemaining = Math.min(parseFloat(inv.total || "0"), parseFloat(inv.remaining || "0") + amount);
      const newStatus = newRemaining >= parseFloat(inv.total || "0") - 0.001 ? "confirmed" : "partial";
      await db
        .update(purchaseInvoices)
        .set({ paid: String(newPaid), remaining: String(newRemaining), status: newStatus })
        .where(tenantWhere(purchaseInvoices, tenantId, eq(purchaseInvoices.id, inv.id)));
    }
  }

  await db
    .delete(checkPaymentAllocations)
    .where(tenantWhere(checkPaymentAllocations, tenantId, eq(checkPaymentAllocations.checkId, checkId)));

  if (chk.customerId) await recalculateCustomerBalance(db, tenantId, chk.customerId);
  if (chk.supplierId) await recalculateSupplierBalance(db, tenantId, chk.supplierId);

  await cancelPostedJournalByReference(db, tenantId, `${chk.number}-CLR`);

  await db
    .update(checks)
    .set({ status: chk.statusBeforeClear, statusBeforeClear: null })
    .where(tenantWhere(checks, tenantId, eq(checks.id, checkId)));

  if (chk.type === "incoming") {
    const { resetRoutingAfterUnclear } = await import("./check-routing");
    await resetRoutingAfterUnclear(db, tenantId, checkId, chk.statusBeforeClear);
  }

  return { success: true as const };
}
