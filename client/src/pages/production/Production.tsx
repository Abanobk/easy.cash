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
import { Plus, Factory, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Production() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ productId: "", quantity: "1", warehouseId: "", date: new Date().toISOString().split("T")[0], notes: "" });
  const [materials, setMaterials] = useState<{ itemId: string; quantity: string }[]>([{ itemId: "", quantity: "1" }]);

  const { data: productionOrders, refetch } = trpc.production.list.useQuery({ page: 1, limit: 50 });
  const { data: itemsList } = trpc.items.list.useQuery({ page: 1, limit: 200 });
  const { data: warehouses } = trpc.warehouses.list.useQuery();
  const createMut = trpc.production.create.useMutation({
    onSuccess: () => { toast.success("تم إنشاء أمر الإنتاج"); refetch(); setOpen(false); resetForm(); }
  });

  const resetForm = () => {
    setForm({ productId: "", quantity: "1", warehouseId: "", date: new Date().toISOString().split("T")[0], notes: "" });
    setMaterials([{ itemId: "", quantity: "1" }]);
  };

  const addMaterial = () => setMaterials(prev => [...prev, { itemId: "", quantity: "1" }]);
  const removeMaterial = (i: number) => setMaterials(prev => prev.filter((_, idx) => idx !== i));
  const updateMaterial = (i: number, field: string, val: string) => setMaterials(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: val } : m));

  const handleSubmit = () => {
    if (!form.productId) return toast.error("يجب اختيار المنتج");
    if (!form.warehouseId) return toast.error("يجب اختيار المخزن");
    createMut.mutate({
      productId: Number(form.productId),
      quantity: form.quantity,
      warehouseId: Number(form.warehouseId),
      date: form.date,
      notes: form.notes,
      materials: materials.filter(m => m.itemId).map(m => ({ itemId: Number(m.itemId), quantity: m.quantity })),
    });
  };

  const statusLabel = (s: string) => ({ draft: "مسودة", in_progress: "قيد التنفيذ", completed: "مكتمل", cancelled: "ملغي" }[s] || s);
  const statusColor = (s: string) => ({ draft: "outline", in_progress: "secondary", completed: "default", cancelled: "destructive" }[s] || "outline") as any;

  return (
    <ERPLayout title="الإنتاج">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Factory size={18} className="text-amber-600" /> أوامر الإنتاج
            </CardTitle>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white gap-1" onClick={() => { resetForm(); setOpen(true); }}>
              <Plus size={14} /> أمر إنتاج جديد
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-right text-xs font-semibold text-slate-600">رقم الأمر</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">المنتج</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">الكمية</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">التاريخ</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!productionOrders?.rows || productionOrders.rows.length === 0) && (
                <TableRow><TableCell colSpan={5} className="text-center text-slate-400 py-10">لا توجد أوامر إنتاج</TableCell></TableRow>
              )}
              {productionOrders?.rows?.map((row: any) => (
                <TableRow key={row.id} className="hover:bg-slate-50">
                  <TableCell className="text-sm font-medium text-amber-700">#{row.number}</TableCell>
                  <TableCell className="text-sm text-slate-700">{row.productName}</TableCell>
                  <TableCell className="text-sm text-slate-700">{row.quantity}</TableCell>
                  <TableCell className="text-xs text-slate-500">{row.date ? new Date(row.date).toLocaleDateString("ar-EG") : "-"}</TableCell>
                  <TableCell><Badge variant={statusColor(row.status)} className="text-xs">{statusLabel(row.status)}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle>أمر إنتاج جديد</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">المنتج النهائي *</Label>
                <Select value={form.productId} onValueChange={v => setForm(f => ({ ...f, productId: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر المنتج" /></SelectTrigger>
                  <SelectContent>
                    {itemsList?.rows?.map((item: any) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الكمية المنتجة</Label>
                <Input type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">المخزن *</Label>
                <Select value={form.warehouseId} onValueChange={v => setForm(f => ({ ...f, warehouseId: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="مخزن الإنتاج" /></SelectTrigger>
                  <SelectContent>
                    {(warehouses as any[] || []).map((w: any) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">التاريخ</Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="h-9 text-sm" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">المواد الخام المستخدمة</Label>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addMaterial}><Plus size={12} /> إضافة مادة</Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-right text-xs">المادة الخام</TableHead>
                      <TableHead className="text-right text-xs">الكمية المستهلكة</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {materials.map((m, i) => (
                      <TableRow key={i}>
                        <TableCell className="p-1">
                          <Select value={m.itemId} onValueChange={v => updateMaterial(i, "itemId", v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="اختر المادة" /></SelectTrigger>
                            <SelectContent>
                              {itemsList?.rows?.map((item: any) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="p-1"><Input type="number" value={m.quantity} onChange={e => updateMaterial(i, "quantity", e.target.value)} className="h-8 text-xs w-24" /></TableCell>
                        <TableCell className="p-1">
                          {materials.length > 1 && <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => removeMaterial(i)}><Trash2 size={12} /></Button>}
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
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleSubmit} disabled={createMut.isPending}>إنشاء أمر الإنتاج</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ERPLayout>
  );
}
