import { z } from "zod";
import { eq, desc, and, or, gte, lte, isNull, sql, like, type Column } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { tenantWhere, withTenantId } from "./tenant-scope";
import {
  exchangeRates, generalAttributes, measureUnits, fiscalYears, userActivities, cities, companyAddresses,
  hrShifts, hrVacations, employeeShifts, hrIncentives, underRequestEmployees,
  fingerprintMachines, mobileFpLocations, hrSystems, hrDepEmpSystems, machinePunches,
  itemBatches, itemOffers, itemPriceChanges, beginningInventory, itemSerials,
  assetCategories, assetCapitalMaintenance, assetSales, salesAreas,
  items, customers, employees, attendance, itemCategories, fixedAssets,
  employeeVacationRecords, departments, warehouses, suppliers, branches,
  salesInvoices, purchaseInvoices,
} from "../drizzle/schema";
import { isInsideGeofence, syncMachineFromTcp, syncMachinePunches, testMachineTcpConnection, upsertDailyAttendance } from "./hr-attendance";
import { postAssetSaleJournal, cancelPostedJournalByReference, postHrIncentiveJournal } from "./auto-journal";
import { IMPORT_TEMPLATES, importBulkPayload, importEntityRows, type ImportEntity } from "./import-service";
import { isDateInClosedPeriod } from "./fiscal-period-guard";
import {
  backfillMissingCogsJournals,
  closeFiscalYearWithJournals,
  getFiscalYearCloseReadiness,
} from "./fiscal-year-closing";

type TenantTable = { tenantId: Column<any, object, object>; id: Column<any, object, object> };

/** توحيد نص الصنف/الباركود للمطابقة الذكية */
function normalizeItemKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "") // تشكيل
    .replace(/\u0640/g, "") // تطويل
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\s\-_/\\]+/g, " ")
    .trim();
}

function crudRouter<T extends TenantTable>(
  table: T,
  createSchema: z.ZodTypeAny,
  orderBy?: unknown,
) {
  return router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const q = db.select().from(table as any).where(tenantWhere(table, ctx.tenantId));
      return orderBy ? q.orderBy(orderBy as any) : q;
    }),
    create: protectedProcedure.input(createSchema).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(table as any).values(withTenantId(ctx.tenantId, input as Record<string, unknown>) as any);
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({ id: z.number() }).passthrough()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input as { id: number; [k: string]: unknown };
      await db.update(table as any).set(data as any).where(tenantWhere(table, ctx.tenantId, eq((table as any).id, id)));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(table as any).where(tenantWhere(table, ctx.tenantId, eq((table as any).id, input)));
      return { success: true };
    }),
  });
}

export const settingsExtendedRouter = router({
  exchangeRates: crudRouter(exchangeRates, z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    rate: z.string(),
    isDefault: z.boolean().optional(),
  }), desc(exchangeRates.createdAt)),
  generalAttributes: crudRouter(generalAttributes, z.object({
    attrKey: z.string().min(1),
    attrValue: z.string().optional(),
  })),
  /** وحدات القياس — مرجع Mega: إعدادات عامة → خصائص عامة */
  measureUnits: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { listMeasureUnits } = await import("./measure-units");
      return listMeasureUnits(db, ctx.tenantId!);
    }),
    listActive: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { listMeasureUnits } = await import("./measure-units");
      return listMeasureUnits(db, ctx.tenantId!, { activeOnly: true });
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1).max(50),
      code: z.string().max(20).optional(),
      sortOrder: z.union([z.string(), z.number()]).optional(),
      isActive: z.union([z.boolean(), z.string()]).optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { normalizeMeasureUnitName } = await import("./measure-units");
      const name = normalizeMeasureUnitName(input.name);
      if (!name) throw new TRPCError({ code: "BAD_REQUEST", message: "اسم الوحدة مطلوب" });
      const isActive = input.isActive === false || input.isActive === "false" ? false : true;
      const sortOrder = input.sortOrder != null && String(input.sortOrder).trim() !== ""
        ? Number(input.sortOrder)
        : 0;
      try {
        await db.insert(measureUnits).values(withTenantId(ctx.tenantId, {
          name,
          code: (input.code || "").trim() || null,
          sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
          isActive,
        }) as any);
      } catch (e: unknown) {
        throw new TRPCError({ code: "CONFLICT", message: "وحدة القياس مسجّلة مسبقاً" });
      }
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).max(50).optional(),
      code: z.string().max(20).optional(),
      sortOrder: z.union([z.string(), z.number()]).optional(),
      isActive: z.union([z.boolean(), z.string()]).optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { normalizeMeasureUnitName } = await import("./measure-units");
      const patch: Record<string, unknown> = {};
      if (input.name != null) {
        const name = normalizeMeasureUnitName(input.name);
        if (!name) throw new TRPCError({ code: "BAD_REQUEST", message: "اسم الوحدة مطلوب" });
        patch.name = name;
      }
      if (input.code !== undefined) patch.code = (input.code || "").trim() || null;
      if (input.sortOrder !== undefined && String(input.sortOrder).trim() !== "") {
        const n = Number(input.sortOrder);
        if (Number.isFinite(n)) patch.sortOrder = n;
      }
      if (input.isActive !== undefined) {
        patch.isActive = !(input.isActive === false || input.isActive === "false");
      }
      try {
        await db.update(measureUnits).set(patch as any)
          .where(tenantWhere(measureUnits, ctx.tenantId, eq(measureUnits.id, input.id)));
      } catch {
        throw new TRPCError({ code: "CONFLICT", message: "وحدة القياس مسجّلة مسبقاً" });
      }
      return { success: true };
    }),
    delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [unit] = await db.select().from(measureUnits)
        .where(tenantWhere(measureUnits, ctx.tenantId, eq(measureUnits.id, input))).limit(1);
      if (!unit) throw new TRPCError({ code: "NOT_FOUND", message: "الوحدة غير موجودة" });
      const [used] = await db.select({ n: sql<number>`count(*)` }).from(items)
        .where(tenantWhere(items, ctx.tenantId, eq(items.unit, unit.name)));
      if (Number(used?.n ?? 0) > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `لا يمكن حذف «${unit.name}» — مستخدمة في أصناف. عطّلها بدل الحذف.`,
        });
      }
      await db.delete(measureUnits).where(tenantWhere(measureUnits, ctx.tenantId, eq(measureUnits.id, input)));
      return { success: true };
    }),
  }),
  fiscalYears: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(fiscalYears).where(tenantWhere(fiscalYears, ctx.tenantId)).orderBy(desc(fiscalYears.startDate));
    }),
    checkDate: protectedProcedure.input(z.object({ date: z.string() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const closed = await isDateInClosedPeriod(db, ctx.tenantId, input.date);
      return { closed };
    }),
    readiness: protectedProcedure.input(z.number()).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [fy] = await db
        .select()
        .from(fiscalYears)
        .where(tenantWhere(fiscalYears, ctx.tenantId, eq(fiscalYears.id, input)));
      if (!fy) throw new TRPCError({ code: "NOT_FOUND", message: "الفترة غير موجودة" });
      return getFiscalYearCloseReadiness(db, ctx.tenantId, fy);
    }),
    backfillCogs: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return backfillMissingCogsJournals(db, ctx.tenantId, ctx.user?.id);
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1),
      startDate: z.string(),
      endDate: z.string(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(fiscalYears).values(withTenantId(ctx.tenantId, { ...input, status: "open" }) as any);
      const newId = (result as { insertId: number }).insertId;
      const closedYears = await db
        .select()
        .from(fiscalYears)
        .where(tenantWhere(fiscalYears, ctx.tenantId, eq(fiscalYears.status, "closed")))
        .orderBy(desc(fiscalYears.endDate));
      const prev = closedYears.find((c) => String(c.endDate).slice(0, 10) < input.startDate);
      let openingJournalCreated = false;
      if (prev) {
        const { postYearOpeningJournal } = await import("./auto-journal");
        const openRes = await postYearOpeningJournal(
          db,
          ctx.tenantId,
          ctx.user?.id,
          { id: newId, name: input.name, startDate: input.startDate },
          String(prev.endDate).slice(0, 10),
        );
        openingJournalCreated = !openRes?.skipped;
      }
      return { success: true, id: newId, openingJournalCreated };
    }),
    close: protectedProcedure.input(z.object({
      id: z.number(),
      skipClosingJournal: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [fy] = await db
        .select()
        .from(fiscalYears)
        .where(tenantWhere(fiscalYears, ctx.tenantId, eq(fiscalYears.id, input.id)));
      if (!fy) throw new TRPCError({ code: "NOT_FOUND", message: "الفترة غير موجودة" });

      const { readiness, closingResult } = await closeFiscalYearWithJournals(
        db,
        ctx.tenantId,
        ctx.user?.id,
        fy,
        { skipClosingJournal: input.skipClosingJournal },
      );

      await db.update(fiscalYears).set({ status: "closed" }).where(tenantWhere(fiscalYears, ctx.tenantId, eq(fiscalYears.id, input.id)));
      await db.insert(userActivities).values(withTenantId(ctx.tenantId, {
        userId: ctx.user?.id,
        userName: ctx.user?.name || "",
        action: "إغلاق فترة مالية",
        details: `${fy.name} (${String(fy.startDate).slice(0, 10)} — ${String(fy.endDate).slice(0, 10)})` +
          (closingResult && !closingResult.skipped ? " — مع قيد إقفال" : ""),
      }) as any);
      return { success: true, readiness, closingResult };
    }),
    reopen: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [fy] = await db
        .select()
        .from(fiscalYears)
        .where(tenantWhere(fiscalYears, ctx.tenantId, eq(fiscalYears.id, input)));
      if (!fy) throw new TRPCError({ code: "NOT_FOUND", message: "الفترة غير موجودة" });
      await db.update(fiscalYears).set({ status: "open" }).where(tenantWhere(fiscalYears, ctx.tenantId, eq(fiscalYears.id, input)));
      await db.insert(userActivities).values(withTenantId(ctx.tenantId, {
        userId: ctx.user?.id,
        userName: ctx.user?.name || "",
        action: "فتح فترة مالية",
        details: `${fy.name} (${String(fy.startDate).slice(0, 10)} — ${String(fy.endDate).slice(0, 10)})`,
      }) as any);
      return { success: true };
    }),
  }),
  userActivities: router({
    list: protectedProcedure.input(z.object({
      limit: z.number().default(200),
      action: z.string().optional(),
      search: z.string().optional(),
    })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const conds = [];
      if (input.action?.trim()) conds.push(eq(userActivities.action, input.action.trim()));
      if (input.search?.trim()) {
        const q = `%${input.search.trim()}%`;
        conds.push(or(
          like(userActivities.userName, q),
          like(userActivities.action, q),
          like(userActivities.details, q),
        ));
      }
      return db.select().from(userActivities).where(tenantWhere(userActivities, ctx.tenantId, ...(conds.length ? [and(...conds)] : [])))
        .orderBy(desc(userActivities.createdAt)).limit(input.limit);
    }),
    log: protectedProcedure.input(z.object({ action: z.string(), details: z.string().optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(userActivities).values(withTenantId(ctx.tenantId, {
        userId: ctx.user?.id,
        userName: ctx.user?.name || "",
        action: input.action,
        details: input.details,
      }) as any);
      return { success: true };
    }),
  }),
  cities: crudRouter(cities, z.object({
    governorate: z.string().min(1),
    name: z.string().min(1),
  }), cities.name),
  addresses: crudRouter(companyAddresses, z.object({
    label: z.string().min(1),
    address: z.string().optional(),
    cityId: z.number().optional(),
    phone: z.string().optional(),
  })),
  stats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const tid = ctx.tenantId;
    const [
      custCount, suppCount, itemCount, empCount, whCount, branchCount,
      salesCount, purchaseCount, fyRows,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(customers).where(tenantWhere(customers, tid)),
      db.select({ count: sql<number>`count(*)` }).from(suppliers).where(tenantWhere(suppliers, tid)),
      db.select({ count: sql<number>`count(*)` }).from(items).where(tenantWhere(items, tid)),
      db.select({ count: sql<number>`count(*)` }).from(employees).where(tenantWhere(employees, tid)),
      db.select({ count: sql<number>`count(*)` }).from(warehouses).where(tenantWhere(warehouses, tid)),
      db.select({ count: sql<number>`count(*)` }).from(branches).where(tenantWhere(branches, tid)),
      db.select({ count: sql<number>`count(*)` }).from(salesInvoices).where(tenantWhere(salesInvoices, tid)),
      db.select({ count: sql<number>`count(*)` }).from(purchaseInvoices).where(tenantWhere(purchaseInvoices, tid)),
      db.select().from(fiscalYears).where(tenantWhere(fiscalYears, tid)),
    ]);
    return {
      customers: Number(custCount[0]?.count ?? 0),
      suppliers: Number(suppCount[0]?.count ?? 0),
      items: Number(itemCount[0]?.count ?? 0),
      employees: Number(empCount[0]?.count ?? 0),
      warehouses: Number(whCount[0]?.count ?? 0),
      branches: Number(branchCount[0]?.count ?? 0),
      salesInvoices: Number(salesCount[0]?.count ?? 0),
      purchaseInvoices: Number(purchaseCount[0]?.count ?? 0),
      fiscalYears: fyRows.length,
      openFiscalYears: fyRows.filter((f) => f.status === "open").length,
    };
  }),
  importData: protectedProcedure.input(z.object({
    entity: z.enum(["customers", "suppliers", "items", "accounts", "employees", "warehouses", "itemCategories", "departments"]).optional(),
    rows: z.array(z.record(z.string(), z.unknown())).optional(),
    upsertByCode: z.boolean().optional(),
    customers: z.array(z.record(z.string(), z.unknown())).optional(),
    suppliers: z.array(z.record(z.string(), z.unknown())).optional(),
    items: z.array(z.record(z.string(), z.unknown())).optional(),
    accounts: z.array(z.record(z.string(), z.unknown())).optional(),
    employees: z.array(z.record(z.string(), z.unknown())).optional(),
    warehouses: z.array(z.record(z.string(), z.unknown())).optional(),
    itemCategories: z.array(z.record(z.string(), z.unknown())).optional(),
    departments: z.array(z.record(z.string(), z.unknown())).optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    if (input.entity && input.rows?.length) {
      const res = await importEntityRows(db, ctx.tenantId, input.entity as ImportEntity, input.rows as Record<string, unknown>[], { upsertByCode: input.upsertByCode });
      await db.insert(userActivities).values(withTenantId(ctx.tenantId, {
        userId: ctx.user?.id,
        userName: ctx.user?.name || "",
        action: "import",
        details: `${input.entity}: ${res.imported} جديد، ${res.updated} محدّث`,
      }) as any);
      return { success: true, ...res };
    }
    const payload = {
      customers: input.customers as Record<string, unknown>[] | undefined,
      suppliers: input.suppliers as Record<string, unknown>[] | undefined,
      items: input.items as Record<string, unknown>[] | undefined,
      accounts: input.accounts as Record<string, unknown>[] | undefined,
      employees: input.employees as Record<string, unknown>[] | undefined,
      warehouses: input.warehouses as Record<string, unknown>[] | undefined,
      itemCategories: input.itemCategories as Record<string, unknown>[] | undefined,
      departments: input.departments as Record<string, unknown>[] | undefined,
    };
    const res = await importBulkPayload(db, ctx.tenantId, payload, { upsertByCode: input.upsertByCode });
    return { success: true, imported: res.totalImported, updated: res.totalUpdated, summary: res.summary };
  }),
  importTemplate: protectedProcedure.input(z.enum(["customers", "suppliers", "items", "accounts", "employees", "warehouses", "itemCategories", "departments"]))
    .query(({ input }) => IMPORT_TEMPLATES[input]),
  eta: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { getEtaSettingsForTenant } = await import("./eta-service");
      return getEtaSettingsForTenant(db, ctx.tenantId);
    }),
    save: protectedProcedure.input(z.object({
      enabled: z.boolean(),
      mode: z.enum(["preprod", "production"]),
      clientId: z.string(),
      clientSecret: z.string().optional(),
      activityCode: z.string(),
      branchCode: z.string().default("0"),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { saveEtaSettings } = await import("./eta-service");
      return saveEtaSettings(db, ctx.tenantId, input);
    }),
    testConnection: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { testEtaConnection } = await import("./eta-service");
      return testEtaConnection(db, ctx.tenantId);
    }),
  }),
});

export const hrExtendedRouter = router({
  shifts: crudRouter(hrShifts, z.object({
    name: z.string().min(1),
    startTime: z.string(),
    endTime: z.string(),
    isActive: z.boolean().optional(),
  })),
  vacations: crudRouter(hrVacations, z.object({
    name: z.string().min(1),
    daysPerYear: z.number().optional(),
    isPaid: z.boolean().optional(),
  })),
  employeeVacations: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select({
        id: employeeVacationRecords.id,
        employeeId: employeeVacationRecords.employeeId,
        vacationTypeId: employeeVacationRecords.vacationTypeId,
        startDate: employeeVacationRecords.startDate,
        endDate: employeeVacationRecords.endDate,
        days: employeeVacationRecords.days,
        status: employeeVacationRecords.status,
        notes: employeeVacationRecords.notes,
        employeeName: employees.name,
        vacationTypeName: hrVacations.name,
      }).from(employeeVacationRecords)
        .where(tenantWhere(employeeVacationRecords, ctx.tenantId))
        .leftJoin(employees, eq(employeeVacationRecords.employeeId, employees.id))
        .leftJoin(hrVacations, eq(employeeVacationRecords.vacationTypeId, hrVacations.id))
        .orderBy(desc(employeeVacationRecords.startDate));
    }),
    create: protectedProcedure.input(z.object({
      employeeId: z.number(),
      vacationTypeId: z.number().optional(),
      startDate: z.string(),
      endDate: z.string(),
      days: z.number().optional(),
      status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      const computedDays = Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
        ? Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1)
        : 1;
      await db.insert(employeeVacationRecords).values(withTenantId(ctx.tenantId, {
        ...input,
        days: input.days ?? computedDays,
        status: input.status || "pending",
      }) as any);
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(employeeVacationRecords).set(data as any)
        .where(tenantWhere(employeeVacationRecords, ctx.tenantId, eq(employeeVacationRecords.id, id)));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(employeeVacationRecords).where(tenantWhere(employeeVacationRecords, ctx.tenantId, eq(employeeVacationRecords.id, input)));
      return { success: true };
    }),
  }),
  employeeShifts: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select({
        id: employeeShifts.id,
        employeeId: employeeShifts.employeeId,
        shiftId: employeeShifts.shiftId,
        effectiveFrom: employeeShifts.effectiveFrom,
        employeeName: employees.name,
        shiftName: hrShifts.name,
      }).from(employeeShifts)
        .where(tenantWhere(employeeShifts, ctx.tenantId))
        .leftJoin(employees, eq(employeeShifts.employeeId, employees.id))
        .leftJoin(hrShifts, eq(employeeShifts.shiftId, hrShifts.id))
        .orderBy(desc(employeeShifts.effectiveFrom));
    }),
    create: protectedProcedure.input(z.object({
      employeeId: z.number(),
      shiftId: z.number(),
      effectiveFrom: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(employeeShifts).values(withTenantId(ctx.tenantId, input) as any);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(employeeShifts).where(tenantWhere(employeeShifts, ctx.tenantId, eq(employeeShifts.id, input)));
      return { success: true };
    }),
  }),
  incentives: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select({
        id: hrIncentives.id,
        employeeId: hrIncentives.employeeId,
        employeeName: employees.name,
        amount: hrIncentives.amount,
        date: hrIncentives.date,
        reason: hrIncentives.reason,
      }).from(hrIncentives)
        .where(tenantWhere(hrIncentives, ctx.tenantId))
        .leftJoin(employees, eq(hrIncentives.employeeId, employees.id))
        .orderBy(desc(hrIncentives.date));
    }),
    create: protectedProcedure.input(z.object({
      employeeId: z.number(),
      amount: z.string(),
      date: z.string(),
      reason: z.string().optional(),
      settlementMethod: z.enum(["cash", "bank"]).default("cash"),
      bankAccountId: z.number().optional(),
      postJournal: z.boolean().default(true),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input.settlementMethod === "bank" && !input.bankAccountId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "اختر الحساب البنكي للتسوية" });
      }
      const { settlementMethod, bankAccountId, postJournal, ...row } = input;
      const [ins] = await db.insert(hrIncentives).values(withTenantId(ctx.tenantId, row) as any);
      const incentiveId = (ins as { insertId: number }).insertId;
      if (postJournal) {
        const [emp] = await db.select({ name: employees.name }).from(employees)
          .where(tenantWhere(employees, ctx.tenantId, eq(employees.id, input.employeeId))).limit(1);
        try {
          await postHrIncentiveJournal(db, ctx.tenantId, ctx.user?.id, {
            incentiveId,
            employeeName: emp?.name || `#${input.employeeId}`,
            date: input.date,
            amount: input.amount,
            reason: input.reason,
            settlementMethod,
            bankAccountId,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "فشل إنشاء القيد";
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `تم حفظ الحافز لكن فشل القيد المحاسبي: ${msg}`,
          });
        }
      }
      return { success: true, id: incentiveId };
    }),
    delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await cancelPostedJournalByReference(db, ctx.tenantId, `HR-INCENTIVE-${input}`);
      await db.delete(hrIncentives).where(tenantWhere(hrIncentives, ctx.tenantId, eq(hrIncentives.id, input)));
      return { success: true };
    }),
  }),
  underRequest: crudRouter(underRequestEmployees, z.object({
    name: z.string().min(1),
    phone: z.string().optional(),
    dailyRate: z.string().optional(),
    notes: z.string().optional(),
    isActive: z.boolean().optional(),
  })),
  machines: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(fingerprintMachines).where(tenantWhere(fingerprintMachines, ctx.tenantId));
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1),
      ipAddress: z.string().optional(),
      port: z.number().optional(),
      commKey: z.number().optional(),
      isActive: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(fingerprintMachines).values(withTenantId(ctx.tenantId, input) as any);
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({ id: z.number() }).passthrough()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input as { id: number; [k: string]: unknown };
      await db.update(fingerprintMachines).set(data as any).where(tenantWhere(fingerprintMachines, ctx.tenantId, eq(fingerprintMachines.id, id)));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(fingerprintMachines).where(tenantWhere(fingerprintMachines, ctx.tenantId, eq(fingerprintMachines.id, input)));
      return { success: true };
    }),
    syncCsv: protectedProcedure.input(z.object({
      machineId: z.number(),
      csvText: z.string().min(1),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return syncMachinePunches(db, ctx.tenantId, input.machineId, input.csvText);
    }),
    syncTcp: protectedProcedure.input(z.object({
      machineId: z.number(),
      fullSync: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return syncMachineFromTcp(db, ctx.tenantId, input.machineId, { fullSync: input.fullSync });
    }),
    testConnection: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return testMachineTcpConnection(db, ctx.tenantId, input);
    }),
    syncAll: protectedProcedure.input(z.object({
      fullSync: z.boolean().optional(),
    }).optional()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const machines = await db
        .select()
        .from(fingerprintMachines)
        .where(tenantWhere(fingerprintMachines, ctx.tenantId));

      const results: Array<{
        machineId: number;
        name: string;
        ok: boolean;
        fetched?: number;
        aggregated?: number;
        error?: string;
      }> = [];

      for (const machine of machines) {
        if (!machine.ipAddress) {
          results.push({ machineId: machine.id, name: machine.name, ok: false, error: "لا يوجد عنوان IP" });
          continue;
        }
        try {
          const r = await syncMachineFromTcp(db, ctx.tenantId, machine.id, { fullSync: input?.fullSync });
          results.push({
            machineId: machine.id,
            name: machine.name,
            ok: true,
            fetched: r.fetched,
            aggregated: r.aggregated,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "فشل المزامنة";
          results.push({ machineId: machine.id, name: machine.name, ok: false, error: msg });
        }
      }

      const successCount = results.filter((r) => r.ok).length;
      return {
        results,
        successCount,
        failCount: results.length - successCount,
        totalFetched: results.reduce((s, r) => s + (r.fetched ?? 0), 0),
        totalAggregated: results.reduce((s, r) => s + (r.aggregated ?? 0), 0),
      };
    }),
    punches: protectedProcedure.input(z.object({
      machineId: z.number().optional(),
      limit: z.number().default(100),
    })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const filter = input.machineId ? eq(machinePunches.machineId, input.machineId) : undefined;
      return db.select({
        id: machinePunches.id,
        punchedAt: machinePunches.punchedAt,
        enrollCode: machinePunches.enrollCode,
        employeeId: machinePunches.employeeId,
        employeeName: employees.name,
      }).from(machinePunches)
        .where(tenantWhere(machinePunches, ctx.tenantId, filter))
        .leftJoin(employees, eq(machinePunches.employeeId, employees.id))
        .orderBy(desc(machinePunches.punchedAt))
        .limit(input.limit);
    }),
  }),
  mobileLocations: crudRouter(mobileFpLocations, z.object({
    name: z.string().min(1),
    latitude: z.string().optional(),
    longitude: z.string().optional(),
    radiusMeters: z.number().optional(),
  })),
  systems: crudRouter(hrSystems, z.object({
    name: z.string().min(1),
    description: z.string().optional(),
  })),
  depEmpSystems: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select({
        id: hrDepEmpSystems.id,
        systemId: hrDepEmpSystems.systemId,
        departmentId: hrDepEmpSystems.departmentId,
        employeeId: hrDepEmpSystems.employeeId,
        systemName: hrSystems.name,
        departmentName: departments.name,
        employeeName: employees.name,
      }).from(hrDepEmpSystems)
        .where(tenantWhere(hrDepEmpSystems, ctx.tenantId))
        .leftJoin(hrSystems, eq(hrDepEmpSystems.systemId, hrSystems.id))
        .leftJoin(departments, eq(hrDepEmpSystems.departmentId, departments.id))
        .leftJoin(employees, eq(hrDepEmpSystems.employeeId, employees.id));
    }),
    create: protectedProcedure.input(z.object({
      systemId: z.number(),
      departmentId: z.number().optional(),
      employeeId: z.number().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(hrDepEmpSystems).values(withTenantId(ctx.tenantId, input) as any);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(hrDepEmpSystems).where(tenantWhere(hrDepEmpSystems, ctx.tenantId, eq(hrDepEmpSystems.id, input)));
      return { success: true };
    }),
  }),
  machineAttendance: protectedProcedure.input(z.object({
    employeeId: z.number(),
    date: z.string(),
    checkIn: z.string().optional(),
    checkOut: z.string().optional(),
    machineId: z.number().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await upsertDailyAttendance(db, ctx.tenantId, {
      ...input,
      status: "present",
      source: input.machineId ? "machine" : "manual",
    });
    return { success: true };
  }),
  mobileAttendance: protectedProcedure.input(z.object({
    employeeId: z.number(),
    date: z.string(),
    checkIn: z.string().optional(),
    checkOut: z.string().optional(),
    latitude: z.string().optional(),
    longitude: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const locations = await db.select().from(mobileFpLocations).where(tenantWhere(mobileFpLocations, ctx.tenantId));
    if (input.latitude && input.longitude) {
      const ok = isInsideGeofence(Number(input.latitude), Number(input.longitude), locations);
      if (!ok) throw new TRPCError({ code: "BAD_REQUEST", message: "أنت خارج نطاق الموقع المسموح" });
    }
    await upsertDailyAttendance(db, ctx.tenantId, {
      employeeId: input.employeeId,
      date: input.date,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      status: "present",
      source: "mobile",
      notes: input.latitude && input.longitude ? `mobile:${input.latitude},${input.longitude}` : undefined,
    });
    return { success: true };
  }),
});

export const inventoryExtendedRouter = router({
  categories: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(itemCategories).where(tenantWhere(itemCategories, ctx.tenantId));
    }),
    create: protectedProcedure.input(z.object({ name: z.string().min(1), parentId: z.number().optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(itemCategories).values(withTenantId(ctx.tenantId, input) as any);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(itemCategories).where(tenantWhere(itemCategories, ctx.tenantId, eq(itemCategories.id, input)));
      return { success: true };
    }),
  }),
  batches: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select({
        id: itemBatches.id,
        itemId: itemBatches.itemId,
        itemName: items.name,
        batchNumber: itemBatches.batchNumber,
        expiryDate: itemBatches.expiryDate,
        quantity: itemBatches.quantity,
      }).from(itemBatches)
        .where(tenantWhere(itemBatches, ctx.tenantId))
        .leftJoin(items, eq(itemBatches.itemId, items.id))
        .orderBy(desc(itemBatches.createdAt));
    }),
    create: protectedProcedure.input(z.object({
      itemId: z.number(),
      batchNumber: z.string().min(1),
      expiryDate: z.string().optional(),
      quantity: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(itemBatches).values(withTenantId(ctx.tenantId, input) as any);
      return { success: true };
    }),
    delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(itemBatches).where(tenantWhere(itemBatches, ctx.tenantId, eq(itemBatches.id, input)));
      return { success: true };
    }),
    available: protectedProcedure.input(z.object({
      itemId: z.number(),
    })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { listAvailableBatches } = await import("./inventory-stock");
      return listAvailableBatches(db, ctx.tenantId, input.itemId);
    }),
  }),
  offers: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select({
        id: itemOffers.id,
        name: itemOffers.name,
        itemId: itemOffers.itemId,
        categoryId: itemOffers.categoryId,
        discountPercent: itemOffers.discountPercent,
        startDate: itemOffers.startDate,
        endDate: itemOffers.endDate,
        isActive: itemOffers.isActive,
        itemName: items.name,
        categoryName: itemCategories.name,
      }).from(itemOffers)
        .where(tenantWhere(itemOffers, ctx.tenantId))
        .leftJoin(items, eq(itemOffers.itemId, items.id))
        .leftJoin(itemCategories, eq(itemOffers.categoryId, itemCategories.id));
    }),
    active: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const today = new Date().toISOString().slice(0, 10);
      return db.select().from(itemOffers).where(tenantWhere(itemOffers, ctx.tenantId, and(
        eq(itemOffers.isActive, true),
        or(isNull(itemOffers.startDate), lte(itemOffers.startDate, today as any)),
        or(isNull(itemOffers.endDate), gte(itemOffers.endDate, today as any)),
      )));
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1),
      itemId: z.number().optional().nullable(),
      categoryId: z.number().optional().nullable(),
      discountPercent: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      isActive: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(itemOffers).values(withTenantId(ctx.tenantId, input) as any);
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      itemId: z.number().optional().nullable(),
      categoryId: z.number().optional().nullable(),
      discountPercent: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      isActive: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(itemOffers).set(data as any).where(tenantWhere(itemOffers, ctx.tenantId, eq(itemOffers.id, id)));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(itemOffers).where(tenantWhere(itemOffers, ctx.tenantId, eq(itemOffers.id, input)));
      return { success: true };
    }),
  }),
  priceChanges: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select({
        id: itemPriceChanges.id,
        itemId: itemPriceChanges.itemId,
        itemName: items.name,
        oldPrice: itemPriceChanges.oldPrice,
        newPrice: itemPriceChanges.newPrice,
        priceType: itemPriceChanges.priceType,
        date: itemPriceChanges.date,
      }).from(itemPriceChanges)
        .where(tenantWhere(itemPriceChanges, ctx.tenantId))
        .leftJoin(items, eq(items.id, itemPriceChanges.itemId))
        .orderBy(desc(itemPriceChanges.date));
    }),
    applyChange: protectedProcedure.input(z.object({
      itemId: z.number(),
      newPrice: z.string(),
      priceType: z.enum(["sale", "purchase"]).default("sale"),
      date: z.string(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [item] = await db.select().from(items).where(tenantWhere(items, ctx.tenantId, eq(items.id, input.itemId)));
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });
      const oldPrice = input.priceType === "sale" ? item.salePrice : item.purchasePrice;
      await db.insert(itemPriceChanges).values(withTenantId(ctx.tenantId, {
        itemId: input.itemId,
        oldPrice: oldPrice || "0",
        newPrice: input.newPrice,
        priceType: input.priceType,
        date: input.date,
      }) as any);
      if (input.priceType === "sale") {
        await db.update(items).set({ salePrice: input.newPrice }).where(tenantWhere(items, ctx.tenantId, eq(items.id, input.itemId)));
      } else {
        await db.update(items).set({ purchasePrice: input.newPrice }).where(tenantWhere(items, ctx.tenantId, eq(items.id, input.itemId)));
      }
      return { success: true };
    }),
    applyBulk: protectedProcedure.input(z.object({
      date: z.string(),
      priceType: z.enum(["sale", "purchase"]).default("sale"),
      rows: z.array(z.object({ itemId: z.number(), newPrice: z.string() })).min(1),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      let updated = 0;
      for (const row of input.rows) {
        if (!row.newPrice?.trim()) continue;
        const [item] = await db.select().from(items).where(tenantWhere(items, ctx.tenantId, eq(items.id, row.itemId)));
        if (!item) continue;
        const oldPrice = input.priceType === "sale" ? item.salePrice : item.purchasePrice;
        await db.insert(itemPriceChanges).values(withTenantId(ctx.tenantId, {
          itemId: row.itemId,
          oldPrice: oldPrice || "0",
          newPrice: row.newPrice,
          priceType: input.priceType,
          date: input.date,
        }) as any);
        if (input.priceType === "sale") {
          await db.update(items).set({ salePrice: row.newPrice }).where(tenantWhere(items, ctx.tenantId, eq(items.id, row.itemId)));
        } else {
          await db.update(items).set({ purchasePrice: row.newPrice }).where(tenantWhere(items, ctx.tenantId, eq(items.id, row.itemId)));
        }
        updated += 1;
      }
      return { success: true, updated };
    }),
  }),
  serials: router({
    list: protectedProcedure.input(z.object({
      itemId: z.number().optional(),
      status: z.enum(["in_stock", "sold", "returned"]).optional(),
      search: z.string().optional(),
    }).optional()).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const extra = [
        input?.itemId ? eq(itemSerials.itemId, input.itemId) : undefined,
        input?.status ? eq(itemSerials.status, input.status) : undefined,
        input?.search?.trim()
          ? or(like(itemSerials.serialNumber, `%${input.search.trim()}%`), like(items.name, `%${input.search.trim()}%`))
          : undefined,
      ].filter(Boolean);
      return db.select({
        id: itemSerials.id,
        itemId: itemSerials.itemId,
        itemName: items.name,
        itemCode: items.code,
        serialNumber: itemSerials.serialNumber,
        warehouseId: itemSerials.warehouseId,
        warehouseName: warehouses.name,
        status: itemSerials.status,
        purchaseInvoiceId: itemSerials.purchaseInvoiceId,
        salesInvoiceId: itemSerials.salesInvoiceId,
        createdAt: itemSerials.createdAt,
      }).from(itemSerials)
        .where(tenantWhere(itemSerials, ctx.tenantId, extra.length ? and(...(extra as any[])) : undefined))
        .leftJoin(items, eq(itemSerials.itemId, items.id))
        .leftJoin(warehouses, eq(itemSerials.warehouseId, warehouses.id))
        .orderBy(desc(itemSerials.createdAt));
    }),
    create: protectedProcedure.input(z.object({
      itemId: z.number(),
      serialNumber: z.string().min(1),
      warehouseId: z.number().optional(),
      status: z.enum(["in_stock", "sold", "returned"]).default("in_stock"),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [dup] = await db.select({ id: itemSerials.id }).from(itemSerials)
        .where(tenantWhere(itemSerials, ctx.tenantId, and(
          eq(itemSerials.itemId, input.itemId),
          eq(itemSerials.serialNumber, input.serialNumber.trim()),
        ))).limit(1);
      if (dup) throw new TRPCError({ code: "CONFLICT", message: "الرقم التسلسلي موجود مسبقاً لهذا الصنف" });
      await db.insert(itemSerials).values(withTenantId(ctx.tenantId, {
        itemId: input.itemId,
        serialNumber: input.serialNumber.trim(),
        warehouseId: input.warehouseId,
        status: input.status,
      }) as any);
      return { success: true };
    }),
    updateStatus: protectedProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["in_stock", "sold", "returned"]),
      warehouseId: z.number().optional().nullable(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(itemSerials).set({
        status: input.status,
        ...(input.warehouseId !== undefined ? { warehouseId: input.warehouseId } : {}),
      }).where(tenantWhere(itemSerials, ctx.tenantId, eq(itemSerials.id, input.id)));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(itemSerials).where(tenantWhere(itemSerials, ctx.tenantId, eq(itemSerials.id, input)));
      return { success: true };
    }),
    available: protectedProcedure.input(z.object({
      itemId: z.number(),
      warehouseId: z.number().optional(),
    })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { listAvailableSerials } = await import("./inventory-serials");
      return listAvailableSerials(db, ctx.tenantId, input.itemId, input.warehouseId);
    }),
  }),
  beginningInventory: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select({
        id: beginningInventory.id,
        warehouseId: beginningInventory.warehouseId,
        warehouseName: warehouses.name,
        itemId: beginningInventory.itemId,
        itemName: items.name,
        itemCode: items.code,
        itemBarcode: items.barcode,
        quantity: beginningInventory.quantity,
        unitCost: beginningInventory.unitCost,
        date: beginningInventory.date,
      }).from(beginningInventory)
        .where(tenantWhere(beginningInventory, ctx.tenantId))
        .leftJoin(items, eq(beginningInventory.itemId, items.id))
        .leftJoin(warehouses, eq(beginningInventory.warehouseId, warehouses.id))
        .orderBy(desc(beginningInventory.date));
    }),
    create: protectedProcedure.input(z.object({
      warehouseId: z.number(),
      itemId: z.number(),
      quantity: z.string(),
      unitCost: z.string().optional(),
      date: z.string(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(beginningInventory).values(withTenantId(ctx.tenantId, input) as any);
      const { applyStockMovement } = await import("./inventory-stock");
      await applyStockMovement(db, ctx.tenantId, {
        itemId: input.itemId,
        quantity: input.quantity,
        direction: "in",
        warehouseId: input.warehouseId,
      });
      if (input.unitCost) {
        const { updateAverageCostAfterPurchase } = await import("./inventory-cost");
        await updateAverageCostAfterPurchase(db, ctx.tenantId, input.itemId, Number(input.quantity), Number(input.unitCost), input.warehouseId);
      }
      return { success: true };
    }),
    /** معاينة استيراد ذكي من Excel: مطابقة باركود/كود/اسم + مخزن */
    smartImportPreview: protectedProcedure.input(z.object({
      rows: z.array(z.object({
        name: z.string().optional(),
        barcode: z.string().optional(),
        code: z.string().optional(),
        warehouse: z.string().optional(),
        quantity: z.union([z.string(), z.number()]),
        unitCost: z.union([z.string(), z.number()]).optional(),
        totalCost: z.union([z.string(), z.number()]).optional(),
        category: z.string().optional(),
        unit: z.string().optional(),
      })).min(1).max(5000),
      /** مخزن افتراضي لو الصف مفيهوش مخزن أو المخزن مش متطابق */
      defaultWarehouseId: z.number().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const catalog = await db.select({
        id: items.id,
        name: items.name,
        code: items.code,
        barcode: items.barcode,
        unit: items.unit,
        averageCost: items.averageCost,
        purchasePrice: items.purchasePrice,
        isActive: items.isActive,
      }).from(items).where(tenantWhere(items, ctx.tenantId, eq(items.isActive, true)));

      const warehouseRows = await db.select({
        id: warehouses.id,
        name: warehouses.name,
      }).from(warehouses).where(tenantWhere(warehouses, ctx.tenantId));

      const byBarcode = new Map<string, typeof catalog>();
      const byCode = new Map<string, typeof catalog>();
      const byName = new Map<string, typeof catalog>();
      for (const it of catalog) {
        const bc = normalizeItemKey(it.barcode || "");
        const cd = normalizeItemKey(it.code || "");
        const nm = normalizeItemKey(it.name || "");
        if (bc) { const arr = byBarcode.get(bc) || []; arr.push(it); byBarcode.set(bc, arr); }
        if (cd) { const arr = byCode.get(cd) || []; arr.push(it); byCode.set(cd, arr); }
        if (nm) { const arr = byName.get(nm) || []; arr.push(it); byName.set(nm, arr); }
      }

      const byWhName = new Map<string, typeof warehouseRows>();
      for (const w of warehouseRows) {
        const k = normalizeItemKey(w.name || "");
        if (!k) continue;
        const arr = byWhName.get(k) || [];
        arr.push(w);
        byWhName.set(k, arr);
      }

      const pickUnique = <T,>(arr?: T[]) => (arr && arr.length === 1 ? arr[0] : null);
      const ambiguous = <T,>(arr?: T[]) => (arr && arr.length > 1 ? arr : null);

      const matchWarehouse = (rawWh: string) => {
        const key = normalizeItemKey(rawWh);
        if (!key) {
          return {
            warehouseId: input.defaultWarehouseId ?? null,
            warehouseName: null as string | null,
            warehouseStatus: input.defaultWarehouseId ? "default" as const : "missing" as const,
            warehouseCandidates: [] as { id: number; name: string }[],
          };
        }
        const exact = byWhName.get(key);
        const uniq = pickUnique(exact);
        if (uniq) {
          return { warehouseId: uniq.id, warehouseName: uniq.name, warehouseStatus: "matched" as const, warehouseCandidates: [] };
        }
        if (ambiguous(exact)) {
          return {
            warehouseId: null,
            warehouseName: null,
            warehouseStatus: "ambiguous" as const,
            warehouseCandidates: (exact || []).map((w) => ({ id: w.id, name: w.name })),
          };
        }
        const partial = warehouseRows.filter((w) => {
          const n = normalizeItemKey(w.name);
          return n.includes(key) || key.includes(n);
        });
        if (partial.length === 1) {
          return { warehouseId: partial[0].id, warehouseName: partial[0].name, warehouseStatus: "matched" as const, warehouseCandidates: [] };
        }
        if (partial.length > 1 && partial.length <= 8) {
          return {
            warehouseId: null,
            warehouseName: null,
            warehouseStatus: "ambiguous" as const,
            warehouseCandidates: partial.map((w) => ({ id: w.id, name: w.name })),
          };
        }
        return {
          warehouseId: input.defaultWarehouseId ?? null,
          warehouseName: null,
          warehouseStatus: input.defaultWarehouseId ? "default" as const : "unmatched" as const,
          warehouseCandidates: [],
        };
      };

      const preview = input.rows.map((raw, index) => {
        const name = String(raw.name ?? "").trim();
        const barcode = String(raw.barcode ?? "").trim();
        const code = String(raw.code ?? "").trim();
        const warehouse = String(raw.warehouse ?? "").trim();
        const category = String(raw.category ?? "").trim();
        const qtyNum = Number(raw.quantity);
        let costNum = raw.unitCost != null && String(raw.unitCost).trim() !== "" ? Number(raw.unitCost) : NaN;
        // لو متوسط التكلفة فاضي وموجود إجمالي + كمية → احسب المتوسط
        if (!Number.isFinite(costNum) && raw.totalCost != null && qtyNum > 0) {
          const total = Number(raw.totalCost);
          if (Number.isFinite(total)) costNum = total / qtyNum;
        }
        const quantityOk = Number.isFinite(qtyNum) && qtyNum > 0;

        let match: (typeof catalog)[number] | null = null;
        let matchBy: "barcode" | "code" | "name" | null = null;
        let candidates: typeof catalog = [];

        const bcKey = normalizeItemKey(barcode);
        const cdKey = normalizeItemKey(code);
        const nmKey = normalizeItemKey(name);

        if (bcKey) {
          const uniq = pickUnique(byBarcode.get(bcKey));
          const amb = ambiguous(byBarcode.get(bcKey));
          if (uniq) { match = uniq; matchBy = "barcode"; }
          else if (amb) candidates = amb;
        }
        if (!match && cdKey) {
          const uniq = pickUnique(byCode.get(cdKey));
          const amb = ambiguous(byCode.get(cdKey));
          if (uniq) { match = uniq; matchBy = "code"; }
          else if (amb && !candidates.length) candidates = amb;
        }
        if (!match && nmKey) {
          const uniq = pickUnique(byName.get(nmKey));
          const amb = ambiguous(byName.get(nmKey));
          if (uniq) { match = uniq; matchBy = "name"; }
          else if (amb && !candidates.length) candidates = amb;
        }
        if (!match && !candidates.length && nmKey && nmKey.length >= 2) {
          const partial = catalog.filter((it) => {
            const n = normalizeItemKey(it.name);
            const c = normalizeItemKey(it.code || "");
            return n.includes(nmKey) || nmKey.includes(n) || (c && (c === nmKey || n.includes(nmKey)));
          });
          if (partial.length === 1) { match = partial[0]; matchBy = "name"; }
          else if (partial.length > 1 && partial.length <= 8) candidates = partial;
        }

        const wh = matchWarehouse(warehouse);
        const status = !quantityOk
          ? "invalid" as const
          : match
            ? "matched" as const
            : candidates.length
              ? "ambiguous" as const
              : "unmatched" as const;

        const rawUnit = String(raw.unit ?? "").trim();

        return {
          index,
          rawName: name,
          rawBarcode: barcode,
          rawCode: code,
          rawWarehouse: warehouse,
          rawCategory: category,
          rawUnit,
          quantity: quantityOk ? String(qtyNum) : String(raw.quantity ?? ""),
          unitCost: Number.isFinite(costNum) ? String(Number(costNum.toFixed(4))) : "",
          status,
          matchBy,
          itemId: match?.id ?? null,
          itemName: match?.name ?? null,
          itemCode: match?.code ?? null,
          itemBarcode: match?.barcode ?? null,
          itemUnit: match?.unit ?? null,
          suggestedUnitCost: match
            ? String(Number(match.averageCost || match.purchasePrice || 0) || "")
            : "",
          candidates: candidates.slice(0, 8).map((c) => ({
            id: c.id,
            name: c.name,
            code: c.code,
            barcode: c.barcode,
          })),
          warehouseId: wh.warehouseId,
          warehouseName: wh.warehouseName,
          warehouseStatus: wh.warehouseStatus,
          warehouseCandidates: wh.warehouseCandidates,
        };
      });

      const summary = {
        total: preview.length,
        matched: preview.filter((r) => r.status === "matched").length,
        ambiguous: preview.filter((r) => r.status === "ambiguous").length,
        unmatched: preview.filter((r) => r.status === "unmatched").length,
        invalid: preview.filter((r) => r.status === "invalid").length,
        warehouseMatched: preview.filter((r) => r.warehouseStatus === "matched" || r.warehouseStatus === "default").length,
        warehouseUnmatched: preview.filter((r) => r.warehouseStatus === "unmatched" || r.warehouseStatus === "ambiguous" || r.warehouseStatus === "missing").length,
      };
      return { rows: preview, summary, warehouses: warehouseRows };
    }),
    /**
     * تحديث وحدة القياس للأصناف المطابقة من ملف Excel
     * (يُنشئ الوحدة في خصائص عامة إن لم تكن مسجّلة)
     */
    syncItemUnits: protectedProcedure.input(z.object({
      rows: z.array(z.object({
        itemId: z.number(),
        unit: z.string().min(1),
      })).min(1).max(5000),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { ensureMeasureUnitExists, normalizeMeasureUnitName } = await import("./measure-units");

      let updated = 0;
      let skipped = 0;
      const errors: string[] = [];
      const seen = new Set<number>();

      for (const row of input.rows) {
        if (seen.has(row.itemId)) continue;
        seen.add(row.itemId);
        const wanted = normalizeMeasureUnitName(row.unit);
        if (!wanted) {
          skipped++;
          continue;
        }
        try {
          const unit = await ensureMeasureUnitExists(db, ctx.tenantId!, wanted);
          const [cur] = await db.select({ id: items.id, unit: items.unit })
            .from(items)
            .where(tenantWhere(items, ctx.tenantId, eq(items.id, row.itemId)))
            .limit(1);
          if (!cur) {
            errors.push(`صنف #${row.itemId}: غير موجود`);
            continue;
          }
          if (normalizeMeasureUnitName(cur.unit || "") === unit) {
            skipped++;
            continue;
          }
          await db.update(items).set({ unit }).where(tenantWhere(items, ctx.tenantId, eq(items.id, row.itemId)));
          updated++;
        } catch (e: unknown) {
          errors.push(`صنف #${row.itemId}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      return { success: true, updated, skipped, failed: errors.length, errors: errors.slice(0, 30) };
    }),
    /** اعتماد الاستيراد الذكي — ينشئ سجلات أول المدة ويحدّث المخزون (مخزن لكل سطر مدعوم) */
    smartImportCommit: protectedProcedure.input(z.object({
      date: z.string(),
      defaultWarehouseId: z.number().optional(),
      lines: z.array(z.object({
        itemId: z.number(),
        warehouseId: z.number().optional(),
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
        const qty = Number(line.quantity);
        const warehouseId = line.warehouseId || input.defaultWarehouseId;
        if (!(qty > 0)) {
          errors.push(`صنف #${line.itemId}: كمية غير صالحة`);
          continue;
        }
        if (!(Number(warehouseId) > 0)) {
          errors.push(`صنف #${line.itemId}: مخزن غير محدد`);
          continue;
        }
        const [item] = await db.select({ id: items.id, name: items.name })
          .from(items)
          .where(tenantWhere(items, ctx.tenantId, eq(items.id, line.itemId)))
          .limit(1);
        if (!item) {
          errors.push(`صنف #${line.itemId}: غير موجود`);
          continue;
        }
        try {
          // استبدال وليس إضافة: امسح أي مخزون أول مدة سابق لنفس الصنف+المخزن
          const existing = await db.select().from(beginningInventory).where(tenantWhere(
            beginningInventory,
            ctx.tenantId,
            and(
              eq(beginningInventory.itemId, line.itemId),
              eq(beginningInventory.warehouseId, Number(warehouseId)),
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
            warehouseId,
            itemId: line.itemId,
            quantity: String(qty),
            unitCost: line.unitCost || "0",
            date: input.date as any,
          }) as any);
          await applyStockMovement(db, ctx.tenantId, {
            itemId: line.itemId,
            quantity: String(qty),
            direction: "in",
            warehouseId,
          });
          if (line.unitCost && Number(line.unitCost) > 0) {
            await updateAverageCostAfterPurchase(db, ctx.tenantId, line.itemId, qty, Number(line.unitCost), warehouseId);
          }
          imported += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${item.name}: ${msg}`);
        }
      }
      return { success: true, imported, failed: errors.length, errors: errors.slice(0, 20) };
    }),
    /**
     * إنشاء أصناف ناقصة من الاستيراد الذكي:
     * كود/بارت نمبر تلقائي (P-…) — لا نستخدم اسم الصنف ككود.
     * الباركود يُحفظ فقط لو قيمة حقيقية مختلفة عن الاسم.
     */
    createMissingItems: protectedProcedure.input(z.object({
      rows: z.array(z.object({
        clientKey: z.string().min(1),
        name: z.string().min(1),
        barcode: z.string().optional(),
        code: z.string().optional(),
        unitCost: z.string().optional(),
        unit: z.string().optional(),
      })).min(1).max(500),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { resolveTypedEntityCode } = await import("./entity-codes");

      const looksLikeSku = (value: string, itemName: string) => {
        const v = value.trim();
        if (!v) return false;
        if (v === itemName.trim()) return false;
        if (v.length > 40) return false;
        // أسماء طويلة / فيها مسافات كتير غالباً مش كود
        if (v.length > 24 && /\s/.test(v)) return false;
        return true;
      };

      const created: Array<{
        clientKey: string;
        id: number;
        name: string;
        code: string;
        barcode: string;
      }> = [];
      const errors: string[] = [];

      for (const row of input.rows) {
        const name = row.name.trim();
        if (!name) {
          errors.push(`${row.clientKey}: اسم فاضي`);
          continue;
        }
        try {
          const preferredCode = looksLikeSku(row.code || "", name) ? row.code : undefined;
          const code = await resolveTypedEntityCode(db, items, ctx.tenantId!, "item", preferredCode);
          const rawBarcode = (row.barcode || "").trim();
          const barcode = looksLikeSku(rawBarcode, name) ? rawBarcode : null;
          const cost = row.unitCost && Number(row.unitCost) > 0 ? String(row.unitCost) : "0";
          const { ensureMeasureUnitExists } = await import("./measure-units");
          const unit = await ensureMeasureUnitExists(db, ctx.tenantId!, row.unit);
          // سعر شراء مرجعي فقط — متوسط التكلفة يتحدّث عند اعتماد الكمية/الرصيد
          const [ins] = await db.insert(items).values(withTenantId(ctx.tenantId, {
            name,
            code,
            barcode,
            unit,
            purchasePrice: cost,
            averageCost: "0",
            isActive: true,
          }) as any);
          const id = Number((ins as { insertId?: number }).insertId ?? 0);
          if (!(id > 0)) {
            errors.push(`${name}: فشل الإنشاء`);
            continue;
          }
          created.push({ clientKey: row.clientKey, id, name, code, barcode: barcode || "" });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${name}: ${msg}`);
        }
      }

      return {
        success: true,
        created,
        failed: errors.length,
        errors: errors.slice(0, 30),
      };
    }),

    /** إصلاح أصناف اتسجل كودها = اسمها بالغلط من الاستيراد */
    repairNameAsCodes: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { resolveTypedEntityCode } = await import("./entity-codes");
      const bad = await db.select({
        id: items.id,
        name: items.name,
        code: items.code,
        barcode: items.barcode,
      }).from(items).where(tenantWhere(items, ctx.tenantId));

      let fixed = 0;
      for (const row of bad) {
        const name = (row.name || "").trim();
        const code = (row.code || "").trim();
        const barcode = (row.barcode || "").trim();
        if (!name || !code || code !== name) continue;
        const newCode = await resolveTypedEntityCode(db, items, ctx.tenantId!, "item", undefined, row.id);
        const newBarcode = barcode && barcode !== name ? barcode : null;
        await db.update(items).set({
          code: newCode,
          barcode: newBarcode,
        } as any).where(tenantWhere(items, ctx.tenantId, eq(items.id, row.id)));
        fixed++;
      }
      return { success: true, fixed };
    }),
    /**
     * مسح كل سجلات مخزون أول المدة للمستأجر مع عكس الكميات من المخازن.
     * للاستخدام بعد اعتماد مكرر بالخطأ قبل إعادة الرفع.
     */
    clearAll: protectedProcedure.input(z.object({
      confirm: z.literal("CLEAR_BEGINNING_INVENTORY"),
    })).mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { applyStockMovement } = await import("./inventory-stock");

      const rows = await db.select().from(beginningInventory)
        .where(tenantWhere(beginningInventory, ctx.tenantId));

      let reversed = 0;
      const errors: string[] = [];
      const touchedItems = new Set<number>();

      for (const row of rows) {
        try {
          await applyStockMovement(db, ctx.tenantId, {
            itemId: row.itemId,
            quantity: row.quantity,
            direction: "out",
            warehouseId: row.warehouseId,
            allowNegative: true,
          });
          await db.delete(beginningInventory)
            .where(tenantWhere(beginningInventory, ctx.tenantId, eq(beginningInventory.id, row.id)));
          touchedItems.add(row.itemId);
          reversed += 1;
        } catch (e: unknown) {
          errors.push(`#${row.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      for (const itemId of touchedItems) {
        const [it] = await db.select({
          currentStock: items.currentStock,
        }).from(items).where(tenantWhere(items, ctx.tenantId, eq(items.id, itemId))).limit(1);
        if (!it) continue;
        if (Number(it.currentStock || 0) <= 0.0001) {
          await db.update(items).set({
            averageCost: "0",
            currentStock: "0",
          } as any).where(tenantWhere(items, ctx.tenantId, eq(items.id, itemId)));
        }
      }

      return {
        success: true,
        cleared: reversed,
        remaining: rows.length - reversed,
        failed: errors.length,
        errors: errors.slice(0, 20),
      };
    }),
    /**
     * استيراد نظيف مرة واحدة من Excel:
     * إنشاء مخازن ناقصة · أصناف بدون تكرار + كود · وحدات · اعتماد الرصيد
     */
    cleanImport: protectedProcedure.input(z.object({
      date: z.string(),
      rows: z.array(z.object({
        name: z.string().min(1),
        barcode: z.string().optional(),
        code: z.string().optional(),
        warehouse: z.string().min(1),
        quantity: z.union([z.string(), z.number()]),
        unitCost: z.union([z.string(), z.number()]).optional(),
        unit: z.string().optional(),
        category: z.string().optional(),
      })).min(1).max(5000),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { cleanImportBeginningInventory } = await import("./inventory-clean-import");
      return cleanImportBeginningInventory(db, ctx.tenantId!, input);
    }),
    delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db.select().from(beginningInventory)
        .where(tenantWhere(beginningInventory, ctx.tenantId, eq(beginningInventory.id, input)));
      if (row) {
        const { applyStockMovement } = await import("./inventory-stock");
        await applyStockMovement(db, ctx.tenantId, {
          itemId: row.itemId,
          quantity: row.quantity,
          direction: "out",
          warehouseId: row.warehouseId,
          allowNegative: true,
        });
      }
      await db.delete(beginningInventory).where(tenantWhere(beginningInventory, ctx.tenantId, eq(beginningInventory.id, input)));
      return { success: true };
    }),
  }),
});

export const assetsExtendedRouter = router({
  categories: crudRouter(assetCategories, z.object({
    name: z.string().min(1),
    depreciationRate: z.string().optional(),
  })),
  capitalMaintenance: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select({
        id: assetCapitalMaintenance.id,
        assetId: assetCapitalMaintenance.assetId,
        assetName: fixedAssets.name,
        date: assetCapitalMaintenance.date,
        amount: assetCapitalMaintenance.amount,
        description: assetCapitalMaintenance.description,
      }).from(assetCapitalMaintenance)
        .where(tenantWhere(assetCapitalMaintenance, ctx.tenantId))
        .leftJoin(fixedAssets, eq(fixedAssets.id, assetCapitalMaintenance.assetId))
        .orderBy(desc(assetCapitalMaintenance.date));
    }),
    create: protectedProcedure.input(z.object({
      assetId: z.number(),
      date: z.string(),
      amount: z.string(),
      description: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [asset] = await db.select().from(fixedAssets)
        .where(tenantWhere(fixedAssets, ctx.tenantId, eq(fixedAssets.id, input.assetId)));
      if (!asset) throw new TRPCError({ code: "NOT_FOUND", message: "الأصل غير موجود" });

      const [result] = await db.insert(assetCapitalMaintenance).values(withTenantId(ctx.tenantId, input) as any);
      const maintenanceId = (result as { insertId: number }).insertId;

      const { postCapitalMaintenanceJournal } = await import("./auto-journal");
      await postCapitalMaintenanceJournal(db, ctx.tenantId, ctx.user?.id, {
        maintenanceId,
        assetId: input.assetId,
        assetName: asset.name,
        date: input.date,
        amount: input.amount,
        description: input.description,
      });

      const newValue = (Number(asset.currentValue) || Number(asset.purchasePrice) || 0) + Number(input.amount);
      await db.update(fixedAssets).set({
        currentValue: newValue.toFixed(2),
        purchasePrice: (Number(asset.purchasePrice) + Number(input.amount)).toFixed(2),
      }).where(tenantWhere(fixedAssets, ctx.tenantId, eq(fixedAssets.id, input.assetId)));

      return { success: true, id: maintenanceId };
    }),
    delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(assetCapitalMaintenance).where(tenantWhere(assetCapitalMaintenance, ctx.tenantId, eq(assetCapitalMaintenance.id, input)));
      return { success: true };
    }),
  }),
  sales: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select({
        id: assetSales.id,
        assetId: assetSales.assetId,
        assetName: fixedAssets.name,
        date: assetSales.date,
        amount: assetSales.amount,
        buyer: assetSales.buyer,
      }).from(assetSales)
        .where(tenantWhere(assetSales, ctx.tenantId))
        .leftJoin(fixedAssets, eq(fixedAssets.id, assetSales.assetId))
        .orderBy(desc(assetSales.date));
    }),
    create: protectedProcedure.input(z.object({
      assetId: z.number(),
      date: z.string(),
      amount: z.string(),
      buyer: z.string().optional(),
      notes: z.string().optional(),
      settlementMethod: z.enum(["cash", "bank"]).default("cash"),
      bankAccountId: z.number().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input.settlementMethod === "bank" && !input.bankAccountId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "اختر الحساب البنكي للتسوية" });
      }

      const [asset] = await db
        .select()
        .from(fixedAssets)
        .where(tenantWhere(fixedAssets, ctx.tenantId, eq(fixedAssets.id, input.assetId)));
      if (!asset) throw new TRPCError({ code: "NOT_FOUND", message: "الأصل غير موجود" });
      if (asset.status === "disposed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "الأصل مباع/مستبعد مسبقاً" });
      }

      const bookValue = Number(asset.currentValue || asset.purchasePrice || 0);
      const { settlementMethod, bankAccountId, ...saleRow } = input;
      const notes = [
        saleRow.notes?.trim() || "",
        `__BOOK_VALUE__:${bookValue.toFixed(2)}`,
        `__SETTLEMENT__:${settlementMethod}${bankAccountId ? `:${bankAccountId}` : ""}`,
      ].filter(Boolean).join("\n");

      const [saleResult] = await db.insert(assetSales).values(withTenantId(ctx.tenantId, {
        ...saleRow,
        notes,
      }) as any);
      const saleId = (saleResult as { insertId: number }).insertId;

      await db.update(fixedAssets).set({
        status: "disposed",
        currentValue: "0",
      }).where(tenantWhere(fixedAssets, ctx.tenantId, eq(fixedAssets.id, input.assetId)));

      try {
        await postAssetSaleJournal(db, ctx.tenantId, ctx.user?.id, {
          assetId: input.assetId,
          assetName: asset.name,
          date: input.date,
          saleAmount: input.amount,
          bookValue: bookValue.toFixed(2),
          buyer: input.buyer,
          settlementMethod,
          bankAccountId,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "فشل إنشاء القيد";
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `تم تسجيل البيع (#${saleId}) لكن فشل القيد المحاسبي: ${msg}` });
      }

      return { success: true, saleId };
    }),
    delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [sale] = await db.select().from(assetSales)
        .where(tenantWhere(assetSales, ctx.tenantId, eq(assetSales.id, input))).limit(1);
      if (!sale) throw new TRPCError({ code: "NOT_FOUND" });

      await cancelPostedJournalByReference(db, ctx.tenantId, `ASSET-SALE-${sale.assetId}`);

      const bookMatch = String(sale.notes || "").match(/__BOOK_VALUE__:([0-9.]+)/);
      const restoredValue = bookMatch?.[1] || sale.amount;
      await db.update(fixedAssets).set({
        status: "active",
        currentValue: String(restoredValue),
      }).where(tenantWhere(fixedAssets, ctx.tenantId, eq(fixedAssets.id, sale.assetId)));

      await db.delete(assetSales).where(tenantWhere(assetSales, ctx.tenantId, eq(assetSales.id, input)));
      return { success: true };
    }),
  }),
});

export const salesExtendedRouter = router({
  areas: crudRouter(salesAreas, z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    isActive: z.boolean().optional(),
  })),
});
