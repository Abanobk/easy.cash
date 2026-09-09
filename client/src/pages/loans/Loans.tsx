import { useEffect, useMemo, useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import { DataTable } from "@/components/DataTable";
import { FormModal } from "@/components/FormModal";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Eye, RefreshCw } from "lucide-react";
import EntityPermissionGate from "@/components/EntityPermissionGate";
import { toDateStr } from "@/lib/date";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const emptyForm = {
  type: "received" as "given" | "received",
  partyName: "", amount: "", interestRate: "0",
  startDate: new Date().toISOString().split("T")[0],
  endDate: "", notes: "", installmentCount: "12",
  settlementMethod: "cash" as "cash" | "bank",
  bankAccountId: "",
};

export default function Loans() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState({ type: "all", status: "all" });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [viewId, setViewId] = useState<number | null>(null);
  const [regenCount, setRegenCount] = useState("12");

  useEffect(() => setPage(1), [debouncedSearch]);
  const { data, isLoading, refetch } = trpc.loans.list.useQuery({
    page,
    limit: 20,
    search: debouncedSearch || undefined,
    type: query.type !== "all" ? (query.type as any) : undefined,
    status: query.status !== "all" ? (query.status as any) : undefined,
  });
  const banksQ = trpc.bank.accounts.list.useQuery();
  const detailQ = trpc.loans.get.useQuery(viewId ?? 0, { enabled: !!viewId });
  const createMut = trpc.loans.create.useMutation({
    onSuccess: (r) => {
      toast.success(`تم إضافة القرض ${r.number} مع ${r.installmentCount} قسط وقيد محاسبي`);
      refetch();
      setOpen(false);
      setForm(emptyForm);
    },
    onError: (e) => toast.error(e.message),
  });
  const statusMut = trpc.loans.updateStatus.useMutation({
    onSuccess: () => { toast.success("تم تحديث حالة القرض"); refetch(); if (viewId) detailQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const regenMut = trpc.loans.generateSchedule.useMutation({
    onSuccess: (r) => { toast.success(`تم توليد ${r.count} قسط`); detailQ.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const previewTotal = useMemo(() => {
    const p = Number(form.amount) || 0;
    const r = Number(form.interestRate) || 0;
    return p * (1 + r / 100);
  }, [form.amount, form.interestRate]);

  return (
    <ERPLayout title="القروض">
      <div className="space-y-4">
        <Card className="erp-data-card border-0">
          <CardContent className="p-4 flex flex-wrap gap-3 items-end">
            <div className="space-y-1 flex-1 min-w-[160px]">
              <Label className="text-xs font-bold">بحث</Label>
              <Input className="h-10 font-semibold" placeholder="رقم / جهة..." value={search}
                onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold">النوع</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-10 w-36 font-bold"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="received">مستلم</SelectItem>
                  <SelectItem value="given">ممنوح</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold">الحالة</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10 w-36 font-bold"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="active">نشط</SelectItem>
                  <SelectItem value="paid">مسدد</SelectItem>
                  <SelectItem value="cancelled">ملغي</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="h-10 font-extrabold" onClick={() => { setPage(1); setQuery({ type: typeFilter, status: statusFilter }); }}>بحث</Button>
          </CardContent>
        </Card>

        <DataTable
          title="القروض"
          data={data?.rows}
          isLoading={isLoading}
          total={data?.total}
          page={page}
          onPageChange={setPage}
          onAdd={() => { setForm(emptyForm); setOpen(true); }}
          addLabel="قرض جديد"
          addEntity={{ moduleKey: "loans", entityKey: "loan" }}
          columns={[
            { key: "number", label: "الرقم", className: "w-28" },
            { key: "type", label: "النوع", render: (row: any) => (
              <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${row.type === "received" ? "text-blue-800 bg-blue-100" : "text-emerald-800 bg-emerald-100"}`}>
                {row.type === "received" ? "قرض مستلم" : "قرض ممنوح"}
              </span>
            )},
            { key: "partyName", label: "الجهة" },
            { key: "amount", label: "المبلغ", render: (row: any) => `${Number(row.amount).toLocaleString("en-US")} ج.م` },
            { key: "interestRate", label: "الفائدة", render: (row: any) => row.interestRate ? `${row.interestRate}%` : "—" },
            { key: "startDate", label: "البداية", render: (row: any) => row.startDate ? new Date(row.startDate).toLocaleDateString("en-GB") : "—" },
            { key: "endDate", label: "الانتهاء", render: (row: any) => row.endDate ? new Date(row.endDate).toLocaleDateString("en-GB") : "—" },
            { key: "status", label: "الحالة", render: (row: any) => (
              <span className="text-xs font-bold">{row.status === "active" ? "نشط" : row.status === "paid" ? "مسدد" : "ملغي"}</span>
            )},
          ]}
          actions={(row: any) => (
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="التفاصيل" onClick={() => setViewId(row.id)}>
              <Eye size={15} />
            </Button>
          )}
        />

        {viewId && detailQ.data && (
          <Card className="erp-data-card border-0 border-t-4 border-t-blue-500">
            <CardHeader className="pb-2 flex flex-row justify-between gap-2">
              <div>
                <CardTitle className="text-base font-extrabold">#{detailQ.data.number} — {detailQ.data.partyName}</CardTitle>
                <p className="text-sm font-semibold text-slate-600 mt-1">
                  أصل {Number(detailQ.data.amount).toLocaleString("en-US")} · مدفوع {Number(detailQ.data.paidTotal).toLocaleString("en-US")} · متبقي {Number(detailQ.data.remainingTotal).toLocaleString("en-US")}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setViewId(null)}>إغلاق</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="overflow-x-auto border rounded-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-800 text-white text-xs">
                      <th className="px-3 py-2 text-right">#</th>
                      <th className="px-3 py-2 text-right">الاستحقاق</th>
                      <th className="px-3 py-2 text-right">المبلغ</th>
                      <th className="px-3 py-2 text-right">الحالة</th>
                      <th className="px-3 py-2 text-right">تاريخ الدفع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailQ.data.installments.map((r: any, i: number) => (
                      <tr key={r.id} className="border-t">
                        <td className="px-3 py-2">{i + 1}</td>
                        <td className="px-3 py-2">{toDateStr(r.dueDate)}</td>
                        <td className="px-3 py-2 font-bold">{Number(r.amount).toLocaleString("en-US")}</td>
                        <td className="px-3 py-2">{r.status === "paid" ? "مدفوع" : r.status === "overdue" ? "متأخر" : "معلق"}</td>
                        <td className="px-3 py-2">{r.paidDate ? toDateStr(r.paidDate) : "—"}</td>
                      </tr>
                    ))}
                    {!detailQ.data.installments.length && (
                      <tr><td colSpan={5} className="py-8 text-center text-slate-400">لا أقساط — ولّد جدولاً</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-2 items-end">
                <EntityPermissionGate moduleKey="loans" entityKey="loan" action="edit">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">عدد الأقساط</Label>
                    <Input className="h-9 w-24" value={regenCount} onChange={(e) => setRegenCount(e.target.value)} />
                  </div>
                  <Button size="sm" variant="outline" className="h-9 gap-1" disabled={regenMut.isPending}
                    onClick={() => regenMut.mutate({ loanId: viewId, installmentCount: Number(regenCount) || 12, replaceExisting: true })}>
                    <RefreshCw size={14} /> توليد/إعادة الجدول
                  </Button>
                  {detailQ.data.status === "active" && (
                    <Button size="sm" variant="outline" className="h-9 text-red-700"
                      onClick={() => statusMut.mutate({ id: viewId, status: "cancelled" })}>إلغاء القرض</Button>
                  )}
                </EntityPermissionGate>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <FormModal open={open} onClose={() => { setOpen(false); setForm(emptyForm); }} title="إضافة قرض"
        onSubmit={() => {
          if (!form.partyName.trim() || !form.amount) { toast.error("الجهة والمبلغ مطلوبان"); return; }
          if (form.settlementMethod === "bank" && !form.bankAccountId) {
            toast.error("اختر الحساب البنكي");
            return;
          }
          createMut.mutate({
            type: form.type,
            partyName: form.partyName.trim(),
            amount: form.amount,
            interestRate: form.interestRate || "0",
            startDate: form.startDate,
            endDate: form.endDate || undefined,
            notes: form.notes || undefined,
            installmentCount: Math.max(1, Number(form.installmentCount) || 12),
            settlementMethod: form.settlementMethod,
            bankAccountId: form.bankAccountId ? Number(form.bankAccountId) : undefined,
          });
        }}
        isLoading={createMut.isPending}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">نوع القرض</Label>
            <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v as any }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="received">قرض مستلم</SelectItem>
                <SelectItem value="given">قرض ممنوح</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">الجهة *</Label><Input value={form.partyName} onChange={f("partyName")} placeholder="اسم الجهة أو الشخص" className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">المبلغ *</Label><Input value={form.amount} onChange={f("amount")} type="number" placeholder="0.00" className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">نسبة الفائدة (%)</Label><Input value={form.interestRate} onChange={f("interestRate")} type="number" placeholder="0" className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">عدد الأقساط</Label><Input value={form.installmentCount} onChange={f("installmentCount")} type="number" min={1} className="h-9 text-sm" /></div>
          <div className="text-xs font-bold text-slate-600 self-end pb-2">
            إجمالي مع الفائدة ≈ {previewTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })} ج.م
          </div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">تاريخ البداية</Label><Input type="date" value={form.startDate} onChange={f("startDate")} className="h-9 text-sm" /></div>
          <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">تاريخ الانتهاء (اختياري)</Label><Input type="date" value={form.endDate} onChange={f("endDate")} className="h-9 text-sm" /></div>
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">التسوية *</Label>
            <Select value={form.settlementMethod} onValueChange={v => setForm(p => ({ ...p, settlementMethod: v as any, bankAccountId: "" }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">صندوق / نقدي</SelectItem>
                <SelectItem value="bank">بنك</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.settlementMethod === "bank" && (
            <div>
              <Label className="text-xs font-medium text-slate-700 mb-1.5 block">الحساب البنكي *</Label>
              <Select value={form.bankAccountId} onValueChange={v => setForm(p => ({ ...p, bankAccountId: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر بنك" /></SelectTrigger>
                <SelectContent>
                  {(banksQ.data || []).map((b: any) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="col-span-2 text-xs text-slate-500 font-semibold">
            يُنشأ قيد محاسبي تلقائياً: {form.type === "received" ? "مدين صندوق/بنك — دائن قروض مستلمة" : "مدين قروض ممنوحة — دائن صندوق/بنك"}
          </div>
          <div className="col-span-2"><Label className="text-xs font-medium text-slate-700 mb-1.5 block">ملاحظات</Label><Textarea value={form.notes} onChange={f("notes")} className="text-sm resize-none" rows={2} /></div>
        </div>
      </FormModal>
    </ERPLayout>
  );
}
