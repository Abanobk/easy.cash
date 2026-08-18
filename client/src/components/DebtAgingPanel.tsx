import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, Truck } from "lucide-react";

const BUCKET_LABELS = [
  { key: "current" as const, label: "0–30 يوم", color: "bg-emerald-500" },
  { key: "days30" as const, label: "31–60", color: "bg-lime-500" },
  { key: "days60" as const, label: "61–90", color: "bg-amber-500" },
  { key: "days90" as const, label: "91–120", color: "bg-orange-500" },
  { key: "over90" as const, label: "+120", color: "bg-red-500" },
];

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function AgingBar({ buckets }: { buckets: Record<string, number> & { total: number } }) {
  if (buckets.total <= 0) {
    return <p className="text-xs text-slate-400 py-2">لا توجد ذمم مفتوحة</p>;
  }
  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
        {BUCKET_LABELS.map(({ key, color }) => {
          const pct = (buckets[key] / buckets.total) * 100;
          if (pct < 0.5) return null;
          return <div key={key} className={color} style={{ width: `${pct}%` }} title={`${key}: ${formatMoney(buckets[key])}`} />;
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {BUCKET_LABELS.map(({ key, label, color }) => (
          <div key={key} className="flex items-center gap-1 text-[10px] text-slate-600">
            <span className={`w-2 h-2 rounded-full ${color}`} />
            <span>{label}:</span>
            <span className="font-medium">{formatMoney(buckets[key])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DebtAgingPanel() {
  const { data, isLoading } = trpc.dashboard.debtAging.useQuery();

  if (isLoading) {
    return (
      <Card className="eca-card border-0 shadow-none">
        <CardContent className="p-6 text-center text-slate-400 text-sm">جاري تحميل أعمار الديون...</CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const hasDebt = data.customers.total > 0 || data.suppliers.total > 0;

  return (
    <Card className="eca-card border-0 shadow-none">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Clock size={16} style={{ color: "var(--ink-500)" }} />
            أعمار الديون
          </CardTitle>
          <Link href="/reports/accounting/accountingreports-debitsages" className="text-[10px] hover:underline" style={{ color: "var(--brass-600)" }}>
            تقرير تفصيلي
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-0">
        {!hasDebt ? (
          <p className="text-sm text-green-700 bg-green-50/50 rounded-lg p-3 border border-green-100">
            لا توجد ذمم عملاء أو موردين مفتوحة.
          </p>
        ) : (
          <>
            <section>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Users size={14} style={{ color: "var(--ink-500)" }} />
                  <span className="text-xs font-semibold text-slate-600">ذمم العملاء (مدينون)</span>
                </div>
                <Badge variant="outline" className="text-xs">{formatMoney(data.customers.total)} ج.م</Badge>
              </div>
              <AgingBar buckets={data.customers} />
            </section>

            <section>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Truck size={14} style={{ color: "var(--brass-600)" }} />
                  <span className="text-xs font-semibold text-slate-600">ذمم الموردين (دائنون)</span>
                </div>
                <Badge variant="outline" className="text-xs">{formatMoney(data.suppliers.total)} ج.م</Badge>
              </div>
              <AgingBar buckets={data.suppliers} />
            </section>
          </>
        )}

        {data.topOverdueCustomers.length > 0 && (
          <section>
            <div className="text-xs font-semibold text-slate-600 mb-2">أقدم ذمم العملاء</div>
            <div className="space-y-1">
              {data.topOverdueCustomers.slice(0, 5).map((inv) => (
                <div key={inv.invoiceId} className="flex justify-between text-xs px-2 py-1.5 rounded bg-red-50 border border-red-100">
                  <Link href={`/sales/invoices/${inv.invoiceId}`} className="text-red-800 hover:underline truncate max-w-[60%]">
                    {inv.invoiceNumber} — {inv.customerName}
                  </Link>
                  <span className="text-red-700 font-medium whitespace-nowrap">
                    {formatMoney(inv.remaining)} ج.م · {inv.days} يوم
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {data.topOverdueSuppliers.length > 0 && (
          <section>
            <div className="text-xs font-semibold text-slate-600 mb-2">أقدم ذمم الموردين</div>
            <div className="space-y-1">
              {data.topOverdueSuppliers.slice(0, 5).map((inv) => (
                <div key={inv.invoiceId} className="flex justify-between text-xs px-2 py-1.5 rounded bg-purple-50 border border-purple-100">
                  <Link href={`/purchases/invoices/${inv.invoiceId}`} className="text-purple-800 hover:underline truncate max-w-[60%]">
                    {inv.invoiceNumber} — {inv.supplierName}
                  </Link>
                  <span className="text-purple-700 font-medium whitespace-nowrap">
                    {formatMoney(inv.remaining)} ج.م · {inv.days} يوم
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
