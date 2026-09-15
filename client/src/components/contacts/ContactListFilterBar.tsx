/**
 * شريط فلاتر قائمة العملاء/الموردين — بنفس أسلوب InvoiceListFilterBar
 * (فرع · فئة · منطقة (عملاء فقط) · مندوب مبيعات (عملاء فقط) · الحالة)
 */
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ContactListFiltersValue = {
  branchId?: number;
  categoryId?: number;
  areaId?: number;
  salesRepId?: number;
  isActive?: "" | "active" | "inactive";
};

type Opt = { id: number; name: string };

export function ContactListFilterBar({
  value,
  onChange,
  onClear,
  branches,
  categories,
  areas,
  salesReps,
  showArea,
  showSalesRep,
}: {
  value: ContactListFiltersValue;
  onChange: (next: ContactListFiltersValue) => void;
  onClear: () => void;
  branches: Opt[];
  categories: Opt[];
  areas?: Opt[];
  salesReps?: Opt[];
  showArea?: boolean;
  showSalesRep?: boolean;
}) {
  const set = <K extends keyof ContactListFiltersValue>(key: K, v: ContactListFiltersValue[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 mb-3 space-y-3" dir="rtl">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        <div>
          <Label className="text-[10px] text-slate-500">الفرع</Label>
          <Select value={value.branchId?.toString() || "all"} onValueChange={(v) => set("branchId", v === "all" ? undefined : Number(v))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الكل" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] text-slate-500">الفئة</Label>
          <Select value={value.categoryId?.toString() || "all"} onValueChange={(v) => set("categoryId", v === "all" ? undefined : Number(v))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الكل" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {showArea && (
          <div>
            <Label className="text-[10px] text-slate-500">المنطقة</Label>
            <Select value={value.areaId?.toString() || "all"} onValueChange={(v) => set("areaId", v === "all" ? undefined : Number(v))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الكل" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {(areas || []).map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {showSalesRep && (
          <div>
            <Label className="text-[10px] text-slate-500">مندوب المبيعات</Label>
            <Select value={value.salesRepId?.toString() || "all"} onValueChange={(v) => set("salesRepId", v === "all" ? undefined : Number(v))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الكل" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {(salesReps || []).map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label className="text-[10px] text-slate-500">الحالة</Label>
          <Select value={value.isActive || "all"} onValueChange={(v) => set("isActive", v === "all" ? "" : v as any)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الكل" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="active">نشط</SelectItem>
              <SelectItem value="inactive">غير نشط</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={onClear}>تفريغ</Button>
      </div>
    </div>
  );
}
