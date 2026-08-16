import { useLocation } from "wouter";
import { getTenantSlugFromPath } from "@/lib/tenant";
import AssistantWidget from "@/components/AssistantWidget";

/** يبقى المساعد mounted أثناء التنقل بين صفحات الشركة */
export default function AssistantHost() {
  const [location] = useLocation();
  const slug = getTenantSlugFromPath(location);

  if (!slug) return null;
  if (location.includes("/login") || location.includes("/subscription-expired")) return null;

  return <AssistantWidget key={slug} tenantSlug={slug} location={location} />;
}
