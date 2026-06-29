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
  type: "received" as "given" | "received",
  partyName: "", amount: "", interestRate: "",
  startDate: new Date().toISOString().split("T")[0],
  endDate: "", notes: "",
};

export default function Loans() {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading, refetch } = trpc.loans.list.useQuery({ page, limit: 20 });
  const createMut = trpc.loans.create.useMutation({
    onSuccess: () => { toast.success("تم إضافة القرض"); refetch(); setOpen(false); setForm(emptyForm); },
    onError: (e) => toast.error(e.message),
  });

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <ERPLayout title="القروض">
      <DataTable
        title="القروض"
        data={data?.rows}
        isLoading={isLoading}
        total={data?.total}
        page={page}
        onPageChange={setPage}
        onAdd={() => { setForm(emptyForm); setOpen(true); }}
        addLabel="قرض جديد"
        columns={[
          { key: "number", label: "الرقم", className: "w-28" },
          { key: "type", label: "النوع", render: (row: any) => (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${row.type === "received" ? "text-blue-600 bg-blue-100" : "text-green-600 bg-green-100"}`}>
              {row.type === "received" ? "قرض مستلم" : "قرض ممنوح"}
            </span>
          )},
          { key: "partyName", label: "الجهة" },
          { key: "amount", label: "المبلغ", render: (row: any) => `${Number(row.amount).toLocaleString("ar-EG")} ج.م` },
          { key: "interestRate", label: "نسبة الفائدة", render: (row: any) => row.interestRate ? `${row.interestRate}%` : "-" },
          { key: "startDate", label: "تاريخ البداية", render: (row: any) => row.startDate ? new Date(row.startDate).toLocaleDateString("ar-EG") : "-" },
          { key: "endDate", label: "تاريخ الانتهاء", render: (row: any) => row.endDate ? new Date(row.endDate).toLocaleDateString("ar-EG") : "-" },
        ]}
      />

      <FormModal open={open} onClose={() => { setOpen(false); setForm(emptyForm); }} title="إضافة قرض" onSubmit={() => { if (!form.partyName.trim() || !form.amount) { toast.error("الجهة والمبلغ مطلوبان"); return; } createMut.mutate(form); }} isLoading={createMut.isPending}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">نوع القرض</Label>
            <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v as any }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="received">قرض مستلم</SelectItem>
                <SelectItem value="given">قرض ممنوح</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">الجهة *</Label><Input value={form.partyName} onChange={f("partyName")} placeholder="اسم الجهة أو الشخص" className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">المبلغ *</Label><Input value={form.amount} onChange={f("amount")} type="number" placeholder="0.00" className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">نسبة الفائدة (%)</Label><Input value={form.interestRate} onChange={f("interestRate")} type="number" placeholder="0" className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">تاريخ البداية</Label><Input type="date" value={form.startDate} onChange={f("startDate")} className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">تاريخ الانتهاء</Label><Input type="date" value={form.endDate} onChange={f("endDate")} className="h-9 text-sm" /></div>
          <div className="col-span-2"><Label className="text-xs font-medium text-slate-700 mb-1.5 block">ملاحظات</Label><Textarea value={form.notes} onChange={f("notes")} className="text-sm resize-none" rows={2} /></div>
        </div>
      </FormModal>
    </ERPLayout>
  );
}
