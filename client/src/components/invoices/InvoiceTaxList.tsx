import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Plus, Trash2 } from "lucide-react";

export interface InvoiceTaxLine {
  taxId?: number;
  name?: string;
  rate?: string;
  amount: string;
  glAccountId?: number;
}

/** قائمة ضرائب متكررة على مستوى الفاتورة — كل ضريبة بحسابها الدائن الخاص، زي قسم «الضرائب» في ميجا كاش */
export function InvoiceTaxList({
  value,
  onChange,
  baseAmount,
}: {
  value: InvoiceTaxLine[];
  onChange: (rows: InvoiceTaxLine[]) => void;
  baseAmount: number;
}) {
  const { data: taxes } = trpc.accounts.taxes.list.useQuery();
  const { data: accounts } = trpc.accounts.chart.useQuery();
  const leafAccounts = (accounts || []).filter((a: any) => !a.isParent);

  const addRow = () => onChange([...value, { amount: "0" }]);
  const update = (idx: number, patch: Partial<InvoiceTaxLine>) => {
    const next = [...value];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-600">الضرائب</span>
        <Button type="button" onClick={addRow} size="sm" variant="outline" className="h-7 gap-1 text-xs"><Plus size={12} />إضافة ضريبة</Button>
      </div>
      {value.length === 0 && <div className="text-xs text-slate-400 py-2 text-center border border-dashed border-slate-200 rounded">لا توجد ضرائب مضافة</div>}
      {value.map((row, idx) => (
        <div key={idx} className="grid grid-cols-12 gap-2 items-center">
          <div className="col-span-4">
            <Select
              value={row.taxId?.toString() || ""}
              onValueChange={(v) => {
                const t = taxes?.find((x) => x.id === Number(v));
                const amount = t ? ((Number(t.rate) / 100) * baseAmount).toFixed(2) : row.amount;
                update(idx, { taxId: t?.id, name: t?.name, rate: t?.rate?.toString(), glAccountId: (t as any)?.glAccountId ?? undefined, amount });
              }}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="اختر الضريبة" /></SelectTrigger>
              <SelectContent>{taxes?.map((t) => <SelectItem key={t.id} value={t.id.toString()}>{t.name} ({t.rate}%)</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-3">
            <Select
              value={row.glAccountId?.toString() || ""}
              onValueChange={(v) => update(idx, { glAccountId: Number(v) })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الحساب الدائن" /></SelectTrigger>
              <SelectContent>{leafAccounts.map((a: any) => <SelectItem key={a.id} value={a.id.toString()}>{a.code} - {a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-3">
            <Input value={row.amount} onChange={(e) => update(idx, { amount: e.target.value })} type="number" placeholder="المبلغ" className="h-8 text-xs" />
          </div>
          <div className="col-span-2 flex justify-end">
            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={() => remove(idx)}><Trash2 size={12} /></Button>
          </div>
        </div>
      ))}
    </div>
  );
}
