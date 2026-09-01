/**
 * تصفية شجرة التنقل الجانبية حسب الشجرة التفصيلية (shared/permission-tree.ts)، فوق تصفية
 * النظام القديم (canAccessPath) الموجودة أصلاً — مش بدل منها.
 *
 * القاعدة الأهم عشان محدش يتفاجئ: بنطبّق القيود دي بس لو الدور "مهاجر" فعليًا للنظام
 * الجديد (يعني عنده ولو صف واحد محفوظ في أي قسم). أي دور لسه ما لمسش الشجرة التفصيلية
 * خالص يفضل شغال بالنظام القديم 100% زي ما هو — صفر تأثير عليه.
 *
 * لما يبقى الدور مهاجر:
 * - قسم رئيسي (زي "اعدادات عامة") محدش فتحله ولا عنصر واحد جواه → يتشال من القايمة خالص.
 * - قسم فيه عناصر متظبطة → يفضل ظاهر، لكن كل عنصر جواه بيتحقق بمطابقة اسمه بأقرب عنصر في
 *   الشجرة لنفس القسم؛ لو العنصر متظبط وأفعاله فاضية (أو مش متظبط خالص) يتشال، ولو العنصر
 *   مش متعرف عليه (فشلت المطابقة) يفضل ظاهر (أضمن — نتجنب إخفاء شاشة حقيقية بالغلط).
 */
import { PERMISSION_TREE } from "@shared/permission-tree";

/** ترتيب الأقسام هنا زي ما هو في client/src/config/erp-navigation.ts بالظبط. */
const NAV_GROUP_TO_MODULE: Record<string, string> = {
  "اعدادات عامة": "settings",
  "العملاء والموردين": "contacts",
  "شئون الموظفين": "hr",
  "المخازن": "inventory",
  "فواتير الشراء": "purchases",
  "فواتير المبيعات": "sales",
  "مندوبين البيع": "sales_reps",
  "معاملات نقدية": "cash",
  "معاملات بنكية": "bank",
  "الحسابات": "accounts",
  "الاصول الثابته": "assets",
  "الاصول الثابتة": "assets",
  "الانتاج": "production",
  "الإنتاج": "production",
  "مراكز التكلفة": "cost_centers",
  "القروض": "loans",
  "الاقساط": "installments",
  "الأقساط": "installments",
  "التقارير": "reports",
  "الصلاحيات": "security",
};

function normalizeLabel(s: string): string {
  return s
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ً-ٟ]/g, "")
    .replace(/[\s/\-_]+/g, "")
    .trim();
}

const MODULE_BY_KEY = new Map(PERMISSION_TREE.map((m) => [m.key, m]));

function matchEntityKey(moduleKey: string, label: string): string | null {
  const mod = MODULE_BY_KEY.get(moduleKey);
  if (!mod) return null;
  const norm = normalizeLabel(label);
  if (!norm) return null;
  let best: string | null = null;
  let bestLen = -1;
  for (const e of mod.entities) {
    // تقارير كتير عندها label مركّب "تقارير المخازن ← جرد المخازن" — قارن بآخر جزء بعد "←" كمان.
    const parts = e.label.split("←").map((p) => normalizeLabel(p));
    const candidates = [normalizeLabel(e.label), ...parts];
    for (const c of candidates) {
      if (!c) continue;
      if (c === norm || norm.includes(c) || c.includes(norm)) {
        if (c.length > bestLen) {
          best = e.key;
          bestLen = c.length;
        }
      }
    }
  }
  return best;
}

export function moduleKeyForNavGroup(label: string): string | null {
  return NAV_GROUP_TO_MODULE[label] || null;
}

export function entityTreeAllowsNavItem(
  entities: Record<string, string[]>,
  moduleKey: string | null,
  label: string,
  isGroup: boolean,
): boolean {
  if (!moduleKey) return true;
  const roleMigrated = Object.keys(entities).length > 0;
  if (!roleMigrated) return true;

  const moduleTouched = Object.keys(entities).some((k) => k.startsWith(`${moduleKey}::`));
  if (isGroup) return moduleTouched;
  if (!moduleTouched) return true;

  const entityKey = matchEntityKey(moduleKey, label);
  if (!entityKey) return true;
  const allowed = entities[`${moduleKey}::${entityKey}`];
  return Array.isArray(allowed) && allowed.length > 0;
}
