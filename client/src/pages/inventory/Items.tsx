import { useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import { DataTable, statusBadge } from "@/components/DataTable";
import { FormModal } from "@/components/FormModal";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Edit, Trash2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const emptyForm = {
  name: "", code: "", barcode: "", categoryId: undefined as number | undefined,
  unit: "قطعة", purchasePrice: "", salePrice: "", minStock: "", taxRate: "", description: "",
};

export default function Items() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading, refetch } = trpc.items.list.useQuery({ page, limit: 20, search });
  const { data: categories } = trpc.items.categories.useQuery();
  const createMut = trpc.items.create.useMutation({ onSuccess: () => { toast.success("تم إضافة الصنف"); refetch(); setOpen(false); setForm(emptyForm); } });
  const updateMut = trpc.items.update.useMutation({ onSuccess: () => { toast.success("تم تحديث الصنف"); refetch(); setOpen(false); setEditId(null); setForm(emptyForm); } });
  const deleteMut = trpc.items.delete.useMutation({ onSuccess: () => { toast.success("تم حذف الصنف"); refetch(); } });

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("اسم الصنف مطلوب"); return; }
    if (editId) updateMut.mutate({ id: editId, ...form });
    else createMut.mutate(form);
  };

  const handleEdit = (row: any) => {
    setEditId(row.id);
    setForm({
      name: row.name || "", code: row.code || "", barcode: row.barcode || "",
      categoryId: row.categoryId, unit: row.unit || "قطعة",
      purchasePrice: row.purchasePrice || "", salePrice: row.salePrice || "",
      minStock: row.minStock || "", taxRate: row.taxRate || "", description: row.description || "",
    });
    setOpen(true);
  };

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <ERPLayout title="قائمة الأصناف">
      <DataTable
        title="الأصناف"
        data={data?.rows}
        isLoading={isLoading}
        total={data?.total}
        page={page}
        onPageChange={setPage}
        search={search}
        onSearch={setSearch}
        onAdd={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}
        addLabel="صنف جديد"
        columns={[
          { key: "code", label: "الكود", className: "w-28" },
          { key: "name", label: "اسم الصنف" },
          { key: "unit", label: "الوحدة", className: "w-20" },
          { key: "purchasePrice", label: "سعر الشراء", render: row => `${Number(row.purchasePrice).toLocaleString("ar-EG")} ج.م` },
          { key: "salePrice", label: "سعر البيع", render: row => `${Number(row.salePrice).toLocaleString("ar-EG")} ج.م` },
          {
            key: "currentStock", label: "المخزون",
            render: row => (
              <div className="flex items-center gap-1">
                <span className={Number(row.currentStock) <= Number(row.minStock) && Number(row.minStock) > 0 ? "text-red-600 font-semibold" : "text-slate-700"}>
                  {Number(row.currentStock).toLocaleString("ar-EG")}
                </span>
                {Number(row.currentStock) <= Number(row.minStock) && Number(row.minStock) > 0 && (
                  <AlertTriangle size={12} className="text-red-500" />
                )}
              </div>
            )
          },
          { key: "isActive", label: "الحالة", render: row => statusBadge(row.isActive ? "active" : "inactive") },
        ]}
        actions={row => (
          <>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50" onClick={() => handleEdit(row)}><Edit size={13} /></Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={() => { if (confirm("حذف الصنف؟")) deleteMut.mutate(row.id!); }}><Trash2 size={13} /></Button>
          </>
        )}
      />

      <FormModal open={open} onClose={() => { setOpen(false); setEditId(null); setForm(emptyForm); }} title={editId ? "تعديل صنف" : "إضافة صنف جديد"} onSubmit={handleSubmit} isLoading={createMut.isPending || updateMut.isPending} size="lg">
        <div className="grid grid-cols-2 gap-4">
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">اسم الصنف *</Label><Input value={form.name} onChange={f("name")} placeholder="اسم الصنف" className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">الكود</Label><Input value={form.code} onChange={f("code")} placeholder="كود الصنف" className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">الباركود</Label><Input value={form.barcode} onChange={f("barcode")} placeholder="الباركود" className="h-9 text-sm" /></div>
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">الفئة</Label>
            <Select value={form.categoryId?.toString() || ""} onValueChange={v => setForm(prev => ({ ...prev, categoryId: v ? Number(v) : undefined }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر الفئة" /></SelectTrigger>
              <SelectContent>
                {categories?.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">وحدة القياس</Label><Input value={form.unit} onChange={f("unit")} placeholder="قطعة" className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">الحد الأدنى للمخزون</Label><Input value={form.minStock} onChange={f("minStock")} type="number" placeholder="0" className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">سعر الشراء</Label><Input value={form.purchasePrice} onChange={f("purchasePrice")} type="number" placeholder="0.00" className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">سعر البيع</Label><Input value={form.salePrice} onChange={f("salePrice")} type="number" placeholder="0.00" className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">نسبة الضريبة %</Label><Input value={form.taxRate} onChange={f("taxRate")} type="number" placeholder="0" className="h-9 text-sm" /></div>
          <div className="col-span-2"><Label className="text-xs font-medium text-slate-700 mb-1.5 block">الوصف</Label><Textarea value={form.description} onChange={f("description")} className="text-sm resize-none" rows={2} /></div>
        </div>
      </FormModal>
    </ERPLayout>
  );
}
