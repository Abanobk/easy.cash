import { useState } from "react";
import { useLocation } from "wouter";
import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Briefcase } from "lucide-react";
import { AddActionButton } from "@/components/AddActionButton";
import { EntityRowActions } from "@/components/EntityRowActions";
import { toast } from "sonner";
import { FormModal } from "@/components/FormModal";
import { FieldLabel, FormSection, entryControlClass } from "@/components/form/EntryForm";
import { useLastActiveRow } from "@/hooks/useLastActiveRow";

export default function JobTitles() {
  const [location] = useLocation();
  const { lastActiveId, markActive } = useLastActiveRow(location);
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "" });

  const { data, refetch } = trpc.hr.jobTitles.list.useQuery();
  const createMut = trpc.hr.jobTitles.create.useMutation({ onSuccess: () => { toast.success("تم إضافة الوظيفة"); refetch(); setOpen(false); resetForm(); } });
  const updateMut = trpc.hr.jobTitles.update.useMutation({ onSuccess: () => { toast.success("تم تحديث الوظيفة"); refetch(); setOpen(false); resetForm(); } });
  const deleteMut = trpc.hr.jobTitles.delete.useMutation({ onSuccess: () => { toast.success("تم حذف الوظيفة"); refetch(); } });

  const resetForm = () => { setForm({ name: "" }); setEditItem(null); };

  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({ name: item.name });
    setOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return toast.error("اسم الوظيفة مطلوب");
    if (editItem) updateMut.mutate({ id: editItem.id, name: form.name });
    else createMut.mutate({ name: form.name });
  };

  return (
    <ERPLayout title="الوظائف">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Briefcase size={18} className="text-blue-600" /> قائمة الوظائف
            </CardTitle>
            <AddActionButton moduleKey="hr" entityKey="jobs" className="bg-blue-600 hover:bg-blue-700 text-white gap-2 h-10 px-4 text-sm font-semibold" onClick={() => { resetForm(); setOpen(true); }}>
              إضافة وظيفة
            </AddActionButton>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-right text-xs font-semibold text-slate-600">#</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">اسم الوظيفة</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!data || data.length === 0) && (
                <TableRow><TableCell colSpan={3} className="text-center text-slate-400 py-10">لا توجد وظائف</TableCell></TableRow>
              )}
              {data?.map((row: any, i: number) => (
                <TableRow
                  key={row.id}
                  className={`hover:bg-slate-50 ${String(row.id) === lastActiveId ? "bg-amber-50" : ""}`}
                  onClickCapture={() => markActive(row.id)}
                >
                  <TableCell className="text-xs text-slate-500">{i + 1}</TableCell>
                  <TableCell className="text-sm font-medium text-slate-800">{row.name}</TableCell>
                  <TableCell>
                    <EntityRowActions entity={{ moduleKey: "hr", entityKey: "jobs" }} onEdit={() => openEdit(row)} onDelete={() => deleteMut.mutate(row.id)} />
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
        title={editItem ? "تعديل وظيفة" : "إضافة وظيفة جديدة"}
        description="المسميات الوظيفية لربطها بالموظفين."
        onSubmit={handleSubmit}
        isLoading={createMut.isPending || updateMut.isPending}
        size="md"
        submitLabel={editItem ? "تحديث" : "إضافة"}
      >
        <FormSection title="بيانات الوظيفة" accent="violet">
          <div className="sm:col-span-2">
            <FieldLabel required>اسم الوظيفة</FieldLabel>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم الوظيفة" className={entryControlClass} />
          </div>
        </FormSection>
      </FormModal>
    </ERPLayout>
  );
}
