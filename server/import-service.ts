import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import {
  accounts, customers, employees, items, suppliers, warehouses, itemCategories, departments,
} from "../drizzle/schema";
import { tenantWhere, withTenantId } from "./tenant-scope";

export type ImportEntity =
  | "customers" | "suppliers" | "items" | "accounts" | "employees"
  | "warehouses" | "itemCategories" | "departments";

export type ImportResult = {
  imported: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

const TABLE_MAP = {
  customers,
  suppliers,
  items,
  accounts,
  employees,
  warehouses,
  itemCategories,
  departments,
} as const;

const CODE_FIELDS: Partial<Record<ImportEntity, string>> = {
  customers: "code",
  suppliers: "code",
  items: "code",
  accounts: "code",
  employees: "code",
  warehouses: "name",
  itemCategories: "name",
  departments: "name",
};

export const IMPORT_TEMPLATES: Record<ImportEntity, Record<string, unknown>[]> = {
  customers: [{ code: "C001", name: "عميل نموذجي", phone: "01000000000", email: "", balance: "0", creditLimit: "0" }],
  suppliers: [{ code: "S001", name: "مورد نموذجي", phone: "01000000000", balance: "0" }],
  items: [{ code: "I001", name: "صنف نموذجي", barcode: "", salePrice: "100", purchasePrice: "80", currentStock: "0" }],
  accounts: [{ code: "1111", name: "خزينة", type: "asset", isParent: false, balance: "0" }],
  employees: [{ code: "101", name: "موظف نموذجي", phone: "01000000000", basicSalary: "5000", status: "active" }],
  warehouses: [{ name: "المخزن الرئيسي", address: "" }],
  itemCategories: [{ name: "تصنيف عام" }],
  departments: [{ name: "الإدارة العامة" }],
};

function stripMeta(row: Record<string, unknown>) {
  const { id, createdAt, updatedAt, tenantId, ...rest } = row;
  return rest;
}

export async function importEntityRows(
  db: MySql2Database<Record<string, never>>,
  tenantId: number,
  entity: ImportEntity,
  rows: Record<string, unknown>[],
  opts: { upsertByCode?: boolean } = {},
): Promise<ImportResult> {
  const table = TABLE_MAP[entity];
  const codeField = CODE_FIELDS[entity];
  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const raw = stripMeta(rows[i]);
    if (!raw.name && entity !== "accounts") {
      result.errors.push({ row: i + 1, message: "الاسم مطلوب" });
      result.skipped++;
      continue;
    }
    if (entity === "accounts" && !raw.code) {
      result.errors.push({ row: i + 1, message: "كود الحساب مطلوب" });
      result.skipped++;
      continue;
    }

    try {
      if (opts.upsertByCode && codeField && raw[codeField]) {
        const [existing] = await db.select().from(table as any).where(
          tenantWhere(table as any, tenantId, eq((table as any)[codeField], raw[codeField] as string)),
        );
        if (existing) {
          await db.update(table as any).set(raw as any).where(eq((table as any).id, (existing as { id: number }).id));
          result.updated++;
          continue;
        }
      }
      await db.insert(table as any).values(withTenantId(tenantId, raw) as any);
      result.imported++;
    } catch (e) {
      result.errors.push({ row: i + 1, message: e instanceof Error ? e.message : "خطأ غير معروف" });
      result.skipped++;
    }
  }
  return result;
}

export async function importBulkPayload(
  db: MySql2Database<Record<string, never>>,
  tenantId: number,
  data: Partial<Record<ImportEntity, Record<string, unknown>[]>>,
  opts: { upsertByCode?: boolean } = {},
) {
  const order: ImportEntity[] = ["departments", "itemCategories", "warehouses", "accounts", "customers", "suppliers", "items", "employees"];
  const summary: Record<string, ImportResult> = {};
  let totalImported = 0;
  let totalUpdated = 0;

  for (const entity of order) {
    const rows = data[entity];
    if (!rows?.length) continue;
    const res = await importEntityRows(db, tenantId, entity, rows, opts);
    summary[entity] = res;
    totalImported += res.imported;
    totalUpdated += res.updated;
  }

  return { summary, totalImported, totalUpdated };
}
