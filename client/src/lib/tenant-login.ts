import { getTenantSlugFromPath } from "./tenant";

/** رابط دخول خاص بشركة واحدة — للموظفين فقط (بدون إنشاء حساب). */
export function buildTenantLoginUrl(slug: string, origin = window.location.origin) {
  return `${origin.replace(/\/$/, "")}/${slug}/login`;
}

export function getDefaultLoginPath(pathname = window.location.pathname) {
  const slug = getTenantSlugFromPath(pathname);
  return slug ? `/${slug}/login` : "/login";
}

export async function copyTenantLoginLink(slug: string, companyName?: string) {
  const url = buildTenantLoginUrl(slug);
  await navigator.clipboard.writeText(url);
  return url;
}
