#!/usr/bin/env node
/**
 * تعبئة أولية لـ item_warehouse_stock.unitCost (تكلفة منفصلة لكل مخزن — migration 0047).
 * لكل صنف×مخزن: يفضّل آخر تكلفة من رصيد أول المدة (beginningInventory) لنفس المخزن،
 * ولو مفيش، يستخدم متوسط تكلفة الصنف العام (items.averageCost/purchasePrice) كتقدير بداية —
 * التكلفة هتتحسّن تلقائياً من هنا فصاعداً مع كل عملية شراء/إنتاج جديدة لنفس المخزن.
 *
 * قراءة فقط لأي جدول غير item_warehouse_stock — لا يلمس الكميات ولا أي بيانات تانية.
 *
 *   DATABASE_URL=... node scripts/backfill-warehouse-cost.mjs
 *   DATABASE_URL=... node scripts/backfill-warehouse-cost.mjs --dry-run
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/mysql2";
import { and, eq, sql } from "drizzle-orm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }
  const { itemWarehouseStock, beginningInventory, items } = await import("../drizzle/schema.ts");
  const db = drizzle(process.env.DATABASE_URL);

  const stockRows = await db.select({
    id: itemWarehouseStock.id,
    tenantId: itemWarehouseStock.tenantId,
    itemId: itemWarehouseStock.itemId,
    warehouseId: itemWarehouseStock.warehouseId,
    quantity: itemWarehouseStock.quantity,
    unitCost: itemWarehouseStock.unitCost,
  }).from(itemWarehouseStock);

  console.log(`item_warehouse_stock rows: ${stockRows.length}`);

  const biRows = await db.select({
    tenantId: beginningInventory.tenantId,
    itemId: beginningInventory.itemId,
    warehouseId: beginningInventory.warehouseId,
    unitCost: beginningInventory.unitCost,
    date: beginningInventory.date,
  }).from(beginningInventory);

  const biMap = new Map();
  for (const r of biRows) {
    const key = `${r.tenantId}-${r.itemId}-${r.warehouseId}`;
    const cost = Number(r.unitCost) || 0;
    if (cost <= 0) continue;
    const existing = biMap.get(key);
    if (!existing || new Date(r.date) >= new Date(existing.date)) {
      biMap.set(key, { cost, date: r.date });
    }
  }
  console.log(`beginningInventory cost keys: ${biMap.size}`);

  const itemIds = [...new Set(stockRows.map((r) => r.itemId))];
  const itemRows = itemIds.length
    ? await db.select({
        id: items.id,
        averageCost: items.averageCost,
        purchasePrice: items.purchasePrice,
      }).from(items).where(sql`${items.id} IN (${sql.join(itemIds.map((id) => sql`${id}`), sql`, `)})`)
    : [];
  const itemCostMap = new Map(itemRows.map((r) => [r.id, Number(r.averageCost) || Number(r.purchasePrice) || 0]));

  let fromBeginningInventory = 0;
  let fromItemAverage = 0;
  let skippedAlreadySet = 0;
  let skippedNoData = 0;

  for (const row of stockRows) {
    if (Number(row.unitCost) > 0) {
      skippedAlreadySet += 1;
      continue;
    }
    const key = `${row.tenantId}-${row.itemId}-${row.warehouseId}`;
    const biHit = biMap.get(key);
    let cost = 0;
    if (biHit) {
      cost = biHit.cost;
      fromBeginningInventory += 1;
    } else {
      cost = itemCostMap.get(row.itemId) || 0;
      if (cost > 0) fromItemAverage += 1;
    }
    if (!(cost > 0)) {
      skippedNoData += 1;
      continue;
    }
    if (!DRY_RUN) {
      await db.update(itemWarehouseStock)
        .set({ unitCost: String(cost.toFixed(4)) })
        .where(and(eq(itemWarehouseStock.id, row.id)));
    }
  }

  console.log(`from beginningInventory: ${fromBeginningInventory}`);
  console.log(`from item average (fallback): ${fromItemAverage}`);
  console.log(`already set (skipped): ${skippedAlreadySet}`);
  console.log(`no cost data available (left at 0): ${skippedNoData}`);
  console.log(DRY_RUN ? "DRY RUN — no changes written" : "DONE");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
