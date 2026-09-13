import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import ERPLayout from "@/components/ERPLayout";
import { trpc } from "@/lib/trpc";
import { useTenantSlug, tenantPath } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Download, Printer, Search, Package, Trash2, CheckSquare } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  printInventoryReport,
  stocktakePrintColumns,
  type PrintInventoryColumn,
  type PrintInventoryRow,
} from "@/lib/print-inventory-report";

const REPORTS = [
  { slug: "stocktake", title: "جرد المخازن", needsDates: false, needsAsOfDate: false },
  { slug: "item-movements", title: "حركة تفصيلية للاصناف", needsDates: true, needsAsOfDate: false },
  { slug: "warehouse-in-out", title: "صادر / وارد مخزن", needsDates: true, needsAsOfDate: false },
  { slug: "warehouse-movements", title: "حركة تفصيلية للمخازن", needsDates: true, needsAsOfDate: false },
  { slug: "item-costs", title: "تكاليف الأصناف (قيمة الأصناف)", needsDates: false, needsAsOfDate: true },
  { slug: "items-list", title: "قائمة الأصناف", needsDates: false, needsAsOfDate: false },
  { slug: "item-summary", title: "ملخص حركة الأصناف", needsDates: true, needsAsOfDate: false },
  { slug: "item-in-out", title: "صادر / وارد صنف", needsDates: true, needsAsOfDate: false },
  { slug: "stagnant-items", title: "الأصناف الراكدة", needsDates: false, needsAsOfDate: false },
  { slug: "item-aging", title: "أعمار الأصناف", needsDates: false, needsAsOfDate: false },
] as const;

const SLUG_ALIASES: Record<string, ReportSlug> = {
  "invreports-inventorysummary": "stocktake",
  "invreports-itemstransferdetails": "item-movements",
  "invreports-totalinventoryexportimportreport": "warehouse-in-out",
  "invreports-inventorytransferdetailsreport": "warehouse-movements",
  "invreports-itemscosts": "item-costs",
  "invreports-itemslist": "items-list",
  "invreports-itemssummary": "item-summary",
  "invreports-incomeoutcomeitem": "item-in-out",
  "invreports-stagnantitems": "stagnant-items",
  "invreports-itemaging": "item-aging",
  totalinventoryexportimportreport: "warehouse-in-out",
  inventorytransferdetailsreport: "warehouse-movements",
  itemscosts: "item-costs",
  itemslist: "items-list",
  itemssummary: "item-summary",
  incomeoutcomeitem: "item-in-out",
};

type ReportSlug = (typeof REPORTS)[number]["slug"];

type FilterInput = {
  dateFrom?: string;
  dateTo?: string;
  branchId?: number;
  warehouseId?: number;
  categoryId?: number;
  itemId?: number;
  search?: string;
  batchNumber?: string;
  expiryFrom?: string;
  expiryTo?: string;
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

function fmt(n: number | string | null | undefined, digits = 2) {
  return Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function getReportSlug(pathname: string): ReportSlug {
  const parts = pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("inventory");
  const raw = parts[idx + 1];
  if (!raw) return "stocktake";
  if (SLUG_ALIASES[raw]) return SLUG_ALIASES[raw];
  const slug = raw as ReportSlug;
  if (REPORTS.some((r) => r.slug === slug)) return slug;
  return "stocktake";
}

export default function InventoryReports() {
  const [location, navigate] = useLocation();
  const tenantSlug = useTenantSlug();
  const reportSlug = getReportSlug(location);
  const reportMeta = REPORTS.find((r) => r.slug === reportSlug)!;

  const dates = defaultDates();
  const [dateFrom, setDateFrom] = useState(dates.dateFrom);
  const [dateTo, setDateTo] = useState(dates.dateTo);
  const [branchId, setBranchId] = useState<string>("all");
  const [warehouseId, setWarehouseId] = useState<string>("all");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryFrom, setExpiryFrom] = useState("");
  const [expiryTo, setExpiryTo] = useState("");
  const [query, setQuery] = useState<FilterInput>(() => ({ ...dates }));
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const filterInput: FilterInput = useMemo(() => ({
    ...(reportMeta.needsDates ? { dateFrom: query.dateFrom, dateTo: query.dateTo } : {}),
    ...(reportMeta.needsAsOfDate ? { dateTo: query.dateTo } : {}),
    branchId: query.branchId,
    warehouseId: query.warehouseId,
    categoryId: query.categoryId,
    search: query.search || undefined,
    batchNumber: query.batchNumber,
    expiryFrom: query.expiryFrom,
    expiryTo: query.expiryTo,
  }), [query, reportMeta.needsDates, reportMeta.needsAsOfDate]);

  const selectedBranch = branchId !== "all" ? Number(branchId) : undefined;
  const branchesQuery = trpc.settings.branches.list.useQuery();
  const warehousesQuery = trpc.warehouses.list.useQuery({ branchId: selectedBranch });
  const categoriesQuery = trpc.items.categories.useQuery();
  const utils = trpc.useUtils();

  const filteredWarehouses = warehousesQuery.data || [];

  const stocktakeQ = trpc.reports.inventoryStocktake.useQuery(filterInput, { enabled: reportSlug === "stocktake" });
  const itemMovementsQ = trpc.reports.inventoryItemMovements.useQuery(filterInput, { enabled: reportSlug === "item-movements" });
  const warehouseInOutQ = trpc.reports.inventoryWarehouseInOut.useQuery(filterInput, { enabled: reportSlug === "warehouse-in-out" });
  const warehouseMovementsQ = trpc.reports.inventoryWarehouseMovements.useQuery(filterInput, { enabled: reportSlug === "warehouse-movements" });
  const itemCostsQ = trpc.reports.inventoryItemCosts.useQuery(filterInput, { enabled: reportSlug === "item-costs" });
  const itemsListQ = trpc.reports.inventoryItemsList.useQuery(filterInput, { enabled: reportSlug === "items-list" });
  const itemSummaryQ = trpc.reports.inventoryItemSummary.useQuery(filterInput, { enabled: reportSlug === "item-summary" });
  const itemInOutQ = trpc.reports.inventoryItemInOut.useQuery(filterInput, { enabled: reportSlug === "item-in-out" });
  const stagnantQ = trpc.reports.inventoryStagnantItems.useQuery(filterInput, { enabled: reportSlug === "stagnant-items" });
  const agingQ = trpc.reports.inventoryItemAging.useQuery(filterInput, { enabled: reportSlug === "item-aging" });

  const bulkPurgeMut = trpc.items.bulkPurge.useMutation({
    onSuccess: (res) => {
      toast.success(`تم تصفير/حذف ${res.purged} صنف (حُذف نهائياً: ${res.deleted})`);
      if (res.failed) toast.message((res.errors || []).slice(0, 2).join(" · "));
      setSelectedIds(new Set());
      void itemCostsQ.refetch();
      void itemsListQ.refetch();
      void utils.items.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const activeQuery = {
    stocktake: stocktakeQ,
    "item-movements": itemMovementsQ,
    "warehouse-in-out": warehouseInOutQ,
    "warehouse-movements": warehouseMovementsQ,
    "item-costs": itemCostsQ,
    "items-list": itemsListQ,
    "item-summary": itemSummaryQ,
    "item-in-out": itemInOutQ,
    "stagnant-items": stagnantQ,
    "item-aging": agingQ,
  }[reportSlug];

  const rows = (activeQuery.data as any[]) || [];
  const tableConfig = getTableConfig(reportSlug);
  const canSelectItems = reportSlug === "item-costs" || reportSlug === "items-list";
  const allSelected = canSelectItems && rows.length > 0 && rows.every((r: any) => selectedIds.has(Number(r.itemId ?? r.id)));

  const rowItemId = (r: any) => Number(r.itemId ?? r.id) || 0;

  const toggleAll = () => {
    if (!canSelectItems) return;
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(rows.map(rowItemId).filter((id: number) => id > 0)));
  };

  const toggleOne = (itemId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleBulkDelete = () => {
    const ids = [...selectedIds];
    if (!ids.length) return toast.error("حدّد أصنافاً أولاً");
    if (!confirm(`حذف ${ids.length} صنف مع تصفير رصيد أول المدة والمخازن؟\n\nبعدها ارفع إكسل نظيف من مخزون أول المدة.`)) return;
    if (!confirm("تأكيد أخير: الأصناف اللي ليها فواتير هيتصفر رصيدها ومش هتتمسح.")) return;
    bulkPurgeMut.mutate({ itemIds: ids, confirm: "PURGE_ITEMS" });
  };

  const handleSearch = () => {
    setQuery({
      ...(reportMeta.needsDates ? { dateFrom, dateTo } : {}),
      ...(reportMeta.needsAsOfDate ? { dateTo } : {}),
      branchId: branchId !== "all" ? Number(branchId) : undefined,
      warehouseId: warehouseId !== "all" ? Number(warehouseId) : undefined,
      categoryId: categoryId !== "all" ? Number(categoryId) : undefined,
      search: search.trim() || undefined,
      batchNumber: batchNumber.trim() || undefined,
      expiryFrom: expiryFrom || undefined,
      expiryTo: expiryTo || undefined,
    });
  };

  const handleExport = () => {
    if (!rows.length) return;
    const sheetRows = tableConfig.exportRows(rows);
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, reportMeta.title);
    XLSX.writeFile(wb, `inventory-${reportSlug}-${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const companyQ = trpc.settings.company.get.useQuery();

  const handlePrint = () => {
    const filterLabels = [
      reportMeta.needsDates && query.dateFrom && query.dateTo
        ? `الفترة: ${query.dateFrom} → ${query.dateTo}`
        : "",
      reportMeta.needsAsOfDate && query.dateTo
        ? `التاريخ: ${query.dateTo}`
        : "",
      query.branchId
        ? `الفرع: ${(branchesQuery.data || []).find((b: any) => b.id === query.branchId)?.name || query.branchId}`
        : "كل الفروع",
      query.warehouseId
        ? `المخزن: ${filteredWarehouses.find((w: any) => w.id === query.warehouseId)?.name || query.warehouseId}`
        : "كل المخازن",
      query.categoryId
        ? `الفئة: ${(categoriesQuery.data || []).find((c: any) => c.id === query.categoryId)?.name || query.categoryId}`
        : "",
      query.search ? `بحث: ${query.search}` : "",
      query.batchNumber ? `دفعة: ${query.batchNumber}` : "",
    ].filter(Boolean) as string[];

    if (reportSlug === "stocktake") {
      const printRows: PrintInventoryRow[] = rows.map((r: any) => ({
        code: r.code || "—",
        name: r.name,
        warehouse: r.warehouseName,
        category: r.categoryName || "—",
        qty: fmt(r.quantity, 3),
        unit: r.unit || "—",
        cost: fmt(r.purchasePrice),
        value: fmt(r.stockValue),
      }));
      const totalValue = fmt(rows.reduce((s: number, r: any) => s + Number(r.stockValue || 0), 0));
      printInventoryReport({
        title: reportMeta.title,
        companyName: (companyQ.data as any)?.name || undefined,
        subtitle: "ورقة جرد للمراجع — كمية النظام + خانات يدوية للكمية الفعلية",
        filters: filterLabels,
        columns: stocktakePrintColumns(),
        rows: printRows,
        totals: {
          name: "الإجمالي",
          value: totalValue,
        },
        landscape: true,
      });
      return;
    }

    const columns: PrintInventoryColumn[] = tableConfig.columns.map((col) => ({
      key: col.key,
      label: col.label,
    }));
    const printRows: PrintInventoryRow[] = rows.map((r: any) => {
      const out: PrintInventoryRow = {};
      for (const col of tableConfig.columns) {
        const rendered = col.render(r);
        out[col.key] =
          typeof rendered === "string" || typeof rendered === "number"
            ? rendered
            : String((r as any)[col.key] ?? "");
      }
      return out;
    });
    printInventoryReport({
      title: reportMeta.title,
      companyName: (companyQ.data as any)?.name || undefined,
      subtitle: "تقرير مخزني — Easy Cash",
      filters: filterLabels,
      columns,
      rows: printRows,
      landscape: columns.length >= 7,
    });
  };

  return (
    <ERPLayout title="تقارير المخازن">
      <div className="flex flex-col lg:flex-row gap-4 min-h-[70vh]" dir="rtl">
        {/* Reports sidebar */}
        <aside className="lg:w-56 flex-shrink-0 print:hidden">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-2">
              <p className="text-xs font-semibold text-slate-500 px-2 py-2 flex items-center gap-2">
                <Package size={14} /> تقارير المخازن
              </p>
              <nav className="space-y-0.5">
                {REPORTS.map((r) => (
                  <button
                    key={r.slug}
                    type="button"
                    onClick={() => navigate(tenantPath(tenantSlug, `/reports/inventory/${r.slug}`))}
                    className={`w-full text-right px-3 py-2 rounded-lg text-sm transition-colors ${
                      reportSlug === r.slug
                        ? "bg-blue-600 text-white font-medium"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {r.title}
                  </button>
                ))}
              </nav>
            </CardContent>
          </Card>
        </aside>

        {/* Main */}
        <div className="flex-1 space-y-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div>
              <h2 className="text-xl font-bold text-slate-800">{reportMeta.title}</h2>
              <p className="text-sm text-slate-500">تقرير مخزني — Easy Cash ERP</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint} disabled={!rows.length}>
                <Printer size={14} /> طباعة
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport} disabled={!rows.length}>
                <Download size={14} /> Excel
              </Button>
            </div>
          </div>

          {canSelectItems && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 print:hidden">
              <p className="text-sm text-amber-900 flex-1 min-w-[12rem]">
                مسح مجمع قبل الاستيراد النظيف: اضغط <strong>عرض</strong> ثم حدّد الأصناف أو استخدم تحديد الكل.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 bg-white border-amber-300"
                onClick={toggleAll}
                disabled={!rows.length}
              >
                <CheckSquare size={14} />
                {allSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5"
                disabled={!selectedIds.size || bulkPurgeMut.isPending}
                onClick={handleBulkDelete}
              >
                <Trash2 size={14} />
                {bulkPurgeMut.isPending ? "جاري الحذف..." : `حذف المحدد (${selectedIds.size})`}
              </Button>
            </div>
          )}

          <Card className="border-0 shadow-sm print:hidden">
            <CardContent className="pt-4">
              <div className="flex flex-wrap items-end gap-3">
                {reportMeta.needsDates && (
                  <>
                    <div>
                      <Label className="text-xs mb-1 block">من تاريخ</Label>
                      <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 w-40" />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">إلى تاريخ</Label>
                      <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-40" />
                    </div>
                  </>
                )}
                {reportMeta.needsAsOfDate && (
                  <div>
                    <Label className="text-xs mb-1 block">التاريخ</Label>
                    <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 w-40" />
                  </div>
                )}
                <div>
                  <Label className="text-xs mb-1 block">الفرع</Label>
                  <Select
                    value={branchId}
                    onValueChange={(v) => {
                      setBranchId(v);
                      setWarehouseId("all");
                    }}
                  >
                    <SelectTrigger className="h-9 w-44"><SelectValue placeholder="الكل" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">كل الفروع</SelectItem>
                      {(branchesQuery.data || []).map((b: any) => (
                        <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">المخزن</Label>
                  <Select value={warehouseId} onValueChange={setWarehouseId}>
                    <SelectTrigger className="h-9 w-44"><SelectValue placeholder="الكل" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">كل المخازن</SelectItem>
                      {filteredWarehouses.map((w: any) => (
                        <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">الفئة</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger className="h-9 w-44"><SelectValue placeholder="الكل" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">كل الفئات</SelectItem>
                      {(categoriesQuery.data || []).map((c: any) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-[140px]">
                  <Label className="text-xs mb-1 block">بحث بالصنف / الكود / السيريل نمبر</Label>
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="اسم أو كود أو سيريل نمبر" className="h-9" />
                </div>
                {reportSlug === "stocktake" && (
                  <>
                    <div>
                      <Label className="text-xs mb-1 block">رقم الدفعة</Label>
                      <Input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} placeholder="اختياري" className="h-9 w-36" />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">انتهاء من</Label>
                      <Input type="date" value={expiryFrom} onChange={(e) => setExpiryFrom(e.target.value)} className="h-9 w-36" />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">انتهاء إلى</Label>
                      <Input type="date" value={expiryTo} onChange={(e) => setExpiryTo(e.target.value)} className="h-9 w-36" />
                    </div>
                  </>
                )}
                <Button size="sm" className="h-9 bg-blue-600 hover:bg-blue-700 gap-1.5" onClick={handleSearch}>
                  <Search size={14} /> عرض
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm overflow-hidden report-print-card">
            <CardContent className="p-0">
              {activeQuery.isLoading ? (
                <div className="py-16 text-center text-slate-400 text-sm">جاري تحميل التقرير...</div>
              ) : activeQuery.isError ? (
                <div className="py-16 text-center text-red-500 text-sm">{activeQuery.error.message}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm report-print-table">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200">
                        {canSelectItems && (
                          <th className="px-2 py-2.5 text-center w-12 border border-slate-200 print:hidden">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-blue-600"
                              checked={allSelected}
                              onChange={toggleAll}
                              title="تحديد الكل"
                            />
                          </th>
                        )}
                        {tableConfig.columns.map((col) => (
                          <th key={col.key} className="px-3 py-2.5 text-right text-xs font-semibold text-slate-700 whitespace-nowrap border border-slate-200">
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row: any, i: number) => (
                        <tr key={i} className={`border-b border-slate-100 hover:bg-blue-50/30 ${i % 2 === 1 ? "bg-slate-50/80" : "bg-white"}`}>
                          {canSelectItems && (
                            <td className="px-2 py-2 text-center border border-slate-100 print:hidden">
                              <input
                                type="checkbox"
                                className="h-4 w-4 accent-blue-600"
                                checked={selectedIds.has(rowItemId(row))}
                                onChange={() => toggleOne(rowItemId(row))}
                              />
                            </td>
                          )}
                          {tableConfig.columns.map((col) => (
                            <td key={col.key} className={`px-3 py-2 text-slate-700 border border-slate-100 ${col.key === "name" || col.key === "warehouse" ? "whitespace-normal min-w-[8rem]" : "whitespace-nowrap"}`}>
                              {col.render(row)}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {!rows.length && (
                        <tr>
                          <td colSpan={tableConfig.columns.length + (canSelectItems ? 1 : 0)} className="py-12 text-center text-slate-400">
                            لا توجد بيانات للفترة أو الفلاتر المحددة
                          </td>
                        </tr>
                      )}
                    </tbody>
                    {rows.length > 0 && tableConfig.footer && (
                      <tfoot>
                        <tr className="bg-blue-50 font-semibold">
                          {canSelectItems && <td className="border border-slate-100 print:hidden" />}
                          {tableConfig.footer(rows)}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ERPLayout>
  );
}

type Col = { key: string; label: string; render: (row: any) => React.ReactNode };

function getTableConfig(slug: ReportSlug): {
  columns: Col[];
  exportRows: (rows: any[]) => Record<string, unknown>[];
  footer?: (rows: any[]) => React.ReactNode[];
} {
  switch (slug) {
    case "stocktake":
      // ميجا جرد المخازن (PDF): الفئة | الصنف | الباركود | الوحدة / التشغيلة | الكمية | حجز / طلب | صافى الكمية
      return {
        columns: [
          { key: "category", label: "الفئة", render: (r) => r.categoryName || "—" },
          { key: "name", label: "الصنف", render: (r) => r.name },
          { key: "barcode", label: "الباركود", render: (r) => r.barcode || r.code || "—" },
          { key: "unit", label: "الوحدة / التشغيلة", render: (r) => r.batchNumber ? `${r.unit || ""} / ${r.batchNumber}` : (r.unit || "—") },
          { key: "qty", label: "الكمية", render: (r) => fmt(r.quantity, 3) },
          { key: "reserved", label: "حجز / طلب", render: (r) => fmt(r.reservedQty ?? 0, 3) },
          { key: "net", label: "صافى الكمية", render: (r) => fmt(r.netQty ?? (Number(r.quantity || 0) - Number(r.reservedQty || 0)), 3) },
          { key: "warehouse", label: "المخزن", render: (r) => r.warehouseName },
        ],
        exportRows: (rows) => rows.map((r) => ({
          الفئة: r.categoryName, الصنف: r.name, الباركود: r.barcode || r.code,
          "الوحدة / التشغيلة": r.batchNumber ? `${r.unit || ""} / ${r.batchNumber}` : r.unit,
          الكمية: r.quantity, "حجز / طلب": r.reservedQty ?? 0,
          "صافى الكمية": r.netQty ?? (Number(r.quantity || 0) - Number(r.reservedQty || 0)),
          المخزن: r.warehouseName,
        })),
      };

    case "item-movements":
      // ميجا حركة تفصيلية للاصناف (PDF)
      return {
        columns: [
          { key: "date", label: "التاريخ", render: (r) => r.date },
          { key: "doc", label: "رقم المستند", render: (r) => r.documentNumber || "—" },
          { key: "batch", label: "رقم التشغيلة", render: (r) => r.batchNumber || "—" },
          { key: "from", label: "من", render: (r) => r.fromLocation || "—" },
          { key: "to", label: "إلي", render: (r) => r.toLocation || "—" },
          { key: "in", label: "كمية واردة", render: (r) => r.quantityIn > 0 ? fmt(r.quantityIn, 3) : "—" },
          { key: "out", label: "كمية صادرة", render: (r) => r.quantityOut > 0 ? fmt(r.quantityOut, 3) : "—" },
          { key: "balQty", label: "الرصيد", render: (r) => fmt(r.balanceQty, 3) },
          { key: "val", label: "القيمة", render: (r) => fmt(r.lineValue) },
          { key: "balVal", label: "رصيد قيمة", render: (r) => fmt(r.balanceValue) },
          { key: "costIn", label: "تكلفة الوحدة الواردة", render: (r) => r.unitCostIn > 0 ? fmt(r.unitCostIn) : "—" },
          { key: "costOut", label: "تكلفة الوحدة الصادرة", render: (r) => r.unitCostOut > 0 ? fmt(r.unitCostOut) : "—" },
        ],
        exportRows: (rows) => rows.map((r) => ({
          التاريخ: r.date, "رقم المستند": r.documentNumber, "رقم التشغيلة": r.batchNumber,
          من: r.fromLocation, إلي: r.toLocation,
          "كمية واردة": r.quantityIn, "كمية صادرة": r.quantityOut, الرصيد: r.balanceQty,
          القيمة: r.lineValue, "رصيد قيمة": r.balanceValue,
          "تكلفة الوحدة الواردة": r.unitCostIn, "تكلفة الوحدة الصادرة": r.unitCostOut,
          الصنف: r.itemName, "كود الصنف": r.itemCode,
        })),
      };

    case "warehouse-in-out":
      // ميجا صادر/وارد مخزن — صفوف تفصيلية (PDF)
      return {
        columns: [
          { key: "date", label: "التاريخ", render: (r) => r.date },
          { key: "doc", label: "رقم المستند", render: (r) => r.documentNumber || "—" },
          { key: "item", label: "اسم الصنف", render: (r) => r.itemName },
          { key: "barcode", label: "الباركود", render: (r) => r.barcode || "—" },
          { key: "unit", label: "وحدة القياس", render: (r) => r.unit || "—" },
          { key: "batch", label: "رقم التشغيلة", render: (r) => r.batchNumber || "—" },
          { key: "in", label: "وارد", render: (r) => r.quantityIn > 0 ? fmt(r.quantityIn, 3) : "—" },
          { key: "out", label: "صادر", render: (r) => r.quantityOut > 0 ? fmt(r.quantityOut, 3) : "—" },
          { key: "bal", label: "رصيد", render: (r) => fmt(r.balanceQty, 3) },
          { key: "from", label: "من", render: (r) => r.fromLocation || "—" },
          { key: "to", label: "الى", render: (r) => r.toLocation || "—" },
        ],
        exportRows: (rows) => rows.map((r) => ({
          التاريخ: r.date, "رقم المستند": r.documentNumber, "اسم الصنف": r.itemName,
          الباركود: r.barcode, "وحدة القياس": r.unit, "رقم التشغيلة": r.batchNumber,
          وارد: r.quantityIn, صادر: r.quantityOut, رصيد: r.balanceQty,
          من: r.fromLocation, الى: r.toLocation, المخزن: r.warehouseName,
        })),
      };

    case "warehouse-movements":
      // ميجا حركة تفصيلية للمخازن (PDF)
      return {
        columns: [
          { key: "date", label: "التاريخ", render: (r) => r.date },
          { key: "type", label: "نوع العملية", render: (r) => r.operationType || r.documentTypeLabel || "—" },
          { key: "warehouse", label: "المخزن", render: (r) => r.warehouseName },
          { key: "item", label: "الصنف", render: (r) => r.itemName },
          { key: "unit", label: "وحدة القياس", render: (r) => r.unit || "—" },
          { key: "in", label: "الكمية الواردة", render: (r) => r.quantityIn > 0 ? fmt(r.quantityIn, 3) : "—" },
          { key: "out", label: "الكمية الصادرة", render: (r) => r.quantityOut > 0 ? fmt(r.quantityOut, 3) : "—" },
          { key: "balQty", label: "الرصيد", render: (r) => fmt(r.balanceQty, 3) },
          { key: "inVal", label: "القيمة الواردة", render: (r) => fmt(r.inValue ?? 0) },
          { key: "outVal", label: "القيمة الصادرة", render: (r) => fmt(r.outValue ?? 0) },
          { key: "balVal", label: "رصيد قيمة", render: (r) => fmt(r.balanceValue ?? 0) },
        ],
        exportRows: (rows) => rows.map((r) => ({
          التاريخ: r.date, "نوع العملية": r.operationType || r.documentTypeLabel,
          المخزن: r.warehouseName, الصنف: r.itemName, "وحدة القياس": r.unit,
          "الكمية الواردة": r.quantityIn, "الكمية الصادرة": r.quantityOut, الرصيد: r.balanceQty,
          "القيمة الواردة": r.inValue, "القيمة الصادرة": r.outValue, "رصيد قيمة": r.balanceValue,
        })),
      };

    case "item-costs":
      // ميجا تكاليف الاصناف (PDF)
      return {
        columns: [
          { key: "barcode", label: "الباركود", render: (r) => r.barcode || r.code || "—" },
          { key: "name", label: "الصنف", render: (r) => r.name },
          { key: "cat", label: "الفئة", render: (r) => r.categoryName || "—" },
          { key: "unit", label: "الوحدة", render: (r) => r.unit || "—" },
          { key: "wh", label: "المخزن", render: (r) => (r.warehouseCount > 1 ? `عدة مخازن (${r.warehouseCount})` : (r.warehouseName || "—")) },
          { key: "qty", label: "الكمية", render: (r) => fmt(r.quantity, 3) },
          { key: "avg", label: "متوسط التكلفة", render: (r) => fmt(r.averageCost ?? r.purchasePrice) },
          { key: "totalCost", label: "اجمالي التكلفة", render: (r) => fmt(r.totalCostValue) },
          { key: "sale", label: "السعر", render: (r) => fmt(r.salePrice) },
          { key: "totalPrice", label: "اجمالى بالسعر", render: (r) => fmt(Number(r.quantity || 0) * Number(r.salePrice || 0)) },
        ],
        exportRows: (rows) => rows.map((r) => ({
          الباركود: r.barcode || r.code, الصنف: r.name, الفئة: r.categoryName, الوحدة: r.unit,
          المخزن: r.warehouseCount > 1 ? `عدة مخازن (${r.warehouseCount})` : r.warehouseName,
          الكمية: r.quantity, "متوسط التكلفة": r.averageCost ?? r.purchasePrice,
          "اجمالي التكلفة": r.totalCostValue, السعر: r.salePrice,
          "اجمالى بالسعر": Number(r.quantity || 0) * Number(r.salePrice || 0),
        })),
      };

    case "items-list":
      // ميجا قائمة الاصناف (PDF)
      return {
        columns: [
          { key: "serial", label: "مسلسل", render: (r) => r.serial ?? r.id ?? "—" },
          { key: "barcode", label: "الباركود", render: (r) => r.barcode || "—" },
          { key: "name", label: "الصنف", render: (r) => r.name },
          { key: "cat", label: "الفئة", render: (r) => r.categoryName || "—" },
          { key: "altCat", label: "الفئة البديلة", render: (r) => r.altCategoryName || "—" },
          { key: "unit", label: "وحدة القياس", render: (r) => r.unit || "—" },
          { key: "price", label: "السعر", render: (r) => fmt(r.salePrice) },
          { key: "cost", label: "التكلفة الافتراضية", render: (r) => fmt(r.purchasePrice) },
          { key: "discPct", label: "خصم نسبة", render: (r) => fmt(r.discountPercent ?? 0) },
          { key: "discCash", label: "خصم نقدي", render: (r) => fmt(r.discountCash ?? 0) },
        ],
        exportRows: (rows) => rows.map((r) => ({
          مسلسل: r.serial ?? r.id, الباركود: r.barcode, الصنف: r.name, الفئة: r.categoryName,
          "الفئة البديلة": r.altCategoryName, "وحدة القياس": r.unit,
          السعر: r.salePrice, "التكلفة الافتراضية": r.purchasePrice,
          "خصم نسبة": r.discountPercent ?? 0, "خصم نقدي": r.discountCash ?? 0,
        })),
      };

    case "item-summary":
      // ميجا ملخص حركة الاصناف (PDF)
      return {
        columns: [
          { key: "barcode", label: "الباركود", render: (r) => r.barcode || r.itemCode || "—" },
          { key: "name", label: "الصنف", render: (r) => r.itemName },
          { key: "unit", label: "الوحدة", render: (r) => r.unit || "—" },
          { key: "openQty", label: "رصيد كمية سابق", render: (r) => fmt(r.openingQty ?? 0, 3) },
          { key: "openVal", label: "رصيد قيمة سابق", render: (r) => fmt(r.openingValue ?? 0) },
          { key: "in", label: "كمية واردة", render: (r) => fmt(r.totalIn, 3) },
          { key: "out", label: "كمية صادرة", render: (r) => fmt(r.totalOut, 3) },
          { key: "inVal", label: "قيمة واردة", render: (r) => fmt(r.inValue) },
          { key: "outVal", label: "قيمة صادرة", render: (r) => fmt(r.outValue) },
          { key: "balQty", label: "رصيد كمية", render: (r) => fmt(r.balanceQty ?? r.netQty, 3) },
          { key: "balVal", label: "رصيد قيمة", render: (r) => fmt(r.balanceValue ?? r.netValue) },
        ],
        exportRows: (rows) => rows.map((r) => ({
          الباركود: r.barcode || r.itemCode, الصنف: r.itemName, الوحدة: r.unit,
          "رصيد كمية سابق": r.openingQty, "رصيد قيمة سابق": r.openingValue,
          "كمية واردة": r.totalIn, "كمية صادرة": r.totalOut,
          "قيمة واردة": r.inValue, "قيمة صادرة": r.outValue,
          "رصيد كمية": r.balanceQty, "رصيد قيمة": r.balanceValue,
        })),
      };

    case "item-in-out":
      // ميجا صادر/وارد صنف (PDF)
      return {
        columns: [
          { key: "barcode", label: "الباركود", render: (r) => r.barcode || "—" },
          { key: "name", label: "الصنف", render: (r) => r.itemName },
          { key: "unit", label: "الوحدة", render: (r) => r.unit || "—" },
          { key: "purchases", label: "مشتريات", render: (r) => fmt(r.purchases ?? 0, 3) },
          { key: "purchaseReturns", label: "مردود مشتريات", render: (r) => fmt(r.purchaseReturns ?? 0, 3) },
          { key: "sales", label: "مبيعات", render: (r) => fmt(r.sales ?? 0, 3) },
          { key: "salesReturns", label: "مردود مبيعات", render: (r) => fmt(r.salesReturns ?? 0, 3) },
          { key: "production", label: "انتاج", render: (r) => fmt(r.production ?? 0, 3) },
          { key: "netPurchases", label: "صافي مشتريات", render: (r) => fmt(r.netPurchases ?? 0, 3) },
          { key: "netSales", label: "صافي مبيعات", render: (r) => fmt(r.netSales ?? 0, 3) },
          { key: "available", label: "الكمية المتاحة", render: (r) => fmt(r.availableQty ?? 0, 3) },
        ],
        exportRows: (rows) => rows.map((r) => ({
          الباركود: r.barcode, الصنف: r.itemName, الوحدة: r.unit,
          مشتريات: r.purchases, "مردود مشتريات": r.purchaseReturns,
          مبيعات: r.sales, "مردود مبيعات": r.salesReturns, انتاج: r.production,
          "صافي مشتريات": r.netPurchases, "صافي مبيعات": r.netSales,
          "الكمية المتاحة": r.availableQty,
        })),
      };

    case "stagnant-items":
      // ميجا الاصناف الراكدة (PDF) — أعمدة الحركات عند توفرها
      return {
        columns: [
          { key: "serial", label: "مسلسل", render: (r) => r.serial ?? r.itemId ?? "—" },
          { key: "name", label: "الصنف", render: (r) => r.name },
          { key: "cat", label: "الفئة", render: (r) => r.categoryName || "—" },
          { key: "unit", label: "وحدة القياس", render: (r) => r.unit || "—" },
          { key: "qty", label: "الكمية بالمخازن", render: (r) => fmt(r.quantity, 3) },
          { key: "cost", label: "التكلفة بالمخازن", render: (r) => fmt(r.stockValue) },
          { key: "purchaseMoves", label: "حركات شراء", render: (r) => String(r.purchaseMoves ?? 0) },
          { key: "purchaseReturnMoves", label: "مردود شراء", render: (r) => String(r.purchaseReturnMoves ?? 0) },
          { key: "saleMoves", label: "حركات بيع", render: (r) => String(r.saleMoves ?? 0) },
          { key: "saleReturnMoves", label: "مردود بيع", render: (r) => String(r.saleReturnMoves ?? 0) },
          { key: "productionMoves", label: "حركات انتاج", render: (r) => String(r.productionMoves ?? 0) },
          { key: "totalMoves", label: "اجمالي الحركات", render: (r) => String(r.totalMoves ?? 0) },
        ],
        exportRows: (rows) => rows.map((r) => ({
          مسلسل: r.serial ?? r.itemId, الصنف: r.name, الفئة: r.categoryName,
          "وحدة القياس": r.unit, "الكمية بالمخازن": r.quantity, "التكلفة بالمخازن": r.stockValue,
          "حركات شراء": r.purchaseMoves ?? 0, "مردود شراء": r.purchaseReturnMoves ?? 0,
          "حركات بيع": r.saleMoves ?? 0, "مردود بيع": r.saleReturnMoves ?? 0,
          "حركات انتاج": r.productionMoves ?? 0, "اجمالي الحركات": r.totalMoves ?? 0,
        })),
      };

    case "item-aging":
      // لا يوجد PDF على حساب الاختبار — الإبقاء على أعمدة العمر الحالية
      return {
        columns: [
          { key: "code", label: "الكود", render: (r) => r.code || "—" },
          { key: "name", label: "الصنف", render: (r) => r.name },
          { key: "warehouse", label: "المخزن", render: (r) => r.warehouseName },
          { key: "qty", label: "الكمية", render: (r) => fmt(r.quantity, 3) },
          { key: "value", label: "قيمة المخزون", render: (r) => fmt(r.stockValue) },
          { key: "last", label: "آخر وارد", render: (r) => r.lastInboundDate || "—" },
          { key: "age", label: "عمر الصنف (يوم)", render: (r) => String(r.ageDays) },
        ],
        exportRows: (rows) => rows.map((r) => ({
          الكود: r.code, الصنف: r.name, المخزن: r.warehouseName, الكمية: r.quantity,
          القيمة: r.stockValue, "آخر وارد": r.lastInboundDate, "العمر بالأيام": r.ageDays,
        })),
      };

    default:
      return { columns: [], exportRows: () => [] };
  }
}