import { trpc } from "@/lib/trpc";
import {
  hasPermission,
  permissionModuleFromPath,
  type PermissionAction,
  type PermissionModule,
  type EffectivePermissions,
  type ModulePermission,
  MEGA_MODULE_TO_PERMISSION,
} from "@shared/permissions";
import { FEATURE_REGISTRY } from "@/config/erp-navigation";
import { featureKeyToPermissionModule } from "@shared/feature-screens";

export function usePermissions() {
  const query = trpc.permissions.my.useQuery(undefined, {
    staleTime: 60_000,
  });

  const permissions = query.data?.permissions;
  const screenOverrides = query.data?.screenOverrides as Record<string, ModulePermission> | undefined;
  const bypass = query.data?.bypass ?? false;
  const role = query.data?.role ?? "user";

  const can = (module: PermissionModule, action: PermissionAction = "view") => {
    if (bypass || !permissions) return true;
    return hasPermission(permissions, module, action);
  };

  const canFeature = (featureKey: string, action: PermissionAction = "view") => {
    if (bypass || !permissions) return true;
    const override = screenOverrides?.[featureKey];
    if (override) return override[action];
    const module = featureKeyToPermissionModule(featureKey);
    if (!module) return true;
    return hasPermission(permissions, module, action);
  };

  const canAccessPath = (path?: string, featureKey?: string) => {
    if (bypass || !permissions) return true;

    if (featureKey) {
      return canFeature(featureKey, "view");
    }

    let module: PermissionModule | null = null;
    if (featureKey && FEATURE_REGISTRY[featureKey]) {
      module = featureKeyToPermissionModule(featureKey)
        ?? MEGA_MODULE_TO_PERMISSION[FEATURE_REGISTRY[featureKey].module]
        ?? null;
    }
    if (!module && path) {
      module = permissionModuleFromPath(path);
    }
    if (!module) return true;
    return hasPermission(permissions, module, "view");
  };

  return {
    isLoading: query.isLoading,
    role,
    bypass,
    permissions: permissions as EffectivePermissions | undefined,
    screenOverrides,
    can,
    canFeature,
    canAccessPath,
    refetch: query.refetch,
  };
}

/** صلاحيات وحدة واحدة — للاستخدام في الجداول والنماذج */
export function useModulePermissions(module: PermissionModule) {
  const { can, bypass, isLoading } = usePermissions();
  if (isLoading) {
    return {
      isLoading: true,
      canView: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
    };
  }
  if (bypass) {
    return {
      isLoading: false,
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
    };
  }
  return {
    isLoading: false,
    canView: can(module, "view"),
    canCreate: can(module, "create"),
    canEdit: can(module, "edit"),
    canDelete: can(module, "delete"),
  };
}
