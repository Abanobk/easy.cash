import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// ملحوظة: الثلاث خطوات (تحقق مستخدم/مستأجر، صلاحيات، تسجيل نشاط) مدموجة في middleware
// واحد بدل ثلاثة .use() منفصلة — لو اتفصلوا تاني، TypeScript بيفقد تضييق نوع
// tenantId من number|null إلى number عبر السلسلة (كل t.middleware() منفصل بيتفحص
// ضد الـ context الأساسي مش الناتج المضيّق من اللي قبله).
export const protectedProcedure = t.procedure.use(async (opts) => {
  const { ctx, next, path, type, getRawInput } = opts;

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

  if (ctx.saasUser) {
    const { assertTrpcPermission } = await import("../permission-middleware");
    await assertTrpcPermission(ctx.saasUser, path);
  }

  const nextCtx = {
    ...ctx,
    user: ctx.user,
    tenantId: ctx.tenantId,
  };

  const result = await next({ ctx: nextCtx });

  if (result.ok && type === "mutation") {
    try {
      const { getDb } = await import("../db");
      const { logTrpcMutationActivity } = await import("../user-activity");
      const db = await getDb();
      void logTrpcMutationActivity({
        db,
        ctx: nextCtx,
        path,
        type,
        input: getRawInput ? await getRawInput() : undefined,
      });
    } catch {
      // تجاهل فشل السجل
    }
  }

  return result;
});

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
