import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import ERPLayout from "@/components/ERPLayout";
import EntityPermissionGate from "@/components/EntityPermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { tenantPath, useTenantSlug } from "@/lib/tenant";
import { toast } from "sonner";
import { Factory, Loader2, Upload, ShoppingCart, TrendingUp, Beaker, FileText, ArrowLeftRight, Plus, X } from "lucide-react";
import FactoryConvertDialog from "@/components/ops/FactoryConvertDialog";
import { toDateStr } from "@/lib/date";

type EntryType = "general" | "purchase" | "sales" | "mixing";
type ItemRow = { description: string; quantity: string; amount: string };
const emptyItemRow = (): ItemRow => ({ description: "", quantity: "", amount: "" });

const TYPE_TABS: Array<{ value: EntryType; label: string; icon: typeof Factory }> = [
  { value: "general", label: "عام", icon: FileText },
  { value: "purchase", label: "بيان شراء", icon: ShoppingCart },
  { value: "sales", label: "بيان مبيعات", icon: TrendingUp },
  { value: "mixing", label: "بيان خلاطات", icon: Beaker },
];

const TYPE_LABEL: Record<string, string> = {
  general: "عام",
  purchase: "بيان شراء",
  sales: "بيان مبيعات",
  mixing: "بيان خلاطات",
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

function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

/** تاريخ ووقت الشغل بيتسجّل تلقائياً وقت الحفظ — العامل مش محتاج يدخله يدوي */
function getWorkDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function FactoryDailyPage() {
  const tenantSlug = useTenantSlug();
  const fileRef = useRef<HTMLInputElement>(null);
  const today = getWorkDate();
  const [now, setNow] = useState(() => new Date());
  const [entryType, setEntryType] = useState<EntryType>("general");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [partyName, setPartyName] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [materialsUsed, setMaterialsUsed] = useState("");
  const [itemRows, setItemRows] = useState<ItemRow[]>([emptyItemRow()]);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [dateFrom, setDateFrom] = useState(monthRange(today.slice(0, 7)).from);
  const [dateTo, setDateTo] = useState(monthRange(today.slice(0, 7)).to);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [pendingFile, setPendingFile] = useState<{ fileName: string; mimeType: string; contentBase64: string } | null>(null);
  const [convertRow, setConvertRow] = useState<{ id: number; type: "purchase" | "sales" | "mixing" | "general"; workDate: string } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const nowLabel = now.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "medium" });

  const utils = trpc.useUtils();
  const listQuery = trpc.opsInbox.factoryList.useQuery({
    dateFrom,
    dateTo,
    status: statusFilter === "all" ? undefined : statusFilter,
    type: typeFilter === "all" ? undefined : (typeFilter as EntryType),
    limit: 200,
  });

  const resetEntryFields = () => {
    setTitle("");
    setNotes("");
    setPartyName("");
    setItemDescription("");
    setQuantity("");
    setMaterialsUsed("");
    setItemRows([emptyItemRow()]);
    setPendingFile(null);
  };

  const uploadMut = trpc.opsInbox.factoryUpload.useMutation({
    onSuccess: (r) => {
      toast.success(r.linkedInboxItemId ? "تم الرفع وأُنشئت مسودة للمراجعة" : "تم حفظ البيان");
      resetEntryFields();
      void utils.opsInbox.factoryList.invalidate();
      void utils.opsInbox.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const statusMut = trpc.opsInbox.factorySetStatus.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث الحالة");
      void utils.opsInbox.factoryList.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const applyMonth = (ym: string) => {
    setMonth(ym);
    const r = monthRange(ym);
    setDateFrom(r.from);
    setDateTo(r.to);
  };

  const onFile = async (file?: File | null) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("الحد الأقصى 5 ميجابايت");
      return;
    }
    const contentBase64 = await readFileAsBase64(file);
    setPendingFile({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      contentBase64,
    });
    if (!title.trim()) setTitle(`${TYPE_LABEL[entryType]} ${getWorkDate()} — ${file.name}`);
  };

  const submit = () => {
    if (entryType === "general" && !pendingFile) {
      toast.error("اختر ملف PDF أو صورة");
      return;
    }
    if (entryType === "purchase" && !partyName.trim()) {
      toast.error("اكتب اسم المورد");
      return;
    }
    if (entryType === "sales" && !partyName.trim()) {
      toast.error("اكتب اسم العميل");
      return;
    }
    if (entryType === "mixing" && !itemDescription.trim()) {
      toast.error("اكتب اسم المنتج/الخلطة");
      return;
    }
    const filledItemRows = itemRows.filter((r) => r.description.trim());
    if ((entryType === "purchase" || entryType === "sales") && !filledItemRows.length) {
      toast.error("اكتب صنف واحد على الأقل");
      return;
    }
    const workDate = getWorkDate();
    const firstItemDesc = filledItemRows[0]?.description;
    const autoTitle =
      entryType === "purchase" ? `شراء — ${partyName || firstItemDesc || workDate}`
      : entryType === "sales" ? `بيع — ${partyName || firstItemDesc || workDate}`
      : entryType === "mixing" ? `خلطة — ${itemDescription || workDate}`
      : pendingFile?.fileName || workDate;
    uploadMut.mutate({
      workDate,
      title: title.trim() || autoTitle,
      fileName: pendingFile?.fileName,
      mimeType: pendingFile?.mimeType,
      contentBase64: pendingFile?.contentBase64,
      notes: notes.trim() || undefined,
      alsoToInbox: true,
      type: entryType,
      partyName: partyName.trim() || undefined,
      itemDescription: entryType === "mixing" ? itemDescription.trim() || undefined : undefined,
      quantity: entryType === "mixing" ? quantity.trim() || undefined : undefined,
      materialsUsed: materialsUsed.trim() || undefined,
      items: (entryType === "purchase" || entryType === "sales")
        ? filledItemRows.map((r) => ({
            itemDescription: r.description.trim(),
            quantity: r.quantity.trim() || undefined,
            amount: r.amount.trim() || undefined,
          }))
        : undefined,
    });
  };

  const rows = listQuery.data || [];

  return (
    <ERPLayout title="شغل المصنع اليومي">
      <EntityPermissionGate
        moduleKey="ops"
        entityKey="factoryDaily"
        action="viewDoc"
        fallback={<p className="text-sm text-slate-500">لا توجد صلاحية لعرض شغل المصنع.</p>}
      >
        <div className="mx-auto max-w-5xl space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-gradient-to-bl from-slate-900 via-slate-800 to-amber-950 px-5 py-5 text-white">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-white/10 p-2"><Factory size={18} className="text-amber-300" /></div>
              <div>
                <h2 className="text-lg font-semibold">رفع شغل المصنع اليومي</h2>
                <p className="mt-1 text-sm text-slate-300 leading-relaxed">
                  بديل منظم لإيميلات الـ PDF: ارفع إيصالات وحركات اليوم، فلتر بالمدة، وراجع المسودات من وارد العمليات عند الحاجة.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-800 mb-2.5">بيان جديد</h3>
              <div className="flex flex-wrap gap-1.5 p-1 rounded-xl bg-[var(--paper-50)] border border-[var(--line)] w-fit">
                {TYPE_TABS.map((t) => {
                  const Icon = t.icon;
                  const active = entryType === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setEntryType(t.value)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                        active ? "bg-[var(--ink-700)] text-white" : "text-slate-600 hover:bg-white"
                      }`}
                    >
                      <Icon size={14} />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label className="text-xs">تاريخ ووقت الشغل</Label>
                <div className="mt-1 flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
                  {nowLabel} <span className="mr-1.5 text-slate-400 font-normal">(تلقائي وقت الحفظ)</span>
                </div>
              </div>
              <div>
                <Label className="text-xs">
                  الملف (PDF / صورة) {entryType !== "general" && <span className="text-slate-400 font-normal">— اختياري</span>}
                </Label>
                <div className="mt-1 flex gap-2">
                  <Button type="button" variant="outline" className="h-9 gap-1.5" onClick={() => fileRef.current?.click()}>
                    <Upload size={14} /> {pendingFile ? pendingFile.fileName : "اختر ملف / صورة الأصل"}
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,image/*,application/pdf"
                    onChange={(e) => void onFile(e.target.files?.[0])}
                  />
                </div>
              </div>

              {(entryType === "purchase" || entryType === "sales") && (
                <>
                  <div className="md:col-span-2">
                    <Label className="text-xs">{entryType === "purchase" ? "المورد" : "العميل"}</Label>
                    <Input className="mt-1 h-9" value={partyName} onChange={(e) => setPartyName(e.target.value)} placeholder={entryType === "purchase" ? "اسم المورد" : "اسم العميل"} />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label className="text-xs">الأصناف {itemRows.length > 1 && <span className="text-slate-400 font-normal">({itemRows.length})</span>}</Label>
                    {itemRows.map((row, i) => (
                      <div key={i} className="grid grid-cols-[1fr_6rem_6rem_auto] gap-2 items-center">
                        <Input
                          className="h-9"
                          value={row.description}
                          onChange={(e) => setItemRows((rs) => rs.map((r, j) => j === i ? { ...r, description: e.target.value } : r))}
                          placeholder="وصف الصنف أو الخامة"
                        />
                        <Input
                          className="h-9"
                          type="number"
                          value={row.quantity}
                          onChange={(e) => setItemRows((rs) => rs.map((r, j) => j === i ? { ...r, quantity: e.target.value } : r))}
                          placeholder="الكمية"
                        />
                        <Input
                          className="h-9"
                          type="number"
                          value={row.amount}
                          onChange={(e) => setItemRows((rs) => rs.map((r, j) => j === i ? { ...r, amount: e.target.value } : r))}
                          placeholder="القيمة"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-9 w-9 p-0 text-slate-400 hover:text-red-600 disabled:opacity-30"
                          disabled={itemRows.length === 1}
                          onClick={() => setItemRows((rs) => rs.filter((_, j) => j !== i))}
                        >
                          <X size={14} />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1"
                      onClick={() => setItemRows((rs) => [...rs, emptyItemRow()])}
                    >
                      <Plus size={12} /> إضافة صنف
                    </Button>
                  </div>
                </>
              )}

              {entryType === "mixing" && (
                <>
                  <div>
                    <Label className="text-xs">المنتج / الخلطة</Label>
                    <Input className="mt-1 h-9" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} placeholder="اسم المنتج التام" />
                  </div>
                  <div>
                    <Label className="text-xs">الكمية المنتجة</Label>
                    <Input className="mt-1 h-9" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">الخامات المستخدمة</Label>
                    <Textarea className="mt-1" rows={2} value={materialsUsed} onChange={(e) => setMaterialsUsed(e.target.value)} placeholder="اسم الخامة والكمية، سطر لكل خامة" />
                  </div>
                </>
              )}

              <div className="md:col-span-2">
                <Label className="text-xs">العنوان {entryType !== "general" && <span className="text-slate-400 font-normal">— اختياري، هيتحدد تلقائي لو سيبته فاضي</span>}</Label>
                <Input className="mt-1 h-9" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: إنتاج وردية صباح — إيصالات" />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">ملاحظات</Label>
                <Textarea className="mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <Button className="eca-btn-primary border-0 gap-1.5" disabled={uploadMut.isPending} onClick={submit}>
              {uploadMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              حفظ البيان
            </Button>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex flex-wrap items-end gap-3 justify-between">
              <h3 className="text-sm font-semibold">الأرشيف حسب المدة</h3>
              <div className="flex flex-wrap gap-2">
                <div>
                  <Label className="text-xs">شهر سريع</Label>
                  <Input className="mt-1 h-9 w-40" type="month" value={month} onChange={(e) => applyMonth(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">من</Label>
                  <Input className="mt-1 h-9" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">إلى</Label>
                  <Input className="mt-1 h-9" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">الحالة</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="mt-1 h-9 w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">الكل</SelectItem>
                      <SelectItem value="uploaded">مرفوع</SelectItem>
                      <SelectItem value="reviewed">مراجع</SelectItem>
                      <SelectItem value="posted">مُرحّل</SelectItem>
                      <SelectItem value="ignored">متجاهل</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">النوع</Label>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="mt-1 h-9 w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">الكل</SelectItem>
                      <SelectItem value="general">عام</SelectItem>
                      <SelectItem value="purchase">بيان شراء</SelectItem>
                      <SelectItem value="sales">بيان مبيعات</SelectItem>
                      <SelectItem value="mixing">بيان خلاطات</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {rows.map((row: any) => (
                <div key={row.id} className="rounded-xl border border-slate-200 p-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[var(--paper-100)] text-[var(--ink-700)]">
                        {TYPE_LABEL[row.type] || "عام"}
                      </span>
                      <p className="text-sm font-medium text-slate-800">{row.title}</p>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {row.workDate} · {row.hasFile ? row.fileName : "بدون ملف"} · {row.status}
                      {row.postedRef ? <span className="text-emerald-700"> · تم التحويل: {row.postedRef}</span> : null}
                    </p>
                    {(row.partyName || row.itemDescription || row.quantity != null || row.amount != null) && (
                      <p className="text-xs text-slate-600 mt-1">
                        {row.partyName ? `${row.type === "purchase" ? "المورد" : "العميل"}: ${row.partyName} · ` : ""}
                        {!row.items?.length && row.itemDescription ? `${row.itemDescription} · ` : ""}
                        {!row.items?.length && row.quantity != null ? `الكمية: ${row.quantity.toLocaleString("en-US")} · ` : ""}
                        {row.amount != null ? `${row.items?.length > 1 ? "الإجمالي" : "القيمة"}: ${row.amount.toLocaleString("en-US")}` : ""}
                      </p>
                    )}
                    {row.items?.length ? (
                      <ul className="text-xs text-slate-600 mt-1 space-y-0.5">
                        {row.items.map((it: { itemDescription: string; quantity: number | null; amount: number | null }, i: number) => (
                          <li key={i}>
                            {it.itemDescription}
                            {it.quantity != null ? ` · الكمية: ${it.quantity.toLocaleString("en-US")}` : ""}
                            {it.amount != null ? ` · القيمة: ${it.amount.toLocaleString("en-US")}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {row.materialsUsed ? <p className="text-xs text-slate-600 mt-1">الخامات: {row.materialsUsed}</p> : null}
                    {row.notes ? <p className="text-xs text-slate-600 mt-1">{row.notes}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {row.linkedInboxItemId ? (
                      <Link href={tenantPath(tenantSlug, "/ops/whatsapp-inbox")}>
                        <Button size="sm" variant="outline" className="h-8 text-xs">مسودة وارد</Button>
                      </Link>
                    ) : null}
                    {row.type !== "general" && !row.postedRef ? (
                      <Button
                        size="sm"
                        className="h-8 text-xs gap-1"
                        onClick={() => setConvertRow({ id: row.id, type: row.type, workDate: toDateStr(row.workDate) })}
                      >
                        <ArrowLeftRight size={12} />
                        {row.type === "mixing" ? "تحويل لأمر إنتاج" : "تحويل لفاتورة"}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={statusMut.isPending}
                      onClick={() => statusMut.mutate({ id: row.id, status: "reviewed" })}
                    >
                      تمت المراجعة
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs"
                      disabled={statusMut.isPending}
                      onClick={() => statusMut.mutate({ id: row.id, status: "ignored" })}
                    >
                      تجاهل
                    </Button>
                  </div>
                </div>
              ))}
              {!rows.length ? <p className="text-xs text-slate-500 py-8 text-center">لا مرفوعات في هذه المدة.</p> : null}
            </div>
          </section>
        </div>
        <FactoryConvertDialog
          row={convertRow}
          onClose={() => setConvertRow(null)}
          onPosted={() => setConvertRow(null)}
        />
      </EntityPermissionGate>
    </ERPLayout>
  );
}
