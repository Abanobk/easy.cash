import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import ERPLayout from "@/components/ERPLayout";
import { DataTable, statusBadge } from "@/components/DataTable";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AlertTriangle, CheckSquare, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useModulePermissions } from "@/hooks/usePermissions";
import { tenantPath, useTenantSlug } from "@/lib/tenant";

/** قائمة الأصناف (Mega ItemsList) — التعديل في بطاقة صفحة كاملة */
export default function Items() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const { canEdit, canDelete } = useModulePermissions("inventory");
  const tenantSlug = useTenantSlug();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.items.list.useQuery({ page, limit: 20, search });
  const rows = data?.rows || [];

  const deleteMut = trpc.items.delete.useMutation({
    onSuccess: () => {
      toast.success("تم حذف الصنف");
      refetch();
    },
    onError: (err) => toast.error(err.message || "فشل حذف الصنف"),
  });

  const bulkPurgeMut = trpc.items.bulkPurge.useMutation({
    onSuccess: (res) => {
      toast.success(`تم تصفير/حذف ${res.purged} صنف (حُذف نهائياً: ${res.deleted})`);
      if (res.failed) toast.message((res.errors || []).slice(0, 2).join(" · "));
      setSelectedIds(new Set());
      void refetch();
      void utils.items.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const pageIds = useMemo(
    () => rows.map((r) => Number(r.id)).filter((id) => id > 0),
    [rows],
  );
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  const toggleOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  };

  const selectAllResults = async () => {
    try {
      const all = await utils.items.all.fetch();
      const ids = (all || []).map((r: { id: number }) => Number(r.id)).filter((id: number) => id > 0);
      setSelectedIds(new Set(ids));
      toast.message(`تم تحديد ${ids.length} صنف`);
    } catch (e: any) {
      toast.error(e?.message || "تعذر تحديد كل الأصناف");
    }
  };

  const handleBulkDelete = () => {
    const ids = [...selectedIds];
    if (!ids.length) return toast.error("حدّد أصنافاً أولاً");
    if (!canDelete) return toast.error("ليس لديك صلاحية حذف الأصناف");
    if (!confirm(`حذف ${ids.length} صنف مع تصفير رصيد أول المدة والمخازن؟\n\nبعدها ارفع إكسل نظيف من مخزون أول المدة.`)) return;
    if (!confirm("تأكيد أخير: الأصناف اللي ليها فواتير هيتصفر رصيدها ومش هتتمسح.")) return;
    bulkPurgeMut.mutate({ itemIds: ids, confirm: "PURGE_ITEMS" });
  };

  const openItem = (id: number | "new") => {
    navigate(tenantPath(tenantSlug, `/items/${id}`));
  };

  return (
    <ERPLayout title="قائمة الأصناف">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-4">
        <p className="text-sm text-amber-900 flex-1 min-w-[12rem]">
          مسح مجمع: حدّد أصنافاً من الجدول أو استخدم تحديد الكل، ثم حذف المحدد.
        </p>
        <Button variant="outline" size="sm" className="gap-1.5 bg-white border-amber-300" onClick={togglePage} disabled={!pageIds.length}>
          <CheckSquare size={14} />
          {allPageSelected ? "إلغاء تحديد الصفحة" : "تحديد الكل (الصفحة)"}
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 bg-white border-amber-300" onClick={() => void selectAllResults()} disabled={!data?.total}>
          تحديد كل النتائج ({data?.total ?? 0})
        </Button>
        <Button
          variant="destructive"
          size="sm"
          className="gap-1.5"
          disabled={!selectedIds.size || bulkPurgeMut.isPending || !canDelete}
          onClick={handleBulkDelete}
        >
          <Trash2 size={14} />
          {bulkPurgeMut.isPending ? "جاري الحذف..." : `حذف المحدد (${selectedIds.size})`}
        </Button>
      </div>

      <DataTable
        title="الأصناف"
        data={rows}
        isLoading={isLoading}
        total={data?.total}
        page={page}
        onPageChange={(p) => {
          setPage(p);
        }}
        search={search}
        onSearch={setSearch}
        onAdd={() => openItem("new")}
        addLabel="صنف جديد"
        permissionModule="inventory"
        onEdit={(row) => {
          if (!canEdit) {
            toast.error("ليس لديك صلاحية تعديل الأصناف");
            return;
          }
          openItem(row.id!);
        }}
        onDelete={(row) => deleteMut.mutate(row.id!)}
        deleteConfirm="حذف الصنف؟"
        columns={[
          {
            key: "_sel",
            label: "",
            className: "w-10",
            render: (row) => (
              <input
                type="checkbox"
                className="h-4 w-4 accent-blue-600"
                checked={selectedIds.has(Number(row.id))}
                onChange={() => toggleOne(Number(row.id))}
                onClick={(e) => e.stopPropagation()}
                title="تحديد"
              />
            ),
          },
          { key: "code", label: "الكود", className: "w-28" },
          {
            key: "barcode",
            label: "الباركود",
            className: "w-32",
            render: (row) => row.barcode || <span className="text-slate-400">—</span>,
          },
          { key: "name", label: "اسم الصنف" },
          { key: "unit", label: "الوحدة", className: "w-20" },
          {
            key: "purchasePrice",
            label: "سعر الشراء",
            render: (row) => `${Number(row.purchasePrice).toLocaleString("en-US")} ج.م`,
          },
          {
            key: "salePrice",
            label: "سعر البيع",
            render: (row) => `${Number(row.salePrice).toLocaleString("en-US")} ج.م`,
          },
          {
            key: "currentStock",
            label: "المخزون",
            render: (row) => (
              <div className="flex items-center gap-1">
                <span
                  className={
                    Number(row.currentStock) <= Number(row.minStock) && Number(row.minStock) > 0
                      ? "text-red-600 font-semibold"
                      : "text-slate-700"
                  }
                >
                  {Number(row.currentStock).toLocaleString("en-US")}
                </span>
                {Number(row.currentStock) <= Number(row.minStock) && Number(row.minStock) > 0 && (
                  <AlertTriangle size={12} className="text-red-500" />
                )}
              </div>
            ),
          },
          {
            key: "isActive",
            label: "الحالة",
            render: (row) => statusBadge(row.isActive ? "active" : "inactive"),
          },
          {
            key: "trackSerial",
            label: "سيريال",
            render: (row) => (row.trackSerial ? <Badge variant="outline" className="text-xs">نعم</Badge> : "—"),
          },
        ]}
      />
    </ERPLayout>
  );
}
