import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Edit, Trash2 } from "lucide-react";
import type { PermissionModule } from "@shared/permissions";
import { useModulePermissions } from "@/hooks/usePermissions";

type EntityRowActionsProps = {
  module: PermissionModule;
  onEdit?: () => void;
  onDelete?: () => void;
  deleteConfirm?: string;
  extra?: ReactNode;
};

/** أزرار تعديل/حذف الصفوف مع احترام صلاحيات الوحدة */
export function EntityRowActions({
  module,
  onEdit,
  onDelete,
  deleteConfirm = "حذف السجل؟",
  extra,
}: EntityRowActionsProps) {
  const { canEdit, canDelete, isLoading } = useModulePermissions(module);
  if (isLoading) return null;

  const handleDelete = () => {
    if (confirm(deleteConfirm)) onDelete?.();
  };

  return (
    <>
      {extra}
      {canEdit && onEdit && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 text-blue-700 hover:bg-blue-100 hover:text-blue-900"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <Edit size={16} strokeWidth={2.4} />
        </Button>
      )}
      {canDelete && onDelete && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 text-red-600 hover:bg-red-100 hover:text-red-800"
          onClick={(e) => {
            e.stopPropagation();
            handleDelete();
          }}
        >
          <Trash2 size={16} strokeWidth={2.4} />
        </Button>
      )}
    </>
  );
}
