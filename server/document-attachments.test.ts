import { describe, expect, it } from "vitest";
import { extractDocFieldsFromText } from "./document-attachments";

describe("extractDocFieldsFromText", () => {
  it("extracts invoice number, date and total", () => {
    const text = `
فاتورة رقم INV-1001
التاريخ: 15/08/2024
العميل: شركة النور
الإجمالي: 12,500.00
`;
    const f = extractDocFieldsFromText(text);
    expect(f.docNumber).toMatch(/INV-1001|1001/);
    expect(f.date).toBe("2024-08-15");
    expect(f.total).toBeCloseTo(12500);
    expect(f.partyName).toContain("النور");
  });
});
