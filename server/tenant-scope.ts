import { SQL, and, eq, type Column } from "drizzle-orm";

type TenantTable = { tenantId: Column<any, object, object> };

export function tenantWhere<T extends TenantTable>(table: T, tenantId: number, ...extra: (SQL | undefined)[]) {
  const parts = [eq(table.tenantId, tenantId), ...extra.filter(Boolean)] as SQL[];
  return parts.length === 1 ? parts[0] : and(...parts);
}

export function withTenantId<T extends Record<string, unknown>>(tenantId: number, values: T) {
  return { ...values, tenantId };
}
