import type { PermissionModule } from "./permissions";

/**
 * يربط مفتاح الشاشة (featureKey) بوحدة الصلاحيات.
 * يجب أن يغطي كل بادئات FEATURE_REGISTRY / القائمة.
 */
export function featureKeyToPermissionModule(featureKey: string): PermissionModule | null {
  const k = featureKey.toLowerCase();
  if (k === "support") return "support";
  if (k.startsWith("comp-")) return "settings";
  if (k.startsWith("contacts-")) return "contacts";
  if (k.startsWith("hr-") && !k.startsWith("hrreports-")) return "hr";
  if (k.startsWith("inv-") && !k.startsWith("invreports-")) return "inventory";
  if (k.startsWith("purchases-")) return "purchases";
  if (k.startsWith("sales-")) return "sales";
  if (k.startsWith("reps-")) return "sales_reps";
  if (k.startsWith("payments-payments-cash") || k.startsWith("payments-paymentslist-cash")) return "cash";
  if (k.startsWith("payments-") || k.startsWith("checks-")) return "bank";
  if (k.startsWith("accounting-") && !k.startsWith("accountingreports-")) return "accounts";
  if (
    k.startsWith("accountingreports-")
    || k.startsWith("inventoryreports-")
    || k.startsWith("invreports-")
    || k.startsWith("hrreports-")
    || k.startsWith("fixedassetsreports-")
    || k.startsWith("finalreports-")
  ) {
    return "reports";
  }
  if (k.startsWith("fixedassets-")) return "assets";
  if (k.startsWith("production-")) return "production";
  if (k.startsWith("costcenters-")) return "cost_centers";
  if (k.startsWith("loans-") || k.startsWith("installments-")) return "loans";
  if (k.startsWith("security-")) return "security";
  if (k.startsWith("importcosting-")) return "import_costing";
  if (k.startsWith("ops-")) return "bank";
  return null;
}
