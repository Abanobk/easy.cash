import { eq, inArray, isNull, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { TRPCError } from "@trpc/server";
import { appUsers } from "../drizzle/schema";
import { roleBypassesPermissions } from "./permissions-service";

export type UserScope = {
  branchIds: number[] | null;
  warehouseIds: number[] | null;
};

export function parseScopeIds(raw: unknown): number[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const ids = raw.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
    return ids.length > 0 ? ids : null;
  }
  if (typeof raw === "string") {
    try {
      return parseScopeIds(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  return null;
}

export function userScopeFromRow(row: {
  role?: string;
  scopeBranchIds?: unknown;
  scopeWarehouseIds?: unknown;
}): UserScope {
  if (row.role && roleBypassesPermissions(row.role)) {
    return { branchIds: null, warehouseIds: null };
  }
  return {
    branchIds: parseScopeIds(row.scopeBranchIds),
    warehouseIds: parseScopeIds(row.scopeWarehouseIds),
  };
}

export function scopeBranchFilter<T extends { branchId: any }>(
  table: T,
  scope: UserScope,
): SQL | undefined {
  if (!scope.branchIds?.length) return undefined;
  return inArray(table.branchId, scope.branchIds);
}

export function scopeWarehouseFilter<T extends { warehouseId: any }>(
  table: T,
  scope: UserScope,
): SQL | undefined {
  if (!scope.warehouseIds?.length) return undefined;
  return inArray(table.warehouseId, scope.warehouseIds);
}

/** فلتر على عمود id مباشرة (قوائم الفروع/المخازن) */
export function scopeIdsFilter(column: any, ids: number[] | null): SQL | undefined {
  if (!ids?.length) return undefined;
  return inArray(column, ids);
}

/** تحويلات مخزنية: يظهر إن كان المصدر أو الوجهة ضمن النطاق */
export function scopeEitherWarehouseFilter(
  fromColumn: any,
  toColumn: any,
  scope: UserScope,
): SQL | undefined {
  if (!scope.warehouseIds?.length) return undefined;
  return or(inArray(fromColumn, scope.warehouseIds), inArray(toColumn, scope.warehouseIds));
}

export function assertBranchAccess(scope: UserScope, branchId: number | null | undefined) {
  if (branchId == null || !scope.branchIds?.length) return;
  if (!scope.branchIds.includes(branchId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك استخدام هذا الفرع" });
  }
}

export function assertWarehouseAccess(scope: UserScope, warehouseId: number | null | undefined) {
  if (warehouseId == null || !scope.warehouseIds?.length) return;
  if (!scope.warehouseIds.includes(warehouseId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك استخدام هذا المخزن" });
  }
}

export function assertEntityBranchAccess(scope: UserScope, branchId: number | null | undefined) {
  if (!scope.branchIds?.length) return;
  if (branchId == null || !scope.branchIds.includes(branchId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك عرض بيانات خارج نطاق فروعك" });
  }
}

/** يدمج نطاق المستخدم في فلاتر التقارير (يمنع تجاوز النطاق) */
export function applyScopeToReportFilters<
  T extends {
    branchId?: number;
    warehouseId?: number;
    branchIds?: number[];
    warehouseIds?: number[];
  },
>(filters: T, scope: UserScope): T {
  const out = { ...filters };
  if (scope.branchIds?.length) {
    if (out.branchId != null && !scope.branchIds.includes(out.branchId)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك عرض تقارير فرع خارج نطاقك" });
    }
    if (out.branchId == null) {
      out.branchIds = scope.branchIds;
    }
  }
  if (scope.warehouseIds?.length) {
    if (out.warehouseId != null && !scope.warehouseIds.includes(out.warehouseId)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك عرض تقارير مخزن خارج نطاقك" });
    }
    if (out.warehouseId == null) {
      out.warehouseIds = scope.warehouseIds;
    }
  }
  return out;
}

export async function loadUserScope(
  db: MySql2Database,
  userId: number,
): Promise<UserScope> {
  const [row] = await db
    .select({
      role: appUsers.role,
      scopeBranchIds: appUsers.scopeBranchIds,
      scopeWarehouseIds: appUsers.scopeWarehouseIds,
    })
    .from(appUsers)
    .where(eq(appUsers.id, userId))
    .limit(1);
  return userScopeFromRow(row || {});
}

/** معاملات مرتبطة بعميل: تُفلتر حسب فرع العميل عند وجود نطاق فروع */
export function scopeContactTransactionFilter(
  scope: UserScope,
  customerIdCol: any,
  customerBranchCol: any,
): SQL | undefined {
  if (!scope.branchIds?.length) return undefined;
  return or(
    isNull(customerIdCol),
    inArray(customerBranchCol, scope.branchIds),
  );
}

export async function loadUserScopeFromCtx(
  db: MySql2Database | null,
  saasUser: { id: number } | null | undefined,
): Promise<UserScope> {
  if (!db || !saasUser) return { branchIds: null, warehouseIds: null };
  return loadUserScope(db, saasUser.id);
}
