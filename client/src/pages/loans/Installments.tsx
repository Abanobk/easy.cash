import { useEffect, useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import { DataTable } from "@/components/DataTable";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle } from "lucide-react";
import EntityPermissionGate from "@/components/EntityPermissionGate";
import { toDateStr } from "@/lib/date";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

export default function Installments() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState({ status: "all" });
  const [payRow, setPayRow] = useState<any | null>(null);
  const [paidAmount, setPaidAmount] = useState("");
  const [paidDate, setPaidDate] = useState(new Date().toISOString().split("T")[0]);
  const [settlementMethod, setSettlementMethod] = useState<"cash" | "bank">("cash");
  const [bankAccountId, setBankAccountId] = useState("");

  useEffect(() => setPage(1), [debouncedSearch]);
  const { data: allInstallments, isLoading, refetch } = trpc.loans.installments.listAll.useQuery({
    search: debouncedSearch || undefined,
    status: query.status !== "all" ? (query.status as any) : undefined,
  });
  const banksQ = trpc.bank.accounts.list.useQuery(undefined, { enabled: !!payRow });
  const payMut = trpc.loans.installments.pay.useMutation({
    onSuccess: () => {
      toast.success("تم تسجيل دفع القسط مع القيد المحاسبي");
      refetch();
      setPayRow(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const installments = allInstallments || [];
  const pageSize = 20;
  const pageRows = installments.slice((page - 1) * pageSize, page * pageSize);

  const statusBadge = (s: string) => {
    const map: Record<string, { label: string; color: string }> = {
      pending: { label: "معلق", color: "text-orange-800 bg-orange-100" },
      paid: { label: "مدفوع", color: "text-emerald-800 bg-emerald-100" },
      overdue: { label: "متأخر", color: "text-red-800 bg-red-100" },
    };
    const info = map[s] || { label: s, color: "text-slate-700 bg-slate-100" };
    return <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${info.color}`}>{info.label}</span>;
  };

  return (
    <ERPLayout title="الأقساط">
      <div className="space-y-4">
        <Card className="erp-data-card border-0">
          <CardContent className="p-4 flex flex-wrap gap-3 items-end">
            <div className="space-y-1 flex-1 min-w-[160px]">
              <Label className="text-xs font-bold">بحث</Label>
              <Input className="h-10 font-semibold" placeholder="جهة أو رقم قرض..." value={search}
                onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold">الحالة</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-10 w-36 font-bold"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="pending">معلق</SelectItem>
                  <SelectItem value="overdue">متأخر</SelectItem>
                  <SelectItem value="paid">مدفوع</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="h-10 font-extrabold" onClick={() => { setPage(1); setQuery({ status }); }}>بحث</Button>
          </CardContent>
        </Card>

        <DataTable
          title="جدول الأقساط"
          data={pageRows}
          isLoading={isLoading}
          total={installments.length}
          page={page}
          limit={pageSize}
          onPageChange={setPage}
          columns={[
            { key: "loanNumber", label: "رقم القرض", render: (row: any) => row.loanNumber || "—" },
            { key: "loanPartyName", label: "الجهة" },
            { key: "loanType", label: "النوع", render: (row: any) => (
              <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${row.loanType === "received" ? "text-blue-800 bg-blue-100" : "text-emerald-800 bg-emerald-100"}`}>
                {row.loanType === "received" ? "مستلم" : "ممنوح"}
              </span>
            )},
            { key: "dueDate", label: "الاستحقاق", render: (row: any) => row.dueDate ? new Date(row.dueDate).toLocaleDateString("en-GB") : "—" },
            { key: "amount", label: "المبلغ", render: (row: any) => `${Number(row.amount).toLocaleString("en-US")} ج.م` },
            { key: "status", label: "الحالة", render: (row: any) => statusBadge(row.status) },
            { key: "paidDate", label: "تاريخ الدفع", render: (row: any) => row.paidDate ? toDateStr(row.paidDate) : "—" },
          ]}
          actions={(row: any) => row.status !== "paid" ? (
            <EntityPermissionGate moduleKey="installments" entityKey="installment" action="edit">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1 text-emerald-700 hover:bg-emerald-50 font-bold"
                onClick={() => {
                  setPayRow(row);
                  setPaidAmount(String(row.amount));
                  setPaidDate(new Date().toISOString().split("T")[0]);
                  setSettlementMethod("cash");
                  setBankAccountId("");
                }}
              >
                <CheckCircle size={13} /> دفع
              </Button>
            </EntityPermissionGate>
          ) : null}
          emptyMessage="لا توجد أقساط. أضف قروضاً من صفحة القروض ليُولَّد الجدول تلقائياً."
        />
      </div>

      <Dialog open={!!payRow} onOpenChange={() => setPayRow(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="font-extrabold">تسجيل دفع قسط</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="font-semibold text-slate-700">
              {payRow?.loanPartyName} · استحقاق {payRow?.dueDate ? toDateStr(payRow.dueDate) : ""}
            </p>
            <div className="space-y-1">
              <Label className="text-xs font-bold">المبلغ المدفوع</Label>
              <Input className="h-10" type="number" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold">تاريخ الدفع</Label>
              <Input className="h-10" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold">التسوية</Label>
              <Select value={settlementMethod} onValueChange={(v) => { setSettlementMethod(v as any); setBankAccountId(""); }}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">صندوق / نقدي</SelectItem>
                  <SelectItem value="bank">بنك</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {settlementMethod === "bank" && (
              <div className="space-y-1">
                <Label className="text-xs font-bold">الحساب البنكي</Label>
                <Select value={bankAccountId} onValueChange={setBankAccountId}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="اختر بنك" /></SelectTrigger>
                  <SelectContent>
                    {(banksQ.data || []).map((b: any) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPayRow(null)}>إلغاء</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 font-extrabold"
              disabled={payMut.isPending || !paidAmount || (settlementMethod === "bank" && !bankAccountId)}
              onClick={() => payRow && payMut.mutate({
                installmentId: payRow.id,
                paidAmount,
                paidDate,
                settlementMethod,
                bankAccountId: bankAccountId ? Number(bankAccountId) : undefined,
              })}
            >
              تأكيد الدفع
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ERPLayout>
  );
}
