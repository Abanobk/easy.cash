import { useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Layers } from "lucide-react";
import { toast } from "sonner";
import { AddActionButton } from "@/components/AddActionButton";
import { EntityRowActions } from "@/components/EntityRowActions";
import { FormModal } from "@/components/FormModal";
import { FieldLabel, FormSection, entryControlClass, entrySelectTriggerClass } from "@/components/form/EntryForm";

export default function ContactCategories() {
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "", type: "both" as "customer" | "supplier" | "both" });

  const { data, refetch } = trpc.contactCategories.list.useQuery();
  const createMut = trpc.contactCategories.create.useMutation({ onSuccess: () => { toast.success("تم إضافة الفئة"); refetch(); setOpen(false); resetForm(); } });
  const updateMut = trpc.contactCategories.update.useMutation({ onSuccess: () => { toast.success("تم تحديث الفئة"); refetch(); setOpen(false); resetForm(); } });
  const deleteMut = trpc.contactCategories.delete.useMutation({ onSuccess: () => { toast.success("تم حذف الفئة"); refetch(); } });

  const resetForm = () => { setForm({ name: "", type: "both" }); setEditItem(null); };

  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({ name: item.name, type: item.type });
    setOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return toast.error("اسم الفئة مطلوب");
    if (editItem) updateMut.mutate({ id: editItem.id, ...form });
    else createMut.mutate(form);
  };

  const typeLabel = (t: string) => t === "customer" ? "عملاء" : t === "supplier" ? "موردين" : "عملاء وموردين";
  const typeBadge = (t: string) => t === "customer" ? "default" : t === "supplier" ? "secondary" : "outline";

  return (
    <ERPLayout title="فئات العملاء والموردين">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Layers size={18} className="text-blue-600" /> فئات العملاء والموردين
            </CardTitle>
            <AddActionButton moduleKey="contacts" entityKey="contactCategories" className="bg-blue-600 hover:bg-blue-700 text-white gap-2 h-10 px-4 text-sm font-semibold" onClick={() => { resetForm(); setOpen(true); }}>
              <Plus size={16} /> إضافة فئة
            </AddActionButton>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-right text-xs font-semibold text-slate-600">#</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">اسم الفئة</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">النوع</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!data || data.length === 0) && (
                <TableRow><TableCell colSpan={4} className="text-center text-slate-400 py-10">لا توجد فئات</TableCell></TableRow>
              )}
              {data?.map((row: any, i: number) => (
                <TableRow key={row.id} className="hover:bg-slate-50">
                  <TableCell className="text-xs text-slate-500">{i + 1}</TableCell>
                  <TableCell className="text-sm font-medium text-slate-800">{row.name}</TableCell>
                  <TableCell><Badge variant={typeBadge(row.type) as any} className="text-xs">{typeLabel(row.type)}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <EntityRowActions
                        entity={{ moduleKey: "contacts", entityKey: "contactCategories" }}
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
        title={editItem ? "تعديل فئة" : "إضافة فئة جديدة"}
        description="صنّف العملاء والموردين لتسهيل التقارير والفلاتر."
        onSubmit={handleSubmit}
        isLoading={createMut.isPending || updateMut.isPending}
        size="md"
        submitLabel={editItem ? "تحديث" : "إضافة"}
      >
        <FormSection title="بيانات الفئة" accent="emerald">
          <div className="sm:col-span-2">
            <FieldLabel required>اسم الفئة</FieldLabel>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم الفئة" className={entryControlClass} />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel required>النوع</FieldLabel>
            <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as any }))}>
              <SelectTrigger className={entrySelectTriggerClass}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">عملاء فقط</SelectItem>
                <SelectItem value="supplier">موردين فقط</SelectItem>
                <SelectItem value="both">عملاء وموردين</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </FormSection>
      </FormModal>
    </ERPLayout>
  );
}
