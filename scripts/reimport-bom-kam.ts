/**
 * إعادة استيراد تركيبات المنتجات (BOM) لمستأجر "kam" (id=2 على السيرفر الحي) من ملف
 * "المكونات" الفعلي — بنفس منطق شاشة "استيراد تقارير Mega":
 *   preview()  → مطابقة المنتجات/المكونات بالباركود  (megaReportImport.preview)
 *   commitBom() → استبدال خلطة كل منتج بالكامل        (megaReportImport.commitBom)
 *
 * لا SQL يدوي. القيم تُخزَّن كما هي (بدون تقريب) في عمود decimal(15,6).
 * نسخة من scripts/reimport-bom-tenant3.ts بس TENANT قابل للتغيير من متغيّر بيئة.
 *
 * تشغيل داخل حاوية node مع DATABASE_URL + شبكة الكومبوز:
 *   docker run --rm --network easy-cash_default \
 *     -v "$PWD":/app -w /app \
 *     -v /root/bom-import-data:/data \
 *     -e DATABASE_URL='mysql://...' \
 *     -e TENANT_ID=2 \
 *     -e JWT_SECRET=x -e ENCRYPTION_KEY=x -e ALLOW_WEAK_SECRETS=1 \
 *     node:20-slim node node_modules/tsx/dist/cli.mjs \
 *     scripts/reimport-bom-kam.ts "/data/المكونات (1).xlsx" [--apply]
 *
 * بدون --apply: معاينة فقط (dry-run) — يطبع المطابقة والفروق المتوقعة ولا يكتب شيئاً.
 */
import fs from "node:fs";
import { appRouter } from "../server/routers";
import type { TrpcContext } from "../server/_core/context";
import { getDb } from "../server/db";
import { itemBomLines, items } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const TENANT = Number(process.env.TENANT_ID || 2);
const XLSX_PATH = process.argv[2] || "/data/المكونات (1).xlsx";
const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");

function makeCtx(): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: 1, openId: "reimport-script", email: "script@local", name: "BOM reimport",
      loginMethod: "script", role: "admin",
      createdAt: now, updatedAt: now, lastSignedIn: now,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
    tenantId: TENANT,
    tenantSlug: "kam",
    impersonatorId: null,
    saasUser: {
      id: 1, email: "script@local", role: "admin", name: "BOM reimport",
      isActive: true, ownerUserId: null, accountOwnerId: 1, tenantId: TENANT,
    },
  };
}

function r6(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const caller = appRouter.createCaller(makeCtx());
  const buf = fs.readFileSync(XLSX_PATH);
  console.log(`tenant: ${TENANT}  file: ${XLSX_PATH}  (${buf.length} bytes)  mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);

  const preview: any = await caller.megaReportImport.preview({
    fileBase64: buf.toString("base64"),
    fileName: "المكونات.xlsx",
  });
  if (preview.kind !== "bom") throw new Error(`expected kind "bom", got "${preview.kind}"`);

  const docs: any[] = preview.bom;
  const unmatchedProducts = docs.filter((d) => d.productStatus !== "matched");
  const docsWithBadComps = docs.filter((d) => d.compUnmatched > 0);

  console.log("\n=== MATCHING (preview) ===");
  console.log(`products in file            : ${docs.length}`);
  console.log(`products matched by catalog : ${docs.length - unmatchedProducts.length}`);
  console.log(`products NOT matched        : ${unmatchedProducts.length}`);
  console.log(`component lines total       : ${preview.summary.lines}`);
  console.log(`docs with unmatched comps   : ${docsWithBadComps.length}`);

  if (unmatchedProducts.length) {
    console.log("\n-- unmatched products --");
    for (const d of unmatchedProducts) console.log(`   ${d.barcode || "-"}  ${d.product}`);
  }
  if (docsWithBadComps.length) {
    console.log("\n-- docs with unmatched components --");
    for (const d of docsWithBadComps) {
      console.log(`   ${d.barcode || "-"}  ${d.product}`);
      for (const c of d.components.filter((x: any) => x.status !== "matched"))
        console.log(`       · ${c.barcode || "-"}  ${c.name}  (qty ${c.requiredQty})`);
    }
  }

  const documents = docs
    .filter((d) => d.productId)
    .map((d) => ({
      productId: d.productId as number,
      lines: (d.components as any[])
        .filter((c) => c.itemId)
        .map((c) => ({ materialItemId: Number(c.itemId), quantityPerUnit: String(c.requiredQty || "0") }))
        .filter((l) => Number(l.quantityPerUnit) > 0),
    }))
    .filter((d) => d.lines.length > 0);

  const skippedZero: string[] = [];
  for (const d of docs) {
    for (const c of (d.components as any[])) {
      if (c.itemId && !(Number(c.requiredQty) > 0))
        skippedZero.push(`${d.barcode} ${d.product}  ·  ${c.barcode} ${c.name}  (qty "${c.requiredQty}")`);
    }
  }
  if (skippedZero.length) {
    console.log(`\n-- component lines skipped for qty<=0 (${skippedZero.length}) --`);
    for (const s of skippedZero) console.log(`   ${s}`);
  }
  console.log(`\ndocuments to commit         : ${documents.length}`);
  console.log(`component lines to write    : ${documents.reduce((s, d) => s + d.lines.length, 0)}`);

  if (process.env.DEBUG_PRODUCT_ID) {
    const target = Number(process.env.DEBUG_PRODUCT_ID);
    console.log(`\n=== DEBUG: raw excel docs matched to productId ${target} ===`);
    for (const d of docs) {
      if (d.productId === target) {
        console.log(JSON.stringify({ index: d.index, product: d.product, barcode: d.barcode, unit: d.unit, category: d.category }));
      }
    }
  }

  const db = await getDb();
  if (!db) throw new Error("no DB (DATABASE_URL?)");
  const itemById = new Map<number, any>(
    (await db.select().from(items).where(eq(items.tenantId, TENANT))).map((i) => [i.id, i]),
  );
  const beforeRows = await db.select().from(itemBomLines).where(eq(itemBomLines.tenantId, TENANT));
  const beforeByProd = new Map<number, Map<number, number>>();
  for (const b of beforeRows) {
    if (!beforeByProd.has(b.productId)) beforeByProd.set(b.productId, new Map());
    beforeByProd.get(b.productId)!.set(b.materialItemId, r6(b.quantityPerUnit));
  }

  let prodChanged = 0, lineQtyChanged = 0, lineAdded = 0, lineRemoved = 0;
  for (const doc of documents) {
    const before = beforeByProd.get(doc.productId) || new Map<number, number>();
    const nextMap = new Map<number, number>();
    for (const l of doc.lines) nextMap.set(l.materialItemId, (nextMap.get(l.materialItemId) || 0) + Number(l.quantityPerUnit));
    let thisChanged = false;
    for (const [mid, q] of nextMap) {
      if (!before.has(mid)) { lineAdded++; thisChanged = true; }
      else if (Math.abs(before.get(mid)! - q) > 1e-9) { lineQtyChanged++; thisChanged = true; }
    }
    for (const mid of before.keys()) if (!nextMap.has(mid)) { lineRemoved++; thisChanged = true; }
    if (thisChanged) {
      prodChanged++;
      const p = itemById.get(doc.productId);
      const details: string[] = [];
      for (const [mid, q] of nextMap) {
        const b = before.get(mid);
        if (b === undefined) details.push(`   + ${itemById.get(mid)?.name ?? mid}: ${q}`);
        else if (Math.abs(b - q) > 1e-9) details.push(`   ~ ${itemById.get(mid)?.name ?? mid}: ${b} → ${q}`);
      }
      for (const mid of before.keys()) if (!nextMap.has(mid)) details.push(`   - ${itemById.get(mid)?.name ?? mid}: ${before.get(mid)} (removed)`);
      console.log(`\n[${p?.barcode ?? "-"}] ${p?.name ?? doc.productId}`);
      for (const d of details) console.log(d);
    }
  }

  console.log("\n=== EXPECTED DELTA vs current DB ===");
  console.log(`products whose mix changes  : ${prodChanged}`);
  console.log(`  qty-corrected lines       : ${lineQtyChanged}`);
  console.log(`  lines added               : ${lineAdded}`);
  console.log(`  lines removed             : ${lineRemoved}`);

  if (!APPLY) {
    console.log("\nDRY-RUN — nothing written. add --apply to commit.");
    return;
  }
  if ((unmatchedProducts.length || docsWithBadComps.length) && !FORCE) {
    console.log("\nABORT: unmatched products/components present. re-run with --force to import only the matched parts.");
    process.exit(2);
  }

  console.log("\n=== COMMIT ===");
  const res = await caller.megaReportImport.commitBom({ documents });
  console.log(JSON.stringify(res, null, 2));

  const afterRows = await db.select().from(itemBomLines).where(eq(itemBomLines.tenantId, TENANT));
  console.log(`\nrows before: ${beforeRows.length}   rows after: ${afterRows.length}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
