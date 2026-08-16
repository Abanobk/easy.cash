import { useRef, useState } from "react";
import { Link } from "wouter";
import ERPLayout from "@/components/ERPLayout";
import PermissionGate from "@/components/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { tenantPath, useTenantSlug } from "@/lib/tenant";
import { toast } from "sonner";
import { Factory, Loader2, Upload } from "lucide-react";

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

export default function FactoryDailyPage() {
  const tenantSlug = useTenantSlug();
  const fileRef = useRef<HTMLInputElement>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [workDate, setWorkDate] = useState(today);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [dateFrom, setDateFrom] = useState(monthRange(today.slice(0, 7)).from);
  const [dateTo, setDateTo] = useState(monthRange(today.slice(0, 7)).to);
  const [statusFilter, setStatusFilter] = useState("all");
  const [pendingFile, setPendingFile] = useState<{ fileName: string; mimeType: string; contentBase64: string } | null>(null);

  const utils = trpc.useUtils();
  const listQuery = trpc.opsInbox.factoryList.useQuery({
    dateFrom,
    dateTo,
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 200,
  });

  const uploadMut = trpc.opsInbox.factoryUpload.useMutation({
    onSuccess: (r) => {
      toast.success(r.linkedInboxItemId ? "تم الرفع وأُنشئت مسودة للمراجعة" : "تم رفع شغل المصنع");
      setTitle("");
      setNotes("");
      setPendingFile(null);
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
    if (!title.trim()) setTitle(`شغل مصنع ${workDate} — ${file.name}`);
  };

  const submit = () => {
    if (!pendingFile) {
      toast.error("اختر ملف PDF أو صورة");
      return;
    }
    uploadMut.mutate({
      workDate,
      title: title.trim() || pendingFile.fileName,
      fileName: pendingFile.fileName,
      mimeType: pendingFile.mimeType,
      contentBase64: pendingFile.contentBase64,
      notes: notes.trim() || undefined,
      alsoToInbox: true,
    });
  };

  const rows = listQuery.data || [];

  return (
    <ERPLayout title="شغل المصنع اليومي">
      <PermissionGate
        module="bank"
        action="view"
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

          <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-800">رفع جديد</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label className="text-xs">تاريخ الشغل</Label>
                <Input className="mt-1 h-9" type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">الملف (PDF / صورة)</Label>
                <div className="mt-1 flex gap-2">
                  <Button type="button" variant="outline" className="h-9 gap-1.5" onClick={() => fileRef.current?.click()}>
                    <Upload size={14} /> {pendingFile ? pendingFile.fileName : "اختر ملف"}
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
              <div className="md:col-span-2">
                <Label className="text-xs">العنوان</Label>
                <Input className="mt-1 h-9" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: إنتاج وردية صباح — إيصالات" />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">ملاحظات</Label>
                <Textarea className="mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <Button className="gap-1.5" disabled={uploadMut.isPending} onClick={submit}>
              {uploadMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              رفع للشغل اليومي
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
              </div>
            </div>

            <div className="space-y-2">
              {rows.map((row) => (
                <div key={row.id} className="rounded-xl border border-slate-200 p-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{row.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {row.workDate} · {row.fileName} · {row.status}
                    </p>
                    {row.notes ? <p className="text-xs text-slate-600 mt-1">{row.notes}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {row.linkedInboxItemId ? (
                      <Link href={tenantPath(tenantSlug, "/ops/whatsapp-inbox")}>
                        <Button size="sm" variant="outline" className="h-8 text-xs">مسودة وارد</Button>
                      </Link>
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
      </PermissionGate>
    </ERPLayout>
  );
}
