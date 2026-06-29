import React, { useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle, XCircle, Clock, Calendar, Users, Save } from "lucide-react";

type AttendanceStatus = "present" | "absent" | "late" | "half_day" | "holiday";

interface AttendanceRecord {
  employeeId: number;
  employeeName: string;
  status: AttendanceStatus;
  checkIn: string;
  checkOut: string;
  overtime: string;
  notes: string;
}

const statusConfig: Record<AttendanceStatus, { label: string; color: string; icon: React.ReactElement }> = {
  present:  { label: "حاضر",    color: "bg-green-100 text-green-700 border-green-200",  icon: <CheckCircle size={13} /> },
  absent:   { label: "غائب",    color: "bg-red-100 text-red-700 border-red-200",        icon: <XCircle size={13} /> },
  late:     { label: "متأخر",   color: "bg-orange-100 text-orange-700 border-orange-200", icon: <Clock size={13} /> },
  half_day: { label: "نصف يوم", color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: <Clock size={13} /> },
  holiday:  { label: "إجازة",   color: "bg-blue-100 text-blue-700 border-blue-200",     icon: <Calendar size={13} /> },
};

export default function Attendance() {
  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [initialized, setInitialized] = useState(false);

  const { data: employees, isLoading: empLoading } = trpc.hr.employees.list.useQuery({ page: 1, limit: 200 });
  const { data: existingAttendance, refetch } = trpc.hr.attendance.getByDate.useQuery({ date: selectedDate });
  const saveMut = trpc.hr.attendance.saveDay.useMutation({
    onSuccess: () => { toast.success("تم حفظ سجل الحضور بنجاح"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const initRecords = () => {
    if (!employees?.rows) return;
    const existing = existingAttendance || [];
    const recs: AttendanceRecord[] = employees.rows.map((emp: any) => {
      const found = existing.find((a: any) => a.employeeId === emp.id);
      return {
        employeeId: emp.id,
        employeeName: emp.name,
        status: (found?.status as AttendanceStatus) || "present",
        checkIn: found?.checkIn || "09:00",
        checkOut: found?.checkOut || "17:00",
        overtime: found?.overtime?.toString() || "0",
        notes: found?.notes || "",
      };
    });
    setRecords(recs);
    setInitialized(true);
  };

  const updateRecord = (idx: number, field: keyof AttendanceRecord, value: string) => {
    setRecords(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  const setAllStatus = (status: AttendanceStatus) => {
    setRecords(prev => prev.map(r => ({ ...r, status })));
  };

  const handleSave = () => {
    saveMut.mutate({
      date: selectedDate,
      records: records.map(r => ({
        employeeId: r.employeeId,
        status: r.status,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        overtime: Number(r.overtime) || 0,
        notes: r.notes,
      })),
    });
  };

  // Summary stats
  const stats = records.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <ERPLayout title="الحضور والانصراف">
      <div className="space-y-4">
        {/* Header Controls */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-blue-600" />
                <Label className="text-sm font-medium text-slate-700">تاريخ الحضور:</Label>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={e => { setSelectedDate(e.target.value); setInitialized(false); }}
                  className="h-8 text-sm w-40"
                />
              </div>
              <Button
                onClick={initRecords}
                disabled={empLoading}
                className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
              >
                <Users size={13} />
                {initialized ? "إعادة تحميل" : "تحميل الموظفين"}
              </Button>
              {initialized && (
                <>
                  <div className="flex items-center gap-1 mr-auto">
                    <span className="text-xs text-slate-500 ml-2">تحديد الكل:</span>
                    {(Object.keys(statusConfig) as AttendanceStatus[]).map(s => (
                      <button
                        key={s}
                        onClick={() => setAllStatus(s)}
                        className={`text-xs px-2 py-1 rounded border font-medium transition-colors ${statusConfig[s].color}`}
                      >
                        {statusConfig[s].label}
                      </button>
                    ))}
                  </div>
                  <Button
                    onClick={handleSave}
                    disabled={saveMut.isPending}
                    className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white gap-1.5"
                  >
                    <Save size={13} />
                    {saveMut.isPending ? "جاري الحفظ..." : "حفظ الحضور"}
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        {initialized && records.length > 0 && (
          <div className="grid grid-cols-5 gap-3">
            {(Object.keys(statusConfig) as AttendanceStatus[]).map(s => (
              <Card key={s} className="border-0 shadow-sm">
                <CardContent className="p-3 text-center">
                  <div className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border mb-1 ${statusConfig[s].color}`}>
                    {statusConfig[s].icon} {statusConfig[s].label}
                  </div>
                  <div className="text-xl font-bold text-slate-800">{stats[s] || 0}</div>
                  <div className="text-xs text-slate-500">موظف</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Attendance Table */}
        {initialized && records.length > 0 ? (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Users size={15} className="text-blue-600" />
                سجل حضور {new Date(selectedDate).toLocaleDateString("ar-EG", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                <span className="text-xs font-normal text-slate-500 mr-1">({records.length} موظف)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 w-8">#</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">الموظف</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 w-36">الحالة</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 w-28">وقت الحضور</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 w-28">وقت الانصراف</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600 w-24">أوفرتايم (ساعة)</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-600">ملاحظات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((rec, idx) => (
                      <tr key={rec.employeeId} className="border-b border-slate-50 hover:bg-blue-50/20">
                        <td className="px-4 py-2 text-xs text-slate-400">{idx + 1}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-xs">
                              {rec.employeeName.charAt(0)}
                            </div>
                            <span className="font-medium text-slate-700 text-xs">{rec.employeeName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <Select value={rec.status} onValueChange={v => updateRecord(idx, "status", v)}>
                            <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 focus:ring-0">
                              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${statusConfig[rec.status].color}`}>
                                {statusConfig[rec.status].icon} {statusConfig[rec.status].label}
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(statusConfig) as AttendanceStatus[]).map(s => (
                                <SelectItem key={s} value={s}>
                                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${statusConfig[s].color}`}>
                                    {statusConfig[s].label}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-2">
                          <Input
                            type="time"
                            value={rec.checkIn}
                            onChange={e => updateRecord(idx, "checkIn", e.target.value)}
                            disabled={rec.status === "absent" || rec.status === "holiday"}
                            className="h-7 text-xs w-24"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <Input
                            type="time"
                            value={rec.checkOut}
                            onChange={e => updateRecord(idx, "checkOut", e.target.value)}
                            disabled={rec.status === "absent" || rec.status === "holiday"}
                            className="h-7 text-xs w-24"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <Input
                            type="number"
                            value={rec.overtime}
                            onChange={e => updateRecord(idx, "overtime", e.target.value)}
                            min="0"
                            step="0.5"
                            className="h-7 text-xs w-20"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <Input
                            value={rec.notes}
                            onChange={e => updateRecord(idx, "notes", e.target.value)}
                            placeholder="ملاحظة..."
                            className="h-7 text-xs"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : !initialized ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-16 text-center">
              <Users size={40} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">اضغط "تحميل الموظفين" لبدء تسجيل الحضور</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-16 text-center">
              <p className="text-slate-500 text-sm">لا يوجد موظفون مسجلون</p>
            </CardContent>
          </Card>
        )}
      </div>
    </ERPLayout>
  );
}
