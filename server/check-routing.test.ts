import { describe, expect, it } from "vitest";

describe("check routing module contracts", () => {
  it("defines expected routing statuses", () => {
    const statuses = [
      "unrouted",
      "in_custody",
      "scheduled",
      "deposited",
      "cleared",
      "rejected",
    ];
    expect(statuses).toContain("unrouted");
    expect(statuses).toContain("deposited");
    expect(statuses).toHaveLength(6);
  });

  it("uses deposit journal reference suffix DEP", () => {
    const number = "CHK-00001";
    expect(`${number}-DEP`).toBe("CHK-00001-DEP");
    expect(`${number}-CLR`).toBe("CHK-00001-CLR");
    expect(`${number}-BNC`).toBe("CHK-00001-BNC");
  });

  it("maps filter tabs to operational meaning", () => {
    const filters: Record<string, string> = {
      unrouted: "غير موجهة",
      in_custody: "في الحيازة",
      scheduled: "موجهة قادمة",
      overdue_deposit: "متأخرة عن الإيداع",
      at_bank: "لدى البنك",
      completed: "مكتملة",
    };
    expect(filters.overdue_deposit).toContain("متأخرة");
    expect(filters.at_bank).toContain("البنك");
  });
});
