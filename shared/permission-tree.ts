/**
 * شجرة الصلاحيات التفصيلية (زي ميجا كاش) — قسم رئيسي ← عنصر ← صلاحيات محدّدة له.
 *
 * ده مستوى إضافي أدق فوق نظام الصلاحيات الحالي (shared/permissions.ts: 19 وحدة × 4 أفعال
 * عامة). النظام القديم يفضل شغّال زي ما هو للتحقق الفعلي في الـtRPC والـPermissionGate —
 * الشجرة دي في المرحلة الحالية بيانات وواجهة إدارة بس (تخزين واسترجاع)، وربطها بالتنفيذ
 * الفعلي شاشة بشاشة هيحصل تدريجيًا بعد كده.
 *
 * كل عنصر (entity) اتحدد له "حزمة" صلاحيات (bundle) حسب أقرب نوع مستند شفناه فعليًا في
 * تصدير صلاحيات ميجا كاش (كشوف كاملة اتراجعت من 48 لقطة شاشة حقيقية). أغلب العناصر
 * اتأكدت مباشرة؛ عناصر قليلة (خصوصًا تفاصيل بعض التقارير) اتصنّفت بأقرب حزمة مشابهة
 * ومحتاجة مراجعة بشرية لو ميجا كاش عندها استثناء مختلف — راجع القسم في نهاية الملف.
 */

export type PermActionKey =
  | "add"
  | "edit"
  | "approve"
  | "viewDoc"
  | "viewDocList"
  | "deleteCancel"
  | "print"
  | "changeDate"
  | "viewBalances"
  | "printWithoutApproval"
  | "allBranches"
  | "viewOtherUsersDocs"
  | "unapprove"
  | "viewSecretAccounts"
  | "copy"
  | "changeExchangeRate"
  | "backdate"
  | "addDiscount"
  | "addTax"
  | "changePriceCost"
  | "skipPriceLimit"
  | "viewCosts"
  | "allWarehouses";

export const PERM_ACTION_LABELS: Record<PermActionKey, string> = {
  add: "إضافة",
  edit: "تعديل",
  approve: "اعتماد",
  viewDoc: "عرض المستند",
  viewDocList: "عرض قائمة المستندات",
  deleteCancel: "حذف / إلغاء",
  print: "طباعة",
  changeDate: "تغيير التاريخ",
  viewBalances: "عرض الأرصدة",
  printWithoutApproval: "طباعة بدون اعتماد",
  allBranches: "تعامل على كل الفروع",
  viewOtherUsersDocs: "عرض مستندات مستخدمين آخرين",
  unapprove: "فك اعتماد",
  viewSecretAccounts: "عرض الحسابات السرية",
  copy: "نسخ",
  changeExchangeRate: "تغيير سعر صرف العملة",
  backdate: "التعامل بتاريخ سابق لتاريخ اليوم",
  addDiscount: "إضافة خصم",
  addTax: "إضافة ضريبة",
  changePriceCost: "تغيير الأسعار / التكاليف",
  skipPriceLimit: "تخطي حدود السعر",
  viewCosts: "عرض التكاليف",
  allWarehouses: "تعامل على كل المخازن",
};

/**
 * تصنيف كل فعل لفئة معنى (للعرض فقط — تلوين وترتيب في الواجهة عشان الشجرة الكبيرة
 * (٢٣ فعل × ١٦٦ عنصر) متبقاش لغبطة بصرية. الترتيب هنا بيحدد ترتيب ظهور الأفعال جوه
 * كل عنصر في الواجهة (نفس الفئة تتجمع مع بعض).
 */
export type PermActionCategory =
  | "core"
  | "destructive"
  | "approval"
  | "scope"
  | "finance"
  | "sensitive"
  | "print";

export const PERM_ACTION_CATEGORY: Record<PermActionKey, PermActionCategory> = {
  add: "core",
  edit: "core",
  viewDoc: "core",
  viewDocList: "core",
  deleteCancel: "destructive",
  approve: "approval",
  unapprove: "approval",
  changeDate: "approval",
  backdate: "approval",
  allBranches: "scope",
  allWarehouses: "scope",
  viewOtherUsersDocs: "scope",
  copy: "scope",
  addDiscount: "finance",
  addTax: "finance",
  viewSecretAccounts: "sensitive",
  viewCosts: "sensitive",
  viewBalances: "sensitive",
  changePriceCost: "sensitive",
  changeExchangeRate: "sensitive",
  skipPriceLimit: "sensitive",
  print: "print",
  printWithoutApproval: "print",
};

export const PERM_ACTION_CATEGORY_LABELS: Record<PermActionCategory, string> = {
  core: "أساسي",
  destructive: "حذف / إلغاء",
  approval: "اعتماد وتحكم بالتاريخ",
  scope: "نطاق الصلاحية",
  finance: "خصومات وضرائب",
  sensitive: "بيانات حساسة ومالية",
  print: "طباعة",
};

/** ترتيب ظهور الفئات في الواجهة */
export const PERM_ACTION_CATEGORY_ORDER: PermActionCategory[] = [
  "core",
  "destructive",
  "approval",
  "scope",
  "finance",
  "sensitive",
  "print",
];

/** حزم صلاحيات جاهزة — كل عنصر في الشجرة بياخد وحدة منها بدل ما نكررها يدوي في كل سطر. */
export const PERM_BUNDLES = {
  /** بيانات بسيطة: إضافة/تعديل/عرض/حذف بس (إدارات، وظائف، فترات عمل...) */
  BASIC4: ["add", "edit", "viewDoc", "deleteCancel"] as PermActionKey[],
  /** زي فوق + تعامل على كل الفروع */
  BASIC4_BRANCH: ["add", "edit", "viewDoc", "deleteCancel", "allBranches"] as PermActionKey[],
  /** بيانات أساسية بيها اعتماد (عميل / مورد) */
  MASTER_PARTY: ["add", "edit", "approve", "viewDoc", "viewDocList", "deleteCancel", "allBranches", "changeExchangeRate"] as PermActionKey[],
  /** بيانات أساسية شجرية (شجرة الحسابات) */
  MASTER_TREE: ["add", "edit", "approve", "viewDoc", "deleteCancel", "allBranches", "changeExchangeRate"] as PermActionKey[],
  /** معاملة مالية كاملة (نقدية/بنكية/قيد يومية/تحويل أموال/صرف رواتب/أصول) */
  TRANSACTION: ["add", "edit", "approve", "viewDoc", "viewDocList", "deleteCancel", "print", "changeDate", "viewBalances", "printWithoutApproval", "allBranches", "viewOtherUsersDocs", "unapprove", "viewSecretAccounts", "copy", "changeExchangeRate", "backdate"] as PermActionKey[],
  /** أمر إنتاج: زي المعاملة المالية لكن بتكاليف بدل أرصدة + تعامل على كل المخازن */
  TRANSACTION_PRODUCTION: ["add", "edit", "approve", "viewDoc", "viewDocList", "deleteCancel", "print", "changeDate", "allBranches", "viewOtherUsersDocs", "viewCosts", "unapprove", "copy", "backdate", "allWarehouses"] as PermActionKey[],
  /** فاتورة/طلب شراء ومرتجعاته */
  INVOICE_PURCHASE: ["add", "edit", "approve", "viewDoc", "viewDocList", "deleteCancel", "print", "changeDate", "changePriceCost", "addDiscount", "addTax", "viewBalances", "printWithoutApproval", "allBranches", "viewOtherUsersDocs", "viewCosts", "unapprove", "viewSecretAccounts", "copy", "changeExchangeRate", "backdate", "allWarehouses"] as PermActionKey[],
  /** فاتورة/طلب بيع ومرتجعاته — زي الشراء + تخطي حدود السعر */
  INVOICE_SALES: ["add", "edit", "approve", "viewDoc", "viewDocList", "deleteCancel", "print", "changeDate", "changePriceCost", "addDiscount", "addTax", "viewBalances", "skipPriceLimit", "printWithoutApproval", "allBranches", "viewOtherUsersDocs", "viewCosts", "unapprove", "viewSecretAccounts", "copy", "changeExchangeRate", "backdate"] as PermActionKey[],
  /** قرض */
  LOAN: ["add", "edit", "approve", "viewDoc", "viewDocList", "deleteCancel", "allBranches", "viewOtherUsersDocs", "unapprove", "viewSecretAccounts", "changeExchangeRate", "backdate"] as PermActionKey[],
  /** قسط */
  INSTALLMENT: ["add", "edit", "approve", "viewDoc", "viewDocList", "deleteCancel", "print", "changeDate", "printWithoutApproval", "allBranches", "viewOtherUsersDocs", "unapprove", "changeExchangeRate"] as PermActionKey[],
  /** استحقاق */
  RECEIVABLE: ["add", "edit", "approve", "viewDoc", "viewDocList", "deleteCancel", "print", "changeDate", "printWithoutApproval", "allBranches", "viewOtherUsersDocs", "unapprove"] as PermActionKey[],
  /** إدارة المستخدمين */
  USER_MGMT: ["add", "edit", "viewDoc", "deleteCancel", "allBranches"] as PermActionKey[],
  /** تعديل بياناتي الشخصية */
  SELF_EDIT: ["edit", "viewDoc"] as PermActionKey[],
  /** تقرير عرض بس */
  REPORT: ["viewDoc", "allBranches"] as PermActionKey[],
  REPORT_SECRET: ["viewDoc", "allBranches", "viewSecretAccounts"] as PermActionKey[],
  REPORT_COST: ["viewDoc", "allBranches", "viewCosts"] as PermActionKey[],
  REPORT_WAREHOUSE: ["viewDoc", "allBranches", "allWarehouses"] as PermActionKey[],
  REPORT_SECRET_WAREHOUSE: ["viewDoc", "allBranches", "viewSecretAccounts", "allWarehouses"] as PermActionKey[],
  REPORT_COST_WAREHOUSE: ["viewDoc", "allBranches", "viewCosts", "allWarehouses"] as PermActionKey[],
} as const;

export type PermBundleKey = keyof typeof PERM_BUNDLES;

/**
 * موديولات إضافية خاصة ببرنامجنا (مش جزء من شجرة ميجا الأساسية: أدوات ذكاء اصطناعي،
 * تكليف شحنة). قفل عنصر واحد فيهم لوحده مايفعّلش "وضع التقييد" (اللي بيقفل أي قسم
 * تاني الدور محدش لمسه) — لكن هما نفسهم برضو بيتقفلوا افتراضيًا أول ما الدور يبقى
 * متحكم فيه بالتفصيل من قسم أساسي واحد على الأقل. شايفها في:
 * - client/src/lib/entity-nav-filter.ts (إخفاء عناصر القائمة الجانبية)
 * - client/src/hooks/useEntityPermission.ts (إخفاء أزرار زي "مراجع الحسابات")
 * - server/entity-permission-service.ts (المنع الفعلي في الـtRPC)
 */
export const CORE_MIGRATION_EXEMPT_MODULES: ReadonlySet<string> = new Set(["ai_tools", "import_costing"]);

/** true لو الدور متحكم فيه بالتفصيل فعلاً (عنده صف في قسم أساسي واحد على الأقل). */
export function isCoreMigrated(entityKeys: Iterable<string>): boolean {
  for (const k of entityKeys) {
    const sep = k.indexOf("::");
    const moduleKey = sep === -1 ? k : k.slice(0, sep);
    if (!CORE_MIGRATION_EXEMPT_MODULES.has(moduleKey)) return true;
  }
  return false;
}

export type PermEntity = {
  key: string;
  label: string;
  bundle: PermBundleKey;
  /** استثناء نادر: يضيف/يشيل أفعال فوق حزمة الـbundle الأساسية */
  extra?: PermActionKey[];
  omit?: PermActionKey[];
};

export type PermModule = {
  key: string;
  label: string;
  entities: PermEntity[];
};

function actionsFor(e: PermEntity): PermActionKey[] {
  let acts = [...PERM_BUNDLES[e.bundle]];
  if (e.extra) acts = [...acts, ...e.extra];
  if (e.omit) acts = acts.filter((a) => !e.omit!.includes(a));
  return acts;
}

export const PERMISSION_TREE: PermModule[] = [
  {
    key: "settings",
    label: "إعدادات عامة",
    entities: [
      { key: "companySettings", label: "إعدادات الشركة", bundle: "BASIC4", omit: ["add", "deleteCancel"] },
      { key: "branches", label: "الفروع", bundle: "BASIC4_BRANCH" },
      { key: "currencyRates", label: "أسعار العملات", bundle: "BASIC4_BRANCH" },
      { key: "pendingDocs", label: "المستندات المعلقة", bundle: "REPORT" },
      { key: "alerts", label: "التنبيهات", bundle: "REPORT" },
      { key: "generalProperties", label: "خصائص عامة", bundle: "BASIC4" },
      { key: "journalTypes", label: "أنواع القيود", bundle: "BASIC4" },
      { key: "openPreviousPeriod", label: "فتح فترة مالية سابقة", bundle: "REPORT", omit: ["allBranches"] },
      { key: "closePeriod", label: "إغلاق الفترة المالية", bundle: "REPORT", omit: ["allBranches"] },
      { key: "userActions", label: "حركات المستخدمين", bundle: "REPORT" },
      { key: "importData", label: "استيراد البيانات", bundle: "REPORT", omit: ["allBranches"] },
    ],
  },
  {
    key: "contacts",
    label: "العملاء والموردين",
    entities: [
      { key: "contactCategories", label: "فئات العملاء / الموردين", bundle: "BASIC4_BRANCH" },
      { key: "customer", label: "عميل", bundle: "MASTER_PARTY" },
      { key: "supplier", label: "مورد", bundle: "MASTER_PARTY" },
    ],
  },
  {
    key: "hr",
    label: "شئون الموظفين",
    entities: [
      { key: "departments", label: "الإدارات", bundle: "BASIC4" },
      { key: "jobs", label: "الوظائف", bundle: "BASIC4" },
      { key: "workShifts", label: "فترات العمل", bundle: "BASIC4" },
      { key: "leaves", label: "الإجازات", bundle: "BASIC4" },
      { key: "shiftSystem", label: "نظام الورديات", bundle: "BASIC4" },
      { key: "incentives", label: "الحوافز", bundle: "BASIC4" },
      { key: "onDemandEmployees", label: "موظفين تحت الطلب", bundle: "BASIC4", extra: ["viewDocList"], omit: ["deleteCancel"] },
      { key: "employees", label: "الموظفين", bundle: "BASIC4", extra: ["approve", "viewSecretAccounts"] },
      { key: "employeeTransactions", label: "معاملات الموظفين", bundle: "BASIC4", omit: ["add", "deleteCancel"] },
      { key: "fingerprintDevices", label: "ماكينات البصمة", bundle: "BASIC4" },
      { key: "mobileFingerprint", label: "بصمة من الموبايل", bundle: "BASIC4", omit: ["edit", "deleteCancel"] },
      { key: "mobileFingerprintLocations", label: "مواقع بصمة الموبايل", bundle: "BASIC4" },
      { key: "attendance", label: "الحضور والانصراف", bundle: "BASIC4" },
      { key: "attendanceMachine", label: "الحضور والانصراف من الماكينة", bundle: "BASIC4" },
      { key: "systems", label: "الأنظمة", bundle: "BASIC4" },
      { key: "deptEmployeeSystems", label: "أنظمة الأقسام / الموظفين", bundle: "BASIC4" },
      { key: "salaryAccount", label: "حساب الرواتب", bundle: "TRANSACTION" },
    ],
  },
  {
    key: "inventory",
    label: "المخازن",
    entities: [
      { key: "warehouses", label: "المخازن", bundle: "BASIC4_BRANCH" },
      { key: "itemCategories", label: "فئات الأصناف", bundle: "BASIC4_BRANCH" },
      { key: "item", label: "صنف", bundle: "BASIC4_BRANCH" },
      { key: "stockAdjustment", label: "تسوية مخزنية", bundle: "BASIC4_BRANCH" },
      { key: "stockTransfer", label: "تحويل مخزني", bundle: "BASIC4_BRANCH" },
      { key: "beginningInventory", label: "مخزون أول المدة", bundle: "BASIC4_BRANCH" },
      { key: "priceChange", label: "تغيير الأسعار", bundle: "BASIC4_BRANCH" },
      { key: "batchNumbers", label: "أرقام التشغيلة", bundle: "BASIC4_BRANCH" },
      { key: "offers", label: "العروض", bundle: "BASIC4_BRANCH" },
      { key: "excelStockCount", label: "جرد بالإكسل", bundle: "BASIC4_BRANCH" },
    ],
  },
  {
    key: "purchases",
    label: "فواتير الشراء",
    entities: [
      { key: "purchaseOrder", label: "طلب شراء", bundle: "INVOICE_PURCHASE" },
      { key: "purchaseInvoice", label: "فاتورة شراء", bundle: "INVOICE_PURCHASE" },
      { key: "purchaseReturnInvoice", label: "فاتورة مردود شراء", bundle: "INVOICE_PURCHASE" },
    ],
  },
  {
    key: "sales",
    label: "فواتير المبيعات",
    entities: [
      { key: "saleOrder", label: "طلب بيع", bundle: "INVOICE_SALES" },
      { key: "cashSaleInvoice", label: "فاتورة مبيعات نقدية", bundle: "INVOICE_SALES" },
      { key: "saleInvoice", label: "فاتورة بيع", bundle: "INVOICE_SALES" },
      { key: "saleReturnInvoice", label: "فاتورة مردود بيع", bundle: "INVOICE_SALES" },
    ],
  },
  {
    key: "sales_reps",
    label: "مندوبين البيع",
    entities: [
      { key: "salesAreas", label: "مناطق البيع", bundle: "BASIC4" },
      { key: "salesReps", label: "مناديب البيع", bundle: "BASIC4_BRANCH" },
    ],
  },
  {
    key: "cash",
    label: "معاملات نقدية",
    entities: [
      { key: "cashReceipt", label: "استلام نقدية", bundle: "TRANSACTION" },
      { key: "cashReceiptFromCustomer", label: "استلام نقدية من عميل", bundle: "TRANSACTION" },
      { key: "cashPayment", label: "صرف نقدية", bundle: "TRANSACTION" },
      { key: "cashPaymentToSupplier", label: "صرف نقدية لمورد", bundle: "TRANSACTION" },
    ],
  },
  {
    key: "bank",
    label: "معاملات بنكية",
    entities: [
      { key: "bankDeposit", label: "إيداع بنكي", bundle: "TRANSACTION" },
      { key: "bankDepositFromCustomer", label: "إيداع بنكي من عميل", bundle: "TRANSACTION" },
      { key: "bankWithdrawal", label: "سحب بنكي", bundle: "TRANSACTION" },
      { key: "bankWithdrawalToSupplier", label: "سحب بنكي لمورد", bundle: "TRANSACTION" },
      { key: "checkIn", label: "شيك وارد", bundle: "TRANSACTION" },
      { key: "checkOut", label: "شيك صادر", bundle: "TRANSACTION" },
      { key: "fundTransferBank", label: "تحويل أموال", bundle: "TRANSACTION" },
    ],
  },
  {
    key: "accounts",
    label: "الحسابات",
    entities: [
      { key: "chartOfAccounts", label: "شجرة الحسابات", bundle: "MASTER_TREE" },
      { key: "taxes", label: "الضرائب", bundle: "BASIC4" },
      { key: "journalEntry", label: "قيد يومية", bundle: "TRANSACTION" },
      { key: "fundTransfer", label: "تحويل أموال", bundle: "TRANSACTION" },
    ],
  },
  {
    key: "assets",
    label: "الأصول الثابتة",
    entities: [
      { key: "assetCategories", label: "فئات الأصول", bundle: "BASIC4" },
      { key: "assets", label: "الأصول", bundle: "TRANSACTION" },
      { key: "capitalMaintenance", label: "الصيانة الرأسمالية", bundle: "TRANSACTION" },
      { key: "assetSale", label: "بيع الأصول", bundle: "TRANSACTION" },
    ],
  },
  {
    key: "production",
    label: "الإنتاج",
    entities: [
      { key: "productionOrder", label: "أمر إنتاج", bundle: "TRANSACTION_PRODUCTION" },
    ],
  },
  {
    key: "cost_centers",
    label: "مراكز التكلفة",
    entities: [
      { key: "costCenters", label: "مراكز التكلفة", bundle: "BASIC4_BRANCH" },
    ],
  },
  {
    key: "loans",
    label: "القروض",
    entities: [
      { key: "loan", label: "قرض", bundle: "LOAN" },
    ],
  },
  {
    key: "installments",
    label: "الأقساط",
    entities: [
      { key: "installment", label: "قسط", bundle: "INSTALLMENT" },
    ],
  },
  {
    key: "receivables",
    label: "الاستحقاقات",
    entities: [
      { key: "receivable", label: "استحقاق", bundle: "RECEIVABLE" },
    ],
  },
  {
    // ملحوظة مهمة: مفاتيح العناصر هنا هي أكواد التقارير الحقيقية (slug) زي ما هي مسجّلة
    // في client/src/config/erp-navigation.ts (FEATURE_REGISTRY) والسيرفر — مش أسماء
    // مُخترعة بنحاول نطابقها وقت التشغيل. ده يمنع بالظبط النوع اللي حصل فعلاً (تقرير
    // "فواتير المشتريات" فضل شغال رغم إنه معندوش صلاحية، لأن التصنيف القديم كان تخمين
    // بالاسم مش ربط مباشر بالكود الحقيقي). كل تقرير هنا بيتفحص بـ assertEntityAction
    // مباشرة بالـslug بتاعه من server/entity-permission-service.ts.
    key: "reports",
    label: "التقارير",
    entities: [
      // تقارير المخازن
      { key: "invreports-inventorysummary", label: "تقارير المخازن ← جرد المخازن", bundle: "REPORT_WAREHOUSE" },
      { key: "invreports-itemstransferdetails", label: "تقارير المخازن ← حركة تفصيلية للأصناف", bundle: "REPORT_SECRET_WAREHOUSE" },
      { key: "invreports-totalinventoryexportimportreport", label: "تقارير المخازن ← صادر / وارد مخزن", bundle: "REPORT_SECRET_WAREHOUSE" },
      { key: "invreports-inventorytransferdetailsreport", label: "تقارير المخازن ← حركة تفصيلية للمخازن", bundle: "REPORT_SECRET_WAREHOUSE" },
      { key: "invreports-itemscosts", label: "تقارير المخازن ← تكاليف / قيمة الأصناف", bundle: "REPORT_COST_WAREHOUSE" },
      { key: "invreports-itemslist", label: "تقارير المخازن ← قائمة الأصناف", bundle: "REPORT_COST_WAREHOUSE" },
      { key: "invreports-itemssummary", label: "تقارير المخازن ← ملخص حركة الأصناف", bundle: "REPORT_SECRET_WAREHOUSE" },
      { key: "invreports-incomeoutcomeitem", label: "تقارير المخازن ← صادر / وارد صنف", bundle: "REPORT_WAREHOUSE" },
      { key: "invreports-stagnantitems", label: "تقارير المخازن ← الأصناف الراكدة", bundle: "REPORT_COST_WAREHOUSE" },
      { key: "invreports-itemaging", label: "تقارير المخازن ← أعمار الأصناف", bundle: "REPORT_COST_WAREHOUSE" },
      // تقارير الحسابات — عامة
      { key: "accountingreports-accountstatment", label: "تقارير الحسابات ← كشف حساب", bundle: "REPORT_SECRET" },
      { key: "accountingreports-accountstatment-cash", label: "تقارير الحسابات ← كشف حساب خزائن", bundle: "REPORT_SECRET" },
      { key: "accountingreports-areassummary", label: "تقارير الحسابات ← ملخص حركة المناطق", bundle: "REPORT" },
      { key: "accountingreports-branchessummary", label: "تقارير الحسابات ← ملخص حركة الفروع", bundle: "REPORT" },
      { key: "accountingreports-costcenterstatment", label: "تقارير الحسابات ← كشف حساب مركز تكلفة", bundle: "REPORT" },
      { key: "accountingreports-dashboard", label: "تقارير الحسابات ← ملخص الأعمال", bundle: "REPORT" },
      { key: "accountingreports-monthlyexpenses", label: "تقارير الحسابات ← المصروفات شهريًا", bundle: "REPORT" },
      { key: "accountingreports-payments", label: "تقارير الحسابات ← معاملات نقدية وبنكية", bundle: "REPORT_SECRET" },
      { key: "accountingreports-checks-checkin", label: "تقارير الحسابات ← الشيكات الواردة", bundle: "REPORT_SECRET" },
      { key: "accountingreports-checks-checkout", label: "تقارير الحسابات ← الشيكات الصادرة", bundle: "REPORT_SECRET" },
      // تقارير المبيعات
      { key: "accountingreports-customerstatment", label: "تقارير المبيعات ← كشف حساب عميل", bundle: "REPORT_SECRET" },
      { key: "accountingreports-customeraccountstatementbyitems", label: "تقارير المبيعات ← كشف حساب عميل بالأصناف", bundle: "REPORT_SECRET" },
      { key: "accountingreports-grosscustomersalesbyitems", label: "تقارير المبيعات ← المبيعات بالأصناف", bundle: "REPORT_SECRET_WAREHOUSE" },
      { key: "accountingreports-sales", label: "تقارير المبيعات ← البيع", bundle: "REPORT_SECRET_WAREHOUSE" },
      { key: "accountingreports-customerslist", label: "تقارير المبيعات ← قائمة العملاء", bundle: "REPORT_SECRET" },
      { key: "accountingreports-debitsages", label: "تقارير المبيعات ← أعمار الديون", bundle: "REPORT_SECRET" },
      { key: "accountingreports-debitsagesbyyear", label: "تقارير المبيعات ← أعمار الديون سنوي", bundle: "REPORT_SECRET" },
      { key: "accountingreports-debitsagesbyhalfyear", label: "تقارير المبيعات ← أعمار الديون نصف سنوي", bundle: "REPORT_SECRET" },
      { key: "accountingreports-matureinvoices", label: "تقارير المبيعات ← فواتير بيع مستحقة", bundle: "REPORT" },
      { key: "accountingreports-salesorders", label: "تقارير المبيعات ← طلبات البيع", bundle: "REPORT_WAREHOUSE" },
      { key: "accountingreports-customerssummary", label: "تقارير المبيعات ← ملخص حركة العملاء", bundle: "REPORT_SECRET" },
      { key: "accountingreports-monthlysalesbyitems", label: "تقارير المبيعات ← مبيعات الأصناف شهريًا بالكميات", bundle: "REPORT_WAREHOUSE" },
      { key: "accountingreports-monthlysalesbyitemstotals", label: "تقارير المبيعات ← مبيعات الأصناف شهريًا", bundle: "REPORT_WAREHOUSE" },
      { key: "accountingreports-lastprices", label: "تقارير المبيعات ← آخر سعر بيع / شراء", bundle: "REPORT_COST_WAREHOUSE" },
      { key: "accountingreports-customerssales", label: "تقارير المبيعات ← المبيعات بالعملاء", bundle: "REPORT_COST_WAREHOUSE" },
      // تقارير الأرباح
      { key: "accountingreports-itemsprofits", label: "تقارير الأرباح ← أرباح الأصناف", bundle: "REPORT_WAREHOUSE" },
      { key: "accountingreports-customersprofits", label: "تقارير الأرباح ← أرباح العملاء", bundle: "REPORT" },
      { key: "accountingreports-invoiceprofits", label: "تقارير الأرباح ← أرباح الفواتير", bundle: "REPORT_WAREHOUSE" },
      // تقارير المندوبين
      { key: "accountingreports-grossrepsalesbyitems", label: "تقارير المندوبين ← مبيعات المندوبين بالأصناف", bundle: "REPORT_WAREHOUSE" },
      { key: "accountingreports-repscollectings", label: "تقارير المندوبين ← تحصيلات المندوبين", bundle: "REPORT" },
      { key: "accountingreports-repdaily", label: "تقارير المندوبين ← يومية مندوب", bundle: "REPORT_COST" },
      { key: "accountingreports-repdebit", label: "تقارير المندوبين ← مديونية مندوب", bundle: "REPORT_SECRET" },
      // تقارير المشتريات
      { key: "accountingreports-vendorstatment", label: "تقارير المشتريات ← كشف حساب مورد", bundle: "REPORT_SECRET" },
      { key: "accountingreports-vendoraccountstatementbyitems", label: "تقارير المشتريات ← كشف حساب مورد بالأصناف", bundle: "REPORT_SECRET" },
      { key: "accountingreports-purchases", label: "تقارير المشتريات ← الشراء", bundle: "REPORT_SECRET_WAREHOUSE" },
      { key: "accountingreports-vendorslist", label: "تقارير المشتريات ← قائمة الموردين", bundle: "REPORT_SECRET" },
      { key: "accountingreports-purchaseorders", label: "تقارير المشتريات ← طلبات الشراء", bundle: "REPORT_COST_WAREHOUSE" },
      { key: "accountingreports-creditsages", label: "تقارير المشتريات ← أعمار ديون الموردين", bundle: "REPORT_SECRET" },
      { key: "accountingreports-creditsagesbyyear", label: "تقارير المشتريات ← أعمار ديون الموردين سنوي", bundle: "REPORT_SECRET" },
      { key: "accountingreports-creditsagesbyhalfyear", label: "تقارير المشتريات ← أعمار ديون الموردين نصف سنوي", bundle: "REPORT_SECRET" },
      { key: "accountingreports-grossvendorpurchasesbyitems", label: "تقارير المشتريات ← المشتريات بالأصناف", bundle: "REPORT_WAREHOUSE" },
      { key: "accountingreports-vendorspurchases", label: "تقارير المشتريات ← المشتريات بالموردين", bundle: "REPORT_COST_WAREHOUSE" },
      { key: "accountingreports-vendorssummary", label: "تقارير المشتريات ← ملخص حركة الموردين", bundle: "REPORT_SECRET" },
      { key: "accountingreports-maturereceipts", label: "تقارير المشتريات ← فواتير شراء مستحقة", bundle: "REPORT" },
      // تقارير التحصيل والسداد
      { key: "accountingreports-customersinstallments", label: "تقارير التحصيل والسداد ← أقساط العملاء", bundle: "REPORT" },
      // تقارير الإنتاج
      { key: "accountingreports-productionorders", label: "تقارير الإنتاج ← أوامر الإنتاج", bundle: "REPORT_WAREHOUSE" },
      { key: "accountingreports-productionmaterials", label: "تقارير الإنتاج ← خامات وتوالف الإنتاج", bundle: "REPORT_WAREHOUSE" },
      // تقارير شئون الموظفين
      { key: "hrreports-attendance", label: "تقارير شئون الموظفين ← حضور وانصراف الموظفين", bundle: "REPORT" },
      { key: "hrreports-employeeslist", label: "تقارير شئون الموظفين ← قائمة الموظفين", bundle: "REPORT_SECRET" },
      { key: "hrreports-employeespayroll", label: "تقارير شئون الموظفين ← رواتب الموظفين", bundle: "REPORT_SECRET" },
      { key: "hrreports-employeespayroll-list", label: "تقارير شئون الموظفين ← قائمة رواتب الموظفين", bundle: "REPORT_SECRET" },
      { key: "hrreports-employeesunderrequest", label: "تقارير شئون الموظفين ← موظفين تحت الطلب", bundle: "REPORT" },
      { key: "hrreports-employeesvactions", label: "تقارير شئون الموظفين ← إجازات الموظفين", bundle: "REPORT" },
      { key: "hrreports-loans-list", label: "تقارير شئون الموظفين ← السلف", bundle: "REPORT_SECRET" },
      // تقارير الأصول الثابتة
      { key: "fixedassetsreports-dep", label: "تقارير الأصول الثابتة ← إهلاكات الأصول الثابتة", bundle: "REPORT" },
      { key: "fixedassetsreports-depruns", label: "تقارير الأصول الثابتة ← سجل قيود الإهلاك", bundle: "REPORT" },
      { key: "fixedassetsreports-soldfixedassets", label: "تقارير الأصول الثابتة ← الأصول المباعة", bundle: "REPORT" },
      // التقارير الختامية
      { key: "accounting-generaljournallist", label: "التقارير الختامية ← دفتر اليومية", bundle: "REPORT", extra: ["print"] },
      { key: "finalreports-generalledger", label: "التقارير الختامية ← الأستاذ العام", bundle: "REPORT_SECRET" },
      { key: "finalreports-subledger", label: "التقارير الختامية ← الأستاذ المساعد", bundle: "REPORT_SECRET" },
      { key: "finalreports-trialbalance", label: "التقارير الختامية ← ميزان المراجعة", bundle: "REPORT" },
      { key: "finalreports-salescost", label: "التقارير الختامية ← تكلفة المبيعات", bundle: "REPORT" },
      { key: "finalreports-incomestatment", label: "التقارير الختامية ← قائمة الدخل", bundle: "REPORT" },
      { key: "finalreports-balancesheet", label: "التقارير الختامية ← الميزانية العمومية", bundle: "REPORT" },
      { key: "finalreports-financialstatment", label: "التقارير الختامية ← قائمة المركز المالي", bundle: "REPORT" },
      { key: "finalreports-cashflow", label: "التقارير الختامية ← التدفقات النقدية", bundle: "REPORT" },
      // شاشة "التقارير" الرئيسية القديمة (Reports.tsx/SalesAnalytics.tsx/TaxReport.tsx) —
      // مش جزء من نظام الـslug بتاع ميجا، لكن شاشات حقيقية بتتعرض لنفس بيانات حساسة.
      { key: "legacyBalanceSheet", label: "الميزانية العمومية (شاشة التقارير القديمة)", bundle: "REPORT" },
      { key: "legacyIncomeStatement", label: "قائمة الدخل (شاشة التقارير القديمة)", bundle: "REPORT" },
      { key: "legacyInventorySummary", label: "ملخص المخزون (شاشة التقارير القديمة)", bundle: "REPORT_WAREHOUSE" },
      { key: "salesAnalytics", label: "تحليلات المبيعات", bundle: "REPORT_SECRET" },
      { key: "taxReport", label: "تقرير الضرائب", bundle: "REPORT" },
    ],
  },
  {
    key: "security",
    label: "الصلاحيات",
    entities: [
      { key: "users", label: "المستخدمين", bundle: "USER_MGMT" },
      { key: "editMyData", label: "تعديل بياناتي", bundle: "SELF_EDIT" },
    ],
  },
  {
    key: "import_costing",
    label: "تكليف شحنة",
    entities: [
      { key: "shipmentCosting", label: "تكليف شحنة", bundle: "BASIC4_BRANCH", extra: ["viewDocList"] },
    ],
  },
  /**
   * أدوات ذكاء اصطناعي خاصة ببرنامجنا (مش جزء من شاشات ميجا كاش الأصلية) — بتحتاج
   * صلاحية مستقلة لأنها بتوصل لبيانات حساسة (مساعد محادثة بيشوف ملخص أي شاشة مفتوحة،
   * ومراجع حسابات ذكي بيحلل الأرقام المالية كلها). العنصر مش متظبط = يفضل شغال للكل
   * زي دلوقتي (سلوك افتراضي آمن رجعيًا)؛ المدير يقدر يقفله لمستخدمين معينين لما يحتاج.
   */
  {
    key: "ai_tools",
    label: "أدوات الذكاء الاصطناعي",
    entities: [
      { key: "assistant", label: "المساعد الذكي (شات)", bundle: "REPORT" },
      { key: "accountingAuditor", label: "مراجع الحسابات الذكي", bundle: "BASIC4", extra: ["viewDocList"] },
    ],
  },
];

/** كل عناصر الشجرة مع أفعالها المحسوبة — الشكل الجاهز للواجهة والحفظ. */
export const PERMISSION_TREE_RESOLVED = PERMISSION_TREE.map((m) => ({
  key: m.key,
  label: m.label,
  entities: m.entities.map((e) => ({ key: e.key, label: e.label, actions: actionsFor(e) })),
}));

export function findEntityActions(moduleKey: string, entityKey: string): PermActionKey[] | null {
  const m = PERMISSION_TREE.find((x) => x.key === moduleKey);
  const e = m?.entities.find((x) => x.key === entityKey);
  return e ? actionsFor(e) : null;
}

/**
 * ملاحظات صراحة عن عدم اليقين — راجعها مع ميجا كاش الحقيقي وعدّل الـbundle/extra/omit
 * المناسب لو لقيت فرق:
 * - تفاصيل بعض عناصر "التقارير" (خصوصًا هل فيها "عرض الحسابات السرية" أو "عرض التكاليف"
 *   أو "تعامل على كل المخازن" بالظبط) اتصنّفت بأقرب نمط شفناه في تقارير مشابهة، مش كلها
 *   اتفتحت وشوفناها بالعين في اللقطات.
 * - نص "فاتورة شراء" و"فاتورة مردود شراء" افترضنا نفس حزمة "طلب شراء" بالكامل (بما فيها
 *   "تعامل على كل المخازن" في الآخر) لأن بداية كل واحدة طابقت الأخرى في اللقطات؛ النهاية
 *   الدقيقة لكل واحدة على حدة مكانتش ظاهرة بالكامل.
 * - "طلب بيع" افترضنا إنه بينتهي من غير "التعامل بتاريخ سابق" و"تعامل على كل المخازن"
 *   (النطاق الظاهر في اللقطة قطع قبل التأكد التام).
 */
