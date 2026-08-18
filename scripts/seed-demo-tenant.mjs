#!/usr/bin/env node
/**
 * تعبئة تينانت تجريبي محلي ببيانات وهمية واقعية (عملاء/موردين/أصناف/فواتير/شيكات/موظفين/سجل نشاط)
 * عشان معاينة تصميم الداشبورد بأرقام حقيقية الشكل — بدون لمس أي تينانت حقيقي.
 *
 * محلي فقط. لا يعمل إلا لو DATABASE_URL يشير لقاعدة بيانات محلية.
 *
 *   DATABASE_URL=... node scripts/seed-demo-tenant.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
if (!/localhost|127\.0\.0\.1|easy-cash-mysql|mysql:3306/.test(DATABASE_URL)) {
  console.error("رفض: هذا السكربت يعمل فقط على قاعدة بيانات محلية (DATABASE_URL يجب أن يشير لـ localhost/127.0.0.1/easy-cash-mysql).");
  process.exit(1);
}

const SLUG = "demo";
const TENANT_NAME = "شركة المعاينة التجريبية";
const OWNER_EMAIL = "demo@easycash.local";
const OWNER_PASSWORD = "Demo@12345";

function d(offsetDays) {
  const dt = new Date();
  dt.setDate(dt.getDate() + offsetDays);
  return dt.toISOString().slice(0, 10);
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  try {
    console.log("Cleaning previous demo tenant (if any)...");
    const [existingTenantRows] = await conn.execute("SELECT id FROM tenants WHERE slug = ?", [SLUG]);
    if (existingTenantRows.length > 0) {
      const tid = existingTenantRows[0].id;
      const tables = [
        "sales_invoice_items", "sales_invoices", "purchase_invoice_items", "purchase_invoices",
        "checks", "user_activities", "employees", "customers", "suppliers", "items", "warehouses",
        "company_settings",
      ];
      for (const t of tables) {
        await conn.execute(`DELETE FROM ${t} WHERE tenantId = ?`, [tid]);
      }
      await conn.execute("DELETE FROM subscriptions WHERE tenantId = ?", [tid]);
      await conn.execute("DELETE FROM app_users WHERE tenantId = ?", [tid]);
      await conn.execute("DELETE FROM tenants WHERE id = ?", [tid]);
    }

    console.log("Creating demo tenant + owner account...");
    const [tenantRes] = await conn.execute(
      "INSERT INTO tenants (slug, name, isActive) VALUES (?, ?, 1)",
      [SLUG, TENANT_NAME]
    );
    const tenantId = tenantRes.insertId;

    const passwordHash = await bcrypt.hash(OWNER_PASSWORD, 10);
    const [userRes] = await conn.execute(
      "INSERT INTO app_users (name, email, passwordHash, role, isActive, companyName, tenantId) VALUES (?, ?, ?, 'admin', 1, ?, ?)",
      ["مستخدم المعاينة", OWNER_EMAIL, passwordHash, TENANT_NAME, tenantId]
    );
    const userId = userRes.insertId;

    await conn.execute("UPDATE tenants SET ownerUserId = ? WHERE id = ?", [userId, tenantId]);

    const [planRows] = await conn.execute("SELECT id FROM subscription_plans WHERE name = 'yearly' LIMIT 1");
    const planId = planRows[0]?.id ?? null;
    if (planId) {
      await conn.execute(
        "INSERT INTO subscriptions (tenantId, userId, planId, status, startDate, endDate) VALUES (?, ?, ?, 'active', ?, ?)",
        [tenantId, userId, planId, d(-30), d(335)]
      );
    }

    await conn.execute(
      "INSERT INTO company_settings (tenantId, name, currency) VALUES (?, ?, 'EGP')",
      [tenantId, TENANT_NAME]
    );

    console.log("Seeding warehouses, items, customers, suppliers, employees...");
    const [wh1] = await conn.execute("INSERT INTO warehouses (tenantId, name) VALUES (?, ?)", [tenantId, "المخزن الرئيسي"]);
    const [wh2] = await conn.execute("INSERT INTO warehouses (tenantId, name) VALUES (?, ?)", [tenantId, "مخزن الفرع"]);
    const warehouseIds = [wh1.insertId, wh2.insertId];

    const itemDefs = [
      ["زيت عباد الشمس 1 لتر", "ITM-001", 45, 60],
      ["أرز أبيض 5 كجم", "ITM-002", 90, 120],
      ["سكر 1 كجم", "ITM-003", 22, 30],
      ["دقيق فاخر 1 كجم", "ITM-004", 18, 25],
      ["معلبات طماطم 400 جم", "ITM-005", 12, 18],
      ["مياه معدنية 1.5 لتر (كرتونة)", "ITM-006", 55, 75],
      ["شاي فاخر 100 كيس", "ITM-007", 35, 50],
      ["منظف أطباق 750 مل", "ITM-008", 20, 32],
    ];
    const itemIds = [];
    for (const [name, code, cost, price] of itemDefs) {
      const [r] = await conn.execute(
        "INSERT INTO items (tenantId, code, name, unit, purchasePrice, averageCost, salePrice, minStock, currentStock) VALUES (?, ?, ?, 'قطعة', ?, ?, ?, 10, ?)",
        [tenantId, code, name, cost, cost, price, rnd(3, 60)]
      );
      itemIds.push(r.insertId);
    }

    const customerNames = ["سوبر ماركت النور", "بقالة الأمانة", "هايبر الخير", "مؤسسة الرحمة التجارية", "معرض بيت العائلة"];
    const customerIds = [];
    for (const name of customerNames) {
      const [r] = await conn.execute(
        "INSERT INTO customers (tenantId, name, phone, city, creditLimit) VALUES (?, ?, ?, 'القاهرة', 50000)",
        [tenantId, name, `010${rnd(10000000, 99999999)}`]
      );
      customerIds.push(r.insertId);
    }

    const supplierNames = ["مصنع الدلتا للزيوت", "شركة النيل للمواد الغذائية", "مطاحن الصعيد", "مجموعة الفا للتوزيع"];
    const supplierIds = [];
    for (const name of supplierNames) {
      const [r] = await conn.execute(
        "INSERT INTO suppliers (tenantId, name, phone, city) VALUES (?, ?, ?, 'القاهرة')",
        [tenantId, name, `011${rnd(10000000, 99999999)}`]
      );
      supplierIds.push(r.insertId);
    }

    const employeeNames = ["محمد عبد الله", "سارة أحمد", "كريم حسن", "منى سيد"];
    for (const name of employeeNames) {
      await conn.execute(
        "INSERT INTO employees (tenantId, name, basicSalary, status, hireDate) VALUES (?, ?, ?, 'active', ?)",
        [tenantId, name, rnd(4000, 9000), d(-rnd(60, 800))]
      );
    }

    console.log("Seeding sales invoices (last 6 months)...");
    const salesStatuses = ["confirmed", "paid", "partial", "confirmed", "paid", "draft"];
    let n = 1;
    for (let m = 5; m >= 0; m--) {
      const invoicesThisMonth = m === 0 ? 5 : rnd(2, 4);
      for (let i = 0; i < invoicesThisMonth; i++) {
        const status = m === 0 ? pick(["confirmed", "paid", "partial"]) : pick(salesStatuses);
        const dayOffset = -(m * 30 + rnd(0, 27));
        const custId = pick(customerIds);
        const lineCount = rnd(1, 3);
        let subtotal = 0;
        const lines = [];
        for (let l = 0; l < lineCount; l++) {
          const itemId = pick(itemIds);
          const [[itemRow]] = await conn.query("SELECT salePrice FROM items WHERE id = ?", [itemId]);
          const price = Number(itemRow.salePrice);
          const qty = rnd(2, 15);
          const total = price * qty;
          subtotal += total;
          lines.push({ itemId, qty, price, total });
        }
        const total = subtotal;
        const paid = status === "paid" ? total : status === "partial" ? Math.round(total * 0.5) : 0;
        const remaining = total - paid;
        const number = `INV-${String(n).padStart(4, "0")}`;
        n++;
        const [invRes] = await conn.execute(
          `INSERT INTO sales_invoices
            (tenantId, number, customerId, date, warehouseId, paymentType, subtotal, discount, tax, total, paid, remaining, status, createdAt)
           VALUES (?, ?, ?, ?, ?, 'credit', ?, 0, 0, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
          [tenantId, number, custId, d(dayOffset), pick(warehouseIds), subtotal, total, paid, remaining, status, dayOffset]
        );
        const invoiceId = invRes.insertId;
        for (const line of lines) {
          await conn.execute(
            "INSERT INTO sales_invoice_items (tenantId, invoiceId, itemId, quantity, price, total) VALUES (?, ?, ?, ?, ?, ?)",
            [tenantId, invoiceId, line.itemId, line.qty, line.price, line.total]
          );
        }
      }
    }

    console.log("Seeding purchase invoices...");
    const purchaseStatuses = ["confirmed", "paid", "partial", "confirmed"];
    let pn = 1;
    for (let m = 5; m >= 0; m--) {
      const invoicesThisMonth = rnd(1, 3);
      for (let i = 0; i < invoicesThisMonth; i++) {
        const status = pick(purchaseStatuses);
        const dayOffset = -(m * 30 + rnd(0, 27));
        const supId = pick(supplierIds);
        const lineCount = rnd(1, 3);
        let subtotal = 0;
        const lines = [];
        for (let l = 0; l < lineCount; l++) {
          const itemId = pick(itemIds);
          const [[itemRow]] = await conn.query("SELECT purchasePrice FROM items WHERE id = ?", [itemId]);
          const price = Number(itemRow.purchasePrice);
          const qty = rnd(10, 40);
          const total = price * qty;
          subtotal += total;
          lines.push({ itemId, qty, price, total });
        }
        const total = subtotal;
        const paid = status === "paid" ? total : status === "partial" ? Math.round(total * 0.5) : 0;
        const remaining = total - paid;
        const number = `PINV-${String(pn).padStart(4, "0")}`;
        pn++;
        const [invRes] = await conn.execute(
          `INSERT INTO purchase_invoices
            (tenantId, number, supplierId, date, warehouseId, paymentType, subtotal, discount, tax, total, paid, remaining, status, createdAt)
           VALUES (?, ?, ?, ?, ?, 'credit', ?, 0, 0, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
          [tenantId, number, supId, d(dayOffset), pick(warehouseIds), subtotal, total, paid, remaining, status, dayOffset]
        );
        const invoiceId = invRes.insertId;
        for (const line of lines) {
          await conn.execute(
            "INSERT INTO purchase_invoice_items (tenantId, invoiceId, itemId, quantity, price, total) VALUES (?, ?, ?, ?, ?, ?)",
            [tenantId, invoiceId, line.itemId, line.qty, line.price, line.total]
          );
        }
      }
    }

    console.log("Seeding checks...");
    for (let i = 0; i < 5; i++) {
      const isPending = i < 3;
      await conn.execute(
        `INSERT INTO checks (tenantId, number, checkNumber, type, customerId, amount, dueDate, date, status)
         VALUES (?, ?, ?, 'incoming', ?, ?, ?, ?, ?)`,
        [tenantId, `CHK-${1000 + i}`, String(rnd(100000, 999999)), pick(customerIds), rnd(2000, 15000), d(rnd(-10, 20)), d(-rnd(5, 40)), isPending ? "pending" : "cleared"]
      );
    }

    console.log("Seeding recent activity log...");
    const actions = ["create", "update", "pay", "approve", "print", "login", "import"];
    const actors = ["مستخدم المعاينة", "سارة أحمد", "كريم حسن"];
    for (let i = 0; i < 10; i++) {
      await conn.execute(
        "INSERT INTO user_activities (tenantId, userId, userName, action, details, createdAt) VALUES (?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? MINUTE))",
        [tenantId, userId, pick(actors), pick(actions), "فاتورة بيع رقم INV-0012", rnd(2, 4000)]
      );
    }

    console.log("\nDONE");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Tenant slug: ${SLUG}`);
    console.log(`Login URL:   http://127.0.0.1:8099/${SLUG}/login`);
    console.log(`Email:       ${OWNER_EMAIL}`);
    console.log(`Password:    ${OWNER_PASSWORD}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
