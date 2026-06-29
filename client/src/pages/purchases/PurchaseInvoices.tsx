import { useState } from "react";
import ERPLayout from "@/components/ERPLayout";
import { DataTable, statusBadge } from "@/components/DataTable";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Trash2, Eye, ArrowRight } from "lucide-react";
import { PrintInvoice } from "@/components/PrintInvoice";
import { useLocation } from "wouter";

interface InvoiceItem {
  itemId: number;
  quantity: string;
  price: string;
  discount: string;
  tax: string;
  total: string;
}

const emptyForm = {
  supplierId: undefined as number | undefined,
  date: new Date().toISOString().split("T")[0],
  dueDate: "",
  warehouseId: undefined as number | undefined,
  paymentType: "cash" as "cash" | "credit",
  notes: "",
};

export default function PurchaseInvoices() {
  const [, navigate] = useLocation();
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);

  const { data, isLoading, refetch } = trpc.purchases.invoices.list.useQuery({ page, limit: 20 });
  const { data: suppliers } = trpc.suppliers.list.useQuery({ page: 1, limit: 200 });
  const { data: allItems } = trpc.items.all.useQuery();
  const { data: warehouses } = trpc.warehouses.list.useQuery();
  const createMut = trpc.purchases.invoices.create.useMutation({
    onSuccess: (res) => { toast.success(`تم إنشاء الفاتورة ${res.number}`); refetch(); setShowForm(false); resetForm(); },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => { setForm(emptyForm); setInvoiceItems([]); };

  const addItem = () => setInvoiceItems(prev => [...prev, { itemId: 0, quantity: "1", price: "0", discount: "0", tax: "0", total: "0" }]);

  const updateItem = (idx: number, field: keyof InvoiceItem, value: string) => {
    setInvoiceItems(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      if (field === "itemId") {
        const item = allItems?.find(i => i.id === Number(value));
        if (item) {
          updated[idx].price = item.purchasePrice?.toString() || "0";
          updated[idx].tax = item.taxRate?.toString() || "0";
        }
      }
      const q = Number(updated[idx].quantity) || 0;
      const p = Number(updated[idx].price) || 0;
      const d = Number(updated[idx].discount) || 0;
      const t = Number(updated[idx].tax) || 0;
      const sub = q * p * (1 - d / 100);
      updated[idx].total = (sub * (1 + t / 100)).toFixed(2);
      return updated;
    });
  };

  const subtotal = invoiceItems.reduce((s, i) => s + Number(i.quantity) * Number(i.price) * (1 - Number(i.discount) / 100), 0);
  const taxTotal = invoiceItems.reduce((s, i) => s + Number(i.total) - Number(i.quantity) * Number(i.price) * (1 - Number(i.discount) / 100), 0);
  const total = invoiceItems.reduce((s, i) => s + Number(i.total), 0);

  const handleSubmit = () => {
    if (!form.supplierId) { toast.error("يجب اختيار المورد"); return; }
    if (invoiceItems.length === 0) { toast.error("يجب إضافة صنف واحد على الأقل"); return; }
    if (invoiceItems.some(i => !i.itemId)) { toast.error("يجب اختيار الصنف لجميع الأسطر"); return; }
    createMut.mutate({
      supplierId: form.supplierId!,
      date: form.date,
      dueDate: form.dueDate || undefined,
      warehouseId: form.warehouseId,
      paymentType: form.paymentType,
      subtotal: subtotal.toFixed(2),
      discount: "0",
      tax: taxTotal.toFixed(2),
      total: total.toFixed(2),
      notes: form.notes,
      items: invoiceItems.map(i => ({ itemId: i.itemId, quantity: i.quantity, price: i.price, discount: i.discount, tax: i.tax, total: i.total })),
    });
  };

  if (showForm) {
    return (
      <ERPLayout title="فاتورة شراء جديدة">
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); resetForm(); }} className="gap-1 text-slate-600"><ArrowRight size={16} />العودة للقائمة</Button>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100"><CardTitle className="text-sm font-semibold text-slate-800">بيانات الفاتورة</CardTitle></CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="col-span-2">
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">المورد *</Label>
                  <Select value={form.supplierId?.toString() || ""} onValueChange={v => setForm(p => ({ ...p, supplierId: Number(v) }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                    <SelectContent>{suppliers?.rows.map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">التاريخ *</Label><Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="h-9 text-sm" /></div>
                <div><Label className="text-xs font-medium text-slate-700 mb-1.5 block">تاريخ الاستحقاق</Label><Input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} className="h-9 text-sm" /></div>
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">المخزن</Label>
                  <Select value={form.warehouseId?.toString() || ""} onValueChange={v => setForm(p => ({ ...p, warehouseId: Number(v) }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر المخزن" /></SelectTrigger>
                    <SelectContent>{warehouses?.map(w => <SelectItem key={w.id} value={w.id.toString()}>{w.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-700 mb-1.5 block">نوع الدفع</Label>
                  <Select value={form.paymentType} onValueChange={v => setForm(p => ({ ...p, paymentType: v as any }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="cash">نقدي</SelectItem><SelectItem value="credit">آجل</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="col-span-2"><Label className="text-xs font-medium text-slate-700 mb-1.5 block">ملاحظات</Label><Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="ملاحظات" className="h-9 text-sm" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-slate-800">الأصناف</CardTitle>
                <Button onClick={addItem} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-8 gap-1 text-xs"><Plus size={13} />إضافة صنف</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600">الصنف</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-24">الكمية</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-28">السعر</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-20">خصم %</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-20">ضريبة %</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-28">الإجمالي</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr></thead>
                  <tbody>
                    {invoiceItems.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-50">
                        <td className="px-3 py-2">
                          <Select value={item.itemId?.toString() || ""} onValueChange={v => updateItem(idx, "itemId", v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="اختر الصنف" /></SelectTrigger>
                            <SelectContent>{allItems?.map(i => <SelectItem key={i.id} value={i.id.toString()}>{i.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2"><Input value={item.quantity} onChange={e => updateItem(idx, "quantity", e.target.value)} type="number" className="h-8 text-xs w-full" /></td>
                        <td className="px-3 py-2"><Input value={item.price} onChange={e => updateItem(idx, "price", e.target.value)} type="number" className="h-8 text-xs w-full" /></td>
                        <td className="px-3 py-2"><Input value={item.discount} onChange={e => updateItem(idx, "discount", e.target.value)} type="number" className="h-8 text-xs w-full" /></td>
                        <td className="px-3 py-2"><Input value={item.tax} onChange={e => updateItem(idx, "tax", e.target.value)} type="number" className="h-8 text-xs w-full" /></td>
                        <td className="px-3 py-2 font-semibold text-slate-800 text-xs">{Number(item.total).toLocaleString("ar-EG")} ج.م</td>
                        <td className="px-3 py-2"><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={() => setInvoiceItems(p => p.filter((_, i) => i !== idx))}><Trash2 size={12} /></Button></td>
                      </tr>
                    ))}
                    {invoiceItems.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-slate-400 text-xs">اضغط "إضافة صنف" لإضافة أصناف للفاتورة</td></tr>}
                  </tbody>
                </table>
              </div>
              {invoiceItems.length > 0 && (
                <div className="border-t border-slate-100 p-4">
                  <div className="flex justify-end">
                    <div className="w-64 space-y-2">
                      <div className="flex justify-between text-sm text-slate-600"><span>المجموع الفرعي:</span><span className="font-medium">{subtotal.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</span></div>
                      <div className="flex justify-between text-sm text-slate-600"><span>الضريبة:</span><span className="font-medium">{taxTotal.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</span></div>
                      <div className="flex justify-between text-base font-bold text-slate-800 border-t border-slate-200 pt-2"><span>الإجمالي:</span><span className="text-blue-600">{total.toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ج.م</span></div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>إلغاء</Button>
            <Button onClick={handleSubmit} disabled={createMut.isPending} className="bg-blue-600 hover:bg-blue-700 text-white px-8">{createMut.isPending ? "جاري الحفظ..." : "حفظ الفاتورة"}</Button>
          </div>
        </div>
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
        onAdd={() => setShowForm(true)}
        addLabel="فاتورة جديدة"
        columns={[
          { key: "number", label: "رقم الفاتورة", className: "w-32 font-mono" },
          { key: "supplierName", label: "المورد" },
          { key: "date", label: "التاريخ", render: row => row.date ? new Date(row.date).toLocaleDateString("ar-EG") : "-" },
          { key: "paymentType", label: "نوع الدفع", render: row => row.paymentType === "cash" ? "نقدي" : "آجل" },
          { key: "total", label: "الإجمالي", render: row => `${Number(row.total).toLocaleString("ar-EG")} ج.م` },
          { key: "remaining", label: "المتبقي", render: row => <span className={Number(row.remaining) > 0 ? "text-red-600 font-semibold" : "text-green-600"}>{Number(row.remaining).toLocaleString("ar-EG")} ج.م</span> },
          { key: "status", label: "الحالة", render: row => statusBadge(row.status || "draft") },
        ]}
        actions={row => (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50" onClick={() => navigate(`/purchases/invoices/${row.id}`)}><Eye size={13} /></Button>
            <PrintInvoice
              invoice={{
                number: row.number,
                date: row.date,
                type: "purchase",
                partyName: row.supplierName ?? undefined,
                items: [],
                subtotal: Number(row.total) || 0,
                total: Number(row.total) || 0,
                status: row.status ?? undefined,
                paymentType: row.paymentType ?? undefined,
              }}
            />
          </div>
        )}
      />
    </ERPLayout>
  );
}
