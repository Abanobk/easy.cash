import { useState } from "react";
import { useLocation } from "wouter";
import ERPLayout from "@/components/ERPLayout";
import { DataTable } from "@/components/DataTable";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { tenantPath, useTenantSlug } from "@/lib/tenant";

export default function FundTransfer() {
  const [, navigate] = useLocation();
  const tenantSlug = useTenantSlug();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    fromAccountId: "",
    toAccountId: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    description: "",
    costCenterId: "",
  });

  const { data, isLoading, refetch } = trpc.accounts.journal.list.useQuery({
    page,
    limit: 20,
    reference: "FUND_TRANSFER",
  });
  const { data: accounts } = trpc.accounts.chart.useQuery();
  const { data: costCentersList } = trpc.costCenters.list.useQuery();
  const createMut = trpc.accounts.journal.create.useMutation({
    onSuccess: () => {
      toast.success("تم تسجيل تحويل الأموال");
      setOpen(false);
      resetForm();
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => setForm({
    fromAccountId: "",
    toAccountId: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    description: "",
    costCenterId: "",
  });

  const handleSubmit = () => {
    if (!form.fromAccountId || !form.toAccountId) return toast.error("يجب اختيار الحسابين");
    if (form.fromAccountId === form.toAccountId) return toast.error("لا يمكن التحويل لنفس الحساب");
    if (!form.amount || Number(form.amount) <= 0) return toast.error("يجب إدخال مبلغ صحيح");
    const cc = form.costCenterId ? Number(form.costCenterId) : undefined;
    createMut.mutate({
      date: form.date,
      description: form.description || `تحويل أموال بمبلغ ${form.amount}`,
      reference: "FUND_TRANSFER",
      lines: [
        { accountId: Number(form.fromAccountId), debit: "0", credit: form.amount, description: "تحويل صادر", costCenterId: cc },
        { accountId: Number(form.toAccountId), debit: form.amount, credit: "0", description: "تحويل وارد", costCenterId: cc },
      ],
    });
  };

  const leafAccounts = (accounts || []).filter((a: { isParent?: boolean | null }) => !a.isParent);

  return (
    <ERPLayout title="تحويل الأموال">
      <DataTable
        title="سجل تحويلات الأموال"
        data={data?.rows}
        isLoading={isLoading}
        total={data?.total}
        page={page}
        onPageChange={setPage}
        onAdd={() => { resetForm(); setOpen(true); }}
        addLabel="تحويل جديد"
        addEntity={{ moduleKey: "accounts", entityKey: "journalEntry" }}
        onRowClick={(row: { id?: number }) => row.id && navigate(tenantPath(tenantSlug, `/accounts/journal/${row.id}`))}
        columns={[
          { key: "number", label: "رقم القيد", className: "w-28" },
          { key: "date", label: "التاريخ", render: (row: { date?: string | Date | null }) => row.date ? new Date(row.date).toLocaleDateString("en-GB") : "-" },
          { key: "description", label: "البيان" },
          { key: "totalDebit", label: "المبلغ", render: (row: { totalDebit?: string }) => `${Number(row.totalDebit || 0).toLocaleString("en-US")} ج.م` },
        ]}
        emptyMessage="لا توجد تحويلات مسجلة"
        headerExtra={
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <ArrowRightLeft size={14} /> يُسجّل كقيد يومي متوازن
          </span>
        }
      />

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle>تحويل أموال جديد</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">من حساب *</Label>
                <Select value={form.fromAccountId} onValueChange={(v) => setForm((f) => ({ ...f, fromAccountId: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="الحساب المصدر" /></SelectTrigger>
                  <SelectContent>
                    {leafAccounts.map((a: { id: number; code: string; name: string }) => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.code} - {a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">إلى حساب *</Label>
                <Select value={form.toAccountId} onValueChange={(v) => setForm((f) => ({ ...f, toAccountId: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="الحساب المستقبل" /></SelectTrigger>
                  <SelectContent>
                    {leafAccounts.map((a: { id: number; code: string; name: string }) => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.code} - {a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">المبلغ *</Label>
                <Input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="h-9 text-sm" placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">التاريخ</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="h-9 text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">مركز التكلفة</Label>
              <Select value={form.costCenterId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, costCenterId: v === "none" ? "" : v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="بدون" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون</SelectItem>
                  {(costCentersList || []).map((c: { id: number; name: string }) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">البيان</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="text-sm resize-none" rows={2} placeholder="وصف التحويل..." />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { setOpen(false); resetForm(); }}>إلغاء</Button>
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={handleSubmit} disabled={createMut.isPending}>
              <Plus size={14} className="ml-1" /> تسجيل التحويل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ERPLayout>
  );
}
