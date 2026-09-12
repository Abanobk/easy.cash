import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import ERPLayout from "@/components/ERPLayout";
import { DataTable } from "@/components/DataTable";
import { FormModal } from "@/components/FormModal";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { getCashRouteConfig, type CashTxType } from "@/config/finance-routes";
import { PartySearchSelect } from "@/components/PartySearchSelect";

function buildEmptyForm(type: CashTxType) {
  return {
    type,
    amount: "",
    date: new Date().toISOString().split("T")[0],
    description: "",
    customerId: undefined as number | undefined,
    supplierId: undefined as number | undefined,
  };
}

export default function CashTransactions() {
  const [location] = useLocation();
  const routeConfig = useMemo(() => getCashRouteConfig(location), [location]);
  const lockedType = routeConfig?.type ?? "receive";

  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => buildEmptyForm(lockedType));

  useEffect(() => {
    setForm(buildEmptyForm(lockedType));
    setPage(1);
  }, [lockedType]);

  const pageTitle = routeConfig?.title ?? "المعاملات النقدية";
  const addLabel = routeConfig?.addLabel ?? "معاملة جديدة";
  const formTitle = routeConfig?.formTitle ?? "معاملة نقدية جديدة";

  const { data, isLoading, refetch } = trpc.cash.list.useQuery({
    page,
    limit: 20,
    type: lockedType,
  });
  const { data: customers } = trpc.customers.list.useQuery({ page: 1, limit: 200 });
  const { data: suppliers } = trpc.suppliers.list.useQuery({ page: 1, limit: 200 });
  const fiscalCheck = trpc.parity.settings.fiscalYears.checkDate.useQuery(
    { date: form.date },
    { enabled: !!form.date },
  );
  const createMut = trpc.cash.create.useMutation({
    onSuccess: (data) => {
      let msg = "تم تسجيل المعاملة";
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
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error("يجب إدخال مبلغ صحيح");
      return;
    }
    if (lockedType === "receive_customer" && !form.customerId) {
      toast.error("يجب اختيار العميل");
      return;
    }
    if (lockedType === "pay_customer" && !form.customerId) {
      toast.error("يجب اختيار العميل");
      return;
    }
    if (lockedType === "pay_supplier" && !form.supplierId) {
      toast.error("يجب اختيار المورد");
      return;
    }
    createMut.mutate({
      type: lockedType,
      amount: form.amount,
      date: form.date,
      description: form.description || undefined,
      customerId: form.customerId,
      supplierId: form.supplierId,
    });
  };

  const isIncoming = lockedType === "receive" || lockedType === "receive_customer";

  return (
    <ERPLayout title={pageTitle}>
      <DataTable
        title={pageTitle}
        data={data?.rows as any[]}
        isLoading={isLoading}
        total={data?.total}
        page={page}
        onPageChange={setPage}
        onAdd={openCreate}
        addLabel={addLabel}
        addEntity={{
          moduleKey: "cash",
          entityKey: (
            { receive: "cashReceipt", pay: "cashPayment", receive_customer: "cashReceiptFromCustomer", pay_supplier: "cashPaymentToSupplier", pay_customer: "cashPayment" } as Record<string, string>
          )[lockedType] || "cashReceipt",
        }}
        columns={[
          { key: "number", label: "الرقم", className: "w-28 font-mono" },
          { key: "date", label: "التاريخ", render: (row: any) => row.date ? new Date(row.date).toLocaleDateString("en-GB") : "-" },
          { key: "description", label: "البيان" },
          {
            key: "amount",
            label: "المبلغ",
            render: (row: any) => (
              <span className={isIncoming ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                {isIncoming ? "+" : "-"}{Number(row.amount).toLocaleString("en-US")} ج.م
              </span>
            ),
          },
        ]}
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
                onChange={(v) => setForm((p) => ({ ...p, customerId: Number(v) }))}
                placeholder="اختر العميل"
              />
              <p className="text-xs text-slate-500 mt-1">
                {lockedType === "pay_customer"
                  ? "يرد المبلغ للعميل ويعكس عمولة المندوبين على هذا الرد"
                  : "يُطبَّق المبلغ تلقائياً على أقدم الفواتير المفتوحة للعميل"}
              </p>
            </div>
          )}
          {lockedType === "pay_supplier" && (
            <div>
              <Label className="text-xs font-medium text-slate-700 mb-1.5 block">المورد *</Label>
              <PartySearchSelect
                parties={suppliers?.rows || []}
                value={form.supplierId?.toString() || ""}
                onChange={(v) => setForm((p) => ({ ...p, supplierId: Number(v) }))}
                placeholder="اختر المورد"
              />
              <p className="text-xs text-slate-500 mt-1">
                يُطبَّق المبلغ تلقائياً على أقدم فواتير الشراء المفتوحة للمورد
              </p>
            </div>
          )}
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
