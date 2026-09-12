import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
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
import { CHECK_TYPE_META, getCheckTypeFromSearch, type CheckTxType } from "@/config/finance-routes";
import { formatBankAccountLabel } from "@/lib/bank-label";
import EntityPermissionGate from "@/components/EntityPermissionGate";
import { Undo2 } from "lucide-react";
import { PartySearchSelect } from "@/components/PartySearchSelect";

function buildEmptyForm(type: CheckTxType) {
  return {
    type,
    checkNumber: "",
    bankAccountId: undefined as number | undefined,
    customerId: undefined as number | undefined,
    supplierId: undefined as number | undefined,
    amount: "",
    date: new Date().toISOString().split("T")[0],
    dueDate: "",
    description: "",
  };
}

export default function Checks() {
  const searchString = useSearch();
  const lockedType = useMemo(
    () => getCheckTypeFromSearch(searchString) ?? "incoming",
    [searchString],
  );
  const meta = CHECK_TYPE_META[lockedType];

  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => buildEmptyForm(lockedType));

  useEffect(() => {
    setForm(buildEmptyForm(lockedType));
    setPage(1);
  }, [lockedType]);

  const { data, isLoading, refetch } = trpc.bank.checks.list.useQuery({
    page,
    limit: 20,
    type: lockedType,
  });
  const { data: bankAccounts } = trpc.bank.accounts.list.useQuery();
  const { data: customers } = trpc.customers.list.useQuery({ page: 1, limit: 200 });
  const { data: suppliers } = trpc.suppliers.list.useQuery({ page: 1, limit: 200 });
  const fiscalCheck = trpc.parity.settings.fiscalYears.checkDate.useQuery(
    { date: form.date },
    { enabled: !!form.date },
  );

  const createMut = trpc.bank.checks.create.useMutation({
    onSuccess: () => {
      toast.success("تم تسجيل الشيك وإنشاء القيد المحاسبي");
      refetch();
      setOpen(false);
      setForm(buildEmptyForm(lockedType));
    },
    onError: (e) => toast.error(e.message),
  });

  const collectMut = trpc.bank.checks.collect.useMutation({
    onSuccess: (res) => {
      let msg = "تم تحصيل الشيك";
      if (res.allocations?.length) {
        const parts = res.allocations.map(
          (a) => `${a.invoiceNumber}: ${Number(a.amount).toLocaleString("en-US")} ج.م`,
        );
        msg += ` — ${parts.join("، ")}`;
      }
      if (res.unallocated && Number(res.unallocated) > 0.001) {
        msg += ` (متبقي: ${Number(res.unallocated).toLocaleString("en-US")} ج.م)`;
      }
      toast.success(msg);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const bounceMut = trpc.bank.checks.bounce.useMutation({
    onSuccess: () => {
      toast.success("تم تسجيل إرجاع الشيك");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const unapproveMut = trpc.bank.checks.unapprove.useMutation({
    onSuccess: () => {
      toast.success("تم فك اعتماد تحصيل الشيك");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const openCreate = () => {
    setForm(buildEmptyForm(lockedType));
    setOpen(true);
  };

  const handleSubmit = () => {
    if (!form.checkNumber || !form.amount) {
      toast.error("رقم الشيك والمبلغ مطلوبان");
      return;
    }
    if (lockedType === "incoming" && !form.customerId) {
      toast.error("يجب اختيار العميل");
      return;
    }
    if (lockedType === "outgoing" && !form.supplierId) {
      toast.error("يجب اختيار المورد");
      return;
    }
    const dueDate = form.dueDate || form.date;
    createMut.mutate({
      type: lockedType,
      checkNumber: form.checkNumber,
      bankAccountId: form.bankAccountId,
      customerId: form.customerId,
      supplierId: form.supplierId,
      amount: form.amount,
      date: form.date,
      dueDate,
      description: form.description || undefined,
    });
  };

  return (
    <ERPLayout title={meta.title}>
      <DataTable
        title={meta.title}
        data={data?.rows}
        isLoading={isLoading}
        total={data?.total}
        page={page}
        onPageChange={setPage}
        onAdd={openCreate}
        addLabel={meta.addLabel}
        addEntity={{ moduleKey: "bank", entityKey: lockedType === "outgoing" ? "checkOut" : "checkIn" }}
        columns={[
          { key: "number", label: "المرجع", className: "w-28 font-mono" },
          { key: "checkNumber", label: "رقم الشيك", className: "w-32" },
          { key: "amount", label: "المبلغ", render: (row: any) => `${Number(row.amount).toLocaleString("en-US")} ج.م` },
          { key: "date", label: "التاريخ", render: (row: any) => row.date ? new Date(row.date).toLocaleDateString("en-GB") : "-" },
          { key: "dueDate", label: "الاستحقاق", render: (row: any) => row.dueDate ? new Date(row.dueDate).toLocaleDateString("en-GB") : "-" },
          { key: "status", label: "الحالة", render: (row: any) => statusBadge(row.status) },
        ]}
        extraRowActions={(row: any) => {
          if (row.status === "pending" || row.status === "deposited") {
            return (
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs text-green-700"
                  disabled={collectMut.isPending}
                  onClick={() => collectMut.mutate({ id: row.id })}
                >
                  تحصيل
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs text-red-700"
                  disabled={bounceMut.isPending}
                  onClick={() => {
                    if (confirm("تأكيد إرجاع/رفض هذا الشيك؟")) {
                      bounceMut.mutate({ id: row.id });
                    }
                  }}
                >
                  إرجاع
                </Button>
              </div>
            );
          }
          if (row.status === "cleared") {
            const canUnapprove = !!row.statusBeforeClear;
            return (
              <EntityPermissionGate
                moduleKey="bank"
                entityKey={row.type === "outgoing" ? "checkOut" : "checkIn"}
                action="unapprove"
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 text-amber-700"
                  disabled={!canUnapprove || unapproveMut.isPending}
                  title={canUnapprove ? undefined : "هذا الشيك تم تحصيله قبل توفر سجل توزيع الدفعات — لا يمكن فك اعتماده تلقائياً"}
                  onClick={() => {
                    if (confirm("فك اعتماد تحصيل هذا الشيك؟ سيتم عكس توزيعه على الفواتير وإلغاء قيد التحصيل.")) {
                      unapproveMut.mutate({ id: row.id });
                    }
                  }}
                >
                  <Undo2 size={13} />
                  فك اعتماد
                </Button>
              </EntityPermissionGate>
            );
          }
          return null;
        }}
      />

      <FormModal
        open={open}
        onClose={() => { setOpen(false); setForm(buildEmptyForm(lockedType)); }}
        title={meta.formTitle}
        onSubmit={handleSubmit}
        isLoading={createMut.isPending}
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">رقم الشيك *</Label>
            <Input
              value={form.checkNumber}
              onChange={(e) => setForm((p) => ({ ...p, checkNumber: e.target.value }))}
              className="h-9 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">المبلغ *</Label>
            <Input
              value={form.amount}
              onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
              type="number"
              placeholder="0.00"
              className="h-9 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">تاريخ الشيك</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
              className="h-9 text-sm"
            />
            {fiscalCheck.data?.closed && (
              <p className="text-xs text-red-600 mt-1">هذا التاريخ ضمن فترة مالية مغلقة</p>
            )}
          </div>
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">تاريخ الاستحقاق</Label>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
              className="h-9 text-sm"
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">الحساب البنكي</Label>
            <Select
              value={form.bankAccountId?.toString() || ""}
              onValueChange={(v) => setForm((p) => ({ ...p, bankAccountId: Number(v) }))}
            >
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختياري" /></SelectTrigger>
              <SelectContent>
                {bankAccounts?.map((b: any) => (
                  <SelectItem key={b.id} value={b.id.toString()}>
                    {formatBankAccountLabel(b)}
                  </SelectItem>
                ))}
                {!bankAccounts?.length && (
                  <SelectItem value="__empty" disabled>
                    لا توجد بنوك — أضف حساباً تحت «البنوك» في شجرة الحسابات
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          {lockedType === "incoming" && (
            <div className="col-span-2">
              <Label className="text-xs font-medium text-slate-700 mb-1.5 block">العميل *</Label>
              <PartySearchSelect
                parties={customers?.rows || []}
                value={form.customerId?.toString() || ""}
                onChange={(v) => setForm((p) => ({ ...p, customerId: Number(v) }))}
                placeholder="اختر العميل"
              />
              <p className="text-xs text-slate-500 mt-1">
                عند التحصيل يُوزَّع المبلغ على أقدم فواتير العميل المفتوحة
              </p>
            </div>
          )}
          {lockedType === "outgoing" && (
            <div className="col-span-2">
              <Label className="text-xs font-medium text-slate-700 mb-1.5 block">المورد *</Label>
              <PartySearchSelect
                parties={suppliers?.rows || []}
                value={form.supplierId?.toString() || ""}
                onChange={(v) => setForm((p) => ({ ...p, supplierId: Number(v) }))}
                placeholder="اختر المورد"
              />
            </div>
          )}
          <div className="col-span-2">
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">البيان</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className="text-sm resize-none"
              rows={2}
            />
          </div>
        </div>
      </FormModal>
    </ERPLayout>
  );
}
