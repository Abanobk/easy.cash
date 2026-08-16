import { FEATURE_REGISTRY } from "./erp-navigation";

export type ReportSectionDef = {
  slug: string;
  title: string;
  needsDates: boolean;
};

function reportsForModule(moduleName: string): ReportSectionDef[] {
  return Object.entries(FEATURE_REGISTRY)
    .filter(([, v]) => v.module === moduleName)
    .map(([slug, v]) => ({
      slug,
      title: v.label,
      needsDates: !slug.includes("list") && slug !== "accountingreports-dashboard",
    }));
}

export const ACCOUNTING_REPORTS = reportsForModule("تقارير الحسابات");
export const FINAL_REPORTS = reportsForModule("التقارير الختامية");
export const HR_REPORTS = reportsForModule("تقارير شئون الموظفين");
export const ASSETS_REPORTS = reportsForModule("تقارير الاصول الثابتة");
