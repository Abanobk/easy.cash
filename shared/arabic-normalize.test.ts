import { describe, expect, it } from "vitest";
import { normalizeArabicKey } from "./arabic-normalize";

describe("normalizeArabicKey", () => {
  it("بيوحّد صور الألف (همزة/مدة) مع الألف العادية", () => {
    expect(normalizeArabicKey("أحمد")).toBe(normalizeArabicKey("احمد"));
    expect(normalizeArabicKey("إبراهيم")).toBe(normalizeArabicKey("ابراهيم"));
    expect(normalizeArabicKey("آدم")).toBe(normalizeArabicKey("ادم"));
  });

  it("بيوحّد التاء المربوطة مع الهاء، والألف المقصورة مع الياء", () => {
    expect(normalizeArabicKey("شركة النور")).toBe(normalizeArabicKey("شركه النور"));
    expect(normalizeArabicKey("مصطفى")).toBe(normalizeArabicKey("مصطفي"));
  });

  it("بيشيل التشكيل والتطويل", () => {
    expect(normalizeArabicKey("مُحَمَّد")).toBe(normalizeArabicKey("محمد"));
    expect(normalizeArabicKey("محـــمد")).toBe(normalizeArabicKey("محمد"));
  });

  it("بيتعامل مع null/undefined/فاضي من غير ما يرمي خطأ", () => {
    expect(normalizeArabicKey(null)).toBe("");
    expect(normalizeArabicKey(undefined)).toBe("");
    expect(normalizeArabicKey("")).toBe("");
  });

  it("لسه بيفرّق بين أسماء مختلفة فعلاً", () => {
    expect(normalizeArabicKey("أحمد")).not.toBe(normalizeArabicKey("محمد"));
  });
});
