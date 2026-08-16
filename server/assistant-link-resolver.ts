import type { AppMapEntry } from "./assistant-app-map";
import { getAppMapEntries } from "./assistant-app-map";

/** عبارات شائعة في إجابات المساعد → المسار الصحيح (الأكثر تحديداً أولاً) */
const LINE_INTENTS: { test: (line: string) => boolean; path: string }[] = [
  { test: (l) => /توجيه\s*الشيك|توجيه\s*شيك|حيازة\s*شيك|مسؤول\s*الحياز|الحائز|موعد\s*الإيداع|شيك\s*مودع|إيداع\s*الشيك|check\s*routing/i.test(l), path: "/bank/check-routing" },
  { test: (l) => /شيك\s*وار|شيكات\s*وار|تسجيل\s*شيك/i.test(l), path: "/bank/checks?type=in" },
  { test: (l) => /شيك\s*صادر|شيكات\s*صادر/i.test(l), path: "/bank/checks?type=out" },
  { test: (l) => /مردود\s*بيع|مرتجع\s*مبيعات|فاتورة\s*مردود/i.test(l), path: "/sales/returns" },
  { test: (l) => /مردود\s*شراء|مرتجع\s*مشتريات/i.test(l), path: "/purchases/returns" },
  { test: (l) => /تحصيل|قبض\s*من|سند\s*قبض|المقبوضات|استلام\s*نقد/i.test(l), path: "/cash/receive-customer" },
  { test: (l) => /صرف\s*لمورد|سداد\s*مورد|مدفوعات\s*مورد/i.test(l), path: "/cash/pay-supplier" },
  { test: (l) => /فواتير?\s*المبيعات|فاتورة\s*مبيعات|فاتورة\s*بيع|شاشة\s*المبيعات|sales.*invoice/i.test(l), path: "/sales/invoices" },
  { test: (l) => /فواتير?\s*المشتريات|فاتورة\s*مشتريات|فاتورة\s*شراء/i.test(l), path: "/purchases/invoices" },
  { test: (l) => /طلب\s*بيع|أمر\s*بيع/i.test(l), path: "/sales/orders" },
  { test: (l) => /طلب\s*شراء|أمر\s*شراء/i.test(l), path: "/purchases/orders" },
  { test: (l) => /بيانات\s*العميل|اختر\s*العميل|اختيار\s*العميل|قائمة\s*العملاء|إضافة\s*عميل|تعريف\s*عميل/i.test(l), path: "/customers" },
  { test: (l) => /بيانات\s*المورد|قائمة\s*الموردين|إضافة\s*مورد/i.test(l), path: "/suppliers" },
  { test: (l) => /قيد\s*يومية|قيود\s*اليومية|تسوية\s*حساب/i.test(l), path: "/accounts/journal" },
  { test: (l) => /دليل\s*الحسابات|شجرة\s*الحسابات/i.test(l), path: "/accounts/chart" },
  { test: (l) => /ميزان\s*مراجعة/i.test(l), path: "/reports/final/finalreports-trialbalance" },
  { test: (l) => /قائمة\s*الدخل|أرباح\s*وخسائر|الأرباح/i.test(l), path: "/reports/final/finalreports-incomestatment" },
  { test: (l) => /ميزانية\s*عمومية/i.test(l), path: "/reports/final/finalreports-balancesheet" },
  { test: (l) => /كشف\s*حساب\s*عميل/i.test(l), path: "/contacts/statement?type=customer" },
  { test: (l) => /كشف\s*حساب\s*مورد/i.test(l), path: "/contacts/statement?type=vendor" },
  { test: (l) => /الأصناف|بيانات\s*الصنف|تعريف\s*صنف/i.test(l), path: "/items" },
  { test: (l) => /الموظفين|موظف\s*جديد/i.test(l), path: "/hr/employees" },
  { test: (l) => /الحضور|انصراف/i.test(l), path: "/hr/attendance" },
  { test: (l) => /الرواتب|راتب/i.test(l), path: "/hr/payroll" },
  { test: (l) => /التقرير\s*الضريبي|ضريبة/i.test(l), path: "/reports/tax" },
  { test: (l) => /تكليف\s*شحن|تقدير\s*شحن|فاتورة\s*جمرك|عرض\s*الشحن|مصاريف\s*الشحن|نولون|حاسبة\s*عرض/i.test(l), path: "/import-costing" },
  { test: (l) => /صلاحيات|المستخدمين|أدوار/i.test(l), path: "/settings/users" },
];

const LINK_PATTERN = /\[\[([^|\]]+)\|([^\]]+)\]\]/g;

function scoreEntryLabel(line: string, entry: AppMapEntry): number {
  if (!entry.path || entry.status === "missing") return 0;
  if (!line.includes(entry.label)) return 0;
  return entry.label.length;
}

/** يحدد أفضل مسار لسطر واحد من النص */
export function resolvePathForLine(line: string, entries = getAppMapEntries()): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  for (const intent of LINE_INTENTS) {
    if (intent.test(trimmed)) return intent.path;
  }

  let bestPath: string | null = null;
  let bestScore = 0;
  for (const entry of entries) {
    const score = scoreEntryLabel(trimmed, entry);
    if (score > bestScore) {
      bestScore = score;
      bestPath = entry.path;
    }
  }

  return bestScore >= 6 ? bestPath : null;
}

/** يصحّح روابط كل سطر حسب محتواه (يتجاهل روابط الموديل الخاطئة) */
export function enrichAssistantContent(raw: string): string {
  const entries = getAppMapEntries().filter((e) => e.status !== "missing" && e.path);

  return normalizeAssistantContent(raw)
    .split("\n")
    .map((line) => {
      const clean = line.replace(LINK_PATTERN, "").trim();
      if (!clean) return "";
      const path = resolvePathForLine(clean, entries);
      if (!path) return clean;
      return `${clean} [[اضغط هنا|${path}]]`;
    })
    .filter(Boolean)
    .join("\n");
}

/** يزيل أقسام الروابط المنفصلة وعلامات Markdown الزائدة */
export function normalizeAssistantContent(raw: string): string {
  let content = raw.trim();
  content = content.replace(/\n#{1,3}\s*روابط[\s\S]*$/i, "").trim();
  content = content.replace(/\n\*{0,2}روابط الشاشات[\s\S]*$/i, "").trim();
  content = content.replace(/\*\*([^*]+)\*\*/g, "$1");
  content = content.replace(/^#{1,3}\s+/gm, "");
  return content;
}

export { LINK_PATTERN };
