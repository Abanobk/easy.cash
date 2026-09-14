import { useEffect, useState } from "react";
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
import { Plus, ArrowLeftRight, Trash2, Search, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { AddActionButton } from "@/components/AddActionButton";
import { ItemSearchSelect } from "@/components/ItemSearchSelect";
import { findItemByScan } from "@/lib/barcode";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

/**
 * تحويل مخزني — مطابقة ميجا InventoryTransfer:
 * نوع التحويل: مباشر | بمرحلتين · حفظ معلق / اعتماد · استلام للمرحلتين
 */
export default function StockTransfers() {
  const { isNewRoute, goToList, goToCreate } = useMegaCreateRoute("/inventory/transfers");
  const [open, setOpen] = useState(isNewRoute);
  const [form, setForm] = useState({
    fromWarehouseId: "",
    toWarehouseId: "",
    date: new Date().toISOString().split("T")[0],
    notes: "",
    transferType: "direct" as "direct" | "two_stage",
    referenceNumber: "",
  });
  const [items, setItems] = useState<{ itemId: string; quantity: string; available?: number; expectedCost?: number }[]>([
    { itemId: "", quantity: "1" },
  ]);
  const [barcode, setBarcode] = useState("");

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [fromWh, setFromWh] = useState("");
  const [toWh, setToWh] = useState("");
  const [filterType, setFilterType] = useState<"" | "direct" | "two_stage">("");
  const [filterStatus, setFilterStatus] = useState<"" | "draft" | "in_transit" | "confirmed" | "cancelled">("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => {
    if (isNewRoute) setOpen(true);
  }, [isNewRoute]);

  const { data, refetch } = trpc.inventory.transfers.list.useQuery({
    page: 1,
    limit: 100,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    fromWarehouseId: fromWh ? Number(fromWh) : undefined,
    toWarehouseId: toWh ? Number(toWh) : undefined,
    transferType: filterType || undefined,
    status: filterStatus || undefined,
    search: debouncedSearch || undefined,
  });
  const { data: warehouses } = trpc.warehouses.list.useQuery();
  const { data: itemsList } = trpc.items.list.useQuery({ page: 1, limit: 500 });
  const utils = trpc.useUtils();

  const createMut = trpc.inventory.transfers.create.useMutation({
    onSuccess: (r) => {
      toast.success(r.status === "draft" ? "تم حفظ التحويل معلقاً" : r.status === "in_transit" ? "تم اعتماد الشحن — بانتظار الاستلام" : "تم اعتماد التحويل");
      refetch();
      closeDialog();
    },
    onError: (e) => toast.error(e.message),
  });
  const receiveMut = trpc.inventory.transfers.receive.useMutation({
    onSuccess: () => { toast.success("تم استلام التحويل في المخزن المستقبل"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setForm({
      fromWarehouseId: "",
      toWarehouseId: "",
      date: new Date().toISOString().split("T")[0],
      notes: "",
      transferType: "direct",
      referenceNumber: "",
    });
    setItems([{ itemId: "", quantity: "1" }]);
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

  const refreshLineMeta = async (rowIdx: number, itemId: string, warehouseId: string) => {
    if (!itemId || !warehouseId) return;
    try {
      const res = await utils.inventory.qtyAtWarehouse.fetch({
        itemId: Number(itemId),
        warehouseId: Number(warehouseId),
      });
      const catalogItem = (itemsList?.rows || []).find((r: any) => String(r.id) === itemId);
      const expectedCost = Number(catalogItem?.averageCost ?? catalogItem?.purchasePrice ?? 0);
      setItems((prev) =>
        prev.map((it, i) => (i === rowIdx ? { ...it, available: res.quantity, expectedCost } : it)),
      );
    } catch {
      /* ignore */
    }
  };

  const addItem = () => setItems((prev) => [...prev, { itemId: "", quantity: "1" }]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateItem = async (i: number, field: string, val: string) => {
    setItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, [field]: val } : item)));
    if (field === "itemId") await refreshLineMeta(i, val, form.fromWarehouseId);
  };

  useEffect(() => {
    if (!form.fromWarehouseId) return;
    items.forEach((it, i) => {
      if (it.itemId) void refreshLineMeta(i, it.itemId, form.fromWarehouseId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.fromWarehouseId]);

  const handleBarcode = async () => {
    const hit = findItemByScan((itemsList?.rows || []) as any, barcode);
    if (!hit) return toast.error("باركود غير موجود");
    const emptyIdx = items.findIndex((it) => !it.itemId);
    if (emptyIdx >= 0) {
      await updateItem(emptyIdx, "itemId", String(hit.id));
    } else {
      setItems((prev) => [...prev, { itemId: String(hit.id), quantity: "1" }]);
      await refreshLineMeta(items.length, String(hit.id), form.fromWarehouseId);
    }
    setBarcode("");
  };

  const submit = (confirm: boolean) => {
    if (!form.fromWarehouseId || !form.toWarehouseId) return toast.error("يجب اختيار المخزن المصدر والمستقبل");
    if (form.fromWarehouseId === form.toWarehouseId) return toast.error("لا يمكن التحويل لنفس المخزن");
    if (items.some((it) => !it.itemId)) return toast.error("يجب اختيار الصنف في كل بند");
    if (confirm) {
      for (const it of items) {
        if (it.available != null && Number(it.quantity) > Number(it.available)) {
          return toast.error(`الكمية أكبر من المتاحة للصنف`);
        }
      }
    }
    createMut.mutate({
      fromWarehouseId: Number(form.fromWarehouseId),
      toWarehouseId: Number(form.toWarehouseId),
      date: form.date,
      notes: form.notes,
      transferType: form.transferType,
      referenceNumber: form.referenceNumber || undefined,
      confirm,
      items: items.map((it) => ({ itemId: Number(it.itemId), quantity: it.quantity })),
    });
  };

  const statusLabel = (s: string) =>
    ({ draft: "معلق", in_transit: "معتمد جزئياً", confirmed: "معتمد", cancelled: "ملغي" }[s] || s);
  const statusColor = (s: string) =>
    ({ draft: "outline", in_transit: "secondary", confirmed: "default", cancelled: "destructive" }[s] || "outline") as any;

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setFromWh("");
    setToWh("");
    setFilterType("");
    setFilterStatus("");
    setSearch("");
  };

  return (
    <ERPLayout title={isNewRoute ? "تحويل مخزني" : "قائمة التحويلات المخزنية"}>
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <ArrowLeftRight size={18} className="text-purple-600" />
              {isNewRoute ? "تحويل مخزني" : "قائمة التحويلات المخزنية"}
            </CardTitle>
            <AddActionButton
              moduleKey="inventory"
              entityKey="stockTransfer"
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 text-white gap-1"
              onClick={openNewDialog}
            >
              <Plus size={14} /> تحويل جديد
            </AddActionButton>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
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
                <Select value={fromWh || "all"} onValueChange={(v) => setFromWh(v === "all" ? "" : v)}>
                  <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="الكل" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {(warehouses as any[] || []).map((w: any) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الى مخزن</Label>
                <Select value={toWh || "all"} onValueChange={(v) => setToWh(v === "all" ? "" : v)}>
                  <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="الكل" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    {(warehouses as any[] || []).map((w: any) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">نوع التحويل</Label>
                <Select value={filterType || "all"} onValueChange={(v) => setFilterType(v === "all" ? "" : v as any)}>
                  <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    <SelectItem value="direct">تحويل مباشر</SelectItem>
                    <SelectItem value="two_stage">تحويل بمرحلتين</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الحالة</Label>
                <Select value={filterStatus || "all"} onValueChange={(v) => setFilterStatus(v === "all" ? "" : v as any)}>
                  <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    <SelectItem value="draft">معلق</SelectItem>
                    <SelectItem value="in_transit">معتمد جزئياً</SelectItem>
                    <SelectItem value="confirmed">معتمد</SelectItem>
                    <SelectItem value="cancelled">ملغي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">المسلسل / المرجع</Label>
                <div className="relative">
                  <Search size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input className="h-9 w-40 pr-7" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" className="h-9" onClick={clearFilters}>تفريغ</Button>
            </div>
          )}

          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-right text-xs">المسلسل</TableHead>
                  <TableHead className="text-right text-xs">من</TableHead>
                  <TableHead className="text-right text-xs">الى</TableHead>
                  <TableHead className="text-right text-xs">النوع</TableHead>
                  <TableHead className="text-right text-xs">التاريخ</TableHead>
                  <TableHead className="text-right text-xs">الحالة</TableHead>
                  <TableHead className="text-right text-xs">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!data?.rows?.length && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-slate-400 py-8">لا توجد بيانات للعرض</TableCell>
                  </TableRow>
                )}
                {data?.rows?.map((row: any) => (
                  <TableRow key={row.id} className="hover:bg-slate-50">
                    <TableCell className="text-sm font-medium text-purple-700">#{row.number}</TableCell>
                    <TableCell className="text-sm text-slate-700">{row.fromWarehouseName}</TableCell>
                    <TableCell className="text-sm text-slate-700">{row.toWarehouseName}</TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {row.transferType === "two_stage" ? "بمرحلتين" : "مباشر"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {row.date ? new Date(row.date).toLocaleDateString("en-GB") : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusColor(row.status)} className="text-xs">{statusLabel(row.status)}</Badge>
                    </TableCell>
                    <TableCell>
                      {row.status === "in_transit" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          disabled={receiveMut.isPending}
                          onClick={() => receiveMut.mutate({ id: row.id })}
                        >
                          <PackageCheck size={12} /> استلام
                        </Button>
                      )}
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
          <DialogHeader><DialogTitle>تحويل مخزني</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">التاريخ *</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">نوع التحويل</Label>
                <Select value={form.transferType} onValueChange={(v) => setForm((f) => ({ ...f, transferType: v as any }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct">تحويل مباشر</SelectItem>
                    <SelectItem value="two_stage">تحويل بمرحلتين</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">رقم المرجع</Label>
                <Input value={form.referenceNumber} onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">المخزن *</Label>
                <Select value={form.fromWarehouseId} onValueChange={(v) => setForm((f) => ({ ...f, fromWarehouseId: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="المخزن المصدر" /></SelectTrigger>
                  <SelectContent>
                    {(warehouses as any[] || []).map((w: any) => (
                      <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الى مخزن *</Label>
                <Select value={form.toWarehouseId} onValueChange={(v) => setForm((f) => ({ ...f, toWarehouseId: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="المخزن المستقبل" /></SelectTrigger>
                  <SelectContent>
                    {(warehouses as any[] || []).map((w: any) => (
                      <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                    ))}
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
            {form.transferType === "two_stage" && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
                بمرحلتين: الاعتماد يخصم من المصدر فقط — ثم «استلام» من القائمة يضيف للمستقبل.
              </p>
            )}

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
                      <TableHead className="text-right text-xs">التكلفة المتوقعة</TableHead>
                      <TableHead className="text-right text-xs">الكمية</TableHead>
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
                        <TableCell className="p-1 text-xs text-slate-600 w-28">
                          {it.expectedCost != null ? Number(it.expectedCost).toLocaleString("en-US") : "—"}
                        </TableCell>
                        <TableCell className="p-1">
                          <Input type="number" value={it.quantity} onChange={(e) => void updateItem(i, "quantity", e.target.value)} className="h-8 text-xs w-24" />
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
            <Button variant="outline" size="sm" onClick={closeDialog}>إلغاء</Button>
            <Button variant="secondary" size="sm" disabled={createMut.isPending} onClick={() => submit(false)}>حفظ</Button>
            <Button size="sm" className="bg-purple-600 hover:bg-purple-700" disabled={createMut.isPending} onClick={() => submit(true)}>
              اعتماد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ERPLayout>
  );
}
