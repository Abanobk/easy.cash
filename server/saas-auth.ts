/**
 * SaaS Authentication System for Easy Cash
 * Handles email/password login, JWT sessions, and subscription checks.
 * Completely separate from Manus OAuth.
 */

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { appUsers, subscriptions, subscriptionPlans } from "../drizzle/schema";
import { eq, and, gte } from "drizzle-orm";

const SAAS_COOKIE_NAME = "easy_cash_session";
const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
const SALT_ROUNDS = 10;

// ===================== JWT Helpers =====================

function getSecret() {
  const secret = ENV.cookieSecret || "easy-cash-secret-key-2024";
  return new TextEncoder().encode(secret);
}

export async function signSaasToken(payload: {
  userId: number;
  email: string;
  role: string;
}): Promise<string> {
  const issuedAt = Date.now();
  const expiresInMs = ONE_YEAR_MS;
  const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);

  return new SignJWT({
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
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
} | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    const { userId, email, role, type } = payload as Record<string, unknown>;
    if (type !== "saas" || typeof userId !== "number" || typeof email !== "string" || typeof role !== "string") {
      return null;
    }
    return { userId, email, role };
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

// ===================== Subscription Helpers =====================

export async function getUserActiveSubscription(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const today = new Date().toISOString().split("T")[0];
  const [sub] = await db
    .select({
      id: subscriptions.id,
      status: subscriptions.status,
      startDate: subscriptions.startDate,
      endDate: subscriptions.endDate,
      planId: subscriptions.planId,
      planName: subscriptionPlans.nameAr,
      maxUsers: subscriptionPlans.maxUsers,
      maxInvoices: subscriptionPlans.maxInvoices,
    })
    .from(subscriptions)
    .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
    .where(
      and(
        eq(subscriptions.userId, userId),
        gte(subscriptions.endDate, today as any)
      )
    )
    .orderBy(subscriptions.endDate)
    .limit(1);
  return sub || null;
}

export async function isSubscriptionActive(userId: number): Promise<boolean> {
  const sub = await getUserActiveSubscription(userId);
  if (!sub) return false;
  return sub.status === "active" || sub.status === "trial";
}

// ===================== Cookie Name Export =====================
export { SAAS_COOKIE_NAME };
