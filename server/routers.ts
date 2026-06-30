import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  customers, suppliers, items, itemCategories, warehouses,
  contactCategories, purchaseInvoices, salesInvoices, employees,
  departments, jobTitles, accounts, cashTransactions, bankTransactions,
  bankAccounts, checks, journalEntries, journalEntryLines,
  purchaseInvoiceItems, salesInvoiceItems, purchaseOrders, salesOrders,
  purchaseOrderItems, salesOrderItems, purchaseReturns, salesReturns,
  purchaseReturnItems, salesReturnItems, attendance, payroll, salaryAdvances,
  fixedAssets, costCenters, loans, installments, notifications,
  inventoryAdjustments, inventoryAdjustmentItems, stockTransfers, stockTransferItems,
  taxes, salesReps, branches, companySettings, users,
  appUsers, subscriptions, subscriptionPlans,
  discountCoupons, companyProfile, supportTickets, userNotifications,
  paymobSettings, subscriptionPayments, tenants
} from "../drizzle/schema";
import {
  signSaasToken, verifySaasToken, hashPassword, verifyPassword,
  getAppUserByEmail, getAppUserById, getUserActiveSubscription, isSubscriptionActive,
  getAccountOwnerId, countAccountUsers, canManageTeamUsers,
  SAAS_COOKIE_NAME
} from "./saas-auth";
import { eq, desc, count, sum, and, like, or, sql, gte, lte, isNull } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { tenantWhere, withTenantId } from "./tenant-scope";

// ===================== DASHBOARD =====================
const dashboardRouter = router({
  stats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [customersCount] = await db.select({ count: count() }).from(customers).where(tenantWhere(customers, ctx.tenantId));
    const [suppliersCount] = await db.select({ count: count() }).from(suppliers).where(tenantWhere(suppliers, ctx.tenantId));
    const [itemsCount] = await db.select({ count: count() }).from(items).where(tenantWhere(items, ctx.tenantId));
    const [employeesCount] = await db.select({ count: count() }).from(employees).where(tenantWhere(employees, ctx.tenantId, eq(employees.status, "active")));

    const [totalSales] = await db.select({ total: sum(salesInvoices.total) }).from(salesInvoices)
      .where(tenantWhere(salesInvoices, ctx.tenantId, eq(salesInvoices.status, "confirmed"))));
    const [totalPurchases] = await db.select({ total: sum(purchaseInvoices.total) }).from(purchaseInvoices)
      .where(tenantWhere(purchaseInvoices, ctx.tenantId, eq(purchaseInvoices.status, "confirmed"))));

    const [unpaidInvoices] = await db.select({ count: count() }).from(salesInvoices)
      .where(tenantWhere(salesInvoices, ctx.tenantId, or(eq(salesInvoices.status, "confirmed"), eq(salesInvoices.status, "partial")))));
    const [pendingChecks] = await db.select({ count: count() }).from(checks)
      .where(tenantWhere(checks, ctx.tenantId, eq(checks.status, "pending"))));

    const recentSales = await db.select({
      id: salesInvoices.id,
      number: salesInvoices.number,
      total: salesInvoices.total,
      status: salesInvoices.status,
      customerName: customers.name,
    }).from(salesInvoices)
      .where(tenantWhere(salesInvoices, ctx.tenantId))
      .leftJoin(customers, eq(salesInvoices.customerId, customers.id))
      .orderBy(desc(salesInvoices.createdAt))
      .limit(5);

    const recentPurchases = await db.select({
      id: purchaseInvoices.id,
      number: purchaseInvoices.number,
      total: purchaseInvoices.total,
      status: purchaseInvoices.status,
      supplierName: suppliers.name,
    }).from(purchaseInvoices)
      .where(tenantWhere(purchaseInvoices, ctx.tenantId))
      .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
      .orderBy(desc(purchaseInvoices.createdAt))
      .limit(5);

    return {
      customersCount: customersCount.count,
      suppliersCount: suppliersCount.count,
      itemsCount: itemsCount.count,
      employeesCount: employeesCount.count,
      totalSales: totalSales.total ?? 0,
      totalPurchases: totalPurchases.total ?? 0,
      unpaidInvoices: unpaidInvoices.count,
      pendingChecks: pendingChecks.count,
      recentSales,
      recentPurchases,
    };
  }),
  monthlyCharts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // Get last 6 months data
    const months: { month: string; label: string }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const MONTHS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
      months.push({ month: `${y}-${m}`, label: MONTHS_AR[d.getMonth()] });
    }

    const salesByMonth = await db.select({
      month: sql<string>`DATE_FORMAT(${salesInvoices.createdAt}, '%Y-%m')`,
      total: sum(salesInvoices.total),
    }).from(salesInvoices)
      .where(tenantWhere(salesInvoices, ctx.tenantId, and(
        eq(salesInvoices.status, "confirmed"),
        gte(salesInvoices.createdAt, new Date(now.getFullYear(), now.getMonth() - 5, 1))
      )))
      .groupBy(sql`DATE_FORMAT(${salesInvoices.createdAt}, '%Y-%m')`);

    const purchasesByMonth = await db.select({
      month: sql<string>`DATE_FORMAT(${purchaseInvoices.createdAt}, '%Y-%m')`,
      total: sum(purchaseInvoices.total),
    }).from(purchaseInvoices)
      .where(tenantWhere(purchaseInvoices, ctx.tenantId, and(
        eq(purchaseInvoices.status, "confirmed"),
        gte(purchaseInvoices.createdAt, new Date(now.getFullYear(), now.getMonth() - 5, 1))
      )))
      .groupBy(sql`DATE_FORMAT(${purchaseInvoices.createdAt}, '%Y-%m')`);

    // Invoice status distribution
    const [paidCount] = await db.select({ count: count() }).from(salesInvoices).where(tenantWhere(salesInvoices, ctx.tenantId, eq(salesInvoices.status, \"paid\"))));
    const [unpaidCount] = await db.select({ count: count() }).from(salesInvoices).where(tenantWhere(salesInvoices, ctx.tenantId, or(eq(salesInvoices.status, "confirmed"), eq(salesInvoices.status, "partial"))));
    const [draftCount] = await db.select({ count: count() }).from(salesInvoices).where(tenantWhere(salesInvoices, ctx.tenantId, eq(salesInvoices.status, \"draft\"))));

    const salesMap = Object.fromEntries(salesByMonth.map(r => [r.month, Number(r.total) || 0]));
    const purchasesMap = Object.fromEntries(purchasesByMonth.map(r => [r.month, Number(r.total) || 0]));

    const chartData = months.map(({ month, label }) => ({
      month: label,
      sales: salesMap[month] || 0,
      purchases: purchasesMap[month] || 0,
      profit: (salesMap[month] || 0) - (purchasesMap[month] || 0),
    }));

    return {
      chartData,
      invoiceStatus: {
        paid: paidCount.count,
        unpaid: unpaidCount.count,
        draft: draftCount.count,
      },
    };
  }),
});

// ===================== CUSTOMERS =====================
const customersRouter = router({
  list: protectedProcedure.input(z.object({
    search: z.string().optional(),
    page: z.number().default(1),
    limit: z.number().default(20),
  })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    const where = input.search
      ? or(like(customers.name, `%${input.search}%`), like(customers.phone, `%${input.search}%`))
      : undefined;
    const rows = await db.select().from(customers).where(tenantWhere(customers, ctx.tenantId, where)).orderBy(desc(customers.createdAt)).limit(input.limit).offset(offset);
    const [total] = await db.select({ count: count() }).from(customers).where(tenantWhere(customers, ctx.tenantId, where));
    return { rows, total: total.count };
  }),
  byId: protectedProcedure.input(z.number()).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(customers).where(tenantWhere(customers, ctx.tenantId, eq(customers.id, input)));
    return row;
  }),
  create: protectedProcedure.input(z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    categoryId: z.number().optional(),
    phone: z.string().optional(),
    phone2: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    taxNumber: z.string().optional(),
    creditLimit: z.string().optional(),
    notes: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(customers).values(withTenantId(ctx.tenantId, input) as any);
    return { success: true };
  }),
  update: protectedProcedure.input(z.object({
    id: z.number(),
    name: z.string().min(1),
    code: z.string().optional(),
    categoryId: z.number().optional(),
    phone: z.string().optional(),
    phone2: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    taxNumber: z.string().optional(),
    creditLimit: z.string().optional(),
    notes: z.string().optional(),
    isActive: z.boolean().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, ...data } = input;
    await db.update(customers).set(data as any).where(tenantWhere(customers, ctx.tenantId, eq(customers.id, id)));
    return { success: true };
  }),
  delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(customers).where(tenantWhere(customers, ctx.tenantId, eq(customers.id, input)));
    return { success: true };
  }),
});

// ===================== SUPPLIERS =====================
const suppliersRouter = router({
  list: protectedProcedure.input(z.object({
    search: z.string().optional(),
    page: z.number().default(1),
    limit: z.number().default(20),
  })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    const where = input.search
      ? or(like(suppliers.name, `%${input.search}%`), like(suppliers.phone, `%${input.search}%`))
      : undefined;
    const rows = await db.select().from(suppliers).where(tenantWhere(suppliers, ctx.tenantId, where)).orderBy(desc(suppliers.createdAt)).limit(input.limit).offset(offset);
    const [total] = await db.select({ count: count() }).from(suppliers).where(tenantWhere(suppliers, ctx.tenantId, where));
    return { rows, total: total.count };
  }),
  byId: protectedProcedure.input(z.number()).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(suppliers).where(tenantWhere(suppliers, ctx.tenantId, eq(suppliers.id, input)));
    return row;
  }),
  create: protectedProcedure.input(z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    categoryId: z.number().optional(),
    phone: z.string().optional(),
    phone2: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    taxNumber: z.string().optional(),
    notes: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(suppliers).values(withTenantId(ctx.tenantId, input) as any);
    return { success: true };
  }),
  update: protectedProcedure.input(z.object({
    id: z.number(),
    name: z.string().min(1),
    code: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    taxNumber: z.string().optional(),
    notes: z.string().optional(),
    isActive: z.boolean().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, ...data } = input;
    await db.update(suppliers).set(data as any).where(tenantWhere(suppliers, ctx.tenantId, eq(suppliers.id, id)));
    return { success: true };
  }),
  delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(suppliers).where(tenantWhere(suppliers, ctx.tenantId, eq(suppliers.id, input)));
    return { success: true };
  }),
});

// ===================== CONTACT CATEGORIES =====================
const contactCategoriesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(contactCategories).where(tenantWhere(contactCategories, ctx.tenantId)).orderBy(contactCategories.name);
  }),
  create: protectedProcedure.input(z.object({
    name: z.string().min(1),
    type: z.enum(["customer", "supplier", "both"]),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(contactCategories).values(withTenantId(ctx.tenantId, input) as any);
    return { success: true };
  }),
  update: protectedProcedure.input(z.object({
    id: z.number(),
    name: z.string().min(1),
    type: z.enum(["customer", "supplier", "both"]),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, ...data } = input;
    await db.update(contactCategories).set(data).where(tenantWhere(contactCategories, ctx.tenantId, eq(contactCategories.id, id)));
    return { success: true };
  }),
  delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(contactCategories).where(tenantWhere(contactCategories, ctx.tenantId, eq(contactCategories.id, input)));
    return { success: true };
  }),
});

// ===================== ITEMS =====================
const itemsRouter = router({
  list: protectedProcedure.input(z.object({
    search: z.string().optional(),
    categoryId: z.number().optional(),
    page: z.number().default(1),
    limit: z.number().default(20),
  })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    const conditions = [];
    if (input.search) conditions.push(or(like(items.name, `%${input.search}%`), like(items.code, `%${input.search}%`)));
    if (input.categoryId) conditions.push(eq(items.categoryId, input.categoryId));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await db.select().from(items).where(tenantWhere(items, ctx.tenantId, where)).orderBy(items.name).limit(input.limit).offset(offset);
    const [total] = await db.select({ count: count() }).from(items).where(tenantWhere(items, ctx.tenantId, where));
    return { rows, total: total.count };
  }),
  all: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(items).where(tenantWhere(items, ctx.tenantId, eq(items.isActive, true))).orderBy(items.name));
  }),
  byId: protectedProcedure.input(z.number()).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(items).where(tenantWhere(items, ctx.tenantId, eq(items.id, input)));
    return row;
  }),
  create: protectedProcedure.input(z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    barcode: z.string().optional(),
    categoryId: z.number().optional(),
    unit: z.string().optional(),
    purchasePrice: z.string().optional(),
    salePrice: z.string().optional(),
    minStock: z.string().optional(),
    taxRate: z.string().optional(),
    description: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(items).values(withTenantId(ctx.tenantId, input) as any);
    return { success: true };
  }),
  update: protectedProcedure.input(z.object({
    id: z.number(),
    name: z.string().min(1),
    code: z.string().optional(),
    barcode: z.string().optional(),
    categoryId: z.number().optional(),
    unit: z.string().optional(),
    purchasePrice: z.string().optional(),
    salePrice: z.string().optional(),
    minStock: z.string().optional(),
    taxRate: z.string().optional(),
    description: z.string().optional(),
    isActive: z.boolean().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, ...data } = input;
    await db.update(items).set(data as any).where(tenantWhere(items, ctx.tenantId, eq(items.id, id)));
    return { success: true };
  }),
  delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(items).where(tenantWhere(items, ctx.tenantId, eq(items.id, input)));
    return { success: true };
  }),
  categories: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(itemCategories).where(tenantWhere(itemCategories, ctx.tenantId)).orderBy(itemCategories.name);
  }),
  createCategory: protectedProcedure.input(z.object({
    name: z.string().min(1),
    parentId: z.number().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(itemCategories).values(withTenantId(ctx.tenantId, input) as any);
    return { success: true };
  }),
});

// ===================== WAREHOUSES =====================
const warehousesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(warehouses).where(tenantWhere(warehouses, ctx.tenantId)).orderBy(warehouses.name);
  }),
  create: protectedProcedure.input(z.object({
    name: z.string().min(1),
    address: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(warehouses).values(withTenantId(ctx.tenantId, input) as any);
    return { success: true };
  }),
  update: protectedProcedure.input(z.object({
    id: z.number(),
    name: z.string().min(1),
    address: z.string().optional(),
    isActive: z.boolean().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, ...data } = input;
    await db.update(warehouses).set(data).where(tenantWhere(warehouses, ctx.tenantId, eq(warehouses.id, id)));
    return { success: true };
  }),
  delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(warehouses).where(tenantWhere(warehouses, ctx.tenantId, eq(warehouses.id, input)));
    return { success: true };
  }),
});

// ===================== PURCHASE INVOICES =====================
const purchasesRouter = router({
  invoices: router({
    list: protectedProcedure.input(z.object({
      search: z.string().optional(),
      status: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;
      const rows = await db.select({
        id: purchaseInvoices.id,
        number: purchaseInvoices.number,
        date: purchaseInvoices.date,
        total: purchaseInvoices.total,
        paid: purchaseInvoices.paid,
        remaining: purchaseInvoices.remaining,
        status: purchaseInvoices.status,
        paymentType: purchaseInvoices.paymentType,
        supplierName: suppliers.name,
      }).from(purchaseInvoices)
        .where(tenantWhere(purchaseInvoices, ctx.tenantId))
        .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
        .orderBy(desc(purchaseInvoices.createdAt))
        .limit(input.limit).offset(offset);
      const [total] = await db.select({ count: count() }).from(purchaseInvoices).where(tenantWhere(purchaseInvoices, ctx.tenantId));
      return { rows, total: total.count };
    }),
    byId: protectedProcedure.input(z.number()).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [inv] = await db.select().from(purchaseInvoices).where(tenantWhere(purchaseInvoices, ctx.tenantId, eq(purchaseInvoices.id, input)));
      const invItems = await db.select({
        id: purchaseInvoiceItems.id,
        itemId: purchaseInvoiceItems.itemId,
        quantity: purchaseInvoiceItems.quantity,
        price: purchaseInvoiceItems.price,
        discount: purchaseInvoiceItems.discount,
        tax: purchaseInvoiceItems.tax,
        total: purchaseInvoiceItems.total,
        itemName: items.name,
        itemUnit: items.unit,
      }).from(purchaseInvoiceItems)
        .leftJoin(items, eq(purchaseInvoiceItems.itemId, items.id))
        .where(tenantWhere(purchaseInvoiceItems, ctx.tenantId, eq(purchaseInvoiceItems.invoiceId, input))));
      return { ...inv, items: invItems };
    }),
    create: protectedProcedure.input(z.object({
      supplierId: z.number(),
      date: z.string(),
      dueDate: z.string().optional(),
      warehouseId: z.number().optional(),
      paymentType: z.enum(["cash", "credit"]).default("cash"),
      subtotal: z.string(),
      discount: z.string().default("0"),
      tax: z.string().default("0"),
      total: z.string(),
      notes: z.string().optional(),
      items: z.array(z.object({
        itemId: z.number(),
        quantity: z.string(),
        price: z.string(),
        discount: z.string().default("0"),
        tax: z.string().default("0"),
        total: z.string(),
      })),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [countResult] = await db.select({ count: count() }).from(purchaseInvoices).where(tenantWhere(purchaseInvoices, ctx.tenantId));
      const number = `PI-${String(countResult.count + 1).padStart(5, "0")}`;
      const [result] = await db.insert(purchaseInvoices).values(withTenantId(ctx.tenantId, {
        number,
        supplierId: input.supplierId,
        date: input.date as any,
        dueDate: input.dueDate as any,
        warehouseId: input.warehouseId,
        paymentType: input.paymentType,
        subtotal: input.subtotal,
        discount: input.discount,
        tax: input.tax,
        total: input.total,
        remaining: input.total,
        notes: input.notes,
        createdBy: ctx.user.id,
        status: "confirmed",
      }) as any);
      const invId = (result as any).insertId;
      for (const item of input.items) {
        await db.insert(purchaseInvoiceItems).values(withTenantId(ctx.tenantId, { invoiceId: invId, ...item }) as any);
        await db.update(items).set({
          currentStock: sql`currentStock + ${item.quantity}`,
        }).where(tenantWhere(items, ctx.tenantId, eq(items.id, item.itemId)));
      }
      return { success: true, id: invId, number };
    }),
  }),
  orders: router({
    list: protectedProcedure.input(z.object({ page: z.number().default(1), limit: z.number().default(20) })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;
      const rows = await db.select({
        id: purchaseOrders.id,
        number: purchaseOrders.number,
        date: purchaseOrders.date,
        total: purchaseOrders.total,
        status: purchaseOrders.status,
        supplierName: suppliers.name,
      }).from(purchaseOrders)
        .where(tenantWhere(purchaseOrders, ctx.tenantId))
        .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
        .orderBy(desc(purchaseOrders.createdAt)).limit(input.limit).offset(offset);
      const [total] = await db.select({ count: count() }).from(purchaseOrders).where(tenantWhere(purchaseOrders, ctx.tenantId));
      return { rows, total: total.count };
    }),
    create: protectedProcedure.input(z.object({
      supplierId: z.number(),
      date: z.string(),
      expectedDate: z.string().optional(),
      notes: z.string().optional(),
      items: z.array(z.object({
        itemId: z.number(),
        quantity: z.string(),
        unitPrice: z.string(),
        notes: z.string().optional(),
      })),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [countResult] = await db.select({ count: count() }).from(purchaseOrders).where(tenantWhere(purchaseOrders, ctx.tenantId));
      const number = `PO-${String(countResult.count + 1).padStart(5, "0")}`;
      const total = input.items.reduce((s, it) => s + (Number(it.quantity) * Number(it.unitPrice)), 0);
      const [result] = await db.insert(purchaseOrders).values(withTenantId(ctx.tenantId, {
        number, supplierId: input.supplierId,
        date: input.date as any,
        expectedDate: input.expectedDate as any,
        total: String(total),
        notes: input.notes,
        status: "draft",
      }) as any);
      const orderId = (result as any).insertId;
      for (const item of input.items) {
        await db.insert(purchaseOrderItems).values(withTenantId(ctx.tenantId, { orderId, ...item }) as any);
      }
      return { success: true, id: orderId, number };
    }),
    approve: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(purchaseOrders).set({ status: "approved" } as any).where(tenantWhere(purchaseOrders, ctx.tenantId, eq(purchaseOrders.id, input)));
      return { success: true };
    }),
  }),
  returns: router({
    list: protectedProcedure.input(z.object({ page: z.number().default(1), limit: z.number().default(20) })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;
      const rows = await db.select({
        id: purchaseReturns.id,
        number: purchaseReturns.number,
        date: purchaseReturns.date,
        total: purchaseReturns.total,
        status: purchaseReturns.status,
        supplierName: suppliers.name,
      }).from(purchaseReturns)
        .where(tenantWhere(purchaseReturns, ctx.tenantId))
        .leftJoin(suppliers, eq(purchaseReturns.supplierId, suppliers.id))
        .orderBy(desc(purchaseReturns.createdAt)).limit(input.limit).offset(offset);
      const [total] = await db.select({ count: count() }).from(purchaseReturns).where(tenantWhere(purchaseReturns, ctx.tenantId));
      return { rows, total: total.count };
    }),
    create: protectedProcedure.input(z.object({
      supplierId: z.number(),
      invoiceId: z.number().optional(),
      date: z.string(),
      reason: z.string().optional(),
      notes: z.string().optional(),
      items: z.array(z.object({
        itemId: z.number(),
        quantity: z.string(),
        unitPrice: z.string(),
      })),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [countResult] = await db.select({ count: count() }).from(purchaseReturns).where(tenantWhere(purchaseReturns, ctx.tenantId));
      const number = `PR-${String(countResult.count + 1).padStart(5, "0")}`;
      const total = input.items.reduce((s, it) => s + (Number(it.quantity) * Number(it.unitPrice)), 0);
      const [result] = await db.insert(purchaseReturns).values(withTenantId(ctx.tenantId, {
        number, supplierId: input.supplierId,
        invoiceId: input.invoiceId,
        date: input.date as any,
        total: String(total),
        reason: input.reason,
        notes: input.notes,
        status: "confirmed",
      }) as any);
      const retId = (result as any).insertId;
      for (const item of input.items) {
        await db.insert(purchaseOrderItems).values(withTenantId(ctx.tenantId, { orderId: retId, ...item }) as any);
        await db.update(items).set({ currentStock: sql`currentStock - ${item.quantity}` }).where(tenantWhere(items, ctx.tenantId, eq(items.id, item.itemId)));
      }
      return { success: true, id: retId, number };
    }),
  }),
});

// ===================== SALES INVOICES =====================
const salesRouter = router({
  invoices: router({
    list: protectedProcedure.input(z.object({
      search: z.string().optional(),
      status: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;
      const rows = await db.select({
        id: salesInvoices.id,
        number: salesInvoices.number,
        date: salesInvoices.date,
        total: salesInvoices.total,
        paid: salesInvoices.paid,
        remaining: salesInvoices.remaining,
        status: salesInvoices.status,
        paymentType: salesInvoices.paymentType,
        customerName: customers.name,
      }).from(salesInvoices)
        .where(tenantWhere(salesInvoices, ctx.tenantId))
        .leftJoin(customers, eq(salesInvoices.customerId, customers.id))
        .orderBy(desc(salesInvoices.createdAt))
        .limit(input.limit).offset(offset);
      const [total] = await db.select({ count: count() }).from(salesInvoices).where(tenantWhere(salesInvoices, ctx.tenantId));
      return { rows, total: total.count };
    }),
    byId: protectedProcedure.input(z.number()).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [inv] = await db.select().from(salesInvoices).where(tenantWhere(salesInvoices, ctx.tenantId, eq(salesInvoices.id, input)));
      const invItems = await db.select({
        id: salesInvoiceItems.id,
        itemId: salesInvoiceItems.itemId,
        quantity: salesInvoiceItems.quantity,
        price: salesInvoiceItems.price,
        discount: salesInvoiceItems.discount,
        tax: salesInvoiceItems.tax,
        total: salesInvoiceItems.total,
        itemName: items.name,
        itemUnit: items.unit,
      }).from(salesInvoiceItems)
        .leftJoin(items, eq(salesInvoiceItems.itemId, items.id))
        .where(tenantWhere(salesInvoiceItems, ctx.tenantId, eq(salesInvoiceItems.invoiceId, input))));
      return { ...inv, items: invItems };
    }),
    create: protectedProcedure.input(z.object({
      customerId: z.number(),
      date: z.string(),
      dueDate: z.string().optional(),
      warehouseId: z.number().optional(),
      paymentType: z.enum(["cash", "credit"]).default("cash"),
      subtotal: z.string(),
      discount: z.string().default("0"),
      tax: z.string().default("0"),
      total: z.string(),
      notes: z.string().optional(),
      items: z.array(z.object({
        itemId: z.number(),
        quantity: z.string(),
        price: z.string(),
        discount: z.string().default("0"),
        tax: z.string().default("0"),
        total: z.string(),
      })),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [countResult] = await db.select({ count: count() }).from(salesInvoices).where(tenantWhere(salesInvoices, ctx.tenantId));
      const number = `SI-${String(countResult.count + 1).padStart(5, "0")}`;
      const [result] = await db.insert(salesInvoices).values(withTenantId(ctx.tenantId, {
        number,
        customerId: input.customerId,
        date: input.date as any,
        dueDate: input.dueDate as any,
        warehouseId: input.warehouseId,
        paymentType: input.paymentType,
        subtotal: input.subtotal,
        discount: input.discount,
        tax: input.tax,
        total: input.total,
        remaining: input.total,
        notes: input.notes,
        createdBy: ctx.user.id,
        status: "confirmed",
      }) as any);
      const invId = (result as any).insertId;
      for (const item of input.items) {
        await db.insert(salesInvoiceItems).values(withTenantId(ctx.tenantId, { invoiceId: invId, ...item }) as any);
        await db.update(items).set({
          currentStock: sql`currentStock - ${item.quantity}`,
        }).where(tenantWhere(items, ctx.tenantId, eq(items.id, item.itemId)));
      }
      return { success: true, id: invId, number };
    }),
  }),
  orders: router({
    list: protectedProcedure.input(z.object({ page: z.number().default(1), limit: z.number().default(20) })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;
      const rows = await db.select({
        id: salesOrders.id,
        number: salesOrders.number,
        date: salesOrders.date,
        total: salesOrders.total,
        status: salesOrders.status,
        customerName: customers.name,
      }).from(salesOrders)
        .where(tenantWhere(salesOrders, ctx.tenantId))
        .leftJoin(customers, eq(salesOrders.customerId, customers.id))
        .orderBy(desc(salesOrders.createdAt)).limit(input.limit).offset(offset);
      const [total] = await db.select({ count: count() }).from(salesOrders).where(tenantWhere(salesOrders, ctx.tenantId));
      return { rows, total: total.count };
    }),
    create: protectedProcedure.input(z.object({
      customerId: z.number(),
      date: z.string(),
      expectedDate: z.string().optional(),
      notes: z.string().optional(),
      items: z.array(z.object({
        itemId: z.number(),
        quantity: z.string(),
        unitPrice: z.string(),
        notes: z.string().optional(),
      })),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [countResult] = await db.select({ count: count() }).from(salesOrders).where(tenantWhere(salesOrders, ctx.tenantId));
      const number = `SO-${String(countResult.count + 1).padStart(5, "0")}`;
      const total = input.items.reduce((s, it) => s + (Number(it.quantity) * Number(it.unitPrice)), 0);
      const [result] = await db.insert(salesOrders).values(withTenantId(ctx.tenantId, {
        number, customerId: input.customerId,
        date: input.date as any,
        expectedDate: input.expectedDate as any,
        total: String(total),
        notes: input.notes,
        status: "draft",
      }) as any);
      const orderId = (result as any).insertId;
      for (const item of input.items) {
        await db.insert(salesOrderItems).values(withTenantId(ctx.tenantId, { orderId, ...item }) as any);
      }
      return { success: true, id: orderId, number };
    }),
    approve: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(salesOrders).set({ status: "approved" } as any).where(tenantWhere(salesOrders, ctx.tenantId, eq(salesOrders.id, input)));
      return { success: true };
    }),
  }),
  returns: router({
    list: protectedProcedure.input(z.object({ page: z.number().default(1), limit: z.number().default(20) })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;
      const rows = await db.select({
        id: salesReturns.id,
        number: salesReturns.number,
        date: salesReturns.date,
        total: salesReturns.total,
        status: salesReturns.status,
        customerName: customers.name,
      }).from(salesReturns)
        .where(tenantWhere(salesReturns, ctx.tenantId))
        .leftJoin(customers, eq(salesReturns.customerId, customers.id))
        .orderBy(desc(salesReturns.createdAt)).limit(input.limit).offset(offset);
      const [total] = await db.select({ count: count() }).from(salesReturns).where(tenantWhere(salesReturns, ctx.tenantId));
      return { rows, total: total.count };
    }),
    create: protectedProcedure.input(z.object({
      customerId: z.number(),
      invoiceId: z.number().optional(),
      date: z.string(),
      reason: z.string().optional(),
      notes: z.string().optional(),
      items: z.array(z.object({
        itemId: z.number(),
        quantity: z.string(),
        unitPrice: z.string(),
      })),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [countResult] = await db.select({ count: count() }).from(salesReturns).where(tenantWhere(salesReturns, ctx.tenantId));
      const number = `SR-${String(countResult.count + 1).padStart(5, "0")}`;
      const total = input.items.reduce((s, it) => s + (Number(it.quantity) * Number(it.unitPrice)), 0);
      const [result] = await db.insert(salesReturns).values(withTenantId(ctx.tenantId, {
        number, customerId: input.customerId,
        invoiceId: input.invoiceId,
        date: input.date as any,
        total: String(total),
        reason: input.reason,
        notes: input.notes,
        status: "confirmed",
      }) as any);
      const retId = (result as any).insertId;
      for (const item of input.items) {
        await db.insert(salesOrderItems).values(withTenantId(ctx.tenantId, { orderId: retId, ...item }) as any);
        await db.update(items).set({ currentStock: sql`currentStock + ${item.quantity}` }).where(tenantWhere(items, ctx.tenantId, eq(items.id, item.itemId)));
      }
      return { success: true, id: retId, number };
    }),
  }),
});

// ===================== EMPLOYEES =====================
const hrRouter = router({
  employees: router({
    list: protectedProcedure.input(z.object({
      search: z.string().optional(),
      departmentId: z.number().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;
      const rows = await db.select({
        id: employees.id,
        code: employees.code,
        name: employees.name,
        phone: employees.phone,
        basicSalary: employees.basicSalary,
        status: employees.status,
        hireDate: employees.hireDate,
        departmentName: departments.name,
        jobTitleName: jobTitles.name,
      }).from(employees)
        .where(tenantWhere(employees, ctx.tenantId))
        .leftJoin(departments, eq(employees.departmentId, departments.id))
        .leftJoin(jobTitles, eq(employees.jobTitleId, jobTitles.id))
        .orderBy(employees.name).limit(input.limit).offset(offset);
      const [total] = await db.select({ count: count() }).from(employees).where(tenantWhere(employees, ctx.tenantId));
      return { rows, total: total.count };
    }),
    byId: protectedProcedure.input(z.number()).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db.select().from(employees).where(tenantWhere(employees, ctx.tenantId, eq(employees.id, input)));
      return row;
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1),
      code: z.string().optional(),
      nationalId: z.string().optional(),
      departmentId: z.number().optional(),
      jobTitleId: z.number().optional(),
      hireDate: z.string().optional(),
      birthDate: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      basicSalary: z.string().optional(),
      bankAccount: z.string().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(employees).values(withTenantId(ctx.tenantId, input) as any);
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1),
      code: z.string().optional(),
      nationalId: z.string().optional(),
      departmentId: z.number().optional(),
      jobTitleId: z.number().optional(),
      hireDate: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      basicSalary: z.string().optional(),
      status: z.enum(["active", "inactive", "terminated"]).optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(employees).set(data as any).where(tenantWhere(employees, ctx.tenantId, eq(employees.id, id)));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(employees).where(tenantWhere(employees, ctx.tenantId, eq(employees.id, input)));
      return { success: true };
    }),
  }),
  departments: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(departments).where(tenantWhere(departments, ctx.tenantId)).orderBy(departments.name);
    }),
    create: protectedProcedure.input(z.object({ name: z.string().min(1), description: z.string().optional(), parentId: z.number().optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(departments).values(withTenantId(ctx.tenantId, input) as any);
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({ id: z.number(), name: z.string().min(1), description: z.string().optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(departments).set(data as any).where(tenantWhere(departments, ctx.tenantId, eq(departments.id, id)));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(departments).where(tenantWhere(departments, ctx.tenantId, eq(departments.id, input)));
      return { success: true };
    }),
  }),
  jobTitles: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(jobTitles).where(tenantWhere(jobTitles, ctx.tenantId)).orderBy(jobTitles.name);
    }),
    create: protectedProcedure.input(z.object({ name: z.string().min(1) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(jobTitles).values(withTenantId(ctx.tenantId, input) as any);
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({ id: z.number(), name: z.string().min(1) })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(jobTitles).set({ name: input.name }).where(tenantWhere(jobTitles, ctx.tenantId, eq(jobTitles.id, input.id)));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(jobTitles).where(tenantWhere(jobTitles, ctx.tenantId, eq(jobTitles.id, input)));
      return { success: true };
    }),
  }),
  attendance: router({
    list: protectedProcedure.input(z.object({
      employeeId: z.number().optional(),
      date: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(30),
    })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;
      const rows = await db.select({
        id: attendance.id,
        date: attendance.date,
        checkIn: attendance.checkIn,
        checkOut: attendance.checkOut,
        status: attendance.status,
        notes: attendance.notes,
        employeeName: employees.name,
      }).from(attendance)
        .where(tenantWhere(attendance, ctx.tenantId))
        .leftJoin(employees, eq(attendance.employeeId, employees.id))
        .orderBy(desc(attendance.date)).limit(input.limit).offset(offset);
      return rows;
    }),
    create: protectedProcedure.input(z.object({
      employeeId: z.number(),
      date: z.string(),
      checkIn: z.string().optional(),
      checkOut: z.string().optional(),
      status: z.enum(["present", "absent", "late", "leave", "holiday"]).default("present"),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(attendance).values(withTenantId(ctx.tenantId, input) as any);
      return { success: true };
    }),
    getByDate: protectedProcedure.input(z.object({ date: z.string() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db.select({
        id: attendance.id,
        employeeId: attendance.employeeId,
        date: attendance.date,
        checkIn: attendance.checkIn,
        checkOut: attendance.checkOut,
        overtime: attendance.overtime,
        status: attendance.status,
        notes: attendance.notes,
      }).from(attendance).where(tenantWhere(attendance, ctx.tenantId, sql`DATE(${attendance.date}) = ${input.date}`));
      return rows;
    }),
    saveDay: protectedProcedure.input(z.object({
      date: z.string(),
      records: z.array(z.object({
        employeeId: z.number(),
        status: z.enum(["present", "absent", "late", "half_day", "holiday"]),
        checkIn: z.string().optional(),
        checkOut: z.string().optional(),
        overtime: z.number().default(0),
        notes: z.string().optional(),
      })),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Delete existing records for the day then re-insert
      await db.delete(attendance).where(tenantWhere(attendance, ctx.tenantId, eq(attendance.date, new Date(input.date))));
      if (input.records.length > 0) {
        await db.insert(attendance).values(withTenantId(ctx.tenantId, 
          input.records.map(r => ({
            employeeId: r.employeeId,
            date: new Date(input.date),
            checkIn: r.checkIn,
            checkOut: r.checkOut,
            overtime: r.overtime,
            status: r.status as any,
            notes: r.notes,
          }))
        );
      }
      return { success: true, count: input.records.length };
    }),
  }),
  payroll: router({
    list: protectedProcedure.input(z.object({ month: z.number(), year: z.number() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select({
        id: payroll.id,
        month: payroll.month,
        year: payroll.year,
        basicSalary: payroll.basicSalary,
        allowances: payroll.allowances,
        deductions: payroll.deductions,
        netSalary: payroll.netSalary,
        status: payroll.status,
        employeeName: employees.name,
      }).from(payroll)
        .leftJoin(employees, eq(payroll.employeeId, employees.id))
        .where(tenantWhere(payroll, ctx.tenantId, and(eq(payroll.month, input.month), eq(payroll.year, input.year)))));
    }),
    create: protectedProcedure.input(z.object({
      employeeId: z.number(),
      month: z.number(),
      year: z.number(),
      basicSalary: z.string(),
      allowances: z.string().default("0"),
      deductions: z.string().default("0"),
      advances: z.string().default("0"),
      tax: z.string().default("0"),
      netSalary: z.string(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(payroll).values(withTenantId(ctx.tenantId, input) as any);
      return { success: true };
    }),
  }),
  advances: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select({
        id: salaryAdvances.id,
        amount: salaryAdvances.amount,
        date: salaryAdvances.date,
        reason: salaryAdvances.reason,
        status: salaryAdvances.status,
        employeeName: employees.name,
      }).from(salaryAdvances)
        .where(tenantWhere(salaryAdvances, ctx.tenantId))
        .leftJoin(employees, eq(salaryAdvances.employeeId, employees.id))
        .orderBy(desc(salaryAdvances.createdAt));
    }),
    create: protectedProcedure.input(z.object({
      employeeId: z.number(),
      amount: z.string(),
      date: z.string(),
      reason: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(salaryAdvances).values(withTenantId(ctx.tenantId, input) as any);
      return { success: true };
    }),
    approve: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(salaryAdvances).set({ status: "approved" } as any).where(tenantWhere(salaryAdvances, ctx.tenantId, eq(salaryAdvances.id, input)));
      return { success: true };
    }),
  }),
});

// ===================== ACCOUNTS =====================
const accountsRouter = router({
  chart: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(accounts).where(tenantWhere(accounts, ctx.tenantId, eq(accounts.isActive, true))).orderBy(accounts.code));
  }),
  create: protectedProcedure.input(z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
    parentId: z.number().optional(),
    isParent: z.boolean().optional(),
    notes: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(accounts).values(withTenantId(ctx.tenantId, input) as any);
    return { success: true };
  }),
  journal: router({
    list: protectedProcedure.input(z.object({ page: z.number().default(1), limit: z.number().default(20) })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;
      const rows = await db.select().from(journalEntries).where(tenantWhere(journalEntries, ctx.tenantId)).orderBy(desc(journalEntries.createdAt)).limit(input.limit).offset(offset);
      const [total] = await db.select({ count: count() }).from(journalEntries).where(tenantWhere(journalEntries, ctx.tenantId));
      return { rows, total: total.count };
    }),
    create: protectedProcedure.input(z.object({
      date: z.string(),
      description: z.string().optional(),
      reference: z.string().optional(),
      lines: z.array(z.object({
        accountId: z.number(),
        debit: z.string().default("0"),
        credit: z.string().default("0"),
        description: z.string().optional(),
      })),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [countResult] = await db.select({ count: count() }).from(journalEntries).where(tenantWhere(journalEntries, ctx.tenantId));
      const number = `JE-${String(countResult.count + 1).padStart(5, "0")}`;
      const [result] = await db.insert(journalEntries).values(withTenantId(ctx.tenantId, {
        number,
        date: input.date as any,
        description: input.description,
        reference: input.reference,
        createdBy: ctx.user.id,
        status: "posted",
      }) as any);
      const entryId = (result as any).insertId;
      for (const line of input.lines) {
        await db.insert(journalEntryLines).values(withTenantId(ctx.tenantId, { entryId, ...line }) as any);
      }
      return { success: true, id: entryId, number };
    }),
  }),
  taxes: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(taxes).where(tenantWhere(taxes, ctx.tenantId)).orderBy(taxes.name);
    }),
    create: protectedProcedure.input(z.object({ name: z.string().min(1), rate: z.string() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(taxes).values(withTenantId(ctx.tenantId, input) as any);
      return { success: true };
    }),
  }),
});

// ===================== CASH TRANSACTIONS =====================
const cashRouter = router({
  list: protectedProcedure.input(z.object({
    type: z.string().optional(),
    page: z.number().default(1),
    limit: z.number().default(20),
  })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    const rows = await db.select().from(cashTransactions).where(tenantWhere(cashTransactions, ctx.tenantId)).orderBy(desc(cashTransactions.createdAt)).limit(input.limit).offset(offset);
    const [total] = await db.select({ count: count() }).from(cashTransactions).where(tenantWhere(cashTransactions, ctx.tenantId));
    return { rows, total: total.count };
  }),
  create: protectedProcedure.input(z.object({
    type: z.enum(["receive", "pay", "receive_customer", "pay_supplier"]),
    date: z.string(),
    customerId: z.number().optional(),
    supplierId: z.number().optional(),
    amount: z.string(),
    description: z.string().optional(),
    reference: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [countResult] = await db.select({ count: count() }).from(cashTransactions).where(tenantWhere(cashTransactions, ctx.tenantId));
    const number = `CT-${String(countResult.count + 1).padStart(5, "0")}`;
    await db.insert(cashTransactions).values(withTenantId(ctx.tenantId, { number, ...input, createdBy: ctx.user.id }) as any);
    return { success: true };
  }),
});

// ===================== BANK TRANSACTIONS =====================
const bankRouter = router({
  accounts: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(bankAccounts).where(tenantWhere(bankAccounts, ctx.tenantId, eq(bankAccounts.isActive, true)));
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1),
      bankName: z.string().optional(),
      accountNumber: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(bankAccounts).values(withTenantId(ctx.tenantId, input) as any);
      return { success: true };
    }),
  }),
  transactions: router({
    list: protectedProcedure.input(z.object({ page: z.number().default(1), limit: z.number().default(20) })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;
      const rows = await db.select().from(bankTransactions).where(tenantWhere(bankTransactions, ctx.tenantId)).orderBy(desc(bankTransactions.createdAt)).limit(input.limit).offset(offset);
      const [total] = await db.select({ count: count() }).from(bankTransactions).where(tenantWhere(bankTransactions, ctx.tenantId));
      return { rows, total: total.count };
    }),
    create: protectedProcedure.input(z.object({
      type: z.enum(["deposit", "withdraw", "deposit_customer", "withdraw_supplier"]),
      bankAccountId: z.number(),
      date: z.string(),
      customerId: z.number().optional(),
      supplierId: z.number().optional(),
      amount: z.string(),
      description: z.string().optional(),
      reference: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [countResult] = await db.select({ count: count() }).from(bankTransactions).where(tenantWhere(bankTransactions, ctx.tenantId));
      const number = `BT-${String(countResult.count + 1).padStart(5, "0")}`;
      await db.insert(bankTransactions).values(withTenantId(ctx.tenantId, { number, ...input, createdBy: ctx.user.id }) as any);
      return { success: true };
    }),
  }),
  checks: router({
    list: protectedProcedure.input(z.object({
      type: z.enum(["incoming", "outgoing"]).optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;
      const where = input.type ? eq(checks.type, input.type) : undefined;
      const rows = await db.select().from(checks).where(tenantWhere(checks, ctx.tenantId, where)).orderBy(desc(checks.createdAt)).limit(input.limit).offset(offset);
      const [total] = await db.select({ count: count() }).from(checks).where(tenantWhere(checks, ctx.tenantId, where));
      return { rows, total: total.count };
    }),
    create: protectedProcedure.input(z.object({
      checkNumber: z.string().min(1),
      type: z.enum(["incoming", "outgoing"]),
      bankAccountId: z.number().optional(),
      customerId: z.number().optional(),
      supplierId: z.number().optional(),
      amount: z.string(),
      dueDate: z.string(),
      date: z.string(),
      description: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [countResult] = await db.select({ count: count() }).from(checks).where(tenantWhere(checks, ctx.tenantId));
      const number = `CHK-${String(countResult.count + 1).padStart(5, "0")}`;
      await db.insert(checks).values(withTenantId(ctx.tenantId, { number, ...input, createdBy: ctx.user.id }) as any);
      return { success: true };
    }),
  }),
});

// ===================== REPORTS =====================
const reportsRouter = router({
  inventory: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select({
      id: items.id,
      code: items.code,
      name: items.name,
      unit: items.unit,
      currentStock: items.currentStock,
      minStock: items.minStock,
      salePrice: items.salePrice,
      purchasePrice: items.purchasePrice,
      categoryName: itemCategories.name,
    }).from(items)
      .where(tenantWhere(items, ctx.tenantId))
      .leftJoin(itemCategories, eq(items.categoryId, itemCategories.id))
      .orderBy(items.name);
  }),
  balanceSheet: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const allAccounts = await db.select().from(accounts).where(tenantWhere(accounts, ctx.tenantId, eq(accounts.isActive, true))).orderBy(accounts.code));
    const assets = allAccounts.filter(a => a.type === "asset");
    const liabilities = allAccounts.filter(a => a.type === "liability");
    const equity = allAccounts.filter(a => a.type === "equity");
    return { assets, liabilities, equity };
  }),
  incomeStatement: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [totalRevenue] = await db.select({ total: sum(salesInvoices.total) }).from(salesInvoices).where(tenantWhere(salesInvoices, ctx.tenantId, eq(salesInvoices.status, \"confirmed\"))));
    const [totalCost] = await db.select({ total: sum(purchaseInvoices.total) }).from(purchaseInvoices).where(tenantWhere(purchaseInvoices, ctx.tenantId, eq(purchaseInvoices.status, "confirmed")));
    const revenue = Number(totalRevenue.total ?? 0);
    const cost = Number(totalCost.total ?? 0);
    const grossProfit = revenue - cost;
    return { revenue, cost, grossProfit, netProfit: grossProfit };
  }),

  analytics: protectedProcedure.input(z.object({
    months: z.number().default(6),
  })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - input.months + 1);
    startDate.setDate(1);
    const startStr = startDate.toISOString().split("T")[0];

    // مبيعات شهرية
    const allSales = await db.select({
      id: salesInvoices.id,
      total: salesInvoices.total,
      date: salesInvoices.date,
      customerId: salesInvoices.customerId,
      customerName: customers.name,
    }).from(salesInvoices)
      .where(tenantWhere(salesInvoices, ctx.tenantId, and(eq(salesInvoices.status, "confirmed"), gte(salesInvoices.date, startStr as any))))
      .leftJoin(customers, eq(salesInvoices.customerId, customers.id));

    // تجميع بالشهر
    const monthlyMap: Record<string, { month: string; sales: number; count: number }> = {};
    for (const inv of allSales) {
      const d = new Date(inv.date as any);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthlyMap[key]) monthlyMap[key] = { month: key, sales: 0, count: 0 };
      monthlyMap[key].sales += Number(inv.total ?? 0);
      monthlyMap[key].count++;
    }
    const monthlySales = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));

    // أفضل العملاء
    const customerMap: Record<number, { id: number; name: string; total: number; count: number }> = {};
    for (const inv of allSales) {
      if (!inv.customerId) continue;
      if (!customerMap[inv.customerId]) customerMap[inv.customerId] = { id: inv.customerId, name: inv.customerName || `عميل #${inv.customerId}`, total: 0, count: 0 };
      customerMap[inv.customerId].total += Number(inv.total ?? 0);
      customerMap[inv.customerId].count++;
    }
    const topCustomers = Object.values(customerMap).sort((a, b) => b.total - a.total).slice(0, 10);

    // أكثر الأصناف مبيعاً
    const salesItems = await db.select({
      itemId: salesInvoiceItems.itemId,
      itemName: items.name,
      qty: salesInvoiceItems.quantity,
      total: salesInvoiceItems.total,
    }).from(salesInvoiceItems)
      .where(tenantWhere(salesInvoiceItems, ctx.tenantId, and(eq(salesInvoices.status, "confirmed"), gte(salesInvoices.date, startStr as any))))
      .leftJoin(salesInvoices, eq(salesInvoiceItems.invoiceId, salesInvoices.id))
      .leftJoin(items, eq(salesInvoiceItems.itemId, items.id));

    const itemMap: Record<number, { id: number; name: string; qty: number; total: number }> = {};
    for (const row of salesItems) {
      if (!row.itemId) continue;
      if (!itemMap[row.itemId]) itemMap[row.itemId] = { id: row.itemId, name: row.itemName || `صنف #${row.itemId}`, qty: 0, total: 0 };
      itemMap[row.itemId].qty += Number(row.qty ?? 0);
      itemMap[row.itemId].total += Number(row.total ?? 0);
    }
    const topItems = Object.values(itemMap).sort((a, b) => b.total - a.total).slice(0, 10);

    // مقارنة المبيعات والمشتريات
    const allPurchases = await db.select({
      total: purchaseInvoices.total,
      date: purchaseInvoices.date,
    }).from(purchaseInvoices)
      .where(tenantWhere(purchaseInvoices, ctx.tenantId, and(eq(purchaseInvoices.status, "confirmed"), gte(purchaseInvoices.date, startStr as any)))));

    const purchaseMap: Record<string, number> = {};
    for (const inv of allPurchases) {
      const d = new Date(inv.date as any);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      purchaseMap[key] = (purchaseMap[key] || 0) + Number(inv.total ?? 0);
    }
    const comparison = monthlySales.map(m => ({
      month: m.month,
      sales: m.sales,
      purchases: purchaseMap[m.month] || 0,
      profit: m.sales - (purchaseMap[m.month] || 0),
    }));

    return { monthlySales, topCustomers, topItems, comparison };
  }),

  tax: protectedProcedure.input(z.object({
    startDate: z.string(),
    endDate: z.string(),
  })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const startDateObj = new Date(input.startDate);
    const endDateObj = new Date(input.endDate);

    // ضرائب فواتير البيع (محصّلة)
    const salesRows = await db.select({
      id: salesInvoices.id,
      number: salesInvoices.number,
      date: salesInvoices.date,
      subtotal: salesInvoices.subtotal,
      tax: salesInvoices.tax,
      total: salesInvoices.total,
      status: salesInvoices.status,
    }).from(salesInvoices)
      .where(tenantWhere(salesInvoices, ctx.tenantId, and(
        eq(salesInvoices.status, "confirmed"),
        gte(salesInvoices.date, startDateObj),
        lte(salesInvoices.date, endDateObj)
      )))
      .orderBy(desc(salesInvoices.date));

    // ضرائب فواتير الشراء (مدفوعة)
    const purchaseRows = await db.select({
      id: purchaseInvoices.id,
      number: purchaseInvoices.number,
      date: purchaseInvoices.date,
      subtotal: purchaseInvoices.subtotal,
      tax: purchaseInvoices.tax,
      total: purchaseInvoices.total,
      status: purchaseInvoices.status,
    }).from(purchaseInvoices)
      .where(tenantWhere(purchaseInvoices, ctx.tenantId, and(
        eq(purchaseInvoices.status, "confirmed"),
        gte(purchaseInvoices.date, startDateObj),
        lte(purchaseInvoices.date, endDateObj)
      )))
      .orderBy(desc(purchaseInvoices.date));

    const totalSalesTax = salesRows.reduce((s, r) => s + Number(r.tax ?? 0), 0);
    const totalPurchaseTax = purchaseRows.reduce((s, r) => s + Number(r.tax ?? 0), 0);
    const netTax = totalSalesTax - totalPurchaseTax;

    return {
      salesInvoices: salesRows,
      purchaseInvoices: purchaseRows,
      summary: {
        totalSalesTax,
        totalPurchaseTax,
        netTax,
        salesCount: salesRows.length,
        purchasesCount: purchaseRows.length,
      }
    };
  }),
});

// ===================== NOTIFICATIONS =====================
const notificationsRouter = router({
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { count: 0 };
    const [result] = await db.select({ count: count() }).from(notifications)
      .where(tenantWhere(notifications, ctx.tenantId, and(eq(notifications.isRead, false), eq(notifications.userId, ctx.user.id)))));
    return { count: result.count };
  }),
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(notifications)
      .where(tenantWhere(notifications, ctx.tenantId, eq(notifications.userId, ctx.user.id)))
      .orderBy(desc(notifications.createdAt)).limit(20);
  }),
  markRead: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(notifications).set({ isRead: true }).where(tenantWhere(notifications, ctx.tenantId, eq(notifications.id, input)));
    return { success: true };
  }),
});

// ===================== FIXED ASSETS =====================
const assetsRouter = router({
  list: protectedProcedure.input(z.object({ page: z.number().default(1), limit: z.number().default(20) })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    const rows = await db.select().from(fixedAssets).where(tenantWhere(fixedAssets, ctx.tenantId)).orderBy(fixedAssets.name).limit(input.limit).offset(offset);
    const [total] = await db.select({ count: count() }).from(fixedAssets).where(tenantWhere(fixedAssets, ctx.tenantId));
    return { rows, total: total.count };
  }),
  create: protectedProcedure.input(z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    category: z.string().optional(),
    purchaseDate: z.string().optional(),
    purchasePrice: z.string().optional(),
    depreciationRate: z.string().optional(),
    location: z.string().optional(),
    notes: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(fixedAssets).values(withTenantId(ctx.tenantId, { ...input, currentValue: input.purchasePrice }) as any);
    return { success: true };
  }),
});

// ===================== LOANS =====================
const loansRouter = router({
  list: protectedProcedure.input(z.object({ page: z.number().default(1), limit: z.number().default(20) })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    const rows = await db.select().from(loans).where(tenantWhere(loans, ctx.tenantId)).orderBy(desc(loans.createdAt)).limit(input.limit).offset(offset);
    const [total] = await db.select({ count: count() }).from(loans).where(tenantWhere(loans, ctx.tenantId));
    return { rows, total: total.count };
  }),
  create: protectedProcedure.input(z.object({
    type: z.enum(["given", "received"]),
    partyName: z.string().min(1),
    amount: z.string(),
    interestRate: z.string().optional(),
    startDate: z.string(),
    endDate: z.string().optional(),
    notes: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [countResult] = await db.select({ count: count() }).from(loans).where(tenantWhere(loans, ctx.tenantId));
    const number = `LN-${String(countResult.count + 1).padStart(5, "0")}`;
    await db.insert(loans).values(withTenantId(ctx.tenantId, { number, ...input }) as any);
    return { success: true };
  }),
  installments: router({
    list: protectedProcedure.input(z.number()).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(installments).where(tenantWhere(installments, ctx.tenantId, eq(installments.loanId, input))).orderBy(installments.dueDate));
    }),
    listAll: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(installments).where(tenantWhere(installments, ctx.tenantId)).orderBy(installments.dueDate);
    }),
    pay: protectedProcedure.input(z.object({ installmentId: z.number() })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(installments).set({ status: 'paid', paidDate: new Date() }).where(tenantWhere(installments, ctx.tenantId, eq(installments.id, input.installmentId)));
      return { success: true };
    }),
  }),
});

// ===================== COST CENTERS =====================
const costCentersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(costCenters).where(tenantWhere(costCenters, ctx.tenantId, eq(costCenters.isActive, true))).orderBy(costCenters.name));
  }),
  create: protectedProcedure.input(z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    parentId: z.number().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(costCenters).values(withTenantId(ctx.tenantId, input) as any);
    return { success: true };
  }),
});

// ===================== SALES REPS =====================
const salesRepsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(salesReps).where(tenantWhere(salesReps, ctx.tenantId, eq(salesReps.isActive, true))).orderBy(salesReps.name));
  }),
  create: protectedProcedure.input(z.object({
    name: z.string().min(1),
    phone: z.string().optional(),
    email: z.string().optional(),
    commissionRate: z.string().optional(),
    address: z.string().optional(),
    notes: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(salesReps).values(withTenantId(ctx.tenantId, input) as any);
    return { success: true };
  }),
  update: protectedProcedure.input(z.object({
    id: z.number(),
    name: z.string().min(1),
    phone: z.string().optional(),
    email: z.string().optional(),
    commissionRate: z.string().optional(),
    address: z.string().optional(),
    notes: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, ...data } = input;
    await db.update(salesReps).set(data as any).where(tenantWhere(salesReps, ctx.tenantId, eq(salesReps.id, id)));
    return { success: true };
  }),
  delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(salesReps).set({ isActive: false } as any).where(tenantWhere(salesReps, ctx.tenantId, eq(salesReps.id, input)));
    return { success: true };
  }),
});

// ===================== SETTINGS =====================
const settingsRouter = router({
  backup: router({
    export: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // جلب جميع البيانات للنسخة الاحتياطية
      const [customersData, suppliersData, itemsData, salesData, purchasesData, cashData, bankData, checksData, employeesData, journalData] = await Promise.all([
        db.select().from(customers).where(tenantWhere(customers, ctx.tenantId)).limit(5000),
        db.select().from(suppliers).where(tenantWhere(suppliers, ctx.tenantId)).limit(5000),
        db.select().from(items).where(tenantWhere(items, ctx.tenantId)).limit(5000),
        db.select().from(salesInvoices).where(tenantWhere(salesInvoices, ctx.tenantId)).limit(5000),
        db.select().from(purchaseInvoices).where(tenantWhere(purchaseInvoices, ctx.tenantId)).limit(5000),
        db.select().from(cashTransactions).where(tenantWhere(cashTransactions, ctx.tenantId)).limit(5000),
        db.select().from(bankTransactions).where(tenantWhere(bankTransactions, ctx.tenantId)).limit(5000),
        db.select().from(checks).where(tenantWhere(checks, ctx.tenantId)).limit(5000),
        db.select().from(employees).where(tenantWhere(employees, ctx.tenantId)).limit(5000),
        db.select().from(journalEntries).where(tenantWhere(journalEntries, ctx.tenantId)).limit(5000),
      ]);
      return {
        exportedAt: new Date().toISOString(),
        version: "1.0",
        data: {
          customers: customersData,
          suppliers: suppliersData,
          items: itemsData,
          salesInvoices: salesData,
          purchaseInvoices: purchasesData,
          cashTransactions: cashData,
          bankTransactions: bankData,
          checks: checksData,
          employees: employeesData,
          journalEntries: journalData,
        },
        summary: {
          customers: customersData.length,
          suppliers: suppliersData.length,
          items: itemsData.length,
          salesInvoices: salesData.length,
          purchaseInvoices: purchasesData.length,
          cashTransactions: cashData.length,
          bankTransactions: bankData.length,
          checks: checksData.length,
          employees: employeesData.length,
          journalEntries: journalData.length,
        }
      };
    }),
  }),
  company: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db.select().from(companySettings).where(tenantWhere(companySettings, ctx.tenantId)).limit(1);
      return row;
    }),
    save: protectedProcedure.input(z.object({
      name: z.string().min(1),
      address: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      taxNumber: z.string().optional(),
      currency: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [existing] = await db.select().from(companySettings).where(tenantWhere(companySettings, ctx.tenantId)).limit(1);
      if (existing) {
        await db.update(companySettings).set(input).where(tenantWhere(companySettings, ctx.tenantId, eq(companySettings.id, existing.id)));
      } else {
        await db.insert(companySettings).values(withTenantId(ctx.tenantId, input) as any);
      }
      return { success: true };
    }),
  }),
  branches: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(branches).where(tenantWhere(branches, ctx.tenantId)).orderBy(branches.name);
    }),
    create: protectedProcedure.input(z.object({
      name: z.string().min(1),
      code: z.string().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      managerName: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(branches).values(withTenantId(ctx.tenantId, input) as any);
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1),
      code: z.string().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      managerName: z.string().optional(),
      isActive: z.boolean().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...data } = input;
      await db.update(branches).set(data as any).where(tenantWhere(branches, ctx.tenantId, eq(branches.id, id)));
      return { success: true };
    }),
    delete: protectedProcedure.input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(branches).where(tenantWhere(branches, ctx.tenantId, eq(branches.id, input)));
      return { success: true };
    }),
    listWithSearch: protectedProcedure.input(z.object({ search: z.string().optional() })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const where = input.search ? like(branches.name, `%${input.search}%`) : undefined;
      const rows = await db.select().from(branches).where(tenantWhere(branches, ctx.tenantId, where)).orderBy(branches.name));
      return { rows };
    }),
  }),
  users: router({
    list: protectedProcedure.use(({ ctx, next }) => {
      if (!ctx.saasUser || !canManageTeamUsers(ctx.saasUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "هذه العملية للمديرين فقط" });
      }
      return next({ ctx });
    }).query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const tenantId = ctx.tenantId!;
      return db
        .select({
          id: appUsers.id,
          name: appUsers.name,
          email: appUsers.email,
          role: appUsers.role,
          jobTitle: appUsers.jobTitle,
          isActive: appUsers.isActive,
          createdAt: appUsers.createdAt,
          ownerUserId: appUsers.ownerUserId,
        })
        .from(appUsers)
        .where(eq(appUsers.tenantId, tenantId))
        .orderBy(appUsers.createdAt);
    }),
    updateRole: protectedProcedure.use(({ ctx, next }) => {
      if (!ctx.saasUser || !canManageTeamUsers(ctx.saasUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "هذه العملية للمديرين فقط" });
      }
      return next({ ctx });
    }).input(z.object({
      userId: z.number(),
      role: z.enum(["admin", "user", "accountant", "sales_rep", "warehouse_manager"]),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const tenantId = ctx.tenantId!;
      const ownerId = ctx.saasUser!.accountOwnerId;
      const [target] = await db.select().from(appUsers).where(and(eq(appUsers.id, input.userId), eq(appUsers.tenantId, tenantId))).limit(1);
      if (!target || getAccountOwnerId(target) !== ownerId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });
      }
      if (!target.ownerUserId && target.id === ownerId && input.role !== "admin") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن تغيير دور مالك الحساب" });
      }
      await db.update(appUsers).set({ role: input.role }).where(eq(appUsers.id, input.userId));
      return { success: true };
    }),
    create: protectedProcedure.use(({ ctx, next }) => {
      if (!ctx.saasUser || !canManageTeamUsers(ctx.saasUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "هذه العملية للمديرين فقط" });
      }
      return next({ ctx });
    }).input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(6),
      role: z.enum(["admin", "user", "accountant", "sales_rep", "warehouse_manager"]).default("user"),
      jobTitle: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const tenantId = ctx.tenantId!;
      const ownerId = ctx.saasUser!.accountOwnerId;

      const sub = await getUserActiveSubscription(ownerId);
      const maxUsers = sub?.maxUsers ?? 1;
      const currentUsers = await countAccountUsers(tenantId);
      if (currentUsers >= maxUsers) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `وصلت للحد الأقصى من المستخدمين (${maxUsers}). رقِّ خطتك لإضافة المزيد.`,
        });
      }

      const existing = await getAppUserByEmail(input.email);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "البريد الإلكتروني مستخدم بالفعل" });

      const [owner] = await db.select({ companyName: appUsers.companyName }).from(appUsers).where(eq(appUsers.id, ownerId)).limit(1);
      const hashedPassword = await hashPassword(input.password);
      await db.insert(appUsers).values({
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash: hashedPassword,
        role: input.role,
        ownerUserId: ownerId,
        tenantId,
        jobTitle: input.jobTitle || null,
        companyName: owner?.companyName || null,
      });
      return { success: true };
    }),
    delete: protectedProcedure.use(({ ctx, next }) => {
      if (!ctx.saasUser || !canManageTeamUsers(ctx.saasUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "هذه العملية للمديرين فقط" });
      }
      return next({ ctx });
    }).input(z.number()).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const tenantId = ctx.tenantId!;
      const ownerId = ctx.saasUser!.accountOwnerId;
      if (input === ownerId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك حذف مالك الحساب" });
      }
      const [target] = await db.select().from(appUsers).where(and(eq(appUsers.id, input), eq(appUsers.tenantId, tenantId))).limit(1);
      if (!target || target.ownerUserId !== ownerId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });
      }
      await db.delete(appUsers).where(eq(appUsers.id, input));
      return { success: true };
    }),
    resetPassword: protectedProcedure.use(({ ctx, next }) => {
      if (!ctx.saasUser || !canManageTeamUsers(ctx.saasUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "هذه العملية للمديرين فقط" });
      }
      return next({ ctx });
    }).input(z.object({
      userId: z.number(),
      newPassword: z.string().min(6),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const tenantId = ctx.tenantId!;
      const ownerId = ctx.saasUser!.accountOwnerId;
      const [target] = await db.select().from(appUsers).where(and(eq(appUsers.id, input.userId), eq(appUsers.tenantId, tenantId))).limit(1);
      if (!target || getAccountOwnerId(target) !== ownerId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });
      }
      const hashedPassword = await hashPassword(input.newPassword);
      await db.update(appUsers).set({ passwordHash: hashedPassword }).where(eq(appUsers.id, input.userId));
      return { success: true };
    }),
  }),
});

// ===================== PRODUCTION =====================
const productionRouter = router({
  list: protectedProcedure.input(z.object({ page: z.number().default(1), limit: z.number().default(20) })).query(async ({ ctx }) => {
    return { rows: [], total: 0 };
  }),
  create: protectedProcedure.input(z.object({
    productId: z.number(),
    quantity: z.string(),
    warehouseId: z.number(),
    date: z.string(),
    notes: z.string().optional(),
    materials: z.array(z.object({ itemId: z.number(), quantity: z.string() })).optional(),
  })).mutation(async ({ ctx, input }) => {
    return { success: true, id: 1, number: `PO-00001` };
  }),
});

// ===================== INVENTORY =====================
const inventoryRouter = router({
  transfers: router({
    list: protectedProcedure.input(z.object({ page: z.number().default(1), limit: z.number().default(20) })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;
      const rows = await db.select({
        id: stockTransfers.id,
        number: stockTransfers.number,
        date: stockTransfers.date,
        status: stockTransfers.status,
        fromWarehouseName: sql<string>`fw.name`,
        toWarehouseName: sql<string>`tw.name`,
      }).from(stockTransfers)
        .where(tenantWhere(stockTransfers, ctx.tenantId))
        .leftJoin(sql`warehouses fw`, sql`fw.id = ${stockTransfers.fromWarehouseId}`)
        .leftJoin(sql`warehouses tw`, sql`tw.id = ${stockTransfers.toWarehouseId}`)
        .orderBy(desc(stockTransfers.createdAt)).limit(input.limit).offset(offset);
      const [total] = await db.select({ count: count() }).from(stockTransfers).where(tenantWhere(stockTransfers, ctx.tenantId));
      return { rows, total: total.count };
    }),
    create: protectedProcedure.input(z.object({
      fromWarehouseId: z.number(),
      toWarehouseId: z.number(),
      date: z.string(),
      notes: z.string().optional(),
      items: z.array(z.object({ itemId: z.number(), quantity: z.string() })),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [countResult] = await db.select({ count: count() }).from(stockTransfers).where(tenantWhere(stockTransfers, ctx.tenantId));
      const number = `ST-${String(countResult.count + 1).padStart(5, "0")}`;
      const [result] = await db.insert(stockTransfers).values(withTenantId(ctx.tenantId, {
        number, fromWarehouseId: input.fromWarehouseId, toWarehouseId: input.toWarehouseId,
        date: input.date as any, notes: input.notes, status: "confirmed",
      }) as any);
      const transferId = (result as any).insertId;
      for (const item of input.items) {
        await db.insert(stockTransferItems).values(withTenantId(ctx.tenantId, { transferId, ...item }) as any);
      }
      return { success: true, id: transferId, number };
    }),
  }),
  adjustments: router({
    list: protectedProcedure.input(z.object({ page: z.number().default(1), limit: z.number().default(20) })).query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;
      const rows = await db.select({
        id: inventoryAdjustments.id,
        number: inventoryAdjustments.number,
        date: inventoryAdjustments.date,
        reason: inventoryAdjustments.reason,
        status: inventoryAdjustments.status,
        warehouseName: warehouses.name,
      }).from(inventoryAdjustments)
        .where(tenantWhere(inventoryAdjustments, ctx.tenantId))
        .leftJoin(warehouses, eq(inventoryAdjustments.warehouseId, warehouses.id))
        .orderBy(desc(inventoryAdjustments.createdAt)).limit(input.limit).offset(offset);
      const [total] = await db.select({ count: count() }).from(inventoryAdjustments).where(tenantWhere(inventoryAdjustments, ctx.tenantId));
      return { rows, total: total.count };
    }),
    create: protectedProcedure.input(z.object({
      warehouseId: z.number(),
      date: z.string(),
      adjustmentType: z.enum(["addition", "deduction"]),
      notes: z.string().optional(),
      items: z.array(z.object({ itemId: z.number(), quantity: z.string(), reason: z.string().optional() })),
    })).mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [countResult] = await db.select({ count: count() }).from(inventoryAdjustments).where(tenantWhere(inventoryAdjustments, ctx.tenantId));
      const number = `IA-${String(countResult.count + 1).padStart(5, "0")}`;
      const [result] = await db.insert(inventoryAdjustments).values(withTenantId(ctx.tenantId, {
        number, warehouseId: input.warehouseId, date: input.date as any,
        reason: input.notes, status: "confirmed",
      }) as any);
      const adjId = (result as any).insertId;
      for (const item of input.items) {
        await db.insert(inventoryAdjustmentItems).values(withTenantId(ctx.tenantId, { adjustmentId: adjId, ...item }) as any);
        const delta = input.adjustmentType === "addition" ? `currentStock + ${item.quantity}` : `currentStock - ${item.quantity}`;
        await db.update(items).set({ currentStock: sql.raw(delta) } as any).where(tenantWhere(items, ctx.tenantId, eq(items.id, item.itemId)));
      }
      return { success: true, id: adjId, number };
    }),
  }),
});

// ===================== STATEMENT (كشف الحساب) =====================
const statementRouter = router({
  customer: protectedProcedure.input(z.object({
    customerId: z.number(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [customer] = await db.select().from(customers).where(tenantWhere(customers, ctx.tenantId, eq(customers.id, input.customerId)));
    // Sales invoices
    let siConds: any[] = [tenantWhere(salesInvoices, ctx.tenantId, eq(salesInvoices.customerId, input.customerId))];
    if (input.dateFrom) siConds.push(gte(salesInvoices.date, input.dateFrom as any));
    if (input.dateTo) siConds.push(lte(salesInvoices.date, input.dateTo as any));
    const siRows = await db.select({
      id: salesInvoices.id, number: salesInvoices.number, date: salesInvoices.date,
      total: salesInvoices.total, paid: salesInvoices.paid, remaining: salesInvoices.remaining,
      status: salesInvoices.status, paymentType: salesInvoices.paymentType,
    }).from(salesInvoices).where(tenantWhere(salesInvoices, ctx.tenantId, and(...siConds))).orderBy(salesInvoices.date);
    // Cash transactions for this customer
    let ctConds: any[] = [tenantWhere(cashTransactions, ctx.tenantId, eq(cashTransactions.customerId, input.customerId))];
    if (input.dateFrom) ctConds.push(gte(cashTransactions.date, input.dateFrom as any));
    if (input.dateTo) ctConds.push(lte(cashTransactions.date, input.dateTo as any));
    const ctRows = await db.select().from(cashTransactions).where(tenantWhere(cashTransactions, ctx.tenantId, and(...ctConds))).orderBy(cashTransactions.date);
    // Bank transactions for this customer
    let btConds: any[] = [tenantWhere(bankTransactions, ctx.tenantId, eq(bankTransactions.customerId, input.customerId))];
    if (input.dateFrom) btConds.push(gte(bankTransactions.date, input.dateFrom as any));
    if (input.dateTo) btConds.push(lte(bankTransactions.date, input.dateTo as any));
    const btRows = await db.select().from(bankTransactions).where(tenantWhere(bankTransactions, ctx.tenantId, and(...btConds))).orderBy(bankTransactions.date);
    // Sales returns
    let srConds: any[] = [tenantWhere(salesReturns, ctx.tenantId, eq(salesReturns.customerId, input.customerId))];
    if (input.dateFrom) srConds.push(gte(salesReturns.date, input.dateFrom as any));
    if (input.dateTo) srConds.push(lte(salesReturns.date, input.dateTo as any));
    const srRows = await db.select().from(salesReturns).where(tenantWhere(salesReturns, ctx.tenantId, and(...srConds))).orderBy(salesReturns.date);
    const totalInvoices = siRows.reduce((s, r) => s + parseFloat(r.total || "0"), 0);
    const totalPaid = siRows.reduce((s, r) => s + parseFloat(r.paid || "0"), 0);
    const totalRemaining = siRows.reduce((s, r) => s + parseFloat(r.remaining || "0"), 0);
    const totalReturns = srRows.reduce((s, r) => s + parseFloat(r.total || "0"), 0);
    return { customer, invoices: siRows, cashTransactions: ctRows, bankTransactions: btRows, returns: srRows, summary: { totalInvoices, totalPaid, totalRemaining, totalReturns } };
  }),
  supplier: protectedProcedure.input(z.object({
    supplierId: z.number(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [supplier] = await db.select().from(suppliers).where(tenantWhere(suppliers, ctx.tenantId, eq(suppliers.id, input.supplierId)));
    let piConds: any[] = [tenantWhere(purchaseInvoices, ctx.tenantId, eq(purchaseInvoices.supplierId, input.supplierId))];
    if (input.dateFrom) piConds.push(gte(purchaseInvoices.date, input.dateFrom as any));
    if (input.dateTo) piConds.push(lte(purchaseInvoices.date, input.dateTo as any));
    const piRows = await db.select({
      id: purchaseInvoices.id, number: purchaseInvoices.number, date: purchaseInvoices.date,
      total: purchaseInvoices.total, paid: purchaseInvoices.paid, remaining: purchaseInvoices.remaining,
      status: purchaseInvoices.status, paymentType: purchaseInvoices.paymentType,
    }).from(purchaseInvoices).where(tenantWhere(purchaseInvoices, ctx.tenantId, and(...piConds))).orderBy(purchaseInvoices.date);
    let ctConds: any[] = [tenantWhere(cashTransactions, ctx.tenantId, eq(cashTransactions.supplierId, input.supplierId))];
    if (input.dateFrom) ctConds.push(gte(cashTransactions.date, input.dateFrom as any));
    if (input.dateTo) ctConds.push(lte(cashTransactions.date, input.dateTo as any));
    const ctRows = await db.select().from(cashTransactions).where(tenantWhere(cashTransactions, ctx.tenantId, and(...ctConds))).orderBy(cashTransactions.date);
    // Bank transactions for this supplier
    let btConds: any[] = [tenantWhere(bankTransactions, ctx.tenantId, eq(bankTransactions.supplierId, input.supplierId))];
    if (input.dateFrom) btConds.push(gte(bankTransactions.date, input.dateFrom as any));
    if (input.dateTo) btConds.push(lte(bankTransactions.date, input.dateTo as any));
    const btRows = await db.select().from(bankTransactions).where(tenantWhere(bankTransactions, ctx.tenantId, and(...btConds))).orderBy(bankTransactions.date);
    let prConds: any[] = [tenantWhere(purchaseReturns, ctx.tenantId, eq(purchaseReturns.supplierId, input.supplierId))];
    if (input.dateFrom) prConds.push(gte(purchaseReturns.date, input.dateFrom as any));
    if (input.dateTo) prConds.push(lte(purchaseReturns.date, input.dateTo as any));
    const prRows = await db.select().from(purchaseReturns).where(tenantWhere(purchaseReturns, ctx.tenantId, and(...prConds))).orderBy(purchaseReturns.date);
    const totalInvoices = piRows.reduce((s, r) => s + parseFloat(r.total || "0"), 0);
    const totalPaid = piRows.reduce((s, r) => s + parseFloat(r.paid || "0"), 0);
    const totalRemaining = piRows.reduce((s, r) => s + parseFloat(r.remaining || "0"), 0);
    const totalReturns = prRows.reduce((s, r) => s + parseFloat(r.total || "0"), 0);
    return { supplier, invoices: piRows, cashTransactions: ctRows, bankTransactions: btRows, returns: prRows, summary: { totalInvoices, totalPaid, totalRemaining, totalReturns } };
  }),
});

// ===================== SAAS AUTH ROUTER =====================
const saasRouter = router({
  // تسجيل الدخول
  login: publicProcedure.input(z.object({
    email: z.string().email(),
    password: z.string().min(6),
    tenantSlug: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const user = await getAppUserByEmail(input.email);
    if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
    if (!user.isActive) throw new TRPCError({ code: "FORBIDDEN", message: "الحساب موقوف، تواصل مع الإدارة" });
    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });

    if (input.tenantSlug && user.role !== "superadmin") {
      const { getTenantBySlug } = await import("./tenant");
      const tenant = await getTenantBySlug(input.tenantSlug);
      if (!tenant || tenant.id !== user.tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "هذا الحساب غير مرتبط بهذه الشركة" });
      }
    }

    if (user.role !== "superadmin") {
      const active = await isSubscriptionActive(user.id);
      if (!active) throw new TRPCError({ code: "FORBIDDEN", message: "انتهى اشتراكك، تواصل مع الإدارة لتجديده" });
    }

    let tenantSlug = input.tenantSlug ?? null;
    if (!tenantSlug && user.tenantId) {
      const { getTenantById } = await import("./tenant");
      const tenant = await getTenantById(user.tenantId);
      tenantSlug = tenant?.slug ?? null;
    }

    const token = await signSaasToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      tenantSlug,
    });
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.cookie(SAAS_COOKIE_NAME, token, { ...cookieOptions, maxAge: 365 * 24 * 60 * 60 * 1000 });
    const db = await getDb();
    if (db) await db.update(appUsers).set({ lastLoginAt: new Date() }).where(eq(appUsers.id, user.id));
    return {
      success: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, companyName: user.companyName },
      tenantSlug,
    };
  }),

  // تسجيل الخروج
  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(SAAS_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true };
  }),

  // الحصول على المستخدم الحالي
  me: publicProcedure.query(async ({ ctx }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const token = match?.[1];
    const session = await verifySaasToken(token);
    if (!session) return null;
    const user = await getAppUserById(session.userId);
    if (!user || !user.isActive) return null;
    const sub = await getUserActiveSubscription(user.id);
    // Also fetch latest subscription (even expired) for display
    const db = await getDb();
    let latestSub = sub;
    if (!sub && db) {
      const [expired] = await db.select({
        id: subscriptions.id,
        status: subscriptions.status,
        startDate: subscriptions.startDate,
        endDate: subscriptions.endDate,
        planId: subscriptions.planId,
        planName: subscriptionPlans.nameAr,
        maxUsers: subscriptionPlans.maxUsers,
        maxInvoices: subscriptionPlans.maxInvoices,
      }).from(subscriptions)
        .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
        .where(eq(subscriptions.userId, user.id))
        .orderBy(desc(subscriptions.endDate))
        .limit(1);
      latestSub = expired || null;
    }
    // Calculate days remaining
    let daysRemaining: number | null = null;
    if (sub?.endDate) {
      const end = new Date(sub.endDate);
      const now = new Date();
      daysRemaining = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }
    let tenantSlug = ctx.tenantSlug;
    if (!tenantSlug && user.tenantId) {
      const { getTenantById } = await import("./tenant");
      const tenant = await getTenantById(user.tenantId);
      tenantSlug = tenant?.slug ?? null;
    }
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyName: user.companyName,
      phone: user.phone,
      subscription: latestSub,
      hasActiveSubscription: Boolean(sub),
      daysRemaining,
      tenantSlug,
      tenantId: user.tenantId,
    };
  }),

  // فتح برنامج مشترك (سوبر أدمن)
  impersonateTenant: publicProcedure.input(z.object({ userId: z.number() })).mutation(async ({ ctx, input }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session || session.role !== "superadmin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح" });
    }
    const target = await getAppUserById(input.userId);
    if (!target?.tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "الشركة غير موجودة" });
    }
    const { getTenantById } = await import("./tenant");
    const tenant = await getTenantById(target.tenantId);
    if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "الشركة غير موجودة" });

    const token = await signSaasToken({
      userId: target.id,
      email: target.email,
      role: target.role,
      tenantId: target.tenantId,
      tenantSlug: tenant.slug,
      impersonatorId: session.userId,
    });
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.cookie(SAAS_COOKIE_NAME, token, { ...cookieOptions, maxAge: 365 * 24 * 60 * 60 * 1000 });
    return { redirectUrl: `/${tenant.slug}/`, tenantSlug: tenant.slug, companyName: tenant.name };
  }),

  // إنشاء حساب جديد
  register: publicProcedure.input(z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    companyName: z.string().min(2, "اسم الشركة مطلوب"),
    phone: z.string().optional(),
    couponCode: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const existing = await getAppUserByEmail(input.email);
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "البريد الإلكتروني مسجل مسبقاً" });
    const passwordHash = await hashPassword(input.password);
    const companyName = input.companyName.trim();
    const [result] = await db.insert(appUsers).values({
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash,
      role: "admin",
      companyName,
      phone: input.phone || null,
    });
    const userId = (result as any).insertId;
    const { createTenantForOwner } = await import("./tenant");
    const { tenantId, slug } = await createTenantForOwner({ name: input.name, companyName, ownerUserId: userId });
    // التحقق من الكوبون إن وجد
    let couponId: number | null = null;
    if (input.couponCode) {
      const today = new Date().toISOString().split("T")[0];
      const [coupon] = await db.select().from(discountCoupons)
        .where(and(
          eq(discountCoupons.code, input.couponCode.toUpperCase()),
          eq(discountCoupons.isActive, true)
        ));
      if (coupon && (!coupon.expiresAt || coupon.expiresAt >= (today as any)) && (coupon.maxUses === null || coupon.usedCount < coupon.maxUses)) {
        couponId = coupon.id;
        await db.update(discountCoupons).set({ usedCount: coupon.usedCount + 1 }).where(eq(discountCoupons.id, coupon.id));
      }
    }
    // إنشاء اشتراك تجريبي 14 يوم (أو أكثر مع كوبون)
    const [trialPlan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.name, "trial")).limit(1);
    const planId = trialPlan?.id || 1;
    const startDate = new Date().toISOString().split("T")[0];
    // كوبون نسبة يمدد التجربة بنسبة مئوية
    const trialDays = couponId ? 14 : 14; // يمكن توسيع لاحقاً
    const endDate = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    await db.insert(subscriptions).values({
      tenantId,
      userId,
      planId,
      status: "trial",
      startDate: startDate as any,
      endDate: endDate as any,
    });
    const msg = couponId ? `تم إنشاء الحساب بنجاح مع تطبيق كود الخصم بنجاح!` : `تم إنشاء الحساب بنجاح، لديك 14 يوم تجريبي`;
    // إشعار المالك بالتسجيل الجديد
    try {
      const { notifyOwner } = await import("./_core/notification");
      await notifyOwner({
        title: `مستخدم جديد: ${input.name}`,
        content: `انضم مستخدم جديد إلى Easy Cash\nالاسم: ${input.name}\nالبريد: ${input.email}\nالشركة: ${input.companyName || 'غير محدد'}\nالتاريخ: ${new Date().toLocaleDateString('ar-EG')}`,
      });
    } catch { /* لا نوقف التسجيل إذا فشل الإشعار */ }
    return {
      success: true,
      message: msg,
      tenantSlug: slug,
      loginUrl: `/${slug}/login`,
    };
  }),

  // ===================== SUPER ADMIN PROCEDURES =====================
  // قائمة جميع المستخدمين
  listUsers: publicProcedure.input(z.object({
    page: z.number().default(1),
    limit: z.number().default(20),
    search: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    // Verify superadmin
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session || session.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    const rows = await db.select({
      id: appUsers.id,
      name: appUsers.name,
      email: appUsers.email,
      role: appUsers.role,
      isActive: appUsers.isActive,
      companyName: appUsers.companyName,
      phone: appUsers.phone,
      tenantId: appUsers.tenantId,
      createdAt: appUsers.createdAt,
      lastLoginAt: appUsers.lastLoginAt,
      tenantSlug: tenants.slug,
      tenantName: tenants.name,
    })
      .from(appUsers)
      .leftJoin(tenants, eq(appUsers.tenantId, tenants.id))
      .where(and(sql`${appUsers.role} != 'superadmin'`, isNull(appUsers.ownerUserId)))
      .orderBy(desc(appUsers.createdAt))
      .limit(input.limit)
      .offset(offset);
    const [total] = await db.select({ count: count() }).from(appUsers)
      .where(and(sql`${appUsers.role} != 'superadmin'`, isNull(appUsers.ownerUserId)));
    return { rows, total: total.count };
  }),

  // تعديل مستخدم
  updateUser: publicProcedure.input(z.object({
    id: z.number(),
    name: z.string().optional(),
    email: z.string().email("بريد إلكتروني غير صالح").optional(),
    role: z.enum(["superadmin", "admin", "user"]).optional(),
    isActive: z.boolean().optional(),
    companyName: z.string().optional(),
    phone: z.string().optional(),
    newPassword: z.string().min(6).optional(),
  })).mutation(async ({ ctx, input }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session || session.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    if (input.email) {
      const existing = await getAppUserByEmail(input.email);
      if (existing && existing.id !== input.id) {
        throw new TRPCError({ code: "CONFLICT", message: "البريد الإلكتروني مستخدم بالفعل" });
      }
    }
    const updateData: any = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.email !== undefined) updateData.email = input.email;
    if (input.role !== undefined) updateData.role = input.role;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;
    if (input.companyName !== undefined) updateData.companyName = input.companyName;
    if (input.phone !== undefined) updateData.phone = input.phone;
    if (input.newPassword) updateData.passwordHash = await hashPassword(input.newPassword);
    await db.update(appUsers).set(updateData).where(eq(appUsers.id, input.id));
    return { success: true };
  }),

  // حذف مستخدم
  deleteUser: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session || session.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const user = await getAppUserById(input.id);
    if (user?.role === "superadmin") throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكن حذف حساب السوبر أدمن" });
    await db.delete(subscriptions).where(eq(subscriptions.userId, input.id));
    await db.delete(appUsers).where(eq(appUsers.id, input.id));
    return { success: true };
  }),

  // قائمة الاشتراكات
  listSubscriptions: publicProcedure.input(z.object({
    page: z.number().default(1),
    limit: z.number().default(20),
  })).query(async ({ ctx, input }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session || session.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    const rows = await db.select({
      id: subscriptions.id,
      status: subscriptions.status,
      startDate: subscriptions.startDate,
      endDate: subscriptions.endDate,
      notes: subscriptions.notes,
      createdAt: subscriptions.createdAt,
      userId: subscriptions.userId,
      planId: subscriptions.planId,
      userName: appUsers.name,
      userEmail: appUsers.email,
      planName: subscriptionPlans.nameAr,
      planPrice: subscriptionPlans.price,
    })
    .from(subscriptions)
    .leftJoin(appUsers, eq(subscriptions.userId, appUsers.id))
    .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
    .orderBy(desc(subscriptions.createdAt))
    .limit(input.limit).offset(offset);
    const [total] = await db.select({ count: count() }).from(subscriptions);
    return { rows, total: total.count };
  }),

  // إضافة/تعديل اشتراك
  upsertSubscription: publicProcedure.input(z.object({
    id: z.number().optional(),
    userId: z.number(),
    planId: z.number(),
    status: z.enum(["trial", "active", "expired", "cancelled", "suspended"]),
    startDate: z.string(),
    endDate: z.string(),
    notes: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session || session.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const data = {
      userId: input.userId,
      planId: input.planId,
      status: input.status,
      startDate: input.startDate as any,
      endDate: input.endDate as any,
      notes: input.notes || null,
    };
    if (input.id) {
      await db.update(subscriptions).set(data).where(eq(subscriptions.id, input.id));
    } else {
      await db.insert(subscriptions).values(data);
    }
    return { success: true };
  }),

  // قائمة الخطط
  listPlans: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(subscriptionPlans).orderBy(subscriptionPlans.price);
  }),

  // إضافة/تعديل خطة
  upsertPlan: publicProcedure.input(z.object({
    id: z.number().optional(),
    name: z.string(),
    nameAr: z.string(),
    price: z.string(),
    currency: z.string().default("EGP"),
    durationDays: z.number(),
    maxUsers: z.number().optional(),
    maxInvoices: z.number().optional(),
    features: z.string().optional(),
    isActive: z.boolean().default(true),
  })).mutation(async ({ ctx, input }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session || session.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const data = {
      name: input.name, nameAr: input.nameAr, price: input.price,
      currency: input.currency, durationDays: input.durationDays,
      maxUsers: input.maxUsers || 1, maxInvoices: input.maxInvoices || 100,
      features: input.features || null, isActive: input.isActive,
    };
    if (input.id) {
      await db.update(subscriptionPlans).set(data).where(eq(subscriptionPlans.id, input.id));
    } else {
      await db.insert(subscriptionPlans).values(data);
    }
    return { success: true };
  }),

  // حذف اشتراك
  deleteSubscription: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session || session.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(subscriptions).where(eq(subscriptions.id, input.id));
    return { success: true };
  }),

  // حذف خطة
  deletePlan: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session || session.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Check no active subscriptions use this plan
    const [inUse] = await db.select({ count: count() }).from(subscriptions).where(eq(subscriptions.planId, input.id));
    if (inUse.count > 0) throw new TRPCError({ code: "CONFLICT", message: "لا يمكن حذف خطة مرتبطة باشتراكات" });
    await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, input.id));
    return { success: true };
  }),

  // ===================== COUPON APIs =====================
  listCoupons: publicProcedure.query(async ({ ctx }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session || session.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(discountCoupons).orderBy(desc(discountCoupons.createdAt));
  }),

  createCoupon: publicProcedure.input(z.object({
    code: z.string().min(3).max(50).toUpperCase(),
    description: z.string().optional(),
    discountType: z.enum(["percentage", "fixed"]),
    discountValue: z.number().positive(),
    maxUses: z.number().positive().optional(),
    expiresAt: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session || session.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.insert(discountCoupons).values({
      code: input.code.toUpperCase(),
      description: input.description || null,
      discountType: input.discountType,
      discountValue: String(input.discountValue),
      maxUses: input.maxUses || null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    });
    return { success: true };
  }),

  updateCoupon: publicProcedure.input(z.object({
    id: z.number(),
    isActive: z.boolean().optional(),
    maxUses: z.number().positive().optional().nullable(),
    expiresAt: z.string().optional().nullable(),
    description: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session || session.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const upd: any = {};
    if (input.isActive !== undefined) upd.isActive = input.isActive;
    if (input.maxUses !== undefined) upd.maxUses = input.maxUses;
    if (input.expiresAt !== undefined) upd.expiresAt = input.expiresAt;
    if (input.description !== undefined) upd.description = input.description;
    await db.update(discountCoupons).set(upd).where(eq(discountCoupons.id, input.id));
    return { success: true };
  }),

  deleteCoupon: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session || session.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(discountCoupons).where(eq(discountCoupons.id, input.id));
    return { success: true };
  }),

  // التحقق من كوبون (للمستخدمين عند التسجيل)
  validateCoupon: publicProcedure.input(z.object({ code: z.string() })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return null;
    const today = new Date().toISOString().split("T")[0];
    const [coupon] = await db.select().from(discountCoupons)
      .where(and(
        eq(discountCoupons.code, input.code.toUpperCase()),
        eq(discountCoupons.isActive, true)
      ));
    if (!coupon) return null;
    if (coupon.expiresAt && coupon.expiresAt < (today as any)) return null;
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return null;
    return {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      description: coupon.description,
    };
  }),

  // ===================== COMPANY PROFILE APIs =====================
  getCompanyProfile: publicProcedure.query(async ({ ctx }) => {
    // Require valid SaaS session
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "غير مصرح" });
    const db = await getDb();
    if (!db) return null;
    const [profile] = await db.select().from(companyProfile).limit(1);
    return profile || null;
  }),

  saveCompanyProfile: publicProcedure.input(z.object({
    name: z.string().min(1),
    nameEn: z.string().optional(),
    logo: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    country: z.string().optional(),
    phone: z.string().optional(),
    phone2: z.string().optional(),
    email: z.string().optional(),
    website: z.string().optional(),
    taxNumber: z.string().optional(),
    commercialRegister: z.string().optional(),
    currency: z.string().optional(),
    invoiceFooter: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    // Require valid SaaS session
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "غير مصرح" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [existing] = await db.select({ id: companyProfile.id }).from(companyProfile).limit(1);
    if (existing) {
      await db.update(companyProfile).set(input).where(eq(companyProfile.id, existing.id));
    } else {
      await db.insert(companyProfile).values(input);
    }
    return { success: true };
  }),

  // ===================== SUBSCRIPTION REPORT =====================
  subscriptionReport: publicProcedure.query(async ({ ctx }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session || session.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Monthly new subscriptions (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    const allSubs = await db.select({
      id: subscriptions.id,
      status: subscriptions.status,
      startDate: subscriptions.startDate,
      endDate: subscriptions.endDate,
      planId: subscriptions.planId,
      planName: subscriptionPlans.nameAr,
      price: subscriptionPlans.price,
    }).from(subscriptions)
      .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id));
    // Group by month
    const monthlyMap: Record<string, { month: string; count: number; revenue: number }> = {};
    for (const sub of allSubs) {
      const d = new Date(sub.startDate);
      if (d < sixMonthsAgo) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthlyMap[key]) monthlyMap[key] = { month: key, count: 0, revenue: 0 };
      monthlyMap[key].count++;
      monthlyMap[key].revenue += parseFloat(sub.price || "0");
    }
    const monthly = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));
    // By plan
    const planMap: Record<string, { name: string; count: number; revenue: number }> = {};
    for (const sub of allSubs) {
      const key = sub.planName || "غير محدد";
      if (!planMap[key]) planMap[key] = { name: key, count: 0, revenue: 0 };
      planMap[key].count++;
      planMap[key].revenue += parseFloat(sub.price || "0");
    }
    const byPlan = Object.values(planMap);
    // Status breakdown
    const today = new Date().toISOString().split("T")[0];
    const statusMap: Record<string, number> = {};
    for (const sub of allSubs) {
      const isExpired = sub.endDate < (today as any) && sub.status !== "cancelled";
      const status = isExpired ? "expired" : sub.status;
      statusMap[status] = (statusMap[status] || 0) + 1;
    }
    const totalRevenue = allSubs.reduce((s, sub) => s + parseFloat(sub.price || "0"), 0);
    return { monthly, byPlan, statusBreakdown: statusMap, totalRevenue, totalSubscriptions: allSubs.length };
  }),

  // إحصائيات السوبر أدمن
  adminStats: publicProcedure.query(async ({ ctx }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session || session.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [totalUsers] = await db.select({ count: count() }).from(appUsers);
    const [activeUsers] = await db.select({ count: count() }).from(appUsers).where(eq(appUsers.isActive, true));
    const today = new Date().toISOString().split("T")[0];
    const [activeSubs] = await db.select({ count: count() }).from(subscriptions)
      .where(and(gte(subscriptions.endDate, today as any), eq(subscriptions.status, "active")));
    const [trialSubs] = await db.select({ count: count() }).from(subscriptions)
      .where(and(gte(subscriptions.endDate, today as any), eq(subscriptions.status, "trial")));
    const [totalPlans] = await db.select({ count: count() }).from(subscriptionPlans);
    const [openTickets] = await db.select({ count: count() }).from(supportTickets).where(eq(supportTickets.status, "open"));
    return {
      totalUsers: totalUsers.count,
      activeUsers: activeUsers.count,
      activeSubscriptions: activeSubs.count,
      trialSubscriptions: trialSubs.count,
      totalPlans: totalPlans.count,
      openTickets: openTickets.count,
    };
  }),

  // ===================== SUPPORT TICKETS =====================
  // إرسال تذكرة دعم (من المستخدم)
  createTicket: publicProcedure.input(z.object({
    subject: z.string().min(5),
    message: z.string().min(10),
    priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  })).mutation(async ({ ctx, input }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // جلب اسم المستخدم من قاعدة البيانات
    const [user] = await db.select({ name: appUsers.name }).from(appUsers).where(eq(appUsers.id, session.userId));
    await db.insert(supportTickets).values({
      userId: session.userId,
      userName: user?.name || session.email,
      userEmail: session.email,
      subject: input.subject,
      message: input.message,
      priority: input.priority,
      status: "open",
    });
    return { success: true, message: "تم إرسال طلب الدعم بنجاح" };
  }),

  // جلب تذاكر المستخدم الحالي
  myTickets: publicProcedure.query(async ({ ctx }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(supportTickets)
      .where(eq(supportTickets.userId, session.userId))
      .orderBy(desc(supportTickets.createdAt));
  }),

  // جلب جميع التذاكر (سوبر أدمن)
  listTickets: publicProcedure.input(z.object({
    status: z.enum(["open", "in_progress", "resolved", "closed", "all"]).default("all"),
    page: z.number().default(1),
    limit: z.number().default(20),
  })).query(async ({ ctx, input }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session || session.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    let q = db.select().from(supportTickets);
    if (input.status !== "all") {
      q = q.where(eq(supportTickets.status, input.status as any)) as any;
    }
    const rows = await (q as any).orderBy(desc(supportTickets.createdAt)).limit(input.limit).offset(offset);
    const [total] = await db.select({ count: count() }).from(supportTickets);
    return { rows, total: total.count };
  }),

  // تصدير جميع الاشتراكات (بدون pagination)
  exportAllSubscriptions: publicProcedure.query(async ({ ctx }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session || session.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const rows = await db.select({
      id: subscriptions.id,
      status: subscriptions.status,
      startDate: subscriptions.startDate,
      endDate: subscriptions.endDate,
      notes: subscriptions.notes,
      createdAt: subscriptions.createdAt,
      userId: subscriptions.userId,
      planId: subscriptions.planId,
      userName: appUsers.name,
      userEmail: appUsers.email,
      planNameAr: subscriptionPlans.nameAr,
      price: subscriptionPlans.price,
    })
    .from(subscriptions)
    .leftJoin(appUsers, eq(subscriptions.userId, appUsers.id))
    .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
    .orderBy(desc(subscriptions.createdAt));
    return rows;
  }),

  // رد السوبر أدمن على تذكرة
  replyTicket: publicProcedure.input(z.object({
    id: z.number(),
    adminReply: z.string().min(1),
    status: z.enum(["open", "in_progress", "resolved", "closed"]),
  })).mutation(async ({ ctx, input }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session || session.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(supportTickets).set({
      adminReply: input.adminReply,
      status: input.status,
      repliedAt: new Date(),
    }).where(eq(supportTickets.id, input.id));
    // إضافة إشعار داخلي لصاحب التذكرة
    const [ticket] = await db.select({ userId: supportTickets.userId }).from(supportTickets).where(eq(supportTickets.id, input.id));
    if (ticket?.userId) {
      await db.insert(userNotifications).values({
        userId: ticket.userId,
        type: "info",
        title: "رد على طلب الدعم",
        message: `تم الرد على طلب دعمك: ${input.adminReply.substring(0, 100)}...`,
      });
    }
    return { success: true };
  }),

  // ===================== USER NOTIFICATIONS =====================
  getMyNotifications: publicProcedure.query(async ({ ctx }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });
    const db = await getDb();
    if (!db) return [];
    return db.select().from(userNotifications)
      .where(eq(userNotifications.userId, session.userId))
      .orderBy(desc(userNotifications.createdAt))
      .limit(20);
  }),

  markNotificationRead: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });
    const db = await getDb();
    if (!db) return;
    await db.update(userNotifications).set({ isRead: true })
      .where(and(eq(userNotifications.id, input.id), eq(userNotifications.userId, session.userId)));
    return { success: true };
  }),

  markAllNotificationsRead: publicProcedure.mutation(async ({ ctx }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });
    const db = await getDb();
    if (!db) return;
    await db.update(userNotifications).set({ isRead: true })
      .where(eq(userNotifications.userId, session.userId));
    return { success: true };
  }),

  // ===================== PUBLIC PLANS =====================
  listPublicPlans: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.isActive, true))
      .orderBy(subscriptionPlans.price);
  }),

  // ===================== PAYMOB SETTINGS (SUPER ADMIN) =====================
  getPaymobSettings: publicProcedure.query(async ({ ctx }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session || session.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(paymobSettings).limit(1);
    if (!row) {
      return {
        configured: false,
        mode: "test" as const,
        isEnabled: false,
        publicKey: "",
        publicKeyLast8: "",
        cardIntegrationId: null as number | null,
        currency: "EGP",
        hasSecretKey: false,
        hasHmacSecret: false,
        webhookUrl: "",
        returnUrl: "",
      };
    }
    let publicConfig: Record<string, unknown> = {};
    try {
      publicConfig = row.publicConfig ? JSON.parse(row.publicConfig) : {};
    } catch { /* ignore */ }
    const secret = row.encryptedSecret ? (await import("./paymob")).decodeSecret<{ secretKey?: string; hmacSecret?: string }>(row.encryptedSecret) : null;
    const { absoluteUrl } = await import("./paymob");
    return {
      configured: true,
      mode: row.mode,
      isEnabled: row.isEnabled,
      publicKey: String(publicConfig.publicKey || ""),
      publicKeyLast8: String(publicConfig.publicKeyLast8 || ""),
      cardIntegrationId: publicConfig.cardIntegrationId ? Number(publicConfig.cardIntegrationId) : null,
      currency: String(publicConfig.currency || "EGP"),
      hasSecretKey: Boolean(secret?.secretKey),
      hasHmacSecret: Boolean(secret?.hmacSecret),
      webhookUrl: absoluteUrl(ctx.req, "/api/webhooks/paymob"),
      returnUrl: absoluteUrl(ctx.req, "/pricing?payment=return"),
      updatedAt: row.updatedAt,
    };
  }),

  savePaymobSettings: publicProcedure.input(z.object({
    mode: z.enum(["test", "live"]).default("test"),
    publicKey: z.string().min(8).optional(),
    secretKey: z.string().min(8).optional(),
    hmacSecret: z.string().optional(),
    cardIntegrationId: z.coerce.number().int().positive().optional(),
    currency: z.string().min(3).max(3).default("EGP"),
    isEnabled: z.boolean().default(false),
  })).mutation(async ({ ctx, input }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session || session.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const {
      encodeSecret, decodeSecret, assertPaymobPublicKey,
    } = await import("./paymob");

    const [existing] = await db.select().from(paymobSettings).limit(1);
    if ((!input.publicKey || !input.secretKey || !input.cardIntegrationId) && !existing) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Public Key و Secret Key و Card Integration ID مطلوبة في أول حفظ",
      });
    }

    let existingConfig: Record<string, unknown> = {};
    let existingSecret: { secretKey?: string; hmacSecret?: string } | null = null;
    if (existing) {
      try {
        existingConfig = existing.publicConfig ? JSON.parse(existing.publicConfig) : {};
      } catch { /* ignore */ }
      if (existing.encryptedSecret) {
        existingSecret = decodeSecret(existing.encryptedSecret);
      }
    }

    const publicKey = input.publicKey ?? String(existingConfig.publicKey ?? "");
    const cardIntegrationId = input.cardIntegrationId ?? Number(existingConfig.cardIntegrationId ?? 0);
    assertPaymobPublicKey(publicKey);

    const publicConfig = {
      publicKey,
      publicKeyLast8: publicKey.slice(-8),
      cardIntegrationId,
      currency: input.currency.toUpperCase(),
    };

    const encryptedSecret = encodeSecret({
      secretKey: input.secretKey ?? existingSecret?.secretKey ?? "",
      hmacSecret: input.hmacSecret ?? existingSecret?.hmacSecret ?? "",
    });

    if (existing) {
      await db.update(paymobSettings).set({
        mode: input.mode,
        publicConfig: JSON.stringify(publicConfig),
        encryptedSecret,
        isEnabled: input.isEnabled,
      }).where(eq(paymobSettings.id, existing.id));
    } else {
      await db.insert(paymobSettings).values({
        mode: input.mode,
        publicConfig: JSON.stringify(publicConfig),
        encryptedSecret,
        isEnabled: input.isEnabled,
      });
    }

    return { success: true };
  }),

  testPaymobConnection: publicProcedure.mutation(async ({ ctx }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session || session.role !== "superadmin") throw new TRPCError({ code: "FORBIDDEN", message: "غير مصرح" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const { decodeSecret, assertPaymobPublicKey, paymobErrorMessage } = await import("./paymob");
    const [row] = await db.select().from(paymobSettings).limit(1);
    if (!row?.encryptedSecret) {
      throw new TRPCError({ code: "NOT_FOUND", message: "إعدادات Paymob غير موجودة" });
    }

    const publicConfig = JSON.parse(row.publicConfig || "{}") as { publicKey: string; cardIntegrationId: number; currency?: string };
    const secret = decodeSecret<{ secretKey: string }>(row.encryptedSecret);
    assertPaymobPublicKey(publicConfig.publicKey);

    const response = await fetch("https://accept.paymob.com/v1/intention/", {
      method: "POST",
      headers: { Authorization: `Token ${secret.secretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: 100,
        currency: publicConfig.currency || "EGP",
        payment_methods: [Number(publicConfig.cardIntegrationId)],
        items: [{ name: "Easy Cash test", amount: 100, description: "Connection test", quantity: 1 }],
        billing_data: {
          first_name: "Easy", last_name: "Cash", phone_number: "01000000000",
          email: "test@easycash.app", country: "EG", city: "Cairo",
          street: "NA", building: "NA", apartment: "NA", floor: "NA",
        },
        special_reference: `easy-cash-test-${Date.now()}`,
        expiration: 600,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: (data as { message?: string }).message || paymobErrorMessage(data),
      });
    }
    return { ok: true, intentionId: (data as { id?: string }).id, hasClientSecret: Boolean((data as { client_secret?: string }).client_secret) };
  }),

  // ===================== PLAN CHECKOUT =====================
  createPlanCheckout: publicProcedure.input(z.object({
    planId: z.number().optional(),
    planName: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "يجب تسجيل الدخول أولاً" });

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [gateway] = await db.select().from(paymobSettings).where(eq(paymobSettings.isEnabled, true)).limit(1);
    if (!gateway?.encryptedSecret) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "بوابة Paymob غير مفعّلة. تواصل مع الإدارة." });
    }

    let plan;
    if (input.planId) {
      [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, input.planId)).limit(1);
    } else if (input.planName) {
      [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.name, input.planName)).limit(1);
    }
    if (!plan || !plan.isActive) {
      throw new TRPCError({ code: "NOT_FOUND", message: "الخطة غير موجودة" });
    }
    if (Number(plan.price) <= 0 || plan.name === "trial") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "هذه الخطة مجانية — سجّل حساباً جديداً" });
    }

    const user = await getAppUserById(session.userId);
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "المستخدم غير موجود" });

    const {
      decodeSecret, assertPaymobPublicKey, paymobCheckoutUrl, paymobErrorMessage,
      splitName, absoluteUrl, amountToCents,
    } = await import("./paymob");

    const publicConfig = JSON.parse(gateway.publicConfig || "{}") as { publicKey: string; cardIntegrationId: number; currency?: string };
    const secret = decodeSecret<{ secretKey: string }>(gateway.encryptedSecret);
    assertPaymobPublicKey(publicConfig.publicKey);

    const amountCents = amountToCents(plan.price);
    const [paymentResult] = await db.insert(subscriptionPayments).values({
      userId: session.userId,
      planId: plan.id,
      amount: plan.price,
      currency: publicConfig.currency || plan.currency || "EGP",
      status: "pending",
    });
    const paymentId = (paymentResult as { insertId: number }).insertId;
    const paymentReference = `easy_cash_payment:${paymentId}`;
    const customerName = splitName(user.name || "Customer");

    const intentionResponse = await fetch("https://accept.paymob.com/v1/intention/", {
      method: "POST",
      headers: { Authorization: `Token ${secret.secretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amountCents,
        currency: publicConfig.currency || "EGP",
        payment_methods: [Number(publicConfig.cardIntegrationId)],
        items: [{
          name: `Easy Cash ${plan.nameAr}`.slice(0, 50),
          amount: amountCents,
          description: `اشتراك ${plan.nameAr}`,
          quantity: 1,
        }],
        billing_data: {
          first_name: customerName.firstName,
          last_name: customerName.lastName,
          phone_number: user.phone || "01000000000",
          email: user.email,
          country: "EG",
          city: "Cairo",
          street: "NA",
          building: "NA",
          apartment: "NA",
          floor: "NA",
        },
        special_reference: paymentReference,
        notification_url: absoluteUrl(ctx.req, "/api/webhooks/paymob"),
        redirection_url: absoluteUrl(ctx.req, `/pricing?payment=return&paymentId=${paymentId}`),
        expiration: 3600,
      }),
    });

    const intention = await intentionResponse.json().catch(() => ({}));
    if (!intentionResponse.ok || !(intention as { client_secret?: string }).client_secret) {
      await db.update(subscriptionPayments).set({ status: "failed" }).where(eq(subscriptionPayments.id, paymentId));
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: paymobErrorMessage(intention),
      });
    }

    const intentionId = String((intention as { id?: string; intention_order_id?: string }).id || (intention as { intention_order_id?: string }).intention_order_id || "");
    await db.update(subscriptionPayments).set({ providerReference: intentionId }).where(eq(subscriptionPayments.id, paymentId));

    const checkoutUrl = paymobCheckoutUrl(publicConfig.publicKey, (intention as { client_secret: string }).client_secret);
    return { checkoutUrl, paymentId, planName: plan.nameAr, amount: plan.price };
  }),

  getPaymentStatus: publicProcedure.input(z.object({ paymentId: z.number() })).query(async ({ ctx, input }) => {
    const cookies = ctx.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const session = await verifySaasToken(match?.[1]);
    if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [payment] = await db.select().from(subscriptionPayments)
      .where(and(eq(subscriptionPayments.id, input.paymentId), eq(subscriptionPayments.userId, session.userId)))
      .limit(1);
    if (!payment) throw new TRPCError({ code: "NOT_FOUND" });
    return { status: payment.status, paymentId: payment.id };
  }),
});

// ===================== MAIN ROUTER =====================
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  dashboard: dashboardRouter,
  customers: customersRouter,
  suppliers: suppliersRouter,
  contactCategories: contactCategoriesRouter,
  items: itemsRouter,
  warehouses: warehousesRouter,
  purchases: purchasesRouter,
  sales: salesRouter,
  hr: hrRouter,
  accounts: accountsRouter,
  cash: cashRouter,
  bank: bankRouter,
  reports: reportsRouter,
  notifications: notificationsRouter,
  assets: assetsRouter,
  loans: loansRouter,
  costCenters: costCentersRouter,
  salesReps: salesRepsRouter,
  settings: settingsRouter,
  inventory: inventoryRouter,
  production: productionRouter,
  statement: statementRouter,
  saas: saasRouter,
});

export type AppRouter = typeof appRouter;
