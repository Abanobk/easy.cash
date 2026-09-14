/**
 * تفريغ بيانات أعمال مستأجر واحد بأمان.
 * يحافظ على: tenants, app_users, subscriptions, صلاحيات المستخدمين الأساسية.
 */
import { sql } from "drizzle-orm";
import type { Db } from "./db";
import { eq } from "drizzle-orm";
import { tenants } from "../drizzle/schema";

/** جداول أعمال تُحذف بترتيب الأبناء أولاً (أسماء جداول MySQL) */
export const TENANT_WIPE_TABLES_CHILD_FIRST: string[] = [
  "import_cost_lines",
  "import_cost_shipments",
  "journal_entry_lines",
  "journal_entries",
  "sales_invoice_items",
  "sales_invoices",
  "sales_order_items",
  "sales_orders",
  "sales_return_items",
  "sales_returns",
  "purchase_invoice_items",
  "purchase_invoices",
  "purchase_order_items",
  "purchase_orders",
  "purchase_return_items",
  "purchase_returns",
  "check_routing_events",
  "check_routings",
  "checks",
  "bank_transactions",
  "cash_transactions",
  "inventory_adjustment_items",
  "inventory_adjustments",
  "stock_transfer_expenses",
  "stock_transfer_items",
  "stock_transfers",
  "production_order_materials",
  "production_orders",
  "item_bom_lines",
  "item_extra_prices",
  "item_extra_units",
  "item_serials",
  "item_batches",
  "item_offers",
  "item_price_changes",
  "beginning_inventory",
  "item_warehouse_stock",
  "depreciation_run_lines",
  "depreciation_runs",
  "asset_capital_maintenance",
  "asset_sales",
  "fixed_assets",
  "asset_categories",
  "installments",
  "loans",
  "payroll",
  "salary_advances",
  "attendance",
  "machine_punches",
  "employee_vacation_records",
  "employee_shifts",
  "hr_incentives",
  "under_request_employees",
  "hr_dep_emp_systems",
  "document_approvals",
  "user_activities",
  "user_notifications",
  "notifications",
  "employees",
  "job_titles",
  "departments",
  "hr_shifts",
  "hr_vacations",
  "fingerprint_machines",
  "mobile_fp_locations",
  "hr_systems",
  "items",
  "item_categories",
  "customer_sales_reps",
  "customers",
  "suppliers",
  "contact_categories",
  "bank_accounts",
  "warehouses",
  "accounts",
  "taxes",
  "cost_centers",
  "sales_reps",
  "sales_areas",
  "branches",
  "company_settings",
  "company_profile",
  "company_addresses",
  "cities",
  "exchange_rates",
  "general_attributes",
  "measure_units",
  "fiscal_years",
  // صلاحيات الشاشات/الأدوار للمستأجر تُمسح أيضاً (تُعاد لاحقاً)
  "tenant_screen_permissions",
  "tenant_role_permissions",
  "tenant_roles",
  "user_permission_overrides",
];

/** جداول لا تُمس أبداً بهذا المسار */
export const TENANT_WIPE_PRESERVE = [
  "tenants",
  "app_users",
  "subscriptions",
  "subscription_plans",
  "subscription_payments",
  "paymob_settings",
  "paymob_payment_methods",
  "discount_coupons",
  "users",
  "support_tickets",
] as const;

export type WipeResult = {
  tenantId: number;
  slug: string;
  deleted: Record<string, number>;
  skippedMissing: string[];
};

export async function resolveTenantIdBySlug(
  db: Db,
  slug: string,
): Promise<{ id: number; slug: string; name: string } | null> {
  const [row] = await db
    .select({ id: tenants.id, slug: tenants.slug, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  return row || null;
}

/**
 * @param allowedSlugs إن وُجدت، يُرفض أي slug خارج القائمة (حماية من مسح مستأجر بالخطأ)
 */
export async function wipeTenantBusinessData(
  db: Db,
  slug: string,
  opts: { allowedSlugs?: string[]; dryRun?: boolean } = {},
): Promise<WipeResult> {
  const allowed = opts.allowedSlugs ?? ["kam"];
  if (!allowed.includes(slug)) {
    throw new Error(
      `رفض التفريغ: المستأجر "${slug}" غير مسموح. المسموح حالياً: ${allowed.join(", ")}`,
    );
  }

  const tenant = await resolveTenantIdBySlug(db, slug);
  if (!tenant) throw new Error(`المستأجر غير موجود: ${slug}`);

  const deleted: Record<string, number> = {};
  const skippedMissing: string[] = [];

  for (const table of TENANT_WIPE_TABLES_CHILD_FIRST) {
    if (TENANT_WIPE_PRESERVE.includes(table as any)) continue;
    try {
      if (opts.dryRun) {
        const [cnt] = await db.execute(
          sql.raw(`SELECT COUNT(*) AS c FROM \`${table}\` WHERE \`tenantId\` = ${Number(tenant.id)}`),
        );
        const rows = cnt as unknown as Array<{ c: number }>;
        deleted[table] = Number((rows as any)?.[0]?.c ?? (rows as any)?.[0]?.["COUNT(*)"] ?? 0);
        continue;
      }
      const result = await db.execute(
        sql.raw(`DELETE FROM \`${table}\` WHERE \`tenantId\` = ${Number(tenant.id)}`),
      );
      // mysql2 result shape varies
      const header = Array.isArray(result) ? result[0] : result;
      deleted[table] = Number((header as any)?.affectedRows ?? 0);
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (/doesn't exist|Unknown table|ER_NO_SUCH_TABLE/i.test(msg)) {
        skippedMissing.push(table);
        continue;
      }
      throw new Error(`فشل حذف ${table}: ${msg}`);
    }
  }

  return { tenantId: tenant.id, slug: tenant.slug, deleted, skippedMissing };
}
