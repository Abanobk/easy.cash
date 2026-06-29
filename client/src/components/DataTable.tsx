import { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";

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
  actions?: (row: T) => ReactNode;
  emptyMessage?: string;
  headerExtra?: ReactNode;
}

export function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: "مسودة", className: "bg-gray-100 text-gray-700 border-gray-200" },
    confirmed: { label: "مؤكد", className: "bg-blue-100 text-blue-700 border-blue-200" },
    paid: { label: "مدفوع", className: "bg-green-100 text-green-700 border-green-200" },
    partial: { label: "جزئي", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    cancelled: { label: "ملغي", className: "bg-red-100 text-red-700 border-red-200" },
    pending: { label: "معلق", className: "bg-orange-100 text-orange-700 border-orange-200" },
    posted: { label: "مرحّل", className: "bg-green-100 text-green-700 border-green-200" },
    active: { label: "نشط", className: "bg-green-100 text-green-700 border-green-200" },
    inactive: { label: "غير نشط", className: "bg-gray-100 text-gray-700 border-gray-200" },
    terminated: { label: "منتهي", className: "bg-red-100 text-red-700 border-red-200" },
    approved: { label: "معتمد", className: "bg-blue-100 text-blue-700 border-blue-200" },
    received: { label: "مستلم", className: "bg-green-100 text-green-700 border-green-200" },
    delivered: { label: "مسلّم", className: "bg-green-100 text-green-700 border-green-200" },
    present: { label: "حاضر", className: "bg-green-100 text-green-700 border-green-200" },
    absent: { label: "غائب", className: "bg-red-100 text-red-700 border-red-200" },
    late: { label: "متأخر", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    leave: { label: "إجازة", className: "bg-blue-100 text-blue-700 border-blue-200" },
    holiday: { label: "عطلة", className: "bg-purple-100 text-purple-700 border-purple-200" },
    deposited: { label: "مودع", className: "bg-blue-100 text-blue-700 border-blue-200" },
    cleared: { label: "مقاص", className: "bg-green-100 text-green-700 border-green-200" },
    bounced: { label: "مرتد", className: "bg-red-100 text-red-700 border-red-200" },
    given: { label: "ممنوح", className: "bg-blue-100 text-blue-700 border-blue-200" },
    received_loan: { label: "مستلم", className: "bg-purple-100 text-purple-700 border-purple-200" },
    overdue: { label: "متأخر", className: "bg-red-100 text-red-700 border-red-200" },
  };
  const info = map[status] || { label: status, className: "bg-gray-100 text-gray-600 border-gray-200" };
  return <Badge variant="outline" className={`text-xs font-medium ${info.className}`}>{info.label}</Badge>;
}

export function DataTable<T extends { id?: number | string }>({
  title, columns, data, isLoading, total = 0, page = 1,
  onPageChange, limit = 20, search, onSearch, onAdd, addLabel = "إضافة جديد",
  actions, emptyMessage = "لا توجد بيانات", headerExtra,
}: DataTableProps<T>) {
  const totalPages = Math.ceil(total / limit);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3 border-b border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-800">{title}</h2>
            {total > 0 && <p className="text-xs text-slate-400 mt-0.5">{total.toLocaleString("ar-EG")} سجل</p>}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {headerExtra}
            {onSearch !== undefined && (
              <div className="relative">
                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="بحث..."
                  value={search || ""}
                  onChange={e => onSearch(e.target.value)}
                  className="pr-8 h-8 text-sm w-48 border-slate-200"
                />
              </div>
            )}
            {onAdd && (
              <Button onClick={onAdd} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-8 gap-1.5 text-xs">
                <Plus size={14} />
                {addLabel}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {columns.map(col => (
                  <th key={col.key} className={`px-4 py-3 text-right text-xs font-semibold text-slate-600 ${col.className || ""}`}>
                    {col.label}
                  </th>
                ))}
                {actions && <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 w-24">إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={columns.length + (actions ? 1 : 0)} className="py-16 text-center">
                    <Loader2 size={24} className="animate-spin text-blue-500 mx-auto" />
                  </td>
                </tr>
              ) : !data || data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (actions ? 1 : 0)} className="py-16 text-center text-slate-400 text-sm">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                data.map((row, i) => (
                  <tr key={(row as any).id || i} className="border-b border-slate-50 hover:bg-blue-50/30 transition-colors">
                    {columns.map(col => (
                      <td key={col.key} className={`px-4 py-3 text-slate-700 ${col.className || ""}`}>
                        {col.render ? col.render(row) : (row as any)[col.key] ?? "-"}
                      </td>
                    ))}
                    {actions && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">{actions(row)}</div>
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <span className="text-xs text-slate-500">
              صفحة {page} من {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline" size="sm"
                onClick={() => onPageChange?.(page - 1)}
                disabled={page <= 1}
                className="h-7 w-7 p-0"
              >
                <ChevronRight size={14} />
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={() => onPageChange?.(page + 1)}
                disabled={page >= totalPages}
                className="h-7 w-7 p-0"
              >
                <ChevronLeft size={14} />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
