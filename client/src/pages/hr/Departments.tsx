import { useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building2 } from "lucide-react";
import { AddActionButton } from "@/components/AddActionButton";
import { EntityRowActions } from "@/components/EntityRowActions";
import { toast } from "sonner";
import { FormModal } from "@/components/FormModal";
import { FieldLabel, FormSection, entryControlClass } from "@/components/form/EntryForm";

export default function Departments() {
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "", description: "" });

  const { data, refetch } = trpc.hr.departments.list.useQuery();
  const createMut = trpc.hr.departments.create.useMutation({ onSuccess: () => { toast.success("تم إضافة الإدارة"); refetch(); setOpen(false); resetForm(); } });
  const updateMut = trpc.hr.departments.update.useMutation({ onSuccess: () => { toast.success("تم تحديث الإدارة"); refetch(); setOpen(false); resetForm(); } });
  const deleteMut = trpc.hr.departments.delete.useMutation({ onSuccess: () => { toast.success("تم حذف الإدارة"); refetch(); } });

  const resetForm = () => { setForm({ name: "", description: "" }); setEditItem(null); };

  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({ name: item.name, description: item.description || "" });
    setOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return toast.error("اسم الإدارة مطلوب");
    if (editItem) updateMut.mutate({ id: editItem.id, ...form });
    else createMut.mutate(form);
  };

  return (
    <ERPLayout title="الإدارات">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Building2 size={18} className="text-blue-600" /> قائمة الإدارات
            </CardTitle>
            <AddActionButton module="hr" className="bg-blue-600 hover:bg-blue-700 text-white gap-2 h-10 px-4 text-sm font-semibold" onClick={() => { resetForm(); setOpen(true); }}>
              إضافة إدارة
            </AddActionButton>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-right text-xs font-semibold text-slate-600">#</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">اسم الإدارة</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">الوصف</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!data || data.length === 0) && (
                <TableRow><TableCell colSpan={4} className="text-center text-slate-400 py-10">لا توجد إدارات</TableCell></TableRow>
              )}
              {data?.map((row: any, i: number) => (
                <TableRow key={row.id} className="hover:bg-slate-50">
                  <TableCell className="text-xs text-slate-500">{i + 1}</TableCell>
                  <TableCell className="text-sm font-medium text-slate-800">{row.name}</TableCell>
                  <TableCell className="text-xs text-slate-500">{row.description || "-"}</TableCell>
                  <TableCell>
                    <EntityRowActions
                      module="hr"
                      onEdit={() => openEdit(row)}
                      onDelete={() => deleteMut.mutate(row.id)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <FormModal
        open={open}
        onClose={() => { setOpen(false); resetForm(); }}
        title={editItem ? "تعديل إدارة" : "إضافة إدارة جديدة"}
        description="الإدارات لتنظيم الموظفين والتقارير."
        onSubmit={handleSubmit}
        isLoading={createMut.isPending || updateMut.isPending}
        size="md"
        submitLabel={editItem ? "تحديث" : "إضافة"}
      >
        <FormSection title="بيانات الإدارة" accent="blue">
          <div className="sm:col-span-2">
            <FieldLabel required>اسم الإدارة</FieldLabel>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم الإدارة" className={entryControlClass} />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel>الوصف</FieldLabel>
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="وصف الإدارة" className={entryControlClass} />
          </div>
        </FormSection>
      </FormModal>
    </ERPLayout>
  );
}
