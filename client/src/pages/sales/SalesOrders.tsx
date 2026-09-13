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

export default function SalesOrders() {
  const { isNewRoute, goToList, goToCreate } = useMegaCreateRoute("/sales/orders");
  const [open, setOpen] = useState(isNewRoute);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ customerId: "", warehouseId: "", date: new Date().toISOString().split("T")[0], notes: "", expectedDate: "" });
  const [items, setItems] = useState<{ itemId: string; quantity: string; unitPrice: string; notes: string }[]>([
    { itemId: "", quantity: "1", unitPrice: "0", notes: "" }
  ]);

  const utils = trpc.useUtils();
  const { data, refetch } = trpc.sales.orders.list.useQuery({ page: 1, limit: 50 });
  const { data: customers } = trpc.customers.list.useQuery({ page: 1, limit: 200 });
  const { data: itemsList } = trpc.items.list.useQuery({ page: 1, limit: 200 });
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
    setForm({ customerId: "", warehouseId: "", date: new Date().toISOString().split("T")[0], notes: "", expectedDate: "" });
    setItems([{ itemId: "", quantity: "1", unitPrice: "0", notes: "" }]);
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
    });
    setItems(o.items.map((i: any) => ({ itemId: String(i.itemId), quantity: String(i.quantity), unitPrice: String(i.price), notes: "" })));
    setOpen(true);
  };

  const addItem = () => setItems(prev => [...prev, { itemId: "", quantity: "1", unitPrice: "0", notes: "" }]);
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, val: string) => setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  const total = items.reduce((s, it) => s + (Number(it.quantity) * Number(it.unitPrice)), 0);

  const handleSubmit = () => {
    if (!form.customerId) return toast.error("يجب اختيار العميل");
    if (items.some(it => !it.itemId)) return toast.error("يجب اختيار الصنف في كل بند");
    const payload = {
      customerId: Number(form.customerId),
      warehouseId: form.warehouseId ? Number(form.warehouseId) : undefined,
      date: form.date,
      expectedDate: form.expectedDate || undefined,
      notes: form.notes,
      items: items.map(it => ({ itemId: Number(it.itemId), quantity: it.quantity, unitPrice: it.unitPrice, notes: it.notes })),
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
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-right text-xs font-semibold text-slate-600">رقم الطلب</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">العميل</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">التاريخ</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">الإجمالي</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">الحالة</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!data?.rows || data.rows.length === 0) && (
                <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-10">لا توجد طلبات بيع</TableCell></TableRow>
              )}
              {data?.rows?.map((row: any) => (
                <TableRow key={row.id} className="hover:bg-slate-50">
                  <TableCell className="text-sm font-medium text-green-700">
                    <Link href={`/sales/orders/${row.id}`} className="hover:underline">#{row.number}</Link>
                  </TableCell>
                  <TableCell className="text-sm text-slate-700">{row.customerName}</TableCell>
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
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">البنود</Label>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addItem}><Plus size={12} /> إضافة بند</Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-right text-xs">الصنف</TableHead>
                      <TableHead className="text-right text-xs">الكمية</TableHead>
                      <TableHead className="text-right text-xs">سعر الوحدة</TableHead>
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
                        <TableCell className="p-1"><Input type="number" value={it.quantity} onChange={e => updateItem(i, "quantity", e.target.value)} className="h-8 text-xs w-20" /></TableCell>
                        <TableCell className="p-1"><Input type="number" value={it.unitPrice} onChange={e => updateItem(i, "unitPrice", e.target.value)} className="h-8 text-xs w-24" /></TableCell>
                        <TableCell className="p-1 text-xs font-medium">{(Number(it.quantity) * Number(it.unitPrice)).toLocaleString("en-US")}</TableCell>
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
