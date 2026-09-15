import { useState } from "react";
import { useLocation } from "wouter";
import ERPLayout from "@/components/ERPLayout";
import { DataTable } from "@/components/DataTable";
import { FormModal } from "@/components/FormModal";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { tenantPath, useTenantSlug } from "@/lib/tenant";
import EntityPermissionGate from "@/components/EntityPermissionGate";
import { AccountSearchSelect } from "@/components/AccountSearchSelect";

type JournalListFilters = {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  number?: string;
  search?: string;
};

type JournalLine = {
  accountId: number | undefined;
  debit: string;
  credit: string;
  description: string;
  costCenterId: number | undefined;
};

const emptyLine: JournalLine = { accountId: undefined, debit: "", credit: "", description: "", costCenterId: undefined };

export default function JournalEntries() {
  const [, navigate] = useLocation();
  const tenantSlug = useTenantSlug();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [defaultCostCenterId, setDefaultCostCenterId] = useState<string>("");
  const [lines, setLines] = useState<JournalLine[]>([{ ...emptyLine }, { ...emptyLine }]);
  const [listFilters, setListFilters] = useState<JournalListFilters>({});

  const { data, isLoading, refetch } = trpc.accounts.journal.list.useQuery({
    page,
    limit: 20,
    dateFrom: listFilters.dateFrom,
    dateTo: listFilters.dateTo,
    status: listFilters.status,
    number: listFilters.number,
    search: listFilters.search,
  });
  const { data: accountsList } = trpc.accounts.chart.useQuery();
  const { data: costCentersList } = trpc.costCenters.list.useQuery();
  const createMut = trpc.accounts.journal.create.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ القيد");
      refetch();
      setOpen(false);
      setLines([{ ...emptyLine }, { ...emptyLine }]);
      setDescription("");
      setDefaultCostCenterId("");
    },
    onError: (e) => toast.error(e.message),
  });

  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.001;

  const handleSubmit = () => {
    if (!isBalanced) { toast.error("القيد غير متوازن! يجب أن يتساوى مجموع المدين والدائن"); return; }
    const validLines = lines.filter(l => l.accountId && (Number(l.debit) > 0 || Number(l.credit) > 0));
    if (validLines.length < 2) { toast.error("يجب إدخال سطرين على الأقل"); return; }
    const defaultCc = defaultCostCenterId ? Number(defaultCostCenterId) : undefined;
    createMut.mutate({
      date,
      description,
      lines: validLines.map(l => ({
        accountId: l.accountId!,
        debit: l.debit || "0",
        credit: l.credit || "0",
        description: l.description,
        costCenterId: l.costCenterId ?? defaultCc,
      })),
    });
  };

  const updateLine = (idx: number, field: keyof JournalLine, value: string | number | undefined) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const addLine = () => {
    const defaultCc = defaultCostCenterId ? Number(defaultCostCenterId) : undefined;
    setLines(prev => [...prev, { ...emptyLine, costCenterId: defaultCc }]);
  };

  return (
    <ERPLayout title="قيود اليومية">
      <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 mb-3 space-y-3" dir="rtl">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <div>
            <Label className="text-[10px] text-slate-500">من تاريخ</Label>
            <Input type="date" className="h-8 text-xs" value={listFilters.dateFrom || ""} onChange={(e) => setListFilters((f) => ({ ...f, dateFrom: e.target.value || undefined }))} />
          </div>
          <div>
            <Label className="text-[10px] text-slate-500">الى تاريخ</Label>
            <Input type="date" className="h-8 text-xs" value={listFilters.dateTo || ""} onChange={(e) => setListFilters((f) => ({ ...f, dateTo: e.target.value || undefined }))} />
          </div>
          <div>
            <Label className="text-[10px] text-slate-500">الحالة</Label>
            <Select value={listFilters.status || "all"} onValueChange={(v) => setListFilters((f) => ({ ...f, status: v === "all" ? undefined : v }))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الكل" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="draft">مسودة</SelectItem>
                <SelectItem value="posted">مرحّل</SelectItem>
                <SelectItem value="cancelled">ملغي</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] text-slate-500">رقم القيد</Label>
            <Input className="h-8 text-xs" value={listFilters.number || ""} onChange={(e) => setListFilters((f) => ({ ...f, number: e.target.value || undefined }))} />
          </div>
          <div>
            <Label className="text-[10px] text-slate-500">بحث</Label>
            <Input className="h-8 text-xs" value={listFilters.search || ""} onChange={(e) => setListFilters((f) => ({ ...f, search: e.target.value || undefined }))} placeholder="رقم / بيان / مرجع…" />
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setListFilters({})}>تفريغ</Button>
        </div>
      </div>
      <DataTable
        title="قيود اليومية"
        data={data?.rows}
        isLoading={isLoading}
        total={data?.total}
        page={page}
        onPageChange={setPage}
        onAdd={() => setOpen(true)}
        addLabel="قيد جديد"
        addEntity={{ moduleKey: "accounts", entityKey: "journalEntry" }}
        onRowClick={(row: { id?: number }) => row.id && navigate(tenantPath(tenantSlug, `/accounts/journal/${row.id}`))}
        columns={[
          { key: "number", label: "رقم القيد", className: "w-28" },
          { key: "date", label: "التاريخ", render: (row: any) => row.date ? new Date(row.date).toLocaleDateString("en-GB") : "-" },
          { key: "description", label: "البيان" },
          { key: "totalDebit", label: "إجمالي المدين", render: (row: any) => `${Number(row.totalDebit || 0).toLocaleString("en-US")} ج.م` },
          { key: "status", label: "الحالة", render: (row: any) => (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${row.status === "posted" ? "text-green-600 bg-green-100" : "text-orange-600 bg-orange-100"}`}>
              {row.status === "posted" ? "مرحّل" : "مسودة"}
            </span>
          )},
        ]}
      />

      <FormModal
        open={open}
        onClose={() => { setOpen(false); setLines([{ ...emptyLine }, { ...emptyLine }]); setDefaultCostCenterId(""); }}
        title="إضافة قيد يومية"
        onSubmit={handleSubmit}
        isLoading={createMut.isPending}
        size="xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs font-medium text-slate-700 mb-1.5 block">التاريخ</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs font-medium text-slate-700 mb-1.5 block">البيان</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="وصف القيد" className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs font-medium text-slate-700 mb-1.5 block">مركز تكلفة افتراضي</Label>
              <Select value={defaultCostCenterId || "none"} onValueChange={(v) => setDefaultCostCenterId(v === "none" ? "" : v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="بدون" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون</SelectItem>
                  {(costCentersList || []).map((c: { id: number; name: string }) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-medium text-slate-700">سطور القيد</Label>
              <EntityPermissionGate moduleKey="accounts" entityKey="journalEntry" action="edit">
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addLine}>
                  <Plus size={12} /> إضافة سطر
                </Button>
              </EntityPermissionGate>
            </div>
            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">الحساب</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">مركز التكلفة</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">البيان</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-28">مدين</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-28">دائن</th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx} className="border-b border-slate-100">
                      <td className="px-2 py-1.5">
                        <AccountSearchSelect
                          accounts={accountsList?.filter((a: { isParent?: boolean | null }) => !a.isParent) || []}
                          value={line.accountId?.toString() || ""}
                          onChange={(v) => updateLine(idx, "accountId", Number(v))}
                          placeholder="اختر الحساب"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Select
                          value={line.costCenterId?.toString() || defaultCostCenterId || "none"}
                          onValueChange={v => updateLine(idx, "costCenterId", v === "none" ? undefined : Number(v))}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">بدون</SelectItem>
                            {(costCentersList || []).map((c: { id: number; name: string }) => (
                              <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input value={line.description} onChange={e => updateLine(idx, "description", e.target.value)} className="h-8 text-xs" placeholder="بيان" />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input value={line.debit} onChange={e => updateLine(idx, "debit", e.target.value)} type="number" className="h-8 text-xs" placeholder="0.00" />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input value={line.credit} onChange={e => updateLine(idx, "credit", e.target.value)} type="number" className="h-8 text-xs" placeholder="0.00" />
                      </td>
                      <td className="px-2 py-1.5">
                        {lines.length > 2 && (
                          <EntityPermissionGate moduleKey="accounts" entityKey="journalEntry" action="edit">
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:bg-red-50" onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}>
                              <Trash2 size={12} />
                            </Button>
                          </EntityPermissionGate>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className={`border-t-2 ${isBalanced ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
                    <td colSpan={3} className="px-3 py-2 text-xs font-bold text-slate-700">الإجمالي</td>
                    <td className="px-3 py-2 text-xs font-bold text-blue-600">{totalDebit.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 text-xs font-bold text-blue-600">{totalCredit.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                    <td></td>
                  </tr>
                  {!isBalanced && (
                    <tr className="bg-red-50">
                      <td colSpan={6} className="px-3 py-1.5 text-xs text-red-600 font-medium">
                        القيد غير متوازن — الفرق: {Math.abs(totalDebit - totalCredit).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </FormModal>
    </ERPLayout>
  );
}
