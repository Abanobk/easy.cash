#!/usr/bin/env python3
import re
from pathlib import Path

file_path = Path(__file__).parent.parent / "server" / "routers.ts"
content = file_path.read_text()

SAAS_MARKER = "// ===================== SAAS AUTH ROUTER ====================="
saas_idx = content.index(SAAS_MARKER)
erp = content[:saas_idx]
saas_part = content[saas_idx:]

BUSINESS_TABLES = [
    "customers", "suppliers", "items", "itemCategories", "warehouses",
    "contactCategories", "purchaseInvoices", "salesInvoices", "employees",
    "departments", "jobTitles", "accounts", "cashTransactions", "bankTransactions",
    "bankAccounts", "checks", "journalEntries", "journalEntryLines",
    "purchaseInvoiceItems", "salesInvoiceItems", "purchaseOrders", "salesOrders",
    "purchaseOrderItems", "salesOrderItems", "purchaseReturns", "salesReturns",
    "attendance", "payroll", "salaryAdvances",
    "fixedAssets", "costCenters", "loans", "installments", "notifications",
    "inventoryAdjustments", "inventoryAdjustmentItems", "stockTransfers", "stockTransferItems",
    "taxes", "salesReps", "branches", "companySettings",
]

stats = {"ctxAdded": 0, "fromWrapped": 0, "updateDeleteWrapped": 0, "insertWrapped": 0}

if 'from "./tenant-scope"' not in erp:
    erp = erp.replace(
        'import { TRPCError } from "@trpc/server";',
        'import { TRPCError } from "@trpc/server";\nimport { tenantWhere, withTenantId } from "./tenant-scope";',
    )

def add_ctx(m):
    stats["ctxAdded"] += 1
    return m.group(0).replace("async () =>", "async ({ ctx }) =>")

erp = re.sub(
    r"protectedProcedure(?:\.[^(]+)*\)\.(?:query|mutation)\(async \(\) =>",
    add_ctx,
    erp,
)

def add_ctx_input(m):
    stats["ctxAdded"] += 1
    return m.group(0).replace("{ input }", "{ ctx, input }")

erp = re.sub(
    r"protectedProcedure(?:\.[^(]+)*\)\.(?:query|mutation)\(async \(\{ input \}\) =>",
    add_ctx_input,
    erp,
)

erp = re.sub(
    r"protectedProcedure(?:\.[^(]+)*\)\.(?:query|mutation)\(async \(\{ input, ctx \}\) =>",
    lambda m: m.group(0).replace("{ input, ctx }", "{ ctx, input }"),
    erp,
)

for table in BUSINESS_TABLES:
    tw = f"tenantWhere({table}, ctx.tenantId"
    from_where_re = re.compile(
        rf"\.from\({table}\)\.where\((?!tenantWhere\({table})"
    )
    def wrap_from_where(m, t=table, tw=tw):
        stats["fromWrapped"] += 1
        return f".from({t}).where({tw}, "
    erp = from_where_re.sub(wrap_from_where, erp)

    from_no_where_re = re.compile(
        rf"\.from\({table}\)(?!\.where)(?=\.(?:orderBy|limit|leftJoin|groupBy)|[;\)])"
    )
    def wrap_from_no_where(m, t=table):
        stats["fromWrapped"] += 1
        return f".from({t}).where(tenantWhere({t}, ctx.tenantId))"
    erp = from_no_where_re.sub(wrap_from_no_where, erp)

for table in BUSINESS_TABLES:
    update_re = re.compile(
        rf"(\.(?:update|delete)\({table}\)[^;]*?\.where\()eq\({table}\.id,"
    )
    def wrap_update_id(m, t=table):
        if "tenantWhere" in m.group(0):
            return m.group(0)
        stats["updateDeleteWrapped"] += 1
        return f"{m.group(1)}tenantWhere({t}, ctx.tenantId, eq({t}.id,"
    erp = update_re.sub(wrap_update_id, erp)

    update_other_re = re.compile(
        rf"(\.(?:update|delete)\({table}\)[^;]*?\.where\()(?!tenantWhere\()"
    )
    def wrap_update_other(m, t=table):
        stats["updateDeleteWrapped"] += 1
        return f"{m.group(1)}tenantWhere({t}, ctx.tenantId, "
    erp = update_other_re.sub(wrap_update_other, erp)

for table in BUSINESS_TABLES:
    insert_re = re.compile(rf"\.insert\({table}\)\.values\(")
    def wrap_insert(m, t=table):
        stats["insertWrapped"] += 1
        return f".insert({t}).values(withTenantId(ctx.tenantId, "
    erp = insert_re.sub(wrap_insert, erp)

erp = erp.replace(
    "withTenantId(ctx.tenantId, withTenantId(ctx.tenantId, ",
    "withTenantId(ctx.tenantId, ",
)

# Close withTenantId for } as any);
erp = re.sub(
    r"withTenantId\(ctx\.tenantId, (\{[^}]*(?:\{[^}]*\}[^}]*)*\}) as any\)",
    r"withTenantId(ctx.tenantId, \1) as any)",
    erp,
)

erp = erp.replace("withTenantId(ctx.tenantId, input as any)", "withTenantId(ctx.tenantId, input) as any)")

# Statement router condition arrays
replacements = [
    ("let siConds: any[] = [eq(salesInvoices.customerId, input.customerId)]",
     "let siConds: any[] = [tenantWhere(salesInvoices, ctx.tenantId, eq(salesInvoices.customerId, input.customerId))]"),
    ("let ctConds: any[] = [eq(cashTransactions.customerId, input.customerId)]",
     "let ctConds: any[] = [tenantWhere(cashTransactions, ctx.tenantId, eq(cashTransactions.customerId, input.customerId))]"),
    ("let btConds: any[] = [eq(bankTransactions.customerId, input.customerId)]",
     "let btConds: any[] = [tenantWhere(bankTransactions, ctx.tenantId, eq(bankTransactions.customerId, input.customerId))]"),
    ("let srConds: any[] = [eq(salesReturns.customerId, input.customerId)]",
     "let srConds: any[] = [tenantWhere(salesReturns, ctx.tenantId, eq(salesReturns.customerId, input.customerId))]"),
    ("let piConds: any[] = [eq(purchaseInvoices.supplierId, input.supplierId)]",
     "let piConds: any[] = [tenantWhere(purchaseInvoices, ctx.tenantId, eq(purchaseInvoices.supplierId, input.supplierId))]"),
    ("let ctConds: any[] = [eq(cashTransactions.supplierId, input.supplierId)]",
     "let ctConds: any[] = [tenantWhere(cashTransactions, ctx.tenantId, eq(cashTransactions.supplierId, input.supplierId))]"),
    ("let btConds: any[] = [eq(bankTransactions.supplierId, input.supplierId)]",
     "let btConds: any[] = [tenantWhere(bankTransactions, ctx.tenantId, eq(bankTransactions.supplierId, input.supplierId))]"),
    ("let prConds: any[] = [eq(purchaseReturns.supplierId, input.supplierId)]",
     "let prConds: any[] = [tenantWhere(purchaseReturns, ctx.tenantId, eq(purchaseReturns.supplierId, input.supplierId))]"),
]
for old, new in replacements:
    erp = erp.replace(old, new)

erp = erp.replace(
    ".where(and(eq(notifications.isRead, false), eq(notifications.userId, ctx.user.id)))",
    ".where(tenantWhere(notifications, ctx.tenantId, and(eq(notifications.isRead, false), eq(notifications.userId, ctx.user.id))))",
)
erp = erp.replace(
    ".where(eq(notifications.userId, ctx.user.id))",
    ".where(tenantWhere(notifications, ctx.tenantId, eq(notifications.userId, ctx.user.id)))",
)

# items list where variable
erp = erp.replace(
    ".from(items).where(where).orderBy(items.name)",
    ".from(items).where(tenantWhere(items, ctx.tenantId, where)).orderBy(items.name)",
)
erp = erp.replace(
    ".from(items).where(where);",
    ".from(items).where(tenantWhere(items, ctx.tenantId, where));",
)

for table in ["customers", "suppliers", "branches"]:
    erp = erp.replace(
        f".from({table}).where(where)",
        f".from({table}).where(tenantWhere({table}, ctx.tenantId, where))",
    )

erp = erp.replace(
    ".from(checks).where(where).orderBy",
    ".from(checks).where(tenantWhere(checks, ctx.tenantId, where)).orderBy",
)
erp = erp.replace(
    ".from(checks).where(where);",
    ".from(checks).where(tenantWhere(checks, ctx.tenantId, where));",
)

# Multi-line insert closing - balance parens for withTenantId
lines = erp.split("\n")
out = []
depth = 0
for line in lines:
    if ".values(withTenantId(ctx.tenantId," in line:
        depth = 1
    if depth > 0:
        depth += line.count("{") - line.count("}")
        if depth == 0:
            if "} as any);" in line:
                line = line.replace("} as any);", "}) as any);")
            elif re.search(r"\}\);$", line):
                line = re.sub(r"\}\);$", "}));", line)
    out.append(line)
erp = "\n".join(out)

# item updates in loops need tenant filter
for table in ["items", "purchaseOrders", "salesOrders", "purchaseReturns", "salesReturns", "salaryAdvances", "installments"]:
    erp = re.sub(
        rf"(\.update\({table}\)\.set\([^)]+\))\.where\(eq\({table}\.id,",
        rf"\1.where(tenantWhere({table}, ctx.tenantId, eq({table}.id,",
        erp,
    )

file_path.write_text(erp + saas_part)
print(stats)
