import { and, count, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "./db";
import { accounts, items, journalEntries, journalEntryLines } from "../drizzle/schema";
import { getPostedMovementByAccount, getAccountBalancesAsOf } from "./accounting-data";
import { tenantWhere, withTenantId } from "./tenant-scope";
import { resolveBankGlAccountId } from "./bank-accounts-sync";

/** drizzle/mysql2 يرجّع أعمدة date() ككائن Date حقيقي — String(x).slice(0,10) بيفقد السنة */
function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v || "").slice(0, 10);
}

type JournalLineInput = {
  accountId: number;
  debit: string;
  credit: string;
  description?: string;
  costCenterId?: number;
};

export type AccountMap = {
  cash: number;
  customers: number;
  suppliers: number;
  sales: number;
  inventory: number;
  vat: number;
  salaries: number;
  otherRevenue: number;
  generalExpense: number;
  checksPortfolio: number;
  /** شيكات مودعة بالبنك تحت التحصيل — بعد الإيداع وقبل المقاصة */
  checksDeposited: number;
  checksPayable: number;
  cogs: number;
  retainedEarnings: number;
};

const DEFAULT_ACCOUNTS: Array<{
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  key: keyof AccountMap;
}> = [
  { code: "1101", name: "الصندوق", type: "asset", key: "cash" },
  { code: "1210", name: "العملاء", type: "asset", key: "customers" },
  { code: "1140", name: "المخزون", type: "asset", key: "inventory" },
  { code: "2110", name: "الموردين", type: "liability", key: "suppliers" },
  { code: "2140", name: "ضريبة القيمة المضافة", type: "liability", key: "vat" },
  { code: "4100", name: "إيرادات المبيعات", type: "revenue", key: "sales" },
  { code: "5100", name: "تكلفة المبيعات", type: "expense", key: "cogs" },
  { code: "5200", name: "مصروف الرواتب", type: "expense", key: "salaries" },
  { code: "4900", name: "إيرادات أخرى", type: "revenue", key: "otherRevenue" },
  { code: "5900", name: "مصروفات عامة", type: "expense", key: "generalExpense" },
  { code: "1150", name: "شيكات تحت التحصيل", type: "asset", key: "checksPortfolio" },
  { code: "1151", name: "شيكات مودعة بالبنك تحت التحصيل", type: "asset", key: "checksDeposited" },
  { code: "2160", name: "شيكات صادرة", type: "liability", key: "checksPayable" },
  { code: "3200", name: "أرباح محتجزة", type: "equity", key: "retainedEarnings" },
];

function money(v: unknown) {
  return Number(v ?? 0).toFixed(2);
}

function num(v: unknown) {
  return Number(v ?? 0);
}

function normalizeName(name: string) {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

function matchAccount(
  rows: Array<{ id: number; code: string; name: string; isParent: boolean | null }>,
  opts: { codePrefix?: string; nameIncludes?: string[]; type?: string },
) {
  const leaf = rows.filter((r) => !r.isParent);
  for (const r of leaf) {
    if (opts.codePrefix && r.code.startsWith(opts.codePrefix)) return r.id;
  }
  for (const r of leaf) {
    const n = normalizeName(r.name);
    if (opts.nameIncludes?.some((k) => n.includes(normalizeName(k)))) return r.id;
  }
  return undefined;
}

/** يُنشئ الحسابات الافتراضية لشركة جديدة عند فتح شجرة الحسابات أو أول قيد */
export async function ensureDefaultAccounts(db: Db, tenantId: number) {
  const [existing] = await db
    .select({ count: count() })
    .from(accounts)
    .where(tenantWhere(accounts, tenantId, eq(accounts.isActive, true)));
  if (existing.count > 0) return;

  const { CHART_TEMPLATE_ACCOUNTS } = await import("./chart-template");
  const codeToId = new Map<string, number>();

  const sorted = [...CHART_TEMPLATE_ACCOUNTS].sort((a, b) => a.code.localeCompare(b.code));
  for (const def of sorted) {
    const parentId = def.parentCode ? codeToId.get(def.parentCode) : undefined;
    const [result] = await db.insert(accounts).values(
      withTenantId(tenantId, {
        code: def.code,
        name: def.name,
        type: def.type,
        parentId,
        isParent: Boolean(def.isParent),
        isActive: true,
      }) as any,
    );
    codeToId.set(def.code, (result as { insertId: number }).insertId);
  }

  for (const def of DEFAULT_ACCOUNTS) {
    if (codeToId.has(def.code)) continue;
    await db.insert(accounts).values(
      withTenantId(tenantId, {
        code: def.code,
        name: def.name,
        type: def.type,
        isParent: false,
        isActive: true,
      }) as any,
    );
  }
}

/** يضيف حسابات القالب الناقصة لشركات لديها شجرة جزئية */
export async function reseedChartFromTemplate(db: Db, tenantId: number) {
  const existing = await db
    .select({ id: accounts.id, code: accounts.code })
    .from(accounts)
    .where(tenantWhere(accounts, tenantId, eq(accounts.isActive, true)));

  const codeToId = new Map(existing.map((a) => [a.code, a.id]));
  const existingCodes = new Set(existing.map((a) => a.code));
  let added = 0;

  const { CHART_TEMPLATE_ACCOUNTS } = await import("./chart-template");
  const sorted = [...CHART_TEMPLATE_ACCOUNTS].sort((a, b) => a.code.localeCompare(b.code));
  for (const def of sorted) {
    if (existingCodes.has(def.code)) continue;
    const parentId = def.parentCode ? codeToId.get(def.parentCode) : undefined;
    const [result] = await db.insert(accounts).values(
      withTenantId(tenantId, {
        code: def.code,
        name: def.name,
        type: def.type,
        parentId,
        isParent: Boolean(def.isParent),
        isActive: true,
      }) as any,
    );
    const newId = (result as { insertId: number }).insertId;
    codeToId.set(def.code, newId);
    existingCodes.add(def.code);
    added++;
  }

  for (const def of DEFAULT_ACCOUNTS) {
    if (existingCodes.has(def.code)) continue;
    const [result] = await db.insert(accounts).values(
      withTenantId(tenantId, {
        code: def.code,
        name: def.name,
        type: def.type,
        isParent: false,
        isActive: true,
      }) as any,
    );
    codeToId.set(def.code, (result as { insertId: number }).insertId);
    added++;
  }

  return { added, total: existing.length + added };
}

export async function resolveAccountMap(
  db: Db,
  tenantId: number,
): Promise<AccountMap> {
  await ensureDefaultAccounts(db, tenantId);
  let rows = await db
    .select({ id: accounts.id, code: accounts.code, name: accounts.name, isParent: accounts.isParent })
    .from(accounts)
    .where(tenantWhere(accounts, tenantId, eq(accounts.isActive, true)));

  const find = (key: keyof AccountMap) => {
    switch (key) {
      case "cash":
        return matchAccount(rows, { codePrefix: "11", nameIncludes: ["صندوق", "خزينة", "cash", "نقد"] });
      case "customers":
        return matchAccount(rows, { codePrefix: "12", nameIncludes: ["عملاء", "مدينون", "receivable"] });
      case "suppliers":
        return matchAccount(rows, { codePrefix: "21", nameIncludes: ["موردين", "دائنون", "payable"] });
      case "sales":
        return matchAccount(rows, { codePrefix: "41", nameIncludes: ["مبيعات", "sales", "إيراد"] });
      case "cogs":
        return matchAccount(rows, { codePrefix: "510", nameIncludes: ["تكلفة المبيعات", "cogs", "cost of sales"] });
      case "inventory":
        return matchAccount(rows, { codePrefix: "114", nameIncludes: ["مخزون", "inventory", "بضاعة"] })
          ?? matchAccount(rows, { codePrefix: "51", nameIncludes: ["مشتريات", "purchases"] });
      case "vat":
        return matchAccount(rows, { codePrefix: "214", nameIncludes: ["ضريبة", "vat", "قيمة مضافة"] });
      case "salaries":
        return matchAccount(rows, { codePrefix: "52", nameIncludes: ["رواتب", "أجور", "salary", "payroll"] });
      case "otherRevenue":
        return matchAccount(rows, { codePrefix: "49", nameIncludes: ["إيرادات أخرى", "other revenue"] });
      case "generalExpense":
        return matchAccount(rows, { codePrefix: "59", nameIncludes: ["مصروفات عامة", "general expense"] });
      case "checksPortfolio":
        return matchAccount(rows, { codePrefix: "1150", nameIncludes: ["شيكات تحت التحصيل"] })
          ?? matchAccount(rows, { nameIncludes: ["شيكات تحت التحصيل", "checks portfolio"] });
      case "checksDeposited":
        return matchAccount(rows, { codePrefix: "1151", nameIncludes: ["شيكات مودعة", "مودعة بالبنك"] });
      case "checksPayable":
        return matchAccount(rows, { codePrefix: "216", nameIncludes: ["شيكات صادرة", "checks payable"] });
      case "retainedEarnings":
        return matchAccount(rows, { codePrefix: "32", nameIncludes: ["أرباح محتجزة", "retained", "حقوق ملكية"] });
      default:
        return undefined;
    }
  };

  const map: Partial<AccountMap> = {};
  for (const def of DEFAULT_ACCOUNTS) {
    map[def.key] = find(def.key);
  }

  const missing = DEFAULT_ACCOUNTS.filter((d) => !map[d.key]);
  if (missing.length) {
    for (const def of missing) {
      await db.insert(accounts).values(
        withTenantId(tenantId, {
          code: def.code,
          name: def.name,
          type: def.type,
          isParent: false,
          isActive: true,
        }) as any,
      );
    }
    rows = await db
      .select({ id: accounts.id, code: accounts.code, name: accounts.name, isParent: accounts.isParent })
      .from(accounts)
      .where(tenantWhere(accounts, tenantId, eq(accounts.isActive, true)));
    for (const def of DEFAULT_ACCOUNTS) {
      map[def.key] = find(def.key) ?? rows.find((r) => r.code === def.code)?.id;
    }
  }

  const required = DEFAULT_ACCOUNTS.map((d) => d.key);
  for (const key of required) {
    if (!map[key]) throw new Error(`تعذر تحديد الحساب المحاسبي: ${key}`);
  }
  return map as AccountMap;
}

async function journalReferenceExists(db: Db, tenantId: number, reference: string) {
  const [row] = await db
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(tenantWhere(
      journalEntries,
      tenantId,
      and(eq(journalEntries.reference, reference), ne(journalEntries.status, "cancelled")),
    ))
    .limit(1);
  return !!row;
}

/** إلغاء قيد مرحّل بالمرجع (لحذف/عكس عمليات آلية) */
export async function cancelPostedJournalByReference(
  db: Db,
  tenantId: number,
  reference: string,
) {
  const [row] = await db
    .select({ id: journalEntries.id, reference: journalEntries.reference })
    .from(journalEntries)
    .where(tenantWhere(
      journalEntries,
      tenantId,
      and(eq(journalEntries.reference, reference), ne(journalEntries.status, "cancelled")),
    ))
    .limit(1);
  if (!row) return { cancelled: false as const };
  await db.update(journalEntries).set({
    status: "cancelled",
    reference: `${reference}-VOID-${row.id}`,
  }).where(tenantWhere(journalEntries, tenantId, eq(journalEntries.id, row.id)));
  return { cancelled: true as const, id: row.id };
}

async function createPostedJournal(
  db: Db,
  tenantId: number,
  createdBy: number | undefined,
  opts: {
    date: string;
    description: string;
    reference: string;
    lines: JournalLineInput[];
  },
) {
  if (await journalReferenceExists(db, tenantId, opts.reference)) {
    return { skipped: true as const };
  }

  const activeLines = opts.lines.filter((l) => num(l.debit) > 0 || num(l.credit) > 0);
  if (activeLines.length < 2) return { skipped: true as const };

  const totalDebit = activeLines.reduce((s, l) => s + num(l.debit), 0);
  const totalCredit = activeLines.reduce((s, l) => s + num(l.credit), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`القيد غير متوازن: مدين ${totalDebit} دائن ${totalCredit}`);
  }

  const [countResult] = await db
    .select({ count: count() })
    .from(journalEntries)
    .where(tenantWhere(journalEntries, tenantId));
  const number = `JE-${String(countResult.count + 1).padStart(5, "0")}`;

  const [result] = await db.insert(journalEntries).values(
    withTenantId(tenantId, {
      number,
      date: opts.date as any,
      description: opts.description,
      reference: opts.reference,
      createdBy,
      status: "posted",
    }) as any,
  );
  const entryId = (result as { insertId: number }).insertId;

  for (const line of activeLines) {
    await db.insert(journalEntryLines).values(
      withTenantId(tenantId, {
        entryId,
        accountId: line.accountId,
        debit: line.debit,
        credit: line.credit,
        description: line.description,
        costCenterId: line.costCenterId,
      }) as any,
    );
  }

  return { skipped: false as const, id: entryId, number };
}

export async function createPostedJournalDirect(
  db: Db,
  tenantId: number,
  createdBy: number | undefined,
  opts: {
    date: string;
    description: string;
    reference: string;
    lines: JournalLineInput[];
  },
) {
  return createPostedJournal(db, tenantId, createdBy, opts);
}

/** ضريبة أو مصروف مضاف على مستوى الفاتورة — كل سطر بحسابه المحاسبي الخاص */
type InvoiceTaxLine = { amount: string; glAccountId?: number | null; name?: string };
type InvoiceExpenseLine = {
  amount: string;
  creditAccountId: number;
  currencyCode?: string;
  exchangeRate?: string;
  notes?: string | null;
};

/** يبني أرجل التسوية (نقدي/بنكي/آجل) بحيث يتوازى مجموعها مع total دائمًا */
async function buildSettlementLegs(
  db: Db,
  tenantId: number,
  total: number,
  onAccountFallback: number,
  opts: { paymentType: "cash" | "credit"; cashAmount?: string; bankAmount?: string; bankAccountId?: number | null },
) {
  const cashPortion = opts.cashAmount !== undefined ? num(opts.cashAmount) : (opts.paymentType === "cash" ? total : 0);
  const bankPortion = opts.bankAmount !== undefined ? num(opts.bankAmount) : 0;
  const onAccountPortion = Math.max(0, Math.round((total - cashPortion - bankPortion) * 100) / 100);
  const map = await resolveAccountMap(db, tenantId);
  const legs: Array<{ accountId: number; amount: number }> = [];
  if (cashPortion > 0) legs.push({ accountId: map.cash, amount: cashPortion });
  if (bankPortion > 0) {
    const bankGl = await resolveBankGlAccountId(db, tenantId, opts.bankAccountId, map.cash);
    legs.push({ accountId: bankGl, amount: bankPortion });
  }
  if (onAccountPortion > 0) legs.push({ accountId: onAccountFallback, amount: onAccountPortion });
  if (!legs.length) legs.push({ accountId: onAccountFallback, amount: 0 });
  return legs;
}

export async function postSalesInvoiceJournal(
  db: Db,
  tenantId: number,
  createdBy: number | undefined,
  inv: {
    number: string;
    date: string;
    paymentType: "cash" | "credit";
    subtotal: string;
    discount: string;
    tax: string;
    total: string;
    costCenterId?: number;
    customerName?: string;
    cashAmount?: string;
    bankAmount?: string;
    bankAccountId?: number | null;
    taxes?: InvoiceTaxLine[];
    expenses?: InvoiceExpenseLine[];
  },
) {
  const map = await resolveAccountMap(db, tenantId);
  const total = num(inv.total);
  const tax = num(inv.tax);
  const revenue = Math.max(0, num(inv.subtotal) - num(inv.discount));
  const lines: JournalLineInput[] = [];

  const settlementLegs = await buildSettlementLegs(db, tenantId, total, map.customers, inv);
  for (const leg of settlementLegs) {
    lines.push({
      accountId: leg.accountId,
      debit: money(leg.amount),
      credit: "0.00",
      description: inv.customerName ? `عميل: ${inv.customerName}` : undefined,
      costCenterId: inv.costCenterId,
    });
  }

  lines.push({
    accountId: map.sales,
    debit: "0.00",
    credit: money(revenue),
    costCenterId: inv.costCenterId,
  });

  if (inv.taxes?.length) {
    for (const t of inv.taxes) {
      const amt = num(t.amount);
      if (amt <= 0) continue;
      lines.push({
        accountId: t.glAccountId ?? map.vat,
        debit: "0.00",
        credit: money(amt),
        description: t.name ? `ضريبة: ${t.name}` : "ضريبة المبيعات",
        costCenterId: inv.costCenterId,
      });
    }
  } else if (tax > 0) {
    lines.push({
      accountId: map.vat,
      debit: "0.00",
      credit: money(tax),
      description: "ضريبة المبيعات",
      costCenterId: inv.costCenterId,
    });
  }

  if (inv.expenses?.length) {
    for (const exp of inv.expenses) {
      const rate = exp.exchangeRate ? num(exp.exchangeRate) : 1;
      const amtEgp = num(exp.amount) * (rate || 1);
      if (amtEgp <= 0) continue;
      lines.push({
        accountId: map.generalExpense,
        debit: money(amtEgp),
        credit: "0.00",
        description: exp.notes || "مصروفات على الفاتورة",
        costCenterId: inv.costCenterId,
      });
      lines.push({
        accountId: exp.creditAccountId,
        debit: "0.00",
        credit: money(amtEgp),
        costCenterId: inv.costCenterId,
      });
    }
  }

  return createPostedJournal(db, tenantId, createdBy, {
    date: inv.date,
    description: `قيد تلقائي — فاتورة مبيعات ${inv.number}`,
    reference: inv.number,
    lines,
  });
}

export async function postPurchaseInvoiceJournal(
  db: Db,
  tenantId: number,
  createdBy: number | undefined,
  inv: {
    number: string;
    date: string;
    paymentType: "cash" | "credit";
    subtotal: string;
    discount: string;
    tax: string;
    total: string;
    costCenterId?: number;
    supplierName?: string;
    cashAmount?: string;
    bankAmount?: string;
    bankAccountId?: number | null;
    taxes?: InvoiceTaxLine[];
    expenses?: InvoiceExpenseLine[];
  },
) {
  const map = await resolveAccountMap(db, tenantId);
  const total = num(inv.total);
  const tax = num(inv.tax);
  const netPurchase = Math.max(0, num(inv.subtotal) - num(inv.discount));

  const lines: JournalLineInput[] = [
    {
      accountId: map.inventory,
      debit: money(netPurchase),
      credit: "0.00",
      description: inv.supplierName ? `مورد: ${inv.supplierName}` : undefined,
      costCenterId: inv.costCenterId,
    },
  ];

  if (inv.taxes?.length) {
    for (const t of inv.taxes) {
      const amt = num(t.amount);
      if (amt <= 0) continue;
      lines.push({
        accountId: t.glAccountId ?? map.vat,
        debit: money(amt),
        credit: "0.00",
        description: t.name ? `ضريبة: ${t.name}` : "ضريبة المشتريات",
        costCenterId: inv.costCenterId,
      });
    }
  } else if (tax > 0) {
    lines.push({
      accountId: map.vat,
      debit: money(tax),
      credit: "0.00",
      description: "ضريبة المشتريات",
      costCenterId: inv.costCenterId,
    });
  }

  if (inv.expenses?.length) {
    for (const exp of inv.expenses) {
      const rate = exp.exchangeRate ? num(exp.exchangeRate) : 1;
      const amtEgp = num(exp.amount) * (rate || 1);
      if (amtEgp <= 0) continue;
      // مصروفات المشتريات (نولون/جمارك...) تُرسمل على تكلفة المخزون
      lines.push({
        accountId: map.inventory,
        debit: money(amtEgp),
        credit: "0.00",
        description: exp.notes || "مصروفات على فاتورة الشراء",
        costCenterId: inv.costCenterId,
      });
      lines.push({
        accountId: exp.creditAccountId,
        debit: "0.00",
        credit: money(amtEgp),
        costCenterId: inv.costCenterId,
      });
    }
  }

  const settlementLegs = await buildSettlementLegs(db, tenantId, total, map.suppliers, inv);
  for (const leg of settlementLegs) {
    lines.push({
      accountId: leg.accountId,
      debit: "0.00",
      credit: money(leg.amount),
      costCenterId: inv.costCenterId,
    });
  }

  return createPostedJournal(db, tenantId, createdBy, {
    date: inv.date,
    description: `قيد تلقائي — فاتورة مشتريات ${inv.number}`,
    reference: inv.number,
    lines,
  });
}

export async function postCashTransactionJournal(
  db: Db,
  tenantId: number,
  createdBy: number | undefined,
  tx: {
    number: string;
    type: "receive" | "pay" | "receive_customer" | "pay_supplier" | "pay_customer";
    date: string;
    amount: string;
    description?: string;
    customerName?: string;
    supplierName?: string;
  },
) {
  const map = await resolveAccountMap(db, tenantId);
  const amount = money(tx.amount);
  const desc = tx.description || tx.number;
  let lines: JournalLineInput[];

  switch (tx.type) {
    case "receive_customer":
      lines = [
        { accountId: map.cash, debit: amount, credit: "0.00", description: desc },
        {
          accountId: map.customers,
          debit: "0.00",
          credit: amount,
          description: tx.customerName ? `تحصيل من ${tx.customerName}` : "تحصيل عميل",
        },
      ];
      break;
    case "pay_customer":
      lines = [
        {
          accountId: map.customers,
          debit: amount,
          credit: "0.00",
          description: tx.customerName ? `رد للعميل ${tx.customerName}` : "رد فلوس لعميل",
        },
        { accountId: map.cash, debit: "0.00", credit: amount, description: desc },
      ];
      break;
    case "pay_supplier":
      lines = [
        {
          accountId: map.suppliers,
          debit: amount,
          credit: "0.00",
          description: tx.supplierName ? `سداد لمورد ${tx.supplierName}` : "سداد مورد",
        },
        { accountId: map.cash, debit: "0.00", credit: amount, description: desc },
      ];
      break;
    case "receive":
      lines = [
        { accountId: map.cash, debit: amount, credit: "0.00", description: desc },
        { accountId: map.otherRevenue, debit: "0.00", credit: amount, description: "إيراد نقدي" },
      ];
      break;
    case "pay":
      lines = [
        { accountId: map.generalExpense, debit: amount, credit: "0.00", description: desc },
        { accountId: map.cash, debit: "0.00", credit: amount, description: "صرف نقدي" },
      ];
      break;
    default:
      return { skipped: true as const };
  }

  return createPostedJournal(db, tenantId, createdBy, {
    date: tx.date,
    description: `قيد تلقائي — حركة خزينة ${tx.number}`,
    reference: tx.number,
    lines,
  });
}

export async function postPayrollJournal(
  db: Db,
  tenantId: number,
  createdBy: number | undefined,
  opts: { month: number; year: number; totalNet: number; payDate: string },
) {
  if (opts.totalNet <= 0) return { skipped: true as const };

  const map = await resolveAccountMap(db, tenantId);
  const amount = money(opts.totalNet);
  const reference = `PAYROLL-${opts.year}-${String(opts.month).padStart(2, "0")}`;

  return createPostedJournal(db, tenantId, createdBy, {
    date: opts.payDate,
    description: `قيد تلقائي — صرف رواتب ${opts.month}/${opts.year}`,
    reference,
    lines: [
      { accountId: map.salaries, debit: amount, credit: "0.00", description: "صرف رواتب" },
      { accountId: map.cash, debit: "0.00", credit: amount, description: "من الصندوق" },
    ],
  });
}

export async function postBankTransactionJournal(
  db: Db,
  tenantId: number,
  createdBy: number | undefined,
  tx: {
    number: string;
    type: "deposit" | "withdraw" | "deposit_customer" | "withdraw_supplier" | "withdraw_customer";
    date: string;
    amount: string;
    description?: string;
    customerName?: string;
    supplierName?: string;
    bankAccountId?: number;
  },
) {
  const map = await resolveAccountMap(db, tenantId);
  const { resolveBankGlAccountId } = await import("./bank-accounts-sync");
  const bankGl = await resolveBankGlAccountId(db, tenantId, tx.bankAccountId, map.cash);
  const amount = money(tx.amount);
  const desc = tx.description || tx.number;
  let lines: JournalLineInput[];

  switch (tx.type) {
    case "deposit_customer":
      lines = [
        { accountId: bankGl, debit: amount, credit: "0.00", description: desc },
        {
          accountId: map.customers,
          debit: "0.00",
          credit: amount,
          description: tx.customerName ? `تحصيل بنكي من ${tx.customerName}` : "تحصيل عميل",
        },
      ];
      break;
    case "withdraw_customer":
      lines = [
        {
          accountId: map.customers,
          debit: amount,
          credit: "0.00",
          description: tx.customerName ? `رد بنكي للعميل ${tx.customerName}` : "رد بنكي لعميل",
        },
        { accountId: bankGl, debit: "0.00", credit: amount, description: desc },
      ];
      break;
    case "withdraw_supplier":
      lines = [
        {
          accountId: map.suppliers,
          debit: amount,
          credit: "0.00",
          description: tx.supplierName ? `سداد بنكي لمورد ${tx.supplierName}` : "سداد مورد",
        },
        { accountId: bankGl, debit: "0.00", credit: amount, description: desc },
      ];
      break;
    case "deposit":
      lines = [
        { accountId: bankGl, debit: amount, credit: "0.00", description: desc },
        { accountId: map.otherRevenue, debit: "0.00", credit: amount, description: "إيداع بنكي" },
      ];
      break;
    case "withdraw":
      lines = [
        { accountId: map.generalExpense, debit: amount, credit: "0.00", description: desc },
        { accountId: bankGl, debit: "0.00", credit: amount, description: "سحب بنكي" },
      ];
      break;
    default:
      return { skipped: true as const };
  }

  return createPostedJournal(db, tenantId, createdBy, {
    date: tx.date,
    description: `قيد تلقائي — حركة بنك ${tx.number}`,
    reference: tx.number,
    lines,
  });
}

export async function postSalesReturnJournal(
  db: Db,
  tenantId: number,
  createdBy: number | undefined,
  ret: {
    number: string;
    date: string;
    total: string;
    customerName?: string;
  },
) {
  const map = await resolveAccountMap(db, tenantId);
  const total = money(ret.total);

  return createPostedJournal(db, tenantId, createdBy, {
    date: ret.date,
    description: `قيد تلقائي — مردود مبيعات ${ret.number}`,
    reference: ret.number,
    lines: [
      {
        accountId: map.sales,
        debit: total,
        credit: "0.00",
        description: "عكس إيراد المبيعات",
      },
      {
        accountId: map.customers,
        debit: "0.00",
        credit: total,
        description: ret.customerName ? `عميل: ${ret.customerName}` : "مردود مبيعات",
      },
    ],
  });
}

export async function postPurchaseReturnJournal(
  db: Db,
  tenantId: number,
  createdBy: number | undefined,
  ret: {
    number: string;
    date: string;
    total: string;
    supplierName?: string;
    items?: { itemId: number; quantity: string }[];
  },
) {
  const map = await resolveAccountMap(db, tenantId);
  const total = money(ret.total);
  const lines: JournalLineInput[] = [
    {
      accountId: map.suppliers,
      debit: total,
      credit: "0.00",
      description: ret.supplierName ? `مورد: ${ret.supplierName}` : "مردود مشتريات",
    },
  ];

  let inventoryCredit = total;
  if (ret.items?.length) {
    const cogsAmount = await computeLinesCogs(db, tenantId, ret.items);
    if (cogsAmount > 0) inventoryCredit = money(cogsAmount);
  }

  lines.push({
    accountId: map.inventory,
    debit: "0.00",
    credit: inventoryCredit,
    description: "عكس المشتريات",
  });

  const diff = num(total) - num(inventoryCredit);
  if (diff > 0.005) {
    lines.push({
      accountId: map.otherRevenue,
      debit: "0.00",
      credit: money(diff),
      description: "فرق سعر المردود",
    });
  } else if (diff < -0.005) {
    lines.push({
      accountId: map.generalExpense,
      debit: money(Math.abs(diff)),
      credit: "0.00",
      description: "فرق تكلفة المردود",
    });
  }

  return createPostedJournal(db, tenantId, createdBy, {
    date: ret.date,
    description: `قيد تلقائي — مردود مشتريات ${ret.number}`,
    reference: ret.number,
    lines,
  });
}

export async function postCheckReceiveJournal(
  db: Db,
  tenantId: number,
  createdBy: number | undefined,
  chk: {
    number: string;
    type: "incoming" | "outgoing";
    date: string;
    amount: string;
    description?: string;
    customerName?: string;
    supplierName?: string;
  },
) {
  const map = await resolveAccountMap(db, tenantId);
  const amount = money(chk.amount);
  const reference = `${chk.number}-RECV`;

  let lines: JournalLineInput[];
  if (chk.type === "incoming") {
    lines = [
      {
        accountId: map.checksPortfolio,
        debit: amount,
        credit: "0.00",
        description: chk.description || `شيك وارد ${chk.number}`,
      },
      {
        accountId: map.customers,
        debit: "0.00",
        credit: amount,
        description: chk.customerName ? `من ${chk.customerName}` : "شيك وارد",
      },
    ];
  } else {
    lines = [
      {
        accountId: map.suppliers,
        debit: amount,
        credit: "0.00",
        description: chk.supplierName ? `لمورد ${chk.supplierName}` : "شيك صادر",
      },
      {
        accountId: map.checksPayable,
        debit: "0.00",
        credit: amount,
        description: chk.description || `شيك صادر ${chk.number}`,
      },
    ];
  }

  return createPostedJournal(db, tenantId, createdBy, {
    date: chk.date,
    description: `قيد تلقائي — استلام شيك ${chk.number}`,
    reference,
    lines,
  });
}

export async function postCheckDepositJournal(
  db: Db,
  tenantId: number,
  createdBy: number | undefined,
  chk: {
    number: string;
    date: string;
    amount: string;
    description?: string;
    customerName?: string;
    bankAccountName?: string;
  },
) {
  const map = await resolveAccountMap(db, tenantId);
  const amount = money(chk.amount);
  const reference = `${chk.number}-DEP`;
  if (await journalReferenceExists(db, tenantId, reference)) {
    return { skipped: true as const, reason: "already_posted" as const };
  }

  const bankLabel = chk.bankAccountName ? ` — ${chk.bankAccountName}` : "";
  const lines: JournalLineInput[] = [
    {
      accountId: map.checksDeposited,
      debit: amount,
      credit: "0.00",
      description: chk.description || `إيداع شيك ${chk.number}${bankLabel}`,
    },
    {
      accountId: map.checksPortfolio,
      debit: "0.00",
      credit: amount,
      description: chk.customerName ? `شيك ${chk.customerName}` : `تحويل لمحفظة البنك ${chk.number}`,
    },
  ];

  return createPostedJournal(db, tenantId, createdBy, {
    date: chk.date,
    description: `قيد تلقائي — إيداع شيك ${chk.number}${bankLabel}`,
    reference,
    lines,
  });
}

export async function postCheckClearJournal(
  db: Db,
  tenantId: number,
  createdBy: number | undefined,
  chk: {
    number: string;
    type: "incoming" | "outgoing";
    date: string;
    amount: string;
    description?: string;
    customerName?: string;
    supplierName?: string;
    /** إذا كان الشيك مودعاً مسبقاً يُصفّى من 1151 بدل 1150 */
    fromDeposited?: boolean;
    bankAccountId?: number;
  },
) {
  const map = await resolveAccountMap(db, tenantId);
  const { resolveBankGlAccountId } = await import("./bank-accounts-sync");
  const bankGl = await resolveBankGlAccountId(db, tenantId, chk.bankAccountId, map.cash);
  const amount = money(chk.amount);
  const reference = `${chk.number}-CLR`;
  if (await journalReferenceExists(db, tenantId, reference)) {
    return { skipped: true as const, reason: "already_posted" as const };
  }

  let lines: JournalLineInput[];
  if (chk.type === "incoming") {
    const creditAccount = chk.fromDeposited ? map.checksDeposited : map.checksPortfolio;
    lines = [
      { accountId: bankGl, debit: amount, credit: "0.00", description: "تحصيل شيك في البنك" },
      {
        accountId: creditAccount,
        debit: "0.00",
        credit: amount,
        description: chk.customerName ? `شيك ${chk.customerName}` : "شيك وارد",
      },
    ];
  } else {
    lines = [
      {
        accountId: map.checksPayable,
        debit: amount,
        credit: "0.00",
        description: chk.supplierName ? `سداد ${chk.supplierName}` : "شيك صادر",
      },
      { accountId: bankGl, debit: "0.00", credit: amount, description: "صرف شيك من البنك" },
    ];
  }

  return createPostedJournal(db, tenantId, createdBy, {
    date: chk.date,
    description: `قيد تلقائي — تحصيل شيك ${chk.number}`,
    reference,
    lines,
  });
}

export async function postCheckBounceJournal(
  db: Db,
  tenantId: number,
  createdBy: number | undefined,
  chk: {
    number: string;
    type: "incoming" | "outgoing";
    date: string;
    amount: string;
    description?: string;
    customerName?: string;
    supplierName?: string;
    fromDeposited?: boolean;
  },
) {
  const map = await resolveAccountMap(db, tenantId);
  const amount = money(chk.amount);
  const reference = `${chk.number}-BNC`;
  if (await journalReferenceExists(db, tenantId, reference)) {
    return { skipped: true as const, reason: "already_posted" as const };
  }

  let lines: JournalLineInput[];
  if (chk.type === "incoming") {
    const creditAccount = chk.fromDeposited ? map.checksDeposited : map.checksPortfolio;
    lines = [
      {
        accountId: map.customers,
        debit: amount,
        credit: "0.00",
        description: chk.customerName ? `شيك مرتجع — ${chk.customerName}` : "شيك مرتجع",
      },
      {
        accountId: creditAccount,
        debit: "0.00",
        credit: amount,
        description: chk.description || `إرجاع شيك ${chk.number}`,
      },
    ];
  } else {
    lines = [
      {
        accountId: map.checksPayable,
        debit: amount,
        credit: "0.00",
        description: `إلغاء شيك صادر ${chk.number}`,
      },
      {
        accountId: map.suppliers,
        debit: "0.00",
        credit: amount,
        description: chk.supplierName ? `شيك مرتجع — ${chk.supplierName}` : "شيك مرتجع",
      },
    ];
  }

  return createPostedJournal(db, tenantId, createdBy, {
    date: chk.date,
    description: `قيد تلقائي — إرجاع شيك ${chk.number}`,
    reference,
    lines,
  });
}

export async function computeLinesCogs(
  db: Db,
  tenantId: number,
  lines: { itemId: number; quantity: string }[],
) {
  const { computeLinesCogsValue } = await import("./inventory-cost");
  return computeLinesCogsValue(db, tenantId, lines);
}

export async function postSalesCogsJournal(
  db: Db,
  tenantId: number,
  createdBy: number | undefined,
  inv: {
    number: string;
    date: string;
    costCenterId?: number;
    items: { itemId: number; quantity: string }[];
  },
) {
  const cogsAmount = await computeLinesCogs(db, tenantId, inv.items);
  if (cogsAmount <= 0) return { skipped: true as const };

  const map = await resolveAccountMap(db, tenantId);
  const amount = money(cogsAmount);

  return createPostedJournal(db, tenantId, createdBy, {
    date: inv.date,
    description: `قيد تلقائي — تكلفة مبيعات ${inv.number}`,
    reference: `${inv.number}-COGS`,
    lines: [
      {
        accountId: map.cogs,
        debit: amount,
        credit: "0.00",
        description: "تكلفة البضاعة المباعة",
        costCenterId: inv.costCenterId,
      },
      {
        accountId: map.inventory,
        debit: "0.00",
        credit: amount,
        description: "تخفيض المخزون",
        costCenterId: inv.costCenterId,
      },
    ],
  });
}

export async function postSalesReturnCogsJournal(
  db: Db,
  tenantId: number,
  createdBy: number | undefined,
  ret: {
    number: string;
    date: string;
    costCenterId?: number;
    items: { itemId: number; quantity: string }[];
  },
) {
  const cogsAmount = await computeLinesCogs(db, tenantId, ret.items);
  if (cogsAmount <= 0) return { skipped: true as const };

  const map = await resolveAccountMap(db, tenantId);
  const amount = money(cogsAmount);

  return createPostedJournal(db, tenantId, createdBy, {
    date: ret.date,
    description: `قيد تلقائي — عكس تكلفة مردود ${ret.number}`,
    reference: `${ret.number}-COGS`,
    lines: [
      {
        accountId: map.inventory,
        debit: amount,
        credit: "0.00",
        description: "إعادة للمخزون",
        costCenterId: ret.costCenterId,
      },
      {
        accountId: map.cogs,
        debit: "0.00",
        credit: amount,
        description: "عكس تكلفة المبيعات",
        costCenterId: ret.costCenterId,
      },
    ],
  });
}

export function fiscalYearCloseReference(fiscalYearId: number) {
  return `FY-${fiscalYearId}-CLOSE`;
}

export async function postYearEndClosingJournal(
  db: Db,
  tenantId: number,
  createdBy: number | undefined,
  fy: { id: number; name: string; startDate: string | Date; endDate: string | Date },
) {
  const reference = fiscalYearCloseReference(fy.id);
  if (await journalReferenceExists(db, tenantId, reference)) {
    return { skipped: true as const, reason: "already_posted" as const };
  }

  const map = await resolveAccountMap(db, tenantId);
  const startDate = toDateStr(fy.startDate);
  const endDate = toDateStr(fy.endDate);
  const movement = await getPostedMovementByAccount(db, tenantId, { from: startDate, to: endDate });
  const accountsRows = await db
    .select({
      id: accounts.id,
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      isParent: accounts.isParent,
    })
    .from(accounts)
    .where(tenantWhere(accounts, tenantId, eq(accounts.isActive, true)));

  const lines: JournalLineInput[] = [];

  for (const a of accountsRows) {
    if (a.isParent) continue;
    const m = movement.get(a.id) || { debit: 0, credit: 0 };
    if (a.type === "revenue") {
      const balance = m.credit - m.debit;
      if (balance > 0.01) {
        lines.push({
          accountId: a.id,
          debit: money(balance),
          credit: "0.00",
          description: "إقفال حساب إيراد",
        });
        lines.push({
          accountId: map.retainedEarnings,
          debit: "0.00",
          credit: money(balance),
          description: `إقفال ${a.name}`,
        });
      }
    } else if (a.type === "expense") {
      const balance = m.debit - m.credit;
      if (balance > 0.01) {
        lines.push({
          accountId: map.retainedEarnings,
          debit: money(balance),
          credit: "0.00",
          description: `إقفال ${a.name}`,
        });
        lines.push({
          accountId: a.id,
          debit: "0.00",
          credit: money(balance),
          description: "إقفال حساب مصروف",
        });
      }
    }
  }

  if (lines.length < 2) {
    return { skipped: true as const, reason: "no_balances" as const };
  }

  return createPostedJournal(db, tenantId, createdBy, {
    date: endDate,
    description: `قيد إقفال السنة المالية — ${fy.name}`,
    reference,
    lines,
  });
}

export function fiscalYearOpenReference(fyId: number) {
  return `FY-${fyId}-OPEN`;
}

/** قيد افتتاحي — أرصدة المركز المالي في أول يوم من سنة مالية جديدة */
export async function postYearOpeningJournal(
  db: Db,
  tenantId: number,
  createdBy: number | undefined,
  fy: { id: number; name: string; startDate: string | Date },
  previousEndDate: string,
) {
  const reference = fiscalYearOpenReference(fy.id);
  if (await journalReferenceExists(db, tenantId, reference)) {
    return { skipped: true as const, reason: "already_posted" as const };
  }

  const balances = await getAccountBalancesAsOf(db, tenantId, previousEndDate);
  const lines: JournalLineInput[] = [];

  for (const a of balances) {
    if (a.isParent) continue;
    if (a.type === "revenue" || a.type === "expense") continue;
    const net = num(a.balance);
    if (Math.abs(net) < 0.01) continue;
    if (net > 0) {
      lines.push({
        accountId: a.id,
        debit: money(net),
        credit: "0.00",
        description: `رصيد افتتاحي — ${fy.name}`,
      });
    } else {
      lines.push({
        accountId: a.id,
        debit: "0.00",
        credit: money(-net),
        description: `رصيد افتتاحي — ${fy.name}`,
      });
    }
  }

  if (lines.length < 2) {
    return { skipped: true as const, reason: "no_balances" as const };
  }

  const startDate = toDateStr(fy.startDate);
  return createPostedJournal(db, tenantId, createdBy, {
    date: startDate,
    description: `قيد افتتاحي — ${fy.name}`,
    reference,
    lines,
  });
}

export async function postAssetSaleJournal(
  db: Db,
  tenantId: number,
  createdBy: number | undefined,
  sale: {
    assetId: number;
    assetName: string;
    date: string;
    saleAmount: string;
    bookValue: string;
    buyer?: string;
    settlementMethod?: "cash" | "bank";
    bankAccountId?: number;
  },
) {
  const map = await resolveAccountMap(db, tenantId);
  const rows = await db
    .select({ id: accounts.id, code: accounts.code, name: accounts.name, isParent: accounts.isParent })
    .from(accounts)
    .where(tenantWhere(accounts, tenantId, eq(accounts.isActive, true)));

  const fixedAssetAccount =
    matchAccount(rows, { codePrefix: "1201", nameIncludes: ["أصول ثابتة", "معدات", "fixed"] })
    ?? matchAccount(rows, { codePrefix: "120", nameIncludes: ["ثابتة"] });

  if (!fixedAssetAccount) {
    throw new Error("لم يُعثر على حساب الأصول الثابتة في شجرة الحسابات");
  }

  const settlementId =
    sale.settlementMethod === "bank"
      ? await resolveBankGlAccountId(db, tenantId, sale.bankAccountId, map.cash)
      : map.cash;

  const saleAmount = num(sale.saleAmount);
  const bookValue = num(sale.bookValue);
  const gain = saleAmount - bookValue;
  const reference = `ASSET-SALE-${sale.assetId}`;

  const lines: JournalLineInput[] = [
    {
      accountId: settlementId,
      debit: money(saleAmount),
      credit: "0.00",
      description: `تحصيل بيع أصل — ${sale.assetName}${sale.buyer ? ` — ${sale.buyer}` : ""}`,
    },
    {
      accountId: fixedAssetAccount,
      debit: "0.00",
      credit: money(bookValue),
      description: `إخراج أصل من السجل — ${sale.assetName}`,
    },
  ];

  if (gain > 0.005) {
    lines.push({
      accountId: map.otherRevenue,
      debit: "0.00",
      credit: money(gain),
      description: `ربح بيع أصل — ${sale.assetName}`,
    });
  } else if (gain < -0.005) {
    lines.push({
      accountId: map.generalExpense,
      debit: money(-gain),
      credit: "0.00",
      description: `خسارة بيع أصل — ${sale.assetName}`,
    });
  }

  return createPostedJournal(db, tenantId, createdBy, {
    date: sale.date,
    description: `بيع أصل ثابت — ${sale.assetName}`,
    reference,
    lines,
  });
}

export async function postCapitalMaintenanceJournal(
  db: Db,
  tenantId: number,
  createdBy: number | undefined,
  row: {
    maintenanceId: number;
    assetId: number;
    assetName: string;
    date: string;
    amount: string;
    description?: string;
  },
) {
  const map = await resolveAccountMap(db, tenantId);
  const rows = await db
    .select({ id: accounts.id, code: accounts.code, name: accounts.name, isParent: accounts.isParent })
    .from(accounts)
    .where(tenantWhere(accounts, tenantId, eq(accounts.isActive, true)));

  const fixedAssetAccount =
    matchAccount(rows, { codePrefix: "1201", nameIncludes: ["أصول ثابتة", "معدات", "fixed"] })
    ?? matchAccount(rows, { codePrefix: "120", nameIncludes: ["ثابتة"] });

  if (!fixedAssetAccount) {
    throw new Error("لم يُعثر على حساب الأصول الثابتة في شجرة الحسابات");
  }

  const amount = money(row.amount);
  const reference = `CAP-MAINT-${row.maintenanceId}`;

  return createPostedJournal(db, tenantId, createdBy, {
    date: row.date,
    description: `صيانة رأسمالية — ${row.assetName}`,
    reference,
    lines: [
      {
        accountId: fixedAssetAccount,
        debit: amount,
        credit: "0.00",
        description: row.description || `زيادة قيمة أصل — ${row.assetName}`,
      },
      {
        accountId: map.cash,
        debit: "0.00",
        credit: amount,
        description: `سداد صيانة رأسمالية — ${row.assetName}`,
      },
    ],
  });
}

async function resolveWipAccountId(db: Db, tenantId: number) {
  const rows = await db
    .select({ id: accounts.id, code: accounts.code, name: accounts.name, isParent: accounts.isParent })
    .from(accounts)
    .where(tenantWhere(accounts, tenantId, eq(accounts.isActive, true)));
  return (
    matchAccount(rows, { codePrefix: "1160", nameIncludes: ["تحت التشغيل", "wip", "work in progress"] })
    ?? matchAccount(rows, { nameIncludes: ["إنتاج تحت"] })
  );
}

export async function postProductionWipJournal(
  db: Db,
  tenantId: number,
  createdBy: number | undefined,
  order: { id: number; number: string; date: string; productName: string },
  totalMaterialCost: number,
) {
  if (totalMaterialCost <= 0) return { skipped: true as const };

  const map = await resolveAccountMap(db, tenantId);
  const wipAccount = await resolveWipAccountId(db, tenantId);
  if (!wipAccount) throw new Error("لم يُعثر على حساب إنتاج تحت التشغيل (1160)");

  const amount = money(totalMaterialCost);
  const reference = `PROD-WIP-${order.id}`;

  return createPostedJournal(db, tenantId, createdBy, {
    date: order.date,
    description: `صرف مواد لأمر تشغيل ${order.number} — ${order.productName}`,
    reference,
    lines: [
      {
        accountId: wipAccount,
        debit: amount,
        credit: "0.00",
        description: `مواد خام — ${order.number}`,
      },
      {
        accountId: map.inventory,
        debit: "0.00",
        credit: amount,
        description: `صرف مخزون للتشغيل — ${order.number}`,
      },
    ],
  });
}

export async function postProductionCompletionJournal(
  db: Db,
  tenantId: number,
  createdBy: number | undefined,
  order: { id: number; number: string; date: string; productName: string },
  totalMaterialCost: number,
) {
  if (totalMaterialCost <= 0) return { skipped: true as const };

  const map = await resolveAccountMap(db, tenantId);
  const wipAccount = await resolveWipAccountId(db, tenantId);
  if (!wipAccount) throw new Error("لم يُعثر على حساب إنتاج تحت التشغيل (1160)");

  const amount = money(totalMaterialCost);
  const reference = `PROD-COMPLETE-${order.id}`;

  return createPostedJournal(db, tenantId, createdBy, {
    date: order.date,
    description: `إتمام أمر تشغيل ${order.number} — ${order.productName}`,
    reference,
    lines: [
      {
        accountId: map.inventory,
        debit: amount,
        credit: "0.00",
        description: `منتج تام — ${order.productName}`,
      },
      {
        accountId: wipAccount,
        debit: "0.00",
        credit: amount,
        description: `إقفال WIP — ${order.number}`,
      },
    ],
  });
}

async function resolveOrCreateLoanAccount(
  db: Db,
  tenantId: number,
  kind: "receivable" | "payable",
) {
  const rows = await db
    .select({ id: accounts.id, code: accounts.code, name: accounts.name, isParent: accounts.isParent })
    .from(accounts)
    .where(tenantWhere(accounts, tenantId, eq(accounts.isActive, true)));

  if (kind === "receivable") {
    const found =
      matchAccount(rows, { codePrefix: "1220", nameIncludes: ["قروض ممنوحة", "قرض ممنوح"] })
      ?? matchAccount(rows, { nameIncludes: ["قروض مدينة", "loans receivable"] });
    if (found) return found;
    const [ins] = await db.insert(accounts).values(withTenantId(tenantId, {
      code: "1220",
      name: "قروض ممنوحة",
      type: "asset",
      isParent: false,
      isActive: true,
    }) as any);
    return (ins as { insertId: number }).insertId;
  }

  const found =
    matchAccount(rows, { codePrefix: "2150", nameIncludes: ["قروض مستلمة", "قرض مستلم"] })
    ?? matchAccount(rows, { nameIncludes: ["قروض دائنة", "loans payable"] });
  if (found) return found;
  const [ins] = await db.insert(accounts).values(withTenantId(tenantId, {
    code: "2150",
    name: "قروض مستلمة",
    type: "liability",
    isParent: false,
    isActive: true,
  }) as any);
  return (ins as { insertId: number }).insertId;
}

async function resolveSettlementAccountId(
  db: Db,
  tenantId: number,
  opts: { method: "cash" | "bank"; bankAccountId?: number },
) {
  const map = await resolveAccountMap(db, tenantId);
  if (opts.method === "bank") {
    return resolveBankGlAccountId(db, tenantId, opts.bankAccountId, map.cash);
  }
  return map.cash;
}

/** قيد صرف/استلام أصل القرض */
export async function postLoanOriginJournal(
  db: Db,
  tenantId: number,
  createdBy: number | undefined,
  loan: {
    number: string;
    type: "given" | "received";
    partyName: string;
    date: string;
    amount: string;
    settlementMethod: "cash" | "bank";
    bankAccountId?: number;
  },
) {
  const amount = money(loan.amount);
  if (num(amount) <= 0) return { skipped: true as const };
  const settlementId = await resolveSettlementAccountId(db, tenantId, {
    method: loan.settlementMethod,
    bankAccountId: loan.bankAccountId,
  });
  const loanAccountId = await resolveOrCreateLoanAccount(
    db,
    tenantId,
    loan.type === "given" ? "receivable" : "payable",
  );
  const reference = `LOAN-ORIGIN-${loan.number}`;

  const lines: JournalLineInput[] = loan.type === "given"
    ? [
        { accountId: loanAccountId, debit: amount, credit: "0.00", description: `قرض ممنوح — ${loan.partyName}` },
        { accountId: settlementId, debit: "0.00", credit: amount, description: `صرف أصل القرض ${loan.number}` },
      ]
    : [
        { accountId: settlementId, debit: amount, credit: "0.00", description: `استلام أصل القرض ${loan.number}` },
        { accountId: loanAccountId, debit: "0.00", credit: amount, description: `قرض مستلم — ${loan.partyName}` },
      ];

  return createPostedJournal(db, tenantId, createdBy, {
    date: loan.date,
    description: `قيد قرض — ${loan.number} — ${loan.partyName}`,
    reference,
    lines,
  });
}

/** قيد سداد قسط */
export async function postLoanInstallmentPayJournal(
  db: Db,
  tenantId: number,
  createdBy: number | undefined,
  opts: {
    loanNumber: string;
    loanType: "given" | "received";
    partyName: string;
    installmentId: number;
    date: string;
    amount: string;
    settlementMethod: "cash" | "bank";
    bankAccountId?: number;
  },
) {
  const amount = money(opts.amount);
  if (num(amount) <= 0) return { skipped: true as const };
  const settlementId = await resolveSettlementAccountId(db, tenantId, {
    method: opts.settlementMethod,
    bankAccountId: opts.bankAccountId,
  });
  const loanAccountId = await resolveOrCreateLoanAccount(
    db,
    tenantId,
    opts.loanType === "given" ? "receivable" : "payable",
  );
  const reference = `LOAN-INST-${opts.installmentId}`;

  const lines: JournalLineInput[] = opts.loanType === "given"
    ? [
        { accountId: settlementId, debit: amount, credit: "0.00", description: `تحصيل قسط — ${opts.loanNumber}` },
        { accountId: loanAccountId, debit: "0.00", credit: amount, description: `من ${opts.partyName}` },
      ]
    : [
        { accountId: loanAccountId, debit: amount, credit: "0.00", description: `سداد قسط — ${opts.loanNumber}` },
        { accountId: settlementId, debit: "0.00", credit: amount, description: `إلى ${opts.partyName}` },
      ];

  return createPostedJournal(db, tenantId, createdBy, {
    date: opts.date,
    description: `قسط قرض — ${opts.loanNumber} — ${opts.partyName}`,
    reference,
    lines,
  });
}

/** قيد حافز موظف (مصروف رواتب / صندوق أو بنك) */
export async function postHrIncentiveJournal(
  db: Db,
  tenantId: number,
  createdBy: number | undefined,
  opts: {
    incentiveId: number;
    employeeName: string;
    date: string;
    amount: string;
    reason?: string;
    settlementMethod?: "cash" | "bank";
    bankAccountId?: number;
  },
) {
  const amount = money(opts.amount);
  if (num(amount) <= 0) return { skipped: true as const };
  const map = await resolveAccountMap(db, tenantId);
  const settlementId = await resolveSettlementAccountId(db, tenantId, {
    method: opts.settlementMethod || "cash",
    bankAccountId: opts.bankAccountId,
  });
  const reference = `HR-INCENTIVE-${opts.incentiveId}`;
  return createPostedJournal(db, tenantId, createdBy, {
    date: opts.date,
    description: `حافز — ${opts.employeeName}${opts.reason ? ` — ${opts.reason}` : ""}`,
    reference,
    lines: [
      { accountId: map.salaries, debit: amount, credit: "0.00", description: `حافز — ${opts.employeeName}` },
      { accountId: settlementId, debit: "0.00", credit: amount, description: `صرف حافز` },
    ],
  });
}

/**
 * قيد مصروفات تحويل مخزني — مطابقة ميجا InventoryTransfer:
 * مدين: حساب الأرباح/الخسائر إن وُجد، وإلا المخزون (رسملة)
 * دائن: الحساب الدائن لكل مصروف (بعد تحويل العملة لسعر الصرف)
 */
export async function postStockTransferExpensesJournal(
  db: Db,
  tenantId: number,
  createdBy: number | undefined,
  opts: {
    id: number;
    number: string;
    date: string;
    plAccountId?: number | null;
    expenses: Array<{
      amount: string | number;
      exchangeRate?: string | number | null;
      creditAccountId: number;
      notes?: string | null;
    }>;
  },
) {
  if (!opts.expenses?.length) return { skipped: true as const };

  const map = await resolveAccountMap(db, tenantId);
  const debitAccountId = opts.plAccountId || map.inventory;
  const lines: JournalLineInput[] = [];

  for (const exp of opts.expenses) {
    const rate = exp.exchangeRate != null ? num(exp.exchangeRate) : 1;
    const amtEgp = num(exp.amount) * (rate || 1);
    if (amtEgp <= 0) continue;
    lines.push({
      accountId: debitAccountId,
      debit: money(amtEgp),
      credit: "0.00",
      description: exp.notes || `مصروفات تحويل ${opts.number}`,
    });
    lines.push({
      accountId: exp.creditAccountId,
      debit: "0.00",
      credit: money(amtEgp),
      description: exp.notes || `دائن مصروف تحويل ${opts.number}`,
    });
  }

  if (lines.length < 2) return { skipped: true as const };

  return createPostedJournal(db, tenantId, createdBy, {
    date: opts.date,
    description: `مصروفات تحويل مخزني ${opts.number}`,
    reference: `INV-XFER-EXP-${opts.id}`,
    lines,
  });
}

/**
 * قيد تسوية مخزنية — مطابقة ميجا InventoryCorrection عند وجود الحساب المقابل:
 * زيادة مخزون: مدين مخزون / دائن الحساب المقابل
 * نقص مخزون: مدين الحساب المقابل / دائن مخزون
 */
export async function postInventoryAdjustmentJournal(
  db: Db,
  tenantId: number,
  createdBy: number | undefined,
  opts: {
    id: number;
    number: string;
    date: string;
    oppositeAccountId: number;
    costCenterId?: number | null;
    /** صافي قيمة التسوية بالموجب = زيادة مخزون، بالسالب = نقص */
    netInventoryValue: number;
    description?: string;
  },
) {
  const value = Math.abs(num(opts.netInventoryValue));
  if (value <= 0) return { skipped: true as const };

  const map = await resolveAccountMap(db, tenantId);
  const amount = money(value);
  const reference = `INV-ADJ-${opts.id}`;
  const isIncrease = num(opts.netInventoryValue) > 0;
  const cc = opts.costCenterId ?? undefined;

  return createPostedJournal(db, tenantId, createdBy, {
    date: opts.date,
    description: opts.description || `تسوية مخزنية ${opts.number}`,
    reference,
    lines: isIncrease
      ? [
          { accountId: map.inventory, debit: amount, credit: "0.00", description: `زيادة مخزون — ${opts.number}`, costCenterId: cc },
          { accountId: opts.oppositeAccountId, debit: "0.00", credit: amount, description: `حساب مقابل تسوية — ${opts.number}`, costCenterId: cc },
        ]
      : [
          { accountId: opts.oppositeAccountId, debit: amount, credit: "0.00", description: `حساب مقابل تسوية — ${opts.number}`, costCenterId: cc },
          { accountId: map.inventory, debit: "0.00", credit: amount, description: `نقص مخزون — ${opts.number}`, costCenterId: cc },
        ],
  });
}
