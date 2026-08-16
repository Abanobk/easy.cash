/**
 * Easy Cash → Easy Shope outbound sync (items created/updated in Cash).
 */
const SHOPE_API_URL = (process.env.SHOPE_API_URL ?? "https://easytecheg.net").replace(/\/$/, "");
const INTEGRATION_SECRET = process.env.SHOPE_INTEGRATION_SECRET ?? "";

export async function notifyShopeItemSync(
  cashTenantSlug: string,
  item: {
    code: string;
    name: string;
    salePrice?: string | null;
    currentStock?: string | null;
    barcode?: string | null;
    description?: string | null;
    cashItemId?: number;
  },
) {
  if (!INTEGRATION_SECRET || !cashTenantSlug || !item.code?.trim()) return;
  try {
    const response = await fetch(`${SHOPE_API_URL}/api/integration/accounting/item-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shope-Integration-Secret": INTEGRATION_SECRET,
        "X-Cash-Tenant-Slug": cashTenantSlug,
      },
      body: JSON.stringify({
        code: item.code,
        name: item.name,
        salePrice: item.salePrice ?? undefined,
        currentStock: item.currentStock ?? undefined,
        barcode: item.barcode ?? undefined,
        description: item.description ?? undefined,
        cashItemId: item.cashItemId,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      console.error("[shope-outbound] item-sync failed", response.status, data);
    }
  } catch (error) {
    console.error("[shope-outbound] item-sync error", error);
  }
}
