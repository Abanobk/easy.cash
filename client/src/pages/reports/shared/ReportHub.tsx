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
import { Checkbox } from "@/components/ui/checkbox";
import { printTableReport, printGroupedInvoiceReport, printAccountStatementReport, printFormalAccountingReport } from "@/lib/print-report";

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
  currencyCode?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  paymentStatus?: "paid" | "partial" | "unpaid";
  taxFilter?: "with" | "without";
  discountFilter?: "with" | "without";
  /** ميجا ميزان المراجعة: اخفاء الارصدة الصفرية (افتراضي غير مفعّل = عرض الأصفار) */
  hideZeroBalances?: boolean;
  /** ميجا: مستوى العرض (2..7) */
  displayLevel?: number;
  /** ميجا: حالة النشاط خلال الفترة */
  activityStatus?: "active" | "inactive";
  /** ميجا: ترتيب بـ */
  orderBy?: "code" | "name" | "balance";
  /** ميجا ميزان: طريقة تجميع العملاء */
  customerGrouping?: "all" | "zeroBalances" | "byCategory";
  /** ميجا كشف حساب */
  showOpeningMovements?: boolean;
  showCounterAccounts?: boolean;
  hideDetails?: boolean;
  notes?: string;
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
  const cc = params.get("currencyCode");
  if (cc) out.currencyCode = cc;
  const ddf = params.get("dueDateFrom");
  const ddt = params.get("dueDateTo");
  if (ddf) out.dueDateFrom = ddf;
  if (ddt) out.dueDateTo = ddt;
  const ps = params.get("paymentStatus");
  if (ps === "paid" || ps === "partial" || ps === "unpaid") out.paymentStatus = ps;
  const tf = params.get("taxFilter");
  if (tf === "with" || tf === "without") out.taxFilter = tf;
  const discF = params.get("discountFilter");
  if (discF === "with" || discF === "without") out.discountFilter = discF;
  const hzb = params.get("hideZeroBalances");
  if (hzb === "1" || hzb === "true") out.hideZeroBalances = true;
  const dl = params.get("displayLevel");
  if (dl && Number.isFinite(Number(dl))) out.displayLevel = Number(dl);
  const act = params.get("activityStatus");
  if (act === "active" || act === "inactive") out.activityStatus = act;
  const ob = params.get("orderBy");
  if (ob === "code" || ob === "name" || ob === "balance") out.orderBy = ob;
    const cg = params.get("customerGrouping");
  if (cg === "all" || cg === "zeroBalances" || cg === "byCategory") out.customerGrouping = cg;
  if (params.get("showOpeningMovements") === "1") out.showOpeningMovements = true;
  if (params.get("showCounterAccounts") === "1") out.showCounterAccounts = true;
  if (params.get("hideDetails") === "1") out.hideDetails = true;
  const notesQ = params.get("notes");
  if (notesQ) out.notes = notesQ;
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
  if (query.currencyCode) params.set("currencyCode", query.currencyCode);
  if (query.dueDateFrom) params.set("dueDateFrom", query.dueDateFrom);
  if (query.dueDateTo) params.set("dueDateTo", query.dueDateTo);
  if (query.paymentStatus) params.set("paymentStatus", query.paymentStatus);
  if (query.taxFilter) params.set("taxFilter", query.taxFilter);
  if (query.discountFilter) params.set("discountFilter", query.discountFilter);
  if (query.hideZeroBalances) params.set("hideZeroBalances", "1");
  if (query.displayLevel != null) params.set("displayLevel", String(query.displayLevel));
  if (query.activityStatus) params.set("activityStatus", query.activityStatus);
  if (query.orderBy) params.set("orderBy", query.orderBy);
  if (query.customerGrouping) params.set("customerGrouping", query.customerGrouping);
  if (query.showOpeningMovements) params.set("showOpeningMovements", "1");
  if (query.showCounterAccounts) params.set("showCounterAccounts", "1");
  if (query.hideDetails) params.set("hideDetails", "1");
  if (query.notes) params.set("notes", query.notes);
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
  const [currencyCode, setCurrencyCode] = useState<string>("");
  const [dueDateFrom, setDueDateFrom] = useState<string>("");
  const [dueDateTo, setDueDateTo] = useState<string>("");
  const [paymentStatus, setPaymentStatus] = useState<string>("");
  const [taxFilter, setTaxFilter] = useState<string>("");
  const [discountFilter, setDiscountFilter] = useState<string>("");
  const [hideZeroBalances, setHideZeroBalances] = useState(false);
  const [displayLevel, setDisplayLevel] = useState<string>("");
  const [activityStatus, setActivityStatus] = useState<string>("");
  const [orderBy, setOrderBy] = useState<string>("code");
  const [customerGrouping, setCustomerGrouping] = useState<string>("");
  const [showOpeningMovements, setShowOpeningMovements] = useState(false);
  const [showCounterAccounts, setShowCounterAccounts] = useState(false);
  const [hideDetails, setHideDetails] = useState(false);
  const [notes, setNotes] = useState("");
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
    if (urlFilters.currencyCode) setCurrencyCode(urlFilters.currencyCode);
    if (urlFilters.dueDateFrom) setDueDateFrom(urlFilters.dueDateFrom);
    if (urlFilters.dueDateTo) setDueDateTo(urlFilters.dueDateTo);
    if (urlFilters.paymentStatus) setPaymentStatus(urlFilters.paymentStatus);
    if (urlFilters.taxFilter) setTaxFilter(urlFilters.taxFilter);
    if (urlFilters.discountFilter) setDiscountFilter(urlFilters.discountFilter);
    if (urlFilters.hideZeroBalances) setHideZeroBalances(true);
    if (urlFilters.displayLevel != null) setDisplayLevel(String(urlFilters.displayLevel));
    if (urlFilters.activityStatus) setActivityStatus(urlFilters.activityStatus);
    if (urlFilters.orderBy) setOrderBy(urlFilters.orderBy);
    if (urlFilters.customerGrouping) setCustomerGrouping(urlFilters.customerGrouping);
    if (urlFilters.showOpeningMovements) setShowOpeningMovements(true);
    if (urlFilters.showCounterAccounts) setShowCounterAccounts(true);
    if (urlFilters.hideDetails) setHideDetails(true);
    if (urlFilters.notes) setNotes(urlFilters.notes);
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
  const { data: exchangeRatesList } = trpc.parity.settings.exchangeRates.list.useQuery(undefined, { enabled: needs("currency") });

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
    currencyCode: query.currencyCode,
    dueDateFrom: query.dueDateFrom,
    dueDateTo: query.dueDateTo,
    paymentStatus: query.paymentStatus,
    taxFilter: query.taxFilter,
    discountFilter: query.discountFilter,
    hideZeroBalances: query.hideZeroBalances,
    displayLevel: query.displayLevel,
    activityStatus: query.activityStatus,
    orderBy: query.orderBy,
    customerGrouping: query.customerGrouping,
    showOpeningMovements: query.showOpeningMovements,
    showCounterAccounts: query.showCounterAccounts,
    hideDetails: query.hideDetails,
    notes: query.notes,
  }), [slug, query, reportMeta?.needsDates]);

  const { data: rows = [], isLoading, refetch } = useReportData(procedure, filterInput, !!slug);

  const isAccountStatement = slug === "accountingreports-accountstatment";
  const isCustomerItemStatement = slug === "accountingreports-customeraccountstatementbyitems";

  const CUSTOMER_ITEM_STATEMENT_COLUMN_ORDER = [
    "date", "documentNumber", "description",
    "outQty", "outPrice", "outTotal",
    "inQty", "inPrice", "inTotal",
    "cashBankIn", "cashBankOut", "checkCollected", "checkRejected", "otherOps",
    "balance",
  ] as const;


  /** ترتيب أعمدة كشف الحساب كما في ميجا (إكسل/PDF) */
  const ACCOUNT_STATEMENT_COLUMN_ORDER = [
    "date",
    "entryNumber",
    "documentNumber",
    "debit",
    "credit",
    "balance",
    "exchangeRate",
    "description",
  ] as const;

  const columns = useMemo(() => {
    if (!rows.length) return [];
    const keys = Object.keys(rows[0] as object).filter((k) => !["drillSlug", "section"].includes(k));
    const order = isAccountStatement
      ? ACCOUNT_STATEMENT_COLUMN_ORDER
      : isCustomerItemStatement
        ? CUSTOMER_ITEM_STATEMENT_COLUMN_ORDER
        : null;
    if (!order) return keys;
    const preferred = order.filter((k) => keys.includes(k));
    const rest = keys.filter((k) => !(order as readonly string[]).includes(k));
    return [...preferred, ...rest];
  }, [rows, isAccountStatement, isCustomerItemStatement]);

  const totals = useMemo(() => {
    // ميجا: الإجمالي صف داخل البيانات («اجمالي حركات الفترة») — لا نضاعفه في تذييل الجدول
    if (isAccountStatement) return null;
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
  }, [rows, columns, isAccountStatement]);

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
      currencyCode: currencyCode || undefined,
      dueDateFrom: dueDateFrom || undefined,
      dueDateTo: dueDateTo || undefined,
      paymentStatus: paymentStatus === "paid" || paymentStatus === "partial" || paymentStatus === "unpaid" ? paymentStatus : undefined,
      taxFilter: taxFilter === "with" || taxFilter === "without" ? taxFilter : undefined,
      discountFilter: discountFilter === "with" || discountFilter === "without" ? discountFilter : undefined,
      hideZeroBalances: slug === "finalreports-trialbalance" ? hideZeroBalances : undefined,
      displayLevel:
        slug === "finalreports-trialbalance" && displayLevel
          ? Number(displayLevel)
          : undefined,
      activityStatus:
        slug === "finalreports-trialbalance" && (activityStatus === "active" || activityStatus === "inactive")
          ? activityStatus
          : undefined,
      orderBy:
        slug === "finalreports-trialbalance" && (orderBy === "code" || orderBy === "name" || orderBy === "balance")
          ? orderBy
          : undefined,
      customerGrouping:
        slug === "finalreports-trialbalance" && (customerGrouping === "all" || customerGrouping === "zeroBalances" || customerGrouping === "byCategory")
          ? customerGrouping
          : undefined,
      showOpeningMovements: isAccountStatement && showOpeningMovements ? true : undefined,
      showCounterAccounts: isAccountStatement && showCounterAccounts ? true : undefined,
      hideDetails: isAccountStatement && hideDetails ? true : undefined,
      notes: isAccountStatement && notes.trim() ? notes.trim() : undefined,
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

  const { data: company } = trpc.saas.getCompanyProfile.useQuery();
  const utils = trpc.useUtils();
  const [printing, setPrinting] = useState(false);
  const isPurchasesOrSalesDetail = slug === "accountingreports-purchases" || slug === "accountingreports-sales";

  const handlePrintReport = async () => {
    if (!rows.length) return;
    const companyProps = {
      companyName: company?.name,
      companyAddress: company?.address ?? undefined,
      companyPhone: company?.phone ?? undefined,
      companyTaxNumber: company?.taxNumber ?? undefined,
      companyLogo: company?.logo,
    };

    if (isPurchasesOrSalesDetail) {
      setPrinting(true);
      try {
        const kind = slug === "accountingreports-purchases" ? "purchases" as const : "sales" as const;
        const detail = await utils.reports.purchasesSalesDetail.fetch({
          kind,
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
          customerId: query.customerId,
          supplierId: query.supplierId,
          warehouseId: query.warehouseId,
          branchId: query.branchId,
          paymentType: query.paymentType,
          search: query.search,
        });
        printGroupedInvoiceReport({
          title: reportMeta?.title || title,
          partyLabel: kind === "purchases" ? "المورد" : "العميل",
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
          documents: detail.documents,
          summary: detail.summary,
          ...companyProps,
        });
      } finally {
        setPrinting(false);
      }
      return;
    }

    if (isAccountStatement) {
      const selectedAccount = (accountsList || []).find((a: { id: number }) => a.id === query.accountId);
      const accountLabel = selectedAccount
        ? `${(selectedAccount as { code?: string }).code || ""} ${(selectedAccount as { name: string }).name}`.trim()
        : "—";
      const code = query.currencyCode || company?.currency || "EGP";
      printAccountStatementReport({
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        accountLabel,
        currencyCode: code,
        rows: rows as Record<string, unknown>[],
        companyName: companyProps.companyName,
        companyAddress: companyProps.companyAddress,
        companyPhone: companyProps.companyPhone,
        companyMobile: company?.phone2 ?? undefined,
        companyLogo: companyProps.companyLogo,
        notes: query.notes,
        optionFlags: [
          query.showOpeningMovements ? "عرض حركات الرصيد الافتتاحي" : "",
          query.showCounterAccounts ? "عرض الحسابات المقابلة" : "",
          query.hideDetails ? "اخفاء التفاصيل" : "",
        ].filter(Boolean),
      });
      return;
    }

    if (isCustomerItemStatement) {
      const customer = (customersList?.rows || []).find((c: { id: number }) => c.id === query.customerId);
      printFormalAccountingReport({
        reportName: "كشف حساب عميل بالاصناف",
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        metaLine: customer ? `العميل: ${(customer as { name: string }).name}` : undefined,
        columns: columns.map((key) => ({ key, label: reportColumnLabel(key) })),
        rows: rows as Record<string, unknown>[],
        numericKeys: ["outQty","outPrice","outTotal","inQty","inPrice","inTotal","cashBankIn","cashBankOut","checkCollected","checkRejected","otherOps","balance"],
        dateKeys: ["date"],
        isSpecialRow: (row) => {
          const d = String(row.description ?? "");
          return d === "الرصيد السابق" || d === "اجمالي حركات الفترة";
        },
        companyName: companyProps.companyName,
        companyAddress: companyProps.companyAddress,
        companyPhone: companyProps.companyPhone,
        companyMobile: company?.phone2 ?? undefined,
        companyLogo: companyProps.companyLogo,
      });
      return;
    }

    const isTrialBalance = slug === "finalreports-trialbalance";
    const isGeneralLedger = slug === "finalreports-generalledger";
    const customerGroupingMeta =
      query.customerGrouping === "all" ? "طريقة تجميع العملاء: كل العملاء"
      : query.customerGrouping === "zeroBalances" ? "طريقة تجميع العملاء: العملاء ذات الارصدة الصفرية"
      : query.customerGrouping === "byCategory" ? "طريقة تجميع العملاء: تجميع فئة عملاء"
      : undefined;
    if (isTrialBalance || isGeneralLedger) {
      printFormalAccountingReport({
        reportName: isTrialBalance ? "ميزان المراجعة" : "الاستاذ العام",
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        metaLine: isTrialBalance ? customerGroupingMeta : undefined,
        columns: columns.map((key) => ({ key, label: reportColumnLabel(key) })),
        rows: rows as Record<string, unknown>[],
        numericKeys: isTrialBalance
          ? ["openingDebit", "openingCredit", "periodDebit", "periodCredit", "closingDebit", "closingCredit"]
          : ["debit", "credit", "balance"],
        dateKeys: isGeneralLedger ? ["date"] : [],
        isSpecialRow: isGeneralLedger
          ? (row) => {
              const d = String(row.date ?? "");
              return d === "رصيد سابق" || d === "اجمالى" || d === "اجمالي";
            }
          : undefined,
        companyName: companyProps.companyName,
        companyAddress: companyProps.companyAddress,
        companyPhone: companyProps.companyPhone,
        companyMobile: company?.phone2 ?? undefined,
        companyLogo: companyProps.companyLogo,
      });
      return;
    }

    printTableReport({
      title: reportMeta?.title || title,
      dateFrom: reportMeta?.needsDates ? query.dateFrom : undefined,
      dateTo: reportMeta?.needsDates ? query.dateTo : undefined,
      columns: columns.map((key) => ({ key, label: reportColumnLabel(key) })),
      rows: rows as Record<string, unknown>[],
      totals,
      ...companyProps,
    });
  };

  return (
    <ERPLayout title={title}>
      <div className="space-y-4" dir="rtl">
        <div className="flex items-center gap-2.5">
          <span style={{ color: "var(--brass-600)" }}>{icon}</span>
          <h1 className="text-lg font-extrabold" style={{ color: "var(--ink-900)" }}>{reportMeta?.title || title}</h1>
        </div>

        <div className="space-y-4">
          <Card className="eca-card border-0 shadow-none print:hidden">
            <CardContent className="p-4">
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
                  slug === "finalreports-trialbalance" || slug === "finalreports-generalledger"
                    ? "الحساب الرئيسي"
                    : slug === "accountingreports-accountstatment"
                      ? "اسم الحساب"
                      : "الحساب",
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
                {needs("currency") && (
                  <div>
                    <Label className="text-xs">العملة</Label>
                    <Select value={currencyCode || "all"} onValueChange={(v) => setCurrencyCode(v === "all" ? "" : v)}>
                      <SelectTrigger className="w-32"><SelectValue placeholder="الكل" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">الكل</SelectItem>
                        <SelectItem value="EGP">EGP</SelectItem>
                        {(exchangeRatesList || [])
                          .filter((r: Record<string, unknown>) => r.code !== "EGP")
                          .map((r: Record<string, unknown>) => (
                            <SelectItem key={String(r.code)} value={String(r.code)}>{String(r.code)}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {needs("dueDate") && (
                  <>
                    <div>
                      <Label className="text-xs">تاريخ استحقاق من</Label>
                      <Input type="date" value={dueDateFrom} onChange={(e) => setDueDateFrom(e.target.value)} className="w-40" />
                    </div>
                    <div>
                      <Label className="text-xs">تاريخ استحقاق إلى</Label>
                      <Input type="date" value={dueDateTo} onChange={(e) => setDueDateTo(e.target.value)} className="w-40" />
                    </div>
                  </>
                )}
                {needs("paymentStatus") && (
                  <div>
                    <Label className="text-xs">حالة التحصيل / السداد</Label>
                    <Select value={paymentStatus || "all"} onValueChange={(v) => setPaymentStatus(v === "all" ? "" : v)}>
                      <SelectTrigger className="w-40"><SelectValue placeholder="الكل" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">الكل</SelectItem>
                        <SelectItem value="paid">مسدد بالكامل</SelectItem>
                        <SelectItem value="partial">مسدد جزئيًا</SelectItem>
                        <SelectItem value="unpaid">غير مسدد</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {needs("taxFilter") && (
                  <div>
                    <Label className="text-xs">الضريبة</Label>
                    <Select value={taxFilter || "all"} onValueChange={(v) => setTaxFilter(v === "all" ? "" : v)}>
                      <SelectTrigger className="w-32"><SelectValue placeholder="الكل" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">الكل</SelectItem>
                        <SelectItem value="with">بضريبة</SelectItem>
                        <SelectItem value="without">بدون ضريبة</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {needs("discountFilter") && (
                  <div>
                    <Label className="text-xs">الخصم</Label>
                    <Select value={discountFilter || "all"} onValueChange={(v) => setDiscountFilter(v === "all" ? "" : v)}>
                      <SelectTrigger className="w-32"><SelectValue placeholder="الكل" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">الكل</SelectItem>
                        <SelectItem value="with">بخصم</SelectItem>
                        <SelectItem value="without">بدون خصم</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {slug === "finalreports-trialbalance" && (
                  <>
                    <div>
                      <Label className="text-xs">طريقة تجميع العملاء</Label>
                      <Select value={customerGrouping || "none"} onValueChange={(v) => setCustomerGrouping(v === "none" ? "" : v)}>
                        <SelectTrigger className="w-52"><SelectValue placeholder="اختر" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">اختر</SelectItem>
                          <SelectItem value="all">كل العملاء</SelectItem>
                          <SelectItem value="zeroBalances">العملاء ذات الارصدة الصفرية</SelectItem>
                          <SelectItem value="byCategory">تجميع فئة عملاء</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">مستوى العرض</Label>
                      <Select value={displayLevel || "all"} onValueChange={(v) => setDisplayLevel(v === "all" ? "" : v)}>
                        <SelectTrigger className="w-28"><SelectValue placeholder="اختر" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">اختر</SelectItem>
                          {[2, 3, 4, 5, 6, 7].map((n) => (
                            <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">حالة النشاط</Label>
                      <Select value={activityStatus || "all"} onValueChange={(v) => setActivityStatus(v === "all" ? "" : v)}>
                        <SelectTrigger className="w-44"><SelectValue placeholder="اختر" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">اختر</SelectItem>
                          <SelectItem value="active">النشط خلال الفترة</SelectItem>
                          <SelectItem value="inactive">الغير نشط خلال الفترة</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">ترتيب بـ</Label>
                      <Select value={orderBy || "code"} onValueChange={setOrderBy}>
                        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="code">كود شجرة الحسابات</SelectItem>
                          <SelectItem value="name">الاسم</SelectItem>
                          <SelectItem value="balance">الاعلى رصيد</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <label className="flex items-center gap-2 pb-2 cursor-pointer select-none">
                      <Checkbox
                        checked={hideZeroBalances}
                        onCheckedChange={(v) => setHideZeroBalances(v === true)}
                      />
                      <span className="text-xs">اخفاء الارصدة الصفرية</span>
                    </label>
                  </>
                )}
                {isAccountStatement && (
                  <>
                    <div className="min-w-[180px]">
                      <Label className="text-xs">ملاحظات</Label>
                      <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات التقرير" />
                    </div>
                    <label className="flex items-center gap-2 pb-2 cursor-pointer select-none">
                      <Checkbox checked={showOpeningMovements} onCheckedChange={(v) => setShowOpeningMovements(v === true)} />
                      <span className="text-xs">عرض حركات الرصيد الافتتاحي</span>
                    </label>
                    <label className="flex items-center gap-2 pb-2 cursor-pointer select-none">
                      <Checkbox checked={showCounterAccounts} onCheckedChange={(v) => setShowCounterAccounts(v === true)} />
                      <span className="text-xs">عرض الحسابات المقابلة</span>
                    </label>
                    <label className="flex items-center gap-2 pb-2 cursor-pointer select-none">
                      <Checkbox checked={hideDetails} onCheckedChange={(v) => setHideDetails(v === true)} />
                      <span className="text-xs">اخفاء التفاصيل</span>
                    </label>
                  </>
                )}
                <div className="flex-1 min-w-[160px]">
                  <Label className="text-xs">بحث</Label>
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="رقم فاتورة / اسم..." />
                </div>
                <Button onClick={handleSearch} className="eca-btn-primary border-0 gap-1">
                  <Search size={16} /> عرض
                </Button>
                <Button variant="outline" onClick={handleExport} disabled={!rows.length} className="gap-1">
                  <Download size={16} /> Excel
                </Button>
                <Button variant="outline" onClick={() => void handlePrintReport()} disabled={!rows.length || printing} className="gap-1">
                  <Printer size={16} /> {printing ? "جاري التجهيز..." : "طباعة / PDF"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="eca-card border-0 shadow-none overflow-x-auto">
            <CardContent className="p-0">
              {isLoading ? (
                <p className="p-8 text-center text-slate-500">جاري التحميل...</p>
              ) : !rows.length ? (
                <p className="p-8 text-center text-slate-500">لا توجد بيانات للفترة المحددة</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "var(--ink-700)", color: "white" }}>
                      {columns.map((col) => (
                        <th key={col} className="px-3 py-2 text-right font-medium whitespace-nowrap">{reportColumnLabel(col)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(rows as Record<string, unknown>[]).map((row, i) => {
                      const desc = String(row.description ?? "");
                      const isSpecial = isAccountStatement && (desc === "رصيد سابق" || desc === "اجمالي حركات الفترة");
                      return (
                      <tr
                        key={i}
                        style={{
                          background: isSpecial ? "var(--paper-100)" : i % 2 === 0 ? "#ffffff" : "var(--paper-50)",
                          fontWeight: isSpecial ? 700 : undefined,
                        }}
                      >
                        {columns.map((col) => {
                          const val = row[col];
                          const drillSlug = row.drillSlug as string | undefined;
                          const drillSection = row.section as string | undefined;
                          const isMetricCol = col === "metric" && drillSlug && drillSection;
                          return (
                            <td key={col} className="px-3 py-2 border-b whitespace-nowrap" style={{ borderColor: "var(--line)" }}>
                              {isMetricCol ? (
                                <button
                                  type="button"
                                  className="hover:underline font-medium"
                                  style={{ color: "var(--brass-600)" }}
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
                      );
                    })}
                  </tbody>
                  {totals && (
                    <tfoot>
                      <tr className="font-semibold border-t-2" style={{ background: "var(--paper-100)", borderColor: "var(--brass-500)" }}>
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
