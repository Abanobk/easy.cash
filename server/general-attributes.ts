import { eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { generalAttributes } from "../drizzle/schema";
import { tenantWhere } from "./tenant-scope";

/** مفاتيح مدعومة في الخصائص العامة */
export const KNOWN_GENERAL_ATTR_KEYS = [
  { key: "require_document_approval", label: "اعتماد المستندات (true/false)", example: "true" },
  { key: "payroll_late_grace_minutes", label: "سماحية التأخير بالدقائق", example: "15" },
  { key: "payroll_late_day_fraction", label: "جزء يوم يُخصم لكل تأخير", example: "0.25" },
  { key: "payroll_overtime_hourly_rate", label: "معدل ساعة إضافي (ج.م)", example: "50" },
  { key: "zkteco_auto_sync_enabled", label: "مزامنة ZKTeco تلقائية (true/false)", example: "true" },
] as const;

export async function getGeneralAttr(
  db: MySql2Database,
  tenantId: number,
  key: string,
): Promise<string | null> {
  const [row] = await db
    .select({ attrValue: generalAttributes.attrValue })
    .from(generalAttributes)
    .where(tenantWhere(generalAttributes, tenantId, eq(generalAttributes.attrKey, key)))
    .limit(1);
  return row?.attrValue ?? null;
}

export async function getGeneralAttrBool(db: MySql2Database, tenantId: number, key: string) {
  const v = await getGeneralAttr(db, tenantId, key);
  if (v == null || v === "") return null;
  return v === "true" || v === "1" || v.toLowerCase() === "yes";
}

export async function getGeneralAttrNumber(
  db: MySql2Database,
  tenantId: number,
  key: string,
  fallback: number,
) {
  const v = await getGeneralAttr(db, tenantId, key);
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
