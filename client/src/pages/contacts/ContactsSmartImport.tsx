import { useMemo, useState } from "react";
import { useSearch, useLocation } from "wouter";
import { toast } from "sonner";
import ERPLayout from "@/components/ERPLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { tenantPath, useTenantSlug } from "@/lib/tenant";
import { trpc } from "@/lib/trpc";
import { ArrowRight, FileSpreadsheet, Upload } from "lucide-react";

type ContactType = "customer" | "supplier";

type CleanRow = {
  key: string;
  code: string;
  name: string;
  phone: string;
  phone2: string;
  email: string;
  address: string;
  city: string;
  taxNumber: string;
  openingBalance: string;
  openingBalanceDate: string;
  notes: string;
  included: boolean;
};

function getTypeFromSearch(search: string): ContactType {
  return new URLSearchParams(search).get("type") === "supplier" ? "supplier" : "customer";
}

export default function ContactsSmartImport() {
  const tenantSlug = useTenantSlug();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const type = getTypeFromSearch(searchString);
  const isSupplier = type === "supplier";

  const utils = trpc.useUtils();
  const importCustomersMut = trpc.customers.cleanImport.useMutation();
  const importSuppliersMut = trpc.suppliers.cleanImport.useMutation();
  const importMut = isSupplier ? importSuppliersMut : importCustomersMut;

  const [rows, setRows] = useState<CleanRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);

  const pickCol = (row: Record<string, unknown>, keys: string[]) => {
    const entries = Object.keys(row).map((k) => [k.trim().toLowerCase().replace(/\s+/g, " "), k] as const);
    const map = new Map(entries);
    for (const want of keys) {
      const real = map.get(want.toLowerCase().replace(/\s+/g, " "));
      if (real != null && row[real] != null && String(row[real]).trim() !== "") {
        return String(row[real]).replace(/\s+/g, " ").trim();
      }
    }
    return "";
  };

  /** ميجا كاش بيصدّر تقارير مطبوعة: أسطر عنوان/طباعة فوق، والعناوين الحقيقية في سطر لاحق */
  const NAME_HEADERS = ["name", "اسم", "الاسم", "اسم العميل", "اسم المورد"];
  const FOOTER_NAMES = ["الاجمالي", "إجمالي", "الإجمالي", "اجمالى", "total", "الإجمالى"];

  const findHeaderRowIndex = (rows: unknown[][]) => {
    const limit = Math.min(rows.length, 30);
    for (let i = 0; i < limit; i++) {
      const cells = (rows[i] || []).map((c) => String(c ?? "").trim());
      if (cells.some((c) => NAME_HEADERS.includes(c))) return i;
    }
    return -1;
  };

  /** أرقام ميجا كاش: فاصلة آلاف + مسافة زيادة + سالب بين قوسين (90,000.00) */
  const cleanNumber = (v: unknown) => {
    let s = String(v ?? "").trim();
    if (!s) return "";
    let neg = false;
    if (s.startsWith("(") && s.endsWith(")")) {
      neg = true;
      s = s.slice(1, -1).trim();
    }
    s = s.replace(/,/g, "").trim();
    const n = Number(s);
    if (!Number.isFinite(n)) return "";
    return String(neg ? -Math.abs(n) : n);
  };

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet([
      {
        الكود: isSupplier ? "S-0001" : "C-0001",
        الاسم: isSupplier ? "مثال مورد" : "مثال عميل",
        الهاتف: "01000000000",
        "هاتف 2": "",
        "البريد الإلكتروني": "",
        العنوان: "",
        المدينة: "",
        "الرقم الضريبي": "",
        "الرصيد الافتتاحي": 0,
        "تاريخ الرصيد الافتتاحي": "",
        ملاحظات: "",
      },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, isSupplier ? "الموردين" : "العملاء");
    XLSX.writeFile(wb, `${isSupplier ? "suppliers" : "customers"}-template.xlsx`);
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    setFileName(file.name);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false }) as unknown[][];
      if (!rawRows.length) {
        toast.error("الملف فاضي");
        return;
      }
      const headerIdx = findHeaderRowIndex(rawRows);
      if (headerIdx < 0) {
        toast.error("لم يُعثر على عمود «الاسم» في الملف — تأكدي إنه تصدير قائمة عملاء/موردين صحيح");
        return;
      }
      const headers = (rawRows[headerIdx] || []).map((h) => String(h ?? "").trim());
      const json: Record<string, unknown>[] = [];
      for (let i = headerIdx + 1; i < rawRows.length; i++) {
        const r = rawRows[i] || [];
        if (r.every((c) => String(c ?? "").trim() === "")) continue;
        const obj: Record<string, unknown> = {};
        headers.forEach((h, idx) => { if (h) obj[h] = r[idx]; });
        json.push(obj);
      }
      const mapped: CleanRow[] = json
        .map((r, idx) => ({
          key: String(idx),
          code: pickCol(r, ["code", "كود", "الكود"]),
          name: pickCol(r, NAME_HEADERS),
          phone: pickCol(r, ["phone", "هاتف", "الهاتف", "موبايل", "تليفون", "التليفون"]),
          phone2: pickCol(r, ["phone2", "هاتف 2", "هاتف2"]),
          email: pickCol(r, ["email", "بريد", "البريد الإلكتروني", "الايميل"]),
          address: pickCol(r, ["address", "عنوان", "العنوان"]),
          city: pickCol(r, ["city", "مدينة", "المدينة"]),
          taxNumber: pickCol(r, ["tax", "الرقم الضريبي", "رقم ضريبي"]),
          openingBalance: cleanNumber(pickCol(r, ["opening balance", "الرصيد الافتتاحي", "رصيد افتتاحي", "الرصيد"])),
          openingBalanceDate: pickCol(r, ["opening balance date", "تاريخ الرصيد الافتتاحي"]),
          notes: pickCol(r, ["notes", "ملاحظات"]),
          included: true,
        }))
        .filter((r) => r.name && !FOOTER_NAMES.includes(r.name.trim()));
      if (!mapped.length) {
        toast.error("لم يُعثر على أسطر بيانات صالحة تحت عمود «الاسم»");
        return;
      }
      setRows(mapped);
      toast.message(`${mapped.length} سطر جاهز للمراجعة — راجعهم واضغط «تأكيد وحفظ»`);
    } catch (e: any) {
      toast.error(e?.message || "فشل قراءة الملف");
    } finally {
      setBusy(false);
    }
  };

  const includedCount = useMemo(() => (rows || []).filter((r) => r.included).length, [rows]);

  const confirm = async () => {
    const included = (rows || []).filter((r) => r.included);
    if (!included.length) {
      toast.error("لا توجد أسطر محدّدة للحفظ");
      return;
    }
    setBusy(true);
    try {
      const res = await importMut.mutateAsync({
        rows: included.map((r) => ({
          code: r.code || undefined,
          name: r.name,
          phone: r.phone || undefined,
          phone2: r.phone2 || undefined,
          email: r.email || undefined,
          address: r.address || undefined,
          city: r.city || undefined,
          taxNumber: r.taxNumber || undefined,
          openingBalance: r.openingBalance || undefined,
          openingBalanceDate: r.openingBalanceDate || undefined,
          notes: r.notes || undefined,
        })),
      });
      toast.success(`تم: ${res.created} جديد · ${res.matched} تم تحديثه`);
      if (res.failed) toast.message(`فشل ${res.failed}: ${(res.errors || []).slice(0, 2).join(" · ")}`);
      await utils[isSupplier ? "suppliers" : "customers"].list.invalidate();
      setRows(null);
      navigate(tenantPath(tenantSlug, isSupplier ? "/suppliers" : "/customers"));
    } catch (e: any) {
      toast.error(e?.message || "فشل الاستيراد");
    } finally {
      setBusy(false);
    }
  };

  const updateRow = (key: string, patch: Partial<CleanRow>) => {
    setRows((prev) => (prev || []).map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  return (
    <ERPLayout title={`استيراد ذكي — ${isSupplier ? "موردين" : "عملاء"}`}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-600">
          يقرأ ملف Excel ويطابق كل سطر بالكود أولاً ثم الاسم — لو موجود بالفعل يحدّث بياناته، ولو مش موجود ينشئه بدون تكرار.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(tenantPath(tenantSlug, isSupplier ? "/suppliers" : "/customers"))}
        >
          رجوع <ArrowRight size={14} className="mr-1" />
        </Button>
      </div>

      <div className="rounded-2xl border-2 overflow-hidden bg-white mb-6">
        <div className="bg-slate-900 text-white px-4 py-3 font-black flex items-center gap-2">
          <FileSpreadsheet size={18} /> رفع ملف {isSupplier ? "الموردين" : "العملاء"}
        </div>
        <div className="p-5 flex flex-wrap gap-3 items-center">
          <Button variant="outline" onClick={() => void downloadTemplate()}>تحميل نموذج</Button>
          <label>
            <Button asChild variant="default" className="bg-emerald-600 hover:bg-emerald-700 cursor-pointer">
              <span><Upload size={14} className="ml-1" /> اختيار ملف Excel</span>
            </Button>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = "";
              }}
            />
          </label>
          {fileName && <span className="text-sm text-slate-500">{fileName}</span>}
        </div>
      </div>

      {rows && rows.length > 0 && (
        <div className="rounded-2xl border-2 overflow-hidden bg-white">
          <div className="bg-slate-50 px-4 py-3 font-bold text-sm flex items-center justify-between">
            <span>{includedCount} من {rows.length} سطر محدد للحفظ</span>
          </div>
          <div className="max-h-[55vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 sticky top-0">
                <tr>
                  <th className="px-2 py-2 text-right"></th>
                  <th className="px-2 py-2 text-right">الكود</th>
                  <th className="px-2 py-2 text-right">الاسم</th>
                  <th className="px-2 py-2 text-right">الهاتف</th>
                  <th className="px-2 py-2 text-right">المدينة</th>
                  <th className="px-2 py-2 text-right">الرصيد الافتتاحي</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t">
                    <td className="px-2 py-1.5">
                      <Checkbox checked={r.included} onCheckedChange={(v) => updateRow(r.key, { included: !!v })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input value={r.code} onChange={(e) => updateRow(r.key, { code: e.target.value })} className="h-7 text-xs w-24" />
                    </td>
                    <td className="px-2 py-1.5 font-bold">
                      <Input value={r.name} onChange={(e) => updateRow(r.key, { name: e.target.value })} className="h-7 text-xs w-40" />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input value={r.phone} onChange={(e) => updateRow(r.key, { phone: e.target.value })} className="h-7 text-xs w-28" />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input value={r.city} onChange={(e) => updateRow(r.key, { city: e.target.value })} className="h-7 text-xs w-24" />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input value={r.openingBalance} onChange={(e) => updateRow(r.key, { openingBalance: e.target.value })} className="h-7 text-xs w-24" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 flex justify-end gap-2 border-t bg-white sticky bottom-0">
            <Button variant="outline" onClick={() => setRows(null)}>إلغاء</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 font-bold" disabled={busy || !includedCount} onClick={() => void confirm()}>
              {busy ? "جاري الحفظ..." : `تأكيد وحفظ (${includedCount})`}
            </Button>
          </div>
        </div>
      )}
    </ERPLayout>
  );
}
