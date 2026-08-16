import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { appUsers, fingerprintMachines, tenants } from "../drizzle/schema";
import { getDb } from "./db";
import { syncMachineFromTcp } from "./hr-attendance";
import { tenantWhere } from "./tenant-scope";
import { getGeneralAttrBool } from "./general-attributes";

function cronSecretOk(req: Request) {
  const secret = process.env.CRON_SECRET || process.env.ZKTECO_CRON_SECRET || "";
  if (!secret) return false;
  const header = req.headers["x-cron-secret"] || req.headers.authorization?.replace(/^Bearer\s+/i, "");
  return header === secret;
}

async function syncTenantMachines(tenantId: number) {
  const db = await getDb();
  if (!db) return { tenantId, skipped: true as const, reason: "no_db" as const };

  const autoSync = await getGeneralAttrBool(db, tenantId, "zkteco_auto_sync_enabled");
  if (autoSync === false) {
    return { tenantId, skipped: true as const, reason: "disabled" as const };
  }

  const machines = await db
    .select()
    .from(fingerprintMachines)
    .where(tenantWhere(fingerprintMachines, tenantId));

  const results: Array<{ machineId: number; name: string; ok: boolean; fetched?: number; error?: string }> = [];
  for (const machine of machines) {
    if (!machine.ipAddress) {
      results.push({ machineId: machine.id, name: machine.name, ok: false, error: "no_ip" });
      continue;
    }
    try {
      const r = await syncMachineFromTcp(db, tenantId, machine.id, {});
      results.push({ machineId: machine.id, name: machine.name, ok: true, fetched: r.fetched });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "sync_failed";
      results.push({ machineId: machine.id, name: machine.name, ok: false, error: msg });
    }
  }

  return { tenantId, skipped: false as const, machines: results.length, results };
}

export function registerHrCronRoutes(app: Express) {
  app.post("/api/cron/zkteco-sync", async (req: Request, res: Response) => {
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
      const rows = await db
        .selectDistinct({ tenantId: fingerprintMachines.tenantId })
        .from(fingerprintMachines);
      tenantIds = rows.map((r) => r.tenantId).filter((id) => id > 0);
    }

    const summary = [];
    for (const tenantId of tenantIds) {
      summary.push(await syncTenantMachines(tenantId));
    }

    res.json({
      ok: true,
      tenants: summary.length,
      summary,
      hint: "جدولة: curl -X POST -H 'x-cron-secret: SECRET' https://cash.easytecheg.net/api/cron/zkteco-sync",
    });
  });

  app.get("/api/cron/zkteco-sync", (_req, res) => {
    res.json({ ok: true, message: "استخدم POST مع x-cron-secret" });
  });
}
