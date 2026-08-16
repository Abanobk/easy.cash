import { eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { accounts, depreciationRunLines, depreciationRuns, fixedAssets } from "../drizzle/schema";
import { resolveAccountMap } from "./auto-journal";
import { tenantWhere, withTenantId } from "./tenant-scope";

function num(v: unknown) {
  return Number(v ?? 0);
}

function money(v: number) {
  return v.toFixed(2);
}

/** قيد إهلاك شهري لكل الأصول النشطة */
export async function postMonthlyDepreciation(
  db: MySql2Database,
  tenantId: number,
  userId: number | undefined,
  period: string,
) {
  const [existing] = await db
    .select({ id: depreciationRuns.id })
    .from(depreciationRuns)
    .where(tenantWhere(depreciationRuns, tenantId, eq(depreciationRuns.period, period)))
    .limit(1);
  if (existing) {
    return { skipped: true as const, reason: "already_posted" as const };
  }

  const assets = await db
    .select()
    .from(fixedAssets)
    .where(tenantWhere(fixedAssets, tenantId, eq(fixedAssets.status, "active")));

  if (!assets.length) {
    return { skipped: true as const, reason: "no_assets" as const };
  }

  const map = await resolveAccountMap(db, tenantId);
  const expenseRow = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(tenantWhere(accounts, tenantId, eq(accounts.code, "5300")))
    .limit(1);
  const expenseAccount = expenseRow[0]?.id ?? map.generalExpense;
  let accumulatedId = await findAccumulatedDepreciationAccount(db, tenantId);

  const lines: Array<{ accountId: number; debit: string; credit: string; description: string }> = [];
  const runLines: Array<{ assetId: number; amount: string }> = [];
  let totalDep = 0;

  for (const asset of assets) {
    const rate = num(asset.depreciationRate);
    const cost = num(asset.purchasePrice);
    if (rate <= 0 || cost <= 0) continue;
    const monthly = (cost * rate) / 100 / 12;
    if (monthly < 0.01) continue;
    totalDep += monthly;
    runLines.push({ assetId: asset.id, amount: money(monthly) });
    lines.push({
      accountId: expenseAccount,
      debit: money(monthly),
      credit: "0.00",
      description: `إهلاك — ${asset.name}`,
    });
  }

  if (totalDep < 0.01) {
    return { skipped: true as const, reason: "no_depreciation" as const };
  }

  lines.push({
    accountId: accumulatedId,
    debit: "0.00",
    credit: money(totalDep),
    description: `إهلاك مجمّع — ${period}`,
  });

  const { createPostedJournalDirect } = await import("./auto-journal");
  const journalDate = `${period}-28`;
  const reference = `DEP-${period}`;
  const result = await createPostedJournalDirect(db, tenantId, userId, {
    date: journalDate,
    description: `قيد إهلاك شهري — ${period}`,
    reference,
    lines,
  });

  await db.insert(depreciationRuns).values(
    withTenantId(tenantId, {
      period,
      journalReference: reference,
      totalAmount: money(totalDep),
      createdBy: userId,
    }) as any,
  );

  const [runRow] = await db
    .select({ id: depreciationRuns.id })
    .from(depreciationRuns)
    .where(tenantWhere(depreciationRuns, tenantId, eq(depreciationRuns.period, period)))
    .limit(1);

  if (runRow && runLines.length) {
    await db.insert(depreciationRunLines).values(
      runLines.map((line) =>
        withTenantId(tenantId, {
          runId: runRow.id,
          assetId: line.assetId,
          amount: line.amount,
        }),
      ) as any,
    );
  }

  return { skipped: false as const, totalDepreciation: totalDep, journal: result };
}

async function findAccumulatedDepreciationAccount(db: MySql2Database, tenantId: number) {
  const rows = await db
    .select({ id: accounts.id, code: accounts.code, name: accounts.name })
    .from(accounts)
    .where(tenantWhere(accounts, tenantId, eq(accounts.isActive, true)));

  const match = rows.find((r) => {
    const n = String(r.name).toLowerCase();
    return r.code.startsWith("129") || n.includes("مجمع إهلاك") || n.includes("accumulated");
  });
  if (match) return match.id;

  const [result] = await db.insert(accounts).values(
    withTenantId(tenantId, {
      code: "1290",
      name: "مجمع إهلاك الأصول",
      type: "asset",
      isParent: false,
      isActive: true,
    }) as any,
  );
  return (result as { insertId: number }).insertId;
}
