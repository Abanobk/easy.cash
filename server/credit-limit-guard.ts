import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Db } from "./db";
import { customers } from "../drizzle/schema";
import { tenantWhere } from "./tenant-scope";

export async function assertCustomerCreditLimit(
  db: Db,
  tenantId: number,
  customerId: number,
  additionalAmount: string,
) {
  const [customer] = await db
    .select({
      name: customers.name,
      balance: customers.balance,
      creditLimit: customers.creditLimit,
    })
    .from(customers)
    .where(tenantWhere(customers, tenantId, eq(customers.id, customerId)));

  if (!customer) {
    throw new TRPCError({ code: "NOT_FOUND", message: "العميل غير موجود" });
  }

  const limit = parseFloat(customer.creditLimit || "0");
  if (limit <= 0) return;

  const projected = parseFloat(customer.balance || "0") + parseFloat(additionalAmount);
  if (projected > limit + 0.001) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `تجاوز حد الائتمان للعميل «${customer.name}» — الحد ${limit.toLocaleString("ar-EG")} ج.م والمتوقع بعد الفاتورة ${projected.toLocaleString("ar-EG")} ج.م`,
    });
  }
}
