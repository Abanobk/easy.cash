import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { OperationalAlertsPanel } from "@/components/OperationalAlertsPanel";
import { DebtAgingPanel } from "@/components/DebtAgingPanel";
import {
  TrendingUp, TrendingDown, DollarSign, Users, Package,
  ShoppingCart, FileText, ArrowUpRight, ArrowDownRight,
  Banknote, BarChart3, Receipt, UserPlus, PackagePlus, BookOpen, Plus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// ===================== HELPERS =====================

function money(v: unknown) {
  return `${Number(v || 0).toLocaleString("en-US")} ج.م`;
}

function pctChange(curr: number, prev: number): number | null {
  if (!(prev > 0)) return null;
  return ((curr - prev) / prev) * 100;
}

function timeAgo(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "الآن";
  if (min < 60) return `قبل ${min} د`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `قبل ${hr} س`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `قبل ${day} يوم`;
  return d.toLocaleDateString("en-GB");
}

const ACTIVITY_LABEL: Record<string, string> = {
  create: "أضاف",
  update: "عدّل",
  delete: "حذف",
  login: "دخل النظام",
  logout: "خرج من النظام",
  import: "استورد بيانات",
  export: "صدّر بيانات",
  approve: "اعتمد",
  pay: "سجّل دفعة",
  print: "طبع",
};

const ACTIVITY_COLOR: Record<string, string> = {
  create: "linear-gradient(135deg, var(--brass-400), var(--brass-600))",
  update: "linear-gradient(135deg, #d9a542, #b8761a)",
  delete: "linear-gradient(135deg, #d47164, var(--bad-600))",
  login: "linear-gradient(135deg, #4f8f74, var(--good-600))",
  logout: "linear-gradient(135deg, var(--ink-500), var(--ink-700))",
  import: "linear-gradient(135deg, #3f6a80, var(--ink-700))",
  export: "linear-gradient(135deg, var(--ink-500), #244a5c)",
  approve: "linear-gradient(135deg, #4f8f74, var(--good-600))",
  pay: "linear-gradient(135deg, var(--brass-500), var(--brass-600))",
  print: "linear-gradient(135deg, var(--ink-500), var(--ink-700))",
};

const RANK_GRADIENTS = [
  "linear-gradient(135deg, var(--brass-400), var(--brass-600))",
  "linear-gradient(135deg, #3f6a80, var(--ink-700))",
  "linear-gradient(135deg, #4f8f74, var(--good-600))",
  "linear-gradient(135deg, #d9a542, var(--warn-600))",
  "linear-gradient(135deg, #d47164, var(--bad-600))",
];

// ===================== SMALL PIECES =====================

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const points = data.map((v, i) => ({ i, v }));
  return (
    <div className="w-[70px] h-8 shrink-0 opacity-90">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            fill={`url(#spark-${color.replace("#", "")})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function KpiCard({
  title, value, accent, trend, sparkline, sparklineColor, alert, delay,
}: {
  title: string;
  value: string;
  accent: string;
  trend?: number | null;
  sparkline?: number[];
  sparklineColor?: string;
  alert?: boolean;
  delay?: number;
}) {
  const trendUp = (trend ?? 0) >= 0;
  return (
    <div
      className="eca-kpi eca-fade-up p-4"
      style={{ "--eca-tab-color": accent, "--eca-delay": `${delay ?? 0}ms` } as React.CSSProperties}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] font-bold" style={{ color: "var(--muted-foreground)" }}>{title}</p>
        {alert && <span className="w-1.5 h-1.5 rounded-full eca-pulse-dot shrink-0 mt-1" style={{ background: accent }} />}
      </div>
      <div className="flex items-end justify-between gap-2 mt-1.5">
        <p className="font-extrabold tracking-tight tabular-nums leading-tight" style={{ fontSize: "1.5rem", color: "var(--ink-900)" }}>{value}</p>
        {sparkline && sparkline.length > 1 && (
          <Sparkline data={sparkline} color={sparklineColor || accent} />
        )}
      </div>
      {trend != null && (
        <div className="flex items-center gap-1 mt-1.5 text-xs font-bold" style={{ color: trendUp ? "var(--good-600)" : "var(--bad-600)" }}>
          {trendUp ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          {Math.abs(trend).toFixed(1)}٪ عن الشهر السابق
        </div>
      )}
    </div>
  );
}

function QuickAction({ label, icon, href, delay }: { label: string; icon: React.ReactNode; href: string; delay: number }) {
  return (
    <Link href={href}>
      <div
        className="eca-fade-up flex flex-col items-center gap-2.5 p-4 rounded-xl border cursor-pointer transition-all hover:-translate-y-0.5"
        style={{
          "--eca-delay": `${delay}ms`,
          borderColor: "var(--line)",
          background: "var(--paper-50)",
        } as React.CSSProperties}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 10px 24px -14px rgba(18,34,44,0.28)"; e.currentTarget.style.borderColor = "var(--brass-400)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "var(--line)"; }}
      >
        <div className="w-11 h-11 rounded-xl bg-white shadow-sm flex items-center justify-center">
          {icon}
        </div>
        <span className="text-sm font-bold text-center leading-tight" style={{ color: "var(--ink-900)" }}>{label}</span>
      </div>
    </Link>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; fg: string; pulse?: boolean }> = {
    paid: { label: "مدفوعة", bg: "var(--good-100)", fg: "var(--good-600)" },
    partial: { label: "جزئي", bg: "var(--warn-100)", fg: "var(--warn-600)" },
    confirmed: { label: "معلقة", bg: "var(--paper-100)", fg: "var(--ink-700)" },
    draft: { label: "مسودة", bg: "var(--paper-50)", fg: "var(--muted-foreground)" },
  };
  const m = map[status] || map.draft;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full"
      style={{ background: m.bg, color: m.fg }}
    >
      <i className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: m.fg }} />
      {m.label}
    </span>
  );
}

// ===================== CHARTS =====================

function RevenueAreaChart({ data }: { data: { month: string; sales: number; purchases: number }[] }) {
  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center h-[240px] text-slate-400 text-sm">لا توجد بيانات</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c08a28" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#c08a28" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="purchasesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2c5468" stopOpacity={0.24} />
            <stop offset="100%" stopColor="#2c5468" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee7d8" vertical={false} />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#5a6b73" }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 10, fill: "#9aa9ad" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}ك` : v.toString())}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #ddd4bf", direction: "rtl" }}
          formatter={(value: number, name: string) => [money(value), name]}
        />
        <Area type="monotone" dataKey="sales" name="مبيعات" stroke="#c08a28" strokeWidth={2.5} fill="url(#salesFill)" />
        <Area type="monotone" dataKey="purchases" name="مشتريات" stroke="#2c5468" strokeWidth={2.5} fill="url(#purchasesFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function InvoiceStatusDonut({ paid, unpaid, draft }: { paid: number; unpaid: number; draft: number }) {
  const data = [
    { name: "مدفوعة", value: paid, color: "#2f6b4f" },
    { name: "غير مدفوعة", value: unpaid, color: "#a13a2f" },
    { name: "مسودة", value: draft, color: "#b8761a" },
  ].filter((d) => d.value > 0);
  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return <div className="flex items-center justify-center h-[220px] text-slate-400 text-sm">لا توجد فواتير</div>;
  }

  return (
    <div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={150}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={48} outerRadius={70} paddingAngle={3} dataKey="value">
              {data.map((entry, index) => <Cell key={index} fill={entry.color} />)}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #ddd4bf" }} formatter={(value: number) => [value, ""]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[11px] font-bold" style={{ color: "var(--muted-foreground)" }}>الإجمالي</span>
          <span className="text-lg font-extrabold tabular-nums" style={{ color: "var(--ink-900)" }}>{total}</span>
        </div>
      </div>
      <div className="space-y-1.5 mt-3">
        {data.map((d, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
              <span className="font-semibold" style={{ color: "var(--foreground)" }}>{d.name}</span>
            </div>
            <span className="font-bold tabular-nums" style={{ color: "var(--ink-700)" }}>
              {d.value} <span className="font-medium" style={{ color: "var(--muted-foreground)" }}>· {((d.value / total) * 100).toFixed(0)}٪</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===================== PAGE =====================

export default function Dashboard() {
  const { user } = useAuth();
  const { data: stats } = trpc.dashboard.stats.useQuery();
  const { data: charts } = trpc.dashboard.monthlyCharts.useQuery();
  const { data: topProducts } = trpc.dashboard.topProducts.useQuery();
  const { data: activity } = trpc.dashboard.recentActivity.useQuery();

  const chartData = charts?.chartData ?? [];
  const salesTrend = chartData.map((d) => d.sales);
  const purchasesTrend = chartData.map((d) => d.purchases);
  const salesChange = chartData.length >= 2 ? pctChange(chartData[chartData.length - 1].sales, chartData[chartData.length - 2].sales) : null;
  const purchasesChange = chartData.length >= 2 ? pctChange(chartData[chartData.length - 1].purchases, chartData[chartData.length - 2].purchases) : null;

  const firstName = (user?.name || "").trim().split(/\s+/)[0] || "";
  const dayLabel = new Date().toLocaleDateString("ar-EG", { weekday: "long" });
  const dateLabel = new Date().toLocaleDateString("ar-EG", { day: "numeric", month: "long" });

  const quickActions = [
    { label: "فاتورة بيع جديدة", icon: <TrendingUp size={18} style={{ color: "var(--brass-600)" }} />, href: "/sales/invoices" },
    { label: "فاتورة شراء جديدة", icon: <ShoppingCart size={18} style={{ color: "var(--ink-500)" }} />, href: "/purchases/invoices" },
    { label: "استلام نقدية", icon: <Banknote size={18} style={{ color: "var(--good-600)" }} />, href: "/cash/receive" },
    { label: "صرف نقدية", icon: <DollarSign size={18} style={{ color: "var(--bad-600)" }} />, href: "/cash/pay" },
    { label: "عميل جديد", icon: <UserPlus size={18} style={{ color: "var(--ink-500)" }} />, href: "/customers" },
    { label: "صنف جديد", icon: <PackagePlus size={18} style={{ color: "var(--warn-600)" }} />, href: "/items" },
    { label: "قيد يومية", icon: <BookOpen size={18} style={{ color: "var(--brass-600)" }} />, href: "/accounts/journal" },
    { label: "تقرير المبيعات", icon: <BarChart3 size={18} style={{ color: "var(--good-600)" }} />, href: "/reports/accounting" },
  ];

  return (
    <ERPLayout title="لوحة التحكم">
      <div className="space-y-6">
        {/* Welcome */}
        <div className="eca-fade-up bg-white rounded-2xl p-6 border" style={{ borderColor: "var(--line)", boxShadow: "0 1px 2px rgba(18,34,44,0.05), 0 10px 28px -18px rgba(18,34,44,0.18)" }}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-[12px] font-extrabold uppercase tracking-wider mb-1.5" style={{ color: "var(--brass-600)" }}>
                {dayLabel} · {dateLabel}
              </p>
              <h2 className="text-xl font-extrabold mb-1" style={{ color: "var(--ink-900)" }}>
                {firstName ? `أهلاً بيك، ${firstName} 👋` : "مرحباً بك في Easy Cash"}
              </h2>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>ملخص أداء شركتك اليوم</p>
            </div>
            <Link href="/sales/invoices/new">
              <Button className="eca-btn-primary border-0 rounded-xl px-5 h-11 font-bold gap-2">
                <Plus size={18} />
                فاتورة بيع جديدة
              </Button>
            </Link>
          </div>
        </div>

        {/* Primary KPIs — با trend + sparkline حقيقيين */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="إجمالي المبيعات (الشهر)"
            value={stats ? money(stats.totalSales) : "—"}
            accent="var(--brass-500)"
            trend={salesChange}
            sparkline={salesTrend}
            sparklineColor="#c08a28"
            delay={0}
          />
          <KpiCard
            title="إجمالي المشتريات (الشهر)"
            value={stats ? money(stats.totalPurchases) : "—"}
            accent="var(--ink-500)"
            trend={purchasesChange}
            sparkline={purchasesTrend}
            sparklineColor="#2c5468"
            delay={60}
          />
          <KpiCard
            title="فواتير غير مدفوعة"
            value={stats ? stats.unpaidInvoices.toString() : "—"}
            accent="var(--warn-600)"
            alert={!!stats && stats.unpaidInvoices > 0}
            delay={120}
          />
          <KpiCard
            title="عدد العملاء"
            value={stats ? stats.customersCount.toString() : "—"}
            accent="var(--good-600)"
            delay={180}
          />
        </div>

        {/* Secondary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard title="عدد الموردين" value={stats ? stats.suppliersCount.toString() : "—"} accent="var(--ink-500)" delay={0} />
          <KpiCard title="الأصناف في المخزن" value={stats ? stats.itemsCount.toString() : "—"} accent="var(--brass-600)" delay={60} />
          <KpiCard title="الموظفون النشطون" value={stats ? stats.employeesCount.toString() : "—"} accent="var(--good-600)" delay={120} />
          <KpiCard
            title="الشيكات المستحقة"
            value={stats ? stats.pendingChecks.toString() : "—"}
            accent="var(--bad-600)"
            alert={!!stats && stats.pendingChecks > 0}
            delay={180}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <OperationalAlertsPanel />
          <DebtAgingPanel />
        </div>

        {/* Quick Actions */}
        <div>
          <h3 className="text-base font-extrabold mb-3" style={{ color: "var(--ink-900)" }}>إجراءات سريعة</h3>
          <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
            {quickActions.map((action, i) => <QuickAction key={i} {...action} delay={i * 30} />)}
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="eca-card border-0 shadow-none md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2" style={{ color: "var(--ink-900)" }}>
                <BarChart3 size={15} style={{ color: "var(--brass-600)" }} />
                حركة المبيعات والمشتريات — آخر 6 أشهر
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <RevenueAreaChart data={chartData} />
            </CardContent>
          </Card>

          <Card className="eca-card border-0 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2" style={{ color: "var(--ink-900)" }}>
                <TrendingUp size={15} style={{ color: "var(--brass-600)" }} />
                توزيع الفواتير
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <InvoiceStatusDonut
                paid={charts?.invoiceStatus?.paid ?? 0}
                unpaid={charts?.invoiceStatus?.unpaid ?? 0}
                draft={charts?.invoiceStatus?.draft ?? 0}
              />
            </CardContent>
          </Card>
        </div>

        {/* Recent orders + Top products + Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="eca-card border-0 shadow-none lg:col-span-2">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold" style={{ color: "var(--ink-900)" }}>آخر فواتير البيع</CardTitle>
                <Link href="/sales/invoices"><span className="text-xs hover:underline font-bold" style={{ color: "var(--brass-600)" }}>عرض الكل</span></Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {stats?.recentSales && stats.recentSales.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-[11px] font-bold" style={{ borderColor: "var(--line)", color: "var(--muted-foreground)" }}>
                        <th className="text-start font-bold px-5 py-2">رقم الفاتورة</th>
                        <th className="text-start font-bold px-5 py-2">العميل</th>
                        <th className="text-start font-bold px-5 py-2">الإجمالي</th>
                        <th className="text-start font-bold px-5 py-2">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recentSales.map((inv: any) => (
                        <tr key={inv.id} className="border-b last:border-0 transition-colors hover:bg-[var(--paper-100)]" style={{ borderColor: "var(--line)" }}>
                          <td className="px-5 py-3 font-bold" style={{ color: "var(--ink-900)" }}>{inv.number}</td>
                          <td className="px-5 py-3" style={{ color: "var(--foreground)" }}>{inv.customerName || "—"}</td>
                          <td className="px-5 py-3 font-bold tabular-nums" style={{ color: "var(--ink-900)" }}>{money(inv.total)}</td>
                          <td className="px-5 py-3"><StatusChip status={inv.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <FileText size={32} className="mb-2 opacity-30" />
                  <p className="text-sm">لا توجد فواتير حديثة</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="eca-card border-0 shadow-none">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold" style={{ color: "var(--ink-900)" }}>الأكثر مبيعاً هذا الشهر</CardTitle>
                <Link href="/reports/inventory/item-costs"><span className="text-xs hover:underline font-bold" style={{ color: "var(--brass-600)" }}>عرض الكل</span></Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {topProducts && topProducts.length > 0 ? (
                <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
                  {topProducts.map((p, i) => {
                    const rankGradient = RANK_GRADIENTS[i % RANK_GRADIENTS.length];
                    return (
                      <li key={p.itemId} className="flex items-center gap-3 px-5 py-2.5">
                        <span
                          className="w-7 h-7 rounded-lg text-white text-xs font-extrabold flex items-center justify-center shrink-0 shadow-sm"
                          style={{ background: rankGradient }}
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold truncate" style={{ color: "var(--ink-900)" }}>{p.name}</p>
                          <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>{p.code} · {p.qty.toLocaleString("en-US")} وحدة</p>
                        </div>
                        <span className="text-xs font-extrabold tabular-nums shrink-0" style={{ color: "var(--ink-700)" }}>{money(p.value)}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <Package size={32} className="mb-2 opacity-30" />
                  <p className="text-sm">لا توجد مبيعات هذا الشهر</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent purchases + Activity feed */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="eca-card border-0 shadow-none">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold" style={{ color: "var(--ink-900)" }}>آخر فواتير الشراء</CardTitle>
                <Link href="/purchases/invoices"><span className="text-xs hover:underline font-bold" style={{ color: "var(--brass-600)" }}>عرض الكل</span></Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {stats?.recentPurchases && stats.recentPurchases.length > 0 ? (
                <div className="divide-y" style={{ borderColor: "var(--line)" }}>
                  {stats.recentPurchases.map((inv: any) => (
                    <div key={inv.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-sm font-bold" style={{ color: "var(--ink-900)" }}>{inv.number}</p>
                        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{inv.supplierName}</p>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold tabular-nums" style={{ color: "var(--ink-900)" }}>{money(inv.total)}</p>
                        <StatusChip status={inv.status} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <ShoppingCart size={32} className="mb-2 opacity-30" />
                  <p className="text-sm">لا توجد فواتير حديثة</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="eca-card border-0 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold" style={{ color: "var(--ink-900)" }}>آخر الحركات</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {activity && activity.length > 0 ? (
                <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
                  {activity.map((a) => (
                    <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                      <span
                        className="w-8 h-8 rounded-full text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm"
                        style={{ background: ACTIVITY_COLOR[a.action] || "linear-gradient(135deg, var(--ink-500), var(--ink-700))" }}
                      >
                        <TrendingDown size={14} className="rotate-180" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm" style={{ color: "var(--foreground)" }}>
                          <span className="font-bold" style={{ color: "var(--ink-900)" }}>{a.userName || "مستخدم"}</span>{" "}
                          {ACTIVITY_LABEL[a.action] || a.action}
                          {a.details ? <span style={{ color: "var(--muted-foreground)" }}> — {a.details}</span> : null}
                        </p>
                        <p className="text-[11px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>{timeAgo(a.createdAt)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <BarChart3 size={32} className="mb-2 opacity-30" />
                  <p className="text-sm">لا توجد حركات مسجّلة بعد</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ERPLayout>
  );
}
