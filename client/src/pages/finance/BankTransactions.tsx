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
import { CheckCircle, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  BANK_TYPE_META,
  getBankTypeFromSearch,
  type BankTxType,
} from "@/config/finance-routes";
import { BankAccountSearchSelect } from "@/components/BankAccountSearchSelect";
import { PartySearchSelect } from "@/components/PartySearchSelect";
import EntityPermissionGate from "@/components/EntityPermissionGate";
import { FinanceTxListFilterBar, type FinanceTxListFiltersValue } from "@/components/finance/FinanceTxListFilterBar";

function buildEmptyForm(type: BankTxType) {
  return {
    type,
    bankAccountId: undefined as number | undefined,
    date: new Date().toISOString().split("T")[0],
    amount: "",
    reference: "",
    referenceNumber: "",
    description: "",
    notes: "",
    customerId: undefined as number | undefined,
    supplierId: undefined as number | undefined,
  };
}

const BANK_ENTITY_FOR_TYPE: Record<string, string> = {
  deposit: "bankDeposit",
  withdraw: "bankWithdrawal",
  deposit_customer: "bankDepositFromCustomer",
  withdraw_supplier: "bankWithdrawalToSupplier",
  withdraw_customer: "bankWithdrawal",
};

export default function BankTransactions() {
  const searchString = useSearch();
  const lockedType = useMemo(
    () => getBankTypeFromSearch(searchString) ?? "deposit",
    [searchString],
  );
  const meta = BANK_TYPE_META[lockedType];
  const entityKey = BANK_ENTITY_FOR_TYPE[lockedType] || "bankDeposit";

  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => buildEmptyForm(lockedType));
  const [listFilters, setListFilters] = useState<FinanceTxListFiltersValue>({});

  useEffect(() => {
    setForm(buildEmptyForm(lockedType));
    setPage(1);
    setListFilters({});
  }, [lockedType]);

  const isCustomerTx = lockedType === "deposit_customer" || lockedType === "withdraw_customer";
  const isSupplierTx = lockedType === "withdraw_supplier";

  const { data, isLoading, refetch } = trpc.bank.transactions.list.useQuery({
    page,
    limit: 20,
    type: lockedType,
    dateFrom: listFilters.dateFrom,
    dateTo: listFilters.dateTo,
    status: listFilters.status,
    partyId: listFilters.partyId,
    number: listFilters.number,
    referenceNumber: listFilters.referenceNumber,
    search: listFilters.search,
  });
  const { data: bankAccounts } = trpc.bank.accounts.list.useQuery();
  const { data: customers } = trpc.customers.list.useQuery({ page: 1, limit: 500 });
  const { data: suppliers } = trpc.suppliers.list.useQuery({ page: 1, limit: 500 });
  const fiscalCheck = trpc.parity.settings.fiscalYears.checkDate.useQuery(
    { date: form.date },
    { enabled: !!form.date },
  );
  const createMut = trpc.bank.transactions.create.useMutation({
    onSuccess: () => {
      toast.success("تم الحفظ كمسودة");
      refetch();
      setOpen(false);
      setForm(buildEmptyForm(lockedType));
    },
    onError: (e) => toast.error(e.message),
  });
  const approveMut = trpc.bank.transactions.approve.useMutation({
    onSuccess: (res: any) => {
      let msg = "تم اعتماد الحركة (قيد + توزيع)";
      if (res?.allocations?.length) {
        const parts = res.allocations.map(
          (a: any) => `${a.invoiceNumber}: ${Number(a.amount).toLocaleString("en-US")} ج.م`,
        );
        msg += ` — تم التوزيع على: ${parts.join("، ")}`;
      }
      if (res?.unallocated && Number(res.unallocated) > 0.001) {
        msg += ` (متبقي غير موزّع: ${Number(res.unallocated).toLocaleString("en-US")} ج.م)`;
      }
      toast.success(msg);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const unapproveMut = trpc.bank.transactions.unapprove.useMutation({
    onSuccess: () => { toast.success("تم فك الاعتماد"); refetch(); },
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
    if (isCustomerTx && !form.customerId) {
      toast.error("يجب اختيار العميل");
      return;
    }
    if (isSupplierTx && !form.supplierId) {
      toast.error("يجب اختيار المورد");
      return;
    }
    createMut.mutate({
      type: lockedType,
      bankAccountId: form.bankAccountId,
      date: form.date,
      amount: form.amount,
      reference: form.reference || undefined,
      referenceNumber: form.referenceNumber || undefined,
      description: form.description || undefined,
      customerId: form.customerId,
      supplierId: form.supplierId,
    });
  };

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const partyOptions = isCustomerTx
    ? (customers?.rows || []).map((c: any) => ({ id: c.id, name: c.name }))
    : isSupplierTx
      ? (suppliers?.rows || []).map((s: any) => ({ id: s.id, name: s.name }))
      : undefined;

  return (
    <ERPLayout title={meta.title}>
      <FinanceTxListFilterBar
        value={listFilters}
        onChange={setListFilters}
        onClear={() => setListFilters({})}
        partyLabel={isCustomerTx ? "العميل" : isSupplierTx ? "المورد" : undefined}
        parties={partyOptions}
      />
      <DataTable
        title={meta.title}
        data={data?.rows}
        isLoading={isLoading}
        total={data?.total}
        page={page}
        onPageChange={setPage}
        onAdd={openCreate}
        addLabel={meta.addLabel}
        addEntity={{ moduleKey: "bank", entityKey }}
        columns={[
          { key: "number", label: "الرقم", className: "w-28" },
          { key: "date", label: "التاريخ", render: (row: any) => row.date ? new Date(row.date).toLocaleDateString("en-GB") : "-" },
          { key: "amount", label: "المبلغ", render: (row: any) => `${Number(row.amount).toLocaleString("en-US")} ج.م` },
          { key: "description", label: "البيان" },
          { key: "referenceNumber", label: "المرجع", render: (row: any) => row.referenceNumber || row.reference || "—" },
          { key: "status", label: "الحالة", render: (row: any) => statusBadge(row.status || "draft") },
        ]}
        actions={(row: any) => (
          <>
            {row.status === "draft" && (
              <EntityPermissionGate moduleKey="bank" entityKey={entityKey} action="approve">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-green-600 gap-1" onClick={() => approveMut.mutate(row.id)}>
                  <CheckCircle size={12} /> اعتماد
                </Button>
              </EntityPermissionGate>
            )}
            {row.status === "confirmed" && (
              <EntityPermissionGate moduleKey="bank" entityKey={entityKey} action="unapprove">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-amber-700 gap-1" onClick={() => unapproveMut.mutate(row.id)}>
                  <Undo2 size={12} /> فك اعتماد
                </Button>
              </EntityPermissionGate>
            )}
          </>
        )}
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
            <BankAccountSearchSelect
              accounts={bankAccounts || []}
              value={form.bankAccountId?.toString() || ""}
              onChange={(v) => setForm((p) => ({ ...p, bankAccountId: Number(v) }))}
              placeholder="اختر الحساب"
            />
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
          <div className="col-span-2">
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">رقم مرجع</Label>
            <Input value={form.referenceNumber} onChange={f("referenceNumber")} className="h-9 text-sm" />
          </div>
          {(lockedType === "deposit_customer" || lockedType === "withdraw_customer") && (
            <div className="col-span-2">
              <Label className="text-xs font-medium text-slate-700 mb-1.5 block">العميل *</Label>
              <PartySearchSelect
                parties={customers?.rows || []}
                value={form.customerId?.toString() || ""}
                onChange={(v) => setForm((p) => ({ ...p, customerId: v ? Number(v) : undefined }))}
                placeholder="اختر العميل"
              />
              <p className="text-xs text-slate-500 mt-1">
                {lockedType === "withdraw_customer"
                  ? "يرد المبلغ للعميل ويعكس عمولة المندوبين على هذا الرد — يُطبَّق عند الاعتماد"
                  : "يُطبَّق المبلغ تلقائياً على أقدم الفواتير المفتوحة (أو الفاتورة في المرجع أولاً) عند الاعتماد"}
              </p>
            </div>
          )}
          {lockedType === "withdraw_supplier" && (
            <div className="col-span-2">
              <Label className="text-xs font-medium text-slate-700 mb-1.5 block">المورد *</Label>
              <PartySearchSelect
                parties={suppliers?.rows || []}
                value={form.supplierId?.toString() || ""}
                onChange={(v) => setForm((p) => ({ ...p, supplierId: v ? Number(v) : undefined }))}
                placeholder="اختر المورد"
              />
              <p className="text-xs text-slate-500 mt-1">
                يُطبَّق المبلغ تلقائياً على أقدم فواتير الشراء المفتوحة (أو الفاتورة في المرجع أولاً) عند الاعتماد
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
