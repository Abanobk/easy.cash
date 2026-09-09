import { trpc } from "@/lib/trpc";
import type { PermActionKey } from "@shared/permission-tree";

/**
 * صلاحيات الشجرة التفصيلية للمستخدم الحالي — المرجع الوحيد لإظهار/إخفاء الأزرار.
 * عنصر مالوش صف صراحة لدور المستخدم = ممنوع، بدون أي استثناء أو رجوع لنظام قديم.
 */
export function useEntityPermissions() {
  const query = trpc.permissions.myEntityPermissions.useQuery(undefined, { staleTime: 60_000 });
  return {
    isLoading: query.isLoading,
    bypass: query.data?.bypass ?? true,
    entities: query.data?.entities ?? ({} as Record<string, string[]>),
  };
}

export function useEntityAllowed(moduleKey: string, entityKey: string, action: PermActionKey): boolean {
  const { bypass, entities } = useEntityPermissions();
  if (bypass) return true;
  const allowed = entities[`${moduleKey}::${entityKey}`];
  return allowed ? allowed.includes(action) : false;
}
