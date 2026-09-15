import { useState } from "react";
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
import { Plus, RotateCcw, Trash2, CheckCircle, Pencil, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { AddActionButton } from "@/components/AddActionButton";
import EntityPermissionGate from "@/components/EntityPermissionGate";
import { PartySearchSelect } from "@/components/PartySearchSelect";
import { ItemSearchSelect } from "@/components/ItemSearchSelect";
import { useWarehouseOptions } from "@/hooks/useEntityOptions";
import { OrderReturnListFilterBar, type OrderReturnListFiltersValue } from "@/components/invoices/OrderReturnListFilterBar";

type Line = {
  itemId: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  cashDiscount: string;
  unit: string;
  tax: string;
};

const emptyLine = (): Line => ({
  itemId: "", quantity: "1", unitPrice: "0", discount: "0", cashDiscount: "0", unit: "", tax: "0",
});

function lineTotal(it: Line) {
  const q = Number(it.quantity) || 0;
  const p = Number(it.unitPrice) || 0;
  const d = Number(it.discount) || 0;
  const cash = Number(it.cashDiscount) || 0;
  const t = Number(it.tax) || 0;
  const sub = Math.max(0, q * p * (1 - d / 100) - cash);
  return sub * (1 + t / 100);
}

export default function PurchaseReturns() {
  const { isNewRoute, goToList, goToCreate } = useMegaCreateRoute("/purchases/returns");
  const [open, setOpen] = useState(isNewRoute);
  const [editId, setEditId] = useState<number | null>(null);
  const [listFilters, setListFilters] = useState<OrderReturnListFiltersValue>({});
  const [form, setForm] = useState({
    supplierId: "",
    warehouseId: "",
    date: new Date().toISOString().split("T")[0],
    reason: "",
    notes: "",
    referenceNumber: "",
    phone: "",
    address: "",
  });
  const [items, setItems] = useState<Line[]>([emptyLine()]);

  const utils = trpc.useUtils();
  const { data, refetch } = trpc.purchases.returns.list.useQuery({
    page: 1,
    limit: 50,
    dateFrom: listFilters.dateFrom,
    dateTo: listFilters.dateTo,
    branchId: listFilters.branchId,
    warehouseId: listFilters.warehouseId,
    status: listFilters.status,
    partyId: listFilters.partyId,
    number: listFilters.number,
    referenceNumber: listFilters.referenceNumber,
    search: listFilters.search,
  });
  const { data: suppliers } = trpc.suppliers.list.useQuery({ page: 1, limit: 200 });
  const { data: itemsList } = trpc.items.list.useQuery({ page: 1, limit: 200 });
  const { data: branchList } = trpc.settings.branches.list.useQuery();
  const warehouses = useWarehouseOptions();

  const createMut = trpc.purchases.returns.create.useMutation({
    onSuccess: () => { toast.success("تم حفظ مردود الشراء كمسودة"); refetch(); closeDialog(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.purchases.returns.update.useMutation({
    onSuccess: () => { toast.success("تم حفظ التعديلات"); refetch(); closeDialog(); },
    onError: (e) => toast.error(e.message),
  });
  const approveMut = trpc.purchases.returns.approve.useMutation({
    onSuccess: () => { toast.success("تم اعتماد المردود (مخزن + قيد)"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const unapproveMut = trpc.purchases.returns.unapprove.useMutation({
    onSuccess: () => { toast.success("تم فك الاعتماد"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setEditId(null);
    setForm({
      supplierId: "", warehouseId: "", date: new Date().toISOString().split("T")[0],
      reason: "", notes: "", referenceNumber: "", phone: "", address: "",
    });
    setItems([emptyLine()]);
  };

  const closeDialog = () => {
    setOpen(false);
    resetForm();
    if (isNewRoute) goToList();
  };

  const openNewDialog = () => {
    if (isNewRoute) { resetForm(); setOpen(true); return; }
    goToCreate();
  };

  const openEdit = async (id: number) => {
    const r = await utils.purchases.returns.byId.fetch(id);
    setEditId(id);
    setForm({
      supplierId: String(r.supplierId),
      warehouseId: r.warehouseId ? String(r.warehouseId) : "",
      date: r.date ? new Date(r.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
      reason: (r as any).reason || "",
      notes: r.notes || "",
      referenceNumber: (r as any).referenceNumber || "",
      phone: (r as any).phone || "",
      address: (r as any).address || "",
    });
    setItems((r.items || []).map((i: any) => ({
      itemId: String(i.itemId),
      quantity: String(i.quantity),
      unitPrice: String(i.price),
      discount: i.discount != null ? String(i.discount) : "0",
      cashDiscount: i.cashDiscount != null ? String(i.cashDiscount) : "0",
      unit: i.unit || "",
      tax: i.tax != null ? String(i.tax) : "0",
    })));
    setOpen(true);
  };

  const addItem = () => setItems((prev) => [...prev, emptyLine()]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, val: string) =>
    setItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, [field]: val } : item)));
  const total = items.reduce((s, it) => s + lineTotal(it), 0);

  const payload = () => ({
    supplierId: Number(form.supplierId),
    warehouseId: form.warehouseId ? Number(form.warehouseId) : undefined,
    date: form.date,
    reason: form.reason || undefined,
    notes: form.notes || undefined,
    referenceNumber: form.referenceNumber || undefined,
    phone: form.phone || undefined,
    address: form.address || undefined,
    items: items.map((it) => ({
      itemId: Number(it.itemId),
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      discount: it.discount || "0",
      cashDiscount: it.cashDiscount || "0",
      unit: it.unit || undefined,
      tax: it.tax || "0",
    })),
  });

  const handleSubmit = () => {
    if (!form.supplierId) return toast.error("يجب اختيار المورد");
    if (items.some((it) => !it.itemId)) return toast.error("يجب اختيار الصنف في كل بند");
    if (editId) updateMut.mutate({ ...payload(), id: editId });
    else createMut.mutate(payload());
  };

  const statusLabel = (s: string) => ({ draft: "مسودة", confirmed: "معتمد", cancelled: "ملغي" }[s] || s);
  const statusColor = (s: string) => ({ draft: "outline", confirmed: "default", cancelled: "destructive" }[s] || "outline") as any;

  const branches = (branchList || []).map((b: any) => ({ id: b.id, name: b.name }));
  const whOpts = warehouses.map((w) => ({ id: Number(w.value), name: w.label }));

  return (
    <ERPLayout title="مردودات الشراء">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <RotateCcw size={18} className="text-orange-600" /> مردودات الشراء
            </CardTitle>
            <AddActionButton moduleKey="purchases" entityKey="purchaseReturnInvoice" size="sm" className="bg-orange-600 hover:bg-orange-700 text-white gap-1" onClick={openNewDialog}>
              <Plus size={14} /> مردود شراء جديد
            </AddActionButton>
          </div>
        </CardHeader>
        <CardContent className="p-0 px-4 pb-4">
          <OrderReturnListFilterBar
            value={listFilters}
            onChange={setListFilters}
            onClear={() => setListFilters({})}
            partyLabel="المورد"
            parties={(suppliers?.rows || []).map((s: any) => ({ id: s.id, name: s.name }))}
            branches={branches}
            warehouses={whOpts}
          />
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-right text-xs font-semibold text-slate-600">رقم المردود</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">المورد</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">المرجع</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">التاريخ</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">الإجمالي</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">الحالة</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!data?.rows || data.rows.length === 0) && (
                <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-10">لا توجد مردودات شراء</TableCell></TableRow>
              )}
              {data?.rows?.map((row: any) => (
                <TableRow key={row.id} className="hover:bg-slate-50">
                  <TableCell className="text-sm font-medium text-orange-700">#{row.number}</TableCell>
                  <TableCell className="text-sm text-slate-700">{row.supplierName}</TableCell>
                  <TableCell className="text-xs text-slate-500">{row.referenceNumber || "—"}</TableCell>
                  <TableCell className="text-xs text-slate-500">{row.date ? new Date(row.date).toLocaleDateString("en-GB") : "-"}</TableCell>
                  <TableCell className="text-sm font-semibold text-slate-800">{Number(row.total || 0).toLocaleString("en-US")} ج.م</TableCell>
                  <TableCell><Badge variant={statusColor(row.status)} className="text-xs">{statusLabel(row.status)}</Badge></TableCell>
                  <TableCell>
                    {row.status === "draft" && (
                      <>
                        <EntityPermissionGate moduleKey="purchases" entityKey="purchaseReturnInvoice" action="edit">
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => void openEdit(row.id)}>
                            <Pencil size={12} /> تعديل
                          </Button>
                        </EntityPermissionGate>
                        <EntityPermissionGate moduleKey="purchases" entityKey="purchaseReturnInvoice" action="approve">
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-green-600 gap-1" onClick={() => approveMut.mutate(row.id)}>
                            <CheckCircle size={12} /> اعتماد
                          </Button>
                        </EntityPermissionGate>
                      </>
                    )}
                    {row.status === "confirmed" && (
                      <EntityPermissionGate moduleKey="purchases" entityKey="purchaseReturnInvoice" action="unapprove">
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-700 gap-1" onClick={() => unapproveMut.mutate(row.id)}>
                          <Undo2 size={12} /> فك اعتماد
                        </Button>
                      </EntityPermissionGate>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { if (!v) closeDialog(); else setOpen(true); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle>{editId ? "تعديل مردود شراء" : "مردود شراء جديد"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">المورد *</Label>
                <PartySearchSelect parties={suppliers?.rows || []} value={form.supplierId} onChange={(v) => setForm((f) => ({ ...f, supplierId: v }))} placeholder="اختر المورد" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">التاريخ</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">المخزن</Label>
                <Select value={form.warehouseId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, warehouseId: v === "none" ? "" : v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر المخزن" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {warehouses.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">رقم المرجع</Label>
                <Input value={form.referenceNumber} onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الهاتف</Label>
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="h-9 text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">العنوان</Label>
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">سبب المردود</Label>
              <Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} className="h-9 text-sm" placeholder="سبب الإرجاع..." />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">البنود</Label>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addItem}><Plus size={12} /> إضافة بند</Button>
              </div>
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-right text-xs">الصنف</TableHead>
                      <TableHead className="text-right text-xs">الكمية</TableHead>
                      <TableHead className="text-right text-xs">السعر</TableHead>
                      <TableHead className="text-right text-xs">خصم%</TableHead>
                      <TableHead className="text-right text-xs">خصم نقدي</TableHead>
                      <TableHead className="text-right text-xs">ضريبة%</TableHead>
                      <TableHead className="text-right text-xs">الإجمالي</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it, i) => (
                      <TableRow key={i}>
                        <TableCell className="p-1 min-w-[160px]">
                          <ItemSearchSelect items={itemsList?.rows || []} value={it.itemId} onChange={(v) => updateItem(i, "itemId", v)} placeholder="اختر الصنف" />
                        </TableCell>
                        <TableCell className="p-1"><Input type="number" value={it.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} className="h-8 text-xs w-16" /></TableCell>
                        <TableCell className="p-1"><Input type="number" value={it.unitPrice} onChange={(e) => updateItem(i, "unitPrice", e.target.value)} className="h-8 text-xs w-20" /></TableCell>
                        <TableCell className="p-1"><Input type="number" value={it.discount} onChange={(e) => updateItem(i, "discount", e.target.value)} className="h-8 text-xs w-14" /></TableCell>
                        <TableCell className="p-1"><Input type="number" value={it.cashDiscount} onChange={(e) => updateItem(i, "cashDiscount", e.target.value)} className="h-8 text-xs w-16" /></TableCell>
                        <TableCell className="p-1"><Input type="number" value={it.tax} onChange={(e) => updateItem(i, "tax", e.target.value)} className="h-8 text-xs w-14" /></TableCell>
                        <TableCell className="p-1 text-xs font-medium">{lineTotal(it).toLocaleString("en-US")}</TableCell>
                        <TableCell className="p-1">
                          {items.length > 1 && <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => removeItem(i)}><Trash2 size={12} /></Button>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="text-left text-sm font-semibold text-orange-700">الإجمالي: {total.toLocaleString("en-US")} ج.م</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ملاحظات</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="text-sm resize-none" rows={2} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={closeDialog}>إلغاء</Button>
            <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white" onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending}>
              {editId ? "حفظ التعديلات" : "حفظ مسودة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ERPLayout>
  );
}
