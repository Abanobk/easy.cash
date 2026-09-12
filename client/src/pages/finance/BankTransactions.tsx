import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import ERPLayout from "@/components/ERPLayout";
import { DataTable } from "@/components/DataTable";
import { FormModal } from "@/components/FormModal";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  BANK_TYPE_META,
  getBankTypeFromSearch,
  type BankTxType,
} from "@/config/finance-routes";
import { formatBankAccountLabel } from "@/lib/bank-label";
import { PartySearchSelect } from "@/components/PartySearchSelect";

function buildEmptyForm(type: BankTxType) {
  return {
    type,
    bankAccountId: undefined as number | undefined,
    date: new Date().toISOString().split("T")[0],
    amount: "",
    reference: "",
    description: "",
    notes: "",
    customerId: undefined as number | undefined,
    supplierId: undefined as number | undefined,
  };
}

export default function BankTransactions() {
  const searchString = useSearch();
  const lockedType = useMemo(
    () => getBankTypeFromSearch(searchString) ?? "deposit",
    [searchString],
  );
  const meta = BANK_TYPE_META[lockedType];

  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => buildEmptyForm(lockedType));

  useEffect(() => {
    setForm(buildEmptyForm(lockedType));
    setPage(1);
  }, [lockedType]);

  const { data, isLoading, refetch } = trpc.bank.transactions.list.useQuery({
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
  const createMut = trpc.bank.transactions.create.useMutation({
    onSuccess: (data) => {
      let msg = "تم إضافة المعاملة البنكية";
      if (data.allocations?.length) {
        const parts = data.allocations.map(
          (a) => `${a.invoiceNumber}: ${Number(a.amount).toLocaleString("en-US")} ج.م`,
        );
        msg += ` — تم التوزيع على: ${parts.join("، ")}`;
      }
      if (data.unallocated && Number(data.unallocated) > 0.001) {
        msg += ` (متبقي غير موزّع: ${Number(data.unallocated).toLocaleString("en-US")} ج.م)`;
      }
      toast.success(msg);
      refetch();
      setOpen(false);
      setForm(buildEmptyForm(lockedType));
    },
    onError: (e) => toast.error(e.message),
  });

  const openCreate = () => {
    setForm(buildEmptyForm(lockedType));
    setOpen(true);
  };

  const handleSubmit = () => {
    if (!form.amount || !form.bankAccountId) {
      toast.error("الحساب البنكي والمبلغ مطلوبان");
      return;
    }
    if (lockedType === "deposit_customer" && !form.customerId) {
      toast.error("يجب اختيار العميل");
      return;
    }
    if (lockedType === "withdraw_customer" && !form.customerId) {
      toast.error("يجب اختيار العميل");
      return;
    }
    if (lockedType === "withdraw_supplier" && !form.supplierId) {
      toast.error("يجب اختيار المورد");
      return;
    }
    createMut.mutate({
      type: lockedType,
      bankAccountId: form.bankAccountId,
      date: form.date,
      amount: form.amount,
      reference: form.reference || undefined,
      description: form.description || undefined,
      customerId: form.customerId,
      supplierId: form.supplierId,
    });
  };

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

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
        addEntity={{
          moduleKey: "bank",
          entityKey: (
            { deposit: "bankDeposit", withdraw: "bankWithdrawal", deposit_customer: "bankDepositFromCustomer", withdraw_supplier: "bankWithdrawalToSupplier", withdraw_customer: "bankWithdrawal" } as Record<string, string>
          )[lockedType] || "bankDeposit",
        }}
        rowEntity={{
          moduleKey: "bank",
          entityKey: (
            { deposit: "bankDeposit", withdraw: "bankWithdrawal", deposit_customer: "bankDepositFromCustomer", withdraw_supplier: "bankWithdrawalToSupplier", withdraw_customer: "bankWithdrawal" } as Record<string, string>
          )[lockedType] || "bankDeposit",
        }}
        onDelete={() => toast.info("لا يمكن الحذف حالياً")}
        columns={[
          { key: "number", label: "الرقم", className: "w-28" },
          { key: "date", label: "التاريخ", render: (row: any) => row.date ? new Date(row.date).toLocaleDateString("en-GB") : "-" },
          { key: "amount", label: "المبلغ", render: (row: any) => `${Number(row.amount).toLocaleString("en-US")} ج.م` },
          { key: "description", label: "البيان" },
          { key: "reference", label: "المرجع" },
        ]}
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
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">الحساب البنكي *</Label>
            <Select
              value={form.bankAccountId?.toString() || ""}
              onValueChange={(v) => setForm((p) => ({ ...p, bankAccountId: Number(v) }))}
            >
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر الحساب" /></SelectTrigger>
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
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">المبلغ *</Label>
            <Input value={form.amount} onChange={f("amount")} type="number" placeholder="0.00" className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">التاريخ</Label>
            <Input type="date" value={form.date} onChange={f("date")} className="h-9 text-sm" />
            {fiscalCheck.data?.closed && (
              <p className="text-xs text-red-600 mt-1">هذا التاريخ ضمن فترة مالية مغلقة</p>
            )}
          </div>
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">المرجع</Label>
            <Input value={form.reference} onChange={f("reference")} className="h-9 text-sm" placeholder="رقم فاتورة (اختياري)" />
          </div>
          {(lockedType === "deposit_customer" || lockedType === "withdraw_customer") && (
            <div className="col-span-2">
              <Label className="text-xs font-medium text-slate-700 mb-1.5 block">العميل *</Label>
              <PartySearchSelect
                parties={customers?.rows || []}
                value={form.customerId?.toString() || ""}
                onChange={(v) => setForm((p) => ({ ...p, customerId: Number(v) }))}
                placeholder="اختر العميل"
              />
              <p className="text-xs text-slate-500 mt-1">
                {lockedType === "withdraw_customer"
                  ? "يرد المبلغ للعميل ويعكس عمولة المندوبين على هذا الرد"
                  : "يُطبَّق المبلغ تلقائياً على أقدم الفواتير المفتوحة (أو الفاتورة في المرجع أولاً)"}
              </p>
            </div>
          )}
          {lockedType === "withdraw_supplier" && (
            <div className="col-span-2">
              <Label className="text-xs font-medium text-slate-700 mb-1.5 block">المورد *</Label>
              <PartySearchSelect
                parties={suppliers?.rows || []}
                value={form.supplierId?.toString() || ""}
                onChange={(v) => setForm((p) => ({ ...p, supplierId: Number(v) }))}
                placeholder="اختر المورد"
              />
              <p className="text-xs text-slate-500 mt-1">
                يُطبَّق المبلغ تلقائياً على أقدم فواتير الشراء المفتوحة (أو الفاتورة في المرجع أولاً)
              </p>
            </div>
          )}
          <div className="col-span-2">
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">البيان</Label>
            <Input value={form.description} onChange={f("description")} className="h-9 text-sm" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">ملاحظات</Label>
            <Textarea value={form.notes} onChange={f("notes")} className="text-sm resize-none" rows={2} />
          </div>
        </div>
      </FormModal>
    </ERPLayout>
  );
}
