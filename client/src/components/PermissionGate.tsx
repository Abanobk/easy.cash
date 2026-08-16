import { ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import type { PermissionAction, PermissionModule } from "@shared/permissions";

interface PermissionGateProps {
  module: PermissionModule;
  action?: PermissionAction;
  /** عند التحديد تُطبَّق صلاحيات الشاشة المخصّصة إن وُجدت */
  featureKey?: string;
  children: ReactNode;
  fallback?: ReactNode;
}

/** يعرض المحتوى فقط إذا كان للمستخدم الصلاحية المطلوبة */
export default function PermissionGate({
  module,
  action = "view",
  featureKey,
  children,
  fallback = null,
}: PermissionGateProps) {
  const { can, canFeature, bypass, isLoading } = usePermissions();
  if (isLoading) return null;
  const allowed = bypass
    || (featureKey ? canFeature(featureKey, action) : can(module, action));
  if (allowed) return <>{children}</>;
  return <>{fallback}</>;
}
