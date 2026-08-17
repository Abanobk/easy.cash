import { and, eq, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Db } from "./db";
import { fiscalYears } from "../drizzle/schema";
import { tenantWhere } from "./tenant-scope";

function normalizeDate(date: string) {
  return date.slice(0, 10);
}

export async function isDateInClosedPeriod(
  db: Db,
  tenantId: number,
  date: string,
): Promise<boolean> {
  const d = new Date(normalizeDate(date));
  const [closed] = await db
    .select({ id: fiscalYears.id })
    .from(fiscalYears)
    .where(
      tenantWhere(
        fiscalYears,
        tenantId,
        and(
          eq(fiscalYears.status, "closed"),
          lte(fiscalYears.startDate, d),
          gte(fiscalYears.endDate, d),
        ),
      ),
    )
    .limit(1);
  return !!closed;
}

export async function assertDateNotInClosedPeriod(
  db: Db,
  tenantId: number,
  date: string,
) {
  if (await isDateInClosedPeriod(db, tenantId, date)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "الفترة المالية مغلقة — لا يمكن إجراء عمليات في هذا التاريخ",
    });
  }
}
