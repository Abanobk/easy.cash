#!/usr/bin/env python3
from pathlib import Path
import re

file_path = Path(__file__).parent.parent / "server" / "routers.ts"
content = file_path.read_text()
SAAS = "// ===================== SAAS AUTH ROUTER ====================="
idx = content.index(SAAS)
erp, saas = content[:idx], content[idx:]

stats = {"ctx": 0, "where": 0}

# 1. Add ctx to all ERP handlers
def add_ctx(m):
    stats["ctx"] += 1
    return m.group(0).replace("async () =>", "async ({ ctx }) =>")
erp = re.sub(r"protectedProcedure(?:\.[^(]+)*\)\.(?:query|mutation)\(async \(\) =>", add_ctx, erp)

def add_ctx_input(m):
    if "ctx" in m.group(0):
        return m.group(0)
    stats["ctx"] += 1
    return m.group(0).replace("{ input }", "{ ctx, input }")
erp = re.sub(r"protectedProcedure(?:\.[^(]+)*\)\.(?:query|mutation)\(async \(\{ input \}\) =>", add_ctx_input, erp)
erp = erp.replace("async ({ input, ctx }) =>", "async ({ ctx, input }) =>")

# 2. Dashboard stats remaining where clauses
repls = [
    (".from(salesInvoices)\n      .where(eq(salesInvoices.status, \"confirmed\"))",
     ".from(salesInvoices)\n      .where(tenantWhere(salesInvoices, ctx.tenantId, eq(salesInvoices.status, \"confirmed\")))"),
    (".from(purchaseInvoices)\n      .where(eq(purchaseInvoices.status, \"confirmed\"))",
     ".from(purchaseInvoices)\n      .where(tenantWhere(purchaseInvoices, ctx.tenantId, eq(purchaseInvoices.status, \"confirmed\")))"),
    (".from(salesInvoices)\n      .where(or(eq(salesInvoices.status, \"confirmed\"), eq(salesInvoices.status, \"partial\")))",
     ".from(salesInvoices)\n      .where(tenantWhere(salesInvoices, ctx.tenantId, or(eq(salesInvoices.status, \"confirmed\"), eq(salesInvoices.status, \"partial\"))))"),
    (".from(checks)\n      .where(eq(checks.status, \"pending\"))",
     ".from(checks)\n      .where(tenantWhere(checks, ctx.tenantId, eq(checks.status, \"pending\")))"),
    (").from(salesInvoices)\n      .leftJoin(customers, eq(salesInvoices.customerId, customers.id))\n      .orderBy(desc(salesInvoices.createdAt))",
     ").from(salesInvoices)\n      .where(tenantWhere(salesInvoices, ctx.tenantId))\n      .leftJoin(customers, eq(salesInvoices.customerId, customers.id))\n      .orderBy(desc(salesInvoices.createdAt))"),
    (").from(purchaseInvoices)\n      .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))\n      .orderBy(desc(purchaseInvoices.createdAt))",
     ").from(purchaseInvoices)\n      .where(tenantWhere(purchaseInvoices, ctx.tenantId))\n      .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))\n      .orderBy(desc(purchaseInvoices.createdAt))"),
]
for old, new in repls:
    if old in erp:
        erp = erp.replace(old, new)
        stats["where"] += 1

# monthlyCharts and() where - wrap tenant
erp = erp.replace(
    """}).from(salesInvoices)
      .where(and(
        eq(salesInvoices.status, "confirmed"),
        gte(salesInvoices.createdAt, new Date(now.getFullYear(), now.getMonth() - 5, 1))
      ))""",
    """}).from(salesInvoices)
      .where(tenantWhere(salesInvoices, ctx.tenantId, and(
        eq(salesInvoices.status, "confirmed"),
        gte(salesInvoices.createdAt, new Date(now.getFullYear(), now.getMonth() - 5, 1))
      )))""",
)
erp = erp.replace(
    """}).from(purchaseInvoices)
      .where(and(
        eq(purchaseInvoices.status, "confirmed"),
        gte(purchaseInvoices.createdAt, new Date(now.getFullYear(), now.getMonth() - 5, 1))
      ))""",
    """}).from(purchaseInvoices)
      .where(tenantWhere(purchaseInvoices, ctx.tenantId, and(
        eq(purchaseInvoices.status, "confirmed"),
        gte(purchaseInvoices.createdAt, new Date(now.getFullYear(), now.getMonth() - 5, 1))
      )))""",
)

# Fix missing closing parens on tenantWhere status lines
erp = re.sub(
    r"where\(tenantWhere\(salesInvoices, ctx\.tenantId, or\(([^)]+)\)\);",
    r"where(tenantWhere(salesInvoices, ctx.tenantId, or(\1))));",
    erp,
)
erp = re.sub(
    r"where\(tenantWhere\(salesInvoices, ctx\.tenantId, eq\(salesInvoices\.status, \"(\w+)\"\)\);",
    r"where(tenantWhere(salesInvoices, ctx.tenantId, eq(salesInvoices.status, \"\1\")));",
    erp,
)

# invoice items by invoice id - add tenant
erp = erp.replace(
    ".where(eq(purchaseInvoiceItems.invoiceId, input));",
    ".where(tenantWhere(purchaseInvoiceItems, ctx.tenantId, eq(purchaseInvoiceItems.invoiceId, input)));",
)
erp = erp.replace(
    ".where(eq(salesInvoiceItems.invoiceId, input));",
    ".where(tenantWhere(salesInvoiceItems, ctx.tenantId, eq(salesInvoiceItems.invoiceId, input)));",
)

# purchase/sales list joins without where
for table, join in [
    ("purchaseInvoices", "suppliers"),
    ("purchaseOrders", "suppliers"),
    ("purchaseReturns", "suppliers"),
    ("salesInvoices", "customers"),
    ("salesOrders", "customers"),
    ("salesReturns", "customers"),
]:
    old = f").from({table})\n        .leftJoin({join},"
    new = f").from({table})\n        .where(tenantWhere({table}, ctx.tenantId))\n        .leftJoin({join},"
    if old in erp and new not in erp:
        erp = erp.replace(old, new)
        stats["where"] += 1

# employees join list
old = ").from(employees)\n        .leftJoin(departments,"
new = ").from(employees)\n        .where(tenantWhere(employees, ctx.tenantId))\n        .leftJoin(departments,"
if old in erp:
    erp = erp.replace(old, new)

# attendance join list
old = ").from(attendance)\n        .leftJoin(employees,"
new = ").from(attendance)\n        .where(tenantWhere(attendance, ctx.tenantId))\n        .leftJoin(employees,"
if old in erp:
    erp = erp.replace(old, new)

# salaryAdvances join
old = ").from(salaryAdvances)\n        .leftJoin(employees,"
new = ").from(salaryAdvances)\n        .where(tenantWhere(salaryAdvances, ctx.tenantId))\n        .leftJoin(employees,"
if old in erp:
    erp = erp.replace(old, new)

# payroll join - has where(and) already
old = """}).from(payroll)
        .leftJoin(employees, eq(payroll.employeeId, employees.id))
        .where(and(eq(payroll.month, input.month), eq(payroll.year, input.year)));"""
new = """}).from(payroll)
        .leftJoin(employees, eq(payroll.employeeId, employees.id))
        .where(tenantWhere(payroll, ctx.tenantId, and(eq(payroll.month, input.month), eq(payroll.year, input.year))));"""
if old in erp:
    erp = erp.replace(old, new)

# reports inventory join
old = """}).from(items)
      .leftJoin(itemCategories, eq(items.categoryId, itemCategories.id))
      .orderBy(items.name);"""
new = """}).from(items)
      .where(tenantWhere(items, ctx.tenantId))
      .leftJoin(itemCategories, eq(items.categoryId, itemCategories.id))
      .orderBy(items.name);"""
if old in erp:
    erp = erp.replace(old, new)

# analytics queries
analytics_repls = [
    (""").from(salesInvoices)
      .leftJoin(customers, eq(salesInvoices.customerId, customers.id))
      .where(and(eq(salesInvoices.status, "confirmed"), gte(salesInvoices.date, startStr as any)));""",
     """).from(salesInvoices)
      .where(tenantWhere(salesInvoices, ctx.tenantId, and(eq(salesInvoices.status, "confirmed"), gte(salesInvoices.date, startStr as any))))
      .leftJoin(customers, eq(salesInvoices.customerId, customers.id));"""),
    (""").from(salesInvoiceItems)
      .leftJoin(salesInvoices, eq(salesInvoiceItems.invoiceId, salesInvoices.id))
      .leftJoin(items, eq(salesInvoiceItems.itemId, items.id))
      .where(and(eq(salesInvoices.status, "confirmed"), gte(salesInvoices.date, startStr as any)));""",
     """).from(salesInvoiceItems)
      .where(tenantWhere(salesInvoiceItems, ctx.tenantId, and(eq(salesInvoices.status, "confirmed"), gte(salesInvoices.date, startStr as any))))
      .leftJoin(salesInvoices, eq(salesInvoiceItems.invoiceId, salesInvoices.id))
      .leftJoin(items, eq(salesInvoiceItems.itemId, items.id));"""),
    (""").from(purchaseInvoices)
      .where(and(eq(purchaseInvoices.status, "confirmed"), gte(purchaseInvoices.date, startStr as any)));""",
     """).from(purchaseInvoices)
      .where(tenantWhere(purchaseInvoices, ctx.tenantId, and(eq(purchaseInvoices.status, "confirmed"), gte(purchaseInvoices.date, startStr as any))));"""),
]
for old, new in analytics_repls:
    if old in erp:
        erp = erp.replace(old, new)

# tax report
for table in ["salesInvoices", "purchaseInvoices"]:
    old = f""").from({table})
      .where(and(
        eq({table}.status, "confirmed"),
        gte({table}.date, startDateObj),
        lte({table}.date, endDateObj)
      ))"""
    new = f""").from({table})
      .where(tenantWhere({table}, ctx.tenantId, and(
        eq({table}.status, "confirmed"),
        gte({table}.date, startDateObj),
        lte({table}.date, endDateObj)
      )))"""
    if old in erp:
        erp = erp.replace(old, new)

# stock transfers / inventory adjustments joins
old = """}).from(stockTransfers)
        .leftJoin(sql`warehouses fw`,"""
new = """}).from(stockTransfers)
        .where(tenantWhere(stockTransfers, ctx.tenantId))
        .leftJoin(sql`warehouses fw`,"""
if old in erp:
    erp = erp.replace(old, new)

old = """}).from(inventoryAdjustments)
        .leftJoin(warehouses, eq(inventoryAdjustments.warehouseId, warehouses.id))"""
new = """}).from(inventoryAdjustments)
        .where(tenantWhere(inventoryAdjustments, ctx.tenantId))
        .leftJoin(warehouses, eq(inventoryAdjustments.warehouseId, warehouses.id))"""
if old in erp:
    erp = erp.replace(old, new)

# statement routers - add ctx to handlers if missing (already done) and fix customer/supplier lookup
erp = erp.replace(
    "const [customer] = await db.select().from(customers).where(eq(customers.id, input.customerId));",
    "const [customer] = await db.select().from(customers).where(tenantWhere(customers, ctx.tenantId, eq(customers.id, input.customerId)));",
)
erp = erp.replace(
    "const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, input.supplierId));",
    "const [supplier] = await db.select().from(suppliers).where(tenantWhere(suppliers, ctx.tenantId, eq(suppliers.id, input.supplierId)));",
)

# markRead notifications
erp = erp.replace(
    "await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, input));",
    "await db.update(notifications).set({ isRead: true }).where(tenantWhere(notifications, ctx.tenantId, eq(notifications.id, input)));",
)

# company settings update
erp = erp.replace(
    "await db.update(companySettings).set(input).where(eq(companySettings.id, existing.id));",
    "await db.update(companySettings).set(input).where(tenantWhere(companySettings, ctx.tenantId, eq(companySettings.id, existing.id)));",
)

# attendance saveDay
erp = erp.replace(
    "await db.delete(attendance).where(eq(attendance.date, new Date(input.date)));",
    "await db.delete(attendance).where(tenantWhere(attendance, ctx.tenantId, eq(attendance.date, new Date(input.date))));",
)

# item updates in invoice create loops
erp = erp.replace(
    ").where(eq(items.id, item.itemId));",
    ").where(tenantWhere(items, ctx.tenantId, eq(items.id, item.itemId)));",
)

file_path.write_text(erp + saas)
print(stats)
