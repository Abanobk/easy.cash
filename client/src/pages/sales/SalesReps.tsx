import { useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, UserCheck, Search } from "lucide-react";
import { toast } from "sonner";
import { AddActionButton } from "@/components/AddActionButton";
import { EntityRowActions } from "@/components/EntityRowActions";
import { FormModal } from "@/components/FormModal";
import { FieldLabel, FormSection, entryControlClass } from "@/components/form/EntryForm";

const emptyForm = { name: "", phone: "", email: "", commissionRate: "0", address: "", notes: "" };

export default function SalesReps() {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [search, setSearch] = useState("");

  const { data, refetch } = trpc.salesReps.list.useQuery();
  const createMut = trpc.salesReps.create.useMutation({
    onSuccess: () => { toast.success("تم إضافة المندوب"); refetch(); setOpen(false); setForm({ ...emptyForm }); },
    onError: (err) => toast.error(err.message || "فشل إضافة المندوب"),
  });
  const updateMut = trpc.salesReps.update.useMutation({
    onSuccess: () => { toast.success("تم تحديث المندوب"); refetch(); setOpen(false); setEditId(null); setForm({ ...emptyForm }); },
    onError: (err) => toast.error(err.message || "فشل تحديث المندوب"),
  });
  const deleteMut = trpc.salesReps.delete.useMutation({ onSuccess: () => { toast.success("تم حذف المندوب"); refetch(); } });

  const handleSubmit = () => {
    if (!form.name.trim()) return toast.error("اسم المندوب مطلوب");
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      commissionRate: form.commissionRate.trim() || undefined,
      address: form.address.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };
    if (editId) {
      updateMut.mutate({ id: editId, ...payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const handleEdit = (row: any) => {
    setEditId(row.id);
    setForm({ name: row.name || "", phone: row.phone || "", email: row.email || "", commissionRate: row.commissionRate || "0", address: row.address || "", notes: row.notes || "" });
    setOpen(true);
  };

  const filtered = (data as any[] || []).filter((r: any) =>
    !search || r.name?.toLowerCase().includes(search.toLowerCase()) || r.phone?.includes(search)
  );

  return (
    <ERPLayout title="مندوبي البيع">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <UserCheck size={18} className="text-blue-600" /> مندوبي البيع
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..." className="h-8 text-sm pr-7 w-48" />
              </div>
              <AddActionButton moduleKey="sales_reps" entityKey="salesReps" className="bg-blue-600 hover:bg-blue-700 text-white gap-2 h-10 px-4 text-sm font-semibold" onClick={() => { setEditId(null); setForm({ ...emptyForm }); setOpen(true); }}>
                <Plus size={16} /> مندوب جديد
              </AddActionButton>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-right text-xs font-semibold text-slate-600">#</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">الاسم</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">الهاتف</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">البريد الإلكتروني</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">نسبة العمولة %</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">الحالة</TableHead>
                <TableHead className="text-right text-xs font-semibold text-slate-600">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-10">لا يوجد مندوبين</TableCell></TableRow>
              )}
              {filtered.map((row: any, i: number) => (
                <TableRow key={row.id} className="hover:bg-slate-50">
                  <TableCell className="text-xs text-slate-500">{i + 1}</TableCell>
                  <TableCell className="text-sm font-medium text-slate-800">{row.name}</TableCell>
                  <TableCell className="text-sm text-slate-600">{row.phone || "-"}</TableCell>
                  <TableCell className="text-sm text-slate-600">{row.email || "-"}</TableCell>
                  <TableCell className="text-sm font-semibold text-blue-700">{row.commissionRate || "0"}%</TableCell>
                  <TableCell><Badge variant={row.isActive ? "default" : "secondary"} className="text-xs">{row.isActive ? "نشط" : "غير نشط"}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <EntityRowActions
                        entity={{ moduleKey: "sales_reps", entityKey: "salesReps" }}
                        onEdit={() => handleEdit(row)}
                        onDelete={() => deleteMut.mutate(row.id)}
                        deleteConfirm="هل تريد حذف هذا المندوب؟"
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
        onClose={() => { setOpen(false); setEditId(null); setForm({ ...emptyForm }); }}
        title={editId ? "تعديل مندوب" : "مندوب بيع جديد"}
        description="نسبة العمولة الافتراضية تُستخدم عند ربط المندوب بعميل جديد ويمكن تخصيصها لكل عميل."
        onSubmit={handleSubmit}
        isLoading={createMut.isPending || updateMut.isPending}
        size="lg"
        submitLabel={editId ? "تحديث" : "حفظ"}
      >
        <FormSection title="بيانات المندوب" accent="blue">
          <div>
            <FieldLabel required>الاسم</FieldLabel>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={entryControlClass} placeholder="اسم المندوب" />
          </div>
          <div>
            <FieldLabel>الهاتف</FieldLabel>
            <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={entryControlClass} placeholder="رقم الهاتف" />
          </div>
          <div>
            <FieldLabel>البريد الإلكتروني</FieldLabel>
            <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={entryControlClass} placeholder="example@email.com" />
          </div>
          <div>
            <FieldLabel>نسبة العمولة %</FieldLabel>
            <Input type="number" value={form.commissionRate} onChange={e => setForm(f => ({ ...f, commissionRate: e.target.value }))} className={entryControlClass} min="0" max="100" step="0.0001" inputMode="decimal" placeholder="مثال: 0.0625" />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel>العنوان</FieldLabel>
            <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className={entryControlClass} placeholder="العنوان" />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel>ملاحظات</FieldLabel>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={entryControlClass} placeholder="ملاحظات إضافية" />
          </div>
        </FormSection>
      </FormModal>
    </ERPLayout>
  );
}
