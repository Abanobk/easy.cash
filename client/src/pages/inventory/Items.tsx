import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import ERPLayout from "@/components/ERPLayout";
import { DataTable, statusBadge } from "@/components/DataTable";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AlertTriangle, CheckSquare, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEntityAllowed } from "@/hooks/useEntityPermission";
import { tenantPath, useTenantSlug } from "@/lib/tenant";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const MEGA_ITEM_TYPES = [
  "وحدة مخزنية",
  "وحدة خدمية",
  "مادة خام",
  "منتج وسيط",
  "منتج تام",
  "مجموعة / طقم",
  "صنف مركب",
  "صنف وكالة",
] as const;

/** قائمة الأصناف (Mega ItemsList) — التعديل في بطاقة صفحة كاملة */
export default function Items() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [categoryId, setCategoryId] = useState("");
  const [altCategoryId, setAltCategoryId] = useState("");
  const [itemType, setItemType] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const canEdit = useEntityAllowed("inventory", "item", "edit");
  const canDelete = useEntityAllowed("inventory", "item", "deleteCancel");
  const tenantSlug = useTenantSlug();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  useEffect(() => setPage(1), [debouncedSearch, categoryId, altCategoryId, itemType]);
  const { data, isLoading, refetch } = trpc.items.list.useQuery({
    page,
    limit: 20,
    search: debouncedSearch,
    categoryId: categoryId ? Number(categoryId) : undefined,
    altCategoryId: altCategoryId ? Number(altCategoryId) : undefined,
    itemType: itemType || undefined,
  });
  const { data: categories } = trpc.items.categories.useQuery();
  const rows = data?.rows || [];
  const categoryName = (id: unknown) => {
    if (id == null || id === "") return "—";
    const c = (categories || []).find((r: any) => r.id === Number(id));
    return c?.name || String(id);
  };

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
    <ERPLayout title="قائمة الاصناف">
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

      {/* Mega ItemsList filters: باركود/صنف · الفئة · فئة بديلة · نوع الصنف */}
      <div className="mb-3 flex flex-wrap gap-3 items-end rounded-lg border bg-slate-50 p-3">
        <div className="space-y-1">
          <Label className="text-xs font-bold">الفئة</Label>
          <Select value={categoryId || "all"} onValueChange={(v) => setCategoryId(v === "all" ? "" : v)}>
            <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="كل الفئات" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفئات</SelectItem>
              {(categories || []).map((c: any) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-bold">فئة بديلة</Label>
          <Select value={altCategoryId || "all"} onValueChange={(v) => setAltCategoryId(v === "all" ? "" : v)}>
            <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="كل البديلة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل البديلة</SelectItem>
              {(categories || []).map((c: any) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-bold">نوع الصنف</Label>
          <Select value={itemType || "all"} onValueChange={(v) => setItemType(v === "all" ? "" : v)}>
            <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="كل الأنواع" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأنواع</SelectItem>
              {MEGA_ITEM_TYPES.map((x) => (
                <SelectItem key={x} value={x}>{x}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={() => { setCategoryId(""); setAltCategoryId(""); setItemType(""); setSearch(""); setPage(1); }}
        >
          تفريغ
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
        addEntity={{ moduleKey: "inventory", entityKey: "item" }}
        rowEntity={{ moduleKey: "inventory", entityKey: "item" }}
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
          { key: "name", label: "الاسم" },
          {
            key: "barcode",
            label: "الباركود",
            className: "w-32",
            render: (row) => row.barcode || <span className="text-slate-400">—</span>,
          },
          {
            key: "categoryId",
            label: "الفئة",
            render: (row) => categoryName(row.categoryId),
          },
          {
            key: "altCategoryId",
            label: "فئة بديلة",
            render: (row) => categoryName((row as any).altCategoryId),
          },
          {
            key: "itemType",
            label: "نوع الصنف",
            render: (row) => (row as any).itemType || "—",
          },
          { key: "code", label: "الكود", className: "w-28" },
          { key: "unit", label: "وحدة القياس الاساسية", className: "w-28" },
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
