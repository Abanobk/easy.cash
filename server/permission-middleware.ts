import { TRPCError } from "@trpc/server";
import type { PermissionAction, PermissionModule } from "../shared/permissions";
import { getEffectivePermissions, roleBypassesPermissions, checkEffectivePermission } from "./permissions-service";

const SKIP_PREFIXES = [
  "saas.",
  "assistant.",
  "auth.",
  "system.",
];

const ROUTER_MODULE: Record<string, PermissionModule> = {
  dashboard: "dashboard",
  customers: "contacts",
  suppliers: "contacts",
  contactCategories: "contacts",
  statement: "contacts",
  sales: "sales",
  purchases: "purchases",
  cash: "cash",
  bank: "bank",
  accounts: "accounts",
  items: "inventory",
  warehouses: "inventory",
  inventory: "inventory",
  hr: "hr",
  assets: "assets",
  production: "production",
  loans: "loans",
  costCenters: "cost_centers",
  salesReps: "sales_reps",
  reports: "reports",
  notifications: "settings",
  settings: "settings",
  importCosting: "import_costing",
  accountingAuditor: "accounts",
};

const PARITY_MODULE: Record<string, PermissionModule> = {
  settings: "settings",
  hr: "hr",
  inventory: "inventory",
  assets: "assets",
  sales: "sales",
};

function inferAction(procedureName: string): PermissionAction {
  const n = procedureName.toLowerCase();
  if (n.includes("delete") || n.includes("remove")) return "delete";
  if (n.startsWith("create") || n.includes(".create") || n.endsWith("create")) return "create";
  if (
    n.includes("update") || n.includes("edit") || n.includes("set") ||
    n.includes("save") || n.includes("copy") ||
    n.includes("pay") || n.includes("approve") || n.includes("reset") ||
    n.includes("import") || n.includes("sync") || n.includes("close") || n.includes("open") ||
    n.includes("assign") || n.includes("route") || n.includes("deposit") ||
    n.includes("collect") || n.includes("reject") || n.includes("bounce") ||
    n.includes("custody") || n.includes("transfer") || n.includes("upload") ||
    n.includes("recompare")
  ) {
    return "edit";
  }
  return "view";
}

export function resolveTrpcPermission(path: string): { module: PermissionModule; action: PermissionAction } | null {
  if (!path) return null;
  if (SKIP_PREFIXES.some((p) => path.startsWith(p))) return null;
  if (path.startsWith("settings.users.")) return null;

  const parts = path.split(".");
  const root = parts[0];
  const procedure = parts[parts.length - 1] || "";

  if (root === "parity" && parts[1]) {
    const module = PARITY_MODULE[parts[1]];
    if (!module) return null;
    return { module, action: inferAction(procedure) };
  }

  const module = ROUTER_MODULE[root];
  if (!module) return null;

  return { module, action: inferAction(procedure) };
}

export async function assertTrpcPermission(
  saasUser: { id: number; role: string; tenantId: number | null } | null,
  path: string,
  getRawInput?: () => Promise<unknown>,
) {
  if (!saasUser?.tenantId) return;
  if (roleBypassesPermissions(saasUser.role)) return;

  const rule = resolveTrpcPermission(path);
  if (!rule) return;

  // الـpath ده لو جزء من نطاق الشجرة التفصيلية، هي المرجع الوحيد — مفيش رجوع للفحص
  // القديم تحت أي ظرف: صف صراحة موجود → defer لـassertEntityAction جوه الـprocedure،
  // مفيش صف خالص → منع مباشر. الفحص القديم (تحت) بيفضل بس لما الـpath يكون أصلاً
  // مش جزء من الشجرة (بيانات مرجعية للاختيار زي قوائم العملاء/الأصناف).
  if (getRawInput) {
    try {
      const { evaluateEntityGate } = await import("./entity-permission-service");
      const raw = await getRawInput();
      const outcome = await evaluateEntityGate(saasUser.tenantId, saasUser.role, path, raw);
      if (outcome.kind === "defer") return;
      if (outcome.kind === "deny") {
        throw new TRPCError({ code: "FORBIDDEN", message: `لا تملك صلاحية الوصول لهذا الإجراء` });
      }
    } catch (e) {
      if (e instanceof TRPCError) throw e;
      // فشل قراءة الإدخال فقط — كمّل بالفحص القديم زي ما هو، أضمن.
    }
  }

  const perms = await getEffectivePermissions({
    userId: saasUser.id,
    tenantId: saasUser.tenantId,
    role: saasUser.role,
  });

  if (!checkEffectivePermission(perms, rule.module, rule.action)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `ليس لديك صلاحية ${rule.action} على قسم ${rule.module}`,
    });
  }
}
