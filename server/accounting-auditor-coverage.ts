/**
 * تغطية الفجوات المتبقية: مسار مستند، إقفال موجّه، توقعات سيولة، كشوف مرفوعة.
 */
import { and, count, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import type { Db } from "./db";
import {
  bankTransactions,
  cashTransactions,
  checks,
  fiscalYears,
  fixedAssets,
  installments,
  journalEntries,
  purchaseInvoices,
  salesInvoices,
} from "../drizzle/schema";
import type { AuditFinding } from "./accounting-auditor";
import type { AuditPolicy } from "./audit-policy";
import { auditUploadedBankStatements } from "./bank-statement-reconcile";
import { auditUploadedPartyStatements } from "./party-statement-reconcile";
import { auditDocumentAttachments } from "./document-attachments";
import { getFiscalYearCloseReadiness } from "./fiscal-year-closing";
import { tenantWhere } from "./tenant-scope";

function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function money(v: number) {
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function push(out: AuditFinding[], finding: Omit<AuditFinding, "id"> & { id?: string }) {
  out.push({ id: finding.id || `${finding.category}-${out.length + 1}`, ...finding });
}

function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export type ClosingChecklistItem = {
  key: string;
  label: string;
  status: "ok" | "warn" | "block";
  detail: string;
  link?: string;
};

export type LiquidityForecast = {
  asOf: string;
  inflow30: number;
  inflow60: number;
  inflow90: number;
  outflow30: number;
  outflow60: number;
  outflow90: number;
  net30: number;
  net60: number;
  net90: number;
  notes: string[];
};

export type CoverageExtras = {
  closingChecklist: ClosingChecklistItem[];
  liquidity: LiquidityForecast;
};

export async function auditDocumentTrail(
  db: Db,
  tenantId: number,
  out: AuditFinding[],
) {
  // Confirmed sales without remaining/paid consistency already covered.
  // Trail: confirmed credit sales with zero paid and very old — collection trail break.
  // Payments without party linkage
  const orphanCash = await db
    .select({ count: count() })
    .from(cashTransactions)
    .where(
      tenantWhere(
        cashTransactions,
        tenantId,
        and(
          or(eq(cashTransactions.type, "receive_customer"), eq(cashTransactions.type, "pay_supplier")),
          sql`(${cashTransactions.customerId} IS NULL AND ${cashTransactions.supplierId} IS NULL)`,
        ),
      ),
    );
  if (n(orphanCash[0]?.count) > 0) {
    push(out, {
      severity: "warning",
      category: "مسار مستند",
      title: `${orphanCash[0].count} حركة نقدية بدون ربط عميل/مورد`,
      detail: "تحصيل/سداد مرتبط بنوع طرف لكن بدون معرف الطرف — يضعف مسار المستند وكشف الحساب.",
      recommendation: "عدّل الحركات واربطها بالعميل/المورد الصحيح.",
      link: "/cash/receive",
    });
  }

  const orphanBank = await db
    .select({ count: count() })
    .from(bankTransactions)
    .where(
      tenantWhere(
        bankTransactions,
        tenantId,
        and(
          or(eq(bankTransactions.type, "deposit_customer"), eq(bankTransactions.type, "withdraw_supplier")),
          sql`(${bankTransactions.customerId} IS NULL AND ${bankTransactions.supplierId} IS NULL)`,
        ),
      ),
    );
  if (n(orphanBank[0]?.count) > 0) {
    push(out, {
      severity: "warning",
      category: "مسار مستند",
      title: `${orphanBank[0].count} حركة بنكية بدون ربط طرف`,
      detail: "إيداع عميل/سحب مورد بدون معرف — المطابقة وكشف الحساب يتأثران.",
      recommendation: "أكمل ربط الطرف على الحركة البنكية.",
      link: "/bank/transactions",
    });
  }

  // Confirmed invoices with total>0 but no journal reference heuristic: count drafts vs posted journals low
  const [confirmedSales] = await db
    .select({ count: count() })
    .from(salesInvoices)
    .where(tenantWhere(salesInvoices, tenantId, sql`${salesInvoices.status} IN ('confirmed','partial','paid')`));
  const [postedJ] = await db
    .select({ count: count() })
    .from(journalEntries)
    .where(tenantWhere(journalEntries, tenantId, eq(journalEntries.status, "posted")));

  if (n(confirmedSales.count) >= 5 && n(postedJ.count) === 0) {
    push(out, {
      severity: "critical",
      category: "مسار مستند",
      title: "فواتير معتمدة بدون أي قيود مرحّلة",
      detail: `فواتير بيع معتمدة/جزئية/مدفوعة: ${confirmedSales.count} بينما القيود المرحلة = 0.`,
      recommendation: "تحقق من الترحيل التلقائي عند الاعتماد أو أنشئ القيود يدوياً ثم أعد الميزان.",
      link: "/accounts/journal",
    });
  }
}

export async function buildClosingChecklist(
  db: Db,
  tenantId: number,
  out: AuditFinding[],
  policy: AuditPolicy,
): Promise<ClosingChecklistItem[]> {
  const items: ClosingChecklistItem[] = [];
  const [fy] = await db
    .select()
    .from(fiscalYears)
    .where(tenantWhere(fiscalYears, tenantId, eq(fiscalYears.status, "open")))
    .orderBy(desc(fiscalYears.startDate))
    .limit(1);

  if (!fy) {
    items.push({
      key: "fy",
      label: "سنة مالية مفتوحة",
      status: "warn",
      detail: "لا توجد سنة مالية مفتوحة — حدّدها من الإعدادات.",
      link: "/settings/fiscal-years",
    });
    push(out, {
      severity: "warning",
      category: "إقفال",
      title: "لا توجد سنة مالية مفتوحة",
      detail: "الإقفال الموجّه يحتاج سنة مالية مفتوحة.",
      recommendation: "أنشئ/افتح سنة مالية من الإعدادات.",
      link: "/settings/fiscal-years",
    });
    return items;
  }

  const readiness = await getFiscalYearCloseReadiness(db, tenantId, {
    id: fy.id,
    name: fy.name,
    startDate: String(fy.startDate).slice(0, 10),
    endDate: String(fy.endDate).slice(0, 10),
    status: fy.status,
  });

  items.push({
    key: "trial",
    label: "ميزان المراجعة متوازن",
    status: readiness.trialBalanced ? "ok" : "block",
    detail: readiness.trialBalanced
      ? `متوازن · مدين ${money(readiness.totalDebit)} / دائن ${money(readiness.totalCredit)}`
      : `غير متوازن · مدين ${money(readiness.totalDebit)} / دائن ${money(readiness.totalCredit)}`,
    link: "/reports/final/finalreports-trialbalance",
  });

  for (const w of readiness.warnings) {
    items.push({
      key: w.key,
      label: w.label,
      status: w.severity === "error" ? "block" : "warn",
      detail: `العدد: ${w.count}`,
      link: w.key.includes("check") ? "/bank/checks?type=in" : w.key.includes("journal") ? "/accounts/journal" : "/pending-docs",
    });
  }

  const assets = await db
    .select()
    .from(fixedAssets)
    .where(tenantWhere(fixedAssets, tenantId, eq(fixedAssets.status, "active")))
    .limit(100);
  const needDep = assets.filter((a) => n(a.depreciationRate) <= 0 || n(a.purchasePrice) <= 0);
  items.push({
    key: "depr",
    label: "جاهزية إهلاك الأصول",
    status: needDep.length ? "warn" : assets.length ? "ok" : "warn",
    detail: assets.length
      ? needDep.length
        ? `${needDep.length} أصل ينقصه سعر شراء أو نسبة إهلاك (افتراضي السياسة ${policy.defaultDepreciationRate * 100}%)`
        : `${assets.length} أصل نشط جاهز لحساب الإهلاك`
      : "لا توجد أصول نشطة",
    link: "/assets",
  });

  if (!readiness.trialBalanced) {
    push(out, {
      severity: "critical",
      category: "إقفال",
      title: "الإقفال محجوب: الميزان غير متوازن",
      detail: readiness.fiscalYearName,
      recommendation: "أصلح القيود غير المتوازنة قبل أي إقفال شهري/سنوي.",
      link: "/reports/final/finalreports-trialbalance",
    });
  }

  items.push({
    key: "close_journal",
    label: "قيد إقفال السنة",
    status: readiness.closingJournalExists ? "ok" : "warn",
    detail: readiness.closingJournalExists ? "يوجد قيد إقفال مرجعي" : "لم يُنشأ قيد إقفال بعد",
    link: "/accounts/journal",
  });

  return items;
}

export async function buildLiquidityForecast(
  db: Db,
  tenantId: number,
  out: AuditFinding[],
  policy: AuditPolicy,
): Promise<LiquidityForecast> {
  const asOf = new Date().toISOString().slice(0, 10);
  const d30 = addDays(asOf, 30);
  const d60 = addDays(asOf, 60);
  const d90 = addDays(asOf, 90);

  const openSales = await db
    .select({
      remaining: salesInvoices.remaining,
      dueDate: salesInvoices.dueDate,
      date: salesInvoices.date,
    })
    .from(salesInvoices)
    .where(
      tenantWhere(
        salesInvoices,
        tenantId,
        and(sql`${salesInvoices.status} IN ('confirmed','partial')`, sql`COALESCE(${salesInvoices.remaining},0) > 0`),
      ),
    );

  const openPurchases = await db
    .select({
      remaining: purchaseInvoices.remaining,
      dueDate: purchaseInvoices.dueDate,
      date: purchaseInvoices.date,
    })
    .from(purchaseInvoices)
    .where(
      tenantWhere(
        purchaseInvoices,
        tenantId,
        and(sql`${purchaseInvoices.status} IN ('confirmed','partial')`, sql`COALESCE(${purchaseInvoices.remaining},0) > 0`),
      ),
    );

  const pendingInstallments = await db
    .select({
      amount: installments.amount,
      paidAmount: installments.paidAmount,
      dueDate: installments.dueDate,
    })
    .from(installments)
    .where(
      tenantWhere(
        installments,
        tenantId,
        or(eq(installments.status, "pending"), eq(installments.status, "overdue")),
      ),
    );

  const pendingChecks = await db
    .select({
      amount: checks.amount,
      dueDate: checks.dueDate,
      type: checks.type,
    })
    .from(checks)
    .where(tenantWhere(checks, tenantId, eq(checks.status, "pending")));

  const bucket = (due: string | null | undefined, fallbackDate: string | null | undefined) => {
    const d = String(due || fallbackDate || asOf).slice(0, 10);
    if (d <= d30) return 30;
    if (d <= d60) return 60;
    if (d <= d90) return 90;
    return 0;
  };

  let inflow30 = 0, inflow60 = 0, inflow90 = 0;
  let outflow30 = 0, outflow60 = 0, outflow90 = 0;

  for (const r of openSales) {
    const amt = n(r.remaining);
    const b = bucket(r.dueDate as any, r.date as any);
    if (b === 30) inflow30 += amt;
    else if (b === 60) inflow60 += amt;
    else if (b === 90) inflow90 += amt;
  }
  for (const r of openPurchases) {
    const amt = n(r.remaining);
    const b = bucket(r.dueDate as any, r.date as any);
    if (b === 30) outflow30 += amt;
    else if (b === 60) outflow60 += amt;
    else if (b === 90) outflow90 += amt;
  }
  for (const r of pendingInstallments) {
    const amt = Math.max(0, n(r.amount) - n(r.paidAmount));
    const b = bucket(r.dueDate as any, asOf);
    if (b === 30) outflow30 += amt;
    else if (b === 60) outflow60 += amt;
    else if (b === 90) outflow90 += amt;
  }
  for (const r of pendingChecks) {
    const amt = n(r.amount);
    const b = bucket(r.dueDate as any, asOf);
    if (r.type === "incoming") {
      if (b === 30) inflow30 += amt;
      else if (b === 60) inflow60 += amt;
      else if (b === 90) inflow90 += amt;
    } else {
      if (b === 30) outflow30 += amt;
      else if (b === 60) outflow60 += amt;
      else if (b === 90) outflow90 += amt;
    }
  }

  // cumulative nets
  const net30 = inflow30 - outflow30;
  const net60 = (inflow30 + inflow60) - (outflow30 + outflow60);
  const net90 = (inflow30 + inflow60 + inflow90) - (outflow30 + outflow60 + outflow90);

  const notes: string[] = [
    "التوقع يعتمد على متبقي الفواتير والشيكات والأقساط حسب تاريخ الاستحقاق.",
    "لا يشمل مبيعات/مشتريات مستقبلية غير مسجّلة.",
  ];

  // خطر السيولة "حسب السياسة": صافي التدفق المتوقع لـ30 يوم نزيف يتجاوز حجم حد السيولة الأدنى
  // نفسه اللي حدّده المستخدم — يعني الاحتياطي المطلوب لن يكفي لو تحقق هذا التوقع فعلاً.
  if (policy.minCashReserveEgp > 0 && net30 < 0 && Math.abs(net30) >= policy.minCashReserveEgp) {
    push(out, {
      severity: "warning",
      category: "سيولة متوقعة",
      title: "ضغط سيولة متوقع خلال 30 يوم",
      detail: `صافي متوقع 30 يوم: ${money(net30)} ج (تدفق داخل ${money(inflow30)} − خارج ${money(outflow30)}) — يتجاوز حد السيولة الأدنى بالسياسة (${money(policy.minCashReserveEgp)} ج).`,
      recommendation: "عجّل التحصيل أو أجّل مدفوعات غير حرجة، وراجع حد السيولة في السياسة.",
      link: "/sales/invoices",
    });
  } else if (net30 < -policy.materialityEgp) {
    push(out, {
      severity: "warning",
      category: "سيولة متوقعة",
      title: "صافي تدفق سالب خلال 30 يوم",
      detail: `صافي ${money(net30)} ج.`,
      recommendation: "ضع خطة تحصيل/تمويل قصيرة الأجل.",
      link: "/cash/receive",
    });
  }

  return {
    asOf,
    inflow30,
    inflow60,
    inflow90,
    outflow30,
    outflow60,
    outflow90,
    net30,
    net60,
    net90,
    notes,
  };
}

export async function runCoverageAudits(
  db: Db,
  tenantId: number,
  out: AuditFinding[],
  policy: AuditPolicy,
): Promise<CoverageExtras> {
  await auditDocumentTrail(db, tenantId, out);
  await auditUploadedBankStatements(db, tenantId, out, policy.materialityEgp);
  await auditUploadedPartyStatements(db, tenantId, out, policy.materialityEgp);
  await auditDocumentAttachments(db, tenantId, out, { materialityEgp: policy.materialityEgp });
  const closingChecklist = await buildClosingChecklist(db, tenantId, out, policy);
  const liquidity = await buildLiquidityForecast(db, tenantId, out, policy);
  return { closingChecklist, liquidity };
}

export function coveragePromptBlock(coverage: CoverageExtras): string {
  const close = coverage.closingChecklist
    .map((c) => `- [${c.status}] ${c.label}: ${c.detail}`)
    .join("\n");
  const l = coverage.liquidity;
  return `إقفال موجّه:
${close}

توقعات السيولة (من ${l.asOf}):
30 يوم: داخل ${l.inflow30} / خارج ${l.outflow30} / صافي ${l.net30}
60 يوم تراكمي: صافي ${l.net60}
90 يوم تراكمي: صافي ${l.net90}
ملاحظات: ${l.notes.join(" | ")}`;
}
