#!/usr/bin/env node
/**
 * تفريغ بيانات أعمال مستأجر واحد — افتراضياً kam فقط.
 *
 *   DATABASE_URL=... npx tsx scripts/wipe-tenant.mjs --slug kam --confirm WIPE_KAM
 *   DATABASE_URL=... npx tsx scripts/wipe-tenant.mjs --slug kam --dry-run
 *
 * لا يمسّ Mega ولا أي مستأجر غير مسموح.
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
const confirm = arg("--confirm", "");
const dryRun = process.argv.includes("--dry-run");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

if (!dryRun && confirm !== `WIPE_${slug.toUpperCase()}`) {
  console.error(`للتنفيذ الفعلي مرّر: --confirm WIPE_${slug.toUpperCase()}`);
  console.error("أو استخدم --dry-run للعد فقط.");
  process.exit(1);
}

const { wipeTenantBusinessData } = await import("../server/tenant-wipe.ts");

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(conn);

try {
  const result = await wipeTenantBusinessData(db, slug, {
    allowedSlugs: ["kam"],
    dryRun,
  });
  console.log(dryRun ? "DRY RUN — counts only" : "WIPED");
  console.log(JSON.stringify(result, null, 2));
} finally {
  await conn.end();
}
