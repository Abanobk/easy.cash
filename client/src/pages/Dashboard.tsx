import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import {
  TrendingUp, TrendingDown, DollarSign, Users, Package,
  ShoppingCart, AlertCircle, FileText, ArrowUpRight, ArrowDownRight,
  Banknote, CreditCard, BarChart3
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";

function StatCard({
  title, value, subtitle, icon, color, trend, trendValue
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  trend?: "up" | "down";
  trendValue?: string;
}) {
  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm text-slate-500 font-medium mb-1">{title}</p>
            <p className="text-2xl font-bold text-slate-800">{value}</p>
            {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
            {trendValue && (
              <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend === "up" ? "text-green-600" : "text-red-500"}`}>
                {trend === "up" ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {trendValue}
              </div>
            )}
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickAction({ label, icon, href, color }: { label: string; icon: React.ReactNode; href: string; color: string }) {
  return (
    <Link href={href}>
      <div className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed cursor-pointer transition-all hover:border-solid hover:shadow-sm ${color}`}>
        <div className="w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center">
          {icon}
        </div>
        <span className="text-xs font-medium text-center leading-tight">{label}</span>
      </div>
    </Link>
  );
}

// ===================== CHART COMPONENTS =====================

const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

function MonthlySalesChart({ data }: { data: { month: string; sales: number; purchases: number; profit: number }[] }) {
  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center h-[220px] text-slate-400 text-sm">لا توجد بيانات</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}ك` : v.toString()} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0", direction: "rtl" }}
          formatter={(value: number) => [`${value.toLocaleString("ar-EG")} ج.م`, ""]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="sales" name="مبيعات" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="purchases" name="مشتريات" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="profit" name="أرباح" fill="#10b981" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function InvoiceStatusChart({ paid, unpaid, draft }: { paid: number; unpaid: number; draft: number }) {
  const data = [
    { name: "مدفوعة", value: paid, color: "#10b981" },
    { name: "غير مدفوعة", value: unpaid, color: "#ef4444" },
    { name: "مسودة", value: draft, color: "#94a3b8" },
  ].filter(d => d.value > 0);

  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return <div className="flex items-center justify-center h-[220px] text-slate-400 text-sm">لا توجد فواتير</div>;
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
            formatter={(value: number) => [value, ""]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-1.5 mt-2">
        {data.map((d, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
              <span className="text-slate-600">{d.name}</span>
            </div>
            <span className="font-semibold text-slate-700">{d.value}</span>
          </div>
        ))}
        <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-1.5 mt-1">
          <span className="text-slate-500">الإجمالي</span>
          <span className="font-bold text-slate-800">{total}</span>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: stats } = trpc.dashboard.stats.useQuery();
  const { data: charts } = trpc.dashboard.monthlyCharts.useQuery();

  const summaryCards = [
    {
      title: "إجمالي المبيعات",
      value: stats ? `${Number(stats.totalSales).toLocaleString("ar-EG")} ج.م` : "0 ج.م",
      subtitle: "هذا الشهر",
      icon: <TrendingUp size={22} className="text-blue-600" />,
      color: "bg-blue-50",
      trend: "up" as const,
      trendValue: "مبيعات الشهر الحالي",
    },
    {
      title: "إجمالي المشتريات",
      value: stats ? `${Number(stats.totalPurchases).toLocaleString("ar-EG")} ج.م` : "0 ج.م",
      subtitle: "هذا الشهر",
      icon: <ShoppingCart size={22} className="text-purple-600" />,
      color: "bg-purple-50",
    },
    {
      title: "عدد العملاء",
      value: stats ? stats.customersCount.toString() : "0",
      subtitle: "إجمالي العملاء",
      icon: <Users size={22} className="text-green-600" />,
      color: "bg-green-50",
    },
    {
      title: "عدد الموردين",
      value: stats ? stats.suppliersCount.toString() : "0",
      subtitle: "إجمالي الموردين",
      icon: <Users size={22} className="text-orange-600" />,
      color: "bg-orange-50",
    },
    {
      title: "الأصناف في المخزن",
      value: stats ? stats.itemsCount.toString() : "0",
      subtitle: "إجمالي الأصناف",
      icon: <Package size={22} className="text-cyan-600" />,
      color: "bg-cyan-50",
    },
    {
      title: "الموظفون النشطون",
      value: stats ? stats.employeesCount.toString() : "0",
      subtitle: "موظف نشط",
      icon: <Users size={22} className="text-indigo-600" />,
      color: "bg-indigo-50",
    },
    {
      title: "فواتير غير مدفوعة",
      value: stats ? stats.unpaidInvoices.toString() : "0",
      subtitle: "فاتورة معلقة",
      icon: <FileText size={22} className="text-red-500" />,
      color: "bg-red-50",
    },
    {
      title: "الشيكات المستحقة",
      value: stats ? stats.pendingChecks.toString() : "0",
      subtitle: "شيك مستحق",
      icon: <CreditCard size={22} className="text-yellow-600" />,
      color: "bg-yellow-50",
    },
  ];

  const quickActions = [
    { label: "فاتورة بيع جديدة", icon: <TrendingUp size={18} className="text-blue-600" />, href: "/sales/invoices/new", color: "border-blue-200 hover:bg-blue-50 text-blue-700" },
    { label: "فاتورة شراء جديدة", icon: <ShoppingCart size={18} className="text-purple-600" />, href: "/purchases/invoices/new", color: "border-purple-200 hover:bg-purple-50 text-purple-700" },
    { label: "استلام نقدية", icon: <Banknote size={18} className="text-green-600" />, href: "/cash/receive/new", color: "border-green-200 hover:bg-green-50 text-green-700" },
    { label: "صرف نقدية", icon: <DollarSign size={18} className="text-red-500" />, href: "/cash/pay/new", color: "border-red-200 hover:bg-red-50 text-red-700" },
    { label: "عميل جديد", icon: <Users size={18} className="text-cyan-600" />, href: "/contacts/customers/new", color: "border-cyan-200 hover:bg-cyan-50 text-cyan-700" },
    { label: "صنف جديد", icon: <Package size={18} className="text-orange-600" />, href: "/inventory/items/new", color: "border-orange-200 hover:bg-orange-50 text-orange-700" },
    { label: "قيد يومية", icon: <BarChart3 size={18} className="text-indigo-600" />, href: "/accounts/journal/new", color: "border-indigo-200 hover:bg-indigo-50 text-indigo-700" },
    { label: "تقرير المبيعات", icon: <TrendingUp size={18} className="text-teal-600" />, href: "/reports/accounts", color: "border-teal-200 hover:bg-teal-50 text-teal-700" },
  ];

  return (
    <ERPLayout title="لوحة التحكم">
      <div className="space-y-6">
        {/* Welcome */}
        <div className="bg-gradient-to-l from-blue-600 to-blue-700 rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold mb-1">مرحباً بك في Easy Cash</h2>
              <p className="text-blue-100 text-sm">نظام المحاسبة والإدارة المتكامل</p>
            </div>
            <div className="hidden sm:flex items-center gap-3">
              <div className="bg-white/20 rounded-xl px-4 py-2 text-center">
                <div className="text-2xl font-bold">{new Date().getDate()}</div>
                <div className="text-xs text-blue-100">
                  {new Date().toLocaleDateString("ar-EG", { month: "long", year: "numeric" })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div>
          <h3 className="text-base font-semibold text-slate-700 mb-3">ملخص سريع</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {summaryCards.map((card, i) => (
              <StatCard key={i} {...card} />
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h3 className="text-base font-semibold text-slate-700 mb-3">إجراءات سريعة</h3>
          <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
            {quickActions.map((action, i) => (
              <QuickAction key={i} {...action} />
            ))}
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Monthly Sales vs Purchases Chart */}
          <Card className="border-0 shadow-sm md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <BarChart3 size={15} className="text-blue-600" />
                المبيعات والمشتريات - آخر 6 أشهر
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <MonthlySalesChart data={charts?.chartData ?? []} />
            </CardContent>
          </Card>

          {/* Status Pie Chart */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <TrendingUp size={15} className="text-blue-600" />
                توزيع الفواتير
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <InvoiceStatusChart
                paid={charts?.invoiceStatus?.paid ?? 0}
                unpaid={charts?.invoiceStatus?.unpaid ?? 0}
                draft={charts?.invoiceStatus?.draft ?? 0}
              />
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Recent Sales */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-slate-700">آخر فواتير البيع</CardTitle>
                <Link href="/sales/invoices">
                  <span className="text-xs text-blue-600 hover:underline">عرض الكل</span>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {stats?.recentSales && stats.recentSales.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {stats.recentSales.map((inv: any) => (
                    <div key={inv.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{inv.number}</p>
                        <p className="text-xs text-slate-400">{inv.customerName}</p>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-slate-800">{Number(inv.total).toLocaleString("ar-EG")} ج.م</p>
                        <Badge variant="outline" className={`text-xs ${
                          inv.status === "paid" ? "border-green-300 text-green-700 bg-green-50" :
                          inv.status === "partial" ? "border-yellow-300 text-yellow-700 bg-yellow-50" :
                          "border-blue-300 text-blue-700 bg-blue-50"
                        }`}>
                          {inv.status === "paid" ? "مدفوع" : inv.status === "partial" ? "جزئي" : inv.status === "confirmed" ? "مؤكد" : "مسودة"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                  <FileText size={32} className="mb-2 opacity-30" />
                  <p className="text-sm">لا توجد فواتير حديثة</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Purchases */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-slate-700">آخر فواتير الشراء</CardTitle>
                <Link href="/purchases/invoices">
                  <span className="text-xs text-blue-600 hover:underline">عرض الكل</span>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {stats?.recentPurchases && stats.recentPurchases.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {stats.recentPurchases.map((inv: any) => (
                    <div key={inv.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{inv.number}</p>
                        <p className="text-xs text-slate-400">{inv.supplierName}</p>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-slate-800">{Number(inv.total).toLocaleString("ar-EG")} ج.م</p>
                        <Badge variant="outline" className={`text-xs ${
                          inv.status === "paid" ? "border-green-300 text-green-700 bg-green-50" :
                          "border-purple-300 text-purple-700 bg-purple-50"
                        }`}>
                          {inv.status === "paid" ? "مدفوع" : inv.status === "confirmed" ? "مؤكد" : "مسودة"}
                        </Badge>
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
        </div>
      </div>
    </ERPLayout>
  );
}
