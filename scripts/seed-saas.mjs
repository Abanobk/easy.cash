/**
 * Seed script: Creates Super Admin account and default subscription plans.
 * Run with: node scripts/seed-saas.mjs
 */

import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const SUPER_ADMIN_EMAIL = "admin@easycash.app";
const SUPER_ADMIN_PASSWORD = "EasyCash@2024";
const SUPER_ADMIN_NAME = "Super Admin";

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);

  try {
    console.log("🔧 Seeding SaaS data...");

    // 1. Insert default subscription plans
    const plans = [
      { name: "trial", nameAr: "تجريبي مجاني", price: "0", durationDays: 14, maxUsers: 2, maxInvoices: 50, features: "جميع الميزات الأساسية" },
      { name: "monthly", nameAr: "الخطة الشهرية", price: "299", durationDays: 30, maxUsers: 5, maxInvoices: 500, features: "جميع الميزات + الدعم الفني" },
      { name: "yearly", nameAr: "الخطة السنوية", price: "2499", durationDays: 365, maxUsers: 20, maxInvoices: 99999, features: "جميع الميزات + الدعم الفني + تقارير متقدمة" },
    ];

    for (const plan of plans) {
      const [existing] = await conn.execute("SELECT id FROM subscription_plans WHERE name = ?", [plan.name]);
      if (existing.length === 0) {
        await conn.execute(
          "INSERT INTO subscription_plans (name, nameAr, price, currency, durationDays, maxUsers, maxInvoices, features, isActive) VALUES (?, ?, ?, 'EGP', ?, ?, ?, ?, 1)",
          [plan.name, plan.nameAr, plan.price, plan.durationDays, plan.maxUsers, plan.maxInvoices, plan.features]
        );
        console.log(`✅ Plan created: ${plan.nameAr}`);
      } else {
        console.log(`⏭️  Plan already exists: ${plan.nameAr}`);
      }
    }

    // 2. Create Super Admin account
    const [existingAdmin] = await conn.execute("SELECT id FROM app_users WHERE email = ?", [SUPER_ADMIN_EMAIL]);
    if (existingAdmin.length === 0) {
      const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);
      await conn.execute(
        "INSERT INTO app_users (name, email, passwordHash, role, isActive, companyName) VALUES (?, ?, ?, 'superadmin', 1, 'Easy Cash System')",
        [SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, passwordHash]
      );
      console.log(`✅ Super Admin created: ${SUPER_ADMIN_EMAIL}`);
      console.log(`🔑 Password: ${SUPER_ADMIN_PASSWORD}`);
    } else {
      console.log(`⏭️  Super Admin already exists: ${SUPER_ADMIN_EMAIL}`);
    }

    console.log("\n🎉 Seeding complete!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`📧 Super Admin Email: ${SUPER_ADMIN_EMAIL}`);
    console.log(`🔑 Super Admin Password: ${SUPER_ADMIN_PASSWORD}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  } finally {
    await conn.end();
  }
}

main().catch(console.error);
