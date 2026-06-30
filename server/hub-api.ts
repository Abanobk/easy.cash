/**
 * REST bridge for the owner portfolio dashboard (cross-origin Bearer auth).
 */
import type { Express, Request, Response } from "express";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { appUsers, subscriptionPlans, subscriptions } from "../drizzle/schema";
import { getDb } from "./db";
import {
  getAppUserByEmail,
  SAAS_COOKIE_NAME,
  signSaasToken,
  verifyPassword,
  verifySaasToken,
} from "./saas-auth";

async function sessionFromRequest(req: Request) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) {
    return verifySaasToken(auth.slice(7));
  }
  const cookies = req.headers.cookie || "";
  const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
  return verifySaasToken(match?.[1]);
}

async function requireSuperAdmin(req: Request, res: Response) {
  const session = await sessionFromRequest(req);
  if (!session || session.role !== "superadmin") {
    res.status(403).json({ message: "غير مصرح — مطلوب حساب سوبر أدمن" });
    return null;
  }
  return session;
}

function dateOnly(d: Date) {
  return d.toISOString().split("T")[0];
}

function addDays(isoDate: string, days: number) {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + days);
  return dateOnly(d);
}

export function registerHubApi(app: Express) {
  app.post("/api/hub/login", async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "");
      if (!email || !password) {
        res.status(400).json({ message: "الإيميل وكلمة المرور مطلوبين" });
        return;
      }
      const user = await getAppUserByEmail(email);
      if (!user || !user.isActive) {
        res.status(401).json({ message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
        return;
      }
      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        res.status(401).json({ message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
        return;
      }
      if (user.role !== "superadmin") {
        res.status(403).json({ message: "الحساب ده مش سوبر أدمن" });
        return;
      }
      const token = await signSaasToken({ userId: user.id, email: user.email, role: user.role });
      res.json({
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role, companyName: user.companyName },
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "خطأ في الخادم" });
    }
  });

  app.get("/api/hub/stats", async (req, res) => {
    if (!(await requireSuperAdmin(req, res))) return;
    const db = await getDb();
    if (!db) {
      res.status(500).json({ message: "قاعدة البيانات غير متاحة" });
      return;
    }
    const today = dateOnly(new Date());
    const [totalUsers] = await db.select({ count: count() }).from(appUsers).where(eq(appUsers.role, "user"));
    const [activeUsers] = await db.select({ count: count() }).from(appUsers).where(and(eq(appUsers.role, "user"), eq(appUsers.isActive, true)));
    const [activeSubs] = await db.select({ count: count() }).from(subscriptions)
      .where(and(gte(subscriptions.endDate, today as any), eq(subscriptions.status, "active")));
    const [trialSubs] = await db.select({ count: count() }).from(subscriptions)
      .where(and(gte(subscriptions.endDate, today as any), eq(subscriptions.status, "trial")));
    res.json({
      totalUsers: totalUsers.count,
      activeUsers: activeUsers.count,
      activeSubscriptions: activeSubs.count,
      trialSubscriptions: trialSubs.count,
    });
  });

  app.get("/api/hub/accounts", async (req, res) => {
    if (!(await requireSuperAdmin(req, res))) return;
    const db = await getDb();
    if (!db) {
      res.status(500).json({ message: "قاعدة البيانات غير متاحة" });
      return;
    }
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || "100"), 10) || 100));
    const users = await db.select({
      id: appUsers.id,
      name: appUsers.name,
      email: appUsers.email,
      companyName: appUsers.companyName,
      phone: appUsers.phone,
      isActive: appUsers.isActive,
      createdAt: appUsers.createdAt,
      lastLoginAt: appUsers.lastLoginAt,
    }).from(appUsers)
      .where(eq(appUsers.role, "user"))
      .orderBy(desc(appUsers.createdAt))
      .limit(limit);

    const subs = await db.select({
      id: subscriptions.id,
      userId: subscriptions.userId,
      status: subscriptions.status,
      startDate: subscriptions.startDate,
      endDate: subscriptions.endDate,
      planId: subscriptions.planId,
      planName: subscriptionPlans.nameAr,
      planPrice: subscriptionPlans.price,
    })
      .from(subscriptions)
      .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
      .orderBy(desc(subscriptions.createdAt));

    const latestSub = new Map<number, (typeof subs)[0]>();
    for (const s of subs) {
      if (!latestSub.has(s.userId)) latestSub.set(s.userId, s);
    }

    res.json({
      accounts: users.map((u) => ({
        ...u,
        subscription: latestSub.get(u.id) || null,
      })),
    });
  });

  app.patch("/api/hub/users/:id", async (req, res) => {
    if (!(await requireSuperAdmin(req, res))) return;
    const db = await getDb();
    if (!db) {
      res.status(500).json({ message: "قاعدة البيانات غير متاحة" });
      return;
    }
    const id = parseInt(String(req.params.id), 10);
    if (!id) {
      res.status(400).json({ message: "معرّف غير صالح" });
      return;
    }
    const { isActive } = req.body || {};
    if (typeof isActive !== "boolean") {
      res.status(400).json({ message: "isActive مطلوب (true/false)" });
      return;
    }
    await db.update(appUsers).set({ isActive }).where(eq(appUsers.id, id));
    res.json({ success: true });
  });

  app.patch("/api/hub/subscriptions/:id", async (req, res) => {
    if (!(await requireSuperAdmin(req, res))) return;
    const db = await getDb();
    if (!db) {
      res.status(500).json({ message: "قاعدة البيانات غير متاحة" });
      return;
    }
    const id = parseInt(String(req.params.id), 10);
    if (!id) {
      res.status(400).json({ message: "معرّف غير صالح" });
      return;
    }
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
    if (!sub) {
      res.status(404).json({ message: "الاشتراك غير موجود" });
      return;
    }
    const body = req.body || {};
    const update: Record<string, unknown> = {};
    if (body.status && ["trial", "active", "expired", "cancelled", "suspended"].includes(body.status)) {
      update.status = body.status;
    }
    if (typeof body.extendDays === "number" && body.extendDays > 0) {
      const base = String(sub.endDate) >= dateOnly(new Date()) ? String(sub.endDate) : dateOnly(new Date());
      update.endDate = addDays(base, body.extendDays);
      if (!body.status && (sub.status === "trial" || sub.status === "active")) {
        update.status = sub.status;
      }
    }
    if (body.endDate && /^\d{4}-\d{2}-\d{2}$/.test(body.endDate)) {
      update.endDate = body.endDate;
    }
    if (!Object.keys(update).length) {
      res.status(400).json({ message: "لا توجد حقول للتحديث" });
      return;
    }
    await db.update(subscriptions).set(update).where(eq(subscriptions.id, id));
    const [updated] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
    res.json({ subscription: updated });
  });
}
