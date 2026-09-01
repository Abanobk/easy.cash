import { describe, expect, it } from "vitest";
import {
  buildSupplierLedger,
  buildCustomerLedger,
  finalizeLedger,
  buildSupplierMovements,
} from "./statement-ledger";

describe("statement opening balance", () => {
  it("shows supplier opening as credit on its date", () => {
    const ledger = buildSupplierLedger({
      invoices: [],
      cashTransactions: [],
      bankTransactions: [],
      returns: [],
      openingBalance: "1500",
      openingBalanceDate: "2025-01-01",
    });
    expect(ledger).toHaveLength(1);
    expect(ledger[0].docType).toBe("رصيد أول المدة");
    expect(ledger[0].date).toBe("2025-01-01");
    expect(ledger[0].credit).toBe(1500);
    expect(ledger[0].debit).toBe(0);
    expect(ledger[0].balance).toBe(1500);
  });

  it("shows customer opening as debit on its date", () => {
    const ledger = buildCustomerLedger({
      invoices: [],
      cashTransactions: [],
      bankTransactions: [],
      returns: [],
      openingBalance: "2000",
      openingBalanceDate: "2024-12-31",
    });
    expect(ledger[0].date).toBe("2024-12-31");
    expect(ledger[0].debit).toBe(2000);
    expect(ledger[0].balance).toBe(2000);
  });

  it("includes opening before dateFrom into period opening", () => {
    const { ledger, openingBalance, closingBalance } = finalizeLedger(
      buildSupplierMovements({
        invoices: [{ number: "PI-1", date: "2026-01-10", total: "500" }],
        cashTransactions: [],
        bankTransactions: [],
        returns: [],
      }),
      {
        openingBalance: "1000",
        openingBalanceDate: "2025-12-31",
        dateFrom: "2026-02-01",
        mode: "ap",
      },
    );
    expect(openingBalance).toBe(1500); // 1000 + invoice before period
    expect(ledger[0].docType).toBe("رصيد أول المدة");
    expect(ledger[0].date).toBe("2026-02-01");
    expect(ledger[0].credit).toBe(1500);
    expect(closingBalance).toBe(1500);
  });

  it("formats a real Date object the same as its equivalent ISO string (drizzle date() columns return Date objects, not strings)", () => {
    const asDateObject = buildSupplierLedger({
      invoices: [{ number: "PI-2", date: new Date("2026-08-01T00:00:00.000Z"), total: "700" }],
      cashTransactions: [],
      bankTransactions: [],
      returns: [],
    });
    const asIsoString = buildSupplierLedger({
      invoices: [{ number: "PI-2", date: "2026-08-01", total: "700" }],
      cashTransactions: [],
      bankTransactions: [],
      returns: [],
    });
    expect(asDateObject[0].date).toBe("2026-08-01");
    expect(asDateObject[0].date).toBe(asIsoString[0].date);
  });
});
