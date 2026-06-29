import { useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import { DataTable, statusBadge } from "@/components/DataTable";
import { FormModal } from "@/components/FormModal";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Edit, Trash2, Eye } from "lucide-react";

const emptyForm = {
  name: "", code: "", phone: "", phone2: "", email: "",
  address: "", city: "", taxNumber: "", creditLimit: "", notes: "",
};

export default function Customers() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading, refetch } = trpc.customers.list.useQuery({ page, limit: 20, search });
  const createMut = trpc.customers.create.useMutation({ onSuccess: () => { toast.success("تم إضافة العميل"); refetch(); setOpen(false); setForm(emptyForm); } });
  const updateMut = trpc.customers.update.useMutation({ onSuccess: () => { toast.success("تم تحديث العميل"); refetch(); setOpen(false); setEditId(null); setForm(emptyForm); } });
  const deleteMut = trpc.customers.delete.useMutation({ onSuccess: () => { toast.success("تم حذف العميل"); refetch(); } });

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("اسم العميل مطلوب"); return; }
    if (editId) {
      updateMut.mutate({ id: editId, ...form });
    } else {
      createMut.mutate(form);
    }
  };

  const handleEdit = (row: any) => {
    setEditId(row.id);
    setForm({
      name: row.name || "", code: row.code || "", phone: row.phone || "",
      phone2: row.phone2 || "", email: row.email || "", address: row.address || "",
      city: row.city || "", taxNumber: row.taxNumber || "",
      creditLimit: row.creditLimit || "", notes: row.notes || "",
    });
    setOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("هل أنت متأكد من حذف هذا العميل؟")) {
      deleteMut.mutate(id);
    }
  };

  const f = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <ERPLayout title="قائمة العملاء">
      <DataTable
        title="العملاء"
        data={data?.rows}
        isLoading={isLoading}
        total={data?.total}
        page={page}
        onPageChange={setPage}
        search={search}
        onSearch={setSearch}
        onAdd={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}
        addLabel="عميل جديد"
        columns={[
          { key: "code", label: "الكود", className: "w-24" },
          { key: "name", label: "اسم العميل" },
          { key: "phone", label: "الهاتف" },
          { key: "city", label: "المدينة" },
          { key: "balance", label: "الرصيد", render: row => <span className={Number(row.balance) < 0 ? "text-red-600 font-semibold" : "text-slate-700"}>{Number(row.balance).toLocaleString("ar-EG")} ج.م</span> },
          { key: "isActive", label: "الحالة", render: row => statusBadge(row.isActive ? "active" : "inactive") },
        ]}
        actions={row => (
          <>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50" onClick={() => handleEdit(row)}>
              <Edit size={13} />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={() => handleDelete(row.id!)}>
              <Trash2 size={13} />
            </Button>
          </>
        )}
      />

      <FormModal
        open={open}
        onClose={() => { setOpen(false); setEditId(null); setForm(emptyForm); }}
        title={editId ? "تعديل عميل" : "إضافة عميل جديد"}
        onSubmit={handleSubmit}
        isLoading={createMut.isPending || updateMut.isPending}
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">اسم العميل *</Label>
            <Input value={form.name} onChange={f("name")} placeholder="اسم العميل" className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">الكود</Label>
            <Input value={form.code} onChange={f("code")} placeholder="كود العميل" className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">الهاتف</Label>
            <Input value={form.phone} onChange={f("phone")} placeholder="رقم الهاتف" className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">هاتف 2</Label>
            <Input value={form.phone2} onChange={f("phone2")} placeholder="رقم هاتف إضافي" className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">البريد الإلكتروني</Label>
            <Input value={form.email} onChange={f("email")} placeholder="البريد الإلكتروني" className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">المدينة</Label>
            <Input value={form.city} onChange={f("city")} placeholder="المدينة" className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">الرقم الضريبي</Label>
            <Input value={form.taxNumber} onChange={f("taxNumber")} placeholder="الرقم الضريبي" className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">حد الائتمان</Label>
            <Input value={form.creditLimit} onChange={f("creditLimit")} placeholder="0" type="number" className="h-9 text-sm" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">العنوان</Label>
            <Input value={form.address} onChange={f("address")} placeholder="العنوان" className="h-9 text-sm" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">ملاحظات</Label>
            <Textarea value={form.notes} onChange={f("notes")} placeholder="ملاحظات" className="text-sm resize-none" rows={2} />
          </div>
        </div>
      </FormModal>
    </ERPLayout>
  );
}
