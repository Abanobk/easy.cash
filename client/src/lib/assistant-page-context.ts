import { ERP_NAVIGATION, type NavItemConfig } from "@/config/erp-navigation";
import { permissionModuleFromPath } from "@shared/permissions";

export type AssistantPageContext = {
  path: string;
  label: string;
  breadcrumb: string;
  moduleId: string | null;
  suggestions: string[];
};

function flattenNav(items: NavItemConfig[], trail: string[] = []): { label: string; path: string; breadcrumb: string }[] {
  const out: { label: string; path: string; breadcrumb: string }[] = [];
  for (const item of items) {
    const chain = [...trail, item.label];
    if (item.path) {
      out.push({ label: item.label, path: item.path, breadcrumb: chain.join(" › ") });
    }
    if (item.children?.length) out.push(...flattenNav(item.children, chain));
  }
  return out;
}

const NAV_FLAT = flattenNav(ERP_NAVIGATION);

const MODULE_SUGGESTIONS: Record<string, string[]> = {
  accounts: [
    "فين أشغّل مراجع الحسابات الذكي؟",
    "إيه أهم مخاطر الحسابات دلوقتي؟",
    "إزاي أعمل قيد يومية؟",
    "فين دليل الحسابات؟",
  ],
  import_costing: [
    "راجع طريقة الحساب دي صح ولا غلط حسب أرقامي؟",
    "عندك اقتراحات تحسين للتوزيع أو الشحن؟",
    "اشرح لي صيغة تكلفة الوصول للقطعة",
    "الفاتورة الجمركية عندي منطقية ولا لا؟",
  ],
  sales: [
    "إزاي أعمل فاتورة مبيعات وأعتمدها؟",
    "فين أسجّل تحصيل من العميل؟",
    "إزاي أطبع الفاتورة؟",
  ],
  purchases: [
    "إزاي أسجّل فاتورة مشتريات؟",
    "إزاي أسدّد لمورد؟",
    "الفرق بين أمر الشراء والفاتورة؟",
  ],
  bank: [
    "إزاي أسجّل شيك وارد؟",
    "شرح توجيه الشيكات من الحيازة للإيداع",
    "فين أضيف حساب بنك في الشجرة؟",
  ],
  cash: [
    "إزاي أعمل قبض من عميل؟",
    "إزاي أسجّل صرف لمورد؟",
  ],
  inventory: [
    "إزاي أضيف صنف جديد؟",
    "إزاي أحوّل بين مخازن؟",
  ],
  reports: [
    "فين قائمة الدخل؟",
    "فين ميزان المراجعة؟",
    "فين كشف حساب عميل؟",
  ],
  hr: [
    "إزاي أضيف موظف؟",
    "فين الحضور والرواتب؟",
  ],
  settings: [
    "إزاي أغيّر بيانات الشركة؟",
    "فين المستخدمين والصلاحيات؟",
  ],
  security: [
    "إزاي أضيف مستخدم جديد؟",
    "إزاي أعدّل صلاحيات دور؟",
  ],
  dashboard: [
    "إيه اللي أقدر أعمله من الرئيسية؟",
    "فين التنبيهات التشغيلية؟",
  ],
};

const DEFAULT_SUGGESTIONS = [
  "إزاي أعمل فاتورة مبيعات؟",
  "فين التقارير المالية؟",
  "إشرح تكليف شحنة باختصار",
];

/** يحوّل مسار المتصفح إلى مسار داخل التطبيق بدون slug */
export function appPathFromLocation(location: string, tenantSlug?: string | null): string {
  const raw = (location.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  if (!tenantSlug) return raw || "/";
  const prefix = `/${tenantSlug}`;
  if (raw === prefix) return "/";
  if (raw.startsWith(`${prefix}/`)) {
    const rest = raw.slice(prefix.length);
    return rest || "/";
  }
  return raw || "/";
}

function scorePathMatch(candidate: string, current: string): number {
  const a = candidate.split("?")[0].replace(/\/+$/, "") || "/";
  const b = current.split("?")[0].replace(/\/+$/, "") || "/";
  if (a === b) return 1000 + a.length;
  if (a !== "/" && b.startsWith(`${a}/`)) return 500 + a.length;
  return 0;
}

export function resolveAssistantPage(location: string, tenantSlug?: string | null): AssistantPageContext {
  const path = appPathFromLocation(location, tenantSlug);
  let best: { label: string; path: string; breadcrumb: string; score: number } | null = null;

  for (const entry of NAV_FLAT) {
    const score = scorePathMatch(entry.path, path);
    if (score <= 0) continue;
    if (!best || score > best.score) best = { ...entry, score };
  }

  // مسارات تفصيلية غير موجودة في الناف
  if (!best || best.score < 500) {
    if (path.includes("/accounting-auditor")) {
      best = {
        label: "مراجع الحسابات الذكي",
        path: "/accounting-auditor",
        breadcrumb: "مراجع الحسابات الذكي",
        score: 950,
      };
    } else if (path.includes("/import-costing")) {
      best = {
        label: path.includes("/new") ? "تقدير شحنة جديد" : "تكليف شحنة",
        path: "/import-costing",
        breadcrumb: "تكليف شحنة",
        score: 900,
      };
    }
  }

  const label = best?.label || "البرنامج";
  const pagePath = best?.path || path || "/";
  const moduleId = permissionModuleFromPath(path);
  const suggestions = (moduleId && MODULE_SUGGESTIONS[moduleId]) || DEFAULT_SUGGESTIONS;

  return {
    path: pagePath,
    label,
    breadcrumb: best?.breadcrumb || label,
    moduleId,
    suggestions,
  };
}

export function assistantGreeting(page: AssistantPageContext, hasScreenData?: boolean): string {
  if (page.path.includes("/accounting-auditor")) {
    return `دي شاشة مراجع الحسابات الذكي. اضغط «ابدأ المراجعة» هفحص الأرقام وأطلعلك ملاحظات وتوصيات. تقدر تسألني هنا تفسّر أي ملاحظة.`;
  }
  if (hasScreenData && page.moduleId === "import_costing") {
    return `شايف تقرير تكليف الشحنة المفتوح. أقدر أراجع الحسابات والجمارك والتوزيع كمرجع داخل البرنامج — اسألني صح ولا غلط أو اطلب اقتراح.`;
  }
  return `تحب أساعدك في «${page.label}»؟ اسأل عن أي خانة أو حساب أو خطوة في الشاشة دي.`;
}
