import { createContext, useContext } from "react";

const TenantContext = createContext<string | null>(null);

const RESERVED_PATHS = new Set(["super-admin", "register", "pricing", "login", "api"]);

export function getTenantSlugFromPath(pathname = window.location.pathname) {
  const segment = pathname.split("/").filter(Boolean)[0];
  if (!segment || RESERVED_PATHS.has(segment)) return null;
  return segment;
}

export function tenantPath(slug: string | null, path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!slug) return normalized;
  if (normalized === "/") return `/${slug}`;
  return `/${slug}${normalized}`;
}

export function TenantProvider({ slug, children }: { slug: string; children: React.ReactNode }) {
  return <TenantContext.Provider value={slug}>{children}</TenantContext.Provider>;
}

export function useTenantSlug() {
  return useContext(TenantContext) ?? getTenantSlugFromPath();
}
