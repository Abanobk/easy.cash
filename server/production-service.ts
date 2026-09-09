import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "./db";
import {
  items,
  itemWarehouseStock,
  productionOrderMaterials,
  productionOrders,
} from "../drizzle/schema";
import {
  cancelPostedJournalByReference,
  postProductionCompletionJournal,
  postProductionWipJournal,
} from "./auto-journal";
import { applyStockMovement } from "./inventory-stock";
import { assertDateNotInClosedPeriod } from "./fiscal-period-guard";
import { downstreamMessage, findDownstreamStockConsumers } from "./reversal-guards";
import { tenantWhere } from "./tenant-scope";

function num(v: unknown) {
  return Number(v ?? 0);
}

/**
 * أعمدة date() بترجع من drizzle/mysql2 كـ Date object، و`String(date).slice(0,10)`
 * بيقص السنة ("Tue Sep 01") فقيد اليومية بيفشل عند الإدراج.
 */
function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v || "").slice(0, 10);
}

/** كمية مادة خام مطلقة للأمر (سلوك Mega) مع هالك اختياري */
export function materialNeedWithScrap(absoluteQty: unknown, _orderQty: unknown, scrapPercent: unknown) {
  const base = num(absoluteQty);
  const scrap = num(scrapPercent);
  return base * (1 + scrap / 100);
}

export function scrapQtyFromLine(absoluteQty: unknown, _orderQty: unknown, scrapPercent: unknown) {
  const base = num(absoluteQty);
  return base * (num(scrapPercent) / 100);
}

export async function estimateOrderMaterialCost(
  db: Db,
  tenantId: number,
  orderId: number,
) {
  const materials = await db
    .select()
    .from(productionOrderMaterials)
    .where(tenantWhere(productionOrderMaterials, tenantId, eq(productionOrderMaterials.orderId, orderId)));

  if (materials.length === 0) return 0;

  const itemIds = materials.map((m) => m.itemId);
  const itemRows = await db
    .select({
      id: items.id,
      averageCost: items.averageCost,
      purchasePrice: items.purchasePrice,
    })
    .from(items)
    .where(tenantWhere(items, tenantId, inArray(items.id, itemIds)));

  const costMap = new Map(
    itemRows.map((i) => [i.id, num(i.averageCost) || num(i.purchasePrice)]),
  );

  const [order] = await db
    .select({ quantity: productionOrders.quantity })
    .from(productionOrders)
    .where(tenantWhere(productionOrders, tenantId, eq(productionOrders.id, orderId)));

  const orderQty = num(order?.quantity);
  let total = 0;
  for (const m of materials) {
    // الكمية مطلقة للأمر (Mega) — orderQty يُمرَّر للتوافق فقط
    const needed = materialNeedWithScrap(m.quantity, orderQty, m.scrapPercent);
    total += needed * (costMap.get(m.itemId) ?? 0);
  }
  return total;
}

/** تحديث متوسط تكلفة المنتج التام بعد الإنتاج (بدون لمس سعر الشراء) */
async function updateFinishedGoodsAverageCost(
  db: Db,
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
  // المخزون زاد بالفعل قبل الاستدعاء
  const oldQty = Math.max(0, num(item.currentStock) - newQty);
  const oldCost = num(item.averageCost) || num(item.purchasePrice);
  const totalQty = oldQty + newQty;
  const avg = totalQty > 0 ? (oldQty * oldCost + newQty * newUnitCost) / totalQty : newUnitCost;
  await db
    .update(items)
    .set({ averageCost: String(avg.toFixed(4)) } as any)
    .where(tenantWhere(items, tenantId, eq(items.id, itemId)));
}

/**
 * معكوس updateFinishedGoodsAverageCost: بنشيل دفعة (removedQty بتكلفة removedUnitCost) من متوسط
 * محسوب على stockAfter، ونرجّع المتوسط اللي كان قبلها. مضبوط تماماً طالما مفيش إنتاج/شراء تاني
 * للمنتج بعد الإتمام؛ لو حصل، بيكون تقريبياً — نفس التسامح المقبول في invoice-approval.ts.
 */
export function reverseWeightedAverage(
  stockAfter: number,
  curAvg: number,
  removedQty: number,
  removedUnitCost: number,
) {
  const remain = stockAfter - removedQty;
  if (remain <= 1e-9) return curAvg;
  return (stockAfter * curAvg - removedQty * removedUnitCost) / remain;
}

/** التحقق من توفر المواد قبل البدء */
export async function assertMaterialsAvailable(
  db: Db,
  tenantId: number,
  orderId: number,
) {
  const [order] = await db
    .select()
    .from(productionOrders)
    .where(tenantWhere(productionOrders, tenantId, eq(productionOrders.id, orderId)));
  if (!order) throw new Error("أمر التشغيل غير موجود");

  const materials = await db
    .select()
    .from(productionOrderMaterials)
    .where(tenantWhere(productionOrderMaterials, tenantId, eq(productionOrderMaterials.orderId, orderId)));

  if (!materials.length) throw new Error("أضف مواد خام للأمر قبل البدء");

  const itemIds = materials.map((m) => m.itemId);
  const itemRows = await db
    .select({ id: items.id, name: items.name, currentStock: items.currentStock })
    .from(items)
    .where(tenantWhere(items, tenantId, inArray(items.id, itemIds)));
  const stockMap = new Map(itemRows.map((i) => [i.id, i]));

  const orderQty = num(order.quantity);
  const shortages: string[] = [];
  for (const m of materials) {
    const needed = materialNeedWithScrap(m.quantity, orderQty, m.scrapPercent);
    const row = stockMap.get(m.itemId);
    const available = num(row?.currentStock);
    if (needed > available + 1e-9) {
      shortages.push(`${row?.name || `#${m.itemId}`}: مطلوب ${needed.toLocaleString("en-US")} · متاح ${available.toLocaleString("en-US")}`);
    }
  }
  if (shortages.length) {
    throw new Error(`رصيد غير كافٍ للمواد:\n${shortages.join("\n")}`);
  }
}

/** بدء التنفيذ: قيد WIP بقيمة المواد */
export async function startProductionOrder(
  db: Db,
  tenantId: number,
  orderId: number,
  createdBy?: number,
) {
  const [order] = await db
    .select()
    .from(productionOrders)
    .where(tenantWhere(productionOrders, tenantId, eq(productionOrders.id, orderId)));
  if (!order) throw new Error("أمر التشغيل غير موجود");
  if (order.status !== "draft") return { skipped: true as const };
  if (order.wipJournalId) return { skipped: true as const };

  await assertMaterialsAvailable(db, tenantId, orderId);

  const [product] = await db
    .select({ name: items.name })
    .from(items)
    .where(tenantWhere(items, tenantId, eq(items.id, order.productId)));

  const materialCost = await estimateOrderMaterialCost(db, tenantId, orderId);
  const journal = await postProductionWipJournal(
    db,
    tenantId,
    createdBy,
    {
      id: order.id,
      number: order.number,
      date: toDateStr(order.date),
      productName: product?.name ?? `#${order.productId}`,
    },
    materialCost,
  );

  await db
    .update(productionOrders)
    .set({
      status: "in_progress",
      wipCostAmount: materialCost.toFixed(2),
      wipJournalId: journal.skipped ? order.wipJournalId : journal.id,
      approvedBy: createdBy ?? order.approvedBy,
      approvedAt: new Date(),
    })
    .where(tenantWhere(productionOrders, tenantId, eq(productionOrders.id, orderId)));

  return { success: true as const, wipCost: materialCost };
}

/**
 * فك اعتماد أمر تشغيل والرجوع لمسودة قابلة للتعديل.
 * - من `in_progress`: إلغاء قيد WIP فقط (مفيش حركة مخزون حصلت عند البدء).
 * - من `completed`: عكس صرف الخامات واستلام المنتج التام ومتوسط التكلفة والقيدين
 *   (بشرط إن المنتج التام لسه موجود ومتصرفش في مستندات لاحقة).
 */
export async function unapproveProductionOrder(
  db: Db,
  tenantId: number,
  orderId: number,
) {
  const [order] = await db
    .select()
    .from(productionOrders)
    .where(tenantWhere(productionOrders, tenantId, eq(productionOrders.id, orderId)));
  if (!order) throw new Error("أمر التشغيل غير موجود");

  if (order.status === "completed") {
    return unapproveCompletedProductionOrder(db, tenantId, order);
  }
  if (order.status !== "in_progress") {
    throw new Error("الأمر ليس معتمداً أو مكتملاً");
  }

  // نفس صيغة المرجع المستخدمة في postProductionWipJournal — مش رقم الأمر نفسه
  await cancelPostedJournalByReference(db, tenantId, `PROD-WIP-${order.id}`);

  await db
    .update(productionOrders)
    .set({
      status: "draft",
      wipCostAmount: "0",
      wipJournalId: null,
      approvedBy: null,
      approvedAt: null,
    } as any)
    .where(tenantWhere(productionOrders, tenantId, eq(productionOrders.id, orderId)));

  return { success: true as const };
}

/** عكس completeProductionOrder بالكامل ورجوع الأمر لمسودة */
async function unapproveCompletedProductionOrder(
  db: Db,
  tenantId: number,
  order: typeof productionOrders.$inferSelect,
) {
  await assertDateNotInClosedPeriod(db, tenantId, toDateStr(order.date));

  const materials = await db
    .select()
    .from(productionOrderMaterials)
    .where(tenantWhere(productionOrderMaterials, tenantId, eq(productionOrderMaterials.orderId, order.id)));

  const orderQty = num(order.quantity);
  const warehouseId = order.warehouseId;

  // لقطة صنف المنتج التام قبل أي تعديل — لازمة لعكس متوسط التكلفة
  const [product] = await db
    .select({ currentStock: items.currentStock, averageCost: items.averageCost, purchasePrice: items.purchasePrice })
    .from(items)
    .where(tenantWhere(items, tenantId, eq(items.id, order.productId)));

  // حارس: المنتج التام لسه موجود في مخزن الأمر بالكمية المطلوب عكسها
  const [whRow] = await db
    .select({ quantity: itemWarehouseStock.quantity })
    .from(itemWarehouseStock)
    .where(tenantWhere(itemWarehouseStock, tenantId, and(
      eq(itemWarehouseStock.itemId, order.productId),
      eq(itemWarehouseStock.warehouseId, warehouseId),
    )));
  if (num(whRow?.quantity) < orderQty - 1e-4) {
    const docs = await findDownstreamStockConsumers(db, tenantId, {
      itemId: order.productId,
      afterDate: toDateStr(order.date),
      exclude: { type: "production", id: order.id },
    });
    throw new Error(downstreamMessage("لا يمكن فك اعتماد الأمر: المنتج التام استُهلك في مستندات لاحقة", docs));
  }

  // عكس الحركة المخزنية: المنتج التام يخرج، الخامات ترجع
  await applyStockMovement(db, tenantId, {
    itemId: order.productId,
    quantity: orderQty,
    direction: "out",
    warehouseId,
  });
  for (const m of materials) {
    const needed = materialNeedWithScrap(m.quantity, orderQty, m.scrapPercent);
    if (needed <= 0) continue;
    await applyStockMovement(db, tenantId, {
      itemId: m.itemId,
      quantity: needed,
      direction: "in",
      warehouseId: m.warehouseId ?? warehouseId,
    });
  }

  // عكس متوسط تكلفة المنتج التام
  const wipCost = num(order.wipCostAmount);
  const removedUnitCost = orderQty > 0 ? wipCost / orderQty : 0;
  if (product && orderQty > 0) {
    const stockAfter = num(product.currentStock); // الرصيد قبل العكس — لسه شامل هذا الأمر
    const curAvg = num(product.averageCost) || num(product.purchasePrice);
    const restored = reverseWeightedAverage(stockAfter, curAvg, orderQty, removedUnitCost);
    await db
      .update(items)
      .set({ averageCost: String(restored.toFixed(4)) } as any)
      .where(tenantWhere(items, tenantId, eq(items.id, order.productId)));
  }

  // إلغاء القيدين
  await cancelPostedJournalByReference(db, tenantId, `PROD-COMPLETE-${order.id}`);
  await cancelPostedJournalByReference(db, tenantId, `PROD-WIP-${order.id}`);

  await db
    .update(productionOrders)
    .set({
      status: "draft",
      wipCostAmount: "0",
      wipJournalId: null,
      completionJournalId: null,
      approvedBy: null,
      approvedAt: null,
    } as any)
    .where(tenantWhere(productionOrders, tenantId, eq(productionOrders.id, order.id)));

  return { success: true as const };
}

/** إتمام أمر تشغيل: صرف مواد خام وإضافة المنتج التام + قيد إقفال WIP + متوسط تكلفة */
export async function completeProductionOrder(
  db: Db,
  tenantId: number,
  orderId: number,
  createdBy?: number,
) {
  const [order] = await db
    .select()
    .from(productionOrders)
    .where(tenantWhere(productionOrders, tenantId, eq(productionOrders.id, orderId)));
  if (!order) throw new Error("أمر التشغيل غير موجود");
  if (order.status === "completed") return { skipped: true as const };
  if (order.status === "cancelled") throw new Error("لا يمكن إتمام أمر ملغي");
  if (order.status === "draft") {
    // ابدأ ثم أكمل في مسار واحد
    await startProductionOrder(db, tenantId, orderId, createdBy);
  }

  const [fresh] = await db
    .select()
    .from(productionOrders)
    .where(tenantWhere(productionOrders, tenantId, eq(productionOrders.id, orderId)));
  if (!fresh || fresh.status === "completed") return { skipped: true as const };

  const materials = await db
    .select()
    .from(productionOrderMaterials)
    .where(tenantWhere(productionOrderMaterials, tenantId, eq(productionOrderMaterials.orderId, orderId)));

  const orderQty = num(fresh.quantity);
  const warehouseId = fresh.warehouseId;

  for (const m of materials) {
    const needed = materialNeedWithScrap(m.quantity, orderQty, m.scrapPercent);
    if (needed <= 0) continue;
    // كل خامة ليها مخزن صرف خاص بيها لو اتحدد (مثلاً مخزن الخامات)، وإلا بترجع لمخزن الأمر
    // (زي ما كان قبل كده — أمر فيه مخزن واحد للخامة والمنتج التام).
    await applyStockMovement(db, tenantId, {
      itemId: m.itemId,
      quantity: needed,
      direction: "out",
      warehouseId: m.warehouseId ?? warehouseId,
    });
  }

  await applyStockMovement(db, tenantId, {
    itemId: fresh.productId,
    quantity: fresh.quantity,
    direction: "in",
    warehouseId,
  });

  const [product] = await db
    .select({ name: items.name })
    .from(items)
    .where(tenantWhere(items, tenantId, eq(items.id, fresh.productId)));

  const wipCost = num(fresh.wipCostAmount) || (await estimateOrderMaterialCost(db, tenantId, orderId));
  const unitCost = orderQty > 0 ? wipCost / orderQty : 0;
  if (orderQty > 0 && unitCost >= 0) {
    await updateFinishedGoodsAverageCost(db, tenantId, fresh.productId, orderQty, unitCost);
  }

  const completionJournal = await postProductionCompletionJournal(
    db,
    tenantId,
    createdBy,
    {
      id: fresh.id,
      number: fresh.number,
      date: toDateStr(fresh.date),
      productName: product?.name ?? `#${fresh.productId}`,
    },
    wipCost,
  );

  await db
    .update(productionOrders)
    .set({
      status: "completed",
      wipCostAmount: wipCost.toFixed(2),
      completionJournalId: completionJournal.skipped ? fresh.completionJournalId : completionJournal.id,
    })
    .where(tenantWhere(productionOrders, tenantId, eq(productionOrders.id, orderId)));

  return { success: true as const, wipCost, unitCost };
}

/** إلغاء أمر (مسودة أو قيد التنفيذ قبل صرف المخزون) */
export async function cancelProductionOrder(
  db: Db,
  tenantId: number,
  orderId: number,
) {
  const [order] = await db
    .select()
    .from(productionOrders)
    .where(tenantWhere(productionOrders, tenantId, eq(productionOrders.id, orderId)));
  if (!order) throw new Error("أمر التشغيل غير موجود");
  if (order.status === "completed") throw new Error("لا يمكن إلغاء أمر مكتمل");
  if (order.status === "cancelled") return { skipped: true as const };

  await db
    .update(productionOrders)
    .set({ status: "cancelled" })
    .where(tenantWhere(productionOrders, tenantId, eq(productionOrders.id, orderId)));

  return {
    success: true as const,
    note: order.wipJournalId
      ? "تم الإلغاء. يوجد قيد WIP مرحّل — راجعه من القيود إن لزم."
      : undefined,
  };
}
