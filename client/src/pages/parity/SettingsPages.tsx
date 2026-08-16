import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SimpleEntityPage } from "@/components/SimpleEntityPage";
import { Download, Upload, AlertTriangle, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import PermissionGate from "@/components/PermissionGate";

export function DatabaseBackup() {
  const exportQ = trpc.settings.backup.export.useQuery(undefined, { enabled: false });
  const importMut = trpc.settings.backup.import.useMutation({
    onSuccess: (r) => toast.success(`تم استيراد ${r.imported} سجل بنجاح`),
    onError: (e) => toast.error(e.message),
  });
  const importFullMut = trpc.settings.backup.importFull.useMutation({
    onSuccess: (r) => {
      const n = Object.values(r.imported || {}).reduce((a, b) => a + Number(b), 0);
      toast.success(`استعادة كاملة: ${n} سجل${r.errorCount ? ` — أخطاء: ${r.errorCount}` : ""}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const wipeMut = trpc.settings.backup.wipeTenant.useMutation({
    onSuccess: (r) => toast.success(r ? `تم التفريغ / العد لمستأجر ${r.slug}` : "تم"),
    onError: (e) => toast.error(e.message),
  });
  const [importing, setImporting] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState("");

  const handleExport = async () => {
    const res = await exportQ.refetch();
    if (!res.data) return;
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `easy-cash-backup-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    toast.success("تم تصدير النسخة الاحتياطية");
  };

  const handleImportFile = async (file: File, mode: "masters" | "full") => {
    setImporting(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (mode === "full") {
        await importFullMut.mutateAsync({
          payload,
          wipeFirst: wipeConfirm === "WIPE_KAM",
          wipeConfirm: wipeConfirm === "WIPE_KAM" ? "WIPE_KAM" : undefined,
        });
      } else {
        await importMut.mutateAsync({ payload });
      }
    } catch {
      toast.error("ملف غير صالح — تأكد من صيغة JSON");
    } finally {
      setImporting(false);
    }
  };

  return (
    <ERPLayout title="نسخ احتياطي">
      <div className="space-y-4 max-w-2xl">
        <Card>
          <CardContent className="p-6 space-y-4">
            <p className="text-sm text-slate-600">
              تصدير أو استعادة بيانات الشركة (عملاء، موردين، أصناف، حسابات، قيود، فواتير، موظفين...) كملف JSON.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={handleExport} className="gap-2 bg-blue-600" disabled={exportQ.isFetching}>
                <Download size={16} /> تصدير نسخة احتياطية
              </Button>
              <label className="inline-flex">
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  disabled={importing || importMut.isPending}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleImportFile(file, "masters");
                    e.target.value = "";
                  }}
                />
                <Button type="button" variant="outline" className="gap-2" disabled={importing || importMut.isPending} asChild>
                  <span><Upload size={16} /> استعادة أساسيات فقط</span>
                </Button>
              </label>
            </div>
            <p className="text-xs text-amber-600">استعادة الأساسيات تُضيف سجلات ولا تحذف البيانات الحالية.</p>
          </CardContent>
        </Card>

        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-600" />
              ترحيل Mega / استعادة كاملة (KAM فقط)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600">
              لاسترداد فواتير وقيود وحركات من ملف JSON كامل. مفعّل لمستأجر <strong>kam</strong> فقط.
              باكب Mega الثنائي (.bak) يُفحَص عبر CLI بعد نسخه لمجلد <code className="text-xs bg-slate-100 px-1 rounded">mega-kam-backup</code> — بدون لمس البرنامج القديم.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">تأكيد التفريغ قبل الاستيراد (اختياري) — اكتب WIPE_KAM</Label>
              <Input
                className="h-9 text-sm"
                value={wipeConfirm}
                onChange={(e) => setWipeConfirm(e.target.value)}
                placeholder="اتركه فارغاً للإضافة بدون تفريغ"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={wipeMut.isPending}
                onClick={() => wipeMut.mutate({ confirm: "WIPE_KAM", dryRun: true })}
              >
                عدّ سجلات kam (بدون حذف)
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={wipeMut.isPending || wipeConfirm !== "WIPE_KAM"}
                onClick={() => {
                  if (!confirm("تفريغ بيانات أعمال kam؟ المستخدمون والاشتراك لن يُمسّا.")) return;
                  wipeMut.mutate({ confirm: "WIPE_KAM" });
                }}
              >
                تفريغ kam
              </Button>
              <label className="inline-flex">
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  disabled={importing || importFullMut.isPending}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleImportFile(file, "full");
                    e.target.value = "";
                  }}
                />
                <Button type="button" className="gap-2 bg-violet-600 hover:bg-violet-700" disabled={importing || importFullMut.isPending} asChild>
                  <span><Upload size={16} /> استعادة كاملة من JSON</span>
                </Button>
              </label>
            </div>
            <p className="text-xs text-slate-500">
              CLI: <code className="bg-slate-100 px-1 rounded">node scripts/inspect-mega-backup.mjs ./mega-kam-backup</code>
              {" · "}
              <code className="bg-slate-100 px-1 rounded">npx tsx scripts/import-mega-to-tenant.mjs --slug kam --file ./mega-kam-backup/sample-fixture</code>
            </p>
          </CardContent>
        </Card>
      </div>
    </ERPLayout>
  );
}

export function ExchangeRates() {
  const q = trpc.parity.settings.exchangeRates.list.useQuery();
  const create = trpc.parity.settings.exchangeRates.create.useMutation();
  const update = trpc.parity.settings.exchangeRates.update.useMutation();
  const del = trpc.parity.settings.exchangeRates.delete.useMutation();
  return (
    <SimpleEntityPage
      title="أسعار العملات"
      tableTitle="أسعار العملات"
      permissionModule="settings"
      data={q.data as any}
      isLoading={q.isLoading}
      onRefresh={() => q.refetch()}
      columns={[
        { key: "code", label: "الكود" },
        { key: "name", label: "العملة" },
        { key: "rate", label: "السعر" },
      ]}
      fields={[
        { key: "code", label: "كود العملة", required: true },
        { key: "name", label: "اسم العملة", required: true },
        { key: "rate", label: "سعر الصرف", required: true },
      ]}
      onCreate={(v) => create.mutateAsync(v as any)}
      onUpdate={(id, v) => update.mutateAsync({ id, ...v } as any)}
      onDelete={(id) => del.mutateAsync(id)}
    />
  );
}

export function GeneralAttributes() {
  const q = trpc.parity.settings.generalAttributes.list.useQuery();
  const create = trpc.parity.settings.generalAttributes.create.useMutation();
  const update = trpc.parity.settings.generalAttributes.update.useMutation();
  const del = trpc.parity.settings.generalAttributes.delete.useMutation();
  const unitsQ = trpc.parity.settings.measureUnits.list.useQuery();
  const createUnit = trpc.parity.settings.measureUnits.create.useMutation();
  const updateUnit = trpc.parity.settings.measureUnits.update.useMutation();
  const delUnit = trpc.parity.settings.measureUnits.delete.useMutation();
  const presets = [
    { key: "require_document_approval", label: "اعتماد المستندات", example: "true" },
    { key: "payroll_late_grace_minutes", label: "سماحية التأخير (دقائق)", example: "15" },
    { key: "payroll_late_day_fraction", label: "جزء يوم لكل تأخير", example: "0.25" },
    { key: "payroll_overtime_hourly_rate", label: "سعر ساعة إضافي", example: "50" },
    { key: "zkteco_auto_sync_enabled", label: "مزامنة ZKTeco تلقائية", example: "true" },
  ];
  return (
    <ERPLayout title="خصائص عامة">
      <div className="space-y-6">
        <Card className="border-0 shadow-sm bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-900">مفاتيح مدعومة (تؤثر على سلوك النظام)</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-amber-800 space-y-1">
            {presets.map((p) => (
              <p key={p.key}><span className="font-mono">{p.key}</span> — {p.label} (مثال: {p.example})</p>
            ))}
            <p className="pt-2 text-amber-700">`require_document_approval` يتجاوز إعداد الشركة عند تعيينه.</p>
          </CardContent>
        </Card>

        <SimpleEntityPage
          embedded
          title="خصائص عامة"
          tableTitle="الخصائص"
          permissionModule="settings"
          data={q.data as any}
          isLoading={q.isLoading}
          onRefresh={() => q.refetch()}
          columns={[{ key: "attrKey", label: "المفتاح" }, { key: "attrValue", label: "القيمة" }]}
          fields={[
            { key: "attrKey", label: "المفتاح", required: true },
            { key: "attrValue", label: "القيمة", type: "textarea" },
          ]}
          onCreate={(v) => create.mutateAsync(v as any)}
          onUpdate={(id, v) => update.mutateAsync({ id, ...v } as any)}
          onDelete={(id) => del.mutateAsync(id)}
        />

        <Card className="border-0 shadow-sm bg-slate-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-900">وحدات القياس</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-600 space-y-1">
            <p>
              سجّل هنا وحدات القياس المعتمدة للشركة (قطعة، كيلو، لتر…). عند إضافة/تعديل صنف
              تُختار الوحدة من هذه القائمة فقط — لمنع إدخال وحدة غير موجودة.
            </p>
          </CardContent>
        </Card>

        <SimpleEntityPage
          embedded
          title="وحدات القياس"
          tableTitle="وحدات القياس"
          addLabel="وحدة جديدة"
          permissionModule="settings"
          data={unitsQ.data as any}
          isLoading={unitsQ.isLoading}
          onRefresh={() => unitsQ.refetch()}
          columns={[
            { key: "name", label: "اسم الوحدة" },
            { key: "code", label: "كود" },
            { key: "sortOrder", label: "الترتيب" },
            {
              key: "isActive",
              label: "الحالة",
              render: (row) => (row.isActive ? "نشطة" : "معطّلة"),
            },
          ]}
          fields={[
            { key: "name", label: "اسم الوحدة", required: true },
            { key: "code", label: "كود (اختياري)" },
            { key: "sortOrder", label: "الترتيب", type: "number" },
            {
              key: "isActive",
              label: "الحالة",
              type: "select",
              options: [
                { value: "true", label: "نشطة" },
                { value: "false", label: "معطّلة" },
              ],
            },
          ]}
          onCreate={async (v) => {
            await createUnit.mutateAsync({
              name: v.name,
              code: v.code || undefined,
              sortOrder: v.sortOrder || undefined,
              isActive: v.isActive !== "false",
            });
          }}
          onUpdate={async (id, v) => {
            await updateUnit.mutateAsync({
              id,
              name: v.name,
              code: v.code || undefined,
              sortOrder: v.sortOrder || undefined,
              isActive: v.isActive !== "false",
            });
          }}
          onDelete={async (id) => {
            await delUnit.mutateAsync(id);
          }}
        />
      </div>
    </ERPLayout>
  );
}

export function FiscalYears() {
  const q = trpc.parity.settings.fiscalYears.list.useQuery();
  const create = trpc.parity.settings.fiscalYears.create.useMutation({
    onSuccess: (res) => {
      if (res.openingJournalCreated) {
        toast.success("تم إنشاء الفترة وترحيل قيد الافتتاح من السنة السابقة");
      } else {
        toast.success("تم إنشاء الفترة المالية");
      }
      q.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const close = trpc.parity.settings.fiscalYears.close.useMutation();
  const reopen = trpc.parity.settings.fiscalYears.reopen.useMutation();
  const backfillCogs = trpc.parity.settings.fiscalYears.backfillCogs.useMutation({
    onSuccess: (res) => toast.success(`تم إنشاء ${res.created} قيد COGS — تخطي ${res.skipped}`),
    onError: (e) => toast.error(e.message),
  });

  const [closingId, setClosingId] = useState<number | null>(null);
  const [skipJournal, setSkipJournal] = useState(false);
  const readiness = trpc.parity.settings.fiscalYears.readiness.useQuery(closingId!, {
    enabled: closingId != null,
  });

  const startClose = (row: Record<string, unknown>) => {
    if (row.status !== "open") return;
    setSkipJournal(false);
    setClosingId(Number(row.id));
  };

  const confirmClose = async () => {
    if (closingId == null) return;
    try {
      const res = await close.mutateAsync({ id: closingId, skipClosingJournal: skipJournal });
      if (res.closingResult && !res.closingResult.skipped) {
        toast.success("تم إغلاق الفترة وإنشاء قيد الإقفال");
      } else if (res.readiness.closingJournalExists) {
        toast.success("تم إغلاق الفترة (قيد الإقفال موجود مسبقاً)");
      } else {
        toast.success("تم إغلاق الفترة");
      }
      setClosingId(null);
      q.refetch();
    } catch (e: any) {
      toast.error(e.message || "فشل الإغلاق");
    }
  };

  const toggleStatus = async (row: Record<string, unknown>) => {
    const id = Number(row.id);
    if (row.status === "open") {
      startClose(row);
      return;
    }
    await reopen.mutateAsync(id);
    q.refetch();
    toast.success("تم فتح الفترة");
  };

  return (
    <>
      <SimpleEntityPage
        title="الفترة المالية"
        tableTitle="الفترات المالية"
        permissionModule="settings"
        data={q.data as any}
        isLoading={q.isLoading}
        onRefresh={() => q.refetch()}
        extraActions={
          <PermissionGate module="settings" action="edit">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              disabled={backfillCogs.isPending}
              onClick={() => backfillCogs.mutate()}
            >
              <RefreshCw size={14} className={backfillCogs.isPending ? "animate-spin" : ""} />
              ترحيل قيود COGS للفواتير القديمة
            </Button>
          </PermissionGate>
        }
        columns={[
          { key: "name", label: "الاسم" },
          { key: "startDate", label: "من", render: (r) => String(r.startDate).slice(0, 10) },
          { key: "endDate", label: "إلى", render: (r) => String(r.endDate).slice(0, 10) },
          {
            key: "status",
            label: "الحالة",
            render: (r) => (
              <span className={r.status === "closed" ? "text-red-600 font-medium" : "text-green-600"}>
                {r.status === "open" ? "مفتوحة" : "مغلقة"}
              </span>
            ),
          },
        ]}
        fields={[
          { key: "name", label: "اسم الفترة", required: true },
          { key: "startDate", label: "تاريخ البداية", type: "date", required: true },
          { key: "endDate", label: "تاريخ النهاية", type: "date", required: true },
        ]}
        onCreate={(v) => create.mutateAsync(v as any)}
        onUpdate={() => Promise.resolve()}
        onDelete={() => Promise.resolve()}
        rowExtraActions={(row) => (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => toggleStatus(row)}
          >
            {row.status === "open" ? "إغلاق" : "فتح"}
          </Button>
        )}
      />

      {closingId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-lg border-0 shadow-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-500" />
                إغلاق الفترة المالية
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {readiness.isLoading ? (
                <p className="text-sm text-slate-500">جاري فحص الجاهزية...</p>
              ) : readiness.data ? (
                <>
                  <p className="text-sm text-slate-700">
                    <strong>{readiness.data.fiscalYearName}</strong>
                    {" "}({readiness.data.startDate} — {readiness.data.endDate})
                  </p>

                  <div className={`text-sm rounded-lg p-3 border ${readiness.data.trialBalanced ? "bg-green-50 border-green-100 text-green-800" : "bg-red-50 border-red-100 text-red-800"}`}>
                    {readiness.data.trialBalanced
                      ? "ميزان المراجعة متوازن — يمكن الإغلاق"
                      : "ميزان المراجعة غير متوازن — لا يمكن الإغلاق حتى يُصحَّح"}
                  </div>

                  {readiness.data.warnings.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-slate-600">تنبيهات:</p>
                      {readiness.data.warnings.map((w) => (
                        <div
                          key={w.key}
                          className={`text-xs px-2 py-1.5 rounded border ${w.severity === "error" ? "bg-red-50 border-red-100 text-red-800" : "bg-amber-50 border-amber-100 text-amber-800"}`}
                        >
                          {w.label}: {w.count}
                        </div>
                      ))}
                    </div>
                  )}

                  {!readiness.data.closingJournalExists && (
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={skipJournal}
                        onChange={(e) => setSkipJournal(e.target.checked)}
                      />
                      إغلاق بدون قيد إقفال (إيرادات/مصروفات → أرباح محتجزة)
                    </label>
                  )}
                  {readiness.data.closingJournalExists && (
                    <p className="text-xs text-slate-500">قيد الإقفال موجود مسبقاً لهذه الفترة.</p>
                  )}
                </>
              ) : null}

              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" size="sm" onClick={() => setClosingId(null)}>
                  إلغاء
                </Button>
                <Button
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white"
                  disabled={!readiness.data?.canClose || close.isPending}
                  onClick={confirmClose}
                >
                  {close.isPending ? "جاري الإغلاق..." : "تأكيد الإغلاق"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

export function UserActivitiesPage() {
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [query, setQuery] = useState({ search: "", action: "" });
  const q = trpc.parity.settings.userActivities.list.useQuery({
    limit: 300,
    search: query.search || undefined,
    action: query.action || undefined,
  });

  /** قيم الإجراء كما تُحفظ في السجل (عربي) */
  const actionOptions = [
    "إضافة",
    "تعديل",
    "حذف",
    "تسجيل دخول",
    "تسجيل خروج",
    "استيراد",
    "تصدير",
    "اعتماد",
    "دفع/تحصيل",
    "طباعة",
    "إجراء",
  ];

  return (
    <ERPLayout title="حركات المستخدمين">
      <Card className="mb-4 border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-extrabold text-slate-900">سجل العمليات</CardTitle>
          <p className="text-sm text-slate-600 font-semibold">
            من أضاف أو عدّل أو حذف — مع التاريخ والتفاصيل.
          </p>
        </CardHeader>
        <CardContent className="p-4 pt-0 flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">بحث</Label>
            <Input
              className="h-9 w-56"
              placeholder="مستخدم أو تفاصيل..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setQuery({ search, action })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">الإجراء</Label>
            <select
              className="h-9 border rounded-lg px-2 text-sm w-40"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              <option value="">الكل</option>
              {actionOptions.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          <Button size="sm" className="bg-blue-600" onClick={() => setQuery({ search, action })}>
            بحث
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSearch("");
              setAction("");
              setQuery({ search: "", action: "" });
              void q.refetch();
            }}
          >
            تحديث
          </Button>
        </CardContent>
      </Card>
      <Card className="erp-data-card border-0">
        <CardContent className="p-0 overflow-x-auto">
          {q.isLoading ? (
            <div className="py-12 text-center text-slate-400 text-sm">جاري التحميل...</div>
          ) : !(q.data || []).length ? (
            <div className="py-12 text-center text-slate-400 text-sm">لا توجد حركات</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="px-3 py-2.5 text-right font-bold">التاريخ</th>
                  <th className="px-3 py-2.5 text-right font-bold">المستخدم</th>
                  <th className="px-3 py-2.5 text-right font-bold">الإجراء</th>
                  <th className="px-3 py-2.5 text-right font-bold">التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {(q.data || []).map((r: any) => (
                  <tr key={r.id} className="border-b hover:bg-sky-50/80">
                    <td className="px-3 py-2.5 whitespace-nowrap font-medium text-slate-700">
                      {new Date(r.createdAt).toLocaleString("en-GB")}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-slate-900">{r.userName || "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-800">
                        {r.action}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 max-w-xl break-words">{r.details || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </ERPLayout>
  );
}

export function ImportDataPage() {
  const ENTITIES = [
    { id: "customers", label: "العملاء" },
    { id: "suppliers", label: "الموردين" },
    { id: "items", label: "الأصناف" },
    { id: "accounts", label: "الحسابات" },
    { id: "employees", label: "الموظفين" },
    { id: "warehouses", label: "المخازن" },
    { id: "itemCategories", label: "تصنيفات الأصناف" },
    { id: "departments", label: "الأقسام" },
  ] as const;

  type EntityId = typeof ENTITIES[number]["id"];
  const [entity, setEntity] = useState<EntityId>("customers");
  const [json, setJson] = useState("");
  const [upsertByCode, setUpsertByCode] = useState(true);
  const [preview, setPreview] = useState<Record<string, unknown>[]>([]);

  const templateQ = trpc.parity.settings.importTemplate.useQuery(entity);
  const imp = trpc.parity.settings.importData.useMutation({
    onSuccess: (r) => toast.success(`تم: ${r.imported ?? 0} جديد${r.updated ? `، ${r.updated} محدّث` : ""}`),
    onError: (e) => toast.error(e.message),
  });

  const loadTemplate = () => {
    const t = templateQ.data || [];
    setJson(JSON.stringify(t, null, 2));
    setPreview(t as Record<string, unknown>[]);
  };

  const parseFile = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "json") {
      const text = await file.text();
      const data = JSON.parse(text);
      const rows = Array.isArray(data) ? data : data[entity] || data.data?.[entity] || [];
      setJson(JSON.stringify(rows, null, 2));
      setPreview(rows);
      return;
    }
    if (ext === "xlsx" || ext === "xls" || ext === "csv") {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      setJson(JSON.stringify(rows, null, 2));
      setPreview(rows);
      return;
    }
    toast.error("صيغة غير مدعومة — استخدم JSON أو Excel");
  };

  const handleImport = () => {
    const rows = JSON.parse(json) as Record<string, unknown>[];
    imp.mutate({ entity, rows, upsertByCode });
  };

  const downloadExcelTemplate = async () => {
    const t = templateQ.data || [];
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(t);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, ENTITIES.find((e) => e.id === entity)?.label || entity);
    XLSX.writeFile(wb, `easy-cash-import-${entity}.xlsx`);
  };

  return (
    <ERPLayout title="استيراد البيانات">
      <Card className="max-w-3xl">
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-slate-600">استيراد بيانات أساسية من Excel أو JSON. يُفضّل تعبئة كود الموظف (code) لمزامنة البصمة.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">نوع البيانات</Label>
              <select className="w-full h-9 border rounded-lg px-2 text-sm" value={entity} onChange={(e) => { setEntity(e.target.value as EntityId); setPreview([]); setJson(""); }}>
                {ENTITIES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            </div>
            <div className="flex items-end gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={loadTemplate}>تحميل نموذج JSON</Button>
              <Button variant="outline" size="sm" onClick={() => void downloadExcelTemplate()}>تحميل نموذج Excel</Button>
              <label className="inline-flex">
                <input type="file" accept=".json,.xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void parseFile(f); e.target.value = ""; }} />
                <Button type="button" variant="outline" size="sm" asChild><span>رفع ملف</span></Button>
              </label>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={upsertByCode} onChange={(e) => setUpsertByCode(e.target.checked)} />
            تحديث إذا وُجد نفس الكود (upsert)
          </label>
          <textarea className="w-full h-40 border rounded-lg p-3 font-mono text-xs" value={json} onChange={(e) => { setJson(e.target.value); try { setPreview(JSON.parse(e.target.value)); } catch { setPreview([]); } }} dir="ltr" placeholder="[]" />
          {preview.length > 0 && (
            <p className="text-xs text-slate-500">{preview.length} سجل جاهز للاستيراد</p>
          )}
          <PermissionGate module="settings" action="create">
            <Button className="gap-2 bg-blue-600" disabled={!json || imp.isPending} onClick={handleImport}>
              <Upload size={16} /> استيراد
            </Button>
          </PermissionGate>
        </CardContent>
      </Card>
    </ERPLayout>
  );
}

export function StatsPage() {
  const q = trpc.parity.settings.stats.useQuery();
  const s = q.data;
  const cards = [
    { label: "العملاء", value: s?.customers, color: "text-blue-600" },
    { label: "الموردين", value: s?.suppliers, color: "text-indigo-600" },
    { label: "الأصناف", value: s?.items, color: "text-green-600" },
    { label: "الموظفين", value: s?.employees, color: "text-purple-600" },
    { label: "المخازن", value: s?.warehouses, color: "text-teal-600" },
    { label: "الفروع", value: s?.branches, color: "text-cyan-600" },
    { label: "فواتير البيع", value: s?.salesInvoices, color: "text-emerald-600" },
    { label: "فواتير الشراء", value: s?.purchaseInvoices, color: "text-orange-600" },
    { label: "فترات مالية", value: s?.fiscalYears, color: "text-slate-600" },
    { label: "فترات مفتوحة", value: s?.openFiscalYears, color: "text-green-700" },
  ];
  return (
    <ERPLayout title="إحصائيات">
      {q.isLoading ? (
        <div className="py-16 text-center text-slate-400">جاري التحميل...</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {cards.map((x) => (
            <Card key={x.label} className="border-0 shadow-sm">
              <CardContent className="p-4 text-center">
                <div className={`text-2xl font-bold ${x.color}`}>{x.value ?? "—"}</div>
                <div className="text-sm text-slate-500 mt-1">{x.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </ERPLayout>
  );
}

export function CitiesPage() {
  const q = trpc.parity.settings.cities.list.useQuery();
  const create = trpc.parity.settings.cities.create.useMutation();
  const update = trpc.parity.settings.cities.update.useMutation();
  const del = trpc.parity.settings.cities.delete.useMutation();
  return (
    <SimpleEntityPage
      title="المدن والمحافظات"
      tableTitle="المدن"
      permissionModule="settings"
      data={q.data as any}
      isLoading={q.isLoading}
      onRefresh={() => q.refetch()}
      columns={[{ key: "governorate", label: "المحافظة" }, { key: "name", label: "المدينة" }]}
      fields={[
        { key: "governorate", label: "المحافظة", required: true },
        { key: "name", label: "المدينة", required: true },
      ]}
      onCreate={(v) => create.mutateAsync(v as any)}
      onUpdate={(id, v) => update.mutateAsync({ id, ...v } as any)}
      onDelete={(id) => del.mutateAsync(id)}
    />
  );
}

export function AddressesPage() {
  const q = trpc.parity.settings.addresses.list.useQuery();
  const citiesQ = trpc.parity.settings.cities.list.useQuery();
  const create = trpc.parity.settings.addresses.create.useMutation();
  const update = trpc.parity.settings.addresses.update.useMutation();
  const del = trpc.parity.settings.addresses.delete.useMutation();
  const cityMap = new Map((citiesQ.data || []).map((c: any) => [c.id, `${c.governorate} — ${c.name}`]));
  const cityOptions = (citiesQ.data || []).map((c: any) => ({
    value: String(c.id),
    label: `${c.governorate} — ${c.name}`,
  }));
  return (
    <SimpleEntityPage
      title="العناوين"
      tableTitle="عناوين الشركة"
      permissionModule="settings"
      data={q.data as any}
      isLoading={q.isLoading}
      onRefresh={() => q.refetch()}
      columns={[
        { key: "label", label: "التسمية" },
        { key: "cityId", label: "المدينة", render: (r) => cityMap.get(r.cityId as number) || "—" },
        { key: "address", label: "العنوان" },
        { key: "phone", label: "الهاتف" },
      ]}
      fields={[
        { key: "label", label: "التسمية", required: true },
        { key: "cityId", label: "المدينة", type: "select", options: cityOptions },
        { key: "address", label: "العنوان", type: "textarea" },
        { key: "phone", label: "الهاتف" },
      ]}
      onCreate={(v) => create.mutateAsync({
        ...v,
        cityId: v.cityId ? Number(v.cityId) : undefined,
      } as any)}
      onUpdate={(id, v) => update.mutateAsync({
        id,
        ...v,
        cityId: v.cityId ? Number(v.cityId) : undefined,
      } as any)}
      onDelete={(id) => del.mutateAsync(id)}
    />
  );
}
