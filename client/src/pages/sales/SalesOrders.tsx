import { useState } from "react";
import { useMegaCreateRoute } from "@/hooks/useMegaCreateRoute";
import { Link } from "wouter";
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
import { Plus, ClipboardList, CheckCircle, Trash2, FileText, Pencil, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { AddActionButton } from "@/components/AddActionButton";

import EntityPermissionGate from "@/components/EntityPermissionGate";
import { useWarehouseOptions } from "@/hooks/useEntityOptions";
import { PartySearchSelect } from "@/components/PartySearchSelect";
import { ItemSearchSelect } from "@/components/ItemSearchSelect";
import { OrderReturnListFilterBar, type OrderReturnListFiltersValue } from "@/components/invoices/OrderReturnListFilterBar";

export default function SalesOrders() {
  const { isNewRoute, goToList, goToCreate } = useMegaCreateRoute("/sales/orders");
  const [open, setOpen] = useState(isNewRoute);
  const [editId, setEditId] = useState<number | null>(null);
  const [listFilters, setListFilters] = useState<OrderReturnListFiltersValue>({});
  const [form, setForm] = useState({
    customerId: "", warehouseId: "", date: new Date().toISOString().split("T")[0], notes: "", expectedDate: "",
    referenceNumber: "", phone: "", address: "", salesRepId: "",
  });
  const [items, setItems] = useState<{ itemId: string; quantity: string; unitPrice: string; notes: string; discount: string; cashDiscount: string; tax: string }[]>([
    { itemId: "", quantity: "1", unitPrice: "0", notes: "", discount: "0", cashDiscount: "0", tax: "0" }
  ]);

  const utils = trpc.useUtils();
  const { data, refetch } = trpc.sales.orders.list.useQuery({
    page: 1, limit: 50,
    dateFrom: listFilters.dateFrom, dateTo: listFilters.dateTo,
    branchId: listFilters.branchId, warehouseId: listFilters.warehouseId,
    status: listFilters.status, partyId: listFilters.partyId, salesRepId: listFilters.salesRepId,
    number: listFilters.number, referenceNumber: listFilters.referenceNumber, search: listFilters.search,
  });
  const { data: customers } = trpc.customers.list.useQuery({ page: 1, limit: 200 });
  const { data: itemsList } = trpc.items.list.useQuery({ page: 1, limit: 200 });
  const { data: branchList } = trpc.settings.branches.list.useQuery();
  const { data: salesReps } = trpc.salesReps.list.useQuery();
  const warehouses = useWarehouseOptions();
  const createMut = trpc.sales.orders.create.useMutation({ onSuccess: () => { toast.success("تم إنشاء طلب البيع"); refetch(); closeDialog(); } });
  const updateMut = trpc.sales.orders.update.useMutation({ onSuccess: () => { toast.success("تم حفظ التعديلات"); refetch(); closeDialog(); }, onError: (e) => toast.error(e.message) });
  const approveMut = trpc.sales.orders.approve.useMutation({ onSuccess: () => { toast.success("تم اعتماد الطلب"); refetch(); } });
  const unapproveMut = trpc.sales.orders.unapprove.useMutation({ onSuccess: () => { toast.success("تم فك الاعتماد"); refetch(); }, onError: (e) => toast.error(e.message) });
  const convertMut = trpc.sales.orders.convertToInvoice.useMutation({
    onSuccess: (res) => { toast.success(`تم إنشاء الفاتورة ${res.number}`); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setEditId(null);
    setForm({
      customerId: "", warehouseId: "", date: new Date().toISOString().split("T")[0], notes: "", expectedDate: "",
      referenceNumber: "", phone: "", address: "", salesRepId: "",
    });
    setItems([{ itemId: "", quantity: "1", unitPrice: "0", notes: "", discount: "0", cashDiscount: "0", tax: "0" }]);
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

  const openEdit = async (id: number) => {
    const o = await utils.sales.orders.byId.fetch(id);
    setEditId(id);
    setForm({
      customerId: String(o.customerId),
      warehouseId: o.warehouseId ? String(o.warehouseId) : "",
      date: o.date ? new Date(o.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
      notes: o.notes || "",
      expectedDate: o.expectedDate ? new Date(o.expectedDate).toISOString().split("T")[0] : "",
      referenceNumber: (o as any).referenceNumber || "",
      phone: (o as any).phone || "",
      address: (o as any).address || "",
      salesRepId: (o as any).salesRepId ? String((o as any).salesRepId) : "",
    });
    setItems(o.items.map((i: any) => ({
      itemId: String(i.itemId), quantity: String(i.quantity), unitPrice: String(i.price), notes: "",
      discount: i.discount != null ? String(i.discount) : "0",
      cashDiscount: i.cashDiscount != null ? String(i.cashDiscount) : "0",
      tax: i.tax != null ? String(i.tax) : "0",
    })));
    setOpen(true);
  };

  const addItem = () => setItems(prev => [...prev, { itemId: "", quantity: "1", unitPrice: "0", notes: "", discount: "0", cashDiscount: "0", tax: "0" }]);
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, val: string) => setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  const lineNet = (it: typeof items[0]) => {
    const q = Number(it.quantity) || 0, p = Number(it.unitPrice) || 0, d = Number(it.discount) || 0;
    const cash = Number(it.cashDiscount) || 0, t = Number(it.tax) || 0;
    return Math.max(0, q * p * (1 - d / 100) - cash) * (1 + t / 100);
  };
  const total = items.reduce((s, it) => s + lineNet(it), 0);

  const handleSubmit = () => {
    if (!form.customerId) return toast.error("يجب اختيار العميل");
    if (items.some(it => !it.itemId)) return toast.error("يجب اختيار الصنف في كل بند");
    const payload = {
      customerId: Number(form.customerId),
      warehouseId: form.warehouseId ? Number(form.warehouseId) : undefined,
      date: form.date,
      expectedDate: form.expectedDate || undefined,
      notes: form.notes,
      referenceNumber: form.referenceNumber || undefined,
      phone: form.phone || undefined,
      address: form.address || undefined,
      salesRepId: form.salesRepId ? Number(form.salesRepId) : undefined,
      items: items.map(it => ({
        itemId: Number(it.itemId), quantity: it.quantity, unitPrice: it.unitPrice, notes: it.notes,
        discount: it.discount || "0", cashDiscount: it.cashDiscount || "0", tax: it.tax || "0",
      })),
    };
    if (editId) updateMut.mutate({ ...payload, id: editId });
    else createMut.mutate(payload);
  };

  const statusLabel = (s: string) => ({ draft: "مسودة", confirmed: "معتمد", delivered: "مُحوَّل لفاتورة", cancelled: "ملغي" }[s] || s);
  const statusColor = (s: string) => ({ draft: "outline", confirmed: "default", delivered: "secondary", cancelled: "destructive" }[s] || "outline") as any;

  return (
    <ERPLayout title="طلبات البيع">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <ClipboardList size={18} className="text-green-600" /> طلبات البيع
            </CardTitle>
            <AddActionButton moduleKey="sales" entityKey="saleOrder" size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-1" onClick={openNewDialog}>
              <Plus size={14} /> طلب بيع جديد
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
            branches={(branchList || []).map((b: any) => ({ id: b.id, name: b.name }))}
            warehouses={warehouses.map((w) => ({ id: Number(w.value), name: w.label }))}
            salesReps={(salesReps || []).map((r: any) => ({ id: r.id, name: r.name }))}
            showSalesRep
          />
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-right text-xs font-semibold text-slate-600">رقم الطلب</TableHead>
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
                <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-10">لا توجد طلبات بيع</TableCell></TableRow>
              )}
              {data?.rows?.map((row: any) => (
                <TableRow key={row.id} className="hover:bg-slate-50">
                  <TableCell className="text-sm font-medium text-green-700">
                    <Link href={`/sales/orders/${row.id}`} className="hover:underline">#{row.number}</Link>
                  </TableCell>
                  <TableCell className="text-sm text-slate-700">{row.customerName}</TableCell>
                  <TableCell className="text-xs text-slate-500">{row.referenceNumber || "—"}</TableCell>
                  <TableCell className="text-xs text-slate-500">{row.date ? new Date(row.date).toLocaleDateString("en-GB") : "-"}</TableCell>
                  <TableCell className="text-sm font-semibold text-slate-800">{Number(row.total || 0).toLocaleString("en-US")} ج.م</TableCell>
                  <TableCell><Badge variant={statusColor(row.status)} className="text-xs">{statusLabel(row.status)}</Badge></TableCell>
                  <TableCell>
                    {row.status === "draft" && (
                      <>
                        <EntityPermissionGate moduleKey="sales" entityKey="saleOrder" action="edit">
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-600 hover:bg-slate-100 gap-1" onClick={() => void openEdit(row.id)}>
                            <Pencil size={12} /> تعديل
                          </Button>
                        </EntityPermissionGate>
                        <EntityPermissionGate moduleKey="sales" entityKey="saleOrder" action="approve">
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-green-600 hover:bg-green-50 gap-1" onClick={() => approveMut.mutate(row.id)}>
                            <CheckCircle size={12} /> اعتماد
                          </Button>
                        </EntityPermissionGate>
                      </>
                    )}
                    {row.status === "confirmed" && (
                      <EntityPermissionGate moduleKey="sales" entityKey="saleOrder" action="unapprove">
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-700 hover:bg-amber-50 gap-1" disabled={unapproveMut.isPending} onClick={() => unapproveMut.mutate(row.id)}>
                          <Undo2 size={12} /> فك اعتماد
                        </Button>
                      </EntityPermissionGate>
                    )}
                    {row.status !== "delivered" && row.status !== "cancelled" && (
                      <EntityPermissionGate moduleKey="sales" entityKey="saleOrder" action="edit">
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-600 hover:bg-blue-50 gap-1" onClick={() => convertMut.mutate({ orderId: row.id })} disabled={convertMut.isPending}>
                          <FileText size={12} /> تحويل لفاتورة
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

      <Dialog open={open} onOpenChange={v => { if (!v) closeDialog(); else setOpen(true); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle>{editId ? "تعديل طلب بيع" : "طلب بيع جديد"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">العميل *</Label>
                <PartySearchSelect
                  parties={customers?.rows || []}
                  value={form.customerId}
                  onChange={(v) => setForm(f => ({ ...f, customerId: v }))}
                  placeholder="اختر العميل"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">تاريخ الطلب</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="h-9 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">المخزن</Label>
                <Select value={form.warehouseId} onValueChange={v => setForm(f => ({ ...f, warehouseId: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر المخزن" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">تاريخ التسليم المتوقع</Label>
                <Input type="date" value={form.expectedDate} onChange={e => setForm(f => ({ ...f, expectedDate: e.target.value }))} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">رقم المرجع</Label>
                <Input value={form.referenceNumber} onChange={e => setForm(f => ({ ...f, referenceNumber: e.target.value }))} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">مندوب المبيعات</Label>
                <Select value={form.salesRepId || "none"} onValueChange={v => setForm(f => ({ ...f, salesRepId: v === "none" ? "" : v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {(salesReps || []).map((r: any) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الهاتف</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">العنوان</Label>
                <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="h-9 text-sm" />
              </div>
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
                      <TableHead className="text-right text-xs">سعر الوحدة</TableHead>
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
                        <TableCell className="p-1">
                          <ItemSearchSelect
                            items={itemsList?.rows || []}
                            value={it.itemId}
                            onChange={(v) => updateItem(i, "itemId", v)}
                            placeholder="اختر الصنف"
                          />
                        </TableCell>
                        <TableCell className="p-1"><Input type="number" value={it.quantity} onChange={e => updateItem(i, "quantity", e.target.value)} className="h-8 text-xs w-16" /></TableCell>
                        <TableCell className="p-1"><Input type="number" value={it.unitPrice} onChange={e => updateItem(i, "unitPrice", e.target.value)} className="h-8 text-xs w-20" /></TableCell>
                        <TableCell className="p-1"><Input type="number" value={it.discount} onChange={e => updateItem(i, "discount", e.target.value)} className="h-8 text-xs w-14" /></TableCell>
                        <TableCell className="p-1"><Input type="number" value={it.cashDiscount} onChange={e => updateItem(i, "cashDiscount", e.target.value)} className="h-8 text-xs w-16" /></TableCell>
                        <TableCell className="p-1"><Input type="number" value={it.tax} onChange={e => updateItem(i, "tax", e.target.value)} className="h-8 text-xs w-14" /></TableCell>
                        <TableCell className="p-1 text-xs font-medium">{lineNet(it).toLocaleString("en-US")}</TableCell>
                        <TableCell className="p-1">
                          {items.length > 1 && <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => removeItem(i)}><Trash2 size={12} /></Button>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="text-left text-sm font-semibold text-green-700">الإجمالي: {total.toLocaleString("en-US")} ج.م</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ملاحظات</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="text-sm resize-none" rows={2} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { closeDialog(); }}>إلغاء</Button>
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending}>{editId ? "حفظ التعديلات" : "حفظ الطلب"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ERPLayout>
  );
}
