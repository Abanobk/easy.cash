import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import ERPLayout from "@/components/ERPLayout";
import { FieldLabel, FormSection, FormBanner, entryControlClass, entrySelectTriggerClass, entryTextareaClass } from "@/components/form/EntryForm";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { ArrowRight, ChevronsUpDown, Pencil, Plus, Save, Search, Trash2 } from "lucide-react";
import { useEntityAllowed } from "@/hooks/useEntityPermission";
import { tenantPath, useTenantSlug } from "@/lib/tenant";

type TabId = "basic" | "prices" | "units" | "components" | "minmax";

type BomLine = {
  key: string;
  materialItemId: number;
  barcode: string;
  name: string;
  quantity: string;
  unit: string;
};

type ItemOpt = {
  id: number;
  name: string;
  code?: string | null;
  barcode?: string | null;
  unit?: string | null;
};

const emptyForm = {
  name: "",
  code: "",
  barcode: "",
  categoryId: undefined as number | undefined,
  altCategoryId: undefined as number | undefined,
  itemType: "وحدة مخزنية",
  unit: "قطعة",
  purchasePrice: "",
  salePrice: "",
  minPrice: "",
  maxPrice: "",
  minStock: "",
  taxRate: "",
  description: "",
  trackSerial: false,
};

const MEGA_ITEM_TYPES = [
  "وحدة مخزنية",
  "وحدة خدمية",
  "مادة خام",
  "منتج وسيط",
  "منتج تام",
  "مجموعة / طقم",
  "صنف مركب",
  "صنف وكالة",
] as const;

const emptyComp = { barcode: "", itemId: "", quantity: "1", unit: "" };

const TABS: { id: TabId; label: string }[] = [
  { id: "basic", label: "البيانات الأساسية" },
  { id: "prices", label: "الأسعار الإضافية" },
  { id: "units", label: "وحدات القياس الإضافية" },
  { id: "components", label: "المكونات" },
  { id: "minmax", label: "أقل كمية / المكان" },
];

function findItemByScan(catalog: ItemOpt[], raw: string): ItemOpt | undefined {
  const q = raw.trim().toLowerCase();
  if (!q) return undefined;
  return catalog.find((i) => {
    const bc = String(i.barcode || "").trim().toLowerCase();
    const code = String(i.code || "").trim().toLowerCase();
    return bc === q || code === q || String(i.id) === q;
  }) || catalog.find((i) => {
    const bc = String(i.barcode || "").trim().toLowerCase();
    const code = String(i.code || "").trim().toLowerCase();
    return (bc && bc.includes(q)) || (code && code.includes(q)) || i.name.toLowerCase().includes(q);
  });
}

function ComponentItemPicker({
  items,
  value,
  excludeId,
  onChange,
}: {
  items: ItemOpt[];
  value: string;
  excludeId?: number | null;
  onChange: (item: ItemOpt | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = items.find((i) => String(i.id) === value);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items
      .filter((i) => !excludeId || i.id !== excludeId)
      .filter((i) => {
        if (!term) return true;
        return (
          i.name.toLowerCase().includes(term)
          || String(i.code || "").toLowerCase().includes(term)
          || String(i.barcode || "").toLowerCase().includes(term)
        );
      })
      .slice(0, 80);
  }, [items, q, excludeId]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className={`${entrySelectTriggerClass} justify-between px-3`}>
          <span className="truncate text-right flex-1 font-semibold">
            {selected
              ? `${selected.code ? `${selected.code} — ` : ""}${selected.name}`
              : <span className="text-slate-400 font-medium">اختر الصنف المكوّن</span>}
          </span>
          <ChevronsUpDown size={14} className="opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(28rem,92vw)] p-2" align="start">
        <div className="relative mb-2">
          <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم / الكود / السيريل نمبر" className="h-9 pr-8 text-sm" />
        </div>
        <div className="max-h-56 overflow-y-auto space-y-0.5">
          {filtered.length === 0 ? (
            <p className="text-xs text-slate-400 p-3 text-center">لا نتائج</p>
          ) : filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`w-full text-right rounded-lg px-2.5 py-2 text-sm hover:bg-sky-50 ${
                String(item.id) === value ? "bg-blue-50 text-blue-800 font-bold" : "text-slate-800"
              }`}
              onClick={() => {
                onChange(item);
                setOpen(false);
                setQ("");
              }}
            >
              <div className="font-bold truncate">{item.code ? `${item.code} — ${item.name}` : item.name}</div>
              <div className="text-[11px] text-slate-500 font-semibold mt-0.5">
                {item.barcode ? `سيريل نمبر: ${item.barcode} · ` : ""}{item.unit || "—"}
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * بطاقة صنف — تبويبات Mega (Inv/Items.aspx):
 * بيانات أساسية · أسعار · وحدات · مكونات · أقل كمية
 */
export default function ItemDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const tenantSlug = useTenantSlug();
  const isNew = params.id === "new" || !params.id;
  const editId = isNew ? null : Number(params.id);
  const canEdit = useEntityAllowed("inventory", "item", "edit");
  const canCreate = useEntityAllowed("inventory", "item", "add");

  const [tab, setTab] = useState<TabId>("basic");
  const [form, setForm] = useState(emptyForm);
  const [compForm, setCompForm] = useState(emptyComp);
  const [compLines, setCompLines] = useState<BomLine[]>([]);
  const [editingCompKey, setEditingCompKey] = useState<string | null>(null);

  const itemQ = trpc.items.byId.useQuery(editId!, { enabled: !!editId && !Number.isNaN(editId) });
  const { data: categories } = trpc.items.categories.useQuery();
  const { data: measureUnits, isLoading: unitsLoading } = trpc.parity.settings.measureUnits.listActive.useQuery();
  const catalogQ = trpc.items.all.useQuery();
  const bomQ = trpc.production.bom.get.useQuery(
    { productId: editId! },
    { enabled: !!editId && !Number.isNaN(editId) },
  );

  const unitOptions = (measureUnits || []).map((u) => u.name);
  const defaultUnit = unitOptions.includes("قطعة") ? "قطعة" : (unitOptions[0] || "قطعة");
  const catalog = (catalogQ.data || []) as ItemOpt[];

  /**
   * بنملأ الفورم من بيانات السيرفر مرة واحدة بس لكل صنف (أول ما نفتحه، أو لما نتنقل
   * لصنف تاني) — مش في كل مرة itemQ.data بيتحدّث. لو سيبناها تشتغل على أي تحديث،
   * أي إعادة جلب في الخلفية (رجوع فوكس للتاب، إلخ) هتمسح تعديلات المستخدم اللي
   * لسه ما اتحفظتش من غير ما هو حاسس، وتخلي الحفظ يبعت القيم القديمة بدل الجديدة.
   */
  const syncedForId = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (isNew) {
      if (syncedForId.current !== null) {
        syncedForId.current = null;
        setForm({ ...emptyForm, unit: defaultUnit });
        setCompLines([]);
      }
      return;
    }
    const row = itemQ.data;
    if (!row) return;
    if (syncedForId.current === editId) return; // اتملى قبل كده — متعادش نمسح تعديل المستخدم
    syncedForId.current = editId;
    const unit = (row.unit || defaultUnit).trim() || defaultUnit;
    setForm({
      name: row.name || "",
      code: row.code || "",
      barcode: row.barcode || "",
      categoryId: row.categoryId ?? undefined,
      altCategoryId: (row as any).altCategoryId ?? undefined,
      itemType: (row as any).itemType || "وحدة مخزنية",
      unit,
      purchasePrice: row.purchasePrice || "",
      salePrice: row.salePrice || "",
      minPrice: (row as any).minPrice || "",
      maxPrice: (row as any).maxPrice || "",
      minStock: row.minStock || "",
      taxRate: row.taxRate || "",
      description: row.description || "",
      trackSerial: Boolean(row.trackSerial),
    });
  }, [isNew, itemQ.data, editId, defaultUnit]);

  useEffect(() => {
    if (!bomQ.data) return;
    setCompLines(
      bomQ.data.map((l) => ({
        key: `db-${l.id}`,
        materialItemId: l.materialItemId,
        barcode: l.materialBarcode || l.materialCode || "",
        name: l.materialName || `#${l.materialItemId}`,
        quantity: String(l.quantityPerUnit ?? "1"),
        unit: l.materialUnit || "",
      })),
    );
  }, [bomQ.data]);

  const bomSaveMut = trpc.production.bom.save.useMutation({
    onError: (e) => toast.error(e.message),
  });

  const persistBom = useCallback(async (productId: number, lines: BomLine[]) => {
    await bomSaveMut.mutateAsync({
      productId,
      lines: lines.map((l) => ({
        materialItemId: l.materialItemId,
        quantityPerUnit: l.quantity,
      })),
    });
    void bomQ.refetch();
  }, [bomSaveMut, bomQ]);

  const createMut = trpc.items.create.useMutation({
    onSuccess: async (res) => {
      toast.success(res?.code ? `تم إضافة الصنف — الكود ${res.code}` : "تم إضافة الصنف");
      if (res.id && compLines.length) {
        try {
          await persistBom(res.id, compLines);
        } catch {
          /* toast from mutation */
        }
      }
      navigate(tenantPath(tenantSlug, `/items/${res.id}`));
    },
    onError: (err) => toast.error(err.message || "فشل إضافة الصنف"),
  });
  const updateMut = trpc.items.update.useMutation({
    onSuccess: async () => {
      toast.success("تم حفظ بطاقة الصنف");
      if (editId) {
        try {
          await persistBom(editId, compLines);
          toast.success("تم حفظ المكونات");
        } catch {
          /* toast from mutation */
        }
      }
      void itemQ.refetch();
    },
    onError: (err) => toast.error(err.message || "فشل تحديث الصنف"),
  });

  const applyComponentItem = (item: ItemOpt | null) => {
    if (!item) {
      setCompForm((p) => ({ ...p, itemId: "", barcode: "", unit: "" }));
      return;
    }
    setCompForm((p) => ({
      ...p,
      itemId: String(item.id),
      barcode: item.barcode || item.code || "",
      unit: item.unit || p.unit || defaultUnit,
    }));
  };

  const resolveBarcode = () => {
    const hit = findItemByScan(catalog, compForm.barcode);
    if (!hit) {
      toast.error("لم يُعثر على صنف بهذا السيريل نمبر/الكود");
      return;
    }
    if (editId && hit.id === editId) {
      toast.error("لا يمكن إضافة الصنف كمكون لنفسه");
      return;
    }
    applyComponentItem(hit);
  };

  const clearCompForm = () => {
    setCompForm(emptyComp);
    setEditingCompKey(null);
  };

  const addComponent = async () => {
    const itemId = Number(compForm.itemId);
    if (!itemId) {
      toast.error("اختر الصنف أو امسح السيريل نمبر أولاً");
      return;
    }
    if (editId && itemId === editId) {
      toast.error("لا يمكن إضافة الصنف كمكون لنفسه");
      return;
    }
    const qty = Number(compForm.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("الكمية يجب أن تكون أكبر من صفر");
      return;
    }
    const item = catalog.find((i) => i.id === itemId);
    const line: BomLine = {
      key: editingCompKey || `tmp-${Date.now()}`,
      materialItemId: itemId,
      barcode: compForm.barcode || item?.barcode || item?.code || "",
      name: item?.name || `#${itemId}`,
      quantity: String(qty),
      unit: compForm.unit || item?.unit || "",
    };

    let next: BomLine[];
    if (editingCompKey) {
      next = compLines.map((l) => (l.key === editingCompKey ? line : l));
    } else {
      const existing = compLines.find((l) => l.materialItemId === itemId);
      if (existing) {
        next = compLines.map((l) =>
          l.materialItemId === itemId
            ? { ...l, quantity: String(Number(l.quantity) + qty), barcode: line.barcode, unit: line.unit || l.unit }
            : l,
        );
        toast.message("الصنف موجود — تم جمع الكمية");
      } else {
        next = [...compLines, line];
      }
    }
    setCompLines(next);
    clearCompForm();

    if (editId) {
      try {
        await persistBom(editId, next);
        toast.success("تم حفظ المكون");
      } catch {
        /* handled */
      }
    }
  };

  const editComponent = (line: BomLine) => {
    setEditingCompKey(line.key);
    setCompForm({
      barcode: line.barcode,
      itemId: String(line.materialItemId),
      quantity: line.quantity,
      unit: line.unit,
    });
    setTab("components");
  };

  const deleteComponent = async (key: string) => {
    const next = compLines.filter((l) => l.key !== key);
    setCompLines(next);
    if (editId) {
      try {
        await persistBom(editId, next);
        toast.success("تم حذف المكون");
      } catch {
        /* handled */
      }
    }
  };

  const handleSubmit = () => {
    if (editId && !canEdit) {
      toast.error("ليس لديك صلاحية تعديل الأصناف");
      return;
    }
    if (!editId && !canCreate) {
      toast.error("ليس لديك صلاحية إضافة أصناف");
      return;
    }
    if (!form.name.trim()) {
      toast.error("اسم الصنف مطلوب");
      setTab("basic");
      return;
    }
    const unit = (form.unit || "").trim();
    if (!unit) {
      toast.error("اختر وحدة القياس من القائمة");
      setTab("basic");
      return;
    }
    if (unitOptions.length > 0 && !unitOptions.includes(unit)) {
      toast.error("وحدة القياس غير مسجّلة — أضفها من خصائص عامة أولاً");
      setTab("basic");
      return;
    }
    const payload = {
      name: form.name.trim(),
      code: form.code.trim() || undefined,
      barcode: form.barcode.trim() || undefined,
      categoryId: form.categoryId,
      altCategoryId: form.altCategoryId ?? null,
      itemType: form.itemType || undefined,
      unit,
      purchasePrice: form.purchasePrice.trim() || undefined,
      salePrice: form.salePrice.trim() || undefined,
      minPrice: form.minPrice.trim() || undefined,
      maxPrice: form.maxPrice.trim() || undefined,
      minStock: form.minStock.trim() || undefined,
      taxRate: form.taxRate.trim() || undefined,
      description: form.description.trim() || undefined,
      trackSerial: form.trackSerial,
    };
    if (editId) updateMut.mutate({ id: editId, ...payload });
    else createMut.mutate(payload);
  };

  const f = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const selectUnitValue = unitOptions.includes(form.unit)
    ? form.unit
    : (form.unit ? form.unit : undefined);

  const listHref = tenantPath(tenantSlug, "/items");
  const title = isNew ? "صنف جديد" : `بطاقة صنف${form.code ? ` — ${form.code}` : ""}`;
  const saving = createMut.isPending || updateMut.isPending || bomSaveMut.isPending;

  if (!isNew && itemQ.isLoading) {
    return (
      <ERPLayout title="بطاقة صنف">
        <div className="py-20 text-center text-slate-400 text-sm">جاري تحميل بطاقة الصنف...</div>
      </ERPLayout>
    );
  }

  if (!isNew && (itemQ.isError || !itemQ.data)) {
    return (
      <ERPLayout title="بطاقة صنف">
        <div className="py-16 text-center space-y-3">
          <p className="text-red-600">{itemQ.error?.message || "الصنف غير موجود"}</p>
          <Button variant="outline" asChild>
            <Link href={listHref}><ArrowRight className="h-4 w-4 ml-1" /> العودة للقائمة</Link>
          </Button>
        </div>
      </ERPLayout>
    );
  }

  return (
    <ERPLayout title={title}>
      <div className="max-w-5xl mx-auto space-y-4" dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" asChild>
              <Link href={listHref}>
                <ArrowRight className="h-4 w-4 ml-1" /> القائمة
              </Link>
            </Button>
            <div>
              <h1 className="text-xl font-bold text-slate-800">{isNew ? "إضافة صنف جديد" : "تعديل بطاقة الصنف"}</h1>
              <p className="text-sm text-slate-500">نفس تبويبات بطاقة الصنف — المكونات بمسح السيريل نمبر واختيار الصنف</p>
            </div>
          </div>
          <Button className="gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={handleSubmit} disabled={saving}>
            <Save size={16} />
            {saving ? "جاري الحفظ..." : "حفظ"}
          </Button>
        </div>

        {/* Mega-style tabs */}
        <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-bold rounded-t-lg border border-b-0 transition-colors ${
                tab === t.id
                  ? "bg-blue-700 text-white border-blue-700 -mb-px"
                  : "bg-slate-100 text-slate-700 border-transparent hover:bg-slate-200"
              }`}
            >
              {t.label}
              {t.id === "components" && compLines.length > 0 ? (
                <span className="mr-1.5 text-xs opacity-90">({compLines.length})</span>
              ) : null}
            </button>
          ))}
        </div>

        {tab === "basic" && (
          <div className="space-y-4">
            <FormBanner tone="info">
              <p className="text-sm text-slate-700 leading-relaxed">
                <strong className="text-slate-900">الكود:</strong> رقم الصنف الداخلي (مثل P-0001).
                {" "}
                <strong className="text-slate-900">السيريل نمبر:</strong> للمسح في الفواتير — قد يختلف عن الكود.
              </p>
            </FormBanner>

            <FormSection title="التعريف" accent="blue">
              <div>
                <FieldLabel required>اسم الصنف</FieldLabel>
                <Input value={form.name} onChange={f("name")} placeholder="اسم الصنف" className={entryControlClass} lang="ar" />
              </div>
              <div>
                <FieldLabel hint={isNew ? "تلقائي إن تُرك فارغاً (مثل P-0001)" : "رقم الصنف الداخلي"}>
                  الكود (رقم الصنف)
                </FieldLabel>
                <Input value={form.code} onChange={f("code")} placeholder={isNew ? "تلقائي" : "كود الصنف"} className={entryControlClass} />
              </div>
              <div>
                <FieldLabel hint="للماسح الضوئي">السيريل نمبر</FieldLabel>
                <Input value={form.barcode} onChange={f("barcode")} placeholder="امسح أو اكتب السيريل نمبر" className={entryControlClass} />
              </div>
              <div>
                <FieldLabel>الفئة</FieldLabel>
                <Select
                  value={form.categoryId != null ? String(form.categoryId) : "__none__"}
                  onValueChange={(v) => setForm((prev) => ({
                    ...prev,
                    categoryId: v === "__none__" ? undefined : Number(v),
                  }))}
                >
                  <SelectTrigger className={entrySelectTriggerClass}><SelectValue placeholder="اختر الفئة" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">بدون فئة</SelectItem>
                    {categories?.map((c) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel>فئة بديلة</FieldLabel>
                <Select
                  value={form.altCategoryId != null ? String(form.altCategoryId) : "__none__"}
                  onValueChange={(v) => setForm((prev) => ({
                    ...prev,
                    altCategoryId: v === "__none__" ? undefined : Number(v),
                  }))}
                >
                  <SelectTrigger className={entrySelectTriggerClass}><SelectValue placeholder="فئة بديلة" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">بدون</SelectItem>
                    {categories?.map((c) => <SelectItem key={`alt-${c.id}`} value={c.id.toString()}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel>نوع الصنف</FieldLabel>
                <Select
                  value={form.itemType || "وحدة مخزنية"}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, itemType: v }))}
                >
                  <SelectTrigger className={entrySelectTriggerClass}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MEGA_ITEM_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 space-y-2">
                <FieldLabel required>وحدة القياس</FieldLabel>
                <Select
                  value={selectUnitValue}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, unit: v }))}
                  disabled={unitsLoading || unitOptions.length === 0}
                >
                  <SelectTrigger className={entrySelectTriggerClass}>
                    <SelectValue placeholder={unitsLoading ? "جاري التحميل…" : "اختر الوحدة"} />
                  </SelectTrigger>
                  <SelectContent>
                    {form.unit && !unitOptions.includes(form.unit) && (
                      <SelectItem value={form.unit}>{form.unit} (غير نشطة — غيّرها)</SelectItem>
                    )}
                    {unitOptions.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs font-semibold text-slate-500">
                  الوحدات من{" "}
                  <Link href={tenantPath(tenantSlug, "/settings/general-attributes")} className="text-blue-700 underline">
                    خصائص عامة → وحدات القياس
                  </Link>
                </p>
              </div>
              <div className="sm:col-span-2">
                <FormBanner tone="info">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      checked={form.trackSerial}
                      onCheckedChange={(v) => setForm((p) => ({ ...p, trackSerial: v === true }))}
                      className="mt-0.5 size-5"
                    />
                    <span>
                      <span className="text-base font-semibold text-slate-900 block">تتبع الرقم التسلسلي</span>
                      <span className="text-sm text-slate-600">للأصناف اللي تحتاج سيريال عند البيع/الشراء.</span>
                    </span>
                  </label>
                </FormBanner>
              </div>
              <div className="sm:col-span-2">
                <FieldLabel>الوصف</FieldLabel>
                <Textarea value={form.description} onChange={f("description")} className={entryTextareaClass} rows={3} lang="ar" />
              </div>
            </FormSection>

            <FormSection title="الأسعار والضريبة" accent="amber">
              <div>
                <FieldLabel>سعر الشراء</FieldLabel>
                <Input value={form.purchasePrice} onChange={f("purchasePrice")} type="number" placeholder="0.00" className={entryControlClass} />
              </div>
              <div>
                <FieldLabel>سعر البيع</FieldLabel>
                <Input value={form.salePrice} onChange={f("salePrice")} type="number" placeholder="0.00" className={entryControlClass} />
              </div>
              <div>
                <FieldLabel>السعر الادنى</FieldLabel>
                <Input value={form.minPrice} onChange={f("minPrice")} type="number" placeholder="0.00" className={entryControlClass} />
              </div>
              <div>
                <FieldLabel>السعر الاعلى</FieldLabel>
                <Input value={form.maxPrice} onChange={f("maxPrice")} type="number" placeholder="0.00" className={entryControlClass} />
              </div>
              <div>
                <FieldLabel>نسبة الضريبة %</FieldLabel>
                <Input value={form.taxRate} onChange={f("taxRate")} type="number" placeholder="0" className={entryControlClass} />
              </div>
            </FormSection>
          </div>
        )}

        {tab === "prices" && (
          <FormBanner tone="info">
            <p className="text-sm text-slate-700">
              أسعار البيع/الشراء الأساسية في تبويب «البيانات الأساسية». تعدد قوائم الأسعار (جملة/قطاعي حسب العميل) هيتعمل في خطوة لاحقة بنفس أسلوب الشاشة المرجعية.
            </p>
          </FormBanner>
        )}

        {tab === "units" && (
          <FormBanner tone="info">
            <p className="text-sm text-slate-700">
              الوحدة الأساسية من خصائص عامة. تعدد الوحدات للصنف الواحد (كرتونة = N قطعة) هيتعمل لاحقاً مع سيريل نمبر لكل وحدة.
            </p>
          </FormBanner>
        )}

        {tab === "minmax" && (
          <FormSection title="الحد الأدنى / المكان" accent="slate">
            <div>
              <FieldLabel>الحد الأدنى للمخزون</FieldLabel>
              <Input value={form.minStock} onChange={f("minStock")} type="number" placeholder="0" className={entryControlClass} />
            </div>
            <div className="sm:col-span-2">
              <p className="text-sm text-slate-500">يظهر تنبيه في القائمة والتقارير عند انخفاض الرصيد عن الحد الأدنى.</p>
            </div>
          </FormSection>
        )}

        {tab === "components" && (
          <div className="space-y-4">
            {isNew && (
              <FormBanner tone="warn">
                <p className="text-sm">تقدر تضيف المكونات الآن، وهتتحفظ مع أول حفظ للصنف. أو احفظ الصنف أولاً ثم أضف المكونات مباشرة.</p>
              </FormBanner>
            )}

            <FormSection title="إضافة مكوّن" accent="emerald">
              <div>
                <FieldLabel>السيريل نمبر</FieldLabel>
                <Input
                  value={compForm.barcode}
                  onChange={(e) => setCompForm((p) => ({ ...p, barcode: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      resolveBarcode();
                    }
                  }}
                  onBlur={() => {
                    if (compForm.barcode.trim() && !compForm.itemId) resolveBarcode();
                  }}
                  placeholder="امسح السيريل نمبر ثم Enter"
                  className={entryControlClass}
                  dir="ltr"
                />
              </div>
              <div>
                <FieldLabel>الصنف</FieldLabel>
                <ComponentItemPicker
                  items={catalog}
                  value={compForm.itemId}
                  excludeId={editId}
                  onChange={applyComponentItem}
                />
              </div>
              <div>
                <FieldLabel>الكمية</FieldLabel>
                <Input
                  type="number"
                  value={compForm.quantity}
                  onChange={(e) => setCompForm((p) => ({ ...p, quantity: e.target.value }))}
                  className={entryControlClass}
                  dir="ltr"
                />
              </div>
              <div>
                <FieldLabel>وحدة القياس</FieldLabel>
                <Select
                  value={compForm.unit || undefined}
                  onValueChange={(v) => setCompForm((p) => ({ ...p, unit: v }))}
                >
                  <SelectTrigger className={entrySelectTriggerClass}><SelectValue placeholder="الوحدة" /></SelectTrigger>
                  <SelectContent>
                    {compForm.unit && !unitOptions.includes(compForm.unit) && (
                      <SelectItem value={compForm.unit}>{compForm.unit}</SelectItem>
                    )}
                    {unitOptions.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 flex flex-wrap gap-2">
                <Button type="button" className="bg-blue-700 hover:bg-blue-800 gap-1.5" onClick={() => void addComponent()} disabled={bomSaveMut.isPending}>
                  <Plus size={16} />
                  {editingCompKey ? "تحديث" : "إضافة"}
                </Button>
                <Button type="button" variant="secondary" onClick={clearCompForm}>تفريغ</Button>
              </div>
            </FormSection>

            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200">
                    <th className="px-3 py-2.5 text-right text-xs font-bold">السيريل نمبر</th>
                    <th className="px-3 py-2.5 text-right text-xs font-bold">الاسم</th>
                    <th className="px-3 py-2.5 text-right text-xs font-bold">الكمية</th>
                    <th className="px-3 py-2.5 text-right text-xs font-bold">وحدة القياس</th>
                    <th className="px-3 py-2.5 text-center text-xs font-bold w-24">تعديل</th>
                    <th className="px-3 py-2.5 text-center text-xs font-bold w-24">حذف</th>
                  </tr>
                </thead>
                <tbody>
                  {compLines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-400">لا توجد مكونات — امسح سيريل نمبر أو اختر صنفاً ثم إضافة</td>
                    </tr>
                  ) : (
                    compLines.map((l, i) => (
                      <tr key={l.key} className={`border-b border-slate-100 ${i % 2 ? "bg-slate-50/80" : "bg-white"}`}>
                        <td className="px-3 py-2 font-mono text-slate-700" dir="ltr">{l.barcode || "—"}</td>
                        <td className="px-3 py-2 font-semibold text-slate-800">{l.name}</td>
                        <td className="px-3 py-2" dir="ltr">{l.quantity}</td>
                        <td className="px-3 py-2">{l.unit || "—"}</td>
                        <td className="px-3 py-2 text-center">
                          <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0 text-blue-700" onClick={() => editComponent(l)}>
                            <Pencil size={15} />
                          </Button>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-600" onClick={() => void deleteComponent(l.key)}>
                            <Trash2 size={15} />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {compLines.length > 0 && (
                <div className="px-3 py-2 text-xs text-slate-500 border-t border-slate-100">
                  عدد الصفوف: {compLines.length}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pb-8">
          <Button variant="outline" asChild>
            <Link href={listHref}>إلغاء</Link>
          </Button>
          <Button className="gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={handleSubmit} disabled={saving}>
            <Save size={16} />
            {saving ? "جاري الحفظ..." : "حفظ"}
          </Button>
        </div>
      </div>
    </ERPLayout>
  );
}
