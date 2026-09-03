import { and, count, eq, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Db } from "./db";
import {
  checks,
  fiscalYears,
  journalEntries,
  purchaseInvoices,
  salesInvoiceItems,
  salesInvoices,
} from "../drizzle/schema";
import { getPostedMovementByAccount } from "./accounting-data";
import {
  fiscalYearCloseReference,
  postSalesCogsJournal,
  postYearEndClosingJournal,
  postYearOpeningJournal,
} from "./auto-journal";
import { tenantWhere } from "./tenant-scope";

/** drizzle/mysql2 يرجّع أعمدة date() ككائن Date حقيقي — String(x).slice(0,10) بيفقد السنة */
function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v || "").slice(0, 10);
}

const openSalesStatuses = or(
  eq(salesInvoices.status, "confirmed"),
  eq(salesInvoices.status, "partial"),
);

const openPurchaseStatuses = or(
  eq(purchaseInvoices.status, "confirmed"),
  eq(purchaseInvoices.status, "partial"),
);

export type FiscalCloseWarning = {
  key: string;
  label: string;
  count: number;
  severity: "warning" | "error";
};

export async function getFiscalYearCloseReadiness(
  db: Db,
  tenantId: number,
  fy: { id: number; name: string; startDate: string | Date; endDate: string | Date; status: string },
) {
  const startDate = toDateStr(fy.startDate);
  const endDate = toDateStr(fy.endDate);
  const warnings: FiscalCloseWarning[] = [];

  const movement = await getPostedMovementByAccount(db, tenantId, { from: startDate, to: endDate });
  let totalDebit = 0;
  let totalCredit = 0;
  for (const m of movement.values()) {
    totalDebit += Number(m.debit);
    totalCredit += Number(m.credit);
  }
  const trialBalanced = Math.abs(totalDebit - totalCredit) < 0.02;
  if (!trialBalanced) {
    warnings.push({
      key: "trial_balance",
      label: "ميزان المراجعة غير متوازن للفترة",
      count: 1,
      severity: "error",
    });
  }

  const [openSales] = await db
    .select({ count: count() })
    .from(salesInvoices)
    .where(
      tenantWhere(
        salesInvoices,
        tenantId,
        and(openSalesStatuses, sql`COALESCE(${salesInvoices.remaining}, 0) > 0`),
      ),
    );
  if (openSales.count > 0) {
    warnings.push({
      key: "open_sales",
      label: "فواتير بيع بمتبقي مفتوح",
      count: openSales.count,
      severity: "warning",
    });
  }

  const [openPurchases] = await db
    .select({ count: count() })
    .from(purchaseInvoices)
    .where(
      tenantWhere(
        purchaseInvoices,
        tenantId,
        and(openPurchaseStatuses, sql`COALESCE(${purchaseInvoices.remaining}, 0) > 0`),
      ),
    );
  if (openPurchases.count > 0) {
    warnings.push({
      key: "open_purchases",
      label: "فواتير شراء بمتبقي مفتوح",
      count: openPurchases.count,
      severity: "warning",
    });
  }

  const [pendingChecks] = await db
    .select({ count: count() })
    .from(checks)
    .where(tenantWhere(checks, tenantId, eq(checks.status, "pending")));
  if (pendingChecks.count > 0) {
    warnings.push({
      key: "pending_checks",
      label: "شيكات معلقة",
      count: pendingChecks.count,
      severity: "warning",
    });
  }

  const [draftSales] = await db
    .select({ count: count() })
    .from(salesInvoices)
    .where(tenantWhere(salesInvoices, tenantId, eq(salesInvoices.status, "draft")));
  const [draftPurchases] = await db
    .select({ count: count() })
    .from(purchaseInvoices)
    .where(tenantWhere(purchaseInvoices, tenantId, eq(purchaseInvoices.status, "draft")));
  const draftTotal = draftSales.count + draftPurchases.count;
  if (draftTotal > 0) {
    warnings.push({
      key: "draft_docs",
      label: "مستندات مسودة",
      count: draftTotal,
      severity: "warning",
    });
  }

  const [draftJournals] = await db
    .select({ count: count() })
    .from(journalEntries)
    .where(tenantWhere(journalEntries, tenantId, eq(journalEntries.status, "draft")));
  if (draftJournals.count > 0) {
    warnings.push({
      key: "draft_journals",
      label: "قيود يومية مسودة",
      count: draftJournals.count,
      severity: "warning",
    });
  }

  const closeRef = fiscalYearCloseReference(fy.id);
  const [existingClose] = await db
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(tenantWhere(journalEntries, tenantId, eq(journalEntries.reference, closeRef)))
    .limit(1);

  return {
    fiscalYearId: fy.id,
    fiscalYearName: fy.name,
    startDate,
    endDate,
    trialBalanced,
    totalDebit,
    totalCredit,
    closingJournalExists: !!existingClose,
    canClose: fy.status === "open" && trialBalanced,
    warnings,
  };
}

export async function closeFiscalYearWithJournals(
  db: Db,
  tenantId: number,
  userId: number | undefined,
  fy: { id: number; name: string; startDate: string | Date; endDate: string | Date; status: string },
  opts?: { skipClosingJournal?: boolean },
) {
  const readiness = await getFiscalYearCloseReadiness(db, tenantId, fy);
  if (!readiness.trialBalanced) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "لا يمكن الإغلاق — ميزان المراجعة غير متوازن للفترة",
    });
  }
  if (fy.status !== "open") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "الفترة مغلقة بالفعل" });
  }

  let closingResult: Awaited<ReturnType<typeof postYearEndClosingJournal>> | null = null;
  if (!opts?.skipClosingJournal && !readiness.closingJournalExists) {
    closingResult = await postYearEndClosingJournal(db, tenantId, userId, fy);
  }

  const endDate = toDateStr(fy.endDate);
  let openingResult: Awaited<ReturnType<typeof postYearOpeningJournal>> | null = null;
  const allYears = await db
    .select()
    .from(fiscalYears)
    .where(tenantWhere(fiscalYears, tenantId));
  const nextYear = allYears
    .filter((row) => row.status === "open" && toDateStr(row.startDate) > endDate)
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)))[0];
  if (nextYear) {
    openingResult = await postYearOpeningJournal(db, tenantId, userId, nextYear, endDate);
  }

  return { readiness, closingResult, openingResult };
}

export async function backfillMissingCogsJournals(
  db: Db,
  tenantId: number,
  userId: number | undefined,
) {
  const invoices = await db
    .select({
      id: salesInvoices.id,
      number: salesInvoices.number,
      date: salesInvoices.date,
      costCenterId: salesInvoices.costCenterId,
      status: salesInvoices.status,
    })
    .from(salesInvoices)
    .where(
      tenantWhere(
        salesInvoices,
        tenantId,
        or(
          eq(salesInvoices.status, "confirmed"),
          eq(salesInvoices.status, "paid"),
          eq(salesInvoices.status, "partial"),
        ),
      ),
    )
    .orderBy(salesInvoices.id);

  let created = 0;
  let skipped = 0;

  for (const inv of invoices) {
    const ref = `${inv.number}-COGS`;
    const [existing] = await db
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(tenantWhere(journalEntries, tenantId, eq(journalEntries.reference, ref)))
      .limit(1);
    if (existing) {
      skipped += 1;
      continue;
    }

    const items = await db
      .select({
        itemId: salesInvoiceItems.itemId,
        quantity: salesInvoiceItems.quantity,
      })
      .from(salesInvoiceItems)
      .where(tenantWhere(salesInvoiceItems, tenantId, eq(salesInvoiceItems.invoiceId, inv.id)));

    if (!items.length) {
      skipped += 1;
      continue;
    }

    const result = await postSalesCogsJournal(db, tenantId, userId, {
      number: inv.number,
      date: toDateStr(inv.date),
      costCenterId: inv.costCenterId ?? undefined,
      items: items.map((it) => ({ itemId: it.itemId, quantity: String(it.quantity) })),
    });
    if (result.skipped) skipped += 1;
    else created += 1;
  }

  return { created, skipped, total: invoices.length };
}
