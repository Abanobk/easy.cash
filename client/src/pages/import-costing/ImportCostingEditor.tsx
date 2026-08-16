import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import * as XLSX from "xlsx";
import {
  ArrowRight,
  Calculator,
  FileSpreadsheet,
  Package,
  Pencil,
  Plus,
  Printer,
  Save,
  Ship,
  Trash2,
  X,
} from "lucide-react";
import ERPLayout from "@/components/ERPLayout";
import PermissionGate from "@/components/PermissionGate";
import { trpc } from "@/lib/trpc";
import { tenantPath, useTenantSlug } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { buildImportCostingAssistantSummary } from "@/lib/assistant-import-costing";
import { clearAssistantScreen, publishAssistantScreen } from "@/lib/assistant-screen";
import { printImportCostingReport } from "@/lib/print-import-costing";
import {
  ALLOC_LABELS,
  PRESETS,
  computeImportCost,
  customPresetName,
  defaultShippingQuote,
  emptyImportCostHeader,
  emptyImportCostLine,
  presetKind,
  resolvedFreight,
  type AllocKey,
  type ImportCostHeader,
  type ImportCostLineInput,
  type ImportCostPresetId,
  type ImportCostResult,
  type ShippingQuote,
} from "@shared/import-costing";

function money(n: number, digits = 2) {
  return Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function toPct(rate: number) {
  return Math.round((Number(rate) || 0) * 10000) / 100;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function asDateInput(value: unknown) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value);
  return s.includes("T") ? s.slice(0, 10) : s.slice(0, 10);
}

function presetLabel(preset: string, customName: string) {
  if (preset === "no_batteries") return "سوتيحات";
  if (preset === "with_batteries") return "لوكات";
  return customName.trim() || "مخصص";
}

const ALLOC_OPTIONS = (Object.keys(ALLOC_LABELS) as AllocKey[]).map((k) => ({
  id: k,
  label: ALLOC_LABELS[k],
}));

type EditorDraft = {
  name: string;
  shipmentDate: string;
  notes: string;
  preset: string;
  customName: string;
  header: ImportCostHeader;
  lines: ImportCostLineInput[];
};

function draftStorageKey(tenantSlug: string | null | undefined, recordId: string) {
  return `eca-import-costing:${tenantSlug || "tenant"}:${recordId}`;
}

function readDraft(key: string): EditorDraft | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EditorDraft;
    if (!parsed || !Array.isArray(parsed.lines)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDraft(key: string, draft: EditorDraft) {
  try {
    sessionStorage.setItem(key, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

function clearDraft(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export default function ImportCostingEditor() {
  const params = useParams<{ id: string }>();
  const tenantSlug = useTenantSlug();
  const [, navigate] = useLocation();
  const isNew = params.id === "new" || !params.id;
  const id = isNew ? 0 : parseInt(params.id || "0", 10);

  const searchString = useSearch();
  const startInEdit = isNew || new URLSearchParams(searchString).get("edit") === "1";
  const [editing, setEditing] = useState(startInEdit);
  const locked = !isNew && !editing;
  const [editTab, setEditTab] = useState("basics");

  const [name, setName] = useState("");
  const [shipmentDate, setShipmentDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [preset, setPreset] = useState<string>("no_batteries");
  const [customName, setCustomName] = useState("");
  const [header, setHeader] = useState<ImportCostHeader>(() => emptyImportCostHeader());
  const [lines, setLines] = useState<ImportCostLineInput[]>(() => [emptyImportCostLine()]);

  const { can } = usePermissions();
  const canSave = isNew ? can("import_costing", "create") : can("import_costing", "edit");
  const recordKey = isNew ? "new" : String(id);
  const storageKey = draftStorageKey(tenantSlug, recordKey);
  const newHydrated = useRef(false);
  const appliedServerId = useRef(0);
  const existing = trpc.importCosting.get.useQuery(id, {
    enabled: !isNew && id > 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const { data: company } = trpc.saas.getCompanyProfile.useQuery();

  const applyDraft = (draft: EditorDraft) => {
    setName(draft.name || "");
    setShipmentDate(draft.shipmentDate || today());
    setNotes(draft.notes || "");
    setPreset(draft.preset || "custom");
    setCustomName(draft.customName || "");
    setHeader({
      ...emptyImportCostHeader(),
      ...draft.header,
      shippingQuote: draft.header?.shippingQuote || defaultShippingQuote(),
    });
    setLines(draft.lines.length ? draft.lines : [emptyImportCostLine()]);
  };

  const applyServer = (data: NonNullable<typeof existing.data>) => {
    applyDraft({
      name: data.name,
      shipmentDate: asDateInput(data.shipmentDate) || today(),
      notes: data.notes || "",
      preset: data.preset || "custom",
      customName: customPresetName(data.preset),
      header: {
        ...emptyImportCostHeader(),
        ...data.header,
        shippingQuote: data.header.shippingQuote || defaultShippingQuote(),
      },
      lines: data.lines.length
        ? data.lines.map((l) => ({
          category: l.category,
          barcode: l.barcode,
          itemName: l.itemName,
          quantity: l.quantity,
          unitCostUsd: l.unitCostUsd,
          unitWeight: l.unitWeight,
        }))
        : [emptyImportCostLine()],
    });
    appliedServerId.current = data.id;
  };

  const createMut = trpc.importCosting.create.useMutation({
    onSuccess: (r) => {
      clearDraft(draftStorageKey(tenantSlug, "new"));
      toast.success("تم الحفظ — هتفتح المعاينة كتقرير");
      navigate(tenantPath(tenantSlug, `/import-costing/${r.id}`));
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.importCosting.update.useMutation({
    onSuccess: () => {
      clearDraft(storageKey);
      setEditing(false);
      toast.success("تم الحفظ — رجعت للمعاينة بنفس الأرقام");
      existing.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (!isNew) return;
    if (newHydrated.current) return;
    const draft = readDraft(storageKey);
    if (draft) {
      applyDraft(draft);
      toast.message("تم استرجاع مسودة التقدير الجديد");
    }
    newHydrated.current = true;
  }, [isNew, storageKey]);

  useEffect(() => {
    if (isNew || !existing.data) return;
    if (editing && appliedServerId.current === existing.data.id) return;
    applyServer(existing.data);
  }, [isNew, existing.data, editing]);

  useEffect(() => {
    if (!isNew || !newHydrated.current) return;
    const timer = window.setTimeout(() => {
      writeDraft(storageKey, { name, shipmentDate, notes, preset, customName, header, lines });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [isNew, storageKey, name, shipmentDate, notes, preset, customName, header, lines]);

  const computed = useMemo(() => computeImportCost(header, lines), [header, lines]);
  const freight = useMemo(() => resolvedFreight(header), [header]);
  const quote = useMemo(
    () => header.shippingQuote || defaultShippingQuote(),
    [header.shippingQuote],
  );
  const filledLines = lines.filter((l) => l.itemName.trim()).length;
  const typeLabel = presetLabel(preset, customName);

  useEffect(() => {
    if (existing.isLoading && !isNew) return;
    publishAssistantScreen({
      kind: "import_costing",
      title: name || (isNew ? "تقدير شحنة جديد" : "تكليف شحنة"),
      summary: buildImportCostingAssistantSummary({
        name,
        number: existing.data?.number,
        shipmentDate,
        typeLabel,
        notes,
        locked,
        header,
        quote,
        computed,
      }),
    });
    return () => clearAssistantScreen("import_costing");
  }, [
    isNew,
    existing.isLoading,
    existing.data?.number,
    name,
    shipmentDate,
    typeLabel,
    notes,
    locked,
    header,
    quote,
    computed,
  ]);

  const setH = (key: keyof ImportCostHeader, value: string | AllocKey) => {
    if (presetKind(preset) !== "custom") setPreset("custom");
    setHeader((prev) => ({
      ...prev,
      [key]: typeof prev[key] === "number" ? Number(value) || 0 : value,
    }));
  };

  const setPct = (key: "customsRate" | "vatRate" | "withholdingRate", value: string) => {
    setH(key, String((Number(value) || 0) / 100));
  };

  const applyPreset = (pid: ImportCostPresetId) => {
    setPreset(pid);
    setCustomName("");
    setHeader({ ...PRESETS[pid].header, shippingQuote: defaultShippingQuote() });
  };

  const setQ = <K extends keyof ShippingQuote>(key: K, value: ShippingQuote[K]) => {
    setHeader((prev) => ({
      ...prev,
      shippingQuote: { ...(prev.shippingQuote || defaultShippingQuote()), [key]: value },
    }));
  };

  const storedPreset = () => {
    if (presetKind(preset) !== "custom") return preset;
    const typed = customName.trim();
    return typed ? typed.slice(0, 32) : "custom";
  };

  const updateLine = (index: number, key: keyof ImportCostLineInput, value: string) => {
    setLines((prev) => prev.map((line, i) => {
      if (i !== index) return line;
      if (key === "quantity" || key === "unitCostUsd" || key === "unitWeight") {
        return { ...line, [key]: Number(value) || 0 };
      }
      return { ...line, [key]: value };
    }));
  };

  const payload = () => {
    const freightNow = resolvedFreight(header);
    return {
      header: {
        name: name.trim() || "تقدير شحنة",
        shipmentDate: shipmentDate || null,
        notes: notes || null,
        preset: storedPreset(),
        currencyCode: "USD",
        ...header,
        shippingUsd: freightNow.shippingUsd,
        freightLocalEgp: freightNow.freightLocalEgp,
      },
      lines: lines.filter((l) => l.itemName.trim()),
    };
  };

  const save = () => {
    const body = payload();
    if (!body.lines.length) {
      toast.error("أضف صنفاً واحداً على الأقل");
      setEditTab("items");
      return;
    }
    if (isNew) createMut.mutate(body);
    else updateMut.mutate({ id, ...body });
  };

  const handlePrint = () => {
    if (!filledLines) {
      toast.error("لا توجد أصناف للطباعة — أضف أصنافاً أولاً");
      return;
    }
    printImportCostingReport({
      companyName: company?.name,
      companyAddress: company?.address ?? undefined,
      companyPhone: company?.phone ?? undefined,
      companyTaxNumber: company?.taxNumber ?? undefined,
      companyLogo: company?.logo,
      name: name || "تقدير بدون اسم",
      number: existing.data?.number,
      shipmentDate,
      typeLabel,
      notes,
      header,
      quote,
      computed,
    });
  };

  const exportExcel = () => {
    const rows = computed.lines.map((l, i) => ({
      م: i + 1,
      الفئة: l.category,
      الباركود: l.barcode,
      الصنف: l.itemName,
      الكمية: l.quantity,
      "التكلفة $": l.unitCostUsd,
      الإجمالي: l.lineTotalUsd,
      "وزن الوحدة": l.unitWeight,
      "إجمالي الوزن": l.totalWeight,
      "نصيب الشحن $": l.shippingUsd,
      "عمولة الصين $": l.agentUsd,
      "إجمالي التكلفة $": l.totalUsd,
      "تكلفة الوحدة $": l.unitUsd,
      "تكلفة الوحدة ج": l.unitEgp,
      "جمارك الوحدة": l.customsUnitEgp,
      "ضريبة 14% للوحدة": l.vatUnitEgp,
      "أ.ت.ص للوحدة": l.withholdingUnitEgp,
      "أرضيات الوحدة": l.yardUnitEgp,
      "مخلص الوحدة": l.brokerUnitEgp,
      "تكلفة البطاريات للوحدة": l.batteriesUnitEgp,
      "شحن محلي للوحدة": l.freightLocalUnitEgp,
      "التكلفة الإجمالية للوحدة": l.landedUnitEgp,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "تكليف");
    XLSX.writeFile(wb, `import-costing-${name || "draft"}.xlsx`);
  };

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <ERPLayout title={isNew ? "تقدير شحنة جديد" : locked ? `تقرير: ${name || "تكليف شحنة"}` : `تعديل: ${name || "تكليف شحنة"}`}>
      <PermissionGate
        module="import_costing"
        action="view"
        featureKey="importcosting-shipments"
        fallback={<p className="text-sm text-slate-500">لا توجد صلاحية لعرض تكليف الشحنة.</p>}
      >
        {existing.isLoading && !isNew ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
            جاري تحميل التقرير...
          </div>
        ) : (
          <div className="space-y-4 print:space-y-3">
            <Toolbar
              locked={locked}
              isNew={isNew}
              number={existing.data?.number}
              canSave={canSave}
              saving={saving}
              onBack={() => navigate(tenantPath(tenantSlug, "/import-costing"))}
              onEdit={() => { setEditing(true); setEditTab("basics"); }}
              onCancel={() => {
                if (existing.data) applyServer(existing.data);
                setEditing(false);
              }}
              onSave={save}
              onPrint={handlePrint}
              onExcel={exportExcel}
            />

            <HeroSummary
              locked={locked}
              name={name || "تقدير بدون اسم"}
              typeLabel={typeLabel}
              shipmentDate={shipmentDate}
              number={existing.data?.number}
              filledLines={filledLines}
              computed={computed}
              costFx={header.costFxRate}
            />

            {locked ? (
              <ReportView
                name={name}
                notes={notes}
                typeLabel={typeLabel}
                shipmentDate={shipmentDate}
                number={existing.data?.number}
                header={header}
                quote={quote}
                freight={freight}
                computed={computed}
              />
            ) : (
              <EditWorkspace
                editTab={editTab}
                setEditTab={setEditTab}
                name={name}
                setName={setName}
                shipmentDate={shipmentDate}
                setShipmentDate={setShipmentDate}
                notes={notes}
                setNotes={setNotes}
                preset={preset}
                setPreset={setPreset}
                customName={customName}
                setCustomName={setCustomName}
                applyPreset={applyPreset}
                header={header}
                setH={setH}
                setPct={setPct}
                quote={quote}
                setQ={setQ}
                freight={freight}
                computed={computed}
                lines={lines}
                setLines={setLines}
                updateLine={updateLine}
                filledLines={filledLines}
              />
            )}
          </div>
        )}
      </PermissionGate>
    </ERPLayout>
  );
}

function Toolbar(props: {
  locked: boolean;
  isNew: boolean;
  number?: string;
  canSave: boolean;
  saving: boolean;
  onBack: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onPrint: () => void;
  onExcel: () => void;
}) {
  return (
    <div className="sticky top-0 z-20 -mx-1 rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2.5 shadow-sm backdrop-blur print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-slate-600" onClick={props.onBack}>
            <ArrowRight size={16} />
            القائمة
          </Button>
          {props.number ? (
            <Badge variant="outline" className="font-mono text-[11px]">{props.number}</Badge>
          ) : null}
          <Badge className={props.locked ? "bg-emerald-600 hover:bg-emerald-600" : "bg-amber-500 hover:bg-amber-500"}>
            {props.isNew ? "مسودة جديدة" : props.locked ? "معاينة تقرير" : "وضع التعديل"}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={props.onExcel}>
            <FileSpreadsheet size={15} />
            Excel
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={props.onPrint}>
            <Printer size={15} />
            طباعة
          </Button>
          {props.locked && props.canSave && (
            <Button size="sm" className="h-9 gap-1.5 bg-slate-900 hover:bg-slate-800" onClick={props.onEdit}>
              <Pencil size={15} />
              تعديل
            </Button>
          )}
          {!props.locked && !props.isNew && (
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={props.onCancel}>
              <X size={15} />
              إلغاء
            </Button>
          )}
          {!props.locked && props.canSave && (
            <Button size="sm" className="h-9 gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={props.onSave} disabled={props.saving}>
              <Save size={15} />
              {props.saving ? "جاري الحفظ..." : "حفظ التقرير"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function HeroSummary(props: {
  locked: boolean;
  name: string;
  typeLabel: string;
  shipmentDate: string;
  number?: string;
  filledLines: number;
  computed: ImportCostResult;
  costFx: number;
}) {
  const t = props.computed.totals;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-bl from-slate-900 via-slate-800 to-slate-900 text-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">تكلفة وصول الشحنة</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{props.name}</h2>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">
            <span className="rounded-full bg-white/10 px-2.5 py-1">{props.typeLabel}</span>
            {props.shipmentDate ? <span className="rounded-full bg-white/10 px-2.5 py-1">{props.shipmentDate}</span> : null}
            <span className="rounded-full bg-white/10 px-2.5 py-1">{props.filledLines} أصناف</span>
            {props.number ? <span className="rounded-full bg-white/10 px-2.5 py-1 font-mono">{props.number}</span> : null}
          </div>
        </div>
        <div className="text-left">
          <p className="text-[11px] text-slate-400">التكلفة الإجمالية</p>
          <p className="text-3xl font-semibold tabular-nums tracking-tight">{money(t.landedEgp)} <span className="text-base font-normal text-slate-300">ج</span></p>
          <p className="mt-1 text-[11px] text-slate-400">متوسط القطعة {money(t.avgLandedUnitEgp)} ج</p>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-4">
        <MiniStat label="مطلوب $" value={`${money(t.dueUsd)} $`} />
        <MiniStat label="مطلوب ج" value={`${money(t.dueLocalEgp)} ج`} />
        <MiniStat label="دولار محوّل" value={`${money(t.dueUsd * props.costFx)} ج`} />
        <MiniStat label="الكمية" value={money(t.quantity)} />
      </div>
      {!props.locked ? (
        <p className="border-t border-white/10 px-5 py-2 text-[11px] text-slate-400 print:hidden">
          الأرقام تتحدّث لحظياً أثناء التعديل. احفظ عشان تثبت التقرير.
        </p>
      ) : null}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900/80 px-4 py-3">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ReportView(props: {
  name: string;
  notes: string;
  typeLabel: string;
  shipmentDate: string;
  number?: string;
  header: ImportCostHeader;
  quote: ShippingQuote;
  freight: ReturnType<typeof resolvedFreight>;
  computed: ImportCostResult;
}) {
  const { header, quote, freight, computed } = props;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-1">
          <SectionTitle icon={<Package size={16} />} title="بيانات التقرير" />
          <dl className="mt-4 space-y-3 text-sm">
            <Row k="الاسم" v={props.name || "—"} />
            <Row k="النوع" v={props.typeLabel} />
            <Row k="التاريخ" v={props.shipmentDate || "—"} />
            <Row k="الرقم" v={props.number || "—"} />
            <Row k="ملاحظات" v={props.notes || "—"} />
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <SectionTitle icon={<Calculator size={16} />} title="الجمارك والضرائب" />
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Fact label="الفاتورة الجمركية" value={`${money(header.customsAssessableUsd)} $`} />
            <Fact label="صرف الجمرك" value={money(header.customsFxRate)} />
            <Fact label="صرف التكلفة" value={money(header.costFxRate)} />
            <Fact label="جمارك" value={`${money(toPct(header.customsRate))}% · ${money(computed.pools.customsEgp)} ج`} />
            <Fact label="ضريبة" value={`${money(toPct(header.vatRate))}% · ${money(computed.pools.vatEgp)} ج`} />
            <Fact label="أ.ت.ص" value={`${money(toPct(header.withholdingRate))}% · ${money(computed.pools.withholdingEgp)} ج`} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <Fact label="شحن $" value={`${money(resolvedFreight(header).shippingUsd)} $`} />
            <Fact label="عمولة الصين" value={`${money(header.agentFeeUsd)} $`} />
            <Fact label="OCA" value={`${money(header.ocaUsd)} $`} />
            <Fact label="مخلص / أرضيات" value={`${money(header.brokerFeesEgp + header.yardFeesEgp)} ج`} />
          </div>
        </section>
      </div>

      {quote.enabled ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <SectionTitle icon={<Ship size={16} />} title="عرض شركة الشحن" />
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <Fact label="المسار" value={`${quote.pol} → ${quote.pod}`} />
            <Fact label="الحجم" value={`${money(quote.volumeCbm)} CBM`} />
            <Fact label="المدة" value={`${quote.expectedWeeks} أسبوع`} />
            <Fact label="النتيجة" value={`${money(freight.quote.ofUsd)} $ + ${money(freight.quote.localEgp)} ج`} />
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <SectionTitle icon={<Package size={16} />} title="بنود الأصناف وتكلفة الوصول" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {["#", "الصنف", "كمية", "سعر $", "وحدة $", "وحدة ج", "جمارك", "ضريبة", "وصول ج"].map((h) => (
                  <th key={h} className="px-3 py-3 text-right font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {computed.lines.map((l, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-2.5 text-slate-400">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-slate-800">{l.itemName}</p>
                    {(l.category || l.barcode) ? (
                      <p className="text-[11px] text-slate-400">{[l.category, l.barcode].filter(Boolean).join(" · ")}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{money(l.quantity)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{money(l.unitCostUsd, 3)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{money(l.unitUsd, 3)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{money(l.unitEgp)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{money(l.customsUnitEgp)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{money(l.vatUnitEgp)}</td>
                  <td className="px-3 py-2.5 font-semibold tabular-nums text-slate-900">{money(l.landedUnitEgp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function EditWorkspace(props: {
  editTab: string;
  setEditTab: (v: string) => void;
  name: string;
  setName: (v: string) => void;
  shipmentDate: string;
  setShipmentDate: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  preset: string;
  setPreset: (v: string) => void;
  customName: string;
  setCustomName: (v: string) => void;
  applyPreset: (id: ImportCostPresetId) => void;
  header: ImportCostHeader;
  setH: (key: keyof ImportCostHeader, value: string | AllocKey) => void;
  setPct: (key: "customsRate" | "vatRate" | "withholdingRate", value: string) => void;
  quote: ShippingQuote;
  setQ: <K extends keyof ShippingQuote>(key: K, value: ShippingQuote[K]) => void;
  freight: ReturnType<typeof resolvedFreight>;
  computed: ImportCostResult;
  lines: ImportCostLineInput[];
  setLines: React.Dispatch<React.SetStateAction<ImportCostLineInput[]>>;
  updateLine: (index: number, key: keyof ImportCostLineInput, value: string) => void;
  filledLines: number;
}) {
  const {
    header, quote, freight, computed, lines, setLines, updateLine, setH, setPct, setQ,
  } = props;

  return (
    <Tabs value={props.editTab} onValueChange={props.setEditTab} className="space-y-4 print:hidden">
      <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 md:grid-cols-4">
        <TabsTrigger value="basics" className="rounded-lg py-2.5 text-xs sm:text-sm">1. أساسيات</TabsTrigger>
        <TabsTrigger value="duties" className="rounded-lg py-2.5 text-xs sm:text-sm">2. جمارك ورسوم</TabsTrigger>
        <TabsTrigger value="freight" className="rounded-lg py-2.5 text-xs sm:text-sm">3. عرض الشحن</TabsTrigger>
        <TabsTrigger value="items" className="rounded-lg py-2.5 text-xs sm:text-sm">
          4. الأصناف
          {props.filledLines > 0 ? <span className="mr-1 rounded-full bg-blue-600 px-1.5 text-[10px] text-white">{props.filledLines}</span> : null}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="basics" className="mt-0">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <SectionTitle title="بيانات التقدير" subtitle="الاسم والنوع والتاريخ فقط — الحسابات في الخطوات التالية" />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="اسم التقدير">
              <Input className="h-10" value={props.name} onChange={(e) => props.setName(e.target.value)} placeholder="مثلاً شحنة سويتش أغسطس" />
            </Field>
            <Field label="التاريخ">
              <Input className="h-10" type="date" value={props.shipmentDate} onChange={(e) => props.setShipmentDate(e.target.value)} />
            </Field>
            <Field label="نوع الشحنة">
              <Select value={presetKind(props.preset)} onValueChange={(v) => {
                if (v === "custom") props.setPreset("custom");
                else props.applyPreset(v as ImportCostPresetId);
              }}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no_batteries">سوتيحات</SelectItem>
                  <SelectItem value="with_batteries">لوكات</SelectItem>
                  <SelectItem value="custom">مخصص — أكتب نوع تاني</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {presetKind(props.preset) === "custom" && (
              <Field label="اكتب النوع">
                <Input className="h-10" value={props.customName} onChange={(e) => props.setCustomName(e.target.value)} placeholder="أجهزة — إضاءة — خامات..." />
              </Field>
            )}
          </div>
          <Field label="ملاحظات">
            <Textarea rows={3} value={props.notes} onChange={(e) => props.setNotes(e.target.value)} placeholder="اختياري" />
          </Field>
          <div className="flex justify-end">
            <Button onClick={() => props.setEditTab("duties")}>التالي: الجمارك والرسوم</Button>
          </div>
        </section>
      </TabsContent>

      <TabsContent value="duties" className="mt-0 space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <SectionTitle title="أسعار الصرف والفاتورة الجمركية" subtitle="النسب بالمائة الصحيحة — اكتب 20 يعني 20%" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Num label="سعر صرف التكلفة" value={header.costFxRate} onChange={(v) => setH("costFxRate", v)} />
            <Num label="سعر صرف الجمرك" value={header.customsFxRate} onChange={(v) => setH("customsFxRate", v)} />
            <Num label="الفاتورة الجمركية $" value={header.customsAssessableUsd} onChange={(v) => setH("customsAssessableUsd", v)} />
            <Num label="نسبة الجمارك %" value={toPct(header.customsRate)} onChange={(v) => setPct("customsRate", v)} step="1" />
            <Num label="ضريبة %" value={toPct(header.vatRate)} onChange={(v) => setPct("vatRate", v)} step="1" />
            <Num label="أ.ت.ص %" value={toPct(header.withholdingRate)} onChange={(v) => setPct("withholdingRate", v)} step="1" />
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
            وعاء الجمرك {money(header.customsAssessableUsd * header.customsFxRate)} ج
            {" · "}جمارك {money(computed.pools.customsEgp)} ج
            {" · "}ضريبة {money(computed.pools.vatEgp)} ج
            {" · "}أ.ت.ص {money(computed.pools.withholdingEgp)} ج
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <SectionTitle title="رسوم إضافية وتوزيعها" subtitle="لو مفعّل عرض الشحن، النولون بيتملّى لوحده" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Num
              label="مصاريف الشحن $"
              hint={quote.enabled ? "من حاسبة العرض" : undefined}
              value={quote.enabled ? freight.shippingUsd : header.shippingUsd}
              onChange={(v) => setH("shippingUsd", v)}
              disabled={quote.enabled}
            />
            <Num label="عمولة الصين $" value={header.agentFeeUsd} onChange={(v) => setH("agentFeeUsd", v)} />
            <Num label="OCA $" value={header.ocaUsd} onChange={(v) => setH("ocaUsd", v)} />
            <Num label="أرضيات ج" value={header.yardFeesEgp} onChange={(v) => setH("yardFeesEgp", v)} />
            <Num label="مخلص جمركي ج" value={header.brokerFeesEgp} onChange={(v) => setH("brokerFeesEgp", v)} />
            <Num label="تكلفة بطاريات ج" value={header.batteriesEgp} onChange={(v) => setH("batteriesEgp", v)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Alloc label="توزيع OCA" value={header.ocaAlloc} onChange={(v) => setH("ocaAlloc", v)} />
            <Alloc label="توزيع الشحن" value={header.shippingAlloc} onChange={(v) => setH("shippingAlloc", v)} />
            <Alloc label="توزيع العمولة" value={header.agentAlloc} onChange={(v) => setH("agentAlloc", v)} />
            <Alloc label="توزيع الجمارك/الضرائب" value={header.localAlloc} onChange={(v) => setH("localAlloc", v)} />
          </div>
          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={() => props.setEditTab("basics")}>السابق</Button>
            <Button onClick={() => props.setEditTab("freight")}>التالي: عرض الشحن</Button>
          </div>
        </section>
      </TabsContent>

      <TabsContent value="freight" className="mt-0">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle
              icon={<Ship size={16} />}
              title="حاسبة عرض شركة الشحن"
              subtitle="CBM + المدة → نولون بالدولار وTHC/تخزين بالمصري"
            />
            <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <Switch checked={quote.enabled} onCheckedChange={(v) => setQ("enabled", v)} />
              احسب من العرض
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="POL"><Input className="h-10" value={quote.pol} onChange={(e) => setQ("pol", e.target.value)} /></Field>
            <Field label="POD"><Input className="h-10" value={quote.pod} onChange={(e) => setQ("pod", e.target.value)} /></Field>
            <Num label="حجم CBM" value={quote.volumeCbm} onChange={(v) => setQ("volumeCbm", Number(v) || 0)} step="0.01" />
            <Field label="المدة المتوقعة">
              <Select value={String(quote.expectedWeeks)} onValueChange={(v) => setQ("expectedWeeks", Number(v))}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">أسبوع</SelectItem>
                  <SelectItem value="2">أسبوعين</SelectItem>
                  <SelectItem value="3">3 أسابيع</SelectItem>
                  <SelectItem value="4">شهر</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Num label="نولون $ / WM" value={quote.ofRateUsd} onChange={(v) => setQ("ofRateUsd", Number(v) || 0)} />
            <Num label="THC ج / WM" value={quote.thcRateEgp} onChange={(v) => setQ("thcRateEgp", Number(v) || 0)} />
            <Num label="تخزين أسبوع 1 ج" value={quote.storageWeek1Egp} onChange={(v) => setQ("storageWeek1Egp", Number(v) || 0)} />
            <Num label="يوم إضافي ج" value={quote.extraDayRateEgp} onChange={(v) => setQ("extraDayRateEgp", Number(v) || 0)} />
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-950">
            <p className="font-medium">
              الناتج: {money(freight.quote.ofUsd)} $ + {money(freight.quote.localEgp)} ج
              {quote.enabled ? " — داخل التكلفة الآن" : " — فعّل الحساب عشان يدخل"}
            </p>
            <p className="mt-1 text-xs text-blue-800/80">
              CBM محلي {money(freight.quote.localCbm)} · أيام إضافية {freight.quote.extraDays}
              {" · "}THC {money(freight.quote.thcEgp + freight.quote.thcVatEgp)} ج
              {" · "}تخزين {money(freight.quote.storageEgp + freight.quote.storageVatEgp)} ج
            </p>
          </div>
          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={() => props.setEditTab("duties")}>السابق</Button>
            <Button onClick={() => props.setEditTab("items")}>التالي: الأصناف</Button>
          </div>
        </section>
      </TabsContent>

      <TabsContent value="items" className="mt-0">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
            <SectionTitle title="الأصناف" subtitle="اسم حر — مش مربوط بالمخزن. تكلفة الوصول تظهر فورًا" />
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setLines((p) => [...p, emptyImportCostLine()])}>
              <Plus size={15} />
              سطر جديد
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {["#", "الفئة", "الباركود", "الصنف", "كمية", "سعر $", "وزن", "إجمالي $", "وصول ج", ""].map((h) => (
                    <th key={h || "x"} className="px-2 py-3 text-right font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => {
                  const c = computed.lines[i];
                  return (
                    <tr key={i} className="border-t border-slate-100 align-middle">
                      <td className="px-2 py-2 text-slate-400">{i + 1}</td>
                      <td className="px-1 py-1.5"><Input className="h-9 text-xs" value={line.category || ""} onChange={(e) => updateLine(i, "category", e.target.value)} /></td>
                      <td className="px-1 py-1.5"><Input className="h-9 text-xs" value={line.barcode || ""} onChange={(e) => updateLine(i, "barcode", e.target.value)} /></td>
                      <td className="px-1 py-1.5 min-w-[160px]"><Input className="h-9 text-xs" value={line.itemName} onChange={(e) => updateLine(i, "itemName", e.target.value)} placeholder="اسم الصنف" /></td>
                      <td className="px-1 py-1.5 w-20"><Input className="h-9 text-xs" type="number" value={line.quantity || ""} onChange={(e) => updateLine(i, "quantity", e.target.value)} /></td>
                      <td className="px-1 py-1.5 w-24"><Input className="h-9 text-xs" type="number" step="0.01" value={line.unitCostUsd || ""} onChange={(e) => updateLine(i, "unitCostUsd", e.target.value)} /></td>
                      <td className="px-1 py-1.5 w-20"><Input className="h-9 text-xs" type="number" step="0.001" value={line.unitWeight || ""} onChange={(e) => updateLine(i, "unitWeight", e.target.value)} /></td>
                      <td className="px-2 py-2 tabular-nums text-slate-600">{money(c?.lineTotalUsd || 0)}</td>
                      <td className="px-2 py-2 font-semibold tabular-nums text-slate-900">{money(c?.landedUnitEgp || 0)}</td>
                      <td className="px-2 py-2">
                        <button type="button" className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => setLines((p) => p.filter((_, j) => j !== i))} aria-label="حذف">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between gap-2 border-t border-slate-100 px-5 py-4">
            <Button variant="outline" onClick={() => props.setEditTab("freight")}>السابق</Button>
            <p className="self-center text-xs text-slate-500">بعد ما تخلّص — احفظ التقرير من الشريط فوق</p>
          </div>
        </section>
      </TabsContent>
    </Tabs>
  );
}

function SectionTitle({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      {icon ? <span className="mt-0.5 text-slate-500">{icon}</span> : null}
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs text-slate-600">{label}</Label>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-0">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-left font-medium text-slate-800">{v}</dd>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Num({ label, hint, value, onChange, step, disabled }: { label: string; hint?: string; value: number; onChange: (v: string) => void; step?: string; disabled?: boolean }) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs text-slate-600">{label}</Label>
      <Input className="h-10 text-sm" type="number" step={step || "0.01"} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
      {hint ? <p className="mt-1 text-[11px] text-slate-400">{hint}</p> : null}
    </div>
  );
}

function Alloc({ label, value, onChange, disabled }: { label: string; value: AllocKey; onChange: (v: AllocKey) => void; disabled?: boolean }) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs text-slate-600">{label}</Label>
      <Select value={value} disabled={disabled} onValueChange={(v) => onChange(v as AllocKey)}>
        <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {ALLOC_OPTIONS.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
