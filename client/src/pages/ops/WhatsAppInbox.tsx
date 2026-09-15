import { useMemo, useRef, useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import EntityPermissionGate from "@/components/EntityPermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  CheckCircle2, ImagePlus, Inbox, Loader2, RefreshCw, SkipForward, Wand2,
} from "lucide-react";
import { toDateStr } from "@/lib/date";
import { PartySearchSelect } from "@/components/PartySearchSelect";
import { BankAccountSearchSelect } from "@/components/BankAccountSearchSelect";

const TYPE_LABELS: Record<string, string> = {
  incoming_check: "شيك وارد",
  outgoing_check: "شيك صادر",
  check_deposit: "إيداع شيك",
  cash_receive: "تحصيل نقدي",
  bank_deposit: "إيداع بنكي",
  expense: "صرف/مصروف",
  note: "ملاحظة",
  other: "أخرى",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "بانتظار المراجعة",
  reviewing: "قيد التعديل",
  confirmed: "مؤكد",
  ignored: "متجاهل",
  rejected: "مرفوض",
};

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(new Error("فشل قراءة الملف"));
    reader.readAsDataURL(file);
  });
}

type DraftForm = {
  suggestedType: string;
  checkNumber: string;
  amount: string;
  date: string;
  dueDate: string;
  partyName: string;
  customerId: string;
  supplierId: string;
  bankAccountId: string;
  description: string;
};

function emptyDraft(): DraftForm {
  return {
    suggestedType: "other",
    checkNumber: "",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    dueDate: "",
    partyName: "",
    customerId: "",
    supplierId: "",
    bankAccountId: "",
    description: "",
  };
}

function draftFromItem(item: any): DraftForm {
  const d = item.draft || {};
  return {
    suggestedType: d.suggestedType || item.suggestedType || "other",
    checkNumber: d.checkNumber || "",
    amount: d.amount != null ? String(d.amount) : "",
    date: d.date || toDateStr(item.workDate) || new Date().toISOString().slice(0, 10),
    dueDate: d.dueDate || "",
    partyName: d.partyName || "",
    customerId: d.customerId ? String(d.customerId) : "",
    supplierId: d.supplierId ? String(d.supplierId) : "",
    bankAccountId: d.bankAccountId ? String(d.bankAccountId) : "",
    description: d.description || item.rawText || "",
  };
}

export default function WhatsAppInboxPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rawText, setRawText] = useState("");
  const [channelNote, setChannelNote] = useState("جروب المندوبين");
  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));
  const [pendingFile, setPendingFile] = useState<{ fileName: string; mimeType: string; contentBase64: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [sourceFilter, setSourceFilter] = useState("whatsapp");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<DraftForm>(emptyDraft());

  const utils = trpc.useUtils();
  const listQuery = trpc.opsInbox.list.useQuery({
    source: sourceFilter === "all" ? undefined : (sourceFilter as "whatsapp" | "factory"),
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 120,
  });
  const customersQuery = trpc.customers.all.useQuery(undefined, { retry: false });
  const suppliersQuery = trpc.suppliers.all.useQuery(undefined, { retry: false });
  const banksQuery = trpc.bank.accounts.list.useQuery();

  const customers = customersQuery.data || [];
  const suppliers = suppliersQuery.data || [];
  const banks = banksQuery.data || [];

  const items = listQuery.data || [];
  const selected = useMemo(() => items.find((i) => i.id === selectedId) || null, [items, selectedId]);

  const ingestMut = trpc.opsInbox.ingestWhatsApp.useMutation({
    onSuccess: (item) => {
      toast.success("تم إدخال الوارد واستخراج المسودة");
      setRawText("");
      setPendingFile(null);
      setSelectedId(item.id);
      setForm(draftFromItem(item));
      void utils.opsInbox.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.opsInbox.updateDraft.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ المسودة");
      void utils.opsInbox.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const confirmMut = trpc.opsInbox.confirm.useMutation({
    onSuccess: (r) => {
      toast.success(`تم التأكيد${r.confirmedRef ? ` — ${r.confirmedRef}` : ""}`);
      void utils.opsInbox.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const statusMut = trpc.opsInbox.setStatus.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث الحالة");
      void utils.opsInbox.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const reextractMut = trpc.opsInbox.reextract.useMutation({
    onSuccess: (item) => {
      toast.success("تمت إعادة الاستخراج");
      setForm(draftFromItem(item));
      void utils.opsInbox.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const contentQuery = trpc.opsInbox.content.useQuery(
    { id: selectedId || 0 },
    { enabled: !!selectedId && !!selected?.hasFile },
  );

  const toDraftPayload = () => ({
    suggestedType: form.suggestedType as any,
    checkNumber: form.checkNumber || undefined,
    amount: form.amount ? Number(form.amount) : undefined,
    date: form.date || undefined,
    dueDate: form.dueDate || undefined,
    partyName: form.partyName || undefined,
    customerId: form.customerId ? Number(form.customerId) : undefined,
    supplierId: form.supplierId ? Number(form.supplierId) : undefined,
    bankAccountId: form.bankAccountId ? Number(form.bankAccountId) : undefined,
    description: form.description || undefined,
  });

  const onPickFile = async (file?: File | null) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("الحد الأقصى 5 ميجابايت");
      return;
    }
    const contentBase64 = await readFileAsBase64(file);
    setPendingFile({
      fileName: file.name,
      mimeType: file.type || "image/jpeg",
      contentBase64,
    });
  };

  const submitIngest = () => {
    if (!rawText.trim() && !pendingFile) {
      toast.error("الصق رسالة أو ارفع صورة من الواتساب");
      return;
    }
    ingestMut.mutate({
      channelNote: channelNote || undefined,
      workDate,
      rawText: rawText.trim() || undefined,
      fileName: pendingFile?.fileName,
      mimeType: pendingFile?.mimeType,
      contentBase64: pendingFile?.contentBase64,
    });
  };

  return (
    <ERPLayout title="وارد واتساب">
      <EntityPermissionGate
        moduleKey="ops"
        entityKey="whatsappInbox"
        action="viewDoc"
        fallback={<p className="text-sm text-slate-500">لا توجد صلاحية لعرض وارد الواتساب.</p>}
      >
        <div className="mx-auto max-w-6xl space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-gradient-to-bl from-emerald-950 via-slate-900 to-slate-900 px-5 py-5 text-white">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-white/10 p-2"><Inbox size={18} className="text-emerald-300" /></div>
              <div>
                <h2 className="text-lg font-semibold">صندوق وارد العمليات</h2>
                <p className="mt-1 text-sm text-slate-300 leading-relaxed">
                  الصق رسالة واتساب أو ارفع صورة شيك/إيداع (مش لازم PDF). النظام يقترح مسودة — المحاسب يراجع ويأكد قبل ما تدخل الدفاتر. شغل المصنع يظهر هنا أيضاً بعد الرفع.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-800">إدخال جديد</h3>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label className="text-xs">مصدر/جروب</Label>
                <Input className="mt-1 h-9" value={channelNote} onChange={(e) => setChannelNote(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">تاريخ العمل</Label>
                <Input className="mt-1 h-9" type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">صورة من الواتساب</Label>
                <div className="mt-1 flex gap-2">
                  <Button type="button" variant="outline" className="h-9 gap-1.5" onClick={() => fileRef.current?.click()}>
                    <ImagePlus size={14} /> {pendingFile ? pendingFile.fileName : "رفع صورة"}
                  </Button>
                  <input ref={fileRef} type="file" className="hidden" accept="image/*,.pdf,application/pdf" onChange={(e) => void onPickFile(e.target.files?.[0])} />
                </div>
              </div>
            </div>
            <div>
              <Label className="text-xs">نص الرسالة (اختياري مع الصورة)</Label>
              <Textarea className="mt-1" rows={3} value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder="مثال: استلمنا شيك من أحمد رقم 4521 بمبلغ 15000 تاريخ 10/8" />
            </div>
            <Button className="gap-1.5" disabled={ingestMut.isPending} onClick={submitIngest}>
              {ingestMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              إدخال واستخراج
            </Button>
          </section>

          <div className="grid gap-4 lg:grid-cols-[1.1fr_1.2fr]">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-semibold">قائمة الوارد</h3>
                <div className="flex gap-2">
                  <Select value={sourceFilter} onValueChange={setSourceFilter}>
                    <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">واتساب</SelectItem>
                      <SelectItem value="factory">المصنع</SelectItem>
                      <SelectItem value="all">الكل</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">بانتظار المراجعة</SelectItem>
                      <SelectItem value="reviewing">قيد التعديل</SelectItem>
                      <SelectItem value="confirmed">مؤكد</SelectItem>
                      <SelectItem value="ignored">متجاهل</SelectItem>
                      <SelectItem value="all">الكل</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2 max-h-[560px] overflow-y-auto">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(item.id);
                      setForm(draftFromItem(item));
                    }}
                    className={`w-full text-right rounded-xl border p-3 transition ${
                      selectedId === item.id ? "border-emerald-400 bg-emerald-50" : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{TYPE_LABELS[item.suggestedType] || item.suggestedType}</p>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{item.draft?.description || item.rawText || item.fileName || "—"}</p>
                      </div>
                      <span className="text-[10px] rounded-full border px-2 py-0.5 text-slate-600 whitespace-nowrap">
                        {STATUS_LABELS[item.status] || item.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2">
                      {item.workDate || "—"} · ثقة {Math.round((item.confidence || 0) * (item.confidence <= 1 ? 100 : 1))}%
                      {item.hasFile ? " · صورة" : ""}
                    </p>
                  </button>
                ))}
                {!items.length ? <p className="text-xs text-slate-500 py-6 text-center">لا عناصر بعد.</p> : null}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              {!selected ? (
                <p className="text-sm text-slate-500 py-10 text-center">اختر عنصراً من القائمة للمراجعة والتأكيد.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">مراجعة #{selected.id}</h3>
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" className="h-8 gap-1" disabled={reextractMut.isPending} onClick={() => reextractMut.mutate({ id: selected.id })}>
                        <RefreshCw size={13} /> إعادة استخراج
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 gap-1" disabled={statusMut.isPending} onClick={() => statusMut.mutate({ id: selected.id, status: "ignored" })}>
                        <SkipForward size={13} /> تجاهل
                      </Button>
                    </div>
                  </div>

                  {contentQuery.data?.contentBase64 ? (
                    <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
                      {(contentQuery.data.mimeType || "").startsWith("image/") ? (
                        <img
                          alt={contentQuery.data.fileName || "مرفق"}
                          className="max-h-56 w-full object-contain"
                          src={`data:${contentQuery.data.mimeType};base64,${contentQuery.data.contentBase64}`}
                        />
                      ) : (
                        <p className="text-xs text-slate-500 p-3">مرفق: {contentQuery.data.fileName}</p>
                      )}
                    </div>
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs">النوع المقترح</Label>
                      <Select value={form.suggestedType} onValueChange={(v) => setForm({ ...form, suggestedType: v })}>
                        <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(TYPE_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">رقم الشيك</Label>
                      <Input className="mt-1 h-9" value={form.checkNumber} onChange={(e) => setForm({ ...form, checkNumber: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">المبلغ</Label>
                      <Input className="mt-1 h-9" type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">التاريخ</Label>
                      <Input className="mt-1 h-9" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">تاريخ الاستحقاق</Label>
                      <Input className="mt-1 h-9" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">البنك</Label>
                      <BankAccountSearchSelect
                        accounts={banks}
                        value={form.bankAccountId || ""}
                        onChange={(v) => setForm({ ...form, bankAccountId: v })}
                        placeholder="اختياري"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">العميل</Label>
                      <PartySearchSelect
                        parties={customers as any[]}
                        value={form.customerId || ""}
                        onChange={(v) => setForm({ ...form, customerId: v })}
                        placeholder="اختر عند الحاجة"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">المورد</Label>
                      <PartySearchSelect
                        parties={suppliers as any[]}
                        value={form.supplierId || ""}
                        onChange={(v) => setForm({ ...form, supplierId: v })}
                        placeholder="اختر عند الحاجة"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">البيان</Label>
                    <Textarea className="mt-1" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>

                  {selected.status === "confirmed" ? (
                    <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                      مؤكد بالفعل{selected.confirmedRef ? ` — ${selected.confirmedRef}` : ""}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        disabled={updateMut.isPending}
                        onClick={() => updateMut.mutate({ id: selected.id, draft: toDraftPayload() })}
                      >
                        حفظ المسودة
                      </Button>
                      <Button
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                        disabled={confirmMut.isPending}
                        onClick={() => confirmMut.mutate({ id: selected.id, draft: toDraftPayload() })}
                      >
                        {confirmMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        تأكيد وإدخال في النظام
                      </Button>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      </EntityPermissionGate>
    </ERPLayout>
  );
}
