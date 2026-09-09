/**
 * يرحّل صلاحيات الأدوار من النظام القديم (tenant_role_permissions: قسم × 4 أفعال)
 * إلى صفوف صريحة في الشجرة الجديدة (tenant_entity_permissions) — تمهيدًا لإلغاء
 * الاعتماد على النظام القديم كليًا.
 *
 * قاعدة الترحيل ("أوسع تقدير معقول"):
 *   canView   → viewDoc, viewDocList, allBranches, allWarehouses, viewOtherUsersDocs,
 *               viewSecretAccounts, viewCosts, viewBalances, print
 *   canCreate → add, copy
 *   canEdit   → edit, approve, changeDate, backdate, addDiscount, addTax,
 *               changePriceCost, changeExchangeRate, skipPriceLimit, printWithoutApproval
 *   canDelete → deleteCancel
 *   unapprove → مُستبعد دائمًا من الترحيل الأوتوماتيكي — ميزة جديدة بالكامل مالهاش
 *               مقابل في النظام القديم، وبالتصميم لازم تُمنح صراحة لأشخاص محددين.
 *
 * لكل عنصر: النتيجة = تقاطع (الأفعال المشتقة من الأعلام القديمة) مع الأفعال المتاحة
 * فعليًا لهذا العنصر (عشان ميتكتبش فعل مش موجود في حزمته أصلاً).
 *
 * صف موجود بالفعل في tenant_entity_permissions لنفس (tenantId, role, moduleKey, entityKey)
 * يُتخطّى تمامًا — الإعدادات اليدوية اللي اتظبطت (زي فك الاعتماد) محدش بيلمسها.
 *
 * تشغيل:
 *   node node_modules/tsx/dist/cli.mjs scripts/migrate-old-permissions-to-tree.ts [--apply]
 * بدون --apply: dry-run بس، بيطبع العدد والعينة ولا يكتب حاجة.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../server/db";
import { tenantRolePermissions, tenantEntityPermissions } from "../drizzle/schema";
import { PERMISSION_TREE_RESOLVED, type PermActionKey } from "../shared/permission-tree";

const APPLY = process.argv.includes("--apply");

const OLD_MODULE_KEYS = new Set(PERMISSION_TREE_RESOLVED.map((m) => m.key));

function deriveActions(flags: { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }): Set<PermActionKey> {
  const out = new Set<PermActionKey>();
  if (flags.canView) {
    for (const a of ["viewDoc", "viewDocList", "allBranches", "allWarehouses", "viewOtherUsersDocs", "viewSecretAccounts", "viewCosts", "viewBalances", "print"] as PermActionKey[]) out.add(a);
  }
  if (flags.canCreate) {
    for (const a of ["add", "copy"] as PermActionKey[]) out.add(a);
  }
  if (flags.canEdit) {
    for (const a of ["edit", "approve", "changeDate", "backdate", "addDiscount", "addTax", "changePriceCost", "changeExchangeRate", "skipPriceLimit", "printWithoutApproval"] as PermActionKey[]) out.add(a);
  }
  if (flags.canDelete) {
    out.add("deleteCancel");
  }
  // "unapprove" مُستبعد عمداً — لا مقابل له في النظام القديم أبداً.
  return out;
}

async function main() {
  const db = await getDb();
  if (!db) throw new Error("no DB (DATABASE_URL?)");

  const oldRows = await db.select().from(tenantRolePermissions);
  const existingRows = await db.select({
    tenantId: tenantEntityPermissions.tenantId,
    role: tenantEntityPermissions.role,
    moduleKey: tenantEntityPermissions.moduleKey,
    entityKey: tenantEntityPermissions.entityKey,
  }).from(tenantEntityPermissions);
  const existingKeys = new Set(existingRows.map((r) => `${r.tenantId}::${r.role}::${r.moduleKey}::${r.entityKey}`));

  // تجميع: (tenantId, role) -> module -> flags
  const byRole = new Map<string, Map<string, { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }>>();
  for (const r of oldRows) {
    if (!OLD_MODULE_KEYS.has(r.module)) continue; // موديول مالوش عناصر في الشجرة الجديدة (dashboard/support) — تخطّي
    const roleKey = `${r.tenantId}::${r.role}`;
    if (!byRole.has(roleKey)) byRole.set(roleKey, new Map());
    byRole.get(roleKey)!.set(r.module, {
      canView: !!r.canView, canCreate: !!r.canCreate, canEdit: !!r.canEdit, canDelete: !!r.canDelete,
    });
  }

  let toInsert: { tenantId: number; role: string; moduleKey: string; entityKey: string; allowedActions: string[] }[] = [];
  let skippedExisting = 0;

  for (const [roleKey, moduleMap] of byRole) {
    const [tenantIdStr, role] = roleKey.split("::");
    const tenantId = Number(tenantIdStr);
    for (const mod of PERMISSION_TREE_RESOLVED) {
      const flags = moduleMap.get(mod.key);
      if (!flags) continue; // الدور معندوش صف قديم للموديول ده أصلاً — سيبه زي ما هو (قاعدة "لسه محدش لمسه")
      for (const entity of mod.entities) {
        const existKey = `${tenantId}::${role}::${mod.key}::${entity.key}`;
        if (existingKeys.has(existKey)) { skippedExisting++; continue; }
        const derived = deriveActions(flags);
        const allowedActions = entity.actions.filter((a) => derived.has(a));
        toInsert.push({ tenantId, role, moduleKey: mod.key, entityKey: entity.key, allowedActions });
      }
    }
  }

  console.log(`mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log(`old role×module rows read: ${oldRows.length}`);
  console.log(`roles found: ${[...byRole.keys()].join(", ")}`);
  console.log(`entity rows already configured (skipped, untouched): ${skippedExisting}`);
  console.log(`entity rows to insert: ${toInsert.length}`);
  const empty = toInsert.filter((r) => r.allowedActions.length === 0).length;
  console.log(`  of which explicitly-empty (role had zero old access to this entity): ${empty}`);

  console.log("\n--- sample (first 15) ---");
  for (const r of toInsert.slice(0, 15)) {
    console.log(`[${r.tenantId}] ${r.role} :: ${r.moduleKey}.${r.entityKey} -> [${r.allowedActions.join(", ")}]`);
  }

  if (!APPLY) {
    console.log("\nDRY-RUN — nothing written. add --apply to commit.");
    return;
  }

  console.log("\n=== INSERTING ===");
  let inserted = 0;
  for (const r of toInsert) {
    await db.insert(tenantEntityPermissions).values({
      tenantId: r.tenantId,
      role: r.role,
      moduleKey: r.moduleKey,
      entityKey: r.entityKey,
      allowedActions: r.allowedActions,
    } as any);
    inserted++;
  }
  console.log(`inserted: ${inserted}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
