import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown, Search } from "lucide-react";

export type ItemSearchOption = {
  id: number;
  name: string;
  code?: string | null;
  barcode?: string | null;
  unit?: string | null;
  currentStock?: string | number | null;
};

function fmtStock(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

/**
 * قائمة بحث ذكي للصنف — بديل عن `<Select>` العادي اللي بيعرض كل الأصناف في لستة تمرير طويلة.
 * أول ما تكتب حرف بيرشّح فوراً بالاسم أو الكود أو الباركود أو رقم الصنف.
 * مستخرجة من production/Production.tsx عشان تتشارك بين شاشات الفواتير كمان.
 */
export function ItemSearchSelect({
  items, value, onChange, placeholder = "ابحث بالكود أو الاسم أو الباركود...",
  excludeId,
}: {
  items: ItemSearchOption[]; value: string; onChange: (id: string) => void;
  placeholder?: string; excludeId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = items.find((i) => String(i.id) === value);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items
      .filter((i) => !excludeId || String(i.id) !== excludeId)
      .filter((i) => {
        if (!term) return true;
        return (
          i.name.toLowerCase().includes(term)
          || String(i.code || "").toLowerCase().includes(term)
          || String(i.barcode || "").toLowerCase().includes(term)
          || String(i.id).includes(term)
        );
      })
      .slice(0, 80);
  }, [items, q, excludeId]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-9 w-full justify-between font-semibold text-sm px-2">
          <span className="truncate text-right flex-1">
            {selected
              ? `${selected.code ? `${selected.code} — ` : ""}${selected.name}`
              : <span className="text-slate-400 font-medium">{placeholder}</span>}
          </span>
          <ChevronsUpDown size={14} className="opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(24rem,90vw)] p-2" align="start">
        <div className="relative mb-2">
          <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث..." className="h-9 pr-8 text-sm" />
        </div>
        <div className="max-h-56 overflow-y-auto space-y-0.5">
          {filtered.length === 0 ? (
            <p className="text-xs text-slate-400 p-3 text-center">لا نتائج</p>
          ) : filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`w-full text-right rounded-lg px-2.5 py-2 text-sm hover:bg-sky-50 ${
                String(item.id) === value ? "bg-blue-50 text-blue-800 font-bold" : "text-slate-800"
              }`}
              onClick={() => { onChange(String(item.id)); setOpen(false); setQ(""); }}
            >
              <div className="font-bold truncate">{item.code ? `${item.code} — ${item.name}` : item.name}</div>
              <div className="text-[11px] text-slate-500 font-semibold mt-0.5">
                رصيد: {fmtStock(Number(item.currentStock || 0))}{item.unit ? ` ${item.unit}` : ""}
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
