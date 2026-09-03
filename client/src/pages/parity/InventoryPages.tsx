import { SimpleEntityPage } from "@/components/SimpleEntityPage";
import { trpc } from "@/lib/trpc";
import ERPLayout from "@/components/ERPLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useItemOptions, useWarehouseOptions } from "@/hooks/useEntityOptions";
import PermissionGate from "@/components/PermissionGate";
import { tenantPath, useTenantSlug } from "@/lib/tenant";
import { Plus, Trash2, Upload } from "lucide-react";
import { toDateStr } from "@/lib/date";

export function ItemCategoriesPage() {
  const q = trpc.parity.inventory.categories.list.useQuery();
  const c = trpc.parity.inventory.categories.create.useMutation();
  const d = trpc.parity.inventory.categories.delete.useMutation();
  const parentOptions = useMemo(() => [
    { value: "", label: "— بدون أب (رئيسي) —" },
    ...((q.data || []).map((r: any) => ({ value: String(r.id), label: r.name }))),
  ], [q.data]);
  const parentName = (id: unknown) => {
    if (id == null || id === "") return "—";
    const p = (q.data || []).find((r: any) => r.id === Number(id));
    return p?.name || String(id);
  };
  return (
    <SimpleEntityPage title="فئات الأصناف" tableTitle="الفئات" data={q.data as any} isLoading={q.isLoading} onRefresh={() => q.refetch()}
      permissionModule="inventory"
      canEdit={false}
      columns={[
        { key: "name", label: "اسم الفئة" },
        { key: "parentId", label: "الفئة الأب", render: (r) => parentName(r.parentId) },
      ]}
      fields={[
        { key: "name", label: "اسم الفئة", required: true },
        { key: "parentId", label: "الفئة الأب", type: "select", options: parentOptions },
      ]}
      onCreate={(v) => c.mutateAsync({
        name: v.name,
        parentId: v.parentId ? Number(v.parentId) : undefined,
      } as any)}
      onUpdate={() => {}}
      onDelete={(id) => d.mutateAsync(id)} />
  );
}

export function ItemBatchesPage() {
  const q = trpc.parity.inventory.batches.list.useQuery();
  const items = useItemOptions();
  const c = trpc.parity.inventory.batches.create.useMutation();
  const d = trpc.parity.inventory.batches.delete.useMutation();
  return (
    <SimpleEntityPage title="أرقام التشغيلة" tableTitle="التشغيلات" data={q.data as any} isLoading={q.isLoading} onRefresh={() => q.refetch()}
      permissionModule="inventory"
      canEdit={false}
      columns={[
        { key: "itemName", label: "الصنف" },
        { key: "batchNumber", label: "رقم التشغيلة" },
        { key: "expiryDate", label: "الانتهاء", render: (r) => r.expiryDate ? toDateStr(r.expiryDate) : "—" },
        { key: "quantity", label: "الكمية", render: (r) => Number(r.quantity || 0).toLocaleString("en-US") },
      ]}
      fields={[
        { key: "itemId", label: "الصنف", type: "select", required: true, options: items },
        { key: "batchNumber", label: "رقم التشغيلة", required: true },
        { key: "expiryDate", label: "تاريخ الانتهاء", type: "date" },
        { key: "quantity", label: "الكمية", type: "number" },
      ]}
      onCreate={(v) => c.mutateAsync({ ...v, itemId: Number(v.itemId) } as any)} onUpdate={() => {}} onDelete={(id) => d.mutateAsync(id)} />
  );
}

export function ItemOffersPage() {
  const q = trpc.parity.inventory.offers.list.useQuery();
  const items = trpc.items.list.useQuery({ page: 1, limit: 500 });
  const categories = trpc.items.categories.useQuery();
  const c = trpc.parity.inventory.offers.create.useMutation();
  const u = trpc.parity.inventory.offers.update.useMutation();
  const d = trpc.parity.inventory.offers.delete.useMutation();

  const itemOptions = [
    { value: "", label: "— كل الأصناف —" },
    ...(items.data?.rows || []).map((i: { id: number; name: string; code?: string | null }) => ({
      value: String(i.id),
      label: i.code ? `${i.code} — ${i.name}` : i.name,
    })),
  ];
  const categoryOptions = [
    { value: "", label: "— كل الفئات —" },
    ...(categories.data || []).map((c: { id: number; name: string }) => ({ value: String(c.id), label: c.name })),
  ];

  const normalizeOffer = (v: Record<string, string>) => ({
    ...v,
    itemId: v.itemId ? Number(v.itemId) : null,
    categoryId: v.categoryId ? Number(v.categoryId) : null,
  });

  return (
    <SimpleEntityPage title="العروض" tableTitle="عروض الأسعار" data={q.data as any} isLoading={q.isLoading} onRefresh={() => q.refetch()}
      permissionModule="inventory"
      columns={[
        { key: "name", label: "العرض" },
        { key: "discountPercent", label: "الخصم %" },
        { key: "itemName", label: "الصنف", render: (r) => r.itemName ? String(r.itemName) : "—" },
        { key: "categoryName", label: "الفئة", render: (r) => r.categoryName ? String(r.categoryName) : "—" },
        { key: "startDate", label: "من", render: (r) => r.startDate ? toDateStr(r.startDate) : "—" },
        { key: "endDate", label: "إلى", render: (r) => r.endDate ? toDateStr(r.endDate) : "—" },
      ]}
      fields={[
        { key: "name", label: "اسم العرض", required: true },
        { key: "discountPercent", label: "نسبة الخصم" },
        { key: "itemId", label: "صنف محدد (اختياري)", type: "select", options: itemOptions },
        { key: "categoryId", label: "فئة محددة (اختياري)", type: "select", options: categoryOptions },
        { key: "startDate", label: "من", type: "date" },
        { key: "endDate", label: "إلى", type: "date" },
      ]}
      onCreate={(v) => c.mutateAsync(normalizeOffer(v) as any)}
      onUpdate={(id, v) => u.mutateAsync({ id, ...normalizeOffer(v) } as any)}
      onDelete={(id) => d.mutateAsync(id)} />
  );
}

export function ItemSerialsPage() {
  const [itemFilter, setItemFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "in_stock" | "sold" | "returned">("");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ itemId: "", serialNumber: "", warehouseId: "", status: "in_stock" });
  const items = useItemOptions();
  const warehouses = useWarehouseOptions();
  const q = trpc.parity.inventory.serials.list.useQuery({
    itemId: itemFilter ? Number(itemFilter) : undefined,
    status: statusFilter || undefined,
    search: search || undefined,
  });
  const createMut = trpc.parity.inventory.serials.create.useMutation({
    onSuccess: () => { toast.success("تم إضافة السيريال"); q.refetch(); setAddOpen(false); setForm({ itemId: "", serialNumber: "", warehouseId: "", status: "in_stock" }); },
    onError: (e) => toast.error(e.message),
  });
  const statusMut = trpc.parity.inventory.serials.updateStatus.useMutation({
    onSuccess: () => { toast.success("تم تحديث الحالة"); q.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.parity.inventory.serials.delete.useMutation({
    onSuccess: () => { toast.success("تم الحذف"); q.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const statusLabel: Record<string, string> = {
    in_stock: "في المخزن",
    sold: "مباع",
    returned: "مرتجع",
  };

  return (
    <ERPLayout title="الأرقام التسلسلية">
      <Card className="erp-data-card border-0">
        <CardHeader className="pb-2 border-b">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base font-extrabold">سجل السيريالات</CardTitle>
            <PermissionGate module="inventory" action="create">
              <Button className="h-9 gap-1 font-extrabold" onClick={() => setAddOpen(true)}>
                <Plus size={14} /> إضافة سيريال
              </Button>
            </PermissionGate>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1 flex-1 min-w-[160px]">
              <Label className="text-xs font-bold">بحث</Label>
              <Input className="h-9" placeholder="رقم سيريال أو صنف..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs mb-1 block font-bold">الصنف</Label>
              <Select value={itemFilter || "all"} onValueChange={(v) => setItemFilter(v === "all" ? "" : v)}>
                <SelectTrigger className="h-9 w-52 text-sm"><SelectValue placeholder="كل الأصناف" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأصناف</SelectItem>
                  {items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block font-bold">الحالة</Label>
              <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v as any)}>
                <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="in_stock">في المخزن</SelectItem>
                  <SelectItem value="sold">مباع</SelectItem>
                  <SelectItem value="returned">مرتجع</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" className="h-9" onClick={() => q.refetch()}>تحديث</Button>
          </div>
          <div className="overflow-x-auto border rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="px-3 py-2 text-right text-xs font-extrabold">الرقم التسلسلي</th>
                  <th className="px-3 py-2 text-right text-xs font-extrabold">الصنف</th>
                  <th className="px-3 py-2 text-right text-xs font-extrabold">المخزن</th>
                  <th className="px-3 py-2 text-right text-xs font-extrabold">الحالة</th>
                  <th className="px-3 py-2 text-right text-xs font-extrabold">شراء</th>
                  <th className="px-3 py-2 text-right text-xs font-extrabold">بيع</th>
                  <th className="px-3 py-2 text-right text-xs font-extrabold">التاريخ</th>
                  <th className="px-3 py-2 text-center text-xs font-extrabold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {q.isLoading ? (
                  <tr><td colSpan={8} className="py-8 text-center text-slate-400">جاري التحميل...</td></tr>
                ) : (q.data || []).length === 0 ? (
                  <tr><td colSpan={8} className="py-8 text-center text-slate-400">لا توجد أرقام تسلسلية</td></tr>
                ) : (q.data || []).map((row: any, idx: number) => (
                  <tr key={row.id} className={`border-b ${idx % 2 ? "bg-slate-50/70" : ""}`}>
                    <td className="px-3 py-2 font-mono text-xs font-bold">{row.serialNumber}</td>
                    <td className="px-3 py-2 font-semibold">{row.itemCode ? `${row.itemCode} — ` : ""}{row.itemName || "—"}</td>
                    <td className="px-3 py-2">{row.warehouseName || "—"}</td>
                    <td className="px-3 py-2">{statusLabel[row.status] ?? row.status}</td>
                    <td className="px-3 py-2">{row.purchaseInvoiceId ? `#${row.purchaseInvoiceId}` : "—"}</td>
                    <td className="px-3 py-2">{row.salesInvoiceId ? `#${row.salesInvoiceId}` : "—"}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{row.createdAt ? new Date(row.createdAt).toLocaleDateString("en-GB") : "—"}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <PermissionGate module="inventory" action="edit">
                          <Select
                            value={row.status}
                            onValueChange={(v) => statusMut.mutate({ id: row.id, status: v as any })}
                          >
                            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="in_stock">في المخزن</SelectItem>
                              <SelectItem value="sold">مباع</SelectItem>
                              <SelectItem value="returned">مرتجع</SelectItem>
                            </SelectContent>
                          </Select>
                        </PermissionGate>
                        <PermissionGate module="inventory" action="delete">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600"
                            onClick={() => confirm("حذف السيريال؟") && deleteMut.mutate(row.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </PermissionGate>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle className="font-extrabold">إضافة رقم تسلسلي</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs font-bold">الصنف *</Label>
              <Select value={form.itemId} onValueChange={(v) => setForm((f) => ({ ...f, itemId: v }))}>
                <SelectTrigger className="h-10"><SelectValue placeholder="اختر الصنف" /></SelectTrigger>
                <SelectContent>{items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold">الرقم التسلسلي *</Label>
              <Input className="h-10 font-mono" value={form.serialNumber} onChange={(e) => setForm((f) => ({ ...f, serialNumber: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold">المخزن</Label>
              <Select value={form.warehouseId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, warehouseId: v === "none" ? "" : v }))}>
                <SelectTrigger className="h-10"><SelectValue placeholder="اختياري" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— بدون —</SelectItem>
                  {warehouses.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAddOpen(false)}>إلغاء</Button>
            <Button
              className="font-extrabold"
              disabled={createMut.isPending || !form.itemId || !form.serialNumber.trim()}
              onClick={() => createMut.mutate({
                itemId: Number(form.itemId),
                serialNumber: form.serialNumber.trim(),
                warehouseId: form.warehouseId ? Number(form.warehouseId) : undefined,
                status: "in_stock",
              })}
            >
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ERPLayout>
  );
}

export function PriceChangerPage() {
  const items = trpc.items.list.useQuery({ page: 1, limit: 500 });
  const list = trpc.parity.inventory.priceChanges.list.useQuery();
  const applyBulk = trpc.parity.inventory.priceChanges.applyBulk.useMutation({
    onSuccess: (r) => { toast.success(`تم تحديث ${r.updated} صنف`); list.refetch(); items.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const [priceType, setPriceType] = useState<"sale" | "purchase">("sale");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Record<number, string>>({});

  const rows = useMemo(() => {
    const all = items.data?.rows || [];
    const q = search.trim().toLowerCase();
    return all.filter((i: any) => {
      if (!q) return true;
      return String(i.name || "").toLowerCase().includes(q) || String(i.code || "").toLowerCase().includes(q);
    });
  }, [items.data, search]);

  const dirtyRows = Object.entries(draft)
    .filter(([, v]) => v.trim() !== "")
    .map(([id, newPrice]) => ({ itemId: Number(id), newPrice }));

  return (
    <ERPLayout title="تغيير الأسعار">
      <div className="space-y-4">
        <Card className="erp-data-card border-0">
          <CardContent className="p-4 flex flex-wrap gap-3 items-end">
            <div className="space-y-1 flex-1 min-w-[180px]">
              <Label className="text-xs font-bold">بحث أصناف</Label>
              <Input className="h-10" placeholder="كود أو اسم..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold">نوع السعر</Label>
              <Select value={priceType} onValueChange={(v) => setPriceType(v as any)}>
                <SelectTrigger className="h-10 w-36 font-bold"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sale">بيع</SelectItem>
                  <SelectItem value="purchase">شراء</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold">التاريخ</Label>
              <Input type="date" className="h-10" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <PermissionGate module="inventory" action="edit">
              <Button
                className="h-10 font-extrabold"
                disabled={!dirtyRows.length || applyBulk.isPending}
                onClick={() => applyBulk.mutate({ date, priceType, rows: dirtyRows })}
              >
                تطبيق التغييرات ({dirtyRows.length})
              </Button>
            </PermissionGate>
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="erp-data-card border-0 overflow-hidden">
            <CardHeader className="py-3 border-b bg-slate-50"><CardTitle className="text-sm font-extrabold">الأصناف</CardTitle></CardHeader>
            <CardContent className="p-0 max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-800 text-white">
                  <tr>
                    <th className="px-2 py-2 text-right text-xs">الصنف</th>
                    <th className="px-2 py-2 text-right text-xs">الحالي</th>
                    <th className="px-2 py-2 text-right text-xs">الجديد</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i: any) => {
                    const current = priceType === "sale" ? i.salePrice : i.purchasePrice;
                    return (
                      <tr key={i.id} className="border-b hover:bg-sky-50/50">
                        <td className="px-2 py-1.5 font-semibold">{i.code ? `${i.code} — ` : ""}{i.name}</td>
                        <td className="px-2 py-1.5">{Number(current || 0).toLocaleString("en-US")}</td>
                        <td className="px-2 py-1">
                          <Input
                            className="h-8 text-sm"
                            placeholder="—"
                            value={draft[i.id] ?? ""}
                            onChange={(e) => setDraft((d) => ({ ...d, [i.id]: e.target.value }))}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="erp-data-card border-0 overflow-hidden">
            <CardHeader className="py-3 border-b bg-slate-50"><CardTitle className="text-sm font-extrabold">سجل التغييرات</CardTitle></CardHeader>
            <CardContent className="p-0 max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-800 text-white">
                  <tr>
                    <th className="px-2 py-2 text-right text-xs">الصنف</th>
                    <th className="px-2 py-2 text-right text-xs">قديم</th>
                    <th className="px-2 py-2 text-right text-xs">جديد</th>
                    <th className="px-2 py-2 text-right text-xs">النوع</th>
                    <th className="px-2 py-2 text-right text-xs">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {(list.data || []).map((r: any) => (
                    <tr key={r.id} className="border-b">
                      <td className="px-2 py-1">{r.itemName}</td>
                      <td className="px-2 py-1">{r.oldPrice}</td>
                      <td className="px-2 py-1 font-bold">{r.newPrice}</td>
                      <td className="px-2 py-1">{r.priceType === "sale" ? "بيع" : "شراء"}</td>
                      <td className="px-2 py-1">{toDateStr(r.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </div>
    </ERPLayout>
  );
}


export function BeginningInventoryPage() {
  const q = trpc.parity.inventory.beginningInventory.list.useQuery();
  const c = trpc.parity.inventory.beginningInventory.create.useMutation();
  const d = trpc.parity.inventory.beginningInventory.delete.useMutation();
  const clearAll = trpc.parity.inventory.beginningInventory.clearAll.useMutation({
    onSuccess: (res) => {
      toast.success(`تم مسح ${res.cleared} سجل مخزون أول المدة وعكس الكميات`);
      if (res.failed) toast.message(`فشل ${res.failed}: ${(res.errors || []).slice(0, 2).join(" · ")}`);
      q.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const warehouses = useWarehouseOptions();
  const items = useItemOptions();
  const tenantSlug = useTenantSlug();
  const [, navigate] = useLocation();

  return (
    <SimpleEntityPage
      title="مخزون أول المدة"
      tableTitle="سجلات مخزون أول المدة"
      data={q.data as any}
      isLoading={q.isLoading}
      onRefresh={() => q.refetch()}
      permissionModule="inventory"
      canEdit={false}
      extraActions={
        <PermissionGate module="inventory" action="create">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="font-extrabold gap-1"
              onClick={() => navigate(tenantPath(tenantSlug, "/inventory/mega-report-import"))}
            >
              <Upload size={14} /> استيراد تقارير Excel
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 font-extrabold gap-1"
              onClick={() => navigate(tenantPath(tenantSlug, "/inventory/beginning-inventory/smart-import"))}
            >
              <Upload size={14} /> استيراد ذكي (Excel)
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="font-extrabold gap-1"
              disabled={clearAll.isPending || !(q.data?.length)}
              onClick={() => {
                const n = q.data?.length || 0;
                if (!n) return;
                if (!confirm(`مسح كل سجلات مخزون أول المدة (${n}) وعكس كمياتها من المخازن؟\n\nبعدها ارفع الإكسل واعمل اعتماد مرة واحدة فقط.`)) return;
                if (!confirm("تأكيد أخير: المسح لا يمكن التراجع عنه من هنا.")) return;
                clearAll.mutate({ confirm: "CLEAR_BEGINNING_INVENTORY" });
              }}
            >
              {clearAll.isPending ? "جاري المسح..." : "مسح كل مخزون أول المدة"}
            </Button>
          </div>
        </PermissionGate>
      }
      columns={[
        { key: "warehouseName", label: "المخزن" },
        { key: "itemName", label: "الصنف", render: (r) => (
          <span className="font-bold">
            {r.itemCode ? `${r.itemCode} — ` : ""}{String(r.itemName || "—")}
            {r.itemBarcode ? <span className="block text-[11px] text-slate-500 font-semibold">باركود: {String(r.itemBarcode)}</span> : null}
          </span>
        ) },
        { key: "quantity", label: "الكمية", render: (r) => Number(r.quantity || 0).toLocaleString("en-US") },
        { key: "unitCost", label: "التكلفة", render: (r) => Number(r.unitCost || 0).toLocaleString("en-US") },
        { key: "date", label: "التاريخ", render: (r) => toDateStr(r.date) },
      ]}
      fields={[
        { key: "warehouseId", label: "المخزن", type: "select", required: true, options: warehouses },
        { key: "itemId", label: "الصنف", type: "select", required: true, options: items },
        { key: "quantity", label: "الكمية", required: true },
        { key: "unitCost", label: "تكلفة الوحدة" },
        { key: "date", label: "التاريخ", type: "date", required: true },
      ]}
      onCreate={(v) => c.mutateAsync({ ...v, warehouseId: Number(v.warehouseId), itemId: Number(v.itemId) } as any)}
      onUpdate={() => {}}
      onDelete={(id) => d.mutateAsync(id)}
    />
  );
}
