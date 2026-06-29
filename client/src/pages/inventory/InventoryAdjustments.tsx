import { useState } from "react";
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
import { Plus, ClipboardList, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function InventoryAdjustments() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ warehouseId: "", date: new Date().toISOString().split("T")[0], adjustmentType: "addition" as "addition" | "deduction", notes: "" });
  const [items, setItems] = useState<{ itemId: string; quantity: string; reason: string }[]>([{ itemId: "", quantity: "1", reason: "" }]);

  const { data, refetch } = trpc.inventory.adjustments.list.useQuery({ page: 1, limit: 50 });
  const { data: warehouses } = trpc.warehouses.list.useQuery();
  const { data: itemsList } = trpc.items.list.useQuery({ page: 1, limit: 200 });
  const createMut = trpc.inventory.adjustments.create.useMutation({
    onSuccess: () => { toast.success("تم تسجيل تسوية المخزون"); refetch(); setOpen(false); resetForm(); }
  });

  const resetForm = () => {
    setForm({ warehouseId: "", date: new Date().toISOString().split("T")[0], adjustmentType: "addition", notes: "" });
    setItems([{ itemId: "", quantity: "1", reason: "" }]);
  };

  const addItem = () => setItems(prev => [...prev, { itemId: "", quantity: "1", reason: "" }]);
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, val: string) => setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));

  const handleSubmit = () => {
    if (!form.warehouseId) return toast.error("يجب اختيار المخزن");
    if (items.some(it => !it.itemId)) return toast.error("يجب اختيار الصنف في كل بند");
    createMut.mutate({
      warehouseId: Number(form.warehouseId),
      date: form.date,
      adjustmentType: form.adjustmentType,
      notes: form.notes,
      items: items.map(it => ({ itemId: Number(it.itemId), quantity: it.quantity, reason: it.reason })),
    });
  };

  return (
    <ERPLayout title="تسوية المخزون">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <ClipboardList size={18} className="text-teal-600" /> تسوية المخزون
            </CardTitle>
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white gap-1" onClick={() => { resetForm(); setOpen(true); }}>
              <Plus size={14} /> تسوية جديدة
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-right text-xs font-semibold text-slate-600">رقم التسوية</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">المخزن</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">التاريخ</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">السبب</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!data?.rows || data.rows.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center text-slate-400 py-10">لا توجد تسويات مخزون</TableCell></TableRow>
              )}
              {data?.rows?.map((row: any) => (
                <TableRow key={row.id} className="hover:bg-slate-50">
                  <TableCell className="text-sm font-medium text-teal-700">#{row.number}</TableCell>
                  <TableCell className="text-sm text-slate-700">{row.warehouseName}</TableCell>
                  <TableCell className="text-xs text-slate-500">{row.date ? new Date(row.date).toLocaleDateString("ar-EG") : "-"}</TableCell>
                  <TableCell className="text-xs text-slate-500">{row.reason || "-"}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-xs">مؤكد</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle>تسوية مخزون جديدة</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">المخزن *</Label>
                <Select value={form.warehouseId} onValueChange={v => setForm(f => ({ ...f, warehouseId: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر المخزن" /></SelectTrigger>
                  <SelectContent>
                    {(warehouses as any[] || []).map((w: any) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">نوع التسوية</Label>
                <Select value={form.adjustmentType} onValueChange={v => setForm(f => ({ ...f, adjustmentType: v as any }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="addition">إضافة للمخزون</SelectItem>
                    <SelectItem value="deduction">خصم من المخزون</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">التاريخ</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="h-9 text-sm" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">الأصناف</Label>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addItem}><Plus size={12} /> إضافة صنف</Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-right text-xs">الصنف</TableHead>
                      <TableHead className="text-right text-xs">الكمية</TableHead>
                      <TableHead className="text-right text-xs">السبب</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it, i) => (
                      <TableRow key={i}>
                        <TableCell className="p-1">
                          <Select value={it.itemId} onValueChange={v => updateItem(i, "itemId", v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="اختر الصنف" /></SelectTrigger>
                            <SelectContent>
                              {itemsList?.rows?.map((item: any) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="p-1"><Input type="number" value={it.quantity} onChange={e => updateItem(i, "quantity", e.target.value)} className="h-8 text-xs w-20" /></TableCell>
                        <TableCell className="p-1"><Input value={it.reason} onChange={e => updateItem(i, "reason", e.target.value)} className="h-8 text-xs" placeholder="سبب التسوية..." /></TableCell>
                        <TableCell className="p-1">
                          {items.length > 1 && <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => removeItem(i)}><Trash2 size={12} /></Button>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ملاحظات</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="text-sm resize-none" rows={2} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { setOpen(false); resetForm(); }}>إلغاء</Button>
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" onClick={handleSubmit} disabled={createMut.isPending}>حفظ التسوية</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ERPLayout>
  );
}
