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
import { Plus, UserCheck, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

const emptyForm = { name: "", phone: "", email: "", commissionRate: "0", address: "", notes: "" };

export default function SalesReps() {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [search, setSearch] = useState("");

  const { data, refetch } = trpc.salesReps.list.useQuery();
  const createMut = trpc.salesReps.create.useMutation({ onSuccess: () => { toast.success("تم إضافة المندوب"); refetch(); setOpen(false); setForm({ ...emptyForm }); } });
  const updateMut = trpc.salesReps.update.useMutation({ onSuccess: () => { toast.success("تم تحديث المندوب"); refetch(); setOpen(false); setEditId(null); setForm({ ...emptyForm }); } });
  const deleteMut = trpc.salesReps.delete.useMutation({ onSuccess: () => { toast.success("تم حذف المندوب"); refetch(); } });

  const handleSubmit = () => {
    if (!form.name.trim()) return toast.error("اسم المندوب مطلوب");
    if (editId) {
      updateMut.mutate({ id: editId, ...form, commissionRate: form.commissionRate });
    } else {
      createMut.mutate({ ...form });
    }
  };

  const handleEdit = (row: any) => {
    setEditId(row.id);
    setForm({ name: row.name || "", phone: row.phone || "", email: row.email || "", commissionRate: row.commissionRate || "0", address: row.address || "", notes: row.notes || "" });
    setOpen(true);
  };

  const filtered = (data as any[] || []).filter((r: any) =>
    !search || r.name?.toLowerCase().includes(search.toLowerCase()) || r.phone?.includes(search)
  );

  return (
    <ERPLayout title="مندوبي البيع">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <UserCheck size={18} className="text-blue-600" /> مندوبي البيع
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..." className="h-8 text-sm pr-7 w-48" />
              </div>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1" onClick={() => { setEditId(null); setForm({ ...emptyForm }); setOpen(true); }}>
                <Plus size={14} /> مندوب جديد
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-right text-xs font-semibold text-slate-600">#</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">الاسم</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">الهاتف</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">البريد الإلكتروني</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">نسبة العمولة %</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">الحالة</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-10">لا يوجد مندوبين</TableCell></TableRow>
              )}
              {filtered.map((row: any, i: number) => (
                <TableRow key={row.id} className="hover:bg-slate-50">
                  <TableCell className="text-xs text-slate-500">{i + 1}</TableCell>
                  <TableCell className="text-sm font-medium text-slate-800">{row.name}</TableCell>
                  <TableCell className="text-sm text-slate-600">{row.phone || "-"}</TableCell>
                  <TableCell className="text-sm text-slate-600">{row.email || "-"}</TableCell>
                  <TableCell className="text-sm font-semibold text-blue-700">{row.commissionRate || "0"}%</TableCell>
                  <TableCell><Badge variant={row.isActive ? "default" : "secondary"} className="text-xs">{row.isActive ? "نشط" : "غير نشط"}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:bg-blue-50" onClick={() => handleEdit(row)}><Pencil size={12} /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50" onClick={() => { if (confirm("هل تريد حذف هذا المندوب؟")) deleteMut.mutate(row.id); }}><Trash2 size={12} /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setEditId(null); setForm({ ...emptyForm }); } }}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle>{editId ? "تعديل مندوب" : "مندوب بيع جديد"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">الاسم *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-9 text-sm" placeholder="اسم المندوب" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الهاتف</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="h-9 text-sm" placeholder="رقم الهاتف" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">البريد الإلكتروني</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="h-9 text-sm" placeholder="example@email.com" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">نسبة العمولة %</Label>
                <Input type="number" value={form.commissionRate} onChange={e => setForm(f => ({ ...f, commissionRate: e.target.value }))} className="h-9 text-sm" min="0" max="100" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">العنوان</Label>
              <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="h-9 text-sm" placeholder="العنوان" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ملاحظات</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="h-9 text-sm" placeholder="ملاحظات إضافية" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { setOpen(false); setEditId(null); setForm({ ...emptyForm }); }}>إلغاء</Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending}>
              {editId ? "تحديث" : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ERPLayout>
  );
}
