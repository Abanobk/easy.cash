import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "./db";
import { customerSalesReps, customers, salesReps } from "../drizzle/schema";
import { tenantWhere, withTenantId } from "./tenant-scope";

export type CustomerRepInput = {
  salesRepId: number;
  commissionRate?: string | null;
  isPrimary?: boolean;
};

export async function listCustomerSalesReps(
  db: Db,
  tenantId: number,
  customerId: number,
) {
  const rows = await db
    .select({
      id: customerSalesReps.id,
      customerId: customerSalesReps.customerId,
      salesRepId: customerSalesReps.salesRepId,
      commissionRate: customerSalesReps.commissionRate,
      isPrimary: customerSalesReps.isPrimary,
      repName: salesReps.name,
      defaultCommissionRate: salesReps.commissionRate,
    })
    .from(customerSalesReps)
    .leftJoin(salesReps, eq(customerSalesReps.salesRepId, salesReps.id))
    .where(tenantWhere(customerSalesReps, tenantId, eq(customerSalesReps.customerId, customerId)));

  return rows.map((r) => ({
    id: r.id,
    customerId: r.customerId,
    salesRepId: r.salesRepId,
    repName: r.repName || "",
    isPrimary: !!r.isPrimary,
    commissionRate: r.commissionRate ?? r.defaultCommissionRate ?? "0",
    defaultCommissionRate: r.defaultCommissionRate ?? "0",
  }));
}

/** Replace all sales-rep links for a customer and sync customers.salesRepId (primary). */
export async function setCustomerSalesReps(
  db: Db,
  tenantId: number,
  customerId: number,
  reps: CustomerRepInput[],
) {
  const cleaned: CustomerRepInput[] = [];
  const seen = new Set<number>();
  for (const r of reps) {
    const id = Number(r.salesRepId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    cleaned.push({
      salesRepId: id,
      commissionRate: r.commissionRate?.trim() ? r.commissionRate.trim() : null,
      isPrimary: !!r.isPrimary,
    });
  }
  if (cleaned.length && !cleaned.some((r) => r.isPrimary)) {
    cleaned[0].isPrimary = true;
  }

  await db
    .delete(customerSalesReps)
    .where(tenantWhere(customerSalesReps, tenantId, eq(customerSalesReps.customerId, customerId)));

  if (cleaned.length) {
    await db.insert(customerSalesReps).values(
      cleaned.map((r) =>
        withTenantId(tenantId, {
          customerId,
          salesRepId: r.salesRepId,
          commissionRate: r.commissionRate,
          isPrimary: !!r.isPrimary,
        }),
      ) as any,
    );
  }

  const primary = cleaned.find((r) => r.isPrimary) || cleaned[0];
  await db
    .update(customers)
    .set({ salesRepId: primary?.salesRepId ?? null } as any)
    .where(tenantWhere(customers, tenantId, eq(customers.id, customerId)));

  return listCustomerSalesReps(db, tenantId, customerId);
}

export async function listCustomerSalesRepsForCustomers(
  db: Db,
  tenantId: number,
  customerIds: number[],
) {
  if (!customerIds.length) return new Map<number, Awaited<ReturnType<typeof listCustomerSalesReps>>>();
  const rows = await db
    .select({
      id: customerSalesReps.id,
      customerId: customerSalesReps.customerId,
      salesRepId: customerSalesReps.salesRepId,
      commissionRate: customerSalesReps.commissionRate,
      isPrimary: customerSalesReps.isPrimary,
      repName: salesReps.name,
      defaultCommissionRate: salesReps.commissionRate,
    })
    .from(customerSalesReps)
    .leftJoin(salesReps, eq(customerSalesReps.salesRepId, salesReps.id))
    .where(
      and(
        tenantWhere(customerSalesReps, tenantId),
        inArray(customerSalesReps.customerId, customerIds),
      ),
    );

  const map = new Map<number, Awaited<ReturnType<typeof listCustomerSalesReps>>>();
  for (const r of rows) {
    const list = map.get(r.customerId) || [];
    list.push({
      id: r.id,
      customerId: r.customerId,
      salesRepId: r.salesRepId,
      repName: r.repName || "",
      isPrimary: !!r.isPrimary,
      commissionRate: r.commissionRate ?? r.defaultCommissionRate ?? "0",
      defaultCommissionRate: r.defaultCommissionRate ?? "0",
    });
    map.set(r.customerId, list);
  }
  return map;
}
