import { and, eq } from "drizzle-orm";
import {
  type ModulePermission,
  type PermissionModule,
  hasPermission,
  isEditableRoleKey,
} from "../shared/permissions";
import { featureKeyToPermissionModule } from "../shared/feature-screens";
import { tenantScreenPermissions } from "../drizzle/schema";
import { getDb } from "./db";
import { getRolePermissionsForTenant } from "./permissions-service";

export type ScreenPermissionMap = Record<string, ModulePermission>;

export async function getScreenOverridesForRole(
  tenantId: number,
  role: string,
): Promise<ScreenPermissionMap> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db
    .select()
    .from(tenantScreenPermissions)
    .where(and(eq(tenantScreenPermissions.tenantId, tenantId), eq(tenantScreenPermissions.role, role)));
  const map: ScreenPermissionMap = {};
  for (const row of rows) {
    map[row.featureKey] = {
      view: Boolean(row.canView),
      create: Boolean(row.canCreate),
      edit: Boolean(row.canEdit),
      delete: Boolean(row.canDelete),
    };
  }
  return map;
}

export async function getEffectiveScreenPermissions(
  tenantId: number,
  role: string,
  modulePermissions: Record<PermissionModule, ModulePermission>,
  featureKeys: string[],
): Promise<ScreenPermissionMap> {
  const overrides = await getScreenOverridesForRole(tenantId, role);
  const result: ScreenPermissionMap = {};
  for (const featureKey of featureKeys) {
    const module = featureKeyToPermissionModule(featureKey);
    const base = module ? modulePermissions[module] : { view: true, create: false, edit: false, delete: false };
    const custom = overrides[featureKey];
    result[featureKey] = custom
      ? { ...base, ...custom }
      : { ...base };
  }
  return result;
}

export function canAccessFeatureScreen(
  modulePermissions: Record<PermissionModule, ModulePermission>,
  screenOverrides: ScreenPermissionMap,
  featureKey: string,
  action: keyof ModulePermission = "view",
): boolean {
  const custom = screenOverrides[featureKey];
  if (custom) return custom[action];
  const module = featureKeyToPermissionModule(featureKey);
  if (!module) return true;
  return hasPermission(modulePermissions, module, action);
}

export async function saveScreenPermissionsForRole(
  tenantId: number,
  role: string,
  screens: Record<string, ModulePermission>,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!isEditableRoleKey(role)) throw new Error("صلاحيات المدير كاملة ولا تُعدّل");

  const modulePerms = await getRolePermissionsForTenant(tenantId, role);

  for (const [featureKey, desired] of Object.entries(screens)) {
    const module = featureKeyToPermissionModule(featureKey);
    const base = module ? modulePerms[module] : { view: true, create: false, edit: false, delete: false };
    const differs =
      desired.view !== base.view ||
      desired.create !== base.create ||
      desired.edit !== base.edit ||
      desired.delete !== base.delete;

    if (!differs) {
      await db
        .delete(tenantScreenPermissions)
        .where(
          and(
            eq(tenantScreenPermissions.tenantId, tenantId),
            eq(tenantScreenPermissions.role, role),
            eq(tenantScreenPermissions.featureKey, featureKey),
          ),
        );
      continue;
    }

    await db
      .insert(tenantScreenPermissions)
      .values({
        tenantId,
        role,
        featureKey,
        canView: desired.view,
        canCreate: desired.create,
        canEdit: desired.edit,
        canDelete: desired.delete,
      })
      .onDuplicateKeyUpdate({
        set: {
          canView: desired.view,
          canCreate: desired.create,
          canEdit: desired.edit,
          canDelete: desired.delete,
        },
      });
  }
}
