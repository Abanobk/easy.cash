import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  // Never fall back to tenant 1 — require an explicit tenant for ERP work
  if (!ctx.tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        ctx.saasUser?.role === "superadmin"
          ? "افتح الشركة أولاً (انتحال مستأجر) قبل استخدام شاشات النظام."
          : "الحساب غير مرتبط بشركة. تأكد أنك تدخل من رابط شركتك الصحيح (/اسم-الشركة/login) أو تواصل مع الدعم.",
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      tenantId: ctx.tenantId,
    },
  });
});

const requirePermission = t.middleware(async (opts) => {
  const { ctx, next, path } = opts;
  if (ctx.saasUser) {
    const { assertTrpcPermission } = await import("../permission-middleware");
    await assertTrpcPermission(ctx.saasUser, path);
  }
  return next({ ctx });
});

/** يسجّل حركات الإضافة/التعديل/الحذف بعد نجاح العملية */
const auditActivity = t.middleware(async (opts) => {
  const result = await opts.next();
  if (result.ok && opts.type === "mutation") {
    try {
      const { getDb } = await import("../db");
      const { logTrpcMutationActivity } = await import("../user-activity");
      const db = await getDb();
      void logTrpcMutationActivity({
        db,
        ctx: opts.ctx,
        path: opts.path,
        type: opts.type,
        input: opts.getRawInput ? await opts.getRawInput() : undefined,
      });
    } catch {
      // تجاهل فشل السجل
    }
  }
  return result;
});

export const protectedProcedure = t.procedure
  .use(requireUser)
  .use(requirePermission)
  .use(auditActivity);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
