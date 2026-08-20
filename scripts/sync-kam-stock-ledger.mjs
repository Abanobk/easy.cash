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
import { readFileSync } from "node:fs";
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
const CREATE_MISSING = process.argv.includes("--create-missing-items");

// نسخة مستقلة من دوال server/mega-report-parse.ts (بدل ما نستوردها) — الحاوية على السيرفر
// فيها dist/ المبني بس مفيهاش شجرة server/ الأصلية، فالسكربت لازم يكون قايم بذاته.
function cell(row, i) {
  return String(row[i] ?? "").trim();
}
function stripThousands(value) {
  return value.replace(/,/g, "");
}
function numCell(row, i) {
  return stripThousands(cell(row, i));
}
function excelDateToIso(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 20000 && n < 80000) {
      const epoch = Date.UTC(1899, 11, 30);
      const d = new Date(epoch + Math.floor(n) * 86400000);
      return d.toISOString().slice(0, 10);
    }
  }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    const mo = String(Number(m[2])).padStart(2, "0");
    const day = String(Number(m[1])).padStart(2, "0");
    return `${y}-${mo}-${day}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}
function parseMegaItemCell(raw) {
  const text = String(raw || "").replace(/\r/g, "\n").trim();
  if (!text) return { name: "", barcode: null };
  const parts = text.split("\n").map((p) => p.trim()).filter(Boolean);
  const name = parts[0] || text;
  let barcode = null;
  const joined = text.replace(/\n/g, " ");
  const m = joined.match(/\(([^)]+)\)\s*$/);
  if (m) barcode = m[1].trim();
  else if (parts.length > 1) {
    const last = parts[parts.length - 1].replace(/[()]/g, "").trim();
    if (last && last !== name) barcode = last;
  }
  return { name, barcode };
}
function matrixToSheetRows(matrix) {
  return matrix.map((row) =>
    (row || []).map((c) => {
      if (c == null) return "";
      if (typeof c === "number") return String(c);
      return String(c).trim();
    }),
  );
}
function detectStockLedgerKind(rows) {
  const head = rows.slice(0, 12).map((r) => r.join(" | "));
  const blob = head.join("\n");
  return blob.includes("حركة تفصيلية للمخازن");
}
function parseStockLedgerReport(rows) {
  const out = [];
  for (const r of rows) {
    const dateRaw = cell(r, 10);
    if (!dateRaw) continue;
    const date = excelDateToIso(dateRaw);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const opCell = String(r[9] ?? "");
    const opParts = opCell.split("\n").map((p) => p.trim()).filter(Boolean);
    const op = opParts[0] || "";
    const ref = opParts[1] || "";
    const warehouse = String(r[8] ?? "").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
    const { name, barcode } = parseMegaItemCell(String(r[7] ?? ""));
    out.push({
      date, op, ref, warehouse, name, barcode: barcode || "",
      unit: cell(r, 6), qtyIn: numCell(r, 5), qtyOut: numCell(r, 4), balanceQty: numCell(r, 3),
      valIn: numCell(r, 2), valOut: numCell(r, 1), balanceVal: numCell(r, 0),
    });
  }
  return out;
}

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

  const db = drizzle(process.env.DATABASE_URL);

  const [tenant] = await db.select({ id: tenants.id, slug: tenants.slug })
    .from(tenants).where(eq(tenants.slug, slug)).limit(1);
  if (!tenant) throw new Error(`Tenant not found: ${slug}`);
  const tenantId = tenant.id;
  console.log(`Tenant: ${slug} (id=${tenantId})`);

  const buf = readFileSync(file);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false, raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  const rows = matrixToSheetRows(matrix);
  if (!detectStockLedgerKind(rows)) throw new Error('الملف مش "حركة تفصيلية للمخازن"');
  console.log("Detected report: حركة تفصيلية للمخازن");

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

  if (CREATE_MISSING) {
    const seenNames = new Set();
    let maxCodeNum = 0;
    const codeRows = await db.select({ code: items.code }).from(items).where(eq(items.tenantId, tenantId));
    for (const r of codeRows) {
      const m = String(r.code || "").match(/^P-0*(\d+)$/);
      if (m) maxCodeNum = Math.max(maxCodeNum, Number(m[1]));
    }
    let maxBarcodeNum = 0;
    for (const it of catalogItems) {
      if (/^\d+$/.test(String(it.barcode || ""))) maxBarcodeNum = Math.max(maxBarcodeNum, Number(it.barcode));
    }
    let created = 0;
    for (const [, r] of lastByKey) {
      const nameKey = normalizeKey(r.name);
      if (seenNames.has(nameKey) || (byName.get(nameKey) || []).length > 0) continue;
      seenNames.add(nameKey);
      maxCodeNum += 1;
      maxBarcodeNum += 1;
      const code = `P-${String(maxCodeNum).padStart(4, "0")}`;
      const barcode = String(maxBarcodeNum).padStart(6, "0");
      console.log(`Creating missing item: "${r.name}" -> ${code} / ${barcode}`);
      if (APPLY) {
        const [ins] = await db.insert(items).values({
          tenantId, code, barcode, name: r.name, unit: r.unit || "قطعة",
          purchasePrice: "0", averageCost: "0", salePrice: "0", currentStock: "0", isActive: true,
        });
        const newId = ins.insertId;
        const newItem = { id: newId, name: r.name, barcode };
        catalogItems.push(newItem);
        byName.set(nameKey, [newItem]);
      }
      created += 1;
    }
    console.log(`Missing items ${APPLY ? "created" : "would be created"}: ${created}`);
  }

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
