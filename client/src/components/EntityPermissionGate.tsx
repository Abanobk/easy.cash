import { ReactNode } from "react";
import { useEntityAllowed, useEntityPermissions } from "@/hooks/useEntityPermission";
import type { PermActionKey } from "@shared/permission-tree";

interface EntityPermissionGateProps {
  moduleKey: string;
  entityKey: string;
  action: PermActionKey;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * طبقة إضافية فوق PermissionGate — بتتحقق من الشجرة التفصيلية (قسم ← عنصر ← أفعال).
 * استخدمها جوه PermissionGate الموجود أصلاً، مش بدل منه، عشان النظامين يشتغلوا مع بعض:
 * القديم بيحدد القسم عمومًا، والشجرة دي بتدقّق فعل بعينه على عنصر بعينه.
 */
export default function EntityPermissionGate({
  moduleKey,
  entityKey,
  action,
  children,
  fallback = null,
}: EntityPermissionGateProps) {
  const { isLoading } = useEntityPermissions();
  const allowed = useEntityAllowed(moduleKey, entityKey, action);
  if (isLoading) return null;
  if (allowed) return <>{children}</>;
  return <>{fallback}</>;
}
