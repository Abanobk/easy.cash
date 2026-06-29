import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock authenticated context
function createMockContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "test",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("ERP System - Auth", () => {
  it("returns current user from auth.me", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user).toBeDefined();
    expect(user?.email).toBe("test@example.com");
  });

  it("logout clears session cookie", async () => {
    const clearedCookies: string[] = [];
    const ctx = createMockContext();
    ctx.res.clearCookie = (name: string) => { clearedCookies.push(name); };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
    expect(clearedCookies.length).toBeGreaterThan(0);
  });
});

describe("ERP System - Dashboard", () => {
  it("returns dashboard stats", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const stats = await caller.dashboard.stats();
    expect(stats).toBeDefined();
    expect(typeof stats.totalSales).toBe("number");
    expect(typeof stats.unpaidInvoices).toBe("number");
  });
});

describe("ERP System - Customers", () => {
  it("returns paginated customers list", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.customers.list({ page: 1, limit: 10 });
    expect(result).toBeDefined();
    expect(Array.isArray(result.rows)).toBe(true);
    expect(typeof result.total).toBe("number");
  });
});

describe("ERP System - Items", () => {
  it("returns paginated items list", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.items.list({ page: 1, limit: 10 });
    expect(result).toBeDefined();
    expect(Array.isArray(result.rows)).toBe(true);
  });
});

describe("ERP System - Reports", () => {
  it("returns inventory report", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.reports.inventory();
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns balance sheet", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.reports.balanceSheet();
    expect(result).toBeDefined();
    expect(Array.isArray(result.assets)).toBe(true);
    expect(Array.isArray(result.liabilities)).toBe(true);
  });

  it("returns income statement", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.reports.incomeStatement();
    expect(result).toBeDefined();
    expect(typeof result.revenue).toBe("number");
    expect(typeof result.netProfit).toBe("number");
  });
});

describe("ERP System - Accounts", () => {
  it("returns chart of accounts", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.accounts.chart();
    expect(Array.isArray(result)).toBe(true);
  });
});
