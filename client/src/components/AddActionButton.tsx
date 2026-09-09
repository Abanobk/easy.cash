import { Button, type ButtonProps } from "@/components/ui/button";
import { useEntityAllowed } from "@/hooks/useEntityPermission";
import type { PermActionKey } from "@shared/permission-tree";

type AddActionButtonProps = ButtonProps & {
  moduleKey: string;
  entityKey: string;
  action?: PermActionKey;
};

/** زر إضافة يظهر فقط لمن لديه صلاحية "add" على العنصر في الشجرة التفصيلية */
export function AddActionButton({ moduleKey, entityKey, action = "add", children, ...props }: AddActionButtonProps) {
  const allowed = useEntityAllowed(moduleKey, entityKey, action);
  if (!allowed) return null;
  return <Button {...props}>{children}</Button>;
}
