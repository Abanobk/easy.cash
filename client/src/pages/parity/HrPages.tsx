import { SimpleEntityPage } from "@/components/SimpleEntityPage";
import { trpc } from "@/lib/trpc";
import ERPLayout from "@/components/ERPLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import {
  useEmployeeOptions, useShiftOptions, useDepartmentOptions, useHrSystemOptions, useVacationTypeOptions,
} from "@/hooks/useEntityOptions";
import { statusBadge } from "@/components/DataTable";
import PermissionGate from "@/components/PermissionGate";
import { toDateStr } from "@/lib/date";

function useEmployees() {
  return trpc.hr.employees.list.useQuery({ limit: 500 });
}

export function HrShifts() {
  const q = trpc.parity.hr.shifts.list.useQuery();
  const c = trpc.parity.hr.shifts.create.useMutation();
  const u = trpc.parity.hr.shifts.update.useMutation();
  const d = trpc.parity.hr.shifts.delete.useMutation();
  return (
    <SimpleEntityPage title="فترات العمل" tableTitle="الورديات" data={q.data as any} isLoading={q.isLoading} onRefresh={() => q.refetch()}
      permissionModule="hr"
      columns={[{ key: "name", label: "الاسم" }, { key: "startTime", label: "من" }, { key: "endTime", label: "إلى" }]}
      fields={[
        { key: "name", label: "الاسم", required: true },
        { key: "startTime", label: "من", type: "time", required: true },
        { key: "endTime", label: "إلى", type: "time", required: true },
      ]}
      onCreate={(v) => c.mutateAsync(v as any)} onUpdate={(id, v) => u.mutateAsync({ id, ...v } as any)} onDelete={(id) => d.mutateAsync(id)} />
  );
}

export function HrVacations() {
  const q = trpc.parity.hr.vacations.list.useQuery();
  const c = trpc.parity.hr.vacations.create.useMutation();
  const u = trpc.parity.hr.vacations.update.useMutation();
  const d = trpc.parity.hr.vacations.delete.useMutation();
  return (
    <SimpleEntityPage title="الإجازات" tableTitle="أنواع الإجازات" data={q.data as any} isLoading={q.isLoading} onRefresh={() => q.refetch()}
      permissionModule="hr"
      columns={[{ key: "name", label: "النوع" }, { key: "daysPerYear", label: "أيام/سنة" }]}
      fields={[{ key: "name", label: "النوع", required: true }, { key: "daysPerYear", label: "أيام بالسنة", type: "number" }]}
      onCreate={(v) => c.mutateAsync({ ...v, daysPerYear: Number(v.daysPerYear || 0) } as any)}
      onUpdate={(id, v) => u.mutateAsync({ id, ...v, daysPerYear: Number(v.daysPerYear || 0) } as any)}
      onDelete={(id) => d.mutateAsync(id)} />
  );
}

export function HrEmployeeShifts() {
  const q = trpc.parity.hr.employeeShifts.list.useQuery();
  const employees = useEmployeeOptions();
  const shifts = useShiftOptions();
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const c = trpc.parity.hr.employeeShifts.create.useMutation();
  const d = trpc.parity.hr.employeeShifts.delete.useMutation();
  const rows = useMemo(() => {
    const all = (q.data || []) as any[];
    if (employeeFilter === "all") return all;
    return all.filter((r) => String(r.employeeId) === employeeFilter);
  }, [q.data, employeeFilter]);
  return (
    <SimpleEntityPage title="نظام الورديات" tableTitle="ورديات الموظفين" data={rows as any} isLoading={q.isLoading} onRefresh={() => q.refetch()}
      permissionModule="hr"
      canEdit={false}
      extraActions={
        <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
          <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="موظف" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الموظفين</SelectItem>
            {employees.map((e) => (
              <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      columns={[
        { key: "employeeName", label: "الموظف" },
        { key: "shiftName", label: "الوردية" },
        { key: "effectiveFrom", label: "من تاريخ", render: (r) => r.effectiveFrom ? toDateStr(r.effectiveFrom) : "—" },
      ]}
      fields={[
        { key: "employeeId", label: "الموظف", type: "select", required: true, options: employees },
        { key: "shiftId", label: "الوردية", type: "select", required: true, options: shifts },
        { key: "effectiveFrom", label: "من تاريخ", type: "date" },
      ]}
      onCreate={(v) => c.mutateAsync({ ...v, employeeId: Number(v.employeeId), shiftId: Number(v.shiftId) } as any)}
      onUpdate={() => {}} onDelete={(id) => d.mutateAsync(id)} />
  );
}

export function HrIncentives() {
  const q = trpc.parity.hr.incentives.list.useQuery();
  const employees = useEmployeeOptions();
  const banksQ = trpc.bank.accounts.list.useQuery();
  const bankOptions = (banksQ.data || []).map((b: any) => ({ value: String(b.id), label: b.name }));
  const c = trpc.parity.hr.incentives.create.useMutation();
  const d = trpc.parity.hr.incentives.delete.useMutation();
  return (
    <SimpleEntityPage title="الحوافز" tableTitle="حوافز الموظفين" data={q.data as any} isLoading={q.isLoading} onRefresh={() => q.refetch()}
      permissionModule="hr"
      canEdit={false}
      columns={[
        { key: "employeeName", label: "الموظف" },
        { key: "amount", label: "المبلغ", render: (r) => `${Number(r.amount).toLocaleString("en-US")} ج.م` },
        { key: "date", label: "التاريخ", render: (r) => toDateStr(r.date) },
        { key: "reason", label: "السبب" },
      ]}
      fields={[
        { key: "employeeId", label: "الموظف", type: "select", required: true, options: employees },
        { key: "amount", label: "المبلغ", required: true },
        { key: "date", label: "التاريخ", type: "date", required: true },
        { key: "reason", label: "السبب", type: "textarea" },
        { key: "settlementMethod", label: "التسوية", type: "select", required: true, options: [
          { value: "cash", label: "صندوق / نقدي" },
          { value: "bank", label: "بنك" },
        ] },
        { key: "bankAccountId", label: "الحساب البنكي (إن بنك)", type: "select", options: bankOptions },
      ]}
      onCreate={(v) => {
        const method = (v.settlementMethod || "cash") as "cash" | "bank";
        if (method === "bank" && !v.bankAccountId) {
          toast.error("اختر الحساب البنكي");
          return Promise.reject(new Error("bank required"));
        }
        return c.mutateAsync({
          employeeId: Number(v.employeeId),
          amount: v.amount,
          date: v.date,
          reason: v.reason || undefined,
          settlementMethod: method,
          bankAccountId: v.bankAccountId ? Number(v.bankAccountId) : undefined,
        } as any);
      }}
      onUpdate={() => {}} onDelete={(id) => d.mutateAsync(id)} />
  );
}

export function HrUnderRequest() {
  const q = trpc.parity.hr.underRequest.list.useQuery();
  const c = trpc.parity.hr.underRequest.create.useMutation();
  const u = trpc.parity.hr.underRequest.update.useMutation();
  const d = trpc.parity.hr.underRequest.delete.useMutation();
  return (
    <SimpleEntityPage title="موظفين تحت الطلب" tableTitle="القائمة" data={q.data as any} isLoading={q.isLoading} onRefresh={() => q.refetch()}
      permissionModule="hr"
      columns={[{ key: "name", label: "الاسم" }, { key: "phone", label: "الهاتف" }, { key: "dailyRate", label: "الأجر اليومي" }]}
      fields={[
        { key: "name", label: "الاسم", required: true },
        { key: "phone", label: "الهاتف" },
        { key: "dailyRate", label: "الأجر اليومي" },
        { key: "notes", label: "ملاحظات", type: "textarea" },
      ]}
      onCreate={(v) => c.mutateAsync(v as any)} onUpdate={(id, v) => u.mutateAsync({ id, ...v } as any)} onDelete={(id) => d.mutateAsync(id)} />
  );
}

export function HrMachines() {
  const q = trpc.parity.hr.machines.list.useQuery();
  const c = trpc.parity.hr.machines.create.useMutation();
  const u = trpc.parity.hr.machines.update.useMutation();
  const d = trpc.parity.hr.machines.delete.useMutation();
  const syncAllMut = trpc.parity.hr.machines.syncAll.useMutation({
    onSuccess: (r) => {
      toast.success(`مزامنة الكل: ${r.successCount} نجح، ${r.failCount} فشل — ${r.totalFetched} بصمة جديدة`);
      q.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <SimpleEntityPage title="ماكينات البصمة" tableTitle="الماكينات" data={q.data as any} isLoading={q.isLoading} onRefresh={() => q.refetch()}
      permissionModule="hr"
      extraActions={
        <Button
          size="sm"
          className="bg-green-600 hover:bg-green-700"
          disabled={syncAllMut.isPending}
          onClick={() => syncAllMut.mutate({})}
        >
          {syncAllMut.isPending ? "جاري المزامنة..." : "مزامنة كل الأجهزة"}
        </Button>
      }
      columns={[
        { key: "name", label: "الاسم" },
        { key: "ipAddress", label: "IP" },
        { key: "port", label: "المنفذ" },
        { key: "commKey", label: "مفتاح الاتصال" },
        { key: "lastSyncAt", label: "آخر مزامنة", render: (r) => r.lastSyncAt ? new Date(String(r.lastSyncAt)).toLocaleString("en-US") : "—" },
      ]}
      fields={[
        { key: "name", label: "الاسم", required: true },
        { key: "ipAddress", label: "عنوان IP" },
        { key: "port", label: "المنفذ", type: "number" },
        { key: "commKey", label: "مفتاح الاتصال (Comm Key)", type: "number" },
      ]}
      onCreate={(v) => c.mutateAsync({
        ...v,
        port: v.port ? Number(v.port) : 4370,
        commKey: v.commKey ? Number(v.commKey) : 0,
      } as any)}
      onUpdate={(id, v) => u.mutateAsync({
        id,
        ...v,
        port: v.port ? Number(v.port) : undefined,
        commKey: v.commKey !== "" && v.commKey != null ? Number(v.commKey) : undefined,
      } as any)}
      onDelete={(id) => d.mutateAsync(id)} />
  );
}

export function HrMobileLocations() {
  const q = trpc.parity.hr.mobileLocations.list.useQuery();
  const c = trpc.parity.hr.mobileLocations.create.useMutation();
  const d = trpc.parity.hr.mobileLocations.delete.useMutation();
  return (
    <SimpleEntityPage title="مواقع بصمة الموبايل" tableTitle="المواقع" data={q.data as any} isLoading={q.isLoading} onRefresh={() => q.refetch()}
      permissionModule="hr"
      columns={[
        { key: "name", label: "الاسم" },
        { key: "latitude", label: "خط العرض" },
        { key: "longitude", label: "خط الطول" },
        { key: "radiusMeters", label: "نصف القطر (م)", render: (r) => r.radiusMeters != null ? String(r.radiusMeters) : "—" },
      ]}
      fields={[
        { key: "name", label: "الاسم", required: true },
        { key: "latitude", label: "خط العرض" },
        { key: "longitude", label: "خط الطول" },
        { key: "radiusMeters", label: "نصف القطر (م)", type: "number" },
      ]}
      onCreate={(v) => c.mutateAsync({ ...v, radiusMeters: v.radiusMeters ? Number(v.radiusMeters) : undefined } as any)}
      onUpdate={() => {}} onDelete={(id) => d.mutateAsync(id)} />
  );
}

export function HrMachineAttendance() {
  const emps = useEmployees();
  const machines = trpc.parity.hr.machines.list.useQuery();
  const punchesQ = trpc.parity.hr.machines.punches.useQuery({ limit: 50 });
  const mut = trpc.parity.hr.machineAttendance.useMutation({ onSuccess: () => { toast.success("تم التسجيل"); punchesQ.refetch(); } });
  const syncMut = trpc.parity.hr.machines.syncCsv.useMutation({
    onSuccess: (r) => { toast.success(`تم استيراد ${r.imported} بصمة وتجميع ${r.aggregated} يوم`); punchesQ.refetch(); machines.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const syncTcpMut = trpc.parity.hr.machines.syncTcp.useMutation({
    onSuccess: (r) => {
      toast.success(`مزامنة TCP: ${r.fetched} بصمة جديدة، ${r.aggregated} يوم حضور (على الجهاز: ${r.totalOnDevice})`);
      punchesQ.refetch();
      machines.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const syncAllMut = trpc.parity.hr.machines.syncAll.useMutation({
    onSuccess: (r) => {
      toast.success(`مزامنة الكل: ${r.successCount} جهاز نجح، ${r.failCount} فشل — ${r.totalFetched} بصمة`);
      punchesQ.refetch();
      machines.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const testMut = trpc.parity.hr.machines.testConnection.useMutation({
    onSuccess: (r) => toast.success(`متصل — مستخدمين: ${r.info.userCounts}، سجلات: ${r.info.logCounts}/${r.info.logCapacity}`),
    onError: (e) => toast.error(e.message),
  });
  const [form, setForm] = useState({ employeeId: "", machineId: "", date: new Date().toISOString().split("T")[0], checkIn: "09:00", checkOut: "17:00" });
  const [csv, setCsv] = useState("enrollCode,datetime\n101,2024-01-15 09:05:00\n101,2024-01-15 17:10:00");
  const [fullSync, setFullSync] = useState(false);

  return (
    <ERPLayout title="الحضور من الماكينة">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="max-w-md"><CardContent className="p-6 space-y-3">
          <h3 className="font-semibold text-sm">تسجيل يدوي</h3>
          <div><Label>الموظف</Label>
            <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v })}>
              <SelectTrigger><SelectValue placeholder="اختر موظف" /></SelectTrigger>
              <SelectContent>{(emps.data?.rows || []).map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.code ? `${e.code} - ` : ""}{e.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>الماكينة</Label>
            <Select value={form.machineId} onValueChange={(v) => setForm({ ...form, machineId: v })}>
              <SelectTrigger><SelectValue placeholder="اختر ماكينة" /></SelectTrigger>
              <SelectContent>{(machines.data || []).map((m: any) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>التاريخ</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>حضور</Label><Input type="time" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} /></div>
            <div><Label>انصراف</Label><Input type="time" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} /></div>
          </div>
          <PermissionGate module="hr" action="create">
            <Button className="w-full" onClick={() => mut.mutate({
              employeeId: Number(form.employeeId),
              date: form.date,
              checkIn: form.checkIn,
              checkOut: form.checkOut,
              machineId: form.machineId ? Number(form.machineId) : undefined,
            })}>تسجيل</Button>
          </PermissionGate>
        </CardContent></Card>

        <Card><CardContent className="p-6 space-y-3">
          <h3 className="font-semibold text-sm">استيراد بصمات من الماكينة (CSV)</h3>
          <p className="text-xs text-slate-500">الصيغة: كود الموظف على الماكينة (employees.code)، التاريخ والوقت. يُجمّع تلقائياً لحضور/انصراف يومي.</p>
          <div><Label>الماكينة</Label>
            <Select value={form.machineId} onValueChange={(v) => setForm({ ...form, machineId: v })}>
              <SelectTrigger><SelectValue placeholder="اختر ماكينة" /></SelectTrigger>
              <SelectContent>{(machines.data || []).map((m: any) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <textarea className="w-full h-32 border rounded-lg p-2 font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} dir="ltr" />
          <div className="flex flex-wrap gap-2">
            <Button className="bg-indigo-600" disabled={!form.machineId || syncMut.isPending}
              onClick={() => syncMut.mutate({ machineId: Number(form.machineId), csvText: csv })}>استيراد CSV</Button>
            <Button className="bg-green-600" disabled={!form.machineId || syncTcpMut.isPending}
              onClick={() => syncTcpMut.mutate({ machineId: Number(form.machineId), fullSync })}>مزامنة مباشرة TCP</Button>
            <Button className="bg-emerald-700" disabled={syncAllMut.isPending}
              onClick={() => syncAllMut.mutate({ fullSync })}>مزامنة كل الأجهزة</Button>
            <Button variant="outline" disabled={!form.machineId || testMut.isPending}
              onClick={() => testMut.mutate(Number(form.machineId))}>اختبار الاتصال</Button>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={fullSync} onChange={(e) => setFullSync(e.target.checked)} />
            مزامنة كاملة (كل السجلات من الماكينة، ليس فقط منذ آخر مزامنة)
          </label>
          <p className="text-xs text-slate-500">المزامنة TCP تسحب البصمات منذ آخر مزامنة. تأكد أن كود الموظف = رقم المستخدم على الماكينة (المنفذ الافتراضي 4370).</p>
        </CardContent></Card>
      </div>

      <Card className="mt-4"><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-800 text-white">
            <th className="px-3 py-2 text-right">الوقت</th>
            <th className="px-3 py-2 text-right">كود البصمة</th>
            <th className="px-3 py-2 text-right">الموظف</th>
          </tr></thead>
          <tbody>
            {(punchesQ.data || []).map((p: any) => (
              <tr key={p.id} className="border-b">
                <td className="px-3 py-2">{new Date(p.punchedAt).toLocaleString("en-US")}</td>
                <td className="px-3 py-2">{p.enrollCode}</td>
                <td className="px-3 py-2">{p.employeeName || p.employeeId || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
    </ERPLayout>
  );
}

export function HrMobileAttendance() {
  const emps = useEmployees();
  const mut = trpc.parity.hr.mobileAttendance.useMutation({ onSuccess: () => toast.success("تم تسجيل البصمة") });
  const [form, setForm] = useState({ employeeId: "", date: new Date().toISOString().split("T")[0], checkIn: new Date().toTimeString().slice(0, 5), latitude: "", longitude: "" });

  const captureLocation = () => {
    if (!navigator.geolocation) return toast.error("المتصفح لا يدعم تحديد الموقع");
    navigator.geolocation.getCurrentPosition(
      (pos) => setForm((f) => ({ ...f, latitude: String(pos.coords.latitude), longitude: String(pos.coords.longitude) })),
      () => toast.error("تعذر الحصول على الموقع"),
    );
  };

  return (
    <ERPLayout title="بصمة من الموبايل">
      <Card className="max-w-md"><CardContent className="p-6 space-y-3">
        <div><Label>الموظف</Label>
          <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v })}>
            <SelectTrigger><SelectValue placeholder="اختر موظف" /></SelectTrigger>
            <SelectContent>{(emps.data?.rows || []).map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>التاريخ</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
        <div><Label>وقت الحضور</Label><Input type="time" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>خط العرض</Label><Input value={form.latitude} readOnly placeholder="—" /></div>
          <div><Label>خط الطول</Label><Input value={form.longitude} readOnly placeholder="—" /></div>
        </div>
        <Button variant="outline" className="w-full" onClick={captureLocation}>تحديد موقعي GPS</Button>
        <PermissionGate module="hr" action="create">
          <Button className="w-full bg-green-600" onClick={() => mut.mutate({
            employeeId: Number(form.employeeId),
            date: form.date,
            checkIn: form.checkIn,
            latitude: form.latitude,
            longitude: form.longitude,
          })}>تسجيل بصمة</Button>
        </PermissionGate>
      </CardContent></Card>
    </ERPLayout>
  );
}

export function HrSystems() {
  const q = trpc.parity.hr.systems.list.useQuery();
  const c = trpc.parity.hr.systems.create.useMutation();
  const d = trpc.parity.hr.systems.delete.useMutation();
  return (
    <SimpleEntityPage title="الأنظمة" tableTitle="أنظمة HR" data={q.data as any} isLoading={q.isLoading} onRefresh={() => q.refetch()}
      permissionModule="hr"
      columns={[{ key: "name", label: "الاسم" }, { key: "description", label: "الوصف" }]}
      fields={[{ key: "name", label: "الاسم", required: true }, { key: "description", label: "الوصف", type: "textarea" }]}
      onCreate={(v) => c.mutateAsync(v as any)} onUpdate={() => {}} onDelete={(id) => d.mutateAsync(id)} />
  );
}

export function HrDepEmpSystems() {
  const q = trpc.parity.hr.depEmpSystems.list.useQuery();
  const systems = useHrSystemOptions();
  const departments = useDepartmentOptions();
  const employees = useEmployeeOptions();
  const c = trpc.parity.hr.depEmpSystems.create.useMutation();
  const d = trpc.parity.hr.depEmpSystems.delete.useMutation();
  return (
    <SimpleEntityPage title="أنظمة الأقسام / الموظفين" tableTitle="الربط" data={q.data as any} isLoading={q.isLoading} onRefresh={() => q.refetch()}
      permissionModule="hr"
      canEdit={false}
      columns={[
        { key: "systemName", label: "النظام" },
        { key: "departmentName", label: "القسم", render: (r) => String(r.departmentName || "—") },
        { key: "employeeName", label: "الموظف", render: (r) => String(r.employeeName || "—") },
      ]}
      fields={[
        { key: "systemId", label: "النظام", type: "select", required: true, options: systems },
        { key: "departmentId", label: "القسم (اختياري)", type: "select", options: departments },
        { key: "employeeId", label: "الموظف (اختياري)", type: "select", options: employees },
      ]}
      onCreate={(v) => c.mutateAsync({
        systemId: Number(v.systemId),
        departmentId: v.departmentId ? Number(v.departmentId) : undefined,
        employeeId: v.employeeId ? Number(v.employeeId) : undefined,
      } as any)}
      onUpdate={() => {}} onDelete={(id) => d.mutateAsync(id)} />
  );
}

export function HrEmployeeVacationRequests() {
  const q = trpc.parity.hr.employeeVacations.list.useQuery();
  const employees = useEmployeeOptions();
  const vacationTypes = useVacationTypeOptions();
  const [statusFilter, setStatusFilter] = useState("all");
  const c = trpc.parity.hr.employeeVacations.create.useMutation();
  const u = trpc.parity.hr.employeeVacations.update.useMutation();
  const d = trpc.parity.hr.employeeVacations.delete.useMutation();

  const rows = useMemo(() => {
    const all = (q.data || []) as any[];
    if (statusFilter === "all") return all;
    return all.filter((r) => String(r.status) === statusFilter);
  }, [q.data, statusFilter]);

  const pendingCount = useMemo(
    () => ((q.data || []) as any[]).filter((r) => r.status === "pending").length,
    [q.data],
  );

  return (
    <SimpleEntityPage
      title="طلبات إجازات الموظفين"
      tableTitle="طلبات الإجازة"
      data={rows as any}
      isLoading={q.isLoading}
      onRefresh={() => q.refetch()}
      permissionModule="hr"
      canEdit={false}
      extraActions={
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-amber-700 whitespace-nowrap">معلّق: {pendingCount}</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="pending">معلق</SelectItem>
              <SelectItem value="approved">معتمد</SelectItem>
              <SelectItem value="rejected">مرفوض</SelectItem>
              <SelectItem value="cancelled">ملغي</SelectItem>
            </SelectContent>
          </Select>
        </div>
      }
      columns={[
        { key: "employeeName", label: "الموظف" },
        { key: "vacationTypeName", label: "نوع الإجازة", render: (r) => String(r.vacationTypeName || "—") },
        { key: "startDate", label: "من", render: (r) => toDateStr(r.startDate) },
        { key: "endDate", label: "إلى", render: (r) => toDateStr(r.endDate) },
        { key: "days", label: "الأيام", render: (r) => r.days != null ? String(r.days) : "—" },
        { key: "status", label: "الحالة", render: (r) => statusBadge(String(r.status)) },
      ]}
      fields={[
        { key: "employeeId", label: "الموظف", type: "select", required: true, options: employees },
        { key: "vacationTypeId", label: "نوع الإجازة", type: "select", options: vacationTypes },
        { key: "startDate", label: "من تاريخ", type: "date", required: true },
        { key: "endDate", label: "إلى تاريخ", type: "date", required: true },
        { key: "notes", label: "ملاحظات", type: "textarea" },
      ]}
      onCreate={(v) => c.mutateAsync({
        ...v,
        employeeId: Number(v.employeeId),
        vacationTypeId: v.vacationTypeId ? Number(v.vacationTypeId) : undefined,
        status: "pending",
      } as any)}
      onUpdate={() => {}}
      onDelete={(id) => d.mutateAsync(id)}
      rowExtraActions={(row) => (
        row.status === "pending" ? (
          <>
            <Button variant="outline" size="sm" className="h-7 text-xs text-green-700"
              onClick={() => u.mutate({ id: Number(row.id), status: "approved" }, { onSuccess: () => q.refetch() })}>
              اعتماد
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs text-red-600"
              onClick={() => u.mutate({ id: Number(row.id), status: "rejected" }, { onSuccess: () => q.refetch() })}>
              رفض
            </Button>
          </>
        ) : null
      )}
    />
  );
}
