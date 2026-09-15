import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown, Search, X } from "lucide-react";
import { normalizeArabicKey } from "@shared/arabic-normalize";

export type SearchSelectOption = {
  id: number | string;
  /** السطر الرئيسي — بيتعرض وبيتفلتر عليه */
  label: string;
  /** سطر فرعي اختياري تحت الرئيسي (رصيد، تليفون، كود حساب، إلخ) */
  sublabel?: string;
  /** كلمات إضافية تتفلتر عليها من غير ما تتعرض (باركود، رقم صنف، إلخ) */
  keywords?: string;
};

/**
 * بحث ذكي Combobox — اكتب حرف فوراً وهيرشّح.
 * - modal + z-[200]: القائمة تفضل قابلة للكتابة والضغط جوّه FormModal/Dialog (z-50).
 * - توحيد عربي عبر normalizeArabicKey.
 */
export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = "بحث...",
  excludeId,
  emptyLabel = "لا نتائج",
}: {
  options: SearchSelectOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  excludeId?: string;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => String(o.id) === value);

  const filtered = useMemo(() => {
    const term = normalizeArabicKey(q);
    return options
      .filter((o) => !excludeId || String(o.id) !== excludeId)
      .filter((o) => {
        if (!term) return true;
        return (
          normalizeArabicKey(o.label).includes(term)
          || normalizeArabicKey(o.sublabel).includes(term)
          || normalizeArabicKey(o.keywords).includes(term)
          || String(o.id).includes(term)
        );
      })
      .slice(0, 80);
  }, [options, q, excludeId]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
    setQ("");
  };

  const clear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange("");
    setQ("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQ("");
      }}
      modal
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 w-full min-w-0 max-w-full items-center gap-1 overflow-hidden rounded-md border border-input bg-background px-2 text-sm font-medium shadow-xs hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span className="truncate text-right flex-1 min-w-0">
            {selected ? (
              selected.label
            ) : (
              <span className="text-slate-400 font-normal">{placeholder}</span>
            )}
          </span>
          {value ? (
            <span
              role="button"
              tabIndex={-1}
              className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700"
              onClick={clear}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") clear(e as any); }}
              aria-label="مسح"
            >
              <X size={12} />
            </span>
          ) : (
            <ChevronsUpDown size={13} className="opacity-50 shrink-0" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[200] w-[min(28rem,92vw)] p-2"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="relative mb-2">
          <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <Input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="اكتب حرف للبحث..."
            className="h-9 pr-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && filtered.length === 1) {
                e.preventDefault();
                pick(String(filtered[0].id));
              }
              if (e.key === "Escape") setOpen(false);
            }}
          />
        </div>
        <div className="max-h-56 overflow-y-auto space-y-0.5">
          {options.length === 0 ? (
            <p className="text-xs text-slate-400 p-3 text-center">لا توجد عناصر للبحث</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-slate-400 p-3 text-center">{emptyLabel}</p>
          ) : filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`w-full text-right rounded-lg px-2.5 py-2 text-sm hover:bg-sky-50 ${
                String(o.id) === value ? "bg-blue-50 text-blue-800 font-bold" : "text-slate-800"
              }`}
              onClick={() => pick(String(o.id))}
            >
              <div className="font-bold truncate">{o.label}</div>
              {o.sublabel && (
                <div className="text-[11px] text-slate-500 font-semibold mt-0.5">{o.sublabel}</div>
              )}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5 px-1">
          {filtered.length} نتيجة{q ? ` لـ «${q}»` : ""} · إجمالي {options.length}
        </p>
      </PopoverContent>
    </Popover>
  );
}
