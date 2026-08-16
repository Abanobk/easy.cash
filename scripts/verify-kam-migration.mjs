#!/usr/bin/env node
/**
 * تحقق سريع من مسار الترحيل + عيّنة أتمتة على بيانات kam بعد الاستيراد.
 * لا يلمس Mega.
 *
 *   node scripts/inspect-mega-backup.mjs ./mega-kam-backup/sample-fixture
 *   DATABASE_URL=... npx tsx scripts/verify-kam-migration.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq, count } from "drizzle-orm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env") });

async function main() {
  const { buildPayloadFromMegaPath, summarizePayload } = await import("../server/mega-migrate.ts");
  const fixture = path.join(root, "mega-kam-backup", "sample-fixture");
  console.log("1) Inspect/build payload from fixture...");
  const payload = buildPayloadFromMegaPath(fixture);
  const summary = summarizePayload(payload);
  console.log("   Payload:", summary);
  const required = ["customers", "items", "accounts"];
  for (const k of required) {
    if (!summary[k]) throw new Error(`Fixture missing ${k}`);
  }
  console.log("   OK payload");

  if (!process.env.DATABASE_URL) {
    console.log("2) DATABASE_URL not set — skipping live DB checks.");
    console.log("DONE (offline checks passed)");
    return;
  }

  const { resolveTenantIdBySlug } = await import("../server/tenant-wipe.ts");
  const {
    customers, items, accounts, salesInvoices, journalEntries, bankAccounts,
  } = await import("../drizzle/schema.ts");

  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const db = drizzle(conn);
  try {
    console.log("2) Resolve tenant kam...");
    const tenant = await resolveTenantIdBySlug(db, "kam");
    if (!tenant) {
      console.warn("   Tenant kam not found in this DB — skip live counts.");
      console.log("DONE (payload OK; no kam tenant)");
      return;
    }
    console.log("   tenantId=", tenant.id);

    const tables = [
      ["customers", customers],
      ["items", items],
      ["accounts", accounts],
      ["salesInvoices", salesInvoices],
      ["journalEntries", journalEntries],
      ["bankAccounts", bankAccounts],
    ];
    console.log("3) Row counts for kam:");
    for (const [name, table] of tables) {
      const [row] = await db.select({ c: count() }).from(table).where(eq(table.tenantId, tenant.id));
      console.log(`   ${name}: ${row?.c ?? 0}`);
    }

    console.log("4) Automation smoke (bank sync)...");
    const { syncBankAccountsFromChart } = await import("../server/bank-accounts-sync.ts");
    const sync = await syncBankAccountsFromChart(db, tenant.id);
    console.log("   bank sync:", sync);

    console.log("DONE");
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
