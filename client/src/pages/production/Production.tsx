/**
 * شاشة الإنتاج — مطابقة سلوك Mega Cash:
 * - /Production/ProductionOrder.aspx (أمر إنتاج: حفظ + اعتماد + خامات مطلقة)
 * - /Production/ProductionOrdersList.aspx (قائمة)
 *
 * مرجع الحقول/الأعمدة: artifacts/mega-wave8-production/COLUMNS.md (تقرير اوامر الانتاج)
 * — بدون اختراع حقول لم تُلتقط من شاشة ProductionOrder.aspx نفسها.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearch } from "wouter";
import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, Factory, Trash2, Loader2, CheckCircle2, XCircle, Pencil, Eye, Copy, Undo2, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import EntityPermissionGate from "@/components/EntityPermissionGate";
import { useEntityAllowed } from "@/hooks/useEntityPermission";
import { toDateStr } from "@/lib/date";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { ItemSearchSelect } from "@/components/ItemSearchSelect";
import { warehousesForBranch } from "@/lib/warehouse-options";

type Tab = "orders" | "new";
/**
 * سطر خامة في أمر الإنتاج.
 * `perUnit` = الكمية لكل وحدة من المنتج التام (من مكونات الصنف)، و`quantity` = perUnit × كمية الإنتاج.
 * تعديل `quantity` يدوياً يعيد اشتقاق `perUnit` حتى يفضل التغيير متناسب مع أي تغيير لاحق في الكمية.
 */
type MaterialRow = {
  itemId: string;
  quantity: string;
  perUnit: string;
  scrapPercent: string;
  notes: string;
  source: "bom" | "manual";
  /** مخزن صرف الخامة دي بالذات — فاضي يعني "زي مخزن استلام المنتج التام" (الافتراضي). */
  warehouseId: string;
};

type ItemOpt = {
  id: number; name: string; code?: string | null; unit?: string | null;
  averageCost?: string | null; purchasePrice?: string | null; currentStock?: string | null; barcode?: string | null;
};

function statusLabel(s: string) {
  // تسميات قائمة/تقرير ميجا: معلق / معتمد / مكتمل / ملغي
  return ({ draft: "معلق", in_progress: "معتمد", completed: "مكتمل", cancelled: "ملغي" } as Record<string, string>)[s] || s;
}
function statusClass(s: string) {
  return ({
    draft: "bg-slate-100 text-slate-800 ring-1 ring-slate-200",
    in_progress: "bg-amber-100 text-amber-950 ring-1 ring-amber-200",
    completed: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200",
    cancelled: "bg-red-100 text-red-800 ring-1 ring-red-200",
  } as Record<string, string>)[s] || "bg-slate-100 text-slate-700";
}
function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 3 });
}
function money(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** كميات المخزون بـ 3 خانات عشرية (نفس دقة عمود production_order_materials.quantity) */
function roundQty(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}
function qtyStr(n: number) {
  return String(roundQty(n));
}
/** كمية الوحدة بـ 6 خانات (نفس دقة عمود item_bom_lines.quantityPerUnit) — التقريب لـ 3 بيضيّع المكونات الصغيرة */
function perUnitStr(n: number) {
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 1e6) / 1e6);
}
/** الكمية الفعلية المصروفة = الكمية + الهالك (نفس حساب السيرفر في materialNeedWithScrap) */
function withScrap(qty: number, scrapPercent: unknown) {
  return qty * (1 + (Number(scrapPercent) || 0) / 100);
}
function scrapQtyOf(qty: number, scrapPercent: unknown) {
  return qty * ((Number(scrapPercent) || 0) / 100);
}

const emptyForm = () => ({
  productId: "",
  quantity: "1",
  warehouseId: "",
  branchId: "",
  date: new Date().toISOString().split("T")[0],
  notes: "",
  referenceNumber: "",
  batchNumber: "",
  barcode: "",
});

type ListQuery = {
  status: string;
  warehouseId: string;
  branchId: string;
  productId: string;
  batchNumber: string;
  referenceNumber: string;
  dateFrom: string;
  dateTo: string;
};

const emptyListQuery = (): ListQuery => ({
  status: "all",
  warehouseId: "all",
  branchId: "all",
  productId: "",
  batchNumber: "",
  referenceNumber: "",
  dateFrom: "",
  dateTo: "",
});

export default function Production() {
  const searchStr = useSearch();
  const tabFromUrl = useMemo(() => {
    const t = new URLSearchParams(searchStr).get("tab");
    if (t === "new" || t === "orders") return t as Tab;
    if (t === "bom") return "new" as Tab; // الخلطات ليست شاشة Mega — حوّل لأمر الإنتاج
    return "orders" as Tab;
  }, [searchStr]);
  const [tab, setTab] = useState<Tab>(tabFromUrl);
  useEffect(() => setTab(tabFromUrl), [tabFromUrl]);

  const setTabNav = (t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState({}, "", url.pathname + "?" + url.searchParams.toString());
  };

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [status, setStatus] = useState("all");
  const [warehouseId, setWarehouseId] = useState("all");
  const [branchId, setBranchId] = useState("all");
  const [filterProductId, setFilterProductId] = useState("");
  const [filterBatch, setFilterBatch] = useState("");
  const [filterRef, setFilterRef] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [query, setQuery] = useState<ListQuery>(emptyListQuery);
  useEffect(() => setPage(1), [debouncedSearch]);

  const [editId, setEditId] = useState<number | null>(null);
  const entityCanAdd = useEntityAllowed("production", "productionOrder", "add");
  const entityCanEdit = useEntityAllowed("production", "productionOrder", "edit");
  const entityCanSave = editId ? entityCanEdit : entityCanAdd;
  const [viewId, setViewId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [addMat, setAddMat] = useState({ itemId: "", quantity: "1", notes: "", warehouseId: "", scrapPercent: "0" });
  const [printAfterSave, setPrintAfterSave] = useState(false);

  const listQ = trpc.production.list.useQuery({
    page,
    limit: 20,
    search: debouncedSearch || undefined,
    status: query.status !== "all" ? (query.status as "draft" | "in_progress" | "completed" | "cancelled") : undefined,
    warehouseId: query.warehouseId !== "all" ? Number(query.warehouseId) : undefined,
    branchId: query.branchId !== "all" ? Number(query.branchId) : undefined,
    productId: query.productId ? Number(query.productId) : undefined,
    batchNumber: query.batchNumber || undefined,
    referenceNumber: query.referenceNumber || undefined,
    dateFrom: query.dateFrom || undefined,
    dateTo: query.dateTo || undefined,
  });
  const { data: allItems } = trpc.items.all.useQuery();
  const { data: warehouses } = trpc.warehouses.list.useQuery();
  const { data: branches } = trpc.settings.branches.list.useQuery();
  const detailQ = trpc.production.get.useQuery(viewId ?? editId ?? 0, { enabled: !!(viewId || editId) });
  /** مكونات المنتج التام (شاشة الصنف ← تبويب المكونات) — مصدر السحب التلقائي للخامات */
  const bomQ = trpc.production.bom.get.useQuery(
    { productId: Number(form.productId) },
    { enabled: !!form.productId && tab === "new" },
  );
  const utils = trpc.useUtils();

  const items: ItemOpt[] = (allItems || []) as ItemOpt[];
  const itemMap = useMemo(() => new Map(items.map((i) => [String(i.id), i])), [items]);
  const branchOptions: { id: number; name: string }[] = Array.isArray(branches)
    ? (branches as { id: number; name: string }[])
    : (((branches as unknown as { rows?: { id: number; name: string }[] })?.rows) || []);
  const warehouseOpts = useMemo(
    () => warehousesForBranch(warehouses as { id: number; name: string; branchId?: number | null; branchName?: string | null }[] | undefined, form.branchId || null),
    [warehouses, form.branchId],
  );
  const listWarehouseOpts = useMemo(
    () => warehousesForBranch(
      warehouses as { id: number; name: string; branchId?: number | null; branchName?: string | null }[] | undefined,
      query.branchId !== "all" ? query.branchId : (branchId !== "all" ? branchId : null),
    ),
    [warehouses, query.branchId, branchId],
  );

  /** رصيد كل خامة في الأمر موزّع على المخازن — عشان "المتاح" يبقى صح حسب المخزن اللي هيتصرف منه فعليًا */
  const stockItemIds = useMemo(() => {
    const ids = new Set<number>();
    for (const m of materials) if (m.itemId) ids.add(Number(m.itemId));
    if (addMat.itemId) ids.add(Number(addMat.itemId));
    return [...ids];
  }, [materials, addMat.itemId]);
  const materialStockQ = trpc.production.materialStock.useQuery(
    { itemIds: stockItemIds },
    { enabled: tab === "new" && stockItemIds.length > 0 },
  );
  const stockMap = useMemo(() => {
    const map = new Map<string, Map<number, number>>();
    for (const r of materialStockQ.data?.rows || []) {
      const key = String(r.itemId);
      if (!map.has(key)) map.set(key, new Map());
      map.get(key)!.set(r.warehouseId, Number(r.quantity || 0));
    }
    return map;
  }, [materialStockQ.data]);
  /** المتاح الفعلي لخامة معيّنة في مخزنها (لو محددة) وإلا مخزن استلام المنتج التام للأمر */
  const availableFor = (itemId: string, warehouseIdStr: string) => {
    const whId = Number(warehouseIdStr || form.warehouseId || 0);
    if (!whId) return 0;
    return stockMap.get(itemId)?.get(whId) ?? 0;
  };

  const createMut = trpc.production.create.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.production.update.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.production.delete.useMutation({
    onSuccess: () => { toast.success("تم الحذف"); listQ.refetch(); setViewId(null); },
    onError: (e) => toast.error(e.message),
  });
  const statusMut = trpc.production.updateStatus.useMutation({
    onSuccess: (_r, vars) => {
      toast.success(vars.status === "in_progress" ? "تم الاعتماد" : vars.status === "completed" ? "تم إتمام الاستلام" : vars.status === "draft" ? "تم فك الاعتماد — الأمر الآن مسودة قابلة للتعديل" : "تم التحديث");
      listQ.refetch();
      if (viewId) detailQ.refetch();
      if (editId) detailQ.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  /**
   * آخر منتج اتسحبت مكوناته تلقائياً — يمنع إعادة السحب فوق تعديلات المستخدم،
   * وعند فتح أمر محفوظ للتعديل بنملاه بمنتج الأمر عشان الخامات المحفوظة ما تتمسحش.
   */
  const bomFilledForRef = useRef<string | null>(null);

  const resetForm = () => {
    setEditId(null);
    setForm(emptyForm());
    setMaterials([]);
    setAddMat({ itemId: "", quantity: "1", notes: "", warehouseId: "", scrapPercent: "0" });
    bomFilledForRef.current = null;
  };

  /** يبني سطور الخامات من المكونات المرتبطة بالمنتج مضروبة في كمية الإنتاج */
  const bomRowsFor = (lines: { materialItemId: number; quantityPerUnit?: string | number | null; scrapPercent?: string | number | null; notes?: string | null }[], orderQty: number): MaterialRow[] =>
    lines
      .filter((l) => String(l.materialItemId) !== form.productId)
      .map((l) => {
        const perUnit = Number(l.quantityPerUnit || 0);
        return {
          itemId: String(l.materialItemId),
          perUnit: perUnitStr(perUnit),
          quantity: qtyStr(perUnit * orderQty),
          scrapPercent: String(l.scrapPercent ?? "0"),
          notes: l.notes || "",
          source: "bom" as const,
          warehouseId: "",
        };
      });

  // سحب تلقائي لمكونات المنتج التام أول ما يتم اختياره
  useEffect(() => {
    if (tab !== "new" || !form.productId) return;
    if (bomFilledForRef.current === form.productId) return;
    if (bomQ.isFetching || !bomQ.data) return;
    // تبديل منتج بمنتج تاني = خامات الأمر كلها بتاعة المنتج الجديد ⇐ استبدال كامل.
    // أول اختيار في أمر جديد بنحافظ فيه على أي خامة المستخدم ضافها يدوياً قبل ما يختار.
    const replacingProduct = bomFilledForRef.current !== null;
    bomFilledForRef.current = form.productId;
    const orderQty = Number(form.quantity || 0) || 0;
    const rows = bomRowsFor(bomQ.data as { materialItemId: number; quantityPerUnit?: string | number | null; scrapPercent?: string | number | null; notes?: string | null }[], orderQty);
    const keptManual = (prev: MaterialRow[]) => (replacingProduct
      ? []
      : prev.filter((m) => m.source === "manual" && !rows.some((r) => r.itemId === m.itemId)));
    if (rows.length) {
      setMaterials((prev) => [...rows, ...keptManual(prev)]);
      toast.success(`تم سحب ${rows.length} مكوّن من مكونات المنتج × ${fmt(orderQty)}`);
    } else {
      setMaterials(keptManual);
      toast.message("لا توجد مكونات مرتبطة بهذا المنتج — أضف الخامات يدوياً أو عرّف المكونات من شاشة الصنف");
    }
  }, [tab, form.productId, form.quantity, bomQ.data, bomQ.isFetching]);

  /** تغيير كمية الإنتاج يعيد حساب كل سطر: الكمية = كمية الوحدة × كمية الإنتاج */
  const setOrderQuantity = (value: string) => {
    setForm((p) => ({ ...p, quantity: value }));
    const orderQty = Number(value || 0);
    if (!Number.isFinite(orderQty)) return;
    setMaterials((prev) => prev.map((m) => ({ ...m, quantity: qtyStr(Number(m.perUnit || 0) * orderQty) })));
  };

  /** تعديل كمية سطر يدوياً يعيد اشتقاق كمية الوحدة عشان يفضل متناسب مع أي تغيير لاحق في كمية الإنتاج */
  const setMaterialQuantity = (index: number, value: string) => {
    const orderQty = Number(form.quantity || 0);
    setMaterials((prev) => prev.map((m, i) => i === index
      ? { ...m, quantity: value, perUnit: orderQty > 0 ? perUnitStr(Number(value || 0) / orderQty) : m.perUnit }
      : m));
  };

  const setMaterialScrap = (index: number, value: string) => {
    setMaterials((prev) => prev.map((m, i) => (i === index ? { ...m, scrapPercent: value } : m)));
  };

  const reloadBom = async () => {
    if (!form.productId) return toast.error("اختر المنتج التام أولاً");
    const lines = await utils.production.bom.get.fetch({ productId: Number(form.productId) });
    const rows = bomRowsFor(lines as { materialItemId: number; quantityPerUnit?: string | number | null; scrapPercent?: string | number | null; notes?: string | null }[], Number(form.quantity || 0) || 0);
    if (!rows.length) return toast.error("لا توجد مكونات مرتبطة بهذا المنتج");
    setMaterials((prev) => [...rows, ...prev.filter((m) => m.source === "manual" && !rows.some((r) => r.itemId === m.itemId))]);
    bomFilledForRef.current = form.productId;
    toast.success(`تم تحديث ${rows.length} مكوّن من مكونات المنتج`);
  };

  // ملخصات زي Mega — محسوبة على الكمية الفعلية المصروفة (الكمية + الهالك)
  const totals = useMemo(() => {
    let rawQty = 0;
    let rawCost = 0;
    let scrapCost = 0;
    let maxProd = Number.POSITIVE_INFINITY;
    const shortages: string[] = [];
    for (const m of materials) {
      const it = itemMap.get(m.itemId);
      const base = Number(m.quantity || 0);
      const need = withScrap(base, m.scrapPercent);
      const scrapQ = scrapQtyOf(base, m.scrapPercent);
      const perFinished = withScrap(Number(m.perUnit || 0), m.scrapPercent);
      const unitCost = Number(it?.averageCost || 0) || Number(it?.purchasePrice || 0);
      const avail = availableFor(m.itemId, m.warehouseId);
      rawQty += need;
      rawCost += base * unitCost;
      scrapCost += scrapQ * unitCost;
      if (perFinished > 0) maxProd = Math.min(maxProd, avail / perFinished);
      if (need > avail + 1e-9) shortages.push(it?.name || `#${m.itemId}`);
    }
    if (!Number.isFinite(maxProd) || !materials.length) maxProd = 0;
    return {
      rawQty,
      rawCost,
      scrapCost,
      totalCost: rawCost + scrapCost,
      maxProd: Math.max(0, Math.floor(maxProd * 1000) / 1000),
      shortages,
    };
  }, [materials, itemMap, stockMap, form.warehouseId]);

  const applyBarcode = () => {
    const code = form.barcode.trim().toLowerCase();
    if (!code) return;
    const hit = items.find((i) =>
      String(i.barcode || "").toLowerCase() === code
      || String(i.code || "").toLowerCase() === code,
    );
    if (!hit) return toast.error("لم يُعثر على المنتج التام بالباركود/الكود");
    setForm((p) => ({ ...p, productId: String(hit.id), barcode: String(hit.barcode || hit.code || "") }));
    toast.success(`تم اختيار ${hit.name}`);
  };

  const addMaterialLine = () => {
    if (!addMat.itemId) return toast.error("اختر المادة الخام");
    if (!(Number(addMat.quantity) > 0)) return toast.error("أدخل كمية أكبر من صفر");
    if (addMat.itemId === form.productId) return toast.error("لا يمكن أن يكون المنتج التام مادة في نفس الأمر");
    const orderQty = Number(form.quantity || 0);
    const perUnitOf = (qty: number) => (orderQty > 0 ? perUnitStr(qty / orderQty) : perUnitStr(qty));
    if (materials.some((m) => m.itemId === addMat.itemId)) {
      setMaterials((p) => p.map((m) => {
        if (m.itemId !== addMat.itemId) return m;
        const qty = Number(m.quantity || 0) + Number(addMat.quantity || 0);
        return { ...m, quantity: qtyStr(qty), perUnit: perUnitOf(qty) };
      }));
    } else {
      const qty = Number(addMat.quantity || 0);
      setMaterials((p) => [...p, {
        itemId: addMat.itemId,
        quantity: qtyStr(qty),
        perUnit: perUnitOf(qty),
        scrapPercent: addMat.scrapPercent || "0",
        notes: addMat.notes,
        source: "manual",
        warehouseId: addMat.warehouseId,
      }]);
    }
    setAddMat({ itemId: "", quantity: "1", notes: "", warehouseId: "", scrapPercent: "0" });
  };

  const openEdit = async (id: number) => {
    const d = await utils.production.get.fetch(id);
    if (d.status !== "draft") {
      setViewId(id);
      return;
    }
    setEditId(id);
    // الأمر المحفوظ له خاماته — بلاش السحب التلقائي يمسحها
    bomFilledForRef.current = String(d.productId);
    setForm({
      productId: String(d.productId),
      quantity: String(d.quantity),
      warehouseId: String(d.warehouseId),
      branchId: d.branchId ? String(d.branchId) : "",
      date: toDateStr(d.date),
      notes: d.notes || "",
      referenceNumber: d.referenceNumber || "",
      batchNumber: d.batchNumber || "",
      barcode: d.productCode || "",
    });
    const savedQty = Number(d.quantity || 0);
    setMaterials(d.materials.map((m: { itemId: number; quantity: string | number; scrapPercent?: string | number | null; notes?: string | null; warehouseId?: number | null }) => ({
      itemId: String(m.itemId),
      quantity: String(m.quantity),
      perUnit: savedQty > 0 ? perUnitStr(Number(m.quantity || 0) / savedQty) : String(m.quantity),
      scrapPercent: String(m.scrapPercent ?? "0"),
      notes: m.notes || "",
      source: "manual" as const,
      warehouseId: m.warehouseId ? String(m.warehouseId) : "",
    })));
    setTabNav("new");
  };

  /** نسخ أمر إنتاج موجود كنقطة بداية لأمر جديد — زي "نسخ" في ميجا كاش */
  const [duplicating, setDuplicating] = useState(false);
  const handleDuplicate = async (id: number) => {
    setDuplicating(true);
    try {
      const d = await utils.production.get.fetch(id);
      setEditId(null);
      bomFilledForRef.current = String(d.productId);
      setForm({
        productId: String(d.productId),
        quantity: String(d.quantity),
        warehouseId: String(d.warehouseId),
        branchId: d.branchId ? String(d.branchId) : "",
        date: new Date().toISOString().split("T")[0],
        notes: `نسخة من الأمر ${d.number}${d.notes ? ` — ${d.notes}` : ""}`,
        referenceNumber: "",
        batchNumber: "",
        barcode: d.productCode || "",
      });
      const savedQty = Number(d.quantity || 0);
      setMaterials(d.materials.map((m: { itemId: number; quantity: string | number; scrapPercent?: string | number | null; notes?: string | null; warehouseId?: number | null }) => ({
        itemId: String(m.itemId),
        quantity: String(m.quantity),
        perUnit: savedQty > 0 ? perUnitStr(Number(m.quantity || 0) / savedQty) : String(m.quantity),
        scrapPercent: String(m.scrapPercent ?? "0"),
        notes: m.notes || "",
        source: "manual" as const,
        warehouseId: m.warehouseId ? String(m.warehouseId) : "",
      })));
      setTabNav("new");
      toast.success(`تم نسخ الأمر ${d.number} — راجع البيانات واحفظ`);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || "فشل نسخ الأمر");
    } finally {
      setDuplicating(false);
    }
  };

  const saveOrder = async (andApprove = false) => {
    if (!entityCanSave) return toast.error("ليس لديك صلاحية");
    if (!form.productId || !form.warehouseId || !form.quantity) {
      return toast.error("المنتج التام ومخزن الاستلام والكمية مطلوبة");
    }
    if (!materials.length) return toast.error("أضف مادة خام واحدة على الأقل");
    const payload = {
      productId: Number(form.productId),
      warehouseId: Number(form.warehouseId),
      branchId: form.branchId ? Number(form.branchId) : undefined,
      quantity: form.quantity,
      date: form.date,
      notes: form.notes || undefined,
      referenceNumber: form.referenceNumber || undefined,
      batchNumber: form.batchNumber || undefined,
      materials: materials.map((m) => ({
        itemId: Number(m.itemId),
        quantity: m.quantity,
        scrapPercent: m.scrapPercent || "0",
        notes: m.notes || undefined,
        warehouseId: m.warehouseId ? Number(m.warehouseId) : undefined,
      })),
    };
    // الحفظ والاعتماد في مسار واحد: لو الاعتماد فشل، الأمر المحفوظ يفضل مفتوح للتعديل
    // (editId اتظبط) عشان الضغط تاني يعدّله بدل ما يعمل أمر جديد كل مرة.
    try {
      let id = editId;
      if (id) {
        await updateMut.mutateAsync({ ...payload, id });
        toast.success("تم حفظ التعديلات");
      } else {
        const r = await createMut.mutateAsync(payload);
        id = Number(r.id);
        setEditId(id);
        toast.success(`تم حفظ الأمر ${r.number} (معلق)`);
      }
      if (andApprove) await statusMut.mutateAsync({ id: id!, status: "in_progress" });
      listQ.refetch();
      if (printAfterSave) toast.message("يمكنك طباعة الأمر من القائمة");
      resetForm();
      setTabNav("orders");
    } catch {
      // رسالة الخطأ بتظهر من onError بتاع الـ mutation — نسيب الشاشة زي ما هي للمحاولة تاني
      listQ.refetch();
    }
  };

  const applyListFilters = () => {
    setPage(1);
    setQuery({
      status,
      warehouseId,
      branchId,
      productId: filterProductId,
      batchNumber: filterBatch.trim(),
      referenceNumber: filterRef.trim(),
      dateFrom,
      dateTo,
    });
  };

  const clearListFilters = () => {
    setSearch("");
    setStatus("all");
    setWarehouseId("all");
    setBranchId("all");
    setFilterProductId("");
    setFilterBatch("");
    setFilterRef("");
    setDateFrom("");
    setDateTo("");
    setQuery(emptyListQuery());
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil((listQ.data?.total || 0) / 20));
  const selectedProduct = form.productId ? itemMap.get(form.productId) : undefined;

  return (
    <ERPLayout title="الإنتاج">
      <div className="space-y-4">
        {tab === "orders" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-slate-700">
                <Factory size={18} className="text-amber-700" />
                <h2 className="text-base font-extrabold">قائمة أوامر الإنتاج</h2>
              </div>
              {entityCanSave && (
                <Button
                  className="font-extrabold bg-amber-600 hover:bg-amber-700"
                  onClick={() => { resetForm(); setTabNav("new"); }}
                >
                  <Plus size={16} className="me-1" /> أمر إنتاج
                </Button>
              )}
            </div>

            <Card className="erp-data-card border-0">
              <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3 items-end">
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs font-bold">بحث / المسلسل / الباركود</Label>
                  <Input className="h-10 font-semibold" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="رقم الأمر · منتج · باركود" />
                </div>
                {branchOptions.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">الفرع</Label>
                    <Select value={branchId} onValueChange={setBranchId}>
                      <SelectTrigger className="h-10 w-full min-w-0 font-bold"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">الكل</SelectItem>
                        {branchOptions.map((b) => (
                          <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs font-bold">مخزن الاستلام</Label>
                  <Select value={warehouseId} onValueChange={setWarehouseId}>
                    <SelectTrigger className="h-10 w-full min-w-0 font-bold"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">الكل</SelectItem>
                      {listWarehouseOpts.map((w) => (
                        <SelectItem key={String(w.id)} value={String(w.id)}>{w.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs font-bold">منتج تام</Label>
                  <ItemSearchSelect items={items} value={filterProductId} onChange={setFilterProductId} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">رقم التشغيلة</Label>
                  <Input className="h-10 font-semibold" value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">رقم المرجع</Label>
                  <Input className="h-10 font-semibold" value={filterRef} onChange={(e) => setFilterRef(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">الحالة</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-10 w-full min-w-0 font-bold"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">الكل</SelectItem>
                      <SelectItem value="draft">معلق</SelectItem>
                      <SelectItem value="in_progress">معتمد</SelectItem>
                      <SelectItem value="completed">مكتمل</SelectItem>
                      <SelectItem value="cancelled">ملغي</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">من تاريخ</Label>
                  <Input type="date" className="h-10" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-bold">إلى تاريخ</Label>
                  <Input type="date" className="h-10" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
                <div className="flex gap-2 sm:col-span-2">
                  <Button className="h-10 flex-1 font-extrabold" onClick={applyListFilters}>بحث</Button>
                  <Button type="button" variant="outline" className="h-10 font-bold" onClick={clearListFilters}>تفريغ</Button>
                </div>
              </CardContent>
            </Card>

            <Card className="erp-data-card border-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-800 text-white text-xs">
                      <th className="px-3 py-2.5 text-right">المسلسل</th>
                      <th className="px-3 py-2.5 text-right">التاريخ</th>
                      <th className="px-3 py-2.5 text-right">المنتج التام</th>
                      <th className="px-3 py-2.5 text-right">مخزن الاستلام</th>
                      <th className="px-3 py-2.5 text-right">الكمية</th>
                      <th className="px-3 py-2.5 text-right">رقم التشغيلة</th>
                      <th className="px-3 py-2.5 text-right">رقم المرجع</th>
                      <th className="px-3 py-2.5 text-right">تكلفة المواد الخام</th>
                      <th className="px-3 py-2.5 text-right">الحالة</th>
                      <th className="px-3 py-2.5 text-right">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listQ.isLoading ? (
                      <tr><td colSpan={10} className="py-12 text-center"><Loader2 className="inline animate-spin text-amber-600" /></td></tr>
                    ) : !(listQ.data?.rows || []).length ? (
                      <tr><td colSpan={10} className="py-12 text-center text-slate-400 font-semibold">لا توجد بيانات للعرض</td></tr>
                    ) : (listQ.data?.rows || []).map((row, i) => (
                      <tr key={row.id} className={`border-t ${i % 2 ? "bg-slate-50/80" : ""}`}>
                        <td className="px-3 py-2 font-extrabold">{row.number}</td>
                        <td className="px-3 py-2">{toDateStr(row.date, "—")}</td>
                        <td className="px-3 py-2 font-bold">{row.productCode ? `${row.productCode} — ` : ""}{row.productName}</td>
                        <td className="px-3 py-2">{row.warehouseName}</td>
                        <td className="px-3 py-2 font-bold">{fmt(Number(row.quantity))}</td>
                        <td className="px-3 py-2">{row.batchNumber || "—"}</td>
                        <td className="px-3 py-2">{row.referenceNumber || "—"}</td>
                        <td className="px-3 py-2 font-semibold">{money(Number(row.wipCostAmount || 0))}</td>
                        <td className="px-3 py-2"><span className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${statusClass(row.status)}`}>{statusLabel(row.status)}</span></td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewId(row.id)}><Eye size={14} /></Button>
                            {row.status === "draft" && (
                              <EntityPermissionGate moduleKey="production" entityKey="productionOrder" action="edit">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row.id)}><Pencil size={14} /></Button>
                              </EntityPermissionGate>
                            )}
                            {(row.status === "in_progress" || row.status === "completed") && (
                              <EntityPermissionGate moduleKey="production" entityKey="productionOrder" action="unapprove">
                                <Button
                                  variant="ghost" size="icon" className="h-8 w-8 text-amber-700 hover:bg-amber-50" title="فك اعتماد"
                                  disabled={statusMut.isPending}
                                  onClick={() => {
                                    if (row.status === "completed" && !confirm("فك اعتماد الأمر المكتمل؟ ده هيعكس صرف الخامات واستلام المنتج التام والقيود.")) return;
                                    statusMut.mutate({ id: row.id, status: "draft" });
                                  }}
                                >
                                  <Undo2 size={14} />
                                </Button>
                              </EntityPermissionGate>
                            )}
                            <EntityPermissionGate moduleKey="production" entityKey="productionOrder" action="add">
                              <Button
                                variant="ghost" size="icon" className="h-8 w-8" title="نسخ لأمر جديد"
                                disabled={duplicating}
                                onClick={() => void handleDuplicate(row.id)}
                              >
                                <Copy size={14} />
                              </Button>
                            </EntityPermissionGate>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex justify-center gap-2 p-3 border-t">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>السابق</Button>
                  <span className="text-xs font-bold self-center">{page} / {totalPages}</span>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>التالي</Button>
                </div>
              )}
            </Card>

            {viewId && detailQ.data && (
              <Card className="erp-data-card border-0 border-t-4 border-t-amber-500">
                <CardHeader className="pb-2 flex flex-row justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-extrabold">#{detailQ.data.number} — {detailQ.data.productName}</CardTitle>
                    <p className="text-sm font-semibold text-slate-600 mt-1">
                      {statusLabel(detailQ.data.status)} · كمية {fmt(Number(detailQ.data.quantity))} · تكلفة المواد الخام {money(Number(detailQ.data.estimatedCost || 0))} ج.م
                      {Number(detailQ.data.scrapCostTotal || 0) > 0 && (
                        <> · تكلفة التوالف {money(Number(detailQ.data.scrapCostTotal))} ج.م</>
                      )}
                    </p>
                    <p className="text-xs font-semibold text-slate-500 mt-1">
                      مخزن الاستلام: {detailQ.data.warehouseName || "—"}
                      {detailQ.data.batchNumber ? ` · رقم التشغيلة: ${detailQ.data.batchNumber}` : ""}
                      {detailQ.data.referenceNumber ? ` · رقم المرجع: ${detailQ.data.referenceNumber}` : ""}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setViewId(null)}>إغلاق</Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {detailQ.data.notes && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm">
                      <span className="font-extrabold text-amber-900">ملاحظات: </span>
                      <span className="text-amber-950 whitespace-pre-wrap">{detailQ.data.notes}</span>
                    </div>
                  )}
                  <div className="overflow-x-auto border rounded-xl">
                    <table className="w-full text-sm min-w-[720px]">
                      <thead>
                        <tr className="bg-slate-800 text-white text-xs">
                          <th className="px-3 py-2 text-right">المادة الخام</th>
                          <th className="px-3 py-2 text-right">الباركود</th>
                          <th className="px-3 py-2 text-right">الكمية</th>
                          <th className="px-3 py-2 text-right">كمية تالف</th>
                          <th className="px-3 py-2 text-right">وحدة القياس</th>
                          <th className="px-3 py-2 text-right">تكلفة خام</th>
                          <th className="px-3 py-2 text-right">تكلفة تالف</th>
                          <th className="px-3 py-2 text-right">اجمالى تكلفة</th>
                          <th className="px-3 py-2 text-right">تُصرف من مخزن</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailQ.data.materials.map((m: {
                          id: number; itemCode?: string | null; itemName?: string | null; itemBarcode?: string | null;
                          baseQty: number; scrapQty: number; unit?: string | null; rawCost: number; scrapCost: number;
                          lineCost: number; warehouseName?: string | null; warehouseId?: number | null;
                        }) => (
                          <tr key={m.id} className="border-t">
                            <td className="px-3 py-2 font-bold">{m.itemCode ? `${m.itemCode} — ` : ""}{m.itemName}</td>
                            <td className="px-3 py-2">{m.itemBarcode || "—"}</td>
                            <td className="px-3 py-2 font-bold">{fmt(Number(m.baseQty))}</td>
                            <td className="px-3 py-2">{fmt(Number(m.scrapQty))}</td>
                            <td className="px-3 py-2">{m.unit || "—"}</td>
                            <td className="px-3 py-2">{money(Number(m.rawCost))}</td>
                            <td className="px-3 py-2">{money(Number(m.scrapCost))}</td>
                            <td className="px-3 py-2 font-bold">{money(Number(m.lineCost))}</td>
                            <td className="px-3 py-2">
                              {m.warehouseName || "—"}
                              {!m.warehouseId && <span className="text-slate-400"> (افتراضي)</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {detailQ.data.status === "draft" && (
                      <>
                        <EntityPermissionGate moduleKey="production" entityKey="productionOrder" action="approve">
                          <Button size="sm" className="bg-amber-600 hover:bg-amber-700 font-extrabold"
                            disabled={statusMut.isPending}
                            onClick={() => statusMut.mutate({ id: viewId, status: "in_progress" })}>
                            <CheckCircle2 size={14} className="me-1" /> اعتماد
                          </Button>
                        </EntityPermissionGate>
                        <EntityPermissionGate moduleKey="production" entityKey="productionOrder" action="edit">
                          <Button size="sm" variant="outline" onClick={() => openEdit(viewId)}>تعديل</Button>
                        </EntityPermissionGate>
                        <EntityPermissionGate moduleKey="production" entityKey="productionOrder" action="deleteCancel">
                          <Button size="sm" variant="outline" className="text-red-700"
                            onClick={() => statusMut.mutate({ id: viewId, status: "cancelled" })}>
                            <XCircle size={14} className="me-1" /> إلغاء
                          </Button>
                        </EntityPermissionGate>
                      </>
                    )}
                    {detailQ.data.status === "in_progress" && (
                      <>
                        <EntityPermissionGate moduleKey="production" entityKey="productionOrder" action="edit">
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 font-extrabold"
                            disabled={statusMut.isPending}
                            onClick={() => statusMut.mutate({ id: viewId, status: "completed" })}>
                            إتمام / استلام الإنتاج التام
                          </Button>
                        </EntityPermissionGate>
                        <EntityPermissionGate moduleKey="production" entityKey="productionOrder" action="unapprove">
                          <Button size="sm" variant="outline" className="text-amber-700 border-amber-300 hover:bg-amber-50"
                            disabled={statusMut.isPending}
                            onClick={() => statusMut.mutate({ id: viewId, status: "draft" })}>
                            فك اعتماد
                          </Button>
                        </EntityPermissionGate>
                      </>
                    )}
                    {detailQ.data.status === "completed" && (
                      <EntityPermissionGate moduleKey="production" entityKey="productionOrder" action="unapprove">
                        <Button size="sm" variant="outline" className="text-amber-700 border-amber-300 hover:bg-amber-50"
                          disabled={statusMut.isPending}
                          onClick={() => {
                            if (!confirm("فك اعتماد الأمر المكتمل؟ ده هيعكس صرف الخامات واستلام المنتج التام والقيود.")) return;
                            statusMut.mutate({ id: viewId, status: "draft" });
                          }}>
                          <Undo2 size={14} className="me-1" /> فك اعتماد
                        </Button>
                      </EntityPermissionGate>
                    )}
                    {(detailQ.data.status === "draft" || detailQ.data.status === "cancelled") && (
                      <EntityPermissionGate moduleKey="production" entityKey="productionOrder" action="deleteCancel">
                        <Button size="sm" variant="outline" className="text-red-700"
                          onClick={() => { if (confirm("حذف الأمر؟")) deleteMut.mutate(viewId); }}>حذف</Button>
                      </EntityPermissionGate>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {tab === "new" && (
          <div className="space-y-4 max-w-6xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                className="font-bold text-slate-600"
                onClick={() => { resetForm(); setTabNav("orders"); }}
              >
                <ArrowRight size={16} className="ms-1" /> قائمة أوامر الإنتاج
              </Button>
              <h2 className="text-base font-extrabold text-slate-800">{editId ? "تعديل أمر إنتاج" : "أمر إنتاج"}</h2>
            </div>

            {/* رأس المستند — تسميات تقرير اوامر الانتاج في ميجا */}
            <Card className="erp-data-card border-0">
              <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                <div className="space-y-3">
                  {branchOptions.length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs font-bold">الفرع</Label>
                      <Select
                        value={form.branchId || "none"}
                        onValueChange={(v) => setForm((p) => ({
                          ...p,
                          branchId: v === "none" ? "" : v,
                          warehouseId: "",
                        }))}
                      >
                        <SelectTrigger className="h-9 w-full min-w-0"><SelectValue placeholder="اختر" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          {branchOptions.map((b) => (
                            <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">التاريخ</Label>
                    <Input type="date" className="h-9" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">الباركود</Label>
                    <div className="flex gap-1">
                      <Input
                        className="h-9"
                        value={form.barcode}
                        onChange={(e) => setForm((p) => ({ ...p, barcode: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), applyBarcode())}
                        placeholder="باركود المنتج التام"
                      />
                      <Button type="button" variant="outline" className="h-9 shrink-0" onClick={applyBarcode}>بحث</Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">المنتج التام *</Label>
                    <ItemSearchSelect
                      items={items}
                      value={form.productId}
                      onChange={(id) => {
                        const it = items.find((x) => String(x.id) === id);
                        setForm((p) => ({
                          ...p,
                          productId: id,
                          barcode: it ? String(it.barcode || it.code || "") : p.barcode,
                        }));
                      }}
                    />
                    {selectedProduct?.unit && (
                      <p className="text-[11px] font-semibold text-slate-500">وحدة القياس: {selectedProduct.unit}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">الكمية *</Label>
                    <Input type="number" step="any" className="h-9 font-bold" value={form.quantity}
                      onChange={(e) => setOrderQuantity(e.target.value)} />
                    <p className="text-[11px] font-semibold text-slate-500">
                      كمية كل خامة = كمية الوحدة × هذه الكمية (تتحدث تلقائياً)
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">مخزن الاستلام *</Label>
                    <Select value={form.warehouseId} onValueChange={(v) => setForm((p) => ({ ...p, warehouseId: v }))}>
                      <SelectTrigger className="h-9 w-full min-w-0"><SelectValue placeholder="اختر مخزن" /></SelectTrigger>
                      <SelectContent>
                        {warehouseOpts.map((w) => (
                          <SelectItem key={String(w.id)} value={String(w.id)}>{w.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] font-semibold text-slate-500">
                      وهو كمان المخزن الافتراضي لصرف أي خامة بدون مخزن خاص.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">رقم التشغيلة</Label>
                    <Input className="h-9" value={form.batchNumber} onChange={(e) => setForm((p) => ({ ...p, batchNumber: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">رقم المرجع</Label>
                    <Input className="h-9" value={form.referenceNumber} onChange={(e) => setForm((p) => ({ ...p, referenceNumber: e.target.value }))} />
                  </div>
                  <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2 space-y-1">
                    <div className="text-xs font-extrabold text-amber-950">تكلفة المواد الخام: {money(totals.rawCost)} ج.م</div>
                    <div className="text-xs font-bold text-amber-900">تكلفة التوالف: {money(totals.scrapCost)} ج.م</div>
                    <div className="text-xs font-extrabold text-amber-950">اجمالى التكلفة: {money(totals.totalCost)} ج.م</div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">ملاحظات</Label>
                    <Textarea className="text-sm resize-none" rows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="erp-data-card border-0">
              <CardHeader className="pb-2 flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-sm font-extrabold">
                  الخامات
                  {bomQ.isFetching && form.productId ? (
                    <span className="ms-2 inline-flex items-center gap-1 text-[11px] font-bold text-slate-500">
                      <Loader2 size={12} className="animate-spin" /> جارٍ سحب مكونات المنتج...
                    </span>
                  ) : null}
                </CardTitle>
                <Button type="button" variant="outline" size="sm" className="h-8 font-bold"
                  disabled={!form.productId} onClick={() => void reloadBom()}>
                  إعادة سحب مكونات المنتج
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 items-end border rounded-xl p-3 bg-emerald-50/60 border-emerald-100">
                  <div className="sm:col-span-2 space-y-1">
                    <Label className="text-xs font-bold">المادة الخام</Label>
                    <ItemSearchSelect items={items} value={addMat.itemId} excludeId={form.productId}
                      onChange={(id) => setAddMat((p) => ({ ...p, itemId: id }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">تُصرف من مخزن</Label>
                    <Select value={addMat.warehouseId || "__default"} onValueChange={(v) => setAddMat((p) => ({ ...p, warehouseId: v === "__default" ? "" : v }))}>
                      <SelectTrigger className="h-9 w-full min-w-0"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default">افتراضي (مخزن الاستلام)</SelectItem>
                        {warehouseOpts.map((w) => (
                          <SelectItem key={String(w.id)} value={String(w.id)}>{w.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">الكمية</Label>
                    <Input type="number" step="any" className="h-9 font-bold" value={addMat.quantity}
                      onChange={(e) => setAddMat((p) => ({ ...p, quantity: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold">% تالف</Label>
                    <Input type="number" step="any" className="h-9 font-bold" value={addMat.scrapPercent}
                      onChange={(e) => setAddMat((p) => ({ ...p, scrapPercent: e.target.value }))} />
                  </div>
                  <div className="flex gap-1">
                    <Button type="button" className="h-9 flex-1 font-bold" onClick={addMaterialLine}>اضافة</Button>
                    <Button type="button" variant="outline" className="h-9" onClick={() => setAddMat({ itemId: "", quantity: "1", notes: "", warehouseId: "", scrapPercent: "0" })}>تفريغ</Button>
                  </div>
                </div>

                <div className="overflow-x-auto border rounded-xl">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead>
                      <tr className="bg-slate-800 text-white text-xs">
                        <th className="px-2 py-2 text-right">المادة الخام</th>
                        <th className="px-2 py-2 text-right">الباركود</th>
                        <th className="px-2 py-2 text-right w-24">كمية الوحدة</th>
                        <th className="px-2 py-2 text-right w-28">الكمية</th>
                        <th className="px-2 py-2 text-right w-20">% تالف</th>
                        <th className="px-2 py-2 text-right">كمية تالف</th>
                        <th className="px-2 py-2 text-right">وحدة القياس</th>
                        <th className="px-2 py-2 text-right w-40">تُصرف من مخزن</th>
                        <th className="px-2 py-2 text-right">المتاح</th>
                        <th className="px-2 py-2 text-right">تكلفة خام</th>
                        <th className="px-2 py-2 text-right">تكلفة تالف</th>
                        <th className="px-2 py-2 text-right">اجمالى تكلفة</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {!materials.length ? (
                        <tr><td colSpan={13} className="py-10 text-center text-slate-400 font-semibold">لا توجد بيانات للعرض</td></tr>
                      ) : materials.map((m, i) => {
                        const it = itemMap.get(m.itemId);
                        const qty = Number(m.quantity || 0);
                        const scrapQ = scrapQtyOf(qty, m.scrapPercent);
                        const need = withScrap(qty, m.scrapPercent);
                        const avail = availableFor(m.itemId, m.warehouseId);
                        const short = need > avail + 1e-9;
                        const unitCost = Number(it?.averageCost || 0) || Number(it?.purchasePrice || 0);
                        const rawCost = qty * unitCost;
                        const scrapCost = scrapQ * unitCost;
                        return (
                          <tr key={`${m.itemId}-${i}`} className={`border-t ${i % 2 ? "bg-slate-50/80" : ""}`}>
                            <td className="px-2 py-2 font-bold">
                              {it ? `${it.code ? `${it.code} — ` : ""}${it.name}` : m.itemId}
                              {m.source === "bom" && (
                                <span className="ms-1 text-[10px] font-extrabold text-sky-700 bg-sky-50 ring-1 ring-sky-100 rounded px-1 py-0.5">
                                  مكوّن
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-slate-600">{it?.barcode || it?.code || "—"}</td>
                            <td className="px-2 py-2 font-semibold text-slate-600">{fmt(Number(m.perUnit || 0))}</td>
                            <td className="px-2 py-1">
                              <Input type="number" step="any" className="h-8 font-bold" value={m.quantity}
                                onChange={(e) => setMaterialQuantity(i, e.target.value)} />
                            </td>
                            <td className="px-2 py-1">
                              <Input type="number" step="any" className="h-8 font-bold" value={m.scrapPercent}
                                onChange={(e) => setMaterialScrap(i, e.target.value)} />
                            </td>
                            <td className="px-2 py-2 font-semibold">{fmt(scrapQ)}</td>
                            <td className="px-2 py-2">{it?.unit || "—"}</td>
                            <td className="px-2 py-1">
                              <Select
                                value={m.warehouseId || "__default"}
                                onValueChange={(v) => setMaterials((p) => p.map((row, idx) => (
                                  idx === i ? { ...row, warehouseId: v === "__default" ? "" : v } : row
                                )))}
                              >
                                <SelectTrigger className="h-8 text-xs w-full min-w-0"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__default">افتراضي (مخزن الاستلام)</SelectItem>
                                  {warehouseOpts.map((w) => (
                                    <SelectItem key={String(w.id)} value={String(w.id)}>{w.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className={`px-2 py-2 ${short ? "text-red-600 font-extrabold" : ""}`}>{fmt(avail)}</td>
                            <td className="px-2 py-2">{money(rawCost)}</td>
                            <td className="px-2 py-2">{money(scrapCost)}</td>
                            <td className="px-2 py-2 font-bold">{money(rawCost + scrapCost)}</td>
                            <td className="px-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500"
                                onClick={() => setMaterials((p) => p.filter((_, idx) => idx !== i))}>
                                <Trash2 size={14} />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm font-extrabold bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <div>تكلفة المواد الخام: {money(totals.rawCost)} ج.م</div>
                  <div>تكلفة التوالف: {money(totals.scrapCost)} ج.م</div>
                  <div>اقصى كمية يمكن انتاجها: {fmt(totals.maxProd)}</div>
                </div>
                {totals.shortages.length > 0 && (
                  <p className="text-xs font-bold text-red-600">
                    رصيد غير كافٍ: {totals.shortages.join(" · ")} — الاعتماد هيترفض لحد ما الرصيد يكفي
                  </p>
                )}

                <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                  <input type="checkbox" checked={printAfterSave} onChange={(e) => setPrintAfterSave(e.target.checked)} />
                  طباعة بعد الحفظ
                </label>

                {entityCanSave ? (
                  <div className="flex flex-wrap gap-2">
                    <Button className="font-extrabold bg-slate-800 hover:bg-slate-900"
                      disabled={createMut.isPending || updateMut.isPending}
                      onClick={() => void saveOrder(false)}>
                      {editId ? "حفظ التعديلات" : "حفظ"}
                    </Button>
                    <EntityPermissionGate moduleKey="production" entityKey="productionOrder" action="approve">
                      <Button className="font-extrabold bg-amber-600 hover:bg-amber-700"
                        disabled={createMut.isPending || updateMut.isPending || statusMut.isPending}
                        onClick={() => void saveOrder(true)}>
                        {editId ? "اعتماد" : "حفظ واعتماد"}
                      </Button>
                    </EntityPermissionGate>
                    {editId && (
                      <Button variant="outline" onClick={() => { resetForm(); setTabNav("orders"); }}>إلغاء التعديل</Button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs font-bold text-red-600">لا صلاحية حفظ/اعتماد على الإنتاج</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </ERPLayout>
  );
}
