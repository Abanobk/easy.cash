import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  detectMegaReportKind,
  excelDateToIso,
  parseItemCostsReport,
  parseMegaItemCell,
  parseProductionReport,
  parsePurchasesReport,
  parseSalesReport,
  type SheetRow,
} from "./mega-report-parse";

function loadFixture(name: string): SheetRow[] {
  const raw = readFileSync(join(__dirname, "fixtures", name), "utf8");
  return JSON.parse(raw) as SheetRow[];
}

describe("mega-report-parse", () => {
  it("parses excel serial dates", () => {
    expect(excelDateToIso("46235")).toBe("2026-08-01");
    expect(excelDateToIso("46238")).toBe("2026-08-04");
    expect(excelDateToIso("4/8/2026")).toBe("2026-08-04");
  });

  it("parses item cell with barcode on next line", () => {
    expect(parseMegaItemCell("صفيحة فيفا بروتان عبوة 15 كجم\n(704002)")).toEqual({
      name: "صفيحة فيفا بروتان عبوة 15 كجم",
      barcode: "704002",
    });
  });

  it("detects and parses item costs sheet", () => {
    const rows = loadFixture("mega-item-costs-sample.json");
    expect(detectMegaReportKind(rows)).toBe("item_costs");
    const costs = parseItemCostsReport(rows);
    expect(costs.length).toBeGreaterThan(3);
    expect(costs[0].warehouse).toContain("الخامات");
    expect(costs[0].name).toBeTruthy();
    expect(Number(costs[0].quantity)).toBeGreaterThan(0);
  });

  it("parses Mega sales print report", () => {
    const rows = loadFixture("mega-sales-sample.json");
    expect(detectMegaReportKind(rows)).toBe("sales");
    const sales = parseSalesReport(rows);
    expect(sales.length).toBeGreaterThanOrEqual(3);
    expect(sales[0].customer).toContain("حسام");
    expect(sales[0].serial).toMatch(/Inv/i);
    expect(sales[0].date).toBe("2026-08-04");
    expect(sales[0].lines.length).toBeGreaterThanOrEqual(3);
    expect(sales[0].lines[0].barcode).toBe("704002");
  });

  it("parses Mega purchases print report", () => {
    const rows = loadFixture("mega-purchases-sample.json");
    expect(detectMegaReportKind(rows)).toBe("purchases");
    const purchases = parsePurchasesReport(rows);
    expect(purchases.length).toBe(14);
    expect(purchases[0].supplier).toContain("المؤسسة");
    expect(purchases[0].serial).toMatch(/REC/i);
    expect(purchases[0].lines[0].barcode).toBe("301078");
    expect(purchases[0].lines[0].qty).toBe("5750");
  });

  it("parses Mega production orders print report", () => {
    const rows = loadFixture("mega-production-sample.json");
    expect(detectMegaReportKind(rows)).toBe("production");
    const production = parseProductionReport(rows);
    expect(production.length).toBeGreaterThanOrEqual(2);
    expect(production[0].product).toContain("فيفا");
    expect(production[0].barcode).toBe("704001");
    expect(production[0].qty).toBe("10");
    expect(production[0].materials.length).toBeGreaterThanOrEqual(3);
    expect(production[0].materials[0].barcode).toBe("401012");
    expect(production[0].deliveries[0]?.warehouse).toContain("انتاج");
  });
});
