import { eq, gte, sql } from "drizzle-orm";
import type { Db } from "./db";
import {
  inventoryAdjustmentItems,
  inventoryAdjustments,
  productionOrderMaterials,
  productionOrders,
  purchaseReturnItems,
  purchaseReturns,
  salesInvoiceItems,
  salesInvoices,
  stockTransferItems,
  stockTransfers,
} from "../drizzle/schema";
import { tenantWhere } from "./tenant-scope";

/** أعمدة date() بترجع من drizzle/mysql2 ككائن Date — String(x).slice(0,10) بيفقد السنة */
function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v || "").slice(0, 10);
}

export type DownstreamDoc = {
  /** مفتاح النوع الداخلي — sales_invoice / purchase_return / production / stock_transfer / inventory_adjustment */
  type: string;
  /** تسمية عربية للعرض */
  typeLabel: string;
  number: string;
  date: string;
};

/**
 * المستندات اللي لسه معتمَدة وصرفت (أو نقلت) مخزون من `itemId` في تاريخ ≥ `afterDate` —
 * يعني اللي لازم يتفك اعتمادها قبل ما نقدر نعكس المستند الأصلي.
 *
 * استدلالي: مفيش سجل حركة مخزون في النظام، فبنطابق بالصنف + التاريخ + الحالة النشطة.
 * ممكن يطلّع مستند لمس نفس الصنف من رصيد تاني مش من ده — فالرسالة بتقول "راجع" مش "ده السبب المؤكد".
 * الحارس الفعلي هو فحص توفر المخزون؛ ده بس بيسمّي المرشّحين.
 */
export async function findDownstreamStockConsumers(
  db: Db,
  tenantId: number,
  opts: { itemId: number; afterDate: string; exclude?: { type: string; id: number } },
): Promise<DownstreamDoc[]> {
  const { itemId, afterDate, exclude } = opts;
  const out: DownstreamDoc[] = [];
  const excl = (type: string, id: number) => exclude && exclude.type === type && exclude.id === id;

  // فواتير البيع — بتصرف مخزون
  const salesRows = await db
    .select({ id: salesInvoices.id, number: salesInvoices.number, date: salesInvoices.date })
    .from(salesInvoices)
    .innerJoin(salesInvoiceItems, eq(salesInvoiceItems.invoiceId, salesInvoices.id))
    .where(
      tenantWhere(
        salesInvoices,
        tenantId,
        eq(salesInvoiceItems.itemId, itemId),
        gte(salesInvoices.date, afterDate as any),
        sql`${salesInvoices.status} IN ('confirmed','partial','paid')`,
      ),
    );
  for (const r of salesRows) {
    if (!excl("sales_invoice", r.id)) out.push({ type: "sales_invoice", typeLabel: "فاتورة بيع", number: r.number, date: toDateStr(r.date) });
  }

  // مردودات الشراء — بترجع البضاعة للمورد (تصرف من المخزن)
  const prRows = await db
    .select({ id: purchaseReturns.id, number: purchaseReturns.number, date: purchaseReturns.date })
    .from(purchaseReturns)
    .innerJoin(purchaseReturnItems, eq(purchaseReturnItems.returnId, purchaseReturns.id))
    .where(
      tenantWhere(
        purchaseReturns,
        tenantId,
        eq(purchaseReturnItems.itemId, itemId),
        gte(purchaseReturns.date, afterDate as any),
        eq(purchaseReturns.status, "confirmed"),
      ),
    );
  for (const r of prRows) {
    if (!excl("purchase_return", r.id)) out.push({ type: "purchase_return", typeLabel: "مردود شراء", number: r.number, date: toDateStr(r.date) });
  }

  // أوامر الإنتاج — بتستهلك الصنف كمادة خام عند الإتمام
  const prodRows = await db
    .select({ id: productionOrders.id, number: productionOrders.number, date: productionOrders.date })
    .from(productionOrders)
    .innerJoin(productionOrderMaterials, eq(productionOrderMaterials.orderId, productionOrders.id))
    .where(
      tenantWhere(
        productionOrders,
        tenantId,
        eq(productionOrderMaterials.itemId, itemId),
        gte(productionOrders.date, afterDate as any),
        sql`${productionOrders.status} IN ('in_progress','completed')`,
      ),
    );
  for (const r of prodRows) {
    if (!excl("production", r.id)) out.push({ type: "production", typeLabel: "أمر إنتاج", number: r.number, date: toDateStr(r.date) });
  }

  // التحويلات المخزنية — بتنقل الصنف من مخزن لمخزن
  const trRows = await db
    .select({ id: stockTransfers.id, number: stockTransfers.number, date: stockTransfers.date })
    .from(stockTransfers)
    .innerJoin(stockTransferItems, eq(stockTransferItems.transferId, stockTransfers.id))
    .where(
      tenantWhere(
        stockTransfers,
        tenantId,
        eq(stockTransferItems.itemId, itemId),
        gte(stockTransfers.date, afterDate as any),
        eq(stockTransfers.status, "confirmed"),
      ),
    );
  for (const r of trRows) {
    if (!excl("stock_transfer", r.id)) out.push({ type: "stock_transfer", typeLabel: "تحويل مخزني", number: r.number, date: toDateStr(r.date) });
  }

  // تسويات الجرد بالنقص
  const adjRows = await db
    .select({ id: inventoryAdjustments.id, number: inventoryAdjustments.number, date: inventoryAdjustments.date })
    .from(inventoryAdjustments)
    .innerJoin(inventoryAdjustmentItems, eq(inventoryAdjustmentItems.adjustmentId, inventoryAdjustments.id))
    .where(
      tenantWhere(
        inventoryAdjustments,
        tenantId,
        eq(inventoryAdjustmentItems.itemId, itemId),
        gte(inventoryAdjustments.date, afterDate as any),
        eq(inventoryAdjustments.status, "confirmed"),
        sql`COALESCE(${inventoryAdjustmentItems.difference}, 0) < 0`,
      ),
    );
  for (const r of adjRows) {
    if (!excl("inventory_adjustment", r.id)) out.push({ type: "inventory_adjustment", typeLabel: "تسوية جرد", number: r.number, date: toDateStr(r.date) });
  }

  // إزالة التكرار (نفس المستند فيه أكتر من سطر لنفس الصنف) + ترتيب بالتاريخ
  const seen = new Set<string>();
  return out
    .filter((d) => {
      const key = `${d.type}:${d.number}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** "<prefix> — راجع وافك اعتماد: فاتورة بيع S-00012، أمر إنتاج PO-00007" */
export function downstreamMessage(prefix: string, docs: DownstreamDoc[]): string {
  if (!docs.length) return prefix;
  const list = docs.map((d) => `${d.typeLabel} ${d.number}`).join("، ");
  return `${prefix} — راجع وافك اعتماد: ${list}`;
}
