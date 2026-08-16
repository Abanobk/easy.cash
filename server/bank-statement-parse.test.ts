import { describe, expect, it } from "vitest";
import { asDate, parseBankStatementText, parseMoneyToken } from "./bank-statement-parse";

describe("bank statement PDF/text parsing", () => {
  it("parses money tokens", () => {
    expect(parseMoneyToken("1,234.56")).toBeCloseTo(1234.56);
    expect(parseMoneyToken("(500.00)")).toBeCloseTo(-500);
    expect(parseMoneyToken("1.234,56")).toBeCloseTo(1234.56);
  });

  it("parses Egyptian-style DD/MM/YYYY", () => {
    expect(asDate("01/08/2024")).toBe("2024-08-01");
    expect(asDate("15-08-24")).toBe("2024-08-15");
  });

  it("extracts transaction lines from bank-like text", () => {
    const text = `
Account Statement
01/08/2024 TRANSFER FROM CLIENT ABC 5,000.00 105,000.00
02/08/2024 ATM WITHDRAWAL Cairo 1,000.00 DR 104,000.00
03/08/2024 POS Purchase 250.50 103,749.50
`;
    const lines = parseBankStatementText(text);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[0].txnDate).toBe("2024-08-01");
    expect(lines.some((l) => l.credit > 0 || l.debit > 0)).toBe(true);
  });
});
