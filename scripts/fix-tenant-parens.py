#!/usr/bin/env python3
"""Fix unbalanced tenantWhere parentheses and broken method chains."""
import re
from pathlib import Path

p = Path(__file__).parent.parent / "server" / "routers.ts"
content = p.read_text()
SAAS = "// ===================== SAAS AUTH ROUTER ====================="
idx = content.index(SAAS)
erp, saas = content[:idx], content[idx:]

def fix_line(line):
    if "tenantWhere(" not in line:
        return line

    # Fix: tenantWhere(..., where).orderBy -> tenantWhere(..., where)).orderBy
    line = re.sub(
        r"tenantWhere\((\w+), ctx\.tenantId, where\)\.(orderBy|limit)",
        r"tenantWhere(\1, ctx.tenantId, where)).\2",
        line,
    )

    # Fix: tenantWhere(..., eq(...)).orderBy with only one ) before .orderBy
    # tenantWhere(T, ctx.tenantId, eq(T.f, v)).orderBy -> need ))
    line = re.sub(
        r"tenantWhere\((\w+), ctx\.tenantId, (eq\([^)]+\))\)\.(orderBy|limit)",
        r"tenantWhere(\1, ctx.tenantId, \2)).\3",
        line,
    )

    # Fix installments loanId pattern
    line = re.sub(
        r"tenantWhere\(installments, ctx\.tenantId, eq\(installments\.loanId, input\)\)\.(orderBy)",
        r"tenantWhere(installments, ctx.tenantId, eq(installments.loanId, input))).\1",
        line,
    )

    # Generic: .where(tenantWhere(...); at EOL missing one )
    if re.search(r"\.where\(tenantWhere\([^)]+\)\);?\s*$", line) and not re.search(r"\.where\(tenantWhere\(.+\)\)\);?\s*$", line):
        # count parens inside where(tenantWhere(...))
        m = re.search(r"\.where\((tenantWhere\(.+)", line)
        if m:
            rest = m.group(1)
            opens = rest.count("(")
            closes = rest.count(")")
            if opens > closes:
                line = line.rstrip()
                if line.endswith(";"):
                    line = line[:-1] + ")" * (opens - closes) + ";"
                else:
                    line = line + ")" * (opens - closes)

    # Fix .where(tenantWhere(..., eq(...)); missing one )
    m = re.search(r"(\.where\(tenantWhere\(\w+, ctx\.tenantId, [^;]+)\);", line)
    if m:
        inner = m.group(1)
        if inner.count("(") > inner.count(")"):
            line = line.replace(m.group(0), inner + "));")

    return line

lines = erp.split("\n")
fixed = [fix_line(l) for l in lines]
erp = "\n".join(fixed)

# Bulk fixes for common missing-paren patterns
bulk = [
    (".where(tenantWhere(customers, ctx.tenantId, where);", ".where(tenantWhere(customers, ctx.tenantId, where));"),
    (".where(tenantWhere(suppliers, ctx.tenantId, where);", ".where(tenantWhere(suppliers, ctx.tenantId, where));"),
    (".where(tenantWhere(items, ctx.tenantId, where);", ".where(tenantWhere(items, ctx.tenantId, where));"),
    (".where(tenantWhere(checks, ctx.tenantId, where);", ".where(tenantWhere(checks, ctx.tenantId, where));"),
    ('eq(employees.status, "active"));', 'eq(employees.status, "active")));'),
    (".where(tenantWhere(salesInvoices, ctx.tenantId, or(eq(salesInvoices.status, \"confirmed\"), eq(salesInvoices.status, \"partial\")));",
     ".where(tenantWhere(salesInvoices, ctx.tenantId, or(eq(salesInvoices.status, \"confirmed\"), eq(salesInvoices.status, \"partial\"))));"),
    (".where(tenantWhere(purchaseInvoices, ctx.tenantId, eq(purchaseInvoices.status, \"confirmed\"));",
     ".where(tenantWhere(purchaseInvoices, ctx.tenantId, eq(purchaseInvoices.status, \"confirmed\")));"),
    ("withTenantId(ctx.tenantId, input);", "withTenantId(ctx.tenantId, input) as any);"),
    (".where(tenantWhere(items, ctx.tenantId, eq(items.id, item.itemId));", ".where(tenantWhere(items, ctx.tenantId, eq(items.id, item.itemId)));"),
]
for old, new in bulk:
    erp = erp.replace(old, new)

# Fix all .where(tenantWhere(T, ctx.tenantId, eq(...)); -> add one ) before ;
for table in ["customers", "suppliers", "items", "contactCategories", "warehouses",
              "purchaseInvoices", "purchaseOrders", "purchaseReturns",
              "salesInvoices", "salesOrders", "salesReturns",
              "employees", "departments", "jobTitles", "salaryAdvances",
              "notifications", "installments", "salesReps", "branches",
              "companySettings"]:
    erp = re.sub(
        rf"(\.where\(tenantWhere\({table}, ctx\.tenantId, eq\({table}\.id, [^)]+\))\);",
        r"\1));",
        erp,
    )
    erp = re.sub(
        rf"(\.update\({table}\)[^;]*\.where\(tenantWhere\({table}, ctx\.tenantId, eq\({table}\.id, [^)]+\))\);",
        r"\1));",
        erp,
    )
    erp = re.sub(
        rf"(\.delete\({table}\)\.where\(tenantWhere\({table}, ctx\.tenantId, eq\({table}\.id, [^)]+\))\);",
        r"\1));",
        erp,
    )

# attendance date delete
erp = erp.replace(
    "tenantWhere(attendance, ctx.tenantId, eq(attendance.date, new Date(input.date)));",
    "tenantWhere(attendance, ctx.tenantId, eq(attendance.date, new Date(input.date))));",
)

# sql date attendance
erp = erp.replace(
    "tenantWhere(attendance, ctx.tenantId, sql`DATE(${attendance.date}) = ${input.date}`);",
    "tenantWhere(attendance, ctx.tenantId, sql`DATE(${attendance.date}) = ${input.date}`));",
)

# accounts isActive orderBy
erp = erp.replace(
    ".where(tenantWhere(accounts, ctx.tenantId, eq(accounts.isActive, true)).orderBy(accounts.code);",
    ".where(tenantWhere(accounts, ctx.tenantId, eq(accounts.isActive, true))).orderBy(accounts.code);",
)

# bankAccounts isActive
erp = erp.replace(
    ".where(tenantWhere(bankAccounts, ctx.tenantId, eq(bankAccounts.isActive, true));",
    ".where(tenantWhere(bankAccounts, ctx.tenantId, eq(bankAccounts.isActive, true)));",
)

# costCenters, salesReps isActive orderBy
erp = erp.replace(
    ".where(tenantWhere(costCenters, ctx.tenantId, eq(costCenters.isActive, true)).orderBy(costCenters.name);",
    ".where(tenantWhere(costCenters, ctx.tenantId, eq(costCenters.isActive, true))).orderBy(costCenters.name);",
)
erp = erp.replace(
    ".where(tenantWhere(salesReps, ctx.tenantId, eq(salesReps.isActive, true)).orderBy(salesReps.name);",
    ".where(tenantWhere(salesReps, ctx.tenantId, eq(salesReps.isActive, true))).orderBy(salesReps.name);",
)

# items isActive orderBy
erp = erp.replace(
    ".where(tenantWhere(items, ctx.tenantId, eq(items.isActive, true)).orderBy(items.name);",
    ".where(tenantWhere(items, ctx.tenantId, eq(items.isActive, true))).orderBy(items.name);",
)

# branches where search
erp = erp.replace(
    ".where(tenantWhere(branches, ctx.tenantId, where).orderBy(branches.name);",
    ".where(tenantWhere(branches, ctx.tenantId, where)).orderBy(branches.name);",
)

# companySettings update
erp = erp.replace(
    "tenantWhere(companySettings, ctx.tenantId, eq(companySettings.id, existing.id));",
    "tenantWhere(companySettings, ctx.tenantId, eq(companySettings.id, existing.id)));",
)

# approve mutations
for t in ["purchaseOrders", "salesOrders", "salaryAdvances"]:
    erp = re.sub(
        rf"tenantWhere\({t}, ctx\.tenantId, eq\({t}\.id, input\)\);",
        rf"tenantWhere({t}, ctx.tenantId, eq({t}.id, input)));",
        erp,
    )

# installments pay
erp = erp.replace(
    "tenantWhere(installments, ctx.tenantId, eq(installments.id, input.installmentId));",
    "tenantWhere(installments, ctx.tenantId, eq(installments.id, input.installmentId)));",
)

# notifications markRead
erp = erp.replace(
    "tenantWhere(notifications, ctx.tenantId, eq(notifications.id, input));",
    "tenantWhere(notifications, ctx.tenantId, eq(notifications.id, input)));",
)

# attendance saveDay array insert - add tenantId to records
erp = erp.replace(
    """        await db.insert(attendance).values(
          input.records.map(r => ({
            employeeId: r.employeeId,
            date: new Date(input.date),
            checkIn: r.checkIn,
            checkOut: r.checkOut,
            overtime: r.overtime,
            status: r.status as any,
            notes: r.notes,
          }))
        );""",
    """        await db.insert(attendance).values(
          input.records.map(r => withTenantId(ctx.tenantId, {
            employeeId: r.employeeId,
            date: new Date(input.date),
            checkIn: r.checkIn,
            checkOut: r.checkOut,
            overtime: r.overtime,
            status: r.status as any,
            notes: r.notes,
          }) as any)
        );""",
)

p.write_text(erp + saas)
print("paren fixes applied")
