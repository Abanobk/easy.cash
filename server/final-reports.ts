/**
 * Final / statement reports — Mega Cash FinalReports layout (Wave 5).
 * Evidence: artifacts/mega-wave5-final/ (PDF + COLUMNS.md).
 * Returns flat grid rows for ReportHub; labels match Mega PDF wording.
 */
import { eq } from "drizzle-orm";
import { accounts } from "../drizzle/schema";
import type { Db } from "./db";
import { resolveAccountMap } from "./auto-journal";
import {
  type ReportFilters,
  getPostedMovementByAccount,
  incomeStatementFromData,
  getAccountBalancesAsOf,
  subLedgerReport,
  paymentsReport,
  purchasesInvoicesReport,
  generalJournalReport,
  generalLedgerReport,
  trialBalanceReport,
} from "./accounting-data";
import { tenantWhere } from "./tenant-scope";

export type ReportRow = Record<string, unknown>;

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function money(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function line(label: string, amount: number | null = null): ReportRow {
  return { lineLabel: label, amount: amount === null ? "" : money(amount) };
}

function matchesName(name: string, needles: string[]): boolean {
  const n = name.toLowerCase();
  return needles.some((x) => n.includes(x.toLowerCase()));
}

type Acc = {
  id: number;
  code: string;
  name: string;
  type: string;
  parentId: number | null;
  isParent: boolean | null;
  balance: unknown;
};

async function loadAccounts(db: Db, tenantId: number): Promise<Acc[]> {
  return db
    .select({
      id: accounts.id,
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      parentId: accounts.parentId,
      isParent: accounts.isParent,
      balance: accounts.balance,
    })
    .from(accounts)
    .where(tenantWhere(accounts, tenantId, eq(accounts.isActive, true))) as Promise<Acc[]>;
}

function leafNet(acc: Acc, move: Map<number, { debit: number; credit: number }>): number {
  const m = move.get(acc.id) || { debit: 0, credit: 0 };
  const base = num(acc.balance);
  if (acc.type === "asset" || acc.type === "expense") return base + m.debit - m.credit;
  return base + m.credit - m.debit;
}

function periodNet(acc: Acc, move: Map<number, { debit: number; credit: number }>): number {
  const m = move.get(acc.id) || { debit: 0, credit: 0 };
  if (acc.type === "asset" || acc.type === "expense") return m.debit - m.credit;
  return m.credit - m.debit;
}

function isAccumDep(a: Acc): boolean {
  return matchesName(String(a.name || ""), ["مجمع اهلاك", "مجمع إهلاك", "accumulated dep"]);
}

function isFixedAsset(a: Acc): boolean {
  const code = String(a.code || "");
  const name = String(a.name || "");
  if (a.type !== "asset") return false;
  if (isAccumDep(a)) return false;
  return (
    code.startsWith("12") ||
    matchesName(name, [
      "أصول ثابتة",
      "اصول ثابتة",
      "أراضى",
      "اراضي",
      "سيارات",
      "ماكينات",
      "معدات",
      "حاسب",
      "انشاء",
    ])
  );
}

function isCurrentAsset(a: Acc): boolean {
  if (a.type !== "asset") return false;
  if (isFixedAsset(a) || isAccumDep(a)) return false;
  return true;
}

function isLongLiab(a: Acc): boolean {
  if (a.type !== "liability") return false;
  const code = String(a.code || "");
  return (
    code.startsWith("24") ||
    code.startsWith("25") ||
    matchesName(String(a.name || ""), ["قروض طويلة", "التزامات طويلة", "طويلة الاجل", "طويلة الأجل"])
  );
}

function isCurrentLiab(a: Acc): boolean {
  return a.type === "liability" && !isLongLiab(a);
}

function cashLike(name: string, code: string): boolean {
  return (
    matchesName(name, ["نقد", "خزين", "صندوق", "بنك", "cash", "bank"]) ||
    code.startsWith("111") ||
    code.startsWith("112")
  );
}

function pushAccountLines(
  rows: ReportRow[],
  list: Acc[],
  balMap: Map<number, number>,
  pred: (a: Acc) => boolean,
): number {
  let sum = 0;
  for (const a of list) {
    if (a.isParent) continue;
    if (!pred(a)) continue;
    let bal = balMap.get(a.id) ?? 0;
    if (isAccumDep(a)) bal = -Math.abs(bal);
    if (Math.abs(bal) < 0.005) continue;
    rows.push(line(a.name, bal));
    sum += bal;
  }
  return sum;
}

/** قائمة تكلفة المبيعات — Mega FinalReports/SalesCost.aspx */
async function salesCostStatement(db: Db, f: ReportFilters): Promise<ReportRow[]> {
  const to = f.dateTo || new Date().toISOString().slice(0, 10);
  const from = f.dateFrom || `${to.slice(0, 4)}-01-01`;

  const [map, all, beforeMove, periodMove, endingBalanced, purchases] = await Promise.all([
    resolveAccountMap(db, f.tenantId),
    loadAccounts(db, f.tenantId),
    getPostedMovementByAccount(db, f.tenantId, { before: from }),
    getPostedMovementByAccount(db, f.tenantId, { from, to }),
    getAccountBalancesAsOf(db, f.tenantId, to),
    purchasesInvoicesReport(db, f),
  ]);

  const invId = map.inventory;
  const cogsId = map.cogs;

  const openingInventory = (() => {
    const acc = all.find((a) => a.id === invId);
    if (!acc) return 0;
    return leafNet(acc, beforeMove);
  })();

  const endingInventory = (() => {
    const row = endingBalanced.find((a) => a.id === invId);
    return row ? Math.abs(num(row.balance)) : 0;
  })();

  const netPurchases = purchases.reduce((s, r) => s + num(r.total), 0);

  const sumByName = (
    needles: string[],
    move: Map<number, { debit: number; credit: number }>,
    side: "debit" | "credit" | "net",
  ) => {
    let t = 0;
    for (const a of all) {
      if (a.isParent) continue;
      if (!matchesName(a.name, needles)) continue;
      const m = move.get(a.id) || { debit: 0, credit: 0 };
      if (side === "debit") t += m.debit - m.credit;
      else if (side === "credit") t += m.credit - m.debit;
      else t += periodNet(a, move);
    }
    return t;
  };

  const earnedDiscount = sumByName(["خصم مكتسب", "earned discount"], periodMove, "credit");
  const warehouseTransfers = sumByName(
    ["تحويلت مخزنية", "تحويلات مخزنية", "تحويل مخزني"],
    periodMove,
    "net",
  );
  const wip = (() => {
    const acc = endingBalanced.find((a) =>
      matchesName(String(a.name || ""), ["مواد خام تحت التشغيل", "تحت التشغيل", "wip"]),
    );
    return acc ? Math.abs(num(acc.balance)) : 0;
  })();
  const inventoryAdjustments = sumByName(
    ["تسويات مخزنية", "تسوية مخزون", "inventory adjust"],
    periodMove,
    "debit",
  );
  const productionExpenses = sumByName(
    ["مصروفات انتاج", "مصروفات إنتاج", "production expense"],
    periodMove,
    "debit",
  );

  const cogsMove = periodMove.get(cogsId) || { debit: 0, credit: 0 };
  const postedCogs = Math.max(0, cogsMove.debit - cogsMove.credit);
  const computed =
    openingInventory +
    netPurchases -
    endingInventory -
    earnedDiscount +
    warehouseTransfers +
    wip +
    inventoryAdjustments +
    productionExpenses;
  const totalCost = postedCogs > 0.005 ? postedCogs : Math.max(0, computed);
  const avgInv = (Math.abs(openingInventory) + Math.abs(endingInventory)) / 2;
  const turnover = avgInv > 0.005 ? totalCost / avgInv : 0;

  return [
    line("مخزون اول المدة", openingInventory),
    line("صافى المشتريات", netPurchases),
    line("مخزون اخر المدة", endingInventory),
    line("خصم مكتسب", earnedDiscount),
    line("تحويلت مخزنية", warehouseTransfers),
    line("مواد خام تحت التشغيل", wip),
    line("تسويات مخزنية", inventoryAdjustments),
    line("مصروفات انتاج", productionExpenses),
    line("اجمالي تكلفة المبيعات", totalCost),
    line("معدل دوران المخزون", money(turnover)),
  ];
}

/** قائمة الدخل — Mega FinalReports/IncomeStatment.aspx */
async function incomeStatementMega(db: Db, f: ReportFilters): Promise<ReportRow[]> {
  const [inc, all, periodMove] = await Promise.all([
    incomeStatementFromData(db, f),
    loadAccounts(db, f.tenantId),
    getPostedMovementByAccount(db, f.tenantId, { from: f.dateFrom, to: f.dateTo }),
  ]);

  const detailExpense = (needles: string[]) => {
    const rows: ReportRow[] = [];
    let sum = 0;
    for (const a of all) {
      if (a.isParent || a.type !== "expense") continue;
      if (!matchesName(a.name, needles)) continue;
      const v = periodNet(a, periodMove);
      if (Math.abs(v) < 0.005) continue;
      rows.push(line(a.name, v));
      sum += v;
    }
    return { rows, sum };
  };

  const inventoryAdj = detailExpense(["تسويات جردية", "تسوية جردية", "تسويات مخزنية"]);
  const sellingSalaries = detailExpense(["مرتبات بيعية", "مرتبات بيع", "مرتبات تسويق"]);
  const sellingComm = detailExpense(["عمولات بيع", "عمولت بيع", "عمولة بيع"]);
  const operating = detailExpense(["تشغيل", "سولر", "صيانة", "سفريات", "مستلزمات"]);
  const admin = detailExpense([
    "عمومية",
    "ادارية",
    "إدارية",
    "بنكيه",
    "بنكية",
    "رسوم",
    "اتعاب",
    "مياه",
    "جراج",
    "كارتة",
    "اكرامي",
  ]);
  const nonOp = (() => {
    const rows: ReportRow[] = [];
    let sum = 0;
    for (const a of all) {
      if (a.isParent) continue;
      if (!matchesName(a.name, ["ارباح راسمالية", "أرباح رأسمالية", "ايرادات غير", "إيرادات غير", "غير النشاط"])) {
        continue;
      }
      const v = periodNet(a, periodMove);
      if (Math.abs(v) < 0.005) continue;
      rows.push(line(a.name, v));
      sum += v;
    }
    return { rows, sum };
  })();

  const gross = inc.grossProfit;
  const grossPct = inc.revenue > 0.005 ? (gross / inc.revenue) * 100 : 0;
  const totalExpenses =
    inventoryAdj.sum + sellingSalaries.sum + sellingComm.sum + operating.sum + admin.sum;
  const netProfit = inc.netProfit;
  const roiPct = inc.revenue > 0.005 ? (netProfit / inc.revenue) * 100 : 0;

  const rows: ReportRow[] = [
    line("إيراد النشاط", inc.revenue),
    line("تكلفة المبيعات", inc.cost),
    line("مجمل الربح", gross),
    line("نسبة مجمل الربح (%)", money(grossPct)),
    line("تسويات جردية", inventoryAdj.sum),
    ...inventoryAdj.rows,
    line("مرتبات بيعية وتسويقية", sellingSalaries.sum),
    ...sellingSalaries.rows,
    line("عمولات بيع وتسويق", sellingComm.sum),
    ...sellingComm.rows,
    line("مصروفات تشغيلية (تفصيلي)", operating.sum),
    ...operating.rows,
    line("مصروفات عمومية وادارية (تفصيلي)", admin.sum),
    ...admin.rows,
    line("اجمالي مصروفات", totalExpenses || inc.expenses),
    line("ايرادات غير النشاط", nonOp.sum),
    ...nonOp.rows,
    line("صافي الربح", netProfit),
    line("نسبة معدل العائد على المبيعات (%)", money(roiPct)),
  ];

  return rows;
}

/** الميزانية العمومية — Mega FinalReports/BalanceSheet.aspx */
async function balanceSheetMega(db: Db, f: ReportFilters): Promise<ReportRow[]> {
  const asOf = f.dateTo || new Date().toISOString().slice(0, 10);
  const balanced = await getAccountBalancesAsOf(db, f.tenantId, asOf);
  const list: Acc[] = balanced.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type,
    parentId: a.parentId,
    isParent: a.isParent,
    balance: a.balance,
  }));
  const balMap = new Map(list.map((a) => [a.id, num(a.balance)]));

  const rows: ReportRow[] = [];
  rows.push(line("الاصول"));

  rows.push(line("الاصول طويلة الاجل"));
  const fixedSum = pushAccountLines(rows, list, balMap, (a) => isFixedAsset(a) || isAccumDep(a));
  rows.push(line("اجمالى الاصول طويلة الاجل", fixedSum));

  rows.push(line("الاصول المتداولة"));
  const currentAssets = pushAccountLines(rows, list, balMap, isCurrentAsset);
  rows.push(line("اجمالى الاصول المتداولة", currentAssets));

  const totalAssets = fixedSum + currentAssets;
  rows.push(line("اجمالى الاصول", totalAssets));

  rows.push(line("الالتزامات وحقوق الملكية"));
  rows.push(line("حقوق الملكية"));
  const equity = pushAccountLines(rows, list, balMap, (a) => a.type === "equity");
  rows.push(line("اجمالي حقوق الملكية", equity));

  rows.push(line("التزامات طويلة الاجل"));
  const longLiab = pushAccountLines(rows, list, balMap, isLongLiab);
  rows.push(line("اجمالى التزامات طويلة الاجل", longLiab));

  rows.push(line("الخصوم المتداولة"));
  const currentLiab = pushAccountLines(rows, list, balMap, isCurrentLiab);
  rows.push(line("اجمالى الخصوم المتداولة", currentLiab));

  rows.push(line("اجمالى الخصوم", longLiab + currentLiab + equity));

  return rows;
}

/** قائمة المركز المالى — Mega FinalReports/FinancialStatment.aspx */
async function financialStatementMega(db: Db, f: ReportFilters): Promise<ReportRow[]> {
  const asOf = f.dateTo || new Date().toISOString().slice(0, 10);
  const balanced = await getAccountBalancesAsOf(db, f.tenantId, asOf);
  const list: Acc[] = balanced.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type,
    parentId: a.parentId,
    isParent: a.isParent,
    balance: a.balance,
  }));
  const balMap = new Map(list.map((a) => [a.id, num(a.balance)]));

  const rows: ReportRow[] = [];
  rows.push(line("الاصول طويلة الاجل"));
  const fixedSum = pushAccountLines(rows, list, balMap, (a) => isFixedAsset(a) || isAccumDep(a));
  rows.push(line("اجمالي الاصول طويلة الاجل", fixedSum));

  rows.push(line("الاصول المتداولة"));
  const currentAssets = pushAccountLines(rows, list, balMap, isCurrentAsset);
  rows.push(line("اجمالي الاصول المتداولة", currentAssets));

  rows.push(line("الخصوم المتداولة"));
  const currentLiab = pushAccountLines(rows, list, balMap, isCurrentLiab);
  rows.push(line("اجمالي الخصوم المتداولة", currentLiab));

  const workingCapital = currentAssets - currentLiab;
  const totalInvestment = workingCapital + fixedSum;
  rows.push(line("رأس المال العامل", workingCapital));
  rows.push(line("اجمالي الاستثمار", totalInvestment));

  rows.push(line("حقوق الملكية"));
  const equity = pushAccountLines(rows, list, balMap, (a) => a.type === "equity");
  rows.push(line("اجمالي حقوق الملكية", equity));

  rows.push(line("التزامات طويلة الاجل"));
  const longSum = pushAccountLines(rows, list, balMap, isLongLiab);
  rows.push(line("اجمالى تمويل رأس المال العامل والاصول طويلة الاجل", equity + longSum));

  return rows;
}

/** قائمة التدفقات النقدية — Mega FinalReports/CashFlow.aspx */
async function cashFlowStatement(db: Db, f: ReportFilters): Promise<ReportRow[]> {
  const [map, all, periodMove, payments] = await Promise.all([
    resolveAccountMap(db, f.tenantId),
    loadAccounts(db, f.tenantId),
    getPostedMovementByAccount(db, f.tenantId, { from: f.dateFrom, to: f.dateTo }),
    paymentsReport(db, f),
  ]);

  let fromCustomers = 0;
  let toVendors = 0;
  let toExpenses = 0;
  for (const p of payments) {
    const amt = num(p.amount);
    const debit = String(p.debitAccount || "");
    const credit = String(p.creditAccount || "");
    if (cashLike(debit, "") && !cashLike(credit, "")) {
      fromCustomers += amt;
    } else if (cashLike(credit, "") && !cashLike(debit, "")) {
      if (matchesName(debit, ["مورد", "supplier", "vendor"]) || !debit || debit === "—") {
        toVendors += amt;
      } else {
        toExpenses += amt;
      }
    }
  }

  if (fromCustomers < 0.005 && toVendors < 0.005) {
    for (const a of all) {
      if (a.isParent) continue;
      const m = periodMove.get(a.id) || { debit: 0, credit: 0 };
      if (matchesName(a.name, ["عملاء", "أوراق قبض", "اوراق قبض"])) fromCustomers += m.credit;
      if (matchesName(a.name, ["موردين", "أوراق دفع", "اوراق دفع"])) toVendors += m.debit;
    }
  }

  let buyFixed = 0;
  let sellFixed = 0;
  let longLiabIncrease = 0;
  for (const a of all) {
    if (a.isParent) continue;
    const m = periodMove.get(a.id) || { debit: 0, credit: 0 };
    if (isFixedAsset(a)) {
      buyFixed += Math.max(0, m.debit - m.credit);
      sellFixed += Math.max(0, m.credit - m.debit);
    }
    if (isLongLiab(a)) longLiabIncrease += m.credit - m.debit;
  }

  const operating = fromCustomers - toVendors - toExpenses;
  const investing = sellFixed - buyFixed;
  const financing = longLiabIncrease;
  const netIncrease = operating + investing + financing;

  const cashIds = new Set<number>();
  if (map.cash) cashIds.add(map.cash);
  for (const a of all) {
    if (!a.isParent && cashLike(a.name, a.code)) cashIds.add(a.id);
  }
  let cashNet = 0;
  for (const id of cashIds) {
    const m = periodMove.get(id) || { debit: 0, credit: 0 };
    cashNet += m.debit - m.credit;
  }

  return [
    line("النقدية المقبوضة من العملاء", fromCustomers),
    line("النقدية المدفوعة للموردين", toVendors),
    line("النقدية المدفوعة للمصاريف", toExpenses),
    line("شراء اصول ثابتة", buyFixed),
    line("بيع اصول ثابتة", sellFixed),
    line("الزيادة فى الالتزامات طويلة الاجل", longLiabIncrease),
    line("صافى الزيادة النقدية خلال الفترة", netIncrease || cashNet),
  ];
}

const HANDLERS: Record<string, (db: Db, f: ReportFilters) => Promise<ReportRow[]>> = {
  "accounting-generaljournallist": generalJournalReport,
  "finalreports-generalledger": generalLedgerReport,
  "finalreports-trialbalance": trialBalanceReport,
  "finalreports-subledger": async (db, f) => {
    if (!f.accountId) {
      return [{ message: "يجب اختيار الحساب الرئيسي", requiresAccount: true }];
    }
    return subLedgerReport(db, f);
  },
  "finalreports-salescost": salesCostStatement,
  "finalreports-incomestatment": incomeStatementMega,
  "finalreports-balancesheet": balanceSheetMega,
  "finalreports-financialstatment": financialStatementMega,
  "finalreports-cashflow": cashFlowStatement,
};

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
