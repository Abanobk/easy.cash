import { and, count, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import {
  checkRoutings,
  checks,
  customers,
  installments,
  items,
  loans,
  purchaseInvoices,
  salesInvoices,
  suppliers,
} from "../drizzle/schema";
import { tenantWhere } from "./tenant-scope";

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function getOperationalAlerts(db: MySql2Database, tenantId: number) {
  const today = new Date().toISOString().slice(0, 10);
  const weekAhead = addDays(new Date(), 7);

  const lowStockItems = await db
    .select({
      id: items.id,
      name: items.name,
      currentStock: items.currentStock,
      minStock: items.minStock,
      unit: items.unit,
    })
    .from(items)
    .where(
      tenantWhere(
        items,
        tenantId,
        and(
          sql`COALESCE(${items.minStock}, 0) > 0`,
          sql`COALESCE(${items.currentStock}, 0) <= COALESCE(${items.minStock}, 0)`,
        ),
      ),
    )
    .orderBy(items.currentStock)
    .limit(10);

  const unpaidSales = await db
    .select({
      id: salesInvoices.id,
      number: salesInvoices.number,
      date: salesInvoices.date,
      remaining: salesInvoices.remaining,
      customerName: customers.name,
      customerId: salesInvoices.customerId,
    })
    .from(salesInvoices)
    .leftJoin(customers, eq(salesInvoices.customerId, customers.id))
    .where(
      tenantWhere(
        salesInvoices,
        tenantId,
        and(
          or(eq(salesInvoices.status, "confirmed"), eq(salesInvoices.status, "partial")),
          sql`COALESCE(${salesInvoices.remaining}, 0) > 0`,
        ),
      ),
    )
    .orderBy(desc(salesInvoices.date))
    .limit(10);

  const unpaidPurchases = await db
    .select({
      id: purchaseInvoices.id,
      number: purchaseInvoices.number,
      date: purchaseInvoices.date,
      remaining: purchaseInvoices.remaining,
      supplierName: suppliers.name,
      supplierId: purchaseInvoices.supplierId,
    })
    .from(purchaseInvoices)
    .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
    .where(
      tenantWhere(
        purchaseInvoices,
        tenantId,
        and(
          or(eq(purchaseInvoices.status, "confirmed"), eq(purchaseInvoices.status, "partial")),
          sql`COALESCE(${purchaseInvoices.remaining}, 0) > 0`,
        ),
      ),
    )
    .orderBy(desc(purchaseInvoices.date))
    .limit(10);

  const overdueSales = await db
    .select({
      id: salesInvoices.id,
      number: salesInvoices.number,
      dueDate: salesInvoices.dueDate,
      remaining: salesInvoices.remaining,
      customerName: customers.name,
    })
    .from(salesInvoices)
    .leftJoin(customers, eq(salesInvoices.customerId, customers.id))
    .where(
      tenantWhere(
        salesInvoices,
        tenantId,
        and(
          or(eq(salesInvoices.status, "confirmed"), eq(salesInvoices.status, "partial")),
          sql`COALESCE(${salesInvoices.remaining}, 0) > 0`,
          sql`${salesInvoices.dueDate} IS NOT NULL`,
          sql`${salesInvoices.dueDate} < ${today}`,
        ),
      ),
    )
    .orderBy(salesInvoices.dueDate)
    .limit(10);

  const dueChecks = await db
    .select({
      id: checks.id,
      number: checks.number,
      checkNumber: checks.checkNumber,
      type: checks.type,
      amount: checks.amount,
      dueDate: checks.dueDate,
      customerId: checks.customerId,
      supplierId: checks.supplierId,
    })
    .from(checks)
    .where(
      tenantWhere(
        checks,
        tenantId,
        and(
          eq(checks.status, "pending"),
          lte(checks.dueDate, weekAhead as any),
          gte(checks.dueDate, today as any),
        ),
      ),
    )
    .orderBy(checks.dueDate)
    .limit(10);

  const overdueChecks = await db
    .select({
      id: checks.id,
      number: checks.number,
      checkNumber: checks.checkNumber,
      type: checks.type,
      amount: checks.amount,
      dueDate: checks.dueDate,
    })
    .from(checks)
    .where(
      tenantWhere(
        checks,
        tenantId,
        and(eq(checks.status, "pending"), sql`${checks.dueDate} < ${today}`),
      ),
    )
    .orderBy(checks.dueDate)
    .limit(10);

  const creditExceededCustomers = await db
    .select({
      id: customers.id,
      name: customers.name,
      balance: customers.balance,
      creditLimit: customers.creditLimit,
    })
    .from(customers)
    .where(
      tenantWhere(
        customers,
        tenantId,
        and(
          sql`COALESCE(${customers.creditLimit}, 0) > 0`,
          sql`COALESCE(${customers.balance}, 0) > COALESCE(${customers.creditLimit}, 0)`,
        ),
      ),
    )
    .orderBy(desc(customers.balance))
    .limit(10);

  const dueInstallmentsRaw = await db
    .select({
      id: installments.id,
      dueDate: installments.dueDate,
      amount: installments.amount,
      paidAmount: installments.paidAmount,
      status: installments.status,
      partyName: loans.partyName,
      loanNumber: loans.number,
    })
    .from(installments)
    .innerJoin(loans, eq(installments.loanId, loans.id))
    .where(
      tenantWhere(
        installments,
        tenantId,
        and(
          or(eq(installments.status, "pending"), eq(installments.status, "overdue")),
          lte(installments.dueDate, weekAhead as any),
        ),
      ),
    )
    .orderBy(installments.dueDate)
    .limit(10);

  const dueInstallments = dueInstallmentsRaw.map((row) => ({
    ...row,
    isOverdue: String(row.dueDate).slice(0, 10) < today,
  }));

  const [draftSales] = await db
    .select({ count: count() })
    .from(salesInvoices)
    .where(tenantWhere(salesInvoices, tenantId, eq(salesInvoices.status, "draft")));

  const [draftPurchases] = await db
    .select({ count: count() })
    .from(purchaseInvoices)
    .where(tenantWhere(purchaseInvoices, tenantId, eq(purchaseInvoices.status, "draft")));

  const [overdueChecksCount] = await db
    .select({ count: count() })
    .from(checks)
    .where(
      tenantWhere(
        checks,
        tenantId,
        and(eq(checks.status, "pending"), sql`${checks.dueDate} < ${today}`),
      ),
    );

  const depositAhead = addDays(new Date(), 3);

  const unroutedChecks = await db
    .select({
      id: checks.id,
      routingId: checkRoutings.id,
      number: checks.number,
      checkNumber: checks.checkNumber,
      amount: checks.amount,
      dueDate: checks.dueDate,
      customerName: customers.name,
    })
    .from(checkRoutings)
    .innerJoin(checks, and(eq(checkRoutings.checkId, checks.id), eq(checkRoutings.tenantId, checks.tenantId)))
    .leftJoin(customers, eq(checks.customerId, customers.id))
    .where(
      and(
        eq(checkRoutings.tenantId, tenantId),
        eq(checks.type, "incoming"),
        eq(checkRoutings.status, "unrouted"),
      ),
    )
    .orderBy(checks.dueDate)
    .limit(10);

  const depositDueSoon = await db
    .select({
      id: checks.id,
      routingId: checkRoutings.id,
      number: checks.number,
      checkNumber: checks.checkNumber,
      amount: checks.amount,
      plannedDepositDate: checkRoutings.plannedDepositDate,
      customerName: customers.name,
    })
    .from(checkRoutings)
    .innerJoin(checks, and(eq(checkRoutings.checkId, checks.id), eq(checkRoutings.tenantId, checks.tenantId)))
    .leftJoin(customers, eq(checks.customerId, customers.id))
    .where(
      and(
        eq(checkRoutings.tenantId, tenantId),
        eq(checks.type, "incoming"),
        eq(checkRoutings.status, "scheduled"),
        gte(checkRoutings.plannedDepositDate, today as any),
        lte(checkRoutings.plannedDepositDate, depositAhead as any),
      ),
    )
    .orderBy(checkRoutings.plannedDepositDate)
    .limit(10);

  const overdueDeposits = await db
    .select({
      id: checks.id,
      routingId: checkRoutings.id,
      number: checks.number,
      checkNumber: checks.checkNumber,
      amount: checks.amount,
      plannedDepositDate: checkRoutings.plannedDepositDate,
      customerName: customers.name,
    })
    .from(checkRoutings)
    .innerJoin(checks, and(eq(checkRoutings.checkId, checks.id), eq(checkRoutings.tenantId, checks.tenantId)))
    .leftJoin(customers, eq(checks.customerId, customers.id))
    .where(
      and(
        eq(checkRoutings.tenantId, tenantId),
        eq(checks.type, "incoming"),
        eq(checkRoutings.status, "scheduled"),
        sql`${checkRoutings.plannedDepositDate} < ${today}`,
      ),
    )
    .orderBy(checkRoutings.plannedDepositDate)
    .limit(10);

  const depositedOverdueClear = await db
    .select({
      id: checks.id,
      routingId: checkRoutings.id,
      number: checks.number,
      checkNumber: checks.checkNumber,
      amount: checks.amount,
      dueDate: checks.dueDate,
      depositedAt: checkRoutings.depositedAt,
      customerName: customers.name,
    })
    .from(checkRoutings)
    .innerJoin(checks, and(eq(checkRoutings.checkId, checks.id), eq(checkRoutings.tenantId, checks.tenantId)))
    .leftJoin(customers, eq(checks.customerId, customers.id))
    .where(
      and(
        eq(checkRoutings.tenantId, tenantId),
        eq(checks.type, "incoming"),
        eq(checkRoutings.status, "deposited"),
        sql`${checks.dueDate} < ${today}`,
      ),
    )
    .orderBy(checks.dueDate)
    .limit(10);

  return {
    lowStockItems,
    unpaidSales,
    unpaidPurchases,
    overdueSales,
    dueChecks,
    overdueChecks,
    unroutedChecks,
    depositDueSoon,
    overdueDeposits,
    depositedOverdueClear,
    creditExceededCustomers,
    dueInstallments,
    counts: {
      lowStock: lowStockItems.length,
      unpaidSales: unpaidSales.length,
      unpaidPurchases: unpaidPurchases.length,
      overdueSales: overdueSales.length,
      dueChecks: dueChecks.length,
      overdueChecks: overdueChecksCount.count,
      unroutedChecks: unroutedChecks.length,
      depositDueSoon: depositDueSoon.length,
      overdueDeposits: overdueDeposits.length,
      depositedOverdueClear: depositedOverdueClear.length,
      creditExceeded: creditExceededCustomers.length,
      dueInstallments: dueInstallments.length,
      draftDocs: draftSales.count + draftPurchases.count,
    },
  };
}
