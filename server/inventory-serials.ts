import { and, eq, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { itemSerials, items } from "../drizzle/schema";
import { tenantWhere, withTenantId } from "./tenant-scope";

function parseSerialList(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
  return String(raw)
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function assertItemTracksSerial(
  db: MySql2Database,
  tenantId: number,
  itemId: number,
) {
  const [row] = await db
    .select({ trackSerial: items.trackSerial })
    .from(items)
    .where(tenantWhere(items, tenantId, eq(items.id, itemId)));
  return Boolean(row?.trackSerial);
}

export async function registerPurchaseSerials(
  db: MySql2Database,
  tenantId: number,
  opts: {
    itemId: number;
    warehouseId?: number;
    purchaseInvoiceId: number;
    serialNumbers: string | string[];
  },
) {
  const serials = parseSerialList(opts.serialNumbers);
  if (serials.length === 0) return;

  for (const serialNumber of serials) {
    await db.insert(itemSerials).values(
      withTenantId(tenantId, {
        itemId: opts.itemId,
        serialNumber,
        warehouseId: opts.warehouseId,
        status: "in_stock",
        purchaseInvoiceId: opts.purchaseInvoiceId,
      }) as any,
    );
  }
}

export async function assignSalesSerials(
  db: MySql2Database,
  tenantId: number,
  opts: {
    itemId: number;
    warehouseId?: number;
    salesInvoiceId: number;
    serialNumbers: string | string[];
  },
) {
  const serials = parseSerialList(opts.serialNumbers);
  if (serials.length === 0) return;

  const rows = await db
    .select()
    .from(itemSerials)
    .where(
      tenantWhere(
        itemSerials,
        tenantId,
        and(
          eq(itemSerials.itemId, opts.itemId),
          eq(itemSerials.status, "in_stock"),
          inArray(itemSerials.serialNumber, serials),
        ),
      ),
    );

  if (rows.length !== serials.length) {
    const found = new Set(rows.map((r) => r.serialNumber));
    const missing = serials.filter((s) => !found.has(s));
    throw new Error(`أرقام تسلسلية غير متاحة: ${missing.join(", ")}`);
  }

  for (const row of rows) {
    if (opts.warehouseId && row.warehouseId && row.warehouseId !== opts.warehouseId) {
      throw new Error(`الرقم التسلسلي ${row.serialNumber} في مخزن آخر`);
    }
    await db
      .update(itemSerials)
      .set({ status: "sold", salesInvoiceId: opts.salesInvoiceId })
      .where(tenantWhere(itemSerials, tenantId, eq(itemSerials.id, row.id)));
  }
}

export async function listAvailableSerials(
  db: MySql2Database,
  tenantId: number,
  itemId: number,
  warehouseId?: number,
) {
  const filter = warehouseId ? eq(itemSerials.warehouseId, warehouseId) : undefined;
  return db
    .select({
      id: itemSerials.id,
      serialNumber: itemSerials.serialNumber,
      warehouseId: itemSerials.warehouseId,
    })
    .from(itemSerials)
    .where(
      tenantWhere(
        itemSerials,
        tenantId,
        and(eq(itemSerials.itemId, itemId), eq(itemSerials.status, "in_stock"), filter),
      ),
    )
    .orderBy(itemSerials.serialNumber);
}
