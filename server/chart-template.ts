/** شجرة حسابات موسّعة مستوحاة من Mega Cash */
export const CHART_TEMPLATE_ACCOUNTS: Array<{
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  isParent?: boolean;
  parentCode?: string;
}> = [
  { code: "1000", name: "الأصول", type: "asset", isParent: true },
  { code: "1100", name: "الأصول المتداولة", type: "asset", isParent: true, parentCode: "1000" },
  { code: "1101", name: "الصندوق", type: "asset", parentCode: "1100" },
  { code: "1110", name: "البنوك", type: "asset", isParent: true, parentCode: "1100" },
  { code: "1120", name: "العملاء", type: "asset", isParent: true, parentCode: "1100" },
  { code: "1210", name: "حسابات العملاء", type: "asset", parentCode: "1120" },
  { code: "1140", name: "المخزون", type: "asset", parentCode: "1100" },
  { code: "1160", name: "إنتاج تحت التشغيل", type: "asset", parentCode: "1100" },
  { code: "1150", name: "شيكات تحت التحصيل", type: "asset", parentCode: "1100" },
  { code: "1290", name: "مجمع إهلاك الأصول", type: "asset", parentCode: "1100" },
  { code: "1200", name: "الأصول الثابتة", type: "asset", isParent: true, parentCode: "1000" },
  { code: "1201", name: "أصول ثابتة تشغيلية", type: "asset", parentCode: "1200" },
  { code: "2000", name: "الخصوم", type: "liability", isParent: true },
  { code: "2100", name: "الخصوم المتداولة", type: "liability", isParent: true, parentCode: "2000" },
  { code: "2110", name: "الموردين", type: "liability", parentCode: "2100" },
  { code: "2140", name: "ضريبة القيمة المضافة", type: "liability", parentCode: "2100" },
  { code: "2160", name: "شيكات صادرة", type: "liability", parentCode: "2100" },
  { code: "3000", name: "حقوق الملكية", type: "equity", isParent: true },
  { code: "3100", name: "رأس المال", type: "equity", parentCode: "3000" },
  { code: "3200", name: "أرباح محتجزة", type: "equity", parentCode: "3000" },
  { code: "4000", name: "الإيرادات", type: "revenue", isParent: true },
  { code: "4100", name: "إيرادات المبيعات", type: "revenue", parentCode: "4000" },
  { code: "4900", name: "إيرادات أخرى", type: "revenue", parentCode: "4000" },
  { code: "5000", name: "المصروفات", type: "expense", isParent: true },
  { code: "5100", name: "تكلفة المبيعات", type: "expense", parentCode: "5000" },
  { code: "5200", name: "مصروف الرواتب", type: "expense", parentCode: "5000" },
  { code: "5300", name: "مصروف الإهلاك", type: "expense", parentCode: "5000" },
  { code: "5900", name: "مصروفات عامة", type: "expense", parentCode: "5000" },
];
