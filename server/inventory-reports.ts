import { and, eq, inArray, like, or, gte, lte } from "drizzle-orm";
import type { Db } from "./db";
import {
  customers,
  inventoryAdjustmentItems,
  inventoryAdjustments,
  itemCategories,
  items,
  itemWarehouseStock,
  itemBatches,
  purchaseInvoiceItems,
  purchaseInvoices,
  purchaseReturnItems,
  purchaseReturns,
  salesInvoiceItems,
  salesInvoices,
  salesReturnItems,
  salesReturns,
  stockTransferItems,
  stockTransfers,
  suppliers,
  warehouses,
  beginningInventory,
  productionOrderMaterials,
  productionOrders,
} from "../drizzle/schema";
import { tenantWhere } from "./tenant-scope";

export type InventoryReportFilters = {
  tenantId: number;
  dateFrom?: string;
  dateTo?: string;
  warehouseId?: number;
  warehouseIds?: number[];
  /** فلتر فرع → يُحوَّل لمخازن الفرع */
  branchId?: number;
  categoryId?: number;
  itemId?: number;
  search?: string;
  staleDays?: number;
  batchNumber?: string;
  expiryFrom?: string;
  expiryTo?: string;
};

function warehouseAllowed(warehouseId: number | null | undefined, filters: InventoryReportFilters) {
  if (filters.warehouseId != null) return warehouseId === filters.warehouseId;
  if (filters.warehouseIds !== undefined) {
    return warehouseId != null && filters.warehouseIds.includes(warehouseId);
  }
  return true;
}

/** يحوّل اختيار الفرع إلى قائمة مخازن (مع احترام نطاق المخازن إن وُجد) */
export async function expandInventoryBranchFilter(
  db: Db,
  filters: InventoryReportFilters,
): Promise<InventoryReportFilters> {
  if (filters.warehouseId != null || filters.branchId == null) return filters;
  const rows = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(tenantWhere(warehouses, filters.tenantId, eq(warehouses.branchId, filters.branchId)));
  let ids = rows.map((r) => r.id);
  if (filters.warehouseIds?.length) {
    const allowed = new Set(filters.warehouseIds);
    ids = ids.filter((id) => allowed.has(id));
  }
  return { ...filters, warehouseIds: ids };
}

export type InventoryMovementRow = {
  date: string;
  documentType: string;
  documentTypeLabel: string;
  documentNumber: string;
  documentId: number;
  warehouseId: number | null;
  warehouseName: string;
  itemId: number;
  itemCode: string;
  itemName: string;
  categoryName: string;
  unit: string;
  partyName: string;
  quantityIn: number;
  quantityOut: number;
  unitCost: number;
  totalValue: number;
  batchNumber?: string;
};

/**
 * صفوف مطابقة لأعمدة ميجا في تقرير «حركة تفصيلية للاصناف»
 * (من ملف التصدير الفعلي — بدون اختراع عناوين).
 */
export type MegaItemMovementDetailRow = {
  date: string;
  documentNumber: string;
  batchNumber: string;
  quantityIn: number;
  quantityOut: number;
  balanceQty: number;
  lineValue: number;
  balanceValue: number;
  unitCostIn: number;
  unitCostOut: number;
  fromLocation: string;
  toLocation: string;
  itemId: number;
  itemCode: string;
  itemName: string;
  unit: string;
};

/** تسميات «رقم المستند» كما في تصدير ميجا (حركة تفصيلية للاصناف.xlsx) */
const DOC_LABELS: Record<string, string> = {
  purchase: "فاتورة مشتريات",
  sale: "فاتورة مبيعات",
  purchase_return: "فاتورة مردود مشتريات",
  sale_return: "فاتورة مردود مبيعات",
  transfer_in: "تحويل مخزني",
  transfer_out: "تحويل مخزني",
  adjustment: "تسوية مخزنية",
  production_in: "امر انتاج",
  production_out: "امر انتاج",
};

function dayBeforeIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** من/إلي حسب نوع الحركة — مطابق لعينات ملف ميجا */
function megaFromTo(
  m: InventoryMovementRow,
  qtyIn: number,
  qtyOut: number,
): { fromLocation: string; toLocation: string } {
  const wh = m.warehouseName || "";
  const party = m.partyName && m.partyName !== "—" ? m.partyName : "";
  switch (m.documentType) {
    case "transfer_out":
      return { fromLocation: wh, toLocation: party };
    case "transfer_in":
      // partyName = مخزن المصدر، warehouseName = مخزن الوجهة
      return { fromLocation: party, toLocation: wh };
    case "production_out":
      return { fromLocation: wh, toLocation: "" };
    case "production_in":
      return { fromLocation: "", toLocation: wh };
    case "purchase":
    case "sale_return":
      return { fromLocation: party, toLocation: wh };
    case "sale":
    case "purchase_return":
      return { fromLocation: wh, toLocation: party };
    case "adjustment":
      if (qtyOut > 0) return { fromLocation: wh, toLocation: party };
      if (qtyIn > 0) return { fromLocation: party, toLocation: wh };
      return { fromLocation: wh, toLocation: party };
    default:
      if (qtyIn > 0) return { fromLocation: party, toLocation: wh };
      if (qtyOut > 0) return { fromLocation: wh, toLocation: party };
      return { fromLocation: wh, toLocation: party };
  }
}

/** يحوّل حركات Easy إلى شكل أعمدة ميجا مع رصيد كمّي/قيمة تراكمي لكل صنف */
export function toMegaItemMovementDetailRows(
  movements: InventoryMovementRow[],
  openings?: Map<number, { qty: number; val: number }>,
): MegaItemMovementDetailRow[] {
  const sorted = [...movements].sort((a, b) => {
    const byItem = String(a.itemCode || "").localeCompare(String(b.itemCode || ""), "en", { numeric: true })
      || String(a.itemName || "").localeCompare(String(b.itemName || ""), "ar");
    if (byItem !== 0) return byItem;
    const byDate = String(a.date).localeCompare(String(b.date));
    if (byDate !== 0) return byDate;
    return (a.documentId || 0) - (b.documentId || 0);
  });

  const qtyBal = new Map<number, number>();
  const valBal = new Map<number, number>();
  if (openings) {
    for (const [itemId, o] of openings) {
      qtyBal.set(itemId, num(o.qty));
      valBal.set(itemId, num(o.val));
    }
  }
  const out: MegaItemMovementDetailRow[] = [];

  for (const m of sorted) {
    const qtyIn = num(m.quantityIn);
    const qtyOut = num(m.quantityOut);
    const unitCost = num(m.unitCost);
    // ميجا: القيمة بإشارة (سالب للصرف)
    const lineValue = qtyIn > 0 ? qtyIn * unitCost : qtyOut > 0 ? -(qtyOut * unitCost) : num(m.totalValue);
    const nextQty = (qtyBal.get(m.itemId) || 0) + qtyIn - qtyOut;
    const nextVal = (valBal.get(m.itemId) || 0) + lineValue;
    qtyBal.set(m.itemId, nextQty);
    valBal.set(m.itemId, nextVal);

    const { fromLocation, toLocation } = megaFromTo(m, qtyIn, qtyOut);
    // ميجا: عمود «رقم المستند» يعرض نوع المستند (امر انتاج / فاتورة مبيعات / …)
    const documentNumber = m.documentTypeLabel || m.documentNumber || "";

    out.push({
      date: m.date,
      documentNumber,
      batchNumber: m.batchNumber || "",
      quantityIn: qtyIn,
      quantityOut: qtyOut,
      balanceQty: nextQty,
      lineValue,
      balanceValue: nextVal,
      unitCostIn: qtyIn > 0 ? unitCost : 0,
      unitCostOut: qtyOut > 0 ? unitCost : 0,
      fromLocation,
      toLocation,
      itemId: m.itemId,
      itemCode: m.itemCode,
      itemName: m.itemName,
      unit: m.unit,
    });
  }

  return out;
}

/**
 * رصيد سابق لكل صنف قبل dateFrom = مخزون أول المدة + صافي الحركات حتى اليوم السابق.
 */
export async function computeItemMovementOpenings(
  db: Db,
  filters: InventoryReportFilters,
): Promise<Map<number, { qty: number; val: number }>> {
  const map = new Map<number, { qty: number; val: number }>();
  if (!filters.dateFrom) return map;
  const dateFrom = filters.dateFrom;
  filters = await expandInventoryBranchFilter(db, filters);
  const asOf = dayBeforeIso(dateFrom);
  const add = (itemId: number, qty: number, val: number) => {
    const cur = map.get(itemId) || { qty: 0, val: 0 };
    cur.qty += qty;
    cur.val += val;
    map.set(itemId, cur);
  };

  const biRows = await db.select({
    itemId: beginningInventory.itemId,
    warehouseId: beginningInventory.warehouseId,
    quantity: beginningInventory.quantity,
    unitCost: beginningInventory.unitCost,
    categoryId: items.categoryId,
    code: items.code,
    name: items.name,
    barcode: items.barcode,
    purchasePrice: items.purchasePrice,
    averageCost: items.averageCost,
  }).from(beginningInventory)
    .innerJoin(items, and(eq(beginningInventory.itemId, items.id), eq(items.isActive, true)))
    .where(tenantWhere(beginningInventory, filters.tenantId, lte(beginningInventory.date, asOf as any)));

  const categoryIdMap = new Map(biRows.map((r) => [r.itemId, r.categoryId ?? null]));
  for (const r of biRows) {
    if (!matchesItemFilters(
      { itemId: r.itemId, categoryId: r.categoryId, itemName: r.name, itemCode: r.code || "", barcode: r.barcode || "" },
      filters,
      categoryIdMap,
    )) continue;
    if (!warehouseAllowed(r.warehouseId, filters)) continue;
    const qty = num(r.quantity);
    const unitCost = num(r.unitCost) || num(r.averageCost) || num(r.purchasePrice);
    add(r.itemId, qty, qty * unitCost);
  }

  const prior = await collectInventoryMovements(db, {
    ...filters,
    dateFrom: undefined,
    dateTo: asOf,
  });
  for (const m of prior) {
    const qtyIn = num(m.quantityIn);
    const qtyOut = num(m.quantityOut);
    const unitCost = num(m.unitCost);
    const lineValue = qtyIn > 0 ? qtyIn * unitCost : qtyOut > 0 ? -(qtyOut * unitCost) : num(m.totalValue);
    add(m.itemId, qtyIn - qtyOut, lineValue);
  }

  return map;
}

function num(v: unknown) {
  return Number(v ?? 0);
}

function dateStr(v: unknown) {
  if (!v) return "";
  // Date object من drizzle: String() بيدي "... GMT+0000 ..." والـ split("T") بيقطع عند GMT
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  return s.includes("T") ? s.split("T")[0] : s.slice(0, 10);
}

function inDateRange(date: string, from?: string, to?: string) {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function matchesItemFilters(
  row: { itemId: number; categoryId?: number | null; itemName?: string; itemCode?: string; barcode?: string },
  filters: InventoryReportFilters,
  categoryMap: Map<number, number | null>,
) {
  if (filters.itemId && row.itemId !== filters.itemId) return false;
  if (filters.categoryId && categoryMap.get(row.itemId) !== filters.categoryId) return false;
  if (filters.search) {
    const q = filters.search.toLowerCase();
    const name = (row.itemName || "").toLowerCase();
    const code = (row.itemCode || "").toLowerCase();
    const barcode = (row.barcode || "").toLowerCase();
    if (!name.includes(q) && !code.includes(q) && !barcode.includes(q)) return false;
  }
  return true;
}

export async function collectInventoryMovements(
  db: Db,
  filters: InventoryReportFilters,
): Promise<InventoryMovementRow[]> {
  filters = await expandInventoryBranchFilter(db, filters);
  const { tenantId, dateFrom, dateTo } = filters;

  const [itemRows, categoryRows, warehouseRows] = await Promise.all([
    db.select({
      id: items.id,
      code: items.code,
      name: items.name,
      barcode: items.barcode,
      unit: items.unit,
      categoryId: items.categoryId,
      purchasePrice: items.purchasePrice,
    }).from(items).where(tenantWhere(items, tenantId)),
    db.select({ id: itemCategories.id, name: itemCategories.name })
      .from(itemCategories).where(tenantWhere(itemCategories, tenantId)),
    db.select({ id: warehouses.id, name: warehouses.name })
      .from(warehouses).where(tenantWhere(warehouses, tenantId)),
  ]);

  const itemMap = new Map(itemRows.map((i) => [i.id, i]));
  const categoryNameMap = new Map(categoryRows.map((c) => [c.id, c.name]));
  const categoryIdMap = new Map(itemRows.map((i) => [i.id, i.categoryId ?? null]));
  const warehouseNameMap = new Map(warehouseRows.map((w) => [w.id, w.name]));

  const whName = (id: number | null | undefined) =>
    id ? (warehouseNameMap.get(id) || `مخزن #${id}`) : "—";

  const rows: InventoryMovementRow[] = [];

  const push = (partial: Omit<InventoryMovementRow, "itemCode" | "itemName" | "categoryName" | "unit"> & { itemId: number }) => {
    const item = itemMap.get(partial.itemId);
    if (!item) return;
    if (!matchesItemFilters(
      { itemId: partial.itemId, categoryId: item.categoryId, itemName: item.name, itemCode: item.code || "", barcode: item.barcode || "" },
      filters,
      categoryIdMap,
    )) return;
    if (!warehouseAllowed(partial.warehouseId, filters)) return;
    const d = dateStr(partial.date);
    if (!inDateRange(d, dateFrom, dateTo)) return;
    rows.push({
      ...partial,
      date: d,
      itemCode: item.code || "",
      itemName: item.name,
      categoryName: item.categoryId ? (categoryNameMap.get(item.categoryId) || "") : "",
      unit: item.unit || "قطعة",
      unitCost: partial.unitCost || num(item.purchasePrice),
      totalValue: partial.totalValue || (partial.quantityIn - partial.quantityOut) * (partial.unitCost || num(item.purchasePrice)),
    });
  };

  // Purchases (in)
  const purchases = await db.select({
    id: purchaseInvoices.id,
    number: purchaseInvoices.number,
    date: purchaseInvoices.date,
    warehouseId: purchaseInvoices.warehouseId,
    supplierName: suppliers.name,
    itemId: purchaseInvoiceItems.itemId,
    quantity: purchaseInvoiceItems.quantity,
    price: purchaseInvoiceItems.price,
  }).from(purchaseInvoiceItems)
    .innerJoin(purchaseInvoices, eq(purchaseInvoiceItems.invoiceId, purchaseInvoices.id))
    .leftJoin(suppliers, eq(purchaseInvoices.supplierId, suppliers.id))
    .where(tenantWhere(purchaseInvoices, tenantId, inArray(purchaseInvoices.status, ["confirmed", "paid", "partial"])));

  for (const r of purchases) {
    const qty = num(r.quantity);
    push({
      date: dateStr(r.date),
      documentType: "purchase",
      documentTypeLabel: DOC_LABELS.purchase,
      documentNumber: r.number,
      documentId: r.id,
      warehouseId: r.warehouseId,
      warehouseName: whName(r.warehouseId),
      itemId: r.itemId,
      partyName: r.supplierName || "—",
      quantityIn: qty,
      quantityOut: 0,
      unitCost: num(r.price),
      totalValue: qty * num(r.price),
    });
  }

  // Sales (out)
  const sales = await db.select({
    id: salesInvoices.id,
    number: salesInvoices.number,
    date: salesInvoices.date,
    warehouseId: salesInvoices.warehouseId,
    customerName: customers.name,
    itemId: salesInvoiceItems.itemId,
    quantity: salesInvoiceItems.quantity,
    price: salesInvoiceItems.price,
    purchasePrice: items.purchasePrice,
  }).from(salesInvoiceItems)
    .innerJoin(salesInvoices, eq(salesInvoiceItems.invoiceId, salesInvoices.id))
    .leftJoin(items, eq(salesInvoiceItems.itemId, items.id))
    .leftJoin(customers, eq(salesInvoices.customerId, customers.id))
    .where(tenantWhere(salesInvoices, tenantId, inArray(salesInvoices.status, ["confirmed", "paid", "partial"])));

  for (const r of sales) {
    const qty = num(r.quantity);
    const cost = num(r.purchasePrice) || num(r.price);
    push({
      date: dateStr(r.date),
      documentType: "sale",
      documentTypeLabel: DOC_LABELS.sale,
      documentNumber: r.number,
      documentId: r.id,
      warehouseId: r.warehouseId,
      warehouseName: whName(r.warehouseId),
      itemId: r.itemId,
      partyName: r.customerName || "—",
      quantityIn: 0,
      quantityOut: qty,
      unitCost: cost,
      totalValue: qty * cost,
    });
  }

  // Purchase returns (out)
  const pReturns = await db.select({
    id: purchaseReturns.id,
    number: purchaseReturns.number,
    date: purchaseReturns.date,
    warehouseId: purchaseReturns.warehouseId,
    supplierName: suppliers.name,
    itemId: purchaseReturnItems.itemId,
    quantity: purchaseReturnItems.quantity,
    price: purchaseReturnItems.price,
  }).from(purchaseReturnItems)
    .innerJoin(purchaseReturns, eq(purchaseReturnItems.returnId, purchaseReturns.id))
    .leftJoin(suppliers, eq(purchaseReturns.supplierId, suppliers.id))
    .where(tenantWhere(purchaseReturns, tenantId, eq(purchaseReturns.status, "confirmed")));

  for (const r of pReturns) {
    const qty = num(r.quantity);
    push({
      date: dateStr(r.date),
      documentType: "purchase_return",
      documentTypeLabel: DOC_LABELS.purchase_return,
      documentNumber: r.number,
      documentId: r.id,
      warehouseId: r.warehouseId,
      warehouseName: whName(r.warehouseId),
      itemId: r.itemId,
      partyName: r.supplierName || "—",
      quantityIn: 0,
      quantityOut: qty,
      unitCost: num(r.price),
      totalValue: qty * num(r.price),
    });
  }

  // Sales returns (in)
  const sReturns = await db.select({
    id: salesReturns.id,
    number: salesReturns.number,
    date: salesReturns.date,
    warehouseId: salesReturns.warehouseId,
    customerName: customers.name,
    itemId: salesReturnItems.itemId,
    quantity: salesReturnItems.quantity,
    price: salesReturnItems.price,
  }).from(salesReturnItems)
    .innerJoin(salesReturns, eq(salesReturnItems.returnId, salesReturns.id))
    .leftJoin(customers, eq(salesReturns.customerId, customers.id))
    .where(tenantWhere(salesReturns, tenantId, eq(salesReturns.status, "confirmed")));

  for (const r of sReturns) {
    const qty = num(r.quantity);
    push({
      date: dateStr(r.date),
      documentType: "sale_return",
      documentTypeLabel: DOC_LABELS.sale_return,
      documentNumber: r.number,
      documentId: r.id,
      warehouseId: r.warehouseId,
      warehouseName: whName(r.warehouseId),
      itemId: r.itemId,
      partyName: r.customerName || "—",
      quantityIn: qty,
      quantityOut: 0,
      unitCost: num(r.price),
      totalValue: qty * num(r.price),
    });
  }

  // Stock transfers
  const transfers = await db.select({
    id: stockTransfers.id,
    number: stockTransfers.number,
    date: stockTransfers.date,
    fromWarehouseId: stockTransfers.fromWarehouseId,
    toWarehouseId: stockTransfers.toWarehouseId,
    itemId: stockTransferItems.itemId,
    quantity: stockTransferItems.quantity,
  }).from(stockTransferItems)
    .innerJoin(stockTransfers, eq(stockTransferItems.transferId, stockTransfers.id))
    .where(tenantWhere(stockTransfers, tenantId, eq(stockTransfers.status, "confirmed")));

  for (const r of transfers) {
    const qty = num(r.quantity);
    const item = itemMap.get(r.itemId);
    const cost = num(item?.purchasePrice);
    push({
      date: dateStr(r.date),
      documentType: "transfer_out",
      documentTypeLabel: DOC_LABELS.transfer_out,
      documentNumber: r.number,
      documentId: r.id,
      warehouseId: r.fromWarehouseId,
      warehouseName: whName(r.fromWarehouseId),
      itemId: r.itemId,
      partyName: whName(r.toWarehouseId),
      quantityIn: 0,
      quantityOut: qty,
      unitCost: cost,
      totalValue: qty * cost,
    });
    push({
      date: dateStr(r.date),
      documentType: "transfer_in",
      documentTypeLabel: DOC_LABELS.transfer_in,
      documentNumber: r.number,
      documentId: r.id,
      warehouseId: r.toWarehouseId,
      warehouseName: whName(r.toWarehouseId),
      itemId: r.itemId,
      partyName: whName(r.fromWarehouseId),
      quantityIn: qty,
      quantityOut: 0,
      unitCost: cost,
      totalValue: qty * cost,
    });
  }

  // Inventory adjustments
  const adjustments = await db.select({
    id: inventoryAdjustments.id,
    number: inventoryAdjustments.number,
    date: inventoryAdjustments.date,
    warehouseId: inventoryAdjustments.warehouseId,
    itemId: inventoryAdjustmentItems.itemId,
    difference: inventoryAdjustmentItems.difference,
  }).from(inventoryAdjustmentItems)
    .innerJoin(inventoryAdjustments, eq(inventoryAdjustmentItems.adjustmentId, inventoryAdjustments.id))
    .where(tenantWhere(inventoryAdjustments, tenantId, eq(inventoryAdjustments.status, "confirmed")));

  for (const r of adjustments) {
    const diff = num(r.difference);
    if (diff === 0) continue;
    const item = itemMap.get(r.itemId);
    const cost = num(item?.purchasePrice);
    push({
      date: dateStr(r.date),
      documentType: "adjustment",
      documentTypeLabel: DOC_LABELS.adjustment,
      documentNumber: r.number,
      documentId: r.id,
      warehouseId: r.warehouseId,
      warehouseName: whName(r.warehouseId),
      itemId: r.itemId,
      partyName: "—",
      quantityIn: diff > 0 ? diff : 0,
      quantityOut: diff < 0 ? Math.abs(diff) : 0,
      unitCost: cost,
      totalValue: Math.abs(diff) * cost,
    });
  }

  // أوامر الإنتاج المكتملة — ميجا: «امر انتاج» (صرف خامات + استلام منتج)
  const productionRows = await db.select({
    id: productionOrders.id,
    number: productionOrders.number,
    date: productionOrders.date,
    warehouseId: productionOrders.warehouseId,
    productId: productionOrders.productId,
    quantity: productionOrders.quantity,
    batchNumber: productionOrders.batchNumber,
    wipCostAmount: productionOrders.wipCostAmount,
  }).from(productionOrders)
    .where(tenantWhere(productionOrders, tenantId, eq(productionOrders.status, "completed")));

  const orderIds = productionRows.map((r) => r.id);
  const materialRows = orderIds.length
    ? await db.select({
        orderId: productionOrderMaterials.orderId,
        itemId: productionOrderMaterials.itemId,
        quantity: productionOrderMaterials.quantity,
        scrapPercent: productionOrderMaterials.scrapPercent,
        warehouseId: productionOrderMaterials.warehouseId,
      }).from(productionOrderMaterials)
        .where(tenantWhere(productionOrderMaterials, tenantId, inArray(productionOrderMaterials.orderId, orderIds)))
    : [];
  const materialsByOrder = new Map<number, typeof materialRows>();
  for (const m of materialRows) {
    const list = materialsByOrder.get(m.orderId) || [];
    list.push(m);
    materialsByOrder.set(m.orderId, list);
  }

  for (const order of productionRows) {
    const mats = materialsByOrder.get(order.id) || [];
    for (const m of mats) {
      const qty = num(m.quantity) * (1 + num(m.scrapPercent) / 100);
      if (qty <= 0) continue;
      const item = itemMap.get(m.itemId);
      const cost = num(item?.purchasePrice);
      const whId = m.warehouseId ?? order.warehouseId;
      push({
        date: dateStr(order.date),
        documentType: "production_out",
        documentTypeLabel: DOC_LABELS.production_out,
        documentNumber: order.number,
        documentId: order.id,
        warehouseId: whId,
        warehouseName: whName(whId),
        itemId: m.itemId,
        partyName: "—",
        quantityIn: 0,
        quantityOut: qty,
        unitCost: cost,
        totalValue: qty * cost,
        batchNumber: order.batchNumber || "",
      });
    }
    const finishedQty = num(order.quantity);
    if (finishedQty > 0) {
      const unitCost = finishedQty > 0 ? num(order.wipCostAmount) / finishedQty : 0;
      push({
        date: dateStr(order.date),
        documentType: "production_in",
        documentTypeLabel: DOC_LABELS.production_in,
        documentNumber: order.number,
        documentId: order.id,
        warehouseId: order.warehouseId,
        warehouseName: whName(order.warehouseId),
        itemId: order.productId,
        partyName: "—",
        quantityIn: finishedQty,
        quantityOut: 0,
        unitCost,
        totalValue: finishedQty * unitCost,
        batchNumber: order.batchNumber || "",
      });
    }
  }

  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.documentNumber.localeCompare(b.documentNumber));
}

export async function inventoryStocktakeReport(db: Db, filters: InventoryReportFilters) {
  filters = await expandInventoryBranchFilter(db, filters);
  const { tenantId, warehouseId, categoryId, itemId, search, batchNumber, expiryFrom, expiryTo } = filters;

  if (batchNumber || expiryFrom || expiryTo) {
    const batchRows = await db.select({
      itemId: itemBatches.itemId,
      batchNumber: itemBatches.batchNumber,
      expiryDate: itemBatches.expiryDate,
      quantity: itemBatches.quantity,
      code: items.code,
      barcode: items.barcode,
      name: items.name,
      unit: items.unit,
      categoryId: items.categoryId,
      categoryName: itemCategories.name,
      minStock: items.minStock,
      purchasePrice: items.purchasePrice,
      salePrice: items.salePrice,
    }).from(itemBatches)
      .innerJoin(items, eq(itemBatches.itemId, items.id))
      .leftJoin(itemCategories, eq(items.categoryId, itemCategories.id))
      .where(tenantWhere(itemBatches, tenantId, and(
        batchNumber ? like(itemBatches.batchNumber, `%${batchNumber}%`) : undefined,
        expiryFrom ? gte(itemBatches.expiryDate, expiryFrom as any) : undefined,
        expiryTo ? lte(itemBatches.expiryDate, expiryTo as any) : undefined,
      )));

    return batchRows
      .filter((r) => {
        if (itemId && r.itemId !== itemId) return false;
        if (categoryId && r.categoryId !== categoryId) return false;
        if (search) {
          const q = search.toLowerCase();
          if (!r.name.toLowerCase().includes(q) && !(r.code || "").toLowerCase().includes(q) && !(r.barcode || "").toLowerCase().includes(q)) return false;
        }
        return true;
      })
      .map((r) => {
        const qty = num(r.quantity);
        const min = num(r.minStock);
        return {
          itemId: r.itemId,
          code: r.code || "",
          barcode: r.barcode || "",
          name: r.name,
          unit: r.unit || "قطعة",
          categoryName: r.categoryName || "",
          warehouseId: null as number | null,
          warehouseName: "دفعة",
          batchNumber: r.batchNumber,
          expiryDate: dateStr(r.expiryDate),
          quantity: qty,
          minStock: min,
          purchasePrice: num(r.purchasePrice),
          salePrice: num(r.salePrice),
          stockValue: qty * num(r.purchasePrice),
          status: (qty <= 0 ? "zero" : (min > 0 && qty <= min ? "low" : "ok")) as "low" | "ok" | "zero",
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }

  // جرد المخازن (Mega: InventorySummary) = سطر لكل صنف×مخزن من رصيد المخزن الفعلي.
  // ممنوع اختراع مخزن اسمه «إجمالي» — ده مش مخزن في Mega ولا في الإكسل.
  const stockRows = await db.select({
    itemId: items.id,
    code: items.code,
    barcode: items.barcode,
    name: items.name,
    unit: items.unit,
    categoryId: items.categoryId,
    categoryName: itemCategories.name,
    minStock: items.minStock,
    purchasePrice: items.purchasePrice,
    salePrice: items.salePrice,
    warehouseId: itemWarehouseStock.warehouseId,
    warehouseName: warehouses.name,
    warehouseQty: itemWarehouseStock.quantity,
    warehouseUnitCost: itemWarehouseStock.unitCost,
  }).from(itemWarehouseStock)
    .innerJoin(items, and(eq(itemWarehouseStock.itemId, items.id), eq(items.isActive, true)))
    .innerJoin(warehouses, eq(itemWarehouseStock.warehouseId, warehouses.id))
    .leftJoin(itemCategories, eq(items.categoryId, itemCategories.id))
    .where(tenantWhere(itemWarehouseStock, tenantId))
    .orderBy(items.name, warehouses.name);

  const result: Array<{
    itemId: number;
    code: string;
    barcode: string;
    name: string;
    unit: string;
    categoryName: string;
    warehouseId: number | null;
    warehouseName: string;
    quantity: number;
    minStock: number;
    purchasePrice: number;
    salePrice: number;
    stockValue: number;
    status: "low" | "ok" | "zero";
  }> = [];

  const seen = new Set<string>();

  for (const r of stockRows) {
    if (itemId && r.itemId !== itemId) continue;
    if (categoryId && r.categoryId !== categoryId) continue;
    if (search) {
      const q = search.toLowerCase();
      if (!r.name.toLowerCase().includes(q) && !(r.code || "").toLowerCase().includes(q) && !(r.barcode || "").toLowerCase().includes(q)) continue;
    }

    const whId = r.warehouseId;
    if (!whId || !warehouseAllowed(whId, filters)) continue;

    const key = `${r.itemId}-${whId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const qty = num(r.warehouseQty);
    const min = num(r.minStock);
    // تكلفة المخزن ده تحديدًا (متوسط مرجّح مستقل) — مطابقة لتقرير «تكاليف الأصناف» في
    // Mega Cash؛ لو لسه صفر (بيانات قديمة قبل الترقية) نرجع لمتوسط الصنف العام كتقدير.
    const whCost = num(r.warehouseUnitCost);
    const cost = whCost > 0 ? whCost : num(r.purchasePrice);
    result.push({
      itemId: r.itemId,
      code: r.code || "",
      barcode: r.barcode || "",
      name: r.name,
      unit: r.unit || "قطعة",
      categoryName: r.categoryName || "",
      warehouseId: whId,
      warehouseName: r.warehouseName || "—",
      quantity: qty,
      minStock: min,
      purchasePrice: cost,
      salePrice: num(r.salePrice),
      stockValue: qty * cost,
      status: qty <= 0 ? "zero" : (min > 0 && qty <= min ? "low" : "ok"),
    });
  }

  return result.sort((a, b) => a.name.localeCompare(b.name, "ar") || a.warehouseName.localeCompare(b.warehouseName, "ar"));
}

export function warehouseInOutReport(movements: InventoryMovementRow[]) {
  const map = new Map<number, {
    warehouseId: number | null;
    warehouseName: string;
    totalIn: number;
    totalOut: number;
    inValue: number;
    outValue: number;
  }>();

  for (const m of movements) {
    const key = m.warehouseId ?? 0;
    if (!map.has(key)) {
      map.set(key, {
        warehouseId: m.warehouseId,
        warehouseName: m.warehouseName,
        totalIn: 0,
        totalOut: 0,
        inValue: 0,
        outValue: 0,
      });
    }
    const row = map.get(key)!;
    row.totalIn += m.quantityIn;
    row.totalOut += m.quantityOut;
    row.inValue += m.quantityIn * m.unitCost;
    row.outValue += m.quantityOut * m.unitCost;
  }

  return [...map.values()].map((r) => ({
    ...r,
    netQty: r.totalIn - r.totalOut,
    netValue: r.inValue - r.outValue,
  }));
}

export function itemMovementSummaryReport(movements: InventoryMovementRow[]) {
  const map = new Map<number, {
    itemId: number;
    itemCode: string;
    itemName: string;
    categoryName: string;
    unit: string;
    totalIn: number;
    totalOut: number;
    inValue: number;
    outValue: number;
  }>();

  for (const m of movements) {
    if (!map.has(m.itemId)) {
      map.set(m.itemId, {
        itemId: m.itemId,
        itemCode: m.itemCode,
        itemName: m.itemName,
        categoryName: m.categoryName,
        unit: m.unit,
        totalIn: 0,
        totalOut: 0,
        inValue: 0,
        outValue: 0,
      });
    }
    const row = map.get(m.itemId)!;
    row.totalIn += m.quantityIn;
    row.totalOut += m.quantityOut;
    row.inValue += m.quantityIn * m.unitCost;
    row.outValue += m.quantityOut * m.unitCost;
  }

  return [...map.values()].map((r) => ({
    ...r,
    netQty: r.totalIn - r.totalOut,
    netValue: r.inValue - r.outValue,
  })).sort((a, b) => a.itemName.localeCompare(b.itemName, "ar"));
}

export function itemInOutReport(movements: InventoryMovementRow[]) {
  return itemMovementSummaryReport(movements);
}

export async function itemCostsReport(db: Db, filters: InventoryReportFilters) {
  const today = new Date().toISOString().split("T")[0];
  const asOf = (filters.dateTo || today).slice(0, 10);
  const useLive = asOf >= today;

  type CostRow = {
    itemId: number;
    code: string;
    barcode: string;
    name: string;
    unit: string;
    categoryName: string;
    warehouseId: number | null;
    warehouseName: string;
    warehouseCount: number;
    quantity: number;
    purchasePrice: number;
    salePrice: number;
    averageCost: number;
    totalCostValue: number;
    totalSaleValue: number;
    margin: number;
    marginPct: number;
    asOfDate: string;
  };

  /**
   * صف مستقل لكل صنف×مخزن — مطابقة لتقرير «تكاليف الأصناف» في Mega Cash اللي بيعرض
   * قسم منفصل بالكامل لكل مخزن، وكل قسم بمتوسط تكلفة خاص بيه (مش رقم واحد مجمّع للصنف
   * عبر كل المخازن).
   */
  const toRows = (rows: Array<{
    itemId: number;
    code: string;
    barcode: string;
    name: string;
    unit: string;
    categoryName: string;
    warehouseId: number | null;
    warehouseName: string;
    quantity: number;
    purchasePrice: number;
    salePrice: number;
    averageCost: number;
    lineCostValue?: number;
  }>): CostRow[] => {
    return rows
      .filter((r) => (Number(r.quantity) || 0) > 0.0000001)
      .map((r) => {
        const qty = Number(r.quantity) || 0;
        const avg = Number(r.averageCost ?? r.purchasePrice) || 0;
        const totalCostValue = r.lineCostValue != null ? Number(r.lineCostValue) : qty * avg;
        const sale = Number(r.salePrice) || 0;
        const margin = sale - avg;
        const marginPct = sale > 0 ? (margin / sale) * 100 : 0;
        return {
          itemId: r.itemId,
          code: r.code,
          barcode: r.barcode,
          name: r.name,
          unit: r.unit,
          categoryName: r.categoryName,
          warehouseId: r.warehouseId,
          warehouseName: r.warehouseName || "—",
          warehouseCount: 1,
          quantity: qty,
          purchasePrice: avg,
          salePrice: sale,
          averageCost: avg,
          totalCostValue,
          totalSaleValue: qty * sale,
          margin,
          marginPct,
          asOfDate: asOf,
        };
      })
      .sort((a, b) => a.warehouseName.localeCompare(b.warehouseName, "ar") || a.name.localeCompare(b.name, "ar"));
  };

  if (useLive) {
    // inventoryStocktakeReport بيرجّع purchasePrice مضبوطة بالفعل على تكلفة المخزن نفسه
    // (item_warehouse_stock.unitCost لو موجودة، وإلا متوسط الصنف العام كتقدير احتياطي).
    const stock = await inventoryStocktakeReport(db, filters);
    return toRows(stock.map((r) => ({
      ...r,
      averageCost: r.purchasePrice,
      lineCostValue: r.quantity * r.purchasePrice,
    })));
  }

  // تاريخ سابق: رصيد حتى التاريخ = مخزون أول المدة + صافي الحركات حتى dateTo
  const biRows = await db.select({
    itemId: beginningInventory.itemId,
    warehouseId: beginningInventory.warehouseId,
    quantity: beginningInventory.quantity,
    unitCost: beginningInventory.unitCost,
    date: beginningInventory.date,
    code: items.code,
    barcode: items.barcode,
    name: items.name,
    unit: items.unit,
    categoryId: items.categoryId,
    categoryName: itemCategories.name,
    purchasePrice: items.purchasePrice,
    salePrice: items.salePrice,
    averageCost: items.averageCost,
    warehouseName: warehouses.name,
  }).from(beginningInventory)
    .innerJoin(items, and(eq(beginningInventory.itemId, items.id), eq(items.isActive, true)))
    .innerJoin(warehouses, eq(beginningInventory.warehouseId, warehouses.id))
    .leftJoin(itemCategories, eq(items.categoryId, itemCategories.id))
    .where(tenantWhere(beginningInventory, filters.tenantId, lte(beginningInventory.date, asOf as any)));

  type Acc = {
    itemId: number;
    code: string;
    barcode: string;
    name: string;
    unit: string;
    categoryName: string;
    warehouseId: number | null;
    warehouseName: string;
    quantity: number;
    purchasePrice: number;
    salePrice: number;
    averageCost: number;
    costBasisQty: number;
    costBasisValue: number;
  };
  const map = new Map<string, Acc>();

  const touch = (opts: {
    itemId: number;
    warehouseId: number | null;
    warehouseName: string;
    code: string;
    barcode: string;
    name: string;
    unit: string;
    categoryName: string;
    purchasePrice: number;
    salePrice: number;
    averageCost: number;
    deltaQty: number;
    deltaCostValue?: number;
  }) => {
    if (filters.itemId && opts.itemId !== filters.itemId) return;
    if (!warehouseAllowed(opts.warehouseId, filters)) return;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!opts.name.toLowerCase().includes(q) && !(opts.code || "").toLowerCase().includes(q)) return;
    }
    const key = `${opts.itemId}-${opts.warehouseId ?? 0}`;
    if (!map.has(key)) {
      map.set(key, {
        itemId: opts.itemId,
        code: opts.code,
        barcode: opts.barcode,
        name: opts.name,
        unit: opts.unit,
        categoryName: opts.categoryName,
        warehouseId: opts.warehouseId,
        warehouseName: opts.warehouseName,
        quantity: 0,
        purchasePrice: opts.purchasePrice,
        salePrice: opts.salePrice,
        averageCost: opts.averageCost,
        costBasisQty: 0,
        costBasisValue: 0,
      });
    }
    const row = map.get(key)!;
    row.quantity += opts.deltaQty;
    if (opts.deltaCostValue != null && opts.deltaQty > 0) {
      row.costBasisQty += opts.deltaQty;
      row.costBasisValue += opts.deltaCostValue;
    }
  };

  for (const r of biRows) {
    if (filters.categoryId && r.categoryId !== filters.categoryId) continue;
    const qty = num(r.quantity);
    const unitCost = num(r.unitCost) || num(r.averageCost) || num(r.purchasePrice);
    touch({
      itemId: r.itemId,
      warehouseId: r.warehouseId,
      warehouseName: r.warehouseName || "—",
      code: r.code || "",
      barcode: r.barcode || "",
      name: r.name,
      unit: r.unit || "قطعة",
      categoryName: r.categoryName || "",
      purchasePrice: num(r.purchasePrice),
      salePrice: num(r.salePrice),
      averageCost: num(r.averageCost) || unitCost,
      deltaQty: qty,
      deltaCostValue: qty * unitCost,
    });
  }

  const movements = await collectInventoryMovements(db, {
    ...filters,
    dateFrom: undefined,
    dateTo: asOf,
  });
  for (const m of movements) {
    const delta = m.quantityIn - m.quantityOut;
    if (Math.abs(delta) < 0.0000001) continue;
    touch({
      itemId: m.itemId,
      warehouseId: m.warehouseId,
      warehouseName: m.warehouseName,
      code: m.itemCode,
      barcode: "",
      name: m.itemName,
      unit: m.unit,
      categoryName: m.categoryName,
      purchasePrice: m.unitCost,
      salePrice: 0,
      averageCost: m.unitCost,
      deltaQty: delta,
      deltaCostValue: delta > 0 ? delta * m.unitCost : undefined,
    });
  }

  const needSale = [...map.values()].filter((r) => !(r.salePrice > 0));
  if (needSale.length) {
    const ids = [...new Set(needSale.map((r) => r.itemId))];
    const cards = await db.select({
      id: items.id,
      salePrice: items.salePrice,
      purchasePrice: items.purchasePrice,
      averageCost: items.averageCost,
      barcode: items.barcode,
    }).from(items).where(tenantWhere(items, filters.tenantId, inArray(items.id, ids)));
    const cardMap = new Map(cards.map((c) => [c.id, c]));
    for (const r of map.values()) {
      const c = cardMap.get(r.itemId);
      if (!c) continue;
      if (!(r.salePrice > 0)) r.salePrice = num(c.salePrice);
      if (!(r.purchasePrice > 0)) r.purchasePrice = num(c.purchasePrice);
      if (!(r.averageCost > 0)) r.averageCost = num(c.averageCost) || num(c.purchasePrice);
      if (!r.barcode) r.barcode = c.barcode || "";
    }
  }

  const warehouseRows = [...map.values()]
    .filter((r) => r.quantity > 0.0000001)
    .map((r) => {
      const avg = r.costBasisQty > 0
        ? r.costBasisValue / r.costBasisQty
        : (r.averageCost || r.purchasePrice);
      return {
        itemId: r.itemId,
        code: r.code,
        barcode: r.barcode,
        name: r.name,
        unit: r.unit,
        categoryName: r.categoryName,
        warehouseId: r.warehouseId,
        warehouseName: r.warehouseName,
        quantity: r.quantity,
        purchasePrice: avg,
        salePrice: r.salePrice,
        averageCost: avg,
        lineCostValue: r.quantity * avg,
      };
    });

  return toRows(warehouseRows);
}

export async function itemsListReport(db: Db, filters: InventoryReportFilters) {
  const { tenantId, categoryId, itemId, search } = filters;
  const conditions = [tenantWhere(items, tenantId, eq(items.isActive, true))];
  if (categoryId) conditions.push(eq(items.categoryId, categoryId));
  if (itemId) conditions.push(eq(items.id, itemId));
  if (search) {
    conditions.push(or(like(items.name, `%${search}%`), like(items.code, `%${search}%`))!);
  }

  return db.select({
    id: items.id,
    code: items.code,
    barcode: items.barcode,
    name: items.name,
    unit: items.unit,
    categoryName: itemCategories.name,
    purchasePrice: items.purchasePrice,
    salePrice: items.salePrice,
    currentStock: items.currentStock,
    minStock: items.minStock,
    taxRate: items.taxRate,
    createdAt: items.createdAt,
  }).from(items)
    .leftJoin(itemCategories, eq(items.categoryId, itemCategories.id))
    .where(and(...conditions))
    .orderBy(items.name);
}

/** أصناف راكدة — بدون حركة خلال N يوم (افتراضي 90) */
export async function stagnantItemsReport(
  db: Db,
  filters: InventoryReportFilters,
) {
  const staleDays = filters.staleDays ?? 90;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - staleDays);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const movements = await collectInventoryMovements(db, {
    ...filters,
    dateFrom: cutoffStr,
    dateTo: new Date().toISOString().split("T")[0],
  });

  const lastMove = new Map<number, string>();
  for (const m of movements) {
    const prev = lastMove.get(m.itemId);
    if (!prev || m.date > prev) lastMove.set(m.itemId, m.date);
  }

  const stock = await inventoryStocktakeReport(db, filters);
  const merged = new Map<number, (typeof stock)[0] & { lastMovementDate: string | null; daysStagnant: number }>();

  for (const r of stock) {
    if (r.quantity <= 0) continue;
    const last = lastMove.get(r.itemId) ?? null;
    const daysStagnant = last
      ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000)
      : staleDays + 1;
    if (daysStagnant < staleDays) continue;
    if (!merged.has(r.itemId)) {
      merged.set(r.itemId, { ...r, quantity: 0, stockValue: 0, lastMovementDate: last, daysStagnant });
    }
    const row = merged.get(r.itemId)!;
    row.quantity += r.quantity;
    row.stockValue += r.stockValue;
  }

  return [...merged.values()].sort((a, b) => b.daysStagnant - a.daysStagnant);
}

/** أعمار الأصناف — أيام منذ آخر حركة وارد */
export async function itemAgingReport(
  db: Db,
  filters: InventoryReportFilters,
) {
  const movements = await collectInventoryMovements(db, {
    ...filters,
    dateFrom: undefined,
    dateTo: filters.dateTo,
  });

  const lastIn = new Map<number, string>();
  for (const m of movements) {
    if (m.quantityIn <= 0) continue;
    const prev = lastIn.get(m.itemId);
    if (!prev || m.date > prev) lastIn.set(m.itemId, m.date);
  }

  const stock = await inventoryStocktakeReport(db, filters);
  const merged = new Map<number, (typeof stock)[0] & { lastInboundDate: string | null; ageDays: number }>();

  for (const r of stock) {
    if (r.quantity <= 0) continue;
    const last = lastIn.get(r.itemId) ?? null;
    const ageDays = last
      ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000)
      : 9999;
    if (!merged.has(r.itemId)) {
      merged.set(r.itemId, { ...r, quantity: 0, stockValue: 0, lastInboundDate: last, ageDays });
    }
    const row = merged.get(r.itemId)!;
    row.quantity += r.quantity;
    row.stockValue += r.stockValue;
  }

  return [...merged.values()].sort((a, b) => b.ageDays - a.ageDays);
}
