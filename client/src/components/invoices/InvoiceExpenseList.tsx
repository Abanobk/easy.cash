import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { AccountSearchSelect } from "@/components/AccountSearchSelect";
import { Plus, Trash2 } from "lucide-react";

export interface InvoiceExpenseLine {
  currencyCode: string;
  exchangeRate: string;
  amount: string;
  creditAccountId?: number;
  notes?: string;
}

/** قائمة مصروفات متكررة على مستوى الفاتورة (نولون/جمارك...) — كل مصروف بحسابه الدائن الخاص، زي قسم «المصروفات» في ميجا كاش */
export function InvoiceExpenseList({
  value,
  onChange,
}: {
  value: InvoiceExpenseLine[];
  onChange: (rows: InvoiceExpenseLine[]) => void;
}) {
  const { data: accounts } = trpc.accounts.chart.useQuery();
  const leafAccounts = (accounts || []).filter((a: any) => !a.isParent);

  const addRow = () => onChange([...value, { currencyCode: "EGP", exchangeRate: "1", amount: "0" }]);
  const update = (idx: number, patch: Partial<InvoiceExpenseLine>) => {
    const next = [...value];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-600">المصروفات</span>
        <Button type="button" onClick={addRow} size="sm" variant="outline" className="h-7 gap-1 text-xs"><Plus size={12} />إضافة مصروف</Button>
      </div>
      {value.length === 0 && <div className="text-xs text-slate-400 py-2 text-center border border-dashed border-slate-200 rounded">لا توجد مصروفات مضافة</div>}
      {value.map((row, idx) => (
        <div key={idx} className="grid grid-cols-12 gap-2 items-center">
          <div className="col-span-2">
            <Input value={row.currencyCode} onChange={(e) => update(idx, { currencyCode: e.target.value })} placeholder="العملة" className="h-8 text-xs" />
          </div>
          <div className="col-span-2">
            <Input value={row.exchangeRate} onChange={(e) => update(idx, { exchangeRate: e.target.value })} type="number" placeholder="سعر الصرف" className="h-8 text-xs" />
          </div>
          <div className="col-span-2">
            <Input value={row.amount} onChange={(e) => update(idx, { amount: e.target.value })} type="number" placeholder="المبلغ" className="h-8 text-xs" />
          </div>
          <div className="col-span-3">
            <AccountSearchSelect
              accounts={leafAccounts}
              value={row.creditAccountId?.toString() || ""}
              onChange={(v) => update(idx, { creditAccountId: Number(v) })}
              placeholder="الحساب الدائن"
            />
          </div>
          <div className="col-span-2">
            <Input value={row.notes || ""} onChange={(e) => update(idx, { notes: e.target.value })} placeholder="ملاحظات" className="h-8 text-xs" />
          </div>
          <div className="col-span-1 flex justify-end">
            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={() => remove(idx)}><Trash2 size={12} /></Button>
          </div>
        </div>
      ))}
    </div>
  );
}
