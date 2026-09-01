import { trpc } from "@/lib/trpc";
import { CORE_MIGRATION_EXEMPT_MODULES, isCoreMigrated, type PermActionKey } from "@shared/permission-tree";

/**
 * صلاحيات الشجرة التفصيلية للمستخدم الحالي — تُستخدم لإخفاء/تعطيل الأزرار في الواجهة
 * كطبقة إضافية فوق PermissionGate القديم (module × 4 أفعال)، مش بديل عنه.
 *
 * العنصر اللي المدير لسه ما ظبطوش صراحة لدور المستخدم يُعتبر "غير مقيّد" فتفضل الأزرار
 * ظاهرة زي ما هي — نفس منطق assertEntityAction في السيرفر بالظبط. الاستثناء: موديولات
 * "أدوات الذكاء الاصطناعي/تكليف شحنة" (CORE_MIGRATION_EXEMPT_MODULES) بتتقفل افتراضيًا
 * أول ما الدور يبقى متحكم فيه بالتفصيل من قسم أساسي واحد على الأقل — راجع
 * shared/permission-tree.ts للتفاصيل.
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
  if (!allowed) {
    if (CORE_MIGRATION_EXEMPT_MODULES.has(moduleKey) && isCoreMigrated(Object.keys(entities))) {
      return false; // دور متحكم فيه بالتفصيل ومحدش فتحله في الأداة الإضافية دي — يتقفل
    }
    return true; // لسه مش متظبط والدور مش متحكم فيه بالتفصيل أصلاً
  }
  return allowed.includes(action);
}
