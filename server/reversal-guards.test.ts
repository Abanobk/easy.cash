import { describe, expect, it } from "vitest";
import { downstreamMessage, type DownstreamDoc } from "./reversal-guards";
import { reverseWeightedAverage } from "./production-service";

describe("reverseWeightedAverage — عكس متوسط تكلفة المنتج التام", () => {
  it("بيرجّع المتوسط اللي كان قبل الدفعة اللي اتشالت", () => {
    // قبل الإنتاج: 40 قطعة بمتوسط 10 → قيمة 400
    // إنتاج: 10 قطع بتكلفة وحدة 25 → قيمة 250
    // بعد الإتمام: 50 قطعة بمتوسط (400+250)/50 = 13
    const restored = reverseWeightedAverage(50, 13, 10, 25);
    expect(restored).toBeCloseTo(10, 6);
  });

  it("لو المخزون كله من الأمر ده، بيرجّع المتوسط الحالي زي ما هو", () => {
    expect(reverseWeightedAverage(10, 25, 10, 25)).toBe(25);
    expect(reverseWeightedAverage(10, 25, 12, 25)).toBe(25); // remain سالب → حماية
  });

  it("متسق مع الصيغة الأمامية على قيم عشوائية", () => {
    const oldQty = 37, oldCost = 8.3, newQty = 14, newUnitCost = 21.75;
    const totalQty = oldQty + newQty;
    const fwdAvg = (oldQty * oldCost + newQty * newUnitCost) / totalQty;
    expect(reverseWeightedAverage(totalQty, fwdAvg, newQty, newUnitCost)).toBeCloseTo(oldCost, 6);
  });
});

describe("downstreamMessage — الرسالة الموجِّهة", () => {
  const docs: DownstreamDoc[] = [
    { type: "sales_invoice", typeLabel: "فاتورة بيع", number: "S-00012", date: "2026-09-03" },
    { type: "production", typeLabel: "أمر إنتاج", number: "PO-00007", date: "2026-09-05" },
  ];

  it("بيسمّي كل المستندات بالنوع والرقم", () => {
    expect(downstreamMessage("لا يمكن فك الاعتماد: مخزون «ألومنيوم» استُهلك في مستندات لاحقة", docs)).toBe(
      "لا يمكن فك الاعتماد: مخزون «ألومنيوم» استُهلك في مستندات لاحقة — راجع وافك اعتماد: فاتورة بيع S-00012، أمر إنتاج PO-00007",
    );
  });

  it("لو مفيش مستندات بيرجّع البادئة زي ما هي", () => {
    expect(downstreamMessage("نص عام", [])).toBe("نص عام");
  });
});
