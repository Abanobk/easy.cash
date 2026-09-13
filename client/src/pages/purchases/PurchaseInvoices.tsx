import { useEffect, useState } from "react";
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
import { Plus, Trash2, Eye, ArrowRight, Banknote, Copy, ScanLine, CheckCircle2, Pencil, Undo2 } from "lucide-react";
import EntityPermissionGate from "@/components/EntityPermissionGate";
import { InvoicePrintButton } from "@/components/InvoicePrintButton";

import { useLocation } from "wouter";
import { tenantPath, useTenantSlug } from "@/lib/tenant";
import { InvoicePaymentDialog } from "@/components/InvoicePaymentDialog";
import { isForeignCurrency, toBaseAmount, formatInvoiceListTotal } from "@shared/currency";
import { QuickAddDialog } from "@/components/invoices/QuickAddDialog";
import { InvoiceTaxList, type InvoiceTaxLine } from "@/components/invoices/InvoiceTaxList";
import { InvoiceExpenseList, type InvoiceExpenseLine } from "@/components/invoices/InvoiceExpenseList";
import { PaymentSettlementBlock, type Settlement } from "@/components/invoices/PaymentSettlementBlock";
import { BatchSplitEditor, type BatchSplitRow } from "@/components/invoices/BatchSplitEditor";
import { findItemByScan } from "@/lib/barcode";
import { printInvoiceQuick, printWarehouseNote } from "@/lib/print-invoice-quick";
import { toDateStr } from "@/lib/date";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { ItemSearchSelect } from "@/components/ItemSearchSelect";

interface InvoiceItem {
  itemId: number;
  quantity: string;
  price: string;
  discount: string;
  tax: string;
  tax2: string;
  tax3: string;
  total: string;
  warehouseId: number | undefined;
  batchNumber: string;
  expiryDate: string;
  serialNumbers: string;
  batches: BatchSplitRow[];
  lastPriceHint?: { price: number; date: string; number: string } | null;
}

const emptyItem = (): InvoiceItem => ({
  itemId: 0, quantity: "1", price: "0", discount: "0", tax: "0", tax2: "0", tax3: "0", total: "0",
  warehouseId: undefined, batchNumber: "", expiryDate: "", serialNumbers: "", batches: [],
});

const emptyForm = {
  supplierId: undefined as number | undefined,
  date: new Date().toISOString().split("T")[0],
  dueDate: "",
  warehouseId: undefined as number | undefined,
  branchId: undefined as number | undefined,
  costCenterId: undefined as number | undefined,
  paymentType: "cash" as "cash" | "credit",
  receiptType: "full" as "full" | "partial",
  currencyCode: "EGP",
  exchangeRate: "1",
  referenceNumber: "",
  notes: "",
};

const emptySettlement: Settlement = { cashAmount: "0", bankAmount: "0", bankAccountId: undefined };

export default function PurchaseInvoices() {
  const [, navigate] = useLocation();
  const tenantSlug = useTenantSlug();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [invoiceTaxes, setInvoiceTaxes] = useState<InvoiceTaxLine[]>([]);
  const [invoiceExpenses, setInvoiceExpenses] = useState<InvoiceExpenseLine[]>([]);
  const [settlement, setSettlement] = useState<Settlement>(emptySettlement);
  const [printAfterSave, setPrintAfterSave] = useState(false);
  const [printAfterApprove, setPrintAfterApprove] = useState(false);
  const [printNote, setPrintNote] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [quickAdd, setQuickAdd] = useState<{ kind: "item" | "supplier"; rowIdx?: number } | null>(null);
  const [paymentRow, setPaymentRow] = useState<any | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [lastApproveNow, setLastApproveNow] = useState(false);

  const utils = trpc.useUtils();
  useEffect(() => setPage(1), [debouncedSearch]);
  const { data, isLoading, refetch } = trpc.purchases.invoices.list.useQuery({ page, limit: 20, search: debouncedSearch || undefined });
  const { data: suppliers } = trpc.suppliers.list.useQuery({ page: 1, limit: 200 });
  const { data: allItems } = trpc.items.all.useQuery();
  const { data: warehouses } = trpc.warehouses.list.useQuery();
  const { data: branchList } = trpc.settings.branches.list.useQuery();
  const { data: costCentersList } = trpc.costCenters.list.useQuery();
  const { data: exchangeRates } = trpc.parity.settings.exchangeRates.list.useQuery(undefined, { enabled: showForm });

  const createMut = trpc.purchases.invoices.create.useMutation({
    onSuccess: async (res) => {
      toast.success(res.pendingApproval ? `تم الحفظ ${res.number} — بانتظار الاعتماد` : `تم إنشاء الفاتورة ${res.number}`);
      const shouldPrint = !res.pendingApproval && (lastApproveNow ? printAfterApprove : printAfterSave);
      if (shouldPrint) firePrint(res.number);
      if (printNote) fireWarehouseNote(res.number);
      refetch();
      setShowForm(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.purchases.invoices.update.useMutation({
    onSuccess: (res) => {
      toast.success(lastApproveNow ? `تم حفظ واعتماد الفاتورة ${res.number}` : "تم حفظ التعديلات");
      refetch();
      setShowForm(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });
  const unapproveMut = trpc.purchases.invoices.unapprove.useMutation({
    onSuccess: () => { toast.success("تم فك الاعتماد — الفاتورة الآن مسودة قابلة للتعديل"); refetch(); },
    onError: (e) => {
      // لما يكون في سداد مسجّل مانع فك الاعتماد، وجّه المستخدم فعلياً لشاشة المعاملات بدل رسالة نصية بس
      if (e.message.includes("راجعه أولاً من")) {
        const isBank = e.message.includes("بنكية");
        toast.error(e.message, {
          action: {
            label: "روح هناك",
            onClick: () => navigate(tenantPath(tenantSlug, isBank ? "/bank/transactions" : "/cash/pay-supplier")),
          },
        });
        return;
      }
      toast.error(e.message);
    },
  });
  const payMut = trpc.purchases.invoices.recordPayment.useMutation({
    onSuccess: (res) => {
      toast.success(`تم السداد — إيصال ${res.cashNumber}`);
      refetch();
      setPaymentRow(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setEditId(null);
    setForm(emptyForm); setInvoiceItems([]); setInvoiceTaxes([]); setInvoiceExpenses([]);
    setSettlement(emptySettlement); setPrintAfterSave(false); setPrintAfterApprove(false); setPrintNote(false); setBarcode("");
  };

  /** فتح فاتورة مسودة (بعد فك اعتماد أو معلقة أصلاً) للتعديل — بنعيد استخدام نفس فورم الإنشاء الغني */
  const openEdit = async (invoiceId: number) => {
    try {
      const inv = await utils.purchases.invoices.byId.fetch(invoiceId);
      setEditId(invoiceId);
      setForm({
        supplierId: inv.supplierId,
        date: toDateStr(inv.date),
        dueDate: inv.dueDate ? toDateStr(inv.dueDate) : "",
        warehouseId: inv.warehouseId ?? undefined,
        branchId: inv.branchId ?? undefined,
        costCenterId: inv.costCenterId ?? undefined,
        paymentType: (inv.paymentType as "cash" | "credit") || "cash",
        receiptType: (inv.receiptType as "full" | "partial") || "full",
        currencyCode: inv.currencyCode || "EGP",
        exchangeRate: inv.exchangeRate?.toString() || "1",
        referenceNumber: inv.referenceNumber || "",
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
        ...emptyItem(),
        itemId: i.itemId,
        quantity: i.quantity?.toString() || "1",
        price: i.price?.toString() || "0",
        discount: i.discount?.toString() || "0",
        tax: i.tax?.toString() || "0",
        tax2: i.tax2?.toString() || "0",
        tax3: i.tax3?.toString() || "0",
        total: i.total?.toString() || "0",
        warehouseId: i.warehouseId ?? undefined,
        batchNumber: i.batches?.length ? "" : "",
        batches: (i.batches || []).map((b: any) => ({ batchNumber: b.batchNumber || "", expiryDate: b.expiryDate ? toDateStr(b.expiryDate) : "", quantity: String(b.quantity) })),
      })));
      setShowForm(true);
    } catch (e: any) {
      toast.error(e?.message || "فشل فتح الفاتورة للتعديل");
    }
  };

  const firePrint = (number: string) => {
    printInvoiceQuick({
      title: "فاتورة شراء", number, date: form.date, partyLabel: "المورد",
      partyName: suppliers?.rows.find((s) => s.id === form.supplierId)?.name || "",
      lines: invoiceItems.map((i) => ({
        name: allItems?.find((a) => a.id === i.itemId)?.name || "",
        quantity: Number(i.quantity), unit: allItems?.find((a) => a.id === i.itemId)?.unit,
        price: Number(i.price), total: Number(i.total),
      })),
      subtotal, discount: 0, tax: taxTotal, total, paymentType: form.paymentType,
    });
  };
  const fireWarehouseNote = (number: string) => {
    printWarehouseNote({
      title: "إذن مخزن", number, date: form.date, partyLabel: "المورد",
      partyName: suppliers?.rows.find((s) => s.id === form.supplierId)?.name || "",
      lines: invoiceItems.map((i) => ({
        name: allItems?.find((a) => a.id === i.itemId)?.name || "",
        quantity: Number(i.quantity), unit: allItems?.find((a) => a.id === i.itemId)?.unit,
        warehouseName: warehouses?.find((w) => w.id === (i.warehouseId ?? form.warehouseId))?.name,
      })),
    });
  };

  /** نسخ فاتورة موجودة كنقطة بداية لفاتورة جديدة — زي "نسخ" في ميجا كاش */
  const handleDuplicate = async (invoiceId: number) => {
    setDuplicating(true);
    try {
      const inv = await utils.purchases.invoices.byId.fetch(invoiceId);
      setForm({
        supplierId: inv.supplierId,
        date: new Date().toISOString().split("T")[0],
        dueDate: "",
        warehouseId: inv.warehouseId ?? undefined,
        branchId: inv.branchId ?? undefined,
        costCenterId: inv.costCenterId ?? undefined,
        paymentType: (inv.paymentType as "cash" | "credit") || "cash",
        receiptType: "full",
        currencyCode: inv.currencyCode || "EGP",
        exchangeRate: inv.exchangeRate?.toString() || "1",
        referenceNumber: inv.referenceNumber || "",
        notes: `نسخة من الفاتورة ${inv.number}`,
      });
      setInvoiceItems(inv.items.map((i) => ({
        ...emptyItem(),
        itemId: i.itemId,
        quantity: i.quantity?.toString() || "1",
        price: i.price?.toString() || "0",
        discount: i.discount?.toString() || "0",
        tax: i.tax?.toString() || "0",
        total: i.total?.toString() || "0",
      })));
      setShowForm(true);
      toast.success(`تم نسخ الفاتورة ${inv.number} — راجع البيانات واحفظ`);
    } catch (e: any) {
      toast.error(e?.message || "فشل نسخ الفاتورة");
    } finally {
      setDuplicating(false);
    }
  };

  const addItem = () => setInvoiceItems((prev) => [...prev, emptyItem()]);

  const applyItemHint = async (idx: number, itemId: number) => {
    if (!form.supplierId || !itemId) return;
    try {
      const hint = await utils.purchases.invoices.lastPriceFromSupplier.fetch({ supplierId: form.supplierId, itemId });
      setInvoiceItems((prev) => {
        const next = [...prev];
        if (next[idx]) next[idx] = { ...next[idx], lastPriceHint: hint ? { price: Number(hint.price), date: toDateStr(hint.date), number: hint.number } : null };
        return next;
      });
    } catch { /* بيانات إضافية اختيارية — تجاهل الفشل */ }
  };

  const updateItem = (idx: number, field: keyof InvoiceItem, value: any) => {
    setInvoiceItems((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      if (field === "itemId") {
        const item = allItems?.find((i) => i.id === Number(value));
        if (item) {
          updated[idx].price = item.purchasePrice?.toString() || "0";
          updated[idx].tax = item.taxRate?.toString() || "0";
        }
        void applyItemHint(idx, Number(value));
      }
      const q = Number(updated[idx].quantity) || 0;
      const p = Number(updated[idx].price) || 0;
      const d = Number(updated[idx].discount) || 0;
      const t = (Number(updated[idx].tax) || 0) + (Number(updated[idx].tax2) || 0) + (Number(updated[idx].tax3) || 0);
      const sub = q * p * (1 - d / 100);
      updated[idx].total = (sub * (1 + t / 100)).toFixed(2);
      return updated;
    });
  };

  const onScanBarcode = () => {
    if (!barcode.trim() || !allItems) return;
    const hit = findItemByScan(allItems as any, barcode);
    if (!hit) { toast.error("لم يتم العثور على صنف بهذا السيريل نمبر"); return; }
    const idx = invoiceItems.findIndex((i) => !i.itemId);
    if (idx >= 0) updateItem(idx, "itemId", hit.id);
    else {
      setInvoiceItems((prev) => [...prev, emptyItem()]);
      setTimeout(() => updateItem(invoiceItems.length, "itemId", hit.id), 0);
    }
    setBarcode("");
  };

  const subtotal = invoiceItems.reduce((s, i) => s + Number(i.quantity) * Number(i.price) * (1 - Number(i.discount) / 100), 0);
  const taxTotal = invoiceItems.reduce((s, i) => s + Number(i.total) - Number(i.quantity) * Number(i.price) * (1 - Number(i.discount) / 100), 0)
    + invoiceTaxes.reduce((s, t) => s + Number(t.amount), 0);
  const total = invoiceItems.reduce((s, i) => s + Number(i.total), 0) + invoiceTaxes.reduce((s, t) => s + Number(t.amount), 0);
  const foreign = isForeignCurrency(form.currencyCode);
  const amountLabel = foreign ? form.currencyCode : "ج.م";
  const baseTotal = toBaseAmount(total, form.currencyCode, form.exchangeRate);
  const itemTracksSerial = (itemId: number) => Boolean(allItems?.find((i) => i.id === itemId)?.trackSerial);
  const selectedSupplierBalance = suppliers?.rows.find((s) => s.id === form.supplierId)?.balance;

  const handleSubmit = (approveNow: boolean) => {
    setLastApproveNow(approveNow);
    if (!form.supplierId) { toast.error("يجب اختيار المورد"); return; }
    if (invoiceItems.length === 0) { toast.error("يجب إضافة صنف واحد على الأقل"); return; }
    if (invoiceItems.some((i) => !i.itemId)) { toast.error("يجب اختيار الصنف لجميع الأسطر"); return; }
    const rate = Number(form.exchangeRate) || 1;
    const totalBase = toBaseAmount(total, form.currencyCode, rate);
    const payload = {
      supplierId: form.supplierId!,
      date: form.date,
      dueDate: form.dueDate || undefined,
      warehouseId: form.warehouseId,
      branchId: form.branchId,
      costCenterId: form.costCenterId,
      paymentType: form.paymentType,
      receiptType: form.receiptType,
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
      total: totalBase.toFixed(2),
      referenceNumber: form.referenceNumber || undefined,
      notes: form.notes,
      taxes: invoiceTaxes.filter((t) => Number(t.amount) > 0).map((t) => ({ ...t, amount: t.amount })),
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
        batchNumber: i.batches.length ? undefined : (i.batchNumber.trim() || undefined),
        expiryDate: i.batches.length ? undefined : (i.expiryDate || undefined),
        serialNumbers: i.serialNumbers.trim() || undefined,
        batches: i.batches.length ? i.batches.map((b) => ({ batchNumber: b.batchNumber, expiryDate: b.expiryDate, quantity: b.quantity })) : undefined,
      })),
    };
    if (editId) updateMut.mutate({ ...payload, id: editId });
    else createMut.mutate(payload);
  };

  if (showForm) {
    return (
      <ERPLayout title={editId ? "تعديل فاتورة شراء" : "فاتورة شراء جديدة"}>
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); resetForm(); }} className="gap-1 text-slate-600"><ArrowRight size={16} />العودة للقائمة</Button>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100"><CardTitle className="text-sm font-semibold text-slate-800">بيانات الفاتورة</CardTitle></CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="col-span-2">
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">المورد *</Label>
                  <div className="flex gap-1">
                    <Select value={form.supplierId?.toString() || ""} onValueChange={(v) => setForm((p) => ({ ...p, supplierId: Number(v) }))}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                      <SelectContent>{suppliers?.rows.map((s) => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="sm" className="h-9 w-9 p-0 shrink-0" title="إضافة مورد جديد" onClick={() => setQuickAdd({ kind: "supplier" })}><Plus size={14} /></Button>
                  </div>
                </div>
                <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">التاريخ *</Label><Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} className="h-9 text-sm" /></div>
                <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">تاريخ الاستحقاق</Label><Input type="date" value={form.dueDate} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} className="h-9 text-sm" /></div>
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
                      {(exchangeRates || []).filter((r: Record<string, unknown>) => r.code !== "EGP").map((r: Record<string, unknown>) => (
                        <SelectItem key={String(r.id)} value={String(r.code)}>{String(r.code)} — {String(r.name)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {foreign && (
                  <div>
                    <Label className="text-xs font-medium text-slate-700 mb-1.5 block">سعر الصرف</Label>
                    <Input value={form.exchangeRate} onChange={(e) => setForm((p) => ({ ...p, exchangeRate: e.target.value }))} className="h-9 text-sm" />
                  </div>
                )}
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">المخزن (الافتراضي للأسطر)</Label>
                  <Select value={form.warehouseId?.toString() || ""} onValueChange={(v) => setForm((p) => ({ ...p, warehouseId: Number(v) }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر المخزن" /></SelectTrigger>
                    <SelectContent>{warehouses?.map((w) => <SelectItem key={w.id} value={w.id.toString()}>{w.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">الفرع</Label>
                  <Select value={form.branchId?.toString() || "none"} onValueChange={(v) => setForm((p) => ({ ...p, branchId: v === "none" ? undefined : Number(v) }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون / من العميل</SelectItem>
                      {(branchList || []).map((b: { id: number; name: string }) => <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">مركز التكلفة</Label>
                  <Select value={form.costCenterId?.toString() || "none"} onValueChange={(v) => setForm((p) => ({ ...p, costCenterId: v === "none" ? undefined : Number(v) }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر مركز التكلفة" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون</SelectItem>
                      {(costCentersList || []).map((c: { id: number; name: string }) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">نوع الدفع</Label>
                  <Select value={form.paymentType} onValueChange={(v) => setForm((p) => ({ ...p, paymentType: v as any }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="cash">نقدي</SelectItem><SelectItem value="credit">آجل</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">نوع الاستلام</Label>
                  <Select value={form.receiptType} onValueChange={(v) => setForm((p) => ({ ...p, receiptType: v as any }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="full">استلام كلي</SelectItem><SelectItem value="partial">استلام جزئي</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">رقم المرجع</Label><Input value={form.referenceNumber} onChange={(e) => setForm((p) => ({ ...p, referenceNumber: e.target.value }))} placeholder="رقم فاتورة المورد" className="h-9 text-sm" /></div>
                <div className="col-span-2"><Label className="text-xs font-medium text-slate-700 mb-1.5 block">ملاحظات</Label><Input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="ملاحظات" className="h-9 text-sm" /></div>
              </div>
            </CardContent>
          </Card>

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
                  <Button onClick={addItem} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-8 gap-1 text-xs"><Plus size={13} />إضافة صنف</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 min-w-[160px]">الصنف</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-32">المخزن</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-20">الكمية</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-24">السعر</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-16">خصم %</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-16">ض1 %</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-16">ض2 %</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-16">ض3 %</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-28">رقم الدفعة</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-10"></th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-28">انتهاء الصلاحية</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-32">أرقام تسلسلية</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-28">الإجمالي</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr></thead>
                  <tbody>
                    {invoiceItems.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-50 align-top">
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <div className="flex-1 min-w-[9rem]">
                              <ItemSearchSelect
                                items={allItems || []}
                                value={item.itemId ? item.itemId.toString() : ""}
                                onChange={(v) => updateItem(idx, "itemId", Number(v))}
                                placeholder="اختر الصنف"
                              />
                            </div>
                            <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0 shrink-0" title="إضافة صنف جديد" onClick={() => setQuickAdd({ kind: "item", rowIdx: idx })}><Plus size={12} /></Button>
                          </div>
                          {item.lastPriceHint && (
                            <div className="text-[10px] text-slate-400 mt-0.5">آخر سعر من المورد: {item.lastPriceHint.price.toLocaleString("en-US")} ({item.lastPriceHint.date})</div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Select value={item.warehouseId?.toString() || "default"} onValueChange={(v) => updateItem(idx, "warehouseId", v === "default" ? undefined : Number(v))}>
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
                        <td className="px-3 py-2"><Input value={item.batchNumber} onChange={(e) => updateItem(idx, "batchNumber", e.target.value)} disabled={item.batches.length > 0} placeholder={item.batches.length ? "مقسّمة" : "اختياري"} className="h-8 text-xs w-full" /></td>
                        <td className="px-3 py-2"><BatchSplitEditor totalQuantity={item.quantity} value={item.batches} onChange={(rows) => updateItem(idx, "batches", rows)} /></td>
                        <td className="px-3 py-2"><Input value={item.expiryDate} onChange={(e) => updateItem(idx, "expiryDate", e.target.value)} disabled={item.batches.length > 0} type="date" className="h-8 text-xs w-full" /></td>
                        <td className="px-3 py-2">
                          {itemTracksSerial(item.itemId) ? (
                            <Input value={item.serialNumbers} onChange={(e) => updateItem(idx, "serialNumbers", e.target.value)} placeholder="سيريال1, سيريال2" className="h-8 text-xs w-full" />
                          ) : (<span className="text-xs text-slate-300">—</span>)}
                        </td>
                        <td className="px-3 py-2 font-semibold text-slate-800 text-xs">{Number(item.total).toLocaleString("en-US")} {amountLabel}</td>
                        <td className="px-3 py-2"><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={() => setInvoiceItems((p) => p.filter((_, i) => i !== idx))}><Trash2 size={12} /></Button></td>
                      </tr>
                    ))}
                    {invoiceItems.length === 0 && <tr><td colSpan={14} className="py-8 text-center text-slate-400 text-xs">اضغط "إضافة صنف" أو امسح سيريل نمبر لإضافة أصناف للفاتورة</td></tr>}
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
                partyLabel="المورد"
                partyBalanceBefore={selectedSupplierBalance != null ? Number(selectedSupplierBalance) : undefined}
                isCash={form.paymentType === "cash"}
              />
              <div className="flex justify-end">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between text-sm text-slate-600"><span>المجموع الفرعي:</span><span className="font-medium">{subtotal.toLocaleString("en-US", { minimumFractionDigits: 2 })} {amountLabel}</span></div>
                  <div className="flex justify-between text-sm text-slate-600"><span>الضريبة:</span><span className="font-medium">{taxTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })} {amountLabel}</span></div>
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
                <label className="flex items-center gap-2 text-xs text-slate-600"><Checkbox checked={printNote} onCheckedChange={(v) => setPrintNote(!!v)} />طباعة إذن المخزن مع الفاتورة</label>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>إلغاء</Button>
            <EntityPermissionGate moduleKey="purchases" entityKey="purchaseInvoice" action="add">
              <Button onClick={() => handleSubmit(false)} disabled={createMut.isPending || updateMut.isPending} variant="outline" className="px-6">{(createMut.isPending || updateMut.isPending) ? "جاري الحفظ..." : "حفظ"}</Button>
              <Button onClick={() => handleSubmit(true)} disabled={createMut.isPending || updateMut.isPending} className="bg-blue-600 hover:bg-blue-700 text-white px-8 gap-1"><CheckCircle2 size={15} />{(createMut.isPending || updateMut.isPending) ? "جاري الحفظ..." : "حفظ واعتماد"}</Button>
            </EntityPermissionGate>
          </div>
        </div>

        <QuickAddDialog
          kind={quickAdd?.kind || "item"}
          open={!!quickAdd}
          onClose={() => setQuickAdd(null)}
          onCreated={(row) => {
            if (quickAdd?.kind === "item" && quickAdd.rowIdx != null) updateItem(quickAdd.rowIdx, "itemId", row.id);
            else if (quickAdd?.kind === "supplier") setForm((p) => ({ ...p, supplierId: row.id }));
            setQuickAdd(null);
          }}
        />
      </ERPLayout>
    );
  }

  return (
    <ERPLayout title="فواتير الشراء">
      <DataTable
        title="فواتير الشراء"
        data={data?.rows}
        isLoading={isLoading}
        total={data?.total}
        page={page}
        onPageChange={setPage}
        search={search}
        onSearch={setSearch}
        onAdd={() => setShowForm(true)}
        addLabel="فاتورة جديدة"
        addEntity={{ moduleKey: "purchases", entityKey: "purchaseInvoice" }}
        columns={[
          { key: "number", label: "رقم الفاتورة", className: "w-32 font-mono" },
          { key: "supplierName", label: "المورد" },
          { key: "branchName", label: "الفرع" },
          { key: "date", label: "التاريخ", render: (row) => (row.date ? new Date(row.date).toLocaleDateString("en-GB") : "-") },
          { key: "paymentType", label: "نوع الدفع", render: (row) => (row.paymentType === "cash" ? "نقدي" : "آجل") },
          { key: "currencyCode", label: "العملة", render: (row) => (row.currencyCode || "EGP").toUpperCase() },
          { key: "total", label: "الإجمالي", render: (row) => formatInvoiceListTotal(row) },
          { key: "remaining", label: "المتبقي", render: (row) => <span className={Number(row.remaining) > 0 ? "text-red-600 font-semibold" : "text-green-600"}>{Number(row.remaining).toLocaleString("en-US")} ج.م</span> },
          { key: "status", label: "الحالة", render: (row) => statusBadge(row.status || "draft") },
        ]}
        actions={(row) => (
          <div className="flex items-center gap-1">
            {Number(row.remaining) > 0 && (
              <EntityPermissionGate moduleKey="cash" entityKey="cashPaymentToSupplier" action="add">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-green-600 hover:bg-green-50" title="سداد" onClick={() => setPaymentRow(row)}>
                  <Banknote size={13} />
                </Button>
              </EntityPermissionGate>
            )}
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50" onClick={() => navigate(tenantPath(tenantSlug, `/purchases/invoices/${row.id}`))}><Eye size={13} /></Button>
            {row.status === "draft" && (
              <EntityPermissionGate moduleKey="purchases" entityKey="purchaseInvoice" action="edit">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-600 hover:bg-slate-100" title="تعديل" onClick={() => void openEdit(row.id)}>
                  <Pencil size={13} />
                </Button>
              </EntityPermissionGate>
            )}
            {["paid", "confirmed", "partial"].includes(row.status || "") && (
              <EntityPermissionGate moduleKey="purchases" entityKey="purchaseInvoice" action="unapprove">
                <Button
                  variant="ghost" size="sm" className="h-7 w-7 p-0 text-amber-700 hover:bg-amber-50" title="فك اعتماد"
                  disabled={unapproveMut.isPending}
                  onClick={() => unapproveMut.mutate(row.id)}
                >
                  <Undo2 size={13} />
                </Button>
              </EntityPermissionGate>
            )}
            <EntityPermissionGate moduleKey="purchases" entityKey="purchaseInvoice" action="copy">
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
              type="purchase"
              fallback={{
                number: row.number,
                date: row.date,
                partyName: row.supplierName ?? undefined,
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
        title="سداد لمورد"
        partyLabel="المورد"
        partyName={paymentRow?.supplierName}
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
