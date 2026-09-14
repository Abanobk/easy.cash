import { useState, useEffect, useMemo } from "react";
import ERPLayout from "@/components/ERPLayout";
import { DataTable, statusBadge } from "@/components/DataTable";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Trash2, Eye, ArrowRight, Banknote, ScanLine, CheckCircle2, Pencil, Undo2 } from "lucide-react";
import EntityPermissionGate from "@/components/EntityPermissionGate";

import { useLocation, useSearch } from "wouter";
import { tenantPath, useTenantSlug } from "@/lib/tenant";
import { useMegaCreateRoute } from "@/hooks/useMegaCreateRoute";
import { InvoicePaymentDialog } from "@/components/InvoicePaymentDialog";
import { isForeignCurrency, toBaseAmount, formatInvoiceListTotal } from "@shared/currency";
import { SerialNumberPicker } from "@/components/SerialNumberPicker";
import { InvoicePrintButton } from "@/components/InvoicePrintButton";
import { BatchPicker } from "@/components/BatchPicker";
import { ItemSearchSelect } from "@/components/ItemSearchSelect";
import { QuickAddDialog } from "@/components/invoices/QuickAddDialog";
import { InvoiceTaxList, type InvoiceTaxLine } from "@/components/invoices/InvoiceTaxList";
import { InvoiceExpenseList, type InvoiceExpenseLine } from "@/components/invoices/InvoiceExpenseList";
import { PaymentSettlementBlock, type Settlement } from "@/components/invoices/PaymentSettlementBlock";
import { findItemByScan } from "@/lib/barcode";
import { printInvoiceQuick, printWarehouseNote } from "@/lib/print-invoice-quick";
import { Copy } from "lucide-react";
import { toDateStr } from "@/lib/date";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

interface InvoiceItem {
  itemId: number;
  itemName: string;
  itemUnit: string;
  quantity: string;
  price: string;
  discount: string;
  tax: string;
  tax2: string;
  tax3: string;
  total: string;
  serialNumbers: string;
  batchId?: number;
  warehouseId?: number;
  lastPriceHint?: { price: number; date: string; number: string } | null;
}

const emptyForm = {
  customerId: undefined as number | undefined,
  date: new Date().toISOString().split("T")[0],
  dueDate: "",
  warehouseId: undefined as number | undefined,
  branchId: undefined as number | undefined,
  costCenterId: undefined as number | undefined,
  paymentType: "cash" as "cash" | "credit",
  currencyCode: "EGP",
  exchangeRate: "1",
  additions: "0",
  notes: "",
};

const emptySettlement: Settlement = { cashAmount: "0", bankAmount: "0", bankAccountId: undefined };

type ActiveOffer = {
  id: number;
  name: string;
  itemId?: number | null;
  categoryId?: number | null;
  discountPercent?: string | null;
};

function offerScopeLabel(offer: ActiveOffer) {
  if (offer.itemId) return "صنف";
  if (offer.categoryId) return "فئة";
  return "عام";
}

function offerMatchesRow(
  offer: ActiveOffer,
  itemId: number,
  categoryId?: number | null,
) {
  const pct = Number(offer.discountPercent) || 0;
  if (pct <= 0) return false;
  if (offer.itemId != null && Number(offer.itemId) === itemId) return true;
  if (offer.categoryId != null && categoryId != null && Number(offer.categoryId) === categoryId) return true;
  if (offer.itemId == null && offer.categoryId == null) return true;
  return false;
}

function bestOfferDiscount(
  itemId: number,
  categoryId: number | null | undefined,
  offers: ActiveOffer[] | undefined,
) {
  if (!offers?.length) return 0;
  let best = 0;
  for (const offer of offers) {
    if (!offerMatchesRow(offer, itemId, categoryId)) continue;
    best = Math.max(best, Number(offer.discountPercent) || 0);
  }
  return best;
}

function recalcLineTotal(row: InvoiceItem) {
  const q = Number(row.quantity) || 0;
  const p = Number(row.price) || 0;
  const d = Number(row.discount) || 0;
  const t = (Number(row.tax) || 0) + (Number(row.tax2) || 0) + (Number(row.tax3) || 0);
  const subtotal = q * p * (1 - d / 100);
  return { ...row, total: (subtotal * (1 + t / 100)).toFixed(2) };
}

export default function SalesInvoices() {
  const [, navigate] = useLocation();
  const tenantSlug = useTenantSlug();
  const searchString = useSearch();
  const isCashMode = useMemo(() => new URLSearchParams(searchString).get("mode") === "cash", [searchString]);
  const { isNewRoute, goToList, goToCreate } = useMegaCreateRoute("/sales/invoices");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [showForm, setShowForm] = useState(isNewRoute);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [invoiceTaxes, setInvoiceTaxes] = useState<InvoiceTaxLine[]>([]);
  const [invoiceExpenses, setInvoiceExpenses] = useState<InvoiceExpenseLine[]>([]);
  const [settlement, setSettlement] = useState<Settlement>(emptySettlement);
  const [printAfterSave, setPrintAfterSave] = useState(false);
  const [printAfterApprove, setPrintAfterApprove] = useState(false);
  const [printNote, setPrintNote] = useState(false);
  const [lastApproveNow, setLastApproveNow] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [quickAdd, setQuickAdd] = useState<{ kind: "item" | "customer"; rowIdx?: number } | null>(null);
  const [paymentRow, setPaymentRow] = useState<any | null>(null);
  const [duplicating, setDuplicating] = useState(false);

  useEffect(() => {
    if (isCashMode) {
      setForm((f) => ({ ...f, paymentType: "cash" }));
    }
  }, [isCashMode]);

  useEffect(() => {
    if (isNewRoute) setShowForm(true);
  }, [isNewRoute]);

  const pageTitle = isCashMode ? "فواتير المبيعات النقدية" : "فواتير المبيعات";
  const newInvoiceLabel = isCashMode ? "فاتورة نقدية جديدة" : "فاتورة جديدة";

  const utils = trpc.useUtils();
  useEffect(() => setPage(1), [debouncedSearch]);
  const { data, isLoading, refetch } = trpc.sales.invoices.list.useQuery({
    page,
    limit: 20,
    search: debouncedSearch || undefined,
    paymentType: isCashMode ? "cash" : undefined,
  });
  const { data: customers } = trpc.customers.list.useQuery({ page: 1, limit: 200 });
  const { data: allItems } = trpc.items.all.useQuery({ forSalesInvoice: true });
  const { data: warehouses } = trpc.warehouses.list.useQuery();
  const { data: branchList } = trpc.settings.branches.list.useQuery();
  const { data: costCentersList } = trpc.costCenters.list.useQuery();
  const { data: activeOffers } = trpc.parity.inventory.offers.active.useQuery(undefined, { enabled: showForm });
  const { data: exchangeRates } = trpc.parity.settings.exchangeRates.list.useQuery(undefined, { enabled: showForm });
  const createMut = trpc.sales.invoices.create.useMutation({
    onSuccess: (res) => {
      toast.success(res.pendingApproval ? `تم الحفظ ${res.number} — بانتظار الاعتماد` : `تم إنشاء الفاتورة ${res.number}`);
      const shouldPrint = !res.pendingApproval && (lastApproveNow ? printAfterApprove : printAfterSave);
      if (shouldPrint) firePrint(res.number);
      if (printNote && !res.pendingApproval) fireWarehouseNote(res.number);
      refetch();
      closeForm();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.sales.invoices.update.useMutation({
    onSuccess: (res) => {
      toast.success(lastApproveNow ? `تم حفظ واعتماد الفاتورة ${res.number}` : "تم حفظ التعديلات");
      refetch();
      closeForm();
    },
    onError: (e) => toast.error(e.message),
  });
  const unapproveMut = trpc.sales.invoices.unapprove.useMutation({
    onSuccess: () => { toast.success("تم فك الاعتماد — الفاتورة الآن مسودة قابلة للتعديل"); refetch(); },
    onError: (e) => {
      // لما يكون في تحصيل مسجّل مانع فك الاعتماد، وجّه المستخدم فعلياً لشاشة المعاملات
      // بدل ما يقرا رسالة ويدوّر بنفسه — نفس المكان اللي رسالة السيرفر بتحيل عليه بالظبط.
      if (e.message.includes("راجعه أولاً من")) {
        const isBank = e.message.includes("بنكية");
        toast.error(e.message, {
          action: {
            label: "روح هناك",
            onClick: () => navigate(tenantPath(tenantSlug, isBank ? "/bank/transactions" : "/cash/receive-customer")),
          },
        });
        return;
      }
      toast.error(e.message);
    },
  });
  const payMut = trpc.sales.invoices.recordPayment.useMutation({
    onSuccess: (res) => {
      toast.success(`تم التحصيل — إيصال ${res.cashNumber}`);
      refetch();
      setPaymentRow(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setEditId(null);
    setForm({ ...emptyForm, paymentType: "cash" });
    setInvoiceItems([]);
    setInvoiceTaxes([]); setInvoiceExpenses([]); setSettlement(emptySettlement);
    setPrintAfterSave(false); setPrintAfterApprove(false); setPrintNote(false); setBarcode("");
  };

  /** فتح فاتورة مسودة (بعد فك اعتماد أو معلقة أصلاً) للتعديل — بنعيد استخدام نفس فورم الإنشاء الغني */
  const openEdit = async (invoiceId: number) => {
    try {
      const inv = await utils.sales.invoices.byId.fetch(invoiceId);
      setEditId(invoiceId);
      setForm({
        customerId: inv.customerId,
        date: toDateStr(inv.date),
        dueDate: inv.dueDate ? toDateStr(inv.dueDate) : "",
        warehouseId: inv.warehouseId ?? undefined,
        branchId: inv.branchId ?? undefined,
        costCenterId: inv.costCenterId ?? undefined,
        paymentType: (inv.paymentType as "cash" | "credit") || "cash",
        currencyCode: inv.currencyCode || "EGP",
        exchangeRate: inv.exchangeRate?.toString() || "1",
        additions: inv.additions != null ? String(inv.additions) : "0",
        notes: inv.notes || "",
      });
      setSettlement({
        cashAmount: inv.cashAmount != null ? String(inv.cashAmount) : "0",
        bankAmount: inv.bankAmount != null ? String(inv.bankAmount) : "0",
        bankAccountId: inv.bankAccountId ?? undefined,
      });
      setInvoiceTaxes((inv.taxes || []).map((t: any) => ({ taxId: t.taxId ?? undefined, name: t.name ?? undefined, rate: t.rate != null ? String(t.rate) : undefined, amount: String(t.amount), glAccountId: t.glAccountId ?? undefined })));
      setInvoiceExpenses((inv.expenses || []).map((e: any) => ({ currencyCode: e.currencyCode || "EGP", exchangeRate: e.exchangeRate != null ? String(e.exchangeRate) : "1", amount: String(e.amount), creditAccountId: e.creditAccountId, notes: e.notes || undefined })));
      setInvoiceItems(inv.items.map((i: any) => ({
        itemId: i.itemId,
        itemName: i.itemName || "",
        itemUnit: i.itemUnit || "",
        quantity: i.quantity?.toString() || "1",
        price: i.price?.toString() || "0",
        discount: i.discount?.toString() || "0",
        tax: i.tax?.toString() || "0",
        tax2: i.tax2?.toString() || "0",
        tax3: i.tax3?.toString() || "0",
        total: i.total?.toString() || "0",
        serialNumbers: "",
        batchId: i.batchId ?? undefined,
        warehouseId: i.warehouseId ?? undefined,
      })));
      setShowForm(true);
    } catch (e: any) {
      toast.error(e?.message || "فشل فتح الفاتورة للتعديل");
    }
  };

  const firePrint = (number: string) => {
    printInvoiceQuick({
      title: "فاتورة مبيعات", number, date: form.date, partyLabel: "العميل",
      partyName: customers?.rows.find((c) => c.id === form.customerId)?.name || "",
      lines: invoiceItems.map((i) => ({ name: i.itemName, quantity: Number(i.quantity), unit: i.itemUnit, price: Number(i.price), total: Number(i.total) })),
      subtotal, discount: 0, tax: taxTotal, total, paymentType: form.paymentType,
    });
  };

  const fireWarehouseNote = (number: string) => {
    printWarehouseNote({
      title: "إذن صرف مخزن", number, date: form.date, partyLabel: "العميل",
      partyName: customers?.rows.find((c) => c.id === form.customerId)?.name || "",
      lines: invoiceItems.map((i) => ({
        name: i.itemName, quantity: Number(i.quantity), unit: i.itemUnit,
        warehouseName: warehouses?.find((w) => w.id === (i.warehouseId ?? form.warehouseId))?.name,
      })),
    });
  };

  const closeForm = () => {
    setShowForm(false);
    resetForm();
    if (isNewRoute) goToList();
  };

  const openNewForm = () => {
    if (isNewRoute) {
      resetForm();
      setShowForm(true);
      return;
    }
    goToCreate(isCashMode ? "mode=cash" : undefined);
  };

  /** نسخ فاتورة موجودة كنقطة بداية لفاتورة جديدة — زي "نسخ" في ميجا كاش (نفس فكرة فواتير الشراء) */
  const handleDuplicate = async (invoiceId: number) => {
    setDuplicating(true);
    try {
      const inv = await utils.sales.invoices.byId.fetch(invoiceId);
      setForm({
        customerId: inv.customerId,
        date: new Date().toISOString().split("T")[0],
        dueDate: "",
        warehouseId: inv.warehouseId ?? undefined,
        branchId: inv.branchId ?? undefined,
        costCenterId: inv.costCenterId ?? undefined,
        paymentType: isCashMode ? "cash" : ((inv.paymentType as "cash" | "credit") || "cash"),
        currencyCode: inv.currencyCode || "EGP",
        exchangeRate: inv.exchangeRate?.toString() || "1",
        additions: inv.additions != null ? String(inv.additions) : "0",
        notes: `نسخة من الفاتورة ${inv.number}`,
      });
      setInvoiceItems(inv.items.map((i) => ({
        itemId: i.itemId,
        itemName: i.itemName || "",
        itemUnit: i.itemUnit || "",
        quantity: i.quantity?.toString() || "1",
        price: i.price?.toString() || "0",
        discount: i.discount?.toString() || "0",
        tax: i.tax?.toString() || "0",
        tax2: "0",
        tax3: "0",
        total: i.total?.toString() || "0",
        serialNumbers: "",
        batchId: undefined,
        warehouseId: undefined,
      })));
      setShowForm(true);
      toast.success(`تم نسخ الفاتورة ${inv.number} — راجع البيانات واحفظ`);
    } catch (e: any) {
      toast.error(e?.message || "فشل نسخ الفاتورة");
    } finally {
      setDuplicating(false);
    }
  };

  const addItem = () => {
    setInvoiceItems((prev) => [...prev, { itemId: 0, itemName: "", itemUnit: "", quantity: "1", price: "0", discount: "0", tax: "0", tax2: "0", tax3: "0", total: "0", serialNumbers: "", batchId: undefined, warehouseId: undefined }]);
  };

  /**
   * بعد اختيار الصنف بنملأ السعر مبدئياً بسعر البيع الافتراضي من بطاقة الصنف،
   * وبعدين لما يوصل "آخر سعر بيع لنفس العميل" بنستبدله بيه تلقائياً — بس لو
   * المستخدم لسه ما عدلش السعر يدوياً (يعني السعر لسه زي ما اتحط افتراضياً)،
   * عشان مانمسحش تعديل المستخدم. السعر يفضل قابل للتعديل بعد كده زي أي سطر عادي.
   */
  const applyItemHint = async (idx: number, itemId: number, defaultPrice: string) => {
    if (!form.customerId || !itemId) return;
    try {
      const hint = await utils.sales.invoices.lastPriceToCustomer.fetch({ customerId: form.customerId, itemId });
      setInvoiceItems((prev) => {
        const next = [...prev];
        const row = next[idx];
        if (!row || row.itemId !== itemId) return prev; // الصنف اتغيّر في السطر ده قبل ما الطلب يرجع
        const hintObj = hint ? { price: Number(hint.price), date: toDateStr(hint.date), number: hint.number } : null;
        const priceUntouched = row.price === defaultPrice;
        next[idx] = recalcLineTotal({
          ...row,
          lastPriceHint: hintObj,
          price: hintObj && priceUntouched ? String(hintObj.price) : row.price,
        });
        return next;
      });
    } catch { /* بيانات إضافية اختيارية — تجاهل الفشل */ }
  };

  const updateItem = (idx: number, field: keyof InvoiceItem, value: string) => {
    setInvoiceItems((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: (field === "itemId" ? Number(value) : value) as any };
      if (field === "itemId") {
        const item = allItems?.find((i) => i.id === Number(value));
        if (item) {
          updated[idx].itemName = item.name;
          updated[idx].itemUnit = item.unit || "";
          updated[idx].price = item.salePrice?.toString() || "0";
          updated[idx].tax = item.taxRate?.toString() || "0";
          updated[idx].tax2 = (item as any).taxRate2 != null ? String((item as any).taxRate2) : "0";
          updated[idx].tax3 = (item as any).taxRate3 != null ? String((item as any).taxRate3) : "0";
          const offerPct = bestOfferDiscount(Number(value), item.categoryId, activeOffers as ActiveOffer[] | undefined);
          if (offerPct > 0) updated[idx].discount = String(offerPct);
        }
        void applyItemHint(idx, Number(value), updated[idx].price);
      }
      updated[idx] = recalcLineTotal(updated[idx]);
      return updated;
    });
  };

  const removeItem = (idx: number) => setInvoiceItems((prev) => prev.filter((_, i) => i !== idx));

  const onScanBarcode = () => {
    if (!barcode.trim() || !allItems) return;
    const hit = findItemByScan(allItems as any, barcode);
    if (!hit) { toast.error("لم يتم العثور على صنف بهذا السيريل نمبر"); return; }
    const idx = invoiceItems.findIndex((i) => !i.itemId);
    if (idx >= 0) updateItem(idx, "itemId", String(hit.id));
    else {
      addItem();
      setTimeout(() => updateItem(invoiceItems.length, "itemId", String(hit.id)), 0);
    }
    setBarcode("");
  };

  const subtotal = invoiceItems.reduce((s, i) => s + Number(i.quantity) * Number(i.price) * (1 - Number(i.discount) / 100), 0);
  const taxTotal = invoiceItems.reduce((s, i) => s + Number(i.total) - Number(i.quantity) * Number(i.price) * (1 - Number(i.discount) / 100), 0)
    + invoiceTaxes.reduce((s, t) => s + Number(t.amount), 0);
  const additionsAmt = Number(form.additions) || 0;
  const total = (invoiceItems.reduce((s, i) => s + Number(i.total), 0) + invoiceTaxes.reduce((s, t) => s + Number(t.amount), 0)) + additionsAmt;
  const foreign = isForeignCurrency(form.currencyCode);
  const amountLabel = foreign ? form.currencyCode : "ج.م";
  const baseTotal = toBaseAmount(total, form.currencyCode, form.exchangeRate);
  const itemTracksSerial = (itemId: number) => Boolean(allItems?.find((i) => i.id === itemId)?.trackSerial);
  const selectedCustomerBalance = customers?.rows.find((c) => c.id === form.customerId)?.balance;

  const applyScopedOffer = (offer: ActiveOffer) => {
    const pct = Number(offer.discountPercent) || 0;
    if (pct <= 0) return;
    let applied = 0;
    setInvoiceItems((prev) =>
      prev.map((row) => {
        if (!row.itemId) return row;
        const item = allItems?.find((i) => i.id === row.itemId);
        if (!offerMatchesRow(offer, row.itemId, item?.categoryId)) return row;
        applied += 1;
        return recalcLineTotal({ ...row, discount: String(pct) });
      }),
    );
    if (applied === 0) {
      toast.error("لا توجد أصناف مطابقة لهذا العرض");
      return;
    }
    const scope = offerScopeLabel(offer);
    toast.success(`تم تطبيق خصم ${pct}% (${scope}) على ${applied} صنف`);
  };

  const handleSubmit = (approveNow: boolean) => {
    setLastApproveNow(approveNow);
    if (!form.customerId) { toast.error("يجب اختيار العميل"); return; }
    if (invoiceItems.length === 0) { toast.error("يجب إضافة صنف واحد على الأقل"); return; }
    if (invoiceItems.some((i) => !i.itemId)) { toast.error("يجب اختيار الصنف لجميع الأسطر"); return; }
    const rate = Number(form.exchangeRate) || 1;
    const payload = {
      customerId: form.customerId!,
      date: form.date,
      dueDate: form.dueDate || undefined,
      warehouseId: form.warehouseId,
      branchId: form.branchId,
      costCenterId: form.costCenterId,
      paymentType: form.paymentType,
      approveNow,
      cashAmount: form.paymentType === "cash" ? undefined : settlement.cashAmount,
      bankAmount: form.paymentType === "cash" ? undefined : settlement.bankAmount,
      bankAccountId: settlement.bankAccountId,
      currencyCode: form.currencyCode,
      exchangeRate: form.exchangeRate,
      foreignTotal: foreign ? total.toFixed(2) : undefined,
      subtotal: toBaseAmount(subtotal, form.currencyCode, rate).toFixed(2),
      discount: "0",
      tax: toBaseAmount(taxTotal, form.currencyCode, rate).toFixed(2),
      total: toBaseAmount(total, form.currencyCode, rate).toFixed(2),
      additions: form.additions || "0",
      notes: form.notes,
      taxes: invoiceTaxes.filter((t) => Number(t.amount) > 0),
      expenses: invoiceExpenses
        .filter((e): e is InvoiceExpenseLine & { creditAccountId: number } => Number(e.amount) > 0 && e.creditAccountId != null)
        .map((e) => ({ currencyCode: e.currencyCode, exchangeRate: e.exchangeRate, amount: e.amount, creditAccountId: e.creditAccountId, notes: e.notes })),
      items: invoiceItems.map((i) => ({
        itemId: i.itemId,
        quantity: i.quantity,
        price: foreign ? (Number(i.price) * rate).toFixed(2) : i.price,
        discount: i.discount,
        tax: i.tax,
        tax2: i.tax2,
        tax3: i.tax3,
        total: foreign ? (Number(i.total) * rate).toFixed(2) : i.total,
        warehouseId: i.warehouseId,
        serialNumbers: i.serialNumbers.trim() || undefined,
        batchId: i.batchId,
      })),
    };
    if (editId) updateMut.mutate({ ...payload, id: editId });
    else createMut.mutate(payload);
  };

  if (showForm) {
    return (
      <ERPLayout title={editId ? "تعديل فاتورة مبيعات" : (isCashMode ? "فاتورة مبيعات نقدية جديدة" : "فاتورة مبيعات جديدة")}>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={closeForm} className="gap-1 text-slate-600">
              <ArrowRight size={16} />
              العودة للقائمة
            </Button>
          </div>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-semibold text-slate-800">بيانات الفاتورة</CardTitle>
            </CardHeader>
            {activeOffers && activeOffers.length > 0 && (
              <div className="mx-6 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex flex-wrap items-center gap-2">
                <span className="font-medium">عروض نشطة:</span>
                {activeOffers.map((offer: ActiveOffer) => (
                  <Button
                    key={offer.id}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-amber-300 bg-white hover:bg-amber-100"
                    onClick={() => applyScopedOffer(offer)}
                  >
                    {offer.name} ({offer.discountPercent}%) — {offerScopeLabel(offer)}
                  </Button>
                ))}
              </div>
            )}
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="col-span-2">
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">العميل *</Label>
                  <div className="flex gap-1">
                    <Select value={form.customerId?.toString() || ""} onValueChange={(v) => setForm((p) => ({ ...p, customerId: Number(v) }))}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                      <SelectContent>
                        {customers?.rows.map((c) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="sm" className="h-9 w-9 p-0 shrink-0" title="إضافة عميل جديد" onClick={() => setQuickAdd({ kind: "customer" })}><Plus size={14} /></Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">التاريخ *</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">تاريخ الاستحقاق</Label>
                  <Input type="date" value={form.dueDate} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">العملة</Label>
                  <Select
                    value={form.currencyCode}
                    onValueChange={(code) => {
                      const row = exchangeRates?.find((r: Record<string, unknown>) => r.code === code);
                      setForm((p) => ({ ...p, currencyCode: code, exchangeRate: code === "EGP" ? "1" : String(row?.rate ?? p.exchangeRate) }));
                    }}
                  >
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EGP">EGP — جنيه</SelectItem>
                      {(exchangeRates || [])
                        .filter((r: Record<string, unknown>) => r.code !== "EGP")
                        .map((r: Record<string, unknown>) => (
                          <SelectItem key={String(r.id)} value={String(r.code)}>{String(r.code)} — {String(r.name)}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                {isForeignCurrency(form.currencyCode) && (
                  <div>
                    <Label className="text-xs font-medium text-slate-700 mb-1.5 block">سعر الصرف</Label>
                    <Input value={form.exchangeRate} onChange={(e) => setForm((p) => ({ ...p, exchangeRate: e.target.value }))} className="h-9 text-sm" />
                  </div>
                )}
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">المخزن (الافتراضي للأسطر)</Label>
                  <Select value={form.warehouseId?.toString() || ""} onValueChange={(v) => setForm((p) => ({ ...p, warehouseId: Number(v) }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر المخزن" /></SelectTrigger>
                    <SelectContent>
                      {warehouses?.map((w) => <SelectItem key={w.id} value={w.id.toString()}>{w.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">الفرع</Label>
                  <Select value={form.branchId?.toString() || "none"} onValueChange={(v) => setForm((p) => ({ ...p, branchId: v === "none" ? undefined : Number(v) }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="من العميل" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">من العميل</SelectItem>
                      {(branchList || []).map((b: { id: number; name: string }) => <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">مركز التكلفة</Label>
                  <Select value={form.costCenterId?.toString() || "none"} onValueChange={(v) => setForm((p) => ({ ...p, costCenterId: v === "none" ? undefined : Number(v) }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="بدون" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون</SelectItem>
                      {(costCentersList || []).map((c: { id: number; name: string }) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">نوع الدفع</Label>
                  {isCashMode ? (
                    <Input value="نقدي" readOnly className="h-9 text-sm bg-slate-50" />
                  ) : (
                    <Select value={form.paymentType} onValueChange={(v) => setForm((p) => ({ ...p, paymentType: v as any }))}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">نقدي</SelectItem>
                        <SelectItem value="credit">آجل</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="col-span-2">
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">اضافات</Label>
                  <Input type="number" value={form.additions} onChange={(e) => setForm((p) => ({ ...p, additions: e.target.value }))} className="h-9 text-sm" />
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">ملاحظات</Label>
                  <Input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="ملاحظات" className="h-9 text-sm" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="text-sm font-semibold text-slate-800">الأصناف</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <ScanLine size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onScanBarcode(); } }}
                      placeholder="امسح أو اكتب السيريل نمبر"
                      className="h-8 text-xs pr-7 w-52"
                    />
                  </div>
                  <Button onClick={addItem} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-8 gap-1 text-xs">
                    <Plus size={13} />
                    إضافة صنف
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 min-w-[160px]">الصنف</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-32">المخزن</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-20">الكمية</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-24">السعر</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-16">خصم %</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-16">ض1 %</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-16">ض2 %</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-16">ض3 %</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-32">الدفعة</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-36">أرقام تسلسلية</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-28">الإجمالي</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceItems.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-50 align-top">
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <div className="flex-1 min-w-[9rem]">
                              <ItemSearchSelect
                                items={allItems || []}
                                value={item.itemId ? item.itemId.toString() : ""}
                                onChange={(v) => updateItem(idx, "itemId", v)}
                                placeholder="اختر الصنف"
                              />
                            </div>
                            <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0 shrink-0" title="إضافة صنف جديد" onClick={() => setQuickAdd({ kind: "item", rowIdx: idx })}><Plus size={12} /></Button>
                          </div>
                          {item.lastPriceHint && (
                            <div className="text-[10px] text-slate-400 mt-0.5">آخر سعر لهذا العميل: {item.lastPriceHint.price.toLocaleString("en-US")} ({item.lastPriceHint.date})</div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Select value={item.warehouseId?.toString() || "default"} onValueChange={(v) => setInvoiceItems((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], warehouseId: v === "default" ? undefined : Number(v) };
                            return next;
                          })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="default">(افتراضي)</SelectItem>
                              {warehouses?.map((w) => <SelectItem key={w.id} value={w.id.toString()}>{w.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2"><Input value={item.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} type="number" className="h-8 text-xs w-full" /></td>
                        <td className="px-3 py-2"><Input value={item.price} onChange={(e) => updateItem(idx, "price", e.target.value)} type="number" className="h-8 text-xs w-full" /></td>
                        <td className="px-3 py-2"><Input value={item.discount} onChange={(e) => updateItem(idx, "discount", e.target.value)} type="number" className="h-8 text-xs w-full" /></td>
                        <td className="px-3 py-2"><Input value={item.tax} onChange={(e) => updateItem(idx, "tax", e.target.value)} type="number" className="h-8 text-xs w-full" /></td>
                        <td className="px-3 py-2"><Input value={item.tax2} onChange={(e) => updateItem(idx, "tax2", e.target.value)} type="number" className="h-8 text-xs w-full" /></td>
                        <td className="px-3 py-2"><Input value={item.tax3} onChange={(e) => updateItem(idx, "tax3", e.target.value)} type="number" className="h-8 text-xs w-full" /></td>
                        <td className="px-3 py-2">
                          <BatchPicker
                            itemId={item.itemId}
                            value={item.batchId}
                            onChange={(batchId) => setInvoiceItems((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], batchId };
                              return next;
                            })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          {itemTracksSerial(item.itemId) ? (
                            <SerialNumberPicker
                              itemId={item.itemId}
                              warehouseId={item.warehouseId ?? form.warehouseId}
                              value={item.serialNumbers}
                              onChange={(v) => updateItem(idx, "serialNumbers", v)}
                              maxCount={Math.max(1, Math.ceil(Number(item.quantity) || 1))}
                            />
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-semibold text-slate-800 text-xs">{Number(item.total).toLocaleString("en-US")} {amountLabel}</td>
                        <td className="px-3 py-2">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={() => removeItem(idx)}><Trash2 size={12} /></Button>
                        </td>
                      </tr>
                    ))}
                    {invoiceItems.length === 0 && (
                      <tr><td colSpan={12} className="py-8 text-center text-slate-400 text-xs">اضغط "إضافة صنف" أو امسح سيريل نمبر لإضافة أصناف للفاتورة</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              <InvoiceTaxList value={invoiceTaxes} onChange={setInvoiceTaxes} baseAmount={subtotal} />
              <InvoiceExpenseList value={invoiceExpenses} onChange={setInvoiceExpenses} />
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100"><CardTitle className="text-sm font-semibold text-slate-800">التسوية والإجماليات</CardTitle></CardHeader>
            <CardContent className="pt-4 space-y-4">
              <PaymentSettlementBlock
                total={total}
                value={settlement}
                onChange={setSettlement}
                partyLabel="العميل"
                partyBalanceBefore={selectedCustomerBalance != null ? Number(selectedCustomerBalance) : undefined}
                isCash={form.paymentType === "cash"}
              />
              <div className="flex justify-end">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>المجموع الفرعي:</span>
                    <span className="font-medium">{subtotal.toLocaleString("en-US", { minimumFractionDigits: 2 })} {amountLabel}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>الضريبة:</span>
                    <span className="font-medium">{taxTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })} {amountLabel}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>اضافات:</span>
                    <span className="font-medium">{additionsAmt.toLocaleString("en-US", { minimumFractionDigits: 2 })} {amountLabel}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-slate-800 border-t border-slate-200 pt-2">
                    <span>الإجمالي:</span>
                    <span className="text-blue-600">
                      {total.toLocaleString("en-US", { minimumFractionDigits: 2 })} {amountLabel}
                      {foreign && <span className="text-xs font-normal text-slate-500 mr-2">≈ {baseTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })} ج.م</span>}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 border-t border-slate-100 pt-3">
                <label className="flex items-center gap-2 text-xs text-slate-600"><Checkbox checked={printAfterSave} onCheckedChange={(v) => setPrintAfterSave(!!v)} />طباعة بعد الحفظ</label>
                <label className="flex items-center gap-2 text-xs text-slate-600"><Checkbox checked={printAfterApprove} onCheckedChange={(v) => setPrintAfterApprove(!!v)} />طباعة بعد الاعتماد</label>
                <label className="flex items-center gap-2 text-xs text-slate-600"><Checkbox checked={printNote} onCheckedChange={(v) => setPrintNote(!!v)} />طباعة إذن صرف مخزن مع الفاتورة</label>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={closeForm}>إلغاء</Button>
            <EntityPermissionGate moduleKey="sales" entityKey={isCashMode ? "cashSaleInvoice" : "saleInvoice"} action="add">
              <Button onClick={() => handleSubmit(false)} disabled={createMut.isPending || updateMut.isPending} variant="outline" className="px-6">
                {(createMut.isPending || updateMut.isPending) ? "جاري الحفظ..." : "حفظ"}
              </Button>
              <Button onClick={() => handleSubmit(true)} disabled={createMut.isPending || updateMut.isPending} className="bg-blue-600 hover:bg-blue-700 text-white px-8 gap-1">
                <CheckCircle2 size={15} />{(createMut.isPending || updateMut.isPending) ? "جاري الحفظ..." : "حفظ واعتماد"}
              </Button>
            </EntityPermissionGate>
          </div>
        </div>

        <QuickAddDialog
          kind={quickAdd?.kind || "item"}
          open={!!quickAdd}
          onClose={() => setQuickAdd(null)}
          onCreated={(row) => {
            if (quickAdd?.kind === "item" && quickAdd.rowIdx != null) updateItem(quickAdd.rowIdx, "itemId", String(row.id));
            else if (quickAdd?.kind === "customer") setForm((p) => ({ ...p, customerId: row.id }));
            setQuickAdd(null);
          }}
        />
      </ERPLayout>
    );
  }

  return (
    <ERPLayout title={pageTitle}>
      <DataTable
        title={pageTitle}
        data={data?.rows}
        isLoading={isLoading}
        total={data?.total}
        page={page}
        onPageChange={setPage}
        search={search}
        onSearch={setSearch}
        onAdd={openNewForm}
        addLabel={newInvoiceLabel}
        addEntity={{ moduleKey: "sales", entityKey: isCashMode ? "cashSaleInvoice" : "saleInvoice" }}
        columns={[
          { key: "number", label: "رقم الفاتورة", className: "w-32 font-mono" },
          { key: "customerName", label: "العميل" },
          { key: "branchName", label: "الفرع", render: (row) => row.branchName || "—" },
          { key: "date", label: "التاريخ", render: (row) => (row.date ? new Date(row.date).toLocaleDateString("en-GB") : "-") },
          { key: "paymentType", label: "نوع الدفع", render: (row) => (row.paymentType === "cash" ? "نقدي" : "آجل") },
          { key: "currencyCode", label: "العملة", render: (row) => (row.currencyCode || "EGP").toUpperCase() },
          { key: "total", label: "الإجمالي", render: (row) => formatInvoiceListTotal(row) },
          { key: "remaining", label: "المتبقي", render: (row) => (
            <span className={Number(row.remaining) > 0 ? "text-red-600 font-semibold" : "text-green-600"}>
              {Number(row.remaining).toLocaleString("en-US")} ج.م
            </span>
          ) },
          { key: "status", label: "الحالة", render: (row) => statusBadge(row.status || "draft") },
        ]}
        actions={(row) => (
          <div className="flex items-center gap-1">
            {Number(row.remaining) > 0 && (
              <EntityPermissionGate moduleKey="cash" entityKey="cashReceiptFromCustomer" action="add">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-green-600 hover:bg-green-50" title="تحصيل" onClick={() => setPaymentRow(row)}>
                  <Banknote size={13} />
                </Button>
              </EntityPermissionGate>
            )}
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50" onClick={() => navigate(tenantPath(tenantSlug, `/sales/invoices/${row.id}`))}>
              <Eye size={13} />
            </Button>
            {row.status === "draft" && (
              <EntityPermissionGate moduleKey="sales" entityKey={row.paymentType === "cash" ? "cashSaleInvoice" : "saleInvoice"} action="edit">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-600 hover:bg-slate-100" title="تعديل" onClick={() => void openEdit(row.id)}>
                  <Pencil size={13} />
                </Button>
              </EntityPermissionGate>
            )}
            {["paid", "confirmed", "partial"].includes(row.status || "") && (
              <EntityPermissionGate moduleKey="sales" entityKey={row.paymentType === "cash" ? "cashSaleInvoice" : "saleInvoice"} action="unapprove">
                <Button
                  variant="ghost" size="sm" className="h-7 w-7 p-0 text-amber-700 hover:bg-amber-50" title="فك اعتماد"
                  disabled={unapproveMut.isPending}
                  onClick={() => unapproveMut.mutate(row.id)}
                >
                  <Undo2 size={13} />
                </Button>
              </EntityPermissionGate>
            )}
            <EntityPermissionGate moduleKey="sales" entityKey={row.paymentType === "cash" ? "cashSaleInvoice" : "saleInvoice"} action="copy">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-slate-600 hover:bg-slate-100"
                title="نسخ لفاتورة جديدة"
                disabled={duplicating}
                onClick={() => void handleDuplicate(row.id)}
              >
                <Copy size={13} />
              </Button>
            </EntityPermissionGate>
            <InvoicePrintButton
              invoiceId={row.id}
              type="sale"
              fallback={{
                number: row.number,
                date: row.date,
                partyName: row.customerName ?? undefined,
                total: Number(row.total) || 0,
                foreignTotal: row.foreignTotal != null ? Number(row.foreignTotal) : null,
                currencyCode: row.currencyCode ?? "EGP",
                exchangeRate: row.exchangeRate ?? 1,
                status: row.status ?? undefined,
                paymentType: row.paymentType ?? undefined,
              }}
            />
          </div>
        )}
      />
      <InvoicePaymentDialog
        open={!!paymentRow}
        onClose={() => setPaymentRow(null)}
        title="تحصيل من عميل"
        partyLabel="العميل"
        partyName={paymentRow?.customerName}
        invoiceNumber={paymentRow?.number || ""}
        remaining={Number(paymentRow?.remaining || 0)}
        isLoading={payMut.isPending}
        onSubmit={(amount, date, _receipt, split) => {
          if (!paymentRow) return;
          payMut.mutate({ invoiceId: paymentRow.id, amount, date, cashAmount: split?.cashAmount, bankAmount: split?.bankAmount, bankAccountId: split?.bankAccountId });
        }}
      />
    </ERPLayout>
  );
}
