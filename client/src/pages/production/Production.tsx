/**
 * شاشة الإنتاج — مطابقة سلوك Mega Cash:
 * - /Production/ProductionOrder.aspx (أمر إنتاج: حفظ + اعتماد + خامات مطلقة)
 * - /Production/ProductionOrdersList.aspx (قائمة)
 * ملاحظة: Mega ليس فيها قائمة منفصلة باسم «الخلطات».
 */
import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Plus, Factory, Trash2, Loader2, Search, CheckCircle2, XCircle, Pencil, Eye, ChevronsUpDown,
} from "lucide-react";
import { toast } from "sonner";
import PermissionGate from "@/components/PermissionGate";
import { usePermissions } from "@/hooks/usePermissions";

type Tab = "orders" | "new";
type MaterialRow = { itemId: string; quantity: string; notes: string };

type ItemOpt = {
  id: number; name: string; code?: string | null; unit?: string | null;
  averageCost?: string | null; purchasePrice?: string | null; currentStock?: string | null; barcode?: string | null;
};

function statusLabel(s: string) {
  // تسميات Mega: معلق / معتمد / ملغي (+ مكتمل عندنا لاستلام التام)
  return ({ draft: "معلق", in_progress: "معتمد", completed: "مكتمل", cancelled: "ملغي" } as Record<string, string>)[s] || s;
}
function statusClass(s: string) {
  return ({
    draft: "bg-slate-100 text-slate-800 ring-1 ring-slate-200",
    in_progress: "bg-amber-100 text-amber-950 ring-1 ring-amber-200",
    completed: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200",
    cancelled: "bg-red-100 text-red-800 ring-1 ring-red-200",
  } as Record<string, string>)[s] || "bg-slate-100 text-slate-700";
}
function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 3 });
}
function money(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ItemSearchSelect({
  items, value, onChange, placeholder = "ابحث بالكود أو الاسم أو الباركود...",
  excludeId,
}: {
  items: ItemOpt[]; value: string; onChange: (id: string) => void;
  placeholder?: string; excludeId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = items.find((i) => String(i.id) === value);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items
      .filter((i) => !excludeId || String(i.id) !== excludeId)
      .filter((i) => {
        if (!term) return true;
        return (
          i.name.toLowerCase().includes(term)
          || String(i.code || "").toLowerCase().includes(term)
          || String(i.barcode || "").toLowerCase().includes(term)
          || String(i.id).includes(term)
        );
      })
      .slice(0, 80);
  }, [items, q, excludeId]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-9 w-full justify-between font-semibold text-sm px-2">
          <span className="truncate text-right flex-1">
            {selected
              ? `${selected.code ? `${selected.code} — ` : ""}${selected.name}`
              : <span className="text-slate-400 font-medium">{placeholder}</span>}
          </span>
          <ChevronsUpDown size={14} className="opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(24rem,90vw)] p-2" align="start">
        <div className="relative mb-2">
          <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث..." className="h-9 pr-8 text-sm" />
        </div>
        <div className="max-h-56 overflow-y-auto space-y-0.5">
          {filtered.length === 0 ? (
            <p className="text-xs text-slate-400 p-3 text-center">لا نتائج</p>
          ) : filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`w-full text-right rounded-lg px-2.5 py-2 text-sm hover:bg-sky-50 ${
                String(item.id) === value ? "bg-blue-50 text-blue-800 font-bold" : "text-slate-800"
              }`}
              onClick={() => { onChange(String(item.id)); setOpen(false); setQ(""); }}
            >
              <div className="font-bold truncate">{item.code ? `${item.code} — ${item.name}` : item.name}</div>
              <div className="text-[11px] text-slate-500 font-semibold mt-0.5">
                رصيد: {fmt(Number(item.currentStock || 0))}{item.unit ? ` ${item.unit}` : ""}
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const emptyForm = () => ({
  productId: "",
  quantity: "1",
  warehouseId: "",
  branchId: "",
  date: new Date().toISOString().split("T")[0],
  notes: "",
  referenceNumber: "",
  batchNumber: "",
  barcode: "",
});

export default function Production() {
  const searchStr = useSearch();
  const { can, bypass } = usePermissions();
  const canEdit = bypass || can("production", "edit") || can("production", "create");

  const tabFromUrl = useMemo(() => {
    const t = new URLSearchParams(searchStr).get("tab");
    if (t === "new" || t === "orders") return t as Tab;
    if (t === "bom") return "new" as Tab; // الخلطات ليست شاشة Mega — حوّل لأمر الإنتاج
    return "orders" as Tab;
  }, [searchStr]);
  const [tab, setTab] = useState<Tab>(tabFromUrl);
  useEffect(() => setTab(tabFromUrl), [tabFromUrl]);

  const setTabNav = (t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState({}, "", url.pathname + "?" + url.searchParams.toString());
  };

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [warehouseId, setWarehouseId] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [query, setQuery] = useState({ search: "", status: "all", warehouseId: "all", dateFrom: "", dateTo: "" });

  const [editId, setEditId] = useState<number | null>(null);
  const [viewId, setViewId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [addMat, setAddMat] = useState({ itemId: "", quantity: "1", notes: "" });
  const [printAfterSave, setPrintAfterSave] = useState(false);

  const listQ = trpc.production.list.useQuery({
    page,
    limit: 20,
    search: query.search || undefined,
    status: query.status !== "all" ? (query.status as any) : undefined,
    warehouseId: query.warehouseId !== "all" ? Number(query.warehouseId) : undefined,
    dateFrom: query.dateFrom || undefined,
    dateTo: query.dateTo || undefined,
  });
  const { data: itemsList } = trpc.items.list.useQuery({ page: 1, limit: 500 });
  const { data: warehouses } = trpc.warehouses.list.useQuery();
  const { data: branches } = trpc.settings.branches.list.useQuery();
  const detailQ = trpc.production.get.useQuery(viewId ?? editId ?? 0, { enabled: !!(viewId || editId) });
  const utils = trpc.useUtils();

  const items: ItemOpt[] = (itemsList?.rows || []) as any;
  const itemMap = useMemo(() => new Map(items.map((i) => [String(i.id), i])), [items]);

  const createMut = trpc.production.create.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.production.update.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.production.delete.useMutation({
    onSuccess: () => { toast.success("تم الحذف"); listQ.refetch(); setViewId(null); },
    onError: (e) => toast.error(e.message),
  });
  const statusMut = trpc.production.updateStatus.useMutation({
    onSuccess: (_r, vars) => {
      toast.success(vars.status === "in_progress" ? "تم الاعتماد" : vars.status === "completed" ? "تم إتمام الاستلام" : "تم التحديث");
      listQ.refetch();
      if (viewId) detailQ.refetch();
      if (editId) detailQ.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setEditId(null);
    setForm(emptyForm());
    setMaterials([]);
    setAddMat({ itemId: "", quantity: "1", notes: "" });
  };

  // ملخصات زي Mega
  const totals = useMemo(() => {
    let rawQty = 0;
    let rawCost = 0;
    let maxProd = Number.POSITIVE_INFINITY;
    const orderQty = Number(form.quantity || 0) || 1;
    for (const m of materials) {
      const it = itemMap.get(m.itemId);
      const qty = Number(m.quantity || 0);
      const unitCost = Number(it?.averageCost || 0) || Number(it?.purchasePrice || 0);
      const avail = Number(it?.currentStock || 0);
      rawQty += qty;
      rawCost += qty * unitCost;
      if (qty > 0) maxProd = Math.min(maxProd, (avail / qty) * orderQty);
    }
    if (!Number.isFinite(maxProd) || !materials.length) maxProd = 0;
    return { rawQty, rawCost, maxProd: Math.max(0, Math.floor(maxProd * 1000) / 1000) };
  }, [materials, itemMap, form.quantity]);

  const applyBarcode = () => {
    const code = form.barcode.trim().toLowerCase();
    if (!code) return;
    const hit = items.find((i) =>
      String(i.barcode || "").toLowerCase() === code
      || String(i.code || "").toLowerCase() === code,
    );
    if (!hit) return toast.error("لم يُعثر على الصنف بالباركود/الكود");
    setForm((p) => ({ ...p, productId: String(hit.id), barcode: String(hit.barcode || hit.code || "") }));
    toast.success(`تم اختيار ${hit.name}`);
  };

  const addMaterialLine = () => {
    if (!addMat.itemId) return toast.error("اختر المادة الخام");
    if (!(Number(addMat.quantity) > 0)) return toast.error("أدخل كمية أكبر من صفر");
    if (addMat.itemId === form.productId) return toast.error("لا يمكن أن يكون المنتج مادة في نفس الأمر");
    if (materials.some((m) => m.itemId === addMat.itemId)) {
      setMaterials((p) => p.map((m) => m.itemId === addMat.itemId
        ? { ...m, quantity: String(Number(m.quantity) + Number(addMat.quantity)) }
        : m));
    } else {
      setMaterials((p) => [...p, { ...addMat }]);
    }
    setAddMat({ itemId: "", quantity: "1", notes: "" });
  };

  const openEdit = async (id: number) => {
    const d = await utils.production.get.fetch(id);
    if (d.status !== "draft") {
      setViewId(id);
      return;
    }
    setEditId(id);
    setForm({
      productId: String(d.productId),
      quantity: String(d.quantity),
      warehouseId: String(d.warehouseId),
      branchId: d.branchId ? String(d.branchId) : "",
      date: String(d.date).slice(0, 10),
      notes: d.notes || "",
      referenceNumber: d.referenceNumber || "",
      batchNumber: d.batchNumber || "",
      barcode: d.productCode || "",
    });
    setMaterials(d.materials.map((m: any) => ({
      itemId: String(m.itemId),
      quantity: String(m.quantity),
      notes: m.notes || "",
    })));
    setTabNav("new");
  };

  const saveOrder = (andApprove = false) => {
    if (!canEdit) return toast.error("ليس لديك صلاحية");
    if (!form.productId || !form.warehouseId || !form.quantity) {
      return toast.error("الصنف ومخزن الخامات والكمية مطلوبة");
    }
    if (!materials.length) return toast.error("أضف مادة خام واحدة على الأقل (قسم الخامات)");
    const payload = {
      productId: Number(form.productId),
      warehouseId: Number(form.warehouseId),
      branchId: form.branchId ? Number(form.branchId) : undefined,
      quantity: form.quantity,
      date: form.date,
      notes: form.notes || undefined,
      referenceNumber: form.referenceNumber || undefined,
      batchNumber: form.batchNumber || undefined,
      materials: materials.map((m) => ({
        itemId: Number(m.itemId),
        quantity: m.quantity,
        notes: m.notes || undefined,
      })),
    };
    const onSaved = async (id: number) => {
      if (andApprove) {
        await statusMut.mutateAsync({ id, status: "in_progress" });
      }
    };
    if (editId) {
      updateMut.mutate(payload as any, {
        onSuccess: async () => {
          toast.success("تم حفظ التعديلات");
          if (andApprove) await onSaved(editId);
          listQ.refetch();
          resetForm();
          setTabNav("orders");
        },
      });
    } else {
      createMut.mutate(payload as any, {
        onSuccess: async (r) => {
          toast.success(`تم حفظ الأمر ${r.number} (معلق)`);
          if (andApprove) await onSaved(r.id);
          listQ.refetch();
          if (printAfterSave) toast.message("يمكنك طباعة الأمر من القائمة");
          resetForm();
          setTabNav("orders");
        },
      });
    }
  };

  const totalPages = Math.max(1, Math.ceil((listQ.data?.total || 0) / 20));
  const branchOptions = Array.isArray(branches) ? branches : ((branches as any)?.rows || []);

  return (
    <ERPLayout title="الإنتاج">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 p-1.5 rounded-2xl bg-slate-100 border border-slate-200">
          {([
            { id: "orders" as const, label: "قائمة أوامر الإنتاج", icon: Factory },
            { id: "new" as const, label: editId ? "تعديل أمر إنتاج" : "أمر إنتاج", icon: Plus },
          ]).map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  if (t.id === "new" && !editId) resetForm();
                  setTabNav(t.id);
                }}
                className={`flex-1 min-w-[8rem] flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-extrabold transition-all ${
                  active ? "bg-white text-amber-900 shadow-sm ring-1 ring-amber-200" : "text-slate-600 hover:bg-white/70"
                }`}
              >
                <Icon size={16} /> {t.label}
              </button>
            );
          })}
        </div>

        {tab === "orders" && (
          <div className="space-y-3">
            <Card className="erp-data-card border-0">
              <CardContent className="p-4 flex flex-wrap gap-3 items-end">
                <div className="space-y-1 flex-1 min-w-[140px]">
                  <Label className="text-xs font-bold">بحث / رقم المرجع</Label>
                  <Input className="h-10 font-semibold" value={search} onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (setPage(1), setQuery({ search, status, warehouseId, dateFrom, dateTo }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">الحالة</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-10 w-40 font-bold"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">الكل</SelectItem>
                      <SelectItem value="draft">معلق</SelectItem>
                      <SelectItem value="in_progress">معتمد</SelectItem>
                      <SelectItem value="completed">مكتمل</SelectItem>
                      <SelectItem value="cancelled">ملغي</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">المخزن</Label>
                  <Select value={warehouseId} onValueChange={setWarehouseId}>
                    <SelectTrigger className="h-10 w-40 font-bold"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">الكل</SelectItem>
                      {(warehouses as any[] || []).map((w: any) => (
                        <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">من تاريخ</Label>
                  <Input type="date" className="h-10 w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">إلى تاريخ</Label>
                  <Input type="date" className="h-10 w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
                <Button className="h-10 font-extrabold" onClick={() => { setPage(1); setQuery({ search, status, warehouseId, dateFrom, dateTo }); }}>
                  بحث
                </Button>
              </CardContent>
            </Card>

            <Card className="erp-data-card border-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-800 text-white text-xs">
                      <th className="px-3 py-2.5 text-right">الرقم</th>
                      <th className="px-3 py-2.5 text-right">التاريخ</th>
                      <th className="px-3 py-2.5 text-right">الصنف</th>
                      <th className="px-3 py-2.5 text-right">المخزن</th>
                      <th className="px-3 py-2.5 text-right">الكمية</th>
                      <th className="px-3 py-2.5 text-right">رقم المرجع</th>
                      <th className="px-3 py-2.5 text-right">الحالة</th>
                      <th className="px-3 py-2.5 text-right">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listQ.isLoading ? (
                      <tr><td colSpan={8} className="py-12 text-center"><Loader2 className="inline animate-spin text-amber-600" /></td></tr>
                    ) : !(listQ.data?.rows || []).length ? (
                      <tr><td colSpan={8} className="py-12 text-center text-slate-400 font-semibold">لا توجد بيانات للعرض</td></tr>
                    ) : (listQ.data?.rows || []).map((row: any, i: number) => (
                      <tr key={row.id} className={`border-t ${i % 2 ? "bg-slate-50/80" : ""}`}>
                        <td className="px-3 py-2 font-extrabold">{row.number}</td>
                        <td className="px-3 py-2">{String(row.date).slice(0, 10)}</td>
                        <td className="px-3 py-2 font-bold">{row.productCode ? `${row.productCode} — ` : ""}{row.productName}</td>
                        <td className="px-3 py-2">{row.warehouseName}</td>
                        <td className="px-3 py-2 font-bold">{fmt(Number(row.quantity))}</td>
                        <td className="px-3 py-2">{row.referenceNumber || "—"}</td>
                        <td className="px-3 py-2"><span className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${statusClass(row.status)}`}>{statusLabel(row.status)}</span></td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewId(row.id)}><Eye size={14} /></Button>
                            {row.status === "draft" && (
                              <PermissionGate module="production" action="edit">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row.id)}><Pencil size={14} /></Button>
                              </PermissionGate>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex justify-center gap-2 p-3 border-t">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>السابق</Button>
                  <span className="text-xs font-bold self-center">{page} / {totalPages}</span>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>التالي</Button>
                </div>
              )}
            </Card>

            {viewId && detailQ.data && (
              <Card className="erp-data-card border-0 border-t-4 border-t-amber-500">
                <CardHeader className="pb-2 flex flex-row justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-extrabold">#{detailQ.data.number} — {detailQ.data.productName}</CardTitle>
                    <p className="text-sm font-semibold text-slate-600 mt-1">
                      {statusLabel(detailQ.data.status)} · كمية {fmt(Number(detailQ.data.quantity))} · تكلفة خامات {money(Number(detailQ.data.estimatedCost || 0))} ج.م
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setViewId(null)}>إغلاق</Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="overflow-x-auto border rounded-xl">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-800 text-white text-xs">
                          <th className="px-3 py-2 text-right">المادة الخام</th>
                          <th className="px-3 py-2 text-right">الوحدة</th>
                          <th className="px-3 py-2 text-right">الكمية</th>
                          <th className="px-3 py-2 text-right">المتاح</th>
                          <th className="px-3 py-2 text-right">التكلفة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailQ.data.materials.map((m: any) => (
                          <tr key={m.id} className="border-t">
                            <td className="px-3 py-2 font-bold">{m.itemCode ? `${m.itemCode} — ` : ""}{m.itemName}</td>
                            <td className="px-3 py-2">{m.unit || "—"}</td>
                            <td className="px-3 py-2 font-bold">{fmt(Number(m.totalQty))}</td>
                            <td className="px-3 py-2">{fmt(Number(m.available))}</td>
                            <td className="px-3 py-2">{money(Number(m.lineCost))} ج.م</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {detailQ.data.status === "draft" && (
                      <PermissionGate module="production" action="edit">
                        <Button size="sm" className="bg-amber-600 hover:bg-amber-700 font-extrabold"
                          disabled={statusMut.isPending}
                          onClick={() => statusMut.mutate({ id: viewId, status: "in_progress" })}>
                          <CheckCircle2 size={14} className="me-1" /> اعتماد
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(viewId)}>تعديل</Button>
                        <Button size="sm" variant="outline" className="text-red-700"
                          onClick={() => statusMut.mutate({ id: viewId, status: "cancelled" })}>
                          <XCircle size={14} className="me-1" /> إلغاء
                        </Button>
                      </PermissionGate>
                    )}
                    {detailQ.data.status === "in_progress" && (
                      <PermissionGate module="production" action="edit">
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 font-extrabold"
                          disabled={statusMut.isPending}
                          onClick={() => statusMut.mutate({ id: viewId, status: "completed" })}>
                          إتمام / استلام الإنتاج التام
                        </Button>
                      </PermissionGate>
                    )}
                    {detailQ.data.status === "draft" && (
                      <PermissionGate module="production" action="delete">
                        <Button size="sm" variant="outline" className="text-red-700"
                          onClick={() => { if (confirm("حذف الأمر؟")) deleteMut.mutate(viewId); }}>حذف</Button>
                      </PermissionGate>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {tab === "new" && (
          <div className="space-y-4">
            <Card className="erp-data-card border-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-extrabold">{editId ? "تعديل أمر إنتاج" : "أمر إنتاج"}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {branchOptions.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">الفرع</Label>
                    <Select value={form.branchId || "none"} onValueChange={(v) => setForm((p) => ({ ...p, branchId: v === "none" ? "" : v }))}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="اختر" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {branchOptions.map((b: any) => (
                          <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs font-bold">مخزن الخامات *</Label>
                  <Select value={form.warehouseId} onValueChange={(v) => setForm((p) => ({ ...p, warehouseId: v }))}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="اختر مخزن" /></SelectTrigger>
                    <SelectContent>
                      {(warehouses as any[] || []).map((w: any) => (
                        <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">الباركود</Label>
                  <div className="flex gap-1">
                    <Input className="h-9" value={form.barcode} onChange={(e) => setForm((p) => ({ ...p, barcode: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), applyBarcode())} />
                    <Button type="button" variant="outline" className="h-9" onClick={applyBarcode}>بحث</Button>
                  </div>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs font-bold">الصنف *</Label>
                  <ItemSearchSelect items={items} value={form.productId} onChange={(id) => setForm((p) => ({ ...p, productId: id }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">الكمية *</Label>
                  <Input type="number" step="any" className="h-9 font-bold" value={form.quantity}
                    onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">التاريخ</Label>
                  <Input type="date" className="h-9" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">رقم التشغيلة</Label>
                  <Input className="h-9" value={form.batchNumber} onChange={(e) => setForm((p) => ({ ...p, batchNumber: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">رقم المرجع</Label>
                  <Input className="h-9" value={form.referenceNumber} onChange={(e) => setForm((p) => ({ ...p, referenceNumber: e.target.value }))} />
                </div>
                <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                  <Label className="text-xs font-bold">ملاحظات</Label>
                  <Textarea className="text-sm resize-none" rows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
                </div>
              </CardContent>
            </Card>

            <Card className="erp-data-card border-0">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-extrabold">الخامات</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end border rounded-xl p-3 bg-slate-50">
                  <div className="sm:col-span-2 space-y-1">
                    <Label className="text-xs font-bold">المادة الخام</Label>
                    <ItemSearchSelect items={items} value={addMat.itemId} excludeId={form.productId}
                      onChange={(id) => setAddMat((p) => ({ ...p, itemId: id }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">الكمية</Label>
                    <Input type="number" step="any" className="h-9 font-bold" value={addMat.quantity}
                      onChange={(e) => setAddMat((p) => ({ ...p, quantity: e.target.value }))} />
                    {addMat.itemId && itemMap.get(addMat.itemId) && (
                      <p className="text-[11px] font-semibold text-slate-500">
                        الكمية المتاحة: {fmt(Number(itemMap.get(addMat.itemId)!.currentStock || 0))}
                        {" · "}التكلفة المتوقعة: {money((Number(addMat.quantity) || 0) * (Number(itemMap.get(addMat.itemId)!.averageCost || 0) || Number(itemMap.get(addMat.itemId)!.purchasePrice || 0)))} ج.م
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button type="button" className="h-9 flex-1 font-bold" onClick={addMaterialLine}>اضافة</Button>
                    <Button type="button" variant="outline" className="h-9" onClick={() => setAddMat({ itemId: "", quantity: "1", notes: "" })}>تفريغ</Button>
                  </div>
                </div>

                <div className="overflow-x-auto border rounded-xl">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead>
                      <tr className="bg-slate-800 text-white text-xs">
                        <th className="px-2 py-2 text-right">المادة الخام</th>
                        <th className="px-2 py-2 text-right">الوحدة</th>
                        <th className="px-2 py-2 text-right w-28">الكمية</th>
                        <th className="px-2 py-2 text-right">المتاح</th>
                        <th className="px-2 py-2 text-right">التكلفة</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {!materials.length ? (
                        <tr><td colSpan={6} className="py-10 text-center text-slate-400 font-semibold">لا توجد بيانات للعرض</td></tr>
                      ) : materials.map((m, i) => {
                        const it = itemMap.get(m.itemId);
                        const qty = Number(m.quantity || 0);
                        const unitCost = Number(it?.averageCost || 0) || Number(it?.purchasePrice || 0);
                        return (
                          <tr key={`${m.itemId}-${i}`} className={`border-t ${i % 2 ? "bg-slate-50/80" : ""}`}>
                            <td className="px-2 py-2 font-bold">{it ? `${it.code ? `${it.code} — ` : ""}${it.name}` : m.itemId}</td>
                            <td className="px-2 py-2">{it?.unit || "—"}</td>
                            <td className="px-2 py-1">
                              <Input type="number" step="any" className="h-8 font-bold" value={m.quantity}
                                onChange={(e) => setMaterials((p) => p.map((r, idx) => idx === i ? { ...r, quantity: e.target.value } : r))} />
                            </td>
                            <td className="px-2 py-2">{fmt(Number(it?.currentStock || 0))}</td>
                            <td className="px-2 py-2 font-bold">{money(qty * unitCost)}</td>
                            <td className="px-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500"
                                onClick={() => setMaterials((p) => p.filter((_, idx) => idx !== i))}>
                                <Trash2 size={14} />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm font-extrabold bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <div>اجمالي تكلفة الخامات: {money(totals.rawCost)} ج.م</div>
                  <div>اجمالي كمية الخامات: {fmt(totals.rawQty)}</div>
                  <div>اقصى كمية يمكن انتاجها: {fmt(totals.maxProd)}</div>
                </div>

                <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                  <input type="checkbox" checked={printAfterSave} onChange={(e) => setPrintAfterSave(e.target.checked)} />
                  طباعة بعد الحفظ
                </label>

                {canEdit ? (
                  <div className="flex flex-wrap gap-2">
                    <Button className="font-extrabold bg-slate-800 hover:bg-slate-900"
                      disabled={createMut.isPending || updateMut.isPending}
                      onClick={() => saveOrder(false)}>
                      حفظ
                    </Button>
                    <Button className="font-extrabold bg-amber-600 hover:bg-amber-700"
                      disabled={createMut.isPending || updateMut.isPending || statusMut.isPending}
                      onClick={() => saveOrder(true)}>
                      اعتماد
                    </Button>
                    {editId && (
                      <Button variant="outline" onClick={() => { resetForm(); setTabNav("orders"); }}>إلغاء التعديل</Button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs font-bold text-red-600">لا صلاحية حفظ/اعتماد على الإنتاج</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </ERPLayout>
  );
}
