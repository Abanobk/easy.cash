import { useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";

export default function FundTransfer() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fromAccountId: "", toAccountId: "", amount: "", date: new Date().toISOString().split("T")[0], description: "" });

  const { data: accounts } = trpc.accounts.chart.useQuery();
  const createMut = trpc.accounts.journal.create.useMutation({
    onSuccess: () => { toast.success("تم تسجيل تحويل الأموال"); setOpen(false); resetForm(); }
  });

  const resetForm = () => setForm({ fromAccountId: "", toAccountId: "", amount: "", date: new Date().toISOString().split("T")[0], description: "" });

  const handleSubmit = () => {
    if (!form.fromAccountId || !form.toAccountId) return toast.error("يجب اختيار الحسابين");
    if (form.fromAccountId === form.toAccountId) return toast.error("لا يمكن التحويل لنفس الحساب");
    if (!form.amount || Number(form.amount) <= 0) return toast.error("يجب إدخال مبلغ صحيح");
    createMut.mutate({
      date: form.date,
      description: form.description || `تحويل أموال بمبلغ ${form.amount}`,
      lines: [
        { accountId: Number(form.fromAccountId), debit: "0", credit: form.amount, description: "تحويل صادر" },
        { accountId: Number(form.toAccountId), debit: form.amount, credit: "0", description: "تحويل وارد" },
      ],
    });
  };

  const leafAccounts = (accounts || []).filter((a: any) => !a.isParent);

  return (
    <ERPLayout title="تحويل الأموال">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <ArrowRightLeft size={18} className="text-indigo-600" /> تحويل الأموال بين الحسابات
            </CardTitle>
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1" onClick={() => { resetForm(); setOpen(true); }}>
              <Plus size={14} /> تحويل جديد
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center text-slate-400 py-16">
            <ArrowRightLeft size={48} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm">استخدم زر "تحويل جديد" لتسجيل تحويل أموال بين الحسابات</p>
            <p className="text-xs text-slate-300 mt-1">يتم تسجيل التحويل كقيد يومي متوازن تلقائياً</p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle>تحويل أموال جديد</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">من حساب *</Label>
                <Select value={form.fromAccountId} onValueChange={v => setForm(f => ({ ...f, fromAccountId: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="الحساب المصدر" /></SelectTrigger>
                  <SelectContent>
                    {leafAccounts.map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.code} - {a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">إلى حساب *</Label>
                <Select value={form.toAccountId} onValueChange={v => setForm(f => ({ ...f, toAccountId: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="الحساب المستقبل" /></SelectTrigger>
                  <SelectContent>
                    {leafAccounts.map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.code} - {a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">المبلغ *</Label>
                <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="h-9 text-sm" placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">التاريخ</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="h-9 text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">البيان</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="text-sm resize-none" rows={2} placeholder="وصف التحويل..." />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { setOpen(false); resetForm(); }}>إلغاء</Button>
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={handleSubmit} disabled={createMut.isPending}>تسجيل التحويل</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ERPLayout>
  );
}
