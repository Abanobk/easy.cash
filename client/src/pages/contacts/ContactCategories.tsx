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
import { Plus, Edit, Trash2, Layers } from "lucide-react";
import { toast } from "sonner";

export default function ContactCategories() {
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "", type: "both" as "customer" | "supplier" | "both" });

  const { data, refetch } = trpc.contactCategories.list.useQuery();
  const createMut = trpc.contactCategories.create.useMutation({ onSuccess: () => { toast.success("تم إضافة الفئة"); refetch(); setOpen(false); resetForm(); } });
  const updateMut = trpc.contactCategories.update.useMutation({ onSuccess: () => { toast.success("تم تحديث الفئة"); refetch(); setOpen(false); resetForm(); } });
  const deleteMut = trpc.contactCategories.delete.useMutation({ onSuccess: () => { toast.success("تم حذف الفئة"); refetch(); } });

  const resetForm = () => { setForm({ name: "", type: "both" }); setEditItem(null); };

  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({ name: item.name, type: item.type });
    setOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return toast.error("اسم الفئة مطلوب");
    if (editItem) updateMut.mutate({ id: editItem.id, ...form });
    else createMut.mutate(form);
  };

  const typeLabel = (t: string) => t === "customer" ? "عملاء" : t === "supplier" ? "موردين" : "عملاء وموردين";
  const typeBadge = (t: string) => t === "customer" ? "default" : t === "supplier" ? "secondary" : "outline";

  return (
    <ERPLayout title="فئات العملاء والموردين">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Layers size={18} className="text-blue-600" /> فئات العملاء والموردين
            </CardTitle>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1" onClick={() => { resetForm(); setOpen(true); }}>
              <Plus size={14} /> إضافة فئة
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-right text-xs font-semibold text-slate-600">#</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">اسم الفئة</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">النوع</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!data || data.length === 0) && (
                <TableRow><TableCell colSpan={4} className="text-center text-slate-400 py-10">لا توجد فئات</TableCell></TableRow>
              )}
              {data?.map((row: any, i: number) => (
                <TableRow key={row.id} className="hover:bg-slate-50">
                  <TableCell className="text-xs text-slate-500">{i + 1}</TableCell>
                  <TableCell className="text-sm font-medium text-slate-800">{row.name}</TableCell>
                  <TableCell><Badge variant={typeBadge(row.type) as any} className="text-xs">{typeLabel(row.type)}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:bg-blue-50" onClick={() => openEdit(row)}><Edit size={13} /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50" onClick={() => deleteMut.mutate(row.id)}><Trash2 size={13} /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle>{editItem ? "تعديل فئة" : "إضافة فئة جديدة"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs">اسم الفئة *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم الفئة" className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">النوع</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as any }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">عملاء فقط</SelectItem>
                  <SelectItem value="supplier">موردين فقط</SelectItem>
                  <SelectItem value="both">عملاء وموردين</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { setOpen(false); resetForm(); }}>إلغاء</Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending}>
              {editItem ? "تحديث" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ERPLayout>
  );
}
