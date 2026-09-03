import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FieldLabel,
  FormSection,
  FormBanner,
  entryControlClass,
  entrySelectTriggerClass,
  entryTextareaClass,
} from "@/components/form/EntryForm";
import { DateField } from "@/components/form/DateField";
import { toDateStr } from "@/lib/date";

export { FieldLabel, FormSection } from "@/components/form/EntryForm";

export type ContactPartyFormValues = {
  name: string;
  code: string;
  categoryId: string;
  phone: string;
  phone2: string;
  fax: string;
  email: string;
  contactPerson: string;
  address: string;
  city: string;
  mapUrl: string;
  taxNumber: string;
  commercialRegister: string;
  openingBalance: string;
  openingBalanceDate: string;
  creditLimit: string;
  paymentTermDays: string;
  discountPercent: string;
  notes: string;
  isActive: boolean;
  dualRole: boolean;
  /** Multiple sales reps with per-link commission rate (customer only). */
  salesRepLinks?: { salesRepId: string; commissionRate: string; isPrimary: boolean }[];
  salesRepId?: string;
  branchId?: string;
  areaId?: string;
};

type Category = { id: number; name: string; type: string };
type Opt = { id: number; name: string; commissionRate?: string | null };

type Props = {
  mode: "customer" | "supplier";
  form: ContactPartyFormValues;
  setForm: React.Dispatch<React.SetStateAction<any>>;
  editId: number | null;
  linkedTwinId: number | null;
  categories: Category[];
  branches?: Opt[];
  reps?: Opt[];
  areas?: Opt[];
};

export function ContactPartyFormFields({
  mode,
  form,
  setForm,
  editId,
  linkedTwinId,
  categories,
  branches = [],
  reps = [],
  areas = [],
}: Props) {
  const partyLabel = mode === "customer" ? "العميل" : "المورد";
  const dualLabel = "عميل ومورد";
  const filteredCats = categories.filter((c) =>
    mode === "customer" ? c.type === "customer" || c.type === "both" : c.type === "supplier" || c.type === "both",
  );

  const set = (k: string, v: string | boolean) => setForm((p: any) => ({ ...p, [k]: v }));
  const text = (k: keyof ContactPartyFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    set(k, e.target.value);

  return (
    <div className="space-y-4">
      <FormBanner tone="info">
        المطلوب فقط: <strong>اسم {partyLabel}</strong>
        {" — "}باقي الحقول اختيارية. الكود يُولَّد تلقائياً إن تُرك فارغاً. صُمّمت الشاشة لتسهيل الإدخال على سطح المكتب.
      </FormBanner>

      <FormSection title="البيانات الأساسية" accent="blue">
        <div>
          <FieldLabel required>الاسم</FieldLabel>
          <Input value={form.name} onChange={text("name")} placeholder={`اسم ${partyLabel}`} className={entryControlClass} required />
        </div>
        <div>
          <FieldLabel hint={!editId ? `تلقائي إن تُرك فارغاً (مثل ${mode === "customer" ? "C" : "S"}-0001)` : undefined}>الكود</FieldLabel>
          <Input value={form.code} onChange={text("code")} placeholder={editId ? "الكود" : "تلقائي"} className={entryControlClass} />
        </div>
        <div>
          <FieldLabel>الفئة / المجموعة</FieldLabel>
          <Select value={form.categoryId || "none"} onValueChange={(v) => set("categoryId", v === "none" ? "" : v)}>
            <SelectTrigger className={entrySelectTriggerClass}><SelectValue placeholder="بدون" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">بدون</SelectItem>
              {filteredCats.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <FieldLabel>شخص الاتصال</FieldLabel>
          <Input value={form.contactPerson} onChange={text("contactPerson")} placeholder="اسم المسؤول" className={entryControlClass} />
        </div>
        <div className="sm:col-span-2 flex flex-wrap gap-4 items-center pt-1">
          <label className="flex items-center gap-2.5 cursor-pointer text-sm font-medium text-slate-700">
            <Checkbox checked={form.isActive} onCheckedChange={(v) => set("isActive", v === true)} className="size-5" />
            نشط
          </label>
        </div>
      </FormSection>

      <FormSection title="التواصل" accent="emerald">
        <div>
          <FieldLabel>الهاتف</FieldLabel>
          <Input value={form.phone} onChange={text("phone")} placeholder="رقم الهاتف" className={entryControlClass} />
        </div>
        <div>
          <FieldLabel>موبايل</FieldLabel>
          <Input value={form.phone2} onChange={text("phone2")} placeholder="موبايل / هاتف 2" className={entryControlClass} />
        </div>
        <div>
          <FieldLabel>فاكس</FieldLabel>
          <Input value={form.fax} onChange={text("fax")} placeholder="فاكس" className={entryControlClass} />
        </div>
        <div>
          <FieldLabel>البريد الإلكتروني</FieldLabel>
          <Input value={form.email} onChange={text("email")} placeholder="email@example.com" className={entryControlClass} />
        </div>
      </FormSection>

      <FormSection title="العنوان والموقع" accent="amber">
        <div className="sm:col-span-2">
          <FieldLabel>العنوان</FieldLabel>
          <Input value={form.address} onChange={text("address")} placeholder="العنوان التفصيلي" className={entryControlClass} />
        </div>
        <div>
          <FieldLabel>المدينة</FieldLabel>
          <Input value={form.city} onChange={text("city")} placeholder="المدينة" className={entryControlClass} />
        </div>
        <div>
          <FieldLabel hint="رابط Google Maps لتيسير وصول المندوب">موقع الخريطة</FieldLabel>
          <Input value={form.mapUrl} onChange={text("mapUrl")} placeholder="https://maps.google.com/..." className={entryControlClass} dir="ltr" />
        </div>
      </FormSection>

      <FormSection title="ضريبة ومالية" accent="violet">
        <div>
          <FieldLabel>الرقم الضريبي</FieldLabel>
          <Input value={form.taxNumber} onChange={text("taxNumber")} className={entryControlClass} />
        </div>
        <div>
          <FieldLabel>السجل التجاري</FieldLabel>
          <Input value={form.commercialRegister} onChange={text("commercialRegister")} className={entryControlClass} />
        </div>
        <div>
          <FieldLabel hint="يُضاف لرصيد الحساب وكشف الحساب">رصيد أول المدة</FieldLabel>
          <Input value={form.openingBalance} onChange={text("openingBalance")} type="number" step="0.01" placeholder="0" className={entryControlClass} />
        </div>
        <div>
          <FieldLabel required={!!form.openingBalance.trim() && Number(form.openingBalance) !== 0} hint="اختر من التقويم — أو اكتب يوم/شهر/سنة">تاريخ الرصيد الافتتاحي</FieldLabel>
          <DateField
            value={form.openingBalanceDate}
            onChange={(iso) => set("openingBalanceDate", iso)}
          />
        </div>
        <div>
          <FieldLabel>حد الائتمان</FieldLabel>
          <Input value={form.creditLimit} onChange={text("creditLimit")} type="number" step="0.01" placeholder="0" className={entryControlClass} />
        </div>
        <div>
          <FieldLabel>أيام الائتمان</FieldLabel>
          <Input value={form.paymentTermDays} onChange={text("paymentTermDays")} type="number" placeholder="مثلاً 30" className={entryControlClass} />
        </div>
        <div>
          <FieldLabel>نسبة الخصم الافتراضي %</FieldLabel>
          <Input value={form.discountPercent} onChange={text("discountPercent")} type="number" step="0.01" placeholder="0" className={entryControlClass} />
        </div>
      </FormSection>

      <FormSection title={mode === "customer" ? "التنظيم والمبيعات" : "التنظيم"} accent="slate">
        {mode === "customer" && (
          <>
            <div className="sm:col-span-2 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <FieldLabel hint="نسبة كل مندوب خاصة بهذا العميل ويمكن تغييرها من عميل لآخر. العمولة = مبلغ التحصيل × النسبة ÷ 100">المندوبون ونسب العمولة</FieldLabel>
                <button
                  type="button"
                  className="text-sm font-semibold text-blue-700 hover:text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 h-10"
                  onClick={() => {
                    const links = [...(form.salesRepLinks || [])];
                    const used = new Set(links.map((l) => l.salesRepId));
                    const next = reps.find((r) => !used.has(String(r.id)));
                    if (!next) return;
                    links.push({
                      salesRepId: String(next.id),
                      commissionRate: String(next.commissionRate ?? "0"),
                      isPrimary: links.length === 0,
                    });
                    setForm((p: any) => ({ ...p, salesRepLinks: links, salesRepId: links.find((l) => l.isPrimary)?.salesRepId || links[0]?.salesRepId || "" }));
                  }}
                >
                  + إضافة مندوب
                </button>
              </div>
              {(form.salesRepLinks || []).length === 0 && (
                <p className="text-sm text-slate-500">لا يوجد مندوبون — اضغط «إضافة مندوب» لربط أكثر من مندوب بهذا العميل.</p>
              )}
              <div className="space-y-2.5">
                {(form.salesRepLinks || []).map((link, idx) => (
                  <div key={`${link.salesRepId}-${idx}`} className="grid grid-cols-1 sm:grid-cols-[1fr_130px_auto_auto] gap-3 items-end rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div>
                      <Label className="text-xs font-semibold text-slate-600 mb-1.5 block">المندوب</Label>
                      <Select
                        value={link.salesRepId || "none"}
                        onValueChange={(v) => {
                          const rep = reps.find((r) => String(r.id) === v);
                          setForm((p: any) => {
                            const links = [...(p.salesRepLinks || [])];
                            links[idx] = {
                              ...links[idx],
                              salesRepId: v === "none" ? "" : v,
                              commissionRate: links[idx].commissionRate || String(rep?.commissionRate ?? "0"),
                            };
                            return { ...p, salesRepLinks: links, salesRepId: links.find((l) => l.isPrimary)?.salesRepId || links[0]?.salesRepId || "" };
                          });
                        }}
                      >
                        <SelectTrigger className={entrySelectTriggerClass}><SelectValue placeholder="اختر مندوب" /></SelectTrigger>
                        <SelectContent>
                          {reps.map((r) => (
                            <SelectItem key={r.id} value={String(r.id)}>{r.name} ({r.commissionRate || 0}%)</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-slate-600 mb-1.5 block">نسبته على هذا العميل %</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.0001"
                        inputMode="decimal"
                        placeholder="مثال: 0.0625"
                        value={link.commissionRate}
                        className={entryControlClass}
                        onChange={(e) => {
                          const val = e.target.value;
                          setForm((p: any) => {
                            const links = [...(p.salesRepLinks || [])];
                            links[idx] = { ...links[idx], commissionRate: val };
                            return { ...p, salesRepLinks: links };
                          });
                        }}
                      />
                    </div>
                    <label className="flex items-center gap-2 h-11 text-sm text-slate-700 cursor-pointer">
                      <Checkbox
                        className="size-5"
                        checked={!!link.isPrimary}
                        onCheckedChange={() => {
                          setForm((p: any) => {
                            const links = (p.salesRepLinks || []).map((l: any, i: number) => ({
                              ...l,
                              isPrimary: i === idx,
                            }));
                            return { ...p, salesRepLinks: links, salesRepId: links[idx]?.salesRepId || "" };
                          });
                        }}
                      />
                      أساسي
                    </label>
                    <button
                      type="button"
                      className="h-11 px-3 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg border border-red-100"
                      onClick={() => {
                        setForm((p: any) => {
                          let links = (p.salesRepLinks || []).filter((_: any, i: number) => i !== idx);
                          if (links.length && !links.some((l: any) => l.isPrimary)) links[0].isPrimary = true;
                          return { ...p, salesRepLinks: links, salesRepId: links.find((l: any) => l.isPrimary)?.salesRepId || links[0]?.salesRepId || "" };
                        });
                      }}
                    >
                      حذف
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <FieldLabel>منطقة المبيعات</FieldLabel>
              <Select value={form.areaId || "none"} onValueChange={(v) => set("areaId", v === "none" ? "" : v)}>
                <SelectTrigger className={entrySelectTriggerClass}><SelectValue placeholder="بدون" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون</SelectItem>
                  {areas.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        <div>
          <FieldLabel>الفرع</FieldLabel>
          <Select value={form.branchId || "none"} onValueChange={(v) => set("branchId", v === "none" ? "" : v)}>
            <SelectTrigger className={entrySelectTriggerClass}><SelectValue placeholder="بدون" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">بدون</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <FieldLabel>ملاحظات</FieldLabel>
          <Textarea value={form.notes} onChange={text("notes")} className={entryTextareaClass} rows={3} />
        </div>
      </FormSection>

      <FormBanner tone={linkedTwinId ? "success" : "info"}>
        {linkedTwinId ? (
          <span>
            مسجّل كـ {dualLabel} (مرتبط #{linkedTwinId}) — تعديل بيانات التواصل والضريبة يحدّث الطرف المرتبط تلقائياً. رصيد أول المدة وحد الائتمان مستقلان لكل طرف.
          </span>
        ) : (
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={form.dualRole}
              onCheckedChange={(v) => set("dualRole", v === true)}
              className="mt-0.5 size-5"
            />
            <span>
              <span className="text-base font-semibold text-slate-900 block">{dualLabel}</span>
              <span className="text-sm text-slate-600">
                يُنشأ سجل {mode === "customer" ? "مورد" : "عميل"} بنفس البيانات المشتركة.
              </span>
            </span>
          </label>
        )}
      </FormBanner>
    </div>
  );
}

export function emptyContactPartyForm(extra: Record<string, string | boolean | any[]> = {}): ContactPartyFormValues & Record<string, any> {
  return {
    name: "",
    code: "",
    categoryId: "",
    phone: "",
    phone2: "",
    fax: "",
    email: "",
    contactPerson: "",
    address: "",
    city: "",
    mapUrl: "",
    taxNumber: "",
    commercialRegister: "",
    openingBalance: "",
    openingBalanceDate: "",
    creditLimit: "",
    paymentTermDays: "",
    discountPercent: "",
    notes: "",
    isActive: true,
    dualRole: false,
    salesRepLinks: [],
    salesRepId: "",
    branchId: "",
    areaId: "",
    ...extra,
  };
}

export function partyFormFromRow(row: any, dualKey: "linkedSupplierId" | "linkedCustomerId") {
  const linksFromApi = Array.isArray(row.salesReps)
    ? row.salesReps.map((r: any) => ({
        salesRepId: String(r.salesRepId),
        commissionRate: String(r.commissionRate ?? r.defaultCommissionRate ?? "0"),
        isPrimary: !!r.isPrimary,
      }))
    : [];
  const fallbackLinks = !linksFromApi.length && row.salesRepId
    ? [{ salesRepId: String(row.salesRepId), commissionRate: "0", isPrimary: true }]
    : linksFromApi;

  return {
    name: row.name || "",
    code: row.code || "",
    categoryId: row.categoryId ? String(row.categoryId) : "",
    phone: row.phone || "",
    phone2: row.phone2 || "",
    fax: row.fax || "",
    email: row.email || "",
    contactPerson: row.contactPerson || "",
    address: row.address || "",
    city: row.city || "",
    mapUrl: row.mapUrl || "",
    taxNumber: row.taxNumber || "",
    commercialRegister: row.commercialRegister || "",
    openingBalance: row.openingBalance != null ? String(row.openingBalance) : "",
    openingBalanceDate: row.openingBalanceDate ? toDateStr(row.openingBalanceDate) : "",
    creditLimit: row.creditLimit != null ? String(row.creditLimit) : "",
    paymentTermDays: row.paymentTermDays != null ? String(row.paymentTermDays) : "",
    discountPercent: row.discountPercent != null ? String(row.discountPercent) : "",
    notes: row.notes || "",
    isActive: row.isActive !== false,
    dualRole: !!row[dualKey],
    salesRepLinks: fallbackLinks,
    salesRepId: row.salesRepId ? String(row.salesRepId) : (fallbackLinks[0]?.salesRepId || ""),
    branchId: row.branchId ? String(row.branchId) : "",
    areaId: row.areaId ? String(row.areaId) : "",
  };
}

export function buildPartyPayload(form: ContactPartyFormValues & Record<string, any>, opts: {
  mode: "customer" | "supplier";
  linkedTwinId: number | null;
}) {
  const opening = form.openingBalance.trim();
  const openingNum = opening ? Number(opening) : 0;
  let openingBalanceDate = form.openingBalanceDate.trim() || undefined;
  // إذا وُجد رصيد افتتاحي بدون تاريخ → استخدم اليوم
  if (openingNum !== 0 && !openingBalanceDate) {
    openingBalanceDate = new Date().toISOString().slice(0, 10);
  }
  const base: Record<string, unknown> = {
    name: form.name.trim(),
    code: form.code.trim() || undefined,
    phone: form.phone.trim() || undefined,
    phone2: form.phone2.trim() || undefined,
    fax: form.fax.trim() || undefined,
    email: form.email.trim() || undefined,
    contactPerson: form.contactPerson.trim() || undefined,
    address: form.address.trim() || undefined,
    city: form.city.trim() || undefined,
    mapUrl: form.mapUrl.trim() || undefined,
    taxNumber: form.taxNumber.trim() || undefined,
    commercialRegister: form.commercialRegister.trim() || undefined,
    openingBalance: opening || undefined,
    openingBalanceDate,
    creditLimit: form.creditLimit.trim() || undefined,
    discountPercent: form.discountPercent.trim() || undefined,
    notes: form.notes.trim() || undefined,
    categoryId: form.categoryId ? Number(form.categoryId) : undefined,
    paymentTermDays: form.paymentTermDays ? Number(form.paymentTermDays) : undefined,
    branchId: form.branchId ? Number(form.branchId) : undefined,
    isActive: form.isActive,
  };
  if (opts.mode === "customer") {
    const links = (form.salesRepLinks || [])
      .filter((l: any) => l.salesRepId)
      .map((l: any) => ({
        salesRepId: Number(l.salesRepId),
        commissionRate: l.commissionRate?.trim() || null,
        isPrimary: !!l.isPrimary,
      }));
    base.salesReps = links;
    base.salesRepId = links.find((l: any) => l.isPrimary)?.salesRepId
      ?? links[0]?.salesRepId
      ?? (form.salesRepId ? Number(form.salesRepId) : undefined);
    base.areaId = form.areaId ? Number(form.areaId) : undefined;
    base.alsoAsSupplier = !opts.linkedTwinId && form.dualRole ? true : undefined;
  } else {
    base.alsoAsCustomer = !opts.linkedTwinId && form.dualRole ? true : undefined;
  }
  return base;
}
