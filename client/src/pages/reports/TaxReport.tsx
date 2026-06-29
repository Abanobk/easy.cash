import { useState } from "react";
import { trpc } from "@/lib/trpc";
import ERPLayout from "@/components/ERPLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FileText, TrendingUp, TrendingDown, DollarSign, Search, Printer, Download } from "lucide-react";
import * as XLSX from "xlsx";

export default function TaxReport() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);
  const [queryDates, setQueryDates] = useState({ startDate: firstDay, endDate: lastDay });

  const taxQuery = trpc.reports.tax.useQuery(queryDates);
  const data = taxQuery.data;

  const fmt = (n: number | string | null | undefined) =>
    Number(n ?? 0).toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleSearch = () => setQueryDates({ startDate, endDate });

  const handlePrint = () => window.print();

  const handleExport = () => {
    if (!data) return;
    const salesRows = data.salesInvoices.map(r => ({
      "رقم الفاتورة": r.number,
      "التاريخ": r.date ? new Date(r.date).toLocaleDateString("ar-EG") : "",
      "المبلغ قبل الضريبة": Number(r.subtotal ?? 0).toFixed(2),
      "قيمة الضريبة": Number(r.tax ?? 0).toFixed(2),
      "الإجمالي": Number(r.total ?? 0).toFixed(2),
    }));
    const purchaseRows = data.purchaseInvoices.map(r => ({
      "رقم الفاتورة": r.number,
      "التاريخ": r.date ? new Date(r.date).toLocaleDateString("ar-EG") : "",
      "المبلغ قبل الضريبة": Number(r.subtotal ?? 0).toFixed(2),
      "قيمة الضريبة": Number(r.tax ?? 0).toFixed(2),
      "الإجمالي": Number(r.total ?? 0).toFixed(2),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesRows), "ضريبة المبيعات");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(purchaseRows), "ضريبة المشتريات");
    XLSX.writeFile(wb, `tax-report-${startDate}-${endDate}.xlsx`);
  };

  return (
    <ERPLayout title="تقرير الضرائب">
      <div className="max-w-6xl mx-auto space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between print:hidden">
          <div>
            <h2 className="text-xl font-bold text-slate-800">تقرير ضريبة القيمة المضافة</h2>
            <p className="text-slate-500 text-sm mt-0.5">ملخص الضريبة المحصّلة والمدفوعة خلال الفترة المحددة</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint}>
              <Printer size={14} /> طباعة
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport} disabled={!data}>
              <Download size={14} /> تصدير Excel
            </Button>
          </div>
        </div>

        {/* Date Filter */}
        <Card className="print:hidden">
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[150px]">
                <Label className="text-xs text-slate-600 mb-1 block">من تاريخ</Label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-right" />
              </div>
              <div className="flex-1 min-w-[150px]">
                <Label className="text-xs text-slate-600 mb-1 block">إلى تاريخ</Label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="text-right" />
              </div>
              <Button onClick={handleSearch} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                <Search size={15} /> عرض التقرير
              </Button>
            </div>
          </CardContent>
        </Card>

        {taxQuery.isLoading && (
          <div className="text-center py-12 text-slate-400">جاري تحميل البيانات...</div>
        )}

        {data && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-green-200 bg-green-50">
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-green-600 font-medium">ضريبة المبيعات المحصّلة</p>
                      <p className="text-2xl font-bold text-green-700 mt-1">{fmt(data.summary.totalSalesTax)}</p>
                      <p className="text-xs text-green-500 mt-0.5">{data.summary.salesCount} فاتورة</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                      <TrendingUp size={22} className="text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-red-200 bg-red-50">
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-red-600 font-medium">ضريبة المشتريات المدفوعة</p>
                      <p className="text-2xl font-bold text-red-700 mt-1">{fmt(data.summary.totalPurchaseTax)}</p>
                      <p className="text-xs text-red-500 mt-0.5">{data.summary.purchasesCount} فاتورة</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                      <TrendingDown size={22} className="text-red-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className={`border-2 ${data.summary.netTax >= 0 ? "border-blue-300 bg-blue-50" : "border-orange-300 bg-orange-50"}`}>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-xs font-medium ${data.summary.netTax >= 0 ? "text-blue-600" : "text-orange-600"}`}>
                        {data.summary.netTax >= 0 ? "صافي الضريبة المستحقة للحكومة" : "ضريبة مستردة"}
                      </p>
                      <p className={`text-2xl font-bold mt-1 ${data.summary.netTax >= 0 ? "text-blue-700" : "text-orange-700"}`}>
                        {fmt(Math.abs(data.summary.netTax))}
                      </p>
                      <p className={`text-xs mt-0.5 ${data.summary.netTax >= 0 ? "text-blue-500" : "text-orange-500"}`}>
                        {data.summary.netTax >= 0 ? "يُسدَّد للمصلحة" : "يُسترد من المصلحة"}
                      </p>
                    </div>
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${data.summary.netTax >= 0 ? "bg-blue-100" : "bg-orange-100"}`}>
                      <DollarSign size={22} className={data.summary.netTax >= 0 ? "text-blue-600" : "text-orange-600"} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sales Tax Table */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <FileText size={15} className="text-green-500" />
                  فواتير البيع — الضريبة المحصّلة
                  <Badge variant="secondary" className="mr-auto">{data.salesInvoices.length} فاتورة</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.salesInvoices.length === 0 ? (
                  <p className="text-center text-slate-400 py-8 text-sm">لا توجد فواتير بيع في هذه الفترة</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-right px-4 py-2.5 font-medium text-slate-600">رقم الفاتورة</th>
                          <th className="text-right px-4 py-2.5 font-medium text-slate-600">التاريخ</th>
                          <th className="text-left px-4 py-2.5 font-medium text-slate-600">قبل الضريبة</th>
                          <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-green-700">قيمة الضريبة</th>
                          <th className="text-left px-4 py-2.5 font-medium text-slate-600">الإجمالي</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.salesInvoices.map(inv => (
                          <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-2.5 font-mono text-blue-600">{inv.number}</td>
                            <td className="px-4 py-2.5 text-slate-600">
                              {inv.date ? new Date(inv.date).toLocaleDateString("ar-EG") : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-left">{fmt(inv.subtotal)}</td>
                            <td className="px-4 py-2.5 text-left font-semibold text-green-700">{fmt(inv.tax)}</td>
                            <td className="px-4 py-2.5 text-left font-semibold">{fmt(inv.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-green-50 border-t-2 border-green-200">
                        <tr>
                          <td colSpan={3} className="px-4 py-2.5 font-bold text-slate-700">الإجمالي</td>
                          <td className="px-4 py-2.5 text-left font-bold text-green-700">{fmt(data.summary.totalSalesTax)}</td>
                          <td className="px-4 py-2.5 text-left font-bold">
                            {fmt(data.salesInvoices.reduce((s, r) => s + Number(r.total ?? 0), 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Purchase Tax Table */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <FileText size={15} className="text-red-500" />
                  فواتير الشراء — الضريبة المدفوعة
                  <Badge variant="secondary" className="mr-auto">{data.purchaseInvoices.length} فاتورة</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.purchaseInvoices.length === 0 ? (
                  <p className="text-center text-slate-400 py-8 text-sm">لا توجد فواتير شراء في هذه الفترة</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-right px-4 py-2.5 font-medium text-slate-600">رقم الفاتورة</th>
                          <th className="text-right px-4 py-2.5 font-medium text-slate-600">التاريخ</th>
                          <th className="text-left px-4 py-2.5 font-medium text-slate-600">قبل الضريبة</th>
                          <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-red-700">قيمة الضريبة</th>
                          <th className="text-left px-4 py-2.5 font-medium text-slate-600">الإجمالي</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.purchaseInvoices.map(inv => (
                          <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-2.5 font-mono text-blue-600">{inv.number}</td>
                            <td className="px-4 py-2.5 text-slate-600">
                              {inv.date ? new Date(inv.date).toLocaleDateString("ar-EG") : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-left">{fmt(inv.subtotal)}</td>
                            <td className="px-4 py-2.5 text-left font-semibold text-red-700">{fmt(inv.tax)}</td>
                            <td className="px-4 py-2.5 text-left font-semibold">{fmt(inv.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-red-50 border-t-2 border-red-200">
                        <tr>
                          <td colSpan={3} className="px-4 py-2.5 font-bold text-slate-700">الإجمالي</td>
                          <td className="px-4 py-2.5 text-left font-bold text-red-700">{fmt(data.summary.totalPurchaseTax)}</td>
                          <td className="px-4 py-2.5 text-left font-bold">
                            {fmt(data.purchaseInvoices.reduce((s, r) => s + Number(r.total ?? 0), 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Net Summary */}
            <Card className="border-2 border-slate-300 bg-slate-50 print:border-black">
              <CardContent className="pt-5">
                <h3 className="font-bold text-slate-800 mb-4 text-base">ملخص الإقرار الضريبي</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-slate-200">
                    <span className="text-slate-600">إجمالي الضريبة المحصّلة (مبيعات)</span>
                    <span className="font-semibold text-green-700">{fmt(data.summary.totalSalesTax)} ج.م</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-200">
                    <span className="text-slate-600">إجمالي الضريبة المدفوعة (مشتريات)</span>
                    <span className="font-semibold text-red-700">({fmt(data.summary.totalPurchaseTax)}) ج.م</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center py-2">
                    <span className="font-bold text-slate-800 text-base">
                      {data.summary.netTax >= 0 ? "صافي الضريبة المستحقة للحكومة" : "ضريبة مستردة من الحكومة"}
                    </span>
                    <span className={`font-bold text-xl ${data.summary.netTax >= 0 ? "text-blue-700" : "text-orange-700"}`}>
                      {fmt(Math.abs(data.summary.netTax))} ج.م
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ERPLayout>
  );
}
