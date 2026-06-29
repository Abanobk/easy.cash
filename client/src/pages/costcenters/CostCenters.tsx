import { useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import { DataTable } from "@/components/DataTable";
import { FormModal } from "@/components/FormModal";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const emptyForm = { name: "", code: "", description: "" };

export default function CostCenters() {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: allData, isLoading, refetch } = trpc.costCenters.list.useQuery();
  const data = { rows: allData || [], total: allData?.length || 0 };
  const createMut = trpc.costCenters.create.useMutation({
    onSuccess: () => { toast.success("تم إضافة مركز التكلفة"); refetch(); setOpen(false); setForm(emptyForm); },
    onError: (e) => toast.error(e.message),
  });

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <ERPLayout title="مراكز التكلفة">
      <DataTable
        title="مراكز التكلفة"
        data={data.rows}
        isLoading={isLoading}
        total={data.total}
        page={page}
        onPageChange={setPage}
        onAdd={() => { setForm(emptyForm); setOpen(true); }}
        addLabel="مركز تكلفة جديد"
        columns={[
          { key: "code", label: "الكود", className: "w-24" },
          { key: "name", label: "اسم مركز التكلفة" },
          { key: "description", label: "الوصف" },
          { key: "totalExpenses", label: "إجمالي المصروفات", render: (row: any) => `${Number(row.totalExpenses || 0).toLocaleString("ar-EG")} ج.م` },
        ]}
      />

      <FormModal open={open} onClose={() => { setOpen(false); setForm(emptyForm); }} title="إضافة مركز تكلفة" onSubmit={() => { if (!form.name.trim()) { toast.error("اسم مركز التكلفة مطلوب"); return; } createMut.mutate(form); }} isLoading={createMut.isPending}>
        <div className="grid grid-cols-2 gap-4">
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">اسم مركز التكلفة *</Label><Input value={form.name} onChange={f("name")} className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">الكود</Label><Input value={form.code} onChange={f("code")} className="h-9 text-sm" /></div>
          <div className="col-span-2"><Label className="text-xs font-medium text-slate-700 mb-1.5 block">الوصف</Label><Textarea value={form.description} onChange={f("description")} className="text-sm resize-none" rows={2} /></div>
        </div>
      </FormModal>
    </ERPLayout>
  );
}
