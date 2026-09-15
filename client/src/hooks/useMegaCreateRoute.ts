import { useLocation } from "wouter";
import { tenantPath, useTenantSlug } from "@/lib/tenant";

/** مسار إنشاء منفصل زي أيقونات ميجا (طلب/فاتورة) مقابل القائمة. */
export function isMegaCreatePath(location: string): boolean {
  return /\/new\/?$/.test(location);
}

/**
 * أدوات تنقل لإنشاء مستند عبر `/…/new` (مطابقة أيقونة الإنشاء في ميجا)
 * مع العودة للقائمة عند الإلغاء/الحفظ.
 */
export function useMegaCreateRoute(listPath: string) {
  const [location, navigate] = useLocation();
  const tenantSlug = useTenantSlug();
  const isNewRoute = isMegaCreatePath(location);

  const goToList = (extraQuery?: string) => {
    const base = tenantPath(tenantSlug, listPath);
    navigate(extraQuery ? `${base}?${extraQuery}` : base);
  };

  const goToCreate = (extraQuery?: string) => {
    const base = tenantPath(tenantSlug, `${listPath}/new`);
    navigate(extraQuery ? `${base}?${extraQuery}` : base);
  };

  return { isNewRoute, goToList, goToCreate, location, navigate, tenantSlug };
}
