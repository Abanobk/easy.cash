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
import { Textarea } from "@/components/ui/textarea";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AddActionButton } from "@/components/AddActionButton";
import { PartySearchSelect } from "@/components/PartySearchSelect";
import { ItemSearchSelect } from "@/components/ItemSearchSelect";

export default function SalesReturns() {
  const { isNewRoute, goToList, goToCreate } = useMegaCreateRoute("/sales/returns");
  const [open, setOpen] = useState(isNewRoute);
  const [form, setForm] = useState({ customerId: "", date: new Date().toISOString().split("T")[0], reason: "", notes: "" });
  const [items, setItems] = useState<{ itemId: string; quantity: string; unitPrice: string }[]>([
    { itemId: "", quantity: "1", unitPrice: "0" }
  ]);

  const { data, refetch } = trpc.sales.returns.list.useQuery({ page: 1, limit: 50 });
  const { data: customers } = trpc.customers.list.useQuery({ page: 1, limit: 200 });
  const { data: itemsList } = trpc.items.list.useQuery({ page: 1, limit: 200 });
  const createMut = trpc.sales.returns.create.useMutation({ onSuccess: () => { toast.success("تم تسجيل مردود البيع"); refetch(); closeDialog(); } });

  const resetForm = () => {
    setForm({ customerId: "", date: new Date().toISOString().split("T")[0], reason: "", notes: "" });
    setItems([{ itemId: "", quantity: "1", unitPrice: "0" }]);
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

  const addItem = () => setItems(prev => [...prev, { itemId: "", quantity: "1", unitPrice: "0" }]);
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, val: string) => setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  const total = items.reduce((s, it) => s + (Number(it.quantity) * Number(it.unitPrice)), 0);

  const handleSubmit = () => {
    if (!form.customerId) return toast.error("يجب اختيار العميل");
    if (items.some(it => !it.itemId)) return toast.error("يجب اختيار الصنف في كل بند");
    createMut.mutate({
      customerId: Number(form.customerId),
      date: form.date,
      reason: form.reason,
      notes: form.notes,
      items: items.map(it => ({ itemId: Number(it.itemId), quantity: it.quantity, unitPrice: it.unitPrice })),
    });
  };

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
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-right text-xs font-semibold text-slate-600">رقم المردود</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">العميل</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">التاريخ</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">الإجمالي</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!data?.rows || data.rows.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center text-slate-400 py-10">لا توجد مردودات بيع</TableCell></TableRow>
              )}
              {data?.rows?.map((row: any) => (
                <TableRow key={row.id} className="hover:bg-slate-50">
                  <TableCell className="text-sm font-medium text-red-700">#{row.number}</TableCell>
                  <TableCell className="text-sm text-slate-700">{row.customerName}</TableCell>
                  <TableCell className="text-xs text-slate-500">{row.date ? new Date(row.date).toLocaleDateString("en-GB") : "-"}</TableCell>
                  <TableCell className="text-sm font-semibold text-slate-800">{Number(row.total || 0).toLocaleString("en-US")} ج.م</TableCell>
                  <TableCell><Badge variant="secondary" className="text-xs">مؤكد</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={v => { if (!v) closeDialog(); else setOpen(true); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle>مردود بيع جديد</DialogTitle></DialogHeader>
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
                <Label className="text-xs">التاريخ</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="h-9 text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">سبب المردود</Label>
              <Input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className="h-9 text-sm" placeholder="سبب الإرجاع..." />
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
              <div className="text-left text-sm font-semibold text-red-700">الإجمالي: {total.toLocaleString("en-US")} ج.م</div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ملاحظات</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="text-sm resize-none" rows={2} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { closeDialog(); }}>إلغاء</Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={handleSubmit} disabled={createMut.isPending}>حفظ المردود</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ERPLayout>
  );
}
