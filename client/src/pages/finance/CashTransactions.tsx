import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
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
import { getCashRouteConfig, type CashTxType } from "@/config/finance-routes";
import { PartySearchSelect } from "@/components/PartySearchSelect";
import EntityPermissionGate from "@/components/EntityPermissionGate";
import { FinanceTxListFilterBar, type FinanceTxListFiltersValue } from "@/components/finance/FinanceTxListFilterBar";

function buildEmptyForm(type: CashTxType) {
  return {
    type,
    amount: "",
    date: new Date().toISOString().split("T")[0],
    description: "",
    reference: "",
    referenceNumber: "",
    customerId: undefined as number | undefined,
    supplierId: undefined as number | undefined,
  };
}

const CASH_ENTITY_FOR_TYPE: Record<string, string> = {
  receive: "cashReceipt",
  pay: "cashPayment",
  receive_customer: "cashReceiptFromCustomer",
  pay_supplier: "cashPaymentToSupplier",
  pay_customer: "cashPayment",
};

export default function CashTransactions() {
  const [location] = useLocation();
  const routeConfig = useMemo(() => getCashRouteConfig(location), [location]);
  const lockedType = routeConfig?.type ?? "receive";

  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => buildEmptyForm(lockedType));
  const [listFilters, setListFilters] = useState<FinanceTxListFiltersValue>({});

  useEffect(() => {
    setForm(buildEmptyForm(lockedType));
    setPage(1);
    setListFilters({});
  }, [lockedType]);

  const pageTitle = routeConfig?.title ?? "المعاملات النقدية";
  const addLabel = routeConfig?.addLabel ?? "معاملة جديدة";
  const formTitle = routeConfig?.formTitle ?? "معاملة نقدية جديدة";
  const entityKey = CASH_ENTITY_FOR_TYPE[lockedType] || "cashPayment";

  const isCustomerTx = lockedType === "receive_customer" || lockedType === "pay_customer";
  const isSupplierTx = lockedType === "pay_supplier";

  const { data, isLoading, refetch } = trpc.cash.list.useQuery({
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
  const { data: customers } = trpc.customers.list.useQuery({ page: 1, limit: 500 });
  const { data: suppliers } = trpc.suppliers.list.useQuery({ page: 1, limit: 500 });
  const fiscalCheck = trpc.parity.settings.fiscalYears.checkDate.useQuery(
    { date: form.date },
    { enabled: !!form.date },
  );
  const createMut = trpc.cash.create.useMutation({
    onSuccess: () => {
      toast.success("تم الحفظ كمسودة");
      refetch();
      setOpen(false);
      setForm(buildEmptyForm(lockedType));
    },
    onError: (e) => toast.error(e.message),
  });
  const approveMut = trpc.cash.approve.useMutation({
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
  const unapproveMut = trpc.cash.unapprove.useMutation({
    onSuccess: () => { toast.success("تم فك الاعتماد"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const openCreate = () => {
    setForm(buildEmptyForm(lockedType));
    setOpen(true);
  };

  const handleSubmit = () => {
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error("يجب إدخال مبلغ صحيح");
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
      amount: form.amount,
      date: form.date,
      description: form.description || undefined,
      reference: form.reference || undefined,
      referenceNumber: form.referenceNumber || undefined,
      customerId: form.customerId,
      supplierId: form.supplierId,
    });
  };

  const isIncoming = lockedType === "receive" || lockedType === "receive_customer";

  const partyOptions = isCustomerTx
    ? (customers?.rows || []).map((c: any) => ({ id: c.id, name: c.name }))
    : isSupplierTx
      ? (suppliers?.rows || []).map((s: any) => ({ id: s.id, name: s.name }))
      : undefined;

  return (
    <ERPLayout title={pageTitle}>
      <FinanceTxListFilterBar
        value={listFilters}
        onChange={setListFilters}
        onClear={() => setListFilters({})}
        partyLabel={isCustomerTx ? "العميل" : isSupplierTx ? "المورد" : undefined}
        parties={partyOptions}
      />
      <DataTable
        title={pageTitle}
        data={data?.rows as any[]}
        isLoading={isLoading}
        total={data?.total}
        page={page}
        onPageChange={setPage}
        onAdd={openCreate}
        addLabel={addLabel}
        addEntity={{ moduleKey: "cash", entityKey }}
        columns={[
          { key: "number", label: "الرقم", className: "w-28 font-mono" },
          { key: "date", label: "التاريخ", render: (row: any) => row.date ? new Date(row.date).toLocaleDateString("en-GB") : "-" },
          { key: "description", label: "البيان" },
          { key: "referenceNumber", label: "المرجع", render: (row: any) => row.referenceNumber || row.reference || "—" },
          {
            key: "amount",
            label: "المبلغ",
            render: (row: any) => (
              <span className={isIncoming ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                {isIncoming ? "+" : "-"}{Number(row.amount).toLocaleString("en-US")} ج.م
              </span>
            ),
          },
          { key: "status", label: "الحالة", render: (row: any) => statusBadge(row.status || "draft") },
        ]}
        actions={(row: any) => (
          <>
            {row.status === "draft" && (
              <EntityPermissionGate moduleKey="cash" entityKey={entityKey} action="approve">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-green-600 gap-1" onClick={() => approveMut.mutate(row.id)}>
                  <CheckCircle size={12} /> اعتماد
                </Button>
              </EntityPermissionGate>
            )}
            {row.status === "confirmed" && (
              <EntityPermissionGate moduleKey="cash" entityKey={entityKey} action="unapprove">
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
        title={formTitle}
        onSubmit={handleSubmit}
        isLoading={createMut.isPending}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
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
              <Label className="text-xs font-medium text-slate-700 mb-1.5 block">التاريخ *</Label>
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
          </div>
          {(lockedType === "receive_customer" || lockedType === "pay_customer") && (
            <div>
              <Label className="text-xs font-medium text-slate-700 mb-1.5 block">العميل *</Label>
              <PartySearchSelect
                parties={customers?.rows || []}
                value={form.customerId?.toString() || ""}
                onChange={(v) => setForm((p) => ({ ...p, customerId: v ? Number(v) : undefined }))}
                placeholder="اختر العميل"
              />
              <p className="text-xs text-slate-500 mt-1">
                {lockedType === "pay_customer"
                  ? "يرد المبلغ للعميل ويعكس عمولة المندوبين على هذا الرد — يُطبَّق عند الاعتماد"
                  : "يُطبَّق المبلغ تلقائياً على أقدم الفواتير المفتوحة للعميل عند الاعتماد"}
              </p>
            </div>
          )}
          {lockedType === "pay_supplier" && (
            <div>
              <Label className="text-xs font-medium text-slate-700 mb-1.5 block">المورد *</Label>
              <PartySearchSelect
                parties={suppliers?.rows || []}
                value={form.supplierId?.toString() || ""}
                onChange={(v) => setForm((p) => ({ ...p, supplierId: v ? Number(v) : undefined }))}
                placeholder="اختر المورد"
              />
              <p className="text-xs text-slate-500 mt-1">
                يُطبَّق المبلغ تلقائياً على أقدم فواتير الشراء المفتوحة للمورد عند الاعتماد
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-medium text-slate-700 mb-1.5 block">مرجع فاتورة (اختياري)</Label>
              <Input
                value={form.reference}
                onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))}
                className="h-9 text-sm"
                placeholder="رقم فاتورة للتوزيع عليها أولاً"
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-slate-700 mb-1.5 block">رقم مرجع</Label>
              <Input
                value={form.referenceNumber}
                onChange={(e) => setForm((p) => ({ ...p, referenceNumber: e.target.value }))}
                className="h-9 text-sm"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">البيان</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="وصف المعاملة"
              className="text-sm resize-none"
              rows={2}
            />
          </div>
        </div>
      </FormModal>
    </ERPLayout>
  );
}
