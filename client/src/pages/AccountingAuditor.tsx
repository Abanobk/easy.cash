import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Gavel,
  Info,
  Loader2,
  Printer,
  RefreshCw,
  Save,
  Scale,
  ShieldAlert,
  ShieldQuestion,
  ShieldX,
} from "lucide-react";
import ERPLayout from "@/components/ERPLayout";
import EntityPermissionGate from "@/components/EntityPermissionGate";
import AuditNarrativeReport from "@/components/audit/AuditNarrativeReport";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { tenantPath, useTenantSlug } from "@/lib/tenant";
import { printAccountingAuditReport } from "@/lib/print-audit-report";
import { Link } from "wouter";
import { toast } from "sonner";
import { toDateStr } from "@/lib/date";
import { PartySearchSelect } from "@/components/PartySearchSelect";
import { BankAccountSearchSelect } from "@/components/BankAccountSearchSelect";

type Severity = "critical" | "warning" | "info";
type Tab = "report" | "uploads" | "policy";

const severityMeta: Record<Severity, { label: string; className: string; Icon: typeof ShieldAlert }> = {
  critical: { label: "حرج", className: "bg-red-600 text-white", Icon: ShieldAlert },
  warning: { label: "تحذير", className: "bg-amber-500 text-white", Icon: AlertTriangle },
  info: { label: "معلومة", className: "bg-sky-600 text-white", Icon: Info },
};

type OpinionType = "unqualified" | "qualified" | "adverse" | "disclaimer";
const opinionMeta: Record<OpinionType, { className: string; ring: string; Icon: typeof Gavel }> = {
  unqualified: { className: "bg-emerald-600 text-white", ring: "border-emerald-200 bg-emerald-50", Icon: CheckCircle2 },
  qualified: { className: "bg-amber-500 text-white", ring: "border-amber-200 bg-amber-50", Icon: ShieldQuestion },
  adverse: { className: "bg-red-600 text-white", ring: "border-red-200 bg-red-50", Icon: ShieldX },
  disclaimer: { className: "bg-slate-500 text-white", ring: "border-slate-200 bg-slate-50", Icon: ShieldQuestion },
};

type PolicyForm = {
  targetGrossMarginPct: number;
  targetNetMarginPct: number;
  maxArDays: number;
  maxApDays: number;
  minCashReserveEgp: number;
  debtProvisionAfterDays: number;
  debtProvisionRate: number;
  defaultDepreciationRate: number;
  bankVarianceToleranceEgp: number;
  materialityEgp: number;
  notes: string;
};

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("فشل قراءة الملف"));
    reader.readAsDataURL(file);
  });
}

export default function AccountingAuditorPage() {
  const tenantSlug = useTenantSlug();
  const [tab, setTab] = useState<Tab>("report");
  const [ran, setRan] = useState(false);
  const [policy, setPolicy] = useState<PolicyForm | null>(null);
  const [bankAccountId, setBankAccountId] = useState<string>("");
  const [stmtKind, setStmtKind] = useState<"customer" | "supplier" | "customs" | "tax" | "other">("customer");
  const [stmtTitle, setStmtTitle] = useState("");
  const [stmtPartyId, setStmtPartyId] = useState("");
  const [detailImportId, setDetailImportId] = useState<number | null>(null);
  const [partyDetailImportId, setPartyDetailImportId] = useState<number | null>(null);
  const bankFileRef = useRef<HTMLInputElement>(null);
  const otherFileRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const policyQuery = trpc.accountingAuditor.getPolicy.useQuery();
  const banksQuery = trpc.accountingAuditor.bankAccounts.useQuery();
  const uploadsQuery = trpc.accountingAuditor.listUploads.useQuery();
  const customersQuery = trpc.customers.all.useQuery();
  const suppliersQuery = trpc.suppliers.all.useQuery();
  const detailQuery = trpc.accountingAuditor.bankStatementDetail.useQuery(
    { importId: detailImportId || 0 },
    { enabled: !!detailImportId },
  );
  const partyDetailQuery = trpc.accountingAuditor.partyStatementDetail.useQuery(
    { importId: partyDetailImportId || 0 },
    { enabled: !!partyDetailImportId },
  );

  const savePolicyMut = trpc.accountingAuditor.savePolicy.useMutation({
    onSuccess: (data) => {
      setPolicy({ ...data, notes: data.notes || "" });
      toast.success("تم حفظ سياسة المراجعة");
    },
    onError: (e) => toast.error(e.message),
  });

  const uploadBankMut = trpc.accountingAuditor.uploadBankStatement.useMutation({
    onSuccess: (r) => {
      toast.success(`تم رفع الكشف: مطابق ${r.matchedCount} من ${r.lineCount}`);
      utils.accountingAuditor.listUploads.invalidate();
      setDetailImportId(r.importId);
    },
    onError: (e) => toast.error(e.message),
  });

  const uploadOtherMut = trpc.accountingAuditor.uploadStatement.useMutation({
    onSuccess: (r: any) => {
      if (r && typeof r.matchedCount === "number") {
        toast.success(`تم رفع الكشف ومطابقته: مطابق ${r.matchedCount} من ${r.lineCount} · حركات عندنا بدون مقابل ${r.systemOnlyCount ?? 0}`);
        setPartyDetailImportId(r.importId);
      } else {
        toast.success("تم رفع الكشف للمراجع");
      }
      utils.accountingAuditor.listUploads.invalidate();
      setStmtTitle("");
      setStmtPartyId("");
    },
    onError: (e) => toast.error(e.message),
  });

  const closeMut = trpc.accountingAuditor.setFindingStatus.useMutation({
    onSuccess: () => toast.success("تم تحديث حالة الملاحظة"),
    onError: (e) => toast.error(e.message),
  });

  const runMut = trpc.accountingAuditor.run.useMutation({
    onSuccess: () => {
      setRan(true);
      setTab("report");
    },
  });

  useEffect(() => {
    if (policyQuery.data && !policy) setPolicy({ ...policyQuery.data, notes: policyQuery.data.notes || "" });
  }, [policyQuery.data, policy]);

  useEffect(() => {
    if (!bankAccountId && banksQuery.data?.[0]?.id) setBankAccountId(String(banksQuery.data[0].id));
  }, [banksQuery.data, bankAccountId]);

  const report = runMut.data;
  const loading = runMut.isPending;

  const onBankFile = async (file?: File | null) => {
    if (!file || !bankAccountId) {
      toast.error("اختر البنك أولاً");
      return;
    }
    const contentBase64 = await readFileAsBase64(file);
    uploadBankMut.mutate({
      bankAccountId: Number(bankAccountId),
      fileName: file.name,
      contentBase64,
    });
  };

  const isPartyKind = stmtKind === "customer" || stmtKind === "supplier";

  const onOtherFile = async (file?: File | null) => {
    if (!file) return;
    if (isPartyKind && !stmtPartyId) {
      toast.error(stmtKind === "customer" ? "اختر العميل أولاً" : "اختر المورد أولاً");
      return;
    }
    const contentBase64 = await readFileAsBase64(file);
    uploadOtherMut.mutate({
      kind: stmtKind,
      title: stmtTitle.trim() || file.name,
      fileName: file.name,
      partyId: isPartyKind && stmtPartyId ? Number(stmtPartyId) : undefined,
      contentBase64,
    });
  };

  return (
    <ERPLayout title="مراجع الحسابات الذكي">
      <EntityPermissionGate
        moduleKey="ai_tools"
        entityKey="accountingAuditor"
        action="viewDoc"
        fallback={<p className="text-sm text-slate-500">لا توجد صلاحية لعرض مراجعة الحسابات.</p>}
      >
        <div className="mx-auto max-w-5xl space-y-5">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-bl from-slate-900 via-slate-800 to-slate-900 text-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-5">
              <div className="max-w-2xl">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] text-slate-200">
                  <Scale size={14} className="text-emerald-300" />
                  مكتب محاسبة + كشوف + إقفال + سيولة
                </div>
                <h2 className="text-xl font-semibold tracking-tight">مراجعة شاملة باحتراف</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  ارفع كشوف البنك/العملاء/الموردين/الجمارك، شغّل المراجعة العميقة، اقفل الملاحظات، وطبع تقرير PDF رسمي.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {report ? (
                  <Button
                    variant="outline"
                    size="lg"
                    className="h-11 border-white/20 bg-white/5 text-white hover:bg-white/10 gap-2"
                    onClick={() =>
                      printAccountingAuditReport({
                        companyName: "Easy Cash",
                        narrative: report.narrative,
                        generatedAt: report.generatedAt,
                        summary: report.summary,
                        opinion: report.opinion,
                        trialBalance: report.trialBalance,
                        income: report.income,
                        liquidity: report.coverage?.liquidity,
                        findings: report.findings,
                      })
                    }
                  >
                    <Printer size={16} />
                    PDF
                  </Button>
                ) : null}
                <Button
                  size="lg"
                  className="h-11 gap-2 bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                  disabled={loading}
                  onClick={() => runMut.mutate({ withAi: true })}
                >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  {loading ? "جاري المراجعة..." : ran ? "إعادة المراجعة" : "ابدأ المراجعة العميقة"}
                </Button>
              </div>
            </div>
            {report ? (
              <div className="grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-4">
                <Stat label="حرج مفتوح" value={report.summary.critical} tone="critical" />
                <Stat label="تحذير مفتوح" value={report.summary.warning} tone="warning" />
                <Stat label="معلومة" value={report.summary.info} tone="info" />
                <Stat label="كل الملاحظات" value={report.summary.total} tone="total" />
              </div>
            ) : null}
          </section>

          <div className="flex flex-wrap gap-2">
            {([
              ["report", "التقرير"],
              ["uploads", "رفع الكشوف"],
              ["policy", "سياسة الشركة"],
            ] as const).map(([id, label]) => (
              <Button
                key={id}
                size="sm"
                variant={tab === id ? "default" : "outline"}
                className="h-9"
                onClick={() => setTab(id)}
              >
                {label}
              </Button>
            ))}
          </div>

          {tab === "policy" && policy ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-800">سياسة المراجعة</h3>
                <Button size="sm" className="gap-1.5" disabled={savePolicyMut.isPending} onClick={() => savePolicyMut.mutate(policy)}>
                  <Save size={14} /> حفظ
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <NumField label="هدف هامش مجمل %" value={policy.targetGrossMarginPct} onChange={(v) => setPolicy({ ...policy, targetGrossMarginPct: v })} />
                <NumField label="هدف هامش صافي %" value={policy.targetNetMarginPct} onChange={(v) => setPolicy({ ...policy, targetNetMarginPct: v })} />
                <NumField label="أقصى أيام دين عملاء" value={policy.maxArDays} onChange={(v) => setPolicy({ ...policy, maxArDays: v })} />
                <NumField label="أقصى أيام دين موردين" value={policy.maxApDays} onChange={(v) => setPolicy({ ...policy, maxApDays: v })} />
                <NumField label="حد سيولة أدنى (ج)" value={policy.minCashReserveEgp} onChange={(v) => setPolicy({ ...policy, minCashReserveEgp: v })} />
                <NumField label="مخصص ديون بعد (يوم)" value={policy.debtProvisionAfterDays} onChange={(v) => setPolicy({ ...policy, debtProvisionAfterDays: v })} />
                <NumField label="نسبة مخصص (0.05=5%)" value={policy.debtProvisionRate} onChange={(v) => setPolicy({ ...policy, debtProvisionRate: v })} step="0.01" />
                <NumField label="إهلاك افتراضي" value={policy.defaultDepreciationRate} onChange={(v) => setPolicy({ ...policy, defaultDepreciationRate: v })} step="0.01" />
                <NumField label="تحمل فرق بنك" value={policy.bankVarianceToleranceEgp} onChange={(v) => setPolicy({ ...policy, bankVarianceToleranceEgp: v })} />
                <NumField label="الأهمية النسبية" value={policy.materialityEgp} onChange={(v) => setPolicy({ ...policy, materialityEgp: v })} />
              </div>
              <Textarea rows={2} value={policy.notes} onChange={(e) => setPolicy({ ...policy, notes: e.target.value })} placeholder="ملاحظات السياسة" />
            </section>
          ) : null}

          {tab === "uploads" ? (
            <section className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><FileUp size={16} /> كشف حساب بنكي (PDF / Excel / CSV)</h3>
                <p className="text-xs text-slate-500">معظم كشوف البنوك PDF — ارفع الملف مباشرة. الأفضل PDF نصي من الإنترنت بنكنج (مش صورة ممسوحة ضوئياً).</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label className="text-xs">البنك</Label>
                    <BankAccountSearchSelect
                      accounts={banksQuery.data || []}
                      value={bankAccountId}
                      onChange={setBankAccountId}
                      placeholder="اختر بنك"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">ملف الكشف</Label>
                    <Input
                      ref={bankFileRef}
                      className="mt-1 h-9"
                      type="file"
                      accept=".pdf,.xlsx,.xls,.csv,.txt,application/pdf"
                      onChange={(e) => void onBankFile(e.target.files?.[0])}
                    />
                  </div>
                </div>
                {uploadBankMut.isPending ? <p className="text-xs text-slate-500">جاري قراءة الملف والمطابقة (قد تستغرق PDF لحظات)…</p> : null}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                <h3 className="text-sm font-semibold text-slate-800">كشف عميل / مورد / جمارك / ضريبة</h3>
                {isPartyKind ? (
                  <p className="text-xs text-slate-500">
                    اختيار العميل/المورد بيفعّل مطابقة حقيقية لكشفه مع دفتره في البرنامج — مش مجرد أرشفة.
                  </p>
                ) : null}
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <Label className="text-xs">النوع</Label>
                    <Select value={stmtKind} onValueChange={(v) => { setStmtKind(v as typeof stmtKind); setStmtPartyId(""); }}>
                      <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="customer">عميل</SelectItem>
                        <SelectItem value="supplier">مورد</SelectItem>
                        <SelectItem value="customs">جمارك</SelectItem>
                        <SelectItem value="tax">ضريبة</SelectItem>
                        <SelectItem value="other">أخرى</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {isPartyKind ? (
                    <div>
                      <Label className="text-xs">{stmtKind === "customer" ? "العميل" : "المورد"}</Label>
                      <PartySearchSelect
                        parties={(stmtKind === "customer" ? customersQuery.data : suppliersQuery.data) || []}
                        value={stmtPartyId}
                        onChange={setStmtPartyId}
                        placeholder={stmtKind === "customer" ? "اختر عميل" : "اختر مورد"}
                      />
                    </div>
                  ) : null}
                  <div className={isPartyKind ? "" : "md:col-span-2"}>
                    <Label className="text-xs">عنوان</Label>
                    <Input className="mt-1 h-9" value={stmtTitle} onChange={(e) => setStmtTitle(e.target.value)} placeholder="مثال: كشف عميل أحمد — أغسطس" />
                  </div>
                  <div className="md:col-span-3">
                    <Label className="text-xs">الملف</Label>
                    <Input
                      ref={otherFileRef}
                      className="mt-1 h-9"
                      type="file"
                      accept=".pdf,.xlsx,.xls,.csv,.txt,application/pdf"
                      onChange={(e) => void onOtherFile(e.target.files?.[0])}
                    />
                  </div>
                </div>
                {uploadOtherMut.isPending ? <p className="text-xs text-slate-500">جاري قراءة الملف{isPartyKind ? " والمطابقة" : ""}…</p> : null}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="mb-3 text-sm font-semibold text-slate-800">الكشوف المرفوعة</h3>
                <div className="space-y-2 text-sm">
                  {(uploadsQuery.data?.banks || []).map((b) => (
                    <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <div>
                        <p className="font-medium">{b.fileName}</p>
                        <p className="text-xs text-slate-500">مطابق {b.matchedCount}/{b.lineCount} · {b.status}</p>
                      </div>
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setDetailImportId(b.id)}>عرض الأسطر</Button>
                    </div>
                  ))}
                  {(uploadsQuery.data?.others || []).map((o: any) => {
                    const isParty = o.kind === "customer" || o.kind === "supplier";
                    return (
                      <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                        <div>
                          <p className="font-medium">{o.title}</p>
                          <p className="text-xs text-slate-500">
                            {o.kind === "customer" ? "عميل" : o.kind === "supplier" ? "مورد" : o.kind} · {o.partyName || o.fileName}
                            {isParty ? ` · مطابق ${o.matchedCount}/${o.matchedCount + o.unmatchedCount} · بدون مقابل عندنا ${o.systemOnlyCount}` : null}
                          </p>
                        </div>
                        {isParty ? (
                          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setPartyDetailImportId(o.id)}>عرض الأسطر</Button>
                        ) : null}
                      </div>
                    );
                  })}
                  {!uploadsQuery.data?.banks?.length && !uploadsQuery.data?.others?.length ? (
                    <p className="text-xs text-slate-500">لا كشوف بعد — ارفع كشف بنك للبدء.</p>
                  ) : null}
                </div>
              </div>

              {detailQuery.data ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 overflow-x-auto">
                  <h3 className="mb-3 text-sm font-semibold">تفاصيل مطابقة الكشف #{detailQuery.data.import.id}</h3>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-500">
                        <th className="p-2 text-right">تاريخ</th>
                        <th className="p-2 text-right">بيان</th>
                        <th className="p-2 text-right">مدين</th>
                        <th className="p-2 text-right">دائن</th>
                        <th className="p-2 text-right">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailQuery.data.lines.map((l) => (
                        <tr key={l.id} className="border-t border-slate-100">
                          <td className="p-2">{toDateStr(l.txnDate)}</td>
                          <td className="p-2">{l.description}</td>
                          <td className="p-2 tabular-nums">{Number(l.debit || 0).toLocaleString("en-US")}</td>
                          <td className="p-2 tabular-nums">{Number(l.credit || 0).toLocaleString("en-US")}</td>
                          <td className="p-2">{l.matchStatus === "matched" ? "مطابق" : "غير مطابق"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {partyDetailQuery.data ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 overflow-x-auto">
                  <h3 className="mb-3 text-sm font-semibold">
                    تفاصيل مطابقة كشف {(partyDetailQuery.data.import as any).partyName || "الطرف"} #{partyDetailQuery.data.import.id}
                  </h3>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-500">
                        <th className="p-2 text-right">تاريخ</th>
                        <th className="p-2 text-right">بيان</th>
                        <th className="p-2 text-right">مدين</th>
                        <th className="p-2 text-right">دائن</th>
                        <th className="p-2 text-right">الحالة</th>
                        <th className="p-2 text-right">مطابق مع</th>
                      </tr>
                    </thead>
                    <tbody>
                      {partyDetailQuery.data.lines.map((l: any) => (
                        <tr key={l.id} className="border-t border-slate-100">
                          <td className="p-2">{toDateStr(l.txnDate)}</td>
                          <td className="p-2">{l.description}</td>
                          <td className="p-2 tabular-nums">{Number(l.debit || 0).toLocaleString("en-US")}</td>
                          <td className="p-2 tabular-nums">{Number(l.credit || 0).toLocaleString("en-US")}</td>
                          <td className="p-2">{l.matchStatus === "matched" ? "مطابق" : "غير مطابق"}</td>
                          <td className="p-2 text-slate-500">{l.matchedDocType ? `${l.matchedDocType} ${l.matchedDocNumber || ""}` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          ) : null}

          {tab === "report" ? (
            <>
              {runMut.isError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{runMut.error.message}</div>
              ) : null}

              {!report && !loading ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
                  <CheckCircle2 className="mx-auto mb-3 text-slate-300" size={36} />
                  <p className="text-sm font-medium text-slate-700">ارفع الكشوف (اختياري) ثم ابدأ المراجعة العميقة</p>
                </div>
              ) : null}

              {loading ? (
                <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">
                  <Loader2 className="mx-auto mb-3 animate-spin text-emerald-600" size={28} />
                  جاري الفحص الشامل (ميزان · كشوف · مطابقات · إقفال · سيولة · عينات)…
                </div>
              ) : null}

              {report ? (
                <>
                  {report.opinion ? (
                    <section className={`flex flex-wrap items-start gap-4 rounded-2xl border p-5 ${opinionMeta[report.opinion.type as OpinionType]?.ring || "border-slate-200 bg-slate-50"}`}>
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${opinionMeta[report.opinion.type as OpinionType]?.className || "bg-slate-500 text-white"}`}>
                        {(() => {
                          const OpinionIcon = opinionMeta[report.opinion.type as OpinionType]?.Icon || Gavel;
                          return <OpinionIcon size={20} />;
                        })()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                          <Gavel size={12} /> رأي المراجع الداخلي
                        </div>
                        <p className="mt-0.5 text-base font-semibold text-slate-900">{report.opinion.label}</p>
                        <p className="mt-1 text-sm leading-relaxed text-slate-600">{report.opinion.rationale}</p>
                      </div>
                    </section>
                  ) : null}

                  <section className="grid gap-3 md:grid-cols-3">
                    {report.trialBalance ? (
                      <div className={`rounded-2xl border p-4 ${report.trialBalance.balanced ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
                        <p className="text-xs text-slate-500">ميزان المراجعة</p>
                        <p className={`mt-1 text-lg font-semibold ${report.trialBalance.balanced ? "text-emerald-800" : "text-red-700"}`}>
                          {report.trialBalance.balanced ? "متوازن" : "غير متوازن"}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-600">{report.trialBalance.periodLabel}</p>
                      </div>
                    ) : null}
                    {report.coverage?.liquidity ? (
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-xs text-slate-500">سيولة 30 يوم</p>
                        <p className="mt-1 text-lg font-semibold tabular-nums">{Number(report.coverage.liquidity.net30).toLocaleString("en-US")} ج</p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          60: {Number(report.coverage.liquidity.net60).toLocaleString("en-US")} · 90: {Number(report.coverage.liquidity.net90).toLocaleString("en-US")}
                        </p>
                      </div>
                    ) : null}
                    {report.office?.periodCompare ? (
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-xs text-slate-500">هوامش الفترة</p>
                        <p className="mt-1 text-lg font-semibold">
                          مجمل {report.office.periodCompare.current.grossMarginPct.toFixed(1)}% · صافي {report.office.periodCompare.current.netMarginPct.toFixed(1)}%
                        </p>
                      </div>
                    ) : null}
                  </section>

                  {report.coverage?.closingChecklist?.length ? (
                    <section className="rounded-2xl border border-slate-200 bg-white p-4">
                      <h3 className="mb-3 text-sm font-semibold">إقفال موجّه</h3>
                      <div className="space-y-2">
                        {report.coverage.closingChecklist.map((c) => (
                          <div key={c.key} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 text-sm">
                            <div>
                              <span className="font-medium">{c.label}</span>
                              <p className="text-xs text-slate-500">{c.detail}</p>
                            </div>
                            <Badge variant={c.status === "ok" ? "default" : "secondary"} className={
                              c.status === "ok" ? "bg-emerald-600" : c.status === "block" ? "bg-red-600 text-white" : "bg-amber-500 text-white"
                            }>
                              {c.status === "ok" ? "جاهز" : c.status === "block" ? "حاجز" : "تحذير"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
                        <Scale size={15} />
                      </div>
                      <h3 className="text-sm font-semibold text-slate-800">تقرير مكتب المحاسبة</h3>
                    </div>
                    <AuditNarrativeReport narrative={report.narrative} tenantSlug={tenantSlug} />
                  </section>

                  {report.office?.samples?.length ? (
                    <section className="rounded-2xl border border-slate-200 bg-white p-4">
                      <h3 className="mb-3 text-sm font-semibold">عينات مراجعة</h3>
                      {report.office.samples.slice(0, 10).map((s, i) => (
                        <div key={`${s.kind}-${i}`} className="flex justify-between gap-2 border-b border-slate-100 py-2 text-sm">
                          <span>{s.label} <span className="text-[10px] text-slate-400">{s.kind}</span></span>
                          <span className="tabular-nums">{Number(s.amount).toLocaleString("en-US")}</span>
                        </div>
                      ))}
                    </section>
                  ) : null}

                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-800">الملاحظات ومتابعة الإغلاق</h3>
                    {report.findings.map((f) => {
                      const meta = severityMeta[f.severity as Severity] || severityMeta.info;
                      const Icon = meta.Icon;
                      const closed = f.closureStatus === "closed" || f.closureStatus === "accepted_risk";
                      return (
                        <article key={f.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${closed ? "border-slate-200 opacity-70" : "border-slate-200"}`}>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex items-start gap-3">
                              <div className={`mt-0.5 rounded-lg p-2 ${meta.className}`}><Icon size={14} /></div>
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  {f.refCode ? (
                                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-slate-500">
                                      {f.refCode}
                                    </span>
                                  ) : null}
                                  <h4 className="text-sm font-semibold text-slate-900">{f.title}</h4>
                                  <Badge className={meta.className}>{meta.label}</Badge>
                                  <Badge variant="outline" className="text-[10px]">{f.category}</Badge>
                                  {f.closureStatus && f.closureStatus !== "open" ? (
                                    <Badge className="bg-slate-700 text-white text-[10px]">{f.closureStatus === "closed" ? "مغلقة" : "مقبولة كخطر"}</Badge>
                                  ) : null}
                                </div>
                                <p className="mt-1.5 text-sm text-slate-600">{f.detail}</p>
                                <p className="mt-2 text-sm text-emerald-800"><span className="font-medium">التعديل: </span>{f.recommendation}</p>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {f.link ? (
                                <Link href={tenantPath(tenantSlug, f.link)}>
                                  <Button variant="outline" size="sm" className="h-8 text-xs">فتح</Button>
                                </Link>
                              ) : null}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs"
                                disabled={closeMut.isPending}
                                onClick={() =>
                                  closeMut.mutate({
                                    findingTitle: f.title,
                                    category: f.category,
                                    severity: f.severity,
                                    status: "closed",
                                    resolutionNote: "تم الإغلاق من شاشة المراجع",
                                  })
                                }
                              >
                                إغلاق
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs"
                                disabled={closeMut.isPending}
                                onClick={() =>
                                  closeMut.mutate({
                                    findingTitle: f.title,
                                    category: f.category,
                                    severity: f.severity,
                                    status: "accepted_risk",
                                    resolutionNote: "مقبول كخطر متابع",
                                  })
                                }
                              >
                                قبول خطر
                              </Button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </section>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </EntityPermissionGate>
    </ERPLayout>
  );
}

function NumField({
  label, value, onChange, step = "1",
}: { label: string; value: number; onChange: (v: number) => void; step?: string }) {
  return (
    <div>
      <Label className="text-xs text-slate-600">{label}</Label>
      <Input className="mt-1 h-9" type="number" step={step} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "critical" | "warning" | "info" | "total" }) {
  const color = tone === "critical" ? "text-red-300" : tone === "warning" ? "text-amber-300" : tone === "info" ? "text-sky-300" : "text-white";
  return (
    <div className="bg-slate-900/80 px-4 py-3">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
