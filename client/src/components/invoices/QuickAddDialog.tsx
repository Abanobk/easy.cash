import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type Kind = "item" | "supplier" | "customer";

const LABELS: Record<Kind, { title: string; nameLabel: string }> = {
  item: { title: "إضافة صنف سريعة", nameLabel: "اسم الصنف *" },
  supplier: { title: "إضافة مورد سريعة", nameLabel: "اسم المورد *" },
  customer: { title: "إضافة عميل سريع", nameLabel: "اسم العميل *" },
};

/** إضافة صنف/مورد/عميل من جوه فاتورة مفتوحة من غير ما تسيب الشاشة — بيرجّع السجل الجديد عشان يتحدد تلقائيًا */
export function QuickAddDialog({
  kind,
  open,
  onClose,
  onCreated,
}: {
  kind: Kind;
  open: boolean;
  onClose: () => void;
  onCreated: (row: { id: number; name: string }) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [price, setPrice] = useState("");
  const utils = trpc.useUtils();

  const reset = () => { setName(""); setPhone(""); setPrice(""); };
  const close = () => { reset(); onClose(); };

  const itemMut = trpc.items.create.useMutation({
    onSuccess: async () => {
      await utils.items.all.invalidate();
      const rows = await utils.items.all.fetch();
      const created = rows?.find((r) => r.name === name);
      toast.success("تم إضافة الصنف");
      if (created) onCreated({ id: created.id, name: created.name });
      close();
    },
    onError: (e) => toast.error(e.message),
  });
  const supplierMut = trpc.suppliers.create.useMutation({
    onSuccess: async () => {
      await utils.suppliers.all.invalidate();
      const rows = await utils.suppliers.all.fetch();
      const created = rows?.find((r) => r.name === name);
      toast.success("تم إضافة المورد");
      if (created) onCreated({ id: created.id, name: created.name });
      close();
    },
    onError: (e) => toast.error(e.message),
  });
  const customerMut = trpc.customers.create.useMutation({
    onSuccess: async () => {
      await utils.customers.all.invalidate();
      const rows = await utils.customers.all.fetch();
      const created = rows?.find((r) => r.name === name);
      toast.success("تم إضافة العميل");
      if (created) onCreated({ id: created.id, name: created.name });
      close();
    },
    onError: (e) => toast.error(e.message),
  });

  const isPending = itemMut.isPending || supplierMut.isPending || customerMut.isPending;

  const submit = () => {
    if (!name.trim()) { toast.error("الاسم مطلوب"); return; }
    if (kind === "item") itemMut.mutate({ name: name.trim(), salePrice: price || undefined, purchasePrice: price || undefined });
    else if (kind === "supplier") supplierMut.mutate({ name: name.trim(), phone: phone || undefined } as any);
    else customerMut.mutate({ name: name.trim(), phone: phone || undefined } as any);
  };

  const meta = LABELS[kind];
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{meta.title}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs font-medium text-slate-700 mb-1.5 block">{meta.nameLabel}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="h-9 text-sm" />
          </div>
          {kind !== "item" && (
            <div>
              <Label className="text-xs font-medium text-slate-700 mb-1.5 block">تليفون</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9 text-sm" />
            </div>
          )}
          {kind === "item" && (
            <div>
              <Label className="text-xs font-medium text-slate-700 mb-1.5 block">السعر (اختياري)</Label>
              <Input value={price} onChange={(e) => setPrice(e.target.value)} type="number" className="h-9 text-sm" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>إلغاء</Button>
          <Button onClick={submit} disabled={isPending}>{isPending ? "جاري الحفظ..." : "إضافة واختيار"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
