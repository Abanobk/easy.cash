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

const emptyForm = {
  type: "incoming" as "incoming" | "outgoing",
  checkNumber: "", bankName: "", amount: "",
  date: new Date().toISOString().split("T")[0],
  issueDate: new Date().toISOString().split("T")[0],
  dueDate: "", partyName: "", notes: "",
};

export default function Checks() {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading, refetch } = trpc.bank.checks.list.useQuery({ page, limit: 20 });
  const createMut = trpc.bank.checks.create.useMutation({
    onSuccess: () => { toast.success("تم إضافة الشيك"); refetch(); setOpen(false); setForm(emptyForm); },
    onError: (e) => toast.error(e.message),
  });

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      pending: { label: "معلق", color: "text-orange-600 bg-orange-100" },
      cleared: { label: "محصّل", color: "text-green-600 bg-green-100" },
      bounced: { label: "مرتجع", color: "text-red-600 bg-red-100" },
      cancelled: { label: "ملغي", color: "text-slate-600 bg-slate-100" },
    };
    const info = map[status] || { label: status, color: "text-slate-600 bg-slate-100" };
    return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${info.color}`}>{info.label}</span>;
  };

  return (
    <ERPLayout title="الشيكات">
      <DataTable
        title="الشيكات"
        data={data?.rows}
        isLoading={isLoading}
        total={data?.total}
        page={page}
        onPageChange={setPage}
        onAdd={() => { setForm(emptyForm); setOpen(true); }}
        addLabel="شيك جديد"
        columns={[
          { key: "checkNumber", label: "رقم الشيك", className: "w-32" },
          { key: "type", label: "النوع", render: (row: any) => (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${row.type === "incoming" ? "text-blue-600 bg-blue-100" : "text-purple-600 bg-purple-100"}`}>
              {row.type === "incoming" ? "وارد" : "صادر"}
            </span>
          )},
          { key: "bankName", label: "البنك" },
          { key: "partyName", label: "الجهة" },
          { key: "amount", label: "المبلغ", render: (row: any) => `${Number(row.amount).toLocaleString("ar-EG")} ج.م` },
          { key: "issueDate", label: "تاريخ الإصدار", render: (row: any) => row.issueDate ? new Date(row.issueDate).toLocaleDateString("ar-EG") : "-" },
          { key: "dueDate", label: "تاريخ الاستحقاق", render: (row: any) => row.dueDate ? new Date(row.dueDate).toLocaleDateString("ar-EG") : "-" },
          { key: "status", label: "الحالة", render: (row: any) => statusBadge(row.status) },
        ]}
      />

      <FormModal open={open} onClose={() => { setOpen(false); setForm(emptyForm); }} title="إضافة شيك" onSubmit={() => { if (!form.checkNumber || !form.amount) { toast.error("رقم الشيك والمبلغ مطلوبان"); return; } createMut.mutate({ ...form, date: form.issueDate }); }} isLoading={createMut.isPending}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">نوع الشيك</Label>
            <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v as any }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="incoming">وارد</SelectItem>
                <SelectItem value="outgoing">صادر</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">رقم الشيك *</Label><Input value={form.checkNumber} onChange={f("checkNumber")} className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">اسم البنك</Label><Input value={form.bankName} onChange={f("bankName")} className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">الجهة</Label><Input value={form.partyName} onChange={f("partyName")} className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">المبلغ *</Label><Input value={form.amount} onChange={f("amount")} type="number" placeholder="0.00" className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">تاريخ الإصدار</Label><Input type="date" value={form.issueDate} onChange={f("issueDate")} className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">تاريخ الاستحقاق</Label><Input type="date" value={form.dueDate} onChange={f("dueDate")} className="h-9 text-sm" /></div>
          <div className="col-span-2"><Label className="text-xs font-medium text-slate-700 mb-1.5 block">ملاحظات</Label><Textarea value={form.notes} onChange={f("notes")} className="text-sm resize-none" rows={2} /></div>
        </div>
      </FormModal>
    </ERPLayout>
  );
}
