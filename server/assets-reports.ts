import type { Db } from "./db";
import { and, eq, gte, lte } from "drizzle-orm";
import { assetSales, depreciationRunLines, depreciationRuns, fixedAssets } from "../drizzle/schema";
import { tenantWhere } from "./tenant-scope";
import type { ReportFilters } from "./accounting-data";

/** drizzle/mysql2 يرجّع أعمدة date() ككائن Date حقيقي — String(x).slice(0,10) بيفقد السنة */
function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v || "").slice(0, 10);
}

export type ReportRow = Record<string, unknown>;

function num(v: unknown) {
  return Number(v ?? 0);
}

/** ميجا Dep.aspx — نفس الأعمدة لـ fixedassetsreports-dep و fixedassetsreports-depruns */
async function depreciationMegaReport(db: Db, f: ReportFilters): Promise<ReportRow[]> {
  const asOf = f.dateTo || f.dateFrom || new Date().toISOString().slice(0, 10);
  const asOfPeriod = String(asOf).slice(0, 7);

  const assets = await db.select().from(fixedAssets)
    .where(tenantWhere(fixedAssets, f.tenantId, eq(fixedAssets.status, "active")));

  const lines = await db
    .select({
      assetId: depreciationRunLines.assetId,
      amount: depreciationRunLines.amount,
      period: depreciationRuns.period,
    })
    .from(depreciationRunLines)
    .innerJoin(depreciationRuns, eq(depreciationRunLines.runId, depreciationRuns.id))
    .where(tenantWhere(depreciationRunLines, f.tenantId));

  const postedByAsset = new Map<number, { total: number; periodTotal: number }>();
  for (const line of lines) {
    const cur = postedByAsset.get(line.assetId) || { total: 0, periodTotal: 0 };
    const amt = num(line.amount);
    cur.total += amt;
    if (String(line.period) === asOfPeriod) cur.periodTotal += amt;
    postedByAsset.set(line.assetId, cur);
  }

  return assets.map((a) => {
    const purchase = num(a.purchasePrice);
    const current = num(a.currentValue);
    const rate = num(a.depreciationRate);
    const posted = postedByAsset.get(a.id);
    const accumulatedDepreciation = posted?.total ?? Math.max(0, purchase - current);
    const periodDepreciation = posted?.periodTotal ?? 0;
    const depreciationAsOf = Math.max(0, accumulatedDepreciation - periodDepreciation);
    const netBookValue = Math.max(0, purchase - accumulatedDepreciation);
    return {
      name: a.name,
      currency: "ج.م",
      exchangeRate: 1,
      purchaseDate: a.purchaseDate ? toDateStr(a.purchaseDate) : "",
      operationDate: a.purchaseDate ? toDateStr(a.purchaseDate) : "",
      depreciationRate: rate,
      assetValue: purchase,
      depreciationAsOf: Number(depreciationAsOf.toFixed(2)),
      periodDepreciation: Number(periodDepreciation.toFixed(2)),
      accumulatedDepreciation: Number(accumulatedDepreciation.toFixed(2)),
      netBookValue: Number(netBookValue.toFixed(2)),
      _category: a.category || "",
    };
  });
}

const HANDLERS: Record<string, (db: Db, f: ReportFilters) => Promise<ReportRow[]>> = {
  "fixedassetsreports-dep": depreciationMegaReport,
  /** نفس صفحة ميجا Dep.aspx — نفس الأعمدة */
  "fixedassetsreports-depruns": depreciationMegaReport,
  "fixedassetsreports-soldfixedassets": async (db, f) => {
    const dateParts = [];
    if (f.dateFrom) dateParts.push(gte(assetSales.date, f.dateFrom as any));
    if (f.dateTo) dateParts.push(lte(assetSales.date, f.dateTo as any));

    const rows = await db.select({
      name: fixedAssets.name,
      category: fixedAssets.category,
      purchasePrice: fixedAssets.purchasePrice,
      currentValue: fixedAssets.currentValue,
      purchaseDate: fixedAssets.purchaseDate,
      saleDate: assetSales.date,
      saleAmount: assetSales.amount,
    }).from(fixedAssets)
      .innerJoin(assetSales, eq(assetSales.assetId, fixedAssets.id))
      .where(tenantWhere(fixedAssets, f.tenantId,
        eq(fixedAssets.status, "disposed"),
        dateParts.length ? and(...dateParts) : undefined));
    return rows.map((a) => {
      const purchase = num(a.purchasePrice);
      const sale = num(a.saleAmount);
      const book = num(a.currentValue);
      const depreciation = Math.max(0, purchase - book);
      return {
        name: a.name,
        assetValue: purchase,
        lastUsage: a.purchaseDate ? toDateStr(a.purchaseDate) : "",
        saleDate: a.saleDate ? toDateStr(a.saleDate) : "",
        depreciation: Number(depreciation.toFixed(2)),
        salePrice: sale,
        profitLoss: Number((sale - book).toFixed(2)),
        _category: a.category || "",
      };
    });
  },
};

export const ASSETS_REPORT_SLUGS = Object.keys(HANDLERS);

export async function runAssetsReport(db: Db, slug: string, filters: ReportFilters) {
  const handler = HANDLERS[slug];
  if (!handler) return [{ message: "التقرير غير موجود", slug }];
  return handler(db, filters);
}
