/**
 * Parsers for Mega Cash printed Excel reports (تصدير تقرير → xlsx),
 * not clean table dumps. Formats observed from live Mega exports:
 * - تكاليف الأصناف (flat stock/cost sheet)
 * - المبيعات / المشتريات (invoice blocks with header+lines)
 * - أوامر الإنتاج (order header + materials + delivery)
 */

export type MegaReportKind = "item_costs" | "sales" | "purchases" | "production" | "unknown";

export type SheetRow = string[];

export type MegaItemCostRow = {
  warehouse: string;
  totalCost: string;
  unitCost: string;
  quantity: string;
  name: string;
  category: string;
  unit: string;
};

export type MegaInvoiceLine = {
  net: string;
  tax: string;
  discount: string;
  total: string;
  unit: string;
  qty: string;
  price: string;
  name: string;
  barcode: string | null;
};

export type MegaSalesInvoice = {
  due: string;
  expenses: string;
  net: string;
  additions: string;
  tax: string;
  discount: string;
  total: string;
  customer: string;
  date: string;
  serial: string;
  lines: MegaInvoiceLine[];
};

export type MegaPurchaseInvoice = {
  due: string;
  net: string;
  tax: string;
  discount: string;
  total: string;
  supplier: string;
  date: string;
  ref: string;
  serial: string;
  lines: MegaInvoiceLine[];
};

export type MegaProductionMaterial = {
  totalCost: string;
  wasteCost: string;
  rawCost: string;
  unit: string;
  wasteQty: string;
  qty: string;
  barcode: string;
  name: string;
};

export type MegaProductionDelivery = {
  note: string;
  cost: string;
  remain: string;
  receivedQty: string;
  unit: string;
  originalQty: string;
  warehouse: string;
  date: string;
};

export type MegaProductionOrder = {
  product: string;
  status: string;
  rawCost: string;
  barcode: string;
  qty: string;
  wasteCost: string;
  site: string;
  materials: MegaProductionMaterial[];
  deliveries: MegaProductionDelivery[];
};

function cell(row: SheetRow, i: number) {
  return String(row[i] ?? "").trim();
}

function isNumeric(value: string) {
  if (!value) return false;
  return /^-?\d+(\.\d+)?$/.test(value.replace(/,/g, ""));
}

/** Excel serial date → YYYY-MM-DD, or d/m/y strings */
export function excelDateToIso(value: string): string {
  const s = String(value || "").trim();
  if (!s) return "";
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 20000 && n < 80000) {
      const epoch = Date.UTC(1899, 11, 30);
      const d = new Date(epoch + Math.floor(n) * 86400000);
      return d.toISOString().slice(0, 10);
    }
  }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    const mo = String(Number(m[2])).padStart(2, "0");
    const day = String(Number(m[1])).padStart(2, "0");
    return `${y}-${mo}-${day}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

/** "صنف\n(704001)" → name + barcode */
export function parseMegaItemCell(raw: string): { name: string; barcode: string | null } {
  const text = String(raw || "").replace(/\r/g, "\n").trim();
  if (!text) return { name: "", barcode: null };
  const parts = text.split("\n").map((p) => p.trim()).filter(Boolean);
  const name = parts[0] || text;
  let barcode: string | null = null;
  const joined = text.replace(/\n/g, " ");
  const m = joined.match(/\(([^)]+)\)\s*$/);
  if (m) barcode = m[1].trim();
  else if (parts.length > 1) {
    const last = parts[parts.length - 1].replace(/[()]/g, "").trim();
    if (last && last !== name) barcode = last;
  }
  return { name, barcode };
}

export function detectMegaReportKind(rows: SheetRow[]): MegaReportKind {
  const head = rows.slice(0, 12).map((r) => r.join(" | "));
  const blob = head.join("\n");
  if (rows[0]?.[0] === "المخزن" && rows[0]?.includes("الصنف")) return "item_costs";
  if (blob.includes("اوامر الانتاج") || blob.includes("أوامر الإنتاج") || blob.includes("المنتج التام:")) return "production";
  if (blob.includes("المشتريات") || blob.includes("المستحق سداده")) return "purchases";
  if (blob.includes("المبيعات") || blob.includes("المستحق تحصيله")) return "sales";
  // fallback scan
  for (const r of rows.slice(0, 80)) {
    if (r[0] === "المستحق سداده") return "purchases";
    if (r[0] === "المستحق تحصيله") return "sales";
    if (r.includes("المنتج التام:")) return "production";
  }
  return "unknown";
}

export function parseItemCostsReport(rows: SheetRow[]): MegaItemCostRow[] {
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  const idx = (names: string[]) => {
    for (const n of names) {
      const i = header.findIndex((h) => h === n || h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };
  const iWh = idx(["المخزن"]);
  const iTotal = idx(["اجمالي التكلفة", "إجمالي التكلفة"]);
  const iAvg = idx(["متوسط التكلفة"]);
  const iQty = idx(["الكمية"]);
  const iName = idx(["الصنف"]);
  const iCat = idx(["الفئة"]);
  const iUnit = idx(["وحدة القياس", "الوحدة", "وحدة", "unit"]);
  const out: MegaItemCostRow[] = [];
  for (const r of rows.slice(1)) {
    const name = iName >= 0 ? cell(r, iName) : "";
    if (!name) continue;
    out.push({
      warehouse: iWh >= 0 ? cell(r, iWh) : "",
      totalCost: iTotal >= 0 ? cell(r, iTotal) : "",
      unitCost: iAvg >= 0 ? cell(r, iAvg) : "",
      quantity: iQty >= 0 ? cell(r, iQty) : "",
      name,
      category: iCat >= 0 ? cell(r, iCat) : "",
      unit: iUnit >= 0 ? cell(r, iUnit) : "",
    });
  }
  return out;
}

function indexOfLabel(row: SheetRow, label: string) {
  return row.findIndex((c) => c === label);
}

export function parseSalesReport(rows: SheetRow[]): MegaSalesInvoice[] {
  const docs: MegaSalesInvoice[] = [];
  let i = 0;
  while (i < rows.length) {
    const r = rows[i];
    if (r?.[0] === "المستحق تحصيله" && r.includes("العميل")) {
      const serialIdx = indexOfLabel(r, "مسلسل");
      const vals = r.slice(serialIdx >= 0 ? serialIdx + 1 : 10);
      const g = (j: number) => String(vals[j] ?? "").trim();
      const doc: MegaSalesInvoice = {
        due: g(0),
        expenses: g(1),
        net: g(2),
        additions: g(3),
        tax: g(4),
        discount: g(5),
        total: g(6),
        customer: g(7),
        date: excelDateToIso(g(8)),
        serial: g(9),
        lines: [],
      };
      i += 1;
      if (rows[i]?.[0] === "الصافي") i += 1;
      while (i < rows.length) {
        const rr = rows[i];
        if (!rr?.length) { i += 1; continue; }
        if (rr[0] === "المستحق تحصيله") break;
        if (rr[0] === "بلا مندوب" || (rr.join(" ").includes("اجمالى مبيعات") && !isNumeric(rr[0]))) break;
        if (rr[0] === "الصافي") { i += 1; continue; }
        if (isNumeric(rr[0]) && rr.length >= 8 && cell(rr, 7)) {
          const { name, barcode } = parseMegaItemCell(cell(rr, 7));
          doc.lines.push({
            net: cell(rr, 0),
            tax: cell(rr, 1),
            discount: cell(rr, 2),
            total: cell(rr, 3),
            unit: cell(rr, 4),
            qty: cell(rr, 5),
            price: cell(rr, 6),
            name,
            barcode,
          });
          i += 1;
          continue;
        }
        if (isNumeric(rr[0]) && rr.length <= 5) break;
        i += 1;
      }
      docs.push(doc);
      continue;
    }
    i += 1;
  }
  return docs;
}

export function parsePurchasesReport(rows: SheetRow[]): MegaPurchaseInvoice[] {
  const docs: MegaPurchaseInvoice[] = [];
  let i = 0;
  while (i < rows.length) {
    const r = rows[i];
    if (r?.[0] === "المستحق سداده" && r.includes("المورد")) {
      const serialIdx = indexOfLabel(r, "مسلسل");
      const vals = r.slice(serialIdx >= 0 ? serialIdx + 1 : 9);
      const g = (j: number) => String(vals[j] ?? "").trim();
      const doc: MegaPurchaseInvoice = {
        due: g(0),
        net: g(1),
        tax: g(2),
        discount: g(3),
        total: g(4),
        supplier: g(5),
        date: excelDateToIso(g(6)),
        ref: g(7),
        serial: g(8),
        lines: [],
      };
      i += 1;
      if (rows[i]?.[0] === "الصافي") i += 1;
      while (i < rows.length) {
        const rr = rows[i];
        if (!rr?.length) { i += 1; continue; }
        if (rr[0] === "المستحق سداده") break;
        if (rr[0] === "الصافي") { i += 1; continue; }
        if (isNumeric(rr[0]) && rr.length >= 8 && cell(rr, 7)) {
          const { name, barcode } = parseMegaItemCell(cell(rr, 7));
          doc.lines.push({
            net: cell(rr, 0),
            tax: cell(rr, 1),
            discount: cell(rr, 2),
            total: cell(rr, 3),
            unit: cell(rr, 4),
            qty: cell(rr, 5),
            price: cell(rr, 6),
            name,
            barcode,
          });
          i += 1;
          continue;
        }
        if (isNumeric(rr[0]) && rr.length <= 5) break;
        i += 1;
      }
      docs.push(doc);
      continue;
    }
    i += 1;
  }
  return docs;
}

const PROD_LABELS = new Set([
  "المنتج التام:",
  "الحالة:",
  "تكلفة المواد الخام:",
  "الباركود :",
  "الباركود:",
  "الكمية:",
  "تكلفة التوالف:",
  "موقع الانتاج:",
  "تاريخ الانتاج :",
  "تاريخ الانتاج:",
  "تاريخ الانتهاء:",
  "تاريخ الاستلام:",
  "رقم التشغيلة:",
  "رقم المرجع:",
  "اجمالى التكلفة:",
  "اجمالى التكلفة: ",
  "تكلفة الوحدة :",
  "تكلفة الوحدة:",
  "مخزن الاستلام:",
]);

export function parseProductionReport(rows: SheetRow[]): MegaProductionOrder[] {
  const docs: MegaProductionOrder[] = [];
  let i = 0;
  while (i < rows.length) {
    const r = rows[i];
    if (r?.includes("المنتج التام:")) {
      const pairs: Record<string, string> = {};
      for (let j = 0; j + 1 < r.length; j++) {
        const a = cell(r, j);
        const b = cell(r, j + 1);
        if (PROD_LABELS.has(b) || b.endsWith(":")) {
          pairs[b.trim()] = a;
          j += 1;
        }
      }
      const product = cell(r, 1) === "المنتج التام:" ? cell(r, 0) : (pairs["المنتج التام:"] || "");
      let site = "";
      for (const c of r) {
        const t = String(c || "").trim();
        if (!t || t.endsWith(":")) continue;
        if ((t.includes("مصنع") || t.includes("مخزن")) && !PROD_LABELS.has(t)) {
          site = t;
        }
      }
      const doc: MegaProductionOrder = {
        product,
        status: pairs["الحالة:"] || "",
        rawCost: pairs["تكلفة المواد الخام:"] || "",
        barcode: pairs["الباركود :"] || pairs["الباركود:"] || "",
        qty: pairs["الكمية:"] || "",
        wasteCost: pairs["تكلفة التوالف:"] || "",
        site,
        materials: [],
        deliveries: [],
      };
      i += 1;
      if (rows[i]?.[0] === "اجمالي تكلفة") i += 1;
      while (i < rows.length) {
        const rr = rows[i];
        if (!rr?.length) { i += 1; break; }
        if (rr[0] === "المصروفات" || rr[0] === "التسليم" || rr.includes("المنتج التام:")) break;
        if (isNumeric(rr[0]) && rr.length >= 8 && cell(rr, 7)) {
          doc.materials.push({
            totalCost: cell(rr, 0),
            wasteCost: cell(rr, 1),
            rawCost: cell(rr, 2),
            unit: cell(rr, 3),
            wasteQty: cell(rr, 4),
            qty: cell(rr, 5),
            barcode: cell(rr, 6),
            name: cell(rr, 7),
          });
          i += 1;
          continue;
        }
        if (isNumeric(rr[0]) && rr.length <= 5) { i += 1; break; }
        i += 1;
      }
      while (i < rows.length && rows[i]?.[0] !== "التسليم" && !rows[i]?.includes("المنتج التام:")) {
        if (rows[i]?.[0] === "المصروفات") {
          i += 1;
          while (i < rows.length && rows[i]?.[0] !== "التسليم" && !rows[i]?.includes("المنتج التام:")) i += 1;
          break;
        }
        i += 1;
      }
      if (rows[i]?.[0] === "التسليم") {
        i += 1;
        while (i < rows.length) {
          const rr = rows[i];
          if (!rr?.length) { i += 1; break; }
          if (rr.includes("المنتج التام:")) break;
          if (isNumeric(rr[0]) && rr.length === 1) { i += 1; continue; }
          if (rr.length >= 8 && (cell(rr, 6).includes("مخزن") || cell(rr, 6).includes("مصنع") || isNumeric(cell(rr, 7)))) {
            doc.deliveries.push({
              note: cell(rr, 0),
              cost: cell(rr, 1),
              remain: cell(rr, 2),
              receivedQty: cell(rr, 3),
              unit: cell(rr, 4),
              originalQty: cell(rr, 5),
              warehouse: cell(rr, 6),
              date: excelDateToIso(cell(rr, 7)),
            });
          }
          i += 1;
        }
      }
      docs.push(doc);
      continue;
    }
    i += 1;
  }
  return docs;
}

/** Normalize sheet_to_json / raw matrix into string rows */
export function matrixToSheetRows(matrix: unknown[][]): SheetRow[] {
  return matrix.map((row) =>
    (row || []).map((c) => {
      if (c == null) return "";
      if (typeof c === "number") return String(c);
      return String(c).trim();
    }),
  );
}

export function parseMegaReportBuffer(buf: Buffer | ArrayBuffer) {
  // lazy require to keep parse unit-testable without xlsx in some contexts
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx") as typeof import("xlsx");
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false, raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];
  const rows = matrixToSheetRows(matrix);
  const kind = detectMegaReportKind(rows);
  if (kind === "item_costs") {
    const itemCosts = parseItemCostsReport(rows);
    return { kind, rows: rows.length, itemCosts, sales: [], purchases: [], production: [] };
  }
  if (kind === "sales") {
    const sales = parseSalesReport(rows);
    return { kind, rows: rows.length, itemCosts: [], sales, purchases: [], production: [] };
  }
  if (kind === "purchases") {
    const purchases = parsePurchasesReport(rows);
    return { kind, rows: rows.length, itemCosts: [], sales: [], purchases, production: [] };
  }
  if (kind === "production") {
    const production = parseProductionReport(rows);
    return { kind, rows: rows.length, itemCosts: [], sales: [], purchases: [], production };
  }
  return { kind, rows: rows.length, itemCosts: [], sales: [], purchases: [], production: [] };
}
