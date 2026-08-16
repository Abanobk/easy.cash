import { useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import { DataTable, statusBadge } from "@/components/DataTable";
import { FormModal } from "@/components/FormModal";
import { FieldLabel, FormSection, entryControlClass, entrySelectTriggerClass, entryTextareaClass } from "@/components/form/EntryForm";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

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
  const createMut = trpc.hr.employees.create.useMutation({
    onSuccess: () => { toast.success("تم إضافة الموظف"); refetch(); setOpen(false); setForm(emptyForm); },
    onError: (err) => toast.error(err.message || "فشل إضافة الموظف"),
  });
  const updateMut = trpc.hr.employees.update.useMutation({
    onSuccess: () => { toast.success("تم تحديث بيانات الموظف"); refetch(); setOpen(false); setEditId(null); setForm(emptyForm); },
    onError: (err) => toast.error(err.message || "فشل تحديث الموظف"),
  });
  const deleteMut = trpc.hr.employees.delete.useMutation({ onSuccess: () => { toast.success("تم حذف الموظف"); refetch(); } });

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("اسم الموظف مطلوب"); return; }
    const payload = {
      name: form.name.trim(),
      code: form.code.trim() || undefined,
      nationalId: form.nationalId.trim() || undefined,
      departmentId: form.departmentId,
      jobTitleId: form.jobTitleId,
      hireDate: form.hireDate.trim() || undefined,
      birthDate: form.birthDate.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
      basicSalary: form.basicSalary.trim() || undefined,
      bankAccount: form.bankAccount.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };
    if (editId) updateMut.mutate({ id: editId, ...payload });
    else createMut.mutate(payload);
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
        permissionModule="hr"
        onEdit={handleEdit}
        onDelete={(row) => deleteMut.mutate(row.id!)}
        deleteConfirm="حذف الموظف؟"
        columns={[
          { key: "code", label: "الكود", className: "w-24" },
          { key: "name", label: "اسم الموظف" },
          { key: "departmentName", label: "الإدارة" },
          { key: "jobTitleName", label: "الوظيفة" },
          { key: "phone", label: "الهاتف" },
          { key: "basicSalary", label: "الراتب الأساسي", render: (row: any) => row.basicSalary ? `${Number(row.basicSalary).toLocaleString("en-US")} ج.م` : "-" },
          { key: "status", label: "الحالة", render: (row: any) => statusBadge(row.status || "active") },
        ]}
      />

      <FormModal
        open={open}
        onClose={() => { setOpen(false); setEditId(null); setForm(emptyForm); }}
        title={editId ? "تعديل موظف" : "إضافة موظف جديد"}
        description="بيانات الموظف للرواتب والحضور والبصمة."
        onSubmit={handleSubmit}
        isLoading={createMut.isPending || updateMut.isPending}
        size="xl"
      >
        <FormSection title="البيانات الأساسية" accent="blue">
          <div>
            <FieldLabel required>اسم الموظف</FieldLabel>
            <Input value={form.name} onChange={f("name")} placeholder="الاسم الكامل" className={entryControlClass} />
          </div>
          <div>
            <FieldLabel>الكود (بصمة/موظف)</FieldLabel>
            <Input value={form.code} onChange={f("code")} placeholder="كود الموظف على الماكينة" className={entryControlClass} />
          </div>
          <div>
            <FieldLabel>الرقم القومي</FieldLabel>
            <Input value={form.nationalId} onChange={f("nationalId")} className={entryControlClass} />
          </div>
          <div>
            <FieldLabel>الهاتف</FieldLabel>
            <Input value={form.phone} onChange={f("phone")} className={entryControlClass} />
          </div>
          <div>
            <FieldLabel>الإدارة</FieldLabel>
            <Select value={form.departmentId?.toString() || ""} onValueChange={v => setForm(p => ({ ...p, departmentId: Number(v) }))}>
              <SelectTrigger className={entrySelectTriggerClass}><SelectValue placeholder="اختر الإدارة" /></SelectTrigger>
              <SelectContent>{departments?.map((d: any) => <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel>الوظيفة</FieldLabel>
            <Select value={form.jobTitleId?.toString() || ""} onValueChange={v => setForm(p => ({ ...p, jobTitleId: Number(v) }))}>
              <SelectTrigger className={entrySelectTriggerClass}><SelectValue placeholder="اختر الوظيفة" /></SelectTrigger>
              <SelectContent>{jobTitles?.map((j: any) => <SelectItem key={j.id} value={j.id.toString()}>{j.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </FormSection>

        <FormSection title="التواريخ والراتب" accent="amber">
          <div>
            <FieldLabel>تاريخ التعيين</FieldLabel>
            <Input type="date" value={form.hireDate} onChange={f("hireDate")} className={entryControlClass} />
          </div>
          <div>
            <FieldLabel>تاريخ الميلاد</FieldLabel>
            <Input type="date" value={form.birthDate} onChange={f("birthDate")} className={entryControlClass} />
          </div>
          <div>
            <FieldLabel>الراتب الأساسي</FieldLabel>
            <Input value={form.basicSalary} onChange={f("basicSalary")} type="number" placeholder="0.00" className={entryControlClass} />
          </div>
          <div>
            <FieldLabel>رقم الحساب البنكي</FieldLabel>
            <Input value={form.bankAccount} onChange={f("bankAccount")} className={entryControlClass} />
          </div>
        </FormSection>

        <FormSection title="التواصل" accent="emerald">
          <div>
            <FieldLabel>البريد الإلكتروني</FieldLabel>
            <Input value={form.email} onChange={f("email")} className={entryControlClass} />
          </div>
          <div>
            <FieldLabel>العنوان</FieldLabel>
            <Input value={form.address} onChange={f("address")} className={entryControlClass} />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel>ملاحظات</FieldLabel>
            <Textarea value={form.notes} onChange={f("notes")} className={entryTextareaClass} rows={3} />
          </div>
        </FormSection>
      </FormModal>
    </ERPLayout>
  );
}
