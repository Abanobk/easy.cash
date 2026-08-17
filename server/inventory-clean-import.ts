import { and, eq } from "drizzle-orm";
import type { Db } from "./db";
import {
  beginningInventory,
  itemCategories,
  items,
  itemWarehouseStock,
  warehouses,
} from "../drizzle/schema";
import { ensureMeasureUnitExists } from "./measure-units";
import { resolveTypedEntityCode } from "./entity-codes";
import { applyStockMovement, syncItemTotalStock } from "./inventory-stock";
import { updateAverageCostAfterPurchase } from "./inventory-cost";
import { tenantWhere, withTenantId } from "./tenant-scope";

function normalizeKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\s\-_/\\]+/g, " ")
    .trim();
}

function looksLikeSku(value: string, itemName: string) {
  const v = value.trim();
  if (!v) return false;
  if (v === itemName.trim()) return false;
  if (v.length > 40) return false;
  if (v.length > 24 && /\s/.test(v)) return false;
  return true;
}

export type CleanImportRow = {
  name: string;
  barcode?: string;
  code?: string;
  warehouse: string;
  quantity: string | number;
  unitCost?: string | number;
  unit?: string;
  category?: string;
};

/** يضمن وجود المخزن بالاسم (ينشئه لو مش موجود) */
export async function ensureWarehouseByName(
  db: Db,
  tenantId: number,
  rawName: string,
): Promise<{ id: number; name: string; created: boolean }> {
  const name = String(rawName || "").trim();
  if (!name) throw new Error("اسم المخزن مطلوب");
  const key = normalizeKey(name);
  const all = await db.select({ id: warehouses.id, name: warehouses.name })
    .from(warehouses)
    .where(tenantWhere(warehouses, tenantId));
  const exact = all.find((w) => normalizeKey(w.name) === key);
  if (exact) return { id: exact.id, name: exact.name, created: false };
  const partial = all.filter((w) => {
    const n = normalizeKey(w.name);
    return n.includes(key) || key.includes(n);
  });
  if (partial.length === 1) return { id: partial[0].id, name: partial[0].name, created: false };

  const [ins] = await db.insert(warehouses).values(withTenantId(tenantId, {
    name,
    isActive: true,
  }) as any);
  const id = Number((ins as { insertId?: number }).insertId ?? 0);
  if (!(id > 0)) throw new Error(`فشل إنشاء المخزن «${name}»`);
  return { id, name, created: true };
}

async function ensureCategoryByName(
  db: Db,
  tenantId: number,
  rawName: string | undefined,
): Promise<number | undefined> {
  const name = String(rawName || "").trim();
  if (!name) return undefined;
  const key = normalizeKey(name);
  const rows = await db.select({ id: itemCategories.id, name: itemCategories.name })
    .from(itemCategories)
    .where(tenantWhere(itemCategories, tenantId));
  const hit = rows.find((c) => normalizeKey(c.name) === key);
  if (hit) return hit.id;
  const [ins] = await db.insert(itemCategories).values(withTenantId(tenantId, { name }) as any);
  const id = Number((ins as { insertId?: number }).insertId ?? 0);
  return id > 0 ? id : undefined;
}

/** يجد صنف موجود أو ينشئه بكود تلقائي — بدون تكرار بالاسم/الباركود/الكود */
export async function findOrCreateItemForImport(
  db: Db,
  tenantId: number,
  row: { name: string; barcode?: string; code?: string; unit?: string; unitCost?: string; categoryId?: number },
): Promise<{ id: number; code: string; name: string; created: boolean }> {
  const name = row.name.trim();
  const catalog = await db.select({
    id: items.id,
    name: items.name,
    code: items.code,
    barcode: items.barcode,
  }).from(items).where(tenantWhere(items, tenantId, eq(items.isActive, true)));

  const byBarcode = new Map<string, typeof catalog[0]>();
  const byCode = new Map<string, typeof catalog[0]>();
  const byName = new Map<string, typeof catalog[0]>();
  for (const it of catalog) {
    const bc = normalizeKey(it.barcode || "");
    const cd = normalizeKey(it.code || "");
    const nm = normalizeKey(it.name || "");
    if (bc) byBarcode.set(bc, it);
    if (cd) byCode.set(cd, it);
    if (nm) byName.set(nm, it);
  }

  const rawBarcode = (row.barcode || "").trim();
  const rawCode = (row.code || "").trim();
  const bcKey = looksLikeSku(rawBarcode, name) ? normalizeKey(rawBarcode) : "";
  const cdKey = looksLikeSku(rawCode, name) ? normalizeKey(rawCode) : "";
  const nmKey = normalizeKey(name);

  const existing =
    (bcKey && byBarcode.get(bcKey))
    || (cdKey && byCode.get(cdKey))
    || (nmKey && byName.get(nmKey))
    || null;

  const unit = await ensureMeasureUnitExists(db, tenantId, row.unit);
  const cost = row.unitCost && Number(row.unitCost) > 0 ? String(row.unitCost) : "0";

  if (existing) {
    await db.update(items).set({
      unit,
      ...(Number(cost) > 0 ? { purchasePrice: cost } : {}),
      ...(row.categoryId ? { categoryId: row.categoryId } : {}),
    } as any).where(tenantWhere(items, tenantId, eq(items.id, existing.id)));
    return {
      id: existing.id,
      code: existing.code || String(existing.id),
      name: existing.name,
      created: false,
    };
  }

  const preferredCode = looksLikeSku(rawCode, name) ? rawCode : undefined;
  const code = await resolveTypedEntityCode(db, items, tenantId, "item", preferredCode);
  const barcode = looksLikeSku(rawBarcode, name) ? rawBarcode : null;
  const [ins] = await db.insert(items).values(withTenantId(tenantId, {
    name,
    code,
    barcode,
    unit,
    categoryId: row.categoryId ?? null,
    purchasePrice: cost,
    averageCost: "0",
    isActive: true,
  }) as any);
  const id = Number((ins as { insertId?: number }).insertId ?? 0);
  if (!(id > 0)) throw new Error(`فشل إنشاء الصنف «${name}»`);
  return { id, code, name, created: true };
}

/** استبدال رصيد أول المدة لصنف×مخزن (بدون دبلكيت) */
export async function replaceBeginningStock(
  db: Db,
  tenantId: number,
  opts: {
    itemId: number;
    warehouseId: number;
    quantity: number;
    unitCost?: number;
    date: string;
  },
) {
  const existing = await db.select().from(beginningInventory).where(tenantWhere(
    beginningInventory,
    tenantId,
    and(
      eq(beginningInventory.itemId, opts.itemId),
      eq(beginningInventory.warehouseId, opts.warehouseId),
    ),
  ));
  for (const prev of existing) {
    await applyStockMovement(db, tenantId, {
      itemId: prev.itemId,
      quantity: prev.quantity,
      direction: "out",
      warehouseId: prev.warehouseId,
      allowNegative: true,
    });
    await db.delete(beginningInventory)
      .where(tenantWhere(beginningInventory, tenantId, eq(beginningInventory.id, prev.id)));
  }

  if (!(opts.quantity > 0)) return;

  await db.insert(beginningInventory).values(withTenantId(tenantId, {
    warehouseId: opts.warehouseId,
    itemId: opts.itemId,
    quantity: String(opts.quantity),
    unitCost: String(opts.unitCost || 0),
    date: opts.date as any,
  }) as any);
  await applyStockMovement(db, tenantId, {
    itemId: opts.itemId,
    quantity: String(opts.quantity),
    direction: "in",
    warehouseId: opts.warehouseId,
  });
  if (opts.unitCost && opts.unitCost > 0) {
    await updateAverageCostAfterPurchase(db, tenantId, opts.itemId, opts.quantity, opts.unitCost);
  }
}

/**
 * استيراد نظيف من Excel:
 * مخازن تلقائي · أصناف بدون تكرار + كود · وحدات · كميات أول مدة
 */
export async function cleanImportBeginningInventory(
  db: Db,
  tenantId: number,
  input: { date: string; rows: CleanImportRow[] },
) {
  let itemsCreated = 0;
  let itemsMatched = 0;
  let warehousesCreated = 0;
  let linesImported = 0;
  const errors: string[] = [];

  // تجميع نفس الصنف×المخزن في سطر واحد (مجموع كميات لو مكرر في الملف)
  const merged = new Map<string, CleanImportRow & { quantity: number; unitCost: number }>();
  for (const raw of input.rows) {
    const name = String(raw.name || "").trim();
    const warehouse = String(raw.warehouse || "").trim();
    const qty = Number(raw.quantity);
    if (!name || !warehouse || !(qty > 0)) {
      if (name || warehouse) errors.push(`${name || "؟"} / ${warehouse || "؟"}: بيانات ناقصة`);
      continue;
    }
    const key = `${normalizeKey(name)}||${normalizeKey(warehouse)}`;
    const cost = raw.unitCost != null && String(raw.unitCost).trim() !== "" ? Number(raw.unitCost) : 0;
    if (!merged.has(key)) {
      merged.set(key, {
        ...raw,
        name,
        warehouse,
        quantity: qty,
        unitCost: Number.isFinite(cost) ? cost : 0,
      });
    } else {
      const cur = merged.get(key)!;
      const nextQty = cur.quantity + qty;
      if (Number.isFinite(cost) && cost > 0 && nextQty > 0) {
        cur.unitCost = ((cur.unitCost * cur.quantity) + (cost * qty)) / nextQty;
      }
      cur.quantity = nextQty;
      if (!cur.unit && raw.unit) cur.unit = raw.unit;
      if (!cur.barcode && raw.barcode) cur.barcode = raw.barcode;
      if (!cur.code && raw.code) cur.code = raw.code;
    }
  }

  for (const row of merged.values()) {
    try {
      const wh = await ensureWarehouseByName(db, tenantId, row.warehouse);
      if (wh.created) warehousesCreated += 1;
      const categoryId = await ensureCategoryByName(db, tenantId, row.category);
      const item = await findOrCreateItemForImport(db, tenantId, {
        name: row.name,
        barcode: row.barcode,
        code: row.code,
        unit: row.unit,
        unitCost: row.unitCost > 0 ? String(row.unitCost) : undefined,
        categoryId,
      });
      if (item.created) itemsCreated += 1;
      else itemsMatched += 1;

      await replaceBeginningStock(db, tenantId, {
        itemId: item.id,
        warehouseId: wh.id,
        quantity: row.quantity,
        unitCost: row.unitCost > 0 ? row.unitCost : undefined,
        date: input.date,
      });
      linesImported += 1;
    } catch (e: unknown) {
      errors.push(`${row.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    success: true,
    linesImported,
    itemsCreated,
    itemsMatched,
    warehousesCreated,
    failed: errors.length,
    errors: errors.slice(0, 40),
  };
}

/** مسح رصيد أول المدة + رصيد المخازن ثم حذف الأصناف المحددة */
export async function purgeItemsWithStock(
  db: Db,
  tenantId: number,
  itemIds: number[],
) {
  let purged = 0;
  let deleted = 0;
  const errors: string[] = [];

  for (const itemId of [...new Set(itemIds)]) {
    try {
      const bi = await db.select().from(beginningInventory)
        .where(tenantWhere(beginningInventory, tenantId, eq(beginningInventory.itemId, itemId)));
      for (const row of bi) {
        await applyStockMovement(db, tenantId, {
          itemId: row.itemId,
          quantity: row.quantity,
          direction: "out",
          warehouseId: row.warehouseId,
          allowNegative: true,
        });
        await db.delete(beginningInventory)
          .where(tenantWhere(beginningInventory, tenantId, eq(beginningInventory.id, row.id)));
      }

      const stockRows = await db.select().from(itemWarehouseStock)
        .where(tenantWhere(itemWarehouseStock, tenantId, eq(itemWarehouseStock.itemId, itemId)));
      for (const s of stockRows) {
        const qty = Number(s.quantity || 0);
        if (qty > 0.0001) {
          await applyStockMovement(db, tenantId, {
            itemId,
            quantity: qty,
            direction: "out",
            warehouseId: s.warehouseId,
            allowNegative: true,
          });
        }
        await db.delete(itemWarehouseStock)
          .where(tenantWhere(itemWarehouseStock, tenantId, eq(itemWarehouseStock.id, s.id)));
      }

      await db.update(items).set({
        currentStock: "0",
        averageCost: "0",
      } as any).where(tenantWhere(items, tenantId, eq(items.id, itemId)));

      try {
        await db.delete(items).where(tenantWhere(items, tenantId, eq(items.id, itemId)));
        deleted += 1;
      } catch {
        // مربوط بفواتير — نسيبه بصفر رصيد
        await syncItemTotalStock(db, tenantId, itemId);
        purged += 1;
        errors.push(`صنف #${itemId}: تم تصفير الرصيد لكن الحذف مرفوض (مستخدم في مستندات)`);
        continue;
      }
      purged += 1;
    } catch (e: unknown) {
      errors.push(`صنف #${itemId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { success: true, purged, deleted, failed: errors.length, errors: errors.slice(0, 30) };
}
