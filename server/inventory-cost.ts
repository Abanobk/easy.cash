import { and, eq, inArray, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import {
  items,
  purchaseInvoiceItems,
  purchaseInvoices,
} from "../drizzle/schema";
import { tenantWhere } from "./tenant-scope";

function num(v: unknown) {
  return Number(v ?? 0);
}

/** متوسط تكلفة مرجّح من المشتريات والتسويات المخزنية */
export async function computeWeightedAverageCost(
  db: MySql2Database,
  tenantId: number,
  itemId: number,
): Promise<number> {
  const [item] = await db
    .select({ purchasePrice: items.purchasePrice, averageCost: items.averageCost })
    .from(items)
    .where(tenantWhere(items, tenantId, eq(items.id, itemId)));
  if (!item) return 0;
  if (item.averageCost != null && num(item.averageCost) > 0) {
    return num(item.averageCost);
  }

  const purchases = await db
    .select({
      qty: purchaseInvoiceItems.quantity,
      price: purchaseInvoiceItems.price,
    })
    .from(purchaseInvoiceItems)
    .innerJoin(purchaseInvoices, eq(purchaseInvoiceItems.invoiceId, purchaseInvoices.id))
    .where(
      tenantWhere(
        purchaseInvoiceItems,
        tenantId,
        and(
          eq(purchaseInvoiceItems.itemId, itemId),
          sql`${purchaseInvoices.status} IN ('confirmed', 'paid', 'partial')`,
        ),
      ),
    );

  let totalQty = 0;
  let totalValue = 0;
  for (const row of purchases) {
    const q = num(row.qty);
    const p = num(row.price);
    totalQty += q;
    totalValue += q * p;
  }

  if (totalQty > 0) return totalValue / totalQty;
  return num(item.purchasePrice);
}

export async function recalculateItemAverageCost(
  db: MySql2Database,
  tenantId: number,
  itemId: number,
) {
  const avg = await computeWeightedAverageCost(db, tenantId, itemId);
  await db
    .update(items)
    .set({ averageCost: String(avg.toFixed(4)) } as any)
    .where(tenantWhere(items, tenantId, eq(items.id, itemId)));
  return avg;
}

export async function computeLinesCogsValue(
  db: MySql2Database,
  tenantId: number,
  lines: { itemId: number; quantity: string }[],
) {
  if (!lines.length) return 0;
  const ids = [...new Set(lines.map((l) => l.itemId))];
  const costs = new Map<number, number>();
  for (const id of ids) {
    costs.set(id, await computeWeightedAverageCost(db, tenantId, id));
  }
  return lines.reduce((sum, l) => sum + (costs.get(l.itemId) ?? 0) * num(l.quantity), 0);
}

/** بعد فاتورة شراء: تحديث متوسط التكلفة المرجّح */
export async function updateAverageCostAfterPurchase(
  db: MySql2Database,
  tenantId: number,
  itemId: number,
  newQty: number,
  newUnitCost: number,
) {
  const [item] = await db
    .select({ currentStock: items.currentStock, averageCost: items.averageCost, purchasePrice: items.purchasePrice })
    .from(items)
    .where(tenantWhere(items, tenantId, eq(items.id, itemId)));
  if (!item) return;

  const oldQty = Math.max(0, num(item.currentStock) - newQty);
  const oldCost = num(item.averageCost) || num(item.purchasePrice);
  const totalQty = oldQty + newQty;
  const avg = totalQty > 0 ? (oldQty * oldCost + newQty * newUnitCost) / totalQty : newUnitCost;

  await db
    .update(items)
    .set({ averageCost: String(avg.toFixed(4)), purchasePrice: String(newUnitCost) } as any)
    .where(tenantWhere(items, tenantId, eq(items.id, itemId)));
}
