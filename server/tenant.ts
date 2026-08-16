import { eq, desc, and, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { tenants, appUsers, subscriptions } from "../drizzle/schema";
import { getAccountOwnerId } from "./saas-auth";

export function slugifyCompanyName(name: string) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u0600-\u06FF-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "company";
}

export async function ensureUniqueTenantSlug(base: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  let slug = slugifyCompanyName(base);
  let suffix = 0;
  while (true) {
    const candidate = suffix ? `${slug}-${suffix}` : slug;
    const [existing] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, candidate)).limit(1);
    if (!existing) return candidate;
    suffix += 1;
  }
}

export async function getTenantBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  return row || null;
}

export async function getTenantById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  return row || null;
}

export async function createTenantForOwner(input: { name: string; companyName: string; ownerUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const slug = await ensureUniqueTenantSlug(input.companyName || input.name);
  const [result] = await db.insert(tenants).values({
    slug,
    name: input.companyName || input.name,
    ownerUserId: input.ownerUserId,
    isActive: true,
  });
  const tenantId = (result as { insertId: number }).insertId;
  await db.update(appUsers).set({ tenantId }).where(eq(appUsers.id, input.ownerUserId));
  return { tenantId, slug };
}

/** مالك الشركة الأصلي — من جدول tenants أو أقدم مستخدم بدون ownerUserId */
export async function getTenantOwnerUserId(tenantId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const [tenant] = await db
    .select({ ownerUserId: tenants.ownerUserId })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (tenant?.ownerUserId) return tenant.ownerUserId;
  const [root] = await db
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(and(eq(appUsers.tenantId, tenantId), isNull(appUsers.ownerUserId)))
    .orderBy(appUsers.createdAt)
    .limit(1);
  return root?.id ?? null;
}

/** إصلاح حسابات قديمة بدون tenantId — مالك أو اشتراك */
export async function resolveUserTenant(user: { id: number; tenantId?: number | null; ownerUserId?: number | null }) {
  if (user.tenantId) {
    const tenant = await getTenantById(user.tenantId);
    return { tenantId: user.tenantId, tenantSlug: tenant?.slug ?? null, repaired: false };
  }

  const db = await getDb();
  if (!db) return { tenantId: null as number | null, tenantSlug: null as string | null, repaired: false };

  const ownerId = getAccountOwnerId(user);

  if (user.ownerUserId && user.ownerUserId !== user.id) {
    const [owner] = await db
      .select({ tenantId: appUsers.tenantId })
      .from(appUsers)
      .where(eq(appUsers.id, user.ownerUserId))
      .limit(1);
    if (owner?.tenantId) {
      await db.update(appUsers).set({ tenantId: owner.tenantId }).where(eq(appUsers.id, user.id));
      const tenant = await getTenantById(owner.tenantId);
      return { tenantId: owner.tenantId, tenantSlug: tenant?.slug ?? null, repaired: true };
    }
  }

  const [owned] = await db.select().from(tenants).where(eq(tenants.ownerUserId, ownerId)).limit(1);
  if (owned) {
    await db.update(appUsers).set({ tenantId: owned.id }).where(eq(appUsers.id, user.id));
    return { tenantId: owned.id, tenantSlug: owned.slug, repaired: true };
  }

  const [sub] = await db
    .select({ tenantId: subscriptions.tenantId })
    .from(subscriptions)
    .where(eq(subscriptions.userId, ownerId))
    .orderBy(desc(subscriptions.endDate))
    .limit(1);

  if (sub?.tenantId) {
    await db.update(appUsers).set({ tenantId: sub.tenantId }).where(eq(appUsers.id, user.id));
    const tenant = await getTenantById(sub.tenantId);
    return { tenantId: sub.tenantId, tenantSlug: tenant?.slug ?? null, repaired: true };
  }

  return { tenantId: null, tenantSlug: null, repaired: false };
}
