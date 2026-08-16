/** صلاحيات Easy Cash — وحدات + أفعال (وحدات وأفعال النظام) */

export type PermissionAction = "view" | "create" | "edit" | "delete";

/** الأدوار المدمجة المعروفة — يمكن أيضاً أدوار مخصصة بمفتاح c_… */
export type BuiltinTenantRole = "admin" | "user" | "accountant" | "sales_rep" | "warehouse_manager";

/** مفتاح الدور: مدمج أو مخصص */
export type TenantRole = BuiltinTenantRole | (string & {});

export const BUILTIN_TENANT_ROLES: BuiltinTenantRole[] = [
  "admin",
  "user",
  "accountant",
  "sales_rep",
  "warehouse_manager",
];

export const EDITABLE_BUILTIN_ROLES: BuiltinTenantRole[] = [
  "user",
  "accountant",
  "sales_rep",
  "warehouse_manager",
];

export const BUILTIN_ROLE_LABELS: Record<BuiltinTenantRole, string> = {
  admin: "مدير",
  user: "مستخدم",
  accountant: "محاسب",
  sales_rep: "مندوب مبيعات",
  warehouse_manager: "مدير مخازن",
};

export const BUILTIN_ROLE_DESCRIPTIONS: Record<BuiltinTenantRole, string> = {
  admin: "وصول كامل لكل الشاشات والإعدادات",
  user: "إدخال وعرض أساسي",
  accountant: "الحسابات والفواتير والتقارير",
  sales_rep: "البيع والعملاء والمندوبين",
  warehouse_manager: "المخازن والأصناف والتحويلات",
};

export function isBuiltinRole(roleKey: string): roleKey is BuiltinTenantRole {
  return (BUILTIN_TENANT_ROLES as string[]).includes(roleKey);
}

export function isEditableRoleKey(roleKey: string): boolean {
  if (roleKey === "admin" || roleKey === "superadmin") return false;
  return true;
}

export function roleDisplayName(roleKey: string, customName?: string | null): string {
  if (customName) return customName;
  if (isBuiltinRole(roleKey)) return BUILTIN_ROLE_LABELS[roleKey];
  return roleKey;
}

export type PermissionModule =
  | "dashboard"
  | "contacts"
  | "sales"
  | "purchases"
  | "cash"
  | "bank"
  | "accounts"
  | "inventory"
  | "hr"
  | "assets"
  | "production"
  | "cost_centers"
  | "loans"
  | "sales_reps"
  | "reports"
  | "settings"
  | "security"
  | "support"
  | "import_costing";

export type ModulePermission = Record<PermissionAction, boolean>;

export type EffectivePermissions = Record<PermissionModule, ModulePermission>;

export const PERMISSION_ACTIONS: PermissionAction[] = ["view", "create", "edit", "delete"];

export const PERMISSION_MODULES: Array<{ id: PermissionModule; labelAr: string; group: string }> = [
  { id: "dashboard", labelAr: "الرئيسية", group: "عام" },
  { id: "contacts", labelAr: "العملاء والموردين", group: "عام" },
  { id: "sales", labelAr: "فواتير المبيعات", group: "مبيعات" },
  { id: "sales_reps", labelAr: "مندوبين البيع", group: "مبيعات" },
  { id: "purchases", labelAr: "فواتير الشراء", group: "مشتريات" },
  { id: "cash", labelAr: "معاملات نقدية", group: "مالية" },
  { id: "bank", labelAr: "معاملات بنكية", group: "مالية" },
  { id: "accounts", labelAr: "الحسابات", group: "مالية" },
  { id: "inventory", labelAr: "المخازن", group: "مخازن" },
  { id: "hr", labelAr: "شئون الموظفين", group: "موارد بشرية" },
  { id: "assets", labelAr: "الأصول الثابتة", group: "أصول" },
  { id: "production", labelAr: "الإنتاج", group: "إنتاج" },
  { id: "cost_centers", labelAr: "مراكز التكلفة", group: "مالية" },
  { id: "loans", labelAr: "القروض والأقساط", group: "مالية" },
  { id: "reports", labelAr: "التقارير", group: "تقارير" },
  { id: "settings", labelAr: "إعدادات عامة", group: "إعدادات" },
  { id: "security", labelAr: "المستخدمون والصلاحيات", group: "إعدادات" },
  { id: "support", labelAr: "الدعم الفني", group: "عام" },
  { id: "import_costing", labelAr: "تكليف شحنة", group: "تقدير" },
];

const ALL: ModulePermission = { view: true, create: true, edit: true, delete: true };
const VIEW_ONLY: ModulePermission = { view: true, create: false, edit: false, delete: false };
const VIEW_CREATE_EDIT: ModulePermission = { view: true, create: true, edit: true, delete: false };
const NONE: ModulePermission = { view: false, create: false, edit: false, delete: false };

function mod(
  overrides: Partial<Record<PermissionModule, ModulePermission>>,
): EffectivePermissions {
  const base = Object.fromEntries(
    PERMISSION_MODULES.map((m) => [m.id, { ...NONE }]),
  ) as EffectivePermissions;
  for (const [key, value] of Object.entries(overrides)) {
    base[key as PermissionModule] = { ...value! };
  }
  return base;
}

/** صلاحيات افتراضية لكل دور مدمج — تُنسخ للمستأجر عند أول استخدام */
export const DEFAULT_ROLE_PERMISSIONS: Record<BuiltinTenantRole, EffectivePermissions> = {
  admin: mod(Object.fromEntries(PERMISSION_MODULES.map((m) => [m.id, ALL])) as Partial<Record<PermissionModule, ModulePermission>>),
  accountant: mod({
    dashboard: VIEW_ONLY,
    contacts: VIEW_CREATE_EDIT,
    sales: VIEW_CREATE_EDIT,
    purchases: VIEW_CREATE_EDIT,
    cash: VIEW_CREATE_EDIT,
    bank: VIEW_CREATE_EDIT,
    accounts: ALL,
    inventory: VIEW_ONLY,
    hr: VIEW_ONLY,
    assets: VIEW_ONLY,
    production: VIEW_ONLY,
    cost_centers: VIEW_CREATE_EDIT,
    loans: VIEW_CREATE_EDIT,
    sales_reps: VIEW_ONLY,
    reports: ALL,
    settings: VIEW_ONLY,
    security: NONE,
    support: VIEW_CREATE_EDIT,
    import_costing: VIEW_CREATE_EDIT,
  }),
  sales_rep: mod({
    dashboard: VIEW_ONLY,
    contacts: VIEW_CREATE_EDIT,
    sales: ALL,
    sales_reps: VIEW_ONLY,
    purchases: VIEW_ONLY,
    cash: VIEW_ONLY,
    inventory: VIEW_ONLY,
    reports: { view: true, create: false, edit: false, delete: false },
    settings: NONE,
    security: NONE,
    support: VIEW_CREATE_EDIT,
  }),
  warehouse_manager: mod({
    dashboard: VIEW_ONLY,
    contacts: VIEW_ONLY,
    purchases: VIEW_CREATE_EDIT,
    inventory: ALL,
    production: ALL,
    sales: VIEW_ONLY,
    reports: VIEW_ONLY,
    settings: NONE,
    security: NONE,
    support: VIEW_CREATE_EDIT,
    import_costing: VIEW_ONLY,
  }),
  user: mod({
    dashboard: VIEW_ONLY,
    contacts: VIEW_ONLY,
    sales: VIEW_CREATE_EDIT,
    purchases: VIEW_CREATE_EDIT,
    cash: VIEW_ONLY,
    bank: VIEW_ONLY,
    inventory: VIEW_ONLY,
    accounts: VIEW_ONLY,
    reports: VIEW_ONLY,
    settings: NONE,
    security: NONE,
    support: VIEW_CREATE_EDIT,
    import_costing: VIEW_ONLY,
  }),
};

/** ربط أقسام FEATURE_REGISTRY بوحدات الصلاحيات */
export const MEGA_MODULE_TO_PERMISSION: Record<string, PermissionModule> = {
  "العملاء والموردين": "contacts",
  "فواتير المبيعات": "sales",
  "مندوبين البيع": "sales_reps",
  "فواتير الشراء": "purchases",
  "معاملات نقدية": "cash",
  "معاملات بنكية": "bank",
  "الحسابات": "accounts",
  "المخازن": "inventory",
  "شئون الموظفين": "hr",
  "الاصول الثابته": "assets",
  "الانتاج": "production",
  "مراكز التكلفة": "cost_centers",
  "القروض": "loans",
  "الاقساط": "loans",
  "تقارير الحسابات": "reports",
  "تقارير المخازن": "reports",
  "تقارير شئون الموظفين": "reports",
  "تقارير الاصول الثابتة": "reports",
  "التقارير الختامية": "reports",
  "اعدادات عامة": "settings",
  "الصلاحيات": "security",
  "الدعم": "support",
  "تكليف شحنة": "import_costing",
};

export function permissionModuleFromPath(path: string): PermissionModule | null {
  const p = path.split("?")[0].toLowerCase();
  if (p === "/" || p === "") return "dashboard";
  if (p.includes("/customers") || p.includes("/suppliers") || p.includes("/contact-categories") || p.includes("/statement")) return "contacts";
  if (p.includes("/sales-reps")) return "sales_reps";
  if (p.includes("/sales")) return "sales";
  if (p.includes("/purchases")) return "purchases";
  if (p.includes("/cash")) return "cash";
  if (p.includes("/bank") || p.includes("/checks") || p.includes("/check-routing")) return "bank";
  if (p.includes("/accounting-auditor")) return "accounts";
  if (p.includes("/accounts") || p.includes("/journal") || p.includes("/fund-transfer")) return "accounts";
  if (p.includes("/inventory") || p.includes("/items") || p.includes("/warehouses") || p.includes("/stock")) return "inventory";
  if (p.includes("/hr")) return "hr";
  if (p.includes("/assets") || p.includes("/fixed-assets")) return "assets";
  if (p.includes("/production")) return "production";
  if (p.includes("/cost-centers")) return "cost_centers";
  if (p.includes("/loans") || p.includes("/installments")) return "loans";
  if (p.includes("/reports")) return "reports";
  if (p.includes("/settings/users")) return "security";
  if (p.includes("/profile")) return "security";
  if (p.includes("/settings") || p.includes("/pending-docs") || p.includes("/notifications")) return "settings";
  if (p.includes("/support")) return "support";
  if (p.includes("/import-costing")) return "import_costing";
  if (p.includes("/ops/whatsapp") || p.includes("/ops/inbox") || p.includes("/ops/factory")) return "bank";
  return null;
}

export function hasPermission(
  perms: EffectivePermissions,
  module: PermissionModule,
  action: PermissionAction,
): boolean {
  const row = perms[module];
  if (!row) return false;
  if (action === "view") return row.view;
  if (action === "create") return row.create;
  if (action === "edit") return row.edit;
  return row.delete;
}

export function emptyPermissions(): EffectivePermissions {
  return mod({});
}
