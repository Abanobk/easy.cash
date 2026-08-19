import ERPLayout from "@/components/ERPLayout";
import PermissionGate from "@/components/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useWarehouseOptions, useCustomerOptions, useSupplierOptions } from "@/hooks/useEntityOptions";
import { tenantPath, useTenantSlug } from "@/lib/tenant";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Package,
  ShoppingCart,
  Factory,
  Upload,
  Warehouse,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const KIND_LABEL: Record<string, string> = {
  item_costs: "تكاليف الأصناف / مخزون",
  sales: "المبيعات (تقرير مطبوع)",
  purchases: "المشتريات (تقرير مطبوع)",
  production: "أوامر الإنتاج (تقرير مطبوع)",
};

export default function MegaReportImportPage() {
  const tenantSlug = useTenantSlug();
  const [, navigate] = useLocation();
  const warehouses = useWarehouseOptions();
  const customerOptions = useCustomerOptions();
  const supplierOptions = useSupplierOptions();
  const utils = trpc.useUtils();

  const previewMut = trpc.megaReportImport.preview.useMutation();
  const createItemsMut = trpc.megaReportImport.createMissingItems.useMutation();
  const createPartiesMut = trpc.megaReportImport.createMissingParties.useMutation();
  const commitSalesMut = trpc.megaReportImport.commitSales.useMutation();
  const commitPurchMut = trpc.megaReportImport.commitPurchases.useMutation();
  const commitProdMut = trpc.megaReportImport.commitProduction.useMutation();
  const commitCostsMut = trpc.megaReportImport.commitItemCosts.useMutation();
  const syncUnitsMut = trpc.parity.inventory.beginningInventory.syncItemUnits.useMutation();

  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<any | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [importDate, setImportDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentType, setPaymentType] = useState<"credit" | "cash">("credit");
  const [busy, setBusy] = useState(false);

  const kind = preview?.kind as string | undefined;

  const syncUnitsFromPreview = async (res: any) => {
    const rows: Array<{ itemId: number; unit: string }> = [];
    if (res.kind === "item_costs") {
      for (const r of res.itemCosts || []) {
        if (r.itemId && String(r.unit || "").trim()) {
          rows.push({ itemId: Number(r.itemId), unit: String(r.unit).trim() });
        }
      }
    }
    if (res.kind === "sales" || res.kind === "purchases") {
      const docs = res.kind === "sales" ? res.sales : res.purchases;
      for (const d of docs || []) {
        for (const l of d.lines || []) {
          if (l.itemId && String(l.unit || "").trim()) {
            rows.push({ itemId: Number(l.itemId), unit: String(l.unit).trim() });
          }
        }
      }
    }
    if (!rows.length) return;
    try {
      const sync = await syncUnitsMut.mutateAsync({ rows });
      if (sync.updated > 0) {
        toast.success(`تم تحديث وحدة القياس لـ ${sync.updated} صنف من التقرير`);
      }
    } catch {
      /* غير حاجز للاستيراد */
    }
  };

  const onFile = async (file: File) => {
    setBusy(true);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const fileBase64 = btoa(binary);
      const res = await previewMut.mutateAsync({ fileBase64, fileName: file.name });
      setPreview(res);
      if (!warehouseId && warehouses[0]) setWarehouseId(warehouses[0].value);
      toast.success(`تم التعرف: ${KIND_LABEL[res.kind] || res.kind}`);
      await syncUnitsFromPreview(res);
    } catch (e: any) {
      toast.error(e?.message || "فشل قراءة الملف");
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const missingItemRows = useMemo(() => {
    if (!preview) return [] as Array<{ clientKey: string; name: string; barcode?: string; unitCost?: string; unit?: string }>;
    if (preview.kind === "item_costs") {
      return (preview.itemCosts || [])
        .filter((r: any) => r.itemStatus !== "matched")
        .map((r: any) => ({
          clientKey: `cost-${r.index}`,
          name: r.name,
          unitCost: r.unitCost,
          unit: r.unit || undefined,
        }));
    }
    if (preview.kind === "sales" || preview.kind === "purchases") {
      const docs = preview.kind === "sales" ? preview.sales : preview.purchases;
      const out: Array<{ clientKey: string; name: string; barcode?: string; unitCost?: string; unit?: string }> = [];
      for (const d of docs || []) {
        for (const l of d.lines || []) {
          if (l.status === "matched") continue;
          out.push({
            clientKey: `${d.index}-${l.index}`,
            name: l.name,
            barcode: l.barcode || undefined,
            unitCost: l.price,
            unit: l.unit || undefined,
          });
        }
      }
      return out;
    }
    if (preview.kind === "production") {
      const out: Array<{ clientKey: string; name: string; barcode?: string }> = [];
      for (const d of preview.production || []) {
        if (d.productStatus !== "matched") {
          out.push({ clientKey: `p-${d.index}`, name: d.product, barcode: d.barcode || undefined });
        }
        for (const m of d.materials || []) {
          if (m.status === "matched") continue;
          out.push({ clientKey: `p-${d.index}-m-${m.index}`, name: m.name, barcode: m.barcode || undefined });
        }
      }
      return out;
    }
    return [];
  }, [preview]);

  const missingParties = useMemo(() => {
    if (!preview) return [] as Array<{ clientKey: string; name: string }>;
    if (preview.kind === "sales") {
      return (preview.sales || [])
        .filter((d: any) => d.partyStatus !== "matched")
        .map((d: any) => ({ clientKey: String(d.index), name: d.customer }));
    }
    if (preview.kind === "purchases") {
      return (preview.purchases || [])
        .filter((d: any) => d.partyStatus !== "matched")
        .map((d: any) => ({ clientKey: String(d.index), name: d.supplier }));
    }
    return [];
  }, [preview]);

  const refreshPreview = async () => {
    if (!fileName) return;
    toast.message("أعد رفع الملف بعد إضافة الناقص لتحديث المطابقة");
  };

  const addMissingItems = async () => {
    if (!missingItemRows.length) return;
    setBusy(true);
    try {
      const res = await createItemsMut.mutateAsync({ rows: missingItemRows });
      toast.success(`تمت إضافة ${res.created.length} صنف`);
      if (res.errors?.length) toast.message(res.errors.slice(0, 2).join(" · "));
      await utils.items.list.invalidate();
      if (preview?.kind === "item_costs" && res.created.length) {
        toast.message("ارفع نفس الملف تاني ثم اضغط اعتماد لتطبيق الكميات (أو من استيراد ذكي لمخزون أول المدة)");
      } else {
        toast.message("ارفع نفس الملف مرة تانية عشان تتعمل مطابقة جديدة");
      }
    } catch (e: any) {
      toast.error(e?.message || "فشل إضافة الأصناف");
    } finally {
      setBusy(false);
    }
  };

  const addMissingParties = async () => {
    if (!missingParties.length || !preview) return;
    setBusy(true);
    try {
      const res = await createPartiesMut.mutateAsync({
        kind: preview.kind === "purchases" ? "supplier" : "customer",
        names: missingParties,
      });
      toast.success(`تمت إضافة ${res.created.length} ${preview.kind === "purchases" ? "مورد" : "عميل"}`);
      toast.message("ارفع نفس الملف مرة تانية عشان تتعمل مطابقة جديدة");
    } catch (e: any) {
      toast.error(e?.message || "فشل إضافة الأطراف");
    } finally {
      setBusy(false);
    }
  };

  /** ربط يدوي: المستخدم متأكد إن المورد/العميل دا موجود بالفعل، بس اسمه في الملف مختلف عن الاسم المسجل */
  const manualMatchParty = (docIndex: number, partyId: string, partyLabel: string) => {
    if (!preview) return;
    const id = Number(partyId);
    if (!id) return;
    setPreview((prev: any) => {
      if (!prev) return prev;
      const key = prev.kind === "sales" ? "sales" : "purchases";
      const idField = prev.kind === "sales" ? "customerId" : "supplierId";
      const nameField = prev.kind === "sales" ? "customer" : "supplier";
      const docs = (prev[key] || []).map((d: any) => {
        if (d.index !== docIndex) return d;
        const updated = {
          ...d,
          [idField]: id,
          [nameField]: partyLabel,
          partyStatus: "matched",
        };
        updated.ready = !!updated[idField] && updated.lines.length > 0 && updated.lines.every((l: any) => l.status === "matched");
        return updated;
      });
      return { ...prev, [key]: docs };
    });
    toast.success("تم الربط");
  };

  const commit = async () => {
    if (!preview) return;
    if (!warehouseId && preview.kind !== "production" && preview.kind !== "item_costs") {
      return toast.error("اختَر مخزن الاعتماد");
    }
    setBusy(true);
    try {
      if (preview.kind === "item_costs") {
        const lines = (preview.itemCosts || [])
          .filter((r: any) => r.itemId && r.warehouseId && Number(r.quantity) > 0)
          .map((r: any) => ({
            itemId: Number(r.itemId),
            warehouseId: Number(r.warehouseId),
            quantity: String(r.quantity),
            unitCost: r.unitCost ? String(r.unitCost) : undefined,
          }));
        if (!lines.length) return toast.error("لا توجد أسطر مطابقة (صنف+مخزن)");
        const res = await commitCostsMut.mutateAsync({ date: importDate, lines });
        toast.success(`تم استيراد ${res.imported} سطر مخزون`);
      } else if (preview.kind === "sales") {
        const documents = (preview.sales || [])
          .filter((d: any) => d.ready)
          .map((d: any) => ({
            customerId: Number(d.customerId),
            date: d.date || importDate,
            serial: d.serial,
            discount: d.discount || "0",
            tax: d.tax || "0",
            total: String(d.total),
            lines: d.lines.map((l: any) => ({
              itemId: Number(l.itemId),
              quantity: String(l.qty),
              price: String(l.price),
              discount: l.discount || "0",
              tax: l.tax || "0",
              total: String(l.total),
            })),
          }));
        if (!documents.length) return toast.error("لا فواتير جاهزة — أضف الأصناف/العملاء الناقصة أولاً");
        const res = await commitSalesMut.mutateAsync({
          warehouseId: Number(warehouseId),
          paymentType,
          documents,
        });
        toast.success(`تم استيراد ${res.imported} فاتورة مبيعات`);
        if (res.errors?.length) toast.message(res.errors.slice(0, 2).join(" · "));
      } else if (preview.kind === "purchases") {
        const documents = (preview.purchases || [])
          .filter((d: any) => d.ready)
          .map((d: any) => ({
            supplierId: Number(d.supplierId),
            date: d.date || importDate,
            serial: d.serial,
            discount: d.discount || "0",
            tax: d.tax || "0",
            total: String(d.total),
            lines: d.lines.map((l: any) => ({
              itemId: Number(l.itemId),
              quantity: String(l.qty),
              price: String(l.price),
              discount: l.discount || "0",
              tax: l.tax || "0",
              total: String(l.total),
            })),
          }));
        if (!documents.length) return toast.error("لا فواتير جاهزة — أضف الأصناف/الموردين الناقصة أولاً");
        const res = await commitPurchMut.mutateAsync({
          warehouseId: Number(warehouseId),
          paymentType,
          documents,
        });
        toast.success(`تم استيراد ${res.imported} فاتورة مشتريات`);
        if (res.errors?.length) toast.message(res.errors.slice(0, 2).join(" · "));
      } else if (preview.kind === "production") {
        const documents = (preview.production || [])
          .filter((d: any) => d.ready)
          .map((d: any) => ({
            productId: Number(d.productId),
            warehouseId: Number(d.warehouseId || warehouseId),
            quantity: String(d.qty || d.deliveries?.[0]?.receivedQty || "0"),
            date: d.deliveries?.[0]?.date || importDate,
            barcode: d.barcode,
            materials: d.materials.map((m: any) => ({
              itemId: Number(m.itemId),
              quantity: String(m.qty),
            })),
          }));
        if (!documents.length) return toast.error("لا أوامر جاهزة — أضف الأصناف/المخازن الناقصة أولاً");
        const res = await commitProdMut.mutateAsync({
          defaultWarehouseId: warehouseId ? Number(warehouseId) : undefined,
          documents,
        });
        toast.success(`تم استيراد ${res.imported} أمر إنتاج (معلّق كمسودة)`);
        if (res.errors?.length) toast.message(res.errors.slice(0, 2).join(" · "));
      }
    } catch (e: any) {
      toast.error(e?.message || "فشل الاعتماد");
    } finally {
      setBusy(false);
    }
  };

  const summary = preview?.summary;

  return (
    <ERPLayout title="استيراد تقارير Excel">
      <PermissionGate module="inventory" action="create" fallback={
        <div className="p-6 text-sm font-bold text-rose-700">محتاج صلاحية إنشاء على المخزون/العمليات</div>
      }>
        <div className="space-y-5 pb-10" dir="rtl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="outline"
              className="font-bold gap-2 h-11"
              onClick={() => navigate(tenantPath(tenantSlug, "/inventory/beginning-inventory"))}
            >
              <ArrowRight size={16} /> رجوع
            </Button>
            <div className="text-sm font-bold text-slate-600">
              يفهم تصدير التقارير: تكاليف الأصناف · البيع · الشراء · أوامر الإنتاج
            </div>
          </div>

          <div className="rounded-2xl border bg-gradient-to-l from-sky-50 to-white p-5 space-y-2">
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="text-sky-700" size={26} />
              استيراد سريع من تقارير Excel
            </h1>
            <p className="text-base text-slate-600 font-semibold max-w-4xl leading-relaxed">
              ارفع ملفات Excel اللي بتصدّرها من شاشات التقارير في النظام القديم. النظام يكتشف النوع، يطابق الأصناف بالباركود/الاسم والعملاء/الموردين/المخازن، ويخلّيك تضيف الناقص ثم تعتمد.
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-7 rounded-2xl border-2 border-dashed border-sky-300 bg-sky-50/50 p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 rounded-2xl bg-sky-700 text-white flex items-center justify-center">
                  <Upload size={26} />
                </div>
                <div>
                  <div className="text-lg font-black">رفع ملف التقرير</div>
                  <div className="text-sm font-semibold text-slate-600">xlsx من تقارير النظام القديم — بيع / شراء / إنتاج / تكاليف</div>
                </div>
              </div>
              <label className="inline-flex">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onFile(f);
                    e.target.value = "";
                  }}
                />
                <Button size="lg" className="bg-sky-700 hover:bg-sky-800 font-black h-12 px-7" asChild disabled={busy || previewMut.isPending}>
                  <span>{busy || previewMut.isPending ? "جاري التحليل..." : "اختيار ملف Excel"}</span>
                </Button>
              </label>
              {fileName ? <div className="text-sm font-bold bg-white border rounded-xl px-3 py-2 inline-block">{fileName}</div> : null}
            </div>

            <div className="xl:col-span-5 rounded-2xl border bg-white p-5 space-y-3">
              <div className="flex items-center gap-2 text-lg font-black">
                <Warehouse className="text-emerald-600" size={20} />
                إعدادات الاعتماد
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-bold">مخزن الاعتماد (مبيعات/مشتريات)</Label>
                <Select value={warehouseId || undefined} onValueChange={setWarehouseId}>
                  <SelectTrigger className="h-12 text-base font-bold"><SelectValue placeholder="اختَر مخزن" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-bold">تاريخ افتراضي (لو التاريخ ناقص)</Label>
                <Input type="date" className="h-12 text-base font-bold" value={importDate} onChange={(e) => setImportDate(e.target.value)} />
              </div>
              {(kind === "sales" || kind === "purchases") && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-bold">نوع الدفع عند الاستيراد</Label>
                  <Select value={paymentType} onValueChange={(v) => setPaymentType(v as "cash" | "credit")}>
                    <SelectTrigger className="h-12 text-base font-bold"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="credit">آجل (موصى به للنقل)</SelectItem>
                      <SelectItem value="cash">نقدي</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "النوع", value: KIND_LABEL[kind || ""] || kind, className: "bg-slate-900 text-white", text: true },
                { label: "مستندات", value: summary.documents, className: "bg-sky-700 text-white" },
                { label: "أسطر", value: summary.lines, className: "bg-slate-700 text-white" },
                { label: "أصناف مطابقة", value: summary.matchedItems, className: "bg-emerald-600 text-white" },
                { label: "أصناف ناقصة", value: summary.unmatchedItems, className: "bg-rose-600 text-white" },
                { label: "جاهز للاعتماد", value: summary.readyDocs ?? summary.matchedItems, className: "bg-emerald-800 text-white" },
              ].map((c) => (
                <div key={c.label} className={`rounded-2xl px-4 py-4 ${c.className}`}>
                  <div className={`${c.text ? "text-base" : "text-3xl"} font-black leading-none`}>{c.value}</div>
                  <div className="text-sm font-bold mt-1.5 opacity-95">{c.label}</div>
                </div>
              ))}
            </div>
          )}

          {(missingItemRows.length > 0 || missingParties.length > 0) && (
            <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 flex flex-wrap gap-3 items-center justify-between">
              <div className="space-y-1">
                <div className="text-lg font-black text-amber-950 flex items-center gap-2">
                  <AlertTriangle size={18} /> فيه بيانات ناقصة عندنا
                </div>
                <p className="text-sm font-semibold text-amber-900">
                  {missingItemRows.length ? `${missingItemRows.length} صنف` : ""}
                  {missingItemRows.length && missingParties.length ? " · " : ""}
                  {missingParties.length ? `${missingParties.length} ${kind === "purchases" ? "مورد" : "عميل"}` : ""}
                  {" "}— ضيفهم ثم ارفع الملف تاني للمطابقة.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {missingItemRows.length > 0 && (
                  <Button className="bg-rose-600 hover:bg-rose-700 font-black h-11" disabled={busy} onClick={() => void addMissingItems()}>
                    <Package size={16} className="ml-1" /> إضافة الأصناف الناقصة
                  </Button>
                )}
                {missingParties.length > 0 && (
                  <Button className="bg-amber-600 hover:bg-amber-700 font-black h-11" disabled={busy} onClick={() => void addMissingParties()}>
                    إضافة {kind === "purchases" ? "الموردين" : "العملاء"} الناقصين
                  </Button>
                )}
                <Button variant="outline" className="font-bold h-11" onClick={() => void refreshPreview()}>تحديث المطابقة</Button>
              </div>
            </div>
          )}

          {kind === "sales" && (
            <DocsTable
              icon={<ShoppingCart size={18} />}
              title="فواتير المبيعات"
              rows={(preview.sales || []).map((d: any) => ({
                key: d.index,
                docIndex: d.index,
                ready: d.ready,
                partyUnmatched: d.partyStatus !== "matched",
                title: d.customer,
                meta: `${d.serial || "—"} · ${d.date} · ${Number(d.total || 0).toLocaleString("en-US")}`,
                detail: `${d.lineMatched}/${d.lines.length} أصناف مطابقة`,
              }))}
              partyOptions={customerOptions}
              partyPlaceholder="اختر عميل موجود..."
              onManualMatch={manualMatchParty}
            />
          )}
          {kind === "purchases" && (
            <DocsTable
              icon={<ShoppingCart size={18} />}
              title="فواتير المشتريات"
              rows={(preview.purchases || []).map((d: any) => ({
                key: d.index,
                docIndex: d.index,
                ready: d.ready,
                partyUnmatched: d.partyStatus !== "matched",
                title: d.supplier,
                meta: `${d.serial || "—"} · ${d.date} · ${Number(d.total || 0).toLocaleString("en-US")}`,
                detail: `${d.lineMatched}/${d.lines.length} أصناف مطابقة`,
              }))}
              partyOptions={supplierOptions}
              partyPlaceholder="اختر مورد موجود..."
              onManualMatch={manualMatchParty}
            />
          )}
          {kind === "production" && (
            <DocsTable
              icon={<Factory size={18} />}
              title="أوامر الإنتاج"
              rows={(preview.production || []).map((d: any) => ({
                key: d.index,
                ready: d.ready,
                title: d.product,
                meta: `باركود ${d.barcode || "—"} · كمية ${d.qty} · ${d.status}`,
                detail: `${d.matMatched}/${d.materials.length} خامات · مخزن: ${d.deliveries?.[0]?.warehouse || d.site || "—"}`,
              }))}
            />
          )}
          {kind === "item_costs" && (
            <div className="rounded-2xl border-2 overflow-hidden bg-white">
              <div className="bg-slate-900 text-white px-4 py-3 font-black flex items-center gap-2">
                <Package size={18} /> أسطر التكاليف / المخزون ({preview.itemCosts?.length || 0})
              </div>
              <div className="max-h-[50vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-100">
                    <tr>
                      <th className="px-3 py-2 text-right">الحالة</th>
                      <th className="px-3 py-2 text-right">المخزن</th>
                      <th className="px-3 py-2 text-right">الصنف</th>
                      <th className="px-3 py-2 text-right">الكمية</th>
                      <th className="px-3 py-2 text-right">متوسط التكلفة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(preview.itemCosts || []).map((r: any) => (
                      <tr key={r.index} className={`border-t ${r.itemId && r.warehouseId ? "bg-emerald-50/50" : "bg-rose-50/60"}`}>
                        <td className="px-3 py-2 font-bold">{r.itemId && r.warehouseId ? <CheckCircle2 className="text-emerald-600" size={16} /> : <AlertTriangle className="text-rose-600" size={16} />}</td>
                        <td className="px-3 py-2 font-semibold">{r.warehouse}</td>
                        <td className="px-3 py-2 font-black">{r.name}</td>
                        <td className="px-3 py-2 font-bold">{r.quantity}</td>
                        <td className="px-3 py-2">{r.unitCost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {preview && (
            <div className="sticky bottom-0 z-20">
              <div className="rounded-2xl border-2 bg-white/95 backdrop-blur shadow-lg px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-base font-bold text-slate-700">
                  {KIND_LABEL[kind || ""] || kind} — راجع المطابقة ثم اعتمد
                </div>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 font-black h-12 px-7 text-base"
                  disabled={busy}
                  onClick={() => void commit()}
                >
                  {busy ? "جاري الاعتماد..." : "اعتماد واستيراد الجاهز"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </PermissionGate>
    </ERPLayout>
  );
}

function DocsTable({
  icon,
  title,
  rows,
  partyOptions,
  partyPlaceholder,
  onManualMatch,
}: {
  icon: React.ReactNode;
  title: string;
  rows: Array<{ key: number; docIndex: number; ready: boolean; partyUnmatched?: boolean; title: string; meta: string; detail: string }>;
  partyOptions?: Array<{ value: string; label: string }>;
  partyPlaceholder?: string;
  onManualMatch?: (docIndex: number, partyId: string, partyLabel: string) => void;
}) {
  return (
    <div className="rounded-2xl border-2 overflow-hidden bg-white">
      <div className="bg-slate-900 text-white px-4 py-3 font-black flex items-center gap-2">
        {icon} {title} ({rows.length})
      </div>
      <div className="max-h-[52vh] overflow-auto divide-y">
        {rows.map((r) => (
          <div key={r.key} className={`px-4 py-3 flex flex-wrap items-start justify-between gap-2 ${r.ready ? "bg-emerald-50/40" : "bg-rose-50/50"}`}>
            <div className="min-w-0 flex-1">
              <div className="text-base font-black text-slate-900">{r.title || "—"}</div>
              <div className="text-sm font-bold text-slate-600">{r.meta}</div>
              <div className="text-sm font-semibold text-slate-500 mt-0.5">{r.detail}</div>
              {r.partyUnmatched && onManualMatch && (
                <div className="mt-2 max-w-xs">
                  <SearchableSelect
                    options={partyOptions || []}
                    onChange={(v, opt) => onManualMatch(r.docIndex, v, opt.label.replace(/^.*—\s*/, ""))}
                    placeholder={partyPlaceholder || "اختر من الموجود..."}
                    searchPlaceholder="اكتب أول حروف الاسم..."
                    emptyText="مفيش نتايج"
                    className="h-9 text-sm bg-white"
                  />
                </div>
              )}
            </div>
            <span className={`text-sm font-extrabold px-2.5 py-1 rounded-md shrink-0 ${r.ready ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
              {r.ready ? "جاهز" : "ناقص"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
