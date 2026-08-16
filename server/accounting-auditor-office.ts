/**
 * طبقة مكتب المحاسبة المتقدمة: مطابقات + مقارنة فترات + عينات + ذاكرة تشغيلات.
 */
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import {
  accounts,
  auditReviewRuns,
  bankAccounts,
  bankTransactions,
  cashTransactions,
  customers,
  fixedAssets,
  journalEntries,
  journalEntryLines,
  purchaseInvoices,
  salesInvoices,
} from "../drizzle/schema";
import { incomeStatementFromData } from "./accounting-data";
import type { AuditFinding, AuditSeverity, IncomeSnapshot } from "./accounting-auditor";
import { type AuditPolicy } from "./audit-policy";
import { getDebtAgingSummary } from "./debt-aging";
import { tenantWhere } from "./tenant-scope";

function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function money(v: number) {
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function push(out: AuditFinding[], finding: Omit<AuditFinding, "id"> & { id?: string }) {
  out.push({
    id: finding.id || `${finding.category}-${out.length + 1}`,
    ...finding,
  });
}

function shiftPeriod(from: string, to: string): { dateFrom: string; dateTo: string } {
  const a = new Date(from);
  const b = new Date(to);
  const days = Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1);
  const prevTo = new Date(a);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (days - 1));
  return {
    dateFrom: prevFrom.toISOString().slice(0, 10),
    dateTo: prevTo.toISOString().slice(0, 10),
  };
}

export type PeriodCompareSnapshot = {
  current: IncomeSnapshot & { grossMarginPct: number; netMarginPct: number };
  previous: IncomeSnapshot & { grossMarginPct: number; netMarginPct: number };
  previousLabel: string;
  revenueChangePct: number | null;
  netChangePct: number | null;
};

export type AuditSample = {
  kind: string;
  label: string;
  amount: number;
  meta?: string;
  link?: string;
};

export type OfficeAuditExtras = {
  periodCompare?: PeriodCompareSnapshot;
  samples: AuditSample[];
  previousRun?: {
    generatedAt: string;
    criticalCount: number;
    warningCount: number;
    tbBalanced: boolean;
    recurringTitles: string[];
  } | null;
};

async function bankBookBalance(db: MySql2Database, tenantId: number, bankAccountId: number) {
  const rows = await db
    .select({ type: bankTransactions.type, amount: bankTransactions.amount })
    .from(bankTransactions)
    .where(tenantWhere(bankTransactions, tenantId, eq(bankTransactions.bankAccountId, bankAccountId)));
  let bal = 0;
  for (const r of rows) {
    const amt = n(r.amount);
    if (r.type === "deposit" || r.type === "deposit_customer") bal += amt;
    else bal -= amt;
  }
  return bal;
}

export async function auditBankAndCashReconciliations(
  db: MySql2Database,
  tenantId: number,
  out: AuditFinding[],
  policy: AuditPolicy,
  stats: Record<string, number | string>,
) {
  const banks = await db
    .select()
    .from(bankAccounts)
    .where(tenantWhere(bankAccounts, tenantId, eq(bankAccounts.isActive, true)));

  let totalBankBook = 0;
  let unlinked = 0;

  for (const bank of banks) {
    const book = await bankBookBalance(db, tenantId, bank.id);
    totalBankBook += book;
    const stored = n(bank.balance);
    const variance = Math.abs(book - stored);

    if (!bank.glAccountId) {
      unlinked += 1;
      push(out, {
        severity: "warning",
        category: "مطابقة بنوك",
        title: `بنك غير مربوط بدليل الحسابات: ${bank.name}`,
        detail: "الحساب البنكي التشغيلي بدون glAccountId — المطابقة مع الميزان ضعيفة.",
        recommendation: "اربط البنك بحساب فرعي تحت مجلد البنوك في دليل الحسابات.",
        link: "/accounts/chart",
      });
    } else {
      const [gl] = await db
        .select()
        .from(accounts)
        .where(tenantWhere(accounts, tenantId, eq(accounts.id, bank.glAccountId)))
        .limit(1);
      if (gl) {
        const glBal = n(gl.balance);
        const glVar = Math.abs(Math.abs(glBal) - Math.abs(book));
        if (glVar > policy.bankVarianceToleranceEgp) {
          push(out, {
            severity: glVar >= policy.materialityEgp ? "critical" : "warning",
            category: "مطابقة بنوك",
            title: `فرق بنك ↔ دليل: ${bank.name}`,
            detail: `رصيد حركات البنك ${money(book)} ج · رصيد حساب الدليل ${money(glBal)} ج · الفرق ${money(glVar)} ج (تحمل ${money(policy.bankVarianceToleranceEgp)}).`,
            recommendation: "راجع قيود الإيداع/السحب غير المرحلة أو المزدوجة، وحدّث ربط الحساب إن لزم.",
            link: "/bank/transactions",
          });
        }
      }
    }

    if (variance > policy.bankVarianceToleranceEgp) {
      push(out, {
        severity: variance >= policy.materialityEgp ? "warning" : "info",
        category: "مطابقة بنوك",
        title: `فرق رصيد مخزّن ↔ مجموع الحركات: ${bank.name}`,
        detail: `الرصيد المخزّن ${money(stored)} · مجموع الحركات ${money(book)} · الفرق ${money(variance)}.`,
        recommendation: "أعد احتساب رصيد البنك من الحركات أو صحّح الحركات الناقصة.",
        link: "/bank/transactions",
      });
    }
  }

  stats.bankAccounts = banks.length;
  stats.bankBookTotal = Number(totalBankBook.toFixed(2));
  stats.banksUnlinkedGl = unlinked;

  if (policy.minCashReserveEgp > 0) {
    const cashRows = await db
      .select({ type: cashTransactions.type, amount: cashTransactions.amount })
      .from(cashTransactions)
      .where(tenantWhere(cashTransactions, tenantId));
    let cashNet = 0;
    for (const r of cashRows) {
      const amt = n(r.amount);
      if (r.type === "receive" || r.type === "receive_customer") cashNet += amt;
      else cashNet -= amt;
    }
    const liquidity = totalBankBook + cashNet;
    stats.liquidityApprox = Number(liquidity.toFixed(2));
    if (liquidity < policy.minCashReserveEgp) {
      push(out, {
        severity: "warning",
        category: "سيولة",
        title: "السيولة التقريبية أقل من حد السياسة",
        detail: `سيولة تقريبية ${money(liquidity)} ج أقل من الحد ${money(policy.minCashReserveEgp)} ج.`,
        recommendation: "راجع التحصيلات والمصروفات القادمة وخطة السيولة.",
        link: "/cash/receive",
      });
    }
  }
}

export async function auditReceivablePayableReconciliations(
  db: MySql2Database,
  tenantId: number,
  out: AuditFinding[],
  policy: AuditPolicy,
  stats: Record<string, number | string>,
) {
  const aging = await getDebtAgingSummary(db, tenantId);
  const arOpen = await db
    .select({
      remaining: sql<string>`COALESCE(SUM(${salesInvoices.remaining}),0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(salesInvoices)
    .where(
      tenantWhere(
        salesInvoices,
        tenantId,
        and(
          sql`${salesInvoices.status} IN ('confirmed','partial')`,
          sql`COALESCE(${salesInvoices.remaining},0) > 0`,
        ),
      ),
    );

  const apOpen = await db
    .select({
      remaining: sql<string>`COALESCE(SUM(${purchaseInvoices.remaining}),0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(purchaseInvoices)
    .where(
      tenantWhere(
        purchaseInvoices,
        tenantId,
        and(
          sql`${purchaseInvoices.status} IN ('confirmed','partial')`,
          sql`COALESCE(${purchaseInvoices.remaining},0) > 0`,
        ),
      ),
    );

  const arSum = n(arOpen[0]?.remaining);
  const apSum = n(apOpen[0]?.remaining);
  const arAging = n(aging.customers.total);
  const apAging = n(aging.suppliers.total);
  stats.arOpen = Number(arSum.toFixed(2));
  stats.apOpen = Number(apSum.toFixed(2));
  stats.arAging = Number(arAging.toFixed(2));
  stats.apAging = Number(apAging.toFixed(2));

  const arGap = Math.abs(arSum - arAging);
  const apGap = Math.abs(apSum - apAging);
  if (arGap > policy.bankVarianceToleranceEgp) {
    push(out, {
      severity: arGap >= policy.materialityEgp ? "warning" : "info",
      category: "مطابقة ذمم مدينة",
      title: "فرق بين مجموع متبقي الفواتير وأعمار الديون",
      detail: `متبقي فواتير ${money(arSum)} · أعمار ${money(arAging)} · فرق ${money(arGap)}.`,
      recommendation: "راجع تواريخ الاستحقاق وحالات الفواتير غير المتسقة.",
      link: "/contacts/statement?type=customer",
    });
  }
  if (apGap > policy.bankVarianceToleranceEgp) {
    push(out, {
      severity: apGap >= policy.materialityEgp ? "warning" : "info",
      category: "مطابقة ذمم دائنة",
      title: "فرق بين متبقي المشتريات وأعمار التزامات الموردين",
      detail: `متبقي فواتير ${money(apSum)} · أعمار ${money(apAging)} · فرق ${money(apGap)}.`,
      recommendation: "راجع فواتير الشراء المفتوحة وتواريخها.",
      link: "/contacts/statement?type=vendor",
    });
  }

  for (const row of aging.topOverdueCustomers.slice(0, 8)) {
    if (row.days > policy.maxArDays) {
      push(out, {
        severity: row.days >= policy.debtProvisionAfterDays ? "critical" : "warning",
        category: "ذمم مدينة",
        title: `تجاوز سياسة التحصيل: ${row.customerName}`,
        detail: `فاتورة ${row.invoiceNumber} متأخرة ${row.days} يوم · متبقي ${money(row.remaining)} (حد السياسة ${policy.maxArDays} يوم).`,
        recommendation:
          row.days >= policy.debtProvisionAfterDays
            ? `ادرس مخصص ديون (~${money(row.remaining * policy.debtProvisionRate)}) وخطة تحصيل عاجلة.`
            : "فعّل متابعة تحصيل وخفض البيع الآجل لهذا العميل.",
        link: `/sales/invoices/${row.invoiceId}`,
      });
    }
  }

  for (const row of aging.topOverdueSuppliers.slice(0, 8)) {
    if (row.days > policy.maxApDays) {
      push(out, {
        severity: "warning",
        category: "ذمم دائنة",
        title: `تجاوز سياسة السداد: ${row.supplierName}`,
        detail: `فاتورة ${row.invoiceNumber} متأخرة ${row.days} يوم · متبقي ${money(row.remaining)} (حد ${policy.maxApDays}).`,
        recommendation: "رتّب جدول سداد أو تفاوض جدولة مع المورد.",
        link: `/purchases/invoices/${row.invoiceId}`,
      });
    }
  }

  // overpayments / credit balances on invoices
  const overpaidSales = await db
    .select({
      id: salesInvoices.id,
      number: salesInvoices.number,
      customerName: customers.name,
      remaining: salesInvoices.remaining,
    })
    .from(salesInvoices)
    .leftJoin(customers, eq(salesInvoices.customerId, customers.id))
    .where(tenantWhere(salesInvoices, tenantId, sql`COALESCE(${salesInvoices.remaining},0) < -0.05`))
    .limit(10);

  for (const row of overpaidSales) {
    push(out, {
      severity: "warning",
      category: "مطابقة ذمم مدينة",
      title: `رصيد دائن/زيادة سداد: ${row.number}`,
      detail: `عميل ${row.customerName || "—"} · متبقي ${money(n(row.remaining))} (سالب).`,
      recommendation: "راجع تخصيص التحصيل أو اعتبره دفعة مقدمة/تسوية.",
      link: `/sales/invoices/${row.id}`,
    });
  }
}

export async function auditPeriodComparison(
  db: MySql2Database,
  tenantId: number,
  current: { dateFrom: string; dateTo: string },
  income: IncomeSnapshot,
  out: AuditFinding[],
  policy: AuditPolicy,
  stats: Record<string, number | string>,
): Promise<PeriodCompareSnapshot> {
  const prev = shiftPeriod(current.dateFrom, current.dateTo);
  const previousIncome = await incomeStatementFromData(db as any, {
    tenantId,
    dateFrom: prev.dateFrom,
    dateTo: prev.dateTo,
  });

  const margin = (gp: number, rev: number) => (rev > 0 ? (gp / rev) * 100 : 0);
  const netM = (np: number, rev: number) => (rev > 0 ? (np / rev) * 100 : 0);

  const currentSnap = {
    ...income,
    grossMarginPct: margin(income.grossProfit, income.revenue),
    netMarginPct: netM(income.netProfit, income.revenue),
  };
  const previousSnap = {
    revenue: n(previousIncome.revenue),
    cost: n(previousIncome.cost),
    grossProfit: n(previousIncome.grossProfit),
    expenses: n(previousIncome.expenses),
    netProfit: n(previousIncome.netProfit),
    grossMarginPct: margin(n(previousIncome.grossProfit), n(previousIncome.revenue)),
    netMarginPct: netM(n(previousIncome.netProfit), n(previousIncome.revenue)),
  };

  const revenueChangePct =
    previousSnap.revenue > 0 ? ((currentSnap.revenue - previousSnap.revenue) / previousSnap.revenue) * 100 : null;
  const netChangePct =
    previousSnap.netProfit !== 0
      ? ((currentSnap.netProfit - previousSnap.netProfit) / Math.abs(previousSnap.netProfit)) * 100
      : null;

  stats.grossMarginPct = Number(currentSnap.grossMarginPct.toFixed(2));
  stats.netMarginPct = Number(currentSnap.netMarginPct.toFixed(2));
  if (revenueChangePct != null) stats.revenueChangePct = Number(revenueChangePct.toFixed(2));

  if (currentSnap.revenue > 0 && currentSnap.grossMarginPct + 0.5 < policy.targetGrossMarginPct) {
    push(out, {
      severity: "warning",
      category: "مقارنة فترات / سياسة",
      title: "هامش مجمل أقل من هدف الشركة",
      detail: `الهامش الحالي ${currentSnap.grossMarginPct.toFixed(1)}% مقابل هدف ${policy.targetGrossMarginPct}%.`,
      recommendation: "راجع أسعار البيع وتكلفة المشتريات/الشحن والخصومات.",
      link: "/reports/final/finalreports-incomestatment",
    });
  }

  if (currentSnap.revenue > 0 && currentSnap.netMarginPct + 0.5 < policy.targetNetMarginPct) {
    push(out, {
      severity: "warning",
      category: "مقارنة فترات / سياسة",
      title: "هامش صافي أقل من هدف الشركة",
      detail: `الصافي ${currentSnap.netMarginPct.toFixed(1)}% مقابل هدف ${policy.targetNetMarginPct}%.`,
      recommendation: "راجع المصروفات التشغيلية والبنود غير المتكررة في الفترة.",
      link: "/reports/final/finalreports-incomestatment",
    });
  }

  if (revenueChangePct != null && revenueChangePct <= -20 && currentSnap.revenue >= policy.materialityEgp) {
    push(out, {
      severity: "warning",
      category: "مقارنة فترات",
      title: "انخفاض إيراد ملحوظ عن الفترة السابقة",
      detail: `التغير ${revenueChangePct.toFixed(1)}% · الحالي ${money(currentSnap.revenue)} · السابق ${money(previousSnap.revenue)} (${prev.dateFrom}→${prev.dateTo}).`,
      recommendation: "فسّر موسمياً أو تشغيلياً؛ راجع تأخر ترحيل فواتير أو تراجع المبيعات.",
      link: "/sales/invoices",
    });
  }

  if (netChangePct != null && netChangePct <= -30 && Math.abs(currentSnap.netProfit) >= policy.materialityEgp) {
    push(out, {
      severity: "warning",
      category: "مقارنة فترات",
      title: "تدهور صافي النتيجة مقابل الفترة السابقة",
      detail: `التغير ${netChangePct.toFixed(1)}% · صافي حالي ${money(currentSnap.netProfit)} · سابق ${money(previousSnap.netProfit)}.`,
      recommendation: "حلّل بنود التكلفة والمصروف الأكبر أثراً بين الفترتين.",
      link: "/reports/final/finalreports-incomestatment",
    });
  }

  return {
    current: currentSnap,
    previous: previousSnap,
    previousLabel: `${prev.dateFrom} → ${prev.dateTo}`,
    revenueChangePct,
    netChangePct,
  };
}

export async function collectAuditSamples(
  db: MySql2Database,
  tenantId: number,
  period: { dateFrom: string; dateTo: string },
  out: AuditFinding[],
  policy: AuditPolicy,
): Promise<AuditSample[]> {
  const samples: AuditSample[] = [];

  const bigJournals = await db
    .select({
      id: journalEntries.id,
      number: journalEntries.number,
      date: journalEntries.date,
      description: journalEntries.description,
      amount: sql<string>`GREATEST(COALESCE(SUM(${journalEntryLines.debit}),0), COALESCE(SUM(${journalEntryLines.credit}),0))`,
    })
    .from(journalEntries)
    .leftJoin(
      journalEntryLines,
      and(eq(journalEntryLines.entryId, journalEntries.id), eq(journalEntryLines.tenantId, journalEntries.tenantId)),
    )
    .where(
      tenantWhere(
        journalEntries,
        tenantId,
        and(
          eq(journalEntries.status, "posted"),
          gte(journalEntries.date, period.dateFrom as any),
          lte(journalEntries.date, period.dateTo as any),
        ),
      ),
    )
    .groupBy(journalEntries.id, journalEntries.number, journalEntries.date, journalEntries.description)
    .orderBy(sql`GREATEST(COALESCE(SUM(${journalEntryLines.debit}),0), COALESCE(SUM(${journalEntryLines.credit}),0)) DESC`)
    .limit(12);

  for (const row of bigJournals) {
    const amount = n(row.amount);
    samples.push({
      kind: "journal",
      label: `قيد ${row.number}`,
      amount,
      meta: `${String(row.date).slice(0, 10)} · ${row.description || "بدون بيان"}`,
      link: `/accounts/journal/${row.id}`,
    });
    if (amount >= policy.materialityEgp * 5) {
      push(out, {
        severity: "info",
        category: "عينة مراجعة",
        title: `قيد جوهري للمراجعة: ${row.number}`,
        detail: `مبلغ ${money(amount)} ج بتاريخ ${String(row.date).slice(0, 10)} — ضمن أكبر القيود في الفترة.`,
        recommendation: "راجع المستند الداعم والبيان والحسابات المستخدمة كعينة مراجعة رسمية.",
        link: `/accounts/journal/${row.id}`,
      });
    }
  }

  const topCustomers = await db
    .select({
      customerId: customers.id,
      customerName: customers.name,
      remaining: sql<string>`COALESCE(SUM(${salesInvoices.remaining}),0)`,
    })
    .from(salesInvoices)
    .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
    .where(
      tenantWhere(
        salesInvoices,
        tenantId,
        and(sql`${salesInvoices.status} IN ('confirmed','partial')`, sql`COALESCE(${salesInvoices.remaining},0) > 0`),
      ),
    )
    .groupBy(customers.id, customers.name)
    .orderBy(sql`COALESCE(SUM(${salesInvoices.remaining}),0) DESC`)
    .limit(8);

  for (const row of topCustomers) {
    samples.push({
      kind: "ar",
      label: row.customerName,
      amount: n(row.remaining),
      meta: "أعلى ذمم مدينة",
      link: "/contacts/statement?type=customer",
    });
  }

  const topBankTx = await db
    .select({
      id: bankTransactions.id,
      number: bankTransactions.number,
      type: bankTransactions.type,
      amount: bankTransactions.amount,
      date: bankTransactions.date,
      description: bankTransactions.description,
    })
    .from(bankTransactions)
    .where(
      tenantWhere(
        bankTransactions,
        tenantId,
        and(gte(bankTransactions.date, period.dateFrom as any), lte(bankTransactions.date, period.dateTo as any)),
      ),
    )
    .orderBy(sql`ABS(${bankTransactions.amount}) DESC`)
    .limit(8);

  for (const row of topBankTx) {
    samples.push({
      kind: "bank",
      label: `${row.number} (${row.type})`,
      amount: n(row.amount),
      meta: `${String(row.date).slice(0, 10)} · ${row.description || "—"}`,
      link: "/bank/transactions",
    });
  }

  // assets without depreciation rate vs policy
  try {
    const assets = await db
      .select()
      .from(fixedAssets)
      .where(tenantWhere(fixedAssets, tenantId, eq(fixedAssets.status, "active")))
      .limit(50);
    const missingRate = assets.filter((a) => n(a.depreciationRate) <= 0);
    if (missingRate.length) {
      push(out, {
        severity: "info",
        category: "أصول ثابتة",
        title: `${missingRate.length} أصل بدون نسبة إهلاك`,
        detail: `سياسة الشركة الافتراضية ${policy.defaultDepreciationRate * 100}% سنوياً — الأصول بدون نسبة تحتاج ضبطاً قبل الإقفال.`,
        recommendation: "حدّث نسب الإهلاك من شاشة الأصول أو اعتمد النسبة الافتراضية للسياسة.",
        link: "/assets",
      });
    }
  } catch {
    /* optional */
  }

  return samples;
}

export async function loadPreviousAuditMemory(
  db: MySql2Database,
  tenantId: number,
  currentTitles: string[],
): Promise<OfficeAuditExtras["previousRun"]> {
  try {
    const [prev] = await db
      .select()
      .from(auditReviewRuns)
      .where(tenantWhere(auditReviewRuns, tenantId))
      .orderBy(desc(auditReviewRuns.id))
      .limit(1);
    if (!prev) return null;
    let prevFindings: Array<{ title?: string }> = [];
    try {
      prevFindings = JSON.parse(prev.findingsJson || "[]");
    } catch {
      prevFindings = [];
    }
    const prevTitles = new Set(prevFindings.map((f) => String(f.title || "")).filter(Boolean));
    const recurringTitles = currentTitles.filter((t) => prevTitles.has(t)).slice(0, 12);
    return {
      generatedAt: String(prev.generatedAt),
      criticalCount: n(prev.criticalCount),
      warningCount: n(prev.warningCount),
      tbBalanced: Boolean(prev.tbBalanced),
      recurringTitles,
    };
  } catch {
    return null;
  }
}

export async function persistAuditRun(
  db: MySql2Database,
  tenantId: number,
  report: {
    summary: { critical: number; warning: number; info: number };
    trialBalance?: { balanced: boolean; difference: number };
    findings: Array<{ title: string; severity: AuditSeverity; category: string }>;
  },
  userId?: number,
) {
  try {
    await db.insert(auditReviewRuns).values({
      tenantId,
      criticalCount: report.summary.critical,
      warningCount: report.summary.warning,
      infoCount: report.summary.info,
      tbBalanced: report.trialBalance?.balanced ?? false,
      tbDifference: String(report.trialBalance?.difference ?? 0),
      summaryJson: JSON.stringify(report.summary),
      findingsJson: JSON.stringify(
        report.findings.slice(0, 80).map((f) => ({
          title: f.title,
          severity: f.severity,
          category: f.category,
        })),
      ),
      createdBy: userId || null,
    });
  } catch {
    /* table may not exist yet before migrate */
  }
}

export function extrasPromptBlock(extras: OfficeAuditExtras, policy: AuditPolicy): string {
  const pc = extras.periodCompare;
  const periodBlock = pc
    ? `مقارنة الفترات:
الحالي: إيراد ${pc.current.revenue} · مجمل% ${pc.current.grossMarginPct.toFixed(1)} · صافي% ${pc.current.netMarginPct.toFixed(1)} · صافي ${pc.current.netProfit}
السابق (${pc.previousLabel}): إيراد ${pc.previous.revenue} · مجمل% ${pc.previous.grossMarginPct.toFixed(1)} · صافي% ${pc.previous.netMarginPct.toFixed(1)} · صافي ${pc.previous.netProfit}
تغير الإيراد%: ${pc.revenueChangePct?.toFixed(1) ?? "—"} · تغير الصافي%: ${pc.netChangePct?.toFixed(1) ?? "—"}
هدف الهامش المجمل ${policy.targetGrossMarginPct}% · هدف الصافي ${policy.targetNetMarginPct}%`
    : "";

  const samples = extras.samples.slice(0, 20).map((s, i) =>
    `${i + 1}) [${s.kind}] ${s.label} · ${s.amount} · ${s.meta || ""} · ${s.link || ""}`
  ).join("\n");

  const mem = extras.previousRun
    ? `المراجعة السابقة (${extras.previousRun.generatedAt}): حرج ${extras.previousRun.criticalCount} / تحذير ${extras.previousRun.warningCount} · ميزان ${extras.previousRun.tbBalanced ? "متوازن" : "غير متوازن"}
ملاحظات متكررة لم تُغلق:
${extras.previousRun.recurringTitles.length ? extras.previousRun.recurringTitles.map((t) => `- ${t}`).join("\n") : "(لا تكرار واضح)"}`
    : "لا توجد مراجعة سابقة محفوظة.";

  return `${periodBlock}

عينات مراجعة جوهرية:
${samples || "(لا عينات)"}

${mem}`;
}
