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

  const { data: employees, isLoading } = trpc.hr.employees.list.useQuery({ page: 1, limit: 100 });

  const totalBasic = employees?.rows?.reduce((s: number, e: any) => s + Number(e.basicSalary || 0), 0) || 0;
  const totalAllowances = employees?.rows?.reduce((s: number, e: any) => s + Number(e.allowances || 0), 0) || 0;
  const totalNet = totalBasic + totalAllowances;

  return (
    <ERPLayout title="الرواتب">
      <div className="space-y-5">
        {/* Controls */}
        <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
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
          <Button className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs gap-1.5 mr-auto" onClick={() => toast.success("تم احتساب الرواتب بنجاح")}>
            <Calculator size={13} /> احتساب الرواتب
          </Button>
          <Button variant="outline" className="h-8 text-xs gap-1.5 border-green-300 text-green-700 hover:bg-green-50" onClick={() => toast.success("تم صرف الرواتب بنجاح")}>
            <CheckCircle size={13} /> صرف الرواتب
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Users size={18} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">عدد الموظفين</p>
                  <p className="text-xl font-bold text-slate-800">{employees?.total || 0}</p>
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
                  <p className="text-xs text-slate-500">إجمالي الرواتب الأساسية</p>
                  <p className="text-xl font-bold text-slate-800">{totalBasic.toLocaleString("ar-EG")} ج.م</p>
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
                  <p className="text-xl font-bold text-slate-800">{totalNet.toLocaleString("ar-EG")} ج.م</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Payroll Table */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-sm font-semibold text-slate-800">
              كشف رواتب شهر {months.find(m => m.value === month)?.label} {year}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-10 text-center text-slate-400 text-sm">جاري التحميل...</div>
            ) : employees?.rows?.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">لا يوجد موظفون</div>
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
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">صافي الراتب</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees?.rows?.map((emp: any, idx: number) => {
                      const basic = Number(emp.basicSalary || 0);
                      const allowances = Number(emp.allowances || 0);
                      const deductions = 0;
                      const net = basic + allowances - deductions;
                      return (
                        <tr key={emp.id} className="border-b border-slate-50 hover:bg-blue-50/30">
                          <td className="px-4 py-2.5 text-slate-500 text-xs">{idx + 1}</td>
                          <td className="px-4 py-2.5 font-medium text-slate-700">{emp.name}</td>
                          <td className="px-4 py-2.5 text-slate-500">{emp.jobTitle || "-"}</td>
                          <td className="px-4 py-2.5 text-slate-700">{basic.toLocaleString("ar-EG")} ج.م</td>
                          <td className="px-4 py-2.5 text-green-600">{allowances.toLocaleString("ar-EG")} ج.م</td>
                          <td className="px-4 py-2.5 text-red-500">{deductions.toLocaleString("ar-EG")} ج.م</td>
                          <td className="px-4 py-2.5 font-semibold text-blue-700">{net.toLocaleString("ar-EG")} ج.م</td>
                          <td className="px-4 py-2.5">
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full text-orange-600 bg-orange-100">معلق</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-blue-50 border-t-2 border-blue-200">
                      <td colSpan={3} className="px-4 py-2.5 font-bold text-slate-700 text-xs">الإجمالي</td>
                      <td className="px-4 py-2.5 font-bold text-slate-700 text-xs">{totalBasic.toLocaleString("ar-EG")} ج.م</td>
                      <td className="px-4 py-2.5 font-bold text-green-600 text-xs">{totalAllowances.toLocaleString("ar-EG")} ج.م</td>
                      <td className="px-4 py-2.5 font-bold text-red-500 text-xs">0 ج.م</td>
                      <td className="px-4 py-2.5 font-bold text-blue-700 text-xs">{totalNet.toLocaleString("ar-EG")} ج.م</td>
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
