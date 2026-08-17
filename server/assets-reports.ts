import type { Db } from "./db";
import { and, eq, gte, lte } from "drizzle-orm";
import { assetSales, depreciationRunLines, depreciationRuns, fixedAssets } from "../drizzle/schema";
import { tenantWhere } from "./tenant-scope";
import type { ReportFilters } from "./accounting-data";

export type ReportRow = Record<string, unknown>;

function num(v: unknown) {
  return Number(v ?? 0);
}

const HANDLERS: Record<string, (db: Db, f: ReportFilters) => Promise<ReportRow[]>> = {
  "fixedassetsreports-dep": async (db, f) => {
    const assets = await db.select().from(fixedAssets)
      .where(tenantWhere(fixedAssets, f.tenantId, eq(fixedAssets.status, "active")));

    const runFilter = [];
    if (f.dateFrom) runFilter.push(gte(depreciationRuns.period, String(f.dateFrom).slice(0, 7)));
    if (f.dateTo) runFilter.push(lte(depreciationRuns.period, String(f.dateTo).slice(0, 7)));

    const lines = await db
      .select({
        assetId: depreciationRunLines.assetId,
        amount: depreciationRunLines.amount,
        period: depreciationRuns.period,
        journalReference: depreciationRuns.journalReference,
      })
      .from(depreciationRunLines)
      .innerJoin(depreciationRuns, eq(depreciationRunLines.runId, depreciationRuns.id))
      .where(
        tenantWhere(
          depreciationRunLines,
          f.tenantId,
          runFilter.length ? and(...runFilter) : undefined,
        ),
      );

    const postedByAsset = new Map<number, { total: number; lastPeriod: string; lastRef: string }>();
    for (const line of lines) {
      const cur = postedByAsset.get(line.assetId) || { total: 0, lastPeriod: "", lastRef: "" };
      cur.total += num(line.amount);
      if (!cur.lastPeriod || String(line.period) > cur.lastPeriod) {
        cur.lastPeriod = String(line.period);
        cur.lastRef = String(line.journalReference || "");
      }
      postedByAsset.set(line.assetId, cur);
    }

    return assets.map((a) => {
      const purchase = num(a.purchasePrice);
      const current = num(a.currentValue);
      const rate = num(a.depreciationRate);
      const posted = postedByAsset.get(a.id);
      const postedTotal = posted?.total ?? 0;
      const annualDep = rate ? purchase * (rate / 100) : 0;
      return {
        code: a.code || "",
        name: a.name,
        category: a.category || "",
        purchasePrice: purchase,
        currentValue: current,
        postedDepreciation: Number(postedTotal.toFixed(2)),
        bookAccumulated: Number(Math.max(0, purchase - current).toFixed(2)),
        monthlyTheoretical: Number((annualDep / 12).toFixed(2)),
        depreciationRate: rate,
        purchaseDate: a.purchaseDate ? String(a.purchaseDate).slice(0, 10) : "",
        lastPostedPeriod: posted?.lastPeriod || "",
        lastJournalRef: posted?.lastRef || "",
        source: postedTotal > 0 ? "depreciation_runs" : "no_posted_runs",
      };
    });
  },
  "fixedassetsreports-depruns": async (db, f) => {
    const runFilter = [];
    if (f.dateFrom) runFilter.push(gte(depreciationRuns.period, String(f.dateFrom).slice(0, 7)));
    if (f.dateTo) runFilter.push(lte(depreciationRuns.period, String(f.dateTo).slice(0, 7)));

    const runs = await db
      .select()
      .from(depreciationRuns)
      .where(tenantWhere(depreciationRuns, f.tenantId, runFilter.length ? and(...runFilter) : undefined))
      .orderBy(depreciationRuns.period);

    const rows: ReportRow[] = [];
    for (const run of runs) {
      const detail = await db
        .select({
          assetCode: fixedAssets.code,
          assetName: fixedAssets.name,
          amount: depreciationRunLines.amount,
        })
        .from(depreciationRunLines)
        .innerJoin(fixedAssets, eq(depreciationRunLines.assetId, fixedAssets.id))
        .where(tenantWhere(depreciationRunLines, f.tenantId, eq(depreciationRunLines.runId, run.id)));

      if (!detail.length) {
        rows.push({
          period: run.period,
          journalReference: run.journalReference || "",
          totalAmount: num(run.totalAmount),
          assetCode: "—",
          assetName: "مجمّع (بدون تفاصيل)",
          lineAmount: num(run.totalAmount),
        });
        continue;
      }

      for (const line of detail) {
        rows.push({
          period: run.period,
          journalReference: run.journalReference || "",
          totalAmount: num(run.totalAmount),
          assetCode: line.assetCode || "",
          assetName: line.assetName,
          lineAmount: num(line.amount),
        });
      }
    }
    return rows;
  },
  "fixedassetsreports-soldfixedassets": async (db, f) => {
    const rows = await db.select({
      code: fixedAssets.code,
      name: fixedAssets.name,
      category: fixedAssets.category,
      purchasePrice: fixedAssets.purchasePrice,
      currentValue: fixedAssets.currentValue,
      purchaseDate: fixedAssets.purchaseDate,
      saleDate: assetSales.date,
      saleAmount: assetSales.amount,
      buyer: assetSales.buyer,
      notes: assetSales.notes,
    }).from(fixedAssets)
      .leftJoin(assetSales, eq(assetSales.assetId, fixedAssets.id))
      .where(tenantWhere(fixedAssets, f.tenantId, eq(fixedAssets.status, "disposed")));
    return rows.map((a) => {
      const purchase = num(a.purchasePrice);
      const sale = num(a.saleAmount);
      const book = num(a.currentValue);
      return {
        code: a.code || "",
        name: a.name,
        category: a.category || "",
        purchasePrice: purchase,
        bookValue: book,
        saleAmount: sale,
        gainLoss: sale - book,
        buyer: a.buyer || "",
        purchaseDate: a.purchaseDate ? String(a.purchaseDate).slice(0, 10) : "",
        saleDate: a.saleDate ? String(a.saleDate).slice(0, 10) : "",
        notes: a.notes || "",
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
