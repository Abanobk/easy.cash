import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPayloadFromMegaPath, summarizePayload } from "../server/mega-migrate";
import { resolveMegaEntity, mapRowFields } from "../server/mega-mapping";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("mega migration mapping", () => {
  it("resolves common Mega file names", () => {
    expect(resolveMegaEntity("Customers.csv")).toBe("customers");
    expect(resolveMegaEntity("SalesInvoiceDetails.csv")).toBe("salesInvoiceItems");
    expect(resolveMegaEntity("JournalDetails.csv")).toBe("journalEntryLines");
    expect(resolveMegaEntity("Banks.csv")).toBe("bankAccounts");
  });

  it("maps Mega field aliases", () => {
    const row = mapRowFields({ Code: "C1", Name: "عميل", Balance: "10", ParentCode: "1100" });
    expect(row.code).toBe("C1");
    expect(row.name).toBe("عميل");
    expect(row.balance).toBe("10");
    expect(row.parentCode).toBe("1100");
  });

  it("builds payload from sample fixture", () => {
    const payload = buildPayloadFromMegaPath(path.join(root, "mega-kam-backup/sample-fixture"));
    const summary = summarizePayload(payload);
    expect(summary.customers).toBeGreaterThan(0);
    expect(summary.items).toBeGreaterThan(0);
    expect(summary.accounts).toBeGreaterThan(0);
    expect(summary.salesInvoices).toBeGreaterThan(0);
  });
});
