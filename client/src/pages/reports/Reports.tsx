import { useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend
} from "recharts";
import { FileText, TrendingUp, TrendingDown, DollarSign, Package, Users } from "lucide-react";

const COLORS = ["#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed", "#0891b2"];

export default function Reports() {
  const [activeTab, setActiveTab] = useState("financial");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);

  const { data: stats } = trpc.dashboard.stats.useQuery();
  const { data: inventoryItems } = trpc.reports.inventory.useQuery();
  const { data: balanceSheet } = trpc.reports.balanceSheet.useQuery();
  const { data: incomeStatement } = trpc.reports.incomeStatement.useQuery();

  const formatCurrency = (v: number | string) =>
    `${Number(v).toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م`;

  return (
    <ERPLayout title="التقارير المالية">
      <div className="space-y-4">
        {/* Date Filter */}
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-end gap-4 flex-wrap">
              <div>
                <Label className="text-xs font-medium text-slate-700 mb-1.5 block">من تاريخ</Label>
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 text-sm w-40" />
              </div>
              <div>
                <Label className="text-xs font-medium text-slate-700 mb-1.5 block">إلى تاريخ</Label>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 text-sm w-40" />
              </div>
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-6">تطبيق</Button>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-slate-100 h-9">
            <TabsTrigger value="financial" className="text-xs data-[state=active]:bg-white">المالية</TabsTrigger>
            <TabsTrigger value="sales" className="text-xs data-[state=active]:bg-white">المبيعات</TabsTrigger>
            <TabsTrigger value="purchases" className="text-xs data-[state=active]:bg-white">المشتريات</TabsTrigger>
            <TabsTrigger value="inventory" className="text-xs data-[state=active]:bg-white">المخازن</TabsTrigger>
            <TabsTrigger value="balance" className="text-xs data-[state=active]:bg-white">الميزانية</TabsTrigger>
          </TabsList>

          {/* Financial Summary */}
          <TabsContent value="financial" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "إجمالي المبيعات", value: stats?.totalSales, icon: TrendingUp, color: "text-green-600", bg: "bg-green-50" },
                { label: "إجمالي المشتريات", value: stats?.totalPurchases, icon: TrendingDown, color: "text-red-600", bg: "bg-red-50" },
                { label: "صافي الربح", value: incomeStatement?.netProfit ?? (Number(stats?.totalSales || 0) - Number(stats?.totalPurchases || 0)), icon: DollarSign, color: "text-blue-600", bg: "bg-blue-50" },
                { label: "فواتير غير مسددة", value: stats?.unpaidInvoices, icon: FileText, color: "text-orange-600", bg: "bg-orange-50", isCount: true },
              ].map((card, i) => (
                <Card key={i} className="border-0 shadow-sm">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center`}>
                        <card.icon size={18} className={card.color} />
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">{card.label}</p>
                        <p className={`text-lg font-bold ${card.color}`}>
                          {card.isCount ? card.value : formatCurrency(card.value || 0)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Income Statement Summary */}
            {incomeStatement && (
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3 border-b border-slate-100">
                  <CardTitle className="text-sm font-semibold text-slate-800">قائمة الأرباح والخسائر</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-3 max-w-md">
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600">إجمالي الإيرادات</span>
                      <span className="text-sm font-semibold text-green-600">{formatCurrency(incomeStatement.revenue || 0)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600">تكلفة المشتريات</span>
                      <span className="text-sm font-semibold text-red-600">{formatCurrency(incomeStatement.cost || 0)}</span>
                    </div>
                    <div className="flex justify-between py-2 bg-blue-50 px-3 rounded-lg">
                      <span className="text-sm font-bold text-slate-800">صافي الربح / الخسارة</span>
                      <span className={`text-sm font-bold ${Number(incomeStatement.netProfit || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(incomeStatement.netProfit || 0)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Sales Report */}
          <TabsContent value="sales" className="mt-4 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "إجمالي المبيعات", value: stats?.totalSales || 0 },
                { label: "فواتير غير مسددة", value: stats?.unpaidInvoices || 0, isCount: true },
                { label: "صافي الربح", value: incomeStatement?.grossProfit || 0 },
              ].map((c, i) => (
                <Card key={i} className="border-0 shadow-sm">
                  <CardContent className="pt-4 pb-3 text-center">
                    <p className="text-xs text-slate-500 mb-1">{c.label}</p>
                    <p className="text-xl font-bold text-blue-600">{c.isCount ? c.value : formatCurrency(c.value)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100"><CardTitle className="text-sm font-semibold text-slate-800">ملخص المبيعات</CardTitle></CardHeader>
              <CardContent className="pt-4">
                <p className="text-sm text-slate-500">يمكن الاطلاع على تفاصيل المبيعات من صفحة فواتير المبيعات.</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Purchases Report */}
          <TabsContent value="purchases" className="mt-4 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "إجمالي المشتريات", value: stats?.totalPurchases || 0 },
                { label: "تكلفة البضاعة", value: incomeStatement?.cost || 0 },
                { label: "الشيكات المعلقة", value: stats?.pendingChecks || 0, isCount: true },
              ].map((c, i) => (
                <Card key={i} className="border-0 shadow-sm">
                  <CardContent className="pt-4 pb-3 text-center">
                    <p className="text-xs text-slate-500 mb-1">{c.label}</p>
                    <p className="text-xl font-bold text-blue-600">{c.isCount ? c.value : formatCurrency(c.value)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100"><CardTitle className="text-sm font-semibold text-slate-800">ملخص المشتريات</CardTitle></CardHeader>
              <CardContent className="pt-4">
                <p className="text-sm text-slate-500">يمكن الاطلاع على تفاصيل المشتريات من صفحة فواتير الشراء.</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Inventory Report */}
          <TabsContent value="inventory" className="mt-4 space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100"><CardTitle className="text-sm font-semibold text-slate-800">تقرير المخزون</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">الصنف</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">الوحدة</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">الكمية الحالية</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">الحد الأدنى</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">سعر الشراء</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">القيمة الإجمالية</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">الحالة</th>
                  </tr></thead>
                  <tbody>
                    {inventoryItems?.map((row: any, i: number) => {
                      const isLow = Number(row.currentStock) <= Number(row.minStock) && Number(row.minStock) > 0;
                      return (
                        <tr key={i} className={`border-b border-slate-50 hover:bg-blue-50/30 ${isLow ? "bg-red-50/30" : ""}`}>
                          <td className="px-4 py-2.5 text-slate-700 font-medium">{row.name}</td>
                          <td className="px-4 py-2.5 text-slate-500">{row.unit}</td>
                          <td className="px-4 py-2.5 font-semibold">{Number(row.currentStock).toLocaleString("ar-EG")}</td>
                          <td className="px-4 py-2.5 text-slate-500">{Number(row.minStock).toLocaleString("ar-EG")}</td>
                          <td className="px-4 py-2.5 text-slate-600">{formatCurrency(row.purchasePrice || 0)}</td>
                          <td className="px-4 py-2.5 font-semibold text-blue-600">{formatCurrency(Number(row.currentStock) * Number(row.purchasePrice || 0))}</td>
                          <td className="px-4 py-2.5">
                            {isLow ? (
                              <span className="text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full">مخزون منخفض</span>
                            ) : (
                              <span className="text-xs font-medium text-green-600 bg-green-100 px-2 py-0.5 rounded-full">طبيعي</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {(!inventoryItems || inventoryItems.length === 0) && (
                      <tr><td colSpan={7} className="py-8 text-center text-slate-400 text-sm">لا توجد بيانات</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Balance Sheet */}
          <TabsContent value="balance" className="mt-4 space-y-4">
            {balanceSheet && (
              <div className="grid grid-cols-2 gap-4">
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3 border-b border-slate-100">
                    <CardTitle className="text-sm font-semibold text-slate-800">الأصول</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-2">
                    {balanceSheet.assets?.map((a: any, i: number) => (
                      <div key={i} className="flex justify-between py-1.5 border-b border-slate-50">
                        <span className="text-sm text-slate-600">{a.name}</span>
                        <span className="text-sm font-semibold text-slate-800">{formatCurrency(a.balance || 0)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between py-2 bg-blue-50 px-3 rounded-lg mt-2">
                      <span className="text-sm font-bold text-slate-800">إجمالي الأصول</span>
                      <span className="text-sm font-bold text-blue-600">{formatCurrency(balanceSheet.assets.reduce((s: number, a: any) => s + Number(a.balance || 0), 0))}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-sm">
                  <CardHeader className="pb-3 border-b border-slate-100">
                    <CardTitle className="text-sm font-semibold text-slate-800">الخصوم وحقوق الملكية</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-2">
                    {balanceSheet.liabilities?.map((l: any, i: number) => (
                      <div key={i} className="flex justify-between py-1.5 border-b border-slate-50">
                        <span className="text-sm text-slate-600">{l.name}</span>
                        <span className="text-sm font-semibold text-slate-800">{formatCurrency(l.balance || 0)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between py-2 bg-red-50 px-3 rounded-lg mt-2">
                      <span className="text-sm font-bold text-slate-800">إجمالي الخصوم</span>
                      <span className="text-sm font-bold text-red-600">{formatCurrency(balanceSheet.liabilities.reduce((s: number, l: any) => s + Number(l.balance || 0), 0))}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ERPLayout>
  );
}
