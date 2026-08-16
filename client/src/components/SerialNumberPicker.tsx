import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface SerialNumberPickerProps {
  itemId: number;
  warehouseId?: number;
  value: string;
  onChange: (value: string) => void;
  maxCount?: number;
}

export function SerialNumberPicker({
  itemId,
  warehouseId,
  value,
  onChange,
  maxCount,
}: SerialNumberPickerProps) {
  const selected = useMemo(
    () => value.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean),
    [value],
  );

  const { data: serials = [], isLoading } = trpc.parity.inventory.serials.available.useQuery(
    { itemId, warehouseId },
    { enabled: itemId > 0 },
  );

  const toggle = (serialNumber: string) => {
    const set = new Set(selected);
    if (set.has(serialNumber)) {
      set.delete(serialNumber);
    } else {
      if (maxCount && set.size >= maxCount) return;
      set.add(serialNumber);
    }
    onChange([...set].join(", "));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs w-full justify-between font-normal"
        >
          {selected.length ? `${selected.length} سيريال` : "اختر من المخزن"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 max-h-52 overflow-y-auto" align="start">
        {isLoading ? (
          <p className="text-xs text-slate-400 p-2">جاري التحميل...</p>
        ) : !warehouseId ? (
          <p className="text-xs text-amber-600 p-2">اختر المخزن أولاً</p>
        ) : serials.length === 0 ? (
          <p className="text-xs text-slate-400 p-2">لا توجد أرقام متاحة</p>
        ) : (
          serials.map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer"
            >
              <Checkbox
                checked={selected.includes(s.serialNumber)}
                onCheckedChange={() => toggle(s.serialNumber)}
              />
              <span className="font-mono text-xs">{s.serialNumber}</span>
            </label>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}
