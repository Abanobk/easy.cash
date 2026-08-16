#!/usr/bin/env node
/**
 * استيراد باكب Mega (نسخة ملفات) → مستأجر Easy Cash (افتراضي kam).
 *
 *   DATABASE_URL=... npx tsx scripts/import-mega-to-tenant.mjs --slug kam --file ./mega-kam-backup --wipe
 *
 * --wipe يتطلب --confirm WIPE_KAM
 * لا يلمس برنامج Mega الحي.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const slug = arg("--slug", "kam");
const file = arg("--file", path.join(root, "mega-kam-backup"));
const doWipe = process.argv.includes("--wipe");
const confirm = arg("--confirm", "");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const { resolveTenantIdBySlug, wipeTenantBusinessData } = await import("../server/tenant-wipe.ts");
const { buildPayloadFromMegaPath, summarizePayload } = await import("../server/mega-migrate.ts");
const { fullRestoreToTenant } = await import("../server/full-restore.ts");
const { syncBankAccountsFromChart } = await import("../server/bank-accounts-sync.ts");

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(conn);

try {
  const tenant = await resolveTenantIdBySlug(db, slug);
  if (!tenant) {
    console.error(`Tenant not found: ${slug}`);
    process.exit(1);
  }
  if (slug !== "kam") {
    console.error("This script is locked to slug=kam for safety on first release.");
    process.exit(1);
  }

  console.log("Building payload from", file);
  const payload = buildPayloadFromMegaPath(file);
  console.log("Payload summary:", summarizePayload(payload));

  if (doWipe) {
    if (confirm !== "WIPE_KAM") {
      console.error("مع --wipe يجب --confirm WIPE_KAM");
      process.exit(1);
    }
    console.log("Wiping kam business data...");
    const wipe = await wipeTenantBusinessData(db, "kam", { allowedSlugs: ["kam"] });
    console.log("Wipe done. Tables touched:", Object.keys(wipe.deleted).length);
  }

  console.log("Restoring into tenant", tenant.id, tenant.slug);
  const report = await fullRestoreToTenant(db, tenant.id, payload);
  console.log("Import counts:", report.imported);
  console.log("Errors:", report.errors.length);
  if (report.errors.length) {
    console.log(report.errors.slice(0, 30));
  }

  try {
    const sync = await syncBankAccountsFromChart(db, tenant.id);
    console.log("Bank sync from chart:", sync);
  } catch (e) {
    console.warn("Bank sync skipped:", e?.message || e);
  }

  console.log("DONE");
} finally {
  await conn.end();
}
