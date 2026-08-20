#!/usr/bin/env node
/**
 * تصحيح رصيد/تكلفة الأصناف لتينانت kam من تقرير ميجا كاش "حركة تفصيلية للمخازن" (Excel).
 *
 * المشكلة: استيراد رصيد أول المدة + المشتريات تم بترتيب غلط (رصيد افتتاحي حقيقي لـ79 صنف
 * لم يكن معروفًا وقت استيراد المشتريات)، فبقت تكلفة 305 صنف = صفر بدل الرقم الحقيقي.
 * الحل: نزامن مباشرة على آخر رصيد/قيمة مسجلة فعليًا لكل صنف×مخزن في نفس تقرير ميجا كاش —
 * بدل ما نحاول نعيد حساب كل حركة تاريخية (خطر ومعقد)، ناخد "الحقيقة النهائية" من ميجا نفسه.
 *
 * بعد التزامن: أوامر الإنتاج المستوردة (draft) بتتحول "مكتملة" كسجل تاريخي فقط —
 * من غير ما نحرك المخزون أو نعيد حساب التكلفة تاني (أصلاً اتحركت فعليًا بالتزامن ده)،
 * عشان منكررش نفس الأثر مرتين.
 *
 *   DATABASE_URL=... node scripts/sync-kam-stock-ledger.mjs --file "/tmp/ledger.xlsx" --dry-run
 *   DATABASE_URL=... node scripts/sync-kam-stock-ledger.mjs --file "/tmp/ledger.xlsx" --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/mysql2";
import { and, eq, sql } from "drizzle-orm";
import * as XLSX from "xlsx";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const slug = arg("--slug", "kam");
const file = arg("--file", "");
const APPLY = process.argv.includes("--apply");

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/ـ/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\s\-_/\\]+/g, " ")
    .trim();
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!file) throw new Error("--file <path to ledger .xlsx> is required");
  if (slug !== "kam") throw new Error("هذا السكربت مقفول على slug=kam للحماية");

  const { items, warehouses, itemWarehouseStock, productionOrders, tenants } = await import("../drizzle/schema.ts");
  const { detectMegaReportKind, parseStockLedgerReport, matrixToSheetRows } = await import("../server/mega-report-parse.ts");

  const db = drizzle(process.env.DATABASE_URL);

  const [tenant] = await db.select({ id: tenants.id, slug: tenants.slug })
    .from(tenants).where(eq(tenants.slug, slug)).limit(1);
  if (!tenant) throw new Error(`Tenant not found: ${slug}`);
  const tenantId = tenant.id;
  console.log(`Tenant: ${slug} (id=${tenantId})`);

  const wb = XLSX.readFile(file);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  const rows = matrixToSheetRows(matrix);
  const kind = detectMegaReportKind(rows);
  console.log(`Detected report kind: ${kind}`);
  if (kind !== "stock_ledger") throw new Error(`الملف مش "حركة تفصيلية للمخازن" — النوع المكتشف: ${kind}`);

  const ledger = parseStockLedgerReport(rows);
  console.log(`Ledger rows parsed: ${ledger.length}`);

  // آخر صف لكل (باركود ميجا, اسم المخزن) = الرصيد الحقيقي النهائي
  const lastByKey = new Map();
  for (const r of ledger) {
    const key = `${r.barcode}::${normalizeKey(r.warehouse)}`;
    lastByKey.set(key, r); // الترتيب في الملف زمني، فآخر ظهور = آخر حالة
  }
  console.log(`Unique item×warehouse combos: ${lastByKey.size}`);

  const catalogItems = await db.select({ id: items.id, name: items.name, barcode: items.barcode })
    .from(items).where(eq(items.tenantId, tenantId));
  const byName = new Map();
  for (const it of catalogItems) {
    const nk = normalizeKey(it.name);
    if (!byName.has(nk)) byName.set(nk, []);
    byName.get(nk).push(it);
  }

  const catalogWarehouses = await db.select({ id: warehouses.id, name: warehouses.name })
    .from(warehouses).where(eq(warehouses.tenantId, tenantId));
  const whByName = new Map();
  for (const w of catalogWarehouses) whByName.set(normalizeKey(w.name), w);

  const existingStock = await db.select({
    id: itemWarehouseStock.id, itemId: itemWarehouseStock.itemId, warehouseId: itemWarehouseStock.warehouseId,
    quantity: itemWarehouseStock.quantity, unitCost: itemWarehouseStock.unitCost,
  }).from(itemWarehouseStock).where(eq(itemWarehouseStock.tenantId, tenantId));
  const stockByKey = new Map(existingStock.map((s) => [`${s.itemId}-${s.warehouseId}`, s]));

  const itemCurrent = new Map(catalogItems.map((i) => [i.id, i]));

  const matched = [];
  const unmatchedItems = new Set();
  const unmatchedWarehouses = new Set();
  const ambiguousItems = new Set();

  for (const [, r] of lastByKey) {
    const nameKey = normalizeKey(r.name);
    const itemHits = byName.get(nameKey) || [];
    const wh = whByName.get(normalizeKey(r.warehouse));
    if (!wh) unmatchedWarehouses.add(r.warehouse);
    if (itemHits.length === 0) { unmatchedItems.add(`${r.name} (${r.barcode})`); continue; }
    if (itemHits.length > 1) { ambiguousItems.add(`${r.name} (${r.barcode})`); continue; }
    if (!wh) continue;
    const item = itemHits[0];
    const newQty = Number(r.balanceQty) || 0;
    const newVal = Number(r.balanceVal) || 0;
    const newCost = newQty > 0 ? newVal / newQty : 0;
    const existing = stockByKey.get(`${item.id}-${wh.id}`);
    matched.push({
      itemId: item.id, itemName: item.name, warehouseId: wh.id, warehouseName: wh.name,
      currentQty: existing ? Number(existing.quantity) : 0,
      currentCost: existing ? Number(existing.unitCost) : 0,
      newQty, newCost, existingRowId: existing?.id,
    });
  }

  console.log(`\nMatched item×warehouse rows: ${matched.length}`);
  console.log(`Unmatched items (no catalog match): ${unmatchedItems.size}`);
  console.log(`Ambiguous items (multiple catalog matches): ${ambiguousItems.size}`);
  console.log(`Unmatched warehouses: ${unmatchedWarehouses.size}`);
  if (unmatchedItems.size) console.log("  sample unmatched items:", [...unmatchedItems].slice(0, 10));
  if (ambiguousItems.size) console.log("  ambiguous items:", [...ambiguousItems].slice(0, 10));
  if (unmatchedWarehouses.size) console.log("  unmatched warehouses:", [...unmatchedWarehouses]);

  const changed = matched.filter((m) =>
    Math.abs(m.currentQty - m.newQty) > 0.001 || Math.abs(m.currentCost - m.newCost) > 0.01);
  console.log(`\nRows with an actual change: ${changed.length}`);
  console.log("Sample changes:");
  for (const c of changed.slice(0, 15)) {
    console.log(`  ${c.itemName} @ ${c.warehouseName}: qty ${c.currentQty} -> ${c.newQty}, cost ${c.currentCost.toFixed(4)} -> ${c.newCost.toFixed(4)}`);
  }

  if (!APPLY) {
    console.log("\nDRY RUN — لم يتم تعديل أي بيانات. أعد التشغيل بـ --apply لتنفيذ التغييرات.");
    process.exit(0);
  }

  console.log("\nApplying changes...");
  let updated = 0, inserted = 0;
  for (const m of changed) {
    if (m.existingRowId) {
      await db.update(itemWarehouseStock)
        .set({ quantity: String(m.newQty.toFixed(3)), unitCost: String(m.newCost.toFixed(4)) })
        .where(and(eq(itemWarehouseStock.id, m.existingRowId)));
      updated += 1;
    } else {
      await db.insert(itemWarehouseStock).values({
        tenantId, itemId: m.itemId, warehouseId: m.warehouseId,
        quantity: String(m.newQty.toFixed(3)), unitCost: String(m.newCost.toFixed(4)),
      });
      inserted += 1;
    }
  }
  console.log(`item_warehouse_stock: ${updated} updated, ${inserted} inserted`);

  // إعادة حساب items.currentStock / items.averageCost من مجموع كل المخازن لكل صنف متأثر
  const affectedItemIds = [...new Set(matched.map((m) => m.itemId))];
  let itemsUpdated = 0;
  for (const itemId of affectedItemIds) {
    const rows = await db.select({
      quantity: itemWarehouseStock.quantity, unitCost: itemWarehouseStock.unitCost,
    }).from(itemWarehouseStock).where(and(eq(itemWarehouseStock.tenantId, tenantId), eq(itemWarehouseStock.itemId, itemId)));
    let totalQty = 0, totalVal = 0;
    for (const r of rows) {
      const q = Number(r.quantity) || 0;
      totalQty += q;
      totalVal += q * (Number(r.unitCost) || 0);
    }
    const avgCost = totalQty > 0 ? totalVal / totalQty : 0;
    await db.update(items)
      .set({ currentStock: String(totalQty.toFixed(3)), averageCost: String(avgCost.toFixed(4)) })
      .where(and(eq(items.tenantId, tenantId), eq(items.id, itemId)));
    itemsUpdated += 1;
  }
  console.log(`items.currentStock/averageCost recomputed: ${itemsUpdated}`);

  // أوامر الإنتاج المستوردة (draft) -> مكتملة كسجل تاريخي، من غير ما نحرك المخزون تاني
  const draftCountBefore = await db.select({ c: sql`COUNT(*)` }).from(productionOrders)
    .where(and(eq(productionOrders.tenantId, tenantId), eq(productionOrders.status, "draft")));
  console.log(`\nDraft production orders before: ${draftCountBefore[0]?.c ?? 0}`);

  await db.update(productionOrders)
    .set({ status: "completed" })
    .where(and(eq(productionOrders.tenantId, tenantId), eq(productionOrders.status, "draft")));

  console.log("Draft production orders flipped to completed (no stock/journal recompute — already reflected by ledger sync).");
  console.log("\nDONE");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
