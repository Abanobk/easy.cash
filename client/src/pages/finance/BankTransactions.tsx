import { useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import { DataTable, statusBadge } from "@/components/DataTable";
import { FormModal } from "@/components/FormModal";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Edit, Trash2 } from "lucide-react";

const emptyForm = {
  type: "deposit" as "deposit" | "withdraw" | "deposit_customer" | "withdraw_supplier",
  bankAccountId: undefined as number | undefined,
  date: new Date().toISOString().split("T")[0],
  amount: "",
  reference: "",
  description: "",
  notes: "",
};

export default function BankTransactions() {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<typeof emptyForm>(emptyForm);

  const { data, isLoading, refetch } = trpc.bank.transactions.list.useQuery({ page, limit: 20 });
  const { data: bankAccounts } = trpc.bank.accounts.list.useQuery();
  const createMut = trpc.bank.transactions.create.useMutation({
    onSuccess: () => { toast.success("تم إضافة المعاملة البنكية"); refetch(); setOpen(false); setForm(emptyForm); },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.amount || !form.bankAccountId) { toast.error("الحساب البنكي والمبلغ مطلوبان"); return; }
    createMut.mutate({ ...form, bankAccountId: form.bankAccountId! });
  };

  const typeLabel = (type: string) => {
    const map: Record<string, { label: string; color: string }> = {
      deposit: { label: "إيداع", color: "text-green-600 bg-green-100" },
      withdraw: { label: "سحب", color: "text-red-600 bg-red-100" },
      deposit_customer: { label: "تحصيل عميل", color: "text-blue-600 bg-blue-100" },
      withdraw_supplier: { label: "دفع مورد", color: "text-orange-600 bg-orange-100" },
    };
    const info = map[type] || { label: type, color: "text-slate-600 bg-slate-100" };
    return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${info.color}`}>{info.label}</span>;
  };

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <ERPLayout title="المعاملات البنكية">
      <DataTable
        title="المعاملات البنكية"
        data={data?.rows}
        isLoading={isLoading}
        total={data?.total}
        page={page}
        onPageChange={setPage}
        onAdd={() => { setForm(emptyForm); setOpen(true); }}
        addLabel="معاملة جديدة"
        columns={[
          { key: "number", label: "الرقم", className: "w-28" },
          { key: "type", label: "النوع", render: (row: any) => typeLabel(row.type) },
          { key: "bankAccountName", label: "الحساب البنكي" },
          { key: "date", label: "التاريخ", render: (row: any) => row.date ? new Date(row.date).toLocaleDateString("ar-EG") : "-" },
          { key: "amount", label: "المبلغ", render: (row: any) => `${Number(row.amount).toLocaleString("ar-EG")} ج.م` },
          { key: "description", label: "البيان" },
        ]}
        actions={(row: any) => (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={() => toast.info("لا يمكن الحذف حالياً")}><Trash2 size={13} /></Button>
        )}
      />

      <FormModal open={open} onClose={() => { setOpen(false); setForm(emptyForm); }} title="إضافة معاملة بنكية" onSubmit={handleSubmit} isLoading={createMut.isPending}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">نوع المعاملة</Label>
            <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v as any }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="deposit">إيداع</SelectItem>
                <SelectItem value="withdraw">سحب</SelectItem>
                <SelectItem value="deposit_customer">تحصيل عميل</SelectItem>
                <SelectItem value="withdraw_supplier">دفع مورد</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">الحساب البنكي *</Label>
            <Select value={form.bankAccountId?.toString() || ""} onValueChange={v => setForm(p => ({ ...p, bankAccountId: Number(v) }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر الحساب" /></SelectTrigger>
              <SelectContent>{bankAccounts?.map((b: any) => <SelectItem key={b.id} value={b.id.toString()}>{b.bankName} - {b.accountNumber}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">التاريخ</Label><Input type="date" value={form.date} onChange={f("date")} className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">المبلغ *</Label><Input value={form.amount} onChange={f("amount")} type="number" placeholder="0.00" className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">المرجع</Label><Input value={form.reference} onChange={f("reference")} className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">البيان</Label><Input value={form.description} onChange={f("description")} className="h-9 text-sm" /></div>
          <div className="col-span-2"><Label className="text-xs font-medium text-slate-700 mb-1.5 block">ملاحظات</Label><Textarea value={form.notes} onChange={f("notes")} className="text-sm resize-none" rows={2} /></div>
        </div>
      </FormModal>
    </ERPLayout>
  );
}
