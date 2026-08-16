import { useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { DollarSign, Users, Calculator, CheckCircle } from "lucide-react";
import { statusBadge } from "@/components/DataTable";
import PermissionGate from "@/components/PermissionGate";

const months = [
  { value: "1", label: "يناير" }, { value: "2", label: "فبراير" },
  { value: "3", label: "مارس" }, { value: "4", label: "أبريل" },
  { value: "5", label: "مايو" }, { value: "6", label: "يونيو" },
  { value: "7", label: "يوليو" }, { value: "8", label: "أغسطس" },
  { value: "9", label: "سبتمبر" }, { value: "10", label: "أكتوبر" },
  { value: "11", label: "نوفمبر" }, { value: "12", label: "ديسمبر" },
];

export default function Payroll() {
  const currentDate = new Date();
  const [month, setMonth] = useState(String(currentDate.getMonth() + 1));
  const [year, setYear] = useState(String(currentDate.getFullYear()));

  const monthNum = Number(month);
  const yearNum = Number(year);

  const { data: payrollRows, isLoading, refetch } = trpc.hr.payroll.list.useQuery(
    { month: monthNum, year: yearNum },
    { enabled: monthNum >= 1 && monthNum <= 12 && yearNum > 2000 },
  );

  const calculateMut = trpc.hr.payroll.calculate.useMutation({
    onSuccess: (res) => {
      toast.success(`تم احتساب الرواتب — ${res.created} جديد، ${res.updated} محدّث`);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const payMut = trpc.hr.payroll.payMonth.useMutation({
    onSuccess: (res) => {
      toast.success(`تم صرف ${res.paidCount} راتب`);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const totalBasic = payrollRows?.reduce((s, r) => s + Number(r.basicSalary || 0), 0) || 0;
  const totalAllowances = payrollRows?.reduce((s, r) => s + Number(r.allowances || 0), 0) || 0;
  const totalDeductions = payrollRows?.reduce((s, r) => s + Number(r.deductions || 0) + Number(r.advances || 0), 0) || 0;
  const totalNet = payrollRows?.reduce((s, r) => s + Number(r.netSalary || 0), 0) || 0;
  const employeeCount = payrollRows?.length || 0;

  const handleCalculate = () => {
    if (!monthNum || !yearNum) { toast.error("اختر الشهر والسنة"); return; }
    calculateMut.mutate({ month: monthNum, year: yearNum });
  };

  const handlePay = () => {
    if (!payrollRows?.length) { toast.error("احتساب الرواتب أولاً"); return; }
    if (!confirm(`تأكيد صرف رواتب ${months.find(m => m.value === month)?.label} ${year}؟`)) return;
    payMut.mutate({ month: monthNum, year: yearNum });
  };

  return (
    <ERPLayout title="الرواتب">
      <div className="space-y-5">
        <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex-wrap">
          <div className="flex items-center gap-2">
            <Label className="text-xs font-medium text-slate-600 whitespace-nowrap">الشهر:</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="h-8 text-sm w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs font-medium text-slate-600 whitespace-nowrap">السنة:</Label>
            <Input value={year} onChange={e => setYear(e.target.value)} className="h-8 text-sm w-24" />
          </div>
          <PermissionGate module="hr" action="edit">
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs gap-1.5 mr-auto"
              onClick={handleCalculate}
              disabled={calculateMut.isPending}
            >
              <Calculator size={13} />
              {calculateMut.isPending ? "جاري الاحتساب..." : "احتساب الرواتب"}
            </Button>
          </PermissionGate>
          <PermissionGate module="hr" action="edit">
            <Button
              variant="outline"
              className="h-8 text-xs gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
              onClick={handlePay}
              disabled={payMut.isPending || !payrollRows?.length}
            >
              <CheckCircle size={13} />
              {payMut.isPending ? "جاري الصرف..." : "صرف الرواتب"}
            </Button>
          </PermissionGate>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Users size={18} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">عدد الموظفين</p>
                  <p className="text-xl font-bold text-slate-800">{employeeCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <DollarSign size={18} className="text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">إجمالي الأساسي</p>
                  <p className="text-xl font-bold text-slate-800">{totalBasic.toLocaleString("en-US")} ج.م</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                  <Calculator size={18} className="text-red-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">الخصومات والسلف</p>
                  <p className="text-xl font-bold text-slate-800">{totalDeductions.toLocaleString("en-US")} ج.م</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <Calculator size={18} className="text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">صافي الرواتب</p>
                  <p className="text-xl font-bold text-slate-800">{totalNet.toLocaleString("en-US")} ج.م</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-sm font-semibold text-slate-800">
              كشف رواتب شهر {months.find(m => m.value === month)?.label} {year}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-10 text-center text-slate-400 text-sm">جاري التحميل...</div>
            ) : !payrollRows?.length ? (
              <div className="py-10 text-center text-slate-400 text-sm">
                لا توجد سجلات رواتب لهذا الشهر — اضغط «احتساب الرواتب»
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">#</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">اسم الموظف</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">الوظيفة</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">الراتب الأساسي</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">البدلات</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">الخصومات</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">السلف</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">صافي الراتب</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payrollRows.map((row, idx) => (
                      <tr key={row.id} className="border-b border-slate-50 hover:bg-blue-50/30">
                        <td className="px-4 py-2.5 text-slate-500 text-xs">{idx + 1}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-700">{row.employeeName || "—"}</td>
                        <td className="px-4 py-2.5 text-slate-500">{row.jobTitle || "—"}</td>
                        <td className="px-4 py-2.5 text-slate-700">{Number(row.basicSalary).toLocaleString("en-US")} ج.م</td>
                        <td className="px-4 py-2.5 text-green-600">{Number(row.allowances).toLocaleString("en-US")} ج.م</td>
                        <td className="px-4 py-2.5 text-red-500">{Number(row.deductions).toLocaleString("en-US")} ج.م</td>
                        <td className="px-4 py-2.5 text-orange-600">{Number(row.advances).toLocaleString("en-US")} ج.م</td>
                        <td className="px-4 py-2.5 font-semibold text-blue-700">{Number(row.netSalary).toLocaleString("en-US")} ج.م</td>
                        <td className="px-4 py-2.5">
                          {statusBadge(row.status || "draft")}
                          {row.notes && <p className="text-[10px] text-slate-400 mt-0.5">{row.notes}</p>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-blue-50 border-t-2 border-blue-200">
                      <td colSpan={3} className="px-4 py-2.5 font-bold text-slate-700 text-xs">الإجمالي</td>
                      <td className="px-4 py-2.5 font-bold text-slate-700 text-xs">{totalBasic.toLocaleString("en-US")} ج.م</td>
                      <td className="px-4 py-2.5 font-bold text-green-600 text-xs">{totalAllowances.toLocaleString("en-US")} ج.م</td>
                      <td className="px-4 py-2.5 font-bold text-red-500 text-xs">{payrollRows.reduce((s, r) => s + Number(r.deductions), 0).toLocaleString("en-US")} ج.م</td>
                      <td className="px-4 py-2.5 font-bold text-orange-600 text-xs">{payrollRows.reduce((s, r) => s + Number(r.advances), 0).toLocaleString("en-US")} ج.م</td>
                      <td className="px-4 py-2.5 font-bold text-blue-700 text-xs">{totalNet.toLocaleString("en-US")} ج.م</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ERPLayout>
  );
}
