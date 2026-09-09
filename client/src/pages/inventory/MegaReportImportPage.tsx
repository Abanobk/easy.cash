import ERPLayout from "@/components/ERPLayout";
import EntityPermissionGate from "@/components/EntityPermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useWarehouseOptions, useCustomerOptions, useSupplierOptions, useItemOptions } from "@/hooks/useEntityOptions";
import { tenantPath, useTenantSlug } from "@/lib/tenant";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Package,
  ShoppingCart,
  Factory,
  Boxes,
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
  bom: "تركيبة الأصناف (تقدير الكميات بالمكونات)",
};

export default function MegaReportImportPage() {
  const tenantSlug = useTenantSlug();
  const [, navigate] = useLocation();
  const warehouses = useWarehouseOptions();
  const customerOptions = useCustomerOptions();
  const supplierOptions = useSupplierOptions();
  const itemOptions = useItemOptions();
  const utils = trpc.useUtils();

  const previewMut = trpc.megaReportImport.preview.useMutation();
  const createItemsMut = trpc.megaReportImport.createMissingItems.useMutation();
  const createPartiesMut = trpc.megaReportImport.createMissingParties.useMutation();
  const commitSalesMut = trpc.megaReportImport.commitSales.useMutation();
  const commitPurchMut = trpc.megaReportImport.commitPurchases.useMutation();
  const commitProdMut = trpc.megaReportImport.commitProduction.useMutation();
  const commitCostsMut = trpc.megaReportImport.commitItemCosts.useMutation();
  const commitBomMut = trpc.megaReportImport.commitBom.useMutation();
  const syncUnitsMut = trpc.parity.inventory.beginningInventory.syncItemUnits.useMutation();

  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<any | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [importDate, setImportDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentType, setPaymentType] = useState<"credit" | "cash">("credit");
  const [busy, setBusy] = useState(false);
  /** أي زرّ شغّال دلوقتي — عشان يبهت ويلف عليه spinner والتاني يتقفل */
  const [runningMode, setRunningMode] = useState<"approve" | "draft" | null>(null);
  /** نتيجة آخر اعتماد/حفظ — طالما موجودة، أزرار الاعتماد تفضل مقفولة عشان الاستيراد ميتكررش */
  const [done, setDone] = useState<{ mode: "approve" | "draft"; imported: number; skipped: number; label: string } | null>(null);

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
    setDone(null);
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
    if (preview.kind === "bom") {
      const out: Array<{ clientKey: string; name: string; barcode?: string }> = [];
      for (const d of preview.bom || []) {
        if (d.productStatus !== "matched") {
          out.push({ clientKey: `b-${d.index}-product`, name: d.product, barcode: d.barcode || undefined });
        }
        for (const c of d.components || []) {
          if (c.status === "matched") continue;
          out.push({ clientKey: `b-${d.index}-c-${c.index}`, name: c.name, barcode: c.barcode || undefined });
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

  /** يطبّق الأصناف/الأطراف اللي اتعملت دلوقتي على الـ preview الحالي فورًا — من غير ما يحتاج المستخدم يرفع الملف تاني */
  const applyCreatedItems = (created: Array<{ clientKey: string; id: number; name: string }>) => {
    if (!created.length) return;
    const createdMap = new Map(created.map((c) => [c.clientKey, c]));
    setPreview((prev: any) => {
      if (!prev) return prev;
      if (prev.kind === "item_costs") {
        const itemCosts = (prev.itemCosts || []).map((r: any) => {
          const c = createdMap.get(`cost-${r.index}`);
          if (!c) return r;
          return { ...r, itemId: c.id, itemStatus: "matched" };
        });
        return { ...prev, itemCosts };
      }
      if (prev.kind === "sales" || prev.kind === "purchases") {
        const key = prev.kind;
        const idField = key === "sales" ? "customerId" : "supplierId";
        const docs = (prev[key] || []).map((d: any) => {
          const lines = (d.lines || []).map((l: any) => {
            const c = createdMap.get(`${d.index}-${l.index}`);
            if (!c) return l;
            return { ...l, itemId: c.id, itemName: c.name, status: "matched" };
          });
          const lineMatched = lines.filter((l: any) => l.status === "matched").length;
          return {
            ...d,
            lines,
            lineMatched,
            lineUnmatched: lines.length - lineMatched,
            ready: !!d[idField] && lines.length > 0 && lines.every((l: any) => l.status === "matched"),
          };
        });
        return { ...prev, [key]: docs };
      }
      return prev;
    });
  };

  const applyCreatedParties = (created: Array<{ clientKey: string; id: number; name: string }>) => {
    if (!created.length || !preview) return;
    const createdMap = new Map(created.map((c) => [c.clientKey, c]));
    setPreview((prev: any) => {
      if (!prev) return prev;
      const key = prev.kind === "sales" ? "sales" : "purchases";
      const idField = key === "sales" ? "customerId" : "supplierId";
      const nameField = key === "sales" ? "customer" : "supplier";
      const docs = (prev[key] || []).map((d: any) => {
        const c = createdMap.get(String(d.index));
        if (!c) return d;
        return {
          ...d,
          [idField]: c.id,
          [nameField]: c.name,
          partyStatus: "matched",
          ready: !!c.id && (d.lines?.length ?? 0) > 0 && (d.lines || []).every((l: any) => l.status === "matched"),
        };
      });
      return { ...prev, [key]: docs };
    });
  };

  /** نفس فكرة applyCreatedItems لكن بالمطابقة على الاسم مش clientKey — لازمة لـ BOM لأن نفس الخام بيتكرر في عشرات المنتجات */
  const applyCreatedItemsByName = (created: Array<{ id: number; name: string }>) => {
    if (!created.length) return;
    const byName = new Map(created.map((c) => [c.name.trim(), c]));
    setPreview((prev: any) => {
      if (!prev || prev.kind !== "bom") return prev;
      const docs = (prev.bom || []).map((d: any) => {
        let productId = d.productId;
        let productStatus = d.productStatus;
        if (productStatus !== "matched") {
          const c = byName.get(String(d.product || "").trim());
          if (c) { productId = c.id; productStatus = "matched"; }
        }
        const components = (d.components || []).map((comp: any) => {
          if (comp.status === "matched") return comp;
          const c = byName.get(String(comp.name || "").trim());
          if (!c) return comp;
          return { ...comp, itemId: c.id, status: "matched" };
        });
        const compMatched = components.filter((c: any) => c.status === "matched").length;
        return {
          ...d,
          productId,
          productStatus,
          components,
          compMatched,
          compUnmatched: components.length - compMatched,
          ready: productStatus === "matched" && components.length > 0 && components.every((c: any) => c.status === "matched"),
        };
      });
      return { ...prev, bom: docs };
    });
  };

  const addMissingItems = async () => {
    if (!missingItemRows.length) return;
    setBusy(true);
    try {
      if (preview?.kind === "bom") {
        // دمج الأصناف الناقصة بالاسم — نفس الخام (زي "طبة + غطاء احمر مقاس 42") بيظهر في عشرات المنتجات
        const byName = new Map<string, { clientKey: string; name: string; barcode?: string }>();
        for (const row of missingItemRows) {
          const key = row.name.trim();
          if (!key || byName.has(key)) continue;
          byName.set(key, row);
        }
        // مش بنبعت باركود ميجا كاش أصلًا — الأصناف الجديدة تاخد باركود رقمي تسلسلي من عندنا
        const rows = Array.from(byName.values()).map((r) => ({ clientKey: r.clientKey, name: r.name }));
        const res = await createItemsMut.mutateAsync({ rows, autoBarcode: true });
        toast.success(`تمت إضافة ${res.created.length} صنف بسيريل نمبر تلقائي جديد وتم ربطها في كل الأماكن اللي فيها`);
        if (res.errors?.length) toast.message(res.errors.slice(0, 2).join(" · "));
        await utils.items.list.invalidate();
        applyCreatedItemsByName(res.created);
      } else {
        const res = await createItemsMut.mutateAsync({ rows: missingItemRows });
        toast.success(`تمت إضافة ${res.created.length} صنف وتم ربطها تلقائيًا`);
        if (res.errors?.length) toast.message(res.errors.slice(0, 2).join(" · "));
        await utils.items.list.invalidate();
        applyCreatedItems(res.created);
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
      const kind = preview.kind === "purchases" ? "supplier" : "customer";
      const res = await createPartiesMut.mutateAsync({ kind, names: missingParties });
      toast.success(`تمت إضافة ${res.created.length} ${kind === "supplier" ? "مورد" : "عميل"} وتم ربطهم تلقائيًا`);
      if (res.errors?.length) toast.message(res.errors.slice(0, 2).join(" · "));
      if (kind === "customer") await utils.customers.list.invalidate();
      else await utils.suppliers.list.invalidate();
      applyCreatedParties(res.created);
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

  const commit = async (mode: "approve" | "draft" = "approve") => {
    if (!preview || busy || done) return;
    if (!warehouseId && preview.kind !== "production" && preview.kind !== "item_costs" && preview.kind !== "bom") {
      return toast.error("اختَر مخزن الاعتماد");
    }
    setBusy(true);
    setRunningMode(mode);
    let outcome: { imported: number; skipped: number; label: string } | null = null;
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
        outcome = { imported: res.imported, skipped: 0, label: `${res.imported} سطر مخزون` };
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
          mode,
          documents,
        });
        toast.success(mode === "draft"
          ? `تم حفظ ${res.imported} فاتورة مبيعات كمسودة — راجعها ثم اعتمدها`
          : `تم اعتماد وترحيل ${res.imported} فاتورة مبيعات`);
        if (res.skipped) toast.message(`تم تجاهل ${res.skipped} فاتورة مكرّرة (متسجّلة قبل كده)`);
        if (res.errors?.length) toast.message(res.errors.slice(0, 2).join(" · "));
        outcome = { imported: res.imported, skipped: res.skipped ?? 0, label: `${res.imported} فاتورة مبيعات` };
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
          mode,
          documents,
        });
        toast.success(mode === "draft"
          ? `تم حفظ ${res.imported} فاتورة مشتريات كمسودة — راجعها ثم اعتمدها`
          : `تم اعتماد وترحيل ${res.imported} فاتورة مشتريات`);
        if (res.skipped) toast.message(`تم تجاهل ${res.skipped} فاتورة مكرّرة (متسجّلة قبل كده)`);
        if (res.errors?.length) toast.message(res.errors.slice(0, 2).join(" · "));
        outcome = { imported: res.imported, skipped: res.skipped ?? 0, label: `${res.imported} فاتورة مشتريات` };
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
        outcome = { imported: res.imported, skipped: 0, label: `${res.imported} أمر إنتاج` };
      } else if (preview.kind === "bom") {
        const documents = (preview.bom || [])
          .filter((d: any) => d.ready)
          .map((d: any) => ({
            productId: Number(d.productId),
            lines: (d.components || [])
              .map((c: any) => ({ materialItemId: Number(c.itemId), quantityPerUnit: String(c.requiredQty || "0") }))
              .filter((l: any) => Number(l.quantityPerUnit) > 0),
          }))
          .filter((d: any) => d.lines.length > 0);
        if (!documents.length) return toast.error("لا توجد تركيبات جاهزة — طابق الأصناف الناقصة أولاً");
        const res = await commitBomMut.mutateAsync({ documents });
        toast.success(`تم استيراد تركيبة ${res.imported} صنف`);
        if (res.errors?.length) toast.message(res.errors.slice(0, 2).join(" · "));
        outcome = { imported: res.imported, skipped: 0, label: `تركيبة ${res.imported} صنف` };
      }
      if (outcome) setDone({ mode, ...outcome });
    } catch (e: any) {
      toast.error(e?.message || "فشل الاعتماد");
    } finally {
      setBusy(false);
      setRunningMode(null);
    }
  };

  /** إعادة الشاشة لوضع البداية بعد اعتماد/حفظ ناجح — لرفع ملف جديد */
  const resetImport = () => {
    setPreview(null);
    setFileName("");
    setDone(null);
  };

  /** ملخص حي — بيتحدث فورًا مع أي ربط يدوي، مش بيفضل واقف على أول نتيجة من السيرفر */
  const summary = useMemo(() => {
    if (!preview) return undefined;
    if (preview.kind === "sales" || preview.kind === "purchases") {
      const docs = (preview.kind === "sales" ? preview.sales : preview.purchases) || [];
      const lines = docs.reduce((s: number, d: any) => s + (d.lines?.length || 0), 0);
      const matchedItems = docs.reduce((s: number, d: any) => s + (d.lines || []).filter((l: any) => l.status === "matched").length, 0);
      return {
        documents: docs.length,
        lines,
        matchedItems,
        unmatchedItems: lines - matchedItems,
        matchedParties: docs.filter((d: any) => d.partyStatus === "matched").length,
        unmatchedParties: docs.filter((d: any) => d.partyStatus !== "matched").length,
        readyDocs: docs.filter((d: any) => d.ready).length,
      };
    }
    if (preview.kind === "item_costs") {
      const rows = preview.itemCosts || [];
      return {
        documents: rows.length,
        lines: rows.length,
        matchedItems: rows.filter((r: any) => r.itemStatus === "matched").length,
        unmatchedItems: rows.filter((r: any) => r.itemStatus !== "matched").length,
        matchedParties: rows.filter((r: any) => r.warehouseStatus === "matched").length,
        unmatchedParties: rows.filter((r: any) => r.warehouseStatus !== "matched").length,
        readyDocs: rows.filter((r: any) => r.itemStatus === "matched" && r.warehouseStatus === "matched").length,
      };
    }
    if (preview.kind === "bom") {
      const docs = preview.bom || [];
      const lines = docs.reduce((s: number, d: any) => s + (d.components?.length || 0), 0);
      const compMatched = docs.reduce((s: number, d: any) => s + (d.components || []).filter((c: any) => c.status === "matched").length, 0);
      return {
        documents: docs.length,
        lines,
        matchedItems: compMatched + docs.filter((d: any) => d.productStatus === "matched").length,
        unmatchedItems: (lines - compMatched) + docs.filter((d: any) => d.productStatus !== "matched").length,
        matchedParties: docs.filter((d: any) => d.productStatus === "matched").length,
        unmatchedParties: docs.filter((d: any) => d.productStatus !== "matched").length,
        readyDocs: docs.filter((d: any) => d.ready).length,
      };
    }
    return preview.summary;
  }, [preview]);

  /** أصناف ناقصة بلا تكرار — نفس الاسم يتربط مرة واحدة ويتطبّق على كل الأسطر اللي بنفس الاسم */
  const uniqueMissingItems = useMemo(() => {
    if (!preview || (preview.kind !== "sales" && preview.kind !== "purchases" && preview.kind !== "bom")) {
      return [] as Array<{ name: string; barcode?: string; count: number }>;
    }
    const map = new Map<string, { name: string; barcode?: string; count: number }>();
    for (const row of missingItemRows) {
      const key = row.name.trim();
      if (!key) continue;
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else map.set(key, { name: key, barcode: row.barcode, count: 1 });
    }
    return Array.from(map.values());
  }, [missingItemRows, preview]);

  /** ربط يدوي لصنف: المستخدم متأكد إنه موجود، بس اسمه مختلف عن المسجل عندنا */
  const manualMatchItem = (name: string, itemId: string, itemLabel: string) => {
    if (!preview) return;
    const id = Number(itemId);
    if (!id) return;
    if (preview.kind === "bom") {
      setPreview((prev: any) => {
        if (!prev) return prev;
        const docs = (prev.bom || []).map((d: any) => {
          let productId = d.productId;
          let productStatus = d.productStatus;
          if (productStatus !== "matched" && String(d.product || "").trim() === name) {
            productId = id;
            productStatus = "matched";
          }
          const components = (d.components || []).map((c: any) => {
            if (c.status === "matched" || String(c.name || "").trim() !== name) return c;
            return { ...c, itemId: id, status: "matched" };
          });
          const compMatched = components.filter((c: any) => c.status === "matched").length;
          return {
            ...d,
            productId,
            productStatus,
            components,
            compMatched,
            compUnmatched: components.length - compMatched,
            ready: productStatus === "matched" && components.length > 0 && components.every((c: any) => c.status === "matched"),
          };
        });
        return { ...prev, bom: docs };
      });
      toast.success("تم ربط الصنف في كل الأماكن اللي فيها");
      return;
    }
    setPreview((prev: any) => {
      if (!prev) return prev;
      const key = prev.kind === "sales" ? "sales" : "purchases";
      const docs = (prev[key] || []).map((d: any) => {
        const lines = (d.lines || []).map((l: any) => {
          if (l.status === "matched" || l.name.trim() !== name) return l;
          return { ...l, itemId: id, itemName: itemLabel, status: "matched" };
        });
        const lineMatched = lines.filter((l: any) => l.status === "matched").length;
        return {
          ...d,
          lines,
          lineMatched,
          lineUnmatched: lines.length - lineMatched,
          ready: !!d[prev.kind === "sales" ? "customerId" : "supplierId"] && lines.length > 0 && lines.every((l: any) => l.status === "matched"),
        };
      });
      return { ...prev, [key]: docs };
    });
    toast.success("تم ربط الصنف في كل الفواتير اللي فيها");
  };

  return (
    <ERPLayout title="استيراد تقارير Excel">
      <EntityPermissionGate moduleKey="inventory" entityKey="beginningInventory" action="add" fallback={
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
              يفهم تصدير التقارير: تكاليف الأصناف · البيع · الشراء · أوامر الإنتاج · تركيبة الأصناف (BOM)
            </div>
          </div>

          <div className="rounded-2xl border bg-gradient-to-l from-sky-50 to-white p-5 space-y-2">
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="text-sky-700" size={26} />
              استيراد سريع من تقارير Excel
            </h1>
            <p className="text-base text-slate-600 font-semibold max-w-4xl leading-relaxed">
              ارفع ملفات Excel اللي بتصدّرها من شاشات التقارير في النظام القديم. النظام يكتشف النوع، يطابق الأصناف بالسيريل نمبر/الاسم والعملاء/الموردين/المخازن، ويخلّيك تضيف الناقص ثم تعتمد.
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
                  <div className="text-sm font-semibold text-slate-600">xlsx من تقارير النظام القديم — بيع / شراء / إنتاج / تكاليف / تركيبة أصناف</div>
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

          {uniqueMissingItems.length > 0 && (
            <div className="rounded-2xl border-2 overflow-hidden bg-white">
              <div className="bg-rose-700 text-white px-4 py-3 font-black flex items-center gap-2">
                <Package size={18} /> الأصناف الناقصة — راجعها قبل الإضافة ({uniqueMissingItems.length})
              </div>
              <p className="px-4 pt-3 text-sm font-semibold text-slate-600">
                لو الصنف موجود عندك بالفعل بس باسم مختلف شوية، اربطه من هنا بدل ما تخليه يتعمل صنف جديد مكرر.
              </p>
              <div className="max-h-[50vh] overflow-auto divide-y p-4 pt-3 space-y-3">
                {uniqueMissingItems.map((mi) => (
                  <div key={mi.name} className="flex flex-wrap items-center gap-3 pb-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-black text-slate-900">{mi.name}</div>
                      <div className="text-xs font-semibold text-slate-500">
                        {mi.barcode ? `سيريل نمبر ${mi.barcode} · ` : ""}ظهر في {mi.count} سطر
                      </div>
                    </div>
                    <div className="w-full sm:w-72">
                      <SearchableSelect
                        options={itemOptions}
                        onChange={(v, opt) => manualMatchItem(mi.name, v, opt.label.replace(/^.*—\s*/, ""))}
                        placeholder="اربط بصنف موجود..."
                        searchPlaceholder="اكتب أول حروف اسم الصنف..."
                        emptyText="مفيش نتايج"
                        className="h-9 text-sm bg-white"
                      />
                    </div>
                  </div>
                ))}
              </div>
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
                  {" "}— هيتربطوا فورًا بعد الإضافة، من غير ما تحتاج ترفع الملف تاني.
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
                meta: `سيريل نمبر ${d.barcode || "—"} · كمية ${d.qty} · ${d.status}`,
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
          {kind === "bom" && (
            <div className="rounded-2xl border-2 overflow-hidden bg-white">
              <div className="bg-slate-900 text-white px-4 py-3 font-black flex items-center gap-2">
                <Boxes size={18} /> تركيبات الأصناف — خام لكل صنف تام ({preview.bom?.length || 0})
              </div>
              <p className="px-4 pt-3 text-sm font-semibold text-slate-600">
                كل بلوك هو منتج تام ومكوناته الخام بالكمية المطلوبة لإنتاج وحدة واحدة — الاعتماد بيستبدل خلطة كل منتج بالكامل بالجديدة.
              </p>
              <div className="max-h-[60vh] overflow-auto divide-y p-4 pt-3 space-y-3">
                {(preview.bom || []).map((d: any) => (
                  <div key={d.index} className={`rounded-xl border p-3 ${d.ready ? "bg-emerald-50/40 border-emerald-200" : "bg-rose-50/50 border-rose-200"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-base font-black text-slate-900">{d.product || "—"}</div>
                        <div className="text-xs font-semibold text-slate-500">
                          سيريل نمبر {d.barcode || "—"} · {d.compMatched}/{d.components.length} مكونات مطابقة
                        </div>
                      </div>
                      <span className={`text-xs font-extrabold px-2.5 py-1 rounded-md shrink-0 ${d.ready ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
                        {d.ready ? "جاهز" : "ناقص"}
                      </span>
                    </div>
                    {d.productStatus !== "matched" && (
                      <div className="mt-2 max-w-xs">
                        <SearchableSelect
                          options={itemOptions}
                          onChange={(v, opt) => manualMatchItem(d.product, v, opt.label.replace(/^.*—\s*/, ""))}
                          placeholder="اربط المنتج التام بصنف موجود..."
                          searchPlaceholder="اكتب أول حروف اسم الصنف..."
                          emptyText="مفيش نتايج"
                          className="h-9 text-sm bg-white"
                        />
                      </div>
                    )}
                    <table className="w-full text-sm mt-2">
                      <thead>
                        <tr className="text-slate-500">
                          <th className="px-2 py-1 text-right font-bold">الحالة</th>
                          <th className="px-2 py-1 text-right font-bold">الخام</th>
                          <th className="px-2 py-1 text-right font-bold">الوحدة</th>
                          <th className="px-2 py-1 text-right font-bold">الكمية / وحدة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(d.components || []).map((c: any) => (
                          <tr key={c.index} className="border-t">
                            <td className="px-2 py-1">{c.status === "matched" ? <CheckCircle2 className="text-emerald-600" size={15} /> : <AlertTriangle className="text-rose-600" size={15} />}</td>
                            <td className="px-2 py-1 font-bold">{c.name}</td>
                            <td className="px-2 py-1">{c.unit}</td>
                            <td className="px-2 py-1 font-semibold">{c.requiredQty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          )}

          {preview && !done && (
            <div className="sticky bottom-0 z-20">
              <div className="rounded-2xl border-2 bg-white/95 backdrop-blur shadow-lg px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-base font-bold text-slate-700">
                  {(kind === "sales" || kind === "purchases")
                    ? `${KIND_LABEL[kind || ""] || kind} — احفظ كمسودة للمراجعة، أو اعتمد وترحّل على طول`
                    : `${KIND_LABEL[kind || ""] || kind} — راجع المطابقة ثم اعتمد`}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(kind === "sales" || kind === "purchases") && (
                    <Button
                      variant="outline"
                      className="font-black h-12 px-6 text-base border-2 border-slate-300 disabled:opacity-50"
                      disabled={busy}
                      onClick={() => void commit("draft")}
                    >
                      {runningMode === "draft"
                        ? <span className="inline-flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> جاري الحفظ...</span>
                        : "حفظ كمسودة للمراجعة"}
                    </Button>
                  )}
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 font-black h-12 px-7 text-base disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void commit("approve")}
                  >
                    {runningMode === "approve"
                      ? <span className="inline-flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> جاري الاعتماد...</span>
                      : ((kind === "sales" || kind === "purchases") ? "اعتماد وترحيل" : "اعتماد واستيراد الجاهز")}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {done && (
            <div className="sticky bottom-0 z-20">
              <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/95 backdrop-blur shadow-lg px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={26} />
                  <div>
                    <div className="text-base font-black text-emerald-900">
                      {done.mode === "draft" ? `تم حفظ ${done.label} كمسودة` : `تم اعتماد وترحيل ${done.label}`}
                    </div>
                    <div className="text-sm font-semibold text-emerald-800">
                      {done.mode === "draft"
                        ? "راجعها من شاشة الفواتير واضغط «حفظ واعتماد» لما تكون جاهزة."
                        : "اترحّلت في الحسابات والمخزون."}
                      {done.skipped ? ` · تم تجاهل ${done.skipped} فاتورة مكرّرة.` : ""}
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="font-black h-11 px-6 border-2 border-emerald-400 text-emerald-800 hover:bg-emerald-100"
                  onClick={resetImport}
                >
                  <span className="inline-flex items-center gap-2"><Upload className="h-4 w-4" /> استيراد ملف جديد</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      </EntityPermissionGate>
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
