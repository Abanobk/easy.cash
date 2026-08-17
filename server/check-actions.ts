import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Db } from "./db";
import { checks, customers, suppliers } from "../drizzle/schema";
import {
  postCheckBounceJournal,
  postCheckClearJournal,
  postCheckReceiveJournal,
} from "./auto-journal";
import { assertDateNotInClosedPeriod } from "./fiscal-period-guard";
import { allocateCustomerPaymentFifo, allocateSupplierPaymentFifo } from "./payment-allocation";
import { tenantWhere, withTenantId } from "./tenant-scope";

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

  const actionDate = opts?.date || String(chk.date).slice(0, 10);
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

  let allocations: { invoiceNumber: string; amount: string }[] | undefined;
  let unallocated: string | undefined;

  if (chk.type === "incoming" && chk.customerId) {
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

  await db
    .update(checks)
    .set({ status: "cleared" })
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
