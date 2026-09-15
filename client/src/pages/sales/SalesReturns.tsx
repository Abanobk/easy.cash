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

export default function SalesReturns() {
  const { isNewRoute, goToList, goToCreate } = useMegaCreateRoute("/sales/returns");
  const [open, setOpen] = useState(isNewRoute);
  const [editId, setEditId] = useState<number | null>(null);
  const [listFilters, setListFilters] = useState<OrderReturnListFiltersValue>({});
  const [form, setForm] = useState({
    customerId: "",
    warehouseId: "",
    date: new Date().toISOString().split("T")[0],
    reason: "",
    notes: "",
    referenceNumber: "",
    phone: "",
    address: "",
    salesRepId: "",
  });
  const [items, setItems] = useState<Line[]>([emptyLine()]);

  const utils = trpc.useUtils();
  const { data, refetch } = trpc.sales.returns.list.useQuery({
    page: 1,
    limit: 50,
    dateFrom: listFilters.dateFrom,
    dateTo: listFilters.dateTo,
    branchId: listFilters.branchId,
    warehouseId: listFilters.warehouseId,
    status: listFilters.status,
    partyId: listFilters.partyId,
    salesRepId: listFilters.salesRepId,
    number: listFilters.number,
    referenceNumber: listFilters.referenceNumber,
    search: listFilters.search,
  });
  const { data: customers } = trpc.customers.list.useQuery({ page: 1, limit: 200 });
  const { data: allItems } = trpc.items.all.useQuery();
  const { data: branchList } = trpc.settings.branches.list.useQuery();
  const { data: salesReps } = trpc.salesReps.list.useQuery();
  const warehouses = useWarehouseOptions();

  const createMut = trpc.sales.returns.create.useMutation({
    onSuccess: () => { toast.success("تم حفظ مردود البيع كمسودة"); refetch(); closeDialog(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.sales.returns.update.useMutation({
    onSuccess: () => { toast.success("تم حفظ التعديلات"); refetch(); closeDialog(); },
    onError: (e) => toast.error(e.message),
  });
  const approveMut = trpc.sales.returns.approve.useMutation({
    onSuccess: () => { toast.success("تم اعتماد المردود (مخزن + قيد)"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const unapproveMut = trpc.sales.returns.unapprove.useMutation({
    onSuccess: () => { toast.success("تم فك الاعتماد"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setEditId(null);
    setForm({
      customerId: "", warehouseId: "", date: new Date().toISOString().split("T")[0],
      reason: "", notes: "", referenceNumber: "", phone: "", address: "", salesRepId: "",
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
    const r = await utils.sales.returns.byId.fetch(id);
    setEditId(id);
    setForm({
      customerId: String(r.customerId),
      warehouseId: r.warehouseId ? String(r.warehouseId) : "",
      date: r.date ? new Date(r.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
      reason: (r as any).reason || "",
      notes: r.notes || "",
      referenceNumber: (r as any).referenceNumber || "",
      phone: (r as any).phone || "",
      address: (r as any).address || "",
      salesRepId: (r as any).salesRepId ? String((r as any).salesRepId) : "",
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
    customerId: Number(form.customerId),
    warehouseId: form.warehouseId ? Number(form.warehouseId) : undefined,
    date: form.date,
    reason: form.reason || undefined,
    notes: form.notes || undefined,
    referenceNumber: form.referenceNumber || undefined,
    phone: form.phone || undefined,
    address: form.address || undefined,
    salesRepId: form.salesRepId ? Number(form.salesRepId) : undefined,
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
    if (!form.customerId) return toast.error("يجب اختيار العميل");
    if (items.some((it) => !it.itemId)) return toast.error("يجب اختيار الصنف في كل بند");
    if (editId) updateMut.mutate({ ...payload(), id: editId });
    else createMut.mutate(payload());
  };

  const statusLabel = (s: string) => ({ draft: "مسودة", confirmed: "معتمد", cancelled: "ملغي" }[s] || s);
  const statusColor = (s: string) => ({ draft: "outline", confirmed: "default", cancelled: "destructive" }[s] || "outline") as any;

  const branches = (branchList || []).map((b: any) => ({ id: b.id, name: b.name }));
  const whOpts = warehouses.map((w) => ({ id: Number(w.value), name: w.label }));
  const repOpts = (salesReps || []).map((r: any) => ({ id: r.id, name: r.name }));

  return (
    <ERPLayout title="مردودات البيع">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <RotateCcw size={18} className="text-red-600" /> مردودات البيع
            </CardTitle>
            <AddActionButton moduleKey="sales" entityKey="saleReturnInvoice" size="sm" className="bg-red-600 hover:bg-red-700 text-white gap-1" onClick={openNewDialog}>
              <Plus size={14} /> مردود بيع جديد
            </AddActionButton>
          </div>
        </CardHeader>
        <CardContent className="p-0 px-4 pb-4">
          <OrderReturnListFilterBar
            value={listFilters}
            onChange={setListFilters}
            onClear={() => setListFilters({})}
            partyLabel="العميل"
            parties={(customers?.rows || []).map((c: any) => ({ id: c.id, name: c.name }))}
            branches={branches}
            warehouses={whOpts}
            salesReps={repOpts}
            showSalesRep
          />
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-right text-xs font-semibold text-slate-600">رقم المردود</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">العميل</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">المرجع</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">التاريخ</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">الإجمالي</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">الحالة</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!data?.rows || data.rows.length === 0) && (
                <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-10">لا توجد مردودات بيع</TableCell></TableRow>
              )}
              {data?.rows?.map((row: any) => (
                <TableRow key={row.id} className="hover:bg-slate-50">
                  <TableCell className="text-sm font-medium text-red-700">#{row.number}</TableCell>
                  <TableCell className="text-sm text-slate-700">{row.customerName}</TableCell>
                  <TableCell className="text-xs text-slate-500">{row.referenceNumber || "—"}</TableCell>
                  <TableCell className="text-xs text-slate-500">{row.date ? new Date(row.date).toLocaleDateString("en-GB") : "-"}</TableCell>
                  <TableCell className="text-sm font-semibold text-slate-800">{Number(row.total || 0).toLocaleString("en-US")} ج.م</TableCell>
                  <TableCell><Badge variant={statusColor(row.status)} className="text-xs">{statusLabel(row.status)}</Badge></TableCell>
                  <TableCell>
                    {row.status === "draft" && (
                      <>
                        <EntityPermissionGate moduleKey="sales" entityKey="saleReturnInvoice" action="edit">
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => void openEdit(row.id)}>
                            <Pencil size={12} /> تعديل
                          </Button>
                        </EntityPermissionGate>
                        <EntityPermissionGate moduleKey="sales" entityKey="saleReturnInvoice" action="approve">
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-green-600 gap-1" onClick={() => approveMut.mutate(row.id)}>
                            <CheckCircle size={12} /> اعتماد
                          </Button>
                        </EntityPermissionGate>
                      </>
                    )}
                    {row.status === "confirmed" && (
                      <EntityPermissionGate moduleKey="sales" entityKey="saleReturnInvoice" action="unapprove">
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
          <DialogHeader><DialogTitle>{editId ? "تعديل مردود بيع" : "مردود بيع جديد"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">العميل *</Label>
                <PartySearchSelect parties={customers?.rows || []} value={form.customerId} onChange={(v) => setForm((f) => ({ ...f, customerId: v }))} placeholder="اختر العميل" />
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
                <Label className="text-xs">مندوب المبيعات</Label>
                <Select value={form.salesRepId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, salesRepId: v === "none" ? "" : v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {(salesReps || []).map((r: any) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
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
                          <ItemSearchSelect items={allItems || []} value={it.itemId} onChange={(v) => updateItem(i, "itemId", v)} placeholder="اكتب للبحث عن صنف…" />
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
              <div className="text-left text-sm font-semibold text-red-700">الإجمالي: {total.toLocaleString("en-US")} ج.م</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ملاحظات</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="text-sm resize-none" rows={2} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={closeDialog}>إلغاء</Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending}>
              {editId ? "حفظ التعديلات" : "حفظ مسودة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ERPLayout>
  );
}
