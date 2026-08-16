import { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { EntityRowActions } from "@/components/EntityRowActions";
import type { PermissionAction, PermissionModule } from "@shared/permissions";

interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  title: string;
  columns: Column<T>[];
  data: T[] | undefined;
  isLoading?: boolean;
  total?: number;
  page?: number;
  onPageChange?: (page: number) => void;
  limit?: number;
  search?: string;
  onSearch?: (v: string) => void;
  onAdd?: () => void;
  addLabel?: string;
  addPermission?: { module: PermissionModule; action?: PermissionAction; featureKey?: string };
  addFeatureKey?: string;
  permissionModule?: PermissionModule;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  deleteConfirm?: string | ((row: T) => string);
  extraRowActions?: (row: T) => ReactNode;
  actions?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  headerExtra?: ReactNode;
}

export function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: "مسودة", className: "bg-slate-200 text-slate-800 border-slate-300" },
    confirmed: { label: "مؤكد", className: "bg-blue-200 text-blue-900 border-blue-300" },
    paid: { label: "مدفوع", className: "bg-emerald-200 text-emerald-900 border-emerald-300" },
    partial: { label: "جزئي", className: "bg-amber-200 text-amber-950 border-amber-300" },
    cancelled: { label: "ملغي", className: "bg-red-200 text-red-900 border-red-300" },
    pending: { label: "معلق", className: "bg-orange-200 text-orange-950 border-orange-300" },
    posted: { label: "مرحّل", className: "bg-emerald-200 text-emerald-900 border-emerald-300" },
    active: { label: "نشط", className: "bg-emerald-200 text-emerald-900 border-emerald-300" },
    inactive: { label: "غير نشط", className: "bg-slate-200 text-slate-700 border-slate-300" },
    terminated: { label: "منتهي", className: "bg-red-200 text-red-900 border-red-300" },
    approved: { label: "معتمد", className: "bg-blue-200 text-blue-900 border-blue-300" },
    received: { label: "مستلم", className: "bg-emerald-200 text-emerald-900 border-emerald-300" },
    delivered: { label: "مسلّم", className: "bg-emerald-200 text-emerald-900 border-emerald-300" },
    present: { label: "حاضر", className: "bg-emerald-200 text-emerald-900 border-emerald-300" },
    absent: { label: "غائب", className: "bg-red-200 text-red-900 border-red-300" },
    late: { label: "متأخر", className: "bg-amber-200 text-amber-950 border-amber-300" },
    leave: { label: "إجازة", className: "bg-blue-200 text-blue-900 border-blue-300" },
    holiday: { label: "عطلة", className: "bg-violet-200 text-violet-900 border-violet-300" },
    deposited: { label: "مودع", className: "bg-blue-200 text-blue-900 border-blue-300" },
    cleared: { label: "مقاص", className: "bg-emerald-200 text-emerald-900 border-emerald-300" },
    bounced: { label: "مرتد", className: "bg-red-200 text-red-900 border-red-300" },
    given: { label: "ممنوح", className: "bg-blue-200 text-blue-900 border-blue-300" },
    received_loan: { label: "مستلم", className: "bg-violet-200 text-violet-900 border-violet-300" },
    overdue: { label: "متأخر", className: "bg-red-200 text-red-900 border-red-300" },
  };
  const info = map[status] || { label: status, className: "bg-slate-200 text-slate-700 border-slate-300" };
  return <Badge variant="outline" className={`text-sm font-extrabold px-2.5 py-0.5 ${info.className}`}>{info.label}</Badge>;
}

export function DataTable<T extends { id?: number | string }>({
  title, columns, data, isLoading, total = 0, page = 1,
  onPageChange, limit = 20, search, onSearch, onAdd, addLabel = "إضافة جديد",
  addPermission, addFeatureKey, permissionModule, onEdit, onDelete, deleteConfirm,
  extraRowActions, actions, emptyMessage = "لا توجد بيانات", headerExtra, onRowClick,
}: DataTableProps<T>) {
  const totalPages = Math.ceil(total / limit);
  const { can, canFeature, bypass, isLoading: permsLoading } = usePermissions();
  const effectiveAddPermission = addPermission ?? (permissionModule ? { module: permissionModule, action: "create" as const, featureKey: addFeatureKey } : undefined);
  const canAdd = onAdd && !permsLoading && (bypass || !effectiveAddPermission || (
    effectiveAddPermission.featureKey
      ? canFeature(effectiveAddPermission.featureKey, effectiveAddPermission.action ?? "create")
      : can(effectiveAddPermission.module, effectiveAddPermission.action ?? "create")
  ));

  const renderActions = (row: T) => {
    const builtIn = (onEdit || onDelete) && permissionModule ? (
      <EntityRowActions
        module={permissionModule}
        onEdit={onEdit ? () => onEdit(row) : undefined}
        onDelete={onDelete ? () => onDelete(row) : undefined}
        deleteConfirm={typeof deleteConfirm === "function" ? deleteConfirm(row) : deleteConfirm}
        extra={extraRowActions?.(row)}
      />
    ) : extraRowActions ? (
      extraRowActions(row)
    ) : null;

    if (actions) {
      return (
        <div className="flex items-center gap-1">
          {builtIn}
          {actions(row)}
        </div>
      );
    }
    if (builtIn) {
      return <div className="flex items-center gap-1">{builtIn}</div>;
    }
    return null;
  };

  const hasActions = !!(actions || onEdit || onDelete || extraRowActions);

  return (
    <Card className="erp-data-card border-0">
      <CardHeader className="pb-4 border-b-2 border-slate-200 bg-gradient-to-l from-slate-50 to-white">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">{title}</h2>
            {total > 0 && <p className="text-[15px] font-bold text-slate-600 mt-1">{total.toLocaleString("en-US")} سجل</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {headerExtra}
            {onSearch !== undefined && (
              <div className="relative">
                <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <Input
                  placeholder="بحث..."
                  value={search || ""}
                  onChange={e => onSearch(e.target.value)}
                  className="pr-9 h-11 text-[15px] font-semibold w-60 border-slate-300 text-slate-900 placeholder:text-slate-400"
                />
              </div>
            )}
            {canAdd && (
              <Button onClick={onAdd} className="bg-blue-600 hover:bg-blue-700 text-white h-11 gap-2 text-[15px] font-extrabold px-5 shadow-md shadow-blue-600/30">
                <Plus size={18} strokeWidth={2.5} />
                {addLabel}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="erp-table w-full">
            <thead>
              <tr className="border-b border-blue-200">
                {columns.map(col => (
                  <th key={col.key} className={`px-4 py-4 text-right ${col.className || ""}`}>
                    {col.label}
                  </th>
                ))}
                {hasActions && <th className="px-4 py-4 text-right w-28">إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={columns.length + (hasActions ? 1 : 0)} className="py-16 text-center">
                    <Loader2 size={28} className="animate-spin text-blue-600 mx-auto" />
                  </td>
                </tr>
              ) : !data || data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (actions ? 1 : 0)} className="py-16 text-center text-slate-600 text-base font-bold">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                data.map((row, i) => (
                  <tr
                    key={(row as any).id || i}
                    className={`border-b border-slate-200 transition-colors ${
                      i % 2 === 1 ? "bg-slate-50" : "bg-white"
                    } ${onRowClick ? "cursor-pointer" : ""}`}
                    onClick={() => onRowClick?.(row)}
                  >
                    {columns.map(col => (
                      <td key={col.key} className={`px-4 py-4 ${col.className || ""}`}>
                        {col.render ? col.render(row) : (row as any)[col.key] ?? "-"}
                      </td>
                    ))}
                    {hasActions && (
                      <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                        {renderActions(row)}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3.5 border-t-2 border-slate-200 bg-slate-50">
            <span className="text-sm font-bold text-slate-700">
              صفحة {page} من {totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline" size="sm"
                onClick={() => onPageChange?.(page - 1)}
                disabled={page <= 1}
                className="h-9 w-9 p-0 border-slate-300"
              >
                <ChevronRight size={16} />
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={() => onPageChange?.(page + 1)}
                disabled={page >= totalPages}
                className="h-9 w-9 p-0 border-slate-300"
              >
                <ChevronLeft size={16} />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
