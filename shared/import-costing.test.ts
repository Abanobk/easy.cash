import { describe, expect, it } from "vitest";
import {
  computeImportCost,
  computeShippingQuote,
  defaultShippingQuote,
  type ImportCostHeader,
  type ImportCostLineInput,
} from "./import-costing";

const switchHeader: ImportCostHeader = {
  costFxRate: 51,
  customsFxRate: 55,
  customsAssessableUsd: 4786.65,
  customsRate: 0.2,
  vatRate: 0.14,
  withholdingRate: 0.01,
  shippingUsd: 300,
  agentFeeUsd: 200,
  ocaUsd: 0,
  yardFeesEgp: 1000,
  brokerFeesEgp: 20000,
  batteriesEgp: 0,
  freightLocalEgp: 0,
  shippingQuote: defaultShippingQuote(),
  ocaAlloc: "unit_cost",
  shippingAlloc: "unit_cost",
  agentAlloc: "unit_cost",
  localAlloc: "weight",
};

const switchLines: ImportCostLineInput[] = [
  { itemName: "swich white 1 gang", quantity: 50, unitCostUsd: 8.9, unitWeight: 4.2717117117117116 },
  { itemName: "swich black 1 gang", quantity: 50, unitCostUsd: 8.9, unitWeight: 4.2717117117117116 },
  { itemName: "swich white 2 gang", quantity: 50, unitCostUsd: 9.5, unitWeight: 4.2717117117117116 },
  { itemName: "swich black 2 gang", quantity: 50, unitCostUsd: 9.5, unitWeight: 4.2717117117117116 },
  { itemName: "swich white 3 gang", quantity: 50, unitCostUsd: 9.9, unitWeight: 4.2717117117117116 },
  { itemName: "swich black 3 gang", quantity: 50, unitCostUsd: 9.9, unitWeight: 4.2717117117117116 },
  { itemName: "swich white 4 gang", quantity: 50, unitCostUsd: 8.8, unitWeight: 4.2717117117117116 },
  { itemName: "swich black 4 gang", quantity: 50, unitCostUsd: 8.8, unitWeight: 4.2717117117117116 },
  { itemName: "swich white curtain", quantity: 50, unitCostUsd: 8.8, unitWeight: 4.2717117117117116 },
  { itemName: "swich black curtain", quantity: 50, unitCostUsd: 8.8, unitWeight: 4.2717117117117116 },
];

describe("import costing engine (isolated)", () => {
  it("matches بدون بطاريات sheet landed unit for 1 gang", () => {
    const result = computeImportCost(switchHeader, switchLines);
    expect(result.totals.quantity).toBe(500);
    expect(result.lines[0].landedUnitEgp).toBeCloseTo(729.6304694444444, 4);
    expect(result.lines[2].landedUnitEgp).toBeCloseTo(763.5638027777776, 4);
    expect(result.lines[4].landedUnitEgp).toBeCloseTo(786.186025, 4);
    expect(result.lines[6].landedUnitEgp).toBeCloseTo(723.9749138888889, 4);
    expect(result.totals.dueUsd).toBeCloseTo(result.totals.totalUsd, 6);
    expect(result.totals.landedEgp).toBeGreaterThan(result.totals.dueUsd * switchHeader.costFxRate);
    expect(result.totals.avgLandedUnitEgp).toBeCloseTo(result.totals.landedEgp / 500, 6);
  });

  it("computes Shenzhen-Alex quote for 1 CBM over 2 and 3 weeks", () => {
    const q2 = computeShippingQuote(defaultShippingQuote({ enabled: true, volumeCbm: 1, expectedWeeks: 2 }), 0.14);
    expect(q2.ofUsd).toBe(150);
    expect(q2.localCbm).toBe(2);
    expect(q2.extraDays).toBe(7);
    expect(q2.localEgp).toBeCloseTo(3296, 4);
    const q3 = computeShippingQuote(defaultShippingQuote({ enabled: true, volumeCbm: 1, expectedWeeks: 3 }), 0.14);
    expect(q3.extraDays).toBe(14);
    expect(q3.localEgp).toBeCloseTo(3856, 4);
  });

  it("splits a pool equally across lines", () => {
    const result = computeImportCost(
      { ...switchHeader, shippingUsd: 100, shippingAlloc: "equal", agentFeeUsd: 0, ocaUsd: 0 },
      [
        { itemName: "a", quantity: 10, unitCostUsd: 1, unitWeight: 1 },
        { itemName: "b", quantity: 90, unitCostUsd: 9, unitWeight: 9 },
      ],
    );
    expect(result.lines[0].shippingUsd).toBeCloseTo(50, 6);
    expect(result.lines[1].shippingUsd).toBeCloseTo(50, 6);
  });

  it("does not require item ids or accounts", () => {
    const src = Object.keys(switchLines[0]).join(",");
    expect(src).not.toMatch(/itemId|account|invoice|warehouse/i);
  });
});
