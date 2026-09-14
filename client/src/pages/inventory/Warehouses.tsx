import { useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import { DataTable } from "@/components/DataTable";
import { FormModal } from "@/components/FormModal";
import { FieldLabel, FormSection, entryControlClass, entrySelectTriggerClass, entryTextareaClass } from "@/components/form/EntryForm";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const emptyForm = { name: "", address: "", branchId: "" as string };

export default function Warehouses() {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [branchFilter, setBranchFilter] = useState("");
  const [nameSearch, setNameSearch] = useState("");

  const { data, isLoading, refetch } = trpc.warehouses.list.useQuery(
    branchFilter ? { branchId: Number(branchFilter) } : undefined,
  );
  const { data: branchList } = trpc.settings.branches.list.useQuery();
  const filtered = (data || []).filter((w: any) => {
    if (!nameSearch.trim()) return true;
    return String(w.name || "").toLowerCase().includes(nameSearch.trim().toLowerCase());
  });
  const createMut = trpc.warehouses.create.useMutation({
    onSuccess: () => { toast.success("تم إضافة المخزن"); refetch(); setOpen(false); setForm(emptyForm); },
    onError: (e) => toast.error(e.message || "فشل إضافة المخزن"),
  });
  const updateMut = trpc.warehouses.update.useMutation({
    onSuccess: () => { toast.success("تم التحديث"); refetch(); setOpen(false); setEditId(null); },
    onError: (e) => toast.error(e.message || "فشل التحديث"),
  });
  const deleteMut = trpc.warehouses.delete.useMutation({
    onSuccess: () => { toast.success("تم الحذف"); refetch(); },
  });
  const backfillMut = trpc.warehouses.backfillStock.useMutation({
    onSuccess: (res) => toast.success(`تم ترحيل ${res.added} صنف للمخزن الافتراضي`),
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("اسم المخزن مطلوب"); return; }
    const payload = {
      name: form.name.trim(),
      address: form.address.trim() || undefined,
      branchId: form.branchId ? Number(form.branchId) : null,
    };
    if (editId) updateMut.mutate({ id: editId, ...payload });
    else createMut.mutate(payload);
  };

  return (
    <ERPLayout title="المخازن">
      <div className="mb-3 flex flex-wrap gap-3 items-end justify-between">
        <div className="flex flex-wrap gap-3 items-end rounded-lg border bg-slate-50 p-3">
          <div className="space-y-1">
            <FieldLabel>الفرع</FieldLabel>
            <Select value={branchFilter || "all"} onValueChange={(v) => setBranchFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="h-10 w-48 text-sm"><SelectValue placeholder="كل الفروع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفروع</SelectItem>
                {(branchList || []).map((b: { id: number; name: string }) => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <FieldLabel>الاسم</FieldLabel>
            <Input className="h-10 w-48" placeholder="بحث بالاسم..." value={nameSearch} onChange={(e) => setNameSearch(e.target.value)} />
          </div>
        </div>
        <Button variant="outline" size="sm" className="text-sm h-10" disabled={backfillMut.isPending} onClick={() => backfillMut.mutate()}>
          ترحيل أرصدة الأصناف للمخزن الافتراضي
        </Button>
      </div>
      <DataTable
        title="قائمة المخازن"
        data={filtered}
        isLoading={isLoading}
        onAdd={() => { setEditId(null); setForm(emptyForm); setOpen(true); }}
        addLabel="مخزن جديد"
        addEntity={{ moduleKey: "inventory", entityKey: "warehouses" }}
        rowEntity={{ moduleKey: "inventory", entityKey: "warehouses" }}
        onEdit={(row: any) => {
          setEditId(row.id);
          setForm({
            name: row.name,
            address: row.address || "",
            branchId: row.branchId ? String(row.branchId) : "",
          });
          setOpen(true);
        }}
        onDelete={(row: any) => deleteMut.mutate(row.id)}
        columns={[
          { key: "name", label: "الاسم" },
          { key: "branchName", label: "الفرع", render: (r: any) => r.branchName || "—" },
          { key: "address", label: "ملاحظات / العنوان" },
          { key: "isActive", label: "الحالة", render: (r: any) => r.isActive ? "نشط" : "موقوف" },
        ]}
      />
      <FormModal
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "تعديل مخزن" : "مخزن جديد"}
        description="اربط المخزن بفرع محدد لاستخدامه في التحويلات والجرد والتقارير."
        onSubmit={handleSubmit}
        isLoading={createMut.isPending || updateMut.isPending}
        size="lg"
      >
        <FormSection title="بيانات المخزن" accent="emerald">
          <div className="sm:col-span-2">
            <FieldLabel required>اسم المخزن</FieldLabel>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={entryControlClass}
              placeholder="مثال: المخزن الرئيسي"
            />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel required>الفرع</FieldLabel>
            <Select
              value={form.branchId || "none"}
              onValueChange={(v) => setForm({ ...form, branchId: v === "none" ? "" : v })}
            >
              <SelectTrigger className={entrySelectTriggerClass}>
                <SelectValue placeholder="اختر الفرع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون فرع</SelectItem>
                {(branchList || []).map((b: { id: number; name: string }) => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <FieldLabel>العنوان</FieldLabel>
            <Textarea
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className={entryTextareaClass}
              rows={3}
              placeholder="العنوان أو موقع المخزن"
            />
          </div>
        </FormSection>
      </FormModal>
    </ERPLayout>
  );
}
