import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { tenants, appUsers } from "../drizzle/schema";

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
