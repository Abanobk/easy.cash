import { useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import { DataTable } from "@/components/DataTable";
import { FormModal } from "@/components/FormModal";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import type { ReactElement } from "react";

type TxType = "receive" | "pay" | "receive_customer" | "pay_supplier";

const emptyForm = {
  type: "receive" as TxType,
  amount: "",
  date: new Date().toISOString().split("T")[0],
  description: "",
  customerId: undefined as number | undefined,
  supplierId: undefined as number | undefined,
};

export default function CashTransactions() {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading, refetch } = trpc.cash.list.useQuery({ page, limit: 20 });
  const { data: customers } = trpc.customers.list.useQuery({ page: 1, limit: 200 });
  const { data: suppliers } = trpc.suppliers.list.useQuery({ page: 1, limit: 200 });
  const createMut = trpc.cash.create.useMutation({
    onSuccess: () => { toast.success("تم تسجيل المعاملة"); refetch(); setOpen(false); setForm(emptyForm); },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.amount || Number(form.amount) <= 0) { toast.error("يجب إدخال مبلغ صحيح"); return; }
    createMut.mutate({
      type: form.type,
      amount: form.amount,
      date: form.date,
      description: form.description || undefined,
      customerId: form.customerId,
      supplierId: form.supplierId,
    });
  };

  const typeLabel = (type: string) => {
    const map: Record<string, { label: string; icon: ReactElement | null }> = {
      receive: { label: "قبض عام", icon: <ArrowDownCircle size={14} className="text-green-500" /> },
      pay: { label: "صرف عام", icon: <ArrowUpCircle size={14} className="text-red-500" /> },
      receive_customer: { label: "تحصيل عميل", icon: <ArrowDownCircle size={14} className="text-blue-500" /> },
      pay_supplier: { label: "دفع مورد", icon: <ArrowUpCircle size={14} className="text-orange-500" /> },
    };
    const info = map[type] || { label: type, icon: null };
    return (
      <div className="flex items-center gap-1.5">
        {info.icon}
        <span className="text-xs font-medium">{info.label}</span>
      </div>
    );
  };

  const isIncoming = (type: string) => type === "receive" || type === "receive_customer";

  return (
    <ERPLayout title="المعاملات النقدية">
      <DataTable
        title="المعاملات النقدية"
        data={data?.rows as any[]}
        isLoading={isLoading}
        total={data?.total}
        page={page}
        onPageChange={setPage}
        onAdd={() => { setForm(emptyForm); setOpen(true); }}
        addLabel="معاملة جديدة"
        columns={[
          { key: "number", label: "الرقم", className: "w-28 font-mono" },
          { key: "date", label: "التاريخ", render: (row: any) => row.date ? new Date(row.date).toLocaleDateString("ar-EG") : "-" },
          { key: "type", label: "النوع", render: (row: any) => typeLabel(row.type) },
          { key: "description", label: "البيان" },
          {
            key: "amount", label: "المبلغ",
            render: (row: any) => (
              <span className={isIncoming(row.type) ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                {isIncoming(row.type) ? "+" : "-"}{Number(row.amount).toLocaleString("ar-EG")} ج.م
              </span>
            )
          },
        ]}
      />

      <FormModal
        open={open}
        onClose={() => { setOpen(false); setForm(emptyForm); }}
        title="معاملة نقدية جديدة"
        onSubmit={handleSubmit}
        isLoading={createMut.isPending}
      >
        <div className="space-y-4">
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">نوع المعاملة</Label>
            <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v as TxType, customerId: undefined, supplierId: undefined }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="receive">قبض عام</SelectItem>
                <SelectItem value="pay">صرف عام</SelectItem>
                <SelectItem value="receive_customer">تحصيل من عميل</SelectItem>
                <SelectItem value="pay_supplier">دفع لمورد</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-medium text-slate-700 mb-1.5 block">المبلغ *</Label>
              <Input value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} type="number" placeholder="0.00" className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs font-medium text-slate-700 mb-1.5 block">التاريخ *</Label>
              <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="h-9 text-sm" />
            </div>
          </div>
          {form.type === "receive_customer" && (
            <div>
              <Label className="text-xs font-medium text-slate-700 mb-1.5 block">العميل</Label>
              <Select value={form.customerId?.toString() || ""} onValueChange={v => setForm(p => ({ ...p, customerId: Number(v) }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                <SelectContent>{customers?.rows.map((c: any) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {form.type === "pay_supplier" && (
            <div>
              <Label className="text-xs font-medium text-slate-700 mb-1.5 block">المورد</Label>
              <Select value={form.supplierId?.toString() || ""} onValueChange={v => setForm(p => ({ ...p, supplierId: Number(v) }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                <SelectContent>{suppliers?.rows.map((s: any) => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">البيان</Label>
            <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="وصف المعاملة" className="text-sm resize-none" rows={2} />
          </div>
        </div>
      </FormModal>
    </ERPLayout>
  );
}
