import type { Db } from "./db";
import {
  areasSummaryReport,
  balanceSheetFromAccounts,
  branchesSummaryReport,
  checksReport,
  costCenterStatementReport,
  cashAccountStatementReport,
  isCashLikeAccount,
  getAccountBalancesAsOf,
  customerItemStatementReport,
  customerStatementReport,
  customersListReport,
  customersSummaryReport,
  customersProfitsReport,
  debitsAgingReport,
  creditsAgingReport,
  generalJournalReport,
  incomeStatementFromData,
  invoiceProfitsReport,
  itemsProfitsReport,
  lastPricesReport,
  loadPostedJournalLines,
  accountStatementReport,
  matureInvoicesReport,
  matureReceiptsReport,
  monthlyExpensesReport,
  monthlySalesTotalsReport,
  paymentsReport,
  purchasesByItemsReport,
  purchasesInvoicesReport,
  repCollectingsReport,
  repDailyReport,
  repDebitReport,
  repSalesByItemsReport,
  ReportFilters,
  salesByItemsReport,
  salesInvoicesReport,
  subLedgerReport,
  trialBalanceReport,
  vendorItemStatementReport,
  vendorStatementReport,
  vendorsListReport,
  vendorsSummaryReport,
} from "./accounting-data";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  bankTransactions,
  cashTransactions,
  customers,
  fixedAssets,
  installments,
  loans,
  productionOrderMaterials,
  productionOrders,
  purchaseOrders,
  salesInvoices,
  salesOrders,
  suppliers,
} from "../drizzle/schema";
import { tenantWhere } from "./tenant-scope";

/** drizzle/mysql2 يرجّع أعمدة date() ككائن Date حقيقي — String(x).slice(0,10) بيفقد السنة */
function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v || "").slice(0, 10);
}

export type ReportRow = Record<string, unknown>;

async function productionOrdersReport(db: Db, f: ReportFilters) {
  const dateParts = [];
  if (f.dateFrom) dateParts.push(gte(productionOrders.date, f.dateFrom as any));
  if (f.dateTo) dateParts.push(lte(productionOrders.date, f.dateTo as any));
  if (f.warehouseId) dateParts.push(eq(productionOrders.warehouseId, f.warehouseId));
  if (f.itemId) dateParts.push(eq(productionOrders.productId, f.itemId));
  if (f.branchId != null) {
    dateParts.push(sql`EXISTS (SELECT 1 FROM warehouses bw WHERE bw.id = ${productionOrders.warehouseId} AND bw.branchId = ${f.branchId})`);
  } else if (f.branchIds?.length) {
    dateParts.push(sql`EXISTS (SELECT 1 FROM warehouses bw WHERE bw.id = ${productionOrders.warehouseId} AND bw.branchId IN (${sql.join(f.branchIds.map((id) => sql`${id}`), sql`, `)}))`);
  }
  const rows = await db.select({
    number: productionOrders.number,
    date: productionOrders.date,
    quantity: productionOrders.quantity,
    status: productionOrders.status,
    wipCostAmount: productionOrders.wipCostAmount,
    productName: sql<string>`p.name`,
    productCode: sql<string>`p.code`,
    warehouseName: sql<string>`w.name`,
  }).from(productionOrders)
    .where(tenantWhere(productionOrders, f.tenantId, ...(dateParts.length ? [and(...dateParts)] : [])))
    .leftJoin(sql`items p`, sql`p.id = ${productionOrders.productId}`)
    .leftJoin(sql`warehouses w`, sql`w.id = ${productionOrders.warehouseId}`)
    .orderBy(desc(productionOrders.date));
  return rows.map((r) => ({
    number: r.number,
    date: toDateStr(r.date),
    productCode: r.productCode || "",
    productName: r.productName || "",
    warehouseName: r.warehouseName || "",
    quantity: Number(r.quantity),
    wipCost: Number(r.wipCostAmount || 0),
    status: r.status,
  }));
}

async function productionMaterialsReport(db: Db, f: ReportFilters) {
  const dateParts = [];
  if (f.dateFrom) dateParts.push(gte(productionOrders.date, f.dateFrom as any));
  if (f.dateTo) dateParts.push(lte(productionOrders.date, f.dateTo as any));
  if (f.warehouseId) dateParts.push(eq(productionOrders.warehouseId, f.warehouseId));
  if (f.itemId) dateParts.push(eq(productionOrderMaterials.itemId, f.itemId));
  if (f.branchId != null) {
    dateParts.push(sql`EXISTS (SELECT 1 FROM warehouses bw WHERE bw.id = ${productionOrders.warehouseId} AND bw.branchId = ${f.branchId})`);
  } else if (f.branchIds?.length) {
    dateParts.push(sql`EXISTS (SELECT 1 FROM warehouses bw WHERE bw.id = ${productionOrders.warehouseId} AND bw.branchId IN (${sql.join(f.branchIds.map((id) => sql`${id}`), sql`, `)}))`);
  }
  const rows = await db.select({
    orderNumber: productionOrders.number,
    date: productionOrders.date,
    status: productionOrders.status,
    orderQty: productionOrders.quantity,
    warehouseName: sql<string>`w.name`,
    itemCode: sql<string>`i.code`,
    itemName: sql<string>`i.name`,
    qtyPerUnit: productionOrderMaterials.quantity,
    scrapPercent: productionOrderMaterials.scrapPercent,
    unitCost: sql<string>`COALESCE(NULLIF(i.averageCost, 0), i.purchasePrice)`,
  }).from(productionOrderMaterials)
    .innerJoin(productionOrders, eq(productionOrderMaterials.orderId, productionOrders.id))
    .leftJoin(sql`items i`, sql`i.id = ${productionOrderMaterials.itemId}`)
    .leftJoin(sql`warehouses w`, sql`w.id = ${productionOrders.warehouseId}`)
    .where(tenantWhere(productionOrderMaterials, f.tenantId, ...(dateParts.length ? [and(...dateParts)] : [])))
    .orderBy(desc(productionOrders.date));
  return rows.map((r) => {
    const orderQty = Number(r.orderQty || 0);
    const perUnit = Number(r.qtyPerUnit || 0);
    const scrapPct = Number(r.scrapPercent || 0);
    const baseQty = perUnit * orderQty;
    const scrapQty = baseQty * (scrapPct / 100);
    const totalQty = baseQty + scrapQty;
    const unitCost = Number(r.unitCost || 0);
    return {
      orderNumber: r.orderNumber,
      date: toDateStr(r.date),
      status: r.status,
      warehouseName: r.warehouseName || "",
      itemCode: r.itemCode || "",
      itemName: r.itemName || "",
      qtyPerUnit: perUnit,
      orderQty,
      baseQty,
      scrapPercent: scrapPct,
      scrapQty,
      totalQty,
      unitCost,
      totalCost: totalQty * unitCost,
    };
  });
}

const HANDLERS: Record<string, (db: Db, f: ReportFilters) => Promise<ReportRow[]>> = {
  "accountingreports-accountstatment": (db, f) => accountStatementReport(db, f),
  "accountingreports-customerstatment": customerStatementReport,
  "accountingreports-vendorstatment": vendorStatementReport,
  "accountingreports-sales": salesInvoicesReport,
  "accountingreports-purchases": purchasesInvoicesReport,
  "accountingreports-checks-checkin": (db, f) => checksReport(db, f, "incoming"),
  "accountingreports-checks-checkout": (db, f) => checksReport(db, f, "outgoing"),
  "accountingreports-customerslist": customersListReport,
  "accountingreports-vendorslist": vendorsListReport,
  "accountingreports-debitsages": (db, f) => debitsAgingReport(db, f, "default"),
  "accountingreports-debitsagesbyyear": (db, f) => debitsAgingReport(db, f, "year"),
  "accountingreports-debitsagesbyhalfyear": (db, f) => debitsAgingReport(db, f, "half"),
  "accountingreports-creditsages": (db, f) => creditsAgingReport(db, f, "default"),
  "accountingreports-creditsagesbyyear": (db, f) => creditsAgingReport(db, f, "year"),
  "accountingreports-creditsagesbyhalfyear": (db, f) => creditsAgingReport(db, f, "half"),
  "accountingreports-grosscustomersalesbyitems": (db, f) => salesByItemsReport(db, f, false),
  "accountingreports-grossvendorpurchasesbyitems": purchasesByItemsReport,
  "accountingreports-itemsprofits": itemsProfitsReport,
  "accountingreports-monthlysalesbyitems": (db, f) => salesByItemsReport(db, f, true),
  "accountingreports-monthlysalesbyitemstotals": monthlySalesTotalsReport,
  "accountingreports-payments": paymentsReport,
  /** ميجا `/AccountingReports/Dues.aspx` — فلاتر مؤكدة؛ لا جدول استحقاقات في Easy بعد — رجّع فاضي لحد ما يتبني الكيان */
  "accountingreports-dues": async (db, f) => {
    // تقريب ميجا Dues من فواتير البيع ذات المتبقي — لا كيان استحقاقات منفصل بعد
    const dateParts = [] as any[];
    if (f.dateFrom) dateParts.push(gte(salesInvoices.date, f.dateFrom as any));
    if (f.dateTo) dateParts.push(lte(salesInvoices.date, f.dateTo as any));
    const rows = await db.select({
      number: salesInvoices.number,
      date: salesInvoices.date,
      total: salesInvoices.total,
      paid: salesInvoices.paid,
      remaining: salesInvoices.remaining,
      customerName: customers.name,
    }).from(salesInvoices)
      .leftJoin(customers, eq(salesInvoices.customerId, customers.id))
      .where(and(
        eq(salesInvoices.tenantId, f.tenantId),
        sql`CAST(${salesInvoices.remaining} AS DECIMAL(15,2)) > 0`,
        ...dateParts,
        f.branchId ? eq(salesInvoices.branchId, f.branchId) : undefined,
        f.customerId ? eq(salesInvoices.customerId, f.customerId) : undefined,
        f.paymentStatus === "paid" ? sql`CAST(${salesInvoices.remaining} AS DECIMAL(15,2)) <= 0` : undefined,
        f.paymentStatus === "unpaid" ? sql`CAST(${salesInvoices.paid} AS DECIMAL(15,2)) = 0` : undefined,
        f.paymentStatus === "partial" ? sql`CAST(${salesInvoices.paid} AS DECIMAL(15,2)) > 0 AND CAST(${salesInvoices.remaining} AS DECIMAL(15,2)) > 0` : undefined,
      ))
      .orderBy(desc(salesInvoices.date));
    return rows.map((r, idx) => {
      const paid = Number(r.paid) || 0;
      const remaining = Number(r.remaining) || 0;
      let status = "غير مسدد";
      if (remaining <= 0.0001) status = "مسدد";
      else if (paid > 0) status = "جزئي";
      return {
        documentNumber: idx + 1,
        accountName: r.customerName || r.number || "—",
        date: toDateStr(r.date),
        amount: Number(r.total) || 0,
        paid,
        status,
        settlementDate: "",
      };
    });
  },
  "accountingreports-dashboard": async (db, f) => {
    // ميجا ملخص الأعمال: أرصدة خزائن/نقدية (الاسم | العملة | الرصيد)
    const bals = await getAccountBalancesAsOf(db, f.tenantId, f.dateTo);
    return bals
      .filter((a: any) => isCashLikeAccount(String(a.code || ""), String(a.name || "")) && !a.isParent)
      .map((a: any) => ({
        name: a.name,
        currency: f.currencyCode || "جنيه مصري",
        balance: Number(a.balance) || 0,
      }))
      .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), "ar"));
  },
  /**
   * ميجا PDF: مسلسل | المنطقة | العميل | الاجمالي | الخصومات | الضرائب | اضافات | الصافي | المديونية | اخر بيع | اخر تحصيل
   */
  "accountingreports-customerssales": async (db, f) => {
    const sales = await salesInvoicesReport(db, f);
    type Row = {
      customerId: number | null;
      areaName: string;
      customerName: string;
      total: number;
      discount: number;
      tax: number;
      additions: number;
      net: number;
      remaining: number;
      lastSaleDate: string;
    };
    const map = new Map<string, Row>();
    for (const s of sales) {
      const customerId = (s as { _customerId?: number | null })._customerId ?? null;
      const name = String(s.partyName || "غير محدد");
      const key = customerId != null ? `id:${customerId}` : `name:${name}`;
      const cur = map.get(key) || {
        customerId,
        areaName: String(s.areaName || ""),
        customerName: name,
        total: 0,
        discount: 0,
        tax: 0,
        additions: 0,
        net: 0,
        remaining: 0,
        lastSaleDate: "",
      };
      cur.total += Number(s.subtotal) || 0;
      cur.discount += Number(s.discount) || 0;
      cur.tax += Number(s.tax) || 0;
      cur.additions += Number(s.additions) || 0;
      cur.net += Number(s.total) || 0;
      cur.remaining += Number(s.remaining) || 0;
      const d = String(s.date || "");
      if (d && (!cur.lastSaleDate || d > cur.lastSaleDate)) cur.lastSaleDate = d;
      if (!cur.areaName && s.areaName) cur.areaName = String(s.areaName);
      map.set(key, cur);
    }

    const customerIds = Array.from(map.values())
      .map((r) => r.customerId)
      .filter((id): id is number => id != null);
    const lastCollectionByCustomer = new Map<number, string>();
    if (customerIds.length) {
      const cashRows = await db
        .select({
          customerId: cashTransactions.customerId,
          date: cashTransactions.date,
          type: cashTransactions.type,
        })
        .from(cashTransactions)
        .where(and(eq(cashTransactions.tenantId, f.tenantId), inArray(cashTransactions.customerId, customerIds)));
      for (const r of cashRows) {
        if (!r.customerId) continue;
        if (!String(r.type || "").includes("receive")) continue;
        const d = String(r.date || "").slice(0, 10);
        const prev = lastCollectionByCustomer.get(r.customerId) || "";
        if (d && (!prev || d > prev)) lastCollectionByCustomer.set(r.customerId, d);
      }
      const bankRows = await db
        .select({
          customerId: bankTransactions.customerId,
          date: bankTransactions.date,
          type: bankTransactions.type,
        })
        .from(bankTransactions)
        .where(and(eq(bankTransactions.tenantId, f.tenantId), inArray(bankTransactions.customerId, customerIds)));
      for (const r of bankRows) {
        if (!r.customerId) continue;
        if (!String(r.type || "").includes("deposit")) continue;
        const d = String(r.date || "").slice(0, 10);
        const prev = lastCollectionByCustomer.get(r.customerId) || "";
        if (d && (!prev || d > prev)) lastCollectionByCustomer.set(r.customerId, d);
      }
    }

    return Array.from(map.values())
      .sort((a, b) => a.customerName.localeCompare(b.customerName, "ar"))
      .map((r, idx) => ({
        documentNumber: idx + 1,
        areaName: r.areaName,
        customerName: r.customerName,
        total: r.total,
        discount: r.discount,
        tax: r.tax,
        additions: r.additions,
        net: r.net,
        remaining: r.remaining,
        lastSaleDate: r.lastSaleDate,
        lastCollectionDate: r.customerId != null ? (lastCollectionByCustomer.get(r.customerId) || "") : "",
      }));
  },
  /**
   * ميجا PDF: مسلسل | المورد | الاجمالي | الخصومات | الضرائب | الصافي | المديونية | اخر شراء | اخر سداد
   */
  "accountingreports-vendorspurchases": async (db, f) => {
    const rows = await purchasesInvoicesReport(db, f);
    type Row = {
      supplierId: number | null;
      vendorName: string;
      total: number;
      discount: number;
      tax: number;
      net: number;
      remaining: number;
      lastPurchaseDate: string;
    };
    const map = new Map<string, Row>();
    for (const r of rows) {
      const supplierId = (r as { _supplierId?: number | null })._supplierId ?? null;
      const name = String(r.partyName || "غير محدد");
      const key = supplierId != null ? `id:${supplierId}` : `name:${name}`;
      const cur = map.get(key) || {
        supplierId,
        vendorName: name,
        total: 0,
        discount: 0,
        tax: 0,
        net: 0,
        remaining: 0,
        lastPurchaseDate: "",
      };
      cur.total += Number(r.subtotal) || 0;
      cur.discount += Number(r.discount) || 0;
      cur.tax += Number(r.tax) || 0;
      cur.net += Number(r.total) || 0;
      cur.remaining += Number(r.remaining) || 0;
      const d = String(r.date || "");
      if (d && (!cur.lastPurchaseDate || d > cur.lastPurchaseDate)) cur.lastPurchaseDate = d;
      map.set(key, cur);
    }

    const supplierIds = Array.from(map.values())
      .map((r) => r.supplierId)
      .filter((id): id is number => id != null);
    const lastPaymentBySupplier = new Map<number, string>();
    if (supplierIds.length) {
      const cashRows = await db
        .select({
          supplierId: cashTransactions.supplierId,
          date: cashTransactions.date,
          type: cashTransactions.type,
        })
        .from(cashTransactions)
        .where(and(eq(cashTransactions.tenantId, f.tenantId), inArray(cashTransactions.supplierId, supplierIds)));
      for (const r of cashRows) {
        if (!r.supplierId) continue;
        const t = String(r.type || "");
        if (!(t.includes("pay"))) continue;
        const d = String(r.date || "").slice(0, 10);
        const prev = lastPaymentBySupplier.get(r.supplierId) || "";
        if (d && (!prev || d > prev)) lastPaymentBySupplier.set(r.supplierId, d);
      }
      const bankRows = await db
        .select({
          supplierId: bankTransactions.supplierId,
          date: bankTransactions.date,
          type: bankTransactions.type,
        })
        .from(bankTransactions)
        .where(and(eq(bankTransactions.tenantId, f.tenantId), inArray(bankTransactions.supplierId, supplierIds)));
      for (const r of bankRows) {
        if (!r.supplierId) continue;
        if (!String(r.type || "").includes("withdraw")) continue;
        const d = String(r.date || "").slice(0, 10);
        const prev = lastPaymentBySupplier.get(r.supplierId) || "";
        if (d && (!prev || d > prev)) lastPaymentBySupplier.set(r.supplierId, d);
      }
    }

    return Array.from(map.values())
      .sort((a, b) => a.vendorName.localeCompare(b.vendorName, "ar"))
      .map((r, idx) => ({
        documentNumber: idx + 1,
        vendorName: r.vendorName,
        total: r.total,
        discount: r.discount,
        tax: r.tax,
        net: r.net,
        remaining: r.remaining,
        lastPurchaseDate: r.lastPurchaseDate,
        lastPaymentDate: r.supplierId != null ? (lastPaymentBySupplier.get(r.supplierId) || "") : "",
      }));
  },
  "accountingreports-matureinvoices": matureInvoicesReport,
  "accountingreports-maturereceipts": matureReceiptsReport,
  "accountingreports-salesorders": async (db, f) => {
    const dateParts = [];
    if (f.dateFrom) dateParts.push(gte(salesOrders.date, f.dateFrom as any));
    if (f.dateTo) dateParts.push(lte(salesOrders.date, f.dateTo as any));
    const rows = await db.select({
      number: salesOrders.number,
      date: salesOrders.date,
      total: salesOrders.total,
      status: salesOrders.status,
      customerName: customers.name,
    }).from(salesOrders)
      .where(tenantWhere(salesOrders, f.tenantId, ...(dateParts.length ? [and(...dateParts)] : [])))
      .leftJoin(customers, eq(salesOrders.customerId, customers.id))
      .orderBy(desc(salesOrders.date));
    return rows.map((r) => ({
      documentNumber: r.number,
      date: toDateStr(r.date),
      partyName: r.customerName || "",
      total: Number(r.total),
      status: r.status,
    }));
  },
  "accountingreports-purchaseorders": async (db, f) => {
    const dateParts = [];
    if (f.dateFrom) dateParts.push(gte(purchaseOrders.date, f.dateFrom as any));
    if (f.dateTo) dateParts.push(lte(purchaseOrders.date, f.dateTo as any));
    const rows = await db.select({
      number: purchaseOrders.number,
      date: purchaseOrders.date,
      total: purchaseOrders.total,
      status: purchaseOrders.status,
      supplierName: suppliers.name,
    }).from(purchaseOrders)
      .where(tenantWhere(purchaseOrders, f.tenantId, ...(dateParts.length ? [and(...dateParts)] : [])))
      .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .orderBy(desc(purchaseOrders.date));
    return rows.map((r) => ({
      documentNumber: r.number,
      date: toDateStr(r.date),
      partyName: r.supplierName || "",
      total: Number(r.total),
      status: r.status,
    }));
  },
  "accountingreports-customerssummary": customersSummaryReport,
  "accountingreports-vendorssummary": vendorsSummaryReport,
  "accountingreports-customersinstallments": async (db, f) => {
    const dateParts = [] as any[];
    if (f.dateFrom) dateParts.push(gte(installments.dueDate, f.dateFrom as any));
    if (f.dateTo) dateParts.push(lte(installments.dueDate, f.dateTo as any));
    const rows = await db.select({
      dueDate: installments.dueDate,
      amount: installments.amount,
      paidAmount: installments.paidAmount,
      status: installments.status,
      paidDate: installments.paidDate,
      partyName: loans.partyName,
    }).from(installments)
      .innerJoin(loans, eq(installments.loanId, loans.id))
      .where(and(
        eq(installments.tenantId, f.tenantId),
        ...dateParts,
        f.paymentStatus === "paid" ? eq(installments.status, "paid") : undefined,
        f.paymentStatus === "unpaid" ? inArray(installments.status, ["pending", "overdue"]) : undefined,
      ));
    const statusLabel = (s: string) => ({ pending: "تحت التحصيل", paid: "محصل", overdue: "متأخر" } as Record<string, string>)[s] || s;
    return rows.map((r, idx) => ({
      documentNumber: idx + 1,
      collectionDate: r.paidDate ? toDateStr(r.paidDate) : "",
      amount: Number(r.amount),
      repName: "",
      date: toDateStr(r.dueDate),
      customerName: r.partyName || "—",
      paid: Number(r.paidAmount) || 0,
      status: statusLabel(String(r.status || "")),
    }));
  },
  "accountingreports-grossrepsalesbyitems": repSalesByItemsReport,
  "accountingreports-repscollectings": repCollectingsReport,
  "accountingreports-repdaily": repDailyReport,
  "accountingreports-repdebit": repDebitReport,
  "accountingreports-areassummary": areasSummaryReport,
  "accountingreports-branchessummary": branchesSummaryReport,
  "accountingreports-costcenterstatment": costCenterStatementReport,
  "accountingreports-accountstatment-cash": cashAccountStatementReport,
  "accountingreports-productionorders": productionOrdersReport,
  "accountingreports-productionmaterials": productionMaterialsReport,
  "accountingreports-customersprofits": customersProfitsReport,
  "accountingreports-invoiceprofits": invoiceProfitsReport,
  "accountingreports-lastprices": lastPricesReport,
  "accountingreports-monthlyexpenses": monthlyExpensesReport,
  "accountingreports-customeraccountstatementbyitems": customerItemStatementReport,
  "accountingreports-vendoraccountstatementbyitems": vendorItemStatementReport,
};

export const ACCOUNTING_REPORT_SLUGS = Object.keys(HANDLERS);

export async function runAccountingReport(
  db: Db,
  slug: string,
  filters: ReportFilters,
): Promise<ReportRow[]> {
  const handler = HANDLERS[slug];
  if (!handler) {
    return [{ message: "التقرير قيد الإعداد", slug }];
  }
  const rows = await handler(db, filters);
  return Array.isArray(rows) ? rows : [rows as ReportRow];
}
