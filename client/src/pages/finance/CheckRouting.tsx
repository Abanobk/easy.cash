import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import ERPLayout from "@/components/ERPLayout";
import { FormModal } from "@/components/FormModal";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Download, History, Printer } from "lucide-react";
import { formatBankAccountLabel } from "@/lib/bank-label";
import { Link } from "wouter";
import { tenantPath, useTenantSlug } from "@/lib/tenant";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { toDateStr } from "@/lib/date";

type FilterKey =
  | "unrouted"
  | "in_custody"
  | "scheduled"
  | "overdue_deposit"
  | "at_bank"
  | "completed"
  | "all";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "unrouted", label: "غير موجهة" },
  { key: "in_custody", label: "في الحيازة" },
  { key: "scheduled", label: "موجهة قادمة" },
  { key: "overdue_deposit", label: "متأخرة عن الإيداع" },
  { key: "at_bank", label: "لدى البنك" },
  { key: "completed", label: "مكتملة" },
  { key: "all", label: "الكل" },
];

const STATUS_LABEL: Record<string, string> = {
  unrouted: "غير موجه",
  in_custody: "في الحيازة",
  scheduled: "موجه للإيداع",
  deposited: "لدى البنك",
  cleared: "تم التحصيل",
  rejected: "مرفوض",
};

const EVENT_LABEL: Record<string, string> = {
  created: "إنشاء",
  assign_custody: "تعيين حيازة",
  transfer_custody: "نقل حيازة",
  route: "توجيه",
  update_route: "تعديل توجيه",
  deposit: "إيداع",
  clear: "تحصيل",
  reject: "رفض",
  note: "ملاحظة",
};

function statusBadge(status: string, overdue?: boolean) {
  const label = overdue ? "متأخر عن الإيداع" : (STATUS_LABEL[status] || status);
  const cls =
    status === "unrouted"
      ? "bg-slate-100 text-slate-700"
      : status === "in_custody"
        ? "bg-blue-100 text-blue-800"
        : status === "scheduled"
          ? overdue
            ? "bg-red-100 text-red-800"
            : "bg-amber-100 text-amber-800"
          : status === "deposited"
            ? "bg-violet-100 text-violet-800"
            : status === "cleared"
              ? "bg-green-100 text-green-800"
              : status === "rejected"
                ? "bg-red-100 text-red-700"
                : "bg-slate-100 text-slate-700";
  return <Badge className={`${cls} border-0`}>{label}</Badge>;
}

export default function CheckRouting() {
  const tenantSlug = useTenantSlug();
  const [filter, setFilter] = useState<FilterKey>("unrouted");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [debouncedSearch]);

  const [custodyOpen, setCustodyOpen] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeRoutingId, setActiveRoutingId] = useState<number | null>(null);

  const [custodianUserId, setCustodianUserId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [plannedDepositDate, setPlannedDepositDate] = useState("");
  const [depositDate, setDepositDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const utils = trpc.useUtils();
  const summaryQ = trpc.bank.checkRouting.summary.useQuery();
  const listQ = trpc.bank.checkRouting.list.useQuery({
    filter,
    search: debouncedSearch || undefined,
    page,
    limit: 50,
  });
  const usersQ = trpc.bank.checkRouting.custodians.useQuery();
  const banksQ = trpc.bank.accounts.list.useQuery();
  const eventsQ = trpc.bank.checkRouting.events.useQuery(
    { routingId: activeRoutingId! },
    { enabled: historyOpen && !!activeRoutingId },
  );

  const refresh = () => {
    void utils.bank.checkRouting.summary.invalidate();
    void utils.bank.checkRouting.list.invalidate();
  };

  const assignMut = trpc.bank.checkRouting.assignCustody.useMutation({
    onSuccess: () => {
      toast.success("تم تعيين الحيازة");
      setCustodyOpen(false);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const routeMut = trpc.bank.checkRouting.route.useMutation({
    onSuccess: () => {
      toast.success("تم توجيه الشيك للبنك");
      setRouteOpen(false);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const depositMut = trpc.bank.checkRouting.deposit.useMutation({
    onSuccess: () => {
      toast.success("تم إيداع الشيك وسقطت مسؤولية الحائز — المسؤولية الآن على البنك");
      setDepositOpen(false);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const collectMut = trpc.bank.checkRouting.collect.useMutation({
    onSuccess: () => {
      toast.success("تم تحصيل الشيك");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const rejectMut = trpc.bank.checkRouting.reject.useMutation({
    onSuccess: () => {
      toast.success("تم رفض/إرجاع الشيك");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = listQ.data?.rows || [];
  const summary = summaryQ.data;
  const users = usersQ.data || [];

  const counts = useMemo(() => ({
    unrouted: summary?.unrouted ?? 0,
    in_custody: summary?.inCustody ?? 0,
    scheduled: summary?.scheduled ?? 0,
    overdue_deposit: summary?.overdueDeposit ?? 0,
    at_bank: summary?.atBank ?? 0,
    completed: summary?.completed ?? 0,
    all: (summary?.unrouted ?? 0)
      + (summary?.inCustody ?? 0)
      + (summary?.scheduled ?? 0)
      + (summary?.overdueDeposit ?? 0)
      + (summary?.atBank ?? 0)
      + (summary?.completed ?? 0),
  }), [summary]);

  const openCustody = (routingId: number, current?: number | null) => {
    setActiveRoutingId(routingId);
    setCustodianUserId(current ? String(current) : "");
    setNotes("");
    setCustodyOpen(true);
  };

  const openRoute = (row: any) => {
    setActiveRoutingId(row.routingId);
    setBankAccountId(row.targetBankAccountId ? String(row.targetBankAccountId) : "");
    setPlannedDepositDate(toDateStr(row.plannedDepositDate) || new Date().toISOString().slice(0, 10));
    setCustodianUserId(row.custodianUserId ? String(row.custodianUserId) : "");
    setNotes("");
    setRouteOpen(true);
  };

  const openDeposit = (row: any) => {
    setActiveRoutingId(row.routingId);
    setBankAccountId(row.targetBankAccountId ? String(row.targetBankAccountId) : "");
    setDepositDate(new Date().toISOString().slice(0, 10));
    setNotes("");
    setDepositOpen(true);
  };

  const handleExport = () => {
    if (!rows.length) return;
    const data = rows.map((r: any) => ({
      المرجع: r.number,
      "رقم الشيك": r.checkNumber,
      العميل: r.customerName || "",
      المبلغ: r.amount,
      الاستحقاق: r.dueDate,
      الحائز: r.custodianName || "",
      البنك: r.bankLabel || "",
      "موعد الإيداع": r.plannedDepositDate || "",
      "أيام الحيازة": r.custodyDays,
      الحالة: STATUS_LABEL[r.routingStatus] || r.routingStatus,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "توجيه الشيكات");
    XLSX.writeFile(wb, `check-routing-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <ERPLayout title="توجيه الشيكات">
      <div className="space-y-4" dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-800">توجيه الشيكات الواردة</h1>
            <p className="text-xs text-slate-500 mt-1">
              إدارة الحيازة والمسؤولية والبنك الموجّه إليه — حتى الإيداع ثم التحصيل أو الرفض
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1" onClick={handleExport} disabled={!rows.length}>
              <Download size={14} /> Excel
            </Button>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => window.print()}>
              <Printer size={14} /> طباعة
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => { setFilter(f.key); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                filter === f.key
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {f.label}
              <span className="mr-1 opacity-80">({counts[f.key]})</span>
            </button>
          ))}
        </div>

        <Card className="border-0 shadow-sm print:hidden">
          <CardContent className="p-3 flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs">بحث</Label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="رقم شيك / عميل / مرجع"
                className="h-9"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {listQ.isLoading ? (
              <p className="p-8 text-center text-slate-400 text-sm">جاري التحميل...</p>
            ) : !rows.length ? (
              <p className="p-8 text-center text-slate-400 text-sm">لا توجد شيكات في هذا التبويب</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      <th className="px-3 py-2 text-right font-medium">الشيك</th>
                      <th className="px-3 py-2 text-right font-medium">العميل</th>
                      <th className="px-3 py-2 text-right font-medium">المبلغ</th>
                      <th className="px-3 py-2 text-right font-medium">الاستحقاق</th>
                      <th className="px-3 py-2 text-right font-medium">الحائز</th>
                      <th className="px-3 py-2 text-right font-medium">البنك</th>
                      <th className="px-3 py-2 text-right font-medium">موعد الإيداع</th>
                      <th className="px-3 py-2 text-right font-medium">الحيازة</th>
                      <th className="px-3 py-2 text-right font-medium">الحالة</th>
                      <th className="px-3 py-2 text-right font-medium print:hidden">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row: any, i: number) => (
                      <tr key={row.routingId} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                        <td className="px-3 py-2 border-b border-slate-100">
                          <div className="font-mono text-xs">{row.checkNumber}</div>
                          <div className="text-[10px] text-slate-400">{row.number}</div>
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100">{row.customerName || "—"}</td>
                        <td className="px-3 py-2 border-b border-slate-100 font-medium">
                          {Number(row.amount).toLocaleString("en-US")} ج.م
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap">{row.dueDate || "—"}</td>
                        <td className="px-3 py-2 border-b border-slate-100">{row.custodianName || "—"}</td>
                        <td className="px-3 py-2 border-b border-slate-100">{row.bankLabel || "—"}</td>
                        <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap">{row.plannedDepositDate || "—"}</td>
                        <td className="px-3 py-2 border-b border-slate-100">{row.custodyDays} يوم</td>
                        <td className="px-3 py-2 border-b border-slate-100">
                          {statusBadge(row.routingStatus, row.isOverdueDeposit)}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 print:hidden">
                          <div className="flex flex-wrap gap-1">
                            {["unrouted", "in_custody", "scheduled"].includes(row.routingStatus) && (
                              <>
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openCustody(row.routingId, row.custodianUserId)}>
                                  حيازة
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openRoute(row)}>
                                  توجيه
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 text-xs text-violet-700" onClick={() => openDeposit(row)}>
                                  إيداع
                                </Button>
                              </>
                            )}
                            {row.routingStatus === "deposited" && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs text-green-700"
                                  disabled={collectMut.isPending}
                                  onClick={() => collectMut.mutate({ routingId: row.routingId })}
                                >
                                  تحصيل
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs text-red-700"
                                  disabled={rejectMut.isPending}
                                  onClick={() => {
                                    if (confirm("تأكيد رفض/إرجاع هذا الشيك؟")) {
                                      rejectMut.mutate({ routingId: row.routingId });
                                    }
                                  }}
                                >
                                  رفض
                                </Button>
                              </>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => {
                                setActiveRoutingId(row.routingId);
                                setHistoryOpen(true);
                              }}
                            >
                              <History size={12} className="ml-1" /> سجل
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {(listQ.data?.total ?? 0) > 50 && (
              <div className="flex justify-center gap-2 p-3 border-t">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>السابق</Button>
                <span className="text-xs text-slate-500 self-center">صفحة {page}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page * 50 >= (listQ.data?.total ?? 0)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  التالي
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <FormModal
        open={custodyOpen}
        onClose={() => setCustodyOpen(false)}
        title="تعيين / نقل الحيازة"
        onSubmit={() => {
          if (!activeRoutingId || !custodianUserId) {
            toast.error("اختر المسؤول عن الحيازة");
            return;
          }
          assignMut.mutate({
            routingId: activeRoutingId,
            custodianUserId: Number(custodianUserId),
            notes: notes || undefined,
          });
        }}
        isLoading={assignMut.isPending}
      >
        <div className="space-y-3">
          <div>
            <Label className="text-xs">في حيازة *</Label>
            <Select value={custodianUserId || "none"} onValueChange={(v) => setCustodianUserId(v === "none" ? "" : v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="اختر مستخدم" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">اختر...</SelectItem>
                {users.map((u: any) => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">ملاحظة</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
      </FormModal>

      <FormModal
        open={routeOpen}
        onClose={() => setRouteOpen(false)}
        title="توجيه الشيك للبنك"
        onSubmit={() => {
          if (!activeRoutingId || !bankAccountId || !plannedDepositDate) {
            toast.error("البنك وموعد الإيداع مطلوبان");
            return;
          }
          routeMut.mutate({
            routingId: activeRoutingId,
            bankAccountId: Number(bankAccountId),
            plannedDepositDate,
            custodianUserId: custodianUserId ? Number(custodianUserId) : undefined,
            notes: notes || undefined,
          });
        }}
        isLoading={routeMut.isPending}
      >
        <div className="space-y-3">
          <div>
            <Label className="text-xs">البنك الموجّه إليه *</Label>
            <Select value={bankAccountId || "none"} onValueChange={(v) => setBankAccountId(v === "none" ? "" : v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="اختر بنك" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">اختر...</SelectItem>
                {(banksQ.data || []).map((b: any) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {formatBankAccountLabel(b)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!(banksQ.data || []).length && (
              <p className="text-[11px] text-amber-700 mt-1.5 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
                لا توجد بنوك بعد. أضف حساباً فرعياً تحت «البنوك» في{" "}
                <Link href={tenantPath(tenantSlug, "/accounts/chart")} className="underline font-medium">شجرة الحسابات</Link>
                {" "}وسيظهر هنا تلقائياً.
              </p>
            )}
          </div>
          <div>
            <Label className="text-xs">موعد الإيداع المخطط *</Label>
            <Input type="date" value={plannedDepositDate} onChange={(e) => setPlannedDepositDate(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">الحائز (اختياري)</Label>
            <Select value={custodianUserId || "none"} onValueChange={(v) => setCustodianUserId(v === "none" ? "" : v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="اختياري" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون تغيير</SelectItem>
                {users.map((u: any) => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">ملاحظة</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
      </FormModal>

      <FormModal
        open={depositOpen}
        onClose={() => setDepositOpen(false)}
        title="إيداع الشيك في البنك"
        onSubmit={() => {
          if (!activeRoutingId) return;
          if (!bankAccountId) {
            toast.error("حدد البنك قبل الإيداع");
            return;
          }
          depositMut.mutate({
            routingId: activeRoutingId,
            bankAccountId: Number(bankAccountId),
            depositDate: depositDate || undefined,
            notes: notes || undefined,
          });
        }}
        isLoading={depositMut.isPending}
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-500 bg-violet-50 border border-violet-100 rounded-lg p-2">
            عند الإيداع تسقط مسؤولية الحائز وتنتقل للبنك، ويُنشأ قيد محاسبي (شيكات مودعة تحت التحصيل).
          </p>
          <div>
            <Label className="text-xs">البنك *</Label>
            <Select value={bankAccountId || "none"} onValueChange={(v) => setBankAccountId(v === "none" ? "" : v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="اختر بنك" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">اختر...</SelectItem>
                {(banksQ.data || []).map((b: any) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {formatBankAccountLabel(b)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">تاريخ الإيداع</Label>
            <Input type="date" value={depositDate} onChange={(e) => setDepositDate(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">ملاحظة</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
      </FormModal>

      <FormModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="سجل المسؤولية والحركة"
        onSubmit={() => setHistoryOpen(false)}
        isLoading={false}
        submitLabel="إغلاق"
      >
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {eventsQ.isLoading ? (
            <p className="text-sm text-slate-400 text-center py-6">جاري التحميل...</p>
          ) : !(eventsQ.data || []).length ? (
            <p className="text-sm text-slate-400 text-center py-6">لا يوجد سجل بعد</p>
          ) : (
            (eventsQ.data || []).map((e: any) => (
              <div key={e.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="font-semibold text-slate-700">{EVENT_LABEL[e.eventType] || e.eventType}</span>
                  <span className="text-slate-400">{e.createdAt ? new Date(e.createdAt).toLocaleString("en-US") : ""}</span>
                </div>
                <div className="mt-1 text-slate-600 space-y-0.5">
                  {e.fromUserName && <div>من: {e.fromUserName}</div>}
                  {e.toUserName && <div>إلى: {e.toUserName}</div>}
                  {e.bankAccountName && <div>البنك: {e.bankAccountName}</div>}
                  {e.plannedDepositDate && <div>موعد الإيداع: {e.plannedDepositDate}</div>}
                  {e.performedByName && <div>بواسطة: {e.performedByName}</div>}
                  {e.notes && <div className="text-slate-500">{e.notes}</div>}
                </div>
              </div>
            ))
          )}
        </div>
      </FormModal>
    </ERPLayout>
  );
}
