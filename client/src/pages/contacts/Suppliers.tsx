import { useEffect, useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import { DataTable, statusBadge } from "@/components/DataTable";
import { FormModal } from "@/components/FormModal";
import {
  ContactPartyFormFields,
  buildPartyPayload,
  emptyContactPartyForm,
  partyFormFromRow,
} from "@/components/ContactPartyForm";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { FileText, Upload } from "lucide-react";
import { isoToDisplayDate } from "@/components/form/DateField";
import { tenantPath, useTenantSlug } from "@/lib/tenant";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

export default function Suppliers() {
  const tenantSlug = useTenantSlug();
  const [, navigate] = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [linkedCustomerId, setLinkedCustomerId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyContactPartyForm());

  useEffect(() => setPage(1), [debouncedSearch]);
  const { data, isLoading, refetch } = trpc.suppliers.list.useQuery({ page, limit: 20, search: debouncedSearch });
  const { data: categories } = trpc.contactCategories.list.useQuery();
  const { data: branchList } = trpc.settings.branches.list.useQuery();

  const createMut = trpc.suppliers.create.useMutation({
    onSuccess: (res) => {
      const base = res?.code ? `تم إضافة المورد — الكود: ${res.code}` : "تم إضافة المورد";
      toast.success(res?.customerCode ? `${base} · وسُجّل كعميل (${res.customerCode})` : base);
      refetch();
      closeModal();
    },
    onError: (err) => toast.error(err.message || "فشل إضافة المورد"),
  });
  const updateMut = trpc.suppliers.update.useMutation({
    onSuccess: (res) => {
      toast.success(res?.customerCode ? `تم التحديث · وسُجّل كعميل (${res.customerCode})` : "تم تحديث المورد");
      refetch();
      closeModal();
    },
    onError: (err) => toast.error(err.message || "فشل تحديث المورد"),
  });
  const deleteMut = trpc.suppliers.delete.useMutation({ onSuccess: () => { toast.success("تم حذف المورد"); refetch(); } });

  const closeModal = () => {
    setOpen(false);
    setEditId(null);
    setForm(emptyContactPartyForm());
    setLinkedCustomerId(null);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("اسم المورد مطلوب"); return; }
    if (form.openingBalance.trim() && Number(form.openingBalance) !== 0 && !form.openingBalanceDate.trim()) {
      toast.error("حدد تاريخ الرصيد الافتتاحي");
      return;
    }
    const payload = buildPartyPayload(form, { mode: "supplier", linkedTwinId: linkedCustomerId });
    if (editId) updateMut.mutate({ id: editId, ...payload } as any);
    else createMut.mutate(payload as any);
  };

  const handleEdit = (row: any) => {
    setEditId(row.id);
    setLinkedCustomerId(row.linkedCustomerId ?? null);
    setForm(partyFormFromRow(row, "linkedCustomerId"));
    setOpen(true);
  };

  return (
    <ERPLayout title="قائمة الموردين">
      <DataTable
        title="الموردين"
        data={data?.rows}
        isLoading={isLoading}
        total={data?.total}
        page={page}
        onPageChange={setPage}
        search={search}
        onSearch={setSearch}
        onAdd={() => { setEditId(null); setLinkedCustomerId(null); setForm(emptyContactPartyForm()); setOpen(true); }}
        addLabel="مورد جديد"
        addEntity={{ moduleKey: "contacts", entityKey: "supplier" }}
        rowEntity={{ moduleKey: "contacts", entityKey: "supplier" }}
        headerExtra={
          <Button
            variant="outline"
            size="sm"
            className="font-extrabold gap-1"
            onClick={() => navigate(tenantPath(tenantSlug, "/contacts/smart-import?type=supplier"))}
          >
            <Upload size={14} /> استيراد ذكي (Excel)
          </Button>
        }
        onEdit={handleEdit}
        onDelete={(row) => deleteMut.mutate(row.id!)}
        deleteConfirm="حذف المورد؟"
        columns={[
          { key: "code", label: "الكود", className: "w-24" },
          { key: "name", label: "اسم المورد" },
          {
            key: "branchId",
            label: "الفرع",
            render: (row) => branchList?.find((b) => b.id === row.branchId)?.name || "—",
          },
          { key: "phone", label: "الهاتف" },
          { key: "city", label: "المدينة" },
          {
            key: "role",
            label: "النوع",
            render: (row) => row.linkedCustomerId
              ? <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">عميل ومورد</span>
              : <span className="text-[11px] text-slate-500">مورد</span>,
          },
          { key: "balance", label: "الرصيد", render: row => <span>{Number(row.balance).toLocaleString("en-US")} ج.م</span> },
          {
            key: "openingBalance",
            label: "افتتاحي",
            render: (row) => Number(row.openingBalance || 0)
              ? (
                <span className="text-violet-700 font-medium">
                  {Number(row.openingBalance).toLocaleString("en-US")}
                  {row.openingBalanceDate ? (
                    <span className="block text-[11px] text-violet-500 font-semibold">
                      {isoToDisplayDate(String(row.openingBalanceDate))}
                    </span>
                  ) : null}
                </span>
              )
              : <span className="text-slate-300">—</span>,
          },
          { key: "statement", label: "كشف", render: row => (
            <Link href={`/contacts/statement?type=supplier&id=${row.id}`}>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-blue-600 hover:bg-blue-50">
                <FileText size={13} /> كشف
              </Button>
            </Link>
          ) },
          { key: "isActive", label: "الحالة", render: row => statusBadge(row.isActive ? "active" : "inactive") },
        ]}
      />

      <FormModal
        open={open}
        onClose={closeModal}
        title={editId ? "تعديل مورد" : "إضافة مورد جديد"}
        description="أدخل بيانات المورد بوضوح — الحقول المطلوبة مميزة بالأحمر."
        onSubmit={handleSubmit}
        isLoading={createMut.isPending || updateMut.isPending}
        size="2xl"
      >
        <ContactPartyFormFields
          mode="supplier"
          form={form}
          setForm={setForm}
          editId={editId}
          linkedTwinId={linkedCustomerId}
          categories={(categories || []) as any}
          branches={(branchList || []) as any}
        />
      </FormModal>
    </ERPLayout>
  );
}
