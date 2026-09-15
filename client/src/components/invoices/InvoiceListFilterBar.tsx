/**
 * شريط فلاتر قائمة الفواتير — مطابقة فورم قائمة ميجا
 * (فرع · عملة · تواريخ · استحقاق · حالة · تحصيل · تسليم · طرف · مندوب · مسلسل · مرجع)
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type InvoiceListFiltersValue = {
  dateFrom?: string;
  dateTo?: string;
  dueFrom?: string;
  dueTo?: string;
  branchId?: number;
  currencyCode?: string;
  status?: string;
  collectionStatus?: "" | "unpaid" | "partial" | "paid";
  deliveryStatus?: "" | "undelivered" | "partial" | "delivered";
  partyId?: number;
  salesRepId?: number;
  number?: string;
  referenceNumber?: string;
};

type PartyOpt = { id: number; name: string };
type Opt = { id: number; name: string };

export function InvoiceListFilterBar({
  value,
  onChange,
  onClear,
  partyLabel,
  parties,
  branches,
  salesReps,
  currencies,
  showSalesRep,
}: {
  value: InvoiceListFiltersValue;
  onChange: (next: InvoiceListFiltersValue) => void;
  onClear: () => void;
  partyLabel: string;
  parties: PartyOpt[];
  branches: Opt[];
  salesReps?: Opt[];
  currencies?: string[];
  showSalesRep?: boolean;
}) {
  const set = <K extends keyof InvoiceListFiltersValue>(key: K, v: InvoiceListFiltersValue[K]) =>
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
          <Label className="text-[10px] text-slate-500">استحقاق من</Label>
          <Input type="date" className="h-8 text-xs" value={value.dueFrom || ""} onChange={(e) => set("dueFrom", e.target.value || undefined)} />
        </div>
        <div>
          <Label className="text-[10px] text-slate-500">استحقاق الى</Label>
          <Input type="date" className="h-8 text-xs" value={value.dueTo || ""} onChange={(e) => set("dueTo", e.target.value || undefined)} />
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
        <div>
          <Label className="text-[10px] text-slate-500">العملة</Label>
          <Select value={value.currencyCode || "all"} onValueChange={(v) => set("currencyCode", v === "all" ? undefined : v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الكل" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {(currencies || ["EGP"]).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
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
              <SelectItem value="partial">جزئية السداد</SelectItem>
              <SelectItem value="paid">مسددة</SelectItem>
              <SelectItem value="cancelled">ملغاة</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] text-slate-500">حالة التحصيل / السداد</Label>
          <Select value={value.collectionStatus || "all"} onValueChange={(v) => set("collectionStatus", v === "all" ? "" : v as any)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الكل" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="unpaid">غير مسدد</SelectItem>
              <SelectItem value="partial">جزئي</SelectItem>
              <SelectItem value="paid">مسدد</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] text-slate-500">حالة التسليم</Label>
          <Select value={value.deliveryStatus || "all"} onValueChange={(v) => set("deliveryStatus", v === "all" ? "" : v as any)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الكل" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="undelivered">لم يُسلَّم</SelectItem>
              <SelectItem value="partial">جزئي</SelectItem>
              <SelectItem value="delivered">تم التسليم</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] text-slate-500">المسلسل</Label>
          <Input className="h-8 text-xs" value={value.number || ""} onChange={(e) => set("number", e.target.value || undefined)} placeholder="SI-…" />
        </div>
        <div>
          <Label className="text-[10px] text-slate-500">رقم المرجع</Label>
          <Input className="h-8 text-xs" value={value.referenceNumber || ""} onChange={(e) => set("referenceNumber", e.target.value || undefined)} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={onClear}>تفريغ</Button>
      </div>
    </div>
  );
}
