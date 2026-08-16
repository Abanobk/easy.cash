import type { MySql2Database } from "drizzle-orm/mysql2";
import { userActivities } from "../drizzle/schema";
import { withTenantId } from "./tenant-scope";

export type ActivityAction =
  | "create"
  | "update"
  | "delete"
  | "login"
  | "logout"
  | "import"
  | "export"
  | "approve"
  | "pay"
  | "print"
  | "other";

type ActivityCtx = {
  tenantId?: number | null;
  user?: { id?: number; name?: string | null } | null;
  saasUser?: { id?: number; name?: string | null; email?: string | null } | null;
};

const SKIP_PATH_PREFIXES = [
  "saas.",
  "assistant.",
  "auth.",
  "system.",
  "notifications.syncOperational",
  "notifications.unreadCount",
  "permissions.my",
  "dashboard.",
  "reports.",
];

const PATH_LABELS: Record<string, string> = {
  customers: "العملاء",
  suppliers: "الموردين",
  contactCategories: "فئات جهات الاتصال",
  items: "الأصناف",
  warehouses: "المخازن",
  sales: "المبيعات",
  purchases: "المشتريات",
  cash: "النقدية",
  bank: "البنك",
  accounts: "الحسابات",
  journal: "القيود",
  hr: "الموارد البشرية",
  assets: "الأصول",
  production: "الإنتاج",
  loans: "القروض",
  costCenters: "مراكز التكلفة",
  salesReps: "المندوبين",
  settings: "الإعدادات",
  inventory: "المخزون",
  importCosting: "تكليف شحنة",
  documentAttachments: "المرفقات",
  parity: "الإعدادات",
  checks: "الشيكات",
};

function inferActionFromPath(path: string): ActivityAction {
  const n = path.toLowerCase();
  if (n.includes("delete") || n.includes("remove") || n.includes("wipe")) return "delete";
  if (n.includes("login")) return "login";
  if (n.includes("logout")) return "logout";
  if (n.includes("import")) return "import";
  if (n.includes("export")) return "export";
  if (n.includes("approve") || n.includes("confirm") || n.includes("post")) return "approve";
  if (n.includes("pay") || n.includes("collect") || n.includes("deposit")) return "pay";
  if (n.includes("print")) return "print";
  if (
    n.includes("create") || n.includes("add") || n.includes("insert") ||
    n.endsWith(".create") || n.includes(".create")
  ) return "create";
  if (
    n.includes("update") || n.includes("edit") || n.includes("set") ||
    n.includes("save") || n.includes("assign") || n.includes("transfer") ||
    n.includes("reset") || n.includes("close") || n.includes("open") ||
    n.includes("route") || n.includes("upload")
  ) return "update";
  return "other";
}

function pathToLabel(path: string): string {
  const root = path.split(".")[0] || "";
  return PATH_LABELS[root] || root || "النظام";
}

function summarizeInput(input: unknown): string {
  if (input == null) return "";
  if (typeof input !== "object") return String(input).slice(0, 120);
  const obj = input as Record<string, unknown>;
  const bits: string[] = [];
  for (const key of ["name", "number", "code", "title", "email", "id", "invoiceId", "customerId", "supplierId"]) {
    if (obj[key] != null && obj[key] !== "") bits.push(`${key}=${String(obj[key])}`);
    if (bits.length >= 3) break;
  }
  if (!bits.length && obj.id != null) bits.push(`id=${String(obj.id)}`);
  return bits.join(" · ").slice(0, 200);
}

export function shouldLogTrpcPath(path: string, type: "query" | "mutation" | "subscription"): boolean {
  if (type !== "mutation") return false;
  if (!path) return false;
  if (SKIP_PATH_PREFIXES.some((p) => path.startsWith(p))) return false;
  return true;
}

export async function logUserActivity(
  db: MySql2Database<any> | null | undefined,
  ctx: ActivityCtx,
  opts: {
    action: string;
    details?: string;
  },
) {
  if (!db) return;
  const tenantId = ctx.tenantId;
  if (!tenantId) return;
  const userName =
    ctx.saasUser?.name ||
    ctx.user?.name ||
    ctx.saasUser?.email ||
    "مستخدم";
  const userId = ctx.saasUser?.id ?? ctx.user?.id ?? null;
  try {
    await db.insert(userActivities).values(withTenantId(tenantId, {
      userId: userId ?? undefined,
      userName: String(userName).slice(0, 255),
      action: String(opts.action).slice(0, 255),
      details: opts.details ? String(opts.details).slice(0, 4000) : null,
    }) as any);
  } catch {
    // لا نكسر العملية الأساسية لو فشل السجل
  }
}

/** تسجيل تلقائي بعد نجاح طفرة tRPC */
export async function logTrpcMutationActivity(opts: {
  db: MySql2Database<any> | null | undefined;
  ctx: ActivityCtx;
  path: string;
  type: "query" | "mutation" | "subscription";
  input: unknown;
}) {
  if (!shouldLogTrpcPath(opts.path, opts.type)) return;
  const action = inferActionFromPath(opts.path);
  const label = pathToLabel(opts.path);
  const summary = summarizeInput(opts.input);
  const actionAr: Record<ActivityAction, string> = {
    create: "إضافة",
    update: "تعديل",
    delete: "حذف",
    login: "تسجيل دخول",
    logout: "تسجيل خروج",
    import: "استيراد",
    export: "تصدير",
    approve: "اعتماد",
    pay: "دفع/تحصيل",
    print: "طباعة",
    other: "إجراء",
  };
  await logUserActivity(opts.db, opts.ctx, {
    action: actionAr[action] || action,
    details: `${label} · ${opts.path}${summary ? ` · ${summary}` : ""}`,
  });
}
