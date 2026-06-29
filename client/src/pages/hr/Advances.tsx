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
import { Plus, DollarSign, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function Advances() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: "", amount: "", reason: "", date: new Date().toISOString().split("T")[0] });

  const { data: advData, refetch } = trpc.hr.advances.list.useQuery();
  const { data: empData } = trpc.hr.employees.list.useQuery({ page: 1, limit: 200 });
  const createMut = trpc.hr.advances.create.useMutation({ onSuccess: () => { toast.success("تم تسجيل السلفة"); refetch(); setOpen(false); resetForm(); } });
  const approveMut = trpc.hr.advances.approve.useMutation({ onSuccess: () => { toast.success("تم اعتماد السلفة"); refetch(); } });

  const resetForm = () => setForm({ employeeId: "", amount: "", reason: "", date: new Date().toISOString().split("T")[0] });

  const handleSubmit = () => {
    if (!form.employeeId) return toast.error("يجب اختيار الموظف");
    if (!form.amount || isNaN(Number(form.amount))) return toast.error("المبلغ غير صحيح");
    createMut.mutate({ employeeId: Number(form.employeeId), amount: form.amount, reason: form.reason, date: form.date });
  };

  const statusBadge = (s: string) => s === "approved" ? "default" : s === "paid" ? "secondary" : "outline";
  const statusLabel = (s: string) => s === "approved" ? "معتمد" : s === "paid" ? "مدفوع" : "معلق";

  return (
    <ERPLayout title="السلف">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <DollarSign size={18} className="text-blue-600" /> سلف الموظفين
            </CardTitle>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1" onClick={() => { resetForm(); setOpen(true); }}>
              <Plus size={14} /> سلفة جديدة
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-right text-xs font-semibold text-slate-600">#</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">الموظف</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">المبلغ</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">التاريخ</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">السبب</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">الحالة</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!advData || (advData as any[]).length === 0) && (
                <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-10">لا توجد سلف</TableCell></TableRow>
              )}
              {(advData as any[])?.map((row: any, i: number) => (
                <TableRow key={row.id} className="hover:bg-slate-50">
                  <TableCell className="text-xs text-slate-500">{i + 1}</TableCell>
                  <TableCell className="text-sm font-medium text-slate-800">{row.employeeName}</TableCell>
                  <TableCell className="text-sm font-semibold text-blue-700">{Number(row.amount).toLocaleString("ar-EG")} ج.م</TableCell>
                  <TableCell className="text-xs text-slate-500">{row.date ? new Date(row.date).toLocaleDateString("ar-EG") : "-"}</TableCell>
                  <TableCell className="text-xs text-slate-500">{row.reason || "-"}</TableCell>
                  <TableCell><Badge variant={statusBadge(row.status) as any} className="text-xs">{statusLabel(row.status)}</Badge></TableCell>
                  <TableCell>
                    {row.status === "pending" && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-green-600 hover:bg-green-50 gap-1" onClick={() => approveMut.mutate(row.id)}>
                        <CheckCircle size={12} /> اعتماد
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>سلفة جديدة</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs">الموظف *</Label>
              <Select value={form.employeeId} onValueChange={v => setForm(f => ({ ...f, employeeId: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                <SelectContent>
                  {empData?.rows?.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">المبلغ *</Label>
                <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">التاريخ</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="h-9 text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">السبب</Label>
              <Textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="سبب السلفة" className="text-sm resize-none" rows={2} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { setOpen(false); resetForm(); }}>إلغاء</Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSubmit} disabled={createMut.isPending}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ERPLayout>
  );
}
