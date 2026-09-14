import { useEffect, useMemo, useState } from "react";
import { useMegaCreateRoute } from "@/hooks/useMegaCreateRoute";
import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, ClipboardList, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { AddActionButton } from "@/components/AddActionButton";
import { ItemSearchSelect } from "@/components/ItemSearchSelect";
import { findItemByScan } from "@/lib/barcode";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

/**
 * تسوية مخزنية — مطابقة ميجا:
 * إنشاء = /Inv/InventoryCorrection.aspx · قائمة = InventoryDocumentsList/InvCorr
 * فلاتر القائمة: من/إلى تاريخ · مخزن · حالة · مسلسل/مرجع
 * أتمتة الإنشاء: كمية متاحة عند اختيار الصنف+المخزن · باركود
 */
export default function InventoryAdjustments() {
  const { isNewRoute, goToList, goToCreate } = useMegaCreateRoute("/inventory/adjustments");
  const [open, setOpen] = useState(isNewRoute);
  const [form, setForm] = useState({
    warehouseId: "",
    date: new Date().toISOString().split("T")[0],
    adjustmentType: "addition" as "addition" | "deduction",
    notes: "",
    oppositeAccountId: "",
    costCenterId: "",
    customerId: "",
    referenceNumber: "",
  });
  const [items, setItems] = useState<{ itemId: string; quantity: string; reason: string; available?: number }[]>([
    { itemId: "", quantity: "1", reason: "" },
  ]);
  const [barcode, setBarcode] = useState("");

  // Mega list filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterWarehouseId, setFilterWarehouseId] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | "draft" | "confirmed" | "cancelled">("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => {
    if (isNewRoute) setOpen(true);
  }, [isNewRoute]);

  const { data, refetch } = trpc.inventory.adjustments.list.useQuery({
    page: 1,
    limit: 100,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    warehouseId: filterWarehouseId ? Number(filterWarehouseId) : undefined,
    status: filterStatus || undefined,
    search: debouncedSearch || undefined,
  });
  const { data: warehouses } = trpc.warehouses.list.useQuery();
  const { data: itemsList } = trpc.items.list.useQuery({ page: 1, limit: 500 });
  const { data: accountsChart } = trpc.accounts.chart.useQuery();
  const { data: costCentersList } = trpc.costCenters.list.useQuery();
  const { data: customersList } = trpc.customers.list.useQuery({ page: 1, limit: 300 });
  const utils = trpc.useUtils();

  const createMut = trpc.inventory.adjustments.create.useMutation({
    onSuccess: () => {
      toast.success("تم تسجيل تسوية المخزون");
      refetch();
      closeDialog();
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setForm({
      warehouseId: "",
      date: new Date().toISOString().split("T")[0],
      adjustmentType: "addition",
      notes: "",
      oppositeAccountId: "",
      costCenterId: "",
      customerId: "",
      referenceNumber: "",
    });
    setItems([{ itemId: "", quantity: "1", reason: "" }]);
    setBarcode("");
  };

  const closeDialog = () => {
    setOpen(false);
    resetForm();
    if (isNewRoute) goToList();
  };

  const openNewDialog = () => {
    if (isNewRoute) {
      resetForm();
      setOpen(true);
      return;
    }
    goToCreate();
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

  const addItem = () => setItems((prev) => [...prev, { itemId: "", quantity: "1", reason: "" }]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateItem = async (i: number, field: string, val: string) => {
    setItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, [field]: val } : item)));
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
      setItems((prev) => [...prev, { itemId: String(hit.id), quantity: "1", reason: "" }]);
      await refreshAvailable(items.length, String(hit.id), form.warehouseId);
    }
    setBarcode("");
  };

  const handleSubmit = () => {
    if (!form.warehouseId) return toast.error("يجب اختيار المخزن");
    if (items.some((it) => !it.itemId)) return toast.error("يجب اختيار الصنف في كل بند");
    createMut.mutate({
      warehouseId: Number(form.warehouseId),
      date: form.date,
      adjustmentType: form.adjustmentType,
      notes: form.notes,
      oppositeAccountId: form.oppositeAccountId ? Number(form.oppositeAccountId) : null,
      costCenterId: form.costCenterId ? Number(form.costCenterId) : null,
      customerId: form.customerId ? Number(form.customerId) : null,
      referenceNumber: form.referenceNumber || undefined,
      items: items.map((it) => ({ itemId: Number(it.itemId), quantity: it.quantity, reason: it.reason })),
    });
  };

  const statusLabel = (s: string) => ({ draft: "معلق", confirmed: "معتمد", cancelled: "ملغي" }[s] || s);
  const statusColor = (s: string) =>
    ({ draft: "outline", confirmed: "default", cancelled: "destructive" }[s] || "outline") as any;

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setFilterWarehouseId("");
    setFilterStatus("");
    setSearch("");
  };

  return (
    <ERPLayout title={isNewRoute ? "تسوية مخزنية" : "قائمة التسويات المخزنية"}>
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <ClipboardList size={18} className="text-teal-600" />
              {isNewRoute ? "تسوية مخزنية" : "قائمة التسويات المخزنية"}
            </CardTitle>
            <AddActionButton
              moduleKey="inventory"
              entityKey="stockAdjustment"
              size="sm"
              className="bg-teal-600 hover:bg-teal-700 text-white gap-1"
              onClick={openNewDialog}
            >
              <Plus size={14} /> تسوية جديدة
            </AddActionButton>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mega list filters */}
          {!isNewRoute && (
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
          )}

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-right text-xs font-semibold text-slate-600">المسلسل</TableHead>
                  <TableHead className="text-right text-xs font-semibold text-slate-600">المخزن</TableHead>
                  <TableHead className="text-right text-xs font-semibold text-slate-600">التاريخ</TableHead>
                  <TableHead className="text-right text-xs font-semibold text-slate-600">ملاحظات</TableHead>
                  <TableHead className="text-right text-xs font-semibold text-slate-600">الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!data?.rows || data.rows.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-slate-400 py-10">لا توجد بيانات للعرض</TableCell>
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
                    <TableCell>
                      <Badge variant={statusColor(row.status || "confirmed")} className="text-xs">
                        {statusLabel(row.status || "confirmed")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle>تسوية مخزنية</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">التاريخ *</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">المخزن *</Label>
                <Select value={form.warehouseId} onValueChange={(v) => setForm((f) => ({ ...f, warehouseId: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر المخزن" /></SelectTrigger>
                  <SelectContent>
                    {(warehouses as any[] || []).map((w: any) => (
                      <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الحساب المقابل</Label>
                <Select value={form.oppositeAccountId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, oppositeAccountId: v === "none" ? "" : v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختياري" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {(accountsChart || []).filter((a: any) => !a.isParent).map((a: any) => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.code} — {a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">رقم المرجع</Label>
                <Input value={form.referenceNumber} onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">العميل</Label>
                <Select value={form.customerId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, customerId: v === "none" ? "" : v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختياري" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {(customersList?.rows || []).map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">مركز التكلفة</Label>
                <Select value={form.costCenterId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, costCenterId: v === "none" ? "" : v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختياري" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {(costCentersList || []).map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الكمية الواردة / الصادرة</Label>
                <Select value={form.adjustmentType} onValueChange={(v) => setForm((f) => ({ ...f, adjustmentType: v as any }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="addition">واردة (إضافة)</SelectItem>
                    <SelectItem value="deduction">صادرة (خصم)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الباركود</Label>
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

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">الاصناف</Label>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addItem}>
                  <Plus size={12} /> اضافة
                </Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-right text-xs">الصنف</TableHead>
                      <TableHead className="text-right text-xs">الكمية المتاحة</TableHead>
                      <TableHead className="text-right text-xs">الكمية</TableHead>
                      <TableHead className="text-right text-xs">ملاحظات</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it, i) => (
                      <TableRow key={i}>
                        <TableCell className="p-1 min-w-[180px]">
                          <ItemSearchSelect
                            items={itemsList?.rows || []}
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
                          <Input value={it.reason} onChange={(e) => void updateItem(i, "reason", e.target.value)} className="h-8 text-xs" placeholder="ملاحظات..." />
                        </TableCell>
                        <TableCell className="p-1">
                          {items.length > 1 && (
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => removeItem(i)}>
                              <Trash2 size={12} />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">ملاحظات</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="text-sm min-h-[60px]" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={closeDialog}>تفريغ / إلغاء</Button>
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700" disabled={createMut.isPending} onClick={handleSubmit}>
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ERPLayout>
  );
}
