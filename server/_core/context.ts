import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { verifySaasToken, getAppUserById, SAAS_COOKIE_NAME, getAccountOwnerId, getSaasTokenFromRequest } from "../saas-auth";
import { getTenantBySlug } from "../tenant";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  tenantId: number | null;
  tenantSlug: string | null;
  impersonatorId: number | null;
  saasUser: {
    id: number;
    email: string;
    role: string;
    name: string;
    isActive: boolean;
    ownerUserId: number | null;
    accountOwnerId: number;
    tenantId: number | null;
  } | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let saasUser: TrpcContext["saasUser"] = null;
  let tenantId: number | null = null;
  let tenantSlug: string | null = null;
  let impersonatorId: number | null = null;

  const headerSlug = opts.req.headers["x-tenant-slug"];
  const requestedSlug = typeof headerSlug === "string" ? headerSlug : null;

  try {
    const token = getSaasTokenFromRequest(opts.req);
    const session = await verifySaasToken(token);
    if (session) {
      impersonatorId = session.impersonatorId;
      const appUser = await getAppUserById(session.userId);
      if (appUser && appUser.isActive) {
        tenantId = appUser.tenantId ?? session.tenantId ?? null;
        tenantSlug = session.tenantSlug ?? requestedSlug;

        if (!tenantId && appUser.role !== "superadmin") {
          const { resolveUserTenant } = await import("../tenant");
          const resolved = await resolveUserTenant(appUser);
          if (resolved.tenantId) {
            tenantId = resolved.tenantId;
            tenantSlug = resolved.tenantSlug ?? tenantSlug;
          }
        }

        if (requestedSlug && appUser.role !== "superadmin") {
          const tenant = await getTenantBySlug(requestedSlug);
          if (!tenant || !tenant.isActive) {
            tenantId = null;
          } else if (tenantId != null && tenant.id !== tenantId) {
            tenantId = null;
          } else {
            tenantId = tenant.id;
            tenantSlug = tenant.slug;
          }
        } else if (requestedSlug && appUser.role === "superadmin" && session.impersonatorId) {
          const tenant = await getTenantBySlug(requestedSlug);
          if (tenant) {
            tenantId = tenant.id;
            tenantSlug = tenant.slug;
          }
        } else if (tenantId && !tenantSlug) {
          const { getTenantById } = await import("../tenant");
          const tenant = await getTenantById(tenantId);
          tenantSlug = tenant?.slug ?? null;
        }

        saasUser = {
          id: appUser.id,
          email: appUser.email,
          role: appUser.role,
          name: appUser.name,
          isActive: appUser.isActive,
          ownerUserId: appUser.ownerUserId ?? null,
          accountOwnerId: getAccountOwnerId(appUser),
          tenantId,
        };
        user = {
          id: appUser.id,
          openId: `saas_${appUser.id}`,
          name: appUser.name,
          email: appUser.email,
          loginMethod: "saas",
          role: appUser.role === "superadmin" ? "admin" : (appUser.role as "admin" | "user"),
          createdAt: appUser.createdAt,
          updatedAt: appUser.updatedAt,
          lastSignedIn: appUser.lastLoginAt || appUser.createdAt,
        } as User;
      }
    }
  } catch {
    // SaaS auth failed, try Manus OAuth
  }

  if (!user) {
    try {
      // Legacy Manus OAuth — only when explicitly enabled; never assign tenant 1
      if (process.env.ENABLE_MANUS_OAUTH === "1") {
        user = await sdk.authenticateRequest(opts.req);
        tenantId = null;
      }
    } catch {
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    tenantId,
    tenantSlug,
    impersonatorId,
    saasUser,
  };
}
