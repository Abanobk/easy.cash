import { eq } from "drizzle-orm";
import type { Db } from "./db";
import { customers, suppliers } from "../drizzle/schema";
import { resolveTypedEntityCode } from "./entity-codes";
import { recalculateCustomerBalance, recalculateSupplierBalance } from "./contact-balances";
import { tenantWhere, withTenantId } from "./tenant-scope";
import { normalizeArabicKey as normalizeKey } from "../shared/arabic-normalize";

export type CleanContactRow = {
  code?: string;
  name: string;
  phone?: string;
  phone2?: string;
  email?: string;
  address?: string;
  city?: string;
  taxNumber?: string;
  openingBalance?: string | number;
  openingBalanceDate?: string;
  notes?: string;
};

/**
 * استيراد نظيف من Excel لعملاء/موردين — مطابقة بالكود أولاً ثم الاسم، بدون تكرار.
 * صنف موجود بنفس الكود/الاسم بيتحدّث رصيده الافتتاحي وبياناته، مش بيتعمله نسخة تانية.
 */
export async function cleanImportContacts(
  db: Db,
  tenantId: number,
  contactType: "customer" | "supplier",
  rows: CleanContactRow[],
) {
  const table = contactType === "customer" ? customers : suppliers;
  const catalog = await db
    .select({ id: table.id, code: table.code, name: table.name })
    .from(table)
    .where(tenantWhere(table, tenantId));

  const byCode = new Map<string, (typeof catalog)[0]>();
  const byName = new Map<string, (typeof catalog)[0]>();
  for (const c of catalog) {
    const cd = normalizeKey(c.code || "");
    const nm = normalizeKey(c.name || "");
    if (cd) byCode.set(cd, c);
    if (nm) byName.set(nm, c);
  }

  let created = 0;
  let matched = 0;
  const errors: string[] = [];
  const touchedIds: number[] = [];

  for (const raw of rows) {
    const name = String(raw.name || "").trim();
    if (!name) continue;
    try {
      const cdKey = normalizeKey(raw.code || "");
      const nmKey = normalizeKey(name);
      const existing = (cdKey && byCode.get(cdKey)) || (nmKey && byName.get(nmKey)) || null;

      const openingBalance =
        raw.openingBalance != null && String(raw.openingBalance).trim() !== ""
          ? String(Number(raw.openingBalance) || 0)
          : undefined;

      const values = {
        ...(raw.phone ? { phone: raw.phone } : {}),
        ...(raw.phone2 ? { phone2: raw.phone2 } : {}),
        ...(raw.email ? { email: raw.email } : {}),
        ...(raw.address ? { address: raw.address } : {}),
        ...(raw.city ? { city: raw.city } : {}),
        ...(raw.taxNumber ? { taxNumber: raw.taxNumber } : {}),
        ...(openingBalance != null ? { openingBalance } : {}),
        ...(raw.openingBalanceDate ? { openingBalanceDate: raw.openingBalanceDate as any } : {}),
        ...(raw.notes ? { notes: raw.notes } : {}),
      };

      let id: number;
      if (existing) {
        await db.update(table).set(values as any).where(tenantWhere(table, tenantId, eq(table.id, existing.id)));
        id = existing.id;
        matched += 1;
      } else {
        const code = await resolveTypedEntityCode(db, table, tenantId, contactType, raw.code);
        const [ins] = await db.insert(table).values(
          withTenantId(tenantId, { name, code, ...values }) as any,
        );
        id = Number((ins as { insertId?: number }).insertId ?? 0);
        if (!(id > 0)) throw new Error("فشل إنشاء السجل");
        created += 1;
      }
      touchedIds.push(id);
    } catch (e: unknown) {
      errors.push(`${raw.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  for (const id of touchedIds) {
    if (contactType === "customer") await recalculateCustomerBalance(db, tenantId, id);
    else await recalculateSupplierBalance(db, tenantId, id);
  }

  return {
    success: true as const,
    created,
    matched,
    failed: errors.length,
    errors: errors.slice(0, 40),
  };
}
