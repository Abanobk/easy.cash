import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ClipboardList, Trash2, ArrowRight, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { AddActionButton } from "@/components/AddActionButton";
import EntityPermissionGate from "@/components/EntityPermissionGate";
import { ItemSearchSelect } from "@/components/ItemSearchSelect";
import { AccountSearchSelect } from "@/components/AccountSearchSelect";
import { useLastActiveRow } from "@/hooks/useLastActiveRow";

interface AdjustmentItem {
  itemId: string;
  warehouseId: string;
  actualQty: string;
  batchNumber: string;
  notes: string;
}

const emptyItem = (): AdjustmentItem => ({ itemId: "", warehouseId: "", actualQty: "", batchNumber: "", notes: "" });

const emptyForm = {
  warehouseId: "",
  date: new Date().toISOString().split("T")[0],
  reference: "",
  branchId: "",
  costCenterId: "",
  contraAccountId: "",
  notes: "",
};

function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

export default function InventoryAdjustments() {
  const [location] = useLocation();
  const { lastActiveId, markActive } = useLastActiveRow(location);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState<AdjustmentItem[]>([emptyItem()]);

  const { data, refetch } = trpc.inventory.adjustments.list.useQuery({ page: 1, limit: 50 });
  const { data: warehouses } = trpc.warehouses.list.useQuery();
  const { data: itemsList } = trpc.items.all.useQuery();
  const { data: categories } = trpc.items.categories.useQuery();
  const { data: branches } = trpc.settings.branches.list.useQuery();
  const { data: costCenters } = trpc.costCenters.list.useQuery();
  const { data: accounts } = trpc.accounts.chart.useQuery();

  const itemIds = useMemo(() => {
    const ids = new Set<number>();
    for (const it of items) if (it.itemId) ids.add(Number(it.itemId));
    return [...ids];
  }, [items]);
  const { data: stockData } = trpc.inventory.adjustments.itemStock.useQuery(
    { itemIds }, { enabled: showForm && itemIds.length > 0 },
  );

  const itemMap = useMemo(() => new Map((itemsList || []).map((i: any) => [String(i.id), i])), [itemsList]);
  const categoryMap = useMemo(() => new Map((categories || []).map((c: any) => [c.id, c.name])), [categories]);
  const stockMap = useMemo(() => {
    const map = new Map<string, Map<number, number>>();
    for (const r of stockData?.rows || []) {
      const key = String(r.itemId);
      if (!map.has(key)) map.set(key, new Map());
      map.get(key)!.set(r.warehouseId, Number(r.quantity || 0));
    }
    return map;
  }, [stockData]);
  const availableFor = (itemId: string, warehouseIdStr: string) => {
    const whId = Number(warehouseIdStr || form.warehouseId || 0);
    if (!itemId || !whId) return 0;
    return stockMap.get(itemId)?.get(whId) ?? 0;
  };

  const leafAccounts = (accounts || []).filter((a: any) => !a.isParent);

  const createMut = trpc.inventory.adjustments.create.useMutation({
    onSuccess: () => { toast.success("تم تسجيل تسوية المخزون"); refetch(); setShowForm(false); resetForm(); },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setForm(emptyForm);
    setItems([emptyItem()]);
  };

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof AdjustmentItem, val: string) =>
    setItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, [field]: val } : item)));

  const handleSubmit = () => {
    if (!form.warehouseId) return toast.error("يجب اختيار المخزن");
    if (!form.date) return toast.error("يجب اختيار التاريخ");
    const validItems = items.filter((it) => it.itemId);
    if (!validItems.length) return toast.error("يجب اختيار الصنف في سطر واحد على الأقل");
    if (validItems.some((it) => it.actualQty === "")) return toast.error("يجب إدخال الكمية الفعلية لكل صنف");
    createMut.mutate({
      warehouseId: Number(form.warehouseId),
      date: form.date,
      reference: form.reference || undefined,
      branchId: form.branchId ? Number(form.branchId) : undefined,
      costCenterId: form.costCenterId ? Number(form.costCenterId) : undefined,
      contraAccountId: form.contraAccountId ? Number(form.contraAccountId) : undefined,
      notes: form.notes || undefined,
      items: validItems.map((it) => ({
        itemId: Number(it.itemId),
        warehouseId: it.warehouseId ? Number(it.warehouseId) : undefined,
        actualQty: it.actualQty,
        batchNumber: it.batchNumber || undefined,
        notes: it.notes || undefined,
      })),
    });
  };

  if (showForm) {
    return (
      <ERPLayout title="تسوية مخزون جديدة">
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); resetForm(); }} className="gap-1 text-slate-600">
            <ArrowRight size={16} />العودة للقائمة
          </Button>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100"><CardTitle className="text-sm font-semibold text-slate-800">بيانات التسوية</CardTitle></CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">المخزن (الافتراضي للأسطر) *</Label>
                  <Select value={form.warehouseId} onValueChange={(v) => setForm((f) => ({ ...f, warehouseId: v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر المخزن" /></SelectTrigger>
                    <SelectContent>
                      {(warehouses as any[] || []).map((w: any) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">التاريخ *</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">المرجع</Label>
                  <Input value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} placeholder="رقم مرجعي (اختياري)" className="h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">الفرع</Label>
                  <Select value={form.branchId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, branchId: v === "none" ? "" : v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون</SelectItem>
                      {(branches || []).map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">مركز التكلفة</Label>
                  <Select value={form.costCenterId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, costCenterId: v === "none" ? "" : v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر مركز التكلفة" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون</SelectItem>
                      {(costCenters || []).map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">الحساب المقابل (لترحيل القيد المحاسبي — اختياري)</Label>
                  <AccountSearchSelect
                    accounts={leafAccounts}
                    value={form.contraAccountId}
                    onChange={(v) => setForm((f) => ({ ...f, contraAccountId: v }))}
                    placeholder="بدون — بدون أثر محاسبي"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">ملاحظات المستند</Label>
                  <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="ملاحظات" className="h-9 text-sm" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="text-sm font-semibold text-slate-800">الأصناف</CardTitle>
                <Button onClick={addItem} size="sm" className="bg-teal-600 hover:bg-teal-700 text-white h-8 gap-1 text-xs"><Plus size={13} />إضافة صنف</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 min-w-[160px]">الصنف</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 min-w-[8rem]">المخزن</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-24">الباركود</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-20">الوحدة</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-24">الفئة</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-24">التكلفة</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-24">الكمية المتاحة</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 min-w-[6.5rem]">الكمية الفعلية</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-28">الواردة / الصادرة</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-28">رقم التشغيلة</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 min-w-[8rem]">ملاحظات</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => {
                      const item = itemMap.get(it.itemId) as any;
                      const available = availableFor(it.itemId, it.warehouseId);
                      const actual = it.actualQty === "" ? null : Number(it.actualQty);
                      const diff = actual == null ? null : actual - available;
                      const cost = item ? (Number(item.averageCost || 0) || Number(item.purchasePrice || 0)) : 0;
                      return (
                        <tr key={i} className="border-b border-slate-50 align-top">
                          <td className="px-3 py-2">
                            <ItemSearchSelect
                              items={itemsList || []}
                              value={it.itemId}
                              onChange={(v) => updateItem(i, "itemId", v)}
                              placeholder="اختر الصنف"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Select value={it.warehouseId || "default"} onValueChange={(v) => updateItem(i, "warehouseId", v === "default" ? "" : v)}>
                              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="default">(افتراضي)</SelectItem>
                                {(warehouses as any[] || []).map((w: any) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{item?.barcode || "—"}</td>
                          <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{item?.unit || "—"}</td>
                          <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{item ? (categoryMap.get(item.categoryId) || "—") : "—"}</td>
                          <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{item ? fmt(cost) : "—"}</td>
                          <td className="px-3 py-2 text-xs font-semibold text-slate-700 whitespace-nowrap">{it.itemId ? fmt(available) : "—"}</td>
                          <td className="px-3 py-2">
                            <Input
                              value={it.actualQty}
                              onChange={(e) => updateItem(i, "actualQty", e.target.value)}
                              type="number" step="any" placeholder="0"
                              className="h-9 text-sm w-full min-w-[5.5rem] px-2"
                            />
                          </td>
                          <td className={`px-3 py-2 text-xs font-bold whitespace-nowrap ${diff == null || diff === 0 ? "text-slate-400" : diff > 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {diff == null ? "—" : diff === 0 ? "بدون فرق" : diff > 0 ? `+${fmt(diff)} واردة` : `${fmt(diff)} صادرة`}
                          </td>
                          <td className="px-3 py-2">
                            <Input value={it.batchNumber} onChange={(e) => updateItem(i, "batchNumber", e.target.value)} placeholder="اختياري" className="h-9 text-sm w-full" />
                          </td>
                          <td className="px-3 py-2">
                            <Input value={it.notes} onChange={(e) => updateItem(i, "notes", e.target.value)} placeholder="سبب التسوية..." className="h-9 text-sm w-full" />
                          </td>
                          <td className="px-3 py-2">
                            {items.length > 1 && <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:bg-red-50" onClick={() => removeItem(i)}><Trash2 size={12} /></Button>}
                          </td>
                        </tr>
                      );
                    })}
                    {items.length === 0 && <tr><td colSpan={12} className="py-8 text-center text-slate-400 text-xs">اضغط "إضافة صنف" لإضافة أصناف للتسوية</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>إلغاء</Button>
            <EntityPermissionGate moduleKey="inventory" entityKey="stockAdjustment" action="add">
              <Button onClick={handleSubmit} disabled={createMut.isPending} className="bg-teal-600 hover:bg-teal-700 text-white px-8 gap-1">
                <CheckCircle2 size={15} />{createMut.isPending ? "جاري الحفظ..." : "حفظ التسوية"}
              </Button>
            </EntityPermissionGate>
          </div>
        </div>
      </ERPLayout>
    );
  }

  return (
    <ERPLayout title="تسوية المخزون">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <ClipboardList size={18} className="text-teal-600" /> تسوية المخزون
            </CardTitle>
            <AddActionButton moduleKey="inventory" entityKey="stockAdjustment" size="sm" className="bg-teal-600 hover:bg-teal-700 text-white gap-1" onClick={() => { resetForm(); setShowForm(true); }}>
              <Plus size={14} /> تسوية جديدة
            </AddActionButton>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-right text-xs font-semibold text-slate-600">رقم التسوية</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">المرجع</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">المخزن</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">التاريخ</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">السبب</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!data?.rows || data.rows.length === 0) && (
                <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-10">لا توجد تسويات مخزون</TableCell></TableRow>
              )}
              {data?.rows?.map((row: any) => (
                <TableRow
                  key={row.id}
                  className={`hover:bg-slate-50 ${String(row.id) === lastActiveId ? "bg-amber-50" : ""}`}
                  onClickCapture={() => markActive(row.id)}
                >
                  <TableCell className="text-sm font-medium text-teal-700">#{row.number}</TableCell>
                  <TableCell className="text-xs text-slate-500">{row.reference || "-"}</TableCell>
                  <TableCell className="text-sm text-slate-700">{row.warehouseName}</TableCell>
                  <TableCell className="text-xs text-slate-500">{row.date ? new Date(row.date).toLocaleDateString("en-GB") : "-"}</TableCell>
                  <TableCell className="text-xs text-slate-500">{row.reason || "-"}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-xs">مؤكد</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </ERPLayout>
  );
}
