import { useState } from "react";
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
import { Link } from "wouter";
import { FileText } from "lucide-react";
import { isoToDisplayDate } from "@/components/form/DateField";

export default function Customers() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [linkedSupplierId, setLinkedSupplierId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyContactPartyForm());

  const { data, isLoading, refetch } = trpc.customers.list.useQuery({ page, limit: 20, search });
  const { data: categories } = trpc.contactCategories.list.useQuery();
  const { data: reps } = trpc.salesReps.list.useQuery();
  const { data: branchList } = trpc.settings.branches.list.useQuery();
  const { data: areas } = trpc.parity.sales.areas.list.useQuery();

  const createMut = trpc.customers.create.useMutation({
    onSuccess: (res) => {
      const base = res?.code ? `تم إضافة العميل — الكود: ${res.code}` : "تم إضافة العميل";
      toast.success(res?.supplierCode ? `${base} · وسُجّل كمورد (${res.supplierCode})` : base);
      refetch();
      closeModal();
    },
    onError: (err) => toast.error(err.message || "فشل إضافة العميل"),
  });
  const updateMut = trpc.customers.update.useMutation({
    onSuccess: (res) => {
      toast.success(res?.supplierCode ? `تم التحديث · وسُجّل كمورد (${res.supplierCode})` : "تم تحديث العميل");
      refetch();
      closeModal();
    },
    onError: (err) => toast.error(err.message || "فشل تحديث العميل"),
  });
  const deleteMut = trpc.customers.delete.useMutation({ onSuccess: () => { toast.success("تم حذف العميل"); refetch(); } });

  const closeModal = () => {
    setOpen(false);
    setEditId(null);
    setForm(emptyContactPartyForm());
    setLinkedSupplierId(null);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("اسم العميل مطلوب"); return; }
    if (form.openingBalance.trim() && Number(form.openingBalance) !== 0 && !form.openingBalanceDate.trim()) {
      toast.error("حدد تاريخ الرصيد الافتتاحي");
      return;
    }
    const payload = buildPartyPayload(form, { mode: "customer", linkedTwinId: linkedSupplierId });
    if (editId) updateMut.mutate({ id: editId, ...payload } as any);
    else createMut.mutate(payload as any);
  };

  const handleEdit = (row: any) => {
    setEditId(row.id);
    setLinkedSupplierId(row.linkedSupplierId ?? null);
    setForm(partyFormFromRow(row, "linkedSupplierId"));
    setOpen(true);
  };

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
        onAdd={() => { setEditId(null); setLinkedSupplierId(null); setForm(emptyContactPartyForm()); setOpen(true); }}
        addLabel="عميل جديد"
        permissionModule="contacts"
        onEdit={handleEdit}
        onDelete={(row) => { if (confirm("هل أنت متأكد من حذف هذا العميل؟")) deleteMut.mutate(row.id!); }}
        deleteConfirm="هل أنت متأكد من حذف هذا العميل؟"
        columns={[
          { key: "code", label: "الكود", className: "w-24" },
          { key: "name", label: "اسم العميل" },
          {
            key: "branchId",
            label: "الفرع",
            render: (row) => branchList?.find((b) => b.id === row.branchId)?.name || "—",
          },
          { key: "phone", label: "الهاتف" },
          { key: "city", label: "المدينة" },
          {
            key: "reps",
            label: "المندوبون",
            render: (row) => (
              <span className="text-xs text-slate-600">
                {row.salesRepNames || "—"}
              </span>
            ),
          },
          {
            key: "role",
            label: "النوع",
            render: (row) => row.linkedSupplierId
              ? <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">عميل ومورد</span>
              : <span className="text-[11px] text-slate-500">عميل</span>,
          },
          { key: "balance", label: "الرصيد", render: row => <span className={Number(row.balance) < 0 ? "text-red-600 font-semibold" : "text-slate-700"}>{Number(row.balance).toLocaleString("en-US")} ج.م</span> },
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
            <Link href={`/contacts/statement?type=customer&id=${row.id}`}>
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
        title={editId ? "تعديل عميل" : "إضافة عميل جديد"}
        description="أدخل بيانات العميل بوضوح — الحقول المطلوبة مميزة بالأحمر."
        onSubmit={handleSubmit}
        isLoading={createMut.isPending || updateMut.isPending}
        size="2xl"
      >
        <ContactPartyFormFields
          mode="customer"
          form={form}
          setForm={setForm}
          editId={editId}
          linkedTwinId={linkedSupplierId}
          categories={(categories || []) as any}
          branches={(branchList || []) as any}
          reps={(reps || []) as any}
          areas={(areas || []) as any}
        />
      </FormModal>
    </ERPLayout>
  );
}
