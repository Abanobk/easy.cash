import { and, eq, gte, lte, lt, sql, desc, asc, inArray, type Column } from "drizzle-orm";
import type { Db } from "./db";
import { customerDebtAgingReport, supplierDebtAgingReport } from "./debt-aging";
import {
  accounts,
  bankTransactions,
  branches,
  cashTransactions,
  checks,
  costCenters,
  contactCategories,
  customers,
  items,
  journalEntries,
  journalEntryLines,
  purchaseInvoiceItems,
  purchaseInvoices,
  salesAreas,
  salesInvoiceItems,
  salesInvoices,
  salesReps,
  salesReturns,
  salesReturnItems,
  suppliers,
  warehouses,
  customerSalesReps,
} from "../drizzle/schema";
import { tenantWhere } from "./tenant-scope";

export type ReportFilters = {
  tenantId: number;
  dateFrom?: string;
  dateTo?: string;
  accountId?: number;
  customerId?: number;
  supplierId?: number;
  warehouseId?: number;
  /** نطاق مخازن المستخدم (متعدد) */
  warehouseIds?: number[];
  branchId?: number;
  /** نطاق فروع المستخدم (متعدد) */
  branchIds?: number[];
  costCenterId?: number;
  repId?: number;
  itemId?: number;
  categoryId?: number;
  areaId?: number;
  paymentType?: "cash" | "credit";
  search?: string;
  currencyCode?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  paymentStatus?: "paid" | "partial" | "unpaid";
  taxFilter?: "with" | "without";
  discountFilter?: "with" | "without";
  /** ميجا: اخفاء الارصدة الصفرية — افتراضي false (تعرض الأصفار) */
  hideZeroBalances?: boolean;
  /**
   * ميجا ميزان المراجعة — مستوى العرض (2..7 من قائمة ميجا).
   * نطبّقه كعمق الحساب في الشجرة (الجذر = 1).
   */
  displayLevel?: number;
  /** ميجا: حالة النشاط — النشط/الغير نشط خلال الفترة */
  activityStatus?: "active" | "inactive";
  /** ميجا: ترتيب بـ — كود شجرة الحسابات / الاسم / الاعلى رصيد */
  orderBy?: "code" | "name" | "balance";
  /**
   * ميجا ميزان المراجعة — طريقة تجميع العملاء
   * مرجع PDF ميجا 2026-09-13:
   * - all: سطر واحد «مجمع العملاء (كل العملاء)»
   * - zeroBalances: «مجمع العملاء (الارصدة الصفرية)» + تفصيل العملاء غير الصفريين
   * - byCategory: ميجا يطلب اختيار فئة عملاء (`categoryId`) قبل العرض
   */
  customerGrouping?: "all" | "zeroBalances" | "byCategory";
  /** ميجا كشف حساب: عرض حركات الرصيد الافتتاحي */
  showOpeningMovements?: boolean;
  /** ميجا كشف حساب: عرض الحسابات المقابلة */
  showCounterAccounts?: boolean;
  /** ميجا كشف حساب: اخفاء التفاصيل (= ملخص الفترة فقط) */
  hideDetails?: boolean;
  /** ميجا كشف حساب: ملاحظات (تظهر في رأس PDF) */
  notes?: string;
};

function dueDateConds(table: { dueDate: Column<any, object, object> }, from?: string, to?: string) {
  const parts = [];
  if (from) parts.push(gte(table.dueDate, from as any));
  if (to) parts.push(lte(table.dueDate, to as any));
  return parts;
}

/** حالة السداد كفلتر مستخدم — "unpaid" تعني آجلة لسه معلقة (status=confirmed) */
function paymentStatusCond(column: Column<any, object, object>, status?: "paid" | "partial" | "unpaid") {
  if (!status) return undefined;
  return eq(column, status === "unpaid" ? "confirmed" : status);
}

function taxFilterCond(column: Column<any, object, object>, filter?: "with" | "without") {
  if (!filter) return undefined;
  return filter === "with" ? sql`${column} > 0` : sql`${column} = 0`;
}

function discountFilterCond(column: Column<any, object, object>, filter?: "with" | "without") {
  if (!filter) return undefined;
  return filter === "with" ? sql`${column} > 0` : sql`${column} = 0`;
}

/** شرط فرع: فرع واحد أو قائمة نطاق */
export function reportBranchCond(column: any, filters: ReportFilters) {
  if (filters.branchId != null) return eq(column, filters.branchId);
  if (filters.branchIds?.length) return inArray(column, filters.branchIds);
  return undefined;
}

/** شرط مخزن: مخزن واحد أو قائمة نطاق */
export function reportWarehouseCond(column: any, filters: ReportFilters) {
  if (filters.warehouseId != null) return eq(column, filters.warehouseId);
  if (filters.warehouseIds?.length) return inArray(column, filters.warehouseIds);
  return undefined;
}

/** فلاتر فواتير البيع (يتطلب join customers للمنطقة/المندوب) */
function salesInvoiceExtraFilters(filters: ReportFilters) {
  return [
    reportBranchCond(salesInvoices.branchId, filters),
    reportWarehouseCond(salesInvoices.warehouseId, filters),
    filters.paymentType ? eq(salesInvoices.paymentType, filters.paymentType) : undefined,
    filters.customerId ? eq(salesInvoices.customerId, filters.customerId) : undefined,
    filters.areaId ? eq(customers.areaId, filters.areaId) : undefined,
    repInvoiceFilter(filters),
    filters.itemId ? eq(salesInvoiceItems.itemId, filters.itemId) : undefined,
    filters.categoryId ? eq(items.categoryId, filters.categoryId) : undefined,
  ];
}

/** فلاتر فواتير الشراء */
function purchaseInvoiceExtraFilters(filters: ReportFilters) {
  return [
    reportBranchCond(purchaseInvoices.branchId, filters),
    reportWarehouseCond(purchaseInvoices.warehouseId, filters),
    filters.paymentType ? eq(purchaseInvoices.paymentType, filters.paymentType) : undefined,
    filters.supplierId ? eq(purchaseInvoices.supplierId, filters.supplierId) : undefined,
    filters.itemId ? eq(purchaseInvoiceItems.itemId, filters.itemId) : undefined,
    filters.categoryId ? eq(items.categoryId, filters.categoryId) : undefined,
  ];
}

/** فرع العميل في معاملات نقدية/بنكية */
function paymentCustomerBranchCond(filters: ReportFilters) {
  if (filters.branchId != null) {
    return sql`(${customers.id} IS NULL OR ${customers.branchId} = ${filters.branchId})`;
  }
  if (filters.branchIds?.length) {
    return sql`(${customers.id} IS NULL OR ${customers.branchId} IN (${sql.join(filters.branchIds.map((id) => sql`${id}`), sql`, `)}))`;
  }
  return undefined;
}

export function num(v: unknown) {
  return Number(v ?? 0);
}

export function dateOnly(v: unknown) {
  if (!v) return "";
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    return v.toISOString().slice(0, 10);
  }
  const s = String(v);
  return s.includes("T") ? s.split("T")[0] : s.slice(0, 10);
}

function dateConds(table: { date: Column<any, object, object> }, from?: string, to?: string) {
  const parts = [];
  if (from) parts.push(gte(table.date, from as any));
  if (to) parts.push(lte(table.date, to as any));
  return parts;
}

/** فواتير مُرحّلة (آجلة + نقدية + جزئية) */
function salesPostedFilter() {
  return inArray(salesInvoices.status, ["confirmed", "paid", "partial"]);
}

function purchasePostedFilter() {
  return inArray(purchaseInvoices.status, ["confirmed", "paid", "partial"]);
}

/** فواتير آجلة بمتبقي */
function salesOpenFilter() {
  return inArray(salesInvoices.status, ["confirmed", "partial"]);
}

function purchaseOpenFilter() {
  return inArray(purchaseInvoices.status, ["confirmed", "partial"]);
}

export async function getPostedMovementByAccount(
  db: Db,
  tenantId: number,
  opts: { before?: string; from?: string; to?: string } = {},
) {
  const dateParts = [];
  if (opts.before) dateParts.push(lt(journalEntries.date, opts.before as any));
  if (opts.from) dateParts.push(gte(journalEntries.date, opts.from as any));
  if (opts.to) dateParts.push(lte(journalEntries.date, opts.to as any));

  const rawLines = await db.select({
    accountId: journalEntryLines.accountId,
    debit: journalEntryLines.debit,
    credit: journalEntryLines.credit,
  }).from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntryLines.entryId, journalEntries.id))
    .where(tenantWhere(journalEntries, tenantId,
      and(eq(journalEntries.status, "posted"), ...(dateParts.length ? [and(...dateParts)] : []))));

  const totals = new Map<number, { debit: number; credit: number }>();
  for (const l of rawLines) {
    const cur = totals.get(l.accountId) || { debit: 0, credit: 0 };
    cur.debit += num(l.debit);
    cur.credit += num(l.credit);
    totals.set(l.accountId, cur);
  }
  return totals;
}

export async function getAccountBalancesAsOf(
  db: Db,
  tenantId: number,
  asOf?: string,
) {
  const allAccounts = await db.select().from(accounts)
    .where(tenantWhere(accounts, tenantId, eq(accounts.isActive, true)));
  const movement = await getPostedMovementByAccount(db, tenantId, asOf ? { to: asOf } : {});
  return allAccounts.map((a) => {
    const m = movement.get(a.id) || { debit: 0, credit: 0 };
    const balance = num(a.balance) + m.debit - m.credit;
    return { ...a, balance: balance };
  });
}

export async function loadPostedJournalLines(db: Db, filters: ReportFilters) {
  const dateParts = dateConds(journalEntries, filters.dateFrom, filters.dateTo);
  const rows = await db
    .select({
      entryId: journalEntries.id,
      entryNumber: journalEntries.number,
      entryDate: journalEntries.date,
      entryDescription: journalEntries.description,
      accountId: journalEntryLines.accountId,
      accountCode: accounts.code,
      accountName: accounts.name,
      debit: journalEntryLines.debit,
      credit: journalEntryLines.credit,
      lineDescription: journalEntryLines.description,
      costCenterName: costCenters.name,
    })
    .from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntryLines.entryId, journalEntries.id))
    .innerJoin(accounts, eq(journalEntryLines.accountId, accounts.id))
    .leftJoin(costCenters, eq(journalEntryLines.costCenterId, costCenters.id))
    .where(
      tenantWhere(
        journalEntries,
        filters.tenantId,
        and(eq(journalEntries.status, "posted"), ...(dateParts.length ? [and(...dateParts)] : [])),
        filters.accountId ? eq(journalEntryLines.accountId, filters.accountId) : undefined,
        filters.costCenterId ? eq(journalEntryLines.costCenterId, filters.costCenterId) : undefined,
      ),
    )
    .orderBy(asc(journalEntries.date), asc(journalEntries.id));

  let running = 0;
  return rows.map((r) => {
    running += num(r.debit) - num(r.credit);
    return {
      date: dateOnly(r.entryDate),
      documentNumber: r.entryNumber,
      accountCode: r.accountCode,
      accountName: r.accountName,
      description: r.lineDescription || r.entryDescription || "",
      costCenter: r.costCenterName || "",
      debit: num(r.debit),
      credit: num(r.credit),
      balance: running,
    };
  });
}

/**
 * كشف حساب — شكل ميجا من «كشف حساب.xlsx» (تصميم/تشغيل، على بيانات التينانت):
 * أعمدة: التاريخ، رقم القيد، رقم المستند، مدين، دائن، الرصيد، سعر الصرف، الوصف
 * صفوف: رصيد سابق → حركات الفترة → اجمالي حركات الفترة
 * الحساب مطلوب زي ميجا (اسم الحساب).
 */
export async function accountStatementReport(db: Db, filters: ReportFilters) {
  if (filters.accountId == null) return [];

  const [account] = await db.select().from(accounts)
    .where(tenantWhere(accounts, filters.tenantId, eq(accounts.id, filters.accountId)));
  if (!account) return [];

  const costCenterCond = filters.costCenterId
    ? eq(journalEntryLines.costCenterId, filters.costCenterId)
    : undefined;

  const hideDetails = filters.hideDetails === true;
  const showOpeningMovements = filters.showOpeningMovements === true;
  const showCounterAccounts = filters.showCounterAccounts === true;

  // رصيد سابق قبل dateFrom (نفس أسلوب ميزان/أستاذ عندنا)
  let openingNet = 0;
  let openingDetailRows: {
    entryNumber: string;
    entryReference: string | null;
    entryDate: Date | string | null;
    entryDescription: string | null;
    debit: unknown;
    credit: unknown;
    lineDescription: string | null;
    entryId: number;
  }[] = [];

  if (filters.dateFrom) {
    const openingLines = await db.select({
      entryId: journalEntries.id,
      entryNumber: journalEntries.number,
      entryReference: journalEntries.reference,
      entryDate: journalEntries.date,
      entryDescription: journalEntries.description,
      debit: journalEntryLines.debit,
      credit: journalEntryLines.credit,
      lineDescription: journalEntryLines.description,
    }).from(journalEntryLines)
      .innerJoin(journalEntries, eq(journalEntryLines.entryId, journalEntries.id))
      .where(tenantWhere(journalEntries, filters.tenantId,
        and(
          eq(journalEntries.status, "posted"),
          eq(journalEntryLines.accountId, filters.accountId),
          lt(journalEntries.date, filters.dateFrom as any),
        ),
        costCenterCond))
      .orderBy(asc(journalEntries.date), asc(journalEntries.id));
    for (const l of openingLines) openingNet += num(l.debit) - num(l.credit);
    if (filters.costCenterId == null) openingNet += num(account.balance);
    openingDetailRows = openingLines;
  } else if (filters.costCenterId == null) {
    openingNet = num(account.balance);
  }

  const periodDateParts = dateConds(journalEntries, filters.dateFrom, filters.dateTo);
  const periodRows = await db.select({
    entryId: journalEntries.id,
    entryNumber: journalEntries.number,
    entryReference: journalEntries.reference,
    entryDate: journalEntries.date,
    entryDescription: journalEntries.description,
    debit: journalEntryLines.debit,
    credit: journalEntryLines.credit,
    lineDescription: journalEntryLines.description,
  }).from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntryLines.entryId, journalEntries.id))
    .where(tenantWhere(journalEntries, filters.tenantId,
      and(
        eq(journalEntries.status, "posted"),
        eq(journalEntryLines.accountId, filters.accountId),
        ...(periodDateParts.length ? [and(...periodDateParts)] : []),
      ),
      costCenterCond))
    .orderBy(asc(journalEntries.date), asc(journalEntries.id));

  // ميجا: عرض الحسابات المقابلة — أسماء الحسابات الأخرى في نفس القيد
  const counterByEntry = new Map<number, string>();
  if (showCounterAccounts && !hideDetails) {
    const entryIds = Array.from(new Set([
      ...openingDetailRows.map((r) => r.entryId),
      ...periodRows.map((r) => r.entryId),
    ].filter(Boolean)));
    if (entryIds.length) {
      const otherLines = await db.select({
        entryId: journalEntryLines.entryId,
        accountId: journalEntryLines.accountId,
        accountCode: accounts.code,
        accountName: accounts.name,
      }).from(journalEntryLines)
        .innerJoin(accounts, eq(journalEntryLines.accountId, accounts.id))
        .where(and(
          tenantWhere(journalEntryLines, filters.tenantId),
          inArray(journalEntryLines.entryId, entryIds),
        ));
      for (const l of otherLines) {
        if (l.accountId === filters.accountId) continue;
        const label = `${l.accountCode || ""} ${l.accountName || ""}`.trim();
        if (!label) continue;
        const prev = counterByEntry.get(l.entryId);
        counterByEntry.set(l.entryId, prev ? `${prev}، ${label}` : label);
      }
    }
  }

  const out: Record<string, unknown>[] = [];
  let running = openingNet;
  let periodDebit = 0;
  let periodCredit = 0;

  /**
   * ميجا PDF مع «اخفاء التفاصيل»: بدون سطور حركات وبدون رصيد سابق —
   * صف واحد «اجمالي حركات الفترة» (مدين/دائن الفترة + الرصيد الختامي).
   * المرجع: artifacts/mega-account-statement/كشف-حساب-2-hide-details.pdf
   */
  if (hideDetails) {
    for (const r of periodRows) {
      periodDebit += num(r.debit);
      periodCredit += num(r.credit);
      running += num(r.debit) - num(r.credit);
    }
    out.push({
      date: "",
      entryNumber: "",
      documentNumber: "",
      debit: periodDebit,
      credit: periodCredit,
      balance: running,
      exchangeRate: "",
      description: "اجمالي حركات الفترة",
    });
    return out;
  }

  // ميجا: صف «رصيد سابق» — أو تفصيل حركات ما قبل الفترة عند تفعيل الخيار
  if (showOpeningMovements && openingDetailRows.length) {
    let openRunning = filters.costCenterId == null ? num(account.balance) : 0;
    // لو الرصيد المخزّن يُضاف للحركات قبل الفترة، نبدأ من المخزّن ثم نراكم الحركات
    // نفس openingNet النهائي؛ نعرض كل حركة مع رصيد جاري حتى بداية الفترة
    // أبسط وأوضح: صف رصيد أساس (إن وُجد رصيد مخزّن) ثم حركات ما قبل الفترة
    if (filters.costCenterId == null && Math.abs(num(account.balance)) > 0.0001) {
      out.push({
        date: "",
        entryNumber: "",
        documentNumber: "",
        debit: 0,
        credit: 0,
        balance: num(account.balance),
        exchangeRate: 1,
        description: "رصيد سابق",
      });
      openRunning = num(account.balance);
    } else {
      openRunning = 0;
    }
    for (const r of openingDetailRows) {
      const debit = num(r.debit);
      const credit = num(r.credit);
      openRunning += debit - credit;
      const baseDesc = r.lineDescription || r.entryDescription || "";
      const counter = counterByEntry.get(r.entryId);
      out.push({
        date: dateOnly(r.entryDate),
        entryNumber: r.entryNumber || "",
        documentNumber: r.entryReference || "",
        debit,
        credit,
        balance: openRunning,
        exchangeRate: 1,
        description: counter ? `${baseDesc}${baseDesc ? " — " : ""}مقابل: ${counter}` : baseDesc,
      });
    }
    running = openingNet;
  } else {
    out.push({
      date: "",
      entryNumber: "",
      documentNumber: "",
      debit: 0,
      credit: 0,
      balance: openingNet,
      exchangeRate: 1,
      description: "رصيد سابق",
    });
  }

  for (const r of periodRows) {
    const debit = num(r.debit);
    const credit = num(r.credit);
    running += debit - credit;
    periodDebit += debit;
    periodCredit += credit;
    const baseDesc = r.lineDescription || r.entryDescription || "";
    const counter = counterByEntry.get(r.entryId);
    out.push({
      date: dateOnly(r.entryDate),
      entryNumber: r.entryNumber || "",
      documentNumber: r.entryReference || "",
      debit,
      credit,
      balance: running,
      exchangeRate: 1,
      description: counter ? `${baseDesc}${baseDesc ? " — " : ""}مقابل: ${counter}` : baseDesc,
    });
  }

  out.push({
    date: "",
    entryNumber: "",
    documentNumber: "",
    debit: periodDebit,
    credit: periodCredit,
    balance: running,
    exchangeRate: "",
    description: "اجمالي حركات الفترة",
  });

  return out;
}

export async function generalLedgerReport(db: Db, filters: ReportFilters) {
  const allAccounts = await db.select().from(accounts)
    .where(tenantWhere(accounts, filters.tenantId, eq(accounts.isActive, true)))
    .orderBy(accounts.code);

  const root = filters.accountId != null
    ? allAccounts.find((a) => a.id === filters.accountId)
    : undefined;
  const rootCode = root?.code;

  const childrenOf = new Map<number, number[]>();
  for (const a of allAccounts) {
    if (a.parentId == null) continue;
    const list = childrenOf.get(a.parentId) || [];
    list.push(a.id);
    childrenOf.set(a.parentId, list);
  }

  const leafIdsUnder = (accountId: number): number[] => {
    const kids = childrenOf.get(accountId) || [];
    if (!kids.length) return [accountId];
    const out: number[] = [];
    for (const kid of kids) out.push(...leafIdsUnder(kid));
    return out.length ? out : [accountId];
  };

  const inScope = (a: (typeof allAccounts)[number]) => {
    if (filters.accountId == null) return true;
    if (a.id === filters.accountId) return true;
    if (rootCode && a.code?.startsWith(rootCode)) return true;
    return a.parentId === filters.accountId;
  };

  const scoped = allAccounts.filter(inScope);
  if (!scoped.length) return [];

  const costCenterCond = filters.costCenterId
    ? eq(journalEntryLines.costCenterId, filters.costCenterId)
    : undefined;

  // حركات قبل الفترة (لرصيد سابق) — مع احترام مركز التكلفة إن وُجد
  const openingDateParts = filters.dateFrom
    ? [lt(journalEntries.date, filters.dateFrom as any)]
    : [];
  const openingLines = await db.select({
    accountId: journalEntryLines.accountId,
    debit: journalEntryLines.debit,
    credit: journalEntryLines.credit,
  }).from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntryLines.entryId, journalEntries.id))
    .where(tenantWhere(journalEntries, filters.tenantId,
      and(eq(journalEntries.status, "posted"), ...openingDateParts),
      costCenterCond));

  const openingByAccount = new Map<number, { debit: number; credit: number }>();
  for (const l of openingLines) {
    const cur = openingByAccount.get(l.accountId) || { debit: 0, credit: 0 };
    cur.debit += num(l.debit);
    cur.credit += num(l.credit);
    openingByAccount.set(l.accountId, cur);
  }

  // حركات الفترة مع التاريخ للتجميع اليومي
  const periodDateParts = dateConds(journalEntries, filters.dateFrom, filters.dateTo);
  const periodLines = await db.select({
    accountId: journalEntryLines.accountId,
    entryDate: journalEntries.date,
    debit: journalEntryLines.debit,
    credit: journalEntryLines.credit,
  }).from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntryLines.entryId, journalEntries.id))
    .where(tenantWhere(journalEntries, filters.tenantId,
      and(eq(journalEntries.status, "posted"), ...(periodDateParts.length ? [and(...periodDateParts)] : [])),
      costCenterCond))
    .orderBy(asc(journalEntries.date));

  const periodByAccountDate = new Map<number, Map<string, { debit: number; credit: number }>>();
  for (const l of periodLines) {
    const d = dateOnly(l.entryDate);
    let byDate = periodByAccountDate.get(l.accountId);
    if (!byDate) {
      byDate = new Map();
      periodByAccountDate.set(l.accountId, byDate);
    }
    const cur = byDate.get(d) || { debit: 0, credit: 0 };
    cur.debit += num(l.debit);
    cur.credit += num(l.credit);
    byDate.set(d, cur);
  }

  const useStoredBalance = filters.costCenterId == null;
  const out: Record<string, unknown>[] = [];

  for (const a of scoped) {
    const leaves = a.isParent ? leafIdsUnder(a.id) : [a.id];
    let openingNet = 0;
    for (const leafId of leaves) {
      const leaf = allAccounts.find((x) => x.id === leafId);
      const open = openingByAccount.get(leafId) || { debit: 0, credit: 0 };
      openingNet += (useStoredBalance ? num(leaf?.balance) : 0) + open.debit - open.credit;
    }

    const daily = new Map<string, { debit: number; credit: number }>();
    for (const leafId of leaves) {
      const byDate = periodByAccountDate.get(leafId);
      if (!byDate) continue;
      for (const [d, m] of byDate) {
        const cur = daily.get(d) || { debit: 0, credit: 0 };
        cur.debit += m.debit;
        cur.credit += m.credit;
        daily.set(d, cur);
      }
    }

    if (Math.abs(openingNet) < 0.0001 && daily.size === 0) continue;

    // ميجا: صف «رصيد سابق»
    out.push({
      accountCode: a.code,
      accountName: a.name,
      date: "رصيد سابق",
      debit: 0,
      credit: 0,
      balance: openingNet,
    });

    let running = openingNet;
    let totalDebit = 0;
    let totalCredit = 0;
    const dates = [...daily.keys()].sort();
    for (const d of dates) {
      const m = daily.get(d)!;
      running += m.debit - m.credit;
      totalDebit += m.debit;
      totalCredit += m.credit;
      out.push({
        accountCode: a.code,
        accountName: a.name,
        date: d,
        debit: m.debit,
        credit: m.credit,
        balance: running,
      });
    }

    // ميجا: صف «اجمالى» لحركة الفترة
    out.push({
      accountCode: a.code,
      accountName: a.name,
      date: "اجمالى",
      debit: totalDebit,
      credit: totalCredit,
      balance: running,
    });
  }

  return out;
}


type TbRow = {
  accountCode: string;
  accountName: string;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
};

function tbRowFromNets(opts: {
  accountCode: string;
  accountName: string;
  openingNet: number;
  periodDebit: number;
  periodCredit: number;
  closingNet: number;
}): TbRow {
  return {
    accountCode: opts.accountCode,
    accountName: opts.accountName,
    openingDebit: opts.openingNet > 0 ? opts.openingNet : 0,
    openingCredit: opts.openingNet < 0 ? Math.abs(opts.openingNet) : 0,
    periodDebit: opts.periodDebit,
    periodCredit: opts.periodCredit,
    closingDebit: opts.closingNet > 0 ? opts.closingNet : 0,
    closingCredit: opts.closingNet < 0 ? Math.abs(opts.closingNet) : 0,
  };
}

function isCustomersArAccountName(name: string) {
  const n = name.replace(/\s+/g, "");
  // حساب ذمم العملاء / العملاء — مع تجنب مصروفات مثل «عينات للعملاء»
  if (/عين|مصروف|ايراد|إيراد|خصم/.test(name)) return false;
  return /العملاء|حساباتالعملاء|عملاء/.test(n) || /مدينون/.test(name);
}

/** أرصدة العملاء للميزان — من دفتر الذمم (فواتير/مرتجعات/نقدية/بنك/شيكات) */
async function loadCustomerArMetricsForTrialBalance(db: Db, filters: ReportFilters) {
  type M = {
    id: number;
    code: string | null;
    name: string;
    categoryId: number | null;
    openingNet: number;
    periodDebit: number;
    periodCredit: number;
    closingNet: number;
  };
  const custRows = await db.select({
    id: customers.id,
    code: customers.code,
    name: customers.name,
    categoryId: customers.categoryId,
    openingBalance: customers.openingBalance,
  }).from(customers)
    .where(tenantWhere(customers, filters.tenantId, eq(customers.isActive, true)));

  const map = new Map<number, M>();
  for (const c of custRows) {
    map.set(c.id, {
      id: c.id,
      code: c.code,
      name: c.name,
      categoryId: c.categoryId,
      openingNet: num(c.openingBalance),
      periodDebit: 0,
      periodCredit: 0,
      closingNet: 0,
    });
  }
  const ensure = (id: number) => map.get(id);

  const applyBefore = (customerId: number, delta: number) => {
    const m = ensure(customerId);
    if (!m) return;
    m.openingNet += delta;
  };
  const applyPeriod = (customerId: number, debit: number, credit: number) => {
    const m = ensure(customerId);
    if (!m) return;
    m.periodDebit += debit;
    m.periodCredit += credit;
  };

  const dateFrom = filters.dateFrom;
  const dateTo = filters.dateTo;

  // مبيعات
  const salesRows = await db.select({
    customerId: salesInvoices.customerId,
    date: salesInvoices.date,
    total: salesInvoices.total,
  }).from(salesInvoices)
    .where(tenantWhere(salesInvoices, filters.tenantId,
      and(salesPostedFilter(),
        reportBranchCond(salesInvoices.branchId, filters),
        filters.currencyCode ? eq(salesInvoices.currencyCode, filters.currencyCode) : undefined)));
  for (const r of salesRows) {
    if (r.customerId == null) continue;
    const d = dateOnly(r.date);
    const amt = num(r.total);
    if (dateFrom && d < dateFrom) applyBefore(r.customerId, amt);
    else if ((!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo)) applyPeriod(r.customerId, amt, 0);
  }

  // مرتجعات مبيعات
  const retRows = await db.select({
    customerId: salesReturns.customerId,
    date: salesReturns.date,
    total: salesReturns.total,
  }).from(salesReturns)
    .where(tenantWhere(salesReturns, filters.tenantId));
  for (const r of retRows) {
    if (r.customerId == null) continue;
    const d = dateOnly(r.date);
    const amt = num(r.total);
    if (dateFrom && d < dateFrom) applyBefore(r.customerId, -amt);
    else if ((!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo)) applyPeriod(r.customerId, 0, amt);
  }

  // نقدية
  const cashRows = await db.select({
    customerId: cashTransactions.customerId,
    date: cashTransactions.date,
    amount: cashTransactions.amount,
    type: cashTransactions.type,
  }).from(cashTransactions)
    .where(tenantWhere(cashTransactions, filters.tenantId));
  for (const r of cashRows) {
    if (r.customerId == null) continue;
    const d = dateOnly(r.date);
    const amt = num(r.amount);
    const isReceive = String(r.type).includes("receive");
    const delta = isReceive ? -amt : amt; // قبض يخفض الذمة
    if (dateFrom && d < dateFrom) applyBefore(r.customerId, delta);
    else if ((!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo)) {
      if (isReceive) applyPeriod(r.customerId, 0, amt);
      else applyPeriod(r.customerId, amt, 0);
    }
  }

  // بنك
  const bankRows = await db.select({
    customerId: bankTransactions.customerId,
    date: bankTransactions.date,
    amount: bankTransactions.amount,
    type: bankTransactions.type,
  }).from(bankTransactions)
    .where(tenantWhere(bankTransactions, filters.tenantId));
  for (const r of bankRows) {
    if (r.customerId == null) continue;
    const d = dateOnly(r.date);
    const amt = num(r.amount);
    const isDeposit = String(r.type).includes("deposit");
    const delta = isDeposit ? -amt : amt;
    if (dateFrom && d < dateFrom) applyBefore(r.customerId, delta);
    else if ((!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo)) {
      if (isDeposit) applyPeriod(r.customerId, 0, amt);
      else applyPeriod(r.customerId, amt, 0);
    }
  }

  // شيكات واردة
  const checkRows = await db.select({
    customerId: checks.customerId,
    date: checks.date,
    amount: checks.amount,
    status: checks.status,
    type: checks.type,
  }).from(checks)
    .where(tenantWhere(checks, filters.tenantId, eq(checks.type, "incoming")));
  for (const r of checkRows) {
    if (r.customerId == null) continue;
    if (r.status === "bounced" || r.status === "cancelled") continue;
    const d = dateOnly(r.date);
    const amt = num(r.amount);
    if (dateFrom && d < dateFrom) applyBefore(r.customerId, -amt);
    else if ((!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo)) applyPeriod(r.customerId, 0, amt);
  }

  for (const m of map.values()) {
    m.closingNet = m.openingNet + m.periodDebit - m.periodCredit;
  }
  return [...map.values()];
}

async function applyCustomerGroupingToTrialBalance(
  db: Db,
  filters: ReportFilters,
  rows: TbRow[],
): Promise<TbRow[]> {
  const mode = filters.customerGrouping;
  if (!mode) return rows;

  const arIdxs: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!isCustomersArAccountName(String(r.accountName || ""))) continue;
    // تجاهل الآباء الملخصين إن وُجدت ورقة أوضح لاحقاً — نأخذ الأوراق فقط قدر الإمكان
    const code = String(r.accountCode || "");
    const isLikelyParent = code.length <= 3 || /^(11|1120)$/.test(code);
    if (isLikelyParent && rows.some((o, j) => j !== i && isCustomersArAccountName(String(o.accountName || "")) && String(o.accountCode || "").startsWith(code) && String(o.accountCode || "") !== code)) {
      continue;
    }
    arIdxs.push(i);
  }
  if (!arIdxs.length) return rows;

  // استبدل أول حساب ذمم عملاء ورقي؛ أزل بقية أوراق الذمم المكررة إن وُجدت
  const primaryIdx = arIdxs[0];
  const leaf = rows[primaryIdx];
  const metrics = await loadCustomerArMetricsForTrialBalance(db, filters);
  const eps = 0.005;

  const detail: TbRow[] = [];
  if (mode === "all") {
    // ميجا PDF «كل العملاء»: سطر مجمّع واحد بمبالغ حساب الذمم
    detail.push({
      ...leaf,
      accountCode: "",
      accountName: "مجمع العملاء (كل العملاء)",
    });
  } else if (mode === "zeroBalances") {
    const zeros = metrics.filter((m) => Math.abs(m.closingNet) <= eps);
    const nonzero = metrics.filter((m) => Math.abs(m.closingNet) > eps)
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
    const zOpen = zeros.reduce((s, m) => s + m.openingNet, 0);
    const zPd = zeros.reduce((s, m) => s + m.periodDebit, 0);
    const zPc = zeros.reduce((s, m) => s + m.periodCredit, 0);
    const zClose = zeros.reduce((s, m) => s + m.closingNet, 0);
    detail.push(tbRowFromNets({
      accountCode: "",
      accountName: "مجمع العملاء (الارصدة الصفرية)",
      openingNet: zOpen,
      periodDebit: zPd,
      periodCredit: zPc,
      closingNet: zClose,
    }));
    for (const m of nonzero) {
      detail.push(tbRowFromNets({
        accountCode: m.code || "",
        accountName: m.name,
        openingNet: m.openingNet,
        periodDebit: m.periodDebit,
        periodCredit: m.periodCredit,
        closingNet: m.closingNet,
      }));
    }
  } else {
    // byCategory — ميجا يطلب إدخال/اختيار فئة قبل العرض (تأكيد المستخدم 2026-09-13)
    if (filters.categoryId == null) {
      // ميجا يمنع العرض بدون فئة — الواجهة تمنع البحث؛ هنا نُبقي الشجرة كما هي
      return rows;
    }
    const [cat] = await db.select({ id: contactCategories.id, name: contactCategories.name })
      .from(contactCategories)
      .where(tenantWhere(contactCategories, filters.tenantId, eq(contactCategories.id, filters.categoryId)));
    const catLabel = cat?.name || `فئة #${filters.categoryId}`;
    const subset = metrics.filter((m) => m.categoryId === filters.categoryId);
    const gOpen = subset.reduce((s, m) => s + m.openingNet, 0);
    const gPd = subset.reduce((s, m) => s + m.periodDebit, 0);
    const gPc = subset.reduce((s, m) => s + m.periodCredit, 0);
    const gClose = subset.reduce((s, m) => s + m.closingNet, 0);
    detail.push(tbRowFromNets({
      accountCode: "",
      accountName: `مجمع العملاء (${catLabel})`,
      openingNet: gOpen,
      periodDebit: gPd,
      periodCredit: gPc,
      closingNet: gClose,
    }));
  }

  const remove = new Set(arIdxs);
  const out: TbRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (i === primaryIdx) {
      out.push(...detail);
      continue;
    }
    if (remove.has(i)) continue;
    out.push(rows[i]);
  }
  return out;
}


export async function trialBalanceReport(db: Db, filters: ReportFilters) {
  // ميجا: فلتر «الحساب الرئيسي» يضيّق الشجرة؛ «اخفاء الارصدة الصفرية» اختياري (افتراضي: إظهار)
  const allAccounts = await db.select().from(accounts)
    .where(tenantWhere(accounts, filters.tenantId, eq(accounts.isActive, true)))
    .orderBy(accounts.code);

  const root = filters.accountId != null
    ? allAccounts.find((a) => a.id === filters.accountId)
    : undefined;
  const rootCode = root?.code;

  const openingMovement = filters.dateFrom
    ? await getPostedMovementByAccount(db, filters.tenantId, { before: filters.dateFrom })
    : new Map<number, { debit: number; credit: number }>();
  const periodMovement = await getPostedMovementByAccount(db, filters.tenantId, {
    from: filters.dateFrom,
    to: filters.dateTo,
  });

  const hideZeroBalances = filters.hideZeroBalances === true;
  const byId = new Map(allAccounts.map((a) => [a.id, a]));
  const childrenOf = new Map<number, number[]>();
  for (const a of allAccounts) {
    if (a.parentId == null) continue;
    const list = childrenOf.get(a.parentId) || [];
    list.push(a.id);
    childrenOf.set(a.parentId, list);
  }

  const treeDepth = (accountId: number) => {
    let depth = 1;
    let cur = byId.get(accountId);
    const seen = new Set<number>();
    while (cur?.parentId != null && !seen.has(cur.parentId)) {
      seen.add(cur.parentId);
      depth += 1;
      cur = byId.get(cur.parentId);
      if (depth > 20) break;
    }
    return depth;
  };

  const leafIdsUnder = (accountId: number): number[] => {
    const kids = childrenOf.get(accountId) || [];
    if (!kids.length) return [accountId];
    const out: number[] = [];
    for (const kid of kids) out.push(...leafIdsUnder(kid));
    return out.length ? out : [accountId];
  };

  const leafMetrics = (accountId: number) => {
    const a = byId.get(accountId)!;
    const open = openingMovement.get(accountId) || { debit: 0, credit: 0 };
    const period = periodMovement.get(accountId) || { debit: 0, credit: 0 };
    const openingNet = num(a.balance) + open.debit - open.credit;
    const closingNet = openingNet + period.debit - period.credit;
    return { openingNet, periodDebit: period.debit, periodCredit: period.credit, closingNet };
  };

  const inScope = (a: (typeof allAccounts)[number]) => {
    if (filters.accountId == null) return true;
    if (a.id === filters.accountId) return true;
    if (rootCode && a.code?.startsWith(rootCode)) return true;
    return a.parentId === filters.accountId;
  };

  // ميجا من ملف «ميزان المراجعة.xlsx»: يعرض آباء + أوراق (شجرة) وليس الأوراق فقط
  let rows = allAccounts
    .filter(inScope)
    .filter((a) => {
      // ميجا ddlDisplayLevel: قيم 2..7 — نقيّد بعمق الشجرة عند تحديده
      if (filters.displayLevel == null || !Number.isFinite(filters.displayLevel)) return true;
      return treeDepth(a.id) <= filters.displayLevel!;
    })
    .map((a) => {
      const leaves = a.isParent ? leafIdsUnder(a.id) : [a.id];
      let openingNet = 0;
      let periodDebit = 0;
      let periodCredit = 0;
      let closingNet = 0;
      for (const leafId of leaves) {
        const m = leafMetrics(leafId);
        openingNet += m.openingNet;
        periodDebit += m.periodDebit;
        periodCredit += m.periodCredit;
        closingNet += m.closingNet;
      }
      // ترتيب الأعمدة مطابق لميجا: كود، اسم، أول مدة م/د، حركة م/د، آخر مدة م/د
      return {
        accountCode: a.code,
        accountName: a.name,
        openingDebit: openingNet > 0 ? openingNet : 0,
        openingCredit: openingNet < 0 ? Math.abs(openingNet) : 0,
        periodDebit,
        periodCredit,
        closingDebit: closingNet > 0 ? closingNet : 0,
        closingCredit: closingNet < 0 ? Math.abs(closingNet) : 0,
      };
    })
    .filter((r) => {
      const hasPeriod = !!(r.periodDebit || r.periodCredit);
      // ميجا حالة النشاط: النشط/الغير نشط خلال الفترة
      if (filters.activityStatus === "active" && !hasPeriod) return false;
      if (filters.activityStatus === "inactive" && hasPeriod) return false;
      const nonzero = !!(r.periodDebit || r.periodCredit || r.openingDebit || r.openingCredit || r.closingDebit || r.closingCredit);
      // ميجا بدون تفعيل الإخفاء: نعرض السطر حتى لو كل الأرصدة صفر (ضمن نطاق الحسابات المختارة)
      if (!hideZeroBalances) return true;
      return nonzero;
    });

  // ميجا ترتيب بـ
  if (filters.orderBy === "name") {
    rows = rows.sort((a, b) => String(a.accountName || "").localeCompare(String(b.accountName || ""), "ar"));
  } else if (filters.orderBy === "balance") {
    rows = rows.sort((a, b) => {
      const ba = Math.abs(Number(a.closingDebit || 0) - Number(a.closingCredit || 0));
      const bb = Math.abs(Number(b.closingDebit || 0) - Number(b.closingCredit || 0));
      return bb - ba;
    });
  } else {
    rows = rows.sort((a, b) => String(a.accountCode || "").localeCompare(String(b.accountCode || ""), "en", { numeric: true }));
  }

  // ميجا: طريقة تجميع العملاء (PDF كل العملاء / الارصدة الصفرية — 2026-09-13)
  rows = await applyCustomerGroupingToTrialBalance(db, filters, rows);
  return rows;
}

export async function generalJournalReport(db: Db, filters: ReportFilters) {
  const dateParts = dateConds(journalEntries, filters.dateFrom, filters.dateTo);
  const entries = await db.select().from(journalEntries)
    .where(tenantWhere(journalEntries, filters.tenantId,
      and(eq(journalEntries.status, "posted"), ...(dateParts.length ? [and(...dateParts)] : []))))
    .orderBy(asc(journalEntries.date), asc(journalEntries.id));

  const result: Record<string, unknown>[] = [];
  for (const e of entries) {
    const lines = await db.select({
      accountCode: accounts.code,
      accountName: accounts.name,
      debit: journalEntryLines.debit,
      credit: journalEntryLines.credit,
      description: journalEntryLines.description,
    }).from(journalEntryLines)
      .innerJoin(accounts, eq(journalEntryLines.accountId, accounts.id))
      .where(tenantWhere(journalEntryLines, filters.tenantId, eq(journalEntryLines.entryId, e.id)));

    for (const l of lines) {
      result.push({
        date: dateOnly(e.date),
        entryNumber: e.number,
        description: l.description || e.description || "",
        accountCode: l.accountCode,
        accountName: l.accountName,
        debit: num(l.debit),
        credit: num(l.credit),
      });
    }
  }
  return result;
}

export async function salesInvoicesReport(db: Db, filters: ReportFilters) {
  const dateParts = dateConds(salesInvoices, filters.dateFrom, filters.dateTo);
  const dueDateParts = dueDateConds(salesInvoices, filters.dueDateFrom, filters.dueDateTo);
  const rows = await db.select({
    number: salesInvoices.number,
    date: salesInvoices.date,
    dueDate: salesInvoices.dueDate,
    customerCode: customers.code,
    customerName: customers.name,
    branchName: branches.name,
    warehouseName: warehouses.name,
    repName: salesReps.name,
    areaName: salesAreas.name,
    subtotal: salesInvoices.subtotal,
    discount: salesInvoices.discount,
    tax: salesInvoices.tax,
    total: salesInvoices.total,
    foreignTotal: salesInvoices.foreignTotal,
    currencyCode: salesInvoices.currencyCode,
    exchangeRate: salesInvoices.exchangeRate,
    paid: salesInvoices.paid,
    remaining: salesInvoices.remaining,
    status: salesInvoices.status,
    paymentType: salesInvoices.paymentType,
  }).from(salesInvoices)
    .leftJoin(customers, eq(salesInvoices.customerId, customers.id))
    .leftJoin(branches, eq(salesInvoices.branchId, branches.id))
    .leftJoin(warehouses, eq(salesInvoices.warehouseId, warehouses.id))
    .leftJoin(salesReps, eq(salesInvoices.salesRepId, salesReps.id))
    .leftJoin(salesAreas, eq(customers.areaId, salesAreas.id))
    .where(tenantWhere(salesInvoices, filters.tenantId,
      and(paymentStatusCond(salesInvoices.status, filters.paymentStatus) || salesPostedFilter(),
        ...(dateParts.length ? [and(...dateParts)] : []),
        ...(dueDateParts.length ? [and(...dueDateParts)] : []),
        filters.customerId ? eq(salesInvoices.customerId, filters.customerId) : undefined,
        reportBranchCond(salesInvoices.branchId, filters),
        reportWarehouseCond(salesInvoices.warehouseId, filters),
        filters.paymentType ? eq(salesInvoices.paymentType, filters.paymentType) : undefined,
        filters.currencyCode ? eq(salesInvoices.currencyCode, filters.currencyCode) : undefined,
        taxFilterCond(salesInvoices.tax, filters.taxFilter),
        discountFilterCond(salesInvoices.discount, filters.discountFilter),
        filters.areaId ? eq(customers.areaId, filters.areaId) : undefined,
        filters.repId
          ? sql`(${salesInvoices.salesRepId} = ${filters.repId} OR ${customers.salesRepId} = ${filters.repId})`
          : undefined,
        // ميجا تقرير البيع: فلتر الصنف / الفئة يقيّد الفواتير التي تحتوي الصنف
        filters.itemId
          ? sql`exists (select 1 from sales_invoice_items sii where sii.invoiceId = ${salesInvoices.id} and sii.itemId = ${filters.itemId} and sii.tenantId = ${filters.tenantId})`
          : undefined,
        filters.categoryId
          ? sql`exists (select 1 from sales_invoice_items sii inner join items it on it.id = sii.itemId where sii.invoiceId = ${salesInvoices.id} and it.categoryId = ${filters.categoryId} and sii.tenantId = ${filters.tenantId})`
          : undefined,
        filters.search
          ? sql`(${salesInvoices.number} LIKE ${`%${filters.search}%`} OR ${customers.name} LIKE ${`%${filters.search}%`})`
          : undefined)))
    .orderBy(desc(salesInvoices.date));

  return rows.map((r) => ({
    documentNumber: r.number,
    date: dateOnly(r.date),
    dueDate: dateOnly(r.dueDate),
    partyCode: r.customerCode || "",
    partyName: r.customerName || "",
    branchName: r.branchName || "",
    warehouseName: r.warehouseName || "",
    repName: r.repName || "",
    areaName: r.areaName || "",
    currencyCode: r.currencyCode || "EGP",
    exchangeRate: num(r.exchangeRate) || 1,
    foreignTotal: r.foreignTotal != null ? num(r.foreignTotal) : null,
    subtotal: num(r.subtotal),
    discount: num(r.discount),
    tax: num(r.tax),
    total: num(r.total),
    paid: num(r.paid),
    remaining: num(r.remaining),
    status: r.status,
    paymentType: r.paymentType === "cash" ? "نقدي" : r.paymentType === "credit" ? "آجل" : r.paymentType,
  }));
}

export async function purchasesInvoicesReport(db: Db, filters: ReportFilters) {
  const dateParts = dateConds(purchaseInvoices, filters.dateFrom, filters.dateTo);
  const dueDateParts = dueDateConds(purchaseInvoices, filters.dueDateFrom, filters.dueDateTo);
  const rows = await db.select({
    number: purchaseInvoices.number,
    date: purchaseInvoices.date,
    dueDate: purchaseInvoices.dueDate,
    supplierCode: suppliers.code,
    supplierName: suppliers.name,
    branchName: branches.name,
    warehouseName: warehouses.name,
    subtotal: purchaseInvoices.subtotal,
    discount: purchaseInvoices.discount,
    tax: purchaseInvoices.tax,
    total: purchaseInvoices.total,
    foreignTotal: purchaseInvoices.foreignTotal,
    currencyCode: purchaseInvoices.currencyCode,
    exchangeRate: purchaseInvoices.exchangeRate,
    paid: purchaseInvoices.paid,
    remaining: purchaseInvoices.remaining,
    status: purchaseInvoices.status,
    paymentType: purchaseInvoices.paymentType,
  }).from(purchaseInvoices)
    .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
    .leftJoin(branches, eq(purchaseInvoices.branchId, branches.id))
    .leftJoin(warehouses, eq(purchaseInvoices.warehouseId, warehouses.id))
    .where(tenantWhere(purchaseInvoices, filters.tenantId,
      and(paymentStatusCond(purchaseInvoices.status, filters.paymentStatus) || purchasePostedFilter(),
        ...(dateParts.length ? [and(...dateParts)] : []),
        ...(dueDateParts.length ? [and(...dueDateParts)] : []),
        filters.supplierId ? eq(purchaseInvoices.supplierId, filters.supplierId) : undefined,
        reportBranchCond(purchaseInvoices.branchId, filters),
        reportWarehouseCond(purchaseInvoices.warehouseId, filters),
        filters.paymentType ? eq(purchaseInvoices.paymentType, filters.paymentType) : undefined,
        filters.currencyCode ? eq(purchaseInvoices.currencyCode, filters.currencyCode) : undefined,
        taxFilterCond(purchaseInvoices.tax, filters.taxFilter),
        discountFilterCond(purchaseInvoices.discount, filters.discountFilter),
        // ميجا تقرير الشراء: فلتر الصنف / الفئة يقيّد الفواتير التي تحتوي الصنف
        filters.itemId
          ? sql`exists (select 1 from purchase_invoice_items pii where pii.invoiceId = ${purchaseInvoices.id} and pii.itemId = ${filters.itemId} and pii.tenantId = ${filters.tenantId})`
          : undefined,
        filters.categoryId
          ? sql`exists (select 1 from purchase_invoice_items pii inner join items it on it.id = pii.itemId where pii.invoiceId = ${purchaseInvoices.id} and it.categoryId = ${filters.categoryId} and pii.tenantId = ${filters.tenantId})`
          : undefined,
        filters.search
          ? sql`(${purchaseInvoices.number} LIKE ${`%${filters.search}%`} OR ${suppliers.name} LIKE ${`%${filters.search}%`})`
          : undefined)))
    .orderBy(desc(purchaseInvoices.date));

  return rows.map((r) => ({
    documentNumber: r.number,
    date: dateOnly(r.date),
    dueDate: dateOnly(r.dueDate),
    partyCode: r.supplierCode || "",
    partyName: r.supplierName || "",
    branchName: r.branchName || "",
    warehouseName: r.warehouseName || "",
    currencyCode: r.currencyCode || "EGP",
    exchangeRate: num(r.exchangeRate) || 1,
    foreignTotal: r.foreignTotal != null ? num(r.foreignTotal) : null,
    subtotal: num(r.subtotal),
    discount: num(r.discount),
    tax: num(r.tax),
    total: num(r.total),
    paid: num(r.paid),
    remaining: num(r.remaining),
    status: r.status,
    paymentType: r.paymentType === "cash" ? "نقدي" : r.paymentType === "credit" ? "آجل" : r.paymentType,
  }));
}

export type DetailedInvoiceLine = {
  name: string;
  unit: string;
  quantity: number;
  price: number;
  discount: number;
  tax: number;
  total: number;
};

export type DetailedInvoiceDoc = {
  serial: string;
  ref: string;
  date: string;
  party: string;
  subtotal: number;
  discount: number;
  tax: number;
  net: number;
  due: number;
  lines: DetailedInvoiceLine[];
};

export type DetailedInvoiceReport = {
  documents: DetailedInvoiceDoc[];
  summary: {
    netTotal: number;
    discount: number;
    tax: number;
    grossTotal: number;
    due: number;
    paid: number;
    documentsCount: number;
    quantityTotal: number;
  };
};

/** تقرير المشتريات المفصّل (فاتورة + أسطرها) — لمطابقة شكل تقرير ميجا كاش المطبوع بالظبط */
export async function purchasesInvoicesDetailedReport(db: Db, filters: ReportFilters): Promise<DetailedInvoiceReport> {
  const dateParts = dateConds(purchaseInvoices, filters.dateFrom, filters.dateTo);
  const dueDateParts = dueDateConds(purchaseInvoices, filters.dueDateFrom, filters.dueDateTo);
  const invoices = await db.select({
    id: purchaseInvoices.id,
    number: purchaseInvoices.number,
    date: purchaseInvoices.date,
    supplierName: suppliers.name,
    subtotal: purchaseInvoices.subtotal,
    discount: purchaseInvoices.discount,
    tax: purchaseInvoices.tax,
    total: purchaseInvoices.total,
    paid: purchaseInvoices.paid,
    remaining: purchaseInvoices.remaining,
  }).from(purchaseInvoices)
    .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
    .where(tenantWhere(purchaseInvoices, filters.tenantId,
      and(paymentStatusCond(purchaseInvoices.status, filters.paymentStatus) || purchasePostedFilter(),
        ...(dateParts.length ? [and(...dateParts)] : []),
        ...(dueDateParts.length ? [and(...dueDateParts)] : []),
        filters.supplierId ? eq(purchaseInvoices.supplierId, filters.supplierId) : undefined,
        reportBranchCond(purchaseInvoices.branchId, filters),
        reportWarehouseCond(purchaseInvoices.warehouseId, filters),
        filters.paymentType ? eq(purchaseInvoices.paymentType, filters.paymentType) : undefined,
        filters.currencyCode ? eq(purchaseInvoices.currencyCode, filters.currencyCode) : undefined,
        taxFilterCond(purchaseInvoices.tax, filters.taxFilter),
        discountFilterCond(purchaseInvoices.discount, filters.discountFilter),
        filters.search
          ? sql`(${purchaseInvoices.number} LIKE ${`%${filters.search}%`} OR ${suppliers.name} LIKE ${`%${filters.search}%`})`
          : undefined)))
    .orderBy(desc(purchaseInvoices.date));

  const ids = invoices.map((r) => r.id);
  const lineRows = ids.length
    ? await db.select({
        invoiceId: purchaseInvoiceItems.invoiceId,
        name: items.name,
        unit: items.unit,
        quantity: purchaseInvoiceItems.quantity,
        price: purchaseInvoiceItems.price,
        discount: purchaseInvoiceItems.discount,
        tax: purchaseInvoiceItems.tax,
        total: purchaseInvoiceItems.total,
      }).from(purchaseInvoiceItems)
        .leftJoin(items, eq(purchaseInvoiceItems.itemId, items.id))
        .where(inArray(purchaseInvoiceItems.invoiceId, ids))
    : [];
  const linesByInvoice = new Map<number, DetailedInvoiceLine[]>();
  for (const l of lineRows) {
    const arr = linesByInvoice.get(l.invoiceId) || [];
    arr.push({
      name: l.name || "",
      unit: l.unit || "",
      quantity: num(l.quantity),
      price: num(l.price),
      discount: num(l.discount),
      tax: num(l.tax),
      total: num(l.total),
    });
    linesByInvoice.set(l.invoiceId, arr);
  }

  const documents: DetailedInvoiceDoc[] = invoices.map((r) => ({
    serial: r.number,
    ref: "",
    date: dateOnly(r.date),
    party: r.supplierName || "",
    subtotal: num(r.subtotal),
    discount: num(r.discount),
    tax: num(r.tax),
    net: num(r.total),
    due: num(r.remaining),
    lines: linesByInvoice.get(r.id) || [],
  }));

  const summary = documents.reduce((s, d) => {
    s.netTotal += d.net;
    s.discount += d.discount;
    s.tax += d.tax;
    s.due += d.due;
    s.paid += d.net - d.due;
    s.quantityTotal += d.lines.reduce((ls, l) => ls + l.quantity, 0);
    return s;
  }, { netTotal: 0, discount: 0, tax: 0, due: 0, paid: 0, quantityTotal: 0 });

  return {
    documents,
    summary: {
      ...summary,
      grossTotal: summary.netTotal + summary.discount,
      documentsCount: documents.length,
    },
  };
}

/** تقرير المبيعات المفصّل (فاتورة + أسطرها) — لمطابقة شكل تقرير ميجا كاش المطبوع بالظبط */
export async function salesInvoicesDetailedReport(db: Db, filters: ReportFilters): Promise<DetailedInvoiceReport> {
  const dateParts = dateConds(salesInvoices, filters.dateFrom, filters.dateTo);
  const dueDateParts = dueDateConds(salesInvoices, filters.dueDateFrom, filters.dueDateTo);
  const invoices = await db.select({
    id: salesInvoices.id,
    number: salesInvoices.number,
    date: salesInvoices.date,
    customerName: customers.name,
    subtotal: salesInvoices.subtotal,
    discount: salesInvoices.discount,
    tax: salesInvoices.tax,
    total: salesInvoices.total,
    paid: salesInvoices.paid,
    remaining: salesInvoices.remaining,
  }).from(salesInvoices)
    .leftJoin(customers, eq(salesInvoices.customerId, customers.id))
    .where(tenantWhere(salesInvoices, filters.tenantId,
      and(paymentStatusCond(salesInvoices.status, filters.paymentStatus) || salesPostedFilter(),
        ...(dateParts.length ? [and(...dateParts)] : []),
        ...(dueDateParts.length ? [and(...dueDateParts)] : []),
        filters.customerId ? eq(salesInvoices.customerId, filters.customerId) : undefined,
        reportBranchCond(salesInvoices.branchId, filters),
        reportWarehouseCond(salesInvoices.warehouseId, filters),
        filters.paymentType ? eq(salesInvoices.paymentType, filters.paymentType) : undefined,
        filters.currencyCode ? eq(salesInvoices.currencyCode, filters.currencyCode) : undefined,
        taxFilterCond(salesInvoices.tax, filters.taxFilter),
        discountFilterCond(salesInvoices.discount, filters.discountFilter),
        filters.search
          ? sql`(${salesInvoices.number} LIKE ${`%${filters.search}%`} OR ${customers.name} LIKE ${`%${filters.search}%`})`
          : undefined)))
    .orderBy(desc(salesInvoices.date));

  const ids = invoices.map((r) => r.id);
  const lineRows = ids.length
    ? await db.select({
        invoiceId: salesInvoiceItems.invoiceId,
        name: items.name,
        unit: items.unit,
        quantity: salesInvoiceItems.quantity,
        price: salesInvoiceItems.price,
        discount: salesInvoiceItems.discount,
        tax: salesInvoiceItems.tax,
        total: salesInvoiceItems.total,
      }).from(salesInvoiceItems)
        .leftJoin(items, eq(salesInvoiceItems.itemId, items.id))
        .where(inArray(salesInvoiceItems.invoiceId, ids))
    : [];
  const linesByInvoice = new Map<number, DetailedInvoiceLine[]>();
  for (const l of lineRows) {
    const arr = linesByInvoice.get(l.invoiceId) || [];
    arr.push({
      name: l.name || "",
      unit: l.unit || "",
      quantity: num(l.quantity),
      price: num(l.price),
      discount: num(l.discount),
      tax: num(l.tax),
      total: num(l.total),
    });
    linesByInvoice.set(l.invoiceId, arr);
  }

  const documents: DetailedInvoiceDoc[] = invoices.map((r) => ({
    serial: r.number,
    ref: "",
    date: dateOnly(r.date),
    party: r.customerName || "",
    subtotal: num(r.subtotal),
    discount: num(r.discount),
    tax: num(r.tax),
    net: num(r.total),
    due: num(r.remaining),
    lines: linesByInvoice.get(r.id) || [],
  }));

  const summary = documents.reduce((s, d) => {
    s.netTotal += d.net;
    s.discount += d.discount;
    s.tax += d.tax;
    s.due += d.due;
    s.paid += d.net - d.due;
    s.quantityTotal += d.lines.reduce((ls, l) => ls + l.quantity, 0);
    return s;
  }, { netTotal: 0, discount: 0, tax: 0, due: 0, paid: 0, quantityTotal: 0 });

  return {
    documents,
    summary: {
      ...summary,
      grossTotal: summary.netTotal + summary.discount,
      documentsCount: documents.length,
    },
  };
}

export async function checksReport(db: Db, filters: ReportFilters, type: "incoming" | "outgoing") {
  const dateParts = dateConds(checks, filters.dateFrom, filters.dateTo);
  const rows = await db.select({
    number: checks.number,
    date: checks.date,
    dueDate: checks.dueDate,
    amount: checks.amount,
    status: checks.status,
    customerName: customers.name,
    supplierName: suppliers.name,
  }).from(checks)
    .leftJoin(customers, eq(checks.customerId, customers.id))
    .leftJoin(suppliers, eq(checks.supplierId, suppliers.id))
    .where(tenantWhere(checks, filters.tenantId,
      and(eq(checks.type, type), ...(dateParts.length ? [and(...dateParts)] : []),
        type === "incoming" && filters.customerId ? eq(checks.customerId, filters.customerId) : undefined,
        type === "outgoing" && filters.supplierId ? eq(checks.supplierId, filters.supplierId) : undefined,
        filters.search
          ? sql`(${checks.number} LIKE ${`%${filters.search}%`} OR ${customers.name} LIKE ${`%${filters.search}%`} OR ${suppliers.name} LIKE ${`%${filters.search}%`})`
          : undefined)))
    .orderBy(desc(checks.date));

  return rows.map((r) => ({
    checkNumber: r.number,
    date: dateOnly(r.date),
    dueDate: dateOnly(r.dueDate),
    partyName: r.customerName || r.supplierName || "",
    amount: num(r.amount),
    status: r.status,
  }));
}

export async function customersListReport(db: Db, filters: ReportFilters) {
  const rows = await db.select({
    code: customers.code,
    name: customers.name,
    phone: customers.phone,
    email: customers.email,
    balance: customers.balance,
    creditLimit: customers.creditLimit,
    branchName: branches.name,
    areaName: salesAreas.name,
    repName: salesReps.name,
  }).from(customers)
    .leftJoin(branches, eq(customers.branchId, branches.id))
    .leftJoin(salesAreas, eq(customers.areaId, salesAreas.id))
    .leftJoin(salesReps, eq(customers.salesRepId, salesReps.id))
    .where(tenantWhere(customers, filters.tenantId,
      and(eq(customers.isActive, true),
        reportBranchCond(customers.branchId, filters),
        filters.areaId ? eq(customers.areaId, filters.areaId) : undefined,
        filters.repId ? eq(customers.salesRepId, filters.repId) : undefined)))
    .orderBy(customers.name);
  return rows.map((c) => ({
    code: c.code || "",
    name: c.name,
    phone: c.phone || "",
    email: c.email || "",
    branchName: c.branchName || "",
    areaName: c.areaName || "",
    repName: c.repName || "",
    balance: num(c.balance),
    creditLimit: num(c.creditLimit),
  }));
}

export async function customersSummaryReport(db: Db, filters: ReportFilters) {
  const custRows = await db.select({
    id: customers.id,
    code: customers.code,
    name: customers.name,
    phone: customers.phone,
    balance: customers.balance,
    creditLimit: customers.creditLimit,
    branchName: branches.name,
    areaName: salesAreas.name,
    repName: salesReps.name,
  }).from(customers)
    .leftJoin(branches, eq(customers.branchId, branches.id))
    .leftJoin(salesAreas, eq(customers.areaId, salesAreas.id))
    .leftJoin(salesReps, eq(customers.salesRepId, salesReps.id))
    .where(tenantWhere(customers, filters.tenantId,
      and(eq(customers.isActive, true),
        reportBranchCond(customers.branchId, filters),
        filters.areaId ? eq(customers.areaId, filters.areaId) : undefined,
        filters.repId ? eq(customers.salesRepId, filters.repId) : undefined)))
    .orderBy(customers.name);
  const dateParts = dateConds(salesInvoices, filters.dateFrom, filters.dateTo);
  const cashDate = dateConds(cashTransactions, filters.dateFrom, filters.dateTo);
  const sales = await db.select({
    customerId: salesInvoices.customerId,
    total: salesInvoices.total,
    paid: salesInvoices.paid,
    remaining: salesInvoices.remaining,
  }).from(salesInvoices).where(tenantWhere(salesInvoices, filters.tenantId,
    and(salesPostedFilter(), ...(dateParts.length ? [and(...dateParts)] : []),
      reportBranchCond(salesInvoices.branchId, filters))));
  const collections = await db.select({
    customerId: cashTransactions.customerId,
    amount: cashTransactions.amount,
    type: cashTransactions.type,
  }).from(cashTransactions)
    .leftJoin(customers, eq(cashTransactions.customerId, customers.id))
    .where(tenantWhere(cashTransactions, filters.tenantId,
      ...(cashDate.length ? [and(...cashDate)] : []),
      reportBranchCond(customers.branchId, filters)));

  const salesMap = new Map<number, { total: number; paid: number; remaining: number; count: number }>();
  for (const s of sales) {
    if (!s.customerId) continue;
    const cur = salesMap.get(s.customerId) || { total: 0, paid: 0, remaining: 0, count: 0 };
    cur.total += num(s.total);
    cur.paid += num(s.paid);
    cur.remaining += num(s.remaining);
    cur.count += 1;
    salesMap.set(s.customerId, cur);
  }
  const collectMap = new Map<number, number>();
  for (const c of collections) {
    if (!c.customerId || !String(c.type).includes("receive")) continue;
    collectMap.set(c.customerId, (collectMap.get(c.customerId) || 0) + num(c.amount));
  }

  return custRows.map((c) => {
    const s = salesMap.get(c.id) || { total: 0, paid: 0, remaining: 0, count: 0 };
    return {
      code: c.code || "",
      name: c.name,
      phone: c.phone || "",
      branchName: c.branchName || "",
      areaName: c.areaName || "",
      repName: c.repName || "",
      balance: num(c.balance),
      creditLimit: num(c.creditLimit),
      totalSales: s.total,
      totalPaid: s.paid,
      remaining: s.remaining,
      totalCollected: collectMap.get(c.id) || 0,
      invoiceCount: s.count,
    };
  });
}

export async function vendorsSummaryReport(db: Db, filters: ReportFilters) {
  const vendorRows = await db.select({
    id: suppliers.id,
    code: suppliers.code,
    name: suppliers.name,
    phone: suppliers.phone,
    balance: suppliers.balance,
    branchName: branches.name,
  }).from(suppliers)
    .leftJoin(branches, eq(suppliers.branchId, branches.id))
    .where(tenantWhere(suppliers, filters.tenantId,
      and(eq(suppliers.isActive, true), reportBranchCond(suppliers.branchId, filters))))
    .orderBy(suppliers.name);
  const dateParts = dateConds(purchaseInvoices, filters.dateFrom, filters.dateTo);
  const cashDate = dateConds(cashTransactions, filters.dateFrom, filters.dateTo);
  const purchases = await db.select({
    supplierId: purchaseInvoices.supplierId,
    total: purchaseInvoices.total,
    paid: purchaseInvoices.paid,
    remaining: purchaseInvoices.remaining,
  }).from(purchaseInvoices).where(tenantWhere(purchaseInvoices, filters.tenantId,
    and(purchasePostedFilter(), ...(dateParts.length ? [and(...dateParts)] : []),
      reportBranchCond(purchaseInvoices.branchId, filters))));
  const payments = await db.select({
    supplierId: cashTransactions.supplierId,
    amount: cashTransactions.amount,
    type: cashTransactions.type,
  }).from(cashTransactions).where(tenantWhere(cashTransactions, filters.tenantId,
    ...(cashDate.length ? [and(...cashDate)] : [])));

  const purchaseMap = new Map<number, { total: number; paid: number; remaining: number; count: number }>();
  for (const p of purchases) {
    if (!p.supplierId) continue;
    const cur = purchaseMap.get(p.supplierId) || { total: 0, paid: 0, remaining: 0, count: 0 };
    cur.total += num(p.total);
    cur.paid += num(p.paid);
    cur.remaining += num(p.remaining);
    cur.count += 1;
    purchaseMap.set(p.supplierId, cur);
  }
  const payMap = new Map<number, number>();
  for (const p of payments) {
    if (!p.supplierId || !String(p.type).includes("pay")) continue;
    payMap.set(p.supplierId, (payMap.get(p.supplierId) || 0) + num(p.amount));
  }

  return vendorRows.map((v) => {
    const p = purchaseMap.get(v.id) || { total: 0, paid: 0, remaining: 0, count: 0 };
    return {
      code: v.code || "",
      name: v.name,
      phone: v.phone || "",
      branchName: v.branchName || "",
      balance: num(v.balance),
      totalPurchases: p.total,
      totalPaid: p.paid,
      remaining: p.remaining,
      totalPaidCash: payMap.get(v.id) || 0,
      invoiceCount: p.count,
    };
  });
}

export async function vendorsListReport(db: Db, filters: ReportFilters) {
  const rows = await db.select({
    code: suppliers.code,
    name: suppliers.name,
    phone: suppliers.phone,
    email: suppliers.email,
    balance: suppliers.balance,
    branchName: branches.name,
  }).from(suppliers)
    .leftJoin(branches, eq(suppliers.branchId, branches.id))
    .where(tenantWhere(suppliers, filters.tenantId,
      and(eq(suppliers.isActive, true), reportBranchCond(suppliers.branchId, filters))))
    .orderBy(suppliers.name);
  return rows.map((s) => ({
    code: s.code || "",
    name: s.name,
    phone: s.phone || "",
    email: s.email || "",
    branchName: s.branchName || "",
    balance: num(s.balance),
  }));
}

export async function debitsAgingReport(db: Db, filters: ReportFilters, bucket: "default" | "year" | "half" = "default") {
  return customerDebtAgingReport(db, filters.tenantId, bucket);
}

export async function creditsAgingReport(db: Db, filters: ReportFilters, bucket: "default" | "year" | "half" = "default") {
  return supplierDebtAgingReport(db, filters.tenantId, bucket);
}

export async function salesByItemsReport(db: Db, filters: ReportFilters, monthly = false) {
  const dateParts = dateConds(salesInvoices, filters.dateFrom, filters.dateTo);
  const rows = await db.select({
    itemCode: items.code,
    itemName: items.name,
    purchasePrice: items.purchasePrice,
    quantity: salesInvoiceItems.quantity,
    total: salesInvoiceItems.total,
    date: salesInvoices.date,
  }).from(salesInvoiceItems)
    .innerJoin(salesInvoices, eq(salesInvoiceItems.invoiceId, salesInvoices.id))
    .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
    .leftJoin(items, eq(salesInvoiceItems.itemId, items.id))
    .where(tenantWhere(salesInvoiceItems, filters.tenantId,
      and(salesPostedFilter(), ...(dateParts.length ? [and(...dateParts)] : []),
        filters.itemId ? eq(salesInvoiceItems.itemId, filters.itemId) : undefined,
        filters.categoryId ? eq(items.categoryId, filters.categoryId) : undefined,
        filters.customerId ? eq(salesInvoices.customerId, filters.customerId) : undefined,
        reportBranchCond(salesInvoices.branchId, filters),
        reportWarehouseCond(salesInvoices.warehouseId, filters),
        filters.repId
          ? sql`(${salesInvoices.salesRepId} = ${filters.repId} OR ${customers.salesRepId} = ${filters.repId})`
          : undefined)));

  const map = new Map<string, { itemCode: string; itemName: string; quantity: number; total: number; profit: number; month?: string }>();
  for (const r of rows) {
    const d = new Date(dateOnly(r.date));
    const monthKey = monthly ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : "";
    const key = monthly ? `${r.itemCode}-${monthKey}` : String(r.itemCode || r.itemName);
    const cur = map.get(key) || { itemCode: r.itemCode || "", itemName: r.itemName || "", quantity: 0, total: 0, profit: 0, month: monthKey };
    cur.quantity += num(r.quantity);
    cur.total += num(r.total);
    cur.profit += num(r.total) - num(r.purchasePrice) * num(r.quantity);
    map.set(key, cur);
  }
  return Array.from(map.values());
}

export async function monthlySalesTotalsReport(db: Db, filters: ReportFilters) {
  const rows = await salesByItemsReport(db, filters, true);
  const map = new Map<string, { month: string; quantity: number; total: number; profit: number }>();
  for (const r of rows) {
    const key = r.month || "";
    const cur = map.get(key) || { month: key, quantity: 0, total: 0, profit: 0 };
    cur.quantity += r.quantity;
    cur.total += r.total;
    cur.profit += r.profit;
    map.set(key, cur);
  }
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export async function purchasesByItemsReport(db: Db, filters: ReportFilters) {
  const dateParts = dateConds(purchaseInvoices, filters.dateFrom, filters.dateTo);
  const rows = await db.select({
    itemCode: items.code,
    itemName: items.name,
    quantity: purchaseInvoiceItems.quantity,
    total: purchaseInvoiceItems.total,
    date: purchaseInvoices.date,
    supplierName: suppliers.name,
  }).from(purchaseInvoiceItems)
    .innerJoin(purchaseInvoices, eq(purchaseInvoiceItems.invoiceId, purchaseInvoices.id))
    .leftJoin(items, eq(purchaseInvoiceItems.itemId, items.id))
    .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
    .where(tenantWhere(purchaseInvoiceItems, filters.tenantId,
      and(purchasePostedFilter(), ...(dateParts.length ? [and(...dateParts)] : []),
        filters.supplierId ? eq(purchaseInvoices.supplierId, filters.supplierId) : undefined,
        filters.categoryId ? eq(items.categoryId, filters.categoryId) : undefined,
        reportWarehouseCond(purchaseInvoices.warehouseId, filters),
        filters.itemId ? eq(purchaseInvoiceItems.itemId, filters.itemId) : undefined,
        reportBranchCond(purchaseInvoices.branchId, filters))));

  const map = new Map<string, { itemCode: string; itemName: string; quantity: number; total: number; supplierName: string }>();
  for (const r of rows) {
    const key = String(r.itemCode || r.itemName);
    const cur = map.get(key) || { itemCode: r.itemCode || "", itemName: r.itemName || "", quantity: 0, total: 0, supplierName: r.supplierName || "" };
    cur.quantity += num(r.quantity);
    cur.total += num(r.total);
    map.set(key, cur);
  }
  return Array.from(map.values());
}

export async function customerStatementReport(db: Db, filters: ReportFilters) {
  return buildContactLedger(db, filters, "customer");
}

export async function vendorStatementReport(db: Db, filters: ReportFilters) {
  return buildContactLedger(db, filters, "supplier");
}

async function buildContactLedger(
  db: Db,
  filters: ReportFilters,
  type: "customer" | "supplier",
) {
  const rows: { date: string; sortKey: string; documentType: string; documentNumber: string; debit: number; credit: number; description: string }[] = [];

  if (type === "customer") {
    const dateParts = dateConds(salesInvoices, filters.dateFrom, filters.dateTo);
    const invoices = await db.select({
      number: salesInvoices.number,
      date: salesInvoices.date,
      total: salesInvoices.total,
    }).from(salesInvoices).where(tenantWhere(salesInvoices, filters.tenantId,
      and(salesPostedFilter(), ...(dateParts.length ? [and(...dateParts)] : []),
        filters.customerId ? eq(salesInvoices.customerId, filters.customerId) : undefined)));
    for (const inv of invoices) {
      rows.push({
        date: dateOnly(inv.date),
        sortKey: `${dateOnly(inv.date)}-1-${inv.number}`,
        documentType: "فاتورة مبيعات",
        documentNumber: inv.number,
        debit: num(inv.total),
        credit: 0,
        description: "",
      });
    }
    const retDate = dateConds(salesReturns, filters.dateFrom, filters.dateTo);
    const returns = await db.select({ number: salesReturns.number, date: salesReturns.date, total: salesReturns.total })
      .from(salesReturns).where(tenantWhere(salesReturns, filters.tenantId,
        and(...(retDate.length ? [and(...retDate)] : []), filters.customerId ? eq(salesReturns.customerId, filters.customerId) : undefined)));
    for (const r of returns) {
      rows.push({
        date: dateOnly(r.date),
        sortKey: `${dateOnly(r.date)}-2-${r.number}`,
        documentType: "مرتجع مبيعات",
        documentNumber: r.number,
        debit: 0,
        credit: num(r.total),
        description: "",
      });
    }
    const cashDate = dateConds(cashTransactions, filters.dateFrom, filters.dateTo);
    const cash = await db.select({ number: cashTransactions.number, date: cashTransactions.date, amount: cashTransactions.amount, description: cashTransactions.description, type: cashTransactions.type })
      .from(cashTransactions).where(tenantWhere(cashTransactions, filters.tenantId,
        and(...(cashDate.length ? [and(...cashDate)] : []), filters.customerId ? eq(cashTransactions.customerId, filters.customerId) : undefined)));
    for (const c of cash) {
      const isReceive = String(c.type).includes("receive");
      rows.push({
        date: dateOnly(c.date),
        sortKey: `${dateOnly(c.date)}-3-${c.number}`,
        documentType: isReceive ? "تحصيل نقدي" : "صرف نقدي",
        documentNumber: c.number,
        debit: isReceive ? 0 : num(c.amount),
        credit: isReceive ? num(c.amount) : 0,
        description: c.description || "",
      });
    }
    const bankDate = dateConds(bankTransactions, filters.dateFrom, filters.dateTo);
    const bank = await db.select({ reference: bankTransactions.reference, date: bankTransactions.date, amount: bankTransactions.amount, description: bankTransactions.description, type: bankTransactions.type })
      .from(bankTransactions).where(tenantWhere(bankTransactions, filters.tenantId,
        and(...(bankDate.length ? [and(...bankDate)] : []), filters.customerId ? eq(bankTransactions.customerId, filters.customerId) : undefined)));
    for (const b of bank) {
      const isDeposit = String(b.type).includes("deposit") || String(b.type).includes("receive");
      rows.push({
        date: dateOnly(b.date),
        sortKey: `${dateOnly(b.date)}-4-${b.reference || ""}`,
        documentType: isDeposit ? "تحصيل بنكي" : "صرف بنكي",
        documentNumber: b.reference || "",
        debit: isDeposit ? 0 : num(b.amount),
        credit: isDeposit ? num(b.amount) : 0,
        description: b.description || "",
      });
    }
  } else {
    const dateParts = dateConds(purchaseInvoices, filters.dateFrom, filters.dateTo);
    const invoices = await db.select({
      number: purchaseInvoices.number,
      date: purchaseInvoices.date,
      total: purchaseInvoices.total,
    }).from(purchaseInvoices).where(tenantWhere(purchaseInvoices, filters.tenantId,
      and(purchasePostedFilter(), ...(dateParts.length ? [and(...dateParts)] : []),
        filters.supplierId ? eq(purchaseInvoices.supplierId, filters.supplierId) : undefined)));
    for (const inv of invoices) {
      rows.push({
        date: dateOnly(inv.date),
        sortKey: `${dateOnly(inv.date)}-1-${inv.number}`,
        documentType: "فاتورة مشتريات",
        documentNumber: inv.number,
        debit: 0,
        credit: num(inv.total),
        description: "",
      });
    }
    const cashDate = dateConds(cashTransactions, filters.dateFrom, filters.dateTo);
    const cash = await db.select({ number: cashTransactions.number, date: cashTransactions.date, amount: cashTransactions.amount, description: cashTransactions.description, type: cashTransactions.type })
      .from(cashTransactions).where(tenantWhere(cashTransactions, filters.tenantId,
        and(...(cashDate.length ? [and(...cashDate)] : []), filters.supplierId ? eq(cashTransactions.supplierId, filters.supplierId) : undefined)));
    for (const c of cash) {
      const isPay = String(c.type).includes("pay");
      rows.push({
        date: dateOnly(c.date),
        sortKey: `${dateOnly(c.date)}-2-${c.number}`,
        documentType: isPay ? "سداد نقدي" : "تحصيل",
        documentNumber: c.number,
        debit: isPay ? num(c.amount) : 0,
        credit: isPay ? 0 : num(c.amount),
        description: c.description || "",
      });
    }
  }

  rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  let running = 0;
  return rows.map(({ sortKey: _, ...r }) => {
    running += r.debit - r.credit;
    return { ...r, runningBalance: running };
  });
}

export async function customerItemStatementReport(db: Db, filters: ReportFilters) {
  if (!filters.customerId) return [{ message: "يجب اختيار عميل" }];

  const [customer] = await db.select().from(customers)
    .where(tenantWhere(customers, filters.tenantId, eq(customers.id, filters.customerId)));
  if (!customer) return [];

  type Row = {
    date: string;
    sortKey: string;
    documentNumber: string;
    description: string;
    outQty: number | "";
    outPrice: number | "";
    outTotal: number | "";
    inQty: number | "";
    inPrice: number | "";
    inTotal: number | "";
    cashBankIn: number | "";
    cashBankOut: number | "";
    checkCollected: number | "";
    checkRejected: number | "";
    otherOps: number | "";
    balanceDelta: number;
  };

  const emptyAmt = () => ({
    outQty: "" as const, outPrice: "" as const, outTotal: "" as const,
    inQty: "" as const, inPrice: "" as const, inTotal: "" as const,
    cashBankIn: "" as const, cashBankOut: "" as const,
    checkCollected: "" as const, checkRejected: "" as const, otherOps: "" as const,
  });

  // —— رصيد سابق قبل dateFrom ——
  let opening = num(customer.openingBalance);
  if (filters.dateFrom) {
    const beforeSales = await db.select({
      total: salesInvoiceItems.total,
    }).from(salesInvoiceItems)
      .innerJoin(salesInvoices, eq(salesInvoiceItems.invoiceId, salesInvoices.id))
      .where(tenantWhere(salesInvoiceItems, filters.tenantId,
        and(salesPostedFilter(), eq(salesInvoices.customerId, filters.customerId),
          lt(salesInvoices.date, filters.dateFrom as any),
          filters.itemId ? eq(salesInvoiceItems.itemId, filters.itemId) : undefined,
          reportBranchCond(salesInvoices.branchId, filters),
          filters.currencyCode ? eq(salesInvoices.currencyCode, filters.currencyCode) : undefined)));
    for (const r of beforeSales) opening += num(r.total);

    const beforeReturns = await db.select({ total: salesReturnItems.total })
      .from(salesReturnItems)
      .innerJoin(salesReturns, eq(salesReturnItems.returnId, salesReturns.id))
      .where(tenantWhere(salesReturnItems, filters.tenantId,
        and(eq(salesReturns.customerId, filters.customerId),
          lt(salesReturns.date, filters.dateFrom as any),
          filters.itemId ? eq(salesReturnItems.itemId, filters.itemId) : undefined)));
    for (const r of beforeReturns) opening -= num(r.total);

    const beforeCash = await db.select({ amount: cashTransactions.amount, type: cashTransactions.type })
      .from(cashTransactions)
      .where(tenantWhere(cashTransactions, filters.tenantId,
        and(eq(cashTransactions.customerId, filters.customerId), lt(cashTransactions.date, filters.dateFrom as any))));
    for (const c of beforeCash) {
      if (String(c.type).includes("receive")) opening -= num(c.amount);
      else opening += num(c.amount);
    }

    const beforeBank = await db.select({ amount: bankTransactions.amount, type: bankTransactions.type })
      .from(bankTransactions)
      .where(tenantWhere(bankTransactions, filters.tenantId,
        and(eq(bankTransactions.customerId, filters.customerId), lt(bankTransactions.date, filters.dateFrom as any))));
    for (const b of beforeBank) {
      if (String(b.type).includes("deposit")) opening -= num(b.amount);
      else opening += num(b.amount);
    }

    const beforeChecks = await db.select({ amount: checks.amount, status: checks.status, type: checks.type })
      .from(checks)
      .where(tenantWhere(checks, filters.tenantId,
        and(eq(checks.customerId, filters.customerId), lt(checks.date, filters.dateFrom as any))));
    for (const ch of beforeChecks) {
      if (ch.type !== "incoming") continue;
      if (ch.status === "bounced") continue;
      if (ch.status === "cleared" || ch.status === "deposited" || ch.status === "pending") opening -= num(ch.amount);
    }
  } else {
    opening = num(customer.balance);
  }

  const periodRows: Row[] = [];

  // فواتير مبيعات → صادر
  const salesDate = dateConds(salesInvoices, filters.dateFrom, filters.dateTo);
  const salesLines = await db.select({
    date: salesInvoices.date,
    number: salesInvoices.number,
    itemName: items.name,
    quantity: salesInvoiceItems.quantity,
    price: salesInvoiceItems.price,
    total: salesInvoiceItems.total,
    discount: salesInvoiceItems.discount,
  }).from(salesInvoiceItems)
    .innerJoin(salesInvoices, eq(salesInvoiceItems.invoiceId, salesInvoices.id))
    .leftJoin(items, eq(salesInvoiceItems.itemId, items.id))
    .where(tenantWhere(salesInvoiceItems, filters.tenantId,
      and(salesPostedFilter(), eq(salesInvoices.customerId, filters.customerId),
        ...(salesDate.length ? [and(...salesDate)] : []),
        filters.itemId ? eq(salesInvoiceItems.itemId, filters.itemId) : undefined,
        reportBranchCond(salesInvoices.branchId, filters),
        filters.currencyCode ? eq(salesInvoices.currencyCode, filters.currencyCode) : undefined)));

  for (const r of salesLines) {
    const qty = num(r.quantity);
    const price = num(r.price);
    const total = num(r.total);
    periodRows.push({
      date: dateOnly(r.date),
      sortKey: `${dateOnly(r.date)}-1-${r.number}`,
      documentNumber: `Inv.${r.number}`,
      description: r.itemName || "",
      ...emptyAmt(),
      outQty: qty,
      outPrice: price,
      outTotal: total,
      balanceDelta: total,
    });
  }

  // مرتجعات → وارد
  const retDate = dateConds(salesReturns, filters.dateFrom, filters.dateTo);
  const returnLines = await db.select({
    date: salesReturns.date,
    number: salesReturns.number,
    itemName: items.name,
    quantity: salesReturnItems.quantity,
    price: salesReturnItems.price,
    total: salesReturnItems.total,
  }).from(salesReturnItems)
    .innerJoin(salesReturns, eq(salesReturnItems.returnId, salesReturns.id))
    .leftJoin(items, eq(salesReturnItems.itemId, items.id))
    .where(tenantWhere(salesReturnItems, filters.tenantId,
      and(eq(salesReturns.customerId, filters.customerId),
        ...(retDate.length ? [and(...retDate)] : []),
        filters.itemId ? eq(salesReturnItems.itemId, filters.itemId) : undefined)));

  for (const r of returnLines) {
    const qty = num(r.quantity);
    const price = num(r.price);
    const total = num(r.total);
    periodRows.push({
      date: dateOnly(r.date),
      sortKey: `${dateOnly(r.date)}-2-${r.number}`,
      documentNumber: `Ret.${r.number}`,
      description: r.itemName || "",
      ...emptyAmt(),
      inQty: qty,
      inPrice: price,
      inTotal: total,
      balanceDelta: -total,
    });
  }

  // نقدية
  const cashDate = dateConds(cashTransactions, filters.dateFrom, filters.dateTo);
  const cash = await db.select({
    number: cashTransactions.number,
    date: cashTransactions.date,
    amount: cashTransactions.amount,
    description: cashTransactions.description,
    type: cashTransactions.type,
  }).from(cashTransactions).where(tenantWhere(cashTransactions, filters.tenantId,
    and(eq(cashTransactions.customerId, filters.customerId),
      ...(cashDate.length ? [and(...cashDate)] : []))));

  for (const c of cash) {
    const isReceive = String(c.type).includes("receive");
    const amount = num(c.amount);
    periodRows.push({
      date: dateOnly(c.date),
      sortKey: `${dateOnly(c.date)}-3-${c.number}`,
      documentNumber: isReceive ? `CshIn.${c.number}` : `CshOut.${c.number}`,
      description: c.description || (isReceive ? "اذن استلام نقدية" : "اذن صرف نقدية"),
      ...emptyAmt(),
      cashBankIn: isReceive ? amount : "",
      cashBankOut: isReceive ? "" : amount,
      balanceDelta: isReceive ? -amount : amount,
    });
  }

  // بنوك
  const bankDate = dateConds(bankTransactions, filters.dateFrom, filters.dateTo);
  const bank = await db.select({
    number: bankTransactions.number,
    reference: bankTransactions.reference,
    date: bankTransactions.date,
    amount: bankTransactions.amount,
    description: bankTransactions.description,
    type: bankTransactions.type,
  }).from(bankTransactions).where(tenantWhere(bankTransactions, filters.tenantId,
    and(eq(bankTransactions.customerId, filters.customerId),
      ...(bankDate.length ? [and(...bankDate)] : []))));

  for (const b of bank) {
    const isDeposit = String(b.type).includes("deposit");
    const amount = num(b.amount);
    const ref = b.reference || b.number;
    periodRows.push({
      date: dateOnly(b.date),
      sortKey: `${dateOnly(b.date)}-4-${ref}`,
      documentNumber: isDeposit ? `BnkDep.${ref}` : `BnkWit.${ref}`,
      description: b.description || (isDeposit ? "ايداع بنكي" : "سحب بنكي"),
      ...emptyAmt(),
      cashBankIn: isDeposit ? amount : "",
      cashBankOut: isDeposit ? "" : amount,
      balanceDelta: isDeposit ? -amount : amount,
    });
  }

  // شيكات واردة على العميل
  const checkDate = dateConds(checks, filters.dateFrom, filters.dateTo);
  const chks = await db.select({
    number: checks.number,
    checkNumber: checks.checkNumber,
    date: checks.date,
    amount: checks.amount,
    status: checks.status,
    type: checks.type,
    description: checks.description,
  }).from(checks).where(tenantWhere(checks, filters.tenantId,
    and(eq(checks.customerId, filters.customerId), eq(checks.type, "incoming"),
      ...(checkDate.length ? [and(...checkDate)] : []))));

  for (const ch of chks) {
    const amount = num(ch.amount);
    const bounced = ch.status === "bounced";
    periodRows.push({
      date: dateOnly(ch.date),
      sortKey: `${dateOnly(ch.date)}-5-${ch.number}`,
      documentNumber: `Chk.${ch.checkNumber || ch.number}`,
      description: ch.description || (bounced ? "شيك مرفوض" : "شيك"),
      ...emptyAmt(),
      checkCollected: bounced ? "" : amount,
      checkRejected: bounced ? amount : "",
      balanceDelta: bounced ? 0 : -amount,
    });
  }

  periodRows.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const out: Record<string, unknown>[] = [];
  out.push({
    date: "",
    documentNumber: "",
    description: "الرصيد السابق",
    outQty: "", outPrice: "", outTotal: "",
    inQty: "", inPrice: "", inTotal: "",
    cashBankIn: "", cashBankOut: "",
    checkCollected: "", checkRejected: "", otherOps: "",
    balance: opening,
  });

  let running = opening;
  let sumOutQty = 0, sumOutTotal = 0, sumInQty = 0, sumInTotal = 0;
  let sumCashIn = 0, sumCashOut = 0, sumChk = 0, sumChkRej = 0, sumOther = 0;

  for (const r of periodRows) {
    running += r.balanceDelta;
    if (typeof r.outQty === "number") sumOutQty += r.outQty;
    if (typeof r.outTotal === "number") sumOutTotal += r.outTotal;
    if (typeof r.inQty === "number") sumInQty += r.inQty;
    if (typeof r.inTotal === "number") sumInTotal += r.inTotal;
    if (typeof r.cashBankIn === "number") sumCashIn += r.cashBankIn;
    if (typeof r.cashBankOut === "number") sumCashOut += r.cashBankOut;
    if (typeof r.checkCollected === "number") sumChk += r.checkCollected;
    if (typeof r.checkRejected === "number") sumChkRej += r.checkRejected;
    if (typeof r.otherOps === "number") sumOther += r.otherOps;
    const { sortKey: _s, balanceDelta: _d, ...rest } = r;
    out.push({ ...rest, balance: running });
  }

  out.push({
    date: "",
    documentNumber: "",
    description: "اجمالي حركات الفترة",
    outQty: sumOutQty || "",
    outPrice: "",
    outTotal: sumOutTotal || "",
    inQty: sumInQty || "",
    inPrice: "",
    inTotal: sumInTotal || "",
    cashBankIn: sumCashIn || "",
    cashBankOut: sumCashOut || "",
    checkCollected: sumChk || "",
    checkRejected: sumChkRej || "",
    otherOps: sumOther || "",
    balance: running,
  });

  return out;
}

export async function vendorItemStatementReport(db: Db, filters: ReportFilters) {
  if (!filters.supplierId) return [{ message: "يجب اختيار مورد" }];
  const dateParts = dateConds(purchaseInvoices, filters.dateFrom, filters.dateTo);
  const rows = await db.select({
    date: purchaseInvoices.date,
    number: purchaseInvoices.number,
    itemCode: items.code,
    itemName: items.name,
    quantity: purchaseInvoiceItems.quantity,
    total: purchaseInvoiceItems.total,
  }).from(purchaseInvoiceItems)
    .innerJoin(purchaseInvoices, eq(purchaseInvoiceItems.invoiceId, purchaseInvoices.id))
    .leftJoin(items, eq(purchaseInvoiceItems.itemId, items.id))
    .where(tenantWhere(purchaseInvoiceItems, filters.tenantId,
      and(purchasePostedFilter(), eq(purchaseInvoices.supplierId, filters.supplierId),
        ...(dateParts.length ? [and(...dateParts)] : []))));

  const ledger = rows.map((r) => ({
    date: dateOnly(r.date),
    documentNumber: r.number,
    itemCode: r.itemCode || "",
    itemName: r.itemName || "",
    qtyIn: num(r.quantity),
    qtyOut: 0,
    debit: 0,
    credit: num(r.total),
  }));
  let running = 0;
  return ledger.map((r) => {
    running += r.debit - r.credit;
    return { ...r, balance: running };
  });
}

export async function costCenterStatementReport(db: Db, filters: ReportFilters) {
  const lines = await loadPostedJournalLines(db, filters);
  if (!filters.costCenterId) return lines;
  const [cc] = await db.select().from(costCenters).where(eq(costCenters.id, filters.costCenterId));
  return lines.map((l) => ({ ...l, costCenter: cc?.name || "" }));
}

export async function monthlyExpensesReport(db: Db, filters: ReportFilters) {
  const expenseAccounts = await db.select({ id: accounts.id, code: accounts.code, name: accounts.name })
    .from(accounts).where(tenantWhere(accounts, filters.tenantId, eq(accounts.type, "expense")));
  const expenseIds = new Set(expenseAccounts.map((a) => a.id));
  const lines = await loadPostedJournalLines(db, filters);
  const map = new Map<string, { month: string; accountCode: string; accountName: string; debit: number; credit: number; net: number }>();
  for (const l of lines) {
    const acc = expenseAccounts.find((a) => a.code === l.accountCode);
    if (!acc || !expenseIds.has(acc.id)) continue;
    const month = String(l.date).slice(0, 7);
    const key = `${month}-${acc.code}`;
    const cur = map.get(key) || { month, accountCode: acc.code, accountName: acc.name, debit: 0, credit: 0, net: 0 };
    cur.debit += num(l.debit);
    cur.credit += num(l.credit);
    cur.net += num(l.debit) - num(l.credit);
    map.set(key, cur);
  }
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month) || a.accountCode.localeCompare(b.accountCode));
}

export async function itemsProfitsReport(db: Db, filters: ReportFilters) {
  const rows = await salesByItemsReport(db, filters, false);
  return rows.map((r) => ({
    itemCode: r.itemCode,
    itemName: r.itemName,
    quantity: r.quantity,
    salesTotal: r.total,
    costTotal: num(r.total) - num(r.profit),
    profit: r.profit,
    profitPercent: r.total ? ((num(r.profit) / num(r.total)) * 100).toFixed(2) : "0",
  }));
}

export async function invoiceProfitsReport(db: Db, filters: ReportFilters) {
  const dateParts = dateConds(salesInvoices, filters.dateFrom, filters.dateTo);
  const rows = await db.select({
    invoiceNumber: salesInvoices.number,
    date: salesInvoices.date,
    customerName: customers.name,
    itemTotal: salesInvoiceItems.total,
    purchasePrice: items.purchasePrice,
    quantity: salesInvoiceItems.quantity,
    invoiceTotal: salesInvoices.total,
  }).from(salesInvoiceItems)
    .innerJoin(salesInvoices, eq(salesInvoiceItems.invoiceId, salesInvoices.id))
    .leftJoin(items, eq(salesInvoiceItems.itemId, items.id))
    .leftJoin(customers, eq(salesInvoices.customerId, customers.id))
    .where(tenantWhere(salesInvoiceItems, filters.tenantId,
      and(salesPostedFilter(), ...(dateParts.length ? [and(...dateParts)] : []),
        ...salesInvoiceExtraFilters(filters),
        filters.search
          ? sql`(${salesInvoices.number} LIKE ${`%${filters.search}%`} OR ${customers.name} LIKE ${`%${filters.search}%`})`
          : undefined)));

  const map = new Map<string, { invoiceNumber: string; date: string; customerName: string; salesTotal: number; costTotal: number }>();
  for (const r of rows) {
    const key = String(r.invoiceNumber);
    const cur = map.get(key) || {
      invoiceNumber: r.invoiceNumber,
      date: dateOnly(r.date),
      customerName: r.customerName || "",
      salesTotal: num(r.invoiceTotal),
      costTotal: 0,
    };
    cur.costTotal += num(r.purchasePrice) * num(r.quantity);
    map.set(key, cur);
  }
  return Array.from(map.values()).map((v) => ({
    ...v,
    profit: v.salesTotal - v.costTotal,
    profitPercent: v.salesTotal ? ((v.salesTotal - v.costTotal) / v.salesTotal * 100).toFixed(2) : "0",
  }));
}

export async function lastPricesReport(db: Db, filters: ReportFilters) {
  const dateParts = dateConds(salesInvoices, filters.dateFrom, filters.dateTo);
  const rows = await db.select({
    itemCode: items.code,
    itemName: items.name,
    price: salesInvoiceItems.price,
    date: salesInvoices.date,
    invoiceNumber: salesInvoices.number,
  }).from(salesInvoiceItems)
    .innerJoin(salesInvoices, eq(salesInvoiceItems.invoiceId, salesInvoices.id))
    .leftJoin(items, eq(salesInvoiceItems.itemId, items.id))
    .leftJoin(customers, eq(salesInvoices.customerId, customers.id))
    .where(tenantWhere(salesInvoiceItems, filters.tenantId,
      and(salesPostedFilter(), ...(dateParts.length ? [and(...dateParts)] : []),
        ...salesInvoiceExtraFilters(filters))))
    .orderBy(desc(salesInvoices.date));

  const pmap = dateConds(purchaseInvoices, filters.dateFrom, filters.dateTo);
  const purchases = await db.select({
    itemCode: items.code,
    itemName: items.name,
    price: purchaseInvoiceItems.price,
    date: purchaseInvoices.date,
    invoiceNumber: purchaseInvoices.number,
  }).from(purchaseInvoiceItems)
    .innerJoin(purchaseInvoices, eq(purchaseInvoiceItems.invoiceId, purchaseInvoices.id))
    .leftJoin(items, eq(purchaseInvoiceItems.itemId, items.id))
    .where(tenantWhere(purchaseInvoiceItems, filters.tenantId,
      and(purchasePostedFilter(), ...(pmap.length ? [and(...pmap)] : []),
        ...purchaseInvoiceExtraFilters(filters))))
    .orderBy(desc(purchaseInvoices.date));

  const map = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const key = String(r.itemCode || r.itemName);
    if (!map.has(key)) {
      map.set(key, {
        itemCode: r.itemCode || "",
        itemName: r.itemName || "",
        lastSalePrice: num(r.price),
        lastSaleDate: dateOnly(r.date),
        lastSaleInvoice: r.invoiceNumber,
        lastPurchasePrice: 0,
        lastPurchaseDate: "",
        lastPurchaseInvoice: "",
      });
    }
  }
  for (const r of purchases) {
    const key = String(r.itemCode || r.itemName);
    const cur = map.get(key) || {
      itemCode: r.itemCode || "",
      itemName: r.itemName || "",
      lastSalePrice: 0,
      lastSaleDate: "",
      lastSaleInvoice: "",
      lastPurchasePrice: 0,
      lastPurchaseDate: "",
      lastPurchaseInvoice: "",
    };
    if (!cur.lastPurchasePrice) {
      cur.lastPurchasePrice = num(r.price);
      cur.lastPurchaseDate = dateOnly(r.date);
      cur.lastPurchaseInvoice = r.invoiceNumber;
      map.set(key, cur);
    }
  }
  return Array.from(map.values());
}

export async function customersProfitsReport(db: Db, filters: ReportFilters) {
  const dateParts = dateConds(salesInvoices, filters.dateFrom, filters.dateTo);
  const rows = await db.select({
    customerName: customers.name,
    itemTotal: salesInvoiceItems.total,
    purchasePrice: items.purchasePrice,
    quantity: salesInvoiceItems.quantity,
  }).from(salesInvoiceItems)
    .innerJoin(salesInvoices, eq(salesInvoiceItems.invoiceId, salesInvoices.id))
    .leftJoin(items, eq(salesInvoiceItems.itemId, items.id))
    .leftJoin(customers, eq(salesInvoices.customerId, customers.id))
    .where(tenantWhere(salesInvoiceItems, filters.tenantId,
      and(salesPostedFilter(), ...(dateParts.length ? [and(...dateParts)] : []),
        ...salesInvoiceExtraFilters(filters))));

  const map = new Map<string, { customerName: string; salesTotal: number; costTotal: number; profit: number }>();
  for (const r of rows) {
    const name = r.customerName || "غير محدد";
    const cur = map.get(name) || { customerName: name, salesTotal: 0, costTotal: 0, profit: 0 };
    const sales = num(r.itemTotal);
    const cost = num(r.purchasePrice) * num(r.quantity);
    cur.salesTotal += sales;
    cur.costTotal += cost;
    cur.profit += sales - cost;
    map.set(name, cur);
  }
  return Array.from(map.values());
}

export async function matureInvoicesReport(db: Db, filters: ReportFilters) {
  const today = new Date().toISOString().split("T")[0];
  const dateParts = dateConds(salesInvoices, filters.dateFrom, filters.dateTo);
  const rows = await db.select({
    number: salesInvoices.number,
    date: salesInvoices.date,
    dueDate: salesInvoices.dueDate,
    customerName: customers.name,
    total: salesInvoices.total,
    remaining: salesInvoices.remaining,
  }).from(salesInvoices)
    .leftJoin(customers, eq(salesInvoices.customerId, customers.id))
    .where(tenantWhere(salesInvoices, filters.tenantId,
      and(salesOpenFilter(), sql`${salesInvoices.remaining} > 0`,
        ...(dateParts.length ? [and(...dateParts)] : []),
        filters.customerId ? eq(salesInvoices.customerId, filters.customerId) : undefined,
        reportBranchCond(salesInvoices.branchId, filters),
        filters.search
          ? sql`(${salesInvoices.number} LIKE ${`%${filters.search}%`} OR ${customers.name} LIKE ${`%${filters.search}%`})`
          : undefined)))
    .orderBy(salesInvoices.dueDate);

  return rows
    .filter((r) => {
      const due = dateOnly(r.dueDate) || dateOnly(r.date);
      return due <= today;
    })
    .map((r) => ({
      documentNumber: r.number,
      date: dateOnly(r.date),
      dueDate: dateOnly(r.dueDate),
      customerName: r.customerName || "",
      total: num(r.total),
      remaining: num(r.remaining),
    }));
}

export async function matureReceiptsReport(db: Db, filters: ReportFilters) {
  const today = new Date().toISOString().split("T")[0];
  const dateParts = dateConds(purchaseInvoices, filters.dateFrom, filters.dateTo);
  const rows = await db.select({
    number: purchaseInvoices.number,
    date: purchaseInvoices.date,
    dueDate: purchaseInvoices.dueDate,
    supplierName: suppliers.name,
    total: purchaseInvoices.total,
    remaining: purchaseInvoices.remaining,
  }).from(purchaseInvoices)
    .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
    .where(tenantWhere(purchaseInvoices, filters.tenantId,
      and(purchaseOpenFilter(), sql`${purchaseInvoices.remaining} > 0`,
        ...(dateParts.length ? [and(...dateParts)] : []),
        filters.supplierId ? eq(purchaseInvoices.supplierId, filters.supplierId) : undefined,
        reportBranchCond(purchaseInvoices.branchId, filters),
        filters.search
          ? sql`(${purchaseInvoices.number} LIKE ${`%${filters.search}%`} OR ${suppliers.name} LIKE ${`%${filters.search}%`})`
          : undefined)))
    .orderBy(purchaseInvoices.dueDate);

  return rows
    .filter((r) => {
      const due = dateOnly(r.dueDate) || dateOnly(r.date);
      return due <= today;
    })
    .map((r) => ({
      documentNumber: r.number,
      date: dateOnly(r.date),
      dueDate: dateOnly(r.dueDate),
      supplierName: r.supplierName || "",
      total: num(r.total),
      remaining: num(r.remaining),
    }));
}

export async function branchesSummaryReport(db: Db, filters: ReportFilters) {
  const branchRows = await db.select().from(branches).where(tenantWhere(branches, filters.tenantId,
    reportBranchCond(branches.id, filters))).orderBy(branches.name);
  const salesDate = dateConds(salesInvoices, filters.dateFrom, filters.dateTo);
  const purchaseDate = dateConds(purchaseInvoices, filters.dateFrom, filters.dateTo);
  const cashDate = dateConds(cashTransactions, filters.dateFrom, filters.dateTo);

  const sales = await db.select({
    branchId: salesInvoices.branchId,
    total: salesInvoices.total,
    paid: salesInvoices.paid,
    remaining: salesInvoices.remaining,
  }).from(salesInvoices).where(tenantWhere(salesInvoices, filters.tenantId,
    and(salesPostedFilter(), ...(salesDate.length ? [and(...salesDate)] : []),
      reportBranchCond(salesInvoices.branchId, filters))));

  const purchases = await db.select({
    branchId: purchaseInvoices.branchId,
    total: purchaseInvoices.total,
  }).from(purchaseInvoices).where(tenantWhere(purchaseInvoices, filters.tenantId,
    and(purchasePostedFilter(), ...(purchaseDate.length ? [and(...purchaseDate)] : []),
      reportBranchCond(purchaseInvoices.branchId, filters))));

  const collections = await db.select({
    branchId: customers.branchId,
    amount: cashTransactions.amount,
    type: cashTransactions.type,
  }).from(cashTransactions)
    .leftJoin(customers, eq(cashTransactions.customerId, customers.id))
    .where(tenantWhere(cashTransactions, filters.tenantId,
      ...(cashDate.length ? [and(...cashDate)] : [])));

  type BranchAgg = { sales: number; paid: number; remaining: number; salesCount: number; purchases: number; purchaseCount: number; collected: number };
  const map = new Map<number, BranchAgg>();
  const ensure = (id: number): BranchAgg => {
    const cur = map.get(id) || { sales: 0, paid: 0, remaining: 0, salesCount: 0, purchases: 0, purchaseCount: 0, collected: 0 };
    map.set(id, cur);
    return cur;
  };
  for (const s of sales) {
    if (!s.branchId) continue;
    const cur = ensure(s.branchId);
    cur.sales += num(s.total);
    cur.paid += num(s.paid);
    cur.remaining += num(s.remaining);
    cur.salesCount += 1;
  }
  for (const p of purchases) {
    if (!p.branchId) continue;
    const cur = ensure(p.branchId);
    cur.purchases += num(p.total);
    cur.purchaseCount += 1;
  }
  for (const c of collections) {
    if (!c.branchId || !String(c.type).includes("receive")) continue;
    ensure(c.branchId).collected += num(c.amount);
  }

  const custCounts = await db.select({ branchId: customers.branchId, count: sql<number>`count(*)` })
    .from(customers).where(tenantWhere(customers, filters.tenantId)).groupBy(customers.branchId);
  const custMap = new Map(custCounts.map((c) => [c.branchId!, Number(c.count)]));

  const supplierCounts = await db.select({ branchId: suppliers.branchId, count: sql<number>`count(*)` })
    .from(suppliers).where(tenantWhere(suppliers, filters.tenantId)).groupBy(suppliers.branchId);
  const supplierMap = new Map(supplierCounts.map((c) => [c.branchId!, Number(c.count)]));

  const warehouseCounts = await db.select({ branchId: warehouses.branchId, count: sql<number>`count(*)` })
    .from(warehouses).where(tenantWhere(warehouses, filters.tenantId)).groupBy(warehouses.branchId);
  const warehouseMap = new Map(warehouseCounts.map((c) => [c.branchId!, Number(c.count)]));

  return branchRows.map((b) => {
    const a = map.get(b.id) || { sales: 0, paid: 0, remaining: 0, salesCount: 0, purchases: 0, purchaseCount: 0, collected: 0 };
    return {
      branchName: b.name,
      address: b.address || "",
      phone: b.phone || "",
      customersCount: custMap.get(b.id) || 0,
      suppliersCount: supplierMap.get(b.id) || 0,
      warehousesCount: warehouseMap.get(b.id) || 0,
      salesInvoicesCount: a.salesCount,
      salesTotal: a.sales,
      salesPaid: a.paid,
      salesRemaining: a.remaining,
      purchasesInvoicesCount: a.purchaseCount,
      purchasesTotal: a.purchases,
      collectionsTotal: a.collected,
      netSalesPurchases: a.sales - a.purchases,
      isActive: b.isActive ? "نعم" : "لا",
    };
  });
}

export async function areasSummaryReport(db: Db, filters: ReportFilters) {
  const areaRows = await db.select().from(salesAreas).where(tenantWhere(salesAreas, filters.tenantId,
    filters.areaId ? eq(salesAreas.id, filters.areaId) : undefined)).orderBy(salesAreas.name);
  const dateParts = dateConds(salesInvoices, filters.dateFrom, filters.dateTo);

  const salesByCustomer = await db.select({
    areaId: customers.areaId,
    total: salesInvoices.total,
    paid: salesInvoices.paid,
    remaining: salesInvoices.remaining,
  }).from(salesInvoices)
    .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
    .where(tenantWhere(salesInvoices, filters.tenantId,
      and(salesPostedFilter(), ...(dateParts.length ? [and(...dateParts)] : []),
        reportBranchCond(customers.branchId, filters),
        filters.areaId ? eq(customers.areaId, filters.areaId) : undefined)));

  const totals = new Map<number, { sales: number; paid: number; remaining: number; invoices: number }>();
  for (const s of salesByCustomer) {
    if (!s.areaId) continue;
    const cur = totals.get(s.areaId) || { sales: 0, paid: 0, remaining: 0, invoices: 0 };
    cur.sales += num(s.total);
    cur.paid += num(s.paid);
    cur.remaining += num(s.remaining);
    cur.invoices += 1;
    totals.set(s.areaId, cur);
  }

  const custCounts = await db.select({ areaId: customers.areaId, count: sql<number>`count(*)` })
    .from(customers).where(tenantWhere(customers, filters.tenantId, eq(customers.isActive, true)))
    .groupBy(customers.areaId);
  const custMap = new Map(custCounts.map((c) => [c.areaId!, Number(c.count)]));

  return areaRows.map((a) => {
    const t = totals.get(a.id) || { sales: 0, paid: 0, remaining: 0, invoices: 0 };
    return {
      areaName: a.name,
      description: a.description || "",
      customersCount: custMap.get(a.id) || 0,
      invoicesCount: t.invoices,
      salesTotal: t.sales,
      salesPaid: t.paid,
      salesRemaining: t.remaining,
      isActive: a.isActive ? "نعم" : "لا",
    };
  });
}

function repCustomerFilter(filters: ReportFilters) {
  if (!filters.repId) return undefined;
  return sql`(
    ${customers.salesRepId} = ${filters.repId}
    OR EXISTS (
      SELECT 1 FROM customer_sales_reps csr
      WHERE csr.customerId = ${customers.id}
        AND csr.tenantId = ${filters.tenantId}
        AND csr.salesRepId = ${filters.repId}
    )
  )`;
}

function repInvoiceFilter(filters: ReportFilters) {
  if (!filters.repId) return undefined;
  return sql`(
    ${salesInvoices.salesRepId} = ${filters.repId}
    OR ${customers.salesRepId} = ${filters.repId}
    OR EXISTS (
      SELECT 1 FROM customer_sales_reps csr
      WHERE csr.customerId = ${customers.id}
        AND csr.tenantId = ${filters.tenantId}
        AND csr.salesRepId = ${filters.repId}
    )
  )`;
}

export async function repSalesByItemsReport(db: Db, filters: ReportFilters) {
  const dateParts = dateConds(salesInvoices, filters.dateFrom, filters.dateTo);
  const rows = await db.select({
    repName: salesReps.name,
    itemCode: items.code,
    itemName: items.name,
    quantity: salesInvoiceItems.quantity,
    total: salesInvoiceItems.total,
    purchasePrice: items.purchasePrice,
    commissionRate: sql<string>`COALESCE(${customerSalesReps.commissionRate}, ${salesReps.commissionRate})`,
  }).from(salesInvoiceItems)
    .innerJoin(salesInvoices, eq(salesInvoiceItems.invoiceId, salesInvoices.id))
    .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
    .innerJoin(customerSalesReps, and(
      eq(customerSalesReps.customerId, customers.id),
      eq(customerSalesReps.tenantId, filters.tenantId),
    ))
    .leftJoin(salesReps, eq(customerSalesReps.salesRepId, salesReps.id))
    .leftJoin(items, eq(salesInvoiceItems.itemId, items.id))
    .where(tenantWhere(salesInvoiceItems, filters.tenantId,
      and(salesPostedFilter(), ...(dateParts.length ? [and(...dateParts)] : []),
        filters.repId ? eq(customerSalesReps.salesRepId, filters.repId) : undefined,
        reportBranchCond(salesInvoices.branchId, filters),
        reportWarehouseCond(salesInvoices.warehouseId, filters),
        filters.itemId ? eq(salesInvoiceItems.itemId, filters.itemId) : undefined,
        filters.categoryId ? eq(items.categoryId, filters.categoryId) : undefined)));

  const map = new Map<string, { repName: string; itemCode: string; itemName: string; quantity: number; total: number; profit: number; commissionRate: number }>();
  for (const r of rows) {
    if (!r.repName) continue;
    const key = `${r.repName}-${r.itemCode || r.itemName}`;
    const cur = map.get(key) || {
      repName: r.repName,
      itemCode: r.itemCode || "",
      itemName: r.itemName || "",
      quantity: 0,
      total: 0,
      profit: 0,
      commissionRate: num(r.commissionRate),
    };
    cur.quantity += num(r.quantity);
    cur.total += num(r.total);
    cur.profit += num(r.total) - num(r.purchasePrice) * num(r.quantity);
    map.set(key, cur);
  }
  return Array.from(map.values()).map((v) => ({
    ...v,
    commission: v.total * v.commissionRate / 100,
  }));
}

export async function repCollectingsReport(db: Db, filters: ReportFilters) {
  type Raw = {
    date: string | Date | null;
    number: string | null;
    amount: string | null;
    customerName: string | null;
    repName: string | null;
    commissionRate: string | null;
    description: string | null;
    channel: string | null;
    sign: number;
  };

  const mapRow = (r: Raw) => {
    const amount = num(r.amount) * r.sign;
    const commissionRate = num(r.commissionRate);
    return {
      date: dateOnly(r.date),
      documentNumber: r.number || "—",
      repName: r.repName || "",
      customerName: r.customerName || "",
      amount,
      commissionRate,
      commission: amount * commissionRate / 100,
      channel: r.channel || "",
      description: r.description || "",
    };
  };

  const cashDate = dateConds(cashTransactions, filters.dateFrom, filters.dateTo);
  const cashRows = await db.select({
    date: cashTransactions.date,
    number: cashTransactions.number,
    amount: cashTransactions.amount,
    customerName: customers.name,
    repName: salesReps.name,
    commissionRate: sql<string>`COALESCE(${customerSalesReps.commissionRate}, ${salesReps.commissionRate})`,
    description: cashTransactions.description,
    type: cashTransactions.type,
  }).from(cashTransactions)
    .innerJoin(customers, eq(cashTransactions.customerId, customers.id))
    .innerJoin(customerSalesReps, and(
      eq(customerSalesReps.customerId, customers.id),
      eq(customerSalesReps.tenantId, filters.tenantId),
    ))
    .leftJoin(salesReps, eq(customerSalesReps.salesRepId, salesReps.id))
    .where(tenantWhere(cashTransactions, filters.tenantId,
      and(
        inArray(cashTransactions.type, ["receive_customer", "pay_customer"]),
        ...(cashDate.length ? [and(...cashDate)] : []),
        filters.repId ? eq(customerSalesReps.salesRepId, filters.repId) : undefined,
      )));

  const bankDate = dateConds(bankTransactions, filters.dateFrom, filters.dateTo);
  const bankRows = await db.select({
    date: bankTransactions.date,
    number: bankTransactions.number,
    amount: bankTransactions.amount,
    customerName: customers.name,
    repName: salesReps.name,
    commissionRate: sql<string>`COALESCE(${customerSalesReps.commissionRate}, ${salesReps.commissionRate})`,
    description: bankTransactions.description,
    type: bankTransactions.type,
  }).from(bankTransactions)
    .innerJoin(customers, eq(bankTransactions.customerId, customers.id))
    .innerJoin(customerSalesReps, and(
      eq(customerSalesReps.customerId, customers.id),
      eq(customerSalesReps.tenantId, filters.tenantId),
    ))
    .leftJoin(salesReps, eq(customerSalesReps.salesRepId, salesReps.id))
    .where(tenantWhere(bankTransactions, filters.tenantId,
      and(
        inArray(bankTransactions.type, ["deposit_customer", "withdraw_customer"]),
        ...(bankDate.length ? [and(...bankDate)] : []),
        filters.repId ? eq(customerSalesReps.salesRepId, filters.repId) : undefined,
      )));

  /** شيك وارد محصّل (cleared) فقط — المرتد قبل التحصيل لا يُحتسب أصلاً */
  const checkDate = dateConds(checks, filters.dateFrom, filters.dateTo);
  const checkRows = await db.select({
    date: checks.date,
    number: checks.checkNumber,
    amount: checks.amount,
    customerName: customers.name,
    repName: salesReps.name,
    commissionRate: sql<string>`COALESCE(${customerSalesReps.commissionRate}, ${salesReps.commissionRate})`,
    description: checks.description,
  }).from(checks)
    .innerJoin(customers, eq(checks.customerId, customers.id))
    .innerJoin(customerSalesReps, and(
      eq(customerSalesReps.customerId, customers.id),
      eq(customerSalesReps.tenantId, filters.tenantId),
    ))
    .leftJoin(salesReps, eq(customerSalesReps.salesRepId, salesReps.id))
    .where(tenantWhere(checks, filters.tenantId,
      and(
        eq(checks.type, "incoming"),
        eq(checks.status, "cleared"),
        ...(checkDate.length ? [and(...checkDate)] : []),
        filters.repId ? eq(customerSalesReps.salesRepId, filters.repId) : undefined,
      )));

  const mapped = [
    ...cashRows.map((r) => mapRow({
      ...r,
      channel: r.type === "pay_customer" ? "رد نقدي للعميل" : "نقدية",
      sign: r.type === "pay_customer" ? -1 : 1,
    })),
    ...bankRows.map((r) => mapRow({
      ...r,
      channel: r.type === "withdraw_customer" ? "رد بنكي للعميل" : "بنك",
      sign: r.type === "withdraw_customer" ? -1 : 1,
    })),
    ...checkRows.map((r) => mapRow({
      ...r,
      number: r.number,
      channel: "شيك محصّل",
      sign: 1,
      description: r.description || "تحصيل بشيك",
    })),
  ];

  return mapped.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export async function repDailyReport(db: Db, filters: ReportFilters) {
  const collections = await repCollectingsReport(db, filters);
  const dateParts = dateConds(salesInvoices, filters.dateFrom, filters.dateTo);
  const salesRows = await db.select({
    date: salesInvoices.date,
    repName: salesReps.name,
    total: salesInvoices.total,
    paid: salesInvoices.paid,
  }).from(salesInvoices)
    .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
    .leftJoin(salesReps, sql`COALESCE(${salesInvoices.salesRepId}, ${customers.salesRepId}) = ${salesReps.id}`)
    .where(tenantWhere(salesInvoices, filters.tenantId,
      and(salesPostedFilter(), ...(dateParts.length ? [and(...dateParts)] : []),
        repInvoiceFilter(filters),
        reportBranchCond(salesInvoices.branchId, filters))));

  type DayAgg = {
    date: string;
    repName: string;
    salesTotal: number;
    salesPaid: number;
    invoicesCount: number;
    totalCollected: number;
    collectionsCount: number;
  };
  const map = new Map<string, DayAgg>();
  for (const r of salesRows) {
    const repName = r.repName || "بدون مندوب";
    const date = dateOnly(r.date);
    const key = `${date}-${repName}`;
    const cur = map.get(key) || {
      date, repName, salesTotal: 0, salesPaid: 0, invoicesCount: 0, totalCollected: 0, collectionsCount: 0,
    };
    cur.salesTotal += num(r.total);
    cur.salesPaid += num(r.paid);
    cur.invoicesCount += 1;
    map.set(key, cur);
  }
  for (const r of collections) {
    const key = `${r.date}-${r.repName || "بدون مندوب"}`;
    const cur = map.get(key) || {
      date: String(r.date),
      repName: String(r.repName || "بدون مندوب"),
      salesTotal: 0,
      salesPaid: 0,
      invoicesCount: 0,
      totalCollected: 0,
      collectionsCount: 0,
    };
    cur.totalCollected += num(r.amount);
    cur.collectionsCount += 1;
    map.set(key, cur);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date) || a.repName.localeCompare(b.repName));
}

export async function repDebitReport(db: Db, filters: ReportFilters) {
  const rows = await db.select({
    customerName: customers.name,
    phone: customers.phone,
    balance: customers.balance,
    creditLimit: customers.creditLimit,
    repName: salesReps.name,
  }).from(customers)
    .leftJoin(salesReps, eq(customers.salesRepId, salesReps.id))
    .where(tenantWhere(customers, filters.tenantId,
      and(sql`${customers.balance} > 0`, repCustomerFilter(filters))))
    .orderBy(customers.name);

  return rows.map((r) => ({
    repName: r.repName || "",
    customerName: r.customerName,
    phone: r.phone || "",
    balance: num(r.balance),
    creditLimit: num(r.creditLimit),
  }));
}

export async function subLedgerReport(db: Db, filters: ReportFilters) {
  const parentAccounts = await db.select({ id: accounts.id }).from(accounts)
    .where(tenantWhere(accounts, filters.tenantId, eq(accounts.isParent, true)));
  const parentIds = new Set(parentAccounts.map((a) => a.id));
  const lines = await loadPostedJournalLines(db, filters);
  if (!parentIds.size) return lines;
  const raw = await db.select({ accountId: journalEntryLines.accountId, accountCode: accounts.code })
    .from(journalEntryLines)
    .innerJoin(accounts, eq(journalEntryLines.accountId, accounts.id))
    .where(tenantWhere(journalEntryLines, filters.tenantId));
  const leafCodes = new Set(raw.filter((r) => !parentIds.has(r.accountId)).map((r) => r.accountCode));
  return lines.filter((l) => leafCodes.has(String(l.accountCode)));
}

function isCashLikeAccount(code: string, name: string) {
  const n = name.toLowerCase();
  return n.includes("نقد") || n.includes("خزينة") || n.includes("cash") || n.includes("بنك") || n.includes("bank") || /^11/.test(code) || /^12/.test(code);
}

export async function cashAccountStatementReport(db: Db, filters: ReportFilters) {
  if (filters.accountId) {
    return loadPostedJournalLines(db, filters);
  }
  const accountRows = await db.select({ id: accounts.id, code: accounts.code, name: accounts.name }).from(accounts)
    .where(tenantWhere(accounts, filters.tenantId, eq(accounts.isActive, true), eq(accounts.isParent, false)));
  const cashIds = accountRows.filter((a) => isCashLikeAccount(a.code, a.name)).map((a) => a.id);
  if (!cashIds.length) return paymentsReport(db, filters);

  const lines: Awaited<ReturnType<typeof loadPostedJournalLines>> = [];
  for (const id of cashIds) {
    const part = await loadPostedJournalLines(db, { ...filters, accountId: id });
    lines.push(...part);
  }
  return lines.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.documentNumber).localeCompare(String(b.documentNumber)));
}

export async function paymentsReport(db: Db, filters: ReportFilters) {
  const cashDate = dateConds(cashTransactions, filters.dateFrom, filters.dateTo);
  const bankDate = dateConds(bankTransactions, filters.dateFrom, filters.dateTo);
  const cashRows = await db.select({
    date: cashTransactions.date,
    type: cashTransactions.type,
    amount: cashTransactions.amount,
    description: cashTransactions.description,
    number: cashTransactions.number,
    customerName: customers.name,
    supplierName: suppliers.name,
  }).from(cashTransactions)
    .leftJoin(customers, eq(cashTransactions.customerId, customers.id))
    .leftJoin(suppliers, eq(cashTransactions.supplierId, suppliers.id))
    .where(tenantWhere(cashTransactions, filters.tenantId,
      ...(cashDate.length ? [and(...cashDate)] : []),
      filters.customerId ? eq(cashTransactions.customerId, filters.customerId) : undefined,
      filters.supplierId ? eq(cashTransactions.supplierId, filters.supplierId) : undefined,
      paymentCustomerBranchCond(filters),
      filters.search
        ? sql`(${cashTransactions.number} LIKE ${`%${filters.search}%`} OR ${customers.name} LIKE ${`%${filters.search}%`} OR ${suppliers.name} LIKE ${`%${filters.search}%`} OR ${cashTransactions.description} LIKE ${`%${filters.search}%`})`
        : undefined))
    .orderBy(desc(cashTransactions.date));
  const bankRows = await db.select({
    date: bankTransactions.date,
    type: bankTransactions.type,
    amount: bankTransactions.amount,
    description: bankTransactions.description,
    number: bankTransactions.number,
    reference: bankTransactions.reference,
    customerName: customers.name,
    supplierName: suppliers.name,
  }).from(bankTransactions)
    .leftJoin(customers, eq(bankTransactions.customerId, customers.id))
    .leftJoin(suppliers, eq(bankTransactions.supplierId, suppliers.id))
    .where(tenantWhere(bankTransactions, filters.tenantId,
      ...(bankDate.length ? [and(...bankDate)] : []),
      filters.customerId ? eq(bankTransactions.customerId, filters.customerId) : undefined,
      filters.supplierId ? eq(bankTransactions.supplierId, filters.supplierId) : undefined,
      paymentCustomerBranchCond(filters),
      filters.search
        ? sql`(${bankTransactions.number} LIKE ${`%${filters.search}%`} OR ${customers.name} LIKE ${`%${filters.search}%`} OR ${suppliers.name} LIKE ${`%${filters.search}%`} OR ${bankTransactions.description} LIKE ${`%${filters.search}%`})`
        : undefined))
    .orderBy(desc(bankTransactions.date));

  const directionLabel = (t: string) => {
    const map: Record<string, string> = {
      receive: "قبض",
      pay: "صرف",
      receive_customer: "تحصيل عميل",
      pay_customer: "رد للعميل",
      pay_supplier: "دفع مورد",
      deposit: "إيداع",
      withdraw: "سحب",
      deposit_customer: "إيداع عميل",
      withdraw_customer: "رد بنكي للعميل",
      withdraw_supplier: "سحب لمورد",
    };
    return map[t] || t;
  };

  const result: Record<string, unknown>[] = [];
  for (const c of cashRows) {
    result.push({
      date: dateOnly(c.date),
      type: "نقدية",
      direction: directionLabel(String(c.type)),
      partyName: c.customerName || c.supplierName || "",
      amount: num(c.amount),
      description: c.description || "",
      reference: c.number || "",
    });
  }
  for (const b of bankRows) {
    result.push({
      date: dateOnly(b.date),
      type: "بنكية",
      direction: directionLabel(String(b.type)),
      partyName: b.customerName || b.supplierName || "",
      amount: num(b.amount),
      description: b.description || "",
      reference: b.reference || b.number || "",
    });
  }
  return result.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export async function balanceSheetFromAccounts(db: Db, tenantId: number, asOf?: string) {
  const balanced = await getAccountBalancesAsOf(db, tenantId, asOf);
  return {
    assets: balanced.filter((a) => a.type === "asset" && !a.isParent).map((a) => ({ code: a.code, name: a.name, balance: num(a.balance) })),
    liabilities: balanced.filter((a) => a.type === "liability" && !a.isParent).map((a) => ({ code: a.code, name: a.name, balance: Math.abs(num(a.balance)) })),
    equity: balanced.filter((a) => a.type === "equity" && !a.isParent).map((a) => ({ code: a.code, name: a.name, balance: num(a.balance) })),
  };
}

export async function incomeStatementFromData(db: Db, filters: ReportFilters) {
  const periodMovement = await getPostedMovementByAccount(db, filters.tenantId, {
    from: filters.dateFrom,
    to: filters.dateTo,
  });
  const accountsRows = await db.select().from(accounts).where(tenantWhere(accounts, filters.tenantId, eq(accounts.isActive, true)));
  let revenue = 0;
  let operatingExpenses = 0;
  let cost = 0;

  const isCogsAccount = (a: { code: string; name: string }) => {
    const n = String(a.name).toLowerCase();
    return a.code.startsWith("510") || n.includes("تكلفة المبيعات") || n.includes("cogs");
  };

  for (const a of accountsRows) {
    if (a.isParent) continue;
    const m = periodMovement.get(a.id) || { debit: 0, credit: 0 };
    if (a.type === "revenue") revenue += m.credit - m.debit;
    else if (a.type === "expense" && isCogsAccount(a)) cost += m.debit - m.credit;
    else if (a.type === "expense") operatingExpenses += m.debit - m.credit;
  }

  if (!revenue && !cost && !operatingExpenses) {
    const sales = await salesInvoicesReport(db, filters);
    const purchases = await purchasesInvoicesReport(db, filters);
    revenue = sales.reduce((s, r) => s + num(r.total), 0);
    cost = purchases.reduce((s, r) => s + num(r.total), 0);
    operatingExpenses = accountsRows
      .filter((a) => a.type === "expense" && !isCogsAccount(a))
      .reduce((s, a) => s + num(a.balance), 0);
  }

  const grossProfit = revenue - cost;
  const netProfit = grossProfit - operatingExpenses;
  return { revenue, cost, grossProfit, expenses: operatingExpenses, netProfit };
}
