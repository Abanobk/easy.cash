import { useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import { DataTable } from "@/components/DataTable";
import { FormModal } from "@/components/FormModal";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const emptyForm = {
  name: "", code: "", category: "", purchaseDate: "", purchasePrice: "",
  depreciationRate: "", location: "", notes: "",
};

export default function FixedAssets() {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading, refetch } = trpc.assets.list.useQuery({ page, limit: 20 });
  const createMut = trpc.assets.create.useMutation({
    onSuccess: () => { toast.success("تم إضافة الأصل"); refetch(); setOpen(false); setForm(emptyForm); },
    onError: (e) => toast.error(e.message),
  });

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <ERPLayout title="الأصول الثابتة">
      <DataTable
        title="الأصول الثابتة"
        data={data?.rows}
        isLoading={isLoading}
        total={data?.total}
        page={page}
        onPageChange={setPage}
        onAdd={() => { setForm(emptyForm); setOpen(true); }}
        addLabel="أصل جديد"
        columns={[
          { key: "code", label: "الكود", className: "w-24" },
          { key: "name", label: "اسم الأصل" },
          { key: "category", label: "الفئة" },
          { key: "purchaseDate", label: "تاريخ الشراء", render: (row: any) => row.purchaseDate ? new Date(row.purchaseDate).toLocaleDateString("ar-EG") : "-" },
          { key: "purchasePrice", label: "سعر الشراء", render: (row: any) => row.purchasePrice ? `${Number(row.purchasePrice).toLocaleString("ar-EG")} ج.م` : "-" },
          { key: "currentValue", label: "القيمة الحالية", render: (row: any) => row.currentValue ? `${Number(row.currentValue).toLocaleString("ar-EG")} ج.م` : "-" },
          { key: "depreciationRate", label: "نسبة الإهلاك", render: (row: any) => row.depreciationRate ? `${row.depreciationRate}%` : "-" },
          { key: "location", label: "الموقع" },
        ]}
      />

      <FormModal open={open} onClose={() => { setOpen(false); setForm(emptyForm); }} title="إضافة أصل ثابت" onSubmit={() => { if (!form.name.trim()) { toast.error("اسم الأصل مطلوب"); return; } createMut.mutate(form); }} isLoading={createMut.isPending}>
        <div className="grid grid-cols-2 gap-4">
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">اسم الأصل *</Label><Input value={form.name} onChange={f("name")} className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">الكود</Label><Input value={form.code} onChange={f("code")} className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">الفئة</Label><Input value={form.category} onChange={f("category")} placeholder="مثال: معدات، مركبات" className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">الموقع</Label><Input value={form.location} onChange={f("location")} className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">تاريخ الشراء</Label><Input type="date" value={form.purchaseDate} onChange={f("purchaseDate")} className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">سعر الشراء</Label><Input value={form.purchasePrice} onChange={f("purchasePrice")} type="number" placeholder="0.00" className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">نسبة الإهلاك السنوي (%)</Label><Input value={form.depreciationRate} onChange={f("depreciationRate")} type="number" placeholder="0" className="h-9 text-sm" /></div>
          <div className="col-span-2"><Label className="text-xs font-medium text-slate-700 mb-1.5 block">ملاحظات</Label><Textarea value={form.notes} onChange={f("notes")} className="text-sm resize-none" rows={2} /></div>
        </div>
      </FormModal>
    </ERPLayout>
  );
}
