import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type Row = {
  id: number;
  type: "purchase" | "sales" | "mixing" | "general";
  workDate: string;
};

/**
 * مراجعة بيان مصنع (شراء/بيع/خلطة) وتحويله لمستند رسمي فعلي.
 * البيان اليومي مش فاتورة/أمر إنتاج بذاته — دي شاشة مراجعة قصيرة تقترح المطابقات (مورد/عميل/صنف)
 * وتكمل الحقول الناقصة (مخزن، سعر، طريقة دفع)، وبتنادي نفس مسارات الإنشاء الحقيقية المستخدمة في
 * شاشات الفواتير وأوامر الإنتاج العادية — مفيش منطق محاسبي مكرر هنا.
 */
export default function FactoryConvertDialog({ row, onClose, onPosted }: {
  row: Row | null;
  onClose: () => void;
  onPosted: () => void;
}) {
  const open = !!row;
  const previewQ = trpc.opsInbox.factoryConvertPreview.useQuery(
    { id: row?.id || 0 },
    { enabled: open },
  );
  const warehousesQ = trpc.warehouses.list.useQuery(undefined, { enabled: open });

  const [partyId, setPartyId] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [paymentType, setPaymentType] = useState<"cash" | "credit">("cash");
  const [materialRows, setMaterialRows] = useState<Array<{ input: string; quantity: string; itemId: string }>>([]);
  /** بنود بيان شراء/مبيعات بأكتر من صنف (factory_daily_upload_items) — فاضية لو البيان صنف واحد قديم */
  const [lineRows, setLineRows] = useState<Array<{ input: string; itemId: string; quantity: string; amount: string }>>([]);

  useEffect(() => {
    if (!previewQ.data) return;
    const p = previewQ.data;
    setPartyId(p.party?.candidates[0]?.id ? String(p.party.candidates[0].id) : "");
    if (p.items?.length) {
      setLineRows(
        p.items.map((it) => ({
          input: it.input,
          itemId: it.candidates[0]?.id ? String(it.candidates[0].id) : "",
          quantity: it.quantity != null ? String(it.quantity) : "",
          amount: it.amount != null ? String(it.amount) : "",
        })),
      );
      setItemId("");
      setQuantity("");
      setUnitPrice("");
    } else {
      setLineRows([]);
      setItemId(p.item?.candidates[0]?.id ? String(p.item.candidates[0].id) : "");
      setQuantity(p.quantity != null ? String(p.quantity) : "1");
      const qty = p.quantity || 1;
      setUnitPrice(p.amount != null ? String(Number((p.amount / qty).toFixed(2))) : "");
    }
    setWarehouseId("");
    setPaymentType("cash");
    setMaterialRows(
      p.materials.map((m) => ({
        input: m.input,
        quantity: m.quantity != null ? String(m.quantity) : "",
        itemId: m.candidates[0]?.id ? String(m.candidates[0].id) : "",
      })),
    );
  }, [previewQ.data]);

  const utils = trpc.useUtils();
  const purchaseCreate = trpc.purchases.invoices.create.useMutation();
  const salesCreate = trpc.sales.invoices.create.useMutation();
  const productionCreate = trpc.production.create.useMutation();
  const markPosted = trpc.opsInbox.factoryMarkPosted.useMutation();

  const busy = purchaseCreate.isPending || salesCreate.isPending || productionCreate.isPending || markPosted.isPending;

  const total = useMemo(() => {
    if (lineRows.length) {
      return lineRows.reduce((s, r) => s + (Number(r.amount) || 0), 0).toFixed(2);
    }
    const q = Number(quantity) || 0;
    const p = Number(unitPrice) || 0;
    return (q * p).toFixed(2);
  }, [quantity, unitPrice, lineRows]);

  /** بيبني بنود الفاتورة من lineRows: السعر = القيمة ÷ الكمية لكل صنف */
  const buildLineItems = () => lineRows.map((r) => {
    const q = Number(r.quantity) || 0;
    const amt = Number(r.amount) || 0;
    const price = q > 0 ? amt / q : amt;
    return { itemId: Number(r.itemId), quantity: String(q), price: String(price.toFixed(2)), total: String(amt.toFixed(2)) };
  });

  const finish = async (entityType: "purchase_invoice" | "sales_invoice" | "production_order", entityId: number, ref: string) => {
    if (!row) return;
    await markPosted.mutateAsync({ id: row.id, entityType, entityId, ref });
    toast.success(`تم التحويل — ${ref}`);
    void utils.opsInbox.factoryList.invalidate();
    onPosted();
  };

  const submitPurchase = async () => {
    if (!row) return;
    if (!partyId) return toast.error("اختر المورد");
    if (!warehouseId) return toast.error("اختر المخزن");
    if (lineRows.length) {
      const unresolved = lineRows.find((r) => !r.itemId);
      if (unresolved) return toast.error(`حدّد الصنف المطابق لـ: ${unresolved.input}`);
      const items = buildLineItems();
      if (items.some((it) => Number(it.quantity) <= 0)) return toast.error("الكمية لازم تكون أكبر من صفر لكل صنف");
      try {
        const res = await purchaseCreate.mutateAsync({
          supplierId: Number(partyId),
          date: row.workDate,
          warehouseId: Number(warehouseId),
          paymentType,
          subtotal: total,
          total,
          items,
        });
        await finish("purchase_invoice", res.id, res.number);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "فشل إنشاء فاتورة الشراء");
      }
      return;
    }
    if (!itemId) return toast.error("اختر الصنف");
    const q = Number(quantity) || 0;
    const p = Number(unitPrice) || 0;
    if (q <= 0 || p <= 0) return toast.error("الكمية والسعر لازم يكونوا أكبر من صفر");
    try {
      const res = await purchaseCreate.mutateAsync({
        supplierId: Number(partyId),
        date: row.workDate,
        warehouseId: Number(warehouseId),
        paymentType,
        subtotal: total,
        total,
        items: [{ itemId: Number(itemId), quantity: String(q), price: String(p), total }],
      });
      await finish("purchase_invoice", res.id, res.number);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل إنشاء فاتورة الشراء");
    }
  };

  const submitSales = async () => {
    if (!row) return;
    if (!partyId) return toast.error("اختر العميل");
    if (!warehouseId) return toast.error("اختر المخزن");
    if (lineRows.length) {
      const unresolved = lineRows.find((r) => !r.itemId);
      if (unresolved) return toast.error(`حدّد الصنف المطابق لـ: ${unresolved.input}`);
      const items = buildLineItems();
      if (items.some((it) => Number(it.quantity) <= 0)) return toast.error("الكمية لازم تكون أكبر من صفر لكل صنف");
      try {
        const res = await salesCreate.mutateAsync({
          customerId: Number(partyId),
          date: row.workDate,
          warehouseId: Number(warehouseId),
          paymentType,
          subtotal: total,
          total,
          items,
        });
        await finish("sales_invoice", res.id, res.number);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "فشل إنشاء فاتورة البيع");
      }
      return;
    }
    if (!itemId) return toast.error("اختر الصنف");
    const q = Number(quantity) || 0;
    const p = Number(unitPrice) || 0;
    if (q <= 0 || p <= 0) return toast.error("الكمية والسعر لازم يكونوا أكبر من صفر");
    try {
      const res = await salesCreate.mutateAsync({
        customerId: Number(partyId),
        date: row.workDate,
        warehouseId: Number(warehouseId),
        paymentType,
        subtotal: total,
        total,
        items: [{ itemId: Number(itemId), quantity: String(q), price: String(p), total }],
      });
      await finish("sales_invoice", res.id, res.number);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل إنشاء فاتورة البيع");
    }
  };

  const submitMixing = async () => {
    if (!row) return;
    if (!itemId) return toast.error("اختر المنتج التام");
    if (!warehouseId) return toast.error("اختر المخزن");
    const q = Number(quantity) || 0;
    if (q <= 0) return toast.error("الكمية المنتجة لازم تكون أكبر من صفر");
    const unresolvedMaterial = materialRows.find((m) => !m.itemId);
    if (unresolvedMaterial) return toast.error(`حدّد الصنف المطابق للخامة: ${unresolvedMaterial.input}`);
    try {
      const res = await productionCreate.mutateAsync({
        productId: Number(itemId),
        quantity: String(q),
        warehouseId: Number(warehouseId),
        date: row.workDate,
        materials: materialRows.map((m) => ({ itemId: Number(m.itemId), quantity: String(Number(m.quantity) || 0) })),
      });
      await finish("production_order", res.id, res.number);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل إنشاء أمر الإنتاج");
    }
  };

  const submit = () => {
    if (row?.type === "purchase") return submitPurchase();
    if (row?.type === "sales") return submitSales();
    if (row?.type === "mixing") return submitMixing();
  };

  const partyLabel = row?.type === "purchase" ? "المورد" : "العميل";
  const p = previewQ.data;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>
            {row?.type === "mixing" ? "تحويل بيان الخلطة لأمر إنتاج" : `تحويل البيان لفاتورة ${row?.type === "purchase" ? "شراء" : "بيع"}`}
          </DialogTitle>
        </DialogHeader>

        {previewQ.isLoading ? (
          <div className="flex items-center justify-center py-8 text-slate-500"><Loader2 className="animate-spin" size={20} /></div>
        ) : previewQ.isError ? (
          <p className="text-sm text-red-600">{previewQ.error.message}</p>
        ) : p ? (
          <div className="space-y-3 py-1">
            {(row?.type === "purchase" || row?.type === "sales") && (
              <div>
                <Label className="text-xs">
                  {partyLabel} — المكتوب في البيان: <span className="font-medium">{p.partyName || "—"}</span>
                  {!p.party?.candidates.length ? <span className="text-amber-600"> (لا يوجد تطابق، اختر يدوياً)</span> : null}
                </Label>
                <Select value={partyId} onValueChange={setPartyId}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder={`اختر ${partyLabel}`} /></SelectTrigger>
                  <SelectContent>
                    {(p.party?.candidates || []).map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name} {c.score >= 100 ? "✓" : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {row?.type !== "mixing" && lineRows.length ? (
              <div className="space-y-2">
                <Label className="text-xs">الأصناف ({lineRows.length})</Label>
                {lineRows.map((r, i) => (
                  <div key={i} className="grid grid-cols-[1fr_5rem_6rem] items-center gap-2 rounded-md border border-slate-200 p-2">
                    <Select value={r.itemId} onValueChange={(v) => setLineRows((rs) => rs.map((row, j) => j === i ? { ...row, itemId: v } : row))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={`صنف: ${r.input}`} /></SelectTrigger>
                      <SelectContent>
                        {(p.items[i]?.candidates || []).map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.name} {c.score >= 100 ? "✓" : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="h-8 text-xs"
                      type="number"
                      placeholder="الكمية"
                      value={r.quantity}
                      onChange={(e) => setLineRows((rs) => rs.map((row, j) => j === i ? { ...row, quantity: e.target.value } : row))}
                    />
                    <Input
                      className="h-8 text-xs"
                      type="number"
                      placeholder="القيمة"
                      value={r.amount}
                      onChange={(e) => setLineRows((rs) => rs.map((row, j) => j === i ? { ...row, amount: e.target.value } : row))}
                    />
                  </div>
                ))}
              </div>
            ) : row?.type !== "mixing" ? (
              <div>
                <Label className="text-xs">
                  الصنف — المكتوب في البيان: <span className="font-medium">{p.itemDescription || "—"}</span>
                  {!p.item?.candidates.length ? <span className="text-amber-600"> (لا يوجد تطابق، اختر يدوياً)</span> : null}
                </Label>
                <Select value={itemId} onValueChange={setItemId}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="اختر الصنف" /></SelectTrigger>
                  <SelectContent>
                    {(p.item?.candidates || []).map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name} {c.score >= 100 ? "✓" : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label className="text-xs">
                  المنتج التام — المكتوب في البيان: <span className="font-medium">{p.itemDescription || "—"}</span>
                </Label>
                <Select value={itemId} onValueChange={setItemId}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="اختر المنتج" /></SelectTrigger>
                  <SelectContent>
                    {(p.item?.candidates || []).map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name} {c.score >= 100 ? "✓" : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {!lineRows.length ? (
                <div>
                  <Label className="text-xs">{row?.type === "mixing" ? "الكمية المنتجة" : "الكمية"}</Label>
                  <Input className="mt-1 h-9" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                </div>
              ) : null}
              {row?.type !== "mixing" && !lineRows.length ? (
                <div>
                  <Label className="text-xs">سعر الوحدة</Label>
                  <Input className="mt-1 h-9" type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
                </div>
              ) : null}
              <div>
                <Label className="text-xs">المخزن</Label>
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="اختر مخزن" /></SelectTrigger>
                  <SelectContent>
                    {(warehousesQ.data || []).map((w: { id: number; name: string }) => (
                      <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {row?.type !== "mixing" ? (
                <div>
                  <Label className="text-xs">طريقة الدفع</Label>
                  <Select value={paymentType} onValueChange={(v) => setPaymentType(v as "cash" | "credit")}>
                    <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">نقدي</SelectItem>
                      <SelectItem value="credit">آجل</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            {row?.type !== "mixing" ? (
              <p className="text-xs text-slate-500">الإجمالي: <span className="font-medium tabular-nums">{total}</span> ج</p>
            ) : null}

            {row?.type === "mixing" && materialRows.length ? (
              <div className="space-y-2">
                <Label className="text-xs">الخامات المستخدمة</Label>
                {materialRows.map((m, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto_5rem] items-center gap-2 rounded-md border border-slate-200 p-2">
                    <Select value={m.itemId} onValueChange={(v) => setMaterialRows((rows) => rows.map((r, j) => j === i ? { ...r, itemId: v } : r))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={`خامة: ${m.input}`} /></SelectTrigger>
                      <SelectContent>
                        {(p.materials[i]?.candidates || []).map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-[10px] text-slate-400">كمية</span>
                    <Input
                      className="h-8 text-xs"
                      type="number"
                      value={m.quantity}
                      onChange={(e) => setMaterialRows((rows) => rows.map((r, j) => j === i ? { ...r, quantity: e.target.value } : r))}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>إلغاء</Button>
          <Button size="sm" disabled={busy || !p} onClick={submit}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : null} اعتماد وإنشاء المستند
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
