/**
 * ينشئ tenant لكل مالك حساب قديم بدون شركة مرتبطة.
 * Usage: node scripts/migrate-existing-tenants.mjs
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

function slugify(name) {
  const base = String(name || "company")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u0600-\u06FF-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "company";
}

async function ensureSlug(conn, base) {
  let slug = slugify(base);
  let n = 0;
  while (true) {
    const candidate = n ? `${slug}-${n}` : slug;
    const [rows] = await conn.query("SELECT id FROM tenants WHERE slug = ?", [candidate]);
    if (!rows.length) return candidate;
    n += 1;
  }
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  const [owners] = await conn.query(
    `SELECT id, name, companyName, tenantId FROM app_users
     WHERE role != 'superadmin' AND ownerUserId IS NULL AND (tenantId IS NULL OR tenantId = 0)`
  );

  for (const owner of owners) {
    const slug = await ensureSlug(conn, owner.companyName || owner.name);
    const name = owner.companyName || owner.name;
    const [result] = await conn.query(
      "INSERT INTO tenants (slug, name, ownerUserId, isActive) VALUES (?, ?, ?, 1)",
      [slug, name, owner.id]
    );
    const tenantId = result.insertId;
    await conn.query("UPDATE app_users SET tenantId = ? WHERE id = ? OR ownerUserId = ?", [tenantId, owner.id, owner.id]);
    await conn.query("UPDATE subscriptions SET tenantId = ? WHERE userId = ?", [tenantId, owner.id]);
    console.log(`Created tenant /${slug} for user #${owner.id} (${name})`);
  }

  await conn.end();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
