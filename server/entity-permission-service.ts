/**
 * تنفيذ فعلي للشجرة التفصيلية (shared/permission-tree.ts) — بيتفعّل تدريجيًا شاشة بشاشة.
 *
 * القاعدة المهمة عشان الترقية متكسرش حد شغال حاليًا: لو الدور ده أصلاً معندوش أي صف
 * محفوظ لهذا العنصر بالذات في tenant_entity_permissions (يعني المدير لسه ما فتحش
 * "الصلاحيات التفصيلية" وظبطها له)، بنعتبره "مش متظبط" ومنقيدش حاجة — نسيب القرار
 * للنظام القديم (module × 4 أفعال) زي ما هو دايمًا. بس أول ما المدير يحفظ أي حاجة
 * لعنصر معيّن لدور معيّن، القائمة المحفوظة بتبقى هي المرجع الوحيد لهذا العنصر (أي فعل
 * مش موجود فيها = ممنوع)، حتى لو النظام القديم كان بيسمح بيه.
 */
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { tenantEntityPermissions } from "../drizzle/schema";
import { getDb } from "./db";
import { roleBypassesPermissions } from "./permissions-service";
import { PERM_ACTION_LABELS, type PermActionKey } from "../shared/permission-tree";

type EntityPermCtx = {
  tenantId: number | null | undefined;
  saasUser: { id: number; role: string } | null | undefined;
};

/** null = العنصر ده لسه مش متظبط لهذا الدور — متقيدش، سيب القرار للنظام القديم. */
export async function getEntityAllowedActions(
  tenantId: number,
  role: string,
  moduleKey: string,
  entityKey: string,
): Promise<string[] | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(tenantEntityPermissions)
    .where(
      and(
        eq(tenantEntityPermissions.tenantId, tenantId),
        eq(tenantEntityPermissions.role, role),
        eq(tenantEntityPermissions.moduleKey, moduleKey),
        eq(tenantEntityPermissions.entityKey, entityKey),
      ),
    )
    .limit(1);
  if (!row) return null;
  return (row.allowedActions as string[]) || [];
}

/** يرمي FORBIDDEN لو الدور ظابط العنصر ده صراحة والفعل مش موجود في القائمة المسموحة. */
export async function assertEntityAction(
  ctx: EntityPermCtx,
  moduleKey: string,
  entityKey: string,
  action: PermActionKey,
): Promise<void> {
  if (!ctx.saasUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (roleBypassesPermissions(ctx.saasUser.role)) return;
  if (!ctx.tenantId) return;
  const allowed = await getEntityAllowedActions(ctx.tenantId, ctx.saasUser.role, moduleKey, entityKey);
  if (allowed === null) return; // لسه مش متظبط — سلوك قديم زي ما هو
  if (!allowed.includes(action)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `لا تملك صلاحية "${PERM_ACTION_LABELS[action]}" على هذا العنصر`,
    });
  }
}
