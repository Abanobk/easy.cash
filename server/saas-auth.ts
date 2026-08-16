/**
 * SaaS Authentication System for Easy Cash
 * Handles email/password login, JWT sessions, and subscription checks.
 * Completely separate from Manus OAuth.
 */

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { TRPCError } from "@trpc/server";
import type { Request } from "express";
import { getDb } from "./db";
import { appUsers, subscriptions, subscriptionPlans } from "../drizzle/schema";
import { eq, and, gte, or, count, desc, inArray } from "drizzle-orm";
import { normalizeSubscriptionStatusForSave, toDateOnly, todayDateOnly } from "./subscription-display";
import { resolveJwtSecret } from "./security-secrets";

const SAAS_COOKIE_NAME = "easy_cash_session";
/** Session lifetime — was 1 year; shortened to reduce stolen-cookie window */
export const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const SALT_ROUNDS = 10;

// ===================== JWT Helpers =====================

function getSecret() {
  return new TextEncoder().encode(resolveJwtSecret());
}

export async function signSaasToken(payload: {
  userId: number;
  email: string;
  role: string;
  tenantId?: number | null;
  tenantSlug?: string | null;
  impersonatorId?: number | null;
}): Promise<string> {
  const issuedAt = Date.now();
  const expiresInMs = SESSION_MAX_AGE_MS;
  const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);

  return new SignJWT({
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
    tenantId: payload.tenantId ?? null,
    tenantSlug: payload.tenantSlug ?? null,
    impersonatorId: payload.impersonatorId ?? null,
    type: "saas",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(getSecret());
}

export async function verifySaasToken(token: string | undefined | null): Promise<{
  userId: number;
  email: string;
  role: string;
  tenantId: number | null;
  tenantSlug: string | null;
  impersonatorId: number | null;
} | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    const { userId, email, role, type, tenantId, tenantSlug, impersonatorId } = payload as Record<string, unknown>;
    if (type !== "saas" || typeof userId !== "number" || typeof email !== "string" || typeof role !== "string") {
      return null;
    }
    return {
      userId,
      email,
      role,
      tenantId: typeof tenantId === "number" ? tenantId : null,
      tenantSlug: typeof tenantSlug === "string" ? tenantSlug : null,
      impersonatorId: typeof impersonatorId === "number" ? impersonatorId : null,
    };
  } catch {
    return null;
  }
}

// ===================== Password Helpers =====================

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ===================== User Helpers =====================

export async function getAppUserById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [user] = await db.select().from(appUsers).where(eq(appUsers.id, id));
  return user || null;
}

export async function getAppUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return null;
  const [user] = await db.select().from(appUsers).where(eq(appUsers.email, email.toLowerCase()));
  return user || null;
}

export function getAccountOwnerId(user: { id: number; ownerUserId?: number | null }) {
  return user.ownerUserId ?? user.id;
}

export async function countAccountUsers(tenantId: number) {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db
    .select({ total: count() })
    .from(appUsers)
    .where(eq(appUsers.tenantId, tenantId));
  return row?.total ?? 0;
}

export function canManageTeamUsers(role: string) {
  return role === "admin" || role === "superadmin";
}

// ===================== Subscription Helpers =====================

export async function getUserActiveSubscription(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const user = await getAppUserById(userId);
  if (!user?.tenantId) return null;
  const today = todayDateOnly();
  const rows = await db
    .select({
      id: subscriptions.id,
      status: subscriptions.status,
      startDate: subscriptions.startDate,
      endDate: subscriptions.endDate,
      planId: subscriptions.planId,
      planName: subscriptionPlans.nameAr,
      planDurationDays: subscriptionPlans.durationDays,
      maxUsers: subscriptionPlans.maxUsers,
      maxInvoices: subscriptionPlans.maxInvoices,
    })
    .from(subscriptions)
    .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
    .where(
      and(
        or(
          eq(subscriptions.userId, userId),
          user.tenantId ? eq(subscriptions.tenantId, user.tenantId) : eq(subscriptions.userId, userId),
        ),
        gte(subscriptions.endDate, today as any),
        inArray(subscriptions.status, ["active", "trial", "expired"]),
      )
    )
    .orderBy(desc(subscriptions.endDate))
    .limit(5);

  for (const row of rows) {
    const endDate = toDateOnly(row.endDate);
    const status = normalizeSubscriptionStatusForSave(String(row.status), endDate, today);
    if (endDate >= today && (status === "active" || status === "trial")) {
      return { ...row, status };
    }
  }
  return null;
}

export async function isSubscriptionActive(userId: number): Promise<boolean> {
  const sub = await getUserActiveSubscription(userId);
  if (!sub) return false;
  return sub.status === "active" || sub.status === "trial";
}

// ===================== Cookie Name Export =====================
export { SAAS_COOKIE_NAME };

export function getSaasTokenFromRequest(req: { headers: { cookie?: string; authorization?: string | string[] } }) {
  const cookies = req.headers.cookie || "";
  const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1].trim());
    } catch {
      return match[1].trim();
    }
  }
  const auth = req.headers.authorization;
  const header = Array.isArray(auth) ? auth[0] : auth;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }
  return null;
}

export async function getSaasSessionFromRequest(req: { headers: { cookie?: string; authorization?: string | string[] } }) {
  return verifySaasToken(getSaasTokenFromRequest(req));
}

/**
 * Superadmin gate: JWT must be valid AND live DB role must still be superadmin + active.
 * Prefer this over trusting session.role alone.
 */
export async function requireSuperAdminFromRequest(req: Request) {
  const session = await getSaasSessionFromRequest(req);
  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "غير مصرح" });
  }
  const user = await getAppUserById(session.userId);
  if (!user || !user.isActive || user.role !== "superadmin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "غير مصرح — مطلوب حساب سوبر أدمن نشط",
    });
  }
  return { session, user };
}

export function requireSaasSuperAdmin(ctx: {
  saasUser: { role: string } | null;
}) {
  if (ctx.saasUser?.role === "superadmin") {
    return ctx.saasUser;
  }
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "انتهت جلسة السوبر أدمن أو الحساب الحالي ليس سوبر أدمن. سجّل خروج من «فتح برنامج مشترك» إن وُجد، ثم ادخل من /login بحساب السوبر أدمن.",
  });
}
