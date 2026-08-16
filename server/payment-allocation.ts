import { and, asc, eq, or } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { purchaseInvoices, salesInvoices } from "../drizzle/schema";
import { recalculateCustomerBalance, recalculateSupplierBalance } from "./contact-balances";
import { tenantWhere } from "./tenant-scope";

const openSalesStatuses = or(
  eq(salesInvoices.status, "confirmed"),
  eq(salesInvoices.status, "partial"),
);

const openPurchaseStatuses = or(
  eq(purchaseInvoices.status, "confirmed"),
  eq(purchaseInvoices.status, "partial"),
);

export type PaymentAllocation = { invoiceNumber: string; amount: string };

function applySalesInvoiceAmount(
  paid: string | null,
  remaining: string | null,
  payAmount: number,
) {
  const invRemaining = parseFloat(remaining || "0");
  const newPaid = parseFloat(paid || "0") + payAmount;
  const newRemaining = Math.max(0, invRemaining - payAmount);
  const newStatus = newRemaining <= 0.001 ? "paid" : "partial";
  return {
    paid: String(newPaid),
    remaining: String(newRemaining),
    status: newStatus as "paid" | "partial",
  };
}

function applyPurchaseInvoiceAmount(
  paid: string | null,
  remaining: string | null,
  payAmount: number,
) {
  const invRemaining = parseFloat(remaining || "0");
  const newPaid = parseFloat(paid || "0") + payAmount;
  const newRemaining = Math.max(0, invRemaining - payAmount);
  const newStatus = newRemaining <= 0.001 ? "paid" : "partial";
  return {
    paid: String(newPaid),
    remaining: String(newRemaining),
    status: newStatus as "paid" | "partial",
  };
}

async function applyToSalesInvoice(
  db: MySql2Database,
  tenantId: number,
  invoiceId: number,
  payAmount: number,
  paid: string | null,
  remaining: string | null,
) {
  const invRemaining = parseFloat(remaining || "0");
  if (invRemaining <= 0.001 || payAmount <= 0) return 0;

  const apply = Math.min(payAmount, invRemaining);
  const updated = applySalesInvoiceAmount(paid, remaining, apply);
  await db
    .update(salesInvoices)
    .set(updated)
    .where(tenantWhere(salesInvoices, tenantId, eq(salesInvoices.id, invoiceId)));

  return apply;
}

async function applyToPurchaseInvoice(
  db: MySql2Database,
  tenantId: number,
  invoiceId: number,
  payAmount: number,
  paid: string | null,
  remaining: string | null,
) {
  const invRemaining = parseFloat(remaining || "0");
  if (invRemaining <= 0.001 || payAmount <= 0) return 0;

  const apply = Math.min(payAmount, invRemaining);
  const updated = applyPurchaseInvoiceAmount(paid, remaining, apply);
  await db
    .update(purchaseInvoices)
    .set(updated)
    .where(tenantWhere(purchaseInvoices, tenantId, eq(purchaseInvoices.id, invoiceId)));

  return apply;
}

export async function allocateCustomerPaymentFifo(
  db: MySql2Database,
  tenantId: number,
  customerId: number,
  amount: string,
  opts?: { referenceInvoiceNumber?: string },
) {
  let remainingPay = parseFloat(amount);
  const allocations: PaymentAllocation[] = [];
  const skipIds = new Set<number>();

  if (opts?.referenceInvoiceNumber?.trim()) {
    const [inv] = await db
      .select()
      .from(salesInvoices)
      .where(
        tenantWhere(
          salesInvoices,
          tenantId,
          and(
            eq(salesInvoices.number, opts.referenceInvoiceNumber.trim()),
            eq(salesInvoices.customerId, customerId),
            openSalesStatuses,
          ),
        ),
      )
      .limit(1);

    if (inv) {
      const applied = await applyToSalesInvoice(
        db,
        tenantId,
        inv.id,
        remainingPay,
        inv.paid,
        inv.remaining,
      );
      if (applied > 0) {
        allocations.push({ invoiceNumber: inv.number, amount: String(applied) });
        remainingPay -= applied;
        skipIds.add(inv.id);
      }
    }
  }

  if (remainingPay > 0.001) {
    const openInvoices = await db
      .select()
      .from(salesInvoices)
      .where(
        tenantWhere(
          salesInvoices,
          tenantId,
          and(eq(salesInvoices.customerId, customerId), openSalesStatuses),
        ),
      )
      .orderBy(asc(salesInvoices.date), asc(salesInvoices.id));

    for (const inv of openInvoices) {
      if (remainingPay <= 0.001) break;
      if (skipIds.has(inv.id)) continue;

      const applied = await applyToSalesInvoice(
        db,
        tenantId,
        inv.id,
        remainingPay,
        inv.paid,
        inv.remaining,
      );
      if (applied > 0) {
        allocations.push({ invoiceNumber: inv.number, amount: String(applied) });
        remainingPay -= applied;
      }
    }
  }

  await recalculateCustomerBalance(db, tenantId, customerId);

  return {
    allocations,
    unallocated: String(Math.max(0, remainingPay)),
  };
}

export async function allocateSupplierPaymentFifo(
  db: MySql2Database,
  tenantId: number,
  supplierId: number,
  amount: string,
  opts?: { referenceInvoiceNumber?: string },
) {
  let remainingPay = parseFloat(amount);
  const allocations: PaymentAllocation[] = [];
  const skipIds = new Set<number>();

  if (opts?.referenceInvoiceNumber?.trim()) {
    const [inv] = await db
      .select()
      .from(purchaseInvoices)
      .where(
        tenantWhere(
          purchaseInvoices,
          tenantId,
          and(
            eq(purchaseInvoices.number, opts.referenceInvoiceNumber.trim()),
            eq(purchaseInvoices.supplierId, supplierId),
            openPurchaseStatuses,
          ),
        ),
      )
      .limit(1);

    if (inv) {
      const applied = await applyToPurchaseInvoice(
        db,
        tenantId,
        inv.id,
        remainingPay,
        inv.paid,
        inv.remaining,
      );
      if (applied > 0) {
        allocations.push({ invoiceNumber: inv.number, amount: String(applied) });
        remainingPay -= applied;
        skipIds.add(inv.id);
      }
    }
  }

  if (remainingPay > 0.001) {
    const openInvoices = await db
      .select()
      .from(purchaseInvoices)
      .where(
        tenantWhere(
          purchaseInvoices,
          tenantId,
          and(eq(purchaseInvoices.supplierId, supplierId), openPurchaseStatuses),
        ),
      )
      .orderBy(asc(purchaseInvoices.date), asc(purchaseInvoices.id));

    for (const inv of openInvoices) {
      if (remainingPay <= 0.001) break;
      if (skipIds.has(inv.id)) continue;

      const applied = await applyToPurchaseInvoice(
        db,
        tenantId,
        inv.id,
        remainingPay,
        inv.paid,
        inv.remaining,
      );
      if (applied > 0) {
        allocations.push({ invoiceNumber: inv.number, amount: String(applied) });
        remainingPay -= applied;
      }
    }
  }

  await recalculateSupplierBalance(db, tenantId, supplierId);

  return {
    allocations,
    unallocated: String(Math.max(0, remainingPay)),
  };
}
