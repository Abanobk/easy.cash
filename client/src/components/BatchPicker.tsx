import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface BatchPickerProps {
  itemId: number;
  value?: number;
  onChange: (batchId: number | undefined) => void;
}

export function BatchPicker({ itemId, value, onChange }: BatchPickerProps) {
  const { data: batches = [], isLoading } = trpc.parity.inventory.batches.available.useQuery(
    { itemId },
    { enabled: itemId > 0 },
  );

  if (itemId <= 0) {
    return <span className="text-xs text-slate-300">—</span>;
  }

  if (isLoading) {
    return <span className="text-xs text-slate-400">...</span>;
  }

  if (batches.length === 0) {
    return <span className="text-xs text-slate-400">FEFO تلقائي</span>;
  }

  return (
    <Select
      value={value ? String(value) : "auto"}
      onValueChange={(v) => onChange(v === "auto" ? undefined : Number(v))}
    >
      <SelectTrigger className="h-8 text-xs w-full">
        <SelectValue placeholder="دفعة" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="auto">تلقائي (FEFO)</SelectItem>
        {batches.map((b) => (
          <SelectItem key={b.id} value={String(b.id)}>
            {b.batchNumber}
            {b.expiryDate ? ` — ${new Date(b.expiryDate).toLocaleDateString("en-GB")}` : ""}
            {` (${Number(b.quantity).toLocaleString("en-US")})`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
