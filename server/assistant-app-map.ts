import { ERP_NAVIGATION, type NavItemConfig } from "../client/src/config/erp-navigation";

export type AppMapEntry = {
  label: string;
  path: string;
  breadcrumb: string;
  status?: string;
};

export function flattenErpNavigation(items: NavItemConfig[], trail: string[] = []): AppMapEntry[] {
  const out: AppMapEntry[] = [];
  for (const item of items) {
    const chain = [...trail, item.label];
    if (item.path) {
      out.push({
        label: item.label,
        path: item.path,
        breadcrumb: chain.join(" > "),
        status: item.status,
      });
    }
    if (item.children?.length) {
      out.push(...flattenErpNavigation(item.children, chain));
    }
  }
  return out;
}

const APP_MAP_CACHE = flattenErpNavigation(ERP_NAVIGATION);

export function getAppMapEntries() {
  return APP_MAP_CACHE;
}

export function buildAppMapPromptSection(): string {
  const lines = APP_MAP_CACHE.map((e) => {
    const status = e.status === "missing" ? " [غير متاح بعد]" : e.status === "partial" ? " [جزئي]" : "";
    return `- ${e.breadcrumb} → المسار: ${e.path}${status}`;
  });
  return lines.join("\n");
}
