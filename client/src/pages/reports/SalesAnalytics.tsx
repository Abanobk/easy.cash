import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import ERPLayout from "@/components/ERPLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area
} from "recharts";
import { TrendingUp, Users, Package, DollarSign, ArrowUp, ArrowDown, BarChart2 } from "lucide-react";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1"];

const monthNames: Record<string, string> = {
  "01": "يناير", "02": "فبراير", "03": "مارس", "04": "أبريل",
  "05": "مايو", "06": "يونيو", "07": "يوليو", "08": "أغسطس",
  "09": "سبتمبر", "10": "أكتوبر", "11": "نوفمبر", "12": "ديسمبر"
};

function formatMonth(key: string) {
  const [year, month] = key.split("-");
  return `${monthNames[month] || month} ${year}`;
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat("ar-EG", { style: "decimal", maximumFractionDigits: 0 }).format(val) + " ج.م";
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-sm" dir="rtl">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  );
};

export default function SalesAnalytics() {
  const [months, setMonths] = useState(6);
  const { data, isLoading } = trpc.reports.analytics.useQuery({ months }, {
    refetchOnWindowFocus: false,
  });

  const totalSales = useMemo(() => (data?.monthlySales || []).reduce((s, m) => s + m.sales, 0), [data]);
  const totalInvoices = useMemo(() => (data?.monthlySales || []).reduce((s, m) => s + m.count, 0), [data]);
  const totalProfit = useMemo(() => (data?.comparison || []).reduce((s, m) => s + m.profit, 0), [data]);
  const avgMonthly = useMemo(() => totalSales / Math.max(months, 1), [totalSales, months]);

  const monthlySalesData = useMemo(() =>
    (data?.monthlySales || []).map(m => ({ ...m, name: formatMonth(m.month) })),
    [data]
  );
  const comparisonData = useMemo(() =>
    (data?.comparison || []).map(m => ({ ...m, name: formatMonth(m.month) })),
    [data]
  );

  return (
    <ERPLayout title="تحليلات المبيعات">
      <div className="space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800">تحليلات المبيعات</h2>
            <p className="text-slate-500 text-sm mt-0.5">رؤية شاملة لأداء المبيعات والعملاء والأصناف</p>
          </div>
          <select
            value={months}
            onChange={e => setMonths(Number(e.target.value))}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={3}>آخر 3 أشهر</option>
            <option value={6}>آخر 6 أشهر</option>
            <option value={12}>آخر 12 شهر</option>
          </select>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-blue-100">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-blue-600 font-medium">إجمالي المبيعات</span>
                <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                  <DollarSign size={16} className="text-white" />
                </div>
              </div>
              <div className="text-xl font-bold text-blue-800">{formatCurrency(totalSales)}</div>
              <div className="text-xs text-blue-600 mt-1">{totalInvoices} فاتورة</div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-gradient-to-br from-green-50 to-green-100">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-green-600 font-medium">صافي الربح</span>
                <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                  <TrendingUp size={16} className="text-white" />
                </div>
              </div>
              <div className="text-xl font-bold text-green-800">{formatCurrency(totalProfit)}</div>
              <div className="flex items-center gap-1 text-xs mt-1">
                {totalProfit >= 0
                  ? <><ArrowUp size={12} className="text-green-600" /><span className="text-green-600">إيجابي</span></>
                  : <><ArrowDown size={12} className="text-red-600" /><span className="text-red-600">سلبي</span></>
                }
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-gradient-to-br from-purple-50 to-purple-100">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-purple-600 font-medium">متوسط شهري</span>
                <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
                  <BarChart2 size={16} className="text-white" />
                </div>
              </div>
              <div className="text-xl font-bold text-purple-800">{formatCurrency(avgMonthly)}</div>
              <div className="text-xs text-purple-600 mt-1">لآخر {months} أشهر</div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm bg-gradient-to-br from-amber-50 to-amber-100">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-amber-600 font-medium">أفضل العملاء</span>
                <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
                  <Users size={16} className="text-white" />
                </div>
              </div>
              <div className="text-xl font-bold text-amber-800">{data?.topCustomers?.length || 0}</div>
              <div className="text-xs text-amber-600 mt-1">عميل نشط</div>
            </CardContent>
          </Card>
        </div>

        {/* Monthly Sales Chart */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <TrendingUp size={15} className="text-blue-500" />
              المبيعات الشهرية
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-64 flex items-center justify-center text-slate-400">جاري التحميل...</div>
            ) : monthlySalesData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-slate-400">لا توجد بيانات في هذه الفترة</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={monthlySalesData}>
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={v => (v / 1000).toFixed(0) + "k"} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="sales" name="المبيعات" stroke="#3b82f6" fill="url(#salesGrad)" strokeWidth={2} dot={{ r: 4, fill: "#3b82f6" }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Comparison Chart */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <BarChart2 size={15} className="text-blue-500" />
              مقارنة المبيعات والمشتريات والأرباح
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-64 flex items-center justify-center text-slate-400">جاري التحميل...</div>
            ) : comparisonData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-slate-400">لا توجد بيانات</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={comparisonData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={v => (v / 1000).toFixed(0) + "k"} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Bar dataKey="sales" name="المبيعات" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="purchases" name="المشتريات" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="profit" name="الربح" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Customers */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Users size={15} className="text-purple-500" />
                أفضل 10 عملاء
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-48 flex items-center justify-center text-slate-400">جاري التحميل...</div>
              ) : !data?.topCustomers?.length ? (
                <div className="h-48 flex items-center justify-center text-slate-400">لا توجد بيانات</div>
              ) : (
                <div className="space-y-2">
                  {data.topCustomers.map((c, i) => (
                    <div key={c.id} className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-sm font-medium text-slate-700 truncate">{c.name}</span>
                          <span className="text-xs text-slate-500 mr-2 flex-shrink-0">{formatCurrency(c.total)}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div
                            className="bg-purple-500 h-1.5 rounded-full"
                            style={{ width: `${(c.total / (data.topCustomers[0]?.total || 1)) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Items */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Package size={15} className="text-amber-500" />
                أكثر 10 أصناف مبيعاً
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-48 flex items-center justify-center text-slate-400">جاري التحميل...</div>
              ) : !data?.topItems?.length ? (
                <div className="h-48 flex items-center justify-center text-slate-400">لا توجد بيانات</div>
              ) : (
                <div className="space-y-2">
                  {data.topItems.map((item, i) => (
                    <div key={item.id} className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-sm font-medium text-slate-700 truncate">{item.name}</span>
                          <span className="text-xs text-slate-500 mr-2 flex-shrink-0">{formatCurrency(item.total)}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div
                            className="bg-amber-500 h-1.5 rounded-full"
                            style={{ width: `${(item.total / (data.topItems[0]?.total || 1)) * 100}%` }}
                          />
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">الكمية: {item.qty.toLocaleString("ar-EG")}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Items Pie Chart */}
        {data?.topItems && data.topItems.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Package size={15} className="text-blue-500" />
                توزيع المبيعات حسب الأصناف
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col lg:flex-row items-center gap-6">
                <ResponsiveContainer width={280} height={220}>
                  <PieChart>
                    <Pie
                      data={data.topItems.slice(0, 6)}
                      dataKey="total"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={({ name, percent }) => `${name.substring(0, 8)} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={false}
                    >
                      {data.topItems.slice(0, 6).map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 grid grid-cols-2 gap-2">
                  {data.topItems.slice(0, 6).map((item, i) => (
                    <div key={item.id} className="flex items-center gap-2 text-sm">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-slate-600 truncate">{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ERPLayout>
  );
}
