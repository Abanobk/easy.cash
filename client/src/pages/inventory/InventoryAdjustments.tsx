import { useEffect, useMemo, useState } from "react";
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
import { ItemSearchSelect } from "@/components/ItemSearchSelect";
import { findItemByScan } from "@/lib/barcode";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { printWarehouseNote } from "@/lib/print-invoice-quick";
import { DocumentCommentsButton } from "@/components/DocumentCommentsButton";

type LineItem = {
  itemId: string;
  quantity: string;
  actualQty: string;
  unitCost: string;
  batchNumber: string;
  productionDate: string;
  expiryDate: string;
  unit: string;
  reason: string;
  available?: number;
};

const emptyLine = (): LineItem => ({
  itemId: "",
  quantity: "1",
  actualQty: "",
  unitCost: "",
  batchNumber: "",
  productionDate: "",
  expiryDate: "",
  unit: "",
  reason: "",
});

/**
 * تسوية مخزنية — مرجع Mega: InventoryCorrection.aspx
 * إنشاء = صفحة كاملة (مش Dialog) · قائمة = فلاتر + اعتماد/فك/إلغاء
 * رأس: تاريخ·فرع·حساب مقابل·مرجع·عميل·مركز تكلفة·مخزن·وارد/صادر
 * سطور: صنف·متاحة·كمية·فعلية·وحدة·تكلفة·تشغيلة·إنتاج·انتهاء·ملاحظات
 * مجاميع ميجا: اجمالي الوارد · اجمالي الصادر · الاجمالي · الكمية
 */
export default function InventoryAdjustments() {
  const { isNewRoute, goToList, goToCreate } = useMegaCreateRoute("/inventory/adjustments");
  const [form, setForm] = useState({
    warehouseId: "",
    branchId: "",
    date: new Date().toISOString().split("T")[0],
    adjustmentType: "addition" as "addition" | "deduction",
    notes: "",
    oppositeAccountId: "",
    costCenterId: "",
    customerId: "",
    referenceNumber: "",
  });
  const [items, setItems] = useState<LineItem[]>([emptyLine()]);
  const [lineCategoryId, setLineCategoryId] = useState("");
  const [lastSavedId, setLastSavedId] = useState<number | null>(null);
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
  const { data: itemsList } = trpc.items.list.useQuery({ page: 1, limit: 500 });
  const { data: categories } = trpc.items.categories.useQuery();
  const { data: accountsChart } = trpc.accounts.chart.useQuery();
  const { data: costCentersList } = trpc.costCenters.list.useQuery();
  const { data: customersList } = trpc.customers.list.useQuery({ page: 1, limit: 300 });
  const utils = trpc.useUtils();

  const totals = useMemo(() => {
    const qty = items.reduce((s, it) => s + Number(it.quantity || 0), 0);
    const value = items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unitCost || 0), 0);
    const isIn = form.adjustmentType === "addition";
    return {
      qty,
      value,
      inQty: isIn ? qty : 0,
      outQty: isIn ? 0 : qty,
      inValue: isIn ? value : 0,
      outValue: isIn ? 0 : value,
    };
  }, [items, form.adjustmentType]);

  const firePrint = (number: string) => {
    const whName = (warehouses as any[] || []).find((w: any) => String(w.id) === form.warehouseId)?.name || "—";
    const lines = items
      .filter((it) => it.itemId)
      .map((it) => {
        const row = (itemsList?.rows || []).find((x: any) => String(x.id) === it.itemId);
        return {
          name: row ? (row.code ? `${row.code} — ${row.name}` : row.name) : it.itemId,
          quantity: Number(it.quantity || 0),
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

  const createMut = trpc.inventory.adjustments.create.useMutation({
    onError: (e) => toast.error(e.message),
  });
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
      warehouseId: "",
      branchId: "",
      date: new Date().toISOString().split("T")[0],
      adjustmentType: "addition",
      notes: "",
      oppositeAccountId: "",
      costCenterId: "",
      customerId: "",
      referenceNumber: "",
    });
    setItems([emptyLine()]);
    setBarcode("");
    setLineCategoryId("");
    setLastSavedId(null);
    setLastSavedNumber("");
  };

  const refreshAvailable = async (rowIdx: number, itemId: string, warehouseId: string) => {
    if (!itemId || !warehouseId) return;
    try {
      const res = await utils.inventory.qtyAtWarehouse.fetch({
        itemId: Number(itemId),
        warehouseId: Number(warehouseId),
      });
      setItems((prev) => prev.map((it, i) => (i === rowIdx ? { ...it, available: res.quantity } : it)));
    } catch {
      /* ignore */
    }
  };

  const addItem = () => setItems((prev) => [...prev, emptyLine()]);
  const removeItem = (i: number) => setItems((prev) => (prev.length <= 1 ? [emptyLine()] : prev.filter((_, idx) => idx !== i)));
  const clearLines = () => setItems([emptyLine()]);

  const updateItem = async (i: number, field: string, val: string) => {
    setItems((prev) => prev.map((item, idx) => {
      if (idx !== i) return item;
      const next = { ...item, [field]: val };
      if (field === "itemId") {
        const row = (itemsList?.rows || []).find((x: any) => String(x.id) === val);
        if (row) {
          if (!item.unitCost) next.unitCost = String(row.averageCost ?? row.purchasePrice ?? "");
          if (!item.unit) next.unit = String(row.unit || "");
        }
      }
      return next;
    }));
    if (field === "itemId") {
      await refreshAvailable(i, val, form.warehouseId);
    }
  };

  useEffect(() => {
    if (!form.warehouseId) return;
    items.forEach((it, i) => {
      if (it.itemId) void refreshAvailable(i, it.itemId, form.warehouseId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.warehouseId]);

  const handleBarcode = async () => {
    const hit = findItemByScan((itemsList?.rows || []) as any, barcode);
    if (!hit) return toast.error("باركود غير موجود");
    const emptyIdx = items.findIndex((it) => !it.itemId);
    if (emptyIdx >= 0) {
      await updateItem(emptyIdx, "itemId", String(hit.id));
    } else {
      const cost = String((hit as any).averageCost ?? (hit as any).purchasePrice ?? "");
      setItems((prev) => [...prev, {
        itemId: String(hit.id),
        quantity: "1",
        actualQty: "",
        unitCost: cost,
        batchNumber: "",
        productionDate: "",
        expiryDate: "",
        unit: String((hit as any).unit || ""),
        reason: "",
      }]);
      await refreshAvailable(items.length, String(hit.id), form.warehouseId);
    }
    setBarcode("");
  };

  const handleSubmit = (confirm: boolean) => {
    if (!form.warehouseId) return toast.error("يجب اختيار المخزن");
    if (items.some((it) => !it.itemId)) return toast.error("يجب اختيار الصنف في كل بند");
    createMut.mutate({
      warehouseId: Number(form.warehouseId),
      branchId: form.branchId ? Number(form.branchId) : null,
      date: form.date,
      adjustmentType: form.adjustmentType,
      notes: form.notes,
      oppositeAccountId: form.oppositeAccountId ? Number(form.oppositeAccountId) : null,
      costCenterId: form.costCenterId ? Number(form.costCenterId) : null,
      customerId: form.customerId ? Number(form.customerId) : null,
      referenceNumber: form.referenceNumber || undefined,
      confirm,
      items: items.map((it) => ({
        itemId: Number(it.itemId),
        quantity: it.quantity,
        actualQty: it.actualQty || undefined,
        unitCost: it.unitCost || undefined,
        batchNumber: it.batchNumber || undefined,
        productionDate: it.productionDate || undefined,
        expiryDate: it.expiryDate || undefined,
        unit: it.unit || undefined,
        reason: it.reason,
        notes: it.reason || undefined,
      })),
    }, {
      onSuccess: (r) => {
        toast.success(r.status === "draft" ? "تم حفظ التسوية معلّقة" : "تم اعتماد تسوية المخزون");
        setLastSavedId(r.id);
        setLastSavedNumber(r.number);
        if (confirm ? printAfterApprove : printAfterSave) firePrint(r.number);
        void utils.inventory.adjustments.list.invalidate();
      },
    });
  };

  const statusLabel = (s: string) => ({ draft: "معلق", confirmed: "معتمد", cancelled: "ملغي" }[s] || s);
  const statusColor = (s: string) =>
    ({ draft: "outline", confirmed: "default", cancelled: "destructive" }[s] || "outline") as any;

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setFilterWarehouseId("");
    setFilterBranchId("");
    setFilterCustomerId("");
    setFilterStatus("");
    setSearch("");
  };

  const filteredItems = (itemsList?.rows || []).filter(
    (x: any) => !lineCategoryId || String(x.categoryId || "") === lineCategoryId,
  );

  /* ─── صفحة الإنشاء الكاملة (ميجا InventoryCorrection — مش Dialog) ─── */
  if (isNewRoute) {
    return (
      <ERPLayout title="تسوية مخزنية">
        <div className="space-y-4" dir="rtl">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="ghost" size="sm" onClick={() => { resetForm(); goToList(); }} className="gap-1 text-slate-600">
                <ArrowRight size={16} />
                العودة للقائمة
              </Button>
              <DocumentCommentsButton
                documentType="inventory_adjustment"
                documentId={lastSavedId}
                documentNumber={lastSavedNumber || undefined}
              />
            </div>
            <div className="text-xs text-slate-500 space-x-3 space-x-reverse">
              <span>انشأ بواسطة: {lastSavedId ? "أنت" : "—"}</span>
              <span>اعتمد بواسطة: —</span>
              {lastSavedNumber ? <span className="text-teal-700 font-medium">المسلسل: {lastSavedNumber}</span> : null}
            </div>
          </div>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <ClipboardList size={16} className="text-teal-600" />
                تسوية مخزنية
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-5">
              {/* رأس المستند — ترتيب ميجا */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">التاريخ *</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">الفرع</Label>
                  <Select value={form.branchId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, branchId: v === "none" ? "" : v, warehouseId: "" }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {(branches || []).map((b: any) => (
                        <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">الحساب المقابل</Label>
                  <Select value={form.oppositeAccountId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, oppositeAccountId: v === "none" ? "" : v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {(accountsChart || []).filter((a: any) => !a.isParent).map((a: any) => (
                        <SelectItem key={a.id} value={String(a.id)}>{a.code} — {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">رقم المرجع</Label>
                  <Input value={form.referenceNumber} onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">العميل</Label>
                  <Select value={form.customerId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, customerId: v === "none" ? "" : v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {(customersList?.rows || []).map((c: any) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">مركز التكلفة</Label>
                  <Select value={form.costCenterId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, costCenterId: v === "none" ? "" : v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {(costCentersList || []).map((c: any) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">المخزن *</Label>
                  <Select value={form.warehouseId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, warehouseId: v === "none" ? "" : v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر المخزن" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {(warehouses as any[] || [])
                        .filter((w: any) => !form.branchId || String(w.branchId || "") === form.branchId)
                        .map((w: any) => (
                          <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">الكمية الواردة / الصادرة</Label>
                  <Select value={form.adjustmentType} onValueChange={(v) => setForm((f) => ({ ...f, adjustmentType: v as any }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="addition">واردة (إضافة)</SelectItem>
                      <SelectItem value="deduction">صادرة (خصم)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">الفئة</Label>
                  <Select value={lineCategoryId || "all"} onValueChange={(v) => setLineCategoryId(v === "all" ? "" : v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="كل الفئات" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">كل الفئات</SelectItem>
                      {(categories || []).map((c: any) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">الباركود</Label>
                  <div className="flex gap-1">
                    <Input
                      className="h-9 text-sm"
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleBarcode(); } }}
                      placeholder="مسح باركود"
                    />
                    <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => void handleBarcode()}>+</Button>
                  </div>
                </div>
              </div>

              {/* شبكة الأصناف */}
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <Label className="text-sm font-semibold text-slate-800">الاصناف</Label>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={addItem}>
                      <Plus size={12} /> اضافة
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={clearLines}>
                      تفريغ
                    </Button>
                  </div>
                </div>
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="text-right text-xs whitespace-nowrap">الصنف</TableHead>
                        <TableHead className="text-right text-xs whitespace-nowrap">المتاحة</TableHead>
                        <TableHead className="text-right text-xs whitespace-nowrap">الكمية الواردة / الصادرة</TableHead>
                        <TableHead className="text-right text-xs whitespace-nowrap">الكمية الفعلية</TableHead>
                        <TableHead className="text-right text-xs whitespace-nowrap">الوحدة</TableHead>
                        <TableHead className="text-right text-xs whitespace-nowrap">التكلفة</TableHead>
                        <TableHead className="text-right text-xs whitespace-nowrap">رقم التشغيلة</TableHead>
                        <TableHead className="text-right text-xs whitespace-nowrap">تاريخ الانتاج</TableHead>
                        <TableHead className="text-right text-xs whitespace-nowrap">تاريخ الانتهاء</TableHead>
                        <TableHead className="text-right text-xs whitespace-nowrap">ملاحظات</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((it, i) => (
                        <TableRow key={i}>
                          <TableCell className="p-1 min-w-[200px]">
                            <ItemSearchSelect
                              items={filteredItems}
                              value={it.itemId}
                              onChange={(v) => void updateItem(i, "itemId", v)}
                              placeholder="اختر الصنف"
                            />
                          </TableCell>
                          <TableCell className="p-1 text-xs font-semibold text-slate-600 w-24">
                            {it.available != null ? Number(it.available).toLocaleString("en-US") : "—"}
                          </TableCell>
                          <TableCell className="p-1">
                            <Input type="number" value={it.quantity} onChange={(e) => void updateItem(i, "quantity", e.target.value)} className="h-8 text-xs w-24" />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input type="number" value={it.actualQty} onChange={(e) => void updateItem(i, "actualQty", e.target.value)} className="h-8 text-xs w-24" placeholder="جرد" title="الكمية الفعلية بعد الجرد" />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input value={it.unit} onChange={(e) => void updateItem(i, "unit", e.target.value)} className="h-8 text-xs w-16" />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input type="number" value={it.unitCost} onChange={(e) => void updateItem(i, "unitCost", e.target.value)} className="h-8 text-xs w-24" />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input value={it.batchNumber} onChange={(e) => void updateItem(i, "batchNumber", e.target.value)} className="h-8 text-xs w-28" />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input type="date" value={it.productionDate} onChange={(e) => void updateItem(i, "productionDate", e.target.value)} className="h-8 text-xs w-36" />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input type="date" value={it.expiryDate} onChange={(e) => void updateItem(i, "expiryDate", e.target.value)} className="h-8 text-xs w-36" />
                          </TableCell>
                          <TableCell className="p-1">
                            <Input value={it.reason} onChange={(e) => void updateItem(i, "reason", e.target.value)} className="h-8 text-xs w-32" placeholder="ملاحظات..." />
                          </TableCell>
                          <TableCell className="p-1">
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => removeItem(i)} title="حذف">
                              <Trash2 size={12} />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* مجاميع ميجا */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm bg-slate-50 border rounded-lg px-3 py-2.5">
                <div><span className="text-slate-500 text-xs">اجمالي الوارد:</span> <strong>{totals.inValue.toLocaleString("en-US")}</strong></div>
                <div><span className="text-slate-500 text-xs">اجمالي الصادر:</span> <strong>{totals.outValue.toLocaleString("en-US")}</strong></div>
                <div><span className="text-slate-500 text-xs">الاجمالي:</span> <strong>{totals.value.toLocaleString("en-US")}</strong></div>
                <div><span className="text-slate-500 text-xs">الكمية:</span> <strong>{totals.qty.toLocaleString("en-US")}</strong></div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">ملاحظات</Label>
                <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="text-sm min-h-[72px]" />
              </div>

              <div className="flex flex-wrap gap-4 text-xs text-slate-600">
                <label className="flex items-center gap-2"><Checkbox checked={printAfterSave} onCheckedChange={(v) => setPrintAfterSave(!!v)} />طباعة بعد الحفظ</label>
                <label className="flex items-center gap-2"><Checkbox checked={printAfterApprove} onCheckedChange={(v) => setPrintAfterApprove(!!v)} />طباعة بعد الاعتماد</label>
              </div>

              {form.oppositeAccountId && (
                <p className="text-[11px] text-teal-800 bg-teal-50 border border-teal-100 rounded px-2 py-1.5">
                  عند الاعتماد يُنشأ قيد محاسبي: مخزون ↔ الحساب المقابل (بتكلفة متوسط/شراء الأصناف).
                </p>
              )}

              <div className="flex flex-wrap gap-2 justify-end border-t pt-4">
                <Button variant="outline" size="sm" onClick={() => { resetForm(); goToList(); }}>إغلاق</Button>
                <Button variant="secondary" size="sm" disabled={createMut.isPending} onClick={() => handleSubmit(false)}>حفظ</Button>
                <Button size="sm" className="bg-teal-600 hover:bg-teal-700" disabled={createMut.isPending} onClick={() => handleSubmit(true)}>
                  اعتماد
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </ERPLayout>
    );
  }

  /* ─── قائمة التسويات ─── */
  return (
    <ERPLayout title="قائمة التسويات المخزنية">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <ClipboardList size={18} className="text-teal-600" />
              قائمة التسويات المخزنية
            </CardTitle>
            <AddActionButton
              moduleKey="inventory"
              entityKey="stockAdjustment"
              size="sm"
              className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
              onClick={() => { resetForm(); goToCreate(); }}
            >
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
                  {(warehouses as any[] || []).map((w: any) => (
                    <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">الفرع</Label>
              <Select value={filterBranchId || "all"} onValueChange={(v) => setFilterBranchId(v === "all" ? "" : v)}>
                <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="الكل" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {(branches || []).map((b: any) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">العميل</Label>
              <Select value={filterCustomerId || "all"} onValueChange={(v) => setFilterCustomerId(v === "all" ? "" : v)}>
                <SelectTrigger className="h-9 w-44 text-sm"><SelectValue placeholder="الكل" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {(customersList?.rows || []).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">الحالة</Label>
              <Select value={filterStatus || "all"} onValueChange={(v) => setFilterStatus(v === "all" ? "" : v as any)}>
                <SelectTrigger className="h-9 w-36 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">اختر</SelectItem>
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
                  <TableHead className="text-right text-xs font-semibold text-slate-600">المخزن</TableHead>
                  <TableHead className="text-right text-xs font-semibold text-slate-600">التاريخ</TableHead>
                  <TableHead className="text-right text-xs font-semibold text-slate-600">ملاحظات</TableHead>
                  <TableHead className="text-right text-xs font-semibold text-slate-600">أنشئ بواسطة</TableHead>
                  <TableHead className="text-right text-xs font-semibold text-slate-600">الحالة</TableHead>
                  <TableHead className="text-right text-xs font-semibold text-slate-600">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!data?.rows || data.rows.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-slate-400 py-10">لا توجد بيانات للعرض</TableCell>
                  </TableRow>
                )}
                {data?.rows?.map((row: any) => (
                  <TableRow key={row.id} className="hover:bg-slate-50">
                    <TableCell className="text-sm font-medium text-teal-700">#{row.number}</TableCell>
                    <TableCell className="text-sm text-slate-700">{row.warehouseName}</TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {row.date ? new Date(row.date).toLocaleDateString("en-GB") : "-"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{row.reason || "-"}</TableCell>
                    <TableCell className="text-xs text-slate-600">{row.createdByName || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={statusColor(row.status || "confirmed")} className="text-xs">
                        {statusLabel(row.status || "confirmed")}
                      </Badge>
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
                        <DocumentCommentsButton documentType="inventory_adjustment" documentId={row.id} documentNumber={row.number} />
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
