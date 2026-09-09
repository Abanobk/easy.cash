#!/usr/bin/env node
/**
 * تنظيف فواتير المبيعات المكرّرة الناتجة عن الضغط على «اعتماد» أكثر من مرة
 * في شاشة استيراد تقارير Excel.
 *
 * لكل فاتورة مكرّرة يتم:
 *   1) إرجاع كميات البنود للمخزون  (item_warehouse_stock + items.currentStock)
 *   2) إلغاء القيد المحاسبي        (journal_entries: status=cancelled, reference=<ref>-VOID-<id>)
 *   3) حذف الفاتورة وبنودها        (batches / taxes / expenses / items / invoice)
 * يُحتفظ بأقدم فاتورة في كل مجموعة (أقل id).
 *
 * آمن افتراضيًا: يعمل DRY-RUN ويطبع كل حاجة من غير ما يكتب. الكتابة تحصل فقط مع --apply،
 * وكلها داخل transaction واحدة (لو حصل أي خطأ يترجّع كله).
 * قبل أي كتابة بيحفظ نسخة كاملة من كل صف هيتغيّر في ملف JSON.
 *
 * التشغيل (جوّه حاوية التطبيق على السيرفر — فيها mysql2 ومتغيّرات MYSQL_*):
 *   docker cp scripts/cleanup-duplicate-sales-invoices.mjs easy-cash-app:/tmp/cleanup.mjs
 *   docker exec -it easy-cash-app node /tmp/cleanup.mjs --tenant <ID>            # معاينة
 *   docker exec -it easy-cash-app node /tmp/cleanup.mjs --tenant <ID> --apply    # تنفيذ
 *
 * أو من أي مكان فيه Node + الحزمة mysql2 مع تمرير الاتصال:
 *   DATABASE_URL='mysql://user:pass@host:3306/easy_cash' node scripts/cleanup-duplicate-sales-invoices.mjs --tenant <ID>
 *
 * خيارات:
 *   --tenant <id>       (إلزامي) رقم الشركة (tenantId).
 *   --apply             نفّذ فعليًا. من غيره = معاينة فقط.
 *   --ids 45,46,47      احذف هذه الفواتير بالتحديد (يتخطّى الاكتشاف التلقائي).
 *   --number-like 'SI-%'  فلتر إضافي في وضع الاكتشاف التلقائي.
 *   --only-imported     في الاكتشاف التلقائي: اقتصر على الفواتير الآتية من الاستيراد
 *                       (notes تبدأ بـ "مستورد"). مفعّل افتراضيًا؛ --no-only-imported لإلغائه.
 *   --allow-closed      اسمح بالحذف حتى لو تاريخ الفاتورة في سنة مالية مقفولة.
 *   --out <path>        مسار ملف الـ backup (افتراضي: /tmp/dup-sales-cleanup-<ts>.json).
 */
import { createRequire } from "node:module";
import fs from "node:fs";

let mysql;
{
  const bases = [
    import.meta.url,
    `file://${process.cwd()}/`,
    "file:///app/",
    "file:///app/node_modules/",
  ];
  for (const b of bases) {
    try { mysql = createRequire(b)("mysql2/promise"); break; } catch { /* try next */ }
  }
  if (!mysql) {
    console.error("mysql2 غير متاح. شغّل السكربت جوّه حاوية easy-cash-app (فيها الحزمة)، أو مرّر --prefix لمكان node_modules.");
    process.exit(1);
  }
}

// ---------- args ----------
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const APPLY = has("--apply");
const TENANT = Number(val("--tenant", ""));
const EXPLICIT_IDS = (val("--ids", "") || "").split(",").map((s) => Number(s.trim())).filter(Boolean);
const NUMBER_LIKE = val("--number-like", null);
const ONLY_IMPORTED = has("--no-only-imported") ? false : true;
const ALLOW_CLOSED = has("--allow-closed");
const OUT = val("--out", `/tmp/dup-sales-cleanup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

if (!TENANT || Number.isNaN(TENANT)) {
  console.error("لازم تمرّر --tenant <id>");
  process.exit(1);
}

// ---------- connection ----------
function connOpts() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: Number(u.port || 3306),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, ""),
      multipleStatements: false,
    };
  }
  return {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "easy_cash",
    multipleStatements: false,
  };
}

const money = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ymd = (d) => {
  if (d == null) return "";
  const s = String(d);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? s : t.toISOString().slice(0, 10);
};

async function main() {
  const db = await mysql.createConnection(connOpts());
  console.log(`# متصل بـ ${connOpts().database} — tenant ${TENANT} — الوضع: ${APPLY ? "تنفيذ (APPLY)" : "معاينة (DRY-RUN)"}`);

  // 1) حدّد الفواتير المستهدفة
  let targets = []; // [{keepId, keepNumber, dupIds:[...], groupLabel}]
  if (EXPLICIT_IDS.length) {
    const [rows] = await db.query(
      `SELECT id, number, customerId, DATE(date) d, total, status FROM sales_invoices
       WHERE tenantId = ? AND id IN (${EXPLICIT_IDS.map(() => "?").join(",")})`,
      [TENANT, ...EXPLICIT_IDS],
    );
    const missing = EXPLICIT_IDS.filter((id) => !rows.some((r) => r.id === id));
    if (missing.length) console.log(`⚠️  ids مش موجودة في tenant ${TENANT}: ${missing.join(", ")}`);
    const skipped = rows.filter((r) => !["paid", "confirmed", "partial"].includes(r.status));
    for (const r of skipped) console.log(`⚠️  ${r.number} (#${r.id}) حالتها "${r.status}" — مش معتمدة، هتتخطّى`);
    const usable = rows.filter((r) => ["paid", "confirmed", "partial"].includes(r.status));
    if (!usable.length) { console.log("مفيش فواتير صالحة للحذف في القائمة."); await db.end(); return; }
    console.log("⚠️  وضع --ids: بيحذف بالظبط الفواتير المذكورة — مش بيحتفظ بأي نسخة تلقائيًا.");
    targets.push({
      keepId: null, keepNumber: null,
      dupIds: usable.map((r) => r.id),
      groupLabel: `ids يدوية: ${usable.map((r) => `${r.number}(#${r.id})`).join(", ")}`,
    });
  } else {
    const filters = ["si.tenantId = ?", "si.status IN ('paid','confirmed','partial')"];
    const params = [TENANT];
    if (ONLY_IMPORTED) filters.push("(si.notes LIKE 'مستورد%' OR si.notes LIKE '%مستورد من تقرير%')");
    if (NUMBER_LIKE) { filters.push("si.number LIKE ?"); params.push(NUMBER_LIKE); }

    const [rows] = await db.query(
      `SELECT si.id, si.number, si.customerId, DATE(si.date) d, si.total, si.paymentType, si.notes,
              COALESCE(GROUP_CONCAT(CONCAT_WS(':', sii.itemId, sii.quantity, sii.price, sii.total)
                       ORDER BY sii.itemId, sii.id SEPARATOR '|'), '') AS sig
       FROM sales_invoices si
       LEFT JOIN sales_invoice_items sii ON sii.invoiceId = si.id AND sii.tenantId = si.tenantId
       WHERE ${filters.join(" AND ")}
       GROUP BY si.id
       ORDER BY si.id`,
      params,
    );
    const groups = new Map();
    for (const r of rows) {
      const key = `${r.customerId}|${r.d}|${Number(r.total).toFixed(2)}|${r.sig}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    for (const [key, list] of groups) {
      if (list.length < 2) continue;
      list.sort((a, b) => a.id - b.id);
      const keep = list[0];
      targets.push({
        keepId: keep.id,
        keepNumber: keep.number,
        dupIds: list.slice(1).map((r) => r.id),
        groupLabel: `عميل ${keep.customerId} · ${ymd(keep.d)} · إجمالي ${money(keep.total)} · ${list.length} نسخ`,
      });
    }
  }

  const allDupIds = [...new Set(targets.flatMap((t) => t.dupIds))];
  if (!allDupIds.length) {
    console.log("مفيش فواتير مكرّرة مطابقة للمعايير. مفيش حاجة تتعمل.");
    await db.end();
    return;
  }

  // 2) اقرأ كل التفاصيل + افحص السنة المقفولة
  const [invRows] = await db.query(
    `SELECT * FROM sales_invoices WHERE tenantId = ? AND id IN (${allDupIds.map(() => "?").join(",")})`,
    [TENANT, ...allDupIds],
  );
  const [itemRows] = await db.query(
    `SELECT * FROM sales_invoice_items WHERE tenantId = ? AND invoiceId IN (${allDupIds.map(() => "?").join(",")})`,
    [TENANT, ...allDupIds],
  );
  const invItemIds = itemRows.map((r) => r.id);
  const [batchRows] = invItemIds.length
    ? await db.query(`SELECT * FROM sales_invoice_item_batches WHERE tenantId = ? AND invoiceItemId IN (${invItemIds.map(() => "?").join(",")})`, [TENANT, ...invItemIds])
    : [[]];
  const [taxRows] = await db.query(`SELECT * FROM sales_invoice_taxes WHERE tenantId = ? AND invoiceId IN (${allDupIds.map(() => "?").join(",")})`, [TENANT, ...allDupIds]);
  const [expRows] = await db.query(`SELECT * FROM sales_invoice_expenses WHERE tenantId = ? AND invoiceId IN (${allDupIds.map(() => "?").join(",")})`, [TENANT, ...allDupIds]);

  const invById = new Map(invRows.map((r) => [r.id, r]));
  const itemsByInv = new Map();
  for (const r of itemRows) {
    if (!itemsByInv.has(r.invoiceId)) itemsByInv.set(r.invoiceId, []);
    itemsByInv.get(r.invoiceId).push(r);
  }

  // القيود المرتبطة (reference = number أو number-COGS)
  const refs = [];
  for (const inv of invRows) { refs.push(inv.number, `${inv.number}-COGS`); }
  const [jeRows] = await db.query(
    `SELECT id, number, reference, status, date FROM journal_entries
     WHERE tenantId = ? AND status <> 'cancelled' AND reference IN (${refs.map(() => "?").join(",")})`,
    [TENANT, ...refs],
  );
  const jeIds = jeRows.map((r) => r.id);
  const [jelRows] = jeIds.length
    ? await db.query(`SELECT * FROM journal_entry_lines WHERE tenantId = ? AND entryId IN (${jeIds.map(() => "?").join(",")})`, [TENANT, ...jeIds])
    : [[]];

  // فحص السنة المقفولة
  const [closedYears] = await db.query(
    `SELECT startDate, endDate, name FROM fiscal_years WHERE tenantId = ? AND status = 'closed'`,
    [TENANT],
  );
  const inClosed = (d) => closedYears.some((y) => {
    const t = new Date(d).getTime();
    return t >= new Date(y.startDate).getTime() && t <= new Date(y.endDate).getTime();
  });
  const closedHits = invRows.filter((r) => inClosed(r.date));

  // 3) اطبع الخطة
  console.log("\n================= الخطة =================");
  for (const t of targets) {
    console.log(`\n• ${t.groupLabel}`);
    if (t.keepId) console.log(`   نحتفظ بـ : ${t.keepNumber} (#${t.keepId})`);
    for (const id of t.dupIds) {
      const inv = invById.get(id);
      const its = itemsByInv.get(id) || [];
      console.log(`   نحذف   : ${inv.number} (#${id}) — ${inv.paymentType} — ${ymd(inv.date)} — إجمالي ${money(inv.total)} — ${its.length} بند`);
    }
  }

  const creditTargets = invRows.filter((r) => r.paymentType !== "cash");
  const stockLineCount = itemRows.length;
  console.log("\n================= الملخص =================");
  console.log(`فواتير هتتحذف        : ${allDupIds.length}`);
  console.log(`بنود هترجع للمخزون    : ${stockLineCount}`);
  console.log(`قيود هتتلغى          : ${jeRows.length}`);
  if (creditTargets.length) {
    console.log(`\n⚠️  ${creditTargets.length} فاتورة منها آجلة (مش نقدي) — دي بتأثّر على رصيد العميل`);
    console.log(`   ومحتاجة إعادة حساب رصيد بعد الحذف. السكربت هيقف.`);
    console.log(`   استبعدها بـ --ids للنقدي بس، أو كلّمني أظبط إعادة حساب الرصيد.`);
    await db.end();
    return;
  }
  if (closedHits.length && !ALLOW_CLOSED) {
    console.log(`\n⛔ ${closedHits.length} فاتورة تاريخها في سنة مالية مقفولة:`);
    for (const r of closedHits) console.log(`   ${r.number} — ${ymd(r.date)}`);
    console.log(`   لو متأكد ضيف --allow-closed. السكربت وقف.`);
    await db.end();
    return;
  }

  // 4) backup كامل قبل أي كتابة
  const backup = {
    generatedAt: new Date().toISOString(),
    tenantId: TENANT,
    mode: APPLY ? "apply" : "dry-run",
    deletedInvoiceIds: allDupIds,
    sales_invoices: invRows,
    sales_invoice_items: itemRows,
    sales_invoice_item_batches: batchRows,
    sales_invoice_taxes: taxRows,
    sales_invoice_expenses: expRows,
    journal_entries: jeRows,
    journal_entry_lines: jelRows,
  };
  fs.writeFileSync(OUT, JSON.stringify(backup, null, 2), "utf8");
  console.log(`\n💾 نسخة احتياطية للصفوف المتأثرة: ${OUT}`);

  if (!APPLY) {
    console.log("\nمعاينة فقط — مفيش أي تغيير. ضيف --apply للتنفيذ.");
    await db.end();
    return;
  }

  // 5) تنفيذ داخل transaction
  console.log("\n================= تنفيذ =================");
  await db.beginTransaction();
  try {
    let stockReturned = 0;
    const touchedItemWh = new Set();
    for (const inv of invRows) {
      const its = itemsByInv.get(inv.id) || [];
      for (const line of its) {
        const wh = line.warehouseId ?? inv.warehouseId;
        if (!wh) throw new Error(`فاتورة ${inv.number}: بند بلا مخزن — مش قادر أرجّع المخزون بأمان`);
        const qty = String(line.quantity);
        const [u] = await db.execute(
          `UPDATE item_warehouse_stock SET quantity = quantity + ?
           WHERE tenantId = ? AND itemId = ? AND warehouseId = ?`,
          [qty, TENANT, line.itemId, wh],
        );
        if (!u.affectedRows) {
          await db.execute(
            `INSERT INTO item_warehouse_stock (tenantId, itemId, warehouseId, quantity) VALUES (?, ?, ?, ?)`,
            [TENANT, line.itemId, wh, qty],
          );
        }
        touchedItemWh.add(line.itemId);
        stockReturned++;
      }
    }
    // إعادة احتساب items.currentStock للأصناف المتأثرة (زي ما البرنامج بيعمل)
    for (const itemId of touchedItemWh) {
      await db.execute(
        `UPDATE items SET currentStock = (
           SELECT COALESCE(SUM(iws.quantity), 0) FROM item_warehouse_stock iws
           WHERE iws.tenantId = ? AND iws.itemId = ?
         ) WHERE tenantId = ? AND id = ?`,
        [TENANT, itemId, TENANT, itemId],
      );
    }

    // إلغاء القيود
    let jeCancelled = 0;
    for (const je of jeRows) {
      const [c] = await db.execute(
        `UPDATE journal_entries SET status = 'cancelled', reference = CONCAT(reference, '-VOID-', id)
         WHERE tenantId = ? AND id = ? AND status <> 'cancelled'`,
        [TENANT, je.id],
      );
      if (c.affectedRows) jeCancelled++;
    }

    // حذف الفواتير وتوابعها
    const inList = allDupIds.map(() => "?").join(",");
    if (invItemIds.length) {
      await db.execute(
        `DELETE FROM sales_invoice_item_batches WHERE tenantId = ? AND invoiceItemId IN (${invItemIds.map(() => "?").join(",")})`,
        [TENANT, ...invItemIds],
      );
    }
    await db.execute(`DELETE FROM sales_invoice_taxes    WHERE tenantId = ? AND invoiceId IN (${inList})`, [TENANT, ...allDupIds]);
    await db.execute(`DELETE FROM sales_invoice_expenses WHERE tenantId = ? AND invoiceId IN (${inList})`, [TENANT, ...allDupIds]);
    await db.execute(`DELETE FROM sales_invoice_items    WHERE tenantId = ? AND invoiceId IN (${inList})`, [TENANT, ...allDupIds]);
    const [d] = await db.execute(`DELETE FROM sales_invoices WHERE tenantId = ? AND id IN (${inList})`, [TENANT, ...allDupIds]);

    await db.commit();
    console.log(`✅ تم:`);
    console.log(`   فواتير محذوفة   : ${d.affectedRows}`);
    console.log(`   بنود رجعت للمخزون: ${stockReturned}`);
    console.log(`   قيود اتلغت      : ${jeCancelled}`);
    console.log(`   backup          : ${OUT}`);
  } catch (e) {
    await db.rollback();
    console.error(`\n❌ خطأ — تم التراجع عن كل شيء (rollback). مفيش حاجة اتغيّرت.`);
    console.error(e);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
