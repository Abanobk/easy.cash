import { useMemo, useState } from "react";
import { SimpleEntityPage } from "@/components/SimpleEntityPage";
import { trpc } from "@/lib/trpc";
import { useAssetOptions } from "@/hooks/useEntityOptions";
import ERPLayout from "@/components/ERPLayout";
import { DataTable } from "@/components/DataTable";
import { FormModal } from "@/components/FormModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import PermissionGate from "@/components/PermissionGate";

export function AssetCategoriesPage() {
  const q = trpc.parity.assets.categories.list.useQuery();
  const c = trpc.parity.assets.categories.create.useMutation();
  const u = trpc.parity.assets.categories.update.useMutation();
  const d = trpc.parity.assets.categories.delete.useMutation();
  return (
    <SimpleEntityPage title="فئات الأصول" tableTitle="الفئات" data={q.data as any} isLoading={q.isLoading} onRefresh={() => q.refetch()}
      permissionModule="assets"
      columns={[{ key: "name", label: "الفئة" }, { key: "depreciationRate", label: "نسبة الإهلاك %" }]}
      fields={[{ key: "name", label: "الفئة", required: true }, { key: "depreciationRate", label: "نسبة الإهلاك %" }]}
      onCreate={(v) => c.mutateAsync(v as any)} onUpdate={(id, v) => u.mutateAsync({ id, ...v } as any)} onDelete={(id) => d.mutateAsync(id)} />
  );
}

export function CapitalMaintenancePage() {
  const q = trpc.parity.assets.capitalMaintenance.list.useQuery();
  const assets = useAssetOptions("active");
  const c = trpc.parity.assets.capitalMaintenance.create.useMutation();
  const d = trpc.parity.assets.capitalMaintenance.delete.useMutation();
  return (
    <SimpleEntityPage title="الصيانة الرأسمالية" tableTitle="سجلات الصيانة" data={q.data as any} isLoading={q.isLoading} onRefresh={() => q.refetch()}
      permissionModule="assets"
      canEdit={false}
      columns={[
        { key: "assetName", label: "الأصل" },
        { key: "date", label: "التاريخ", render: (r) => String(r.date).slice(0, 10) },
        { key: "amount", label: "المبلغ", render: (r) => `${Number(r.amount).toLocaleString("en-US")} ج.م` },
        { key: "description", label: "الوصف" },
      ]}
      fields={[
        { key: "assetId", label: "الأصل", type: "select", required: true, options: assets },
        { key: "date", label: "التاريخ", type: "date", required: true },
        { key: "amount", label: "المبلغ", required: true },
        { key: "description", label: "الوصف", type: "textarea" },
      ]}
      onCreate={(v) => c.mutateAsync({ ...v, assetId: Number(v.assetId) } as any)} onUpdate={() => {}} onDelete={(id) => d.mutateAsync(id)} />
  );
}

export function CapitalMaintenanceListPage() {
  return <CapitalMaintenancePage />;
}

const emptySale = {
  assetId: "",
  date: new Date().toISOString().slice(0, 10),
  amount: "",
  buyer: "",
  notes: "",
  settlementMethod: "cash" as "cash" | "bank",
  bankAccountId: "",
};

export function AssetSellingPage() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptySale);
  const q = trpc.parity.assets.sales.list.useQuery();
  const assetsQ = trpc.assets.list.useQuery({ page: 1, limit: 500, status: "active" });
  const banksQ = trpc.bank.accounts.list.useQuery();
  const c = trpc.parity.assets.sales.create.useMutation({
    onSuccess: () => {
      toast.success("تم تسجيل البيع مع القيد المحاسبي");
      q.refetch();
      assetsQ.refetch();
      setOpen(false);
      setForm(emptySale);
    },
    onError: (e) => toast.error(e.message),
  });
  const d = trpc.parity.assets.sales.delete.useMutation({
    onSuccess: () => {
      toast.success("تم إلغاء البيع واستعادة الأصل وإلغاء القيد");
      q.refetch();
      assetsQ.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const assetOptions = useMemo(
    () => (assetsQ.data?.rows || []).map((a: any) => ({
      value: String(a.id),
      label: a.code ? `${a.code} — ${a.name}` : a.name,
      currentValue: a.currentValue,
      purchasePrice: a.purchasePrice,
    })),
    [assetsQ.data],
  );

  const selectedAsset = assetOptions.find((a) => a.value === form.assetId);
  const bookValue = Number(selectedAsset?.currentValue || selectedAsset?.purchasePrice || 0);
  const gain = Number(form.amount || 0) - bookValue;

  return (
    <ERPLayout title="بيع الأصول">
      <div className="space-y-4">
        <DataTable
          title="مبيعات الأصول"
          data={q.data as any}
          isLoading={q.isLoading}
          onAdd={() => { setForm(emptySale); setOpen(true); }}
          addLabel="بيع أصل"
          permissionModule="assets"
          columns={[
            { key: "assetName", label: "الأصل" },
            { key: "date", label: "التاريخ", render: (r: any) => String(r.date).slice(0, 10) },
            { key: "amount", label: "المبلغ", render: (r: any) => `${Number(r.amount).toLocaleString("en-US")} ج.م` },
            { key: "buyer", label: "المشتري" },
          ]}
          actions={(row: any) => (
            <PermissionGate module="assets" action="delete">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-red-600"
                title="إلغاء البيع واستعادة الأصل"
                disabled={d.isPending}
                onClick={() => {
                  if (confirm("إلغاء هذا البيع؟ سيُستعاد الأصل ويُلغى القيد المحاسبي.")) {
                    d.mutate(Number(row.id));
                  }
                }}
              >
                <Trash2 size={14} />
              </Button>
            </PermissionGate>
          )}
        />
      </div>

      <FormModal
        open={open}
        onClose={() => { setOpen(false); setForm(emptySale); }}
        title="بيع أصل ثابت"
        isLoading={c.isPending}
        onSubmit={() => {
          if (!form.assetId || !form.amount) {
            toast.error("الأصل ومبلغ البيع مطلوبان");
            return;
          }
          if (form.settlementMethod === "bank" && !form.bankAccountId) {
            toast.error("اختر الحساب البنكي");
            return;
          }
          c.mutate({
            assetId: Number(form.assetId),
            date: form.date,
            amount: form.amount,
            buyer: form.buyer || undefined,
            notes: form.notes || undefined,
            settlementMethod: form.settlementMethod,
            bankAccountId: form.bankAccountId ? Number(form.bankAccountId) : undefined,
          });
        }}
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label className="text-xs font-medium mb-1.5 block">الأصل *</Label>
            <Select value={form.assetId} onValueChange={(v) => setForm((p) => ({ ...p, assetId: v }))}>
              <SelectTrigger className="h-9"><SelectValue placeholder="اختر أصلاً نشطاً" /></SelectTrigger>
              <SelectContent>
                {assetOptions.map((a) => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedAsset && (
              <p className="text-xs font-bold text-slate-600 mt-1">
                القيمة الدفترية: {bookValue.toLocaleString("en-US")} ج.م
              </p>
            )}
          </div>
          <div>
            <Label className="text-xs font-medium mb-1.5 block">تاريخ البيع *</Label>
            <Input type="date" className="h-9" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs font-medium mb-1.5 block">مبلغ البيع *</Label>
            <Input type="number" className="h-9" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs font-medium mb-1.5 block">التسوية *</Label>
            <Select
              value={form.settlementMethod}
              onValueChange={(v) => setForm((p) => ({ ...p, settlementMethod: v as any, bankAccountId: "" }))}
            >
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">صندوق / نقدي</SelectItem>
                <SelectItem value="bank">بنك</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.settlementMethod === "bank" && (
            <div>
              <Label className="text-xs font-medium mb-1.5 block">الحساب البنكي *</Label>
              <Select value={form.bankAccountId} onValueChange={(v) => setForm((p) => ({ ...p, bankAccountId: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="اختر بنك" /></SelectTrigger>
                <SelectContent>
                  {(banksQ.data || []).map((b: any) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs font-medium mb-1.5 block">المشتري</Label>
            <Input className="h-9" value={form.buyer} onChange={(e) => setForm((p) => ({ ...p, buyer: e.target.value }))} />
          </div>
          {form.amount && selectedAsset && (
            <div className="text-xs font-bold self-end pb-2">
              {gain > 0.005
                ? `ربح متوقع ≈ ${gain.toLocaleString("en-US", { maximumFractionDigits: 2 })} ج.م`
                : gain < -0.005
                  ? `خسارة متوقعة ≈ ${Math.abs(gain).toLocaleString("en-US", { maximumFractionDigits: 2 })} ج.م`
                  : "بدون ربح/خسارة"}
            </div>
          )}
          <div className="col-span-2">
            <Label className="text-xs font-medium mb-1.5 block">ملاحظات</Label>
            <Textarea className="text-sm resize-none" rows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          </div>
        </div>
      </FormModal>
    </ERPLayout>
  );
}

export function AssetSellingListPage() {
  return <AssetSellingPage />;
}

export function SalesAreasPage() {
  const q = trpc.parity.sales.areas.list.useQuery();
  const c = trpc.parity.sales.areas.create.useMutation();
  const u = trpc.parity.sales.areas.update.useMutation();
  const d = trpc.parity.sales.areas.delete.useMutation();
  return (
    <SimpleEntityPage title="مناطق البيع" tableTitle="المناطق" data={q.data as any} isLoading={q.isLoading} onRefresh={() => q.refetch()}
      permissionModule="sales_reps"
      columns={[{ key: "name", label: "المنطقة" }, { key: "description", label: "الوصف" }]}
      fields={[{ key: "name", label: "المنطقة", required: true }, { key: "description", label: "الوصف", type: "textarea" }]}
      onCreate={(v) => c.mutateAsync(v as any)} onUpdate={(id, v) => u.mutateAsync({ id, ...v } as any)} onDelete={(id) => d.mutateAsync(id)} />
  );
}
