import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { appUsers, tenants } from "../drizzle/schema";
import { getDb } from "./db";
import { syncOperationalNotifications } from "./sync-operational-notifications";
import { sendOperationalAlertDigest } from "./alert-email";

function cronSecretOk(req: Request) {
  const secret = process.env.CRON_SECRET || process.env.OPS_CRON_SECRET || process.env.ZKTECO_CRON_SECRET || "";
  if (!secret) return false;
  const header = req.headers["x-cron-secret"] || req.headers.authorization?.replace(/^Bearer\s+/i, "");
  return header === secret;
}

async function syncTenantOperational(tenantId: number) {
  const db = await getDb();
  if (!db) return { tenantId, skipped: true as const, reason: "no_db" as const };

  const admins = await db
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(eq(appUsers.tenantId, tenantId));

  const recipients = admins.filter((u) => u.id > 0);
  let syncedUsers = 0;
  for (const user of recipients.slice(0, 20)) {
    try {
      await syncOperationalNotifications(db, tenantId, user.id);
      syncedUsers += 1;
    } catch (err) {
      console.warn(`[ops-cron] sync failed tenant=${tenantId} user=${user.id}`, err);
    }
  }

  let email: { sent: boolean; reason?: string } = { sent: false, reason: "skipped" };
  try {
    email = await sendOperationalAlertDigest(db, tenantId);
  } catch (err) {
    email = { sent: false, reason: err instanceof Error ? err.message : "email_failed" };
  }

  return {
    tenantId,
    skipped: false as const,
    syncedUsers,
    email,
  };
}

export function registerOperationalCronRoutes(app: Express) {
  app.post("/api/cron/operational-sync", async (req: Request, res: Response) => {
    if (!cronSecretOk(req)) {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }

    const db = await getDb();
    if (!db) {
      res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
      return;
    }

    const body = req.body as { tenantId?: number; tenantSlug?: string } | undefined;
    let tenantIds: number[] = [];

    if (body?.tenantId) {
      tenantIds = [body.tenantId];
    } else if (body?.tenantSlug) {
      const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, body.tenantSlug)).limit(1);
      if (t) tenantIds = [t.id];
    } else {
      const rows = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.isActive, true));
      tenantIds = rows.map((r) => r.id);
    }

    const summary = [];
    for (const tenantId of tenantIds) {
      summary.push(await syncTenantOperational(tenantId));
    }

    res.json({
      ok: true,
      tenants: summary.length,
      summary,
      hint: "جدولة يومية: curl -X POST -H 'x-cron-secret: SECRET' https://cash.easytecheg.net/api/cron/operational-sync",
    });
  });

  app.get("/api/cron/operational-sync", (_req, res) => {
    res.json({
      ok: true,
      usage: "POST /api/cron/operational-sync with header x-cron-secret",
    });
  });
}
