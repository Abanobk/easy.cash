/**
 * يفحص: أي (موديول::عنصر) في الشجرة الجديدة معندهوش صف صراحة لأي دور حقيقي (غير admin)
 * — يعني لو قفلنا "مش متظبط = ممنوع"، العنصر ده هيتقفل تمامًا لكل الناس غير الأدمن.
 */
import { getDb } from "../server/db";
import { tenantEntityPermissions } from "../drizzle/schema";
import { PERMISSION_TREE_RESOLVED } from "../shared/permission-tree";
import { eq, ne } from "drizzle-orm";

const TENANT = Number(process.env.TENANT_ID || 2);

async function main() {
  const db = await getDb();
  if (!db) throw new Error("no DB");
  const rows = await db.select({
    role: tenantEntityPermissions.role,
    moduleKey: tenantEntityPermissions.moduleKey,
    entityKey: tenantEntityPermissions.entityKey,
    allowedActions: tenantEntityPermissions.allowedActions,
  }).from(tenantEntityPermissions).where(eq(tenantEntityPermissions.tenantId, TENANT));

  const configuredNonEmpty = new Set(
    rows.filter((r) => r.role !== "admin" && (r.allowedActions as string[])?.length > 0)
      .map((r) => `${r.moduleKey}::${r.entityKey}`),
  );
  const configuredAny = new Set(
    rows.filter((r) => r.role !== "admin").map((r) => `${r.moduleKey}::${r.entityKey}`),
  );

  let totalEntities = 0;
  const neverTouched: string[] = [];
  const onlyEmptyEverywhere: string[] = [];

  for (const mod of PERMISSION_TREE_RESOLVED) {
    for (const entity of mod.entities) {
      totalEntities++;
      const key = `${mod.key}::${entity.key}`;
      if (!configuredAny.has(key)) {
        neverTouched.push(key);
      } else if (!configuredNonEmpty.has(key)) {
        onlyEmptyEverywhere.push(key);
      }
    }
  }

  console.log(`total entities in tree: ${totalEntities}`);
  console.log(`\n=== NEVER TOUCHED by any non-admin role (${neverTouched.length}) — would be fully locked for everyone except admin ===`);
  for (const k of neverTouched) console.log(`  ${k}`);

  console.log(`\n=== configured but ZERO actions for every role that has it (${onlyEmptyEverywhere.length}) — already effectively locked, no change ===`);
  for (const k of onlyEmptyEverywhere) console.log(`  ${k}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
