import { useMemo, useState } from "react";
import { useMegaCreateRoute } from "@/hooks/useMegaCreateRoute";
import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, ClipboardList, Trash2, Search, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { AddActionButton } from "@/components/AddActionButton";
import EntityPermissionGate from "@/components/EntityPermissionGate";
import { ItemSearchSelect } from "@/components/ItemSearchSelect";
import { PartySearchSelect } from "@/components/PartySearchSelect";
import { SearchSelect } from "@/components/SearchSelect";
import { AccountSearchSelect } from "@/components/AccountSearchSelect";
import { findItemByScan } from "@/lib/barcode";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { printWarehouseNote } from "@/lib/print-invoice-quick";
import { warehousesForBranch } from "@/lib/warehouse-options";

type LineItem = {
  itemId: string;
  quantity: string;
  actualQty: string;
  unitCost: string;
  batchNumber: string;
  unit: string;
  reason: string;
  available?: number;
};

const emptyLine = (): LineItem => ({
  itemId: "",
  quantity: "",
  actualQty: "",
  unitCost: "",
  batchNumber: "",
  unit: "",
  reason: "",
});

function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

/**
 * تسوية مخزنية — مطابقة ميجا كاش (InventoryCorrection) بالظبط:
 * رأس عمودين: تاريخ·فرع·حساب مقابل | مرجع·عميل·مركز تكلفة
 * لوحة الأصناف: مخزن·باركود·فئة (فلاتر السطر) ثم سطور بكمية موقّعة (موجب وارد، سالب صادر)
 * دورة حياة: مسودة → اعتماد (ترحيل مخزون/قيد) → فك اعتماد/إلغاء — زي باقي مستندات البرنامج
 */
export default function InventoryAdjustments() {
  const { isNewRoute, goToList, goToCreate } = useMegaCreateRoute("/inventory/adjustments");
  const [form, setForm] = useState({
    warehouseId: "",
    branchId: "",
    date: new Date().toISOString().split("T")[0],
    notes: "",
    contraAccountId: "",
    costCenterId: "",
    customerId: "",
    reference: "",
  });
  const [items, setItems] = useState<LineItem[]>([emptyLine()]);
  const [lineCategoryId, setLineCategoryId] = useState("");
  const [lastSavedNumber, setLastSavedNumber] = useState("");
  const [barcode, setBarcode] = useState("");
  const [printAfterSave, setPrintAfterSave] = useState(false);
  const [printAfterApprove, setPrintAfterApprove] = useState(false);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterWarehouseId, setFilterWarehouseId] = useState("");
  const [filterBranchId, setFilterBranchId] = useState("");
  const [filterCustomerId, setFilterCustomerId] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | "draft" | "confirmed" | "cancelled">("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const { data, refetch } = trpc.inventory.adjustments.list.useQuery({
    page: 1,
    limit: 100,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    warehouseId: filterWarehouseId ? Number(filterWarehouseId) : undefined,
    branchId: filterBranchId ? Number(filterBranchId) : undefined,
    customerId: filterCustomerId ? Number(filterCustomerId) : undefined,
    status: filterStatus || undefined,
    search: debouncedSearch || undefined,
  }, { enabled: !isNewRoute });
  const { data: warehouses } = trpc.warehouses.list.useQuery();
  const { data: branches } = trpc.settings.branches.list.useQuery();
  const allItemsQ = trpc.items.all.useQuery();
  const needListFallback = allItemsQ.isError || (allItemsQ.isSuccess && (allItemsQ.data?.length ?? 0) === 0);
  const listFallbackQ = trpc.items.list.useQuery(
    { page: 1, limit: 2000 },
    { enabled: needListFallback, retry: 1 },
  );
  const { data: categories } = trpc.items.categories.useQuery();
  const { data: accountsChart } = trpc.accounts.chart.useQuery();
  const { data: costCentersList } = trpc.costCenters.list.useQuery();
  const { data: customersList } = trpc.customers.list.useQuery({ page: 1, limit: 500 });
  const utils = trpc.useUtils();

  const itemRows = useMemo(() => {
    if (allItemsQ.data && allItemsQ.data.length > 0) return allItemsQ.data;
    if (listFallbackQ.data?.rows && listFallbackQ.data.rows.length > 0) return listFallbackQ.data.rows;
    return [] as any[];
  }, [allItemsQ.data, listFallbackQ.data]);
  const itemMap = useMemo(() => new Map(itemRows.map((i: any) => [String(i.id), i])), [itemRows]);
  const categoryMap = useMemo(() => new Map((categories || []).map((c: any) => [c.id, c.name])), [categories]);

  const itemIds = useMemo(() => {
    const ids = new Set<number>();
    for (const it of items) if (it.itemId) ids.add(Number(it.itemId));
    return [...ids];
  }, [items]);
  const { data: stockData } = trpc.inventory.adjustments.itemStock.useQuery(
    { itemIds }, { enabled: isNewRoute && itemIds.length > 0 },
  );
  const stockMap = useMemo(() => {
    const map = new Map<string, Map<number, number>>();
    for (const r of stockData?.rows || []) {
      const key = String(r.itemId);
      if (!map.has(key)) map.set(key, new Map());
      map.get(key)!.set(r.warehouseId, Number(r.quantity || 0));
    }
    return map;
  }, [stockData]);
  const availableFor = (itemId: string) => {
    const whId = Number(form.warehouseId || 0);
    if (!itemId || !whId) return undefined;
    return stockMap.get(itemId)?.get(whId);
  };

  const costCenterOptions = useMemo(
    () => (costCentersList || []).map((c: any) => ({ id: c.id, label: c.name })),
    [costCentersList],
  );
  const warehouseOptions = useMemo(
    () => warehousesForBranch(warehouses as any[] || [], form.branchId),
    [warehouses, form.branchId],
  );
  const leafAccounts = (accountsChart || []).filter((a: any) => !a.isParent);
  const filteredItems = itemRows.filter(
    (x: any) => !lineCategoryId || String(x.categoryId || "") === lineCategoryId,
  );

  const totals = useMemo(() => {
    let inQty = 0;
    let outQty = 0;
    let inValue = 0;
    let outValue = 0;
    for (const it of items) {
      const available = availableFor(it.itemId);
      const cost = Number(it.unitCost || 0);
      let diff: number | null = null;
      if (it.actualQty.trim() !== "" && available != null) {
        diff = Number(it.actualQty) - available;
      } else if (it.quantity.trim() !== "") {
        diff = Number(it.quantity);
      }
      if (diff == null) continue;
      if (diff >= 0) { inQty += diff; inValue += diff * cost; }
      else { outQty += Math.abs(diff); outValue += Math.abs(diff) * cost; }
    }
    return { qty: inQty + outQty, value: inValue + outValue, inQty, outQty, inValue, outValue };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, stockMap, form.warehouseId]);

  const firePrint = (number: string) => {
    const whName = (warehouses as any[] || []).find((w: any) => String(w.id) === form.warehouseId)?.name || "—";
    const lines = items
      .filter((it) => it.itemId)
      .map((it) => {
        const row: any = itemMap.get(it.itemId);
        return {
          name: row ? (row.code ? `${row.code} — ${row.name}` : row.name) : it.itemId,
          quantity: Number(it.quantity || it.actualQty || 0),
          unit: row?.unit || it.unit || "",
          warehouseName: whName,
        };
      });
    printWarehouseNote({
      title: "تسوية مخزنية",
      number,
      date: form.date,
      partyLabel: "المخزن",
      partyName: whName,
      lines,
    });
  };

  const createMut = trpc.inventory.adjustments.create.useMutation({ onError: (e) => toast.error(e.message) });
  const confirmMut = trpc.inventory.adjustments.confirm.useMutation({
    onSuccess: () => { toast.success("تم اعتماد التسوية وترحيل المخزون/القيد"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const unconfirmMut = trpc.inventory.adjustments.unconfirm.useMutation({
    onSuccess: () => { toast.success("تم فك اعتماد التسوية"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const cancelMut = trpc.inventory.adjustments.cancel.useMutation({
    onSuccess: () => { toast.success("تم إلغاء التسوية"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setForm({
      warehouseId: "", branchId: "", date: new Date().toISOString().split("T")[0],
      notes: "", contraAccountId: "", costCenterId: "", customerId: "", reference: "",
    });
    setItems([emptyLine()]);
    setBarcode("");
    setLineCategoryId("");
    setLastSavedNumber("");
  };

  const addItem = () => setItems((prev) => [...prev, emptyLine()]);
  const removeItem = (i: number) => setItems((prev) => (prev.length <= 1 ? [emptyLine()] : prev.filter((_, idx) => idx !== i)));
  const clearLines = () => setItems([emptyLine()]);

  const updateItem = (i: number, field: keyof LineItem, val: string) => {
    setItems((prev) => prev.map((item, idx) => {
      if (idx !== i) return item;
      const next = { ...item, [field]: val };
      if (field === "itemId") {
        const row: any = itemMap.get(val);
        if (row) {
          if (!item.unitCost) next.unitCost = String(row.averageCost ?? row.purchasePrice ?? "");
          if (!item.unit) next.unit = String(row.unit || "");
        }
      }
      return next;
    }));
  };

  const handleBarcode = () => {
    const hit: any = findItemByScan(itemRows as any, barcode);
    if (!hit) return toast.error("باركود غير موجود");
    const emptyIdx = items.findIndex((it) => !it.itemId);
    if (emptyIdx >= 0) {
      updateItem(emptyIdx, "itemId", String(hit.id));
    } else {
      setItems((prev) => [...prev, {
        itemId: String(hit.id), quantity: "1", actualQty: "",
        unitCost: String(hit.averageCost ?? hit.purchasePrice ?? ""),
        batchNumber: "", unit: String(hit.unit || ""), reason: "",
      }]);
    }
    setBarcode("");
  };

  const handleSubmit = (confirm: boolean) => {
    if (!form.warehouseId) return toast.error("يجب اختيار المخزن");
    if (!form.date) return toast.error("يجب اختيار التاريخ");
    const validItems = items.filter((it) => it.itemId);
    if (!validItems.length) return toast.error("يجب اختيار الصنف في سطر واحد على الأقل");
    if (validItems.some((it) => it.actualQty.trim() === "" && it.quantity.trim() === "")) {
      return toast.error("أدخل كمية واردة/صادرة (موجب أو سالب) أو كمية فعلية لكل صنف");
    }
    createMut.mutate({
      warehouseId: Number(form.warehouseId),
      date: form.date,
      reference: form.reference || undefined,
      branchId: form.branchId ? Number(form.branchId) : undefined,
      costCenterId: form.costCenterId ? Number(form.costCenterId) : undefined,
      contraAccountId: form.contraAccountId ? Number(form.contraAccountId) : undefined,
      customerId: form.customerId ? Number(form.customerId) : undefined,
      notes: form.notes || undefined,
      confirm,
      items: validItems.map((it) => ({
        itemId: Number(it.itemId),
        quantity: it.quantity || undefined,
        actualQty: it.actualQty || undefined,
        unitCost: it.unitCost || undefined,
        unit: it.unit || undefined,
        batchNumber: it.batchNumber || undefined,
        notes: it.reason || undefined,
      })),
    }, {
      onSuccess: (r) => {
        toast.success(r.status === "draft" ? "تم حفظ التسوية معلّقة" : "تم اعتماد تسوية المخزون");
        setLastSavedNumber(r.number);
        if (confirm ? printAfterApprove : printAfterSave) firePrint(r.number);
        void utils.inventory.adjustments.list.invalidate();
        resetForm();
        goToList();
      },
    });
  };

  const statusLabel = (s: string) => ({ draft: "معلق", confirmed: "معتمد", cancelled: "ملغي" }[s] || s);
  const statusColor = (s: string) => ({ draft: "outline", confirmed: "default", cancelled: "destructive" }[s] || "outline") as any;

  const clearFilters = () => {
    setDateFrom(""); setDateTo(""); setFilterWarehouseId(""); setFilterBranchId("");
    setFilterCustomerId(""); setFilterStatus(""); setSearch("");
  };

  /* ─── صفحة الإنشاء الكاملة (مطابقة ميجا InventoryCorrection) ─── */
  if (isNewRoute) {
    return (
      <ERPLayout title="تسوية مخزنية">
        <div className="space-y-4 overflow-x-hidden" dir="rtl">
          <Button variant="ghost" size="sm" onClick={() => { resetForm(); goToList(); }} className="gap-1 text-slate-600">
            <ArrowRight size={16} />العودة للقائمة
          </Button>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <ClipboardList size={16} className="text-teal-600" />
                تسوية مخزنية
                {lastSavedNumber ? <span className="text-teal-700 font-medium text-xs">— {lastSavedNumber}</span> : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-5">
              {/* رأس ميجا: عمودان — تاريخ/فرع/حساب مقابل | مرجع/عميل/مركز تكلفة */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 max-w-4xl">
                <div>
                  <Label className="text-sm font-medium text-slate-700 mb-1.5 block">التاريخ *</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="h-11 text-sm" />
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-700 mb-1.5 block">المرجع</Label>
                  <Input value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} placeholder="رقم مرجعي (اختياري)" className="h-11 text-sm" />
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-700 mb-1.5 block">الفرع</Label>
                  <Select value={form.branchId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, branchId: v === "none" ? "" : v, warehouseId: "" }))}>
                    <SelectTrigger className="h-11 text-sm"><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون</SelectItem>
                      {(branches || []).map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-700 mb-1.5 block">العميل</Label>
                  <PartySearchSelect
                    parties={customersList?.rows || []}
                    value={form.customerId}
                    onChange={(v) => setForm((f) => ({ ...f, customerId: v }))}
                    placeholder="ابحث عميل…"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-700 mb-1.5 block">الحساب المقابل (لترحيل القيد المحاسبي — اختياري)</Label>
                  <AccountSearchSelect
                    accounts={leafAccounts}
                    value={form.contraAccountId}
                    onChange={(v) => setForm((f) => ({ ...f, contraAccountId: v }))}
                    placeholder="بدون — بدون أثر محاسبي"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-700 mb-1.5 block">مركز التكلفة</Label>
                  <SearchSelect
                    options={costCenterOptions}
                    value={form.costCenterId}
                    onChange={(v) => setForm((f) => ({ ...f, costCenterId: v }))}
                    placeholder="ابحث مركز تكلفة…"
                  />
                </div>
              </div>

              {/* لوحة الأصناف — ترتيب ميجا */}
              <Card className="border-0 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-3 flex-wrap bg-teal-600 px-4 py-2.5">
                  <CardTitle className="text-sm font-bold text-white">الأصناف</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button type="button" size="sm" variant="secondary" className="h-7 text-xs gap-1 bg-white/95 text-teal-700 hover:bg-white" onClick={addItem}>
                      <Plus size={12} /> إضافة
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-white hover:bg-teal-500" onClick={clearLines}>
                      تفريغ
                    </Button>
                  </div>
                </div>
                <CardContent className="p-3 space-y-3 bg-slate-50/60">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <Label className="text-xs font-medium mb-1 block">المخزن *</Label>
                      <SearchSelect
                        options={warehouseOptions}
                        value={form.warehouseId}
                        onChange={(v) => setForm((f) => ({ ...f, warehouseId: v }))}
                        placeholder="ابحث مخزن…"
                        emptyLabel={warehouseOptions.length === 0 ? "لا توجد مخازن" : "لا نتائج"}
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">الباركود</Label>
                      <div className="flex gap-1">
                        <Input
                          className="h-9 text-sm flex-1"
                          value={barcode}
                          onChange={(e) => setBarcode(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleBarcode(); } }}
                          placeholder="مسح باركود"
                        />
                        <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={handleBarcode}>+</Button>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs font-medium mb-1 block">الفئة</Label>
                      <Select value={lineCategoryId || "all"} onValueChange={(v) => setLineCategoryId(v === "all" ? "" : v)}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="كل الفئات" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">كل الفئات</SelectItem>
                          {(categories || []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    الكمية الواردة/الصادرة: <span className="font-semibold text-emerald-700">موجب = وارد</span>
                    {" · "}<span className="font-semibold text-rose-700">سالب = صادر</span>
                  </p>

                  {items.map((it, i) => {
                    const item: any = itemMap.get(it.itemId);
                    const available = availableFor(it.itemId);
                    const signed = Number(it.quantity || 0);
                    const dirHint = !it.quantity.trim() ? null : signed < 0 ? "صادر" : signed > 0 ? "وارد" : null;
                    return (
                      <div key={i} className="rounded-md border border-slate-200 bg-white p-3 space-y-3">
                        <div className="flex items-start gap-2">
                          <span className="shrink-0 w-5 text-center text-[11px] font-bold text-slate-400 pt-2">{i + 1}</span>
                          <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                            <div className="space-y-2 min-w-0">
                              <div className="space-y-1">
                                <Label className="text-[10px] text-slate-500">الصنف</Label>
                                <ItemSearchSelect items={filteredItems} value={it.itemId} onChange={(v) => updateItem(i, "itemId", v)} placeholder="اختر الصنف" />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] text-slate-500">
                                  الكمية الواردة / الصادرة
                                  {dirHint ? <span className={`me-2 font-semibold ${dirHint === "وارد" ? "text-emerald-700" : "text-rose-700"}`}> ({dirHint})</span> : null}
                                </Label>
                                <Input type="number" step="any" value={it.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} className="h-8 text-xs" placeholder="مثال: 5 أو -3" />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] text-slate-500">الباركود</Label>
                                <div className="h-8 flex items-center text-xs text-slate-500 px-2 rounded-md bg-slate-100 border">{item?.barcode || "—"}</div>
                              </div>
                            </div>
                            <div className="space-y-2 min-w-0">
                              <div className="space-y-1">
                                <Label className="text-[10px] text-slate-500">الكمية الفعلية</Label>
                                <Input type="number" step="any" value={it.actualQty} onChange={(e) => updateItem(i, "actualQty", e.target.value)} className="h-8 text-xs" placeholder="جرد (اختياري)" />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] text-slate-500">الكمية المتاحة</Label>
                                <div className="h-8 flex items-center text-xs font-semibold text-slate-600 px-2 rounded-md bg-slate-100 border">
                                  {available != null ? fmt(available) : "—"}
                                </div>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] text-slate-500">الوحدة</Label>
                                <Input value={it.unit} onChange={(e) => updateItem(i, "unit", e.target.value)} className="h-8 text-xs" />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] text-slate-500">التكلفة</Label>
                              <Input type="number" step="any" value={it.unitCost} onChange={(e) => updateItem(i, "unitCost", e.target.value)} className="h-8 text-xs" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] text-slate-500">رقم التشغيلة</Label>
                              <Input value={it.batchNumber} onChange={(e) => updateItem(i, "batchNumber", e.target.value)} className="h-8 text-xs" />
                            </div>
                            <div className="space-y-1 md:col-span-2">
                              <Label className="text-[10px] text-slate-500">ملاحظات</Label>
                              <Input value={it.reason} onChange={(e) => updateItem(i, "reason", e.target.value)} className="h-8 text-xs" placeholder="سبب التسوية…" />
                            </div>
                          </div>
                          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 shrink-0" onClick={() => removeItem(i)} title="حذف">
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* مجاميع */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm bg-slate-50 border rounded-lg px-3 py-2.5">
                <div><span className="text-slate-500 text-xs">اجمالي الوارد:</span> <strong>{fmt(totals.inValue)}</strong></div>
                <div><span className="text-slate-500 text-xs">اجمالي الصادر:</span> <strong>{fmt(totals.outValue)}</strong></div>
                <div><span className="text-slate-500 text-xs">الاجمالي:</span> <strong>{fmt(totals.value)}</strong></div>
                <div><span className="text-slate-500 text-xs">الكمية:</span> <strong>{fmt(totals.qty)}</strong></div>
              </div>

              <div>
                <Label className="text-sm font-medium text-slate-700 mb-1.5 block">ملاحظات</Label>
                <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="text-sm min-h-[72px]" />
              </div>

              <div className="flex flex-wrap gap-4 text-xs text-slate-600">
                <label className="flex items-center gap-2"><Checkbox checked={printAfterSave} onCheckedChange={(v) => setPrintAfterSave(!!v)} />طباعة بعد الحفظ</label>
                <label className="flex items-center gap-2"><Checkbox checked={printAfterApprove} onCheckedChange={(v) => setPrintAfterApprove(!!v)} />طباعة بعد الاعتماد</label>
              </div>

              {form.contraAccountId && (
                <p className="text-[11px] text-teal-800 bg-teal-50 border border-teal-100 rounded px-2 py-1.5">
                  عند الاعتماد يُنشأ قيد محاسبي: مخزون ↔ الحساب المقابل (بتكلفة متوسط/شراء الأصناف).
                </p>
              )}

              <div className="flex flex-wrap gap-2 justify-end border-t pt-4">
                <Button variant="outline" size="sm" onClick={() => { resetForm(); goToList(); }}>إغلاق</Button>
                <EntityPermissionGate moduleKey="inventory" entityKey="stockAdjustment" action="add">
                  <Button variant="secondary" size="sm" disabled={createMut.isPending} onClick={() => handleSubmit(false)}>حفظ</Button>
                  <Button size="sm" className="bg-teal-600 hover:bg-teal-700" disabled={createMut.isPending} onClick={() => handleSubmit(true)}>اعتماد</Button>
                </EntityPermissionGate>
              </div>
            </CardContent>
          </Card>
        </div>
      </ERPLayout>
    );
  }

  /* ─── قائمة التسويات ─── */
  return (
    <ERPLayout title="تسوية المخزون">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <ClipboardList size={18} className="text-teal-600" /> تسوية المخزون
            </CardTitle>
            <AddActionButton moduleKey="inventory" entityKey="stockAdjustment" size="sm" className="bg-teal-600 hover:bg-teal-700 text-white gap-1" onClick={() => { resetForm(); goToCreate(); }}>
              <Plus size={14} /> تسوية جديدة
            </AddActionButton>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end rounded-lg border bg-slate-50 p-3">
            <div className="space-y-1">
              <Label className="text-xs">من تاريخ</Label>
              <Input type="date" className="h-9 w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">الى تاريخ</Label>
              <Input type="date" className="h-9 w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">المخزن</Label>
              <Select value={filterWarehouseId || "all"} onValueChange={(v) => setFilterWarehouseId(v === "all" ? "" : v)}>
                <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="الكل" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {(warehouses as any[] || []).map((w: any) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">الفرع</Label>
              <Select value={filterBranchId || "all"} onValueChange={(v) => setFilterBranchId(v === "all" ? "" : v)}>
                <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="الكل" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {(branches || []).map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">العميل</Label>
              <Select value={filterCustomerId || "all"} onValueChange={(v) => setFilterCustomerId(v === "all" ? "" : v)}>
                <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="الكل" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {(customersList?.rows || []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">الحالة</Label>
              <Select value={filterStatus || "all"} onValueChange={(v) => setFilterStatus(v === "all" ? "" : v as any)}>
                <SelectTrigger className="h-9 w-36 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="draft">معلق</SelectItem>
                  <SelectItem value="confirmed">معتمد</SelectItem>
                  <SelectItem value="cancelled">ملغي</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1 min-w-[140px]">
              <Label className="text-xs">المسلسل / رقم المرجع</Label>
              <Input className="h-9" placeholder="بحث..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button type="button" variant="outline" size="sm" className="h-9 gap-1" onClick={() => refetch()}>
              <Search size={14} /> بحث
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-9" onClick={clearFilters}>تفريغ</Button>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-right text-xs font-semibold text-slate-600">المسلسل</TableHead>
                  <TableHead className="text-right text-xs font-semibold text-slate-600">المرجع</TableHead>
                  <TableHead className="text-right text-xs font-semibold text-slate-600">المخزن</TableHead>
                  <TableHead className="text-right text-xs font-semibold text-slate-600">التاريخ</TableHead>
                  <TableHead className="text-right text-xs font-semibold text-slate-600">السبب</TableHead>
                  <TableHead className="text-right text-xs font-semibold text-slate-600">أنشئ بواسطة</TableHead>
                  <TableHead className="text-right text-xs font-semibold text-slate-600">الحالة</TableHead>
                  <TableHead className="text-right text-xs font-semibold text-slate-600">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!data?.rows || data.rows.length === 0) && (
                  <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-10">لا توجد تسويات مخزون</TableCell></TableRow>
                )}
                {data?.rows?.map((row: any) => (
                  <TableRow key={row.id} className="hover:bg-slate-50">
                    <TableCell className="text-sm font-medium text-teal-700">#{row.number}</TableCell>
                    <TableCell className="text-xs text-slate-500">{row.reference || "-"}</TableCell>
                    <TableCell className="text-sm text-slate-700">{row.warehouseName}</TableCell>
                    <TableCell className="text-xs text-slate-500">{row.date ? new Date(row.date).toLocaleDateString("en-GB") : "-"}</TableCell>
                    <TableCell className="text-xs text-slate-500">{row.reason || "-"}</TableCell>
                    <TableCell className="text-xs text-slate-600">{row.createdByName || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={statusColor(row.status || "confirmed")} className="text-xs">{statusLabel(row.status || "confirmed")}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {row.status === "draft" && (
                          <>
                            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={confirmMut.isPending} onClick={() => confirmMut.mutate({ id: row.id })}>اعتماد</Button>
                            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-red-600" disabled={cancelMut.isPending} onClick={() => { if (confirm("إلغاء التسوية؟")) cancelMut.mutate({ id: row.id }); }}>إلغاء</Button>
                          </>
                        )}
                        {row.status === "confirmed" && (
                          <>
                            <Button type="button" size="sm" variant="secondary" className="h-7 text-xs" disabled={unconfirmMut.isPending} onClick={() => { if (confirm("فك اعتماد التسوية وعكس المخزون؟")) unconfirmMut.mutate({ id: row.id }); }}>فك اعتماد</Button>
                            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-red-600" disabled={cancelMut.isPending} onClick={() => { if (confirm("إلغاء التسوية المعتمدة؟")) cancelMut.mutate({ id: row.id }); }}>إلغاء</Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </ERPLayout>
  );
}
