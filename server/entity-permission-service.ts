/**
 * تنفيذ فعلي للشجرة التفصيلية (shared/permission-tree.ts) — بيتفعّل تدريجيًا شاشة بشاشة.
 *
 * القاعدة المهمة عشان الترقية متكسرش حد شغال حاليًا: لو الدور ده أصلاً معندوش أي صف
 * محفوظ لهذا العنصر بالذات في tenant_entity_permissions (يعني المدير لسه ما فتحش
 * "الصلاحيات التفصيلية" وظبطها له)، بنعتبره "مش متظبط" ومنقيدش حاجة — نسيب القرار
 * للنظام القديم (module × 4 أفعال) زي ما هو دايمًا. بس أول ما المدير يحفظ أي حاجة
 * لعنصر معيّن لدور معيّن، القائمة المحفوظة بتبقى هي المرجع الوحيد لهذا العنصر (أي فعل
 * مش موجود فيها = ممنوع)، حتى لو النظام القديم كان بيسمح بيه.
 */
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { tenantEntityPermissions } from "../drizzle/schema";
import { getDb } from "./db";
import { roleBypassesPermissions } from "./permissions-service";
import { PERM_ACTION_LABELS, type PermActionKey } from "../shared/permission-tree";

type EntityPermCtx = {
  tenantId: number | null | undefined;
  saasUser: { id: number; role: string } | null | undefined;
};

/** null = العنصر ده لسه مش متظبط لهذا الدور — متقيدش، سيب القرار للنظام القديم. */
export async function getEntityAllowedActions(
  tenantId: number,
  role: string,
  moduleKey: string,
  entityKey: string,
): Promise<string[] | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(tenantEntityPermissions)
    .where(
      and(
        eq(tenantEntityPermissions.tenantId, tenantId),
        eq(tenantEntityPermissions.role, role),
        eq(tenantEntityPermissions.moduleKey, moduleKey),
        eq(tenantEntityPermissions.entityKey, entityKey),
      ),
    )
    .limit(1);
  if (!row) return null;
  return (row.allowedActions as string[]) || [];
}

/** يرمي FORBIDDEN لو الدور ظابط العنصر ده صراحة والفعل مش موجود في القائمة المسموحة. */
export async function assertEntityAction(
  ctx: EntityPermCtx,
  moduleKey: string,
  entityKey: string,
  action: PermActionKey,
): Promise<void> {
  if (!ctx.saasUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (roleBypassesPermissions(ctx.saasUser.role)) return;
  if (!ctx.tenantId) return;
  const allowed = await getEntityAllowedActions(ctx.tenantId, ctx.saasUser.role, moduleKey, entityKey);
  if (allowed === null) return; // لسه مش متظبط — سلوك قديم زي ما هو
  if (!allowed.includes(action)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `لا تملك صلاحية "${PERM_ACTION_LABELS[action]}" على هذا العنصر`,
    });
  }
}

/**
 * ربط كل tRPC path متظبط بـ assertEntityAction بالعنصر (أو العناصر المحتملة) بتاعه —
 * يُستخدم في server/permission-middleware.ts عشان "النظام القديم" (قسم × 4 أفعال) يتنحّى
 * تمامًا لما يكون فيه صف محفوظ للعنصر ده صراحة، بدل ما يتصرف كقيد إضافي فوق النظام
 * الجديد ويمنع حاجة الشجرة سامحاها. القرار الفعلي (سماح/منع) يفضل دايمًا لـassertEntityAction
 * جوه الـprocedure نفسها — هنا بس بنقرر هل نشغّل الفحص القديم أصلاً ولا لأ.
 *
 * لو أكتر من عنصر محتمل (زي فاتورة نقدية/آجل من نفس الـendpoint) بنتأكد هل أي واحد فيهم
 * متظبط، وسيب الـprocedure نفسها تحدد بالظبط أنهي واحد ينطبق.
 */
type PathEntityResolution = { moduleKey: string; entityKeys: string[] };

function unwrapRawInput(raw: unknown): any {
  if (raw && typeof raw === "object" && "json" in (raw as any)) return (raw as any).json;
  return raw;
}

const STATIC_PATH_ENTITY: Record<string, PathEntityResolution> = {
  "customers.create": { moduleKey: "contacts", entityKeys: ["customer"] },
  "customers.update": { moduleKey: "contacts", entityKeys: ["customer"] },
  "customers.delete": { moduleKey: "contacts", entityKeys: ["customer"] },
  "suppliers.create": { moduleKey: "contacts", entityKeys: ["supplier"] },
  "suppliers.update": { moduleKey: "contacts", entityKeys: ["supplier"] },
  "suppliers.delete": { moduleKey: "contacts", entityKeys: ["supplier"] },
  "contactCategories.create": { moduleKey: "contacts", entityKeys: ["contactCategories"] },
  "contactCategories.update": { moduleKey: "contacts", entityKeys: ["contactCategories"] },
  "contactCategories.delete": { moduleKey: "contacts", entityKeys: ["contactCategories"] },
  "items.create": { moduleKey: "inventory", entityKeys: ["item"] },
  "items.update": { moduleKey: "inventory", entityKeys: ["item"] },
  "items.delete": { moduleKey: "inventory", entityKeys: ["item"] },
  "items.bulkPurge": { moduleKey: "inventory", entityKeys: ["item"] },
  "items.createCategory": { moduleKey: "inventory", entityKeys: ["itemCategories"] },
  "warehouses.create": { moduleKey: "inventory", entityKeys: ["warehouses"] },
  "warehouses.update": { moduleKey: "inventory", entityKeys: ["warehouses"] },
  "warehouses.delete": { moduleKey: "inventory", entityKeys: ["warehouses"] },
  "inventory.transfers.list": { moduleKey: "inventory", entityKeys: ["stockTransfer"] },
  "inventory.transfers.create": { moduleKey: "inventory", entityKeys: ["stockTransfer"] },
  "inventory.adjustments.list": { moduleKey: "inventory", entityKeys: ["stockAdjustment"] },
  "inventory.adjustments.create": { moduleKey: "inventory", entityKeys: ["stockAdjustment"] },
  "purchases.invoices.list": { moduleKey: "purchases", entityKeys: ["purchaseInvoice"] },
  "purchases.invoices.byId": { moduleKey: "purchases", entityKeys: ["purchaseInvoice"] },
  "purchases.invoices.recordPayment": { moduleKey: "purchases", entityKeys: ["purchaseInvoice"] },
  "purchases.invoices.create": { moduleKey: "purchases", entityKeys: ["purchaseInvoice"] },
  "purchases.orders.list": { moduleKey: "purchases", entityKeys: ["purchaseOrder"] },
  "purchases.orders.byId": { moduleKey: "purchases", entityKeys: ["purchaseOrder"] },
  "purchases.orders.create": { moduleKey: "purchases", entityKeys: ["purchaseOrder"] },
  "purchases.orders.approve": { moduleKey: "purchases", entityKeys: ["purchaseOrder"] },
  "purchases.orders.convertToInvoice": { moduleKey: "purchases", entityKeys: ["purchaseOrder"] },
  "purchases.orders.cancel": { moduleKey: "purchases", entityKeys: ["purchaseOrder"] },
  "purchases.returns.list": { moduleKey: "purchases", entityKeys: ["purchaseReturnInvoice"] },
  "purchases.returns.create": { moduleKey: "purchases", entityKeys: ["purchaseReturnInvoice"] },
  "sales.invoices.byId": { moduleKey: "sales", entityKeys: ["cashSaleInvoice", "saleInvoice"] },
  "sales.invoices.recordPayment": { moduleKey: "sales", entityKeys: ["cashSaleInvoice", "saleInvoice"] },
  "sales.orders.list": { moduleKey: "sales", entityKeys: ["saleOrder"] },
  "sales.orders.byId": { moduleKey: "sales", entityKeys: ["saleOrder"] },
  "sales.orders.create": { moduleKey: "sales", entityKeys: ["saleOrder"] },
  "sales.orders.approve": { moduleKey: "sales", entityKeys: ["saleOrder"] },
  "sales.orders.convertToInvoice": { moduleKey: "sales", entityKeys: ["saleOrder"] },
  "sales.orders.cancel": { moduleKey: "sales", entityKeys: ["saleOrder"] },
  "sales.returns.list": { moduleKey: "sales", entityKeys: ["saleReturnInvoice"] },
  "sales.returns.create": { moduleKey: "sales", entityKeys: ["saleReturnInvoice"] },
  "hr.employees.create": { moduleKey: "hr", entityKeys: ["employees"] },
  "hr.employees.update": { moduleKey: "hr", entityKeys: ["employees"] },
  "hr.employees.delete": { moduleKey: "hr", entityKeys: ["employees"] },
  "hr.departments.create": { moduleKey: "hr", entityKeys: ["departments"] },
  "hr.departments.update": { moduleKey: "hr", entityKeys: ["departments"] },
  "hr.departments.delete": { moduleKey: "hr", entityKeys: ["departments"] },
  "hr.jobTitles.create": { moduleKey: "hr", entityKeys: ["jobs"] },
  "hr.jobTitles.update": { moduleKey: "hr", entityKeys: ["jobs"] },
  "hr.jobTitles.delete": { moduleKey: "hr", entityKeys: ["jobs"] },
  "hr.attendance.create": { moduleKey: "hr", entityKeys: ["attendance"] },
  "hr.attendance.saveDay": { moduleKey: "hr", entityKeys: ["attendance"] },
  "hr.payroll.create": { moduleKey: "hr", entityKeys: ["salaryAccount"] },
  "hr.payroll.payMonth": { moduleKey: "hr", entityKeys: ["salaryAccount"] },
  "accounts.create": { moduleKey: "accounts", entityKeys: ["chartOfAccounts"] },
  "accounts.journal.list": { moduleKey: "accounts", entityKeys: ["journalEntry"] },
  "accounts.journal.byId": { moduleKey: "accounts", entityKeys: ["journalEntry"] },
  "accounts.journal.create": { moduleKey: "accounts", entityKeys: ["journalEntry"] },
  "accounts.taxes.create": { moduleKey: "accounts", entityKeys: ["taxes"] },
  "bank.checks.collect": { moduleKey: "bank", entityKeys: ["checkIn", "checkOut"] },
  "bank.checks.bounce": { moduleKey: "bank", entityKeys: ["checkIn", "checkOut"] },
  "assets.list": { moduleKey: "assets", entityKeys: ["assets"] },
  "assets.create": { moduleKey: "assets", entityKeys: ["assets"] },
  "loans.list": { moduleKey: "loans", entityKeys: ["loan"] },
  "loans.get": { moduleKey: "loans", entityKeys: ["loan"] },
  "loans.create": { moduleKey: "loans", entityKeys: ["loan"] },
  "loans.updateStatus": { moduleKey: "loans", entityKeys: ["loan"] },
  "costCenters.create": { moduleKey: "cost_centers", entityKeys: ["costCenters"] },
  "salesReps.create": { moduleKey: "sales_reps", entityKeys: ["salesReps"] },
  "salesReps.update": { moduleKey: "sales_reps", entityKeys: ["salesReps"] },
  "salesReps.delete": { moduleKey: "sales_reps", entityKeys: ["salesReps"] },
  "settings.company.save": { moduleKey: "settings", entityKeys: ["companySettings"] },
  "settings.branches.create": { moduleKey: "settings", entityKeys: ["branches"] },
  "settings.branches.update": { moduleKey: "settings", entityKeys: ["branches"] },
  "settings.branches.delete": { moduleKey: "settings", entityKeys: ["branches"] },
  "production.list": { moduleKey: "production", entityKeys: ["productionOrder"] },
  "production.get": { moduleKey: "production", entityKeys: ["productionOrder"] },
  "production.create": { moduleKey: "production", entityKeys: ["productionOrder"] },
  "production.update": { moduleKey: "production", entityKeys: ["productionOrder"] },
  "production.delete": { moduleKey: "production", entityKeys: ["productionOrder"] },
  "production.updateStatus": { moduleKey: "production", entityKeys: ["productionOrder"] },
};

const CASH_ENTITY_FOR_TYPE: Record<string, string> = {
  receive: "cashReceipt",
  receive_customer: "cashReceiptFromCustomer",
  pay: "cashPayment",
  pay_supplier: "cashPaymentToSupplier",
  pay_customer: "cashPayment",
};

const BANK_ENTITY_FOR_TYPE: Record<string, string> = {
  deposit: "bankDeposit",
  deposit_customer: "bankDepositFromCustomer",
  withdraw: "bankWithdrawal",
  withdraw_supplier: "bankWithdrawalToSupplier",
  withdraw_customer: "bankWithdrawal",
};

export function resolveEntityKeysForPath(path: string, rawInput: unknown): PathEntityResolution | null {
  const staticHit = STATIC_PATH_ENTITY[path];
  if (staticHit) return staticHit;

  const input = unwrapRawInput(rawInput);

  if (path === "sales.invoices.list" || path === "sales.invoices.create") {
    const key = input?.paymentType === "cash" ? "cashSaleInvoice" : "saleInvoice";
    return { moduleKey: "sales", entityKeys: [key] };
  }
  if (path === "cash.create") {
    const key = CASH_ENTITY_FOR_TYPE[input?.type] || "cashPayment";
    return { moduleKey: "cash", entityKeys: [key] };
  }
  if (path === "bank.transactions.create") {
    const key = BANK_ENTITY_FOR_TYPE[input?.type] || "bankWithdrawal";
    return { moduleKey: "bank", entityKeys: [key] };
  }
  if (path === "bank.checks.create") {
    const key = input?.type === "incoming" ? "checkIn" : "checkOut";
    return { moduleKey: "bank", entityKeys: [key] };
  }
  return null;
}

/**
 * true لو الشجرة التفصيلية متظبطة صراحة لعنصر (أو عناصر) هذا الـpath لهذا الدور —
 * يعني الفحص القديم (قسم × 4 أفعال) لازم يتنحّى ويسيب القرار لـassertEntityAction
 * جوه الـprocedure نفسها.
 */
export async function shouldDeferToEntityTree(
  tenantId: number,
  role: string,
  path: string,
  rawInput: unknown,
): Promise<boolean> {
  const resolution = resolveEntityKeysForPath(path, rawInput);
  if (!resolution) return false;
  for (const entityKey of resolution.entityKeys) {
    const allowed = await getEntityAllowedActions(tenantId, role, resolution.moduleKey, entityKey);
    if (allowed !== null) return true;
  }
  return false;
}
