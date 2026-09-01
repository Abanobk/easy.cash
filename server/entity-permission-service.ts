/**
 * تنفيذ فعلي للشجرة التفصيلية (shared/permission-tree.ts) — بيتفعّل تدريجيًا شاشة بشاشة.
 *
 * القاعدة المهمة عشان الترقية متكسرش حد شغال حاليًا: لو الدور ده أصلاً معندوش أي صف
 * محفوظ في القسم ده خالص (ولا عنصر واحد جواه) في tenant_entity_permissions، بنعتبر
 * القسم كله "مش متظبط" ومنقيدش حاجة — نسيب القرار للنظام القديم (module × 4 أفعال)
 * زي ما هو دايمًا. لكن أول ما المدير يظبط عنصر واحد جوه قسم معيّن لدور معيّن، أي عنصر
 * تاني جواه القسم ده محدش لمسه يتقفل افتراضيًا بدل ما يفضل مفتوح (نفس القاعدة اللي
 * القائمة الجانبية شغالة بيها فعلاً) — يعني القرار مش بس "هل العنصر ده بالذات متظبط"
 * لوحده، لازم كمان "هل القسم ده كله متحكم فيه بالتفصيل". راجع isModuleTouchedForRole.
 *
 * استثناء واحد: موديولات إضافية خاصة بينا (CORE_MIGRATION_EXEMPT_MODULES — أدوات
 * الذكاء الاصطناعي وتكليف شحنة) بتتقفل هي نفسها افتراضيًا (مش تفضل مفتوحة) أول ما
 * الدور يبقى متحكم فيه بالتفصيل من أي قسم أساسي واحد على الأقل — راجع isRoleCoreMigrated.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, notInArray } from "drizzle-orm";
import { tenantEntityPermissions } from "../drizzle/schema";
import { getDb } from "./db";
import { roleBypassesPermissions } from "./permissions-service";
import { PERM_ACTION_LABELS, CORE_MIGRATION_EXEMPT_MODULES, type PermActionKey } from "../shared/permission-tree";

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

/**
 * true لو الدور متحكم فيه بالتفصيل فعلاً — عنده صف واحد على الأقل في قسم "أساسي"
 * (مش أدوات الذكاء الاصطناعي/تكليف شحنة — CORE_MIGRATION_EXEMPT_MODULES). بيستخدمها
 * assertEntityAction عشان يقرر هل موديول إضافي محدش فتحله فيه حاجة يتقفل افتراضيًا
 * (الدور ده أصلاً بييتحكم فيه بالتفصيل) ولا يفضل مفتوح (الدور بريء تمامًا لسه).
 */
export async function isRoleCoreMigrated(tenantId: number, role: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [row] = await db
    .select({ id: tenantEntityPermissions.id })
    .from(tenantEntityPermissions)
    .where(
      and(
        eq(tenantEntityPermissions.tenantId, tenantId),
        eq(tenantEntityPermissions.role, role),
        notInArray(tenantEntityPermissions.moduleKey, [...CORE_MIGRATION_EXEMPT_MODULES]),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * true لو القسم ده بالذات (زي "reports" أو "contacts") فيه صف واحد على الأقل محفوظ
 * لهذا الدور — أي عنصر تاني، مش بس هذا. بيستخدمها assertEntityAction عشان لو مدير
 * فعّل بعض عناصر قسم بعينه بالتفصيل (زي "عميل" جوه "العملاء والموردين") من غير ما
 * يلمس عنصر تاني جواه (زي "مورد")، العنصر اللي محدش لمسه يتقفل افتراضيًا بدل ما
 * يفضل مفتوح — نفس القاعدة بالظبط اللي شغالة في القائمة الجانبية
 * (client/src/lib/entity-nav-filter.ts) لكن هنا في نقطة التنفيذ الفعلية.
 */
export async function isModuleTouchedForRole(tenantId: number, role: string, moduleKey: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [row] = await db
    .select({ id: tenantEntityPermissions.id })
    .from(tenantEntityPermissions)
    .where(
      and(
        eq(tenantEntityPermissions.tenantId, tenantId),
        eq(tenantEntityPermissions.role, role),
        eq(tenantEntityPermissions.moduleKey, moduleKey),
      ),
    )
    .limit(1);
  return !!row;
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
  if (allowed !== null) {
    if (!allowed.includes(action)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `لا تملك صلاحية "${PERM_ACTION_LABELS[action]}" على هذا العنصر`,
      });
    }
    return;
  }

  // العنصر ده نفسه معندوش صف محفوظ. نقرر نقيّده افتراضيًا (بدل ما يفضل مفتوح) في حالتين:
  const denyMessage = () => new TRPCError({
    code: "FORBIDDEN",
    message: `لا تملك صلاحية "${PERM_ACTION_LABELS[action]}" على هذا العنصر`,
  });

  if (CORE_MIGRATION_EXEMPT_MODULES.has(moduleKey)) {
    // (1) موديول إضافي (أدوات الذكاء الاصطناعي/تكليف شحنة) والدور أصلاً متحكم فيه
    //     بالتفصيل من قسم أساسي واحد على الأقل.
    if (await isRoleCoreMigrated(ctx.tenantId, ctx.saasUser.role)) throw denyMessage();
    return;
  }

  // (2) القسم ده بالذات فيه عنصر تاني متظبط للدور ده (يعني المدير بيتحكم في القسم ده
  //     بالتفصيل فعلاً) — أي عنصر جواه محدش لمسه يتقفل زيه بالظبط، مش يفضل مفتوح.
  if (await isModuleTouchedForRole(ctx.tenantId, ctx.saasUser.role, moduleKey)) throw denyMessage();
  return; // القسم ده كله لسه محدش لمسه خالص لهذا الدور — سلوك قديم زي ما هو
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
  "reports.inventory": { moduleKey: "reports", entityKeys: ["legacyInventorySummary"] },
  "reports.balanceSheet": { moduleKey: "reports", entityKeys: ["legacyBalanceSheet"] },
  "reports.incomeStatement": { moduleKey: "reports", entityKeys: ["legacyIncomeStatement"] },
  "reports.analytics": { moduleKey: "reports", entityKeys: ["salesAnalytics"] },
  "reports.tax": { moduleKey: "reports", entityKeys: ["taxReport"] },
  "reports.inventoryStocktake": { moduleKey: "reports", entityKeys: ["invreports-inventorysummary"] },
  "reports.inventoryItemMovements": { moduleKey: "reports", entityKeys: ["invreports-itemstransferdetails"] },
  "reports.inventoryWarehouseInOut": { moduleKey: "reports", entityKeys: ["invreports-totalinventoryexportimportreport"] },
  "reports.inventoryWarehouseMovements": { moduleKey: "reports", entityKeys: ["invreports-inventorytransferdetailsreport"] },
  "reports.inventoryItemCosts": { moduleKey: "reports", entityKeys: ["invreports-itemscosts"] },
  "reports.inventoryItemsList": { moduleKey: "reports", entityKeys: ["invreports-itemslist"] },
  "reports.inventoryItemSummary": { moduleKey: "reports", entityKeys: ["invreports-itemssummary"] },
  "reports.inventoryItemInOut": { moduleKey: "reports", entityKeys: ["invreports-incomeoutcomeitem"] },
  "reports.inventoryStagnantItems": { moduleKey: "reports", entityKeys: ["invreports-stagnantitems"] },
  "reports.inventoryItemAging": { moduleKey: "reports", entityKeys: ["invreports-itemaging"] },
  "importCosting.list": { moduleKey: "import_costing", entityKeys: ["shipmentCosting"] },
  "importCosting.get": { moduleKey: "import_costing", entityKeys: ["shipmentCosting"] },
  "importCosting.create": { moduleKey: "import_costing", entityKeys: ["shipmentCosting"] },
  "importCosting.update": { moduleKey: "import_costing", entityKeys: ["shipmentCosting"] },
  "importCosting.createDuplicate": { moduleKey: "import_costing", entityKeys: ["shipmentCosting"] },
  "importCosting.delete": { moduleKey: "import_costing", entityKeys: ["shipmentCosting"] },
  "assistant.chat": { moduleKey: "ai_tools", entityKeys: ["assistant"] },
  "accountingAuditor.getPolicy": { moduleKey: "ai_tools", entityKeys: ["accountingAuditor"] },
  "accountingAuditor.savePolicy": { moduleKey: "ai_tools", entityKeys: ["accountingAuditor"] },
  "accountingAuditor.bankAccounts": { moduleKey: "ai_tools", entityKeys: ["accountingAuditor"] },
  "accountingAuditor.uploadBankStatement": { moduleKey: "ai_tools", entityKeys: ["accountingAuditor"] },
  "accountingAuditor.reReconcileBankStatement": { moduleKey: "ai_tools", entityKeys: ["accountingAuditor"] },
  "accountingAuditor.bankStatementDetail": { moduleKey: "ai_tools", entityKeys: ["accountingAuditor"] },
  "accountingAuditor.uploadStatement": { moduleKey: "ai_tools", entityKeys: ["accountingAuditor"] },
  "accountingAuditor.listUploads": { moduleKey: "ai_tools", entityKeys: ["accountingAuditor"] },
  "accountingAuditor.listClosures": { moduleKey: "ai_tools", entityKeys: ["accountingAuditor"] },
  "accountingAuditor.setFindingStatus": { moduleKey: "ai_tools", entityKeys: ["accountingAuditor"] },
  "accountingAuditor.run": { moduleKey: "ai_tools", entityKeys: ["accountingAuditor"] },
  "accountingAuditor.latestSnapshot": { moduleKey: "ai_tools", entityKeys: ["accountingAuditor"] },
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
  if (
    path === "reports.accountingBySlug" || path === "reports.finalBySlug" ||
    path === "reports.hrBySlug" || path === "reports.assetsBySlug"
  ) {
    if (typeof input?.slug === "string" && input.slug) {
      return { moduleKey: "reports", entityKeys: [input.slug] };
    }
    return null;
  }
  if (path === "reports.purchasesSalesDetail") {
    const key = input?.kind === "purchases" ? "accountingreports-purchases" : "accountingreports-sales";
    return { moduleKey: "reports", entityKeys: [key] };
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
