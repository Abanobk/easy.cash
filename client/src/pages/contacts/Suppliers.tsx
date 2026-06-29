import { useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import { DataTable, statusBadge } from "@/components/DataTable";
import { FormModal } from "@/components/FormModal";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Edit, Trash2 } from "lucide-react";

const emptyForm = {
  name: "", code: "", phone: "", phone2: "", email: "",
  address: "", city: "", taxNumber: "", notes: "",
};

export default function Suppliers() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading, refetch } = trpc.suppliers.list.useQuery({ page, limit: 20, search });
  const createMut = trpc.suppliers.create.useMutation({ onSuccess: () => { toast.success("تم إضافة المورد"); refetch(); setOpen(false); setForm(emptyForm); } });
  const updateMut = trpc.suppliers.update.useMutation({ onSuccess: () => { toast.success("تم تحديث المورد"); refetch(); setOpen(false); setEditId(null); setForm(emptyForm); } });
  const deleteMut = trpc.suppliers.delete.useMutation({ onSuccess: () => { toast.success("تم حذف المورد"); refetch(); } });

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("اسم المورد مطلوب"); return; }
    if (editId) updateMut.mutate({ id: editId, ...form });
    else createMut.mutate(form);
  };

  const handleEdit = (row: any) => {
    setEditId(row.id);
    setForm({ name: row.name || "", code: row.code || "", phone: row.phone || "", phone2: row.phone2 || "", email: row.email || "", address: row.address || "", city: row.city || "", taxNumber: row.taxNumber || "", notes: row.notes || "" });
    setOpen(true);
  };

  const f = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <ERPLayout title="قائمة الموردين">
      <DataTable
        title="الموردين"
        data={data?.rows}
        isLoading={isLoading}
        total={data?.total}
        page={page}
        onPageChange={setPage}
        search={search}
        onSearch={setSearch}
        onAdd={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}
        addLabel="مورد جديد"
        columns={[
          { key: "code", label: "الكود", className: "w-24" },
          { key: "name", label: "اسم المورد" },
          { key: "phone", label: "الهاتف" },
          { key: "city", label: "المدينة" },
          { key: "balance", label: "الرصيد", render: row => <span>{Number(row.balance).toLocaleString("ar-EG")} ج.م</span> },
          { key: "isActive", label: "الحالة", render: row => statusBadge(row.isActive ? "active" : "inactive") },
        ]}
        actions={row => (
          <>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50" onClick={() => handleEdit(row)}><Edit size={13} /></Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={() => { if (confirm("حذف المورد؟")) deleteMut.mutate(row.id!); }}><Trash2 size={13} /></Button>
          </>
        )}
      />
      <FormModal open={open} onClose={() => { setOpen(false); setEditId(null); setForm(emptyForm); }} title={editId ? "تعديل مورد" : "إضافة مورد جديد"} onSubmit={handleSubmit} isLoading={createMut.isPending || updateMut.isPending}>
        <div className="grid grid-cols-2 gap-4">
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">اسم المورد *</Label><Input value={form.name} onChange={f("name")} placeholder="اسم المورد" className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">الكود</Label><Input value={form.code} onChange={f("code")} placeholder="كود المورد" className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">الهاتف</Label><Input value={form.phone} onChange={f("phone")} placeholder="رقم الهاتف" className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">هاتف 2</Label><Input value={form.phone2} onChange={f("phone2")} placeholder="رقم إضافي" className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">البريد الإلكتروني</Label><Input value={form.email} onChange={f("email")} className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">المدينة</Label><Input value={form.city} onChange={f("city")} className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">الرقم الضريبي</Label><Input value={form.taxNumber} onChange={f("taxNumber")} className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">العنوان</Label><Input value={form.address} onChange={f("address")} className="h-9 text-sm" /></div>
          <div className="col-span-2"><Label className="text-xs font-medium text-slate-700 mb-1.5 block">ملاحظات</Label><Textarea value={form.notes} onChange={f("notes")} className="text-sm resize-none" rows={2} /></div>
        </div>
      </FormModal>
    </ERPLayout>
  );
}
