/**
 * Easy Shope ↔ Easy Cash integration REST API.
 * Auth: X-Shope-Integration-Secret + X-Tenant-Slug
 */
import type { Express, Request, Response } from "express";
import { and, count, eq, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  appUsers,
  customers,
  items,
  salesInvoiceItems,
  salesInvoices,
  tenants,
} from "../drizzle/schema";
import { tenantWhere, withTenantId } from "./tenant-scope";
import { postSalesCogsJournal, postSalesInvoiceJournal } from "./auto-journal";

const INTEGRATION_SECRET = process.env.SHOPE_INTEGRATION_SECRET ?? "";

function integrationSecretAuth(req: Request, res: Response): boolean {
  if (!INTEGRATION_SECRET) {
    res.status(503).json({ error: "SHOPE_INTEGRATION_SECRET غير مضبوط على الخادم" });
    return false;
  }
  const secret = String(req.headers["x-shope-integration-secret"] ?? "");
  if (!secret || secret !== INTEGRATION_SECRET) {
    res.status(401).json({ error: "مفتاح الربط غير صحيح" });
    return false;
  }
  return true;
}

function integrationAuth(req: Request, res: Response): { tenantId: number; slug: string } | null {
  if (!integrationSecretAuth(req, res)) return null;
  const slug = String(req.headers["x-tenant-slug"] ?? "").trim().toLowerCase();
  if (!slug) {
    res.status(400).json({ error: "X-Tenant-Slug مطلوب" });
    return null;
  }
  return { tenantId: 0, slug };
}

async function resolveTenant(slug: string, res: Response) {
  const db = await getDb();
  if (!db) {
    res.status(503).json({ error: "قاعدة البيانات غير متاحة" });
    return null;
  }
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
  if (!tenant?.isActive) {
    res.status(404).json({ error: "شركة المحاسبة غير موجودة أو غير نشطة" });
    return null;
  }
  return { db, tenantId: tenant.id as number, slug: tenant.slug as string };
}

export function registerShopeIntegrationApi(app: Express) {
  /** البحث عن شركة Cash مرتبطة بإيميل صاحب المتجر (للربط التلقائي من Easy Shope) */
  app.post("/api/integration/shope/lookup-by-email", async (req, res) => {
    if (!integrationSecretAuth(req, res)) return;
    const email = String((req.body as { email?: string })?.email ?? "")
      .trim()
      .toLowerCase();
    if (!email) {
      res.status(400).json({ error: "email مطلوب" });
      return;
    }
    const db = await getDb();
    if (!db) {
      res.status(503).json({ error: "قاعدة البيانات غير متاحة" });
      return;
    }
    const userRows = await db
      .select({ id: appUsers.id, tenantId: appUsers.tenantId })
      .from(appUsers)
      .where(and(eq(sql`lower(${appUsers.email})`, email), eq(appUsers.isActive, true)));
    const tenantIds = new Set<number>();
    for (const user of userRows) {
      if (user.tenantId) tenantIds.add(user.tenantId);
      const owned = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(and(eq(tenants.ownerUserId, user.id), eq(tenants.isActive, true)));
      for (const row of owned) tenantIds.add(row.id);
    }
    const matches: Array<{ slug: string; name: string; cashTenantId: number }> = [];
    for (const tenantId of tenantIds) {
      const [tenant] = await db
        .select({ id: tenants.id, slug: tenants.slug, name: tenants.name })
        .from(tenants)
        .where(and(eq(tenants.id, tenantId), eq(tenants.isActive, true)))
        .limit(1);
      if (tenant?.slug) {
        matches.push({ slug: tenant.slug, name: tenant.name, cashTenantId: tenant.id });
      }
    }
    matches.sort((a, b) => a.name.localeCompare(b.name, "ar"));
    res.json({ ok: true, email, matches });
  });

  app.get("/api/integration/shope/health", async (req, res) => {
    const auth = integrationAuth(req, res);
    if (!auth) return;
    const ctx = await resolveTenant(auth.slug, res);
    if (!ctx) return;
    res.json({ ok: true, tenantSlug: ctx.slug, tenantId: ctx.tenantId });
  });

  app.post("/api/integration/shope/items/upsert", async (req, res) => {
    const auth = integrationAuth(req, res);
    if (!auth) return;
    const ctx = await resolveTenant(auth.slug, res);
    if (!ctx) return;
    const body = req.body as {
      code?: string;
      barcode?: string;
      name?: string;
      salePrice?: string;
      purchasePrice?: string;
      currentStock?: string;
      description?: string;
      isActive?: boolean;
    };
    if (!body.name?.trim()) {
      res.status(400).json({ error: "name مطلوب" });
      return;
    }
    const code = (body.code || body.barcode || "").trim();
    if (!code) {
      res.status(400).json({ error: "code أو barcode مطلوب للربط" });
      return;
    }
    const { db, tenantId } = ctx;
    const existing = await db
      .select({ id: items.id })
      .from(items)
      .where(
        tenantWhere(
          items,
          tenantId,
          or(eq(items.code, code), body.barcode ? eq(items.barcode, body.barcode) : undefined),
        ),
      )
      .limit(1);
    const payload = {
      code,
      barcode: body.barcode || code,
      name: body.name.trim(),
      salePrice: body.salePrice ?? "0",
      purchasePrice: body.purchasePrice ?? body.salePrice ?? "0",
      currentStock: body.currentStock ?? "0",
      description: body.description ?? null,
      isActive: body.isActive !== false,
    };
    if (existing[0]) {
      await db.update(items).set(payload as any).where(tenantWhere(items, tenantId, eq(items.id, existing[0].id)));
      res.json({ ok: true, itemId: existing[0].id, action: "updated", code });
      return;
    }
    const [inserted] = await db.insert(items).values(withTenantId(tenantId, payload) as any);
    const itemId = Number((inserted as { insertId?: number }).insertId ?? 0);
    res.json({ ok: true, itemId, action: "created", code });
  });

  app.post("/api/integration/shope/customers/upsert", async (req, res) => {
    const auth = integrationAuth(req, res);
    if (!auth) return;
    const ctx = await resolveTenant(auth.slug, res);
    if (!ctx) return;
    const body = req.body as { code?: string; name?: string; phone?: string; email?: string };
    if (!body.name?.trim()) {
      res.status(400).json({ error: "name مطلوب" });
      return;
    }
    const code = (body.code || body.phone || body.email || `SHOPE-${Date.now()}`).trim();
    const { db, tenantId } = ctx;
    const [existing] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(tenantWhere(customers, tenantId, eq(customers.code, code)))
      .limit(1);
    const payload = {
      code,
      name: body.name.trim(),
      phone: body.phone ?? null,
      email: body.email ?? null,
      isActive: true,
    };
    if (existing) {
      await db.update(customers).set(payload).where(tenantWhere(customers, tenantId, eq(customers.id, existing.id)));
      res.json({ ok: true, customerId: existing.id, action: "updated" });
      return;
    }
    const [inserted] = await db.insert(customers).values(withTenantId(tenantId, payload) as any);
    const customerId = Number((inserted as { insertId?: number }).insertId ?? 0);
    res.json({ ok: true, customerId, action: "created" });
  });

  /** فاتورة بيع من طلب Easy Shope — بدون خصم مخزون (المخزون اتخصم في المتجر) */
  app.post("/api/integration/shope/invoices/from-order", async (req, res) => {
    const auth = integrationAuth(req, res);
    if (!auth) return;
    const ctx = await resolveTenant(auth.slug, res);
    if (!ctx) return;
    const body = req.body as {
      externalOrderId?: string;
      customerId?: number;
      customer?: { code?: string; name?: string; phone?: string; email?: string };
      date?: string;
      subtotal?: string;
      tax?: string;
      discount?: string;
      total?: string;
      notes?: string;
      skipStockDeduction?: boolean;
      items?: Array<{ itemId?: number; code?: string; quantity: string; price: string; total: string }>;
    };
    if (!body.externalOrderId) {
      res.status(400).json({ error: "externalOrderId مطلوب" });
      return;
    }
    if (!body.items?.length) {
      res.status(400).json({ error: "items مطلوب" });
      return;
    }
    const { db, tenantId } = ctx;
    const dup = await db
      .select({ id: salesInvoices.id, number: salesInvoices.number })
      .from(salesInvoices)
      .where(tenantWhere(salesInvoices, tenantId, sql`${salesInvoices.notes} LIKE ${`%${body.externalOrderId}%`}`))
      .limit(1);
    if (dup[0]) {
      res.json({ ok: true, duplicate: true, invoiceId: dup[0].id, number: dup[0].number });
      return;
    }

    let customerId = body.customerId;
    if (!customerId && body.customer?.name) {
      const cCode = (body.customer.code || body.customer.phone || body.customer.email || `SHOPE-${Date.now()}`).trim();
      const [existingCustomer] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(tenantWhere(customers, tenantId, eq(customers.code, cCode)))
        .limit(1);
      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const [ins] = await db.insert(customers).values(
          withTenantId(tenantId, {
            code: cCode,
            name: body.customer.name.trim(),
            phone: body.customer.phone ?? null,
            email: body.customer.email ?? null,
            isActive: true,
          }) as any,
        );
        customerId = Number((ins as { insertId?: number }).insertId ?? 0);
      }
    }
    if (!customerId) {
      res.status(400).json({ error: "customerId أو customer.name مطلوب" });
      return;
    }

    const lineItems: Array<{ itemId: number; quantity: string; price: string; discount: string; tax: string; total: string }> = [];
    for (const line of body.items) {
      let itemId = line.itemId;
      if (!itemId && line.code) {
        const [row] = await db.select({ id: items.id }).from(items).where(tenantWhere(items, tenantId, eq(items.code, line.code))).limit(1);
        itemId = row?.id;
      }
      if (!itemId) {
        res.status(400).json({ error: `صنف غير موجود: ${line.code ?? line.itemId}` });
        return;
      }
      lineItems.push({
        itemId,
        quantity: line.quantity,
        price: line.price,
        discount: "0",
        tax: "0",
        total: line.total,
      });
    }

    const [countResult] = await db.select({ count: count() }).from(salesInvoices).where(tenantWhere(salesInvoices, tenantId));
    const number = `SI-${String(Number(countResult?.count ?? 0) + 1).padStart(5, "0")}`;
    const date = body.date ?? new Date().toISOString().slice(0, 10);
    const subtotal = body.subtotal ?? body.total ?? "0";
    const total = body.total ?? subtotal;
    const notes = [body.notes, `Easy Shope order: ${body.externalOrderId}`].filter(Boolean).join(" · ");

    const [result] = await db.insert(salesInvoices).values(
      withTenantId(tenantId, {
        number,
        customerId,
        date: date as any,
        paymentType: "cash",
        subtotal,
        discount: body.discount ?? "0",
        tax: body.tax ?? "0",
        total,
        paid: total,
        remaining: "0",
        notes,
        status: "paid",
        createdBy: 1,
      }) as any,
    );
    const invId = Number((result as { insertId?: number }).insertId ?? 0);
    const skipStock = body.skipStockDeduction !== false;
    for (const item of lineItems) {
      await db.insert(salesInvoiceItems).values(withTenantId(tenantId, { invoiceId: invId, ...item }) as any);
      if (!skipStock) {
        await db
          .update(items)
          .set({ currentStock: sql`currentStock - ${item.quantity}` })
          .where(tenantWhere(items, tenantId, eq(items.id, item.itemId)));
      }
    }
    const [customerRow] = await db.select({ name: customers.name }).from(customers).where(tenantWhere(customers, tenantId, eq(customers.id, customerId)));
    await postSalesInvoiceJournal(db, tenantId, 1, {
      number,
      date,
      paymentType: "cash",
      subtotal,
      discount: body.discount ?? "0",
      tax: body.tax ?? "0",
      total,
      customerName: customerRow?.name,
    });
    if (!skipStock) {
      await postSalesCogsJournal(db, tenantId, 1, {
        number,
        date,
        items: lineItems.map((it) => ({ itemId: it.itemId, quantity: it.quantity })),
      });
    }
    res.json({ ok: true, invoiceId: invId, number, skipStockDeduction: skipStock });
  });
}
