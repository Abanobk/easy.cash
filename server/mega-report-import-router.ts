import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, count, eq } from "drizzle-orm";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { tenantWhere, withTenantId } from "./tenant-scope";
import {
  customers,
  suppliers,
  items,
  warehouses,
  salesInvoices,
  salesInvoiceItems,
  purchaseInvoices,
  purchaseInvoiceItems,
  productionOrders,
  productionOrderMaterials,
  beginningInventory,
  itemBomLines,
} from "../drizzle/schema";
import { parseMegaReportBuffer, type MegaInvoiceLine } from "./mega-report-parse";
import { resolveTypedEntityCode } from "./entity-codes";

function normalizeKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\s\-_/\\]+/g, " ")
    .trim();
}

function matchOne<T extends { id: number; name?: string | null; code?: string | null; barcode?: string | null }>(
  catalog: T[],
  opts: { barcode?: string | null; name?: string | null; code?: string | null },
) {
  const bc = normalizeKey(opts.barcode || "");
  const nm = normalizeKey(opts.name || "");
  const cd = normalizeKey(opts.code || "");
  if (bc) {
    const hits = catalog.filter((x) => normalizeKey(x.barcode || "") === bc || normalizeKey(x.code || "") === bc);
    if (hits.length === 1) return { id: hits[0].id, name: hits[0].name || "", by: "barcode" as const };
    if (hits.length > 1) return { id: null, name: null, by: null, candidates: hits.slice(0, 8) };
  }
  if (cd) {
    const hits = catalog.filter((x) => normalizeKey(x.code || "") === cd);
    if (hits.length === 1) return { id: hits[0].id, name: hits[0].name || "", by: "code" as const };
  }
  if (nm) {
    const exact = catalog.filter((x) => normalizeKey(x.name || "") === nm);
    if (exact.length === 1) return { id: exact[0].id, name: exact[0].name || "", by: "name" as const };
    if (exact.length > 1) return { id: null, name: null, by: null, candidates: exact.slice(0, 8) };
    const partial = catalog.filter((x) => {
      const n = normalizeKey(x.name || "");
      return n.includes(nm) || nm.includes(n);
    });
    if (partial.length === 1) return { id: partial[0].id, name: partial[0].name || "", by: "name" as const };
    if (partial.length > 1 && partial.length <= 8) {
      return { id: null, name: null, by: null, candidates: partial };
    }
  }
  return { id: null, name: null, by: null, candidates: [] as T[] };
}

function enrichLines(lines: MegaInvoiceLine[], itemCatalog: Array<{ id: number; name: string; code: string | null; barcode: string | null }>) {
  return lines.map((line, index) => {
    const m = matchOne(itemCatalog, { barcode: line.barcode, name: line.name });
    return {
      index,
      ...line,
      itemId: m.id,
      itemName: m.name,
      matchBy: m.by,
      status: m.id ? "matched" : ((m as any).candidates?.length ? "ambiguous" : "unmatched"),
      candidates: ((m as any).candidates || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        barcode: c.barcode,
      })),
    };
  });
}

export const megaReportImportRouter = router({
  /** معاينة: يرسل الملف base64 ويُرجع النوع + المستندات مع حالة المطابقة */
  preview: protectedProcedure.input(z.object({
    fileBase64: z.string().min(20),
    fileName: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const buf = Buffer.from(input.fileBase64, "base64");
    let parsed;
    try {
      parsed = parseMegaReportBuffer(buf);
    } catch (e) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: e instanceof Error ? e.message : "فشل قراءة ملف Excel",
      });
    }
    if (parsed.kind === "unknown") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "صيغة غير معروفة — المتوقع: تكاليف أصناف / مبيعات / مشتريات / أوامر إنتاج (تصدير تقرير Excel)",
      });
    }

    const [itemCatalog, customerCatalog, supplierCatalog, warehouseCatalog] = await Promise.all([
      db.select({ id: items.id, name: items.name, code: items.code, barcode: items.barcode })
        .from(items).where(tenantWhere(items, ctx.tenantId, eq(items.isActive, true))),
      db.select({ id: customers.id, name: customers.name, code: customers.code })
        .from(customers).where(tenantWhere(customers, ctx.tenantId)),
      db.select({ id: suppliers.id, name: suppliers.name, code: suppliers.code })
        .from(suppliers).where(tenantWhere(suppliers, ctx.tenantId)),
      db.select({ id: warehouses.id, name: warehouses.name })
        .from(warehouses).where(tenantWhere(warehouses, ctx.tenantId)),
    ]);

    if (parsed.kind === "item_costs") {
      const rows = parsed.itemCosts.map((r, index) => {
        const item = matchOne(itemCatalog, { name: r.name });
        const wh = matchOne(warehouseCatalog as any, { name: r.warehouse });
        return {
          index,
          ...r,
          itemId: item.id,
          itemStatus: item.id ? "matched" : "unmatched",
          warehouseId: wh.id,
          warehouseStatus: wh.id ? "matched" : "unmatched",
        };
      });
      return {
        kind: parsed.kind,
        fileName: input.fileName || "",
        summary: {
          documents: rows.length,
          lines: rows.length,
          matchedItems: rows.filter((r) => r.itemStatus === "matched").length,
          unmatchedItems: rows.filter((r) => r.itemStatus !== "matched").length,
          matchedParties: rows.filter((r) => r.warehouseStatus === "matched").length,
          unmatchedParties: rows.filter((r) => r.warehouseStatus !== "matched").length,
        },
        itemCosts: rows,
        sales: [],
        purchases: [],
        production: [],
        bom: [],
      };
    }

    if (parsed.kind === "sales") {
      const sales = parsed.sales.map((doc, index) => {
        const party = matchOne(customerCatalog as any, { name: doc.customer });
        const lines = enrichLines(doc.lines, itemCatalog);
        return {
          index,
          ...doc,
          customerId: party.id,
          partyStatus: party.id ? "matched" : "unmatched",
          lines,
          lineMatched: lines.filter((l) => l.status === "matched").length,
          lineUnmatched: lines.filter((l) => l.status !== "matched").length,
          ready: !!party.id && lines.length > 0 && lines.every((l) => l.status === "matched"),
        };
      });
      return {
        kind: parsed.kind,
        fileName: input.fileName || "",
        summary: {
          documents: sales.length,
          lines: sales.reduce((s, d) => s + d.lines.length, 0),
          matchedItems: sales.reduce((s, d) => s + d.lineMatched, 0),
          unmatchedItems: sales.reduce((s, d) => s + d.lineUnmatched, 0),
          matchedParties: sales.filter((d) => d.partyStatus === "matched").length,
          unmatchedParties: sales.filter((d) => d.partyStatus !== "matched").length,
          readyDocs: sales.filter((d) => d.ready).length,
        },
        itemCosts: [],
        sales,
        purchases: [],
        production: [],
        bom: [],
      };
    }

    if (parsed.kind === "purchases") {
      const purchases = parsed.purchases.map((doc, index) => {
        const party = matchOne(supplierCatalog as any, { name: doc.supplier });
        const lines = enrichLines(doc.lines, itemCatalog);
        return {
          index,
          ...doc,
          supplierId: party.id,
          partyStatus: party.id ? "matched" : "unmatched",
          lines,
          lineMatched: lines.filter((l) => l.status === "matched").length,
          lineUnmatched: lines.filter((l) => l.status !== "matched").length,
          ready: !!party.id && lines.length > 0 && lines.every((l) => l.status === "matched"),
        };
      });
      return {
        kind: parsed.kind,
        fileName: input.fileName || "",
        summary: {
          documents: purchases.length,
          lines: purchases.reduce((s, d) => s + d.lines.length, 0),
          matchedItems: purchases.reduce((s, d) => s + d.lineMatched, 0),
          unmatchedItems: purchases.reduce((s, d) => s + d.lineUnmatched, 0),
          matchedParties: purchases.filter((d) => d.partyStatus === "matched").length,
          unmatchedParties: purchases.filter((d) => d.partyStatus !== "matched").length,
          readyDocs: purchases.filter((d) => d.ready).length,
        },
        itemCosts: [],
        sales: [],
        purchases,
        production: [],
        bom: [],
      };
    }

    if (parsed.kind === "bom") {
      const bom = parsed.bom.map((doc, index) => {
        const product = matchOne(itemCatalog, { barcode: doc.barcode, name: doc.name });
        const components = doc.components.map((c, ci) => {
          const hit = matchOne(itemCatalog, { barcode: c.barcode, name: c.name });
          return {
            index: ci,
            ...c,
            itemId: hit.id,
            status: hit.id ? "matched" : "unmatched",
          };
        });
        return {
          index,
          product: doc.name,
          barcode: doc.barcode,
          unit: doc.unit,
          category: doc.category,
          productId: product.id,
          productStatus: product.id ? "matched" : "unmatched",
          components,
          compMatched: components.filter((c) => c.status === "matched").length,
          compUnmatched: components.filter((c) => c.status !== "matched").length,
          ready: !!product.id && components.length > 0 && components.every((c) => c.status === "matched"),
        };
      });
      return {
        kind: "bom" as const,
        fileName: input.fileName || "",
        summary: {
          documents: bom.length,
          lines: bom.reduce((s, d) => s + d.components.length, 0),
          matchedItems: bom.reduce((s, d) => s + d.compMatched + (d.productStatus === "matched" ? 1 : 0), 0),
          unmatchedItems: bom.reduce((s, d) => s + d.compUnmatched + (d.productStatus === "matched" ? 0 : 1), 0),
          matchedParties: bom.filter((d) => d.productStatus === "matched").length,
          unmatchedParties: bom.filter((d) => d.productStatus !== "matched").length,
          readyDocs: bom.filter((d) => d.ready).length,
        },
        itemCosts: [],
        sales: [],
        purchases: [],
        production: [],
        bom,
      };
    }

    // production
    const production = parsed.production.map((doc, index) => {
      const product = matchOne(itemCatalog, { barcode: doc.barcode, name: doc.product });
      const materials = doc.materials.map((m, mi) => {
        const hit = matchOne(itemCatalog, { barcode: m.barcode, name: m.name });
        return {
          index: mi,
          ...m,
          itemId: hit.id,
          status: hit.id ? "matched" : "unmatched",
        };
      });
      const whName = doc.deliveries[0]?.warehouse || doc.site;
      const wh = matchOne(warehouseCatalog as any, { name: whName });
      return {
        index,
        ...doc,
        productId: product.id,
        productStatus: product.id ? "matched" : "unmatched",
        warehouseId: wh.id,
        warehouseStatus: wh.id ? "matched" : "unmatched",
        materials,
        matMatched: materials.filter((m) => m.status === "matched").length,
        matUnmatched: materials.filter((m) => m.status !== "matched").length,
        ready: !!product.id && !!wh.id && materials.length > 0 && materials.every((m) => m.status === "matched"),
      };
    });
    return {
      kind: "production" as const,
      fileName: input.fileName || "",
      summary: {
        documents: production.length,
        lines: production.reduce((s, d) => s + d.materials.length, 0),
        matchedItems: production.reduce((s, d) => s + d.matMatched + (d.productStatus === "matched" ? 1 : 0), 0),
        unmatchedItems: production.reduce((s, d) => s + d.matUnmatched + (d.productStatus === "matched" ? 0 : 1), 0),
        matchedParties: production.filter((d) => d.warehouseStatus === "matched").length,
        unmatchedParties: production.filter((d) => d.warehouseStatus !== "matched").length,
        readyDocs: production.filter((d) => d.ready).length,
      },
      itemCosts: [],
      sales: [],
      purchases: [],
      production,
      bom: [],
    };
  }),

  /** إنشاء أصناف ناقصة من أسطر التقرير (بارت نمبر تلقائي) */
  createMissingItems: protectedProcedure.input(z.object({
    rows: z.array(z.object({
      clientKey: z.string(),
      name: z.string().min(1),
      barcode: z.string().optional(),
      unitCost: z.string().optional(),
      unit: z.string().optional(),
    })).min(1).max(2000),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { ensureMeasureUnitExists } = await import("./measure-units");
    const created: Array<{ clientKey: string; id: number; name: string; code: string; barcode: string }> = [];
    const errors: string[] = [];
    for (const row of input.rows) {
      try {
        const code = await resolveTypedEntityCode(db, items, ctx.tenantId!, "item", undefined);
        const rawBarcode = (row.barcode || "").trim();
        const barcode = rawBarcode && rawBarcode !== row.name.trim() && rawBarcode.length <= 40 ? rawBarcode : null;
        const cost = row.unitCost && Number(row.unitCost) > 0 ? String(row.unitCost) : "0";
        const unit = await ensureMeasureUnitExists(db, ctx.tenantId!, row.unit);
        // سعر مرجعي فقط — الرصيد/متوسط التكلفة عند اعتماد الكميات
        const [ins] = await db.insert(items).values(withTenantId(ctx.tenantId, {
          name: row.name.trim(),
          code,
          barcode,
          unit,
          purchasePrice: cost,
          averageCost: "0",
          isActive: true,
        }) as any);
        const id = Number((ins as { insertId?: number }).insertId ?? 0);
        if (id > 0) created.push({ clientKey: row.clientKey, id, name: row.name.trim(), code, barcode: barcode || "" });
        else errors.push(`${row.name}: فشل`);
      } catch (e) {
        errors.push(`${row.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { created, failed: errors.length, errors: errors.slice(0, 30) };
  }),

  /** إنشاء عملاء/موردين ناقصين بالاسم */
  createMissingParties: protectedProcedure.input(z.object({
    kind: z.enum(["customer", "supplier"]),
    names: z.array(z.object({ clientKey: z.string(), name: z.string().min(1) })).min(1).max(500),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const created: Array<{ clientKey: string; id: number; name: string; code: string }> = [];
    const errors: string[] = [];
    for (const row of input.names) {
      try {
        if (input.kind === "customer") {
          const code = await resolveTypedEntityCode(db, customers, ctx.tenantId!, "customer", undefined);
          const [ins] = await db.insert(customers).values(withTenantId(ctx.tenantId, {
            name: row.name.trim(),
            code,
            isActive: true,
          }) as any);
          const id = Number((ins as { insertId?: number }).insertId ?? 0);
          if (id > 0) created.push({ clientKey: row.clientKey, id, name: row.name.trim(), code });
        } else {
          const code = await resolveTypedEntityCode(db, suppliers, ctx.tenantId!, "supplier", undefined);
          const [ins] = await db.insert(suppliers).values(withTenantId(ctx.tenantId, {
            name: row.name.trim(),
            code,
            isActive: true,
          }) as any);
          const id = Number((ins as { insertId?: number }).insertId ?? 0);
          if (id > 0) created.push({ clientKey: row.clientKey, id, name: row.name.trim(), code });
        }
      } catch (e) {
        errors.push(`${row.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { created, failed: errors.length, errors: errors.slice(0, 30) };
  }),

  /** اعتماد المبيعات المطابقة */
  commitSales: protectedProcedure.input(z.object({
    warehouseId: z.number(),
    paymentType: z.enum(["cash", "credit"]).default("credit"),
    documents: z.array(z.object({
      customerId: z.number(),
      date: z.string(),
      serial: z.string().optional(),
      discount: z.string().optional(),
      tax: z.string().optional(),
      total: z.string(),
      lines: z.array(z.object({
        itemId: z.number(),
        quantity: z.string(),
        price: z.string(),
        discount: z.string().optional(),
        tax: z.string().optional(),
        total: z.string(),
      })).min(1),
    })).min(1).max(500),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { applyStockMovement } = await import("./inventory-stock");
    const { postSalesInvoiceJournal } = await import("./auto-journal");
    let imported = 0;
    const errors: string[] = [];
    for (const doc of input.documents) {
      try {
        const subtotal = doc.lines.reduce((s, l) => s + Number(l.total || 0), 0);
        const [countResult] = await db.select({ count: count() }).from(salesInvoices).where(tenantWhere(salesInvoices, ctx.tenantId));
        const number = doc.serial?.trim() || `SI-${String(countResult.count + 1).padStart(5, "0")}`;
        const isCash = input.paymentType === "cash";
        const [result] = await db.insert(salesInvoices).values(withTenantId(ctx.tenantId, {
          number,
          customerId: doc.customerId,
          date: doc.date as any,
          warehouseId: input.warehouseId,
          paymentType: input.paymentType,
          subtotal: String(subtotal),
          discount: doc.discount || "0",
          tax: doc.tax || "0",
          total: doc.total,
          paid: isCash ? doc.total : "0",
          remaining: isCash ? "0" : doc.total,
          notes: doc.serial ? `مستورد من التقرير ${doc.serial}` : "مستورد من تقرير مبيعات",
          createdBy: ctx.user.id,
          status: isCash ? "paid" : "confirmed",
        }) as any);
        const invId = Number((result as any).insertId);
        for (const line of doc.lines) {
          await db.insert(salesInvoiceItems).values(withTenantId(ctx.tenantId, {
            invoiceId: invId,
            itemId: line.itemId,
            quantity: line.quantity,
            price: line.price,
            discount: line.discount || "0",
            tax: line.tax || "0",
            total: line.total,
          }) as any);
          await applyStockMovement(db, ctx.tenantId, {
            itemId: line.itemId,
            quantity: line.quantity,
            direction: "out",
            warehouseId: input.warehouseId,
            allowNegative: true,
          });
        }
        try {
          await postSalesInvoiceJournal(db, ctx.tenantId, ctx.user.id, {
            number,
            date: doc.date,
            paymentType: input.paymentType,
            subtotal: String(subtotal),
            discount: doc.discount || "0",
            tax: doc.tax || "0",
            total: doc.total,
          });
        } catch {
          // journal optional on migration if accounts incomplete
        }
        imported += 1;
      } catch (e) {
        errors.push(`${doc.serial || doc.date}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { imported, failed: errors.length, errors: errors.slice(0, 30) };
  }),

  commitPurchases: protectedProcedure.input(z.object({
    warehouseId: z.number(),
    paymentType: z.enum(["cash", "credit"]).default("credit"),
    documents: z.array(z.object({
      supplierId: z.number(),
      date: z.string(),
      serial: z.string().optional(),
      discount: z.string().optional(),
      tax: z.string().optional(),
      total: z.string(),
      lines: z.array(z.object({
        itemId: z.number(),
        quantity: z.string(),
        price: z.string(),
        discount: z.string().optional(),
        tax: z.string().optional(),
        total: z.string(),
      })).min(1),
    })).min(1).max(500),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { applyStockMovement } = await import("./inventory-stock");
    const { updateAverageCostAfterPurchase } = await import("./inventory-cost");
    let imported = 0;
    const errors: string[] = [];
    for (const doc of input.documents) {
      try {
        const subtotal = doc.lines.reduce((s, l) => s + Number(l.total || 0), 0);
        const [countResult] = await db.select({ count: count() }).from(purchaseInvoices).where(tenantWhere(purchaseInvoices, ctx.tenantId));
        const number = doc.serial?.trim() || `PI-${String(countResult.count + 1).padStart(5, "0")}`;
        const isCash = input.paymentType === "cash";
        const [result] = await db.insert(purchaseInvoices).values(withTenantId(ctx.tenantId, {
          number,
          supplierId: doc.supplierId,
          date: doc.date as any,
          warehouseId: input.warehouseId,
          paymentType: input.paymentType,
          subtotal: String(subtotal),
          discount: doc.discount || "0",
          tax: doc.tax || "0",
          total: doc.total,
          paid: isCash ? doc.total : "0",
          remaining: isCash ? "0" : doc.total,
          notes: doc.serial ? `مستورد من التقرير ${doc.serial}` : "مستورد من تقرير مشتريات",
          createdBy: ctx.user.id,
          status: isCash ? "paid" : "confirmed",
        }) as any);
        const invId = Number((result as any).insertId);
        for (const line of doc.lines) {
          await db.insert(purchaseInvoiceItems).values(withTenantId(ctx.tenantId, {
            invoiceId: invId,
            itemId: line.itemId,
            quantity: line.quantity,
            price: line.price,
            discount: line.discount || "0",
            tax: line.tax || "0",
            total: line.total,
          }) as any);
          await applyStockMovement(db, ctx.tenantId, {
            itemId: line.itemId,
            quantity: line.quantity,
            direction: "in",
            warehouseId: input.warehouseId,
          });
          if (Number(line.price) > 0) {
            await updateAverageCostAfterPurchase(db, ctx.tenantId, line.itemId, Number(line.quantity), Number(line.price), input.warehouseId);
          }
        }
        imported += 1;
      } catch (e) {
        errors.push(`${doc.serial || doc.date}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { imported, failed: errors.length, errors: errors.slice(0, 30) };
  }),

  commitProduction: protectedProcedure.input(z.object({
    defaultWarehouseId: z.number().optional(),
    documents: z.array(z.object({
      productId: z.number(),
      warehouseId: z.number(),
      quantity: z.string(),
      date: z.string(),
      barcode: z.string().optional(),
      notes: z.string().optional(),
      materials: z.array(z.object({
        itemId: z.number(),
        quantity: z.string(),
      })).min(1),
    })).min(1).max(500),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    let imported = 0;
    const errors: string[] = [];
    for (const doc of input.documents) {
      try {
        const [countResult] = await db.select({ count: count() }).from(productionOrders).where(tenantWhere(productionOrders, ctx.tenantId));
        const number = `PO-${String(countResult.count + 1).padStart(5, "0")}`;
        const [result] = await db.insert(productionOrders).values(withTenantId(ctx.tenantId, {
          number,
          productId: doc.productId,
          warehouseId: doc.warehouseId || input.defaultWarehouseId,
          quantity: doc.quantity,
          date: doc.date as any,
          notes: doc.notes || (doc.barcode ? `باركود ${doc.barcode}` : "مستورد من أوامر إنتاج"),
          status: "draft",
          createdBy: ctx.user?.id,
        }) as any);
        const orderId = Number((result as any).insertId);
        for (const m of doc.materials) {
          await db.insert(productionOrderMaterials).values(withTenantId(ctx.tenantId, {
            orderId,
            itemId: m.itemId,
            quantity: m.quantity,
            scrapPercent: "0",
          }) as any);
        }
        imported += 1;
      } catch (e) {
        errors.push(`${doc.barcode || doc.quantity}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { imported, failed: errors.length, errors: errors.slice(0, 30) };
  }),

  commitItemCosts: protectedProcedure.input(z.object({
    date: z.string(),
    lines: z.array(z.object({
      itemId: z.number(),
      warehouseId: z.number(),
      quantity: z.string(),
      unitCost: z.string().optional(),
    })).min(1).max(5000),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { applyStockMovement } = await import("./inventory-stock");
    const { updateAverageCostAfterPurchase } = await import("./inventory-cost");
    let imported = 0;
    const errors: string[] = [];
    for (const line of input.lines) {
      try {
        const existing = await db.select().from(beginningInventory).where(tenantWhere(
          beginningInventory,
          ctx.tenantId,
          and(
            eq(beginningInventory.itemId, line.itemId),
            eq(beginningInventory.warehouseId, line.warehouseId),
          ),
        ));
        for (const prev of existing) {
          await applyStockMovement(db, ctx.tenantId, {
            itemId: prev.itemId,
            quantity: prev.quantity,
            direction: "out",
            warehouseId: prev.warehouseId,
            allowNegative: true,
          });
          await db.delete(beginningInventory)
            .where(tenantWhere(beginningInventory, ctx.tenantId, eq(beginningInventory.id, prev.id)));
        }

        await db.insert(beginningInventory).values(withTenantId(ctx.tenantId, {
          warehouseId: line.warehouseId,
          itemId: line.itemId,
          quantity: String(line.quantity),
          unitCost: line.unitCost || "0",
          date: input.date as any,
        }) as any);
        await applyStockMovement(db, ctx.tenantId, {
          itemId: line.itemId,
          quantity: String(line.quantity),
          direction: "in",
          warehouseId: line.warehouseId,
        });
        if (line.unitCost && Number(line.unitCost) > 0) {
          await updateAverageCostAfterPurchase(db, ctx.tenantId, line.itemId, Number(line.quantity), Number(line.unitCost), line.warehouseId);
        }
        imported += 1;
      } catch (e) {
        errors.push(`#${line.itemId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { imported, failed: errors.length, errors: errors.slice(0, 30) };
  }),

  /** اعتماد تركيبات (BOM) لأصناف تامة من تقرير "تقدير الكميات بالمكونات" — كل منتج يستبدل خلطته بالكامل */
  commitBom: protectedProcedure.input(z.object({
    documents: z.array(z.object({
      productId: z.number(),
      lines: z.array(z.object({
        materialItemId: z.number(),
        quantityPerUnit: z.string(),
      })).min(1),
    })).min(1).max(2000),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    let imported = 0;
    const errors: string[] = [];
    for (const doc of input.documents) {
      try {
        const merged = new Map<number, number>();
        for (const line of doc.lines) {
          if (line.materialItemId === doc.productId) continue;
          const qty = Number(line.quantityPerUnit);
          if (!Number.isFinite(qty) || qty <= 0) continue;
          merged.set(line.materialItemId, (merged.get(line.materialItemId) || 0) + qty);
        }
        if (!merged.size) { errors.push(`#${doc.productId}: لا توجد مكونات صالحة`); continue; }
        await db.delete(itemBomLines).where(
          tenantWhere(itemBomLines, ctx.tenantId, eq(itemBomLines.productId, doc.productId)),
        );
        for (const [materialItemId, quantityPerUnit] of merged) {
          await db.insert(itemBomLines).values(withTenantId(ctx.tenantId, {
            productId: doc.productId,
            materialItemId,
            quantityPerUnit: String(quantityPerUnit),
            scrapPercent: "0",
          }) as any);
        }
        imported += 1;
      } catch (e) {
        errors.push(`#${doc.productId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { imported, failed: errors.length, errors: errors.slice(0, 30) };
  }),
});
