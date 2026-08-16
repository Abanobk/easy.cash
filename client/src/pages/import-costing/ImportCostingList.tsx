import { useState } from "react";
import { useLocation } from "wouter";
import { Calculator, Copy, Eye, Pencil, Plus } from "lucide-react";
import ERPLayout from "@/components/ERPLayout";
import { DataTable } from "@/components/DataTable";
import { trpc } from "@/lib/trpc";
import { tenantPath, useTenantSlug } from "@/lib/tenant";
import { toast } from "sonner";
import PermissionGate from "@/components/PermissionGate";
import { Button } from "@/components/ui/button";

function money(n: number) {
  return Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function presetLabel(preset?: string) {
  if (preset === "no_batteries") return "سوتيحات";
  if (preset === "with_batteries") return "لوكات";
  if (!preset || preset === "custom") return "مخصص";
  return preset;
}

export default function ImportCostingList() {
  const tenantSlug = useTenantSlug();
  const [, navigate] = useLocation();
  const [page, setPage] = useState(1);
  const q = trpc.importCosting.list.useQuery({ page, limit: 20 });
  const del = trpc.importCosting.delete.useMutation({
    onSuccess: () => { toast.success("تم حذف التقدير"); q.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const dup = trpc.importCosting.createDuplicate.useMutation({
    onSuccess: (r) => {
      toast.success("تم نسخ التقدير");
      navigate(tenantPath(tenantSlug, `/import-costing/${r.id}?edit=1`));
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = q.data?.rows || [];
  const totals = rows.reduce(
    (acc, r: any) => ({
      landed: acc.landed + Number(r.landedEgp || 0),
      qty: acc.qty + Number(r.quantity || 0),
      count: acc.count + 1,
    }),
    { landed: 0, qty: 0, count: 0 },
  );

  return (
    <ERPLayout title="تكليف شحنة">
      <PermissionGate
        module="import_costing"
        featureKey="importcosting-shipments"
        fallback={<p className="text-sm text-slate-500">لا توجد صلاحية لعرض تكليف الشحنة.</p>}
      >
        <div className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-bl from-slate-900 via-slate-800 to-slate-900 text-white">
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-white/10 p-2.5">
                <Calculator size={20} />
              </div>
              <div>
                <h2 className="text-lg font-semibold">تقدير تكلفة وصول الشحنة</h2>
                <p className="mt-1 max-w-xl text-sm text-slate-300">
                  تقدير مستقل عن الفواتير والمخزن والقيود. افتح التقرير للمعاينة، وعدّل فقط لما تحتاج.
                </p>
              </div>
            </div>
            <Button
              className="h-10 gap-1.5 bg-white text-slate-900 hover:bg-slate-100"
              onClick={() => navigate(tenantPath(tenantSlug, "/import-costing/new"))}
            >
              <Plus size={16} />
              تقدير جديد
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-px bg-white/10">
            <div className="bg-slate-900/70 px-4 py-3">
              <p className="text-[11px] text-slate-400">تقديرات الصفحة</p>
              <p className="text-sm font-semibold">{totals.count}</p>
            </div>
            <div className="bg-slate-900/70 px-4 py-3">
              <p className="text-[11px] text-slate-400">إجمالي كميات</p>
              <p className="text-sm font-semibold">{money(totals.qty)}</p>
            </div>
            <div className="bg-slate-900/70 px-4 py-3">
              <p className="text-[11px] text-slate-400">إجمالي تكاليف (الصفحة)</p>
              <p className="text-sm font-semibold">{money(totals.landed)} ج</p>
            </div>
          </div>
        </div>

        <DataTable
          title="التقارير المحفوظة"
          data={rows as any}
          isLoading={q.isLoading}
          total={q.data?.total}
          page={page}
          onPageChange={setPage}
          permissionModule="import_costing"
          addFeatureKey="importcosting-shipments"
          onAdd={() => navigate(tenantPath(tenantSlug, "/import-costing/new"))}
          addLabel="تقدير جديد"
          onRowClick={(row: { id?: number }) => row.id && navigate(tenantPath(tenantSlug, `/import-costing/${row.id}`))}
          onDelete={(row: { id?: number }) => row.id && del.mutate(row.id)}
          deleteConfirm="حذف هذا التقدير؟ لن يؤثر على الفواتير أو المخزن."
          extraRowActions={(row: { id?: number }) => (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-slate-700 hover:text-slate-900"
                onClick={(e) => {
                  e.stopPropagation();
                  if (row.id) navigate(tenantPath(tenantSlug, `/import-costing/${row.id}`));
                }}
              >
                <Eye size={13} />
                تقرير
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900"
                onClick={(e) => {
                  e.stopPropagation();
                  if (row.id) navigate(tenantPath(tenantSlug, `/import-costing/${row.id}?edit=1`));
                }}
              >
                <Pencil size={13} />
                تعديل
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
                onClick={(e) => {
                  e.stopPropagation();
                  if (row.id) dup.mutate(row.id);
                }}
              >
                <Copy size={13} />
                نسخ
              </button>
            </div>
          )}
          columns={[
            { key: "number", label: "الرقم", className: "w-28 font-mono text-xs" },
            {
              key: "name",
              label: "التقدير",
              render: (row: any) => (
                <div>
                  <p className="font-medium text-slate-800">{row.name}</p>
                  <p className="text-[11px] text-slate-400">{presetLabel(row.preset)}</p>
                </div>
              ),
            },
            {
              key: "shipmentDate",
              label: "التاريخ",
              render: (row: any) => row.shipmentDate
                ? new Date(row.shipmentDate).toLocaleDateString("en-GB")
                : "—",
            },
            { key: "lineCount", label: "أصناف" },
            { key: "quantity", label: "كمية", render: (row: any) => money(row.quantity) },
            { key: "dueUsd", label: "مطلوب $", render: (row: any) => money(row.dueUsd) },
            { key: "dueLocalEgp", label: "مطلوب ج", render: (row: any) => money(row.dueLocalEgp) },
            {
              key: "landedEgp",
              label: "إجمالي ج",
              render: (row: any) => <span className="font-semibold text-slate-900">{money(row.landedEgp)}</span>,
            },
            {
              key: "minLanded",
              label: "قطعة ج",
              render: (row: any) => row.maxLanded
                ? `${money(row.minLanded)} – ${money(row.maxLanded)}`
                : "—",
            },
          ]}
        />
      </PermissionGate>
    </ERPLayout>
  );
}
