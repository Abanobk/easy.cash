import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";

/** حقول رأس فاتورة ميجا المشتركة (A1) */
export const invoiceMegaHeaderFields = {
  referenceNumber: z.string().optional(),
  cashAccountId: z.number().optional(),
  shippingAccountId: z.number().optional(),
  tempAddress: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
};

export const salesMegaHeaderFields = {
  ...invoiceMegaHeaderFields,
  deliveryType: z.enum(["full", "partial"]).default("full"),
  salesRepId: z.number().optional(),
  tempCustomerName: z.string().optional(),
};

export const purchaseMegaHeaderFields = {
  ...invoiceMegaHeaderFields,
  receiptType: z.enum(["full", "partial"]).default("full"),
  tempSupplierName: z.string().optional(),
};

/** حقول سطر الفاتورة الإضافية (A2 + A3 delivered qty) */
export const invoiceMegaLineFields = {
  cashDiscount: z.string().default("0"),
  priceType: z.string().optional(),
  unit: z.string().optional(),
  deliveredQuantity: z.string().optional(),
};

/** فلاتر قائمة ميجا (A5) */
export const invoiceListFilterFields = {
  search: z.string().optional(),
  status: z.string().optional(),
  page: z.number().default(1),
  limit: z.number().default(20),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  dueFrom: z.string().optional(),
  dueTo: z.string().optional(),
  branchId: z.number().optional(),
  currencyCode: z.string().optional(),
  collectionStatus: z.enum(["unpaid", "partial", "paid"]).optional(),
  deliveryStatus: z.enum(["undelivered", "partial", "delivered"]).optional(),
  number: z.string().optional(),
  referenceNumber: z.string().optional(),
  partyId: z.number().optional(),
  salesRepId: z.number().optional(),
  paymentType: z.enum(["cash", "credit"]).optional(),
};

export function collectionStatusSql(
  paidCol: any,
  remainingCol: any,
  totalCol: any,
  status: "unpaid" | "partial" | "paid",
): SQL {
  if (status === "paid") return sql`CAST(${paidCol} AS DECIMAL(15,2)) >= CAST(${totalCol} AS DECIMAL(15,2)) AND CAST(${totalCol} AS DECIMAL(15,2)) > 0`;
  if (status === "unpaid") return sql`CAST(${paidCol} AS DECIMAL(15,2)) <= 0`;
  return sql`CAST(${paidCol} AS DECIMAL(15,2)) > 0 AND CAST(${remainingCol} AS DECIMAL(15,2)) > 0`;
}
