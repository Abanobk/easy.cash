import ERPLayout from "@/components/ERPLayout";
import PermissionGate from "@/components/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useItemOptions, useWarehouseOptions } from "@/hooks/useEntityOptions";
import { tenantPath, useTenantSlug } from "@/lib/tenant";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Package,
  PackagePlus,
  Upload,
  Warehouse,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type CleanRow = {
  key: string;
  name: string;
  warehouse: string;
  quantity: string;
  unitCost: string;
  unit: string;
  barcode: string;
  code: string;
  category: string;
  included: boolean;
};

type PreviewRow = {
  index: number;
  rawName: string;
  rawBarcode: string;
  rawCode: string;
  rawWarehouse: string;
  rawCategory: string;
  rawUnit: string;
  quantity: string;
  unitCost: string;
  status: string;
  matchBy: string | null;
  itemId: number | null;
  itemName: string | null;
  itemCode: string | null;
  itemBarcode: string | null;
  itemUnit: string | null;
  suggestedUnitCost: string;
  candidates: Array<{ id: number; name: string; code: string | null; barcode: string | null }>;
  warehouseId: number | null;
  warehouseName: string | null;
  warehouseStatus: string;
  warehouseCandidates: Array<{ id: number; name: string }>;
  selectedItemId: string;
  selectedWarehouseId: string;
  included: boolean;
  remapItem: boolean;
  remapWarehouse: boolean;
  creating?: boolean;
};

export default function BeginningInventorySmartImport() {
  const tenantSlug = useTenantSlug();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const previewMut = trpc.parity.inventory.beginningInventory.smartImportPreview.useMutation();
  const commitMut = trpc.parity.inventory.beginningInventory.smartImportCommit.useMutation();
  const createMissingMut = trpc.parity.inventory.beginningInventory.createMissingItems.useMutation();
  const syncUnitsMut = trpc.parity.inventory.beginningInventory.syncItemUnits.useMutation();
  const cleanImportMut = trpc.parity.inventory.beginningInventory.cleanImport.useMutation();
  const warehouses = useWarehouseOptions();
  const items = useItemOptions();
  const itemsQuery = trpc.items.list.useQuery({ page: 1, limit: 500 });

  const [fallbackWarehouseId, setFallbackWarehouseId] = useState("");
  const [showFallbackWh, setShowFallbackWh] = useState(false);
  const [importDate, setImportDate] = useState(new Date().toISOString().slice(0, 10));
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [cleanBusy, setCleanBusy] = useState(false);
  const [cleanRows, setCleanRows] = useState<CleanRow[] | null>(null);
  const [cleanFileName, setCleanFileName] = useState("");
  const [rowFilter, setRowFilter] = useState<"all" | "ready" | "review" | "missing">("all");
  const [summary, setSummary] = useState<{
    total: number;
    matched: number;
    ambiguous: number;
    unmatched: number;
    invalid: number;
    warehouseMatched?: number;
    warehouseUnmatched?: number;
  } | null>(null);
  const [parsing, setParsing] = useState(false);
  const [creatingKey, setCreatingKey] = useState<string | null>(null);

  const rowReady = (r: PreviewRow) =>
    !!r.selectedItemId && Number(r.quantity) > 0 && !!r.selectedWarehouseId;

  const needsReview = (r: PreviewRow) =>
    !rowReady(r)
    || r.status === "ambiguous"
    || r.status === "unmatched"
    || r.status === "invalid"
    || r.warehouseStatus === "unmatched"
    || r.warehouseStatus === "ambiguous"
    || r.warehouseStatus === "missing";

  const readyCount = useMemo(() => previewRows.filter((r) => r.included && rowReady(r)).length, [previewRows]);
  const missingRows = useMemo(
    () => previewRows.filter((r) => r.status === "unmatched" || (!r.selectedItemId && r.status !== "matched")),
    [previewRows],
  );
  const reviewCount = useMemo(() => previewRows.filter(needsReview).length, [previewRows]);

  const warehouseMap = useMemo(() => {
    const map = new Map<string, { raw: string; count: number; status: string; resolved?: string; id?: string }>();
    for (const r of previewRows) {
      const key = String(r.rawWarehouse || "— بدون مخزن —").trim() || "— بدون مخزن —";
      const cur = map.get(key) || { raw: key, count: 0, status: r.warehouseStatus || "missing" };
      cur.count += 1;
      if (r.selectedWarehouseId) {
        cur.id = r.selectedWarehouseId;
        cur.resolved = warehouses.find((w) => w.value === r.selectedWarehouseId)?.label
          || r.warehouseName
          || cur.resolved;
        cur.status = "matched";
      } else if (r.warehouseStatus === "matched" || r.warehouseStatus === "default") {
        cur.status = r.warehouseStatus;
        cur.resolved = r.warehouseName || cur.resolved;
        cur.id = r.warehouseId ? String(r.warehouseId) : cur.id;
      } else if (cur.status !== "matched") {
        cur.status = r.warehouseStatus || cur.status;
      }
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [previewRows, warehouses]);

  const filteredRows = useMemo(() => {
    const all = previewRows.map((r, i) => ({ r, i }));
    if (rowFilter === "ready") return all.filter(({ r }) => rowReady(r) && !needsReview(r));
    if (rowFilter === "review") return all.filter(({ r }) => needsReview(r) && r.status !== "unmatched");
    if (rowFilter === "missing") {
      return all.filter(({ r }) =>
        r.status === "unmatched"
        || r.warehouseStatus === "unmatched"
        || r.warehouseStatus === "missing"
        || !r.selectedItemId);
    }
    return all;
  }, [previewRows, rowFilter]);

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet([
      {
        المخزن: "مخزن الخامات",
        الصنف: "مثال صنف",
        الكمية: 10,
        "متوسط التكلفة": 25,
        "اجمالي التكلفة": 250,
        الوحدة: "كيلو",
        الفئة: "",
        باركود: "123456789",
      },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تكاليف الاصناف");
    XLSX.writeFile(wb, "beginning-inventory-template.xlsx");
  };

  const pickCol = (
    row: Record<string, unknown>,
    keys: string[],
    opts?: { partial?: boolean; exclude?: RegExp },
  ) => {
    const entries = Object.keys(row).map((k) => [k.trim().toLowerCase().replace(/\s+/g, " "), k] as const);
    const map = new Map(entries);
    const usable = (norm: string, real: string) => {
      if (opts?.exclude?.test(norm)) return false;
      return row[real] != null && String(row[real]).trim() !== "";
    };
    for (const want of keys) {
      const real = map.get(want.toLowerCase().replace(/\s+/g, " "));
      if (real != null && usable(want.toLowerCase(), real)) return String(row[real]).trim();
    }
    if (opts?.partial === false) return "";
    for (const want of keys) {
      const w = want.toLowerCase().replace(/\s+/g, " ");
      for (const [norm, real] of entries) {
        if (norm.includes(w) && usable(norm, real)) {
          return String(row[real]).trim();
        }
      }
    }
    return "";
  };

  const mapExcelRows = (json: Record<string, unknown>[]) => json.map((r) => ({
    warehouse: pickCol(r, ["warehouse", "المخزن", "مخزن", "store", "warehouse name"]),
    barcode: pickCol(r, ["barcode", "باركود", "الباركود", "bar code", "part number", "partno"], { partial: false })
      || pickCol(r, ["barcode", "باركود", "الباركود"]),
    code: pickCol(r, ["code", "كود", "الكود", "item code", "part number", "partno", "pn"], { partial: false })
      || pickCol(r, ["الكود", "كود الصنف", "item code"]),
    name: pickCol(r, ["name", "اسم", "الصنف", "اسم الصنف", "item", "item name", "الوصف"]),
    quantity: pickCol(r, ["quantity", "qty", "كمية", "الكمية", "رصيد", "الرصيد"]),
    unitCost: pickCol(r, [
      "متوسط التكلفة",
      "متوسط التكلفه",
      "unitcost",
      "unit_cost",
      "unit cost",
      "avg cost",
      "average cost",
      "تكلفة الوحدة",
      "سعر التكلفة",
    ], { exclude: /اجمالي|إجمالي|اجمالى|إجمالى|total/ })
      || pickCol(r, ["cost", "تكلفة", "التكلفة", "سعر"], {
        exclude: /اجمالي|إجمالي|اجمالى|إجمالى|total|متوسط/,
      }),
    totalCost: pickCol(r, [
      "اجمالي التكلفة",
      "إجمالي التكلفة",
      "اجمالى التكلفة",
      "إجمالى التكلفة",
      "total cost",
      "totalcost",
    ]),
    category: pickCol(r, ["category", "الفئة", "فئة", "التصنيف"]),
    unit: pickCol(r, [
      "وحدة القياس",
      "وحده القياس",
      "الوحدة",
      "الوحده",
      "وحدة",
      "وحده",
      "unit",
      "uom",
      "measure",
    ], { exclude: /تكلفة|سعر|cost|price|متوسط|اجمالي|إجمالي/ }),
  })).filter((r) => r.name || r.barcode || r.code);

  /** قراءة الإكسل وعرضه للمراجعة فقط — من غير أي حفظ في قاعدة البيانات */
  const prepareCleanImport = async (file: File) => {
    setCleanBusy(true);
    setCleanFileName(file.name);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      if (!json.length) {
        toast.error("الملف فاضي");
        return;
      }
      const mapped = mapExcelRows(json);
      if (!mapped.length) {
        toast.error("لم يُعثر على أعمدة صالحة — المخزن / الصنف / الكمية");
        return;
      }
      // لا نشيل الأصناف برصيد صفر — لسه محتاجين نضيفها كصنف حتى لو من غير رصيد أول مدة
      const rows: CleanRow[] = mapped
        .filter((r) => r.name && r.warehouse)
        .map((r, idx) => ({
          key: String(idx),
          name: r.name,
          warehouse: r.warehouse,
          quantity: r.quantity || "0",
          unitCost: r.unitCost || "",
          unit: r.unit || "",
          barcode: r.barcode || "",
          code: r.code || "",
          category: r.category || "",
          included: true,
        }));
      if (!rows.length) {
        toast.error("لا توجد أسطر جاهزة (لازم: صنف + مخزن)");
        return;
      }
      setCleanRows(rows);
      toast.message(`${rows.length} سطر جاهز للمراجعة — راجعهم واضغط «تأكيد وحفظ»`);
    } catch (e: any) {
      toast.error(e?.message || "فشل قراءة الملف");
    } finally {
      setCleanBusy(false);
    }
  };

  /** بعد المراجعة والتأكيد فقط: مخازن + أصناف بدون تكرار + كود + وحدات + رصيد */
  const confirmCleanImport = async () => {
    const rows = (cleanRows || []).filter((r) => r.included);
    if (!rows.length) {
      toast.error("لا توجد أسطر محدّدة للحفظ");
      return;
    }
    setCleanBusy(true);
    try {
      const res = await cleanImportMut.mutateAsync({
        date: importDate,
        rows: rows.map((r) => ({
          name: r.name,
          warehouse: r.warehouse,
          quantity: r.quantity || "0",
          barcode: r.barcode || undefined,
          code: r.code || undefined,
          unitCost: r.unitCost || undefined,
          unit: r.unit || undefined,
          category: r.category || undefined,
        })),
      });
      toast.success(
        `تم: ${res.linesImported} سطر · أصناف جديدة ${res.itemsCreated} · مطابقة ${res.itemsMatched} · مخازن جديدة ${res.warehousesCreated}`,
      );
      if (res.failed) toast.message(`فشل ${res.failed}: ${(res.errors || []).slice(0, 2).join(" · ")}`);
      await Promise.all([utils.items.list.invalidate(), itemsQuery.refetch()]);
      setCleanRows(null);
      navigate(tenantPath(tenantSlug, "/inventory/beginning-inventory"));
    } catch (e: any) {
      toast.error(e?.message || "فشل الاستيراد النظيف");
    } finally {
      setCleanBusy(false);
    }
  };

  const parseExcel = async (file: File) => {
    setParsing(true);
    setFileName(file.name);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      if (!json.length) {
        toast.error("الملف فاضي");
        return;
      }
      const rows = mapExcelRows(json);

      if (!rows.length) {
        toast.error("لم يُعثر على أعمدة صالحة — المتوقع: المخزن / الصنف / الكمية / متوسط التكلفة");
        return;
      }

      const res = await previewMut.mutateAsync({
        rows,
        defaultWarehouseId: fallbackWarehouseId ? Number(fallbackWarehouseId) : undefined,
      });
      setPreviewRows(res.rows.map((r) => {
        const whId = r.warehouseId ? String(r.warehouseId) : "";
        const whOk = (r.warehouseStatus === "matched" || r.warehouseStatus === "default") && !!whId;
        return {
          ...r,
          rawUnit: r.rawUnit || "",
          itemUnit: r.itemUnit || null,
          selectedItemId: r.itemId ? String(r.itemId) : "",
          selectedWarehouseId: whId,
          unitCost: r.unitCost || r.suggestedUnitCost || "",
          included: r.status === "matched" && whOk,
          remapItem: r.status !== "matched",
          remapWarehouse: !whOk,
        } as PreviewRow;
      }));
      setSummary(res.summary);
      setRowFilter(res.summary.unmatched > 0 ? "missing" : "all");
      toast.success(`تمت المعاينة: ${res.summary.matched} مطابق · ${res.summary.unmatched} مش موجود`);

      const unitRows = res.rows
        .filter((r) => r.itemId && String(r.rawUnit || "").trim())
        .map((r) => ({ itemId: Number(r.itemId), unit: String(r.rawUnit).trim() }));
      if (unitRows.length) {
        try {
          const sync = await syncUnitsMut.mutateAsync({ rows: unitRows });
          if (sync.updated > 0) {
            toast.success(`تم تحديث وحدة القياس لـ ${sync.updated} صنف من الإكسل`);
          } else if (sync.skipped > 0) {
            toast.message("وحدات الأصناف مطابقة للإكسل بالفعل");
          }
          if (sync.failed) toast.message(`وحدات — فشل ${sync.failed}: ${(sync.errors || []).slice(0, 2).join(" · ")}`);
          await utils.items.list.invalidate();
        } catch (e: any) {
          toast.error(e?.message || "فشلت مزامنة وحدات القياس من الإكسل");
        }
      } else {
        const anyUnitCol = rows.some((r) => String(r.unit || "").trim());
        if (!anyUnitCol) {
          toast.message("لم يُعثر على عمود وحدة القياس في الملف — الأصناف الجديدة هتتضاف بوحدة «قطعة»");
        }
      }
    } catch (e: any) {
      toast.error(e?.message || "فشل قراءة الملف");
    } finally {
      setParsing(false);
    }
  };

  const applyWarehouseToRaw = (rawName: string, warehouseId: string) => {
    const label = warehouses.find((w) => w.value === warehouseId)?.label || "";
    setPreviewRows((p) => p.map((x) => {
      const emptyRaw = !String(x.rawWarehouse || "").trim();
      const matchEmpty = rawName === "" && emptyRaw;
      const matchName = String(x.rawWarehouse || "").trim() === rawName;
      if (!matchEmpty && !matchName) return x;
      return {
        ...x,
        selectedWarehouseId: warehouseId,
        warehouseId: Number(warehouseId),
        warehouseName: label,
        warehouseStatus: "matched",
        remapWarehouse: false,
        included: !!(x.selectedItemId && warehouseId && Number(x.quantity) > 0),
      };
    }));
  };

  const applyStockForRows = async (rows: PreviewRow[], successMsg?: string) => {
    const lines = rows
      .filter((r) => r.selectedItemId && r.selectedWarehouseId && Number(r.quantity) > 0)
      .map((r) => ({
        itemId: Number(r.selectedItemId),
        warehouseId: Number(r.selectedWarehouseId),
        quantity: String(r.quantity),
        unitCost: r.unitCost ? String(r.unitCost) : undefined,
      }));
    if (!lines.length) {
      toast.message("الأصناف اتضافت — اختَر المخزن من الخريطة ثم اضغط اعتماد لتطبيق الكميات");
      return;
    }
    const res = await commitMut.mutateAsync({ date: importDate, lines });
    toast.success(successMsg || `تم تطبيق الرصيد على ${res.imported} سطر`);
    if (res.failed) toast.message(`فشل ${res.failed}: ${(res.errors || []).slice(0, 2).join(" · ")}`);
  };

  const createOneMissing = async (row: PreviewRow) => {
    const key = String(row.index);
    setCreatingKey(key);
    try {
      const res = await createMissingMut.mutateAsync({
        rows: [{
          clientKey: key,
          name: row.rawName || row.rawCode || "صنف جديد",
          barcode: row.rawBarcode || undefined,
          code: row.rawCode || undefined,
          unitCost: row.unitCost || undefined,
          unit: row.rawUnit || undefined,
        }],
      });
      const created = res.created[0];
      if (!created) {
        toast.error(res.errors?.[0] || "فشل إضافة الصنف");
        return;
      }
      const next = previewRows.map((x) => {
        if (String(x.index) !== key) return x;
        return {
          ...x,
          selectedItemId: String(created.id),
          itemId: created.id,
          itemName: created.name,
          itemCode: created.code,
          itemBarcode: created.barcode,
          status: "matched" as const,
          matchBy: "name" as const,
          remapItem: false,
          included: !!(created.id && x.selectedWarehouseId && Number(x.quantity) > 0),
        };
      });
      setPreviewRows(next);
      await Promise.all([utils.items.list.invalidate(), itemsQuery.refetch()]);
      toast.success(`تمت إضافة «${created.name}» — البارت نمبر ${created.code}`);
      await applyStockForRows(next, `تم تطبيق رصيد «${created.name}» على المخزن`);
    } catch (e: any) {
      toast.error(e?.message || "فشل إضافة الصنف");
    } finally {
      setCreatingKey(null);
    }
  };

  const createAllMissing = async () => {

    const targets = missingRows.filter((r) => (r.rawName || r.rawCode || r.rawBarcode) && !r.selectedItemId);
    if (!targets.length) return toast.error("لا توجد أصناف ناقصة للإضافة");
    setCreatingKey("__all__");
    try {
      const res = await createMissingMut.mutateAsync({
        rows: targets.map((r) => ({
          clientKey: String(r.index),
          name: r.rawName || r.rawCode || "صنف جديد",
          barcode: r.rawBarcode || undefined,
          code: r.rawCode || undefined,
          unitCost: r.unitCost || undefined,
          unit: r.rawUnit || undefined,
        })),
      });
      const createdMap = new Map(res.created.map((c) => [c.clientKey, c]));
      const next = previewRows.map((x) => {
        const created = createdMap.get(String(x.index));
        if (!created) return x;
        return {
          ...x,
          selectedItemId: String(created.id),
          itemId: created.id,
          itemName: created.name,
          itemCode: created.code,
          itemBarcode: created.barcode,
          status: "matched" as const,
          matchBy: "name" as const,
          remapItem: false,
          included: !!(created.id && x.selectedWarehouseId && Number(x.quantity) > 0),
        };
      });
      setPreviewRows(next);
      await Promise.all([utils.items.list.invalidate(), itemsQuery.refetch()]);
      toast.success(`تمت إضافة ${res.created.length} صنف ببارت نمبر تلقائي${res.failed ? ` (فشل ${res.failed})` : ""}`);
      if (res.errors?.length) toast.message(res.errors.slice(0, 2).join(" · "));
      setRowFilter("all");
      // تطبيق الكميات تلقائياً للأسطر اللي مخزنها جاهز — عشان متبقاش تكلفة من غير رصيد
      await applyStockForRows(next);
    } catch (e: any) {
      toast.error(e?.message || "فشل إضافة الأصناف");
    } finally {
      setCreatingKey(null);
    }
  };

  const commitImport = async () => {
    const lines = previewRows
      .filter((r) => r.included && rowReady(r))
      .map((r) => ({
        itemId: Number(r.selectedItemId),
        warehouseId: Number(r.selectedWarehouseId) || undefined,
        quantity: String(r.quantity),
        unitCost: r.unitCost ? String(r.unitCost) : undefined,
      }));
    if (!lines.length) return toast.error("لا توجد أسطر جاهزة — راجع الأصناف والمخازن");
    if (lines.some((l) => !(Number(l.warehouseId) > 0))) {
      return toast.error("فيه أسطر بدون مخزن — اختَر المخزن من الخريطة أو من السطر");
    }

    try {
      const res = await commitMut.mutateAsync({ date: importDate, lines });
      toast.success(`تم اعتماد ${res.imported} سطر${res.failed ? ` (فشل ${res.failed})` : ""}`);
      if (res.errors?.length) toast.message(res.errors.slice(0, 3).join(" · "));
      navigate(tenantPath(tenantSlug, "/inventory/beginning-inventory"));
    } catch (e: any) {
      toast.error(e?.message || "فشل الاعتماد");
    }
  };

  const statusPill = (s: string, kind: "item" | "wh" = "item") => {
    const styles: Record<string, string> = {
      matched: "bg-emerald-600 text-white",
      ambiguous: "bg-amber-500 text-white",
      unmatched: "bg-rose-600 text-white",
      invalid: "bg-slate-500 text-white",
      default: "bg-sky-600 text-white",
      missing: "bg-rose-600 text-white",
    };
    const labels: Record<string, string> = kind === "wh"
      ? {
        matched: "مخزن تلقائي",
        ambiguous: "مخزن متعدد",
        unmatched: "مخزن مش موجود",
        default: "مخزن احتياطي",
        missing: "بدون مخزن",
      }
      : {
        matched: "صنف مطابق",
        ambiguous: "أكثر من صنف",
        unmatched: "صنف مش موجود",
        invalid: "كمية غير صالحة",
      };
    return (
      <span className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-extrabold ${styles[s] || "bg-slate-200 text-slate-800"}`}>
        {(s === "matched" || s === "default") ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
        {labels[s] || s}
      </span>
    );
  };

  return (
    <ERPLayout title="استيراد ذكي — مخزون أول المدة">
      <PermissionGate module="inventory" action="create">
        <div className="space-y-5 pb-8" dir="rtl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="outline"
              className="font-bold gap-2 h-11"
              onClick={() => navigate(tenantPath(tenantSlug, "/inventory/beginning-inventory"))}
            >
              <ArrowRight size={16} /> رجوع لمخزون أول المدة
            </Button>
            <div className="text-sm font-bold text-slate-600">
              المخزن من عمود الإكسل تلقائياً · البارت نمبر (P-…) يُنشأ عند إضافة صنف جديد
            </div>
          </div>

          <div className="rounded-2xl border bg-gradient-to-l from-emerald-50 to-white p-5 space-y-2">
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="text-emerald-600" size={26} />
              استيراد ذكي من Excel
            </h1>
            <p className="text-base text-slate-600 font-semibold max-w-4xl leading-relaxed">
              للبداية النظيفة استخدم الزر الأزرق «استيراد نظيف تلقائي» — يسجّل المخازن والأصناف (بدون تكرار) والكود والوحدة والكميات لوحده.
              أو استخدم المعاينة اليدوية لو حابب تراجع قبل الاعتماد.
            </p>
          </div>

          <div className="rounded-2xl border-2 border-blue-400 bg-blue-50/70 p-5 space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                <PackagePlus size={24} />
              </div>
              <div className="flex-1">
                <div className="text-lg font-black text-slate-900">استيراد نظيف تلقائي (موصى به)</div>
                <p className="text-sm text-slate-700 font-semibold leading-relaxed mt-1">
                  يقرأ الملف ويعرضه للمراجعة أولاً — مخازن ناقصة · أصناف بدون تكرار مع كود P-… · وحدات قياس · رصيد أول المدة.
                  مفيش حفظ في قاعدة البيانات إلا بعد ما تراجع وتضغط «تأكيد وحفظ».
                  الأصناف برصيد صفر بتتضاف كصنف موجود عندنا حتى لو من غير كمية أول مدة.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="space-y-1">
                <Label className="text-xs font-bold">تاريخ أول المدة</Label>
                <Input type="date" className="h-11 font-bold w-44" value={importDate} onChange={(e) => setImportDate(e.target.value)} />
              </div>
              <label className="inline-flex mt-5">
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  disabled={cleanBusy || cleanImportMut.isPending}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void prepareCleanImport(f);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  size="lg"
                  className="bg-blue-600 hover:bg-blue-700 font-black text-base h-12 px-7"
                  asChild
                  disabled={cleanBusy || cleanImportMut.isPending}
                >
                  <span>
                    {cleanBusy ? "جاري قراءة الملف..." : "رفع Excel — استيراد نظيف تلقائي"}
                  </span>
                </Button>
              </label>
              {cleanFileName ? (
                <span className="text-sm font-bold text-slate-700 bg-white border rounded-xl px-3 py-2.5 mt-5">{cleanFileName}</span>
              ) : null}
            </div>
          </div>

          {cleanRows && (
            <div className="rounded-2xl border-2 border-blue-300 bg-white p-5 space-y-4" dir="rtl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="text-blue-600" size={20} />
                  مراجعة الاستيراد النظيف قبل الحفظ — {cleanRows.filter((r) => r.included).length} من {cleanRows.length} سطر محدّد
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="h-11 px-5 font-bold"
                    disabled={cleanBusy || cleanImportMut.isPending}
                    onClick={() => { setCleanRows(null); setCleanFileName(""); }}
                  >
                    إلغاء
                  </Button>
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 font-black h-11 px-6"
                    disabled={cleanBusy || cleanImportMut.isPending || !cleanRows.some((r) => r.included)}
                    onClick={() => void confirmCleanImport()}
                  >
                    {cleanImportMut.isPending ? "جاري الحفظ..." : "تأكيد وحفظ"}
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto border rounded-xl max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead className="sticky top-0 z-10 bg-slate-900 text-white">
                    <tr>
                      <th className="px-3 py-2.5 text-right font-black w-12">✓</th>
                      <th className="px-3 py-2.5 text-right font-black">الصنف</th>
                      <th className="px-3 py-2.5 text-right font-black">المخزن</th>
                      <th className="px-3 py-2.5 text-right font-black w-28">الكمية</th>
                      <th className="px-3 py-2.5 text-right font-black w-32">متوسط التكلفة</th>
                      <th className="px-3 py-2.5 text-right font-black w-24">الوحدة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cleanRows.map((r) => {
                      const qty = Number(r.quantity) || 0;
                      return (
                        <tr key={r.key} className={`border-t ${!r.included ? "opacity-40" : qty === 0 ? "bg-amber-50/60" : "bg-white"}`}>
                          <td className="px-3 py-2.5 align-top">
                            <input
                              type="checkbox"
                              className="h-5 w-5 accent-blue-600"
                              checked={r.included}
                              onChange={(e) => setCleanRows((p) => (p || []).map((x) => x.key === r.key ? { ...x, included: e.target.checked } : x))}
                            />
                          </td>
                          <td className="px-3 py-2.5 align-top font-black text-slate-900">
                            {r.name}
                            {qty === 0 ? (
                              <div className="text-xs font-bold text-amber-700 mt-0.5">بدون رصيد أول مدة — هيتضاف كصنف بس</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 align-top font-bold text-slate-700">{r.warehouse}</td>
                          <td className="px-3 py-2.5 align-top">
                            <Input
                              className="h-10 text-sm font-black"
                              value={r.quantity}
                              onChange={(e) => setCleanRows((p) => (p || []).map((x) => x.key === r.key ? { ...x, quantity: e.target.value } : x))}
                            />
                          </td>
                          <td className="px-3 py-2.5 align-top">
                            <Input
                              className="h-10 text-sm font-bold"
                              value={r.unitCost}
                              onChange={(e) => setCleanRows((p) => (p || []).map((x) => x.key === r.key ? { ...x, unitCost: e.target.value } : x))}
                            />
                          </td>
                          <td className="px-3 py-2.5 align-top font-bold text-slate-700">{r.unit || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-7 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/60 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Upload size={26} />
                </div>
                <div>
                  <div className="text-lg font-black text-slate-900">معاينة يدوية (اختياري)</div>
                  <div className="text-sm text-slate-600 font-semibold">راجع المطابقة ثم اعتمد — أو استخدم الاستيراد النظيف فوق</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <label className="inline-flex">
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void parseExcel(f);
                      e.target.value = "";
                    }}
                  />
                  <Button type="button" size="lg" className="bg-emerald-600 hover:bg-emerald-700 font-black text-base h-12 px-7" asChild disabled={parsing || previewMut.isPending}>
                    <span>{parsing || previewMut.isPending ? "جاري قراءة الملف..." : "اختيار ملف Excel"}</span>
                  </Button>
                </label>
                <Button type="button" variant="outline" size="lg" className="font-bold h-12" onClick={() => void downloadTemplate()}>
                  تحميل نموذج
                </Button>
                {fileName ? (
                  <span className="text-sm font-bold text-slate-700 bg-white border rounded-xl px-3 py-2.5">{fileName}</span>
                ) : null}
              </div>
            </div>

            <div className="xl:col-span-5 rounded-2xl border bg-white p-5 space-y-3">
              <div className="flex items-center gap-2 text-lg font-black text-slate-900">
                <Warehouse className="text-sky-600" size={20} />
                المخزن: تلقائي من الإكسل
              </div>
              <p className="text-sm text-slate-600 font-semibold leading-relaxed">
                كل سطر يروح لمخزنه من الملف. لو الاسم مش متسجل، اربطه من خريطة المخازن أو من السطر نفسه.
              </p>
              <div className="space-y-1.5">
                <Label className="text-sm font-bold">تاريخ أول المدة</Label>
                <Input type="date" className="h-12 text-base font-bold" value={importDate} onChange={(e) => setImportDate(e.target.value)} />
              </div>
              <button type="button" className="text-sm font-bold text-slate-500 underline" onClick={() => setShowFallbackWh((v) => !v)}>
                {showFallbackWh ? "إخفاء المخزن الاحتياطي" : "خيارات متقدمة: مخزن احتياطي"}
              </button>
              {showFallbackWh && (
                <Select value={fallbackWarehouseId || undefined} onValueChange={setFallbackWarehouseId}>
                  <SelectTrigger className="h-12 text-base"><SelectValue placeholder="اختياري للصفوف بلا مخزن" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => (
                      <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "إجمالي الأسطر", value: summary.total, className: "bg-slate-800 text-white" },
                { label: "صنف مطابق", value: summary.matched, className: "bg-emerald-600 text-white" },
                { label: "صنف مش موجود", value: summary.unmatched, className: "bg-rose-600 text-white" },
                { label: "يحتاج مراجعة", value: summary.ambiguous, className: "bg-amber-500 text-white" },
                { label: "مخزن تلقائي", value: summary.warehouseMatched ?? 0, className: "bg-sky-600 text-white" },
                { label: "مخزن ناقص", value: summary.warehouseUnmatched ?? 0, className: "bg-orange-500 text-white" },
              ].map((c) => (
                <div key={c.label} className={`rounded-2xl px-4 py-4 ${c.className}`}>
                  <div className="text-3xl font-black leading-none">{c.value}</div>
                  <div className="text-sm font-bold mt-1.5 opacity-95">{c.label}</div>
                </div>
              ))}
            </div>
          )}

          {missingRows.length > 0 && (
            <div className="rounded-2xl border-2 border-rose-300 bg-rose-50 p-5 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-lg font-black text-rose-900 flex items-center gap-2">
                  <PackagePlus size={20} />
                  أصناف مش موجودة عندنا ({missingRows.length})
                </div>
                <p className="text-sm font-semibold text-rose-800">
                  تقدر تضيفها هنا — النظام يولّد <span className="font-black">بارت نمبر تلقائي (P-…)</span> ويستخدمه كباركود لو الملف مفيهوش باركود.
                </p>
              </div>
              <Button
                size="lg"
                className="bg-rose-600 hover:bg-rose-700 font-black h-12 px-6"
                disabled={creatingKey !== null}
                onClick={() => void createAllMissing()}
              >
                {creatingKey === "__all__" ? "جاري الإضافة..." : `إضافة الكل ببارت نمبر تلقائي (${missingRows.length})`}
              </Button>
            </div>
          )}

          {warehouseMap.length > 0 && (
            <div className="rounded-2xl border-2 border-sky-200 bg-sky-50/60 p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Warehouse size={20} className="text-sky-700" />
                  خريطة المخازن — اختَر المخزن لكل اسم من الملف
                </div>
                <span className="text-sm font-bold text-slate-600">التعديل ينطبق على كل الأسطر بنفس الاسم</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {warehouseMap.map((w) => {
                  const ok = w.status === "matched" || w.status === "default";
                  return (
                    <div
                      key={w.raw}
                      className={`rounded-xl border-2 p-4 flex flex-col gap-2 ${ok ? "border-emerald-300 bg-white" : "border-rose-300 bg-rose-50"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-base font-black text-slate-900">{w.raw}</div>
                          <div className="text-sm font-bold text-slate-500">{w.count} سطر</div>
                        </div>
                        {statusPill(ok ? "matched" : (w.status || "unmatched"), "wh")}
                      </div>
                      {ok && w.resolved ? (
                        <div className="text-sm font-extrabold text-emerald-800 bg-emerald-50 rounded-lg px-3 py-2">
                          ← {w.resolved}
                        </div>
                      ) : null}
                      <Select
                        value={w.id || undefined}
                        onValueChange={(v) => applyWarehouseToRaw(w.raw.startsWith("—") ? "" : w.raw, v)}
                      >
                        <SelectTrigger className="h-12 text-base font-bold bg-white">
                          <SelectValue placeholder="اختَر المخزن عندنا..." />
                        </SelectTrigger>
                        <SelectContent>
                          {warehouses.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {previewRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Package size={18} className="text-slate-700" />
                <span className="text-lg font-black">أسطر الأصناف</span>
                <span className="text-sm font-bold text-emerald-700">جاهز: {readyCount}</span>
                <span className="text-sm font-bold text-amber-700">مراجعة: {reviewCount}</span>
                <div className="flex flex-wrap gap-1.5 mr-auto">
                  {([
                    ["all", "الكل"],
                    ["ready", "الجاهز"],
                    ["review", "مراجعة"],
                    ["missing", "مش موجود"],
                  ] as const).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setRowFilter(k)}
                      className={`px-3 py-2 rounded-lg text-sm font-extrabold border ${
                        rowFilter === k ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto border-2 rounded-2xl bg-white">
                <table className="w-full text-sm min-w-[1200px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-900 text-white">
                      <th className="px-3 py-3.5 text-right font-black w-14">✓</th>
                      <th className="px-3 py-3.5 text-right font-black">من الملف</th>
                      <th className="px-3 py-3.5 text-right font-black">الصنف عندنا</th>
                      <th className="px-3 py-3.5 text-right font-black">المخزن</th>
                      <th className="px-3 py-3.5 text-right font-black w-24">الوحدة</th>
                      <th className="px-3 py-3.5 text-right font-black w-28">الكمية</th>
                      <th className="px-3 py-3.5 text-right font-black w-32">متوسط التكلفة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map(({ r, i }) => {
                      const ready = rowReady(r);
                      const rowBg = !ready
                        ? "bg-rose-50/80"
                        : r.status === "matched"
                          ? "bg-emerald-50/40"
                          : "bg-amber-50/50";
                      const isMissing = !r.selectedItemId || r.status === "unmatched";
                      return (
                        <tr key={i} className={`border-t border-slate-200 ${rowBg}`}>
                          <td className="px-3 py-3 align-top">
                            <input
                              type="checkbox"
                              className="h-5 w-5 accent-emerald-600"
                              checked={!!r.included}
                              disabled={!ready}
                              onChange={(e) => setPreviewRows((p) => p.map((x, idx) => idx === i ? { ...x, included: e.target.checked } : x))}
                            />
                          </td>
                          <td className="px-3 py-3 align-top min-w-[210px]">
                            <div className="text-base font-black text-slate-900">{r.rawName || "—"}</div>
                            <div className="text-sm font-bold text-slate-500 mt-1 space-y-0.5">
                              {r.rawWarehouse ? <div>مخزن الملف: {r.rawWarehouse}</div> : <div className="text-rose-600">بدون مخزن في الملف</div>}
                              {r.rawCategory ? <div>فئة: {r.rawCategory}</div> : null}
                            </div>
                            <div className="mt-2">{statusPill(r.status)}</div>
                          </td>
                          <td className="px-3 py-3 align-top min-w-[280px]">
                            {isMissing ? (
                              <div className="space-y-2">
                                {statusPill("unmatched")}
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="bg-rose-600 hover:bg-rose-700 font-extrabold h-10"
                                    disabled={creatingKey !== null}
                                    onClick={() => void createOneMissing(r)}
                                  >
                                    {creatingKey === String(r.index) ? "جاري..." : "إضافة صنف + بارت نمبر تلقائي"}
                                  </Button>
                                </div>
                                <Select
                                  value={r.selectedItemId || undefined}
                                  onValueChange={(v) => {
                                    const opt = items.find((it) => it.value === v);
                                    setPreviewRows((p) => p.map((x, idx) => idx === i ? {
                                      ...x,
                                      selectedItemId: v,
                                      itemId: Number(v),
                                      itemName: opt?.label || x.itemName,
                                      included: !!(v && x.selectedWarehouseId && Number(x.quantity) > 0),
                                      status: "matched",
                                      remapItem: false,
                                    } : x));
                                  }}
                                >
                                  <SelectTrigger className="h-11 text-base font-bold bg-white">
                                    <SelectValue placeholder="أو اربط بصنف موجود" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {items.map((opt) => (
                                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : r.status === "matched" && r.selectedItemId && !r.remapItem ? (
                              <div className="space-y-2">
                                <div className="text-base font-black text-slate-900">
                                  {r.itemCode ? `${r.itemCode} — ` : ""}{r.itemName}
                                </div>
                                {r.itemBarcode ? (
                                  <div className="text-sm font-bold text-slate-500">باركود / بارت: {r.itemBarcode}</div>
                                ) : null}
                                <button
                                  type="button"
                                  className="text-sm font-extrabold text-blue-700 underline"
                                  onClick={() => setPreviewRows((p) => p.map((x, idx) => idx === i ? { ...x, remapItem: true } : x))}
                                >
                                  لا — دا اسمه كذا
                                </button>
                              </div>
                            ) : (
                              <Select
                                value={r.selectedItemId || undefined}
                                onValueChange={(v) => {
                                  const opt = items.find((it) => it.value === v);
                                  setPreviewRows((p) => p.map((x, idx) => idx === i ? {
                                    ...x,
                                    selectedItemId: v,
                                    itemId: Number(v),
                                    itemName: opt?.label || x.itemName,
                                    included: !!(v && x.selectedWarehouseId && Number(x.quantity) > 0),
                                    status: "matched",
                                    remapItem: false,
                                  } : x));
                                }}
                              >
                                <SelectTrigger className="h-11 text-base font-bold bg-white">
                                  <SelectValue placeholder="اختر صنفاً" />
                                </SelectTrigger>
                                <SelectContent>
                                  {(() => {
                                    const candIds = new Set((r.candidates || []).map((c) => String(c.id)));
                                    const fromCand = (r.candidates || []).map((c) => ({
                                      value: String(c.id),
                                      label: `${c.code ? `${c.code} — ` : ""}${c.name}${c.barcode ? ` (${c.barcode})` : ""}`,
                                    }));
                                    const rest = items.filter((opt) => !candIds.has(opt.value));
                                    return [...fromCand, ...rest].map((opt) => (
                                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                    ));
                                  })()}
                                </SelectContent>
                              </Select>
                            )}
                          </td>
                          <td className="px-3 py-3 align-top min-w-[230px]">
                            {r.selectedWarehouseId && !r.remapWarehouse ? (
                              <div className="space-y-2">
                                {statusPill(r.warehouseStatus === "default" ? "default" : "matched", "wh")}
                                <div className="text-base font-black text-slate-900">
                                  {warehouses.find((w) => w.value === r.selectedWarehouseId)?.label || r.warehouseName || "—"}
                                </div>
                                <button
                                  type="button"
                                  className="text-sm font-extrabold text-blue-700 underline"
                                  onClick={() => setPreviewRows((p) => p.map((x, idx) => idx === i ? { ...x, remapWarehouse: true } : x))}
                                >
                                  تغيير المخزن
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {statusPill(r.warehouseStatus || "missing", "wh")}
                                <Select
                                  value={r.selectedWarehouseId || undefined}
                                  onValueChange={(v) => setPreviewRows((p) => p.map((x, idx) => idx === i ? {
                                    ...x,
                                    selectedWarehouseId: v,
                                    warehouseId: Number(v),
                                    warehouseName: warehouses.find((w) => w.value === v)?.label || null,
                                    warehouseStatus: "matched",
                                    remapWarehouse: false,
                                    included: !!(x.selectedItemId && v && Number(x.quantity) > 0),
                                  } : x))}
                                >
                                  <SelectTrigger className="h-12 text-base font-bold bg-white border-2 border-sky-300">
                                    <SelectValue placeholder="اختَر المخزن *" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {warehouses.map((opt) => (
                                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3 align-top">
                            <div className="text-base font-black text-slate-900">{r.rawUnit || "—"}</div>
                            {r.itemUnit && r.rawUnit && r.itemUnit !== r.rawUnit ? (
                              <div className="text-xs font-bold text-amber-700 mt-1">كان: {r.itemUnit}</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 align-top">
                            <Input
                              className="h-12 text-base font-black"
                              value={r.quantity}
                              onChange={(e) => setPreviewRows((p) => p.map((x, idx) => idx === i ? { ...x, quantity: e.target.value } : x))}
                            />
                          </td>
                          <td className="px-3 py-3 align-top">
                            <Input
                              className="h-12 text-base font-bold"
                              value={r.unitCost}
                              onChange={(e) => setPreviewRows((p) => p.map((x, idx) => idx === i ? { ...x, unitCost: e.target.value } : x))}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="sticky bottom-0 z-20 -mx-1 px-1">
            <div className="rounded-2xl border-2 bg-white/95 backdrop-blur shadow-lg px-5 py-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-base font-bold text-slate-700">
                {previewRows.length ? `${readyCount} سطر جاهز من ${previewRows.length}` : "ارفع الملف للمعاينة أولاً"}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="h-12 px-5 font-bold"
                  onClick={() => navigate(tenantPath(tenantSlug, "/inventory/beginning-inventory"))}
                >
                  إلغاء
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 font-black h-12 px-7 text-base"
                  disabled={commitMut.isPending || readyCount === 0}
                  onClick={() => void commitImport()}
                >
                  {commitMut.isPending ? "جاري الاعتماد..." : `اعتماد واستبدال الرصيد (${readyCount})`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PermissionGate>
    </ERPLayout>
  );
}
