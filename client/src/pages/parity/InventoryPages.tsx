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
import EntityPermissionGate from "@/components/EntityPermissionGate";
import { tenantPath, useTenantSlug } from "@/lib/tenant";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Plus, Trash2, Upload } from "lucide-react";
import { toDateStr } from "@/lib/date";
import { printTableReport } from "@/lib/print-report";

export function ItemCategoriesPage() {
  const q = trpc.parity.inventory.categories.list.useQuery();
  const c = trpc.parity.inventory.categories.create.useMutation();
  const u = trpc.parity.inventory.categories.update.useMutation();
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
    <SimpleEntityPage title="فئات الاصناف" tableTitle="الفئات" data={q.data as any} isLoading={q.isLoading} onRefresh={() => q.refetch()}
      entity={{ moduleKey: "inventory", entityKey: "itemCategories" }}
      columns={[
        { key: "name", label: "الاسم" },
        { key: "parentId", label: "الفئة الرئيسية", render: (r) => parentName(r.parentId) },
        { key: "showInSalesInvoices", label: "عرض فى فواتير البيع", render: (r) => (r.showInSalesInvoices === false ? "لا" : "نعم") },
      ]}
      fields={[
        { key: "name", label: "الاسم", required: true },
        { key: "parentId", label: "الفئة الرئيسية", type: "select", options: parentOptions },
        { key: "showInSalesInvoices", label: "عرض فى فواتير البيع", type: "checkbox", defaultValue: "true" },
      ]}
      onCreate={(v) => c.mutateAsync({
        name: v.name,
        parentId: v.parentId ? Number(v.parentId) : undefined,
        showInSalesInvoices: v.showInSalesInvoices !== "false",
      } as any)}
      onUpdate={(id, v) => u.mutateAsync({
        id,
        name: v.name,
        parentId: v.parentId ? Number(v.parentId) : null,
        showInSalesInvoices: v.showInSalesInvoices !== "false",
      } as any)}
      onDelete={(id) => d.mutateAsync(id)} />
  );
}

export function ItemBatchesPage() {
  const q = trpc.parity.inventory.batches.list.useQuery();
  const items = useItemOptions();
  const c = trpc.parity.inventory.batches.create.useMutation();
  const u = trpc.parity.inventory.batches.update.useMutation();
  const d = trpc.parity.inventory.batches.delete.useMutation();
  const [itemFilter, setItemFilter] = useState("");
  const [batchSearch, setBatchSearch] = useState("");
  const [barcodeFilter, setBarcodeFilter] = useState("");
  const [prodFrom, setProdFrom] = useState("");
  const [prodTo, setProdTo] = useState("");
  const [expFrom, setExpFrom] = useState("");
  const [expTo, setExpTo] = useState("");
  const filtered = useMemo(() => {
    return (q.data || []).filter((r: any) => {
      if (itemFilter && String(r.itemId) !== itemFilter) return false;
      if (batchSearch.trim() && !String(r.batchNumber || "").toLowerCase().includes(batchSearch.trim().toLowerCase())) return false;
      if (barcodeFilter.trim() && !String(r.itemBarcode || "").toLowerCase().includes(barcodeFilter.trim().toLowerCase())) return false;
      const pd = r.productionDate ? toDateStr(r.productionDate) : "";
      const ed = r.expiryDate ? toDateStr(r.expiryDate) : "";
      if (prodFrom && pd && pd < prodFrom) return false;
      if (prodTo && pd && pd > prodTo) return false;
      if (expFrom && ed && ed < expFrom) return false;
      if (expTo && ed && ed > expTo) return false;
      return true;
    });
  }, [q.data, itemFilter, batchSearch, barcodeFilter, prodFrom, prodTo, expFrom, expTo]);
  return (
    <SimpleEntityPage title="ارقام التشغيلة" tableTitle="التشغيلات" data={filtered as any} isLoading={q.isLoading} onRefresh={() => q.refetch()}
      entity={{ moduleKey: "inventory", entityKey: "batchNumbers" }}
      canEdit={true}
      extraActions={
        <div className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs">الصنف</Label>
            <Select value={itemFilter || "all"} onValueChange={(v) => setItemFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="كل الأصناف" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأصناف</SelectItem>
                {items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">الباركود</Label>
            <Input className="h-9 w-36" value={barcodeFilter} onChange={(e) => setBarcodeFilter(e.target.value)} placeholder="بحث..." />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">رقم التشغيلة</Label>
            <Input className="h-9 w-40" value={batchSearch} onChange={(e) => setBatchSearch(e.target.value)} placeholder="بحث..." />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">انتاج من</Label>
            <Input type="date" className="h-9 w-36" value={prodFrom} onChange={(e) => setProdFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">انتاج الى</Label>
            <Input type="date" className="h-9 w-36" value={prodTo} onChange={(e) => setProdTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">انتهاء من</Label>
            <Input type="date" className="h-9 w-36" value={expFrom} onChange={(e) => setExpFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">انتهاء الى</Label>
            <Input type="date" className="h-9 w-36" value={expTo} onChange={(e) => setExpTo(e.target.value)} />
          </div>
          <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => {
            setItemFilter(""); setBatchSearch(""); setBarcodeFilter(""); setProdFrom(""); setProdTo(""); setExpFrom(""); setExpTo("");
          }}>تفريغ</Button>
        </div>
      }
      columns={[
        { key: "itemName", label: "الصنف" },
        { key: "itemBarcode", label: "الباركود", render: (r) => (r.itemBarcode ? String(r.itemBarcode) : "—") },
        { key: "batchNumber", label: "رقم التشغيلة" },
        { key: "productionDate", label: "تاريخ الانتاج", render: (r) => r.productionDate ? toDateStr(r.productionDate) : "—" },
        { key: "expiryDate", label: "تاريخ الانتهاء", render: (r) => r.expiryDate ? toDateStr(r.expiryDate) : "—" },
        { key: "quantity", label: "الكمية", render: (r) => Number(r.quantity || 0).toLocaleString("en-US") },
      ]}
      fields={[
        { key: "itemId", label: "الصنف", type: "select", required: true, options: items },
        { key: "batchNumber", label: "رقم التشغيلة", required: true },
        { key: "productionDate", label: "تاريخ الانتاج", type: "date" },
        { key: "expiryDate", label: "تاريخ الانتهاء", type: "date" },
        { key: "quantity", label: "الكمية", type: "number" },
      ]}
      onCreate={(v) => c.mutateAsync({ ...v, itemId: Number(v.itemId) } as any)}
      onUpdate={(id, v) => u.mutateAsync({ id, ...v, itemId: v.itemId ? Number(v.itemId) : undefined } as any)}
      onDelete={(id) => d.mutateAsync(id)} />
  );
}

export function ItemOffersPage() {
  const q = trpc.parity.inventory.offers.list.useQuery();
  const items = trpc.items.list.useQuery({ page: 1, limit: 500 });
  const categories = trpc.items.categories.useQuery();
  const c = trpc.parity.inventory.offers.create.useMutation();
  const u = trpc.parity.inventory.offers.update.useMutation();
  const d = trpc.parity.inventory.offers.delete.useMutation();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [filterItemId, setFilterItemId] = useState("");
  const [barcodeSearch, setBarcodeSearch] = useState("");
  const [filterPriceType, setFilterPriceType] = useState("");
  const [filterBranchId, setFilterBranchId] = useState("");
  const [filterAreaId, setFilterAreaId] = useState("");
  const [filterContactCategoryId, setFilterContactCategoryId] = useState("");
  const [filterCustomerId, setFilterCustomerId] = useState("");
  const [filterActive, setFilterActive] = useState<"" | "1" | "0">("");

  const branchesQ = trpc.settings.branches.list.useQuery();
  const areasQ = trpc.parity.sales.areas.list.useQuery();
  const contactCatsQ = trpc.contactCategories.list.useQuery();
  const customersQ = trpc.customers.list.useQuery({ page: 1, limit: 400 });

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
    priceType: v.priceType || null,
    branchId: v.branchId ? Number(v.branchId) : null,
    areaId: v.areaId ? Number(v.areaId) : null,
    contactCategoryId: v.contactCategoryId ? Number(v.contactCategoryId) : null,
    customerId: v.customerId ? Number(v.customerId) : null,
    isActive: v.isActive === undefined ? undefined : v.isActive === "true" || v.isActive === "1",
  });

  const filtered = useMemo(() => {
    const itemRows = items.data?.rows || [];
    return (q.data || []).filter((r: any) => {
      if (dateFrom && r.startDate && toDateStr(r.startDate) < dateFrom) return false;
      if (dateTo && r.endDate && toDateStr(r.endDate) > dateTo) return false;
      if (filterCategoryId && String(r.categoryId || "") !== filterCategoryId) return false;
      if (filterItemId && String(r.itemId || "") !== filterItemId) return false;
      if (filterPriceType && String(r.priceType || "") !== filterPriceType) return false;
      if (filterBranchId && String(r.branchId || "") !== filterBranchId) return false;
      if (filterAreaId && String(r.areaId || "") !== filterAreaId) return false;
      if (filterContactCategoryId && String(r.contactCategoryId || "") !== filterContactCategoryId) return false;
      if (filterCustomerId && String(r.customerId || "") !== filterCustomerId) return false;
      if (filterActive === "1" && r.isActive === false) return false;
      if (filterActive === "0" && r.isActive !== false) return false;
      if (barcodeSearch.trim()) {
        const qBar = barcodeSearch.trim().toLowerCase();
        const hit = itemRows.find((i: any) => i.id === r.itemId);
        const hay = `${hit?.barcode || ""} ${hit?.code || ""} ${r.itemName || ""} ${r.itemBarcode || ""}`.toLowerCase();
        if (!hay.includes(qBar)) return false;
      }
      return true;
    });
  }, [q.data, dateFrom, dateTo, filterCategoryId, filterItemId, barcodeSearch, filterPriceType, filterBranchId, filterAreaId, filterContactCategoryId, filterCustomerId, filterActive, items.data]);

  return (
    <SimpleEntityPage title="العروض" tableTitle="عروض الأسعار" data={filtered as any} isLoading={q.isLoading} onRefresh={() => q.refetch()}
      entity={{ moduleKey: "inventory", entityKey: "offers" }}
      extraActions={
        <div className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs">من تاريخ</Label>
            <Input type="date" className="h-9 w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">الى تاريخ</Label>
            <Input type="date" className="h-9 w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">الفئة</Label>
            <Select value={filterCategoryId || "all"} onValueChange={(v) => setFilterCategoryId(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="كل الفئات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفئات</SelectItem>
                {(categories.data || []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">الصنف</Label>
            <Select value={filterItemId || "all"} onValueChange={(v) => setFilterItemId(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="كل الأصناف" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأصناف</SelectItem>
                {(items.data?.rows || []).map((i: any) => (
                  <SelectItem key={i.id} value={String(i.id)}>{i.code ? `${i.code} — ${i.name}` : i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">الباركود</Label>
            <Input className="h-9 w-36" value={barcodeSearch} onChange={(e) => setBarcodeSearch(e.target.value)} placeholder="بحث..." />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">نوع السعر</Label>
            <Select value={filterPriceType || "all"} onValueChange={(v) => setFilterPriceType(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 w-36 text-sm"><SelectValue placeholder="الكل" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {["سعر البيع", "سعر الجملة", "سعر القطاعي", "سعر التصدير", "سعر خاص"].map((x) => (
                  <SelectItem key={x} value={x}>{x}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">الفرع</Label>
            <Select value={filterBranchId || "all"} onValueChange={(v) => setFilterBranchId(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 w-36 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {(branchesQ.data || []).map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">المنطقة</Label>
            <Select value={filterAreaId || "all"} onValueChange={(v) => setFilterAreaId(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 w-36 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {(areasQ.data || []).map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">فئة العميل</Label>
            <Select value={filterContactCategoryId || "all"} onValueChange={(v) => setFilterContactCategoryId(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {(contactCatsQ.data || []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">العميل</Label>
            <Select value={filterCustomerId || "all"} onValueChange={(v) => setFilterCustomerId(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 w-44 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {(customersQ.data?.rows || []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">الحالة</Label>
            <Select value={filterActive || "all"} onValueChange={(v) => setFilterActive(v === "all" ? "" : v as any)}>
              <SelectTrigger className="h-9 w-28 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="1">نشط</SelectItem>
                <SelectItem value="0">متوقف</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => {
            setDateFrom(""); setDateTo(""); setFilterCategoryId(""); setFilterItemId(""); setBarcodeSearch("");
            setFilterPriceType(""); setFilterBranchId(""); setFilterAreaId(""); setFilterContactCategoryId(""); setFilterCustomerId(""); setFilterActive("");
          }}>تفريغ</Button>
        </div>
      }
      columns={[
        { key: "name", label: "العرض" },
        { key: "priceType", label: "نوع السعر", render: (r) => r.priceType ? String(r.priceType) : "—" },
        { key: "discountPercent", label: "الخصم %" },
        { key: "itemName", label: "الصنف", render: (r) => r.itemName ? String(r.itemName) : "—" },
        { key: "categoryName", label: "الفئة", render: (r) => r.categoryName ? String(r.categoryName) : "—" },
        { key: "isActive", label: "الحالة", render: (r) => r.isActive === false ? "متوقف" : "نشط" },
        { key: "startDate", label: "من", render: (r) => r.startDate ? toDateStr(r.startDate) : "—" },
        { key: "endDate", label: "إلى", render: (r) => r.endDate ? toDateStr(r.endDate) : "—" },
      ]}
      fields={[
        { key: "name", label: "اسم العرض", required: true },
        { key: "priceType", label: "نوع السعر", type: "select", options: [
          { value: "", label: "—" },
          ...["سعر البيع", "سعر الجملة", "سعر القطاعي", "سعر التصدير", "سعر خاص"].map((x) => ({ value: x, label: x })),
        ] },
        { key: "discountPercent", label: "نسبة الخصم" },
        { key: "itemId", label: "صنف محدد (اختياري)", type: "select", options: itemOptions },
        { key: "categoryId", label: "فئة محددة (اختياري)", type: "select", options: categoryOptions },
        { key: "branchId", label: "الفرع", type: "select", options: [{ value: "", label: "—" }, ...(branchesQ.data || []).map((b: any) => ({ value: String(b.id), label: b.name }))] },
        { key: "areaId", label: "المنطقة", type: "select", options: [{ value: "", label: "—" }, ...(areasQ.data || []).map((a: any) => ({ value: String(a.id), label: a.name }))] },
        { key: "contactCategoryId", label: "فئة العميل", type: "select", options: [{ value: "", label: "—" }, ...(contactCatsQ.data || []).map((c: any) => ({ value: String(c.id), label: c.name }))] },
        { key: "customerId", label: "العميل", type: "select", options: [{ value: "", label: "—" }, ...(customersQ.data?.rows || []).map((c: any) => ({ value: String(c.id), label: c.name }))] },
        { key: "isActive", label: "نشط", type: "select", options: [{ value: "true", label: "نعم" }, { value: "false", label: "لا" }] },
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
  const debouncedSearch = useDebouncedValue(search);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ itemId: "", serialNumber: "", warehouseId: "", status: "in_stock" });
  const items = useItemOptions();
  const warehouses = useWarehouseOptions();
  const q = trpc.parity.inventory.serials.list.useQuery({
    itemId: itemFilter ? Number(itemFilter) : undefined,
    status: statusFilter || undefined,
    search: debouncedSearch || undefined,
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
            <EntityPermissionGate moduleKey="inventory" entityKey="serials" action="add">
              <Button className="h-9 gap-1 font-extrabold" onClick={() => setAddOpen(true)}>
                <Plus size={14} /> إضافة سيريال
              </Button>
            </EntityPermissionGate>
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
                        <EntityPermissionGate moduleKey="inventory" entityKey="serials" action="edit">
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
                        </EntityPermissionGate>
                        <EntityPermissionGate moduleKey="inventory" entityKey="serials" action="deleteCancel">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-600"
                            onClick={() => confirm("حذف السيريال؟") && deleteMut.mutate(row.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </EntityPermissionGate>
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

type PriceEditField = "sale" | "purchase" | "min" | "max" | "percent_discount" | "cash_discount";
type PriceEditFrom = PriceEditField | "avg";

export function PriceChangerPage() {
  const items = trpc.items.list.useQuery({ page: 1, limit: 500 });
  const categories = trpc.items.categories.useQuery();
  const list = trpc.parity.inventory.priceChanges.list.useQuery();
  const applyBulk = trpc.parity.inventory.priceChanges.applyBulk.useMutation({
    onSuccess: (r) => { toast.success(`تم تحديث ${r.updated} صنف`); list.refetch(); items.refetch(); setDraft({}); },
    onError: (e) => toast.error(e.message),
  });
  const [priceType, setPriceType] = useState<PriceEditField>("sale");
  const [editFrom, setEditFrom] = useState<PriceEditFrom>("sale");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [altCategoryId, setAltCategoryId] = useState("");
  const [itemType, setItemType] = useState("");
  const [priceStatus, setPriceStatus] = useState<"" | "lt_avg" | "eq_avg" | "gt_avg">("");
  const [withStockOnly, setWithStockOnly] = useState(false);
  const [percentOnly, setPercentOnly] = useState(false);
  const [avgFromBranchId, setAvgFromBranchId] = useState("");
  const [avgFromWarehouseId, setAvgFromWarehouseId] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const [percentValue, setPercentValue] = useState("");
  const [decimals, setDecimals] = useState("2");
  const [draft, setDraft] = useState<Record<number, string>>({});
  const branchesQ = trpc.settings.branches.list.useQuery();
  const warehousesQ = trpc.warehouses.list.useQuery();

  const catName = (id: unknown) => {
    if (id == null || id === "") return "—";
    const c = (categories.data || []).find((r: any) => r.id === Number(id));
    return c?.name || String(id);
  };

  const rows = useMemo(() => {
    const all = items.data?.rows || [];
    const q = search.trim().toLowerCase();
    return all.filter((i: any) => {
      if (categoryId && String(i.categoryId || "") !== categoryId) return false;
      if (altCategoryId && String(i.altCategoryId || "") !== altCategoryId) return false;
      if (itemType && String(i.itemType || "") !== itemType) return false;
      if (withStockOnly && Number(i.currentStock || 0) <= 0) return false;
      if (priceStatus) {
        const price = Number(i.salePrice || 0);
        const avg = Number(i.averageCost || i.purchasePrice || 0);
        if (priceStatus === "lt_avg" && !(price < avg)) return false;
        if (priceStatus === "eq_avg" && Math.abs(price - avg) >= 0.0001) return false;
        if (priceStatus === "gt_avg" && !(price > avg)) return false;
      }
      if (!q) return true;
      return (
        String(i.name || "").toLowerCase().includes(q)
        || String(i.code || "").toLowerCase().includes(q)
        || String(i.barcode || "").toLowerCase().includes(q)
      );
    });
  }, [items.data, search, categoryId, altCategoryId, itemType, priceStatus, withStockOnly]);

  const dirtyRows = Object.entries(draft)
    .filter(([, v]) => v.trim() !== "")
    .map(([id, newPrice]) => ({ itemId: Number(id), newPrice }));

  const currentOf = (i: any) => {
    if (priceType === "purchase") return i.purchasePrice;
    if (priceType === "min") return i.minPrice;
    if (priceType === "max") return i.maxPrice;
    if (priceType === "percent_discount") return i.percentDiscount;
    if (priceType === "cash_discount") return i.cashDiscount;
    return i.salePrice;
  };

  const clearFilters = () => {
    setSearch("");
    setCategoryId("");
    setAltCategoryId("");
    setItemType("");
    setPriceStatus("");
    setWithStockOnly(false);
    setAvgFromBranchId("");
    setAvgFromWarehouseId("");
    setBulkValue("");
    setPercentValue("");
    setPercentOnly(false);
    setDraft({});
  };

  const runBulk = (mode: "absolute" | "percent") => {
    const value = mode === "percent" ? percentValue : bulkValue;
    if (!value.trim()) return toast.error(mode === "percent" ? "أدخل النسبة" : "أدخل القيمة");
    applyBulk.mutate({
      date,
      priceType,
      editFrom: mode === "percent" ? editFrom : undefined,
      mode,
      value,
      decimals: Number(decimals) || 2,
      percentOnly: mode === "percent" ? percentOnly : undefined,
      avgFromBranchId: avgFromBranchId ? Number(avgFromBranchId) : undefined,
      avgFromWarehouseId: avgFromWarehouseId ? Number(avgFromWarehouseId) : undefined,
      filter: {
        categoryId: categoryId ? Number(categoryId) : undefined,
        altCategoryId: altCategoryId ? Number(altCategoryId) : undefined,
        itemType: itemType || undefined,
        search: search || undefined,
        priceStatus: priceStatus || undefined,
        withStockOnly: withStockOnly || undefined,
      },
      rows: dirtyRows.length ? dirtyRows : rows.map((r: any) => ({ itemId: r.id })),
    });
  };

  return (
    <ERPLayout title="تغيير الأسعار">
      <div className="space-y-4">
        <Card className="erp-data-card border-0">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1 flex-1 min-w-[160px]">
                <Label className="text-xs font-bold">الباركود / الصنف</Label>
                <Input className="h-10" placeholder="كود أو باركود أو اسم..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">الفئة</Label>
                <Select value={categoryId || "all"} onValueChange={(v) => setCategoryId(v === "all" ? "" : v)}>
                  <SelectTrigger className="h-10 w-40"><SelectValue placeholder="كل الفئات" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الفئات</SelectItem>
                    {(categories.data || []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">فئة بديلة</Label>
                <Select value={altCategoryId || "all"} onValueChange={(v) => setAltCategoryId(v === "all" ? "" : v)}>
                  <SelectTrigger className="h-10 w-40"><SelectValue placeholder="كل البديلة" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل البديلة</SelectItem>
                    {(categories.data || []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">نوع الصنف</Label>
                <Select value={itemType || "all"} onValueChange={(v) => setItemType(v === "all" ? "" : v)}>
                  <SelectTrigger className="h-10 w-40"><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {MEGA_ITEM_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">حالة السعر</Label>
                <Select value={priceStatus || "all"} onValueChange={(v) => setPriceStatus(v === "all" ? "" : v as any)}>
                  <SelectTrigger className="h-10 w-48"><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    <SelectItem value="lt_avg">اقل من متوسط التكلفة</SelectItem>
                    <SelectItem value="eq_avg">مساوي لمتوسط التكلفة</SelectItem>
                    <SelectItem value="gt_avg">اكبر من متوسط التكلفة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">تعديل في</Label>
                <Select value={priceType} onValueChange={(v) => setPriceType(v as PriceEditField)}>
                  <SelectTrigger className="h-10 w-48 font-bold"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sale">السعر</SelectItem>
                    <SelectItem value="purchase">تكلفة الشراء الافتراضية</SelectItem>
                    <SelectItem value="min">السعر الادنى</SelectItem>
                    <SelectItem value="max">السعر الاعلى</SelectItem>
                    <SelectItem value="cash_discount">خصم نقدي</SelectItem>
                    <SelectItem value="percent_discount">خصم نسبة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">من</Label>
                <Select value={editFrom} onValueChange={(v) => setEditFrom(v as PriceEditFrom)}>
                  <SelectTrigger className="h-10 w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sale">السعر</SelectItem>
                    <SelectItem value="purchase">تكلفة الشراء الافتراضية</SelectItem>
                    <SelectItem value="avg">متوسط التكلفة</SelectItem>
                    <SelectItem value="min">السعر الادنى</SelectItem>
                    <SelectItem value="max">السعر الاعلى</SelectItem>
                    <SelectItem value="cash_discount">خصم نقدي</SelectItem>
                    <SelectItem value="percent_discount">خصم نسبة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">متوسط التكلفة من الفرع</Label>
                <Select value={avgFromBranchId || "all"} onValueChange={(v) => setAvgFromBranchId(v === "all" ? "" : v)}>
                  <SelectTrigger className="h-10 w-44"><SelectValue placeholder="كل الفروع" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الفروع</SelectItem>
                    {(branchesQ.data || []).map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">متوسط التكلفة من المخزن</Label>
                <Select value={avgFromWarehouseId || "all"} onValueChange={(v) => setAvgFromWarehouseId(v === "all" ? "" : v)}>
                  <SelectTrigger className="h-10 w-44"><SelectValue placeholder="كل المخازن" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل المخازن</SelectItem>
                    {(warehousesQ.data || [])
                      .filter((w: any) => !avgFromBranchId || String(w.branchId || "") === avgFromBranchId)
                      .map((w: any) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">التاريخ</Label>
                <Input type="date" className="h-10" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <Button type="button" variant="outline" className="h-10" onClick={clearFilters}>تفريغ</Button>
            </div>
            <div className="flex flex-wrap gap-3 items-end">
              <label className="flex items-center gap-2 text-sm font-semibold h-10 px-1">
                <input type="checkbox" checked={withStockOnly} onChange={(e) => setWithStockOnly(e.target.checked)} />
                عرض الاصناف التى لها رصيد فقط
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold h-10 px-1">
                <input type="checkbox" checked={percentOnly} onChange={(e) => setPercentOnly(e.target.checked)} />
                تطبيق النسبة فقط
              </label>
              <div className="space-y-1">
                <Label className="text-xs font-bold">القيمة</Label>
                <Input className="h-10 w-28" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">النسبة %</Label>
                <Input className="h-10 w-24" value={percentValue} onChange={(e) => setPercentValue(e.target.value)} placeholder="10" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">التقريب الى كم رقم عشري؟</Label>
                <Input className="h-10 w-20" value={decimals} onChange={(e) => setDecimals(e.target.value)} />
              </div>
              <EntityPermissionGate moduleKey="inventory" entityKey="priceChange" action="edit">
                <Button className="h-10 font-extrabold" disabled={applyBulk.isPending} onClick={() => runBulk("absolute")}>
                  تغيير بالقيمة
                </Button>
                <Button variant="secondary" className="h-10 font-extrabold" disabled={applyBulk.isPending} onClick={() => runBulk("percent")}>
                  تغيير بنسبة
                </Button>
                <Button
                  className="h-10 font-extrabold"
                  disabled={!dirtyRows.length || applyBulk.isPending}
                  onClick={() => applyBulk.mutate({ date, priceType, mode: "absolute", rows: dirtyRows, decimals: Number(decimals) || 2 })}
                >
                  حفظ الصفوف المعدّلة ({dirtyRows.length})
                </Button>
              </EntityPermissionGate>
            </div>
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="erp-data-card border-0 overflow-hidden lg:col-span-2">
            <CardHeader className="py-3 border-b bg-slate-50"><CardTitle className="text-sm font-extrabold">الأصناف ({rows.length})</CardTitle></CardHeader>
            <CardContent className="p-0 max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-800 text-white">
                  <tr>
                    <th className="px-2 py-2 text-right text-xs">الفئة</th>
                    <th className="px-2 py-2 text-right text-xs">الاسم</th>
                    <th className="px-2 py-2 text-right text-xs">الباركود</th>
                    <th className="px-2 py-2 text-right text-xs">نوع الصنف</th>
                    <th className="px-2 py-2 text-right text-xs">وحدة القياس</th>
                    <th className="px-2 py-2 text-right text-xs">تكلفة الشراء</th>
                    <th className="px-2 py-2 text-right text-xs">متوسط التكلفة</th>
                    <th className="px-2 py-2 text-right text-xs">السعر</th>
                    <th className="px-2 py-2 text-right text-xs">خصم %</th>
                    <th className="px-2 py-2 text-right text-xs">خصم نقدي</th>
                    <th className="px-2 py-2 text-right text-xs">الادنى</th>
                    <th className="px-2 py-2 text-right text-xs">الاعلى</th>
                    <th className="px-2 py-2 text-right text-xs">الجديد</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i: any) => (
                    <tr key={i.id} className="border-b hover:bg-sky-50/50">
                      <td className="px-2 py-1.5 text-xs">{catName(i.categoryId)}</td>
                      <td className="px-2 py-1.5 font-semibold">{i.code ? `${i.code} — ` : ""}{i.name}</td>
                      <td className="px-2 py-1.5 text-xs">{i.barcode || "—"}</td>
                      <td className="px-2 py-1.5 text-xs text-slate-500">{i.itemType || "—"}</td>
                      <td className="px-2 py-1.5 text-xs">{i.unit || "—"}</td>
                      <td className="px-2 py-1.5">{Number(i.purchasePrice || 0).toLocaleString("en-US")}</td>
                      <td className="px-2 py-1.5">{Number(i.averageCost || 0).toLocaleString("en-US")}</td>
                      <td className="px-2 py-1.5">{Number(i.salePrice || 0).toLocaleString("en-US")}</td>
                      <td className="px-2 py-1.5">{Number(i.percentDiscount || 0).toLocaleString("en-US")}</td>
                      <td className="px-2 py-1.5">{Number(i.cashDiscount || 0).toLocaleString("en-US")}</td>
                      <td className="px-2 py-1.5">{Number(i.minPrice || 0).toLocaleString("en-US")}</td>
                      <td className="px-2 py-1.5">{Number(i.maxPrice || 0).toLocaleString("en-US")}</td>
                      <td className="px-2 py-1">
                        <Input
                          className="h-8 text-sm w-24"
                          placeholder={String(Number(currentOf(i) || 0))}
                          value={draft[i.id] ?? ""}
                          onChange={(e) => setDraft((d) => ({ ...d, [i.id]: e.target.value }))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="erp-data-card border-0 overflow-hidden lg:col-span-2">
            <CardHeader className="py-3 border-b bg-slate-50"><CardTitle className="text-sm font-extrabold">سجل التغييرات</CardTitle></CardHeader>
            <CardContent className="p-0 max-h-[40vh] overflow-auto">
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
  const confirmMut = trpc.parity.inventory.beginningInventory.confirm.useMutation({
    onSuccess: (r) => { toast.success(`تم اعتماد ${r.confirmed} سطر`); q.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const unconfirmMut = trpc.parity.inventory.beginningInventory.unconfirm.useMutation({
    onSuccess: (r) => { toast.success(`تم فك اعتماد ${r.unconfirmed} سطر`); q.refetch(); },
    onError: (e) => toast.error(e.message),
  });
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
  const branchesQ = trpc.settings.branches.list.useQuery();
  const tenantSlug = useTenantSlug();
  const [, navigate] = useLocation();
  const [itemSearch, setItemSearch] = useState("");
  const [headerBranchId, setHeaderBranchId] = useState("");
  const [headerRef, setHeaderRef] = useState("");
  const [headerNotes, setHeaderNotes] = useState("");
  const [saveAsDraft, setSaveAsDraft] = useState(true);

  const branchOptions = useMemo(() => [
    { value: "", label: "— بدون فرع —" },
    ...((branchesQ.data || []).map((b: any) => ({ value: String(b.id), label: b.name }))),
  ], [branchesQ.data]);

  const filtered = useMemo(() => {
    const qBar = itemSearch.trim().toLowerCase();
    if (!qBar) return q.data || [];
    return (q.data || []).filter((r: any) => {
      const hay = `${r.itemName || ""} ${r.itemCode || ""} ${r.itemBarcode || ""} ${r.warehouseName || ""} ${r.branchName || ""} ${r.categoryName || ""} ${r.referenceNumber || ""} ${r.batchNumber || ""}`.toLowerCase();
      return hay.includes(qBar);
    });
  }, [q.data, itemSearch]);

  const draftIds = useMemo(() => filtered.filter((r: any) => r.status === "draft").map((r: any) => r.id), [filtered]);
  const confirmedIds = useMemo(() => filtered.filter((r: any) => r.status === "confirmed").map((r: any) => r.id), [filtered]);

  const printRows = () => {
    printTableReport({
      title: "مخزون أول المدة",
      columns: [
        { key: "warehouseName", label: "المخزن" },
        { key: "categoryName", label: "الفئة" },
        { key: "itemBarcode", label: "الباركود" },
        { key: "itemName", label: "الصنف" },
        { key: "quantity", label: "الكمية" },
        { key: "itemUnit", label: "الوحدة" },
        { key: "batchNumber", label: "رقم التشغيلة" },
        { key: "unitCost", label: "التكلفة" },
        { key: "lineTotal", label: "الإجمالي" },
        { key: "status", label: "الحالة" },
      ],
      rows: filtered.map((r: any) => ({
        warehouseName: r.warehouseName || "—",
        categoryName: r.categoryName || "—",
        itemBarcode: r.itemBarcode || "—",
        itemName: r.itemCode ? `${r.itemCode} — ${r.itemName}` : (r.itemName || "—"),
        quantity: Number(r.quantity || 0).toLocaleString("en-US"),
        itemUnit: r.itemUnit || "—",
        batchNumber: r.batchNumber || "—",
        unitCost: Number(r.unitCost || 0).toLocaleString("en-US"),
        lineTotal: Number(r.lineTotal ?? (Number(r.quantity || 0) * Number(r.unitCost || 0))).toLocaleString("en-US"),
        status: r.status === "draft" ? "معلق" : "معتمد",
      })),
    });
  };

  return (
    <SimpleEntityPage
      title="مخزون أول المدة"
      tableTitle="سجلات مخزون أول المدة"
      data={filtered as any}
      isLoading={q.isLoading}
      onRefresh={() => q.refetch()}
      entity={{ moduleKey: "inventory", entityKey: "beginningInventory" }}
      canEdit={false}
      extraActions={
        <div className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs">الفرع (رأس المستند)</Label>
            <Select value={headerBranchId || "none"} onValueChange={(v) => setHeaderBranchId(v === "none" ? "" : v)}>
              <SelectTrigger className="h-9 w-40"><SelectValue placeholder="فرع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— بدون —</SelectItem>
                {(branchesQ.data || []).map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">رقم المرجع</Label>
            <Input className="h-9 w-36" value={headerRef} onChange={(e) => setHeaderRef(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">ملاحظات</Label>
            <Input className="h-9 w-40" value={headerNotes} onChange={(e) => setHeaderNotes(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold h-9 px-1">
            <input type="checkbox" checked={saveAsDraft} onChange={(e) => setSaveAsDraft(e.target.checked)} />
            حفظ معلق (بدون حركة)
          </label>
          <div className="space-y-1">
            <Label className="text-xs">بحث بالصنف</Label>
            <Input className="h-9 w-44" value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="اسم / كود / باركود" />
          </div>
          <Button type="button" size="sm" variant="outline" className="h-9 font-extrabold" onClick={printRows}>طباعة</Button>
          <EntityPermissionGate moduleKey="inventory" entityKey="beginningInventory" action="edit">
            <Button
              size="sm"
              className="h-9 font-extrabold bg-teal-600 hover:bg-teal-700"
              disabled={!draftIds.length || confirmMut.isPending}
              onClick={() => {
                if (!confirm(`اعتماد ${draftIds.length} سطر معلق وترحيل المخزون؟`)) return;
                confirmMut.mutate({ ids: draftIds });
              }}
            >
              اعتماد ({draftIds.length})
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-9 font-extrabold"
              disabled={!confirmedIds.length || unconfirmMut.isPending}
              onClick={() => {
                if (!confirm(`فك اعتماد ${confirmedIds.length} سطر وعكس الكميات؟`)) return;
                unconfirmMut.mutate({ ids: confirmedIds });
              }}
            >
              فك اعتماد ({confirmedIds.length})
            </Button>
          </EntityPermissionGate>
          <EntityPermissionGate moduleKey="inventory" entityKey="beginningInventory" action="add">
            <Button size="sm" variant="outline" className="font-extrabold gap-1" onClick={() => navigate(tenantPath(tenantSlug, "/inventory/mega-report-import"))}>
              <Upload size={14} /> استيراد تقارير Excel
            </Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 font-extrabold gap-1" onClick={() => navigate(tenantPath(tenantSlug, "/inventory/beginning-inventory/smart-import"))}>
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
                if (!confirm(`مسح كل سجلات مخزون أول المدة (${n}) وعكس كمياتها من المخازن؟`)) return;
                if (!confirm("تأكيد أخير: المسح لا يمكن التراجع عنه من هنا.")) return;
                clearAll.mutate({ confirm: "CLEAR_BEGINNING_INVENTORY" });
              }}
            >
              {clearAll.isPending ? "جاري المسح..." : "مسح كل مخزون أول المدة"}
            </Button>
          </EntityPermissionGate>
        </div>
      }
      columns={[
        { key: "branchName", label: "الفرع", render: (r) => (r.branchName ? String(r.branchName) : "—") },
        { key: "warehouseName", label: "المخزن" },
        { key: "referenceNumber", label: "المرجع", render: (r) => (r.referenceNumber ? String(r.referenceNumber) : "—") },
        { key: "categoryName", label: "الفئة", render: (r) => (r.categoryName ? String(r.categoryName) : "—") },
        { key: "itemBarcode", label: "الباركود", render: (r) => (r.itemBarcode ? String(r.itemBarcode) : "—") },
        { key: "itemName", label: "الصنف", render: (r) => (
          <span className="font-bold">
            {r.itemCode ? `${String(r.itemCode)} — ` : ""}{String(r.itemName || "—")}
          </span>
        ) },
        { key: "itemUnit", label: "الوحدة", render: (r) => (r.itemUnit ? String(r.itemUnit) : "—") },
        { key: "batchNumber", label: "رقم التشغيلة", render: (r) => (r.batchNumber ? String(r.batchNumber) : "—") },
        { key: "quantity", label: "الكمية", render: (r) => Number(r.quantity || 0).toLocaleString("en-US") },
        { key: "unitCost", label: "التكلفة", render: (r) => Number(r.unitCost || 0).toLocaleString("en-US") },
        { key: "lineTotal", label: "الإجمالي", render: (r) => Number(r.lineTotal ?? (Number(r.quantity || 0) * Number(r.unitCost || 0))).toLocaleString("en-US") },
        { key: "status", label: "الحالة", render: (r) => (r.status === "draft" ? "معلق" : "معتمد") },
        { key: "date", label: "التاريخ", render: (r) => toDateStr(r.date) },
      ]}
      fields={[
        { key: "warehouseId", label: "المخزن", type: "select", required: true, options: warehouses },
        { key: "itemId", label: "الصنف", type: "select", required: true, options: items },
        { key: "quantity", label: "الكمية", required: true },
        { key: "unitCost", label: "تكلفة الوحدة" },
        { key: "batchNumber", label: "رقم التشغيلة" },
        { key: "date", label: "التاريخ", type: "date", required: true },
      ]}
      onCreate={(v) => c.mutateAsync({
        ...v,
        warehouseId: Number(v.warehouseId),
        itemId: Number(v.itemId),
        batchNumber: v.batchNumber || null,
        branchId: headerBranchId ? Number(headerBranchId) : null,
        referenceNumber: headerRef || null,
        notes: headerNotes || null,
        confirm: !saveAsDraft,
      } as any)}
      onUpdate={() => {}}
      onDelete={(id) => d.mutateAsync(id)}
    />
  );
}
