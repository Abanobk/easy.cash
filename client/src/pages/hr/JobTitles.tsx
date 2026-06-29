import { useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, Briefcase } from "lucide-react";
import { toast } from "sonner";

export default function JobTitles() {
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "" });

  const { data, refetch } = trpc.hr.jobTitles.list.useQuery();
  const createMut = trpc.hr.jobTitles.create.useMutation({ onSuccess: () => { toast.success("تم إضافة الوظيفة"); refetch(); setOpen(false); resetForm(); } });
  const updateMut = trpc.hr.jobTitles.update.useMutation({ onSuccess: () => { toast.success("تم تحديث الوظيفة"); refetch(); setOpen(false); resetForm(); } });
  const deleteMut = trpc.hr.jobTitles.delete.useMutation({ onSuccess: () => { toast.success("تم حذف الوظيفة"); refetch(); } });

  const resetForm = () => { setForm({ name: "" }); setEditItem(null); };

  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({ name: item.name });
    setOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return toast.error("اسم الوظيفة مطلوب");
    if (editItem) updateMut.mutate({ id: editItem.id, name: form.name });
    else createMut.mutate({ name: form.name });
  };

  return (
    <ERPLayout title="الوظائف">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Briefcase size={18} className="text-blue-600" /> قائمة الوظائف
            </CardTitle>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1" onClick={() => { resetForm(); setOpen(true); }}>
              <Plus size={14} /> إضافة وظيفة
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-right text-xs font-semibold text-slate-600">#</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">اسم الوظيفة</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!data || data.length === 0) && (
                <TableRow><TableCell colSpan={3} className="text-center text-slate-400 py-10">لا توجد وظائف</TableCell></TableRow>
              )}
              {data?.map((row: any, i: number) => (
                <TableRow key={row.id} className="hover:bg-slate-50">
                  <TableCell className="text-xs text-slate-500">{i + 1}</TableCell>
                  <TableCell className="text-sm font-medium text-slate-800">{row.name}</TableCell>
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
          <DialogHeader><DialogTitle>{editItem ? "تعديل وظيفة" : "إضافة وظيفة جديدة"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs">اسم الوظيفة *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم الوظيفة" className="h-9 text-sm" />
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
