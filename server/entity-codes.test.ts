import { describe, expect, it } from "vitest";
import { ENTITY_CODE_PREFIX } from "./entity-codes";

/** Mirror of serial extraction used by resolveEntityCode (unit-tested without DB). */
function maxSerialFromCodes(
  codes: Array<string | null | undefined>,
  prefix?: string,
): number {
  const p = (prefix || "").trim().toUpperCase();
  const prefRe = p
    ? new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[-_]?0*(\\d+)$`, "i")
    : null;
  let max = 0;
  for (const raw of codes) {
    const code = (raw || "").trim();
    if (!code) continue;
    if (prefRe) {
      const m = code.match(prefRe);
      if (m) {
        const n = Number(m[1]);
        if (!Number.isNaN(n) && n > max) max = n;
        continue;
      }
      const pure = code.match(/^0*(\d+)$/);
      if (pure) {
        const n = Number(pure[1]);
        if (!Number.isNaN(n) && n > max) max = n;
      }
      continue;
    }
    const pure = code.match(/^0*(\d+)$/);
    const trailing = code.match(/(\d+)$/);
    const n = pure ? Number(pure[1]) : trailing ? Number(trailing[1]) : NaN;
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return max;
}

function nextCode(codes: string[], prefix: string): string {
  const max = maxSerialFromCodes(codes, prefix);
  const width = Math.max(4, String(max + 1).length);
  return `${prefix}-${String(max + 1).padStart(width, "0")}`;
}

/** يحاكي منطق البحث الرقمي بدون DB */
function matchesCodeSearch(code: string, search: string): boolean {
  const q = search.trim();
  if (!q) return true;
  if (code.includes(q)) return true;
  if (!/^\d+$/.test(q)) {
    const digits = q.replace(/[^0-9]/g, "");
    if (!digits) return false;
    const trailing = code.match(/(\d+)$/);
    if (!trailing) return false;
    return Number(trailing[1]) === Number(digits.replace(/^0+/, "") || "0");
  }
  const stripped = q.replace(/^0+/, "") || "0";
  const trailing = code.match(/(\d+)$/);
  if (!trailing) return false;
  return Number(trailing[1]) === Number(stripped);
}

describe("entity auto codes", () => {
  it("keeps separate sequences per prefix", () => {
    const customers = ["C-0001", "C-0005", "0042"];
    const suppliers = ["S-0003", "S-0010"];
    const products = ["P-0001", "ABC"];

    expect(nextCode(customers, ENTITY_CODE_PREFIX.customer)).toBe("C-0043");
    expect(nextCode(suppliers, ENTITY_CODE_PREFIX.supplier)).toBe("S-0011");
    expect(nextCode(products, ENTITY_CODE_PREFIX.item)).toBe("P-0002");
  });

  it("starts at 0001 when empty", () => {
    expect(nextCode([], "C")).toBe("C-0001");
    expect(nextCode([], "S")).toBe("S-0001");
    expect(nextCode([], "P")).toBe("P-0001");
  });

  it("search ignores letter prefix", () => {
    expect(matchesCodeSearch("C-0005", "0005")).toBe(true);
    expect(matchesCodeSearch("C-0005", "5")).toBe(true);
    expect(matchesCodeSearch("S-0005", "0005")).toBe(true);
    expect(matchesCodeSearch("SI-00005", "5")).toBe(true);
    expect(matchesCodeSearch("SI-00005", "00005")).toBe(true);
    expect(matchesCodeSearch("C-0005", "0004")).toBe(false);
    expect(matchesCodeSearch("P-0012", "12")).toBe(true);
  });
});
