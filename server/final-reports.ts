import type { Db } from "./db";
import { eq } from "drizzle-orm";
import { accounts } from "../drizzle/schema";
import {
  balanceSheetFromAccounts,
  generalJournalReport,
  getPostedMovementByAccount,
  incomeStatementFromData,
  loadPostedJournalLines,
  paymentsReport,
  purchasesInvoicesReport,
  ReportFilters,
  salesInvoicesReport,
  subLedgerReport,
  trialBalanceReport,
} from "./accounting-data";
import { resolveAccountMap } from "./auto-journal";
import { tenantWhere } from "./tenant-scope";

export type ReportRow = Record<string, unknown>;

const HANDLERS: Record<string, (db: Db, f: ReportFilters) => Promise<ReportRow[]>> = {
  "accounting-generaljournallist": generalJournalReport,
  "finalreports-generalledger": loadPostedJournalLines,
  "finalreports-subledger": subLedgerReport,
  "finalreports-trialbalance": trialBalanceReport,
  "finalreports-salescost": async (db, f) => {
    const movement = await getPostedMovementByAccount(db, f.tenantId, { from: f.dateFrom, to: f.dateTo });
    const map = await resolveAccountMap(db, f.tenantId);
    const cogsMovement = movement.get(map.cogs) || { debit: 0, credit: 0 };
    const totalCost = Math.max(0, cogsMovement.debit - cogsMovement.credit);
    if (totalCost > 0) {
      return [{ label: "تكلفة المبيعات (من القيود)", total: totalCost, source: "journals" }];
    }
    const data = await incomeStatementFromData(db, f);
    return [{ label: "تكلفة المبيعات", total: data.cost, source: "income_statement" }];
  },
  "finalreports-incomestatment": async (db, f) => {
    const data = await incomeStatementFromData(db, f);
    return [
      { label: "الإيرادات", amount: data.revenue },
      { label: "تكلفة المبيعات", amount: data.cost },
      { label: "مجمل الربح", amount: data.grossProfit },
      { label: "المصروفات", amount: data.expenses },
      { label: "صافي الربح", amount: data.netProfit },
    ];
  },
  "finalreports-balancesheet": async (db, f) => {
    const bs = await balanceSheetFromAccounts(db, f.tenantId, f.dateTo);
    const rows: ReportRow[] = [];
    for (const a of bs.assets) rows.push({ section: "أصول", code: a.code, name: a.name, balance: a.balance });
    for (const l of bs.liabilities) rows.push({ section: "خصوم", code: l.code, name: l.name, balance: l.balance });
    for (const e of bs.equity) rows.push({ section: "حقوق ملكية", code: e.code, name: e.name, balance: e.balance });
    return rows;
  },
  "finalreports-financialstatment": async (db, f) => {
    const bs = await balanceSheetFromAccounts(db, f.tenantId, f.dateTo);
    const inc = await incomeStatementFromData(db, f);
    return [
      { section: "المركز المالي", metric: "إجمالي الأصول", value: bs.assets.reduce((s, a) => s + a.balance, 0) },
      { section: "المركز المالي", metric: "إجمالي الخصوم", value: bs.liabilities.reduce((s, a) => s + a.balance, 0) },
      { section: "المركز المالي", metric: "حقوق الملكية", value: bs.equity.reduce((s, a) => s + a.balance, 0) },
      { section: "الأداء", metric: "صافي الربح", value: inc.netProfit },
    ];
  },
  "finalreports-cashflow": async (db, f) => {
    const map = await resolveAccountMap(db, f.tenantId);
    const movement = await getPostedMovementByAccount(db, f.tenantId, { from: f.dateFrom, to: f.dateTo });
    const allAccounts = await db.select().from(accounts)
      .where(tenantWhere(accounts, f.tenantId, eq(accounts.isActive, true)));

    let operating = 0;
    let investing = 0;
    let financing = 0;

    for (const acc of allAccounts) {
      const m = movement.get(acc.id);
      if (!m) continue;
      const net = m.debit - m.credit;
      if (Math.abs(net) < 0.01) continue;

      const code = String(acc.code || "");
      const isAccumDep = code.startsWith("129") || String(acc.name).includes("مجمع إهلاك");
      const isFixedAsset = acc.type === "asset" && code.startsWith("12") && !isAccumDep;
      const isEquity = acc.type === "equity" || code.startsWith("3");
      const isLongTermLoan = acc.type === "liability" && (code.startsWith("24") || code.startsWith("25"));

      if (isFixedAsset || isAccumDep) {
        investing -= net;
      } else if (isEquity || isLongTermLoan) {
        financing -= net;
      } else if (acc.id === map.cash) {
        operating += net;
      } else {
        operating -= net;
      }
    }

    const payments = await paymentsReport(db, f);
    const paymentIn = payments
      .filter((p) => String(p.direction).includes("receive") || String(p.direction).includes("deposit"))
      .reduce((s, p) => s + Number(p.amount), 0);
    const paymentOut = payments
      .filter((p) => String(p.direction).includes("pay") || String(p.direction).includes("withdraw"))
      .reduce((s, p) => s + Number(p.amount), 0);

    const cash = movement.get(map.cash) || { debit: 0, credit: 0 };
    const cashNet = cash.debit - cash.credit;

    return [
      { category: "تشغيلي", type: "صافي من القيود (تشغيلي)", amount: Number(operating.toFixed(2)) },
      { category: "تشغيلي", type: "تحصيلات نقدية وبنكية (سندات)", amount: paymentIn },
      { category: "تشغيلي", type: "مدفوعات نقدية وبنكية (سندات)", amount: paymentOut },
      { category: "استثماري", type: "صافي أصول ثابتة ومجمع إهلاك", amount: Number(investing.toFixed(2)) },
      { category: "تمويلي", type: "صافي حقوق ملكية وقروض طويلة", amount: Number(financing.toFixed(2)) },
      { category: "صافي", type: "صافي التدفق التشغيلي (قيود)", amount: Number(operating.toFixed(2)) },
      { category: "صافي", type: "صافي التدفق الكلي (تشغيل+استثمار+تمويل)", amount: Number((operating + investing + financing).toFixed(2)) },
      { category: "صافي", type: "صافي حركة حساب الصندوق", amount: cashNet },
    ];
  },
};

function num(v: unknown) {
  return Number(v ?? 0);
}

export const FINAL_REPORT_SLUGS = Object.keys(HANDLERS);

export async function runFinalReport(
  db: Db,
  slug: string,
  filters: ReportFilters,
): Promise<ReportRow[]> {
  const handler = HANDLERS[slug];
  if (!handler) return [{ message: "التقرير غير موجود", slug }];
  return handler(db, filters);
}
