import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown, Search, Star } from "lucide-react";
import { normalizeArabicKey } from "@shared/arabic-normalize";

export type SearchSelectOption = {
  id: number | string;
  /** السطر الرئيسي — بيتعرض وبيتفلتر عليه */
  label: string;
  /** سطر فرعي اختياري تحت الرئيسي (رصيد، تليفون، كود حساب، إلخ) — بيتعرض وبيتفلتر عليه */
  sublabel?: string;
  /** كلمات إضافية تتفلتر عليها من غير ما تتعرض (باركود، رقم صنف، إلخ) */
  keywords?: string;
};

/**
 * قائمة بحث ذكي عامة — بديل عن `<Select>` العادي لأي قائمة كبيرة (عملاء، موردين، حسابات،
 * بنوك، موظفين...). أول ما تكتب حرف بترشّح فوراً بكل حاجة في label/sublabel/keywords.
 * القلب المشترك اللي بُني عليه ItemSearchSelect أصلاً — أي تحسين هنا بينعكس على الكل.
 */
export function SearchSelect({
  options, value, onChange, placeholder = "بحث...", excludeId, emptyLabel = "لا نتائج",
  favoriteIds, onToggleFavorite,
}: {
  options: SearchSelectOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  excludeId?: string;
  emptyLabel?: string;
  /** لو موجودة: العناصر اللي id بتاعها جوّاها بتتقدّم فوق القايمة قبل ما تكتب أي حرف */
  favoriteIds?: Set<string>;
  /** لو موجودة: بيظهر نجمة جنب كل عنصر تقدر تدوس عليها تضيف/تشيل من المفضلة */
  onToggleFavorite?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = options.find((o) => String(o.id) === value);
  const filtered = useMemo(() => {
    // توحيد عربي (همزات/تاء مربوطة/تشكيل) عشان "احمد" و"أحمد" يتطابقوا في البحث،
    // وتقسيم كل كلمة لوحدها عشان "TR كرتونة" يلاقي الكود في label والاسم في نفس label
    // حتى لو مش متجاورين حرفياً (زي "TR-0012 — كرتونة كبيرة")
    const terms = normalizeArabicKey(q).split(/\s+/).filter(Boolean);
    const matched = options
      .filter((o) => !excludeId || String(o.id) !== excludeId)
      .filter((o) => {
        if (terms.length === 0) return true;
        const haystack = [
          normalizeArabicKey(o.label),
          normalizeArabicKey(o.sublabel),
          normalizeArabicKey(o.keywords),
          String(o.id),
        ].join(" ");
        return terms.every((t) => haystack.includes(t));
      });
    // من غير كتابة بحث: المفضلة تظهر الأول عشان تسهّل الاختيار السريع
    if (terms.length === 0 && favoriteIds?.size) {
      const fav = matched.filter((o) => favoriteIds.has(String(o.id)));
      const rest = matched.filter((o) => !favoriteIds.has(String(o.id)));
      return [...fav, ...rest].slice(0, 80);
    }
    return matched.slice(0, 80);
  }, [options, q, excludeId, favoriteIds]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-9 w-full justify-between font-semibold text-sm px-2">
          <span className="truncate text-right flex-1">
            {selected
              ? selected.label
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
            <p className="text-xs text-slate-400 p-3 text-center">{emptyLabel}</p>
          ) : filtered.map((o) => {
            const isFav = !!favoriteIds?.has(String(o.id));
            return (
              <div key={o.id} className="flex items-center gap-1">
                {onToggleFavorite && (
                  <button
                    type="button"
                    className="shrink-0 p-1.5 rounded-md hover:bg-amber-50"
                    title={isFav ? "إزالة من المفضلة" : "إضافة للمفضلة"}
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite(String(o.id)); }}
                  >
                    <Star size={14} className={isFav ? "fill-amber-400 text-amber-400" : "text-slate-300"} />
                  </button>
                )}
                <button
                  type="button"
                  className={`flex-1 min-w-0 text-right rounded-lg px-2.5 py-2 text-sm hover:bg-sky-50 ${
                    String(o.id) === value ? "bg-blue-50 text-blue-800 font-bold" : "text-slate-800"
                  }`}
                  onClick={() => { onChange(String(o.id)); setOpen(false); setQ(""); }}
                >
                  <div className="font-bold truncate">{o.label}</div>
                  {o.sublabel && (
                    <div className="text-[11px] text-slate-500 font-semibold mt-0.5">{o.sublabel}</div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
