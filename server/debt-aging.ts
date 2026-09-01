import { and, eq, or, sql } from "drizzle-orm";
import type { Db } from "./db";
import {
  customers,
  purchaseInvoices,
  salesInvoices,
  suppliers,
} from "../drizzle/schema";
import { tenantWhere } from "./tenant-scope";

const openSalesStatuses = or(
  eq(salesInvoices.status, "confirmed"),
  eq(salesInvoices.status, "partial"),
);

const openPurchaseStatuses = or(
  eq(purchaseInvoices.status, "confirmed"),
  eq(purchaseInvoices.status, "partial"),
);

export type AgingBucketKey = "current" | "days30" | "days60" | "days90" | "over90";

export type AgingBuckets = Record<AgingBucketKey, number> & { total: number };

function emptyBuckets(): AgingBuckets {
  return { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 };
}

/**
 * drizzle بيرجّع عمود date() كـ Date object مش نص. String(dateObj).slice(0,10) بيقص جزء من
 * toString() ("Sat Aug 01") قبل ما توصل للسنة، وإعادة تحويله لـDate تاني بيدّي سنة افتراضية غلط
 * (new Date("Sat Aug 01") = سنة 2001!) — يعني حساب أعمار الديون كان بيطلع غلط بعشرات السنين
 * لأي تاريخ جاي من قاعدة البيانات مباشرة. لازم نستخدم toISOString() للـDate object.
 */
function dateOnly(d: unknown) {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d || "").slice(0, 10);
}

function agingDays(referenceDate: string, today = new Date()) {
  const ref = new Date(referenceDate);
  return Math.floor((today.getTime() - ref.getTime()) / 86400000);
}

function addToBucket(buckets: AgingBuckets, days: number, amount: number) {
  if (amount <= 0) return;
  if (days <= 30) buckets.current += amount;
  else if (days <= 60) buckets.days30 += amount;
  else if (days <= 90) buckets.days60 += amount;
  else if (days <= 120) buckets.days90 += amount;
  else buckets.over90 += amount;
  buckets.total += amount;
}

export function bucketInvoiceAmount(
  invoiceDate: unknown,
  dueDate: unknown,
  remaining: unknown,
  bucket: "default" | "year" | "half" = "default",
  today = new Date(),
): { buckets: AgingBuckets; days: number } | null {
  const rem = parseFloat(String(remaining || "0"));
  if (rem <= 0) return null;

  const refDate = dueDate ? dateOnly(dueDate) : dateOnly(invoiceDate);
  const invDate = new Date(dateOnly(invoiceDate));
  const days = agingDays(refDate, today);
  const buckets = emptyBuckets();

  if (bucket === "half") {
    const month = invDate.getMonth();
    if (month < 6) buckets.current += rem;
    else buckets.days30 += rem;
    buckets.total = rem;
    return { buckets, days };
  }

  addToBucket(buckets, days, rem);
  return { buckets, days };
}

export async function customerDebtAgingReport(
  db: Db,
  tenantId: number,
  bucket: "default" | "year" | "half" = "default",
) {
  const today = new Date();
  const rows = await db
    .select({
      customerId: customers.id,
      customerName: customers.name,
      invoiceDate: salesInvoices.date,
      dueDate: salesInvoices.dueDate,
      remaining: salesInvoices.remaining,
    })
    .from(salesInvoices)
    .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
    .where(
      tenantWhere(
        salesInvoices,
        tenantId,
        and(openSalesStatuses, sql`COALESCE(${salesInvoices.remaining}, 0) > 0`),
      ),
    )
    .orderBy(customers.name);

  if (bucket === "year") {
    const map = new Map<number, { customerName: string; years: Record<string, number> }>();
    for (const r of rows) {
      const rem = parseFloat(String(r.remaining || "0"));
      if (rem <= 0) continue;
      const year = String(new Date(dateOnly(r.invoiceDate)).getFullYear());
      const entry = map.get(r.customerId!) || { customerName: r.customerName, years: {} };
      entry.years[year] = (entry.years[year] || 0) + rem;
      map.set(r.customerId!, entry);
    }
    const allYears = new Set<string>();
    for (const v of map.values()) Object.keys(v.years).forEach((y) => allYears.add(y));
    const sortedYears = Array.from(allYears).sort();
    return Array.from(map.values()).map((v) => {
      const row: Record<string, unknown> = { customerName: v.customerName };
      let total = 0;
      for (const y of sortedYears) {
        const amt = v.years[y] || 0;
        row[y] = amt;
        total += amt;
      }
      row.total = total;
      return row;
    });
  }

  const map = new Map<number, AgingBuckets & { customerName: string }>();
  for (const r of rows) {
    const result = bucketInvoiceAmount(r.invoiceDate, r.dueDate, r.remaining, bucket, today);
    if (!result) continue;
    const entry = map.get(r.customerId!) || { ...emptyBuckets(), customerName: r.customerName };
    for (const key of ["current", "days30", "days60", "days90", "over90"] as AgingBucketKey[]) {
      entry[key] += result.buckets[key];
    }
    entry.total += result.buckets.total;
    map.set(r.customerId!, entry);
  }

  const customerOpenings = await db
    .select({
      customerId: customers.id,
      customerName: customers.name,
      openingBalance: customers.openingBalance,
    })
    .from(customers)
    .where(tenantWhere(customers, tenantId, sql`COALESCE(${customers.openingBalance}, 0) <> 0`));

  for (const c of customerOpenings) {
    const amt = parseFloat(String(c.openingBalance || "0"));
    if (amt <= 0) continue;
    const entry = map.get(c.customerId) || { ...emptyBuckets(), customerName: c.customerName };
    entry.current += amt;
    entry.total += amt;
    map.set(c.customerId, entry);
  }

  return Array.from(map.values()).map((v) => ({
    customerName: v.customerName,
    current: v.current,
    days30: v.days30,
    days60: v.days60,
    days90: v.days90,
    over90: v.over90,
    total: v.total,
    ...(bucket === "half" ? { firstHalf: v.current, secondHalf: v.days30 } : {}),
  }));
}

export async function supplierDebtAgingReport(
  db: Db,
  tenantId: number,
  bucket: "default" | "year" | "half" = "default",
) {
  const today = new Date();
  const rows = await db
    .select({
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      invoiceDate: purchaseInvoices.date,
      dueDate: purchaseInvoices.dueDate,
      remaining: purchaseInvoices.remaining,
    })
    .from(purchaseInvoices)
    .innerJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
    .where(
      tenantWhere(
        purchaseInvoices,
        tenantId,
        and(openPurchaseStatuses, sql`COALESCE(${purchaseInvoices.remaining}, 0) > 0`),
      ),
    )
    .orderBy(suppliers.name);

  if (bucket === "year") {
    const map = new Map<number, { supplierName: string; years: Record<string, number> }>();
    for (const r of rows) {
      const rem = parseFloat(String(r.remaining || "0"));
      if (rem <= 0) continue;
      const year = String(new Date(dateOnly(r.invoiceDate)).getFullYear());
      const entry = map.get(r.supplierId!) || { supplierName: r.supplierName, years: {} };
      entry.years[year] = (entry.years[year] || 0) + rem;
      map.set(r.supplierId!, entry);
    }
    const allYears = new Set<string>();
    for (const v of map.values()) Object.keys(v.years).forEach((y) => allYears.add(y));
    const sortedYears = Array.from(allYears).sort();
    return Array.from(map.values()).map((v) => {
      const row: Record<string, unknown> = { supplierName: v.supplierName };
      let total = 0;
      for (const y of sortedYears) {
        const amt = v.years[y] || 0;
        row[y] = amt;
        total += amt;
      }
      row.total = total;
      return row;
    });
  }

  const map = new Map<number, AgingBuckets & { supplierName: string }>();
  for (const r of rows) {
    const result = bucketInvoiceAmount(r.invoiceDate, r.dueDate, r.remaining, bucket, today);
    if (!result) continue;
    const entry = map.get(r.supplierId!) || { ...emptyBuckets(), supplierName: r.supplierName };
    for (const key of ["current", "days30", "days60", "days90", "over90"] as AgingBucketKey[]) {
      entry[key] += result.buckets[key];
    }
    entry.total += result.buckets.total;
    map.set(r.supplierId!, entry);
  }

  // أضف الرصيد الافتتاحي للموردين (حتى بدون فواتير مفتوحة)
  const supplierOpenings = await db
    .select({
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      openingBalance: suppliers.openingBalance,
    })
    .from(suppliers)
    .where(tenantWhere(suppliers, tenantId, sql`COALESCE(${suppliers.openingBalance}, 0) <> 0`));

  for (const s of supplierOpenings) {
    const amt = parseFloat(String(s.openingBalance || "0"));
    if (amt <= 0) continue;
    const entry = map.get(s.supplierId) || { ...emptyBuckets(), supplierName: s.supplierName };
    // بدون تاريخ فاتورة: يُحسب ضمن الجاري (رصيد افتتاحي قائم)
    entry.current += amt;
    entry.total += amt;
    map.set(s.supplierId, entry);
  }

  return Array.from(map.values()).map((v) => ({
    supplierName: v.supplierName,
    current: v.current,
    days30: v.days30,
    days60: v.days60,
    days90: v.days90,
    over90: v.over90,
    total: v.total,
    ...(bucket === "half" ? { firstHalf: v.current, secondHalf: v.days30 } : {}),
  }));
}

export async function getDebtAgingSummary(db: Db, tenantId: number) {
  const today = new Date();

  const salesRows = await db
    .select({
      customerId: customers.id,
      customerName: customers.name,
      invoiceId: salesInvoices.id,
      invoiceNumber: salesInvoices.number,
      invoiceDate: salesInvoices.date,
      dueDate: salesInvoices.dueDate,
      remaining: salesInvoices.remaining,
    })
    .from(salesInvoices)
    .innerJoin(customers, eq(salesInvoices.customerId, customers.id))
    .where(
      tenantWhere(
        salesInvoices,
        tenantId,
        and(openSalesStatuses, sql`COALESCE(${salesInvoices.remaining}, 0) > 0`),
      ),
    );

  const purchaseRows = await db
    .select({
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      invoiceId: purchaseInvoices.id,
      invoiceNumber: purchaseInvoices.number,
      invoiceDate: purchaseInvoices.date,
      dueDate: purchaseInvoices.dueDate,
      remaining: purchaseInvoices.remaining,
    })
    .from(purchaseInvoices)
    .innerJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
    .where(
      tenantWhere(
        purchaseInvoices,
        tenantId,
        and(openPurchaseStatuses, sql`COALESCE(${purchaseInvoices.remaining}, 0) > 0`),
      ),
    );

  const customerBuckets = emptyBuckets();
  const supplierBuckets = emptyBuckets();
  const overdueCustomers: {
    customerId: number;
    customerName: string;
    invoiceNumber: string;
    invoiceId: number;
    remaining: number;
    days: number;
  }[] = [];
  const overdueSuppliers: {
    supplierId: number;
    supplierName: string;
    invoiceNumber: string;
    invoiceId: number;
    remaining: number;
    days: number;
  }[] = [];

  for (const r of salesRows) {
    const result = bucketInvoiceAmount(r.invoiceDate, r.dueDate, r.remaining, "default", today);
    if (!result) continue;
    for (const key of ["current", "days30", "days60", "days90", "over90"] as AgingBucketKey[]) {
      customerBuckets[key] += result.buckets[key];
    }
    customerBuckets.total += result.buckets.total;
    if (result.days > 0) {
      overdueCustomers.push({
        customerId: r.customerId,
        customerName: r.customerName,
        invoiceNumber: r.invoiceNumber,
        invoiceId: r.invoiceId,
        remaining: parseFloat(String(r.remaining || "0")),
        days: result.days,
      });
    }
  }

  for (const r of purchaseRows) {
    const result = bucketInvoiceAmount(r.invoiceDate, r.dueDate, r.remaining, "default", today);
    if (!result) continue;
    for (const key of ["current", "days30", "days60", "days90", "over90"] as AgingBucketKey[]) {
      supplierBuckets[key] += result.buckets[key];
    }
    supplierBuckets.total += result.buckets.total;
    if (result.days > 0) {
      overdueSuppliers.push({
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        invoiceNumber: r.invoiceNumber,
        invoiceId: r.invoiceId,
        remaining: parseFloat(String(r.remaining || "0")),
        days: result.days,
      });
    }
  }

  // أرصدة افتتاحية بدون فواتير مفتوحة
  const customerOpenings = await db
    .select({ openingBalance: customers.openingBalance })
    .from(customers)
    .where(tenantWhere(customers, tenantId, sql`COALESCE(${customers.openingBalance}, 0) <> 0`));
  for (const c of customerOpenings) {
    const amt = parseFloat(String(c.openingBalance || "0"));
    if (amt <= 0) continue;
    customerBuckets.current += amt;
    customerBuckets.total += amt;
  }
  const supplierOpenings = await db
    .select({ openingBalance: suppliers.openingBalance })
    .from(suppliers)
    .where(tenantWhere(suppliers, tenantId, sql`COALESCE(${suppliers.openingBalance}, 0) <> 0`));
  for (const s of supplierOpenings) {
    const amt = parseFloat(String(s.openingBalance || "0"));
    if (amt <= 0) continue;
    supplierBuckets.current += amt;
    supplierBuckets.total += amt;
  }

  overdueCustomers.sort((a, b) => b.days - a.days || b.remaining - a.remaining);
  overdueSuppliers.sort((a, b) => b.days - a.days || b.remaining - a.remaining);

  return {
    customers: customerBuckets,
    suppliers: supplierBuckets,
    topOverdueCustomers: overdueCustomers.slice(0, 8),
    topOverdueSuppliers: overdueSuppliers.slice(0, 8),
  };
}
