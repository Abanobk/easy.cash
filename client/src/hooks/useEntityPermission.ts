import { trpc } from "@/lib/trpc";
import type { PermActionKey } from "@shared/permission-tree";

/**
 * صلاحيات الشجرة التفصيلية للمستخدم الحالي — تُستخدم لإخفاء/تعطيل الأزرار في الواجهة
 * كطبقة إضافية فوق PermissionGate القديم (module × 4 أفعال)، مش بديل عنه.
 *
 * العنصر اللي المدير لسه ما ظبطوش صراحة لدور المستخدم يُعتبر "غير مقيّد" فتفضل الأزرار
 * ظاهرة زي ما هي — نفس منطق assertEntityAction في السيرفر بالظبط.
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
  if (!allowed) return true; // لسه مش متظبط لهذا الدور
  return allowed.includes(action);
}
