import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Layers, Plus, Trash2 } from "lucide-react";

export interface BatchSplitRow {
  batchNumber?: string;
  expiryDate?: string;
  quantity: string;
}

/** تقسيم كمية بند واحد على أكتر من رقم تشغيلة (Batch) — الحالة الشائعة (تشغيلة واحدة) تفضل زي ما هي من غير فتح المحرر */
export function BatchSplitEditor({
  totalQuantity,
  value,
  onChange,
}: {
  totalQuantity: string;
  value: BatchSplitRow[];
  onChange: (rows: BatchSplitRow[]) => void;
}) {
  const splitSum = value.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const remaining = (Number(totalQuantity) || 0) - splitSum;

  const addRow = () => onChange([...value, { quantity: remaining > 0 ? String(remaining) : "0" }]);
  const update = (idx: number, patch: Partial<BatchSplitRow>) => {
    const next = [...value];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className={`h-8 w-8 p-0 ${value.length > 1 ? "text-blue-600" : "text-slate-400"}`} title="تقسيم على أكثر من تشغيلة">
          <Layers size={14} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">تقسيم على تشغيلات</span>
            <Button type="button" size="sm" variant="outline" className="h-6 gap-1 text-[11px]" onClick={addRow}><Plus size={11} />تشغيلة</Button>
          </div>
          {value.length === 0 && <div className="text-[11px] text-slate-400">تشغيلة واحدة (افتراضي) — اضغط «تشغيلة» للتقسيم</div>}
          {value.map((row, idx) => (
            <div key={idx} className="grid grid-cols-9 gap-1 items-center">
              <Input value={row.batchNumber || ""} onChange={(e) => update(idx, { batchNumber: e.target.value })} placeholder="رقم التشغيلة" className="h-7 text-[11px] col-span-4" />
              <Input value={row.expiryDate || ""} onChange={(e) => update(idx, { expiryDate: e.target.value })} type="date" className="h-7 text-[11px] col-span-3" />
              <Input value={row.quantity} onChange={(e) => update(idx, { quantity: e.target.value })} type="number" className="h-7 text-[11px] col-span-1" />
              <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 col-span-1" onClick={() => remove(idx)}><Trash2 size={11} /></Button>
            </div>
          ))}
          {value.length > 0 && (
            <div className={`text-[11px] ${Math.abs(remaining) > 0.001 ? "text-red-600" : "text-emerald-600"}`}>
              {Math.abs(remaining) > 0.001 ? `الفرق عن كمية السطر: ${remaining.toFixed(3)}` : "الكمية مطابقة لكمية السطر ✓"}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
