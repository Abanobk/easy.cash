import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

/** حوار تحويل أمر شراء (كلي أو جزئي) لفاتورة — بيعرض الباقي الفعلي من كل بند، وبيسمح تحويل جزء بس */
export function ConvertOrderDialog({ orderId, onClose, onConverted }: { orderId: number | null; onClose: () => void; onConverted: () => void }) {
  const { data: order } = trpc.purchases.orders.byId.useQuery(orderId as number, { enabled: orderId != null });
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentType, setPaymentType] = useState<"cash" | "credit">("credit");
  const [qty, setQty] = useState<Record<number, string>>({});

  useEffect(() => {
    if (order?.items) {
      const initial: Record<number, string> = {};
      for (const it of order.items) initial[it.id] = String((it as any).remaining ?? 0);
      setQty(initial);
    }
  }, [order?.id]);

  const convertMut = trpc.purchases.orders.convertToInvoice.useMutation({
    onSuccess: (res) => {
      toast.success(`تم إنشاء الفاتورة ${res.number} — حالة الأمر: ${res.status === "partial" ? "جزئي" : res.status === "received" ? "مكتمل" : res.status}`);
      onConverted();
    },
    onError: (e) => toast.error(e.message),
  });

  const submit = () => {
    if (!order) return;
    const items = order.items
      .map((it: any) => ({ orderItemId: it.id, quantity: qty[it.id] ?? "0" }))
      .filter((it: any) => Number(it.quantity) > 0);
    if (!items.length) { toast.error("حدد كمية للتحويل في بند واحد على الأقل"); return; }
    convertMut.mutate({ orderId: orderId as number, date, paymentType, items });
  };

  return (
    <Dialog open={orderId != null} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader><DialogTitle>تحويل أمر الشراء {order?.number} لفاتورة</DialogTitle></DialogHeader>
        {!order ? (
          <div className="py-6 text-center text-sm text-slate-400">جاري التحميل...</div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">تاريخ الفاتورة</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">نوع الدفع</Label>
                <Select value={paymentType} onValueChange={(v) => setPaymentType(v as any)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="cash">نقدي</SelectItem><SelectItem value="credit">آجل</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="text-right text-xs">الصنف</TableHead>
                    <TableHead className="text-right text-xs">الكمية الكلية</TableHead>
                    <TableHead className="text-right text-xs">تم تحويله</TableHead>
                    <TableHead className="text-right text-xs">الباقي</TableHead>
                    <TableHead className="text-right text-xs">تحويل الآن</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((it: any) => (
                    <TableRow key={it.id}>
                      <TableCell className="text-xs">{it.itemName}</TableCell>
                      <TableCell className="text-xs">{Number(it.quantity).toLocaleString("en-US")}</TableCell>
                      <TableCell className="text-xs text-slate-500">{Number(it.convertedQuantity || 0).toLocaleString("en-US")}</TableCell>
                      <TableCell className="text-xs font-medium text-blue-700">{Number(it.remaining).toLocaleString("en-US")}</TableCell>
                      <TableCell className="p-1">
                        <Input
                          type="number"
                          value={qty[it.id] ?? "0"}
                          max={it.remaining}
                          onChange={(e) => setQty((p) => ({ ...p, [it.id]: e.target.value }))}
                          className="h-8 text-xs w-24"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>إلغاء</Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={submit} disabled={convertMut.isPending || !order}>
            {convertMut.isPending ? "جاري التحويل..." : "تحويل لفاتورة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
