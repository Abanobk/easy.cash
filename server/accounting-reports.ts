import type { Db } from "./db";
import {
  areasSummaryReport,
  balanceSheetFromAccounts,
  branchesSummaryReport,
  checksReport,
  costCenterStatementReport,
  cashAccountStatementReport,
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
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
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
  "accountingreports-dashboard": async (db, f) => {
    const sales = await salesInvoicesReport(db, f);
    const purchases = await purchasesInvoicesReport(db, f);
    const payments = await paymentsReport(db, f);
    const totalSales = sales.reduce((s, r) => s + Number(r.total), 0);
    const totalPurchases = purchases.reduce((s, r) => s + Number(r.total), 0);
    const totalCollected = payments
      .filter((p) => String(p.direction).includes("receive") || String(p.direction).includes("deposit"))
      .reduce((s, p) => s + Number(p.amount), 0);
    const totalPaid = payments
      .filter((p) => String(p.direction).includes("pay") || String(p.direction).includes("withdraw"))
      .reduce((s, p) => s + Number(p.amount), 0);
    const grossMargin = totalSales - totalPurchases;

    return [
      { metric: "إجمالي المبيعات", value: totalSales, drillSlug: "accountingreports-sales", section: "accounting" },
      { metric: "إجمالي المشتريات", value: totalPurchases, drillSlug: "accountingreports-purchases", section: "accounting" },
      { metric: "هامش إجمالي تقريبي", value: grossMargin, drillSlug: "finalreports-incomestatment", section: "final" },
      { metric: "عدد فواتير البيع", value: sales.length, drillSlug: "accountingreports-sales", section: "accounting" },
      { metric: "عدد فواتير الشراء", value: purchases.length, drillSlug: "accountingreports-purchases", section: "accounting" },
      { metric: "تحصيلات نقدية/بنكية", value: totalCollected, drillSlug: "accountingreports-payments", section: "accounting" },
      { metric: "مدفوعات نقدية/بنكية", value: totalPaid, drillSlug: "accountingreports-payments", section: "accounting" },
    ];
  },
  "accountingreports-customerssales": async (db, f) => {
    const sales = await salesInvoicesReport(db, f);
    const map = new Map<string, { customerName: string; branchName: string; areaName: string; total: number; paid: number; remaining: number; count: number }>();
    for (const s of sales) {
      const name = String(s.partyName || "غير محدد");
      const cur = map.get(name) || {
        customerName: name,
        branchName: String(s.branchName || ""),
        areaName: String(s.areaName || ""),
        total: 0,
        paid: 0,
        remaining: 0,
        count: 0,
      };
      cur.total += Number(s.total);
      cur.paid += Number(s.paid);
      cur.remaining += Number(s.remaining);
      cur.count++;
      map.set(name, cur);
    }
    return Array.from(map.values());
  },
  "accountingreports-vendorspurchases": async (db, f) => {
    const rows = await purchasesInvoicesReport(db, f);
    const map = new Map<string, { vendorName: string; branchName: string; total: number; paid: number; remaining: number; count: number }>();
    for (const r of rows) {
      const name = String(r.partyName || "غير محدد");
      const cur = map.get(name) || {
        vendorName: name,
        branchName: String(r.branchName || ""),
        total: 0,
        paid: 0,
        remaining: 0,
        count: 0,
      };
      cur.total += Number(r.total);
      cur.paid += Number(r.paid);
      cur.remaining += Number(r.remaining);
      cur.count++;
      map.set(name, cur);
    }
    return Array.from(map.values());
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
    const dateParts = [];
    if (f.dateFrom) dateParts.push(gte(installments.dueDate, f.dateFrom as any));
    if (f.dateTo) dateParts.push(lte(installments.dueDate, f.dateTo as any));
    const rows = await db.select({
      dueDate: installments.dueDate,
      amount: installments.amount,
      paidAmount: installments.paidAmount,
      status: installments.status,
      partyName: loans.partyName,
      loanNumber: loans.number,
    }).from(installments)
      .innerJoin(loans, eq(installments.loanId, loans.id))
      .where(and(...(dateParts.length ? dateParts : [])));
    return rows.map((r) => ({
      customerName: r.partyName || "—",
      loanNumber: r.loanNumber,
      dueDate: toDateStr(r.dueDate),
      amount: Number(r.amount),
      paid: Number(r.paidAmount),
      remaining: Number(r.amount) - Number(r.paidAmount),
      status: r.status,
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
