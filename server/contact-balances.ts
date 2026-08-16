import { and, eq, or, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import {
  customers,
  purchaseInvoices,
  purchaseReturns,
  salesInvoices,
  salesReturns,
  suppliers,
} from "../drizzle/schema";
import { tenantWhere } from "./tenant-scope";

const openInvoiceStatuses = or(
  eq(salesInvoices.status, "confirmed"),
  eq(salesInvoices.status, "partial"),
);

const openPurchaseStatuses = or(
  eq(purchaseInvoices.status, "confirmed"),
  eq(purchaseInvoices.status, "partial"),
);

export async function recalculateCustomerBalance(
  db: MySql2Database,
  tenantId: number,
  customerId: number,
) {
  const [invRow] = await db
    .select({
      balance: sql<string>`COALESCE(SUM(${salesInvoices.remaining}), 0)`,
    })
    .from(salesInvoices)
    .where(
      tenantWhere(
        salesInvoices,
        tenantId,
        and(eq(salesInvoices.customerId, customerId), openInvoiceStatuses),
      ),
    );

  const [retRow] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${salesReturns.total}), 0)`,
    })
    .from(salesReturns)
    .where(
      tenantWhere(
        salesReturns,
        tenantId,
        and(eq(salesReturns.customerId, customerId), eq(salesReturns.status, "confirmed")),
      ),
    );

  const [cust] = await db
    .select({ openingBalance: customers.openingBalance })
    .from(customers)
    .where(tenantWhere(customers, tenantId, eq(customers.id, customerId)));

  const opening = parseFloat(cust?.openingBalance || "0");
  const balance = String(
    Math.max(0, opening + parseFloat(invRow?.balance || "0") - parseFloat(retRow?.total || "0")),
  );
  await db
    .update(customers)
    .set({ balance })
    .where(tenantWhere(customers, tenantId, eq(customers.id, customerId)));
  return balance;
}

export async function recalculateSupplierBalance(
  db: MySql2Database,
  tenantId: number,
  supplierId: number,
) {
  const [invRow] = await db
    .select({
      balance: sql<string>`COALESCE(SUM(${purchaseInvoices.remaining}), 0)`,
    })
    .from(purchaseInvoices)
    .where(
      tenantWhere(
        purchaseInvoices,
        tenantId,
        and(eq(purchaseInvoices.supplierId, supplierId), openPurchaseStatuses),
      ),
    );

  const [retRow] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${purchaseReturns.total}), 0)`,
    })
    .from(purchaseReturns)
    .where(
      tenantWhere(
        purchaseReturns,
        tenantId,
        and(eq(purchaseReturns.supplierId, supplierId), eq(purchaseReturns.status, "confirmed")),
      ),
    );

  const [sup] = await db
    .select({ openingBalance: suppliers.openingBalance })
    .from(suppliers)
    .where(tenantWhere(suppliers, tenantId, eq(suppliers.id, supplierId)));

  const opening = parseFloat(sup?.openingBalance || "0");
  const balance = String(
    Math.max(0, opening + parseFloat(invRow?.balance || "0") - parseFloat(retRow?.total || "0")),
  );
  await db
    .update(suppliers)
    .set({ balance })
    .where(tenantWhere(suppliers, tenantId, eq(suppliers.id, supplierId)));
  return balance;
}

export async function reconcileAllContactBalances(db: MySql2Database, tenantId: number) {
  const customerRows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(tenantWhere(customers, tenantId));
  const supplierRows = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(tenantWhere(suppliers, tenantId));

  for (const row of customerRows) {
    await recalculateCustomerBalance(db, tenantId, row.id);
  }
  for (const row of supplierRows) {
    await recalculateSupplierBalance(db, tenantId, row.id);
  }

  return {
    customers: customerRows.length,
    suppliers: supplierRows.length,
  };
}
