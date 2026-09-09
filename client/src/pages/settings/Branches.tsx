import { useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Building2 } from "lucide-react";
import { toast } from "sonner";
import { AddActionButton } from "@/components/AddActionButton";
import { EntityRowActions } from "@/components/EntityRowActions";
import { FormModal } from "@/components/FormModal";
import { FieldLabel, FormSection, entryControlClass } from "@/components/form/EntryForm";

export default function Branches() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "", code: "", address: "", phone: "", managerName: "" });

  const { data, refetch } = trpc.settings.branches.listWithSearch.useQuery({ search });
  const createMut = trpc.settings.branches.create.useMutation({ onSuccess: () => { toast.success("تم إضافة الفرع"); refetch(); setOpen(false); resetForm(); } });
  const updateMut = trpc.settings.branches.update.useMutation({ onSuccess: () => { toast.success("تم تحديث الفرع"); refetch(); setOpen(false); resetForm(); } });
  const deleteMut = trpc.settings.branches.delete.useMutation({ onSuccess: () => { toast.success("تم حذف الفرع"); refetch(); } });

  const resetForm = () => { setForm({ name: "", code: "", address: "", phone: "", managerName: "" }); setEditItem(null); };

  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({ name: item.name, code: item.code || "", address: item.address || "", phone: item.phone || "", managerName: item.managerName || "" });
    setOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return toast.error("اسم الفرع مطلوب");
    if (editItem) updateMut.mutate({ id: editItem.id, ...form });
    else createMut.mutate(form);
  };

  return (
    <ERPLayout title="الفروع">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Building2 size={18} className="text-blue-600" /> قائمة الفروع
            </CardTitle>
            <div className="flex gap-2">
              <div className="relative">
                <Search size={14} className="absolute right-3 top-2.5 text-slate-400" />
                <Input placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} className="pr-8 h-10 w-56 text-sm" />
              </div>
              <AddActionButton moduleKey="settings" entityKey="branches" className="bg-blue-600 hover:bg-blue-700 text-white gap-2 h-10 px-4 text-sm font-semibold" onClick={() => { resetForm(); setOpen(true); }}>
                <Plus size={16} /> إضافة فرع
              </AddActionButton>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-right text-xs font-semibold text-slate-600">#</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">اسم الفرع</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">الكود</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">المدير</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">الهاتف</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">الحالة</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.rows?.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-10">لا توجد فروع</TableCell></TableRow>
              )}
              {data?.rows?.map((row: any, i: number) => (
                <TableRow key={row.id} className="hover:bg-slate-50">
                  <TableCell className="text-xs text-slate-500">{i + 1}</TableCell>
                  <TableCell className="text-sm font-medium text-slate-800">{row.name}</TableCell>
                  <TableCell className="text-xs text-slate-500">{row.code || "-"}</TableCell>
                  <TableCell className="text-xs text-slate-600">{row.managerName || "-"}</TableCell>
                  <TableCell className="text-xs text-slate-600">{row.phone || "-"}</TableCell>
                  <TableCell><Badge variant={row.isActive ? "default" : "secondary"} className="text-xs">{row.isActive ? "نشط" : "غير نشط"}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <EntityRowActions
                        entity={{ moduleKey: "settings", entityKey: "branches" }}
                        onEdit={() => openEdit(row)}
                        onDelete={() => deleteMut.mutate(row.id)}
                      />
                    </div>
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
        title={editItem ? "تعديل فرع" : "إضافة فرع جديد"}
        description="الفروع تُستخدم في العملاء والموردين والمستندات."
        onSubmit={handleSubmit}
        isLoading={createMut.isPending || updateMut.isPending}
        size="lg"
        submitLabel={editItem ? "تحديث" : "إضافة"}
      >
        <FormSection title="بيانات الفرع" accent="slate">
          <div>
            <FieldLabel required>اسم الفرع</FieldLabel>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم الفرع" className={entryControlClass} />
          </div>
          <div>
            <FieldLabel>الكود</FieldLabel>
            <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="كود الفرع" className={entryControlClass} />
          </div>
          <div>
            <FieldLabel>اسم المدير</FieldLabel>
            <Input value={form.managerName} onChange={e => setForm(f => ({ ...f, managerName: e.target.value }))} placeholder="اسم المدير" className={entryControlClass} />
          </div>
          <div>
            <FieldLabel>الهاتف</FieldLabel>
            <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="رقم الهاتف" className={entryControlClass} />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel>العنوان</FieldLabel>
            <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="عنوان الفرع" className={entryControlClass} />
          </div>
        </FormSection>
      </FormModal>
    </ERPLayout>
  );
}
