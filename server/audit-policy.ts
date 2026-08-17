import { eq } from "drizzle-orm";
import type { Db } from "./db";
import { companyAuditPolicies } from "../drizzle/schema";
import { tenantWhere } from "./tenant-scope";

export type AuditPolicy = {
  targetGrossMarginPct: number;
  targetNetMarginPct: number;
  maxArDays: number;
  maxApDays: number;
  minCashReserveEgp: number;
  debtProvisionAfterDays: number;
  debtProvisionRate: number;
  defaultDepreciationRate: number;
  bankVarianceToleranceEgp: number;
  materialityEgp: number;
  notes: string;
};

export function defaultAuditPolicy(): AuditPolicy {
  return {
    targetGrossMarginPct: 25,
    targetNetMarginPct: 10,
    maxArDays: 90,
    maxApDays: 90,
    minCashReserveEgp: 0,
    debtProvisionAfterDays: 120,
    debtProvisionRate: 0.05,
    defaultDepreciationRate: 0.1,
    bankVarianceToleranceEgp: 50,
    materialityEgp: 1000,
    notes: "",
  };
}

function n(v: unknown, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

export function policyFromRow(row: typeof companyAuditPolicies.$inferSelect | null | undefined): AuditPolicy {
  const d = defaultAuditPolicy();
  if (!row) return d;
  return {
    targetGrossMarginPct: n(row.targetGrossMarginPct, d.targetGrossMarginPct),
    targetNetMarginPct: n(row.targetNetMarginPct, d.targetNetMarginPct),
    maxArDays: Math.round(n(row.maxArDays, d.maxArDays)),
    maxApDays: Math.round(n(row.maxApDays, d.maxApDays)),
    minCashReserveEgp: n(row.minCashReserveEgp, d.minCashReserveEgp),
    debtProvisionAfterDays: Math.round(n(row.debtProvisionAfterDays, d.debtProvisionAfterDays)),
    debtProvisionRate: n(row.debtProvisionRate, d.debtProvisionRate),
    defaultDepreciationRate: n(row.defaultDepreciationRate, d.defaultDepreciationRate),
    bankVarianceToleranceEgp: n(row.bankVarianceToleranceEgp, d.bankVarianceToleranceEgp),
    materialityEgp: n(row.materialityEgp, d.materialityEgp),
    notes: row.notes || "",
  };
}

export async function loadAuditPolicy(db: Db, tenantId: number): Promise<AuditPolicy> {
  try {
    const [row] = await db
      .select()
      .from(companyAuditPolicies)
      .where(tenantWhere(companyAuditPolicies, tenantId))
      .limit(1);
    return policyFromRow(row);
  } catch {
    return defaultAuditPolicy();
  }
}

export async function saveAuditPolicy(
  db: Db,
  tenantId: number,
  input: Partial<AuditPolicy>,
): Promise<AuditPolicy> {
  const next = { ...defaultAuditPolicy(), ...input };
  const payload = {
    targetGrossMarginPct: String(next.targetGrossMarginPct),
    targetNetMarginPct: String(next.targetNetMarginPct),
    maxArDays: next.maxArDays,
    maxApDays: next.maxApDays,
    minCashReserveEgp: String(next.minCashReserveEgp),
    debtProvisionAfterDays: next.debtProvisionAfterDays,
    debtProvisionRate: String(next.debtProvisionRate),
    defaultDepreciationRate: String(next.defaultDepreciationRate),
    bankVarianceToleranceEgp: String(next.bankVarianceToleranceEgp),
    materialityEgp: String(next.materialityEgp),
    notes: next.notes || null,
  };

  const [existing] = await db
    .select({ id: companyAuditPolicies.id })
    .from(companyAuditPolicies)
    .where(tenantWhere(companyAuditPolicies, tenantId))
    .limit(1);

  if (existing) {
    await db.update(companyAuditPolicies).set(payload).where(eq(companyAuditPolicies.id, existing.id));
  } else {
    await db.insert(companyAuditPolicies).values({ ...payload, tenantId });
  }
  return next;
}

export function policyPromptBlock(policy: AuditPolicy): string {
  return `سياسة مراجعة الشركة:
- هامش مجمل مستهدف: ${policy.targetGrossMarginPct}%
- هامش صافي مستهدف: ${policy.targetNetMarginPct}%
- أقصى عمر دين عملاء مقبول: ${policy.maxArDays} يوم
- أقصى عمر دين موردين مقبول: ${policy.maxApDays} يوم
- حد سيولة نقدية أدنى: ${policy.minCashReserveEgp} ج
- مخصص ديون بعد: ${policy.debtProvisionAfterDays} يوم بنسبة ${policy.debtProvisionRate * 100}%
- إهلاك افتراضي سنوي: ${policy.defaultDepreciationRate * 100}%
- تحمل فرق بنك: ${policy.bankVarianceToleranceEgp} ج
- الأهمية النسبية (Materiality): ${policy.materialityEgp} ج
- ملاحظات السياسة: ${policy.notes || "—"}`;
}
