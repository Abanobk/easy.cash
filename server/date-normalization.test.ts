import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { toDateStr } from "@/lib/date";

/**
 * drizzle/mysql2 بيرجّع أعمدة date() ككائن Date حقيقي (والعميل كمان، لأن superjson بيعيد بناءها).
 * `String(dateObj)` بيدي "Tue Sep 01 2026 00:00:00 GMT+0000 (...)" — فـ slice(0,10) بيقص السنة
 * و split("T")[0] بيقطع عند الـ "T" اللي في GMT. الاتنين بيدوا تواريخ غلط بدل ما يرموا خطأ.
 */
describe("توحيد التواريخ", () => {
  const d = new Date("2026-09-01T00:00:00.000Z");

  it("toDateStr بيرجّع تاريخ ISO من Date object", () => {
    expect(toDateStr(d)).toBe("2026-09-01");
  });

  it("toDateStr بيسيب النصوص زي ما هي وبيتعامل مع الفاضي", () => {
    expect(toDateStr("2026-09-01")).toBe("2026-09-01");
    expect(toDateStr("2026-09-01T10:30:00.000Z")).toBe("2026-09-01");
    expect(toDateStr(null)).toBe("");
    expect(toDateStr(undefined, "—")).toBe("—");
  });

  it("الأنماط القديمة فعلاً بتكسر — ده سبب وجود الـ helper", () => {
    expect(String(d).slice(0, 10)).toBe("Tue Sep 01");
    expect(String(d).split("T")[0]).not.toBe("2026-09-01");
  });
});

/** ماسح للمصدر: يمنع رجوع النمط الخطر تاني في أي ملف جديد */
describe("مسح المصدر: مفيش تعامل نصي مباشر مع أعمدة التاريخ", () => {
  const roots = ["server", path.join("client", "src")];
  /** String(<expr>).slice(0,10) أو .split("T") — مسموح بس جوه الـ helpers نفسها (البارامتر v/d/value) */
  const STRINGIFIED = /\bString\(([^()]*)\)\.(?:slice\(0, 10\)|split\("T"\))/;
  const HELPER_PARAM = /^(?:v|d|value)(?: \|\| "")?(?: \?\? "")?$/;
  /** استدعاء دالة نصوص مباشرة على خاصية اسمها فيه date — بيرمي TypeError لو القيمة Date */
  const DIRECT = /\.[A-Za-z_$][\w$]*[Dd]ate[\w$]*\.(?:slice|split|substring|startsWith|localeCompare|padStart|trim)\(/;

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return walk(full);
      return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [full] : [];
    });
  }

  const files = roots.flatMap(walk);

  it("مفيش String(<تاريخ>).slice/split خارج الـ helpers", () => {
    const hits: string[] = [];
    for (const file of files) {
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        const m = STRINGIFIED.exec(line);
        if (m && !HELPER_PARAM.test(m[1].trim())) hits.push(`${file}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it("مفيش استدعاء دوال نصوص مباشرة على خصائص التاريخ", () => {
    const hits: string[] = [];
    for (const file of files) {
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        // form.<x>Date.trim() آمن — ده state نصي في الواجهة مش عمود من الداتابيز
        if (DIRECT.test(line) && !/\bform\./.test(line)) hits.push(`${file}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
