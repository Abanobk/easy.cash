import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  BUILTIN_ROLE_DESCRIPTIONS,
  BUILTIN_ROLE_LABELS,
  BUILTIN_TENANT_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  EDITABLE_BUILTIN_ROLES,
  PERMISSION_MODULES,
  emptyPermissions,
  isBuiltinRole,
  isEditableRoleKey,
  type BuiltinTenantRole,
  type EffectivePermissions,
  type ModulePermission,
  type PermissionAction,
  type PermissionModule,
  hasPermission,
} from "../shared/permissions";
import { appUsers, tenantRolePermissions, tenantRoles, tenantScreenPermissions, userPermissionOverrides } from "../drizzle/schema";
import { getDb } from "./db";
import { canManageTeamUsers } from "./saas-auth";

export type TenantRoleRow = {
  roleKey: string;
  name: string;
  description: string | null;
  isBuiltin: boolean;
  isActive: boolean;
  userCount?: number;
};

function defaultPermsForRoleKey(roleKey: string): EffectivePermissions {
  if (isBuiltinRole(roleKey)) return DEFAULT_ROLE_PERMISSIONS[roleKey];
  return emptyPermissions();
}

export function roleBypassesPermissions(role: string) {
  return role === "superadmin" || role === "admin";
}

export function rowToModulePermission(row: {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}): ModulePermission {
  return {
    view: Boolean(row.canView),
    create: Boolean(row.canCreate),
    edit: Boolean(row.canEdit),
    delete: Boolean(row.canDelete),
  };
}

function makeCustomRoleKey(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w\u0600-\u06FF]+/g, "")
    .slice(0, 36);
  const suffix = Date.now().toString(36).slice(-5);
  return `c_${slug || "role"}_${suffix}`.slice(0, 64);
}

/** يضمن وجود الأدوار المدمجة في tenant_roles + صفوف الصلاحيات الافتراضية */
export async function ensureTenantRoleDefaults(tenantId: number) {
  const db = await getDb();
  if (!db) return;

  for (const role of BUILTIN_TENANT_ROLES) {
    const [existingRole] = await db
      .select({ id: tenantRoles.id })
      .from(tenantRoles)
      .where(and(eq(tenantRoles.tenantId, tenantId), eq(tenantRoles.roleKey, role)))
      .limit(1);
    if (!existingRole) {
      await db.insert(tenantRoles).values({
        tenantId,
        roleKey: role,
        name: BUILTIN_ROLE_LABELS[role],
        description: BUILTIN_ROLE_DESCRIPTIONS[role],
        isBuiltin: true,
        isActive: true,
      });
    }
  }

  const existingPerms = await db
    .select({ id: tenantRolePermissions.id })
    .from(tenantRolePermissions)
    .where(eq(tenantRolePermissions.tenantId, tenantId))
    .limit(1);
  if (existingPerms.length > 0) return;

  const values: Array<typeof tenantRolePermissions.$inferInsert> = [];
  for (const role of BUILTIN_TENANT_ROLES) {
    const defaults = DEFAULT_ROLE_PERMISSIONS[role];
    for (const mod of PERMISSION_MODULES) {
      const p = defaults[mod.id];
      values.push({
        tenantId,
        role,
        module: mod.id,
        canView: p.view,
        canCreate: p.create,
        canEdit: p.edit,
        canDelete: p.delete,
      });
    }
  }
  if (values.length > 0) {
    await db.insert(tenantRolePermissions).values(values);
  }
}

export async function listTenantRoles(tenantId: number): Promise<TenantRoleRow[]> {
  await ensureTenantRoleDefaults(tenantId);
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(tenantRoles)
    .where(and(eq(tenantRoles.tenantId, tenantId), eq(tenantRoles.isActive, true)))
    .orderBy(desc(tenantRoles.isBuiltin), asc(tenantRoles.name));

  const counts = await db
    .select({
      role: appUsers.role,
      c: sql<number>`count(*)`,
    })
    .from(appUsers)
    .where(eq(appUsers.tenantId, tenantId))
    .groupBy(appUsers.role);
  const countMap = new Map(counts.map((r) => [r.role, Number(r.c)]));

  return rows.map((r) => ({
    roleKey: r.roleKey,
    name: r.name,
    description: r.description,
    isBuiltin: Boolean(r.isBuiltin),
    isActive: Boolean(r.isActive),
    userCount: countMap.get(r.roleKey) ?? 0,
  }));
}

export async function assertRoleExists(tenantId: number, roleKey: string) {
  if (roleKey === "superadmin") throw new Error("دور غير صالح");
  await ensureTenantRoleDefaults(tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [row] = await db
    .select({ id: tenantRoles.id, isActive: tenantRoles.isActive })
    .from(tenantRoles)
    .where(and(eq(tenantRoles.tenantId, tenantId), eq(tenantRoles.roleKey, roleKey)))
    .limit(1);
  if (!row || !row.isActive) throw new Error("الدور غير موجود");
}

export async function createTenantRole(input: {
  tenantId: number;
  name: string;
  description?: string;
  copyFrom?: string;
}): Promise<{ roleKey: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await ensureTenantRoleDefaults(input.tenantId);

  const name = input.name.trim();
  if (!name) throw new Error("اسم الدور مطلوب");
  if (name.length > 80) throw new Error("اسم الدور طويل جداً");

  const roleKey = makeCustomRoleKey(name);
  const copyFrom = input.copyFrom && isEditableRoleKey(input.copyFrom) ? input.copyFrom : "user";

  await db.insert(tenantRoles).values({
    tenantId: input.tenantId,
    roleKey,
    name,
    description: input.description?.trim() || null,
    isBuiltin: false,
    isActive: true,
  });

  const sourcePerms = await getRolePermissionsForTenant(input.tenantId, copyFrom);
  for (const mod of PERMISSION_MODULES) {
    const p = sourcePerms[mod.id];
    await db.insert(tenantRolePermissions).values({
      tenantId: input.tenantId,
      role: roleKey,
      module: mod.id,
      canView: p.view,
      canCreate: p.create,
      canEdit: p.edit,
      canDelete: p.delete,
    });
  }

  // انسخ تجاوزات الشاشات من الدور المصدر إن وُجدت
  const screenRows = await db
    .select()
    .from(tenantScreenPermissions)
    .where(and(eq(tenantScreenPermissions.tenantId, input.tenantId), eq(tenantScreenPermissions.role, copyFrom)));
  for (const row of screenRows) {
    await db.insert(tenantScreenPermissions).values({
      tenantId: input.tenantId,
      role: roleKey,
      featureKey: row.featureKey,
      canView: row.canView,
      canCreate: row.canCreate,
      canEdit: row.canEdit,
      canDelete: row.canDelete,
    });
  }

  return { roleKey };
}

export async function updateTenantRoleMeta(input: {
  tenantId: number;
  roleKey: string;
  name: string;
  description?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await assertRoleExists(input.tenantId, input.roleKey);

  const [row] = await db
    .select()
    .from(tenantRoles)
    .where(and(eq(tenantRoles.tenantId, input.tenantId), eq(tenantRoles.roleKey, input.roleKey)))
    .limit(1);
  if (!row) throw new Error("الدور غير موجود");
  if (row.isBuiltin) throw new Error("لا يمكن تعديل اسم الأدوار المدمجة");

  const name = input.name.trim();
  if (!name) throw new Error("اسم الدور مطلوب");

  await db
    .update(tenantRoles)
    .set({
      name,
      description: input.description?.trim() || null,
    })
    .where(eq(tenantRoles.id, row.id));
}

export async function deleteTenantRole(tenantId: number, roleKey: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (isBuiltinRole(roleKey) || roleKey === "superadmin") {
    throw new Error("لا يمكن حذف دور مدمج");
  }
  await assertRoleExists(tenantId, roleKey);

  const [usersWithRole] = await db
    .select({ c: sql<number>`count(*)` })
    .from(appUsers)
    .where(and(eq(appUsers.tenantId, tenantId), eq(appUsers.role, roleKey)));
  if (Number(usersWithRole?.c || 0) > 0) {
    throw new Error("لا يمكن حذف الدور — مرتبط بمستخدمين. غيّر أدوارهم أولاً");
  }

  await db
    .delete(tenantRolePermissions)
    .where(and(eq(tenantRolePermissions.tenantId, tenantId), eq(tenantRolePermissions.role, roleKey)));
  await db
    .delete(tenantScreenPermissions)
    .where(and(eq(tenantScreenPermissions.tenantId, tenantId), eq(tenantScreenPermissions.role, roleKey)));
  await db
    .delete(tenantRoles)
    .where(and(eq(tenantRoles.tenantId, tenantId), eq(tenantRoles.roleKey, roleKey)));
}

export async function getRolePermissionsForTenant(
  tenantId: number,
  role: string,
): Promise<EffectivePermissions> {
  await ensureTenantRoleDefaults(tenantId);
  const db = await getDb();
  const fallback = defaultPermsForRoleKey(role);
  if (!db) return fallback;

  if (roleBypassesPermissions(role)) return DEFAULT_ROLE_PERMISSIONS.admin;

  const rows = await db
    .select()
    .from(tenantRolePermissions)
    .where(and(eq(tenantRolePermissions.tenantId, tenantId), eq(tenantRolePermissions.role, role)));

  if (rows.length === 0) return fallback;

  const result = emptyPermissions();
  for (const row of rows) {
    const module = row.module as PermissionModule;
    if (!result[module]) continue;
    result[module] = rowToModulePermission(row);
  }
  const seen = new Set(rows.map((r) => r.module));
  for (const mod of PERMISSION_MODULES) {
    if (!seen.has(mod.id)) {
      result[mod.id] = { ...(fallback[mod.id] || emptyPermissions()[mod.id]) };
    }
  }
  return result;
}

export async function getUserPermissionOverrides(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(userPermissionOverrides)
    .where(eq(userPermissionOverrides.userId, userId));
}

export async function getEffectivePermissions(input: {
  userId: number;
  tenantId: number;
  role: string;
}): Promise<EffectivePermissions> {
  if (roleBypassesPermissions(input.role)) {
    return DEFAULT_ROLE_PERMISSIONS.admin;
  }

  const base = await getRolePermissionsForTenant(input.tenantId, input.role);
  const overrides = await getUserPermissionOverrides(input.userId);
  if (overrides.length === 0) return base;

  const merged = { ...base };
  for (const row of overrides) {
    const module = row.module as PermissionModule;
    if (!merged[module]) continue;
    merged[module] = {
      view: row.canView ?? merged[module].view,
      create: row.canCreate ?? merged[module].create,
      edit: row.canEdit ?? merged[module].edit,
      delete: row.canDelete ?? merged[module].delete,
    };
  }
  return merged;
}

export async function saveRolePermissions(
  tenantId: number,
  role: string,
  permissions: EffectivePermissions,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!isEditableRoleKey(role)) {
    throw new Error("صلاحيات المدير كاملة ولا تُعدّل");
  }
  await assertRoleExists(tenantId, role);

  for (const mod of PERMISSION_MODULES) {
    const p = permissions[mod.id];
    await db
      .insert(tenantRolePermissions)
      .values({
        tenantId,
        role,
        module: mod.id,
        canView: p.view,
        canCreate: p.create,
        canEdit: p.edit,
        canDelete: p.delete,
      })
      .onDuplicateKeyUpdate({
        set: {
          canView: p.view,
          canCreate: p.create,
          canEdit: p.edit,
          canDelete: p.delete,
        },
      });
  }
}

export async function saveUserPermissionOverrides(
  userId: number,
  overrides: Partial<Record<PermissionModule, Partial<ModulePermission> | null>>,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  for (const mod of PERMISSION_MODULES) {
    const patch = overrides[mod.id];
    if (patch === null) {
      await db.delete(userPermissionOverrides).where(
        and(eq(userPermissionOverrides.userId, userId), eq(userPermissionOverrides.module, mod.id)),
      );
      continue;
    }
    if (!patch) continue;

    const hasAny = ["view", "create", "edit", "delete"].some((k) => patch[k as PermissionAction] !== undefined);
    if (!hasAny) continue;

    await db
      .insert(userPermissionOverrides)
      .values({
        userId,
        module: mod.id,
        canView: patch.view ?? null,
        canCreate: patch.create ?? null,
        canEdit: patch.edit ?? null,
        canDelete: patch.delete ?? null,
      })
      .onDuplicateKeyUpdate({
        set: {
          canView: patch.view ?? null,
          canCreate: patch.create ?? null,
          canEdit: patch.edit ?? null,
          canDelete: patch.delete ?? null,
        },
      });
  }
}

export function checkEffectivePermission(
  perms: EffectivePermissions,
  module: PermissionModule,
  action: PermissionAction,
) {
  return hasPermission(perms, module, action);
}

export { canManageTeamUsers, EDITABLE_BUILTIN_ROLES };
export type { BuiltinTenantRole };
