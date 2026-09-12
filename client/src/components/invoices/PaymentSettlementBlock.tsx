import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { BankAccountSearchSelect } from "@/components/BankAccountSearchSelect";

export interface Settlement {
  cashAmount: string;
  bankAmount: string;
  bankAccountId?: number;
}

/** تسوية الفاتورة: نقدي + بنك محدد في نفس الفاتورة، والباقي على حساب الطرف — زي «المدفوع نقدي/بنكي» في ميجا كاش */
export function PaymentSettlementBlock({
  total,
  value,
  onChange,
  partyLabel,
  partyBalanceBefore,
  isCash,
}: {
  total: number;
  value: Settlement;
  onChange: (v: Settlement) => void;
  partyLabel: string;
  partyBalanceBefore?: number;
  /** فاتورة نقدية بالكامل: لو المستخدم مسيبش نقدي/بنكي فاضيين، اعتبرها مسددة بالكامل نقدًا في المعاينة (مطابقة لسلوك السيرفر) */
  isCash?: boolean;
}) {
  const { data: bankAccounts } = trpc.bank.accounts.list.useQuery();
  const untouched = Number(value.cashAmount) === 0 && Number(value.bankAmount) === 0;
  const cash = isCash && untouched ? total : (Number(value.cashAmount) || 0);
  const bank = Number(value.bankAmount) || 0;
  const onAccount = Math.max(0, total - cash - bank);
  const before = partyBalanceBefore ?? 0;
  const after = before + onAccount;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div>
        <Label className="text-xs font-medium text-slate-700 mb-1.5 block">المدفوع نقدي</Label>
        <Input
          value={value.cashAmount}
          onChange={(e) => onChange({ ...value, cashAmount: e.target.value })}
          type="number"
          placeholder={isCash && untouched ? `${total.toLocaleString("en-US", { minimumFractionDigits: 2 })} (افتراضي)` : undefined}
          className="h-9 text-sm"
        />
      </div>
      <div>
        <Label className="text-xs font-medium text-slate-700 mb-1.5 block">المدفوع بنكي</Label>
        <Input value={value.bankAmount} onChange={(e) => onChange({ ...value, bankAmount: e.target.value })} type="number" className="h-9 text-sm" />
      </div>
      <div>
        <Label className="text-xs font-medium text-slate-700 mb-1.5 block">حساب البنك</Label>
        <BankAccountSearchSelect
          accounts={bankAccounts || []}
          value={value.bankAccountId?.toString() || ""}
          onChange={(v) => onChange({ ...value, bankAccountId: v ? Number(v) : undefined })}
          placeholder="اختر البنك"
        />
      </div>
      <div className="rounded-md bg-slate-50 border border-slate-100 px-3 py-2 text-xs space-y-1">
        <div className="flex justify-between text-slate-500"><span>الباقي على {partyLabel}:</span><span className="font-semibold text-slate-700">{onAccount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span></div>
        <div className="flex justify-between text-slate-500"><span>رصيد {partyLabel} قبل:</span><span>{before.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span></div>
        <div className="flex justify-between text-slate-700 font-semibold"><span>رصيد {partyLabel} بعد:</span><span>{after.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span></div>
      </div>
    </div>
  );
}
