import { useState, useEffect, useMemo } from "react";
import ERPLayout from "@/components/ERPLayout";
import { DataTable, statusBadge } from "@/components/DataTable";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Trash2, Eye, ArrowRight, Banknote } from "lucide-react";
import PermissionGate from "@/components/PermissionGate";
import { useLocation, useSearch } from "wouter";
import { InvoicePaymentDialog } from "@/components/InvoicePaymentDialog";
import { isForeignCurrency, toBaseAmount, formatInvoiceListTotal } from "@shared/currency";
import { SerialNumberPicker } from "@/components/SerialNumberPicker";
import { InvoicePrintButton } from "@/components/InvoicePrintButton";
import { BatchPicker } from "@/components/BatchPicker";

interface InvoiceItem {
  itemId: number;
  itemName: string;
  itemUnit: string;
  quantity: string;
  price: string;
  discount: string;
  tax: string;
  total: string;
  serialNumbers: string;
  batchId?: number;
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
  notes: "",
};

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
  const t = Number(row.tax) || 0;
  const subtotal = q * p * (1 - d / 100);
  return { ...row, total: (subtotal * (1 + t / 100)).toFixed(2) };
}

export default function SalesInvoices() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const isCashMode = useMemo(() => new URLSearchParams(searchString).get("mode") === "cash", [searchString]);

  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [paymentRow, setPaymentRow] = useState<any | null>(null);

  useEffect(() => {
    if (isCashMode) {
      setForm((f) => ({ ...f, paymentType: "cash" }));
    }
  }, [isCashMode]);

  const pageTitle = isCashMode ? "فواتير المبيعات النقدية" : "فواتير المبيعات";
  const newInvoiceLabel = isCashMode ? "فاتورة نقدية جديدة" : "فاتورة جديدة";

  const { data, isLoading, refetch } = trpc.sales.invoices.list.useQuery({
    page,
    limit: 20,
    paymentType: isCashMode ? "cash" : undefined,
  });
  const { data: customers } = trpc.customers.list.useQuery({ page: 1, limit: 200 });
  const { data: allItems } = trpc.items.all.useQuery();
  const { data: warehouses } = trpc.warehouses.list.useQuery();
  const { data: branchList } = trpc.settings.branches.list.useQuery();
  const { data: costCentersList } = trpc.costCenters.list.useQuery();
  const { data: activeOffers } = trpc.parity.inventory.offers.active.useQuery(undefined, { enabled: showForm });
  const { data: exchangeRates } = trpc.parity.settings.exchangeRates.list.useQuery(undefined, { enabled: showForm });
  const createMut = trpc.sales.invoices.create.useMutation({
    onSuccess: (res) => { toast.success(`تم إنشاء الفاتورة ${res.number}`); refetch(); setShowForm(false); resetForm(); },
    onError: (e) => toast.error(e.message),
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
    setForm({ ...emptyForm, paymentType: isCashMode ? "cash" : "cash" });
    setInvoiceItems([]);
  };

  const openNewForm = () => {
    setForm({ ...emptyForm, paymentType: isCashMode ? "cash" : "cash" });
    setInvoiceItems([]);
    setShowForm(true);
  };

  const addItem = () => {
    setInvoiceItems(prev => [...prev, { itemId: 0, itemName: "", itemUnit: "", quantity: "1", price: "0", discount: "0", tax: "0", total: "0", serialNumbers: "", batchId: undefined }]);
  };

  const updateItem = (idx: number, field: keyof InvoiceItem, value: string) => {
    setInvoiceItems(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      if (field === "itemId") {
        const item = allItems?.find(i => i.id === Number(value));
        if (item) {
          updated[idx].itemName = item.name;
          updated[idx].itemUnit = item.unit || "";
          updated[idx].price = item.salePrice?.toString() || "0";
          updated[idx].tax = item.taxRate?.toString() || "0";
          const offerPct = bestOfferDiscount(Number(value), item.categoryId, activeOffers as ActiveOffer[] | undefined);
          if (offerPct > 0) {
            updated[idx].discount = String(offerPct);
          }
        }
      }
      updated[idx] = recalcLineTotal(updated[idx]);
      return updated;
    });
  };

  const removeItem = (idx: number) => setInvoiceItems(prev => prev.filter((_, i) => i !== idx));

  const subtotal = invoiceItems.reduce((s, i) => s + Number(i.quantity) * Number(i.price) * (1 - Number(i.discount) / 100), 0);
  const taxTotal = invoiceItems.reduce((s, i) => s + Number(i.total) - Number(i.quantity) * Number(i.price) * (1 - Number(i.discount) / 100), 0);
  const total = invoiceItems.reduce((s, i) => s + Number(i.total), 0);
  const foreign = isForeignCurrency(form.currencyCode);
  const amountLabel = foreign ? form.currencyCode : "ج.م";
  const baseTotal = toBaseAmount(total, form.currencyCode, form.exchangeRate);
  const itemTracksSerial = (itemId: number) => Boolean(allItems?.find((i) => i.id === itemId)?.trackSerial);

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

  const handleSubmit = () => {
    if (!form.customerId) { toast.error("يجب اختيار العميل"); return; }
    if (invoiceItems.length === 0) { toast.error("يجب إضافة صنف واحد على الأقل"); return; }
    if (invoiceItems.some(i => !i.itemId)) { toast.error("يجب اختيار الصنف لجميع الأسطر"); return; }
    const rate = Number(form.exchangeRate) || 1;
    createMut.mutate({
      customerId: form.customerId!,
      date: form.date,
      dueDate: form.dueDate || undefined,
      warehouseId: form.warehouseId,
      branchId: form.branchId,
      costCenterId: form.costCenterId,
      paymentType: form.paymentType,
      currencyCode: form.currencyCode,
      exchangeRate: form.exchangeRate,
      foreignTotal: foreign ? total.toFixed(2) : undefined,
      subtotal: toBaseAmount(subtotal, form.currencyCode, rate).toFixed(2),
      discount: "0",
      tax: toBaseAmount(taxTotal, form.currencyCode, rate).toFixed(2),
      total: toBaseAmount(total, form.currencyCode, rate).toFixed(2),
      notes: form.notes,
      items: invoiceItems.map(i => ({
        itemId: i.itemId,
        quantity: i.quantity,
        price: foreign ? (Number(i.price) * rate).toFixed(2) : i.price,
        discount: i.discount,
        tax: i.tax,
        total: foreign ? (Number(i.total) * rate).toFixed(2) : i.total,
        serialNumbers: i.serialNumbers.trim() || undefined,
        batchId: i.batchId,
      })),
    });
  };

  if (showForm) {
    return (
      <ERPLayout title={isCashMode ? "فاتورة مبيعات نقدية جديدة" : "فاتورة مبيعات جديدة"}>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); resetForm(); }} className="gap-1 text-slate-600">
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
                  <Select value={form.customerId?.toString() || ""} onValueChange={v => setForm(p => ({ ...p, customerId: Number(v) }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                    <SelectContent>
                      {customers?.rows.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">التاريخ *</Label>
                  <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">تاريخ الاستحقاق</Label>
                  <Input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">العملة</Label>
                  <Select
                    value={form.currencyCode}
                    onValueChange={(code) => {
                      const row = exchangeRates?.find((r: Record<string, unknown>) => r.code === code);
                      setForm((p) => ({
                        ...p,
                        currencyCode: code,
                        exchangeRate: code === "EGP" ? "1" : String(row?.rate ?? p.exchangeRate),
                      }));
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
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">المخزن</Label>
                  <Select value={form.warehouseId?.toString() || ""} onValueChange={v => setForm(p => ({ ...p, warehouseId: Number(v) }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر المخزن" /></SelectTrigger>
                    <SelectContent>
                      {warehouses?.map(w => <SelectItem key={w.id} value={w.id.toString()}>{w.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">الفرع</Label>
                  <Select value={form.branchId?.toString() || "none"} onValueChange={v => setForm(p => ({ ...p, branchId: v === "none" ? undefined : Number(v) }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="من العميل" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">من العميل</SelectItem>
                      {(branchList || []).map((b: { id: number; name: string }) => <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">مركز التكلفة</Label>
                  <Select value={form.costCenterId?.toString() || "none"} onValueChange={v => setForm(p => ({ ...p, costCenterId: v === "none" ? undefined : Number(v) }))}>
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
                  <Select value={form.paymentType} onValueChange={v => setForm(p => ({ ...p, paymentType: v as any }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">نقدي</SelectItem>
                      <SelectItem value="credit">آجل</SelectItem>
                    </SelectContent>
                  </Select>
                  )}
                </div>
                <div className="col-span-2">
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">ملاحظات</Label>
                  <Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="ملاحظات" className="h-9 text-sm" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-slate-800">الأصناف</CardTitle>
                <Button onClick={addItem} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-8 gap-1 text-xs">
                  <Plus size={13} />
                  إضافة صنف
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">الصنف</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-24">الكمية</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-28">السعر</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-20">خصم %</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-20">ضريبة %</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-32">الدفعة</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-36">أرقام تسلسلية</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-28">الإجمالي</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceItems.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-50">
                        <td className="px-3 py-2">
                          <Select value={item.itemId?.toString() || ""} onValueChange={v => updateItem(idx, "itemId", v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="اختر الصنف" /></SelectTrigger>
                            <SelectContent>
                              {allItems?.map(i => <SelectItem key={i.id} value={i.id.toString()}>{i.name} ({i.unit})</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2"><Input value={item.quantity} onChange={e => updateItem(idx, "quantity", e.target.value)} type="number" className="h-8 text-xs w-full" /></td>
                        <td className="px-3 py-2"><Input value={item.price} onChange={e => updateItem(idx, "price", e.target.value)} type="number" className="h-8 text-xs w-full" /></td>
                        <td className="px-3 py-2"><Input value={item.discount} onChange={e => updateItem(idx, "discount", e.target.value)} type="number" className="h-8 text-xs w-full" /></td>
                        <td className="px-3 py-2"><Input value={item.tax} onChange={e => updateItem(idx, "tax", e.target.value)} type="number" className="h-8 text-xs w-full" /></td>
                        <td className="px-3 py-2">
                          <BatchPicker
                            itemId={item.itemId}
                            value={item.batchId}
                            onChange={(batchId) => setInvoiceItems(prev => {
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
                              warehouseId={form.warehouseId}
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
                      <tr><td colSpan={9} className="py-8 text-center text-slate-400 text-xs">اضغط "إضافة صنف" لإضافة أصناف للفاتورة</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              {invoiceItems.length > 0 && (
                <div className="border-t border-slate-100 p-4">
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
                      <div className="flex justify-between text-base font-bold text-slate-800 border-t border-slate-200 pt-2">
                        <span>الإجمالي:</span>
                        <span className="text-blue-600">
                          {total.toLocaleString("en-US", { minimumFractionDigits: 2 })} {amountLabel}
                          {foreign && <span className="text-xs font-normal text-slate-500 mr-2">≈ {baseTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })} ج.م</span>}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>إلغاء</Button>
            <PermissionGate module="sales" action="create" featureKey="sales-invoiceslist-invoice">
              <Button onClick={handleSubmit} disabled={createMut.isPending} className="bg-blue-600 hover:bg-blue-700 text-white px-8">
                {createMut.isPending ? "جاري الحفظ..." : "حفظ الفاتورة"}
              </Button>
            </PermissionGate>
          </div>
        </div>
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
        onAdd={openNewForm}
        addLabel={newInvoiceLabel}
        permissionModule="sales"
        addFeatureKey="sales-invoiceslist-invoice"
        columns={[
          { key: "number", label: "رقم الفاتورة", className: "w-32 font-mono" },
          { key: "customerName", label: "العميل" },
          { key: "branchName", label: "الفرع", render: row => row.branchName || "—" },
          { key: "date", label: "التاريخ", render: row => row.date ? new Date(row.date).toLocaleDateString("en-GB") : "-" },
          { key: "paymentType", label: "نوع الدفع", render: row => row.paymentType === "cash" ? "نقدي" : "آجل" },
          { key: "currencyCode", label: "العملة", render: row => (row.currencyCode || "EGP").toUpperCase() },
          { key: "total", label: "الإجمالي", render: row => formatInvoiceListTotal(row) },
          { key: "remaining", label: "المتبقي", render: row => (
            <span className={Number(row.remaining) > 0 ? "text-red-600 font-semibold" : "text-green-600"}>
              {Number(row.remaining).toLocaleString("en-US")} ج.م
            </span>
          ) },
          { key: "status", label: "الحالة", render: row => statusBadge(row.status || "draft") },
        ]}
        actions={row => (
          <div className="flex items-center gap-1">
            {Number(row.remaining) > 0 && (
              <PermissionGate module="cash" action="create">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-green-600 hover:bg-green-50" title="تحصيل" onClick={() => setPaymentRow(row)}>
                  <Banknote size={13} />
                </Button>
              </PermissionGate>
            )}
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50" onClick={() => navigate(`/sales/invoices/${row.id}`)}>
              <Eye size={13} />
            </Button>
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
        onSubmit={(amount, date) => {
          if (!paymentRow) return;
          payMut.mutate({ invoiceId: paymentRow.id, amount, date });
        }}
      />
    </ERPLayout>
  );
}
