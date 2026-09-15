/**
 * شريط فلاتر قائمة حركات الخزينة/البنك — نفس فكرة OrderReturnListFilterBar لكن مبسّط لحركات نقدية/بنكية
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type FinanceTxListFiltersValue = {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  partyId?: number;
  number?: string;
  referenceNumber?: string;
  search?: string;
};

type Opt = { id: number; name: string };

const DEFAULT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "draft", label: "مسودة" },
  { value: "confirmed", label: "معتمدة" },
  { value: "cancelled", label: "ملغاة" },
];

export function FinanceTxListFilterBar({
  value,
  onChange,
  onClear,
  partyLabel,
  parties,
  statusOptions = DEFAULT_STATUS_OPTIONS,
  hideReferenceNumber = false,
  numberLabel = "المسلسل",
  referenceNumberLabel = "رقم المرجع",
  searchPlaceholder = "رقم / بيان…",
}: {
  value: FinanceTxListFiltersValue;
  onChange: (next: FinanceTxListFiltersValue) => void;
  onClear: () => void;
  partyLabel?: string;
  parties?: Opt[];
  /** حالات مخصّصة (مثلاً شيكات: معلق/محصّل/مرتجع) */
  statusOptions?: { value: string; label: string }[];
  hideReferenceNumber?: boolean;
  numberLabel?: string;
  referenceNumberLabel?: string;
  searchPlaceholder?: string;
}) {
  const set = <K extends keyof FinanceTxListFiltersValue>(key: K, v: FinanceTxListFiltersValue[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 mb-3 space-y-3" dir="rtl">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        <div>
          <Label className="text-[10px] text-slate-500">من تاريخ</Label>
          <Input type="date" className="h-8 text-xs" value={value.dateFrom || ""} onChange={(e) => set("dateFrom", e.target.value || undefined)} />
        </div>
        <div>
          <Label className="text-[10px] text-slate-500">الى تاريخ</Label>
          <Input type="date" className="h-8 text-xs" value={value.dateTo || ""} onChange={(e) => set("dateTo", e.target.value || undefined)} />
        </div>
        <div>
          <Label className="text-[10px] text-slate-500">الحالة</Label>
          <Select value={value.status || "all"} onValueChange={(v) => set("status", v === "all" ? undefined : v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الكل" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {statusOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {parties && parties.length > 0 && (
          <div>
            <Label className="text-[10px] text-slate-500">{partyLabel || "الطرف"}</Label>
            <Select value={value.partyId?.toString() || "all"} onValueChange={(v) => set("partyId", v === "all" ? undefined : Number(v))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الكل" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {parties.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label className="text-[10px] text-slate-500">{numberLabel}</Label>
          <Input className="h-8 text-xs" value={value.number || ""} onChange={(e) => set("number", e.target.value || undefined)} />
        </div>
        {!hideReferenceNumber && (
          <div>
            <Label className="text-[10px] text-slate-500">{referenceNumberLabel}</Label>
            <Input className="h-8 text-xs" value={value.referenceNumber || ""} onChange={(e) => set("referenceNumber", e.target.value || undefined)} />
          </div>
        )}
        <div>
          <Label className="text-[10px] text-slate-500">بحث</Label>
          <Input className="h-8 text-xs" value={value.search || ""} onChange={(e) => set("search", e.target.value || undefined)} placeholder={searchPlaceholder} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={onClear}>تفريغ</Button>
      </div>
    </div>
  );
}
