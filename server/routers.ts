import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  customers, suppliers, items, itemCategories, warehouses,
  contactCategories, purchaseInvoices, salesInvoices, employees,
  departments, jobTitles, accounts, cashTransactions, bankTransactions,
  bankAccounts, checks, journalEntries, journalEntryLines,
  purchaseInvoiceItems, salesInvoiceItems, purchaseOrders, salesOrders,
  purchaseInvoiceItemBatches, salesInvoiceItemBatches,
  purchaseInvoiceTaxes, salesInvoiceTaxes,
  purchaseInvoiceExpenses, salesInvoiceExpenses,
  purchaseOrderItems, salesOrderItems, purchaseReturns, salesReturns,
  purchaseReturnItems, salesReturnItems, attendance, payroll, salaryAdvances,
  fixedAssets, costCenters, loans, installments, notifications,
  inventoryAdjustments, inventoryAdjustmentItems, stockTransfers, stockTransferItems,
  productionOrders, productionOrderMaterials, itemBomLines, itemWarehouseStock,
  taxes, salesReps, branches, companySettings, users,
  appUsers, subscriptions, subscriptionPlans,
  discountCoupons, companyProfile, supportTickets, userNotifications,
  paymobSettings, subscriptionPayments, tenants, userActivities
} from "../drizzle/schema";
import { listCustomerSalesReps, setCustomerSalesReps, listCustomerSalesRepsForCustomers } from "./customer-sales-reps";
import {
  signSaasToken, verifySaasToken, hashPassword, verifyPassword,
  getAppUserByEmail, getAppUserById, getUserActiveSubscription, isSubscriptionActive,
  getAccountOwnerId, countAccountUsers, canManageTeamUsers,
  requireSuperAdminFromRequest, SESSION_MAX_AGE_MS, getSaasTokenFromRequest,
  SAAS_COOKIE_NAME
} from "./saas-auth";
import { assertRateLimit, clientIp, RateLimitError } from "./rate-limit";
import { eq, desc, count, sum, and, like, or, sql, gte, lte, lt, isNull, inArray } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { tenantWhere, withTenantId } from "./tenant-scope";
import { getTenantOwnerUserId } from "./tenant";
import { assertUniqueEntityCode, resolveTypedEntityCode, partySearchCondition, codeSearchCondition } from "./entity-codes";
import { compactRow, dbErrorMessage } from "./db-utils";
import {
  loadUserScope,
  loadUserScopeFromCtx,
  userScopeFromRow,
  scopeBranchFilter,
  scopeWarehouseFilter,
  scopeIdsFilter,
  scopeEitherWarehouseFilter,
  assertBranchAccess,
  assertWarehouseAccess,
  assertEntityBranchAccess,
  applyScopeToReportFilters,
  scopeContactTransactionFilter,
} from "./user-scope";
import { calculateMonthPayroll, payMonthPayroll } from "./hr-payroll";
import {
  postCashTransactionJournal,
  postBankTransactionJournal,
  postPayrollJournal,
  postPurchaseInvoiceJournal,
  postSalesInvoiceJournal,
  postSalesReturnJournal,
  postPurchaseReturnJournal,
  postSalesCogsJournal,
  postSalesReturnCogsJournal,
  postLoanOriginJournal,
  postLoanInstallmentPayJournal,
} from "./auto-journal";
import { getDebtAgingSummary } from "./debt-aging";
import {
  buildSubscriptionBanner,
  effectiveSubscriptionStatus,
  normalizeSubscriptionStatusForSave,
  toDateOnly,
  todayDateOnly,
} from "./subscription-display";
import { activateSubscriptionPayment } from "./paymob-subscription";
import { assistantRouter } from "./assistant-router";
import { permissionsRouter } from "./permissions-router";
import { assertEntityAction } from "./entity-permission-service";
import type { PermActionKey } from "../shared/permission-tree";
import { importCostingRouter } from "./import-costing-router";
import { accountingAuditorRouter } from "./accounting-auditor-router";
import { documentAttachmentsRouter } from "./document-attachments-router";
import { opsInboxRouter } from "./ops-inbox-router";
import { megaReportImportRouter } from "./mega-report-import-router";
import {
  collectInventoryMovements,
  toMegaItemMovementDetailRows,
  computeItemMovementOpenings,
  inventoryStocktakeReport,
  stagnantItemsReport,
  itemAgingReport,
  warehouseInOutReport,
  toMegaWarehouseMovementRows,
  itemMovementSummaryReport,
  itemInOutReport,
  itemCostsReport,
  itemsListReport,
} from "./inventory-reports";
import { runAccountingReport } from "./accounting-reports";
import { purchasesInvoicesDetailedReport, salesInvoicesDetailedReport } from "./accounting-data";
import { runFinalReport } from "./final-reports";
import { runHrReport } from "./hr-reports";
import { runAssetsReport } from "./assets-reports";
import {
  settingsExtendedRouter,
  hrExtendedRouter,
  inventoryExtendedRouter,
  assetsExtendedRouter,
  salesExtendedRouter,
} from "./parity-routers";
import { getOperationalAlerts } from "./operational-alerts";
import { recordPurchaseInvoicePayment, recordSalesInvoicePayment } from "./invoice-payments";
import { buildCustomerMovements, buildSupplierMovements, finalizeLedger } from "./statement-ledger";
import { syncOperationalNotifications } from "./sync-operational-notifications";
import { reconcileAllContactBalances, recalculateCustomerBalance, recalculateSupplierBalance } from "./contact-balances";
import { sendOperationalAlertDigest } from "./alert-email";
import { assertDateNotInClosedPeriod } from "./fiscal-period-guard";
import { allocateCustomerPaymentFifo, allocateSupplierPaymentFifo } from "./payment-allocation";
import { assertCustomerCreditLimit } from "./credit-limit-guard";
import { bounceCheck, clearCheck, createCheckWithJournal, unapproveCheck } from "./check-actions";
import {
  assignCustody,
  collectRoutedCheck,
  depositRoutedCheck,
  listCheckRoutings,
  listRoutingEvents,
  rejectRoutedCheck,
  routeCheck,
  routingSummaryCounts,
} from "./check-routing";

/** drizzle/mysql2 يرجّع أعمدة date() ككائن Date حقيقي — String(x).slice(0,10) بيفقد السنة */
function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v || "").slice(0, 10);
}

// ===================== DASHBOARD =====================
const dashboardRouter = router({
  stats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [customersCount] = await db.select({ count: count() }).from(customers).where(tenantWhere(customers, ctx.tenantId));
    const [suppliersCount] = await db.select({ count: count() }).from(suppliers).where(tenantWhere(suppliers, ctx.tenantId));
    const [itemsCount] = await db.select({ count: count() }).from(items).where(tenantWhere(items, ctx.tenantId));
    const [employeesCount] = await db.select({ count: count() }).from(employees).where(tenantWhere(employees, ctx.tenantId, eq(employees.status, "active")));

    const [totalSales] = await db.select({ total: sum(salesInvoices.total) }).from(salesInvoices)
      .where(tenantWhere(salesInvoices, ctx.tenantId, inArray(salesInvoices.status, ["confirmed", "paid", "partial"])));
    const [totalPurchases] = await db.select({ total: sum(purchaseInvoices.total) }).from(purchaseInvoices)
      .where(tenantWhere(purchaseInvoices, ctx.tenantId, inArray(purchaseInvoices.status, ["confirmed", "paid", "partial"])));

    const [unpaidInvoices] = await db.select({ count: count() }).from(salesInvoices)
      .where(tenantWhere(salesInvoices, ctx.tenantId, or(eq(salesInvoices.status, "confirmed"), eq(salesInvoices.status, "partial"))));
    const [pendingChecks] = await db.select({ count: count() }).from(checks)
      .where(tenantWhere(checks, ctx.tenantId, eq(checks.status, "pending")));

    const recentSales = await db.select({
      id: salesInvoices.id,
      number: salesInvoices.number,
      total: salesInvoices.total,
      status: salesInvoices.status,
      customerName: customers.name,
    }).from(salesInvoices)
      .where(tenantWhere(salesInvoices, ctx.tenantId))
      .leftJoin(customers, eq(salesInvoices.customerId, customers.id))
      .orderBy(desc(salesInvoices.createdAt))
      .limit(5);

    const recentPurchases = await db.select({
      id: purchaseInvoices.id,
      number: purchaseInvoices.number,
      total: purchaseInvoices.total,
      status: purchaseInvoices.status,
      supplierName: suppliers.name,
    }).from(purchaseInvoices)
      .where(tenantWhere(purchaseInvoices, ctx.tenantId))
      .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
      .orderBy(desc(purchaseInvoices.createdAt))
      .limit(5);

    return {
      customersCount: customersCount.count,
      suppliersCount: suppliersCount.count,
      itemsCount: itemsCount.count,
      employeesCount: employeesCount.count,
      totalSales: totalSales.total ?? 0,
      totalPurchases: totalPurchases.total ?? 0,
      unpaidInvoices: unpaidInvoices.count,
      pendingChecks: pendingChecks.count,
      recentSales,
      recentPurchases,
    };
  }),
  monthlyCharts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // Get last 6 months data
    const months: { month: string; label: string }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
      months.push({ month: `${y}-${m}`, label: MONTHS_AR[d.getMonth()] });
    }

    const salesByMonth = await db.select({
      month: sql<string>`DATE_FORMAT(${salesInvoices.createdAt}, '%Y-%m')`,
      total: sum(salesInvoices.total),
    }).from(salesInvoices)
      .where(tenantWhere(salesInvoices, ctx.tenantId, and(
        eq(salesInvoices.status, "confirmed"),
        gte(salesInvoices.createdAt, new Date(now.getFullYear(), now.getMonth() - 5, 1))
      )))
      .groupBy(sql`DATE_FORMAT(${salesInvoices.createdAt}, '%Y-%m')`);

    const purchasesByMonth = await db.select({
      month: sql<string>`DATE_FORMAT(${purchaseInvoices.createdAt}, '%Y-%m')`,
      total: sum(purchaseInvoices.total),
    }).from(purchaseInvoices)
      .where(tenantWhere(purchaseInvoices, ctx.tenantId, and(
        eq(purchaseInvoices.status, "confirmed"),
        gte(purchaseInvoices.createdAt, new Date(now.getFullYear(), now.getMonth() - 5, 1))
      )))
      .groupBy(sql`DATE_FORMAT(${purchaseInvoices.createdAt}, '%Y-%m')`);

    // Invoice status distribution
    const [paidCount] = await db.select({ count: count() }).from(salesInvoices).where(tenantWhere(salesInvoices, ctx.tenantId, eq(salesInvoices.status, "paid")));
    const [unpaidCount] = await db.select({ count: count() }).from(salesInvoices).where(tenantWhere(salesInvoices, ctx.tenantId, or(eq(salesInvoices.status, "confirmed"), eq(salesInvoices.status, "partial"))));
    const [draftCount] = await db.select({ count: count() }).from(salesInvoices).where(tenantWhere(salesInvoices, ctx.tenantId, eq(salesInvoices.status, "draft")));

    const salesMap = Object.fromEntries(salesByMonth.map(r => [r.month, Number(r.total) || 0]));
    const purchasesMap = Object.fromEntries(purchasesByMonth.map(r => [r.month, Number(r.total) || 0]));

    const chartData = months.map(({ month, label }) => ({
      month: label,
      sales: salesMap[month] || 0,
      purchases: purchasesMap[month] || 0,
      profit: (salesMap[month] || 0) - (purchasesMap[month] || 0),
    }));

    return {
      chartData,
      invoiceStatus: {
        paid: paidCount.count,
        unpaid: unpaidCount.count,
        draft: draftCount.count,
      },
    };
  }),
  alerts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return getOperationalAlerts(db, ctx.tenantId);
  }),
  debtAging: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return getDebtAgingSummary(db, ctx.tenantId);
  }),
  /** أكثر 5 أصناف مبيعاً بالقيمة — الشهر الحالي، من فواتير مرحّلة فقط */
  topProducts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const rows = await db.select({
      itemId: salesInvoiceItems.itemId,
      itemName: items.name,
      itemCode: items.code,
      qty: sum(salesInvoiceItems.quantity),
      value: sum(salesInvoiceItems.total),
    }).from(salesInvoiceItems)
      .innerJoin(salesInvoices, eq(salesInvoiceItems.invoiceId, salesInvoices.id))
      .innerJoin(items, eq(salesInvoiceItems.itemId, items.id))
      .where(tenantWhere(salesInvoiceItems, ctx.tenantId, and(
        inArray(salesInvoices.status, ["confirmed", "paid", "partial"]),
        gte(salesInvoices.createdAt, monthStart),
      )))
      .groupBy(salesInvoiceItems.itemId, items.name, items.code)
      .orderBy(desc(sum(salesInvoiceItems.total)))
      .limit(5);
    return rows.map((r) => ({
      itemId: r.itemId,
      name: r.itemName,
      code: r.itemCode,
      qty: Number(r.qty) || 0,
      value: Number(r.value) || 0,
    }));
  }),
  /** آخر حركات المستخدمين — سجل نشاط عام للوحة التحكم */
  recentActivity: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const rows = await db.select({
      id: userActivities.id,
      userName: userActivities.userName,
      action: userActivities.action,
      details: userActivities.details,
      createdAt: userActivities.createdAt,
    }).from(userActivities)
      .where(tenantWhere(userActivities, ctx.tenantId))
      .orderBy(desc(userActivities.createdAt))
      .limit(6);
    return rows;
  }),
});

// ===================== CUSTOMERS =====================
/** Shared contact fields synced between linked customer ↔ supplier (Mega Cash dual-role). */
function contactSharedFields(input: {
  name: string;
  categoryId?: number | null;
  phone?: string | null;
  phone2?: string | null;
  fax?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  taxNumber?: string | null;
  commercialRegister?: string | null;
  contactPerson?: string | null;
  paymentTermDays?: number | null;
  discountPercent?: string | null;
  mapUrl?: string | null;
  notes?: string | null;
  isActive?: boolean;
}) {
  return compactRow({
    name: input.name,
    categoryId: input.categoryId ?? undefined,
    phone: input.phone ?? undefined,
    phone2: input.phone2 ?? undefined,
    fax: input.fax ?? undefined,
    email: input.email ?? undefined,
    address: input.address ?? undefined,
    city: input.city ?? undefined,
    taxNumber: input.taxNumber ?? undefined,
    commercialRegister: input.commercialRegister ?? undefined,
    contactPerson: input.contactPerson ?? undefined,
    paymentTermDays: input.paymentTermDays ?? undefined,
    discountPercent: input.discountPercent ?? undefined,
    mapUrl: input.mapUrl ?? undefined,
    notes: input.notes ?? undefined,
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  });
}

const optionalNum = (v: unknown) => (v === "" || v == null || Number.isNaN(v) ? undefined : v);
const contactPartyFields = {
  categoryId: z.preprocess(optionalNum, z.number().optional()),
  phone: z.string().optional(),
  phone2: z.string().optional(),
  fax: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  taxNumber: z.string().optional(),
  commercialRegister: z.string().optional(),
  contactPerson: z.string().optional(),
  paymentTermDays: z.preprocess(optionalNum, z.number().int().optional()),
  discountPercent: z.string().optional(),
  openingBalance: z.string().optional(),
  openingBalanceDate: z.string().optional(),
  creditLimit: z.string().optional(),
  mapUrl: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
};

const customersRouter = router({
  list: protectedProcedure.input(z.object({
    search: z.string().optional(),
    page: z.number().default(1),
    limit: z.number().default(20),
    branchId: z.number().optional(),
  })).query(async ({ ctx, input }) => {
    // ملحوظة: مش بنقيّد هنا بـ viewDocList — الإندبوينت ده مشترك كمصدر بيانات (اختيار
    // عميل) لفواتير البيع والمعاملات في شاشات تانية كتير، مش بس شاشة إدارة العملاء.
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
    const offset = (input.page - 1) * input.limit;
    const where = and(
      input.search
        ? partySearchCondition(
          { name: customers.name, phone: customers.phone, phone2: customers.phone2, code: customers.code },
          input.search,
        )
        : undefined,
      input.branchId != null ? eq(customers.branchId, input.branchId) : scopeBranchFilter(customers, scope),
    );
    const rows = await db.select().from(customers).where(tenantWhere(customers, ctx.tenantId, where)).orderBy(desc(customers.createdAt)).limit(input.limit).offset(offset);
    const [total] = await db.select({ count: count() }).from(customers).where(tenantWhere(customers, ctx.tenantId, where));
    const repsMap = await listCustomerSalesRepsForCustomers(db, ctx.tenantId!, rows.map((r) => r.id));
    return {
      rows: rows.map((r) => ({
        ...r,
        salesReps: repsMap.get(r.id) || [],
        salesRepNames: (repsMap.get(r.id) || []).map((x) => x.repName).filter(Boolean).join("، "),
      })),
      total: total.count,
    };
  }),
  byId: protectedProcedure.input(z.number()).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
    const [row] = await db.select().from(customers).where(tenantWhere(customers, ctx.tenantId, eq(customers.id, input)));
    if (row) assertEntityBranchAccess(scope, row.branchId);
    if (!row) return row;
    const salesRepsList = await listCustomerSalesReps(db, ctx.tenantId!, row.id);
    return { ...row, salesReps: salesRepsList };
  }),
  create: protectedProcedure.input(z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    ...contactPartyFields,
    salesRepId: z.preprocess(optionalNum, z.number().optional()),
    branchId: z.preprocess(optionalNum, z.number().optional()),
    areaId: z.preprocess(optionalNum, z.number().optional()),
    salesReps: z.array(z.object({
      salesRepId: z.number(),
      commissionRate: z.string().optional().nullable(),
      isPrimary: z.boolean().optional(),
    })).optional(),
    /** Mega Cash: register the same party as a supplier too. */
    alsoAsSupplier: z.boolean().optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "contacts", "customer", "add");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
    assertBranchAccess(scope, input.branchId);
    if (scope.branchIds?.length && input.branchId == null) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "يجب اختيار فرع ضمن نطاقك" });
    }
    let code: string;
    try {
      code = await resolveTypedEntityCode(db, customers, ctx.tenantId!, "customer", input.code);
    } catch (e: unknown) {
      throw new TRPCError({ code: "CONFLICT", message: dbErrorMessage(e, "كود موجود مسبقاً") });
    }
    const primaryFromList = input.salesReps?.find((r) => r.isPrimary)?.salesRepId
      ?? input.salesReps?.[0]?.salesRepId
      ?? input.salesRepId;
    const row = compactRow({
      name: input.name,
      code,
      categoryId: input.categoryId,
      phone: input.phone,
      phone2: input.phone2,
      fax: input.fax,
      email: input.email,
      address: input.address,
      city: input.city,
      taxNumber: input.taxNumber,
      commercialRegister: input.commercialRegister,
      contactPerson: input.contactPerson,
      paymentTermDays: input.paymentTermDays,
      discountPercent: input.discountPercent,
      openingBalance: input.openingBalance,
      openingBalanceDate: input.openingBalanceDate,
      creditLimit: input.creditLimit,
      salesRepId: primaryFromList,
      branchId: input.branchId,
      areaId: input.areaId,
      mapUrl: input.mapUrl,
      notes: input.notes,
      isActive: input.isActive,
    });
    let customerId = 0;
    try {
      const [inserted] = await db.insert(customers).values(withTenantId(ctx.tenantId, row) as any);
      customerId = Number((inserted as { insertId?: number }).insertId ?? 0);
    } catch (e: unknown) {
      throw new TRPCError({ code: "BAD_REQUEST", message: dbErrorMessage(e, "فشل إضافة العميل") });
    }
    if (customerId) {
      await recalculateCustomerBalance(db, ctx.tenantId!, customerId);
      const repsPayload = input.salesReps?.length
        ? input.salesReps
        : (primaryFromList ? [{ salesRepId: primaryFromList, isPrimary: true }] : []);
      if (repsPayload.length) {
        await setCustomerSalesReps(db, ctx.tenantId!, customerId, repsPayload);
      }
    }
    let supplierCode: string | undefined;
    let linkedSupplierId: number | undefined;
    if (input.alsoAsSupplier && customerId) {
      try {
        supplierCode = await resolveTypedEntityCode(db, suppliers, ctx.tenantId!, "supplier", undefined);
        const supplierRow = contactSharedFields(input);
        const [supIns] = await db.insert(suppliers).values(withTenantId(ctx.tenantId, {
          ...supplierRow,
          code: supplierCode,
          linkedCustomerId: customerId,
        }) as any);
        linkedSupplierId = Number((supIns as { insertId?: number }).insertId ?? 0);
        if (linkedSupplierId) {
          await db.update(customers).set({ linkedSupplierId } as any)
            .where(tenantWhere(customers, ctx.tenantId, eq(customers.id, customerId)));
        }
      } catch (e: unknown) {
        throw new TRPCError({ code: "BAD_REQUEST", message: dbErrorMessage(e, "تم إنشاء العميل لكن فشل تسجيله كمورد") });
      }
    }
    return { success: true, code, id: customerId, supplierCode, linkedSupplierId };
  }),
  update: protectedProcedure.input(z.object({
    id: z.number(),
    name: z.string().min(1),
    code: z.string().optional(),
    categoryId: z.number().optional().nullable(),
    phone: z.string().optional(),
    phone2: z.string().optional(),
    fax: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    taxNumber: z.string().optional(),
    commercialRegister: z.string().optional(),
    contactPerson: z.string().optional(),
    paymentTermDays: z.number().int().optional().nullable(),
    discountPercent: z.string().optional(),
    openingBalance: z.string().optional(),
    openingBalanceDate: z.string().optional(),
    creditLimit: z.string().optional(),
    salesRepId: z.number().optional().nullable(),
    branchId: z.number().optional().nullable(),
    areaId: z.number().optional().nullable(),
    mapUrl: z.string().optional(),
    notes: z.string().optional(),
    isActive: z.boolean().optional(),
    salesReps: z.array(z.object({
      salesRepId: z.number(),
      commissionRate: z.string().optional().nullable(),
      isPrimary: z.boolean().optional(),
    })).optional(),
    /** If not yet linked, create a supplier twin (Mega Cash dual-role). */
    alsoAsSupplier: z.boolean().optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "contacts", "customer", "edit");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
    const [existing] = await db.select().from(customers)
      .where(tenantWhere(customers, ctx.tenantId, eq(customers.id, input.id)));
    if (existing) assertEntityBranchAccess(scope, existing.branchId);
    assertBranchAccess(scope, input.branchId ?? undefined);
    const { id, code: inputCode, alsoAsSupplier, salesReps: repsInput, ...rest } = input;
    let code = (inputCode || "").trim() || undefined;
    if (code) {
      try {
        await assertUniqueEntityCode(db, customers, ctx.tenantId!, code, id);
      } catch (e: unknown) {
        throw new TRPCError({ code: "CONFLICT", message: dbErrorMessage(e, "كود موجود مسبقاً") });
      }
    }
    const primaryFromList = repsInput?.find((r) => r.isPrimary)?.salesRepId
      ?? repsInput?.[0]?.salesRepId
      ?? rest.salesRepId;
    const row = compactRow({
      ...rest,
      ...(code != null ? { code } : {}),
      ...(repsInput !== undefined ? { salesRepId: primaryFromList ?? null } : {}),
    });
    try {
      await db.update(customers).set(row as any)
        .where(tenantWhere(customers, ctx.tenantId, eq(customers.id, id)));
    } catch (e: unknown) {
      throw new TRPCError({ code: "BAD_REQUEST", message: dbErrorMessage(e, "فشل تحديث العميل") });
    }
    if (repsInput !== undefined) {
      await setCustomerSalesReps(db, ctx.tenantId!, id, repsInput);
    }
    await recalculateCustomerBalance(db, ctx.tenantId!, id);

    let linkedSupplierId = existing?.linkedSupplierId ?? null;
    let supplierCode: string | undefined;
    if (alsoAsSupplier && !linkedSupplierId) {
      try {
        supplierCode = await resolveTypedEntityCode(db, suppliers, ctx.tenantId!, "supplier", undefined);
        const [supIns] = await db.insert(suppliers).values(withTenantId(ctx.tenantId, {
          ...contactSharedFields(input),
          code: supplierCode,
          linkedCustomerId: id,
        }) as any);
        linkedSupplierId = Number((supIns as { insertId?: number }).insertId ?? 0) || null;
        if (linkedSupplierId) {
          await db.update(customers).set({ linkedSupplierId } as any)
            .where(tenantWhere(customers, ctx.tenantId, eq(customers.id, id)));
        }
      } catch (e: unknown) {
        throw new TRPCError({ code: "BAD_REQUEST", message: dbErrorMessage(e, "فشل تسجيل العميل كمورد") });
      }
    } else if (linkedSupplierId) {
      await db.update(suppliers).set(contactSharedFields(input) as any)
        .where(tenantWhere(suppliers, ctx.tenantId, eq(suppliers.id, linkedSupplierId)));
    }
    return { success: true, linkedSupplierId: linkedSupplierId ?? undefined, supplierCode };
  }),
  delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "contacts", "customer", "deleteCancel");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [existing] = await db.select({ linkedSupplierId: customers.linkedSupplierId }).from(customers)
      .where(tenantWhere(customers, ctx.tenantId, eq(customers.id, input)));
    if (existing?.linkedSupplierId) {
      await db.update(suppliers).set({ linkedCustomerId: null } as any)
        .where(tenantWhere(suppliers, ctx.tenantId, eq(suppliers.id, existing.linkedSupplierId)));
    }
    await db.delete(customers).where(tenantWhere(customers, ctx.tenantId, eq(customers.id, input)));
    return { success: true };
  }),
  cleanImport: protectedProcedure.input(z.object({
    rows: z.array(z.object({
      code: z.string().optional(),
      name: z.string().min(1),
      phone: z.string().optional(),
      phone2: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      taxNumber: z.string().optional(),
      openingBalance: z.union([z.string(), z.number()]).optional(),
      openingBalanceDate: z.string().optional(),
      notes: z.string().optional(),
    })).min(1).max(5000),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "contacts", "customer", "add");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { cleanImportContacts } = await import("./contact-clean-import");
    return cleanImportContacts(db, ctx.tenantId!, "customer", input.rows);
  }),
});

// ===================== SUPPLIERS =====================
const suppliersRouter = router({
  list: protectedProcedure.input(z.object({
    search: z.string().optional(),
    page: z.number().default(1),
    limit: z.number().default(20),
    branchId: z.number().optional(),
  })).query(async ({ ctx, input }) => {
    // نفس ملحوظة العملاء: مصدر بيانات مشترك (اختيار مورد) لفواتير الشراء وشاشات تانية.
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
    const offset = (input.page - 1) * input.limit;
    const where = and(
      input.search
        ? partySearchCondition(
          { name: suppliers.name, phone: suppliers.phone, phone2: suppliers.phone2, code: suppliers.code },
          input.search,
        )
        : undefined,
      input.branchId != null ? eq(suppliers.branchId, input.branchId) : scopeBranchFilter(suppliers, scope),
    );
    const rows = await db.select().from(suppliers).where(tenantWhere(suppliers, ctx.tenantId, where)).orderBy(desc(suppliers.createdAt)).limit(input.limit).offset(offset);
    const [total] = await db.select({ count: count() }).from(suppliers).where(tenantWhere(suppliers, ctx.tenantId, where));
    return { rows, total: total.count };
  }),
  byId: protectedProcedure.input(z.number()).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(suppliers).where(tenantWhere(suppliers, ctx.tenantId, eq(suppliers.id, input)));
    return row;
  }),
  create: protectedProcedure.input(z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    ...contactPartyFields,
    branchId: z.preprocess(optionalNum, z.number().optional()),
    /** Mega Cash: register the same party as a customer too. */
    alsoAsCustomer: z.boolean().optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "contacts", "supplier", "add");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    let code: string;
    try {
      code = await resolveTypedEntityCode(db, suppliers, ctx.tenantId!, "supplier", input.code);
    } catch (e: unknown) {
      throw new TRPCError({ code: "CONFLICT", message: dbErrorMessage(e, "كود موجود مسبقاً") });
    }
    const row = compactRow({
      name: input.name,
      code,
      categoryId: input.categoryId,
      phone: input.phone,
      phone2: input.phone2,
      fax: input.fax,
      email: input.email,
      address: input.address,
      city: input.city,
      taxNumber: input.taxNumber,
      commercialRegister: input.commercialRegister,
      contactPerson: input.contactPerson,
      paymentTermDays: input.paymentTermDays,
      discountPercent: input.discountPercent,
      openingBalance: input.openingBalance,
      openingBalanceDate: input.openingBalanceDate,
      creditLimit: input.creditLimit,
      branchId: input.branchId,
      mapUrl: input.mapUrl,
      notes: input.notes,
      isActive: input.isActive,
    });
    let supplierId = 0;
    try {
      const [inserted] = await db.insert(suppliers).values(withTenantId(ctx.tenantId, row) as any);
      supplierId = Number((inserted as { insertId?: number }).insertId ?? 0);
    } catch (e: unknown) {
      throw new TRPCError({ code: "BAD_REQUEST", message: dbErrorMessage(e, "فشل إضافة المورد") });
    }
    if (supplierId) {
      await recalculateSupplierBalance(db, ctx.tenantId!, supplierId);
    }
    let customerCode: string | undefined;
    let linkedCustomerId: number | undefined;
    if (input.alsoAsCustomer && supplierId) {
      try {
        customerCode = await resolveTypedEntityCode(db, customers, ctx.tenantId!, "customer", undefined);
        const [custIns] = await db.insert(customers).values(withTenantId(ctx.tenantId, {
          ...contactSharedFields(input),
          code: customerCode,
          linkedSupplierId: supplierId,
        }) as any);
        linkedCustomerId = Number((custIns as { insertId?: number }).insertId ?? 0);
        if (linkedCustomerId) {
          await db.update(suppliers).set({ linkedCustomerId } as any)
            .where(tenantWhere(suppliers, ctx.tenantId, eq(suppliers.id, supplierId)));
        }
      } catch (e: unknown) {
        throw new TRPCError({ code: "BAD_REQUEST", message: dbErrorMessage(e, "تم إنشاء المورد لكن فشل تسجيله كعميل") });
      }
    }
    return { success: true, code, id: supplierId, customerCode, linkedCustomerId };
  }),
  update: protectedProcedure.input(z.object({
    id: z.number(),
    name: z.string().min(1),
    code: z.string().optional(),
    categoryId: z.number().optional().nullable(),
    phone: z.string().optional(),
    phone2: z.string().optional(),
    fax: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    taxNumber: z.string().optional(),
    commercialRegister: z.string().optional(),
    contactPerson: z.string().optional(),
    paymentTermDays: z.number().int().optional().nullable(),
    discountPercent: z.string().optional(),
    openingBalance: z.string().optional(),
    openingBalanceDate: z.string().optional(),
    creditLimit: z.string().optional(),
    branchId: z.number().optional().nullable(),
    mapUrl: z.string().optional(),
    notes: z.string().optional(),
    isActive: z.boolean().optional(),
    /** If not yet linked, create a customer twin (Mega Cash dual-role). */
    alsoAsCustomer: z.boolean().optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "contacts", "supplier", "edit");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [existing] = await db.select().from(suppliers)
      .where(tenantWhere(suppliers, ctx.tenantId, eq(suppliers.id, input.id)));
    const { id, code: inputCode, alsoAsCustomer, ...rest } = input;
    let code = (inputCode || "").trim() || undefined;
    if (code) {
      try {
        await assertUniqueEntityCode(db, suppliers, ctx.tenantId!, code, id);
      } catch (e: unknown) {
        throw new TRPCError({ code: "CONFLICT", message: dbErrorMessage(e, "كود موجود مسبقاً") });
      }
    }
    const row = compactRow({ ...rest, ...(code != null ? { code } : {}) });
    try {
      await db.update(suppliers).set(row as any)
        .where(tenantWhere(suppliers, ctx.tenantId, eq(suppliers.id, id)));
    } catch (e: unknown) {
      throw new TRPCError({ code: "BAD_REQUEST", message: dbErrorMessage(e, "فشل تحديث المورد") });
    }
    await recalculateSupplierBalance(db, ctx.tenantId!, id);

    let linkedCustomerId = existing?.linkedCustomerId ?? null;
    let customerCode: string | undefined;
    if (alsoAsCustomer && !linkedCustomerId) {
      try {
        customerCode = await resolveTypedEntityCode(db, customers, ctx.tenantId!, "customer", undefined);
        const [custIns] = await db.insert(customers).values(withTenantId(ctx.tenantId, {
          ...contactSharedFields(input),
          code: customerCode,
          linkedSupplierId: id,
        }) as any);
        linkedCustomerId = Number((custIns as { insertId?: number }).insertId ?? 0) || null;
        if (linkedCustomerId) {
          await db.update(suppliers).set({ linkedCustomerId } as any)
            .where(tenantWhere(suppliers, ctx.tenantId, eq(suppliers.id, id)));
        }
      } catch (e: unknown) {
        throw new TRPCError({ code: "BAD_REQUEST", message: dbErrorMessage(e, "فشل تسجيل المورد كعميل") });
      }
    } else if (linkedCustomerId) {
      await db.update(customers).set(contactSharedFields(input) as any)
        .where(tenantWhere(customers, ctx.tenantId, eq(customers.id, linkedCustomerId)));
    }
    return { success: true, linkedCustomerId: linkedCustomerId ?? undefined, customerCode };
  }),
  delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "contacts", "supplier", "deleteCancel");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [existing] = await db.select({ linkedCustomerId: suppliers.linkedCustomerId }).from(suppliers)
      .where(tenantWhere(suppliers, ctx.tenantId, eq(suppliers.id, input)));
    if (existing?.linkedCustomerId) {
      await db.update(customers).set({ linkedSupplierId: null } as any)
        .where(tenantWhere(customers, ctx.tenantId, eq(customers.id, existing.linkedCustomerId)));
    }
    await db.delete(suppliers).where(tenantWhere(suppliers, ctx.tenantId, eq(suppliers.id, input)));
    return { success: true };
  }),
  cleanImport: protectedProcedure.input(z.object({
    rows: z.array(z.object({
      code: z.string().optional(),
      name: z.string().min(1),
      phone: z.string().optional(),
      phone2: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      taxNumber: z.string().optional(),
      openingBalance: z.union([z.string(), z.number()]).optional(),
      openingBalanceDate: z.string().optional(),
      notes: z.string().optional(),
    })).min(1).max(5000),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "contacts", "supplier", "add");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { cleanImportContacts } = await import("./contact-clean-import");
    return cleanImportContacts(db, ctx.tenantId!, "supplier", input.rows);
  }),
});

// ===================== CONTACT CATEGORIES =====================
const contactCategoriesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    // مصدر بيانات مشترك (فلتر فئة) في شاشات العملاء/الموردين — مش مقيّد هنا.
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(contactCategories).where(tenantWhere(contactCategories, ctx.tenantId)).orderBy(contactCategories.name);
  }),
  create: protectedProcedure.input(z.object({
    name: z.string().min(1),
    type: z.enum(["customer", "supplier", "both"]),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "contacts", "contactCategories", "add");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(contactCategories).values(withTenantId(ctx.tenantId, input) as any);
    return { success: true };
  }),
  update: protectedProcedure.input(z.object({
    id: z.number(),
    name: z.string().min(1),
    type: z.enum(["customer", "supplier", "both"]),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "contacts", "contactCategories", "edit");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, ...data } = input;
    await db.update(contactCategories).set(data).where(tenantWhere(contactCategories, ctx.tenantId, eq(contactCategories.id, id)));
    return { success: true };
  }),
  delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "contacts", "contactCategories", "deleteCancel");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(contactCategories).where(tenantWhere(contactCategories, ctx.tenantId, eq(contactCategories.id, input)));
    return { success: true };
  }),
});

// ===================== ITEMS =====================
const itemsRouter = router({
  list: protectedProcedure.input(z.object({
    search: z.string().optional(),
    categoryId: z.number().optional(),
    page: z.number().default(1),
    limit: z.number().default(20),
  })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    const conditions = [];
    if (input.search) {
      conditions.push(or(
        like(items.name, `%${input.search}%`),
        like(items.barcode, `%${input.search}%`),
        codeSearchCondition(items.code, input.search),
      ));
    }
    if (input.categoryId) conditions.push(eq(items.categoryId, input.categoryId));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    // ترتيب بالكود (الأصناف بدون كود في الآخر) ثم الاسم — أوضح من ترتيب الاسم العربي المختلط
    const itemOrder = [
      sql`(CASE WHEN ${items.code} IS NULL OR TRIM(${items.code}) = '' THEN 1 ELSE 0 END)`,
      items.code,
      items.name,
      items.id,
    ] as const;
    const rows = await db.select().from(items).where(tenantWhere(items, ctx.tenantId, where)).orderBy(...itemOrder).limit(input.limit).offset(offset);
    const [total] = await db.select({ count: count() }).from(items).where(tenantWhere(items, ctx.tenantId, where));
    return { rows, total: total.count };
  }),
  all: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(items).where(tenantWhere(items, ctx.tenantId, eq(items.isActive, true))).orderBy(
      sql`(CASE WHEN ${items.code} IS NULL OR TRIM(${items.code}) = '' THEN 1 ELSE 0 END)`,
      items.code,
      items.name,
      items.id,
    );
  }),
  byId: protectedProcedure.input(z.number()).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(items).where(tenantWhere(items, ctx.tenantId, eq(items.id, input)));
    return row;
  }),
  create: protectedProcedure.input(z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    barcode: z.string().optional(),
    categoryId: z.number().optional(),
    unit: z.string().optional(),
    purchasePrice: z.string().optional(),
    salePrice: z.string().optional(),
    minStock: z.string().optional(),
    taxRate: z.string().optional(),
    trackSerial: z.boolean().optional(),
    description: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "inventory", "item", "add");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { assertActiveMeasureUnit } = await import("./measure-units");
    const unit = await assertActiveMeasureUnit(db, ctx.tenantId!, input.unit);
    let code: string;
    try {
      code = await resolveTypedEntityCode(db, items, ctx.tenantId!, "item", input.code);
    } catch (e: unknown) {
      throw new TRPCError({ code: "CONFLICT", message: dbErrorMessage(e, "كود موجود مسبقاً") });
    }
    let itemId = 0;
    try {
      const [inserted] = await db.insert(items).values(withTenantId(ctx.tenantId, compactRow({
        ...input,
        unit,
        code,
      } as Record<string, unknown>)) as any);
      itemId = Number((inserted as { insertId?: number }).insertId ?? 0);
    } catch (e: unknown) {
      throw new TRPCError({ code: "BAD_REQUEST", message: dbErrorMessage(e, "فشل إضافة الصنف") });
    }
    if (itemId && ctx.tenantSlug) {
      const [row] = await db.select().from(items).where(tenantWhere(items, ctx.tenantId, eq(items.id, itemId))).limit(1);
      if (row) {
        const { notifyShopeItemSync } = await import("./shope-outbound");
        void notifyShopeItemSync(ctx.tenantSlug, {
          code: (row.code || row.barcode || String(row.id)).trim(),
          name: row.name,
          salePrice: row.salePrice,
          currentStock: row.currentStock,
          barcode: row.barcode,
          description: row.description,
          cashItemId: row.id,
        });
      }
    }
    return { success: true, id: itemId, code };
  }),
  update: protectedProcedure.input(z.object({
    id: z.number(),
    name: z.string().min(1),
    code: z.string().optional(),
    barcode: z.string().optional(),
    categoryId: z.number().optional(),
    unit: z.string().optional(),
    purchasePrice: z.string().optional(),
    salePrice: z.string().optional(),
    minStock: z.string().optional(),
    taxRate: z.string().optional(),
    trackSerial: z.boolean().optional(),
    description: z.string().optional(),
    isActive: z.boolean().optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "inventory", "item", "edit");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { assertActiveMeasureUnit } = await import("./measure-units");
    const { id, code: inputCode, ...rest } = input;
    let code = (inputCode || "").trim() || undefined;
    if (code) {
      try {
        await assertUniqueEntityCode(db, items, ctx.tenantId!, code, id);
      } catch (e: unknown) {
        throw new TRPCError({ code: "CONFLICT", message: dbErrorMessage(e, "كود موجود مسبقاً") });
      }
    }
    try {
      const unit = typeof input.unit === "string"
        ? await assertActiveMeasureUnit(db, ctx.tenantId!, input.unit)
        : undefined;
      const patch = compactRow({
        ...rest,
        ...(code != null ? { code } : {}),
        ...(unit != null ? { unit } : {}),
      } as Record<string, unknown>) as Record<string, unknown>;
      // الوحدة لازم تتحدث حتى لو كانت القيمة الافتراضية «قطعة»
      if (unit != null) {
        patch.unit = unit;
      }
      if (typeof input.trackSerial === "boolean") {
        patch.trackSerial = input.trackSerial;
      }
      await db.update(items).set(patch as any).where(tenantWhere(items, ctx.tenantId, eq(items.id, id)));
    } catch (e: unknown) {
      if (e instanceof TRPCError) throw e;
      throw new TRPCError({ code: "BAD_REQUEST", message: dbErrorMessage(e, "فشل تحديث الصنف") });
    }
    if (ctx.tenantSlug) {
      const [row] = await db.select().from(items).where(tenantWhere(items, ctx.tenantId, eq(items.id, id))).limit(1);
      if (row) {
        const { notifyShopeItemSync } = await import("./shope-outbound");
        void notifyShopeItemSync(ctx.tenantSlug, {
          code: (row.code || row.barcode || String(row.id)).trim(),
          name: row.name,
          salePrice: row.salePrice,
          currentStock: row.currentStock,
          barcode: row.barcode,
          description: row.description,
          cashItemId: row.id,
        });
      }
    }
    return { success: true };
  }),
  delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "inventory", "item", "deleteCancel");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(items).where(tenantWhere(items, ctx.tenantId, eq(items.id, input)));
    return { success: true };
  }),
  /** حذف جماعي مع تصفير رصيد أول المدة والمخازن — لتقارير قيمة الأصناف قبل استيراد نظيف */
  bulkPurge: protectedProcedure.input(z.object({
    itemIds: z.array(z.number()).min(1).max(2000),
    confirm: z.literal("PURGE_ITEMS"),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "inventory", "item", "deleteCancel");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { purgeItemsWithStock } = await import("./inventory-clean-import");
    return purgeItemsWithStock(db, ctx.tenantId!, input.itemIds);
  }),
  categories: protectedProcedure.query(async ({ ctx }) => {
    // مصدر بيانات مشترك (اختيار فئة صنف) — مش مقيّد هنا.
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(itemCategories).where(tenantWhere(itemCategories, ctx.tenantId)).orderBy(itemCategories.name);
  }),
  createCategory: protectedProcedure.input(z.object({
    name: z.string().min(1),
    parentId: z.number().optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "inventory", "itemCategories", "add");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(itemCategories).values(withTenantId(ctx.tenantId, input) as any);
    return { success: true };
  }),
});

// ===================== WAREHOUSES =====================
const warehousesRouter = router({
  list: protectedProcedure.input(z.object({
    branchId: z.number().optional(),
  }).optional()).query(async ({ ctx, input }) => {
    // مصدر بيانات مشترك (اختيار مخزن) في فواتير البيع/الشراء والإنتاج والتقارير — مش مقيّد هنا.
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
    const branchFilter = input?.branchId != null
      ? eq(warehouses.branchId, input.branchId)
      : scopeBranchFilter(warehouses, scope);
    const rows = await db.select({
      id: warehouses.id,
      tenantId: warehouses.tenantId,
      name: warehouses.name,
      address: warehouses.address,
      branchId: warehouses.branchId,
      isActive: warehouses.isActive,
      createdAt: warehouses.createdAt,
      branchName: branches.name,
    }).from(warehouses)
      .leftJoin(branches, eq(warehouses.branchId, branches.id))
      .where(tenantWhere(warehouses, ctx.tenantId, and(
        scopeIdsFilter(warehouses.id, scope.warehouseIds),
        branchFilter,
      )))
      .orderBy(warehouses.name);
    return rows;
  }),
  create: protectedProcedure.input(z.object({
    name: z.string().min(1),
    address: z.string().optional(),
    branchId: z.number().optional().nullable(),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "inventory", "warehouses", "add");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
    assertBranchAccess(scope, input.branchId ?? undefined);
    if (scope.branchIds?.length && input.branchId == null) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "يجب اختيار فرع للمخزن ضمن نطاقك" });
    }
    await db.insert(warehouses).values(withTenantId(ctx.tenantId, compactRow({
      name: input.name,
      address: input.address,
      branchId: input.branchId ?? null,
    })) as any);
    return { success: true };
  }),
  update: protectedProcedure.input(z.object({
    id: z.number(),
    name: z.string().min(1),
    address: z.string().optional(),
    branchId: z.number().optional().nullable(),
    isActive: z.boolean().optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "inventory", "warehouses", "edit");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
    assertBranchAccess(scope, input.branchId ?? undefined);
    const { id, ...data } = input;
    await db.update(warehouses).set(compactRow(data as Record<string, unknown>) as any)
      .where(tenantWhere(warehouses, ctx.tenantId, eq(warehouses.id, id)));
    return { success: true };
  }),
  delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "inventory", "warehouses", "deleteCancel");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(warehouses).where(tenantWhere(warehouses, ctx.tenantId, eq(warehouses.id, input)));
    return { success: true };
  }),
  backfillStock: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { backfillWarehouseStockFromItems } = await import("./inventory-stock");
    return backfillWarehouseStockFromItems(db, ctx.tenantId);
  }),
});

// ===================== PURCHASE INVOICES =====================
const purchasesRouter = router({
  invoices: router({
    list: protectedProcedure.input(z.object({
      search: z.string().optional(),
      status: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    })).query(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "purchases", "purchaseInvoice", "viewDocList");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;
      const scope = ctx.saasUser ? await loadUserScope(db, ctx.saasUser.id) : { branchIds: null, warehouseIds: null };
      const scopeFilters = [
        scopeBranchFilter(purchaseInvoices, scope),
        scopeWarehouseFilter(purchaseInvoices, scope),
        input.status ? eq(purchaseInvoices.status, input.status as any) : undefined,
        input.search
          ? or(
            codeSearchCondition(purchaseInvoices.number, input.search),
            like(suppliers.name, `%${input.search}%`),
          )
          : undefined,
      ].filter(Boolean);
      const whereClause = tenantWhere(
        purchaseInvoices,
        ctx.tenantId,
        ...(scopeFilters.length ? [and(...scopeFilters)] : []),
      );
      const rows = await db.select({
        id: purchaseInvoices.id,
        number: purchaseInvoices.number,
        date: purchaseInvoices.date,
        total: purchaseInvoices.total,
        foreignTotal: purchaseInvoices.foreignTotal,
        currencyCode: purchaseInvoices.currencyCode,
        exchangeRate: purchaseInvoices.exchangeRate,
        paid: purchaseInvoices.paid,
        remaining: purchaseInvoices.remaining,
        status: purchaseInvoices.status,
        paymentType: purchaseInvoices.paymentType,
        supplierName: suppliers.name,
        branchName: branches.name,
      }).from(purchaseInvoices)
        .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
        .leftJoin(branches, eq(purchaseInvoices.branchId, branches.id))
        .where(whereClause)
        .orderBy(desc(purchaseInvoices.date), desc(purchaseInvoices.id))
        .limit(input.limit).offset(offset);
      const [total] = await db.select({ count: count() }).from(purchaseInvoices)
        .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
        .where(whereClause);
      return { rows, total: total.count };
    }),
    byId: protectedProcedure.input(z.number()).query(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "purchases", "purchaseInvoice", "viewDoc");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const scope = ctx.saasUser ? await loadUserScope(db, ctx.saasUser.id) : { branchIds: null, warehouseIds: null };
      const [inv] = await db.select().from(purchaseInvoices).where(tenantWhere(purchaseInvoices, ctx.tenantId, eq(purchaseInvoices.id, input)));
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      if (scope.branchIds?.length && inv.branchId && !scope.branchIds.includes(inv.branchId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك عرض فواتير هذا الفرع" });
      }
      if (scope.warehouseIds?.length && inv.warehouseId && !scope.warehouseIds.includes(inv.warehouseId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك عرض فواتير هذا المخزن" });
      }
      const invItems = await db.select({
        id: purchaseInvoiceItems.id,
        itemId: purchaseInvoiceItems.itemId,
        quantity: purchaseInvoiceItems.quantity,
        price: purchaseInvoiceItems.price,
        discount: purchaseInvoiceItems.discount,
        tax: purchaseInvoiceItems.tax,
        tax2: purchaseInvoiceItems.tax2,
        tax3: purchaseInvoiceItems.tax3,
        warehouseId: purchaseInvoiceItems.warehouseId,
        batchId: purchaseInvoiceItems.batchId,
        total: purchaseInvoiceItems.total,
        itemName: items.name,
        itemUnit: items.unit,
      }).from(purchaseInvoiceItems)
        .leftJoin(items, eq(purchaseInvoiceItems.itemId, items.id))
        .where(tenantWhere(purchaseInvoiceItems, ctx.tenantId, eq(purchaseInvoiceItems.invoiceId, input)));
      const itemBatchRows = invItems.length
        ? await db.select().from(purchaseInvoiceItemBatches)
          .where(tenantWhere(purchaseInvoiceItemBatches, ctx.tenantId, inArray(purchaseInvoiceItemBatches.invoiceItemId, invItems.map((i) => i.id))))
        : [];
      const invoiceTaxRows = await db.select().from(purchaseInvoiceTaxes)
        .where(tenantWhere(purchaseInvoiceTaxes, ctx.tenantId, eq(purchaseInvoiceTaxes.invoiceId, input)));
      const invoiceExpenseRows = await db.select().from(purchaseInvoiceExpenses)
        .where(tenantWhere(purchaseInvoiceExpenses, ctx.tenantId, eq(purchaseInvoiceExpenses.invoiceId, input)));
      const [supplier] = await db.select({ name: suppliers.name }).from(suppliers)
        .where(tenantWhere(suppliers, ctx.tenantId, eq(suppliers.id, inv.supplierId)));
      const [journalEntry] = await db.select({
        id: journalEntries.id,
        number: journalEntries.number,
      }).from(journalEntries)
        .where(tenantWhere(journalEntries, ctx.tenantId, eq(journalEntries.reference, inv.number)))
        .limit(1);
      return {
        ...inv, supplierName: supplier?.name,
        items: invItems.map((i) => ({ ...i, batches: itemBatchRows.filter((b) => b.invoiceItemId === i.id) })),
        taxes: invoiceTaxRows, expenses: invoiceExpenseRows,
        journalEntry: journalEntry ?? null,
      };
    }),
    recordPayment: protectedProcedure.input(z.object({
      invoiceId: z.number(),
      amount: z.string(),
      date: z.string(),
      description: z.string().optional(),
      cashAmount: z.string().optional(),
      bankAmount: z.string().optional(),
      bankAccountId: z.number().optional(),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "purchases", "purchaseInvoice", "edit");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return recordPurchaseInvoicePayment(db, ctx.tenantId, ctx.user.id, input);
    }),
    create: protectedProcedure.input(z.object({
      supplierId: z.number(),
      date: z.string(),
      dueDate: z.string().optional(),
      warehouseId: z.number().optional(),
      branchId: z.number().optional(),
      costCenterId: z.number().optional(),
      paymentType: z.enum(["cash", "credit"]).default("cash"),
      cashAmount: z.string().optional(),
      bankAmount: z.string().optional(),
      bankAccountId: z.number().optional(),
      receiptType: z.enum(["full", "partial"]).default("full"),
      approveNow: z.boolean().optional(),
      currencyCode: z.string().default("EGP"),
      exchangeRate: z.string().default("1"),
      foreignTotal: z.string().optional(),
      subtotal: z.string(),
      discount: z.string().default("0"),
      tax: z.string().default("0"),
      total: z.string(),
      notes: z.string().optional(),
      referenceNumber: z.string().optional(),
      taxes: z.array(z.object({
        taxId: z.number().optional(),
        name: z.string().optional(),
        rate: z.string().optional(),
        amount: z.string(),
        glAccountId: z.number().optional(),
      })).optional(),
      expenses: z.array(z.object({
        currencyCode: z.string().default("EGP"),
        exchangeRate: z.string().default("1"),
        amount: z.string(),
        creditAccountId: z.number(),
        notes: z.string().optional(),
      })).optional(),
      items: z.array(z.object({
        itemId: z.number(),
        quantity: z.string(),
        price: z.string(),
        discount: z.string().default("0"),
        tax: z.string().default("0"),
        taxId: z.number().optional(),
        tax2: z.string().default("0"),
        tax2Id: z.number().optional(),
        tax3: z.string().default("0"),
        tax3Id: z.number().optional(),
        total: z.string(),
        warehouseId: z.number().optional(),
        batchId: z.number().optional(),
        batchNumber: z.string().optional(),
        expiryDate: z.string().optional(),
        serialNumbers: z.string().optional(),
        batches: z.array(z.object({
          batchId: z.number().optional(),
          batchNumber: z.string().optional(),
          expiryDate: z.string().optional(),
          quantity: z.string(),
        })).optional(),
      })),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "purchases", "purchaseInvoice", "add");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertDateNotInClosedPeriod(db, ctx.tenantId, input.date);
      const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
      assertBranchAccess(scope, input.branchId);
      assertWarehouseAccess(scope, input.warehouseId);
      const [countResult] = await db.select({ count: count() }).from(purchaseInvoices).where(tenantWhere(purchaseInvoices, ctx.tenantId));
      const number = `PI-${String(countResult.count + 1).padStart(5, "0")}`;
      const isCash = input.paymentType === "cash";
      const { companyRequiresApproval, userBypassesApproval, queueDocumentApproval } = await import("./document-approval");
      let needsApproval =
        !isCash &&
        (await companyRequiresApproval(db, ctx.tenantId)) &&
        !userBypassesApproval(ctx.saasUser?.role ?? "user");
      if (needsApproval && input.approveNow) {
        await assertEntityAction(ctx, "purchases", "purchaseInvoice", "approve");
        needsApproval = false;
      }
      const settledCash = input.cashAmount ?? (isCash ? input.total : "0");
      const settledBank = input.bankAmount ?? "0";
      const paidTotal = Math.min(Number(input.total), Number(settledCash) + Number(settledBank));

      const [result] = await db.insert(purchaseInvoices).values(withTenantId(ctx.tenantId, {
        number,
        supplierId: input.supplierId,
        date: input.date as any,
        dueDate: input.dueDate as any,
        warehouseId: input.warehouseId,
        branchId: input.branchId,
        costCenterId: input.costCenterId,
        paymentType: input.paymentType,
        cashAmount: settledCash,
        bankAmount: settledBank,
        bankAccountId: input.bankAccountId,
        receiptType: input.receiptType,
        subtotal: input.subtotal,
        discount: input.discount,
        tax: input.tax,
        referenceNumber: input.referenceNumber,
        total: input.total,
        paid: isCash ? input.total : String(paidTotal),
        remaining: isCash ? "0" : String(Math.max(0, Number(input.total) - paidTotal)),
        currencyCode: input.currencyCode,
        exchangeRate: input.exchangeRate,
        foreignTotal: input.foreignTotal,
        notes: input.notes,
        createdBy: ctx.user.id,
        status: needsApproval ? "draft" : (isCash ? "paid" : (paidTotal > 0 ? "partial" : "confirmed")),
      }) as any);
      const invId = (result as any).insertId;
      for (const item of input.items) {
        const { batches, ...itemRow } = item;
        const [itemResult] = await db.insert(purchaseInvoiceItems).values(withTenantId(ctx.tenantId, { invoiceId: invId, ...itemRow }) as any);
        const invoiceItemId = (itemResult as any).insertId;
        const lineWarehouseId = item.warehouseId ?? input.warehouseId;
        if (!needsApproval) {
          const { applyStockMovement } = await import("./inventory-stock");
          const { updateAverageCostAfterPurchase } = await import("./inventory-cost");
          if (batches?.length) {
            for (const b of batches) {
              await db.insert(purchaseInvoiceItemBatches).values(withTenantId(ctx.tenantId, {
                invoiceItemId,
                batchId: b.batchId,
                batchNumber: b.batchNumber,
                expiryDate: b.expiryDate as any,
                quantity: b.quantity,
              }) as any);
              await applyStockMovement(db, ctx.tenantId, {
                itemId: item.itemId,
                quantity: b.quantity,
                direction: "in",
                warehouseId: lineWarehouseId,
                batchId: b.batchId,
                batchNumber: b.batchNumber,
                expiryDate: b.expiryDate,
              });
            }
          } else {
            await applyStockMovement(db, ctx.tenantId, {
              itemId: item.itemId,
              quantity: item.quantity,
              direction: "in",
              warehouseId: lineWarehouseId,
              batchId: item.batchId,
              batchNumber: item.batchNumber,
              expiryDate: item.expiryDate,
            });
          }
          await updateAverageCostAfterPurchase(
            db,
            ctx.tenantId,
            item.itemId,
            Number(item.quantity),
            Number(item.price),
            lineWarehouseId,
          );
          if (item.serialNumbers) {
            const { registerPurchaseSerials } = await import("./inventory-serials");
            await registerPurchaseSerials(db, ctx.tenantId, {
              itemId: item.itemId,
              warehouseId: lineWarehouseId,
              purchaseInvoiceId: invId,
              serialNumbers: item.serialNumbers,
            });
          }
        } else if (batches?.length) {
          for (const b of batches) {
            await db.insert(purchaseInvoiceItemBatches).values(withTenantId(ctx.tenantId, {
              invoiceItemId,
              batchId: b.batchId,
              batchNumber: b.batchNumber,
              expiryDate: b.expiryDate as any,
              quantity: b.quantity,
            }) as any);
          }
        }
      }
      for (const t of input.taxes ?? []) {
        await db.insert(purchaseInvoiceTaxes).values(withTenantId(ctx.tenantId, {
          invoiceId: invId, taxId: t.taxId, name: t.name, rate: t.rate ?? "0", amount: t.amount, glAccountId: t.glAccountId,
        }) as any);
      }
      for (const e of input.expenses ?? []) {
        await db.insert(purchaseInvoiceExpenses).values(withTenantId(ctx.tenantId, {
          invoiceId: invId, currencyCode: e.currencyCode, exchangeRate: e.exchangeRate, amount: e.amount, creditAccountId: e.creditAccountId, notes: e.notes,
        }) as any);
      }
      if (needsApproval) {
        await queueDocumentApproval(db, ctx.tenantId, {
          type: "purchase_invoice",
          id: invId,
          number,
          requestedBy: ctx.user?.id,
        });
        return { success: true, id: invId, number, pendingApproval: true };
      }
      const [supplier] = await db.select({ name: suppliers.name }).from(suppliers)
        .where(tenantWhere(suppliers, ctx.tenantId, eq(suppliers.id, input.supplierId)));
      await postPurchaseInvoiceJournal(db, ctx.tenantId, ctx.user.id, {
        number,
        date: input.date,
        paymentType: input.paymentType,
        subtotal: input.subtotal,
        discount: input.discount,
        tax: input.tax,
        total: input.total,
        costCenterId: input.costCenterId,
        supplierName: supplier?.name,
        cashAmount: settledCash,
        bankAmount: settledBank,
        bankAccountId: input.bankAccountId,
        taxes: input.taxes,
        expenses: input.expenses,
      });
      if (!isCash || paidTotal < Number(input.total)) {
        await recalculateSupplierBalance(db, ctx.tenantId, input.supplierId);
      }
      return { success: true, id: invId, number };
    }),
    unapprove: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "purchases", "purchaseInvoice", "unapprove");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { unapprovePurchaseInvoice } = await import("./invoice-approval");
      try {
        return await unapprovePurchaseInvoice(db, ctx.tenantId, input);
      } catch (e: unknown) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e instanceof Error ? e.message : "فشل فك الاعتماد" });
      }
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      supplierId: z.number(),
      date: z.string(),
      dueDate: z.string().optional(),
      warehouseId: z.number().optional(),
      branchId: z.number().optional(),
      costCenterId: z.number().optional(),
      paymentType: z.enum(["cash", "credit"]).default("cash"),
      cashAmount: z.string().optional(),
      bankAmount: z.string().optional(),
      bankAccountId: z.number().optional(),
      receiptType: z.enum(["full", "partial"]).default("full"),
      approveNow: z.boolean().optional(),
      currencyCode: z.string().default("EGP"),
      exchangeRate: z.string().default("1"),
      foreignTotal: z.string().optional(),
      subtotal: z.string(),
      discount: z.string().default("0"),
      tax: z.string().default("0"),
      total: z.string(),
      notes: z.string().optional(),
      referenceNumber: z.string().optional(),
      taxes: z.array(z.object({
        taxId: z.number().optional(),
        name: z.string().optional(),
        rate: z.string().optional(),
        amount: z.string(),
        glAccountId: z.number().optional(),
      })).optional(),
      expenses: z.array(z.object({
        currencyCode: z.string().default("EGP"),
        exchangeRate: z.string().default("1"),
        amount: z.string(),
        creditAccountId: z.number(),
        notes: z.string().optional(),
      })).optional(),
      items: z.array(z.object({
        itemId: z.number(),
        quantity: z.string(),
        price: z.string(),
        discount: z.string().default("0"),
        tax: z.string().default("0"),
        taxId: z.number().optional(),
        tax2: z.string().default("0"),
        tax2Id: z.number().optional(),
        tax3: z.string().default("0"),
        tax3Id: z.number().optional(),
        total: z.string(),
        warehouseId: z.number().optional(),
        batchId: z.number().optional(),
        batchNumber: z.string().optional(),
        expiryDate: z.string().optional(),
        serialNumbers: z.string().optional(),
        batches: z.array(z.object({
          batchId: z.number().optional(),
          batchNumber: z.string().optional(),
          expiryDate: z.string().optional(),
          quantity: z.string(),
        })).optional(),
      })),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "purchases", "purchaseInvoice", "edit");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [existing] = await db.select().from(purchaseInvoices).where(tenantWhere(purchaseInvoices, ctx.tenantId, eq(purchaseInvoices.id, input.id)));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (existing.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن تعديل فاتورة غير مسودة — فك الاعتماد أولاً" });
      await assertDateNotInClosedPeriod(db, ctx.tenantId, input.date);
      const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
      assertBranchAccess(scope, input.branchId);
      assertWarehouseAccess(scope, input.warehouseId);
      const number = existing.number;
      const invId = input.id;
      const isCash = input.paymentType === "cash";
      const postNow = !!input.approveNow;
      if (postNow) {
        await assertEntityAction(ctx, "purchases", "purchaseInvoice", "approve");
      }
      const settledCash = input.cashAmount ?? (isCash ? input.total : "0");
      const settledBank = input.bankAmount ?? "0";
      const paidTotal = Math.min(Number(input.total), Number(settledCash) + Number(settledBank));

      // نظّف الأسطر/الضرائب/المصروفات القديمة بالكامل — الفاتورة لسه مسودة، مفيش قيود أو حركة مخزون تعتمد عليها
      const oldItems = await db.select({ id: purchaseInvoiceItems.id }).from(purchaseInvoiceItems)
        .where(tenantWhere(purchaseInvoiceItems, ctx.tenantId, eq(purchaseInvoiceItems.invoiceId, invId)));
      for (const oi of oldItems) {
        await db.delete(purchaseInvoiceItemBatches).where(tenantWhere(purchaseInvoiceItemBatches, ctx.tenantId, eq(purchaseInvoiceItemBatches.invoiceItemId, oi.id)));
      }
      await db.delete(purchaseInvoiceItems).where(tenantWhere(purchaseInvoiceItems, ctx.tenantId, eq(purchaseInvoiceItems.invoiceId, invId)));
      await db.delete(purchaseInvoiceTaxes).where(tenantWhere(purchaseInvoiceTaxes, ctx.tenantId, eq(purchaseInvoiceTaxes.invoiceId, invId)));
      await db.delete(purchaseInvoiceExpenses).where(tenantWhere(purchaseInvoiceExpenses, ctx.tenantId, eq(purchaseInvoiceExpenses.invoiceId, invId)));

      await db.update(purchaseInvoices).set({
        supplierId: input.supplierId,
        date: input.date as any,
        dueDate: input.dueDate as any,
        warehouseId: input.warehouseId,
        branchId: input.branchId,
        costCenterId: input.costCenterId,
        paymentType: input.paymentType,
        cashAmount: settledCash,
        bankAmount: settledBank,
        bankAccountId: input.bankAccountId,
        receiptType: input.receiptType,
        subtotal: input.subtotal,
        discount: input.discount,
        tax: input.tax,
        referenceNumber: input.referenceNumber,
        total: input.total,
        paid: isCash ? input.total : String(paidTotal),
        remaining: isCash ? "0" : String(Math.max(0, Number(input.total) - paidTotal)),
        currencyCode: input.currencyCode,
        exchangeRate: input.exchangeRate,
        foreignTotal: input.foreignTotal,
        notes: input.notes,
        status: !postNow ? "draft" : (isCash ? "paid" : (paidTotal > 0 ? "partial" : "confirmed")),
      } as any).where(tenantWhere(purchaseInvoices, ctx.tenantId, eq(purchaseInvoices.id, invId)));

      for (const item of input.items) {
        const { batches, ...itemRow } = item;
        const [itemResult] = await db.insert(purchaseInvoiceItems).values(withTenantId(ctx.tenantId, { invoiceId: invId, ...itemRow }) as any);
        const invoiceItemId = (itemResult as any).insertId;
        const lineWarehouseId = item.warehouseId ?? input.warehouseId;
        if (postNow) {
          const { applyStockMovement } = await import("./inventory-stock");
          const { updateAverageCostAfterPurchase } = await import("./inventory-cost");
          if (batches?.length) {
            for (const b of batches) {
              await db.insert(purchaseInvoiceItemBatches).values(withTenantId(ctx.tenantId, {
                invoiceItemId, batchId: b.batchId, batchNumber: b.batchNumber, expiryDate: b.expiryDate as any, quantity: b.quantity,
              }) as any);
              await applyStockMovement(db, ctx.tenantId, {
                itemId: item.itemId, quantity: b.quantity, direction: "in", warehouseId: lineWarehouseId,
                batchId: b.batchId, batchNumber: b.batchNumber, expiryDate: b.expiryDate,
              });
            }
          } else {
            await applyStockMovement(db, ctx.tenantId, {
              itemId: item.itemId, quantity: item.quantity, direction: "in", warehouseId: lineWarehouseId,
              batchId: item.batchId, batchNumber: item.batchNumber, expiryDate: item.expiryDate,
            });
          }
          await updateAverageCostAfterPurchase(db, ctx.tenantId, item.itemId, Number(item.quantity), Number(item.price), lineWarehouseId);
          if (item.serialNumbers) {
            const { registerPurchaseSerials } = await import("./inventory-serials");
            await registerPurchaseSerials(db, ctx.tenantId, { itemId: item.itemId, warehouseId: lineWarehouseId, purchaseInvoiceId: invId, serialNumbers: item.serialNumbers });
          }
        } else if (batches?.length) {
          for (const b of batches) {
            await db.insert(purchaseInvoiceItemBatches).values(withTenantId(ctx.tenantId, {
              invoiceItemId, batchId: b.batchId, batchNumber: b.batchNumber, expiryDate: b.expiryDate as any, quantity: b.quantity,
            }) as any);
          }
        }
      }
      for (const t of input.taxes ?? []) {
        await db.insert(purchaseInvoiceTaxes).values(withTenantId(ctx.tenantId, {
          invoiceId: invId, taxId: t.taxId, name: t.name, rate: t.rate ?? "0", amount: t.amount, glAccountId: t.glAccountId,
        }) as any);
      }
      for (const e of input.expenses ?? []) {
        await db.insert(purchaseInvoiceExpenses).values(withTenantId(ctx.tenantId, {
          invoiceId: invId, currencyCode: e.currencyCode, exchangeRate: e.exchangeRate, amount: e.amount, creditAccountId: e.creditAccountId, notes: e.notes,
        }) as any);
      }
      if (!postNow) {
        return { success: true, id: invId, number };
      }
      const [supplier] = await db.select({ name: suppliers.name }).from(suppliers)
        .where(tenantWhere(suppliers, ctx.tenantId, eq(suppliers.id, input.supplierId)));
      await postPurchaseInvoiceJournal(db, ctx.tenantId, ctx.user.id, {
        number, date: input.date, paymentType: input.paymentType, subtotal: input.subtotal, discount: input.discount,
        tax: input.tax, total: input.total, costCenterId: input.costCenterId, supplierName: supplier?.name,
        cashAmount: settledCash, bankAmount: settledBank, bankAccountId: input.bankAccountId,
        taxes: input.taxes, expenses: input.expenses,
      });
      if (!isCash || paidTotal < Number(input.total)) {
        await recalculateSupplierBalance(db, ctx.tenantId, input.supplierId);
      }
      return { success: true, id: invId, number };
    }),
    lastPriceFromSupplier: protectedProcedure.input(z.object({
      supplierId: z.number(),
      itemId: z.number(),
    })).query(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "purchases", "purchaseInvoice", "viewDocList");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db.select({
        price: purchaseInvoiceItems.price,
        date: purchaseInvoices.date,
        number: purchaseInvoices.number,
      }).from(purchaseInvoiceItems)
        .innerJoin(purchaseInvoices, eq(purchaseInvoiceItems.invoiceId, purchaseInvoices.id))
        .where(tenantWhere(purchaseInvoiceItems, ctx.tenantId, and(
          eq(purchaseInvoices.supplierId, input.supplierId),
          eq(purchaseInvoiceItems.itemId, input.itemId),
        )))
        .orderBy(desc(purchaseInvoices.date), desc(purchaseInvoices.id))
        .limit(1);
      return row ?? null;
    }),
  }),
  orders: router({
    list: protectedProcedure.input(z.object({ page: z.number().default(1), limit: z.number().default(20) })).query(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "purchases", "purchaseOrder", "viewDocList");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
      const offset = (input.page - 1) * input.limit;
      const scopeFilters = [scopeWarehouseFilter(purchaseOrders, scope)].filter(Boolean);
      const whereClause = tenantWhere(purchaseOrders, ctx.tenantId, ...(scopeFilters.length ? [and(...scopeFilters)] : []));
      const rows = await db.select({
        id: purchaseOrders.id,
        number: purchaseOrders.number,
        date: purchaseOrders.date,
        total: purchaseOrders.total,
        status: purchaseOrders.status,
        supplierName: suppliers.name,
      }).from(purchaseOrders)
        .where(whereClause)
        .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
        .orderBy(desc(purchaseOrders.createdAt)).limit(input.limit).offset(offset);
      const [total] = await db.select({ count: count() }).from(purchaseOrders).where(whereClause);
      return { rows, total: total.count };
    }),
    byId: protectedProcedure.input(z.number()).query(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "purchases", "purchaseOrder", "viewDoc");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
      const [order] = await db.select().from(purchaseOrders).where(tenantWhere(purchaseOrders, ctx.tenantId, eq(purchaseOrders.id, input)));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      assertWarehouseAccess(scope, order.warehouseId);
      const orderItems = await db.select({
        id: purchaseOrderItems.id,
        itemId: purchaseOrderItems.itemId,
        quantity: purchaseOrderItems.quantity,
        price: purchaseOrderItems.price,
        discount: purchaseOrderItems.discount,
        tax: purchaseOrderItems.tax,
        total: purchaseOrderItems.total,
        convertedQuantity: purchaseOrderItems.convertedQuantity,
        itemName: items.name,
        itemCode: items.code,
        itemUnit: items.unit,
      }).from(purchaseOrderItems)
        .leftJoin(items, eq(purchaseOrderItems.itemId, items.id))
        .where(tenantWhere(purchaseOrderItems, ctx.tenantId, eq(purchaseOrderItems.orderId, input)));
      const itemsWithRemaining = orderItems.map((i) => ({
        ...i,
        remaining: Math.max(0, Number(i.quantity) - Number(i.convertedQuantity ?? 0)),
      }));
      const [supplier] = await db.select({ name: suppliers.name, phone: suppliers.phone }).from(suppliers)
        .where(tenantWhere(suppliers, ctx.tenantId, eq(suppliers.id, order.supplierId)));
      const [warehouse] = order.warehouseId
        ? await db.select({ name: warehouses.name }).from(warehouses)
          .where(tenantWhere(warehouses, ctx.tenantId, eq(warehouses.id, order.warehouseId)))
        : [null];
      // كل الفواتير اللي اتحولت من الأمر ده — ممكن يكون أكتر من واحدة لو التحويل كان جزئي
      const linkedInvoices = await db.select({
        id: purchaseInvoices.id,
        number: purchaseInvoices.number,
        date: purchaseInvoices.date,
        total: purchaseInvoices.total,
      }).from(purchaseInvoices)
        .where(tenantWhere(purchaseInvoices, ctx.tenantId, eq(purchaseInvoices.orderId, input)))
        .orderBy(desc(purchaseInvoices.id));
      return {
        ...order,
        supplierName: supplier?.name || "",
        supplierPhone: supplier?.phone || "",
        warehouseName: warehouse?.name || "",
        items: itemsWithRemaining,
        linkedInvoices,
        convertedInvoice: linkedInvoices[0] ?? null,
      };
    }),
    create: protectedProcedure.input(z.object({
      supplierId: z.number(),
      date: z.string(),
      expectedDate: z.string().optional(),
      warehouseId: z.number().optional(),
      notes: z.string().optional(),
      items: z.array(z.object({
        itemId: z.number(),
        quantity: z.string(),
        unitPrice: z.string(),
        notes: z.string().optional(),
      })),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "purchases", "purchaseOrder", "add");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertDateNotInClosedPeriod(db, ctx.tenantId, input.date);
      const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
      assertWarehouseAccess(scope, input.warehouseId);
      if (scope.warehouseIds?.length && input.warehouseId == null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "يجب اختيار مخزن ضمن نطاقك" });
      }
      const [countResult] = await db.select({ count: count() }).from(purchaseOrders).where(tenantWhere(purchaseOrders, ctx.tenantId));
      const number = `PO-${String(countResult.count + 1).padStart(5, "0")}`;
      const total = input.items.reduce((s, it) => s + (Number(it.quantity) * Number(it.unitPrice)), 0);
      const [result] = await db.insert(purchaseOrders).values(withTenantId(ctx.tenantId, {
        number, supplierId: input.supplierId,
        date: input.date as any,
        expectedDate: input.expectedDate as any,
        warehouseId: input.warehouseId,
        total: String(total),
        notes: input.notes,
        status: "draft",
      }) as any);
      const orderId = (result as any).insertId;
      for (const item of input.items) {
        await db.insert(purchaseOrderItems).values(withTenantId(ctx.tenantId, {
          orderId,
          itemId: item.itemId,
          quantity: item.quantity,
          price: item.unitPrice,
          discount: "0",
          tax: "0",
          total: String(Number(item.quantity) * Number(item.unitPrice)),
        }) as any);
      }
      return { success: true, id: orderId, number };
    }),
    approve: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "purchases", "purchaseOrder", "approve");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
      const [order] = await db.select().from(purchaseOrders).where(tenantWhere(purchaseOrders, ctx.tenantId, eq(purchaseOrders.id, input)));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      assertWarehouseAccess(scope, order.warehouseId);
      await db.update(purchaseOrders).set({ status: "confirmed" } as any).where(tenantWhere(purchaseOrders, ctx.tenantId, eq(purchaseOrders.id, input)));
      return { success: true };
    }),
    unapprove: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "purchases", "purchaseOrder", "unapprove");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [order] = await db.select().from(purchaseOrders).where(tenantWhere(purchaseOrders, ctx.tenantId, eq(purchaseOrders.id, input)));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      if (order.status !== "confirmed") throw new TRPCError({ code: "BAD_REQUEST", message: "الأمر ليس معتمداً أصلاً" });
      const orderLines = await db.select({ convertedQuantity: purchaseOrderItems.convertedQuantity })
        .from(purchaseOrderItems).where(tenantWhere(purchaseOrderItems, ctx.tenantId, eq(purchaseOrderItems.orderId, input)));
      if (orderLines.some((l) => Number(l.convertedQuantity ?? 0) > 0.0001)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن فك اعتماد أمر تم تحويل جزء منه لفاتورة بالفعل" });
      }
      await db.update(purchaseOrders).set({ status: "draft" } as any).where(tenantWhere(purchaseOrders, ctx.tenantId, eq(purchaseOrders.id, input)));
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      supplierId: z.number(),
      date: z.string(),
      expectedDate: z.string().optional(),
      warehouseId: z.number().optional(),
      notes: z.string().optional(),
      items: z.array(z.object({
        itemId: z.number(),
        quantity: z.string(),
        unitPrice: z.string(),
        notes: z.string().optional(),
      })),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "purchases", "purchaseOrder", "edit");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [order] = await db.select().from(purchaseOrders).where(tenantWhere(purchaseOrders, ctx.tenantId, eq(purchaseOrders.id, input.id)));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      if (order.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن تعديل أمر غير معلق — فك الاعتماد أولاً" });
      await assertDateNotInClosedPeriod(db, ctx.tenantId, input.date);
      const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
      assertWarehouseAccess(scope, input.warehouseId);
      const total = input.items.reduce((s, it) => s + (Number(it.quantity) * Number(it.unitPrice)), 0);
      await db.update(purchaseOrders).set({
        supplierId: input.supplierId,
        date: input.date as any,
        expectedDate: input.expectedDate as any,
        warehouseId: input.warehouseId,
        total: String(total),
        notes: input.notes,
      } as any).where(tenantWhere(purchaseOrders, ctx.tenantId, eq(purchaseOrders.id, input.id)));
      await db.delete(purchaseOrderItems).where(tenantWhere(purchaseOrderItems, ctx.tenantId, eq(purchaseOrderItems.orderId, input.id)));
      for (const item of input.items) {
        await db.insert(purchaseOrderItems).values(withTenantId(ctx.tenantId, {
          orderId: input.id, itemId: item.itemId, quantity: item.quantity, price: item.unitPrice,
          discount: "0", tax: "0", total: String(Number(item.quantity) * Number(item.unitPrice)),
        }) as any);
      }
      return { success: true };
    }),
    convertToInvoice: protectedProcedure.input(z.object({
      orderId: z.number(),
      paymentType: z.enum(["cash", "credit"]).optional(),
      date: z.string().optional(),
      /** كمية كل بند يتحول دلوقتي — لو مبعتتش، يتحول كل الباقي من كل الأسطر (تحويل كامل) */
      items: z.array(z.object({
        orderItemId: z.number(),
        quantity: z.string(),
      })).optional(),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "purchases", "purchaseOrder", "edit");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
      const [order] = await db.select().from(purchaseOrders).where(tenantWhere(purchaseOrders, ctx.tenantId, eq(purchaseOrders.id, input.orderId)));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      assertWarehouseAccess(scope, order.warehouseId);
      const { convertPurchaseOrderToInvoice } = await import("./order-conversion");
      try {
        return await convertPurchaseOrderToInvoice(db, ctx.tenantId, ctx.user?.id, input.orderId, {
          paymentType: input.paymentType,
          date: input.date,
          items: input.items,
        });
      } catch (e: unknown) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e instanceof Error ? e.message : "فشل تحويل الأمر لفاتورة" });
      }
    }),
    cancel: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "purchases", "purchaseOrder", "deleteCancel");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
      const [order] = await db.select().from(purchaseOrders).where(tenantWhere(purchaseOrders, ctx.tenantId, eq(purchaseOrders.id, input)));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      assertWarehouseAccess(scope, order.warehouseId);
      const orderLines = await db.select({ quantity: purchaseOrderItems.quantity, convertedQuantity: purchaseOrderItems.convertedQuantity })
        .from(purchaseOrderItems).where(tenantWhere(purchaseOrderItems, ctx.tenantId, eq(purchaseOrderItems.orderId, input)));
      if (orderLines.some((l) => Number(l.convertedQuantity ?? 0) > 0.0001)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن إلغاء أمر تم تحويل جزء منه لفاتورة بالفعل" });
      }
      if (order.status === "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "الأمر ملغي مسبقاً" });
      await db.update(purchaseOrders).set({ status: "cancelled" } as any).where(tenantWhere(purchaseOrders, ctx.tenantId, eq(purchaseOrders.id, input)));
      return { success: true };
    }),
  }),
  returns: router({
    list: protectedProcedure.input(z.object({ page: z.number().default(1), limit: z.number().default(20) })).query(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "purchases", "purchaseReturnInvoice", "viewDocList");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;
      const rows = await db.select({
        id: purchaseReturns.id,
        number: purchaseReturns.number,
        date: purchaseReturns.date,
        total: purchaseReturns.total,
        status: purchaseReturns.status,
        supplierName: suppliers.name,
      }).from(purchaseReturns)
        .where(tenantWhere(purchaseReturns, ctx.tenantId))
        .leftJoin(suppliers, eq(purchaseReturns.supplierId, suppliers.id))
        .orderBy(desc(purchaseReturns.createdAt)).limit(input.limit).offset(offset);
      const [total] = await db.select({ count: count() }).from(purchaseReturns).where(tenantWhere(purchaseReturns, ctx.tenantId));
      return { rows, total: total.count };
    }),
    create: protectedProcedure.input(z.object({
      supplierId: z.number(),
      invoiceId: z.number().optional(),
      date: z.string(),
      reason: z.string().optional(),
      notes: z.string().optional(),
      warehouseId: z.number().optional(),
      items: z.array(z.object({
        itemId: z.number(),
        quantity: z.string(),
        unitPrice: z.string(),
      })),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "purchases", "purchaseReturnInvoice", "add");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertDateNotInClosedPeriod(db, ctx.tenantId, input.date);
      const [countResult] = await db.select({ count: count() }).from(purchaseReturns).where(tenantWhere(purchaseReturns, ctx.tenantId));
      const number = `PR-${String(countResult.count + 1).padStart(5, "0")}`;
      const total = input.items.reduce((s, it) => s + (Number(it.quantity) * Number(it.unitPrice)), 0);
      const [result] = await db.insert(purchaseReturns).values(withTenantId(ctx.tenantId, {
        number, supplierId: input.supplierId,
        invoiceId: input.invoiceId,
        date: input.date as any,
        total: String(total),
        reason: input.reason,
        notes: input.notes,
        status: "confirmed",
      }) as any);
      const retId = (result as any).insertId;
      for (const item of input.items) {
        const lineTotal = Number(item.quantity) * Number(item.unitPrice);
        await db.insert(purchaseReturnItems).values(withTenantId(ctx.tenantId, {
          returnId: retId,
          itemId: item.itemId,
          quantity: item.quantity,
          price: item.unitPrice,
          total: String(lineTotal),
        }) as any);
        const { applyStockMovement } = await import("./inventory-stock");
        await applyStockMovement(db, ctx.tenantId, {
          itemId: item.itemId,
          quantity: item.quantity,
          direction: "out",
          warehouseId: input.warehouseId,
        });
      }
      const [supplier] = await db.select({ name: suppliers.name }).from(suppliers)
        .where(tenantWhere(suppliers, ctx.tenantId, eq(suppliers.id, input.supplierId)));
      await postPurchaseReturnJournal(db, ctx.tenantId, ctx.user.id, {
        number,
        date: input.date,
        total: String(total),
        supplierName: supplier?.name,
        items: input.items.map((it) => ({ itemId: it.itemId, quantity: it.quantity })),
      });
      await recalculateSupplierBalance(db, ctx.tenantId, input.supplierId);
      return { success: true, id: retId, number };
    }),
  }),
});

// ===================== SALES INVOICES =====================
const salesRouter = router({
  invoices: router({
    list: protectedProcedure.input(z.object({
      search: z.string().optional(),
      status: z.string().optional(),
      paymentType: z.enum(["cash", "credit"]).optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    })).query(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "sales", input.paymentType === "cash" ? "cashSaleInvoice" : "saleInvoice", "viewDocList");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;
      const scope = ctx.saasUser ? await loadUserScope(db, ctx.saasUser.id) : { branchIds: null, warehouseIds: null };
      const filters = [
        input.paymentType ? eq(salesInvoices.paymentType, input.paymentType) : undefined,
        input.status ? eq(salesInvoices.status, input.status as any) : undefined,
        scopeBranchFilter(salesInvoices, scope),
        scopeWarehouseFilter(salesInvoices, scope),
        input.search
          ? or(
            codeSearchCondition(salesInvoices.number, input.search),
            like(customers.name, `%${input.search}%`),
          )
          : undefined,
      ].filter(Boolean);
      const whereClause = tenantWhere(
        salesInvoices,
        ctx.tenantId,
        ...(filters.length ? [and(...filters)] : []),
      );
      const rows = await db.select({
        id: salesInvoices.id,
        number: salesInvoices.number,
        date: salesInvoices.date,
        total: salesInvoices.total,
        foreignTotal: salesInvoices.foreignTotal,
        currencyCode: salesInvoices.currencyCode,
        exchangeRate: salesInvoices.exchangeRate,
        paid: salesInvoices.paid,
        remaining: salesInvoices.remaining,
        status: salesInvoices.status,
        paymentType: salesInvoices.paymentType,
        customerName: customers.name,
        branchName: branches.name,
      }).from(salesInvoices)
        .leftJoin(customers, eq(salesInvoices.customerId, customers.id))
        .leftJoin(branches, eq(salesInvoices.branchId, branches.id))
        .where(whereClause)
        .orderBy(desc(salesInvoices.date), desc(salesInvoices.id))
        .limit(input.limit).offset(offset);
      const [total] = await db.select({ count: count() }).from(salesInvoices)
        .leftJoin(customers, eq(salesInvoices.customerId, customers.id))
        .where(whereClause);
      return { rows, total: total.count };
    }),
    byId: protectedProcedure.input(z.number()).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const scope = ctx.saasUser ? await loadUserScope(db, ctx.saasUser.id) : { branchIds: null, warehouseIds: null };
      const [inv] = await db.select().from(salesInvoices).where(tenantWhere(salesInvoices, ctx.tenantId, eq(salesInvoices.id, input)));
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      await assertEntityAction(ctx, "sales", inv.paymentType === "cash" ? "cashSaleInvoice" : "saleInvoice", "viewDoc");
      if (scope.branchIds?.length && inv.branchId && !scope.branchIds.includes(inv.branchId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك عرض فواتير هذا الفرع" });
      }
      if (scope.warehouseIds?.length && inv.warehouseId && !scope.warehouseIds.includes(inv.warehouseId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك عرض فواتير هذا المخزن" });
      }
      const invItems = await db.select({
        id: salesInvoiceItems.id,
        itemId: salesInvoiceItems.itemId,
        quantity: salesInvoiceItems.quantity,
        price: salesInvoiceItems.price,
        discount: salesInvoiceItems.discount,
        tax: salesInvoiceItems.tax,
        tax2: salesInvoiceItems.tax2,
        tax3: salesInvoiceItems.tax3,
        warehouseId: salesInvoiceItems.warehouseId,
        batchId: salesInvoiceItems.batchId,
        total: salesInvoiceItems.total,
        itemName: items.name,
        itemUnit: items.unit,
      }).from(salesInvoiceItems)
        .leftJoin(items, eq(salesInvoiceItems.itemId, items.id))
        .where(tenantWhere(salesInvoiceItems, ctx.tenantId, eq(salesInvoiceItems.invoiceId, input)));
      const itemBatchRows = invItems.length
        ? await db.select().from(salesInvoiceItemBatches)
          .where(tenantWhere(salesInvoiceItemBatches, ctx.tenantId, inArray(salesInvoiceItemBatches.invoiceItemId, invItems.map((i) => i.id))))
        : [];
      const invoiceTaxRows = await db.select().from(salesInvoiceTaxes)
        .where(tenantWhere(salesInvoiceTaxes, ctx.tenantId, eq(salesInvoiceTaxes.invoiceId, input)));
      const invoiceExpenseRows = await db.select().from(salesInvoiceExpenses)
        .where(tenantWhere(salesInvoiceExpenses, ctx.tenantId, eq(salesInvoiceExpenses.invoiceId, input)));
      const [customer] = await db.select({ name: customers.name }).from(customers)
        .where(tenantWhere(customers, ctx.tenantId, eq(customers.id, inv.customerId)));
      const [journalEntry] = await db.select({
        id: journalEntries.id,
        number: journalEntries.number,
      }).from(journalEntries)
        .where(tenantWhere(journalEntries, ctx.tenantId, eq(journalEntries.reference, inv.number)))
        .limit(1);
      return {
        ...inv, customerName: customer?.name,
        items: invItems.map((i) => ({ ...i, batches: itemBatchRows.filter((b) => b.invoiceItemId === i.id) })),
        taxes: invoiceTaxRows, expenses: invoiceExpenseRows,
        journalEntry: journalEntry ?? null,
      };
    }),
    recordPayment: protectedProcedure.input(z.object({
      invoiceId: z.number(),
      amount: z.string(),
      date: z.string(),
      description: z.string().optional(),
      cashAmount: z.string().optional(),
      bankAmount: z.string().optional(),
      bankAccountId: z.number().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [inv] = await db.select({ paymentType: salesInvoices.paymentType }).from(salesInvoices)
        .where(tenantWhere(salesInvoices, ctx.tenantId, eq(salesInvoices.id, input.invoiceId))).limit(1);
      await assertEntityAction(ctx, "sales", inv?.paymentType === "cash" ? "cashSaleInvoice" : "saleInvoice", "edit");
      return recordSalesInvoicePayment(db, ctx.tenantId, ctx.user.id, input);
    }),
    submitToEta: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { submitSalesInvoiceToEta } = await import("./eta-service");
      try {
        return await submitSalesInvoiceToEta(db, ctx.tenantId, input);
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "فشل الإرسال لـ ETA",
        });
      }
    }),
    checkEtaStatus: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { checkEtaInvoiceStatus } = await import("./eta-service");
      try {
        return await checkEtaInvoiceStatus(db, ctx.tenantId, input);
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "فشل الاستعلام عن حالة ETA",
        });
      }
    }),
    create: protectedProcedure.input(z.object({
      customerId: z.number(),
      date: z.string(),
      dueDate: z.string().optional(),
      warehouseId: z.number().optional(),
      branchId: z.number().optional(),
      costCenterId: z.number().optional(),
      paymentType: z.enum(["cash", "credit"]).default("cash"),
      currencyCode: z.string().default("EGP"),
      exchangeRate: z.string().default("1"),
      foreignTotal: z.string().optional(),
      subtotal: z.string(),
      discount: z.string().default("0"),
      tax: z.string().default("0"),
      total: z.string(),
      additions: z.string().default("0"),
      notes: z.string().optional(),
      cashAmount: z.string().optional(),
      bankAmount: z.string().optional(),
      bankAccountId: z.number().optional(),
      approveNow: z.boolean().optional(),
      taxes: z.array(z.object({
        taxId: z.number().optional(),
        name: z.string().optional(),
        rate: z.string().optional(),
        amount: z.string(),
        glAccountId: z.number().optional(),
      })).optional(),
      expenses: z.array(z.object({
        currencyCode: z.string().default("EGP"),
        exchangeRate: z.string().default("1"),
        amount: z.string(),
        creditAccountId: z.number(),
        notes: z.string().optional(),
      })).optional(),
      items: z.array(z.object({
        itemId: z.number(),
        quantity: z.string(),
        price: z.string(),
        discount: z.string().default("0"),
        tax: z.string().default("0"),
        taxId: z.number().optional(),
        tax2: z.string().default("0"),
        tax2Id: z.number().optional(),
        tax3: z.string().default("0"),
        tax3Id: z.number().optional(),
        total: z.string(),
        warehouseId: z.number().optional(),
        batchId: z.number().optional(),
        batchNumber: z.string().optional(),
        serialNumbers: z.string().optional(),
        batches: z.array(z.object({
          batchId: z.number().optional(),
          batchNumber: z.string().optional(),
          expiryDate: z.string().optional(),
          quantity: z.string(),
        })).optional(),
      })),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "sales", input.paymentType === "cash" ? "cashSaleInvoice" : "saleInvoice", "add");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertDateNotInClosedPeriod(db, ctx.tenantId, input.date);
      const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
      const [countResult] = await db.select({ count: count() }).from(salesInvoices).where(tenantWhere(salesInvoices, ctx.tenantId));
      const number = `SI-${String(countResult.count + 1).padStart(5, "0")}`;
      const [customer] = await db.select({
        salesRepId: customers.salesRepId,
        branchId: customers.branchId,
        name: customers.name,
      }).from(customers).where(tenantWhere(customers, ctx.tenantId, eq(customers.id, input.customerId)));
      if (customer) assertEntityBranchAccess(scope, customer.branchId);
      const resolvedBranchId = input.branchId ?? customer?.branchId ?? undefined;
      assertBranchAccess(scope, resolvedBranchId);
      assertWarehouseAccess(scope, input.warehouseId);
      const isCash = input.paymentType === "cash";
      if (!isCash) {
        await assertCustomerCreditLimit(db, ctx.tenantId, input.customerId, input.total);
      }
      const { companyRequiresApproval, userBypassesApproval, queueDocumentApproval } = await import("./document-approval");
      let needsApproval =
        !isCash &&
        (await companyRequiresApproval(db, ctx.tenantId)) &&
        !userBypassesApproval(ctx.saasUser?.role ?? "user");
      if (needsApproval && input.approveNow) {
        await assertEntityAction(ctx, "sales", "saleInvoice", "approve");
        needsApproval = false;
      }
      const settledCash = input.cashAmount ?? (isCash ? input.total : "0");
      const settledBank = input.bankAmount ?? "0";
      const paidTotal = Math.min(Number(input.total), Number(settledCash) + Number(settledBank));

      const [result] = await db.insert(salesInvoices).values(withTenantId(ctx.tenantId, {
        number,
        customerId: input.customerId,
        date: input.date as any,
        dueDate: input.dueDate as any,
        warehouseId: input.warehouseId,
        paymentType: input.paymentType,
        cashAmount: settledCash,
        bankAmount: settledBank,
        bankAccountId: input.bankAccountId,
        subtotal: input.subtotal,
        discount: input.discount,
        tax: input.tax,
        additions: input.additions ?? "0",
        total: input.total,
        paid: isCash ? input.total : String(paidTotal),
        remaining: isCash ? "0" : String(Math.max(0, Number(input.total) - paidTotal)),
        salesRepId: customer?.salesRepId ?? undefined,
        branchId: resolvedBranchId,
        costCenterId: input.costCenterId,
        currencyCode: input.currencyCode,
        exchangeRate: input.exchangeRate,
        foreignTotal: input.foreignTotal,
        notes: input.notes,
        createdBy: ctx.user.id,
        status: needsApproval ? "draft" : (isCash ? "paid" : (paidTotal > 0 ? "partial" : "confirmed")),
      }) as any);
      const invId = (result as any).insertId;
      for (const item of input.items) {
        const { batches, ...itemRow } = item;
        const [itemResult] = await db.insert(salesInvoiceItems).values(withTenantId(ctx.tenantId, { invoiceId: invId, ...itemRow }) as any);
        const invoiceItemId = (itemResult as any).insertId;
        const lineWarehouseId = item.warehouseId ?? input.warehouseId;
        if (!needsApproval) {
          const { applyStockMovement } = await import("./inventory-stock");
          if (batches?.length) {
            for (const b of batches) {
              await db.insert(salesInvoiceItemBatches).values(withTenantId(ctx.tenantId, {
                invoiceItemId,
                batchId: b.batchId,
                batchNumber: b.batchNumber,
                expiryDate: b.expiryDate as any,
                quantity: b.quantity,
              }) as any);
              await applyStockMovement(db, ctx.tenantId, {
                itemId: item.itemId,
                quantity: b.quantity,
                direction: "out",
                warehouseId: lineWarehouseId,
                batchId: b.batchId,
              });
            }
          } else {
            await applyStockMovement(db, ctx.tenantId, {
              itemId: item.itemId,
              quantity: item.quantity,
              direction: "out",
              warehouseId: lineWarehouseId,
              batchId: item.batchId,
            });
          }
          if (item.serialNumbers) {
            const { assignSalesSerials } = await import("./inventory-serials");
            await assignSalesSerials(db, ctx.tenantId, {
              itemId: item.itemId,
              warehouseId: lineWarehouseId,
              salesInvoiceId: invId,
              serialNumbers: item.serialNumbers,
            });
          }
        } else if (batches?.length) {
          for (const b of batches) {
            await db.insert(salesInvoiceItemBatches).values(withTenantId(ctx.tenantId, {
              invoiceItemId,
              batchId: b.batchId,
              batchNumber: b.batchNumber,
              expiryDate: b.expiryDate as any,
              quantity: b.quantity,
            }) as any);
          }
        }
      }
      for (const t of input.taxes ?? []) {
        await db.insert(salesInvoiceTaxes).values(withTenantId(ctx.tenantId, {
          invoiceId: invId, taxId: t.taxId, name: t.name, rate: t.rate ?? "0", amount: t.amount, glAccountId: t.glAccountId,
        }) as any);
      }
      for (const e of input.expenses ?? []) {
        await db.insert(salesInvoiceExpenses).values(withTenantId(ctx.tenantId, {
          invoiceId: invId, currencyCode: e.currencyCode, exchangeRate: e.exchangeRate, amount: e.amount, creditAccountId: e.creditAccountId, notes: e.notes,
        }) as any);
      }
      if (needsApproval) {
        await queueDocumentApproval(db, ctx.tenantId, {
          type: "sales_invoice",
          id: invId,
          number,
          requestedBy: ctx.user?.id,
        });
        return { success: true, id: invId, number, pendingApproval: true };
      }
      await postSalesInvoiceJournal(db, ctx.tenantId, ctx.user.id, {
        number,
        date: input.date,
        paymentType: input.paymentType,
        subtotal: input.subtotal,
        discount: input.discount,
        tax: input.tax,
        total: input.total,
        costCenterId: input.costCenterId,
        customerName: customer?.name,
        cashAmount: settledCash,
        bankAmount: settledBank,
        bankAccountId: input.bankAccountId,
        taxes: input.taxes,
        expenses: input.expenses,
      });
      await postSalesCogsJournal(db, ctx.tenantId, ctx.user.id, {
        number,
        date: input.date,
        costCenterId: input.costCenterId,
        items: input.items.map((it) => ({ itemId: it.itemId, quantity: it.quantity })),
      });
      if (!isCash || paidTotal < Number(input.total)) {
        await recalculateCustomerBalance(db, ctx.tenantId, input.customerId);
      }
      return { success: true, id: invId, number };
    }),
    unapprove: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const [inv] = await (await getDb())!.select({ paymentType: salesInvoices.paymentType }).from(salesInvoices)
        .where(tenantWhere(salesInvoices, ctx.tenantId, eq(salesInvoices.id, input))).limit(1);
      await assertEntityAction(ctx, "sales", inv?.paymentType === "cash" ? "cashSaleInvoice" : "saleInvoice", "unapprove");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { unapproveSalesInvoice } = await import("./invoice-approval");
      try {
        return await unapproveSalesInvoice(db, ctx.tenantId, input);
      } catch (e: unknown) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e instanceof Error ? e.message : "فشل فك الاعتماد" });
      }
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      customerId: z.number(),
      date: z.string(),
      dueDate: z.string().optional(),
      warehouseId: z.number().optional(),
      branchId: z.number().optional(),
      costCenterId: z.number().optional(),
      paymentType: z.enum(["cash", "credit"]).default("cash"),
      currencyCode: z.string().default("EGP"),
      exchangeRate: z.string().default("1"),
      foreignTotal: z.string().optional(),
      subtotal: z.string(),
      discount: z.string().default("0"),
      tax: z.string().default("0"),
      total: z.string(),
      additions: z.string().default("0"),
      notes: z.string().optional(),
      cashAmount: z.string().optional(),
      bankAmount: z.string().optional(),
      bankAccountId: z.number().optional(),
      approveNow: z.boolean().optional(),
      taxes: z.array(z.object({
        taxId: z.number().optional(),
        name: z.string().optional(),
        rate: z.string().optional(),
        amount: z.string(),
        glAccountId: z.number().optional(),
      })).optional(),
      expenses: z.array(z.object({
        currencyCode: z.string().default("EGP"),
        exchangeRate: z.string().default("1"),
        amount: z.string(),
        creditAccountId: z.number(),
        notes: z.string().optional(),
      })).optional(),
      items: z.array(z.object({
        itemId: z.number(),
        quantity: z.string(),
        price: z.string(),
        discount: z.string().default("0"),
        tax: z.string().default("0"),
        taxId: z.number().optional(),
        tax2: z.string().default("0"),
        tax2Id: z.number().optional(),
        tax3: z.string().default("0"),
        tax3Id: z.number().optional(),
        total: z.string(),
        warehouseId: z.number().optional(),
        batchId: z.number().optional(),
        batchNumber: z.string().optional(),
        serialNumbers: z.string().optional(),
        batches: z.array(z.object({
          batchId: z.number().optional(),
          batchNumber: z.string().optional(),
          expiryDate: z.string().optional(),
          quantity: z.string(),
        })).optional(),
      })),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "sales", input.paymentType === "cash" ? "cashSaleInvoice" : "saleInvoice", "edit");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [existing] = await db.select().from(salesInvoices).where(tenantWhere(salesInvoices, ctx.tenantId, eq(salesInvoices.id, input.id)));
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (existing.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن تعديل فاتورة غير مسودة — فك الاعتماد أولاً" });
      await assertDateNotInClosedPeriod(db, ctx.tenantId, input.date);
      const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
      const [customer] = await db.select({ salesRepId: customers.salesRepId, branchId: customers.branchId, name: customers.name })
        .from(customers).where(tenantWhere(customers, ctx.tenantId, eq(customers.id, input.customerId)));
      if (customer) assertEntityBranchAccess(scope, customer.branchId);
      const resolvedBranchId = input.branchId ?? customer?.branchId ?? undefined;
      assertBranchAccess(scope, resolvedBranchId);
      assertWarehouseAccess(scope, input.warehouseId);
      const isCash = input.paymentType === "cash";
      const postNow = !!input.approveNow;
      if (postNow) {
        await assertEntityAction(ctx, "sales", "saleInvoice", "approve");
        if (!isCash) await assertCustomerCreditLimit(db, ctx.tenantId, input.customerId, input.total);
      }
      const number = existing.number;
      const invId = input.id;
      const settledCash = input.cashAmount ?? (isCash ? input.total : "0");
      const settledBank = input.bankAmount ?? "0";
      const paidTotal = Math.min(Number(input.total), Number(settledCash) + Number(settledBank));

      const oldItems = await db.select({ id: salesInvoiceItems.id }).from(salesInvoiceItems)
        .where(tenantWhere(salesInvoiceItems, ctx.tenantId, eq(salesInvoiceItems.invoiceId, invId)));
      for (const oi of oldItems) {
        await db.delete(salesInvoiceItemBatches).where(tenantWhere(salesInvoiceItemBatches, ctx.tenantId, eq(salesInvoiceItemBatches.invoiceItemId, oi.id)));
      }
      await db.delete(salesInvoiceItems).where(tenantWhere(salesInvoiceItems, ctx.tenantId, eq(salesInvoiceItems.invoiceId, invId)));
      await db.delete(salesInvoiceTaxes).where(tenantWhere(salesInvoiceTaxes, ctx.tenantId, eq(salesInvoiceTaxes.invoiceId, invId)));
      await db.delete(salesInvoiceExpenses).where(tenantWhere(salesInvoiceExpenses, ctx.tenantId, eq(salesInvoiceExpenses.invoiceId, invId)));

      await db.update(salesInvoices).set({
        customerId: input.customerId,
        date: input.date as any,
        dueDate: input.dueDate as any,
        warehouseId: input.warehouseId,
        paymentType: input.paymentType,
        cashAmount: settledCash,
        bankAmount: settledBank,
        bankAccountId: input.bankAccountId,
        subtotal: input.subtotal,
        discount: input.discount,
        tax: input.tax,
        additions: input.additions ?? "0",
        total: input.total,
        paid: isCash ? input.total : String(paidTotal),
        remaining: isCash ? "0" : String(Math.max(0, Number(input.total) - paidTotal)),
        salesRepId: customer?.salesRepId ?? undefined,
        branchId: resolvedBranchId,
        costCenterId: input.costCenterId,
        currencyCode: input.currencyCode,
        exchangeRate: input.exchangeRate,
        foreignTotal: input.foreignTotal,
        notes: input.notes,
        status: !postNow ? "draft" : (isCash ? "paid" : (paidTotal > 0 ? "partial" : "confirmed")),
      } as any).where(tenantWhere(salesInvoices, ctx.tenantId, eq(salesInvoices.id, invId)));

      for (const item of input.items) {
        const { batches, ...itemRow } = item;
        const [itemResult] = await db.insert(salesInvoiceItems).values(withTenantId(ctx.tenantId, { invoiceId: invId, ...itemRow }) as any);
        const invoiceItemId = (itemResult as any).insertId;
        const lineWarehouseId = item.warehouseId ?? input.warehouseId;
        if (postNow) {
          const { applyStockMovement } = await import("./inventory-stock");
          if (batches?.length) {
            for (const b of batches) {
              await db.insert(salesInvoiceItemBatches).values(withTenantId(ctx.tenantId, {
                invoiceItemId, batchId: b.batchId, batchNumber: b.batchNumber, expiryDate: b.expiryDate as any, quantity: b.quantity,
              }) as any);
              await applyStockMovement(db, ctx.tenantId, { itemId: item.itemId, quantity: b.quantity, direction: "out", warehouseId: lineWarehouseId, batchId: b.batchId });
            }
          } else {
            await applyStockMovement(db, ctx.tenantId, { itemId: item.itemId, quantity: item.quantity, direction: "out", warehouseId: lineWarehouseId, batchId: item.batchId });
          }
          if (item.serialNumbers) {
            const { assignSalesSerials } = await import("./inventory-serials");
            await assignSalesSerials(db, ctx.tenantId, { itemId: item.itemId, warehouseId: lineWarehouseId, salesInvoiceId: invId, serialNumbers: item.serialNumbers });
          }
        } else if (batches?.length) {
          for (const b of batches) {
            await db.insert(salesInvoiceItemBatches).values(withTenantId(ctx.tenantId, {
              invoiceItemId, batchId: b.batchId, batchNumber: b.batchNumber, expiryDate: b.expiryDate as any, quantity: b.quantity,
            }) as any);
          }
        }
      }
      for (const t of input.taxes ?? []) {
        await db.insert(salesInvoiceTaxes).values(withTenantId(ctx.tenantId, {
          invoiceId: invId, taxId: t.taxId, name: t.name, rate: t.rate ?? "0", amount: t.amount, glAccountId: t.glAccountId,
        }) as any);
      }
      for (const e of input.expenses ?? []) {
        await db.insert(salesInvoiceExpenses).values(withTenantId(ctx.tenantId, {
          invoiceId: invId, currencyCode: e.currencyCode, exchangeRate: e.exchangeRate, amount: e.amount, creditAccountId: e.creditAccountId, notes: e.notes,
        }) as any);
      }
      if (!postNow) {
        return { success: true, id: invId, number };
      }
      await postSalesInvoiceJournal(db, ctx.tenantId, ctx.user.id, {
        number, date: input.date, paymentType: input.paymentType, subtotal: input.subtotal, discount: input.discount,
        tax: input.tax, total: input.total, costCenterId: input.costCenterId, customerName: customer?.name,
        cashAmount: settledCash, bankAmount: settledBank, bankAccountId: input.bankAccountId,
        taxes: input.taxes, expenses: input.expenses,
      });
      await postSalesCogsJournal(db, ctx.tenantId, ctx.user.id, {
        number, date: input.date, costCenterId: input.costCenterId,
        items: input.items.map((it) => ({ itemId: it.itemId, quantity: it.quantity })),
      });
      if (!isCash || paidTotal < Number(input.total)) {
        await recalculateCustomerBalance(db, ctx.tenantId, input.customerId);
      }
      return { success: true, id: invId, number };
    }),
    lastPriceToCustomer: protectedProcedure.input(z.object({
      customerId: z.number(),
      itemId: z.number(),
    })).query(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "sales", "saleInvoice", "viewDocList");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db.select({
        price: salesInvoiceItems.price,
        date: salesInvoices.date,
        number: salesInvoices.number,
      }).from(salesInvoiceItems)
        .innerJoin(salesInvoices, eq(salesInvoiceItems.invoiceId, salesInvoices.id))
        .where(tenantWhere(salesInvoiceItems, ctx.tenantId, and(
          eq(salesInvoices.customerId, input.customerId),
          eq(salesInvoiceItems.itemId, input.itemId),
        )))
        .orderBy(desc(salesInvoices.date), desc(salesInvoices.id))
        .limit(1);
      return row ?? null;
    }),
  }),
  orders: router({
    list: protectedProcedure.input(z.object({ page: z.number().default(1), limit: z.number().default(20) })).query(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "sales", "saleOrder", "viewDocList");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
      const offset = (input.page - 1) * input.limit;
      const scopeFilters = [
        scopeWarehouseFilter(salesOrders, scope),
        scopeBranchFilter(customers, scope),
      ].filter(Boolean);
      const whereClause = tenantWhere(salesOrders, ctx.tenantId, ...(scopeFilters.length ? [and(...scopeFilters)] : []));
      const rows = await db.select({
        id: salesOrders.id,
        number: salesOrders.number,
        date: salesOrders.date,
        total: salesOrders.total,
        status: salesOrders.status,
        customerName: customers.name,
      }).from(salesOrders)
        .where(whereClause)
        .leftJoin(customers, eq(salesOrders.customerId, customers.id))
        .orderBy(desc(salesOrders.createdAt)).limit(input.limit).offset(offset);
      const [total] = await db.select({ count: count() }).from(salesOrders).where(whereClause);
      return { rows, total: total.count };
    }),
    byId: protectedProcedure.input(z.number()).query(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "sales", "saleOrder", "viewDoc");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
      const [order] = await db.select().from(salesOrders).where(tenantWhere(salesOrders, ctx.tenantId, eq(salesOrders.id, input)));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      assertWarehouseAccess(scope, order.warehouseId);
      const [customer] = await db.select({ name: customers.name, phone: customers.phone, branchId: customers.branchId }).from(customers)
        .where(tenantWhere(customers, ctx.tenantId, eq(customers.id, order.customerId)));
      assertEntityBranchAccess(scope, customer?.branchId);
      const orderItems = await db.select({
        id: salesOrderItems.id,
        itemId: salesOrderItems.itemId,
        quantity: salesOrderItems.quantity,
        price: salesOrderItems.price,
        discount: salesOrderItems.discount,
        tax: salesOrderItems.tax,
        total: salesOrderItems.total,
        itemName: items.name,
        itemCode: items.code,
        itemUnit: items.unit,
      }).from(salesOrderItems)
        .leftJoin(items, eq(salesOrderItems.itemId, items.id))
        .where(tenantWhere(salesOrderItems, ctx.tenantId, eq(salesOrderItems.orderId, input)));
      const [warehouse] = order.warehouseId
        ? await db.select({ name: warehouses.name }).from(warehouses)
          .where(tenantWhere(warehouses, ctx.tenantId, eq(warehouses.id, order.warehouseId)))
        : [null];
      let convertedInvoice: { id: number; number: string } | null = null;
      if (order.convertedInvoiceId) {
        const [inv] = await db.select({ id: salesInvoices.id, number: salesInvoices.number }).from(salesInvoices)
          .where(tenantWhere(salesInvoices, ctx.tenantId, eq(salesInvoices.id, order.convertedInvoiceId)));
        convertedInvoice = inv ?? null;
      }
      return {
        ...order,
        customerName: customer?.name || "",
        customerPhone: customer?.phone || "",
        warehouseName: warehouse?.name || "",
        items: orderItems,
        convertedInvoice,
      };
    }),
    create: protectedProcedure.input(z.object({
      customerId: z.number(),
      date: z.string(),
      expectedDate: z.string().optional(),
      warehouseId: z.number().optional(),
      notes: z.string().optional(),
      items: z.array(z.object({
        itemId: z.number(),
        quantity: z.string(),
        unitPrice: z.string(),
        notes: z.string().optional(),
      })),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "sales", "saleOrder", "add");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertDateNotInClosedPeriod(db, ctx.tenantId, input.date);
      const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
      const [customer] = await db.select({ branchId: customers.branchId }).from(customers)
        .where(tenantWhere(customers, ctx.tenantId, eq(customers.id, input.customerId)));
      if (customer) assertEntityBranchAccess(scope, customer.branchId);
      assertWarehouseAccess(scope, input.warehouseId);
      if (scope.warehouseIds?.length && input.warehouseId == null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "يجب اختيار مخزن ضمن نطاقك" });
      }
      const [countResult] = await db.select({ count: count() }).from(salesOrders).where(tenantWhere(salesOrders, ctx.tenantId));
      const number = `SO-${String(countResult.count + 1).padStart(5, "0")}`;
      const total = input.items.reduce((s, it) => s + (Number(it.quantity) * Number(it.unitPrice)), 0);
      const [result] = await db.insert(salesOrders).values(withTenantId(ctx.tenantId, {
        number, customerId: input.customerId,
        date: input.date as any,
        expectedDate: input.expectedDate as any,
        warehouseId: input.warehouseId,
        total: String(total),
        notes: input.notes,
        status: "draft",
      }) as any);
      const orderId = (result as any).insertId;
      for (const item of input.items) {
        await db.insert(salesOrderItems).values(withTenantId(ctx.tenantId, {
          orderId,
          itemId: item.itemId,
          quantity: item.quantity,
          price: item.unitPrice,
          discount: "0",
          tax: "0",
          total: String(Number(item.quantity) * Number(item.unitPrice)),
        }) as any);
      }
      return { success: true, id: orderId, number };
    }),
    approve: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "sales", "saleOrder", "approve");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
      const [order] = await db.select().from(salesOrders).where(tenantWhere(salesOrders, ctx.tenantId, eq(salesOrders.id, input)));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      assertWarehouseAccess(scope, order.warehouseId);
      const [customer] = await db.select({ branchId: customers.branchId }).from(customers)
        .where(tenantWhere(customers, ctx.tenantId, eq(customers.id, order.customerId)));
      assertEntityBranchAccess(scope, customer?.branchId);
      await db.update(salesOrders).set({ status: "confirmed" } as any).where(tenantWhere(salesOrders, ctx.tenantId, eq(salesOrders.id, input)));
      return { success: true };
    }),
    unapprove: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "sales", "saleOrder", "unapprove");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [order] = await db.select().from(salesOrders).where(tenantWhere(salesOrders, ctx.tenantId, eq(salesOrders.id, input)));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      if (order.status !== "confirmed") throw new TRPCError({ code: "BAD_REQUEST", message: "الطلب ليس معتمداً أصلاً" });
      if (order.convertedInvoiceId) throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن فك اعتماد طلب تم تحويله لفاتورة بالفعل" });
      await db.update(salesOrders).set({ status: "draft" } as any).where(tenantWhere(salesOrders, ctx.tenantId, eq(salesOrders.id, input)));
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      customerId: z.number(),
      date: z.string(),
      expectedDate: z.string().optional(),
      warehouseId: z.number().optional(),
      notes: z.string().optional(),
      items: z.array(z.object({
        itemId: z.number(),
        quantity: z.string(),
        unitPrice: z.string(),
        notes: z.string().optional(),
      })),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "sales", "saleOrder", "edit");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [order] = await db.select().from(salesOrders).where(tenantWhere(salesOrders, ctx.tenantId, eq(salesOrders.id, input.id)));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      if (order.status !== "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن تعديل طلب غير معلق — فك الاعتماد أولاً" });
      await assertDateNotInClosedPeriod(db, ctx.tenantId, input.date);
      const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
      const [customer] = await db.select({ branchId: customers.branchId }).from(customers)
        .where(tenantWhere(customers, ctx.tenantId, eq(customers.id, input.customerId)));
      if (customer) assertEntityBranchAccess(scope, customer.branchId);
      assertWarehouseAccess(scope, input.warehouseId);
      const total = input.items.reduce((s, it) => s + (Number(it.quantity) * Number(it.unitPrice)), 0);
      await db.update(salesOrders).set({
        customerId: input.customerId,
        date: input.date as any,
        expectedDate: input.expectedDate as any,
        warehouseId: input.warehouseId,
        total: String(total),
        notes: input.notes,
      } as any).where(tenantWhere(salesOrders, ctx.tenantId, eq(salesOrders.id, input.id)));
      await db.delete(salesOrderItems).where(tenantWhere(salesOrderItems, ctx.tenantId, eq(salesOrderItems.orderId, input.id)));
      for (const item of input.items) {
        await db.insert(salesOrderItems).values(withTenantId(ctx.tenantId, {
          orderId: input.id, itemId: item.itemId, quantity: item.quantity, price: item.unitPrice,
          discount: "0", tax: "0", total: String(Number(item.quantity) * Number(item.unitPrice)),
        }) as any);
      }
      return { success: true };
    }),
    convertToInvoice: protectedProcedure.input(z.object({
      orderId: z.number(),
      paymentType: z.enum(["cash", "credit"]).optional(),
      date: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "sales", "saleOrder", "edit");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
      const [order] = await db.select().from(salesOrders).where(tenantWhere(salesOrders, ctx.tenantId, eq(salesOrders.id, input.orderId)));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      assertWarehouseAccess(scope, order.warehouseId);
      const [customer] = await db.select({ branchId: customers.branchId }).from(customers)
        .where(tenantWhere(customers, ctx.tenantId, eq(customers.id, order.customerId)));
      assertEntityBranchAccess(scope, customer?.branchId);
      const { convertSalesOrderToInvoice } = await import("./order-conversion");
      return convertSalesOrderToInvoice(db, ctx.tenantId, ctx.user?.id, input.orderId, {
        paymentType: input.paymentType,
        date: input.date,
      });
    }),
    cancel: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "sales", "saleOrder", "deleteCancel");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
      const [order] = await db.select().from(salesOrders).where(tenantWhere(salesOrders, ctx.tenantId, eq(salesOrders.id, input)));
      if (!order) throw new TRPCError({ code: "NOT_FOUND" });
      assertWarehouseAccess(scope, order.warehouseId);
      const [customer] = await db.select({ branchId: customers.branchId }).from(customers)
        .where(tenantWhere(customers, ctx.tenantId, eq(customers.id, order.customerId)));
      assertEntityBranchAccess(scope, customer?.branchId);
      if (order.convertedInvoiceId) throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن إلغاء طلب تم تحويله لفاتورة" });
      if (order.status === "cancelled") throw new TRPCError({ code: "BAD_REQUEST", message: "الطلب ملغي مسبقاً" });
      await db.update(salesOrders).set({ status: "cancelled" } as any).where(tenantWhere(salesOrders, ctx.tenantId, eq(salesOrders.id, input)));
      return { success: true };
    }),
  }),
  returns: router({
    list: protectedProcedure.input(z.object({ page: z.number().default(1), limit: z.number().default(20) })).query(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "sales", "saleReturnInvoice", "viewDocList");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;
      const rows = await db.select({
        id: salesReturns.id,
        number: salesReturns.number,
        date: salesReturns.date,
        total: salesReturns.total,
        status: salesReturns.status,
        customerName: customers.name,
      }).from(salesReturns)
        .where(tenantWhere(salesReturns, ctx.tenantId))
        .leftJoin(customers, eq(salesReturns.customerId, customers.id))
        .orderBy(desc(salesReturns.createdAt)).limit(input.limit).offset(offset);
      const [total] = await db.select({ count: count() }).from(salesReturns).where(tenantWhere(salesReturns, ctx.tenantId));
      return { rows, total: total.count };
    }),
    create: protectedProcedure.input(z.object({
      customerId: z.number(),
      invoiceId: z.number().optional(),
      date: z.string(),
      reason: z.string().optional(),
      notes: z.string().optional(),
      warehouseId: z.number().optional(),
      items: z.array(z.object({
        itemId: z.number(),
        quantity: z.string(),
        unitPrice: z.string(),
      })),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "sales", "saleReturnInvoice", "add");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertDateNotInClosedPeriod(db, ctx.tenantId, input.date);
      const [countResult] = await db.select({ count: count() }).from(salesReturns).where(tenantWhere(salesReturns, ctx.tenantId));
      const number = `SR-${String(countResult.count + 1).padStart(5, "0")}`;
      const total = input.items.reduce((s, it) => s + (Number(it.quantity) * Number(it.unitPrice)), 0);
      const [result] = await db.insert(salesReturns).values(withTenantId(ctx.tenantId, {
        number, customerId: input.customerId,
        invoiceId: input.invoiceId,
        date: input.date as any,
        total: String(total),
        reason: input.reason,
        notes: input.notes,
        status: "confirmed",
      }) as any);
      const retId = (result as any).insertId;
      for (const item of input.items) {
        const lineTotal = Number(item.quantity) * Number(item.unitPrice);
        await db.insert(salesReturnItems).values(withTenantId(ctx.tenantId, {
          returnId: retId,
          itemId: item.itemId,
          quantity: item.quantity,
          price: item.unitPrice,
          total: String(lineTotal),
        }) as any);
        const { applyStockMovement } = await import("./inventory-stock");
        await applyStockMovement(db, ctx.tenantId, {
          itemId: item.itemId,
          quantity: item.quantity,
          direction: "in",
          warehouseId: input.warehouseId,
        });
      }
      const [customer] = await db.select({ name: customers.name }).from(customers)
        .where(tenantWhere(customers, ctx.tenantId, eq(customers.id, input.customerId)));
      await postSalesReturnJournal(db, ctx.tenantId, ctx.user.id, {
        number,
        date: input.date,
        total: String(total),
        customerName: customer?.name,
      });
      await postSalesReturnCogsJournal(db, ctx.tenantId, ctx.user.id, {
        number,
        date: input.date,
        items: input.items.map((it) => ({ itemId: it.itemId, quantity: it.quantity })),
      });
      await recalculateCustomerBalance(db, ctx.tenantId, input.customerId);
      return { success: true, id: retId, number };
    }),
  }),
});

// ===================== EMPLOYEES =====================
const hrRouter = router({
  employees: router({
    list: protectedProcedure.input(z.object({
      search: z.string().optional(),
      departmentId: z.number().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    })).query(async ({ ctx, input }) => {
      // مصدر بيانات مشترك (اختيار موظف) في الحضور والسلف — مش مقيّد هنا.
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;
      const rows = await db.select({
        id: employees.id,
        code: employees.code,
        name: employees.name,
        phone: employees.phone,
        basicSalary: employees.basicSalary,
        status: employees.status,
        hireDate: employees.hireDate,
        departmentName: departments.name,
        jobTitleName: jobTitles.name,
      }).from(employees)
        .where(tenantWhere(employees, ctx.tenantId))
        .leftJoin(departments, eq(employees.departmentId, departments.id))
        .leftJoin(jobTitles, eq(employees.jobTitleId, jobTitles.id))
        .orderBy(employees.name).limit(input.limit).offset(offset);
      const [total] = await db.select({ count: count() }).from(employees).where(tenantWhere(employees, ctx.tenantId));
      return { rows, total: total.count };
    }),
    byId: protectedProcedure.input(z.number()).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db.select().from(employees).where(tenantWhere(employees, ctx.tenantId, eq(employees.id, input)));
      return row;
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1),
      code: z.string().optional(),
      nationalId: z.string().optional(),
      departmentId: z.number().optional(),
      jobTitleId: z.number().optional(),
      hireDate: z.string().optional(),
      birthDate: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      basicSalary: z.string().optional(),
      bankAccount: z.string().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "hr", "employees", "add");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      try {
        await db.insert(employees).values(withTenantId(ctx.tenantId, compactRow(input as Record<string, unknown>)) as any);
      } catch (e: unknown) {
        throw new TRPCError({ code: "BAD_REQUEST", message: dbErrorMessage(e, "فشل إضافة الموظف") });
      }
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1),
      code: z.string().optional(),
      nationalId: z.string().optional(),
      departmentId: z.number().optional(),
      jobTitleId: z.number().optional(),
      hireDate: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      basicSalary: z.string().optional(),
      status: z.enum(["active", "inactive", "terminated"]).optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "hr", "employees", "edit");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(employees).set(data as any).where(tenantWhere(employees, ctx.tenantId, eq(employees.id, id)));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "hr", "employees", "deleteCancel");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(employees).where(tenantWhere(employees, ctx.tenantId, eq(employees.id, input)));
      return { success: true };
    }),
  }),
  departments: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      // مصدر بيانات مشترك (اختيار إدارة) في شاشة الموظفين — مش مقيّد هنا.
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(departments).where(tenantWhere(departments, ctx.tenantId)).orderBy(departments.name);
    }),
    create: protectedProcedure.input(z.object({ name: z.string().min(1), description: z.string().optional(), parentId: z.number().optional() })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "hr", "departments", "add");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(departments).values(withTenantId(ctx.tenantId, input) as any);
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({ id: z.number(), name: z.string().min(1), description: z.string().optional() })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "hr", "departments", "edit");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(departments).set(data as any).where(tenantWhere(departments, ctx.tenantId, eq(departments.id, id)));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "hr", "departments", "deleteCancel");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(departments).where(tenantWhere(departments, ctx.tenantId, eq(departments.id, input)));
      return { success: true };
    }),
  }),
  jobTitles: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      // مصدر بيانات مشترك (اختيار وظيفة) في شاشة الموظفين — مش مقيّد هنا.
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(jobTitles).where(tenantWhere(jobTitles, ctx.tenantId)).orderBy(jobTitles.name);
    }),
    create: protectedProcedure.input(z.object({ name: z.string().min(1) })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "hr", "jobs", "add");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(jobTitles).values(withTenantId(ctx.tenantId, input) as any);
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({ id: z.number(), name: z.string().min(1) })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "hr", "jobs", "edit");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(jobTitles).set({ name: input.name }).where(tenantWhere(jobTitles, ctx.tenantId, eq(jobTitles.id, input.id)));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "hr", "jobs", "deleteCancel");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(jobTitles).where(tenantWhere(jobTitles, ctx.tenantId, eq(jobTitles.id, input)));
      return { success: true };
    }),
  }),
  attendance: router({
    list: protectedProcedure.input(z.object({
      employeeId: z.number().optional(),
      date: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(30),
    })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;
      const rows = await db.select({
        id: attendance.id,
        date: attendance.date,
        checkIn: attendance.checkIn,
        checkOut: attendance.checkOut,
        status: attendance.status,
        notes: attendance.notes,
        employeeName: employees.name,
      }).from(attendance)
        .where(tenantWhere(attendance, ctx.tenantId))
        .leftJoin(employees, eq(attendance.employeeId, employees.id))
        .orderBy(desc(attendance.date)).limit(input.limit).offset(offset);
      return rows;
    }),
    create: protectedProcedure.input(z.object({
      employeeId: z.number(),
      date: z.string(),
      checkIn: z.string().optional(),
      checkOut: z.string().optional(),
      status: z.enum(["present", "absent", "late", "leave", "holiday"]).default("present"),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "hr", "attendance", "add");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(attendance).values(withTenantId(ctx.tenantId, input) as any);
      return { success: true };
    }),
    getByDate: protectedProcedure.input(z.object({ date: z.string() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db.select({
        id: attendance.id,
        employeeId: attendance.employeeId,
        date: attendance.date,
        checkIn: attendance.checkIn,
        checkOut: attendance.checkOut,
        overtime: attendance.overtime,
        status: attendance.status,
        notes: attendance.notes,
      }).from(attendance).where(tenantWhere(attendance, ctx.tenantId, sql`DATE(${attendance.date}) = ${input.date}`));
      return rows;
    }),
    saveDay: protectedProcedure.input(z.object({
      date: z.string(),
      records: z.array(z.object({
        employeeId: z.number(),
        status: z.enum(["present", "absent", "late", "half_day", "holiday"]),
        checkIn: z.string().optional(),
        checkOut: z.string().optional(),
        overtime: z.number().default(0),
        notes: z.string().optional(),
      })),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "hr", "attendance", "add");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Delete existing records for the day then re-insert
      await db.delete(attendance).where(tenantWhere(attendance, ctx.tenantId, eq(attendance.date, new Date(input.date))));
      if (input.records.length > 0) {
        await db.insert(attendance).values(
          input.records.map(r => withTenantId(ctx.tenantId, {
            employeeId: r.employeeId,
            date: new Date(input.date),
            checkIn: r.checkIn,
            checkOut: r.checkOut,
            overtime: r.overtime,
            status: r.status as any,
            notes: r.notes,
          }))
        );
      }
      return { success: true, count: input.records.length };
    }),
  }),
  payroll: router({
    list: protectedProcedure.input(z.object({ month: z.number(), year: z.number() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select({
        id: payroll.id,
        employeeId: payroll.employeeId,
        month: payroll.month,
        year: payroll.year,
        basicSalary: payroll.basicSalary,
        allowances: payroll.allowances,
        deductions: payroll.deductions,
        advances: payroll.advances,
        netSalary: payroll.netSalary,
        status: payroll.status,
        paidDate: payroll.paidDate,
        notes: payroll.notes,
        employeeName: employees.name,
        jobTitle: jobTitles.name,
      }).from(payroll)
        .leftJoin(employees, eq(payroll.employeeId, employees.id))
        .leftJoin(jobTitles, eq(employees.jobTitleId, jobTitles.id))
        .where(tenantWhere(payroll, ctx.tenantId, and(eq(payroll.month, input.month), eq(payroll.year, input.year))));
    }),
    calculate: protectedProcedure.input(z.object({ month: z.number().min(1).max(12), year: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return calculateMonthPayroll(db, ctx.tenantId, input.month, input.year);
    }),
    payMonth: protectedProcedure.input(z.object({ month: z.number().min(1).max(12), year: z.number() })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "hr", "salaryAccount", "approve");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const result = await payMonthPayroll(db, ctx.tenantId, input.month, input.year);
      if (result.totalNet > 0) {
        await postPayrollJournal(db, ctx.tenantId, ctx.user.id, {
          month: input.month,
          year: input.year,
          totalNet: result.totalNet,
          payDate: result.payDate,
        });
      }
      return result;
    }),
    create: protectedProcedure.input(z.object({
      employeeId: z.number(),
      month: z.number(),
      year: z.number(),
      basicSalary: z.string(),
      allowances: z.string().default("0"),
      deductions: z.string().default("0"),
      advances: z.string().default("0"),
      tax: z.string().default("0"),
      netSalary: z.string(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "hr", "salaryAccount", "add");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(payroll).values(withTenantId(ctx.tenantId, input) as any);
      return { success: true };
    }),
  }),
  advances: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await assertEntityAction(ctx, "hr", "employeeTransactions", "viewDocList");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select({
        id: salaryAdvances.id,
        amount: salaryAdvances.amount,
        date: salaryAdvances.date,
        reason: salaryAdvances.reason,
        status: salaryAdvances.status,
        employeeName: employees.name,
      }).from(salaryAdvances)
        .where(tenantWhere(salaryAdvances, ctx.tenantId))
        .leftJoin(employees, eq(salaryAdvances.employeeId, employees.id))
        .orderBy(desc(salaryAdvances.createdAt));
    }),
    create: protectedProcedure.input(z.object({
      employeeId: z.number(),
      amount: z.string(),
      date: z.string(),
      reason: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "hr", "employeeTransactions", "add");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(salaryAdvances).values(withTenantId(ctx.tenantId, input) as any);
      return { success: true };
    }),
    approve: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "hr", "employeeTransactions", "approve");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(salaryAdvances).set({ status: "approved" } as any).where(tenantWhere(salaryAdvances, ctx.tenantId, eq(salaryAdvances.id, input)));
      return { success: true };
    }),
  }),
});

// ===================== ACCOUNTS =====================
const accountsRouter = router({
  chart: protectedProcedure.query(async ({ ctx }) => {
    // مصدر بيانات مشترك (اختيار حساب) في قيود اليومية وتحويل الأموال والتقارير — مش مقيّد هنا.
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { ensureDefaultAccounts } = await import("./auto-journal");
    await ensureDefaultAccounts(db, ctx.tenantId);
    return db.select().from(accounts).where(tenantWhere(accounts, ctx.tenantId, eq(accounts.isActive, true))).orderBy(accounts.code);
  }),
  create: protectedProcedure.input(z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
    parentId: z.number().optional(),
    isParent: z.boolean().optional(),
    notes: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "accounts", "chartOfAccounts", "add");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [inserted] = await db.insert(accounts).values(withTenantId(ctx.tenantId, compactRow(input as Record<string, unknown>)) as any);
    const accountId = Number((inserted as { insertId?: number }).insertId ?? 0);
    // أي حساب فرعي تحت «البنوك» يظهر تلقائياً في التوجيه والمعاملات البنكية
    if (accountId && input.parentId && !input.isParent) {
      const { findBanksParentAccount, ensureBankAccountForGlAccount } = await import("./bank-accounts-sync");
      const banksParent = await findBanksParentAccount(db, ctx.tenantId);
      if (banksParent) {
        const all = await db
          .select({ id: accounts.id, parentId: accounts.parentId })
          .from(accounts)
          .where(tenantWhere(accounts, ctx.tenantId));
        let pid: number | null | undefined = input.parentId;
        let underBanks = false;
        const seen = new Set<number>();
        while (pid != null && !seen.has(pid)) {
          seen.add(pid);
          if (pid === banksParent.id) {
            underBanks = true;
            break;
          }
          pid = all.find((a) => a.id === pid)?.parentId ?? null;
        }
        if (underBanks) {
          await ensureBankAccountForGlAccount(db, ctx.tenantId, {
            id: accountId,
            name: input.name,
            code: input.code,
          });
        }
      }
    }
    return { success: true, id: accountId };
  }),
  reseedFromTemplate: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { reseedChartFromTemplate } = await import("./auto-journal");
    return reseedChartFromTemplate(db, ctx.tenantId);
  }),
  journal: router({
    list: protectedProcedure.input(z.object({ page: z.number().default(1), limit: z.number().default(20), reference: z.string().optional() })).query(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "accounts", "journalEntry", "viewDocList");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;
      const refFilter = input.reference ? eq(journalEntries.reference, input.reference) : undefined;
      const rows = await db.select({
        id: journalEntries.id,
        number: journalEntries.number,
        date: journalEntries.date,
        description: journalEntries.description,
        reference: journalEntries.reference,
        status: journalEntries.status,
        createdAt: journalEntries.createdAt,
        totalDebit: sql<string>`COALESCE((SELECT SUM(${journalEntryLines.debit}) FROM ${journalEntryLines} WHERE ${journalEntryLines.entryId} = ${journalEntries.id}), 0)`,
        totalCredit: sql<string>`COALESCE((SELECT SUM(${journalEntryLines.credit}) FROM ${journalEntryLines} WHERE ${journalEntryLines.entryId} = ${journalEntries.id}), 0)`,
      }).from(journalEntries)
        .where(tenantWhere(journalEntries, ctx.tenantId, refFilter))
        .orderBy(desc(journalEntries.createdAt))
        .limit(input.limit)
        .offset(offset);
      const [total] = await db.select({ count: count() }).from(journalEntries).where(tenantWhere(journalEntries, ctx.tenantId, refFilter));
      return { rows, total: total.count };
    }),
    byId: protectedProcedure.input(z.number()).query(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "accounts", "journalEntry", "viewDoc");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [entry] = await db.select().from(journalEntries).where(tenantWhere(journalEntries, ctx.tenantId, eq(journalEntries.id, input)));
      if (!entry) throw new TRPCError({ code: "NOT_FOUND" });
      const lines = await db.select({
        id: journalEntryLines.id,
        accountId: journalEntryLines.accountId,
        accountCode: accounts.code,
        accountName: accounts.name,
        debit: journalEntryLines.debit,
        credit: journalEntryLines.credit,
        description: journalEntryLines.description,
        costCenterId: journalEntryLines.costCenterId,
        costCenterName: costCenters.name,
      }).from(journalEntryLines)
        .innerJoin(accounts, eq(journalEntryLines.accountId, accounts.id))
        .leftJoin(costCenters, eq(journalEntryLines.costCenterId, costCenters.id))
        .where(eq(journalEntryLines.entryId, input));
      return { entry, lines };
    }),
    create: protectedProcedure.input(z.object({
      date: z.string(),
      description: z.string().optional(),
      reference: z.string().optional(),
      lines: z.array(z.object({
        accountId: z.number(),
        debit: z.string().default("0"),
        credit: z.string().default("0"),
        description: z.string().optional(),
        costCenterId: z.number().optional(),
      })),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "accounts", "journalEntry", "add");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertDateNotInClosedPeriod(db, ctx.tenantId, input.date);
      const [countResult] = await db.select({ count: count() }).from(journalEntries).where(tenantWhere(journalEntries, ctx.tenantId));
      const number = `JE-${String(countResult.count + 1).padStart(5, "0")}`;
      const { companyRequiresApproval, userBypassesApproval, queueDocumentApproval } = await import("./document-approval");
      const needsApproval =
        (await companyRequiresApproval(db, ctx.tenantId)) &&
        !userBypassesApproval(ctx.saasUser?.role ?? "user");

      const [result] = await db.insert(journalEntries).values(withTenantId(ctx.tenantId, {
        number,
        date: input.date as any,
        description: input.description,
        reference: input.reference,
        createdBy: ctx.user.id,
        status: needsApproval ? "draft" : "posted",
      }) as any);
      const entryId = (result as any).insertId;
      for (const line of input.lines) {
        await db.insert(journalEntryLines).values(withTenantId(ctx.tenantId, {
          entryId,
          accountId: line.accountId,
          debit: line.debit,
          credit: line.credit,
          description: line.description,
          costCenterId: line.costCenterId,
        }) as any);
      }
      if (needsApproval) {
        await queueDocumentApproval(db, ctx.tenantId, {
          type: "journal_entry",
          id: entryId,
          number,
          requestedBy: ctx.user?.id,
        });
        return { success: true, id: entryId, number, pendingApproval: true };
      }
      return { success: true, id: entryId, number };
    }),
    unapprove: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "accounts", "journalEntry", "unapprove");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [entry] = await db.select().from(journalEntries).where(tenantWhere(journalEntries, ctx.tenantId, eq(journalEntries.id, input)));
      if (!entry) throw new TRPCError({ code: "NOT_FOUND" });
      if (entry.status !== "posted") throw new TRPCError({ code: "BAD_REQUEST", message: "القيد ليس معتمداً أصلاً" });
      if (entry.reference?.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "هذا القيد تلقائي وتابع لمستند آخر — فك اعتماد المستند نفسه بدل القيد" });
      }
      await assertDateNotInClosedPeriod(db, ctx.tenantId, toDateStr(entry.date));
      await db.update(journalEntries).set({ status: "draft" } as any).where(tenantWhere(journalEntries, ctx.tenantId, eq(journalEntries.id, input)));
      return { success: true };
    }),
  }),
  taxes: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(taxes).where(tenantWhere(taxes, ctx.tenantId)).orderBy(taxes.name);
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1),
      rate: z.string(),
      glAccountId: z.number().optional(),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "accounts", "taxes", "add");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(taxes).values(withTenantId(ctx.tenantId, input) as any);
      return { success: true };
    }),
  }),
});

// ===================== CASH TRANSACTIONS =====================
const cashRouter = router({
  list: protectedProcedure.input(z.object({
    type: z.string().optional(),
    page: z.number().default(1),
    limit: z.number().default(20),
  })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
    const offset = (input.page - 1) * input.limit;
    const typeFilter = input.type ? eq(cashTransactions.type, input.type as any) : undefined;
    const scopeFilter = scopeContactTransactionFilter(scope, cashTransactions.customerId, customers.branchId);
    const where = tenantWhere(
      cashTransactions,
      ctx.tenantId,
      typeFilter,
      scopeFilter,
    );
    const rows = await db.select({
      id: cashTransactions.id,
      number: cashTransactions.number,
      type: cashTransactions.type,
      date: cashTransactions.date,
      amount: cashTransactions.amount,
      description: cashTransactions.description,
      reference: cashTransactions.reference,
      customerId: cashTransactions.customerId,
      supplierId: cashTransactions.supplierId,
      createdAt: cashTransactions.createdAt,
    }).from(cashTransactions)
      .leftJoin(customers, eq(cashTransactions.customerId, customers.id))
      .where(where)
      .orderBy(desc(cashTransactions.createdAt))
      .limit(input.limit)
      .offset(offset);
    const [total] = await db.select({ count: count() }).from(cashTransactions)
      .leftJoin(customers, eq(cashTransactions.customerId, customers.id))
      .where(where);
    return { rows, total: total.count };
  }),
  create: protectedProcedure.input(z.object({
    type: z.enum(["receive", "pay", "receive_customer", "pay_supplier", "pay_customer"]),
    date: z.string(),
    customerId: z.number().optional(),
    supplierId: z.number().optional(),
    amount: z.string(),
    description: z.string().optional(),
    reference: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    // "type" بيحدد أي عنصر من الأربعة في قسم "معاملات نقدية" — نفس الـprocedure بيخدمهم كلهم.
    const cashEntityForType: Record<string, string> = {
      receive: "cashReceipt",
      receive_customer: "cashReceiptFromCustomer",
      pay: "cashPayment",
      pay_supplier: "cashPaymentToSupplier",
      pay_customer: "cashPayment",
    };
    await assertEntityAction(ctx, "cash", cashEntityForType[input.type] || "cashPayment", "add");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    if ((input.type === "receive_customer" || input.type === "pay_customer") && !input.customerId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "يجب اختيار العميل" });
    }
    if (input.type === "pay_supplier" && !input.supplierId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "يجب اختيار المورد" });
    }
    await assertDateNotInClosedPeriod(db, ctx.tenantId, input.date);
    const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
    if (input.customerId) {
      const [customer] = await db.select({ name: customers.name, branchId: customers.branchId }).from(customers)
        .where(tenantWhere(customers, ctx.tenantId, eq(customers.id, input.customerId)));
      assertEntityBranchAccess(scope, customer?.branchId);
    }
    const [countResult] = await db.select({ count: count() }).from(cashTransactions).where(tenantWhere(cashTransactions, ctx.tenantId));
    const number = `CT-${String(countResult.count + 1).padStart(5, "0")}`;
    await db.insert(cashTransactions).values(withTenantId(ctx.tenantId, { number, ...input, createdBy: ctx.user.id }) as any);
    let customerName: string | undefined;
    let supplierName: string | undefined;
    if (input.customerId) {
      const [c] = await db.select({ name: customers.name }).from(customers)
        .where(tenantWhere(customers, ctx.tenantId, eq(customers.id, input.customerId)));
      customerName = c?.name;
    }
    if (input.supplierId) {
      const [s] = await db.select({ name: suppliers.name }).from(suppliers)
        .where(tenantWhere(suppliers, ctx.tenantId, eq(suppliers.id, input.supplierId)));
      supplierName = s?.name;
    }
    await postCashTransactionJournal(db, ctx.tenantId, ctx.user.id, {
      number,
      type: input.type,
      date: input.date,
      amount: input.amount,
      description: input.description,
      customerName,
      supplierName,
    });

    let allocations: { invoiceNumber: string; amount: string }[] | undefined;
    let unallocated: string | undefined;
    if (input.type === "receive_customer" && input.customerId) {
      const result = await allocateCustomerPaymentFifo(db, ctx.tenantId, input.customerId, input.amount, {
        referenceInvoiceNumber: input.reference,
      });
      allocations = result.allocations;
      unallocated = result.unallocated;
    } else if (input.type === "pay_supplier" && input.supplierId) {
      const result = await allocateSupplierPaymentFifo(db, ctx.tenantId, input.supplierId, input.amount, {
        referenceInvoiceNumber: input.reference,
      });
      allocations = result.allocations;
      unallocated = result.unallocated;
    }

    return { success: true, number, allocations, unallocated };
  }),
});

// ===================== BANK TRANSACTIONS =====================
const bankRouter = router({
  accounts: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { syncBankAccountsFromChart } = await import("./bank-accounts-sync");
      await syncBankAccountsFromChart(db, ctx.tenantId);
      return db
        .select()
        .from(bankAccounts)
        .where(tenantWhere(bankAccounts, ctx.tenantId, eq(bankAccounts.isActive, true)))
        .orderBy(bankAccounts.name);
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1),
      bankName: z.string().optional(),
      accountNumber: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const row = compactRow(input as Record<string, unknown>);
      const [inserted] = await db.insert(bankAccounts).values(withTenantId(ctx.tenantId, row) as any);
      const bankId = Number((inserted as { insertId?: number }).insertId ?? 0);
      if (bankId) {
        const { ensureGlAccountForBankAccount } = await import("./bank-accounts-sync");
        await ensureGlAccountForBankAccount(db, ctx.tenantId, {
          id: bankId,
          name: input.name,
          accountNumber: input.accountNumber,
        });
      }
      return { success: true, id: bankId };
    }),
  }),
  transactions: router({
    list: protectedProcedure.input(z.object({
      type: z.enum(["deposit", "withdraw", "deposit_customer", "withdraw_supplier", "withdraw_customer"]).optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
      const offset = (input.page - 1) * input.limit;
      const typeFilter = input.type ? eq(bankTransactions.type, input.type as any) : undefined;
      const scopeFilter = scopeContactTransactionFilter(scope, bankTransactions.customerId, customers.branchId);
      const where = tenantWhere(bankTransactions, ctx.tenantId, typeFilter, scopeFilter);
      const rows = await db.select({
        id: bankTransactions.id,
        number: bankTransactions.number,
        type: bankTransactions.type,
        date: bankTransactions.date,
        amount: bankTransactions.amount,
        description: bankTransactions.description,
        reference: bankTransactions.reference,
        bankAccountId: bankTransactions.bankAccountId,
        customerId: bankTransactions.customerId,
        supplierId: bankTransactions.supplierId,
        createdAt: bankTransactions.createdAt,
      }).from(bankTransactions)
        .leftJoin(customers, eq(bankTransactions.customerId, customers.id))
        .where(where)
        .orderBy(desc(bankTransactions.createdAt))
        .limit(input.limit)
        .offset(offset);
      const [total] = await db.select({ count: count() }).from(bankTransactions)
        .leftJoin(customers, eq(bankTransactions.customerId, customers.id))
        .where(where);
      return { rows, total: total.count };
    }),
    create: protectedProcedure.input(z.object({
      type: z.enum(["deposit", "withdraw", "deposit_customer", "withdraw_supplier", "withdraw_customer"]),
      bankAccountId: z.number(),
      date: z.string(),
      customerId: z.number().optional(),
      supplierId: z.number().optional(),
      amount: z.string(),
      description: z.string().optional(),
      reference: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      // "type" بيحدد أي عنصر من عناصر قسم "معاملات بنكية".
      const bankEntityForType: Record<string, string> = {
        deposit: "bankDeposit",
        deposit_customer: "bankDepositFromCustomer",
        withdraw: "bankWithdrawal",
        withdraw_supplier: "bankWithdrawalToSupplier",
        withdraw_customer: "bankWithdrawal",
      };
      await assertEntityAction(ctx, "bank", bankEntityForType[input.type] || "bankWithdrawal", "add");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if ((input.type === "deposit_customer" || input.type === "withdraw_customer") && !input.customerId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "يجب اختيار العميل" });
      }
      if (input.type === "withdraw_supplier" && !input.supplierId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "يجب اختيار المورد" });
      }
      await assertDateNotInClosedPeriod(db, ctx.tenantId, input.date);
      const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
      if (input.customerId) {
        const [customer] = await db.select({ name: customers.name, branchId: customers.branchId }).from(customers)
          .where(tenantWhere(customers, ctx.tenantId, eq(customers.id, input.customerId)));
        assertEntityBranchAccess(scope, customer?.branchId);
      }
      const [countResult] = await db.select({ count: count() }).from(bankTransactions).where(tenantWhere(bankTransactions, ctx.tenantId));
      const number = `BT-${String(countResult.count + 1).padStart(5, "0")}`;
      await db.insert(bankTransactions).values(withTenantId(ctx.tenantId, { number, ...input, createdBy: ctx.user.id }) as any);
      let customerName: string | undefined;
      let supplierName: string | undefined;
      if (input.customerId) {
        const [c] = await db.select({ name: customers.name }).from(customers)
          .where(tenantWhere(customers, ctx.tenantId, eq(customers.id, input.customerId)));
        customerName = c?.name;
      }
      if (input.supplierId) {
        const [s] = await db.select({ name: suppliers.name }).from(suppliers)
          .where(tenantWhere(suppliers, ctx.tenantId, eq(suppliers.id, input.supplierId)));
        supplierName = s?.name;
      }
      await postBankTransactionJournal(db, ctx.tenantId, ctx.user.id, {
        number,
        type: input.type,
        date: input.date,
        amount: input.amount,
        description: input.description,
        customerName,
        supplierName,
        bankAccountId: input.bankAccountId,
      });

      let allocations: { invoiceNumber: string; amount: string }[] | undefined;
      let unallocated: string | undefined;
      if (input.type === "deposit_customer" && input.customerId) {
        const result = await allocateCustomerPaymentFifo(db, ctx.tenantId, input.customerId, input.amount, {
          referenceInvoiceNumber: input.reference,
        });
        allocations = result.allocations;
        unallocated = result.unallocated;
      } else if (input.type === "withdraw_supplier" && input.supplierId) {
        const result = await allocateSupplierPaymentFifo(db, ctx.tenantId, input.supplierId, input.amount, {
          referenceInvoiceNumber: input.reference,
        });
        allocations = result.allocations;
        unallocated = result.unallocated;
      }

      return { success: true, number, allocations, unallocated };
    }),
  }),
  checks: router({
    list: protectedProcedure.input(z.object({
      type: z.enum(["incoming", "outgoing"]).optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;
      const where = input.type ? eq(checks.type, input.type) : undefined;
      const rows = await db.select().from(checks).where(tenantWhere(checks, ctx.tenantId, where)).orderBy(desc(checks.createdAt)).limit(input.limit).offset(offset);
      const [total] = await db.select({ count: count() }).from(checks).where(tenantWhere(checks, ctx.tenantId, where));
      return { rows, total: total.count };
    }),
    create: protectedProcedure.input(z.object({
      checkNumber: z.string().min(1),
      type: z.enum(["incoming", "outgoing"]),
      bankAccountId: z.number().optional(),
      customerId: z.number().optional(),
      supplierId: z.number().optional(),
      amount: z.string(),
      dueDate: z.string(),
      date: z.string(),
      description: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "bank", input.type === "incoming" ? "checkIn" : "checkOut", "add");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [countResult] = await db.select({ count: count() }).from(checks).where(tenantWhere(checks, ctx.tenantId));
      const number = `CHK-${String(countResult.count + 1).padStart(5, "0")}`;
      return createCheckWithJournal(db, ctx.tenantId, ctx.user.id, { ...input, number });
    }),
    collect: protectedProcedure.input(z.object({
      id: z.number(),
      date: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [chk] = await db.select({ type: checks.type }).from(checks).where(tenantWhere(checks, ctx.tenantId, eq(checks.id, input.id))).limit(1);
      await assertEntityAction(ctx, "bank", chk?.type === "outgoing" ? "checkOut" : "checkIn", "approve");
      return clearCheck(db, ctx.tenantId, ctx.user.id, input.id, { date: input.date });
    }),
    bounce: protectedProcedure.input(z.object({
      id: z.number(),
      date: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [chk] = await db.select({ type: checks.type }).from(checks).where(tenantWhere(checks, ctx.tenantId, eq(checks.id, input.id))).limit(1);
      await assertEntityAction(ctx, "bank", chk?.type === "outgoing" ? "checkOut" : "checkIn", "deleteCancel");
      return bounceCheck(db, ctx.tenantId, ctx.user.id, input.id, { date: input.date });
    }),
    unapprove: protectedProcedure.input(z.object({
      id: z.number(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [chk] = await db.select({ type: checks.type }).from(checks).where(tenantWhere(checks, ctx.tenantId, eq(checks.id, input.id))).limit(1);
      await assertEntityAction(ctx, "bank", chk?.type === "outgoing" ? "checkOut" : "checkIn", "unapprove");
      try {
        return await unapproveCheck(db, ctx.tenantId, input.id);
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        throw new TRPCError({ code: "BAD_REQUEST", message: e instanceof Error ? e.message : "فشل فك الاعتماد" });
      }
    }),
  }),

  checkRouting: router({
    summary: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return routingSummaryCounts(db, ctx.tenantId);
    }),
    custodians: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db
        .select({
          id: appUsers.id,
          name: appUsers.name,
          email: appUsers.email,
          role: appUsers.role,
          isActive: appUsers.isActive,
        })
        .from(appUsers)
        .where(and(eq(appUsers.tenantId, ctx.tenantId!), eq(appUsers.isActive, true)))
        .orderBy(appUsers.name);
    }),
    list: protectedProcedure.input(z.object({
      filter: z.enum([
        "unrouted",
        "in_custody",
        "scheduled",
        "overdue_deposit",
        "at_bank",
        "completed",
        "all",
      ]).optional(),
      search: z.string().optional(),
      custodianUserId: z.number().optional(),
      bankAccountId: z.number().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
    })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return listCheckRoutings(db, ctx.tenantId, input);
    }),
    events: protectedProcedure.input(z.object({
      routingId: z.number(),
    })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return listRoutingEvents(db, ctx.tenantId, input.routingId);
    }),
    assignCustody: protectedProcedure.input(z.object({
      routingId: z.number(),
      custodianUserId: z.number(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return assignCustody(db, ctx.tenantId, ctx.user.id, input);
    }),
    route: protectedProcedure.input(z.object({
      routingId: z.number(),
      bankAccountId: z.number(),
      plannedDepositDate: z.string().min(1),
      custodianUserId: z.number().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return routeCheck(db, ctx.tenantId, ctx.user.id, input);
    }),
    deposit: protectedProcedure.input(z.object({
      routingId: z.number(),
      depositDate: z.string().optional(),
      bankAccountId: z.number().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return depositRoutedCheck(db, ctx.tenantId, ctx.user.id, input);
    }),
    collect: protectedProcedure.input(z.object({
      routingId: z.number(),
      date: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return collectRoutedCheck(db, ctx.tenantId, ctx.user.id, input);
    }),
    reject: protectedProcedure.input(z.object({
      routingId: z.number(),
      date: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return rejectRoutedCheck(db, ctx.tenantId, ctx.user.id, input);
    }),
  }),
});

// ===================== REPORTS =====================
const reportsRouter = router({
  inventory: protectedProcedure.query(async ({ ctx }) => {
    await assertEntityAction(ctx, "reports", "legacyInventorySummary", "viewDoc");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select({
      id: items.id,
      code: items.code,
      name: items.name,
      unit: items.unit,
      currentStock: items.currentStock,
      minStock: items.minStock,
      salePrice: items.salePrice,
      purchasePrice: items.purchasePrice,
      categoryName: itemCategories.name,
    }).from(items)
      .where(tenantWhere(items, ctx.tenantId))
      .leftJoin(itemCategories, eq(items.categoryId, itemCategories.id))
      .orderBy(
        sql`(CASE WHEN ${items.code} IS NULL OR TRIM(${items.code}) = '' THEN 1 ELSE 0 END)`,
        items.code,
        items.name,
        items.id,
      );
  }),
  balanceSheet: protectedProcedure.query(async ({ ctx }) => {
    await assertEntityAction(ctx, "reports", "legacyBalanceSheet", "viewDoc");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const allAccounts = await db.select().from(accounts).where(tenantWhere(accounts, ctx.tenantId, eq(accounts.isActive, true))).orderBy(accounts.code);
    const assets = allAccounts.filter(a => a.type === "asset");
    const liabilities = allAccounts.filter(a => a.type === "liability");
    const equity = allAccounts.filter(a => a.type === "equity");
    return { assets, liabilities, equity };
  }),
  incomeStatement: protectedProcedure.query(async ({ ctx }) => {
    await assertEntityAction(ctx, "reports", "legacyIncomeStatement", "viewDoc");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [totalRevenue] = await db.select({ total: sum(salesInvoices.total) }).from(salesInvoices).where(tenantWhere(salesInvoices, ctx.tenantId, eq(salesInvoices.status, "confirmed")));
    const [totalCost] = await db.select({ total: sum(purchaseInvoices.total) }).from(purchaseInvoices).where(tenantWhere(purchaseInvoices, ctx.tenantId, eq(purchaseInvoices.status, "confirmed")));
    const revenue = Number(totalRevenue.total ?? 0);
    const cost = Number(totalCost.total ?? 0);
    const grossProfit = revenue - cost;
    return { revenue, cost, grossProfit, netProfit: grossProfit };
  }),

  analytics: protectedProcedure.input(z.object({
    months: z.number().default(6),
  })).query(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "reports", "salesAnalytics", "viewDoc");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - input.months + 1);
    startDate.setDate(1);
    const startStr = startDate.toISOString().split("T")[0];

    // مبيعات شهرية
    const allSales = await db.select({
      id: salesInvoices.id,
      total: salesInvoices.total,
      date: salesInvoices.date,
      customerId: salesInvoices.customerId,
      customerName: customers.name,
    }).from(salesInvoices)
      .where(tenantWhere(salesInvoices, ctx.tenantId, and(eq(salesInvoices.status, "confirmed"), gte(salesInvoices.date, startStr as any))))
      .leftJoin(customers, eq(salesInvoices.customerId, customers.id));

    // تجميع بالشهر
    const monthlyMap: Record<string, { month: string; sales: number; count: number }> = {};
    for (const inv of allSales) {
      const d = new Date(inv.date as any);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthlyMap[key]) monthlyMap[key] = { month: key, sales: 0, count: 0 };
      monthlyMap[key].sales += Number(inv.total ?? 0);
      monthlyMap[key].count++;
    }
    const monthlySales = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));

    // أفضل العملاء
    const customerMap: Record<number, { id: number; name: string; total: number; count: number }> = {};
    for (const inv of allSales) {
      if (!inv.customerId) continue;
      if (!customerMap[inv.customerId]) customerMap[inv.customerId] = { id: inv.customerId, name: inv.customerName || `عميل #${inv.customerId}`, total: 0, count: 0 };
      customerMap[inv.customerId].total += Number(inv.total ?? 0);
      customerMap[inv.customerId].count++;
    }
    const topCustomers = Object.values(customerMap).sort((a, b) => b.total - a.total).slice(0, 10);

    // أكثر الأصناف مبيعاً
    const salesItems = await db.select({
      itemId: salesInvoiceItems.itemId,
      itemName: items.name,
      qty: salesInvoiceItems.quantity,
      total: salesInvoiceItems.total,
    }).from(salesInvoiceItems)
      .where(tenantWhere(salesInvoiceItems, ctx.tenantId, and(eq(salesInvoices.status, "confirmed"), gte(salesInvoices.date, startStr as any))))
      .leftJoin(salesInvoices, eq(salesInvoiceItems.invoiceId, salesInvoices.id))
      .leftJoin(items, eq(salesInvoiceItems.itemId, items.id));

    const itemMap: Record<number, { id: number; name: string; qty: number; total: number }> = {};
    for (const row of salesItems) {
      if (!row.itemId) continue;
      if (!itemMap[row.itemId]) itemMap[row.itemId] = { id: row.itemId, name: row.itemName || `صنف #${row.itemId}`, qty: 0, total: 0 };
      itemMap[row.itemId].qty += Number(row.qty ?? 0);
      itemMap[row.itemId].total += Number(row.total ?? 0);
    }
    const topItems = Object.values(itemMap).sort((a, b) => b.total - a.total).slice(0, 10);

    // مقارنة المبيعات والمشتريات
    const allPurchases = await db.select({
      total: purchaseInvoices.total,
      date: purchaseInvoices.date,
    }).from(purchaseInvoices)
      .where(tenantWhere(purchaseInvoices, ctx.tenantId, and(eq(purchaseInvoices.status, "confirmed"), gte(purchaseInvoices.date, startStr as any))));

    const purchaseMap: Record<string, number> = {};
    for (const inv of allPurchases) {
      const d = new Date(inv.date as any);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      purchaseMap[key] = (purchaseMap[key] || 0) + Number(inv.total ?? 0);
    }
    const comparison = monthlySales.map(m => ({
      month: m.month,
      sales: m.sales,
      purchases: purchaseMap[m.month] || 0,
      profit: m.sales - (purchaseMap[m.month] || 0),
    }));

    return { monthlySales, topCustomers, topItems, comparison };
  }),

  tax: protectedProcedure.input(z.object({
    startDate: z.string(),
    endDate: z.string(),
  })).query(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "reports", "taxReport", "viewDoc");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const startDateObj = new Date(input.startDate);
    const endDateObj = new Date(input.endDate);

    // ضرائب فواتير البيع (محصّلة)
    const salesRows = await db.select({
      id: salesInvoices.id,
      number: salesInvoices.number,
      date: salesInvoices.date,
      subtotal: salesInvoices.subtotal,
      tax: salesInvoices.tax,
      total: salesInvoices.total,
      status: salesInvoices.status,
    }).from(salesInvoices)
      .where(tenantWhere(salesInvoices, ctx.tenantId, and(
        eq(salesInvoices.status, "confirmed"),
        gte(salesInvoices.date, startDateObj),
        lte(salesInvoices.date, endDateObj)
      )))
      .orderBy(desc(salesInvoices.date));

    // ضرائب فواتير الشراء (مدفوعة)
    const purchaseRows = await db.select({
      id: purchaseInvoices.id,
      number: purchaseInvoices.number,
      date: purchaseInvoices.date,
      subtotal: purchaseInvoices.subtotal,
      tax: purchaseInvoices.tax,
      total: purchaseInvoices.total,
      status: purchaseInvoices.status,
    }).from(purchaseInvoices)
      .where(tenantWhere(purchaseInvoices, ctx.tenantId, and(
        eq(purchaseInvoices.status, "confirmed"),
        gte(purchaseInvoices.date, startDateObj),
        lte(purchaseInvoices.date, endDateObj)
      )))
      .orderBy(desc(purchaseInvoices.date));

    const totalSalesTax = salesRows.reduce((s, r) => s + Number(r.tax ?? 0), 0);
    const totalPurchaseTax = purchaseRows.reduce((s, r) => s + Number(r.tax ?? 0), 0);
    const netTax = totalSalesTax - totalPurchaseTax;

    return {
      salesInvoices: salesRows,
      purchaseInvoices: purchaseRows,
      summary: {
        totalSalesTax,
        totalPurchaseTax,
        netTax,
        salesCount: salesRows.length,
        purchasesCount: purchaseRows.length,
      }
    };
  }),

  // ===================== INVENTORY REPORTS (Mega Cash parity) =====================
  inventoryStocktake: protectedProcedure.input(z.object({
    branchId: z.number().optional(),
    warehouseId: z.number().optional(),
    categoryId: z.number().optional(),
    itemId: z.number().optional(),
    search: z.string().optional(),
    batchNumber: z.string().optional(),
    expiryFrom: z.string().optional(),
    expiryTo: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "reports", "invreports-inventorysummary", "viewDoc");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
    const filters = applyScopeToReportFilters({ tenantId: ctx.tenantId, ...input }, scope);
    return inventoryStocktakeReport(db, filters);
  }),

  inventoryItemMovements: protectedProcedure.input(z.object({
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    branchId: z.number().optional(),
    warehouseId: z.number().optional(),
    categoryId: z.number().optional(),
    itemId: z.number().optional(),
    search: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "reports", "invreports-itemstransferdetails", "viewDoc");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
    const filters = applyScopeToReportFilters({ tenantId: ctx.tenantId, ...input }, scope);
    // ميجا: أعمدة «حركة تفصيلية للاصناف» من ملف التصدير الفعلي + رصيد سابق
    const openings = await computeItemMovementOpenings(db, filters);
    const movements = await collectInventoryMovements(db, filters);
    return toMegaItemMovementDetailRows(movements, openings);
  }),

  inventoryWarehouseInOut: protectedProcedure.input(z.object({
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    branchId: z.number().optional(),
    warehouseId: z.number().optional(),
    categoryId: z.number().optional(),
    itemId: z.number().optional(),
    search: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "reports", "invreports-totalinventoryexportimportreport", "viewDoc");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
    const filters = applyScopeToReportFilters({ tenantId: ctx.tenantId, ...input }, scope);
    // ميجا: صادر/وارد مخزن = صفوف حركة تفصيلية (PDF evidence wave-3)
    const openings = await computeItemMovementOpenings(db, filters);
    const movements = await collectInventoryMovements(db, filters);
    const openByWhItem = new Map<string, number>();
    for (const [itemId, o] of openings) openByWhItem.set(`0:${itemId}`, o.qty);
    return warehouseInOutReport(movements, openByWhItem);
  }),

  inventoryWarehouseMovements: protectedProcedure.input(z.object({
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    branchId: z.number().optional(),
    warehouseId: z.number().optional(),
    categoryId: z.number().optional(),
    itemId: z.number().optional(),
    search: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "reports", "invreports-inventorytransferdetailsreport", "viewDoc");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
    const filters = applyScopeToReportFilters({ tenantId: ctx.tenantId, ...input }, scope);
    let movements = await collectInventoryMovements(db, filters);
    if (filters.warehouseId) movements = movements.filter((m) => m.warehouseId === filters.warehouseId);
    else if (filters.warehouseIds?.length) {
      movements = movements.filter((m) => m.warehouseId != null && filters.warehouseIds!.includes(m.warehouseId));
    }
    // ميجا: حركة تفصيلية للمخازن — رصيد + قيم وارد/صادر (PDF wave-3)
    return toMegaWarehouseMovementRows(movements);
  }),

  inventoryItemCosts: protectedProcedure.input(z.object({
    dateTo: z.string().optional(),
    branchId: z.number().optional(),
    warehouseId: z.number().optional(),
    categoryId: z.number().optional(),
    itemId: z.number().optional(),
    search: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "reports", "invreports-itemscosts", "viewDoc");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
    const filters = applyScopeToReportFilters({ tenantId: ctx.tenantId, ...input }, scope);
    return itemCostsReport(db, filters);
  }),

  inventoryItemsList: protectedProcedure.input(z.object({
    categoryId: z.number().optional(),
    itemId: z.number().optional(),
    search: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "reports", "invreports-itemslist", "viewDoc");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return itemsListReport(db, { tenantId: ctx.tenantId, ...input });
  }),

  inventoryItemSummary: protectedProcedure.input(z.object({
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    branchId: z.number().optional(),
    warehouseId: z.number().optional(),
    categoryId: z.number().optional(),
    itemId: z.number().optional(),
    search: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "reports", "invreports-itemssummary", "viewDoc");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
    const filters = applyScopeToReportFilters({ tenantId: ctx.tenantId, ...input }, scope);
    const openings = await computeItemMovementOpenings(db, filters);
    const movements = await collectInventoryMovements(db, filters);
    // ميجا: ملخص حركة الاصناف — رصيد سابق + وارد/صادر + رصيد (PDF wave-3)
    return itemMovementSummaryReport(movements, openings);
  }),

  inventoryItemInOut: protectedProcedure.input(z.object({
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    branchId: z.number().optional(),
    warehouseId: z.number().optional(),
    categoryId: z.number().optional(),
    itemId: z.number().optional(),
    search: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "reports", "invreports-incomeoutcomeitem", "viewDoc");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
    const filters = applyScopeToReportFilters({ tenantId: ctx.tenantId, ...input }, scope);
    const movements = await collectInventoryMovements(db, filters);
    const stock = await inventoryStocktakeReport(db, filters);
    const available = new Map<number, number>();
    for (const r of stock) available.set(r.itemId, (available.get(r.itemId) || 0) + Number(r.quantity || 0));
    // ميجا: صادر/وارد صنف — مشتريات/مبيعات/مردود/انتاج (PDF wave-3)
    return itemInOutReport(movements, available);
  }),

  inventoryStagnantItems: protectedProcedure.input(z.object({
    branchId: z.number().optional(),
    warehouseId: z.number().optional(),
    categoryId: z.number().optional(),
    itemId: z.number().optional(),
    search: z.string().optional(),
    staleDays: z.number().default(90),
  })).query(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "reports", "invreports-stagnantitems", "viewDoc");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
    const filters = applyScopeToReportFilters({ tenantId: ctx.tenantId, ...input }, scope);
    return stagnantItemsReport(db, filters);
  }),

  inventoryItemAging: protectedProcedure.input(z.object({
    branchId: z.number().optional(),
    warehouseId: z.number().optional(),
    categoryId: z.number().optional(),
    itemId: z.number().optional(),
    search: z.string().optional(),
    dateTo: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "reports", "invreports-itemaging", "viewDoc");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
    const filters = applyScopeToReportFilters({ tenantId: ctx.tenantId, ...input }, scope);
    return itemAgingReport(db, filters);
  }),

  accountingBySlug: protectedProcedure.input(z.object({
    slug: z.string(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    accountId: z.number().optional(),
    customerId: z.number().optional(),
    supplierId: z.number().optional(),
    warehouseId: z.number().optional(),
    branchId: z.number().optional(),
    costCenterId: z.number().optional(),
    repId: z.number().optional(),
    itemId: z.number().optional(),
    categoryId: z.number().optional(),
    areaId: z.number().optional(),
    paymentType: z.enum(["cash", "credit"]).optional(),
    search: z.string().optional(),
    currencyCode: z.string().optional(),
    dueDateFrom: z.string().optional(),
    dueDateTo: z.string().optional(),
    paymentStatus: z.enum(["paid", "partial", "unpaid"]).optional(),
    taxFilter: z.enum(["with", "without"]).optional(),
    discountFilter: z.enum(["with", "without"]).optional(),
    showOpeningMovements: z.boolean().optional(),
    showCounterAccounts: z.boolean().optional(),
    hideDetails: z.boolean().optional(),
    notes: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "reports", input.slug, "viewDoc");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
    const { slug, ...filters } = input;
    return runAccountingReport(db, slug, applyScopeToReportFilters({ tenantId: ctx.tenantId, ...filters }, scope));
  }),

  /** نسخة مفصّلة (فاتورة + أسطرها) من تقريري الشراء/البيع — لمطابقة شكل تقرير ميجا كاش المطبوع بالظبط */
  purchasesSalesDetail: protectedProcedure.input(z.object({
    kind: z.enum(["sales", "purchases"]),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    customerId: z.number().optional(),
    supplierId: z.number().optional(),
    warehouseId: z.number().optional(),
    branchId: z.number().optional(),
    paymentType: z.enum(["cash", "credit"]).optional(),
    search: z.string().optional(),
    currencyCode: z.string().optional(),
    dueDateFrom: z.string().optional(),
    dueDateTo: z.string().optional(),
    paymentStatus: z.enum(["paid", "partial", "unpaid"]).optional(),
    taxFilter: z.enum(["with", "without"]).optional(),
    discountFilter: z.enum(["with", "without"]).optional(),
  })).query(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "reports", input.kind === "purchases" ? "accountingreports-purchases" : "accountingreports-sales", "viewDoc");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
    const { kind, ...filters } = input;
    const scoped = applyScopeToReportFilters({ tenantId: ctx.tenantId, ...filters }, scope);
    return kind === "purchases"
      ? purchasesInvoicesDetailedReport(db, scoped)
      : salesInvoicesDetailedReport(db, scoped);
  }),

  finalBySlug: protectedProcedure.input(z.object({
    slug: z.string(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    accountId: z.number().optional(),
    customerId: z.number().optional(),
    supplierId: z.number().optional(),
    warehouseId: z.number().optional(),
    costCenterId: z.number().optional(),
    branchId: z.number().optional(),
    repId: z.number().optional(),
    categoryId: z.number().optional(),
    areaId: z.number().optional(),
    paymentType: z.enum(["cash", "credit"]).optional(),
    search: z.string().optional(),
    /** ميجا ميزان المراجعة: اخفاء الارصدة الصفرية */
    hideZeroBalances: z.boolean().optional(),
    displayLevel: z.number().int().min(1).max(10).optional(),
    activityStatus: z.enum(["active", "inactive"]).optional(),
    orderBy: z.enum(["code", "name", "balance"]).optional(),
    customerGrouping: z.enum(["all", "zeroBalances", "byCategory"]).optional(),
  })).query(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "reports", input.slug, "viewDoc");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
    const { slug, ...filters } = input;
    return runFinalReport(db, slug, applyScopeToReportFilters({ tenantId: ctx.tenantId, ...filters }, scope));
  }),

  hrBySlug: protectedProcedure.input(z.object({
    slug: z.string(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    search: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "reports", input.slug, "viewDoc");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { slug, ...filters } = input;
    return runHrReport(db, slug, { tenantId: ctx.tenantId, ...filters });
  }),

  assetsBySlug: protectedProcedure.input(z.object({
    slug: z.string(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    branchId: z.number().optional(),
    currencyCode: z.string().optional(),
    search: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "reports", input.slug, "viewDoc");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { slug, ...filters } = input;
    return runAssetsReport(db, slug, { tenantId: ctx.tenantId, ...filters });
  }),
});

// ===================== NOTIFICATIONS =====================
const notificationsRouter = router({
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { count: 0 };
    const [result] = await db.select({ count: count() }).from(notifications)
      .where(tenantWhere(notifications, ctx.tenantId, and(eq(notifications.isRead, false), eq(notifications.userId, ctx.user.id))));
    return { count: result.count };
  }),
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select({
      id: notifications.id,
      title: notifications.title,
      message: notifications.message,
      type: notifications.type,
      isRead: notifications.isRead,
      href: notifications.href,
      referenceKey: notifications.referenceKey,
      createdAt: notifications.createdAt,
    }).from(notifications)
      .where(tenantWhere(notifications, ctx.tenantId, eq(notifications.userId, ctx.user.id)))
      .orderBy(desc(notifications.createdAt)).limit(50);
  }),
  syncOperational: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return syncOperationalNotifications(db, ctx.tenantId, ctx.user.id);
  }),
  markRead: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(notifications).set({ isRead: true }).where(tenantWhere(notifications, ctx.tenantId, eq(notifications.id, input)));
    return { success: true };
  }),
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(notifications).set({ isRead: true }).where(
      tenantWhere(notifications, ctx.tenantId, and(eq(notifications.userId, ctx.user.id), eq(notifications.isRead, false))),
    );
    return { success: true };
  }),
  sendAlertDigest: protectedProcedure.input(z.object({ force: z.boolean().optional() }).optional()).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return sendOperationalAlertDigest(db, ctx.tenantId, { force: input?.force });
  }),
});

// ===================== FIXED ASSETS =====================
const assetsRouter = router({
  list: protectedProcedure.input(z.object({
    page: z.number().default(1),
    limit: z.number().default(20),
    status: z.enum(["active", "disposed", "under_maintenance"]).optional(),
  })).query(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "assets", "assets", "viewDocList");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    const conds = input.status ? [eq(fixedAssets.status, input.status)] : [];
    const where = tenantWhere(fixedAssets, ctx.tenantId, ...(conds.length ? [and(...conds)] : []));
    const rows = await db.select().from(fixedAssets).where(where).orderBy(fixedAssets.name).limit(input.limit).offset(offset);
    const [total] = await db.select({ count: count() }).from(fixedAssets).where(where);
    return { rows, total: total.count };
  }),
  create: protectedProcedure.input(z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    category: z.string().optional(),
    purchaseDate: z.string().optional(),
    purchasePrice: z.string().optional(),
    depreciationRate: z.string().optional(),
    location: z.string().optional(),
    notes: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "assets", "assets", "add");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(fixedAssets).values(withTenantId(ctx.tenantId, { ...input, currentValue: input.purchasePrice }) as any);
    return { success: true };
  }),
});

// ===================== LOANS =====================
function buildLoanInstallments(opts: {
  principal: number;
  interestRate: number;
  startDate: string;
  count: number;
}) {
  const count = Math.max(1, Math.min(360, Math.floor(opts.count || 1)));
  const principal = Number(opts.principal) || 0;
  const rate = Number(opts.interestRate) || 0;
  const total = principal * (1 + rate / 100);
  const each = Math.round((total / count) * 100) / 100;
  const rows: { dueDate: string; amount: string }[] = [];
  let allocated = 0;
  const start = new Date(opts.startDate);
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + (i + 1));
    const amount = i === count - 1
      ? Math.round((total - allocated) * 100) / 100
      : each;
    allocated += amount;
    rows.push({
      dueDate: d.toISOString().slice(0, 10),
      amount: amount.toFixed(2),
    });
  }
  return rows;
}

const loansRouter = router({
  list: protectedProcedure.input(z.object({
    page: z.number().default(1),
    limit: z.number().default(20),
    search: z.string().optional(),
    type: z.enum(["given", "received"]).optional(),
    status: z.enum(["active", "paid", "cancelled"]).optional(),
  })).query(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "loans", "loan", "viewDocList");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    const conds = [];
    if (input.type) conds.push(eq(loans.type, input.type));
    if (input.status) conds.push(eq(loans.status, input.status));
    if (input.search?.trim()) {
      const q = `%${input.search.trim()}%`;
      conds.push(or(like(loans.number, q), like(loans.partyName, q), like(loans.notes, q)));
    }
    const where = tenantWhere(loans, ctx.tenantId, ...(conds.length ? [and(...conds)] : []));
    const rows = await db.select().from(loans).where(where).orderBy(desc(loans.createdAt)).limit(input.limit).offset(offset);
    const [total] = await db.select({ count: count() }).from(loans).where(where);
    return { rows, total: total.count };
  }),
  get: protectedProcedure.input(z.number()).query(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "loans", "loan", "viewDoc");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [loan] = await db.select().from(loans).where(tenantWhere(loans, ctx.tenantId, eq(loans.id, input))).limit(1);
    if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "القرض غير موجود" });
    const sched = await db.select().from(installments)
      .where(tenantWhere(installments, ctx.tenantId, eq(installments.loanId, input)))
      .orderBy(installments.dueDate);
    const today = new Date().toISOString().slice(0, 10);
    const enriched = sched.map((r) => ({
      ...r,
      status: r.status === "pending" && toDateStr(r.dueDate) < today ? "overdue" : r.status,
    }));
    const paid = enriched.filter((r) => r.status === "paid").reduce((s, r) => s + Number(r.amount || 0), 0);
    const remaining = enriched.filter((r) => r.status !== "paid").reduce((s, r) => s + Number(r.amount || 0), 0);
    return { ...loan, installments: enriched, paidTotal: paid, remainingTotal: remaining };
  }),
  create: protectedProcedure.input(z.object({
    type: z.enum(["given", "received"]),
    partyName: z.string().min(1),
    amount: z.string(),
    interestRate: z.string().optional(),
    startDate: z.string(),
    endDate: z.string().optional(),
    notes: z.string().optional(),
    installmentCount: z.number().int().min(1).max(360).default(12),
    settlementMethod: z.enum(["cash", "bank"]).default("cash"),
    bankAccountId: z.number().optional(),
    postJournal: z.boolean().default(true),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "loans", "loan", "add");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    if (input.settlementMethod === "bank" && !input.bankAccountId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "اختر الحساب البنكي للتسوية" });
    }
    const [countResult] = await db.select({ count: count() }).from(loans).where(tenantWhere(loans, ctx.tenantId));
    const number = `LN-${String(countResult.count + 1).padStart(5, "0")}`;
    const { installmentCount, settlementMethod, bankAccountId, postJournal, ...loanData } = input;
    const [result] = await db.insert(loans).values(withTenantId(ctx.tenantId, { number, ...loanData, status: "active" }) as any);
    const loanId = (result as any).insertId as number;
    const schedule = buildLoanInstallments({
      principal: Number(input.amount),
      interestRate: Number(input.interestRate || 0),
      startDate: input.startDate,
      count: installmentCount,
    });
    for (const row of schedule) {
      await db.insert(installments).values(withTenantId(ctx.tenantId, {
        loanId,
        dueDate: row.dueDate as any,
        amount: row.amount,
        status: "pending",
      }) as any);
    }
    if (!input.endDate && schedule.length) {
      await db.update(loans).set({ endDate: schedule[schedule.length - 1].dueDate as any })
        .where(tenantWhere(loans, ctx.tenantId, eq(loans.id, loanId)));
    }
    if (postJournal) {
      try {
        await postLoanOriginJournal(db, ctx.tenantId, ctx.user?.id, {
          number,
          type: input.type,
          partyName: input.partyName,
          date: input.startDate,
          amount: input.amount,
          settlementMethod,
          bankAccountId,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "فشل إنشاء القيد";
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `تم حفظ القرض (${number}) لكن فشل القيد المحاسبي: ${msg}`,
        });
      }
    }
    return { success: true, id: loanId, number, installmentCount: schedule.length };
  }),
  generateSchedule: protectedProcedure.input(z.object({
    loanId: z.number(),
    installmentCount: z.number().int().min(1).max(360).default(12),
    replaceExisting: z.boolean().default(true),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [loan] = await db.select().from(loans).where(tenantWhere(loans, ctx.tenantId, eq(loans.id, input.loanId))).limit(1);
    if (!loan) throw new TRPCError({ code: "NOT_FOUND" });
    const existing = await db.select().from(installments)
      .where(tenantWhere(installments, ctx.tenantId, eq(installments.loanId, input.loanId)));
    if (existing.some((r) => r.status === "paid") && input.replaceExisting) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "يوجد أقساط مدفوعة — لا يمكن إعادة توليد الجدول" });
    }
    if (input.replaceExisting) {
      await db.delete(installments).where(tenantWhere(installments, ctx.tenantId, eq(installments.loanId, input.loanId)));
    } else if (existing.length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "القرض لديه أقساط بالفعل" });
    }
    const schedule = buildLoanInstallments({
      principal: Number(loan.amount),
      interestRate: Number(loan.interestRate || 0),
      startDate: toDateStr(loan.startDate),
      count: input.installmentCount,
    });
    for (const row of schedule) {
      await db.insert(installments).values(withTenantId(ctx.tenantId, {
        loanId: input.loanId,
        dueDate: row.dueDate as any,
        amount: row.amount,
        status: "pending",
      }) as any);
    }
    return { success: true, count: schedule.length };
  }),
  updateStatus: protectedProcedure.input(z.object({
    id: z.number(),
    status: z.enum(["active", "paid", "cancelled"]),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "loans", "loan", input.status === "cancelled" ? "deleteCancel" : "edit");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(loans).set({ status: input.status })
      .where(tenantWhere(loans, ctx.tenantId, eq(loans.id, input.id)));
    return { success: true };
  }),
  installments: router({
    list: protectedProcedure.input(z.number()).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const today = new Date().toISOString().slice(0, 10);
      const rows = await db.select().from(installments).where(tenantWhere(installments, ctx.tenantId, eq(installments.loanId, input))).orderBy(installments.dueDate);
      return rows.map((r) => ({
        ...r,
        status: r.status === "pending" && toDateStr(r.dueDate) < today ? "overdue" : r.status,
      }));
    }),
    listAll: protectedProcedure.input(z.object({
      search: z.string().optional(),
      status: z.enum(["pending", "paid", "overdue"]).optional(),
      loanId: z.number().optional(),
    }).optional()).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const today = new Date().toISOString().slice(0, 10);
      const conds = [];
      if (input?.loanId) conds.push(eq(installments.loanId, input.loanId));
      if (input?.search?.trim()) {
        const q = `%${input.search.trim()}%`;
        conds.push(or(like(loans.partyName, q), like(loans.number, q)));
      }
      const rows = await db.select({
        id: installments.id,
        loanId: installments.loanId,
        dueDate: installments.dueDate,
        amount: installments.amount,
        paidAmount: installments.paidAmount,
        status: installments.status,
        paidDate: installments.paidDate,
        notes: installments.notes,
        loanNumber: loans.number,
        loanPartyName: loans.partyName,
        loanType: loans.type,
      }).from(installments)
        .innerJoin(loans, and(eq(loans.id, installments.loanId), eq(loans.tenantId, ctx.tenantId)))
        .where(tenantWhere(installments, ctx.tenantId, ...(conds.length ? [and(...conds)] : [])))
        .orderBy(installments.dueDate);
      return rows
        .map((r) => ({
          ...r,
          status: r.status === "pending" && toDateStr(r.dueDate) < today ? "overdue" as const : r.status,
        }))
        .filter((r) => !input?.status || r.status === input.status);
    }),
    pay: protectedProcedure.input(z.object({
      installmentId: z.number(),
      paidAmount: z.string().optional(),
      paidDate: z.string().optional(),
      notes: z.string().optional(),
      settlementMethod: z.enum(["cash", "bank"]).default("cash"),
      bankAccountId: z.number().optional(),
      postJournal: z.boolean().default(true),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input.settlementMethod === "bank" && !input.bankAccountId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "اختر الحساب البنكي للتسوية" });
      }
      const [row] = await db.select().from(installments)
        .where(tenantWhere(installments, ctx.tenantId, eq(installments.id, input.installmentId))).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.status === "paid") throw new TRPCError({ code: "BAD_REQUEST", message: "القسط مدفوع مسبقاً" });
      const [loan] = await db.select().from(loans)
        .where(tenantWhere(loans, ctx.tenantId, eq(loans.id, row.loanId))).limit(1);
      if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "القرض غير موجود" });
      const paidAmount = input.paidAmount || row.amount;
      const paidDate: string = input.paidDate || new Date().toISOString().slice(0, 10);
      await db.update(installments).set({
        status: "paid",
        paidAmount,
        paidDate: paidDate as any,
        notes: input.notes ?? row.notes,
      }).where(tenantWhere(installments, ctx.tenantId, eq(installments.id, input.installmentId)));
      const remaining = await db.select({ id: installments.id }).from(installments)
        .where(tenantWhere(installments, ctx.tenantId, and(
          eq(installments.loanId, row.loanId),
          sql`${installments.status} <> 'paid'`,
          sql`${installments.id} <> ${input.installmentId}`,
        )));
      if (!remaining.length) {
        await db.update(loans).set({ status: "paid" })
          .where(tenantWhere(loans, ctx.tenantId, eq(loans.id, row.loanId)));
      }
      if (input.postJournal) {
        try {
          await postLoanInstallmentPayJournal(db, ctx.tenantId, ctx.user?.id, {
            loanNumber: loan.number,
            loanType: loan.type as "given" | "received",
            partyName: loan.partyName,
            installmentId: input.installmentId,
            date: paidDate,
            amount: String(paidAmount),
            settlementMethod: input.settlementMethod,
            bankAccountId: input.bankAccountId,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "فشل إنشاء القيد";
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `تم تسجيل الدفع لكن فشل القيد المحاسبي: ${msg}`,
          });
        }
      }
      return { success: true };
    }),
  }),
});

// ===================== COST CENTERS =====================
const costCentersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    // مصدر بيانات مشترك (اختيار مركز تكلفة) في قيود اليومية وتحويل الأموال وفواتير كتير — مش مقيّد هنا.
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(costCenters).where(tenantWhere(costCenters, ctx.tenantId, eq(costCenters.isActive, true))).orderBy(costCenters.name);
  }),
  create: protectedProcedure.input(z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    parentId: z.number().optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "cost_centers", "costCenters", "add");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(costCenters).values(withTenantId(ctx.tenantId, input) as any);
    return { success: true };
  }),
});

// ===================== SALES REPS =====================
const salesRepsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    // مصدر بيانات مشترك (اختيار مندوب) في شاشة العملاء وتقارير كتير — مش مقيّد هنا.
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(salesReps).where(tenantWhere(salesReps, ctx.tenantId, eq(salesReps.isActive, true))).orderBy(salesReps.name);
  }),
  create: protectedProcedure.input(z.object({
    name: z.string().min(1),
    phone: z.string().optional(),
    email: z.string().optional(),
    commissionRate: z.string().optional(),
    address: z.string().optional(),
    notes: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "sales_reps", "salesReps", "add");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    try {
      await db.insert(salesReps).values(withTenantId(ctx.tenantId, compactRow(input as Record<string, unknown>)) as any);
    } catch (e: unknown) {
      throw new TRPCError({ code: "BAD_REQUEST", message: dbErrorMessage(e, "فشل إضافة المندوب") });
    }
    return { success: true };
  }),
  update: protectedProcedure.input(z.object({
    id: z.number(),
    name: z.string().min(1),
    phone: z.string().optional(),
    email: z.string().optional(),
    commissionRate: z.string().optional(),
    address: z.string().optional(),
    notes: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "sales_reps", "salesReps", "edit");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, ...data } = input;
    await db.update(salesReps).set(data as any).where(tenantWhere(salesReps, ctx.tenantId, eq(salesReps.id, id)));
    return { success: true };
  }),
  delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "sales_reps", "salesReps", "deleteCancel");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(salesReps).set({ isActive: false } as any).where(tenantWhere(salesReps, ctx.tenantId, eq(salesReps.id, input)));
    return { success: true };
  }),
});

// ===================== SETTINGS =====================
const settingsRouter = router({
  backup: router({
    export: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // جلب جميع البيانات للنسخة الاحتياطية
      const [customersData, suppliersData, itemsData, salesData, purchasesData, cashData, bankData, checksData, employeesData, journalData, accountsData, journalLinesData, companyData] = await Promise.all([
        db.select().from(customers).where(tenantWhere(customers, ctx.tenantId)).limit(5000),
        db.select().from(suppliers).where(tenantWhere(suppliers, ctx.tenantId)).limit(5000),
        db.select().from(items).where(tenantWhere(items, ctx.tenantId)).limit(5000),
        db.select().from(salesInvoices).where(tenantWhere(salesInvoices, ctx.tenantId)).limit(5000),
        db.select().from(purchaseInvoices).where(tenantWhere(purchaseInvoices, ctx.tenantId)).limit(5000),
        db.select().from(cashTransactions).where(tenantWhere(cashTransactions, ctx.tenantId)).limit(5000),
        db.select().from(bankTransactions).where(tenantWhere(bankTransactions, ctx.tenantId)).limit(5000),
        db.select().from(checks).where(tenantWhere(checks, ctx.tenantId)).limit(5000),
        db.select().from(employees).where(tenantWhere(employees, ctx.tenantId)).limit(5000),
        db.select().from(journalEntries).where(tenantWhere(journalEntries, ctx.tenantId)).limit(5000),
        db.select().from(accounts).where(tenantWhere(accounts, ctx.tenantId)).limit(5000),
        db.select().from(journalEntryLines).where(tenantWhere(journalEntryLines, ctx.tenantId)).limit(20000),
        db.select().from(companySettings).where(tenantWhere(companySettings, ctx.tenantId)).limit(1),
      ]);
      return {
        exportedAt: new Date().toISOString(),
        version: "1.1",
        tenantId: ctx.tenantId,
        data: {
          customers: customersData,
          suppliers: suppliersData,
          items: itemsData,
          salesInvoices: salesData,
          purchaseInvoices: purchasesData,
          cashTransactions: cashData,
          bankTransactions: bankData,
          checks: checksData,
          employees: employeesData,
          journalEntries: journalData,
          journalEntryLines: journalLinesData,
          accounts: accountsData,
          companySettings: companyData,
        },
        summary: {
          customers: customersData.length,
          suppliers: suppliersData.length,
          items: itemsData.length,
          salesInvoices: salesData.length,
          purchaseInvoices: purchasesData.length,
          cashTransactions: cashData.length,
          bankTransactions: bankData.length,
          checks: checksData.length,
          employees: employeesData.length,
          journalEntries: journalData.length,
          journalEntryLines: journalLinesData.length,
          accounts: accountsData.length,
        }
      };
    }),
    import: protectedProcedure.input(z.object({
      payload: z.object({
        version: z.string().optional(),
        data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
      }),
      upsertByCode: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const d = input.payload.data;
      const { importBulkPayload } = await import("./import-service");
      const res = await importBulkPayload(db, ctx.tenantId, {
        departments: d.departments as Record<string, unknown>[] | undefined,
        itemCategories: d.itemCategories as Record<string, unknown>[] | undefined,
        warehouses: d.warehouses as Record<string, unknown>[] | undefined,
        accounts: d.accounts as Record<string, unknown>[] | undefined,
        customers: d.customers as Record<string, unknown>[] | undefined,
        suppliers: d.suppliers as Record<string, unknown>[] | undefined,
        items: d.items as Record<string, unknown>[] | undefined,
        employees: d.employees as Record<string, unknown>[] | undefined,
      }, { upsertByCode: input.upsertByCode });
      return { success: true, imported: res.totalImported, updated: res.totalUpdated, summary: res.summary };
    }),
    /** استعادة كاملة (فواتير/قيود/حركات) من حمولة JSON — لمستأجر الجلسة فقط */
    importFull: protectedProcedure.input(z.object({
      payload: z.object({
        version: z.string().optional(),
        data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
      }),
      wipeFirst: z.boolean().optional(),
      wipeConfirm: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (!ctx.saasUser || !canManageTeamUsers(ctx.saasUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "للمديرين فقط" });
      }
      const { getTenantById } = await import("./tenant");
      const tenant = await getTenantById(ctx.tenantId!);
      if (!tenant || tenant.slug !== "kam") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "الاستيراد الكامل مفعّل حالياً لمستأجر kam فقط كإجراء أمان",
        });
      }
      if (input.wipeFirst) {
        if (input.wipeConfirm !== "WIPE_KAM") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "للتأكيد اكتب WIPE_KAM" });
        }
        const { wipeTenantBusinessData } = await import("./tenant-wipe");
        await wipeTenantBusinessData(db, "kam", { allowedSlugs: ["kam"] });
      }
      const { fullRestoreToTenant } = await import("./full-restore");
      const report = await fullRestoreToTenant(db, ctx.tenantId!, input.payload);
      try {
        const { syncBankAccountsFromChart } = await import("./bank-accounts-sync");
        await syncBankAccountsFromChart(db, ctx.tenantId!);
      } catch { /* optional */ }
      return {
        success: true,
        imported: report.imported,
        errors: report.errors.slice(0, 50),
        errorCount: report.errors.length,
      };
    }),
    wipeTenant: protectedProcedure.input(z.object({
      confirm: z.string(),
      dryRun: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (!ctx.saasUser || !canManageTeamUsers(ctx.saasUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "للمديرين فقط" });
      }
      const { getTenantById } = await import("./tenant");
      const tenant = await getTenantById(ctx.tenantId!);
      if (!tenant || tenant.slug !== "kam") {
        throw new TRPCError({ code: "FORBIDDEN", message: "التفريغ مفعّل لمستأجر kam فقط" });
      }
      if (!input.dryRun && input.confirm !== "WIPE_KAM") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "للتأكيد اكتب WIPE_KAM" });
      }
      const { wipeTenantBusinessData } = await import("./tenant-wipe");
      return wipeTenantBusinessData(db, "kam", { allowedSlugs: ["kam"], dryRun: input.dryRun });
    }),
  }),
  company: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db.select().from(companySettings).where(tenantWhere(companySettings, ctx.tenantId)).limit(1);
      return row;
    }),
    save: protectedProcedure.input(z.object({
      name: z.string().min(1),
      address: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      taxNumber: z.string().optional(),
      currency: z.string().optional(),
      alertEmailsEnabled: z.boolean().optional(),
      alertEmailRecipients: z.string().optional(),
      requireDocumentApproval: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "settings", "companySettings", "edit");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [existing] = await db.select().from(companySettings).where(tenantWhere(companySettings, ctx.tenantId)).limit(1);
      if (existing) {
        await db.update(companySettings).set(input).where(tenantWhere(companySettings, ctx.tenantId, eq(companySettings.id, existing.id)));
      } else {
        await db.insert(companySettings).values(withTenantId(ctx.tenantId, input) as any);
      }
      return { success: true };
    }),
  }),
  approvals: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      await assertEntityAction(ctx, "settings", "pendingDocs", "viewDocList");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { listPendingApprovals } = await import("./document-approval");
      return listPendingApprovals(db, ctx.tenantId);
    }),
    approve: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { getDocumentApprovalById, resolveDocumentApproval } = await import("./document-approval");
      const { finalizeSalesInvoice, finalizePurchaseInvoice, finalizeJournalEntry } = await import("./invoice-approval");
      // اعتماد أي مستند معلّق يخضع لصلاحية "اعتماد" المستند الحقيقي نفسه، مش لصلاحية عامة منفصلة
      const pending = await getDocumentApprovalById(db, ctx.tenantId, input);
      if (!pending) throw new TRPCError({ code: "NOT_FOUND", message: "طلب الاعتماد غير موجود" });
      if (pending.documentType === "sales_invoice") {
        const [inv] = await db.select({ paymentType: salesInvoices.paymentType }).from(salesInvoices)
          .where(tenantWhere(salesInvoices, ctx.tenantId, eq(salesInvoices.id, pending.documentId)));
        await assertEntityAction(ctx, "sales", inv?.paymentType === "cash" ? "cashSaleInvoice" : "saleInvoice", "approve");
      } else if (pending.documentType === "purchase_invoice") {
        await assertEntityAction(ctx, "purchases", "purchaseInvoice", "approve");
      } else if (pending.documentType === "journal_entry") {
        await assertEntityAction(ctx, "accounts", "journalEntry", "approve");
      }
      const row = await resolveDocumentApproval(db, ctx.tenantId, input, ctx.user?.id, "approved");
      if (row.documentType === "sales_invoice") {
        await finalizeSalesInvoice(db, ctx.tenantId, ctx.user?.id, row.documentId);
      } else if (row.documentType === "purchase_invoice") {
        await finalizePurchaseInvoice(db, ctx.tenantId, ctx.user?.id, row.documentId);
      } else if (row.documentType === "journal_entry") {
        await finalizeJournalEntry(db, ctx.tenantId, row.documentId);
      }
      return { success: true };
    }),
    reject: protectedProcedure.input(z.object({ id: z.number(), notes: z.string().optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { getDocumentApprovalById, resolveDocumentApproval } = await import("./document-approval");
      const pending = await getDocumentApprovalById(db, ctx.tenantId, input.id);
      if (!pending) throw new TRPCError({ code: "NOT_FOUND", message: "طلب الاعتماد غير موجود" });
      if (pending.documentType === "sales_invoice") {
        const [inv] = await db.select({ paymentType: salesInvoices.paymentType }).from(salesInvoices)
          .where(tenantWhere(salesInvoices, ctx.tenantId, eq(salesInvoices.id, pending.documentId)));
        await assertEntityAction(ctx, "sales", inv?.paymentType === "cash" ? "cashSaleInvoice" : "saleInvoice", "deleteCancel");
      } else if (pending.documentType === "purchase_invoice") {
        await assertEntityAction(ctx, "purchases", "purchaseInvoice", "deleteCancel");
      } else if (pending.documentType === "journal_entry") {
        await assertEntityAction(ctx, "accounts", "journalEntry", "deleteCancel");
      }
      const row = await resolveDocumentApproval(db, ctx.tenantId, input.id, ctx.user?.id, "rejected", input.notes);
      if (row.documentType === "sales_invoice") {
        await db.update(salesInvoices).set({ status: "cancelled" } as any)
          .where(tenantWhere(salesInvoices, ctx.tenantId, eq(salesInvoices.id, row.documentId)));
      } else if (row.documentType === "purchase_invoice") {
        await db.update(purchaseInvoices).set({ status: "cancelled" } as any)
          .where(tenantWhere(purchaseInvoices, ctx.tenantId, eq(purchaseInvoices.id, row.documentId)));
      } else if (row.documentType === "journal_entry") {
        await db.update(journalEntries).set({ status: "cancelled" } as any)
          .where(tenantWhere(journalEntries, ctx.tenantId, eq(journalEntries.id, row.documentId)));
      }
      return { success: true };
    }),
    runDepreciation: protectedProcedure.input(z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "assets", "assets", "add");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { postMonthlyDepreciation } = await import("./asset-depreciation");
      return postMonthlyDepreciation(db, ctx.tenantId, ctx.user?.id, input.period);
    }),
  }),
  contacts: router({
    reconcileBalances: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return reconcileAllContactBalances(db, ctx.tenantId);
    }),
  }),
  branches: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      // مصدر بيانات مشترك (اختيار فرع) في شاشات كتير جدًا — مش مقيّد هنا.
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
      return db.select().from(branches)
        .where(tenantWhere(branches, ctx.tenantId, scopeIdsFilter(branches.id, scope.branchIds)))
        .orderBy(branches.name);
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1),
      code: z.string().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      managerName: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "settings", "branches", "add");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(branches).values(withTenantId(ctx.tenantId, input) as any);
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1),
      code: z.string().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      managerName: z.string().optional(),
      isActive: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "settings", "branches", "edit");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(branches).set(data as any).where(tenantWhere(branches, ctx.tenantId, eq(branches.id, id)));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "settings", "branches", "deleteCancel");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(branches).where(tenantWhere(branches, ctx.tenantId, eq(branches.id, input)));
      return { success: true };
    }),
    listWithSearch: protectedProcedure.input(z.object({ search: z.string().optional() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
      const where = and(
        input.search ? like(branches.name, `%${input.search}%`) : undefined,
        scopeIdsFilter(branches.id, scope.branchIds),
      );
      const rows = await db.select().from(branches).where(tenantWhere(branches, ctx.tenantId, where)).orderBy(branches.name);
      return { rows };
    }),
  }),
  users: router({
    list: protectedProcedure.use(({ ctx, next }) => {
      if (!ctx.saasUser || !canManageTeamUsers(ctx.saasUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "هذه العملية للمديرين فقط" });
      }
      return next({ ctx });
    }).query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const tenantId = ctx.tenantId!;
      const rows = await db
        .select({
          id: appUsers.id,
          name: appUsers.name,
          email: appUsers.email,
          role: appUsers.role,
          jobTitle: appUsers.jobTitle,
          isActive: appUsers.isActive,
          createdAt: appUsers.createdAt,
          ownerUserId: appUsers.ownerUserId,
          scopeBranchIds: appUsers.scopeBranchIds,
          scopeWarehouseIds: appUsers.scopeWarehouseIds,
        })
        .from(appUsers)
        .where(eq(appUsers.tenantId, tenantId))
        .orderBy(appUsers.createdAt);
      const tenantOwnerId = await getTenantOwnerUserId(tenantId);
      return rows.map((row) => ({
        ...row,
        isTenantOwner: tenantOwnerId != null && row.id === tenantOwnerId,
      }));
    }),
    updateRole: protectedProcedure.use(({ ctx, next }) => {
      if (!ctx.saasUser || !canManageTeamUsers(ctx.saasUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "هذه العملية للمديرين فقط" });
      }
      return next({ ctx });
    }).input(z.object({
      userId: z.number(),
      role: z.string().min(1).max(64),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const tenantId = ctx.tenantId!;
      const { assertRoleExists } = await import("./permissions-service");
      if (input.role === "superadmin") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "دور غير صالح" });
      }
      try {
        await assertRoleExists(tenantId, input.role);
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e?.message || "الدور غير موجود" });
      }
      const ownerId = ctx.saasUser!.accountOwnerId;
      const tenantOwnerId = await getTenantOwnerUserId(tenantId);
      if (tenantOwnerId != null && input.userId === tenantOwnerId && input.role !== "admin") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن تغيير دور مالك الحساب" });
      }
      const [target] = await db.select().from(appUsers).where(and(eq(appUsers.id, input.userId), eq(appUsers.tenantId, tenantId))).limit(1);
      if (!target || getAccountOwnerId(target) !== ownerId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });
      }
      await db.update(appUsers).set({ role: input.role }).where(eq(appUsers.id, input.userId));
      return { success: true };
    }),
    create: protectedProcedure.use(({ ctx, next }) => {
      if (!ctx.saasUser || !canManageTeamUsers(ctx.saasUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "هذه العملية للمديرين فقط" });
      }
      return next({ ctx });
    }).input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(6),
      role: z.string().min(1).max(64).default("user"),
      jobTitle: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const tenantId = ctx.tenantId!;
      const ownerId = ctx.saasUser!.accountOwnerId;
      const { assertRoleExists } = await import("./permissions-service");
      if (input.role === "superadmin") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "دور غير صالح" });
      }
      try {
        await assertRoleExists(tenantId, input.role);
      } catch (e: any) {
        throw new TRPCError({ code: "BAD_REQUEST", message: e?.message || "الدور غير موجود" });
      }

      const sub = await getUserActiveSubscription(ownerId);
      const maxUsers = sub?.maxUsers ?? 1;
      const currentUsers = await countAccountUsers(tenantId);
      if (currentUsers >= maxUsers) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `وصلت للحد الأقصى من المستخدمين (${maxUsers}). رقِّ خطتك لإضافة المزيد.`,
        });
      }

      const existing = await getAppUserByEmail(input.email);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "البريد الإلكتروني مستخدم بالفعل" });

      const [owner] = await db.select({ companyName: appUsers.companyName }).from(appUsers).where(eq(appUsers.id, ownerId)).limit(1);
      const hashedPassword = await hashPassword(input.password);
      await db.insert(appUsers).values({
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash: hashedPassword,
        role: input.role,
        ownerUserId: ownerId,
        tenantId,
        jobTitle: input.jobTitle || null,
        companyName: owner?.companyName || null,
      });
      return { success: true };
    }),
    delete: protectedProcedure.use(({ ctx, next }) => {
      if (!ctx.saasUser || !canManageTeamUsers(ctx.saasUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "هذه العملية للمديرين فقط" });
      }
      return next({ ctx });
    }).input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const tenantId = ctx.tenantId!;
      const ownerId = ctx.saasUser!.accountOwnerId;
      const tenantOwnerId = await getTenantOwnerUserId(tenantId);
      if (tenantOwnerId != null && input === tenantOwnerId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن حذف مالك الشركة (حساب المستأجر)" });
      }
      const [target] = await db.select().from(appUsers).where(and(eq(appUsers.id, input), eq(appUsers.tenantId, tenantId))).limit(1);
      if (!target || target.ownerUserId !== ownerId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });
      }
      await db.delete(appUsers).where(eq(appUsers.id, input));
      return { success: true };
    }),
    resetPassword: protectedProcedure.use(({ ctx, next }) => {
      if (!ctx.saasUser || !canManageTeamUsers(ctx.saasUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "هذه العملية للمديرين فقط" });
      }
      return next({ ctx });
    }).input(z.object({
      userId: z.number(),
      newPassword: z.string().min(6),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const tenantId = ctx.tenantId!;
      const ownerId = ctx.saasUser!.accountOwnerId;
      const [target] = await db.select().from(appUsers).where(and(eq(appUsers.id, input.userId), eq(appUsers.tenantId, tenantId))).limit(1);
      if (!target || getAccountOwnerId(target) !== ownerId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });
      }
      const hashedPassword = await hashPassword(input.newPassword);
      await db.update(appUsers).set({ passwordHash: hashedPassword }).where(eq(appUsers.id, input.userId));
      return { success: true };
    }),
    getScopes: protectedProcedure.use(({ ctx, next }) => {
      if (!ctx.saasUser || !canManageTeamUsers(ctx.saasUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "هذه العملية للمديرين فقط" });
      }
      return next({ ctx });
    }).input(z.number()).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const tenantId = ctx.tenantId!;
      const ownerId = ctx.saasUser!.accountOwnerId;
      const [target] = await db
        .select({
          scopeBranchIds: appUsers.scopeBranchIds,
          scopeWarehouseIds: appUsers.scopeWarehouseIds,
        })
        .from(appUsers)
        .where(and(eq(appUsers.id, input), eq(appUsers.tenantId, tenantId)))
        .limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      const [ownerRow] = await db.select({ id: appUsers.id, ownerUserId: appUsers.ownerUserId }).from(appUsers).where(eq(appUsers.id, input));
      if (!ownerRow || getAccountOwnerId(ownerRow) !== ownerId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });
      }
      return {
        branchIds: (target.scopeBranchIds as number[] | null) ?? null,
        warehouseIds: (target.scopeWarehouseIds as number[] | null) ?? null,
      };
    }),
    updateScopes: protectedProcedure.use(({ ctx, next }) => {
      if (!ctx.saasUser || !canManageTeamUsers(ctx.saasUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "هذه العملية للمديرين فقط" });
      }
      return next({ ctx });
    }).input(z.object({
      userId: z.number(),
      branchIds: z.array(z.number()).nullable(),
      warehouseIds: z.array(z.number()).nullable(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const tenantId = ctx.tenantId!;
      const ownerId = ctx.saasUser!.accountOwnerId;
      const [target] = await db.select().from(appUsers).where(and(eq(appUsers.id, input.userId), eq(appUsers.tenantId, tenantId))).limit(1);
      if (!target || getAccountOwnerId(target) !== ownerId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });
      }
      await db.update(appUsers).set({
        scopeBranchIds: input.branchIds,
        scopeWarehouseIds: input.warehouseIds,
      }).where(eq(appUsers.id, input.userId));
      return { success: true };
    }),
  }),
});

// ===================== PRODUCTION =====================
const productionRouter = router({
  list: protectedProcedure.input(z.object({
    page: z.number().default(1),
    limit: z.number().default(20),
    search: z.string().optional(),
    status: z.enum(["draft", "in_progress", "completed", "cancelled"]).optional(),
    warehouseId: z.number().optional(),
    productId: z.number().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "production", "productionOrder", "viewDocList");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
    const offset = (input.page - 1) * input.limit;
    const conds: any[] = [scopeWarehouseFilter(productionOrders, scope)].filter(Boolean);
    if (input.status) conds.push(eq(productionOrders.status, input.status));
    if (input.warehouseId) conds.push(eq(productionOrders.warehouseId, input.warehouseId));
    if (input.productId) conds.push(eq(productionOrders.productId, input.productId));
    if (input.dateFrom) conds.push(gte(productionOrders.date, input.dateFrom as any));
    if (input.dateTo) conds.push(lte(productionOrders.date, input.dateTo as any));
    if (input.search?.trim()) {
      const q = `%${input.search.trim()}%`;
      conds.push(or(
        like(productionOrders.number, q),
        like(productionOrders.notes, q),
        like(productionOrders.referenceNumber, q),
        like(productionOrders.batchNumber, q),
        sql`p.name LIKE ${q}`,
        sql`p.code LIKE ${q}`,
      ));
    }
    const whereClause = tenantWhere(productionOrders, ctx.tenantId, ...(conds.length ? [and(...conds)] : []));
    const rows = await db.select({
      id: productionOrders.id,
      number: productionOrders.number,
      quantity: productionOrders.quantity,
      date: productionOrders.date,
      status: productionOrders.status,
      notes: productionOrders.notes,
      referenceNumber: productionOrders.referenceNumber,
      batchNumber: productionOrders.batchNumber,
      wipCostAmount: productionOrders.wipCostAmount,
      productId: productionOrders.productId,
      warehouseId: productionOrders.warehouseId,
      productName: items.name,
      productCode: items.code,
      warehouseName: warehouses.name,
    }).from(productionOrders)
      .leftJoin(items, and(eq(items.id, productionOrders.productId), eq(items.tenantId, ctx.tenantId)))
      .leftJoin(warehouses, and(eq(warehouses.id, productionOrders.warehouseId), eq(warehouses.tenantId, ctx.tenantId)))
      .where(whereClause)
      .orderBy(desc(productionOrders.createdAt))
      .limit(input.limit)
      .offset(offset);
    const [total] = await db.select({ count: count() }).from(productionOrders)
      .leftJoin(items, and(eq(items.id, productionOrders.productId), eq(items.tenantId, ctx.tenantId)))
      .where(whereClause);
    return { rows, total: total.count };
  }),

  get: protectedProcedure.input(z.number()).query(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "production", "productionOrder", "viewDoc");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [order] = await db.select({
      id: productionOrders.id,
      number: productionOrders.number,
      quantity: productionOrders.quantity,
      date: productionOrders.date,
      status: productionOrders.status,
      notes: productionOrders.notes,
      referenceNumber: productionOrders.referenceNumber,
      batchNumber: productionOrders.batchNumber,
      branchId: productionOrders.branchId,
      wipCostAmount: productionOrders.wipCostAmount,
      wipJournalId: productionOrders.wipJournalId,
      completionJournalId: productionOrders.completionJournalId,
      productId: productionOrders.productId,
      warehouseId: productionOrders.warehouseId,
      approvedBy: productionOrders.approvedBy,
      approvedAt: productionOrders.approvedAt,
      createdBy: productionOrders.createdBy,
      productName: items.name,
      productCode: items.code,
      warehouseName: warehouses.name,
    }).from(productionOrders)
      .leftJoin(items, and(eq(items.id, productionOrders.productId), eq(items.tenantId, ctx.tenantId)))
      .leftJoin(warehouses, and(eq(warehouses.id, productionOrders.warehouseId), eq(warehouses.tenantId, ctx.tenantId)))
      .where(tenantWhere(productionOrders, ctx.tenantId, eq(productionOrders.id, input)))
      .limit(1);
    if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "أمر الإنتاج غير موجود" });

    const materials = await db.select().from(productionOrderMaterials)
      .where(tenantWhere(productionOrderMaterials, ctx.tenantId, eq(productionOrderMaterials.orderId, input)));
    const matItemIds = materials.map((m) => m.itemId);
    const matItems = matItemIds.length
      ? await db.select({
          id: items.id,
          name: items.name,
          code: items.code,
          unit: items.unit,
          averageCost: items.averageCost,
          purchasePrice: items.purchasePrice,
          currentStock: items.currentStock,
        }).from(items).where(tenantWhere(items, ctx.tenantId, inArray(items.id, matItemIds)))
      : [];
    const matMap = new Map(matItems.map((i) => [i.id, i]));

    // رصيد كل خامة في المخزن اللي فعليًا هيتصرف منه (مخزن الخامة لو محدد، وإلا مخزن الأمر)
    // — مش رصيدها الكلي في كل المخازن، عشان محدش يفتكر إن فيه رصيد كافي وهو في مخزن تاني.
    const matWarehouseIds = [...new Set(materials.map((m) => m.warehouseId ?? order.warehouseId))];
    const stockRows = matItemIds.length && matWarehouseIds.length
      ? await db.select({
          itemId: itemWarehouseStock.itemId,
          warehouseId: itemWarehouseStock.warehouseId,
          quantity: itemWarehouseStock.quantity,
        }).from(itemWarehouseStock).where(tenantWhere(
          itemWarehouseStock, ctx.tenantId,
          and(inArray(itemWarehouseStock.itemId, matItemIds), inArray(itemWarehouseStock.warehouseId, matWarehouseIds)),
        ))
      : [];
    const stockKey = (itemId: number, warehouseId: number) => `${itemId}::${warehouseId}`;
    const stockMap = new Map(stockRows.map((r) => [stockKey(r.itemId, r.warehouseId), Number(r.quantity || 0)]));
    const whIds = [...new Set(matWarehouseIds)];
    const whRows = whIds.length
      ? await db.select({ id: warehouses.id, name: warehouses.name }).from(warehouses)
        .where(tenantWhere(warehouses, ctx.tenantId, inArray(warehouses.id, whIds)))
      : [];
    const whMap = new Map(whRows.map((w) => [w.id, w.name]));

    const lines = materials.map((m) => {
      const it = matMap.get(m.itemId);
      const absQty = Number(m.quantity || 0);
      const scrap = Number(m.scrapPercent || 0);
      const totalQty = absQty * (1 + scrap / 100);
      const scrapQty = absQty * (scrap / 100);
      const unitCost = Number(it?.averageCost || 0) || Number(it?.purchasePrice || 0);
      const effectiveWarehouseId = m.warehouseId ?? order.warehouseId;
      const available = stockMap.get(stockKey(m.itemId, effectiveWarehouseId)) ?? 0;
      return {
        id: m.id,
        itemId: m.itemId,
        quantity: m.quantity,
        scrapPercent: m.scrapPercent,
        notes: m.notes,
        warehouseId: m.warehouseId,
        effectiveWarehouseId,
        warehouseName: whMap.get(effectiveWarehouseId),
        itemName: it?.name,
        itemCode: it?.code,
        unit: it?.unit,
        averageCost: it?.averageCost,
        purchasePrice: it?.purchasePrice,
        currentStock: it?.currentStock,
        baseQty: absQty,
        scrapQty,
        totalQty,
        unitCost,
        lineCost: totalQty * unitCost,
        available,
      };
    });
    const estimatedCost = lines.reduce((s, l) => s + l.lineCost, 0);
    const totalRawQty = lines.reduce((s, l) => s + l.totalQty, 0);
    const orderQty = Number(order.quantity || 0) || 1;
    let maxProducible = Number.POSITIVE_INFINITY;
    for (const l of lines) {
      if (l.totalQty <= 0) continue;
      const perFinished = l.totalQty / orderQty;
      if (perFinished > 0) maxProducible = Math.min(maxProducible, l.available / perFinished);
    }
    if (!Number.isFinite(maxProducible)) maxProducible = 0;
    return {
      ...order,
      materials: lines,
      estimatedCost,
      totalRawQty,
      maxProducible: Math.max(0, Math.floor(maxProducible * 1000) / 1000),
    };
  }),

  /** رصيد أصناف بعينها موزّع على المخازن — تستخدمها شاشة إنشاء/تعديل أمر الإنتاج عشان تعرف
   * "المتاح" الحقيقي في المخزن اللي المستخدم فعلاً هيصرف منه كل خامة، مش رصيدها الكلي في كل المخازن. */
  materialStock: protectedProcedure
    .input(z.object({ itemIds: z.array(z.number()) }))
    .query(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "production", "productionOrder", "viewDocList");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (!input.itemIds.length) return { rows: [] as { itemId: number; warehouseId: number; quantity: string }[] };
      const rows = await db.select({
        itemId: itemWarehouseStock.itemId,
        warehouseId: itemWarehouseStock.warehouseId,
        quantity: itemWarehouseStock.quantity,
      }).from(itemWarehouseStock).where(tenantWhere(
        itemWarehouseStock, ctx.tenantId, inArray(itemWarehouseStock.itemId, input.itemIds),
      ));
      return { rows };
    }),

  create: protectedProcedure.input(z.object({
    productId: z.number(),
    quantity: z.string(),
    warehouseId: z.number(),
    date: z.string(),
    notes: z.string().optional(),
    branchId: z.number().optional(),
    referenceNumber: z.string().optional(),
    batchNumber: z.string().optional(),
    materials: z.array(z.object({
      itemId: z.number(),
      quantity: z.string(),
      scrapPercent: z.string().optional(),
      notes: z.string().optional(),
      warehouseId: z.number().optional(),
    })).optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "production", "productionOrder", "add");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await assertDateNotInClosedPeriod(db, ctx.tenantId, input.date);
    const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
    assertWarehouseAccess(scope, input.warehouseId);
    for (const m of input.materials || []) {
      if (m.warehouseId) assertWarehouseAccess(scope, m.warehouseId);
    }
    if (input.productId && (input.materials || []).some((m) => m.itemId === input.productId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن أن يكون المنتج النهائي مادة خام في نفس الأمر" });
    }
    const [countResult] = await db.select({ count: count() }).from(productionOrders).where(tenantWhere(productionOrders, ctx.tenantId));
    const number = `PO-${String(countResult.count + 1).padStart(5, "0")}`;
    const [result] = await db.insert(productionOrders).values(withTenantId(ctx.tenantId, {
      number,
      productId: input.productId,
      warehouseId: input.warehouseId,
      branchId: input.branchId,
      quantity: input.quantity,
      date: input.date as any,
      notes: input.notes,
      referenceNumber: input.referenceNumber,
      batchNumber: input.batchNumber,
      status: "draft",
      createdBy: ctx.user?.id,
    }) as any);
    const orderId = (result as any).insertId;
    // لو الأمر اتبعت من غير خامات، اسحب مكونات المنتج التام × الكمية (نفس اللي بتعمله الشاشة)
    let lines = input.materials || [];
    if (!lines.length) {
      const bom = await db.select().from(itemBomLines)
        .where(tenantWhere(itemBomLines, ctx.tenantId, eq(itemBomLines.productId, input.productId)));
      const orderQty = Number(input.quantity) || 0;
      lines = bom
        .filter((l) => l.materialItemId !== input.productId)
        .map((l) => ({
          itemId: l.materialItemId,
          quantity: String(Math.round(Number(l.quantityPerUnit || 0) * orderQty * 1000) / 1000),
          scrapPercent: String(l.scrapPercent ?? "0"),
          notes: l.notes ?? undefined,
          warehouseId: undefined,
        }));
    }
    for (const m of lines) {
      await db.insert(productionOrderMaterials).values(withTenantId(ctx.tenantId, {
        orderId,
        itemId: m.itemId,
        quantity: m.quantity,
        scrapPercent: m.scrapPercent ?? "0",
        notes: m.notes,
        warehouseId: m.warehouseId,
      }) as any);
    }
    return { success: true, id: orderId, number };
  }),

  update: protectedProcedure.input(z.object({
    id: z.number(),
    productId: z.number(),
    quantity: z.string(),
    warehouseId: z.number(),
    date: z.string(),
    notes: z.string().optional(),
    branchId: z.number().optional(),
    referenceNumber: z.string().optional(),
    batchNumber: z.string().optional(),
    materials: z.array(z.object({
      itemId: z.number(),
      quantity: z.string(),
      scrapPercent: z.string().optional(),
      notes: z.string().optional(),
      warehouseId: z.number().optional(),
    })),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "production", "productionOrder", "edit");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [existing] = await db.select().from(productionOrders)
      .where(tenantWhere(productionOrders, ctx.tenantId, eq(productionOrders.id, input.id))).limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "أمر الإنتاج غير موجود" });
    if (existing.status !== "draft") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "يمكن تعديل الأوامر المعلّقة فقط (زي Mega)" });
    }
    await assertDateNotInClosedPeriod(db, ctx.tenantId, input.date);
    const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
    assertWarehouseAccess(scope, input.warehouseId);
    for (const m of input.materials) {
      if (m.warehouseId) assertWarehouseAccess(scope, m.warehouseId);
    }
    await db.update(productionOrders).set({
      productId: input.productId,
      warehouseId: input.warehouseId,
      branchId: input.branchId,
      quantity: input.quantity,
      date: input.date as any,
      notes: input.notes,
      referenceNumber: input.referenceNumber,
      batchNumber: input.batchNumber,
    }).where(tenantWhere(productionOrders, ctx.tenantId, eq(productionOrders.id, input.id)));
    await db.delete(productionOrderMaterials).where(
      tenantWhere(productionOrderMaterials, ctx.tenantId, eq(productionOrderMaterials.orderId, input.id)),
    );
    for (const m of input.materials) {
      await db.insert(productionOrderMaterials).values(withTenantId(ctx.tenantId, {
        orderId: input.id,
        itemId: m.itemId,
        quantity: m.quantity,
        scrapPercent: m.scrapPercent ?? "0",
        notes: m.notes,
        warehouseId: m.warehouseId,
      }) as any);
    }
    return { success: true };
  }),

  delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "production", "productionOrder", "deleteCancel");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [existing] = await db.select().from(productionOrders)
      .where(tenantWhere(productionOrders, ctx.tenantId, eq(productionOrders.id, input))).limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
    if (existing.status !== "draft" && existing.status !== "cancelled") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "يمكن حذف المسودات أو الملغاة فقط" });
    }
    await db.delete(productionOrderMaterials).where(
      tenantWhere(productionOrderMaterials, ctx.tenantId, eq(productionOrderMaterials.orderId, input)),
    );
    await db.delete(productionOrders).where(
      tenantWhere(productionOrders, ctx.tenantId, eq(productionOrders.id, input)),
    );
    return { success: true };
  }),

  bom: router({
    get: protectedProcedure.input(z.object({ productId: z.number() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select({
        id: itemBomLines.id,
        productId: itemBomLines.productId,
        materialItemId: itemBomLines.materialItemId,
        materialName: items.name,
        materialCode: items.code,
        materialBarcode: items.barcode,
        materialUnit: items.unit,
        quantityPerUnit: itemBomLines.quantityPerUnit,
        scrapPercent: itemBomLines.scrapPercent,
        notes: itemBomLines.notes,
      }).from(itemBomLines)
        .leftJoin(items, and(eq(items.id, itemBomLines.materialItemId), eq(items.tenantId, ctx.tenantId)))
        .where(tenantWhere(itemBomLines, ctx.tenantId, eq(itemBomLines.productId, input.productId)))
        .orderBy(itemBomLines.id);
    }),
    listProducts: protectedProcedure.input(z.object({
      search: z.string().optional(),
    }).optional()).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const q = input?.search?.trim();
      const searchCond = q
        ? or(like(items.name, `%${q}%`), like(items.code, `%${q}%`), codeSearchCondition(items.code, q))
        : undefined;
      return db.select({
        productId: itemBomLines.productId,
        productName: items.name,
        productCode: items.code,
        lineCount: sql<number>`COUNT(${itemBomLines.id})`,
      }).from(itemBomLines)
        .innerJoin(items, and(eq(items.id, itemBomLines.productId), eq(items.tenantId, ctx.tenantId)))
        .where(tenantWhere(itemBomLines, ctx.tenantId, ...(searchCond ? [searchCond] : [])))
        .groupBy(itemBomLines.productId, items.name, items.code)
        .orderBy(items.code, items.name)
        .limit(200);
    }),
    save: protectedProcedure.input(z.object({
      productId: z.number(),
      lines: z.array(z.object({
        materialItemId: z.number(),
        quantityPerUnit: z.string(),
        scrapPercent: z.string().optional(),
        notes: z.string().optional(),
      })),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input.lines.some((l) => l.materialItemId === input.productId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن أن يكون المنتج مادة في خلطته" });
      }

      // دمج المواد المكررة (القيد الفريد يمنع التكرار في الجدول)
      const merged = new Map<number, { materialItemId: number; quantityPerUnit: string; scrapPercent: string; notes?: string }>();
      for (const line of input.lines) {
        const qty = Number(line.quantityPerUnit);
        if (!Number.isFinite(qty) || qty <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "كمية المادة يجب أن تكون أكبر من صفر" });
        }
        const prev = merged.get(line.materialItemId);
        if (prev) {
          const nextQty = Number(prev.quantityPerUnit) + qty;
          merged.set(line.materialItemId, {
            ...prev,
            quantityPerUnit: String(nextQty),
          });
        } else {
          merged.set(line.materialItemId, {
            materialItemId: line.materialItemId,
            quantityPerUnit: String(qty),
            scrapPercent: line.scrapPercent ?? "0",
            notes: line.notes,
          });
        }
      }

      const [product] = await db.select({ id: items.id }).from(items)
        .where(tenantWhere(items, ctx.tenantId, eq(items.id, input.productId))).limit(1);
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "المنتج غير موجود" });

      try {
        await db.delete(itemBomLines).where(
          tenantWhere(itemBomLines, ctx.tenantId, eq(itemBomLines.productId, input.productId)),
        );
        for (const line of merged.values()) {
          await db.insert(itemBomLines).values(withTenantId(ctx.tenantId, {
            productId: input.productId,
            materialItemId: line.materialItemId,
            quantityPerUnit: line.quantityPerUnit,
            scrapPercent: line.scrapPercent ?? "0",
            notes: line.notes,
          }) as any);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("item_bom_lines") || msg.includes("doesn't exist") || msg.includes("Unknown table")) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "جدول الخلطات غير موجود — نفّذ ترحيل قاعدة البيانات (migration 0025)",
          });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `فشل حفظ الخلطة: ${msg}` });
      }
      return { success: true, lineCount: merged.size };
    }),
    copy: protectedProcedure.input(z.object({
      fromProductId: z.number(),
      toProductId: z.number(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input.fromProductId === input.toProductId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "اختر منتجاً مختلفاً للنسخ إليه" });
      }
      const lines = await db.select().from(itemBomLines)
        .where(tenantWhere(itemBomLines, ctx.tenantId, eq(itemBomLines.productId, input.fromProductId)));
      if (!lines.length) throw new TRPCError({ code: "NOT_FOUND", message: "لا توجد خلطة للمنتج المصدر" });
      await db.delete(itemBomLines).where(
        tenantWhere(itemBomLines, ctx.tenantId, eq(itemBomLines.productId, input.toProductId)),
      );
      let copied = 0;
      for (const line of lines) {
        if (line.materialItemId === input.toProductId) continue;
        await db.insert(itemBomLines).values(withTenantId(ctx.tenantId, {
          productId: input.toProductId,
          materialItemId: line.materialItemId,
          quantityPerUnit: line.quantityPerUnit,
          scrapPercent: line.scrapPercent ?? "0",
          notes: line.notes,
        }) as any);
        copied += 1;
      }
      return { success: true, copied };
    }),
  }),

  updateStatus: protectedProcedure.input(z.object({
    id: z.number(),
    status: z.enum(["draft", "in_progress", "completed", "cancelled"]),
  })).mutation(async ({ ctx, input }) => {
    // "اعتماد" أمر الإنتاج في واجهتنا هو تحديدًا الانتقال draft → in_progress (زي ما اسم الزرار
    // في الواجهة نفسه)؛ الإلغاء دايمًا تحت "حذف / إلغاء"؛ الرجوع لمسودة (فك اعتماد) تحت "unapprove"؛
    // باقي الانتقالات تحت "تعديل".
    const actionForStatus: PermActionKey =
      input.status === "in_progress" ? "approve"
        : input.status === "cancelled" ? "deleteCancel"
          : input.status === "draft" ? "unapprove"
            : "edit";
    await assertEntityAction(ctx, "production", "productionOrder", actionForStatus);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    try {
      if (input.status === "in_progress") {
        const { startProductionOrder } = await import("./production-service");
        await startProductionOrder(db, ctx.tenantId, input.id, ctx.user?.id);
        return { success: true };
      }
      if (input.status === "completed") {
        const { completeProductionOrder } = await import("./production-service");
        await completeProductionOrder(db, ctx.tenantId, input.id, ctx.user?.id);
        return { success: true };
      }
      if (input.status === "cancelled") {
        const { cancelProductionOrder } = await import("./production-service");
        const r = await cancelProductionOrder(db, ctx.tenantId, input.id);
        return { success: true, note: r.note };
      }
      if (input.status === "draft") {
        const { unapproveProductionOrder } = await import("./production-service");
        await unapproveProductionOrder(db, ctx.tenantId, input.id);
        return { success: true };
      }
      await db.update(productionOrders).set({ status: input.status }).where(
        tenantWhere(productionOrders, ctx.tenantId, eq(productionOrders.id, input.id)),
      );
      return { success: true };
    } catch (e: any) {
      throw new TRPCError({ code: "BAD_REQUEST", message: e?.message || "فشل تحديث الحالة" });
    }
  }),
});

// ===================== INVENTORY =====================
const inventoryRouter = router({
  /** كمية متاحة لصنف في مخزن — أتمتة زي ميجا (الكمية المتاحة) */
  qtyAtWarehouse: protectedProcedure.input(z.object({
    itemId: z.number(),
    warehouseId: z.number(),
  })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { getWarehouseItemQty } = await import("./inventory-stock");
    const qty = await getWarehouseItemQty(db, ctx.tenantId, input.itemId, input.warehouseId);
    return { quantity: qty };
  }),
  transfers: router({
    list: protectedProcedure.input(z.object({
      page: z.number().default(1),
      limit: z.number().default(20),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      fromWarehouseId: z.number().optional(),
      toWarehouseId: z.number().optional(),
      status: z.enum(["draft", "confirmed", "cancelled"]).optional(),
      search: z.string().optional(),
    })).query(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "inventory", "stockTransfer", "viewDocList");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
      const offset = (input.page - 1) * input.limit;
      const scopeFilter = scopeEitherWarehouseFilter(stockTransfers.fromWarehouseId, stockTransfers.toWarehouseId, scope);
      const filters = [
        scopeFilter,
        input.dateFrom ? gte(stockTransfers.date, input.dateFrom as any) : undefined,
        input.dateTo ? lte(stockTransfers.date, input.dateTo as any) : undefined,
        input.fromWarehouseId ? eq(stockTransfers.fromWarehouseId, input.fromWarehouseId) : undefined,
        input.toWarehouseId ? eq(stockTransfers.toWarehouseId, input.toWarehouseId) : undefined,
        input.status ? eq(stockTransfers.status, input.status) : undefined,
        input.search
          ? or(
              like(stockTransfers.number, `%${input.search}%`),
              like(stockTransfers.notes, `%${input.search}%`),
            )
          : undefined,
      ].filter(Boolean);
      const whereClause = tenantWhere(stockTransfers, ctx.tenantId, and(...(filters as any[])));
      const rows = await db.select({
        id: stockTransfers.id,
        number: stockTransfers.number,
        date: stockTransfers.date,
        status: stockTransfers.status,
        notes: stockTransfers.notes,
        fromWarehouseName: sql<string>`fw.name`,
        toWarehouseName: sql<string>`tw.name`,
      }).from(stockTransfers)
        .where(whereClause)
        .leftJoin(sql`warehouses fw`, sql`fw.id = ${stockTransfers.fromWarehouseId}`)
        .leftJoin(sql`warehouses tw`, sql`tw.id = ${stockTransfers.toWarehouseId}`)
        .orderBy(desc(stockTransfers.createdAt)).limit(input.limit).offset(offset);
      const [total] = await db.select({ count: count() }).from(stockTransfers).where(whereClause);
      return { rows, total: total.count };
    }),
    create: protectedProcedure.input(z.object({
      fromWarehouseId: z.number(),
      toWarehouseId: z.number(),
      date: z.string(),
      notes: z.string().optional(),
      items: z.array(z.object({ itemId: z.number(), quantity: z.string(), batchId: z.number().optional() })),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "inventory", "stockTransfer", "add");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertDateNotInClosedPeriod(db, ctx.tenantId, input.date);
      const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
      assertWarehouseAccess(scope, input.fromWarehouseId);
      assertWarehouseAccess(scope, input.toWarehouseId);
      const [countResult] = await db.select({ count: count() }).from(stockTransfers).where(tenantWhere(stockTransfers, ctx.tenantId));
      const number = `ST-${String(countResult.count + 1).padStart(5, "0")}`;
      const [result] = await db.insert(stockTransfers).values(withTenantId(ctx.tenantId, {
        number, fromWarehouseId: input.fromWarehouseId, toWarehouseId: input.toWarehouseId,
        date: input.date as any, notes: input.notes, status: "confirmed",
      }) as any);
      const transferId = (result as any).insertId;
      const { transferStockBetweenWarehouses } = await import("./inventory-stock");
      for (const item of input.items) {
        await db.insert(stockTransferItems).values(withTenantId(ctx.tenantId, { transferId, ...item }) as any);
        await transferStockBetweenWarehouses(db, ctx.tenantId, {
          itemId: item.itemId,
          quantity: item.quantity,
          fromWarehouseId: input.fromWarehouseId,
          toWarehouseId: input.toWarehouseId,
          batchId: item.batchId,
        });
      }
      return { success: true, id: transferId, number };
    }),
  }),
  adjustments: router({
    list: protectedProcedure.input(z.object({
      page: z.number().default(1),
      limit: z.number().default(20),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      warehouseId: z.number().optional(),
      status: z.enum(["draft", "confirmed", "cancelled"]).optional(),
      search: z.string().optional(),
    })).query(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "inventory", "stockAdjustment", "viewDocList");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
      const offset = (input.page - 1) * input.limit;
      const filters = [
        scopeWarehouseFilter(inventoryAdjustments, scope),
        input.dateFrom ? gte(inventoryAdjustments.date, input.dateFrom as any) : undefined,
        input.dateTo ? lte(inventoryAdjustments.date, input.dateTo as any) : undefined,
        input.warehouseId ? eq(inventoryAdjustments.warehouseId, input.warehouseId) : undefined,
        input.status ? eq(inventoryAdjustments.status, input.status) : undefined,
        input.search
          ? or(
              like(inventoryAdjustments.number, `%${input.search}%`),
              like(inventoryAdjustments.reason, `%${input.search}%`),
            )
          : undefined,
      ].filter(Boolean);
      const whereClause = tenantWhere(inventoryAdjustments, ctx.tenantId, and(...(filters as any[])));
      const rows = await db.select({
        id: inventoryAdjustments.id,
        number: inventoryAdjustments.number,
        date: inventoryAdjustments.date,
        reason: inventoryAdjustments.reason,
        status: inventoryAdjustments.status,
        warehouseName: warehouses.name,
      }).from(inventoryAdjustments)
        .where(whereClause)
        .leftJoin(warehouses, eq(inventoryAdjustments.warehouseId, warehouses.id))
        .orderBy(desc(inventoryAdjustments.createdAt)).limit(input.limit).offset(offset);
      const [total] = await db.select({ count: count() }).from(inventoryAdjustments).where(whereClause);
      return { rows, total: total.count };
    }),
    create: protectedProcedure.input(z.object({
      warehouseId: z.number(),
      date: z.string(),
      adjustmentType: z.enum(["addition", "deduction"]),
      notes: z.string().optional(),
      items: z.array(z.object({ itemId: z.number(), quantity: z.string(), reason: z.string().optional() })),
    })).mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "inventory", "stockAdjustment", "add");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await assertDateNotInClosedPeriod(db, ctx.tenantId, input.date);
      const scope = await loadUserScopeFromCtx(db, ctx.saasUser);
      assertWarehouseAccess(scope, input.warehouseId);
      const [countResult] = await db.select({ count: count() }).from(inventoryAdjustments).where(tenantWhere(inventoryAdjustments, ctx.tenantId));
      const number = `IA-${String(countResult.count + 1).padStart(5, "0")}`;
      const [result] = await db.insert(inventoryAdjustments).values(withTenantId(ctx.tenantId, {
        number, warehouseId: input.warehouseId, date: input.date as any,
        reason: input.notes, status: "confirmed",
      }) as any);
      const adjId = (result as any).insertId;
      const { applyStockMovement, getWarehouseItemQty } = await import("./inventory-stock");
      for (const item of input.items) {
        const qty = Number(item.quantity);
        const currentQty = await getWarehouseItemQty(db, ctx.tenantId, item.itemId, input.warehouseId);
        const newQty = input.adjustmentType === "addition" ? currentQty + qty : Math.max(0, currentQty - qty);
        const difference = newQty - currentQty;
        await db.insert(inventoryAdjustmentItems).values(withTenantId(ctx.tenantId, {
          adjustmentId: adjId,
          itemId: item.itemId,
          currentQty: String(currentQty),
          newQty: String(newQty),
          difference: String(difference),
        }) as any);
        await applyStockMovement(db, ctx.tenantId, {
          itemId: item.itemId,
          quantity: Math.abs(difference),
          direction: difference >= 0 ? "in" : "out",
          warehouseId: input.warehouseId,
        });
      }
      return { success: true, id: adjId, number };
    }),
  }),
});

// ===================== STATEMENT (كشف الحساب) =====================
const statementRouter = router({
  customer: protectedProcedure.input(z.object({
    customerId: z.number(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [customer] = await db.select().from(customers).where(tenantWhere(customers, ctx.tenantId, eq(customers.id, input.customerId)));
    // نجلب كل الحركات ثم نفلتر للعرض — الرصيد الافتتاحي يحتاج ما قبل الفترة أيضاً
    const siAll = await db.select({
      id: salesInvoices.id, number: salesInvoices.number, date: salesInvoices.date,
      total: salesInvoices.total, paid: salesInvoices.paid, remaining: salesInvoices.remaining,
      status: salesInvoices.status, paymentType: salesInvoices.paymentType,
    }).from(salesInvoices).where(tenantWhere(salesInvoices, ctx.tenantId, eq(salesInvoices.customerId, input.customerId))).orderBy(salesInvoices.date);
    const ctAll = await db.select().from(cashTransactions).where(tenantWhere(cashTransactions, ctx.tenantId, eq(cashTransactions.customerId, input.customerId))).orderBy(cashTransactions.date);
    const btAll = await db.select().from(bankTransactions).where(tenantWhere(bankTransactions, ctx.tenantId, eq(bankTransactions.customerId, input.customerId))).orderBy(bankTransactions.date);
    const srAll = await db.select().from(salesReturns).where(tenantWhere(salesReturns, ctx.tenantId, eq(salesReturns.customerId, input.customerId))).orderBy(salesReturns.date);

    const inRange = (d: unknown) => {
      const day = toDateStr(d || "");
      if (!day) return false;
      if (input.dateFrom && day < input.dateFrom) return false;
      if (input.dateTo && day > input.dateTo) return false;
      return true;
    };
    const siRows = siAll.filter((r) => inRange(r.date));
    const ctRows = ctAll.filter((r) => inRange(r.date));
    const btRows = btAll.filter((r) => inRange(r.date));
    const srRows = srAll.filter((r) => inRange(r.date));

    const totalInvoices = siRows.reduce((s, r) => s + parseFloat(r.total || "0"), 0);
    const totalPaid = siRows.reduce((s, r) => s + parseFloat(r.paid || "0"), 0);
    const totalRemaining = siRows.reduce((s, r) => s + parseFloat(r.remaining || "0"), 0);
    const totalReturns = srRows.reduce((s, r) => s + parseFloat(r.total || "0"), 0);
    const { ledger, openingBalance, closingBalance, openingBalanceDate } = finalizeLedger(
      buildCustomerMovements({
        invoices: siAll,
        cashTransactions: ctAll,
        bankTransactions: btAll,
        returns: srAll,
      }),
      {
        openingBalance: customer?.openingBalance,
        openingBalanceDate: customer?.openingBalanceDate,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        mode: "ar",
      },
    );
    return {
      customer,
      invoices: siRows,
      cashTransactions: ctRows,
      bankTransactions: btRows,
      returns: srRows,
      ledger,
      summary: {
        totalInvoices,
        totalPaid,
        totalRemaining,
        totalReturns,
        openingBalance,
        openingBalanceDate,
        closingBalance,
      },
    };
  }),
  supplier: protectedProcedure.input(z.object({
    supplierId: z.number(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [supplier] = await db.select().from(suppliers).where(tenantWhere(suppliers, ctx.tenantId, eq(suppliers.id, input.supplierId)));
    const piAll = await db.select({
      id: purchaseInvoices.id, number: purchaseInvoices.number, date: purchaseInvoices.date,
      total: purchaseInvoices.total, paid: purchaseInvoices.paid, remaining: purchaseInvoices.remaining,
      status: purchaseInvoices.status, paymentType: purchaseInvoices.paymentType,
    }).from(purchaseInvoices).where(tenantWhere(purchaseInvoices, ctx.tenantId, eq(purchaseInvoices.supplierId, input.supplierId))).orderBy(purchaseInvoices.date);
    const ctAll = await db.select().from(cashTransactions).where(tenantWhere(cashTransactions, ctx.tenantId, eq(cashTransactions.supplierId, input.supplierId))).orderBy(cashTransactions.date);
    const btAll = await db.select().from(bankTransactions).where(tenantWhere(bankTransactions, ctx.tenantId, eq(bankTransactions.supplierId, input.supplierId))).orderBy(bankTransactions.date);
    const prAll = await db.select().from(purchaseReturns).where(tenantWhere(purchaseReturns, ctx.tenantId, eq(purchaseReturns.supplierId, input.supplierId))).orderBy(purchaseReturns.date);

    const inRange = (d: unknown) => {
      const day = toDateStr(d || "");
      if (!day) return false;
      if (input.dateFrom && day < input.dateFrom) return false;
      if (input.dateTo && day > input.dateTo) return false;
      return true;
    };
    const piRows = piAll.filter((r) => inRange(r.date));
    const ctRows = ctAll.filter((r) => inRange(r.date));
    const btRows = btAll.filter((r) => inRange(r.date));
    const prRows = prAll.filter((r) => inRange(r.date));

    const totalInvoices = piRows.reduce((s, r) => s + parseFloat(r.total || "0"), 0);
    const totalPaid = piRows.reduce((s, r) => s + parseFloat(r.paid || "0"), 0);
    const totalRemaining = piRows.reduce((s, r) => s + parseFloat(r.remaining || "0"), 0);
    const totalReturns = prRows.reduce((s, r) => s + parseFloat(r.total || "0"), 0);
    const { ledger, openingBalance, closingBalance, openingBalanceDate } = finalizeLedger(
      buildSupplierMovements({
        invoices: piAll,
        cashTransactions: ctAll,
        bankTransactions: btAll,
        returns: prAll,
      }),
      {
        openingBalance: supplier?.openingBalance,
        openingBalanceDate: supplier?.openingBalanceDate,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        mode: "ap",
      },
    );
    return {
      supplier,
      invoices: piRows,
      cashTransactions: ctRows,
      bankTransactions: btRows,
      returns: prRows,
      ledger,
      summary: {
        totalInvoices,
        totalPaid,
        totalRemaining,
        totalReturns,
        openingBalance,
        openingBalanceDate,
        closingBalance,
      },
    };
  }),
});

// ===================== SAAS AUTH ROUTER =====================
const saasRouter = router({
  // تسجيل الدخول
  login: publicProcedure.input(z.object({
    email: z.string().email(),
    password: z.string().min(6),
    tenantSlug: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const ip = clientIp(ctx.req);
    const emailKey = input.email.toLowerCase().trim();
    try {
      assertRateLimit(`login:ip:${ip}`, { limit: 30, windowMs: 15 * 60 * 1000 });
      assertRateLimit(`login:email:${emailKey}`, { limit: 10, windowMs: 15 * 60 * 1000 });
    } catch (e) {
      if (e instanceof RateLimitError) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `محاولات كثيرة — أعد المحاولة بعد ${e.retryAfterSec} ثانية`,
        });
      }
      throw e;
    }

    const user = await getAppUserByEmail(input.email);
    if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
    if (!user.isActive) throw new TRPCError({ code: "FORBIDDEN", message: "الحساب موقوف، تواصل مع الإدارة" });
    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });

    if (input.tenantSlug && user.role !== "superadmin") {
      const { getTenantBySlug } = await import("./tenant");
      const tenant = await getTenantBySlug(input.tenantSlug);
      if (!tenant || !tenant.isActive) {
        throw new TRPCError({ code: "NOT_FOUND", message: "رابط الشركة غير صالح أو موقوف" });
      }
      if (tenant.id !== user.tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "هذا الحساب غير مرتبط بهذه الشركة" });
      }
    }

    if (input.tenantSlug && user.role === "superadmin") {
      const { getTenantBySlug } = await import("./tenant");
      const tenant = await getTenantBySlug(input.tenantSlug);
      if (!tenant || !tenant.isActive) {
        throw new TRPCError({ code: "NOT_FOUND", message: "رابط الشركة غير صالح أو موقوف" });
      }
    }

    if (user.role !== "superadmin") {
      const active = await isSubscriptionActive(user.id);
      if (!active) throw new TRPCError({ code: "FORBIDDEN", message: "انتهى اشتراكك، تواصل مع الإدارة لتجديده" });
    }

    let tenantSlug = input.tenantSlug ?? null;
    if (!tenantSlug && user.tenantId) {
      const { getTenantById } = await import("./tenant");
      const tenant = await getTenantById(user.tenantId);
      tenantSlug = tenant?.slug ?? null;
    }

    const token = await signSaasToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      tenantSlug,
    });
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.cookie(SAAS_COOKIE_NAME, token, { ...cookieOptions, maxAge: SESSION_MAX_AGE_MS });
    const db = await getDb();
    if (db) await db.update(appUsers).set({ lastLoginAt: new Date() }).where(eq(appUsers.id, user.id));
    try {
      if (user.tenantId) {
        const { logUserActivity } = await import("./user-activity");
        await logUserActivity(db, {
          tenantId: user.tenantId,
          saasUser: { id: user.id, name: user.name, email: user.email },
        }, {
          action: "تسجيل دخول",
          details: `الدخول · ${user.email}${tenantSlug ? ` · ${tenantSlug}` : ""}`,
        });
      }
    } catch { /* ignore */ }
    return {
      success: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, companyName: user.companyName },
      tenantSlug,
    };
  }),

  // معلومات الشركة من الرابط العام (صفحة الدخول الخاصة)
  resolveTenant: publicProcedure.input(z.object({
    slug: z.string().min(1),
  })).query(async ({ input }) => {
    const { getTenantBySlug } = await import("./tenant");
    const tenant = await getTenantBySlug(input.slug);
    if (!tenant || !tenant.isActive) return null;
    return { slug: tenant.slug, name: tenant.name };
  }),

  // تسجيل الخروج
  logout: publicProcedure.mutation(async ({ ctx }) => {
    try {
      const tenantId = ctx.tenantId ?? ctx.saasUser?.tenantId ?? null;
      if (tenantId) {
        const { logUserActivity } = await import("./user-activity");
        const db = await getDb();
        await logUserActivity(db, {
          tenantId,
          saasUser: ctx.saasUser,
          user: ctx.user,
        }, {
          action: "تسجيل خروج",
          details: ctx.saasUser?.email ? `الخروج · ${ctx.saasUser.email}` : "الخروج",
        });
      }
    } catch { /* ignore */ }
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(SAAS_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true };
  }),

  // الحصول على المستخدم الحالي
  me: publicProcedure.query(async ({ ctx }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const token = match?.[1];
    const session = await verifySaasToken(token);
    if (!session) return null;
    const user = await getAppUserById(session.userId);
    if (!user || !user.isActive) return null;
    const sub = await getUserActiveSubscription(user.id);
    // Also fetch latest subscription (even expired) for display
    const db = await getDb();
    let latestSub = sub;
    if (!sub && db) {
      const [expired] = await db.select({
        id: subscriptions.id,
        status: subscriptions.status,
        startDate: subscriptions.startDate,
        endDate: subscriptions.endDate,
        planId: subscriptions.planId,
        planName: subscriptionPlans.nameAr,
        planDurationDays: subscriptionPlans.durationDays,
        maxUsers: subscriptionPlans.maxUsers,
        maxInvoices: subscriptionPlans.maxInvoices,
      }).from(subscriptions)
        .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
        .where(eq(subscriptions.userId, user.id))
        .orderBy(desc(subscriptions.endDate))
        .limit(1);
      latestSub = expired || null;
    }
    // Calculate days remaining + banner display
    let daysRemaining: number | null = null;
    let subscriptionBanner = null;
    if (sub?.endDate) {
      const end = new Date(sub.endDate);
      const now = new Date();
      end.setHours(0, 0, 0, 0);
      now.setHours(0, 0, 0, 0);
      daysRemaining = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      subscriptionBanner = buildSubscriptionBanner({
        status: sub.status,
        endDate: String(sub.endDate),
        durationDays: sub.planDurationDays ?? null,
        planName: sub.planName,
      });
    }
    let tenantSlug = ctx.tenantSlug;
    if (!tenantSlug && user.tenantId) {
      const { getTenantById } = await import("./tenant");
      const tenant = await getTenantById(user.tenantId);
      tenantSlug = tenant?.slug ?? null;
    }
    const scope = db
      ? userScopeFromRow({
          role: user.role,
          scopeBranchIds: user.scopeBranchIds,
          scopeWarehouseIds: user.scopeWarehouseIds,
        })
      : { branchIds: null, warehouseIds: null };

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyName: user.companyName,
      phone: user.phone,
      jobTitle: user.jobTitle,
      subscription: latestSub,
      hasActiveSubscription: Boolean(sub),
      daysRemaining,
      subscriptionBanner,
      tenantSlug,
      tenantId: user.tenantId,
      scopeBranchIds: scope.branchIds,
      scopeWarehouseIds: scope.warehouseIds,
    };
  }),

  updateProfile: publicProcedure.input(z.object({
    name: z.string().min(1),
    phone: z.string().optional(),
    jobTitle: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "يجب تسجيل الدخول" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(appUsers).set({
      name: input.name,
      phone: input.phone ?? null,
      jobTitle: input.jobTitle ?? null,
    }).where(eq(appUsers.id, session.userId));
    return { success: true };
  }),

  // فتح برنامج مشترك (سوبر أدمن)
  impersonateTenant: publicProcedure.input(z.object({ userId: z.number() })).mutation(async ({ ctx, input }) => {
    const { session } = await requireSuperAdminFromRequest(ctx.req);
    const target = await getAppUserById(input.userId);
    if (!target?.tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "الشركة غير موجودة" });
    }
    const { getTenantById } = await import("./tenant");
    const tenant = await getTenantById(target.tenantId);
    if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "الشركة غير موجودة" });

    const token = await signSaasToken({
      userId: target.id,
      email: target.email,
      role: target.role,
      tenantId: target.tenantId,
      tenantSlug: tenant.slug,
      impersonatorId: session.userId,
    });
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.cookie(SAAS_COOKIE_NAME, token, { ...cookieOptions, maxAge: SESSION_MAX_AGE_MS });
    return { redirectUrl: `/${tenant.slug}/`, tenantSlug: tenant.slug, companyName: tenant.name };
  }),

  // إعدادات حماية التسجيل (Turnstile اختياري — التسجيل يبقى مفتوحاً للعملاء)
  captchaConfig: publicProcedure.query(async () => {
    const { turnstileSiteKey, turnstileRequired } = await import("./turnstile");
    const siteKey = turnstileSiteKey();
    return {
      provider: siteKey ? ("turnstile" as const) : ("none" as const),
      siteKey,
      required: turnstileRequired(),
    };
  }),

  // إنشاء حساب جديد
  register: publicProcedure.input(z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8, "كلمة المرور 8 أحرف على الأقل"),
    companyName: z.string().min(2, "اسم الشركة مطلوب"),
    phone: z.string().optional(),
    couponCode: z.string().optional(),
    /** Cloudflare Turnstile token */
    captchaToken: z.string().optional(),
    /** Honeypot — يجب أن يبقى فارغاً */
    website: z.string().optional(),
    /** Checkbox «لست روبوتاً» عند غياب Turnstile */
    humanConfirmed: z.boolean().optional(),
  })).mutation(async ({ input, ctx }) => {
    const ip = clientIp(ctx.req);

    // Honeypot: البوتات غالباً تملأ الحقل المخفي
    if (String(input.website || "").trim()) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "تعذر إتمام التسجيل" });
    }

    try {
      assertRateLimit(`register:ip:${ip}`, { limit: 8, windowMs: 60 * 60 * 1000 });
      assertRateLimit(`register:email:${input.email.toLowerCase().trim()}`, { limit: 3, windowMs: 60 * 60 * 1000 });
    } catch (e) {
      if (e instanceof RateLimitError) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `محاولات تسجيل كثيرة — أعد المحاولة بعد ${e.retryAfterSec} ثانية`,
        });
      }
      throw e;
    }

    const { verifyTurnstileToken, turnstileSecretKey, turnstileRequired } = await import("./turnstile");
    if (turnstileSecretKey() || turnstileRequired()) {
      const captcha = await verifyTurnstileToken({ token: input.captchaToken, ip });
      if (!captcha.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: captcha.message });
      }
    } else if (!input.humanConfirmed) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "أكّد أنك لست روبوتاً قبل إنشاء الحساب",
      });
    }

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const existing = await getAppUserByEmail(input.email);
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "البريد الإلكتروني مسجل مسبقاً" });
    const passwordHash = await hashPassword(input.password);
    const companyName = input.companyName.trim();
    const [result] = await db.insert(appUsers).values({
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash,
      role: "admin",
      companyName,
      phone: input.phone || null,
    });
    const userId = (result as any).insertId;
    const { createTenantForOwner } = await import("./tenant");
    const { tenantId, slug } = await createTenantForOwner({ name: input.name, companyName, ownerUserId: userId });
    // التحقق من الكوبون إن وجد
    let couponId: number | null = null;
    if (input.couponCode) {
      const today = new Date().toISOString().split("T")[0];
      const [coupon] = await db.select().from(discountCoupons)
        .where(and(
          eq(discountCoupons.code, input.couponCode.toUpperCase()),
          eq(discountCoupons.isActive, true)
        ));
      if (coupon && (!coupon.expiresAt || coupon.expiresAt >= (today as any)) && (coupon.maxUses === null || coupon.usedCount < coupon.maxUses)) {
        couponId = coupon.id;
        await db.update(discountCoupons).set({ usedCount: coupon.usedCount + 1 }).where(eq(discountCoupons.id, coupon.id));
      }
    }
    // إنشاء اشتراك تجريبي 14 يوم (أو أكثر مع كوبون)
    const [trialPlan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.name, "trial")).limit(1);
    const planId = trialPlan?.id || 1;
    const startDate = new Date().toISOString().split("T")[0];
    // كوبون نسبة يمدد التجربة بنسبة مئوية
    const trialDays = couponId ? 14 : 14; // يمكن توسيع لاحقاً
    const endDate = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    await db.insert(subscriptions).values({
      tenantId,
      userId,
      planId,
      status: "trial",
      startDate: startDate as any,
      endDate: endDate as any,
    });
    const msg = couponId ? `تم إنشاء الحساب بنجاح مع تطبيق كود الخصم بنجاح!` : `تم إنشاء الحساب بنجاح، لديك 14 يوم تجريبي`;
    // إشعار المالك بالتسجيل الجديد
    try {
      const { notifyOwner } = await import("./_core/notification");
      await notifyOwner({
        title: `مستخدم جديد: ${input.name}`,
        content: `انضم مستخدم جديد إلى Easy Cash\nالاسم: ${input.name}\nالبريد: ${input.email}\nالشركة: ${input.companyName || 'غير محدد'}\nالتاريخ: ${new Date().toLocaleDateString('ar-EG')}`,
      });
    } catch { /* لا نوقف التسجيل إذا فشل الإشعار */ }
    return {
      success: true,
      message: msg,
      tenantSlug: slug,
      loginUrl: `/${slug}/login`,
    };
  }),

  // ===================== SUPER ADMIN PROCEDURES =====================
  // قائمة جميع المستخدمين
  listUsers: publicProcedure.input(z.object({
    page: z.number().default(1),
    limit: z.number().default(20),
    search: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    // Verify superadmin
    const { session } = await requireSuperAdminFromRequest(ctx.req);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    const rows = await db.select({
      id: appUsers.id,
      name: appUsers.name,
      email: appUsers.email,
      role: appUsers.role,
      isActive: appUsers.isActive,
      companyName: appUsers.companyName,
      phone: appUsers.phone,
      tenantId: appUsers.tenantId,
      createdAt: appUsers.createdAt,
      lastLoginAt: appUsers.lastLoginAt,
      tenantSlug: tenants.slug,
      tenantName: tenants.name,
    })
      .from(appUsers)
      .leftJoin(tenants, eq(appUsers.tenantId, tenants.id))
      .where(and(sql`${appUsers.role} != 'superadmin'`, isNull(appUsers.ownerUserId)))
      .orderBy(desc(appUsers.createdAt))
      .limit(input.limit)
      .offset(offset);
    const [total] = await db.select({ count: count() }).from(appUsers)
      .where(and(sql`${appUsers.role} != 'superadmin'`, isNull(appUsers.ownerUserId)));
    return { rows, total: total.count };
  }),

  // تعديل مستخدم
  updateUser: publicProcedure.input(z.object({
    id: z.number(),
    name: z.string().optional(),
    email: z.string().email("بريد إلكتروني غير صالح").optional(),
    role: z.enum(["superadmin", "admin", "user"]).optional(),
    isActive: z.boolean().optional(),
    companyName: z.string().optional(),
    phone: z.string().optional(),
    newPassword: z.string().min(6).optional(),
  })).mutation(async ({ ctx, input }) => {
    const { session } = await requireSuperAdminFromRequest(ctx.req);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    if (input.email) {
      const existing = await getAppUserByEmail(input.email);
      if (existing && existing.id !== input.id) {
        throw new TRPCError({ code: "CONFLICT", message: "البريد الإلكتروني مستخدم بالفعل" });
      }
    }
    const updateData: any = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.email !== undefined) updateData.email = input.email;
    if (input.role !== undefined) updateData.role = input.role;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;
    if (input.companyName !== undefined) updateData.companyName = input.companyName;
    if (input.phone !== undefined) updateData.phone = input.phone;
    if (input.newPassword) updateData.passwordHash = await hashPassword(input.newPassword);
    await db.update(appUsers).set(updateData).where(eq(appUsers.id, input.id));
    return { success: true };
  }),

  // حذف مستخدم
  deleteUser: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const { session } = await requireSuperAdminFromRequest(ctx.req);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const user = await getAppUserById(input.id);
    if (user?.role === "superadmin") throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن حذف حساب السوبر أدمن" });
    await db.delete(subscriptions).where(eq(subscriptions.userId, input.id));
    await db.delete(appUsers).where(eq(appUsers.id, input.id));
    return { success: true };
  }),

  // قائمة الاشتراكات
  listSubscriptions: publicProcedure.input(z.object({
    page: z.number().default(1),
    limit: z.number().default(20),
    status: z.enum(["all", "active", "trial", "expired", "expired_trial", "cancelled", "suspended"]).default("all"),
    search: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const { session } = await requireSuperAdminFromRequest(ctx.req);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const today = todayDateOnly();
    const offset = (input.page - 1) * input.limit;

    const statusFilter = (() => {
      switch (input.status) {
        case "active":
          return and(gte(subscriptions.endDate, today as any), eq(subscriptions.status, "active"));
        case "trial":
          return and(
            gte(subscriptions.endDate, today as any),
            or(eq(subscriptions.status, "trial"), eq(subscriptions.status, "expired")),
          );
        case "expired":
          return and(
            lt(subscriptions.endDate, today as any),
            inArray(subscriptions.status, ["trial", "active", "expired"]),
          );
        case "expired_trial":
          return and(lt(subscriptions.endDate, today as any), eq(subscriptions.status, "trial"));
        case "cancelled":
          return eq(subscriptions.status, "cancelled");
        case "suspended":
          return eq(subscriptions.status, "suspended");
        default:
          return undefined;
      }
    })();

    const searchFilter = input.search?.trim()
      ? or(
          like(appUsers.name, `%${input.search.trim()}%`),
          like(appUsers.email, `%${input.search.trim()}%`),
          like(subscriptionPlans.nameAr, `%${input.search.trim()}%`),
        )
      : undefined;

    const whereClause = and(
      ...(statusFilter ? [statusFilter] : []),
      ...(searchFilter ? [searchFilter] : []),
    );

    const baseQuery = db.select({
      id: subscriptions.id,
      status: subscriptions.status,
      startDate: subscriptions.startDate,
      endDate: subscriptions.endDate,
      notes: subscriptions.notes,
      createdAt: subscriptions.createdAt,
      userId: subscriptions.userId,
      planId: subscriptions.planId,
      userName: appUsers.name,
      userEmail: appUsers.email,
      planName: subscriptionPlans.nameAr,
      planPrice: subscriptionPlans.price,
    })
      .from(subscriptions)
      .leftJoin(appUsers, eq(subscriptions.userId, appUsers.id))
      .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id));

    const rows = await (whereClause ? baseQuery.where(whereClause) : baseQuery)
      .orderBy(desc(subscriptions.endDate))
      .limit(input.limit)
      .offset(offset);

    const countQuery = db.select({ count: count() }).from(subscriptions)
      .leftJoin(appUsers, eq(subscriptions.userId, appUsers.id))
      .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id));
    const [totalRow] = await (whereClause ? countQuery.where(whereClause) : countQuery);

    const mapRow = (r: typeof rows[number]) => {
      const endDate = toDateOnly(r.endDate);
      const startDate = toDateOnly(r.startDate);
      const effectiveStatus = effectiveSubscriptionStatus(String(r.status), endDate, today);
      return {
        ...r,
        startDate,
        endDate,
        effectiveStatus,
        isExpired: endDate < today && r.status !== "cancelled" && r.status !== "suspended",
      };
    };

    return {
      rows: rows.map(mapRow),
      total: totalRow.count,
    };
  }),

  // إضافة/تعديل اشتراك
  upsertSubscription: publicProcedure.input(z.object({
    id: z.number().optional(),
    userId: z.number(),
    planId: z.number(),
    status: z.enum(["trial", "active", "expired", "cancelled", "suspended"]),
    startDate: z.string(),
    endDate: z.string(),
    notes: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const { session } = await requireSuperAdminFromRequest(ctx.req);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const today = todayDateOnly();
    const status = normalizeSubscriptionStatusForSave(input.status, input.endDate, today);
    const [user] = await db.select({ tenantId: appUsers.tenantId }).from(appUsers).where(eq(appUsers.id, input.userId)).limit(1);
    const data = {
      userId: input.userId,
      tenantId: user?.tenantId ?? null,
      planId: input.planId,
      status,
      startDate: input.startDate as any,
      endDate: input.endDate as any,
      notes: input.notes || null,
    };
    if (input.id) {
      await db.update(subscriptions).set(data).where(eq(subscriptions.id, input.id));
    } else {
      await db.insert(subscriptions).values(data);
    }
    return { success: true };
  }),

  // تجديد فترة تجريبية لاشتراك منتهٍ
  renewTrial: publicProcedure.input(z.object({
    subscriptionId: z.number(),
    days: z.number().min(1).max(365).default(14),
    notes: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const { session } = await requireSuperAdminFromRequest(ctx.req);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, input.subscriptionId)).limit(1);
    if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "الاشتراك غير موجود" });

    const [user] = await db.select({ tenantId: appUsers.tenantId }).from(appUsers).where(eq(appUsers.id, sub.userId)).limit(1);
    const [trialPlan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.name, "trial")).limit(1);
    const startDate = todayDateOnly();
    const endDate = toDateOnly(new Date(Date.now() + input.days * 24 * 60 * 60 * 1000));
    const noteSuffix = `تجديد تجربة ${input.days} يوم (${startDate})`;
    const notes = sub.notes ? `${sub.notes}\n${noteSuffix}` : noteSuffix;

    await db.update(subscriptions).set({
      status: "trial",
      tenantId: sub.tenantId ?? user?.tenantId ?? null,
      planId: trialPlan?.id ?? sub.planId,
      startDate: startDate as any,
      endDate: endDate as any,
      notes: input.notes?.trim() || notes,
    }).where(eq(subscriptions.id, input.subscriptionId));

    return { success: true, startDate, endDate, message: `تم تجديد التجربة حتى ${endDate}` };
  }),

  // قائمة الخطط
  listPlans: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(subscriptionPlans).orderBy(subscriptionPlans.price);
  }),

  // إضافة/تعديل خطة
  upsertPlan: publicProcedure.input(z.object({
    id: z.number().optional(),
    name: z.string(),
    nameAr: z.string(),
    price: z.string(),
    currency: z.string().default("EGP"),
    durationDays: z.number(),
    maxUsers: z.number().optional(),
    maxInvoices: z.number().optional(),
    features: z.string().optional(),
    isActive: z.boolean().default(true),
  })).mutation(async ({ ctx, input }) => {
    const { session } = await requireSuperAdminFromRequest(ctx.req);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const data = {
      name: input.name, nameAr: input.nameAr, price: input.price,
      currency: input.currency, durationDays: input.durationDays,
      maxUsers: input.maxUsers || 1, maxInvoices: input.maxInvoices || 100,
      features: input.features || null, isActive: input.isActive,
    };
    if (input.id) {
      await db.update(subscriptionPlans).set(data).where(eq(subscriptionPlans.id, input.id));
    } else {
      await db.insert(subscriptionPlans).values(data);
    }
    return { success: true };
  }),

  // حذف اشتراك
  deleteSubscription: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const { session } = await requireSuperAdminFromRequest(ctx.req);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(subscriptions).where(eq(subscriptions.id, input.id));
    return { success: true };
  }),

  // حذف خطة
  deletePlan: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const { session } = await requireSuperAdminFromRequest(ctx.req);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Check no active subscriptions use this plan
    const [inUse] = await db.select({ count: count() }).from(subscriptions).where(eq(subscriptions.planId, input.id));
    if (inUse.count > 0) throw new TRPCError({ code: "CONFLICT", message: "لا يمكن حذف خطة مرتبطة باشتراكات" });
    await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, input.id));
    return { success: true };
  }),

  // ===================== COUPON APIs =====================
  listCoupons: publicProcedure.query(async ({ ctx }) => {
    const { session } = await requireSuperAdminFromRequest(ctx.req);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(discountCoupons).orderBy(desc(discountCoupons.createdAt));
  }),

  createCoupon: publicProcedure.input(z.object({
    code: z.string().min(3).max(50).toUpperCase(),
    description: z.string().optional(),
    discountType: z.enum(["percentage", "fixed"]),
    discountValue: z.number().positive(),
    maxUses: z.number().positive().optional(),
    expiresAt: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const { session } = await requireSuperAdminFromRequest(ctx.req);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(discountCoupons).values({
      code: input.code.toUpperCase(),
      description: input.description || null,
      discountType: input.discountType,
      discountValue: String(input.discountValue),
      maxUses: input.maxUses || null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    });
    return { success: true };
  }),

  updateCoupon: publicProcedure.input(z.object({
    id: z.number(),
    isActive: z.boolean().optional(),
    maxUses: z.number().positive().optional().nullable(),
    expiresAt: z.string().optional().nullable(),
    description: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const { session } = await requireSuperAdminFromRequest(ctx.req);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const upd: any = {};
    if (input.isActive !== undefined) upd.isActive = input.isActive;
    if (input.maxUses !== undefined) upd.maxUses = input.maxUses;
    if (input.expiresAt !== undefined) upd.expiresAt = input.expiresAt;
    if (input.description !== undefined) upd.description = input.description;
    await db.update(discountCoupons).set(upd).where(eq(discountCoupons.id, input.id));
    return { success: true };
  }),

  deleteCoupon: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const { session } = await requireSuperAdminFromRequest(ctx.req);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(discountCoupons).where(eq(discountCoupons.id, input.id));
    return { success: true };
  }),

  // التحقق من كوبون (للمستخدمين عند التسجيل)
  validateCoupon: publicProcedure.input(z.object({ code: z.string() })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return null;
    const today = new Date().toISOString().split("T")[0];
    const [coupon] = await db.select().from(discountCoupons)
      .where(and(
        eq(discountCoupons.code, input.code.toUpperCase()),
        eq(discountCoupons.isActive, true)
      ));
    if (!coupon) return null;
    if (coupon.expiresAt && coupon.expiresAt < (today as any)) return null;
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return null;
    return {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      description: coupon.description,
    };
  }),

  // ===================== COMPANY PROFILE APIs =====================
  getCompanyProfile: publicProcedure.query(async ({ ctx }) => {
    const session = await verifySaasToken(getSaasTokenFromRequest(ctx.req));
    if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "غير مصرح" });
    const appUser = await getAppUserById(session.userId);
    if (!appUser?.isActive) throw new TRPCError({ code: "UNAUTHORIZED", message: "غير مصرح" });
    const tenantId = appUser.tenantId ?? session.tenantId;
    if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "الحساب غير مرتبط بشركة" });
    const db = await getDb();
    if (!db) return null;
    const [profile] = await db
      .select()
      .from(companyProfile)
      .where(eq(companyProfile.tenantId, tenantId))
      .limit(1);
    return profile || null;
  }),

  saveCompanyProfile: publicProcedure.input(z.object({
    name: z.string().min(1),
    nameEn: z.string().optional(),
    logo: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    country: z.string().optional(),
    phone: z.string().optional(),
    phone2: z.string().optional(),
    email: z.string().optional(),
    website: z.string().optional(),
    taxNumber: z.string().optional(),
    commercialRegister: z.string().optional(),
    currency: z.string().optional(),
    invoiceFooter: z.string().optional(),
    defaultPrintTemplate: z.enum([
      "standard-a4",
      "professional-a4",
      "bilingual-a4",
      "compact-a5",
      "thermal",
      "thermal-58",
    ]).optional(),
  })).mutation(async ({ ctx, input }) => {
    const session = await verifySaasToken(getSaasTokenFromRequest(ctx.req));
    if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "غير مصرح" });
    const appUser = await getAppUserById(session.userId);
    if (!appUser?.isActive) throw new TRPCError({ code: "UNAUTHORIZED", message: "غير مصرح" });
    const tenantId = appUser.tenantId ?? session.tenantId;
    if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "الحساب غير مرتبط بشركة" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [existing] = await db
      .select({ id: companyProfile.id })
      .from(companyProfile)
      .where(eq(companyProfile.tenantId, tenantId))
      .limit(1);
    if (existing) {
      await db.update(companyProfile).set(input).where(and(eq(companyProfile.id, existing.id), eq(companyProfile.tenantId, tenantId)));
    } else {
      await db.insert(companyProfile).values({ ...input, tenantId });
    }
    return { success: true };
  }),

  // ===================== SUBSCRIPTION REPORT =====================
  subscriptionReport: publicProcedure.query(async ({ ctx }) => {
    const { session } = await requireSuperAdminFromRequest(ctx.req);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Monthly new subscriptions (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    const allSubs = await db.select({
      id: subscriptions.id,
      status: subscriptions.status,
      startDate: subscriptions.startDate,
      endDate: subscriptions.endDate,
      planId: subscriptions.planId,
      planName: subscriptionPlans.nameAr,
      price: subscriptionPlans.price,
    }).from(subscriptions)
      .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id));
    // Group by month
    const monthlyMap: Record<string, { month: string; count: number; revenue: number }> = {};
    for (const sub of allSubs) {
      const d = new Date(sub.startDate);
      if (d < sixMonthsAgo) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthlyMap[key]) monthlyMap[key] = { month: key, count: 0, revenue: 0 };
      monthlyMap[key].count++;
      monthlyMap[key].revenue += parseFloat(sub.price || "0");
    }
    const monthly = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));
    // By plan
    const planMap: Record<string, { name: string; count: number; revenue: number }> = {};
    for (const sub of allSubs) {
      const key = sub.planName || "غير محدد";
      if (!planMap[key]) planMap[key] = { name: key, count: 0, revenue: 0 };
      planMap[key].count++;
      planMap[key].revenue += parseFloat(sub.price || "0");
    }
    const byPlan = Object.values(planMap);
    // Status breakdown
    const today = new Date().toISOString().split("T")[0];
    const statusMap: Record<string, number> = {};
    for (const sub of allSubs) {
      const isExpired = sub.endDate < (today as any) && sub.status !== "cancelled";
      const status = isExpired ? "expired" : sub.status;
      statusMap[status] = (statusMap[status] || 0) + 1;
    }
    const totalRevenue = allSubs.reduce((s, sub) => s + parseFloat(sub.price || "0"), 0);
    return { monthly, byPlan, statusBreakdown: statusMap, totalRevenue, totalSubscriptions: allSubs.length };
  }),

  // إحصائيات السوبر أدمن
  adminStats: publicProcedure.query(async ({ ctx }) => {
    const { session } = await requireSuperAdminFromRequest(ctx.req);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [totalUsers] = await db.select({ count: count() }).from(appUsers);
    const [activeUsers] = await db.select({ count: count() }).from(appUsers).where(eq(appUsers.isActive, true));
    const today = new Date().toISOString().split("T")[0];
    const [activeSubs] = await db.select({ count: count() }).from(subscriptions)
      .where(and(gte(subscriptions.endDate, today as any), eq(subscriptions.status, "active")));
    const [trialSubs] = await db.select({ count: count() }).from(subscriptions)
      .where(and(gte(subscriptions.endDate, today as any), eq(subscriptions.status, "trial")));
    const [expiredSubs] = await db.select({ count: count() }).from(subscriptions)
      .where(and(
        lt(subscriptions.endDate, today as any),
        inArray(subscriptions.status, ["trial", "active", "expired"]),
      ));
    const [expiredTrialSubs] = await db.select({ count: count() }).from(subscriptions)
      .where(and(lt(subscriptions.endDate, today as any), eq(subscriptions.status, "trial")));
    const [totalPlans] = await db.select({ count: count() }).from(subscriptionPlans);
    const [openTickets] = await db.select({ count: count() }).from(supportTickets).where(eq(supportTickets.status, "open"));
    return {
      totalUsers: totalUsers.count,
      activeUsers: activeUsers.count,
      activeSubscriptions: activeSubs.count,
      trialSubscriptions: trialSubs.count,
      expiredSubscriptions: expiredSubs.count,
      expiredTrialSubscriptions: expiredTrialSubs.count,
      totalPlans: totalPlans.count,
      openTickets: openTickets.count,
    };
  }),

  // ===================== SUPPORT TICKETS =====================
  // إرسال تذكرة دعم (من المستخدم)
  createTicket: publicProcedure.input(z.object({
    subject: z.string().min(5),
    message: z.string().min(10),
    priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  })).mutation(async ({ ctx, input }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // جلب اسم المستخدم من قاعدة البيانات
    const [user] = await db.select({ name: appUsers.name }).from(appUsers).where(eq(appUsers.id, session.userId));
    await db.insert(supportTickets).values({
      userId: session.userId,
      userName: user?.name || session.email,
      userEmail: session.email,
      subject: input.subject,
      message: input.message,
      priority: input.priority,
      status: "open",
    });
    return { success: true, message: "تم إرسال طلب الدعم بنجاح" };
  }),

  // جلب تذاكر المستخدم الحالي
  myTickets: publicProcedure.query(async ({ ctx }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(supportTickets)
      .where(eq(supportTickets.userId, session.userId))
      .orderBy(desc(supportTickets.createdAt));
  }),

  // جلب جميع التذاكر (سوبر أدمن)
  listTickets: publicProcedure.input(z.object({
    status: z.enum(["open", "in_progress", "resolved", "closed", "all"]).default("all"),
    page: z.number().default(1),
    limit: z.number().default(20),
  })).query(async ({ ctx, input }) => {
    const { session } = await requireSuperAdminFromRequest(ctx.req);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    let q = db.select().from(supportTickets);
    if (input.status !== "all") {
      q = q.where(eq(supportTickets.status, input.status as any)) as any;
    }
    const rows = await (q as any).orderBy(desc(supportTickets.createdAt)).limit(input.limit).offset(offset);
    const [total] = await db.select({ count: count() }).from(supportTickets);
    return { rows, total: total.count };
  }),

  // تصدير جميع الاشتراكات (بدون pagination)
  exportAllSubscriptions: publicProcedure.query(async ({ ctx }) => {
    const { session } = await requireSuperAdminFromRequest(ctx.req);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const rows = await db.select({
      id: subscriptions.id,
      status: subscriptions.status,
      startDate: subscriptions.startDate,
      endDate: subscriptions.endDate,
      notes: subscriptions.notes,
      createdAt: subscriptions.createdAt,
      userId: subscriptions.userId,
      planId: subscriptions.planId,
      userName: appUsers.name,
      userEmail: appUsers.email,
      planNameAr: subscriptionPlans.nameAr,
      price: subscriptionPlans.price,
    })
    .from(subscriptions)
    .leftJoin(appUsers, eq(subscriptions.userId, appUsers.id))
    .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
    .orderBy(desc(subscriptions.createdAt));
    return rows.map((r) => ({
      ...r,
      startDate: toDateStr(r.startDate),
      endDate: toDateStr(r.endDate),
    }));
  }),

  // رد السوبر أدمن على تذكرة
  replyTicket: publicProcedure.input(z.object({
    id: z.number(),
    adminReply: z.string().min(1),
    status: z.enum(["open", "in_progress", "resolved", "closed"]),
  })).mutation(async ({ ctx, input }) => {
    const { session } = await requireSuperAdminFromRequest(ctx.req);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(supportTickets).set({
      adminReply: input.adminReply,
      status: input.status,
      repliedAt: new Date(),
    }).where(eq(supportTickets.id, input.id));
    // إضافة إشعار داخلي لصاحب التذكرة
    const [ticket] = await db.select({ userId: supportTickets.userId }).from(supportTickets).where(eq(supportTickets.id, input.id));
    if (ticket?.userId) {
      await db.insert(userNotifications).values({
        userId: ticket.userId,
        type: "info",
        title: "رد على طلب الدعم",
        message: `تم الرد على طلب دعمك: ${input.adminReply.substring(0, 100)}...`,
      });
    }
    return { success: true };
  }),

  // ===================== USER NOTIFICATIONS =====================
  getMyNotifications: publicProcedure.query(async ({ ctx }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });
    const db = await getDb();
    if (!db) return [];
    return db.select().from(userNotifications)
      .where(eq(userNotifications.userId, session.userId))
      .orderBy(desc(userNotifications.createdAt))
      .limit(20);
  }),

  markNotificationRead: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });
    const db = await getDb();
    if (!db) return;
    await db.update(userNotifications).set({ isRead: true })
      .where(and(eq(userNotifications.id, input.id), eq(userNotifications.userId, session.userId)));
    return { success: true };
  }),

  markAllNotificationsRead: publicProcedure.mutation(async ({ ctx }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });
    const db = await getDb();
    if (!db) return;
    await db.update(userNotifications).set({ isRead: true })
      .where(eq(userNotifications.userId, session.userId));
    return { success: true };
  }),

  // ===================== PUBLIC PLANS =====================
  listPublicPlans: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.isActive, true))
      .orderBy(subscriptionPlans.price);
  }),

  // ===================== PAYMOB SETTINGS (SUPER ADMIN) =====================
  getPaymobSettings: publicProcedure.query(async ({ ctx }) => {
    const { requireSaasSuperAdmin } = await import("./saas-auth");
    requireSaasSuperAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const { absoluteUrl } = await import("./paymob");
    const defaultUrls = {
      webhookUrl: absoluteUrl(ctx.req, "/api/webhooks/paymob"),
      returnUrl: absoluteUrl(ctx.req, "/pricing?payment=return"),
    };

    try {
      const [row] = await db.select().from(paymobSettings).limit(1);
      if (!row) {
        return {
          configured: false,
          mode: "test" as const,
          isEnabled: false,
          publicKey: "",
          publicKeyLast8: "",
          currency: "EGP",
          hasSecretKey: false,
          hasHmacSecret: false,
          needsSecretResave: false,
          readyForPayments: false,
          paymentMethods: [] as Array<{ id: number; methodType: "card" | "wallet"; integrationId: number; isEnabled: boolean; labelAr: string }>,
          ...defaultUrls,
        };
      }
      let publicConfig: Record<string, unknown> = {};
      try {
        publicConfig = row.publicConfig ? JSON.parse(row.publicConfig) : {};
      } catch { /* ignore */ }
      const {
        listPaymobPaymentMethods,
        hasEnabledCardMethod,
        enabledPaymobIntegrationIds,
      } = await import("./paymob-methods");
      const paymentMethods = await listPaymobPaymentMethods(db, publicConfig);
      let hasSecretKey = false;
      let hasHmacSecret = false;
      let needsSecretResave = false;
      if (row.encryptedSecret) {
        try {
          const { loadPaymobSecrets } = await import("./paymob");
          const secret = loadPaymobSecrets(row.encryptedSecret);
          hasSecretKey = Boolean(secret.secretKey);
          hasHmacSecret = Boolean(secret.hmacSecret);
        } catch {
          needsSecretResave = true;
        }
      }
      const publicKeyLast8 = String(publicConfig.publicKeyLast8 || "");
      const readyForPayments = Boolean(
        row.isEnabled &&
        hasSecretKey &&
        publicKeyLast8 &&
        hasEnabledCardMethod(paymentMethods) &&
        !needsSecretResave,
      );
      const cardRow = paymentMethods.find((m) => m.methodType === "card");
      const walletRow = paymentMethods.find((m) => m.methodType === "wallet");
      return {
        configured: true,
        mode: row.mode,
        isEnabled: row.isEnabled,
        publicKey: String(publicConfig.publicKey || ""),
        publicKeyLast8,
        currency: String(publicConfig.currency || "EGP"),
        hasSecretKey,
        hasHmacSecret,
        needsSecretResave,
        readyForPayments,
        paymentMethods,
        cardIntegrationId: cardRow?.integrationId && cardRow.integrationId > 0 ? cardRow.integrationId : null,
        walletIntegrationId: walletRow?.integrationId && walletRow.integrationId > 0 ? walletRow.integrationId : null,
        enabledIntegrationIds: enabledPaymobIntegrationIds(paymentMethods),
        updatedAt: row.updatedAt,
        ...defaultUrls,
      };
    } catch (error) {
      console.error("[getPaymobSettings]", error);
      return {
        configured: false,
        mode: "test" as const,
        isEnabled: false,
        publicKey: "",
        publicKeyLast8: "",
        currency: "EGP",
        hasSecretKey: false,
        hasHmacSecret: false,
        needsSecretResave: false,
        readyForPayments: false,
        paymentMethods: [] as Array<{ id: number; methodType: "card" | "wallet"; integrationId: number; isEnabled: boolean; labelAr: string }>,
        ...defaultUrls,
      };
    }
  }),

  savePaymobSettings: publicProcedure.input(z.object({
    mode: z.enum(["test", "live"]).default("test"),
    publicKey: z.string().min(8).optional(),
    secretKey: z.string().min(8).optional(),
    hmacSecret: z.string().optional(),
    currency: z.string().min(3).max(3).default("EGP"),
    isEnabled: z.boolean().default(false),
    paymentMethods: z.array(z.object({
      methodType: z.enum(["card", "wallet"]),
      integrationId: z.coerce.number().int().nonnegative(),
      isEnabled: z.boolean(),
    })).optional(),
  })).mutation(async ({ ctx, input }) => {
    const { requireSaasSuperAdmin } = await import("./saas-auth");
    requireSaasSuperAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const {
      encodeSecret, assertPaymobPublicKey, assertPaymobSecretKey,
      normalizePaymobSecretKey, loadPaymobSecrets, testPaymobIntention,
      assertPaymobKeysMatchMode,
    } = await import("./paymob");
    const {
      listPaymobPaymentMethods,
      savePaymobPaymentMethods,
      hasEnabledCardMethod,
      enabledPaymobIntegrationIds,
      buildPaymobIntentionPaymentMethods,
      buildPaymobIntentionFallbacks,
      intentionIncludesWallet,
      walletEnabled,
      validatePaymobPaymentMethodsForIntention,
    } = await import("./paymob-methods");

    const [existing] = await db.select().from(paymobSettings).limit(1);
    if ((!input.publicKey || !input.secretKey) && !existing) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Public Key و Secret Key مطلوبة في أول حفظ",
      });
    }

    let existingConfig: Record<string, unknown> = {};
    let existingSecret: { secretKey: string; hmacSecret?: string } | null = null;
    if (existing?.encryptedSecret) {
      try {
        existingConfig = existing.publicConfig ? JSON.parse(existing.publicConfig) : {};
      } catch { /* ignore */ }
      try {
        existingSecret = loadPaymobSecrets(existing.encryptedSecret);
      } catch (e) {
        if (!input.secretKey) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: e instanceof Error ? e.message : "أعد إدخال Secret Key",
          });
        }
      }
    }

    const publicKey = input.publicKey ?? String(existingConfig.publicKey ?? "");
    assertPaymobPublicKey(publicKey);
    assertPaymobKeysMatchMode(input.mode, publicKey, input.secretKey ?? existingSecret?.secretKey);

    const resolvedSecretKey = input.secretKey
      ? assertPaymobSecretKey(input.secretKey)
      : normalizePaymobSecretKey(existingSecret?.secretKey ?? "");

    if (input.isEnabled && !resolvedSecretKey) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Secret Key مطلوب لتفعيل Paymob — أدخله واحفظ",
      });
    }

    const publicConfig = {
      publicKey,
      publicKeyLast8: publicKey.slice(-8),
      currency: input.currency.toUpperCase(),
    };

    let paymentMethods = await listPaymobPaymentMethods(db, existingConfig);
    if (input.paymentMethods?.length) {
      try {
        paymentMethods = await savePaymobPaymentMethods(db, input.paymentMethods);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (/paymob_payment_methods|doesn't exist|ER_NO_SUCH_TABLE/i.test(msg)) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "جدول طرق الدفع غير موجود على السيرفر. انشر آخر تحديث (deploy) وانتظر دقيقة ثم أعد المحاولة.",
          });
        }
        throw error;
      }
    }

    if (input.isEnabled && !hasEnabledCardMethod(paymentMethods)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "فعّل صف بطاقة ائتمان وأدخل رقم التكامل (مثل 5084536) في جدول طرق الدفع",
      });
    }

    if (input.isEnabled) {
      const methodCheck = validatePaymobPaymentMethodsForIntention(paymentMethods, input.mode);
      if (!methodCheck.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: methodCheck.message });
      }
    }

    const integrationIds = enabledPaymobIntegrationIds(paymentMethods);
    const paymentMethodInputs = buildPaymobIntentionPaymentMethods(paymentMethods);
    const intentionFallbacks = buildPaymobIntentionFallbacks(paymentMethods);
    const [, ...fallbackOnly] = intentionFallbacks;

    const encryptedSecret = encodeSecret({
      secretKey: resolvedSecretKey,
      hmacSecret: String(input.hmacSecret ?? existingSecret?.hmacSecret ?? "").trim(),
    });

    let enabled = input.isEnabled;
    let settingsId = existing?.id;
    if (existing) {
      await db.update(paymobSettings).set({
        mode: input.mode,
        publicConfig: JSON.stringify(publicConfig),
        encryptedSecret,
        isEnabled: enabled,
      }).where(eq(paymobSettings.id, existing.id));
    } else {
      const [inserted] = await db.insert(paymobSettings).values({
        mode: input.mode,
        publicConfig: JSON.stringify(publicConfig),
        encryptedSecret,
        isEnabled: enabled,
      });
      settingsId = (inserted as { insertId: number }).insertId;
    }

    if (input.isEnabled) {
      try {
        await testPaymobIntention(
          resolvedSecretKey,
          paymentMethodInputs,
          publicConfig.currency,
          input.mode,
          fallbackOnly,
          walletEnabled(paymentMethods),
        );
      } catch (error) {
        enabled = false;
        if (settingsId) {
          await db.update(paymobSettings).set({ isEnabled: false }).where(eq(paymobSettings.id, settingsId));
        }
        const msg = error instanceof Error ? error.message : "فشل اختبار Paymob";
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `تم حفظ المفاتيح. لم يُفعَّل الدفع: ${msg}`,
        });
      }
    }

    return { success: true, isEnabled: enabled };
  }),

  testPaymobConnection: publicProcedure.mutation(async ({ ctx }) => {
    const { requireSaasSuperAdmin } = await import("./saas-auth");
    requireSaasSuperAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const { assertPaymobPublicKey, testPaymobIntention, loadPaymobSecrets } = await import("./paymob");
    const { listPaymobPaymentMethods, buildPaymobIntentionPaymentMethods, buildPaymobIntentionFallbacks, intentionIncludesWallet, walletEnabled } = await import("./paymob-methods");
    const [row] = await db.select().from(paymobSettings).limit(1);
    if (!row?.encryptedSecret) {
      throw new TRPCError({ code: "NOT_FOUND", message: "إعدادات Paymob غير موجودة" });
    }

    const publicConfig = JSON.parse(row.publicConfig || "{}") as { publicKey: string; currency?: string };
    const paymentMethodRows = await listPaymobPaymentMethods(db, publicConfig);
    const paymentMethodInputs = buildPaymobIntentionPaymentMethods(paymentMethodRows);
    const intentionFallbacks = buildPaymobIntentionFallbacks(paymentMethodRows);
    const [, ...fallbackOnly] = intentionFallbacks;
    const walletRow = paymentMethodRows.find((m) => m.methodType === "wallet" && m.isEnabled);
    const { secretKey } = loadPaymobSecrets(row.encryptedSecret);
    assertPaymobPublicKey(publicConfig.publicKey);

    const data = await testPaymobIntention(
      secretKey,
      paymentMethodInputs,
      publicConfig.currency || "EGP",
      row.mode as "test" | "live",
      fallbackOnly,
      Boolean(walletRow),
    );
    const walletInCheckout = walletRow ? intentionIncludesWallet(data) : true;
    const methodsUsed = (data as { _paymentMethodsUsed?: Array<number | string> })._paymentMethodsUsed || paymentMethodInputs;
    const walletId = walletRow?.integrationId;
    return {
      ok: true,
      intentionId: (data as { id?: string }).id,
      hasClientSecret: Boolean((data as { client_secret?: string }).client_secret),
      paymentMethodsSent: methodsUsed,
      walletInCheckout,
      walletWarning: walletRow && !walletInCheckout
        ? `المحفظة مفعّلة في Easy Cash لكن Paymob لم يضفها لصفحة الدفع. تكامل البطاقة 5084536 (Shopify/MIGS) غالباً يدعم الكارت فقط. تواصل مع دعم Paymob (MID 804662) واطلب تفعيل Mobile Wallets على Intention API / Unified Checkout — وقد تحتاج رقم تكامل محفظة جديد غير ${walletId || "4310646"}.`
        : undefined,
    };
  }),

  // ===================== PLAN CHECKOUT =====================
  createPlanCheckout: publicProcedure.input(z.object({
    planId: z.number().optional(),
    planName: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "يجب تسجيل الدخول أولاً" });

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [gateway] = await db.select().from(paymobSettings).where(eq(paymobSettings.isEnabled, true)).limit(1);
    if (!gateway?.encryptedSecret) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "بوابة Paymob غير مفعّلة. تواصل مع الإدارة." });
    }

    let plan;
    if (input.planId) {
      [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, input.planId)).limit(1);
    } else if (input.planName) {
      [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.name, input.planName)).limit(1);
    }
    if (!plan || !plan.isActive) {
      throw new TRPCError({ code: "NOT_FOUND", message: "الخطة غير موجودة" });
    }
    if (Number(plan.price) <= 0 || plan.name === "trial") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "هذه الخطة مجانية — سجّل حساباً جديداً" });
    }

    const user = await getAppUserById(session.userId);
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });

    const {
      assertPaymobPublicKey, paymobCheckoutUrl, paymobErrorMessage,
      splitName, absoluteUrl, amountToCents, loadPaymobSecrets,
      normalizeEgyptPhone, createPaymobIntention,
    } = await import("./paymob");
    const { listPaymobPaymentMethods, buildPaymobIntentionPaymentMethods, buildPaymobIntentionFallbacks, walletEnabled } = await import("./paymob-methods");

    const publicConfig = JSON.parse(gateway.publicConfig || "{}") as {
      publicKey: string;
      currency?: string;
    };
    const paymentMethodRows = await listPaymobPaymentMethods(db, publicConfig);
    const paymentMethodInputs = buildPaymobIntentionPaymentMethods(paymentMethodRows);
    const intentionFallbacks = buildPaymobIntentionFallbacks(paymentMethodRows);
    const [, ...fallbackOnly] = intentionFallbacks;
    if (paymentMethodInputs.length === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "لا توجد طرق دفع مفعّلة في إعدادات Paymob" });
    }
    const { secretKey } = loadPaymobSecrets(gateway.encryptedSecret);
    assertPaymobPublicKey(publicConfig.publicKey);

    const amountCents = amountToCents(plan.price);
    const [paymentResult] = await db.insert(subscriptionPayments).values({
      userId: session.userId,
      planId: plan.id,
      amount: plan.price,
      currency: publicConfig.currency || plan.currency || "EGP",
      status: "pending",
    });
    const paymentId = (paymentResult as { insertId: number }).insertId;

    let returnPath = `/pricing?payment=return&paymentId=${paymentId}`;
    if (user.tenantId) {
      const { getTenantById } = await import("./tenant");
      const tenant = await getTenantById(user.tenantId);
      if (tenant?.slug) {
        returnPath = `/${tenant.slug}/dashboard?payment=return&paymentId=${paymentId}`;
      }
    }

    const paymentReference = `easy_cash_payment:${paymentId}`;
    const customerName = splitName(user.name || "Customer");

    let intention: { id?: string; client_secret?: string; intention_order_id?: string };
    try {
      intention = await createPaymobIntention(
        secretKey,
        paymentMethodInputs,
        {
          amount: amountCents,
          currency: publicConfig.currency || "EGP",
          items: [{
            name: `Easy Cash ${plan.nameAr}`.slice(0, 50),
            amount: amountCents,
            description: `اشتراك ${plan.nameAr}`,
            quantity: 1,
          }],
          billing_data: {
            first_name: customerName.firstName,
            last_name: customerName.lastName,
            phone_number: normalizeEgyptPhone(user.phone),
            email: user.email,
            country: "EG",
            city: "Cairo",
            street: "NA",
            building: "NA",
            apartment: "NA",
            floor: "NA",
          },
          special_reference: paymentReference,
          notification_url: absoluteUrl(ctx.req, "/api/webhooks/paymob"),
          redirection_url: absoluteUrl(ctx.req, returnPath),
          expiration: 3600,
        },
        gateway.mode as "test" | "live",
        fallbackOnly,
        walletEnabled(paymentMethodRows),
      );
    } catch (error) {
      await db.update(subscriptionPayments).set({ status: "failed" }).where(eq(subscriptionPayments.id, paymentId));
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error instanceof Error ? error.message : paymobErrorMessage(null, {
          mode: gateway.mode as "test" | "live",
          integrationIds: paymentMethodInputs,
        }),
      });
    }

    if (!(intention as { client_secret?: string }).client_secret) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: paymobErrorMessage(intention, {
          mode: gateway.mode as "test" | "live",
          integrationIds: paymentMethodInputs,
        }),
      });
    }

    const intentionId = String((intention as { id?: string; intention_order_id?: string }).id || (intention as { intention_order_id?: string }).intention_order_id || "");
    await db.update(subscriptionPayments).set({ providerReference: intentionId }).where(eq(subscriptionPayments.id, paymentId));

    const checkoutUrl = paymobCheckoutUrl(publicConfig.publicKey, (intention as { client_secret: string }).client_secret);
    return { checkoutUrl, paymentId, planName: plan.nameAr, amount: plan.price };
  }),

  confirmPlanPayment: publicProcedure.input(z.object({
    paymentId: z.number(),
    paymobSuccess: z.boolean().optional(),
    amountCents: z.number().optional(),
  })).mutation(async ({ ctx, input }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [payment] = await db
      .select()
      .from(subscriptionPayments)
      .where(and(eq(subscriptionPayments.id, input.paymentId), eq(subscriptionPayments.userId, session.userId)))
      .limit(1);
    if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "عملية الدفع غير موجودة" });

    if (payment.status === "paid") {
      return { ok: true, status: "paid" as const, message: "الاشتراك مفعّل بالفعل" };
    }

    if (input.paymobSuccess === false) {
      await db.update(subscriptionPayments).set({ status: "failed" }).where(eq(subscriptionPayments.id, input.paymentId));
      return { ok: false, status: "failed" as const, message: "فشل الدفع" };
    }

    if (input.paymobSuccess !== true) {
      return { ok: false, status: payment.status, message: "بانتظار تأكيد الدفع" };
    }

    const result = await activateSubscriptionPayment(input.paymentId, {
      paidAmountCents: input.amountCents ?? null,
    });
    if (!result.ok) {
      return { ok: false, status: "failed" as const, message: result.reason };
    }
    return { ok: true, status: "paid" as const, message: "تم تفعيل الاشتراك بنجاح" };
  }),

  listSubscriptionPayments: publicProcedure.input(z.object({
    page: z.number().default(1),
    limit: z.number().default(25),
    status: z.enum(["pending", "paid", "failed", "all"]).default("all"),
  })).query(async ({ ctx, input }) => {
    const { session } = await requireSuperAdminFromRequest(ctx.req);

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const offset = (input.page - 1) * input.limit;
    const where = input.status === "all" ? undefined : eq(subscriptionPayments.status, input.status);

    const rows = await db
      .select({
        id: subscriptionPayments.id,
        status: subscriptionPayments.status,
        amount: subscriptionPayments.amount,
        currency: subscriptionPayments.currency,
        providerReference: subscriptionPayments.providerReference,
        createdAt: subscriptionPayments.createdAt,
        userId: subscriptionPayments.userId,
        userName: appUsers.name,
        userEmail: appUsers.email,
        planId: subscriptionPayments.planId,
        planName: subscriptionPlans.nameAr,
        planPrice: subscriptionPlans.price,
      })
      .from(subscriptionPayments)
      .leftJoin(appUsers, eq(subscriptionPayments.userId, appUsers.id))
      .leftJoin(subscriptionPlans, eq(subscriptionPayments.planId, subscriptionPlans.id))
      .where(where)
      .orderBy(desc(subscriptionPayments.createdAt))
      .limit(input.limit)
      .offset(offset);

    const [total] = await db
      .select({ count: count() })
      .from(subscriptionPayments)
      .where(where);

    const { amountToCents } = await import("./paymob");

    return {
      rows: rows.map((r) => {
        const expected = amountToCents(r.planPrice || r.amount);
        const actual = amountToCents(r.amount);
        const amountMatches = expected === actual;
        return {
          ...r,
          amountMatches,
          canAutoActivate: r.status === "pending" && amountMatches,
        };
      }),
      total: total.count,
    };
  }),

  smartActivateSubscriptionPayment: publicProcedure.input(z.object({
    paymentId: z.number(),
    force: z.boolean().optional(),
  })).mutation(async ({ ctx, input }) => {
    const { session } = await requireSuperAdminFromRequest(ctx.req);

    const result = await activateSubscriptionPayment(input.paymentId, {
      force: input.force ?? true,
    });
    if (!result.ok) throw new TRPCError({ code: "BAD_REQUEST", message: result.reason });
    return { success: true, message: "تم تفعيل الاشتراك تلقائياً" };
  }),

  reconcilePendingPayments: publicProcedure.mutation(async ({ ctx }) => {
    const { session } = await requireSuperAdminFromRequest(ctx.req);

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const { amountToCents } = await import("./paymob");
    const pending = await db
      .select({
        id: subscriptionPayments.id,
        amount: subscriptionPayments.amount,
        planPrice: subscriptionPlans.price,
        providerReference: subscriptionPayments.providerReference,
      })
      .from(subscriptionPayments)
      .leftJoin(subscriptionPlans, eq(subscriptionPayments.planId, subscriptionPlans.id))
      .where(eq(subscriptionPayments.status, "pending"))
      .orderBy(desc(subscriptionPayments.createdAt))
      .limit(50);

    let activated = 0;
    const skipped: string[] = [];
    for (const row of pending) {
      const amountMatches = amountToCents(row.amount) === amountToCents(row.planPrice || row.amount);
      if (!amountMatches || !row.providerReference) {
        skipped.push(`#${row.id}: المبلغ غير مطابق أو لم يُرسل لـ Paymob`);
        continue;
      }
      const result = await activateSubscriptionPayment(row.id, { force: true });
      if (result.ok) activated++;
      else skipped.push(`#${row.id}: ${result.reason}`);
    }

    return { activated, skipped, checked: pending.length };
  }),

  getPaymentStatus: publicProcedure.input(z.object({ paymentId: z.number() })).query(async ({ ctx, input }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db
      .select({
        payment: subscriptionPayments,
        planName: subscriptionPlans.nameAr,
        planPrice: subscriptionPlans.price,
      })
      .from(subscriptionPayments)
      .leftJoin(subscriptionPlans, eq(subscriptionPayments.planId, subscriptionPlans.id))
      .where(and(eq(subscriptionPayments.id, input.paymentId), eq(subscriptionPayments.userId, session.userId)))
      .limit(1);
    if (!row?.payment) throw new TRPCError({ code: "NOT_FOUND" });
    return {
      status: row.payment.status,
      paymentId: row.payment.id,
      amount: row.payment.amount,
      planName: row.planName,
      planPrice: row.planPrice,
    };
  }),
});

// ===================== MAIN ROUTER =====================
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  dashboard: dashboardRouter,
  customers: customersRouter,
  suppliers: suppliersRouter,
  contactCategories: contactCategoriesRouter,
  items: itemsRouter,
  warehouses: warehousesRouter,
  purchases: purchasesRouter,
  sales: salesRouter,
  hr: hrRouter,
  accounts: accountsRouter,
  cash: cashRouter,
  bank: bankRouter,
  reports: reportsRouter,
  notifications: notificationsRouter,
  assets: assetsRouter,
  loans: loansRouter,
  costCenters: costCentersRouter,
  salesReps: salesRepsRouter,
  settings: settingsRouter,
  inventory: inventoryRouter,
  production: productionRouter,
  statement: statementRouter,
  parity: router({
    settings: settingsExtendedRouter,
    hr: hrExtendedRouter,
    inventory: inventoryExtendedRouter,
    assets: assetsExtendedRouter,
    sales: salesExtendedRouter,
  }),
  saas: saasRouter,
  assistant: assistantRouter,
  permissions: permissionsRouter,
  importCosting: importCostingRouter,
  accountingAuditor: accountingAuditorRouter,
  documentAttachments: documentAttachmentsRouter,
  opsInbox: opsInboxRouter,
  megaReportImport: megaReportImportRouter,
});

export type AppRouter = typeof appRouter;
