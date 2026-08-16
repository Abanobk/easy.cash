import { useEffect, useState } from "react";
import { CalendarIcon } from "lucide-react";
import { ar } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { entryControlClass } from "@/components/form/EntryForm";

/** Convert ISO yyyy-mm-dd → dd/mm/yyyy for display */
export function isoToDisplayDate(iso: string | null | undefined): string {
  const s = String(iso || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

/** Parse dd/mm/yyyy (or yyyy-mm-dd) → ISO yyyy-mm-dd, or "" if invalid/empty */
export function displayToIsoDate(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!m) return "";
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isoToLocalDate(iso: string): Date | undefined {
  const s = String(iso || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return undefined;
  return dt;
}

function localDateToIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type DateFieldProps = {
  value: string;
  onChange: (iso: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  /** السماح بالكتابة اليدوية بصيغة يوم/شهر/سنة (اختياري) */
  allowTyping?: boolean;
};

/**
 * تقويم للاختيار + عرض يوم/شهر/سنة.
 * القيمة دائمًا ISO yyyy-mm-dd للـ API.
 */
export function DateField({
  value,
  onChange,
  className,
  placeholder = "يوم/شهر/سنة",
  disabled,
  id,
  name,
  allowTyping = true,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => isoToDisplayDate(value));
  const selected = isoToLocalDate(value);
  const startMonth = new Date(1990, 0);
  const endMonth = new Date(new Date().getFullYear() + 15, 11);

  useEffect(() => {
    setText(isoToDisplayDate(value));
  }, [value]);

  const commitText = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange("");
      setText("");
      return;
    }
    const iso = displayToIsoDate(trimmed);
    if (iso) {
      onChange(iso);
      setText(isoToDisplayDate(iso));
    } else {
      setText(isoToDisplayDate(value));
    }
  };

  const applyDate = (d: Date | undefined) => {
    if (!d) {
      onChange("");
      setText("");
      return;
    }
    const iso = localDateToIso(d);
    onChange(iso);
    setText(isoToDisplayDate(iso));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn("relative w-full", className)}>
        <input
          id={id}
          name={name}
          type="text"
          inputMode={allowTyping ? "numeric" : undefined}
          dir="ltr"
          disabled={disabled}
          readOnly={!allowTyping}
          placeholder={placeholder}
          value={text}
          autoComplete="off"
          className={cn(
            "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none md:text-sm",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            entryControlClass,
            "text-left tracking-wide pl-11",
            !allowTyping && "cursor-pointer",
            disabled && "pointer-events-none opacity-50",
          )}
          onClick={() => {
            if (!disabled) setOpen(true);
          }}
          onChange={
            allowTyping
              ? (e) => {
                  const v = e.target.value;
                  setText(v);
                  if (displayToIsoDate(v)) onChange(displayToIsoDate(v));
                }
              : undefined
          }
          onBlur={allowTyping ? (e) => commitText(e.target.value) : undefined}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (allowTyping) commitText((e.target as HTMLInputElement).value);
              else setOpen(true);
            }
            if (e.key === "ArrowDown" && !open) {
              e.preventDefault();
              setOpen(true);
            }
          }}
        />
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            className="absolute left-1 top-1/2 z-10 h-9 w-9 -translate-y-1/2 p-0 hover:bg-blue-50"
            aria-label="فتح التقويم"
          >
            <CalendarIcon className="size-4 text-blue-700" />
          </Button>
        </PopoverTrigger>
      </div>

      <PopoverContent className="w-auto p-0 z-[80]" align="start" dir="rtl">
        <Calendar
          mode="single"
          locale={ar}
          captionLayout="dropdown"
          selected={selected}
          defaultMonth={selected ?? new Date()}
          startMonth={startMonth}
          endMonth={endMonth}
          onSelect={(d) => {
            applyDate(d);
            setOpen(false);
          }}
        />
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-sm font-bold text-slate-600"
            onClick={() => {
              applyDate(undefined);
              setOpen(false);
            }}
          >
            مسح
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-sm font-bold text-blue-700"
            onClick={() => {
              applyDate(new Date());
              setOpen(false);
            }}
          >
            اليوم
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
