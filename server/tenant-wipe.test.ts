import { describe, expect, it } from "vitest";
import { TENANT_WIPE_PRESERVE, TENANT_WIPE_TABLES_CHILD_FIRST } from "./tenant-wipe";

describe("tenant wipe safety lists", () => {
  it("never lists preserved tables in wipe order", () => {
    for (const p of TENANT_WIPE_PRESERVE) {
      expect(TENANT_WIPE_TABLES_CHILD_FIRST).not.toContain(p);
    }
  });

  it("deletes invoice lines before invoices", () => {
    expect(TENANT_WIPE_TABLES_CHILD_FIRST.indexOf("sales_invoice_items"))
      .toBeLessThan(TENANT_WIPE_TABLES_CHILD_FIRST.indexOf("sales_invoices"));
    expect(TENANT_WIPE_TABLES_CHILD_FIRST.indexOf("journal_entry_lines"))
      .toBeLessThan(TENANT_WIPE_TABLES_CHILD_FIRST.indexOf("journal_entries"));
  });
});
