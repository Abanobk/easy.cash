import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { verifySaasToken, getAppUserById, SAAS_COOKIE_NAME, getAccountOwnerId } from "../saas-auth";
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
    const cookies = opts.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const token = match?.[1];
    const session = await verifySaasToken(token);
    if (session) {
      impersonatorId = session.impersonatorId;
      const appUser = await getAppUserById(session.userId);
      if (appUser && appUser.isActive) {
        tenantId = appUser.tenantId ?? session.tenantId ?? null;
        tenantSlug = session.tenantSlug ?? requestedSlug;

        if (requestedSlug && appUser.role !== "superadmin") {
          const tenant = await getTenantBySlug(requestedSlug);
          if (!tenant || tenant.id !== appUser.tenantId) {
            tenantId = null;
          } else {
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
      user = await sdk.authenticateRequest(opts.req);
      tenantId = 1;
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
