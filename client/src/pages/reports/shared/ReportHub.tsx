import { useMemo, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { useTenantSlug, tenantPath } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Printer, Search } from "lucide-react";
import * as XLSX from "xlsx";
import type { ReportSectionDef } from "@/config/report-sections";
import { getReportEntityFilters, type ReportEntityFilter } from "@/config/report-filter-config";
import { reportColumnLabel, REPORT_TOTAL_COLUMNS } from "@/config/report-column-labels";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ReportProcedure = "accountingBySlug" | "finalBySlug" | "hrBySlug" | "assetsBySlug";

type FilterInput = {
  slug: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  customerId?: number;
  supplierId?: number;
  accountId?: number;
  repId?: number;
  costCenterId?: number;
  branchId?: number;
  itemId?: number;
  warehouseId?: number;
  categoryId?: number;
  areaId?: number;
  paymentType?: "cash" | "credit";
};

function defaultDates() {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 1);
  return {
    dateFrom: from.toISOString().split("T")[0],
    dateTo: to.toISOString().split("T")[0],
  };
}

function parseUrlFilters(search: string): Partial<FilterInput> {
  const params = new URLSearchParams(search);
  const out: Partial<FilterInput> = {};
  const df = params.get("dateFrom");
  const dt = params.get("dateTo");
  if (df) out.dateFrom = df;
  if (dt) out.dateTo = dt;
  const searchQ = params.get("search");
  if (searchQ) out.search = searchQ;
  const numKeys = ["customerId", "supplierId", "accountId", "repId", "costCenterId", "branchId", "itemId", "warehouseId", "categoryId", "areaId"] as const;
  for (const key of numKeys) {
    const v = params.get(key);
    if (v) out[key] = Number(v);
  }
  const pt = params.get("paymentType");
  if (pt === "cash" || pt === "credit") out.paymentType = pt;
  return out;
}

function buildFilterQueryString(query: FilterInput, includeDates: boolean) {
  const params = new URLSearchParams();
  if (includeDates && query.dateFrom) params.set("dateFrom", query.dateFrom);
  if (includeDates && query.dateTo) params.set("dateTo", query.dateTo);
  if (query.search) params.set("search", query.search);
  if (query.customerId) params.set("customerId", String(query.customerId));
  if (query.supplierId) params.set("supplierId", String(query.supplierId));
  if (query.accountId) params.set("accountId", String(query.accountId));
  if (query.repId) params.set("repId", String(query.repId));
  if (query.costCenterId) params.set("costCenterId", String(query.costCenterId));
  if (query.branchId) params.set("branchId", String(query.branchId));
  if (query.itemId) params.set("itemId", String(query.itemId));
  if (query.warehouseId) params.set("warehouseId", String(query.warehouseId));
  if (query.categoryId) params.set("categoryId", String(query.categoryId));
  if (query.areaId) params.set("areaId", String(query.areaId));
  if (query.paymentType) params.set("paymentType", query.paymentType);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function fmt(n: unknown) {
  const v = Number(n ?? 0);
  if (Number.isNaN(v)) return String(n ?? "");
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getSlugFromPath(pathname: string, section: string, reports: ReportSectionDef[]): string {
  const parts = pathname.split("/").filter(Boolean);
  const idx = parts.indexOf(section);
  const slug = parts[idx + 1];
  if (slug && reports.some((r) => r.slug === slug)) return slug;
  return reports[0]?.slug || "";
}

function useReportData(procedure: ReportProcedure, input: FilterInput, enabled: boolean) {
  const accounting = trpc.reports.accountingBySlug.useQuery(input, { enabled: enabled && procedure === "accountingBySlug" });
  const finalR = trpc.reports.finalBySlug.useQuery(input, { enabled: enabled && procedure === "finalBySlug" });
  const hr = trpc.reports.hrBySlug.useQuery(input, { enabled: enabled && procedure === "hrBySlug" });
  const assets = trpc.reports.assetsBySlug.useQuery(input, { enabled: enabled && procedure === "assetsBySlug" });
  const active = { accountingBySlug: accounting, finalBySlug: finalR, hrBySlug: hr, assetsBySlug: assets }[procedure];
  return active;
}

type ReportHubProps = {
  title: string;
  section: string;
  icon: ReactNode;
  reports: ReportSectionDef[];
  procedure: ReportProcedure;
};

export default function ReportHub({ title, section, icon, reports, procedure }: ReportHubProps) {
  const [location, navigate] = useLocation();
  const tenantSlug = useTenantSlug();
  const slug = getSlugFromPath(location, section, reports);
  const reportMeta = reports.find((r) => r.slug === slug) || reports[0];

  const dates = defaultDates();
  const [dateFrom, setDateFrom] = useState(dates.dateFrom);
  const [dateTo, setDateTo] = useState(dates.dateTo);
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState<string>("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [repId, setRepId] = useState<string>("");
  const [costCenterId, setCostCenterId] = useState<string>("");
  const [branchId, setBranchId] = useState<string>("");
  const [itemId, setItemId] = useState<string>("");
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [areaId, setAreaId] = useState<string>("");
  const [paymentType, setPaymentType] = useState<string>("");
  const [query, setQuery] = useState<FilterInput>(() => ({ slug, ...dates }));

  useEffect(() => {
    const urlFilters = parseUrlFilters(window.location.search);
    if (!Object.keys(urlFilters).length) return;
    if (urlFilters.dateFrom) setDateFrom(urlFilters.dateFrom);
    if (urlFilters.dateTo) setDateTo(urlFilters.dateTo);
    if (urlFilters.search) setSearch(urlFilters.search);
    if (urlFilters.customerId) setCustomerId(String(urlFilters.customerId));
    if (urlFilters.supplierId) setSupplierId(String(urlFilters.supplierId));
    if (urlFilters.accountId) setAccountId(String(urlFilters.accountId));
    if (urlFilters.repId) setRepId(String(urlFilters.repId));
    if (urlFilters.costCenterId) setCostCenterId(String(urlFilters.costCenterId));
    if (urlFilters.branchId) setBranchId(String(urlFilters.branchId));
    if (urlFilters.itemId) setItemId(String(urlFilters.itemId));
    if (urlFilters.warehouseId) setWarehouseId(String(urlFilters.warehouseId));
    if (urlFilters.categoryId) setCategoryId(String(urlFilters.categoryId));
    if (urlFilters.areaId) setAreaId(String(urlFilters.areaId));
    if (urlFilters.paymentType) setPaymentType(urlFilters.paymentType);
    setQuery({ slug, ...dates, ...urlFilters });
  }, [slug, location]);

  const entityFilters = getReportEntityFilters(section, slug);
  const needs = (f: ReportEntityFilter) => entityFilters.includes(f);
  const selectedBranchId = branchId ? Number(branchId) : undefined;

  const { data: customersList } = trpc.customers.list.useQuery(
    { limit: 200, branchId: selectedBranchId },
    { enabled: needs("customer") },
  );
  const { data: suppliersList } = trpc.suppliers.list.useQuery(
    { limit: 200, branchId: selectedBranchId },
    { enabled: needs("supplier") },
  );
  const { data: accountsList } = trpc.accounts.chart.useQuery(undefined, { enabled: needs("account") });
  const { data: repsList } = trpc.salesReps.list.useQuery(undefined, { enabled: needs("rep") });
  const { data: costCentersList } = trpc.costCenters.list.useQuery(undefined, { enabled: needs("costCenter") });
  const { data: branchesList } = trpc.settings.branches.list.useQuery(undefined, { enabled: needs("branch") });
  const { data: itemsList } = trpc.items.list.useQuery({ limit: 200 }, { enabled: needs("item") });
  const { data: warehousesList } = trpc.warehouses.list.useQuery(
    { branchId: selectedBranchId },
    { enabled: needs("warehouse") || needs("branch") },
  );
  const { data: categoriesList } = trpc.items.categories.useQuery(undefined, { enabled: needs("category") });
  const { data: areasList } = trpc.parity.sales.areas.list.useQuery(undefined, { enabled: needs("area") });

  // عند تغيير الفرع أعد ضبط العميل/المورد/المخزن إن لم يعودوا ضمن الفرع
  useEffect(() => {
    if (!selectedBranchId) return;
    const custOk = (customersList?.rows || []).some((c: { id: number }) => String(c.id) === customerId);
    if (customerId && customersList && !custOk) setCustomerId("");
    const supOk = (suppliersList?.rows || []).some((s: { id: number }) => String(s.id) === supplierId);
    if (supplierId && suppliersList && !supOk) setSupplierId("");
    const whOk = (warehousesList || []).some((w: { id: number }) => String(w.id) === warehouseId);
    if (warehouseId && warehousesList && !whOk) setWarehouseId("");
  }, [selectedBranchId, customersList, suppliersList, warehousesList, customerId, supplierId, warehouseId]);

  const filterInput = useMemo(() => ({
    slug,
    ...(reportMeta?.needsDates ? { dateFrom: query.dateFrom, dateTo: query.dateTo } : {}),
    search: query.search,
    customerId: query.customerId,
    supplierId: query.supplierId,
    accountId: query.accountId,
    repId: query.repId,
    costCenterId: query.costCenterId,
    branchId: query.branchId,
    itemId: query.itemId,
    warehouseId: query.warehouseId,
    categoryId: query.categoryId,
    areaId: query.areaId,
    paymentType: query.paymentType,
  }), [slug, query, reportMeta?.needsDates]);

  const { data: rows = [], isLoading, refetch } = useReportData(procedure, filterInput, !!slug);

  const columns = useMemo(() => {
    if (!rows.length) return [];
    return Object.keys(rows[0] as object).filter((k) => !["drillSlug", "section"].includes(k));
  }, [rows]);

  const totals = useMemo(() => {
    const result: Record<string, number> = {};
    let hasAny = false;
    for (const col of columns) {
      if (!REPORT_TOTAL_COLUMNS.has(col)) continue;
      let sum = 0;
      let numeric = false;
      for (const row of rows as Record<string, unknown>[]) {
        const v = row[col];
        if (typeof v === "number" && Number.isFinite(v)) {
          sum += v;
          numeric = true;
        }
      }
      if (numeric) {
        result[col] = sum;
        hasAny = true;
      }
    }
    return hasAny ? result : null;
  }, [rows, columns]);

  const handleSearch = () => {
    setQuery({
      slug,
      ...(reportMeta?.needsDates ? { dateFrom, dateTo } : {}),
      search: search.trim() || undefined,
      customerId: customerId ? Number(customerId) : undefined,
      supplierId: supplierId ? Number(supplierId) : undefined,
      accountId: accountId ? Number(accountId) : undefined,
      repId: repId ? Number(repId) : undefined,
      costCenterId: costCenterId ? Number(costCenterId) : undefined,
      branchId: branchId ? Number(branchId) : undefined,
      itemId: itemId ? Number(itemId) : undefined,
      warehouseId: warehouseId ? Number(warehouseId) : undefined,
      categoryId: categoryId ? Number(categoryId) : undefined,
      areaId: areaId ? Number(areaId) : undefined,
      paymentType: paymentType === "cash" || paymentType === "credit" ? paymentType : undefined,
    });
    refetch();
  };

  const entitySelect = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    options: { id: number; label: string }[],
  ) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v)}>
        <SelectTrigger className="w-44"><SelectValue placeholder="الكل" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">الكل</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={String(o.id)}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const handleExport = () => {
    if (!rows.length) return;
    const ws = XLSX.utils.json_to_sheet(rows as object[]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, reportMeta?.title || "report");
    XLSX.writeFile(wb, `${section}-${slug}-${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  return (
    <ERPLayout title={title}>
      <div className="flex flex-col lg:flex-row gap-4 min-h-[70vh]" dir="rtl">
        <aside className="lg:w-64 flex-shrink-0 print:hidden max-h-[80vh] overflow-y-auto">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-2">
              <p className="text-xs font-semibold text-slate-500 px-2 py-2 flex items-center gap-2">
                {icon} {title}
              </p>
              <nav className="space-y-0.5">
                {reports.map((r) => (
                  <button
                    key={r.slug}
                    type="button"
                    onClick={() => navigate(tenantPath(tenantSlug, `/reports/${section}/${r.slug}`))}
                    className={`w-full text-right px-3 py-2 rounded-lg text-sm transition-colors ${
                      slug === r.slug ? "bg-blue-600 text-white font-medium" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {r.title}
                  </button>
                ))}
              </nav>
            </CardContent>
          </Card>
        </aside>

        <div className="flex-1 space-y-4">
          <Card className="border-0 shadow-sm print:hidden">
            <CardContent className="p-4">
              <h2 className="font-semibold text-slate-800 mb-4">{reportMeta?.title}</h2>
              <div className="flex flex-wrap gap-3 items-end">
                {reportMeta?.needsDates && (
                  <>
                    <div>
                      <Label className="text-xs">من تاريخ</Label>
                      <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
                    </div>
                    <div>
                      <Label className="text-xs">إلى تاريخ</Label>
                      <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
                    </div>
                  </>
                )}
                {needs("customer") && entitySelect(
                  "العميل",
                  customerId,
                  setCustomerId,
                  (customersList?.rows || []).map((c: { id: number; name: string }) => ({ id: c.id, label: c.name })),
                )}
                {needs("supplier") && entitySelect(
                  "المورد",
                  supplierId,
                  setSupplierId,
                  (suppliersList?.rows || []).map((s: { id: number; name: string }) => ({ id: s.id, label: s.name })),
                )}
                {needs("account") && entitySelect(
                  "الحساب",
                  accountId,
                  setAccountId,
                  (accountsList || []).map((a: { id: number; name: string; code?: string }) => ({ id: a.id, label: `${a.code || ""} ${a.name}`.trim() })),
                )}
                {needs("rep") && entitySelect(
                  "المندوب",
                  repId,
                  setRepId,
                  (repsList || []).map((r: { id: number; name: string }) => ({ id: r.id, label: r.name })),
                )}
                {needs("costCenter") && entitySelect(
                  "مركز التكلفة",
                  costCenterId,
                  setCostCenterId,
                  (costCentersList || []).map((c: { id: number; name: string }) => ({ id: c.id, label: c.name })),
                )}
                {needs("branch") && entitySelect(
                  "الفرع",
                  branchId,
                  setBranchId,
                  (branchesList || []).map((b: { id: number; name: string }) => ({ id: b.id, label: b.name })),
                )}
                {needs("item") && entitySelect(
                  "الصنف",
                  itemId,
                  setItemId,
                  (itemsList?.rows || []).map((it: { id: number; name: string; code?: string | null }) => ({
                    id: it.id,
                    label: `${it.code || ""} ${it.name}`.trim(),
                  })),
                )}
                {needs("warehouse") && entitySelect(
                  "المخزن",
                  warehouseId,
                  setWarehouseId,
                  (warehousesList || []).map((w: { id: number; name: string }) => ({ id: w.id, label: w.name })),
                )}
                {needs("category") && entitySelect(
                  "الفئة",
                  categoryId,
                  setCategoryId,
                  (categoriesList || []).map((c: { id: number; name: string }) => ({ id: c.id, label: c.name })),
                )}
                {needs("area") && entitySelect(
                  "المنطقة",
                  areaId,
                  setAreaId,
                  (areasList || []).map((a: Record<string, unknown>) => ({ id: Number(a.id), label: String(a.name) })),
                )}
                {needs("paymentType") && (
                  <div>
                    <Label className="text-xs">نوع الدفع</Label>
                    <Select value={paymentType || "all"} onValueChange={(v) => setPaymentType(v === "all" ? "" : v)}>
                      <SelectTrigger className="w-36"><SelectValue placeholder="الكل" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">الكل</SelectItem>
                        <SelectItem value="cash">نقدي</SelectItem>
                        <SelectItem value="credit">آجل</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex-1 min-w-[160px]">
                  <Label className="text-xs">بحث</Label>
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="رقم فاتورة / اسم..." />
                </div>
                <Button onClick={handleSearch} className="bg-blue-600 hover:bg-blue-700 gap-1">
                  <Search size={16} /> عرض
                </Button>
                <Button variant="outline" onClick={handleExport} disabled={!rows.length} className="gap-1">
                  <Download size={16} /> Excel
                </Button>
                <Button variant="outline" onClick={() => window.print()} className="gap-1">
                  <Printer size={16} /> طباعة
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm overflow-x-auto">
            <CardContent className="p-0">
              {isLoading ? (
                <p className="p-8 text-center text-slate-500">جاري التحميل...</p>
              ) : !rows.length ? (
                <p className="p-8 text-center text-slate-500">لا توجد بيانات للفترة المحددة</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      {columns.map((col) => (
                        <th key={col} className="px-3 py-2 text-right font-medium whitespace-nowrap">{reportColumnLabel(col)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(rows as Record<string, unknown>[]).map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                        {columns.map((col) => {
                          const val = row[col];
                          const drillSlug = row.drillSlug as string | undefined;
                          const drillSection = row.section as string | undefined;
                          const isMetricCol = col === "metric" && drillSlug && drillSection;
                          return (
                            <td key={col} className="px-3 py-2 border-b border-slate-100 whitespace-nowrap">
                              {isMetricCol ? (
                                <button
                                  type="button"
                                  className="text-blue-600 hover:underline font-medium"
                                  onClick={() => {
                                    const qs = buildFilterQueryString(query, true);
                                    navigate(tenantPath(tenantSlug, `/reports/${drillSection}/${drillSlug}${qs}`));
                                  }}
                                >
                                  {String(val ?? "")}
                                </button>
                              ) : typeof val === "number" ? fmt(val) : String(val ?? "")}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  {totals && (
                    <tfoot>
                      <tr className="bg-slate-100 font-semibold border-t-2 border-slate-300">
                        {columns.map((col, i) => (
                          <td key={col} className="px-3 py-2 whitespace-nowrap">
                            {i === 0 && totals[col] == null
                              ? `الإجمالي (${rows.length})`
                              : totals[col] != null
                                ? fmt(totals[col])
                                : ""}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ERPLayout>
  );
}
