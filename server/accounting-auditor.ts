/**
 * مراجع الحسابات الذكي — فحص آلي للملاحظات + ملخص للمساعد.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./db";
import {
  fiscalYears,
  importCostLines,
  importCostShipments,
  journalEntries,
  journalEntryLines,
  purchaseInvoices,
  salesInvoices,
} from "../drizzle/schema";
import {
  computeImportCost,
  defaultShippingQuote,
  type AllocKey,
  type ImportCostHeader,
  type ImportCostLineInput,
} from "../shared/import-costing";
import { incomeStatementFromData, trialBalanceReport } from "./accounting-data";
import {
  auditBankAndCashReconciliations,
  auditPeriodComparison,
  auditReceivablePayableReconciliations,
  collectAuditSamples,
  extrasPromptBlock,
  loadPreviousAuditMemory,
  persistAuditRun,
  type OfficeAuditExtras,
} from "./accounting-auditor-office";
import {
  coveragePromptBlock,
  runCoverageAudits,
  type CoverageExtras,
} from "./accounting-auditor-coverage";
import { applyClosureStatusToFindings } from "./bank-statement-reconcile";
import { loadAuditPolicy, policyPromptBlock } from "./audit-policy";
import { getDebtAgingSummary } from "./debt-aging";
import { getOperationalAlerts } from "./operational-alerts";
import { tenantWhere } from "./tenant-scope";

export type AuditSeverity = "critical" | "warning" | "info";

export type AuditFinding = {
  id: string;
  /** رقم مرجعي احترافي متسلسل بعد ترتيب الشدة (F-001 الأولوية الأعلى) — للربط داخل تقرير المراجع. */
  refCode?: string;
  severity: AuditSeverity;
  category: string;
  title: string;
  detail: string;
  recommendation: string;
  link?: string;
  closureStatus?: "open" | "closed" | "accepted_risk";
  closureNote?: string;
};

export type TrialBalanceSnapshot = {
  balanced: boolean;
  totalClosingDebit: number;
  totalClosingCredit: number;
  difference: number;
  accountsReviewed: number;
  periodLabel: string;
  dateFrom?: string;
  dateTo?: string;
  topAccounts: Array<{
    code: string;
    name: string;
    type: string;
    closingDebit: number;
    closingCredit: number;
  }>;
  reversedNature: Array<{
    code: string;
    name: string;
    type: string;
    closingDebit: number;
    closingCredit: number;
  }>;
};

export type IncomeSnapshot = {
  revenue: number;
  cost: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
};

/**
 * تقييم داخلي آلي لحالة الحسابات — بصياغة قريبة من رأي المراجع التقليدي (نظيف/متحفظ/سلبي/
 * امتناع) لكنه ليس رأي مراجعة قانونية خارجية ولا بديلاً عنه؛ محسوب بقواعد ثابتة من نتائج
 * الفحص الآلي نفسها (مش توليد لغوي) عشان يفضل موضوعي وقابل لإعادة الإنتاج بنفس المدخلات.
 */
export type AuditOpinionType = "unqualified" | "qualified" | "adverse" | "disclaimer";

export type AuditOpinion = {
  type: AuditOpinionType;
  label: string;
  rationale: string;
};

function computeAuditOpinion(
  trialBalance: TrialBalanceSnapshot,
  summary: { critical: number; warning: number; info: number; total: number },
): AuditOpinion {
  if (!trialBalance.accountsReviewed) {
    return {
      type: "disclaimer",
      label: "امتناع عن إبداء رأي — بيانات غير كافية",
      rationale: "لا توجد حسابات ذات حركة كافية للمراجعة في الفترة الحالية؛ يلزم تسجيل مستندات فعلية قبل تكوين رأي.",
    };
  }
  if (!trialBalance.balanced) {
    return {
      type: "adverse",
      label: "رأي سلبي — الميزان غير متوازن",
      rationale: `فرق ${trialBalance.difference.toLocaleString("en-US")} ج بين إجمالي المدين والدائن يجعل التقارير المالية الحالية غير موثوقة قبل تصحيحه.`,
    };
  }
  if (summary.critical > 0) {
    return {
      type: "qualified",
      label: "رأي متحفظ — مشروط بمعالجة الملاحظات الحرجة",
      rationale: `${summary.critical} ملاحظة حرجة مفتوحة قد تؤثر ماديّاً على دقة الأرصدة أو التقارير حتى تُعالَج.`,
    };
  }
  if (summary.warning > 0) {
    return {
      type: "unqualified",
      label: "رأي غير متحفظ مع لفت نظر",
      rationale: `الميزان متوازن ولا توجد ملاحظات حرجة، لكن يوجد ${summary.warning} ملاحظة تحذيرية تشغيلية تستحق المتابعة.`,
    };
  }
  return {
    type: "unqualified",
    label: "رأي نظيف — غير متحفظ",
    rationale: "الميزان متوازن ولا توجد ملاحظات حرجة أو تحذيرية مفتوحة في نطاق الفحص الآلي الحالي.",
  };
}

export type AccountingAuditReport = {
  generatedAt: string;
  summary: {
    critical: number;
    warning: number;
    info: number;
    total: number;
  };
  opinion: AuditOpinion;
  findings: AuditFinding[];
  stats: Record<string, number | string>;
  trialBalance?: TrialBalanceSnapshot;
  income?: IncomeSnapshot;
  policy?: import("./audit-policy").AuditPolicy;
  office?: import("./accounting-auditor-office").OfficeAuditExtras;
  coverage?: import("./accounting-auditor-coverage").CoverageExtras;
};

function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function money(v: number) {
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** drizzle بيرجّع عمود date() كـ Date object — String() عليه بينادي toString() مش toISOString() */
function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v || "").slice(0, 10);
}

function push(
  out: AuditFinding[],
  finding: Omit<AuditFinding, "id"> & { id?: string },
) {
  out.push({
    id: finding.id || `${finding.category}-${out.length + 1}`,
    ...finding,
  });
}

async function auditJournals(db: Db, tenantId: number, out: AuditFinding[]) {
  const [draftCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(journalEntries)
    .where(tenantWhere(journalEntries, tenantId, eq(journalEntries.status, "draft")));

  const drafts = n(draftCount?.count);
  if (drafts > 0) {
    push(out, {
      severity: drafts >= 10 ? "warning" : "info",
      category: "قيود يومية",
      title: `${drafts} قيد يومية ما زال مسودة`,
      detail: "المسودات لا تدخل التقارير النهائية بشكل كامل حتى تُرحَّل.",
      recommendation: "راجع قائمة القيود ورحّل ما اكتمل أو احذف المسودات الملغاة.",
      link: "/accounts/journal",
    });
  }

  const unbalanced = await db
    .select({
      id: journalEntries.id,
      number: journalEntries.number,
      date: journalEntries.date,
      debit: sql<string>`COALESCE(SUM(${journalEntryLines.debit}), 0)`,
      credit: sql<string>`COALESCE(SUM(${journalEntryLines.credit}), 0)`,
    })
    .from(journalEntries)
    .leftJoin(
      journalEntryLines,
      and(
        eq(journalEntryLines.entryId, journalEntries.id),
        eq(journalEntryLines.tenantId, journalEntries.tenantId),
      ),
    )
    .where(tenantWhere(journalEntries, tenantId, eq(journalEntries.status, "posted")))
    .groupBy(journalEntries.id, journalEntries.number, journalEntries.date)
    .having(sql`ABS(COALESCE(SUM(${journalEntryLines.debit}),0) - COALESCE(SUM(${journalEntryLines.credit}),0)) > 0.05`)
    .orderBy(desc(journalEntries.date))
    .limit(15);

  for (const row of unbalanced) {
    const debit = n(row.debit);
    const credit = n(row.credit);
    push(out, {
      severity: "critical",
      category: "قيود يومية",
      title: `قيد غير متوازن: ${row.number}`,
      detail: `مدين ${money(debit)} ≠ دائن ${money(credit)} بتاريخ ${toDateStr(row.date)}.`,
      recommendation: "افتح القيد وصحّح الأسطر فوراً؛ عدم التوازن يفسد ميزان المراجعة.",
      link: `/accounts/journal/${row.id}`,
    });
  }

  const emptyPosted = await db
    .select({
      id: journalEntries.id,
      number: journalEntries.number,
      date: journalEntries.date,
      lines: sql<number>`COUNT(${journalEntryLines.id})`,
    })
    .from(journalEntries)
    .leftJoin(
      journalEntryLines,
      and(
        eq(journalEntryLines.entryId, journalEntries.id),
        eq(journalEntryLines.tenantId, journalEntries.tenantId),
      ),
    )
    .where(tenantWhere(journalEntries, tenantId, eq(journalEntries.status, "posted")))
    .groupBy(journalEntries.id, journalEntries.number, journalEntries.date)
    .having(sql`COUNT(${journalEntryLines.id}) = 0`)
    .limit(10);

  for (const row of emptyPosted) {
    push(out, {
      severity: "critical",
      category: "قيود يومية",
      title: `قيد مرحّل بلا أسطر: ${row.number}`,
      detail: `بتاريخ ${toDateStr(row.date)} بدون أي أسطر مدينة/دائنة.`,
      recommendation: "أضف أسطر القيد أو ألغِ ترحيله حتى لا يشوّه دفتر اليومية.",
      link: `/accounts/journal/${row.id}`,
    });
  }
}

async function resolveAuditPeriod(db: Db, tenantId: number) {
  const [openFy] = await db
    .select()
    .from(fiscalYears)
    .where(tenantWhere(fiscalYears, tenantId, eq(fiscalYears.status, "open")))
    .orderBy(desc(fiscalYears.startDate))
    .limit(1);

  if (openFy) {
    return {
      dateFrom: toDateStr(openFy.startDate),
      dateTo: toDateStr(openFy.endDate),
      periodLabel: `السنة المالية المفتوحة: ${openFy.name}`,
    };
  }

  const year = new Date().getFullYear();
  return {
    dateFrom: `${year}-01-01`,
    dateTo: `${year}-12-31`,
    periodLabel: `السنة الميلادية ${year} (لا توجد سنة مالية مفتوحة)`,
  };
}

function isNormalBalanceSuspicious(type: string, closingDebit: number, closingCredit: number) {
  const net = closingDebit - closingCredit;
  const material = Math.abs(net) >= 100;
  if (!material) return false;
  if ((type === "asset" || type === "expense") && net < 0) return true;
  if ((type === "liability" || type === "equity" || type === "revenue") && net > 0) return true;
  return false;
}

async function auditTrialBalance(
  db: Db,
  tenantId: number,
  out: AuditFinding[],
  stats: Record<string, number | string>,
): Promise<{ trialBalance: TrialBalanceSnapshot; income: IncomeSnapshot }> {
  const period = await resolveAuditPeriod(db, tenantId);
  const filters = { tenantId, dateFrom: period.dateFrom, dateTo: period.dateTo };
  const rows = await trialBalanceReport(db as any, filters);
  const income = await incomeStatementFromData(db as any, filters);

  let totalClosingDebit = 0;
  let totalClosingCredit = 0;
  const reversedNature: TrialBalanceSnapshot["reversedNature"] = [];

  for (const r of rows) {
    totalClosingDebit += n(r.closingDebit);
    totalClosingCredit += n(r.closingCredit);
    if (isNormalBalanceSuspicious(String(r.accountType), n(r.closingDebit), n(r.closingCredit))) {
      reversedNature.push({
        code: String(r.accountCode),
        name: String(r.accountName),
        type: String(r.accountType),
        closingDebit: n(r.closingDebit),
        closingCredit: n(r.closingCredit),
      });
    }
  }

  const difference = Math.abs(totalClosingDebit - totalClosingCredit);
  const balanced = difference < 0.05;

  const topAccounts = [...rows]
    .map((r) => ({
      code: String(r.accountCode),
      name: String(r.accountName),
      type: String(r.accountType),
      closingDebit: n(r.closingDebit),
      closingCredit: n(r.closingCredit),
      abs: Math.max(n(r.closingDebit), n(r.closingCredit)),
    }))
    .sort((a, b) => b.abs - a.abs)
    .slice(0, 25)
    .map(({ abs: _a, ...rest }) => rest);

  stats.tbAccounts = rows.length;
  stats.tbDebit = Number(totalClosingDebit.toFixed(2));
  stats.tbCredit = Number(totalClosingCredit.toFixed(2));
  stats.tbDiff = Number(difference.toFixed(2));
  stats.tbBalanced = balanced ? 1 : 0;
  stats.revenue = Number(n(income.revenue).toFixed(2));
  stats.netProfit = Number(n(income.netProfit).toFixed(2));

  if (!balanced) {
    push(out, {
      severity: "critical",
      category: "ميزان المراجعة",
      title: "ميزان المراجعة غير متوازن",
      detail: `${period.periodLabel}. إجمالي مدين إقفال ${money(totalClosingDebit)} ≠ دائن ${money(totalClosingCredit)} · الفرق ${money(difference)}.`,
      recommendation: "ابدأ بالقيود غير المتوازنة ثم راجع آخر قيود مرحّلة وحسابات النقدية/الذمم. افتح تقرير ميزان المراجعة للمقارنة.",
      link: "/reports/final/finalreports-trialbalance",
    });
  } else {
    push(out, {
      severity: "info",
      category: "ميزان المراجعة",
      title: "ميزان المراجعة متوازن حسابياً",
      detail: `${period.periodLabel}. تمت مراجعة ${rows.length} حساباً ذو رصيد/حركة · مدين ${money(totalClosingDebit)} = دائن ${money(totalClosingCredit)}.`,
      recommendation: "التوازن شرط لازم وليس كافياً — أكمل مراجعة طبيعة الأرصدة والذمم والمخزون والشيكات.",
      link: "/reports/final/finalreports-trialbalance",
    });
  }

  for (const a of reversedNature.slice(0, 20)) {
    const typeAr =
      a.type === "asset" ? "أصل"
        : a.type === "liability" ? "التزام"
          : a.type === "equity" ? "حقوق ملكية"
            : a.type === "revenue" ? "إيراد"
              : "مصروف";
    push(out, {
      severity: "warning",
      category: "طبيعة الرصيد",
      title: `رصيد غير طبيعي: ${a.code} — ${a.name}`,
      detail: `نوع الحساب ${typeAr}. إقفال مدين ${money(a.closingDebit)} / دائن ${money(a.closingCredit)}.`,
      recommendation: "راجع حركة الحساب في دفتر الأستاذ وتأكد من صحة طرف القيد أو وجود حساب مقابل (مخصص/مردودات).",
      link: "/reports/final/finalreports-generalledger",
    });
  }

  if (n(income.revenue) > 0 && n(income.netProfit) < 0 && Math.abs(n(income.netProfit)) > n(income.revenue) * 0.5) {
    push(out, {
      severity: "warning",
      category: "قائمة الدخل",
      title: "صافي خسارة مرتفعة نسبياً مقابل الإيراد",
      detail: `إيراد ${money(income.revenue)} · تكلفة ${money(income.cost)} · مصروفات ${money(income.expenses)} · صافي ${money(income.netProfit)}.`,
      recommendation: "راجع تكلفة المبيعات والمصروفات الكبيرة وتواريخ الترحيل لنفس الفترة.",
      link: "/reports/final/finalreports-incomestatment",
    });
  }

  if (n(income.revenue) > 0 && n(income.cost) > n(income.revenue) * 1.05) {
    push(out, {
      severity: "warning",
      category: "قائمة الدخل",
      title: "تكلفة المبيعات أعلى من الإيراد",
      detail: `تكلفة ${money(income.cost)} مقابل إيراد ${money(income.revenue)}.`,
      recommendation: "افحص ترحيل المشتريات/التكلفة مقابل فواتير البيع وأسعار التكلفة.",
      link: "/reports/final/finalreports-incomestatment",
    });
  }

  return {
    trialBalance: {
      balanced,
      totalClosingDebit,
      totalClosingCredit,
      difference,
      accountsReviewed: rows.length,
      periodLabel: period.periodLabel,
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
      topAccounts,
      reversedNature: reversedNature.slice(0, 30),
    },
    income: {
      revenue: n(income.revenue),
      cost: n(income.cost),
      grossProfit: n(income.grossProfit),
      expenses: n(income.expenses),
      netProfit: n(income.netProfit),
    },
  };
}

async function auditInvoiceIntegrity(db: Db, tenantId: number, out: AuditFinding[]) {
  const badSales = await db
    .select({
      id: salesInvoices.id,
      number: salesInvoices.number,
      total: salesInvoices.total,
      paid: salesInvoices.paid,
      remaining: salesInvoices.remaining,
      status: salesInvoices.status,
    })
    .from(salesInvoices)
    .where(
      tenantWhere(
        salesInvoices,
        tenantId,
        sql`(
          COALESCE(${salesInvoices.remaining},0) < -0.05
          OR COALESCE(${salesInvoices.paid},0) > COALESCE(${salesInvoices.total},0) + 0.05
          OR (COALESCE(${salesInvoices.total},0) <= 0 AND ${salesInvoices.status} IN ('confirmed','partial','paid'))
        )`,
      ),
    )
    .orderBy(desc(salesInvoices.id))
    .limit(15);

  for (const row of badSales) {
    push(out, {
      severity: "critical",
      category: "فواتير بيع",
      title: `خلل أرصدة فاتورة بيع: ${row.number}`,
      detail: `الإجمالي ${money(n(row.total))} · المدفوع ${money(n(row.paid))} · المتبقي ${money(n(row.remaining))} · الحالة ${row.status}.`,
      recommendation: "راجع توزيع السداد والمتبقي؛ صحّح التحصيل أو حالة الفاتورة.",
      link: `/sales/invoices/${row.id}`,
    });
  }

  const badPurchases = await db
    .select({
      id: purchaseInvoices.id,
      number: purchaseInvoices.number,
      total: purchaseInvoices.total,
      paid: purchaseInvoices.paid,
      remaining: purchaseInvoices.remaining,
      status: purchaseInvoices.status,
    })
    .from(purchaseInvoices)
    .where(
      tenantWhere(
        purchaseInvoices,
        tenantId,
        sql`(
          COALESCE(${purchaseInvoices.remaining},0) < -0.05
          OR COALESCE(${purchaseInvoices.paid},0) > COALESCE(${purchaseInvoices.total},0) + 0.05
          OR (COALESCE(${purchaseInvoices.total},0) <= 0 AND ${purchaseInvoices.status} IN ('confirmed','partial','paid'))
        )`,
      ),
    )
    .orderBy(desc(purchaseInvoices.id))
    .limit(15);

  for (const row of badPurchases) {
    push(out, {
      severity: "critical",
      category: "فواتير شراء",
      title: `خلل أرصدة فاتورة شراء: ${row.number}`,
      detail: `الإجمالي ${money(n(row.total))} · المدفوع ${money(n(row.paid))} · المتبقي ${money(n(row.remaining))} · الحالة ${row.status}.`,
      recommendation: "راجع سندات السداد وتخصيصها على الفاتورة.",
      link: `/purchases/invoices/${row.id}`,
    });
  }
}

async function auditImportCosting(db: Db, tenantId: number, out: AuditFinding[]) {
  const shipments = await db
    .select()
    .from(importCostShipments)
    .where(tenantWhere(importCostShipments, tenantId))
    .orderBy(desc(importCostShipments.id))
    .limit(12);

  if (!shipments.length) {
    push(out, {
      severity: "info",
      category: "تكليف شحنة",
      title: "لا توجد تقديرات شحن محفوظة",
      detail: "موديول تكليف الشحنة فاضي حالياً.",
      recommendation: "استخدمه لتقدير تكلفة الوصول قبل الاستيراد الفعلي.",
      link: "/import-costing",
    });
    return;
  }

  const ids = shipments.map((s) => s.id);
  const allLines = await db
    .select()
    .from(importCostLines)
    .where(and(eq(importCostLines.tenantId, tenantId), inArray(importCostLines.shipmentId, ids)));

  const linesByShipment = new Map<number, typeof allLines>();
  for (const line of allLines) {
    const arr = linesByShipment.get(line.shipmentId) || [];
    arr.push(line);
    linesByShipment.set(line.shipmentId, arr);
  }

  for (const row of shipments) {
    const header: ImportCostHeader = {
      costFxRate: n(row.costFxRate),
      customsFxRate: n(row.customsFxRate),
      customsAssessableUsd: n(row.customsAssessableUsd),
      customsRate: n(row.customsRate),
      vatRate: n(row.vatRate),
      withholdingRate: n(row.withholdingRate),
      shippingUsd: n(row.shippingUsd),
      agentFeeUsd: n(row.agentFeeUsd),
      ocaUsd: n(row.ocaUsd),
      yardFeesEgp: n(row.yardFeesEgp),
      brokerFeesEgp: n(row.brokerFeesEgp),
      batteriesEgp: n(row.batteriesEgp),
      freightLocalEgp: n(row.freightLocalEgp),
      ocaAlloc: (row.ocaAlloc as AllocKey) || "unit_cost",
      shippingAlloc: (row.shippingAlloc as AllocKey) || "unit_cost",
      agentAlloc: (row.agentAlloc as AllocKey) || "unit_cost",
      localAlloc: (row.localAlloc as AllocKey) || "weight",
      shippingQuote: defaultShippingQuote(),
    };

    const rawLines: ImportCostLineInput[] = (linesByShipment.get(row.id) || []).map((l) => ({
      category: l.category || "",
      barcode: l.barcode || "",
      itemName: l.itemName,
      quantity: n(l.quantity),
      unitCostUsd: n(l.unitCostUsd),
      unitWeight: n(l.unitWeight),
    }));

    const label = row.name || row.number || `#${row.id}`;
    const link = `/import-costing/${row.id}`;

    if (!rawLines.length) {
      push(out, {
        severity: "warning",
        category: "تكليف شحنة",
        title: `تقدير بدون أصناف: ${label}`,
        detail: "التقدير محفوظ بلا بنود — النتائج غير مفيدة للمراجعة.",
        recommendation: "افتح التقدير وأضف الأصناف ثم احفظ.",
        link,
      });
      continue;
    }

    if (header.customsAssessableUsd <= 0) {
      push(out, {
        severity: "warning",
        category: "تكليف شحنة",
        title: `فاتورة جمركية صفر: ${label}`,
        detail: "الجمارك/الضريبة/أ.ت.ص هتطلع صفر رغم وجود أصناف.",
        recommendation: "أدخل قيمة الفاتورة الجمركية من البيان أو تقدير CIF.",
        link,
      });
    }

    if (header.costFxRate <= 1 || header.customsFxRate <= 1) {
      push(out, {
        severity: "critical",
        category: "تكليف شحنة",
        title: `سعر صرف غير منطقي: ${label}`,
        detail: `صرف التكلفة ${header.costFxRate} · صرف الجمرك ${header.customsFxRate}.`,
        recommendation: "صحّح أسعار الصرف لتطابق التحويل الفعلي/البيان.",
        link,
      });
    }

    const weightAlloc =
      header.localAlloc === "weight" ||
      header.ocaAlloc === "weight" ||
      header.shippingAlloc === "weight" ||
      header.agentAlloc === "weight";
    const totalWeight = rawLines.reduce((a, l) => a + l.quantity * l.unitWeight, 0);
    if (weightAlloc && totalWeight <= 0) {
      push(out, {
        severity: "warning",
        category: "تكليف شحنة",
        title: `توزيع بالوزن بدون أوزان: ${label}`,
        detail: "طريقة التوزيع تعتمد على الوزن لكن كل الأوزان صفر.",
        recommendation: "أدخل أوزاناً تقديرية أو غيّر التوزيع إلى قيمة السطر/بالتساوي.",
        link,
      });
    }

    const computed = computeImportCost(header, rawLines);
    const avg = computed.totals.avgLandedUnitEgp;
    const check = computed.totals.quantity
      ? computed.totals.landedEgp / computed.totals.quantity
      : 0;
    if (Math.abs(avg - check) > 0.5) {
      push(out, {
        severity: "warning",
        category: "تكليف شحنة",
        title: `متوسط القطعة غير متسق: ${label}`,
        detail: `المتوسط المحسوب ${money(avg)} مقابل الإجمالي÷الكمية ${money(check)}.`,
        recommendation: "راجع الكميات الصفرية أو أعد حفظ التقدير بعد تصحيح البنود.",
        link,
      });
    }

    const units = computed.lines.map((l) => l.landedUnitEgp).filter((x) => x > 0);
    if (units.length >= 3) {
      const min = Math.min(...units);
      const max = Math.max(...units);
      if (min > 0 && max / min > 8) {
        push(out, {
          severity: "info",
          category: "تكليف شحنة",
          title: `تفاوت كبير في تكلفة الوصول: ${label}`,
          detail: `أقل وحدة ${money(min)} ج وأعلى ${money(max)} ج (أكثر من 8×).`,
          recommendation: "تأكد أن التوزيع والأوزان/الأسعار تعكس طبيعة الأصناف، أو افصل الشحنات المختلفة.",
          link,
        });
      }
    }
  }
}

async function auditOperations(db: Db, tenantId: number, out: AuditFinding[], stats: Record<string, number | string>) {
  const alerts = await getOperationalAlerts(db, tenantId);
  const c = alerts.counts || ({} as Record<string, number>);

  stats.lowStock = n(c.lowStock);
  stats.unpaidSales = n(c.unpaidSales);
  stats.unpaidPurchases = n(c.unpaidPurchases);
  stats.overdueChecks = n(c.overdueChecks);
  stats.draftDocs = n(c.draftDocs);
  stats.unroutedChecks = n(c.unroutedChecks);
  stats.overdueDeposits = n(c.overdueDeposits);

  if (n(c.lowStock) > 0) {
    push(out, {
      severity: "warning",
      category: "مخزون",
      title: `${c.lowStock} أصناف تحت الحد الأدنى`,
      detail: "نفاد مخزون محتمل يؤثر على المبيعات والتوريد.",
      recommendation: "راجع الأصناف الناقصة وأنشئ أوامر شراء عند الحاجة.",
      link: "/items",
    });
  }

  if (n(c.unpaidSales) > 0) {
    push(out, {
      severity: n(c.unpaidSales) >= 8 ? "warning" : "info",
      category: "ذمم مدينة",
      title: `${c.unpaidSales} فواتير بيع مفتوحة برصيد`,
      detail: "مبالغ متبقية عند العملاء تحتاج متابعة تحصيل.",
      recommendation: "افتح كشف أعمار الديون وخطط التحصيل من شاشة العملاء/الفواتير.",
      link: "/sales/invoices",
    });
  }

  if (n(c.unpaidPurchases) > 0) {
    push(out, {
      severity: "info",
      category: "ذمم دائنة",
      title: `${c.unpaidPurchases} فواتير شراء مفتوحة`,
      detail: "التزامات موردين قائمة.",
      recommendation: "راجع جدول السداد للموردين لتجنب التأخير.",
      link: "/purchases/invoices",
    });
  }

  if (n(c.overdueChecks) > 0) {
    push(out, {
      severity: "warning",
      category: "شيكات",
      title: `${c.overdueChecks} شيكات متأخرة عن الاستحقاق`,
      detail: "شيكات فات موعدها وما زالت معلّقة.",
      recommendation: "راجع الشيكات الواردة/الصادرة وحدّث الحالة أو تابع التحصيل.",
      link: "/bank/checks?type=in",
    });
  }

  if (n(c.unroutedChecks) > 0) {
    push(out, {
      severity: "warning",
      category: "توجيه شيكات",
      title: `${c.unroutedChecks} شيكات واردة غير موجهة`,
      detail: "شيكات بدون حائز/بنك — متابعة ضعيفة.",
      recommendation: "من توجيه الشيكات عيّن حيازة ثم بنك وموعد إيداع.",
      link: "/bank/check-routing",
    });
  }

  if (n(c.overdueDeposits) > 0) {
    push(out, {
      severity: "critical",
      category: "توجيه شيكات",
      title: `${c.overdueDeposits} إيداعات شيكات متأخرة`,
      detail: "تجاوز موعد الإيداع المخطط ولم يتم الإيداع.",
      recommendation: "نفّذ الإيداع من شاشة التوجيه أو عدّل الموعد بسبب موثّق.",
      link: "/bank/check-routing",
    });
  }

  const draftDocs = n(c.draftDocs);
  if (draftDocs > 0) {
    push(out, {
      severity: draftDocs >= 10 ? "warning" : "info",
      category: "مستندات معلقة",
      title: `${draftDocs} فواتير مسودة (بيع/شراء)`,
      detail: "مستندات غير معتمدة قد تؤخر اكتمال الصورة المالية.",
      recommendation: "اعتمد أو احذف المسودات من المستندات المعلقة.",
      link: "/pending-docs",
    });
  }

  try {
    const aging = await getDebtAgingSummary(db, tenantId);
    const over90 = n(aging.customers.over90) + n(aging.suppliers.over90);
    stats.debtOver90 = over90;
    if (over90 > 0) {
      push(out, {
        severity: "warning",
        category: "أعمار ديون",
        title: "ديون متقادمة أكثر من 90 يوم",
        detail: `أرصدة متقادمة للعملاء/الموردين حوالي ${money(over90)} ج.`,
        recommendation: "راجع تقرير أعمار الديون وخطط التحصيل/السداد حسب الأولوية.",
        link: "/contacts/statement?type=customer",
      });
    }
  } catch {
    /* optional */
  }
}

export async function buildAccountingAuditReport(
  db: Db,
  tenantId: number,
  opts?: { userId?: number; persist?: boolean },
): Promise<AccountingAuditReport> {
  const findings: AuditFinding[] = [];
  const stats: Record<string, number | string> = {};
  const policy = await loadAuditPolicy(db, tenantId);

  const { trialBalance, income } = await auditTrialBalance(db, tenantId, findings, stats);
  await auditJournals(db, tenantId, findings);
  await auditInvoiceIntegrity(db, tenantId, findings);
  await auditBankAndCashReconciliations(db, tenantId, findings, policy, stats);
  await auditReceivablePayableReconciliations(db, tenantId, findings, policy, stats);

  const periodCompare = trialBalance.dateFrom && trialBalance.dateTo
    ? await auditPeriodComparison(
      db,
      tenantId,
      { dateFrom: trialBalance.dateFrom, dateTo: trialBalance.dateTo },
      income,
      findings,
      policy,
      stats,
    )
    : undefined;

  const samples = trialBalance.dateFrom && trialBalance.dateTo
    ? await collectAuditSamples(
      db,
      tenantId,
      { dateFrom: trialBalance.dateFrom, dateTo: trialBalance.dateTo },
      findings,
      policy,
    )
    : [];

  await auditImportCosting(db, tenantId, findings);
  await auditOperations(db, tenantId, findings, stats);
  const coverage = await runCoverageAudits(db, tenantId, findings, policy);

  const previousRun = await loadPreviousAuditMemory(
    db,
    tenantId,
    findings.map((f) => f.title),
  );
  if (previousRun?.recurringTitles?.length) {
    push(findings, {
      severity: "warning",
      category: "ذاكرة المراجعات",
      title: `${previousRun.recurringTitles.length} ملاحظة متكررة من مراجعة سابقة`,
      detail: `آخر مراجعة: ${previousRun.generatedAt}. أمثلة: ${previousRun.recurringTitles.slice(0, 5).join(" · ")}`,
      recommendation: "هذه ملاحظات لم تُغلق — عالجها قبل اعتماد التقارير للإدارة.",
      link: "/accounting-auditor",
    });
  }

  const severityRank: Record<AuditSeverity, number> = { critical: 0, warning: 1, info: 2 };
  findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  const withClosures = await applyClosureStatusToFindings(db, tenantId, findings);

  const openFindings = withClosures.filter((f) => (f as any).closureStatus !== "closed" && (f as any).closureStatus !== "accepted_risk");
  const summary = {
    critical: openFindings.filter((f) => f.severity === "critical").length,
    warning: openFindings.filter((f) => f.severity === "warning").length,
    info: openFindings.filter((f) => f.severity === "info").length,
    total: withClosures.length,
  };

  if (!withClosures.length) {
    push(withClosures as AuditFinding[], {
      severity: "info",
      category: "عام",
      title: "لا توجد ملاحظات حادة حالياً",
      detail: "الفحص العميق (ميزان + مطابقات + سياسة + عينات + كشوف + إقفال + سيولة) لم يجد أخطاء حرجة.",
      recommendation: "استمر بالمراجعة الدورية بعد إدخال مستندات جديدة.",
      link: "/reports/final/finalreports-trialbalance",
    });
    summary.info = 1;
    summary.total = 1;
  }

  // ترقيم مرجعي احترافي (F-001 هو الأعلى شدة) بعد استقرار القائمة النهائية بالكامل
  withClosures.forEach((f, i) => {
    (f as AuditFinding).refCode = `F-${String(i + 1).padStart(3, "0")}`;
  });

  const opinion = computeAuditOpinion(trialBalance, summary);

  const office: OfficeAuditExtras = {
    periodCompare,
    samples,
    previousRun,
  };

  const report: AccountingAuditReport = {
    generatedAt: new Date().toISOString(),
    summary,
    opinion,
    findings: withClosures as AuditFinding[],
    stats,
    trialBalance,
    income,
    policy,
    office,
    coverage,
  };

  if (opts?.persist !== false) {
    await persistAuditRun(db, tenantId, report, opts?.userId);
  }

  return report;
}

export function findingsPromptBlock(report: AccountingAuditReport): string {
  const lines = report.findings.slice(0, 80).map((f) =>
    `${f.refCode || "F-???"}) [${f.severity}] ${f.category} — ${f.title}
التفصيل: ${f.detail}
التوصية: ${f.recommendation}
الرابط: ${f.link || "—"}
حالة الإغلاق: ${(f as any).closureStatus || "open"}`
  );

  const tb = report.trialBalance;
  const income = report.income;
  const tbBlock = tb
    ? `ميزان المراجعة (${tb.periodLabel}):
متوازن؟ ${tb.balanced ? "نعم" : "لا"}
مدين إقفال: ${tb.totalClosingDebit}
دائن إقفال: ${tb.totalClosingCredit}
الفرق: ${tb.difference}
عدد الحسابات المراجعة: ${tb.accountsReviewed}
أكبر الحسابات:
${tb.topAccounts.map((a) => `- ${a.code} ${a.name} [${a.type}] مدين ${a.closingDebit} / دائن ${a.closingCredit}`).join("\n")}
أرصدة طبيعة معكوسة:
${tb.reversedNature.length ? tb.reversedNature.map((a) => `- ${a.code} ${a.name} [${a.type}] مدين ${a.closingDebit} / دائن ${a.closingCredit}`).join("\n") : "(لا يوجد)"}`
    : "لا تتوفر لقطة ميزان.";

  const incomeBlock = income
    ? `قائمة دخل الفترة التقريبية:
إيراد ${income.revenue} · تكلفة ${income.cost} · مجمل ${income.grossProfit} · مصروفات ${income.expenses} · صافي ${income.netProfit}`
    : "";

  const policyBlock = report.policy ? policyPromptBlock(report.policy) : "";
  const officeBlock = report.office && report.policy
    ? extrasPromptBlock(report.office, report.policy)
    : "";
  const coverageBlock = report.coverage ? coveragePromptBlock(report.coverage) : "";

  const opinionBlock = `تقييم المراجع الداخلي المحسوب آلياً (استخدمه كما هو في بند "خاتمة للإدارة"،
لا تخترع رأياً مختلفاً عنه): ${report.opinion.label}
سبب هذا التقييم: ${report.opinion.rationale}`;

  return `${opinionBlock}

${tbBlock}

${incomeBlock}

${policyBlock}

${officeBlock}

${coverageBlock}

ملخص الملاحظات: حرج ${report.summary.critical} · تحذير ${report.summary.warning} · معلومة ${report.summary.info}
إحصائيات: ${JSON.stringify(report.stats)}
الملاحظات التفصيلية:
${lines.join("\n\n")}`;
}
