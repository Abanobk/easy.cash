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
  name: "", code: "", nationalId: "", departmentId: undefined as number | undefined,
  jobTitleId: undefined as number | undefined, hireDate: "", birthDate: "",
  phone: "", email: "", address: "", basicSalary: "", bankAccount: "", notes: "",
};

export default function Employees() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading, refetch } = trpc.hr.employees.list.useQuery({ page, limit: 20, search });
  const { data: departments } = trpc.hr.departments.list.useQuery();
  const { data: jobTitles } = trpc.hr.jobTitles.list.useQuery();
  const createMut = trpc.hr.employees.create.useMutation({ onSuccess: () => { toast.success("تم إضافة الموظف"); refetch(); setOpen(false); setForm(emptyForm); } });
  const updateMut = trpc.hr.employees.update.useMutation({ onSuccess: () => { toast.success("تم تحديث بيانات الموظف"); refetch(); setOpen(false); setEditId(null); setForm(emptyForm); } });
  const deleteMut = trpc.hr.employees.delete.useMutation({ onSuccess: () => { toast.success("تم حذف الموظف"); refetch(); } });

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("اسم الموظف مطلوب"); return; }
    if (editId) updateMut.mutate({ id: editId, ...form });
    else createMut.mutate(form);
  };

  const handleEdit = (row: any) => {
    setEditId(row.id);
    setForm({
      name: row.name || "", code: row.code || "", nationalId: row.nationalId || "",
      departmentId: row.departmentId, jobTitleId: row.jobTitleId,
      hireDate: row.hireDate ? row.hireDate.split("T")[0] : "",
      birthDate: row.birthDate ? row.birthDate.split("T")[0] : "",
      phone: row.phone || "", email: row.email || "", address: row.address || "",
      basicSalary: row.basicSalary || "", bankAccount: row.bankAccount || "", notes: row.notes || "",
    });
    setOpen(true);
  };

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <ERPLayout title="شئون الموظفين">
      <DataTable
        title="الموظفين"
        data={data?.rows}
        isLoading={isLoading}
        total={data?.total}
        page={page}
        onPageChange={setPage}
        search={search}
        onSearch={setSearch}
        onAdd={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}
        addLabel="موظف جديد"
        columns={[
          { key: "code", label: "الكود", className: "w-24" },
          { key: "name", label: "اسم الموظف" },
          { key: "departmentName", label: "الإدارة" },
          { key: "jobTitleName", label: "الوظيفة" },
          { key: "phone", label: "الهاتف" },
          { key: "basicSalary", label: "الراتب الأساسي", render: (row: any) => row.basicSalary ? `${Number(row.basicSalary).toLocaleString("ar-EG")} ج.م` : "-" },
          { key: "status", label: "الحالة", render: (row: any) => statusBadge(row.status || "active") },
        ]}
        actions={(row: any) => (
          <>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50" onClick={() => handleEdit(row)}><Edit size={13} /></Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={() => { if (confirm("حذف الموظف؟")) deleteMut.mutate(row.id!); }}><Trash2 size={13} /></Button>
          </>
        )}
      />

      <FormModal open={open} onClose={() => { setOpen(false); setEditId(null); setForm(emptyForm); }} title={editId ? "تعديل موظف" : "إضافة موظف جديد"} onSubmit={handleSubmit} isLoading={createMut.isPending || updateMut.isPending} size="lg">
        <div className="grid grid-cols-2 gap-4">
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">اسم الموظف *</Label><Input value={form.name} onChange={f("name")} placeholder="الاسم الكامل" className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">الكود</Label><Input value={form.code} onChange={f("code")} placeholder="كود الموظف" className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">الرقم القومي</Label><Input value={form.nationalId} onChange={f("nationalId")} className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">الهاتف</Label><Input value={form.phone} onChange={f("phone")} className="h-9 text-sm" /></div>
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">الإدارة</Label>
            <Select value={form.departmentId?.toString() || ""} onValueChange={v => setForm(p => ({ ...p, departmentId: Number(v) }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر الإدارة" /></SelectTrigger>
              <SelectContent>{departments?.map((d: any) => <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">الوظيفة</Label>
            <Select value={form.jobTitleId?.toString() || ""} onValueChange={v => setForm(p => ({ ...p, jobTitleId: Number(v) }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر الوظيفة" /></SelectTrigger>
              <SelectContent>{jobTitles?.map((j: any) => <SelectItem key={j.id} value={j.id.toString()}>{j.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">تاريخ التعيين</Label><Input type="date" value={form.hireDate} onChange={f("hireDate")} className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">تاريخ الميلاد</Label><Input type="date" value={form.birthDate} onChange={f("birthDate")} className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">الراتب الأساسي</Label><Input value={form.basicSalary} onChange={f("basicSalary")} type="number" placeholder="0.00" className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">رقم الحساب البنكي</Label><Input value={form.bankAccount} onChange={f("bankAccount")} className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">البريد الإلكتروني</Label><Input value={form.email} onChange={f("email")} className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">العنوان</Label><Input value={form.address} onChange={f("address")} className="h-9 text-sm" /></div>
          <div className="col-span-2"><Label className="text-xs font-medium text-slate-700 mb-1.5 block">ملاحظات</Label><Textarea value={form.notes} onChange={f("notes")} className="text-sm resize-none" rows={2} /></div>
        </div>
      </FormModal>
    </ERPLayout>
  );
}
