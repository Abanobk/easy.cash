/**
 * تكليف شحنة — مسودات تقدير فقط.
 * ممنوع: قيود، فواتير، استلام مخزن، تحديث تكلفة صنف.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { count, desc, eq, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { importCostLines, importCostShipments } from "../drizzle/schema";
import { tenantWhere, withTenantId } from "./tenant-scope";
import { assertEntityAction } from "./entity-permission-service";
import {
  ALLOC_LABELS,
  computeImportCost,
  defaultShippingQuote,
  emptyImportCostHeader,
  parseShippingQuote,
  type AllocKey,
  type ImportCostHeader,
  type ImportCostLineInput,
  type ImportCostPresetId,
} from "../shared/import-costing";

const allocZ = z.enum(["unit_cost", "weight", "line_total", "equal"]);
const presetZ = z.string().max(32).optional();

const headerZ = z.object({
  name: z.string().min(1),
  shipmentDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  preset: presetZ.optional(),
  currencyCode: z.string().optional(),
  costFxRate: z.number(),
  customsFxRate: z.number(),
  customsAssessableUsd: z.number(),
  customsRate: z.number(),
  vatRate: z.number(),
  withholdingRate: z.number(),
  shippingUsd: z.number(),
  agentFeeUsd: z.number(),
  ocaUsd: z.number(),
  yardFeesEgp: z.number(),
  brokerFeesEgp: z.number(),
  batteriesEgp: z.number(),
  freightLocalEgp: z.number().optional(),
  shippingQuote: z.object({
    enabled: z.boolean(),
    pol: z.string(),
    pod: z.string(),
    volumeCbm: z.number(),
    expectedWeeks: z.number(),
    ofRateUsd: z.number(),
    thcRateEgp: z.number(),
    storageWeek1Egp: z.number(),
    extraDayRateEgp: z.number(),
    minCbmLocal: z.number(),
    vatOnThcStorage: z.boolean(),
    vatOnExtraDays: z.boolean(),
  }).optional(),
  ocaAlloc: allocZ,
  shippingAlloc: allocZ,
  agentAlloc: allocZ,
  localAlloc: allocZ,
});

const lineZ = z.object({
  category: z.string().optional(),
  barcode: z.string().optional(),
  itemName: z.string().min(1),
  quantity: z.number(),
  unitCostUsd: z.number(),
  unitWeight: z.number(),
});

function dec(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "0";
}

function headerFromRow(row: typeof importCostShipments.$inferSelect): ImportCostHeader {
  return {
    costFxRate: Number(row.costFxRate || 0),
    customsFxRate: Number(row.customsFxRate || 0),
    customsAssessableUsd: Number(row.customsAssessableUsd || 0),
    customsRate: Number(row.customsRate || 0),
    vatRate: Number(row.vatRate || 0),
    withholdingRate: Number(row.withholdingRate || 0),
    shippingUsd: Number(row.shippingUsd || 0),
    agentFeeUsd: Number(row.agentFeeUsd || 0),
    ocaUsd: Number(row.ocaUsd || 0),
    yardFeesEgp: Number(row.yardFeesEgp || 0),
    brokerFeesEgp: Number(row.brokerFeesEgp || 0),
    batteriesEgp: Number(row.batteriesEgp || 0),
    freightLocalEgp: Number(row.freightLocalEgp || 0),
    shippingQuote: parseShippingQuote(row.shippingQuote),
    ocaAlloc: (row.ocaAlloc as AllocKey) || "unit_cost",
    shippingAlloc: (row.shippingAlloc as AllocKey) || "unit_cost",
    agentAlloc: (row.agentAlloc as AllocKey) || "unit_cost",
    localAlloc: (row.localAlloc as AllocKey) || "weight",
  };
}

function linesFromRows(rows: (typeof importCostLines.$inferSelect)[]): ImportCostLineInput[] {
  return rows.map((r) => ({
    category: r.category || "",
    barcode: r.barcode || "",
    itemName: r.itemName,
    quantity: Number(r.quantity || 0),
    unitCostUsd: Number(r.unitCostUsd || 0),
    unitWeight: Number(r.unitWeight || 0),
  }));
}

function headerValues(input: z.infer<typeof headerZ>) {
  return {
    name: input.name.trim(),
    shipmentDate: input.shipmentDate || null,
    notes: input.notes || null,
    preset: input.preset || "custom",
    currencyCode: input.currencyCode || "USD",
    costFxRate: dec(input.costFxRate),
    customsFxRate: dec(input.customsFxRate),
    customsAssessableUsd: dec(input.customsAssessableUsd),
    customsRate: dec(input.customsRate),
    vatRate: dec(input.vatRate),
    withholdingRate: dec(input.withholdingRate),
    shippingUsd: dec(input.shippingUsd),
    agentFeeUsd: dec(input.agentFeeUsd),
    ocaUsd: dec(input.ocaUsd),
    yardFeesEgp: dec(input.yardFeesEgp),
    brokerFeesEgp: dec(input.brokerFeesEgp),
    batteriesEgp: dec(input.batteriesEgp),
    freightLocalEgp: dec(input.freightLocalEgp || 0),
    shippingQuote: JSON.stringify(input.shippingQuote || defaultShippingQuote()),
    ocaAlloc: input.ocaAlloc,
    shippingAlloc: input.shippingAlloc,
    agentAlloc: input.agentAlloc,
    localAlloc: input.localAlloc,
  };
}

export const importCostingRouter = router({
  defaults: protectedProcedure.query(() => ({
    header: emptyImportCostHeader(),
    allocLabels: ALLOC_LABELS,
  })),

  list: protectedProcedure
    .input(z.object({ page: z.number().default(1), limit: z.number().default(20) }).optional())
    .query(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "import_costing", "shipmentCosting", "viewDocList");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 20;
      const offset = (page - 1) * limit;
      const rows = await db
        .select()
        .from(importCostShipments)
        .where(tenantWhere(importCostShipments, ctx.tenantId))
        .orderBy(desc(importCostShipments.createdAt))
        .limit(limit)
        .offset(offset);
      const [total] = await db
        .select({ count: count() })
        .from(importCostShipments)
        .where(tenantWhere(importCostShipments, ctx.tenantId));

      const ids = rows.map((r) => r.id);
      const allLines = ids.length
        ? await db.select().from(importCostLines).where(
          tenantWhere(importCostLines, ctx.tenantId, inArray(importCostLines.shipmentId, ids)),
        )
        : [];
      const byShip = new Map<number, typeof allLines>();
      for (const line of allLines) {
        if (!ids.includes(line.shipmentId)) continue;
        const list = byShip.get(line.shipmentId) || [];
        list.push(line);
        byShip.set(line.shipmentId, list);
      }

      return {
        rows: rows.map((row) => {
          const computed = computeImportCost(headerFromRow(row), linesFromRows(byShip.get(row.id) || []));
          const units = computed.lines.map((l) => l.landedUnitEgp).filter((n) => n > 0);
          return {
            id: row.id,
            number: row.number,
            name: row.name,
            preset: row.preset,
            shipmentDate: row.shipmentDate,
            createdAt: row.createdAt,
            lineCount: computed.lines.length,
            quantity: computed.totals.quantity,
            minLanded: units.length ? Math.min(...units) : 0,
            maxLanded: units.length ? Math.max(...units) : 0,
            dueUsd: computed.totals.dueUsd,
            dueLocalEgp: computed.totals.dueLocalEgp,
            landedEgp: computed.totals.landedEgp,
          };
        }),
        total: total.count,
      };
    }),

  get: protectedProcedure.input(z.number()).query(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "import_costing", "shipmentCosting", "viewDoc");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db
      .select()
      .from(importCostShipments)
      .where(tenantWhere(importCostShipments, ctx.tenantId, eq(importCostShipments.id, input)))
      .limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "الشحنة غير موجودة" });
    const lines = await db
      .select()
      .from(importCostLines)
      .where(tenantWhere(importCostLines, ctx.tenantId, eq(importCostLines.shipmentId, input)));
    lines.sort((a, b) => a.lineNo - b.lineNo);
    const header = headerFromRow(row);
    const computed = computeImportCost(header, linesFromRows(lines));
    return {
      id: row.id,
      number: row.number,
      name: row.name,
      shipmentDate: row.shipmentDate,
      notes: row.notes,
      preset: (row.preset || "custom") as ImportCostPresetId | "custom",
      currencyCode: row.currencyCode || "USD",
      header,
      lines: computed.lines,
      totals: computed.totals,
      pools: computed.pools,
    };
  }),

  create: protectedProcedure
    .input(z.object({ header: headerZ, lines: z.array(lineZ) }))
    .mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "import_costing", "shipmentCosting", "add");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [cnt] = await db
        .select({ count: count() })
        .from(importCostShipments)
        .where(tenantWhere(importCostShipments, ctx.tenantId));
      const number = `IC-${String(cnt.count + 1).padStart(5, "0")}`;
      const result = await db.insert(importCostShipments).values(
        withTenantId(ctx.tenantId, { number, ...headerValues(input.header) }) as any,
      );
      const id = Number((result as { insertId?: number }).insertId ?? 0);
      if (id && input.lines.length) {
        await db.insert(importCostLines).values(
          input.lines.map((line, i) =>
            withTenantId(ctx.tenantId, {
              shipmentId: id,
              lineNo: i + 1,
              category: line.category || null,
              barcode: line.barcode || null,
              itemName: line.itemName.trim(),
              quantity: dec(line.quantity),
              unitCostUsd: dec(line.unitCostUsd),
              unitWeight: dec(line.unitWeight),
            }) as any,
          ),
        );
      }
      return { id, number };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), header: headerZ, lines: z.array(lineZ) }))
    .mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "import_costing", "shipmentCosting", "edit");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db
        .select({ id: importCostShipments.id })
        .from(importCostShipments)
        .where(tenantWhere(importCostShipments, ctx.tenantId, eq(importCostShipments.id, input.id)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "الشحنة غير موجودة" });
      await db
        .update(importCostShipments)
        .set(headerValues(input.header) as any)
        .where(tenantWhere(importCostShipments, ctx.tenantId, eq(importCostShipments.id, input.id)));
      await db
        .delete(importCostLines)
        .where(tenantWhere(importCostLines, ctx.tenantId, eq(importCostLines.shipmentId, input.id)));
      if (input.lines.length) {
        await db.insert(importCostLines).values(
          input.lines.map((line, i) =>
            withTenantId(ctx.tenantId, {
              shipmentId: input.id,
              lineNo: i + 1,
              category: line.category || null,
              barcode: line.barcode || null,
              itemName: line.itemName.trim(),
              quantity: dec(line.quantity),
              unitCostUsd: dec(line.unitCostUsd),
              unitWeight: dec(line.unitWeight),
            }) as any,
          ),
        );
      }
      return { success: true as const };
    }),

  createDuplicate: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "import_costing", "shipmentCosting", "add");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db
      .select()
      .from(importCostShipments)
      .where(tenantWhere(importCostShipments, ctx.tenantId, eq(importCostShipments.id, input)))
      .limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "الشحنة غير موجودة" });
    const lines = await db
      .select()
      .from(importCostLines)
      .where(tenantWhere(importCostLines, ctx.tenantId, eq(importCostLines.shipmentId, input)));
    const [cnt] = await db
      .select({ count: count() })
      .from(importCostShipments)
      .where(tenantWhere(importCostShipments, ctx.tenantId));
    const number = `IC-${String(cnt.count + 1).padStart(5, "0")}`;
    const { id: _id, createdAt: _c, updatedAt: _u, number: _n, ...rest } = row;
    const result = await db.insert(importCostShipments).values(
      withTenantId(ctx.tenantId, {
        ...rest,
        number,
        name: `نسخة من ${row.name}`,
      }) as any,
    );
    const id = Number((result as { insertId?: number }).insertId ?? 0);
    if (id && lines.length) {
      await db.insert(importCostLines).values(
        lines.map((line, i) =>
          withTenantId(ctx.tenantId, {
            shipmentId: id,
            lineNo: i + 1,
            category: line.category,
            barcode: line.barcode,
            itemName: line.itemName,
            quantity: line.quantity,
            unitCostUsd: line.unitCostUsd,
            unitWeight: line.unitWeight,
          }) as any,
        ),
      );
    }
    return { id, number };
  }),

  delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "import_costing", "shipmentCosting", "deleteCancel");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db
      .delete(importCostLines)
      .where(tenantWhere(importCostLines, ctx.tenantId, eq(importCostLines.shipmentId, input)));
    await db
      .delete(importCostShipments)
      .where(tenantWhere(importCostShipments, ctx.tenantId, eq(importCostShipments.id, input)));
    return { success: true as const };
  }),
});
