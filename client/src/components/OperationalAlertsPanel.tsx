import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Package, FileText, CreditCard, Users, CalendarClock } from "lucide-react";
import { toDateStr } from "@/lib/date";

export function OperationalAlertsPanel() {
  const { data: alerts, isLoading } = trpc.dashboard.alerts.useQuery();

  if (isLoading) {
    return (
      <Card className="eca-card border-0 shadow-none">
        <CardContent className="p-6 text-center text-slate-400 text-sm">جاري تحميل التنبيهات...</CardContent>
      </Card>
    );
  }

  if (!alerts) return null;

  const hasAlerts =
    alerts.counts.lowStock > 0 ||
    alerts.counts.unpaidSales > 0 ||
    alerts.counts.unpaidPurchases > 0 ||
    alerts.counts.overdueSales > 0 ||
    alerts.counts.dueChecks > 0 ||
    alerts.counts.overdueChecks > 0 ||
    (alerts.counts.unroutedChecks || 0) > 0 ||
    (alerts.counts.depositDueSoon || 0) > 0 ||
    (alerts.counts.overdueDeposits || 0) > 0 ||
    (alerts.counts.depositedOverdueClear || 0) > 0 ||
    alerts.counts.creditExceeded > 0 ||
    alerts.counts.dueInstallments > 0 ||
    alerts.counts.draftDocs > 0;

  if (!hasAlerts) {
    return (
      <Card className="border-0 shadow-none" style={{ background: "var(--good-100)", borderColor: "#bcd9c8" }}>
        <CardContent className="p-5 text-sm" style={{ color: "var(--good-600)" }}>
          لا توجد تنبيهات تشغيلية عاجلة — كل شيء تحت السيطرة.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="eca-card border-0 shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-500" />
          تنبيهات تشغيلية
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {alerts.lowStockItems.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <Package size={14} className="text-orange-600" />
              <span className="text-xs font-semibold text-slate-600">مخزون منخفض</span>
              <Badge variant="outline" className="text-xs">{alerts.lowStockItems.length}</Badge>
            </div>
            <div className="space-y-1">
              {alerts.lowStockItems.map((item: any) => (
                <div key={item.id} className="flex justify-between text-xs px-2 py-1.5 rounded bg-orange-50 border border-orange-100">
                  <Link href="/items" className="text-orange-800 hover:underline">{item.name}</Link>
                  <span className="text-orange-700 font-medium">
                    {Number(item.currentStock).toLocaleString("en-US")} / {Number(item.minStock).toLocaleString("en-US")} {item.unit || ""}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {alerts.unpaidSales.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <FileText size={14} className="text-red-600" />
              <span className="text-xs font-semibold text-slate-600">فواتير بيع غير مسددة</span>
              <Badge variant="outline" className="text-xs">{alerts.unpaidSales.length}</Badge>
            </div>
            <div className="space-y-1">
              {alerts.unpaidSales.map((inv: any) => (
                <div key={inv.id} className="flex justify-between text-xs px-2 py-1.5 rounded bg-red-50 border border-red-100">
                  <Link href={`/sales/invoices/${inv.id}`} className="text-red-800 hover:underline">{inv.number} — {inv.customerName}</Link>
                  <span className="text-red-700 font-medium">{Number(inv.remaining).toLocaleString("en-US")} ج.م</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {alerts.unpaidPurchases.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <FileText size={14} className="text-purple-600" />
              <span className="text-xs font-semibold text-slate-600">فواتير شراء غير مسددة</span>
              <Badge variant="outline" className="text-xs">{alerts.unpaidPurchases.length}</Badge>
            </div>
            <div className="space-y-1">
              {alerts.unpaidPurchases.map((inv: any) => (
                <div key={inv.id} className="flex justify-between text-xs px-2 py-1.5 rounded bg-purple-50 border border-purple-100">
                  <Link href={`/purchases/invoices/${inv.id}`} className="text-purple-800 hover:underline">{inv.number} — {inv.supplierName}</Link>
                  <span className="text-purple-700 font-medium">{Number(inv.remaining).toLocaleString("en-US")} ج.م</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {(alerts.dueChecks.length > 0 || (alerts.overdueChecks?.length ?? 0) > 0
          || (alerts.unroutedChecks?.length ?? 0) > 0
          || (alerts.depositDueSoon?.length ?? 0) > 0
          || (alerts.overdueDeposits?.length ?? 0) > 0
          || (alerts.depositedOverdueClear?.length ?? 0) > 0) && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <CreditCard size={14} className="text-yellow-600" />
              <span className="text-xs font-semibold text-slate-600">شيكات وتوجيه</span>
              {((alerts.counts.overdueChecks || 0) + (alerts.counts.overdueDeposits || 0)) > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {(alerts.counts.overdueChecks || 0) + (alerts.counts.overdueDeposits || 0)} متأخر
                </Badge>
              )}
            </div>
            <div className="space-y-1">
              {(alerts.overdueDeposits || []).map((chk: any) => (
                <div key={`od-${chk.id}`} className="flex justify-between text-xs px-2 py-1.5 rounded bg-red-50 border border-red-100">
                  <Link href="/bank/check-routing" className="text-red-800 hover:underline">
                    {chk.checkNumber} (متأخر عن الإيداع)
                  </Link>
                  <span className="text-red-700 font-medium">
                    {Number(chk.amount).toLocaleString("en-US")} ج.م
                  </span>
                </div>
              ))}
              {(alerts.unroutedChecks || []).map((chk: any) => (
                <div key={`ur-${chk.id}`} className="flex justify-between text-xs px-2 py-1.5 rounded bg-slate-50 border border-slate-200">
                  <Link href="/bank/check-routing" className="text-slate-800 hover:underline">
                    {chk.checkNumber} (غير موجه)
                  </Link>
                  <span className="text-slate-700 font-medium">
                    {Number(chk.amount).toLocaleString("en-US")} ج.م
                  </span>
                </div>
              ))}
              {(alerts.depositDueSoon || []).map((chk: any) => (
                <div key={`ds-${chk.id}`} className="flex justify-between text-xs px-2 py-1.5 rounded bg-amber-50 border border-amber-100">
                  <Link href="/bank/check-routing" className="text-amber-900 hover:underline">
                    {chk.checkNumber} (إيداع قريب)
                  </Link>
                  <span className="text-amber-800 font-medium">
                    {toDateStr(chk.plannedDepositDate)}
                  </span>
                </div>
              ))}
              {(alerts.depositedOverdueClear || []).map((chk: any) => (
                <div key={`doc-${chk.id}`} className="flex justify-between text-xs px-2 py-1.5 rounded bg-violet-50 border border-violet-100">
                  <Link href="/bank/check-routing" className="text-violet-900 hover:underline">
                    {chk.checkNumber} (مودع — متأخر تحصيل)
                  </Link>
                  <span className="text-violet-800 font-medium">
                    {Number(chk.amount).toLocaleString("en-US")} ج.م
                  </span>
                </div>
              ))}
              {(alerts.overdueChecks || []).map((chk: any) => (
                <div key={`o-${chk.id}`} className="flex justify-between text-xs px-2 py-1.5 rounded bg-red-50 border border-red-100">
                  <Link href="/bank/check-routing" className="text-red-800 hover:underline">{chk.checkNumber} (متأخر)</Link>
                  <span className="text-red-700 font-medium">
                    {Number(chk.amount).toLocaleString("en-US")} ج.م
                  </span>
                </div>
              ))}
              {alerts.dueChecks.map((chk: any) => (
                <div key={chk.id} className="flex justify-between text-xs px-2 py-1.5 rounded bg-yellow-50 border border-yellow-100">
                  <Link href="/bank/check-routing" className="text-yellow-800 hover:underline">{chk.checkNumber}</Link>
                  <span className="text-yellow-700 font-medium">
                    {Number(chk.amount).toLocaleString("en-US")} ج.م — {toDateStr(chk.dueDate)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {(alerts.overdueSales?.length ?? 0) > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <FileText size={14} className="text-red-700" />
              <span className="text-xs font-semibold text-slate-600">فواتير بيع متأخرة السداد</span>
            </div>
            <div className="space-y-1">
              {alerts.overdueSales.map((inv: any) => (
                <div key={inv.id} className="flex justify-between text-xs px-2 py-1.5 rounded bg-red-50 border border-red-200">
                  <Link href={`/sales/invoices/${inv.id}`} className="text-red-900 hover:underline">{inv.number} — {inv.customerName}</Link>
                  <span className="text-red-700 font-medium">{Number(inv.remaining).toLocaleString("en-US")} ج.م</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {(alerts.creditExceededCustomers?.length ?? 0) > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <Users size={14} className="text-rose-600" />
              <span className="text-xs font-semibold text-slate-600">تجاوز حد الائتمان</span>
            </div>
            <div className="space-y-1">
              {alerts.creditExceededCustomers.map((c: any) => (
                <div key={c.id} className="flex justify-between text-xs px-2 py-1.5 rounded bg-rose-50 border border-rose-100">
                  <Link href={`/contacts/statement?type=customer&id=${c.id}`} className="text-rose-800 hover:underline">{c.name}</Link>
                  <span className="text-rose-700 font-medium">{Number(c.balance).toLocaleString("en-US")} ج.م</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {(alerts.dueInstallments?.length ?? 0) > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <CalendarClock size={14} className="text-indigo-600" />
              <span className="text-xs font-semibold text-slate-600">أقساط مستحقة</span>
            </div>
            <div className="space-y-1">
              {alerts.dueInstallments.map((inst: any) => (
                <div key={inst.id} className={`flex justify-between text-xs px-2 py-1.5 rounded border ${inst.isOverdue ? "bg-red-50 border-red-100" : "bg-indigo-50 border-indigo-100"}`}>
                  <Link href="/loans" className="hover:underline">{inst.partyName} — {inst.loanNumber}</Link>
                  <span className="font-medium">{Number(inst.amount).toLocaleString("en-US")} ج.م</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {alerts.counts.draftDocs > 0 && (
          <div className="text-xs text-slate-600 px-2">
            <Link href="/pending-docs" className="hover:underline" style={{ color: "var(--brass-600)" }}>
              {alerts.counts.draftDocs} مستند مسودة يحتاج مراجعة
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
