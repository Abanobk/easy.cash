import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { verifySaasToken, getAppUserById, isSubscriptionActive, SAAS_COOKIE_NAME } from "../saas-auth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  saasUser: {
    id: number;
    email: string;
    role: string;
    name: string;
    isActive: boolean;
  } | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let saasUser: TrpcContext["saasUser"] = null;

  // Try SaaS session first
  try {
    const cookies = opts.req.headers.cookie || "";
    const match = cookies.match(new RegExp(`${SAAS_COOKIE_NAME}=([^;]+)`));
    const token = match?.[1];
    const session = await verifySaasToken(token);
    if (session) {
      const appUser = await getAppUserById(session.userId);
      if (appUser && appUser.isActive) {
        saasUser = {
          id: appUser.id,
          email: appUser.email,
          role: appUser.role,
          name: appUser.name,
          isActive: appUser.isActive,
        };
        // Map saasUser to User shape for protectedProcedure compatibility
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

  // Fallback to Manus OAuth if no SaaS session
  if (!user) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch (error) {
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    saasUser,
  };
}
