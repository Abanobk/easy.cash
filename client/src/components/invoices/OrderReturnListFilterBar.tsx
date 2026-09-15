/**
 * شريط فلاتر قائمة الطلبات/المردودات — نسخة مبسّطة من فلاتر قائمة الفواتير (A6)
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type OrderReturnListFiltersValue = {
  dateFrom?: string;
  dateTo?: string;
  branchId?: number;
  warehouseId?: number;
  status?: string;
  partyId?: number;
  salesRepId?: number;
  number?: string;
  referenceNumber?: string;
  search?: string;
};

type Opt = { id: number; name: string };

export function OrderReturnListFilterBar({
  value,
  onChange,
  onClear,
  partyLabel,
  parties,
  branches,
  warehouses,
  salesReps,
  showSalesRep,
}: {
  value: OrderReturnListFiltersValue;
  onChange: (next: OrderReturnListFiltersValue) => void;
  onClear: () => void;
  partyLabel: string;
  parties: Opt[];
  branches: Opt[];
  warehouses?: Opt[];
  salesReps?: Opt[];
  showSalesRep?: boolean;
}) {
  const set = <K extends keyof OrderReturnListFiltersValue>(key: K, v: OrderReturnListFiltersValue[K]) =>
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
          <Label className="text-[10px] text-slate-500">الفرع</Label>
          <Select value={value.branchId?.toString() || "all"} onValueChange={(v) => set("branchId", v === "all" ? undefined : Number(v))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الكل" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {warehouses && warehouses.length > 0 && (
          <div>
            <Label className="text-[10px] text-slate-500">المخزن</Label>
            <Select value={value.warehouseId?.toString() || "all"} onValueChange={(v) => set("warehouseId", v === "all" ? undefined : Number(v))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الكل" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                {warehouses.map((w) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label className="text-[10px] text-slate-500">{partyLabel}</Label>
          <Select value={value.partyId?.toString() || "all"} onValueChange={(v) => set("partyId", v === "all" ? undefined : Number(v))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الكل" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {parties.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
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
          <Select value={value.status || "all"} onValueChange={(v) => set("status", v === "all" ? undefined : v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الكل" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="draft">مسودة</SelectItem>
              <SelectItem value="confirmed">معتمدة</SelectItem>
              <SelectItem value="cancelled">ملغاة</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] text-slate-500">المسلسل</Label>
          <Input className="h-8 text-xs" value={value.number || ""} onChange={(e) => set("number", e.target.value || undefined)} />
        </div>
        <div>
          <Label className="text-[10px] text-slate-500">رقم المرجع</Label>
          <Input className="h-8 text-xs" value={value.referenceNumber || ""} onChange={(e) => set("referenceNumber", e.target.value || undefined)} />
        </div>
        <div>
          <Label className="text-[10px] text-slate-500">بحث</Label>
          <Input className="h-8 text-xs" value={value.search || ""} onChange={(e) => set("search", e.target.value || undefined)} placeholder="رقم / اسم…" />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={onClear}>تفريغ</Button>
      </div>
    </div>
  );
}
