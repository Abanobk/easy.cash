import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

export type PaymentReceiptFile = {
  fileName: string;
  mimeType: string;
  contentBase64: string;
  file: File;
};

export type PaymentSplit = { cashAmount: string; bankAmount: string; bankAccountId?: number };

type InvoicePaymentDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  partyLabel: string;
  partyName?: string;
  invoiceNumber: string;
  remaining: number;
  onSubmit: (amount: string, date: string, receipt?: PaymentReceiptFile, split?: PaymentSplit) => void;
  isLoading?: boolean;
};

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(new Error("فشل قراءة الملف"));
    reader.readAsDataURL(file);
  });
}

export function InvoicePaymentDialog({
  open,
  onClose,
  title,
  partyLabel,
  partyName,
  invoiceNumber,
  remaining,
  onSubmit,
  isLoading,
}: InvoicePaymentDialogProps) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [receiptName, setReceiptName] = useState("");
  const [receipt, setReceipt] = useState<PaymentReceiptFile | undefined>();
  const [bankAmount, setBankAmount] = useState("0");
  const [bankAccountId, setBankAccountId] = useState<number | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: bankAccounts } = trpc.bank.accounts.list.useQuery(undefined, { enabled: open });

  useEffect(() => {
    if (open) {
      setAmount(remaining > 0 ? remaining.toFixed(2) : "");
      setDate(new Date().toISOString().split("T")[0]);
      setReceipt(undefined);
      setReceiptName("");
      setBankAmount("0");
      setBankAccountId(undefined);
    }
  }, [open, remaining]);

  const cashAmount = Math.max(0, (Number(amount) || 0) - (Number(bankAmount) || 0));

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm space-y-1">
            <p><span className="text-slate-500">الفاتورة:</span> <span className="font-medium">{invoiceNumber}</span></p>
            <p><span className="text-slate-500">{partyLabel}:</span> <span className="font-medium">{partyName || "—"}</span></p>
            <p><span className="text-slate-500">المتبقي:</span> <span className="font-semibold text-red-600">{remaining.toLocaleString("en-US")} ج.م</span></p>
          </div>
          <div>
            <Label className="text-xs">المبلغ</Label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">التاريخ</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">منه بنكي (اختياري)</Label>
              <Input type="number" min="0" step="0.01" value={bankAmount} onChange={(e) => setBankAmount(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">حساب البنك</Label>
              <Select value={bankAccountId?.toString() || "none"} onValueChange={(v) => setBankAccountId(v === "none" ? undefined : Number(v))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر البنك" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون</SelectItem>
                  {bankAccounts?.map((b) => <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {Number(bankAmount) > 0 && (
            <p className="text-[11px] text-slate-500">نقدي: {cashAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} + بنكي: {(Number(bankAmount) || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} = {(Number(amount) || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
          )}
          <div>
            <Label className="text-xs">صورة/PDF الإيصال (اختياري)</Label>
            <Input
              ref={fileRef}
              type="file"
              className="mt-1 h-9"
              accept=".pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) {
                  setReceipt(undefined);
                  setReceiptName("");
                  return;
                }
                const contentBase64 = await readFileAsBase64(file);
                setReceipt({
                  fileName: file.name,
                  mimeType: file.type || "application/octet-stream",
                  contentBase64,
                  file,
                });
                setReceiptName(file.name);
              }}
            />
            <p className="text-[11px] text-slate-500 mt-1">
              {receiptName ? `مرفق: ${receiptName}` : "غير إلزامي — للمقارنة المستندية لاحقاً"}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            onClick={() => onSubmit(amount, date, receipt, { cashAmount: String(cashAmount), bankAmount, bankAccountId })}
            disabled={isLoading || !amount || Number(amount) <= 0 || (Number(bankAmount) > 0 && !bankAccountId)}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {isLoading ? "جاري الحفظ..." : "تأكيد"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
