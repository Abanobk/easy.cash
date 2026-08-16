import { Button, type ButtonProps } from "@/components/ui/button";
import type { PermissionModule } from "@shared/permissions";
import { useModulePermissions } from "@/hooks/usePermissions";

type AddActionButtonProps = ButtonProps & {
  module: PermissionModule;
};

/** زر إضافة يظهر فقط لمن لديه صلاحية create على الوحدة */
export function AddActionButton({ module, children, ...props }: AddActionButtonProps) {
  const { canCreate, isLoading } = useModulePermissions(module);
  if (isLoading || !canCreate) return null;
  return <Button {...props}>{children}</Button>;
}
