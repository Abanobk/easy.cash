import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { runAssistantChat } from "./assistant-service";
import { getOllamaConfig, ollamaHealthCheck } from "./ollama";
import { protectedProcedure, router } from "./_core/trpc";
import { assertEntityAction } from "./entity-permission-service";

export const assistantRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    const cfg = getOllamaConfig();
    const health = await ollamaHealthCheck();
    return {
      enabled: cfg.enabled,
      configured: cfg.enabled,
      model: cfg.model,
      heavyModel: cfg.heavyModel || "qwen3:14b",
      baseUrl: cfg.baseUrl.replace(/\/\/[^@]+@/, "//***@"),
      online: health.ok,
      activeModel: health.model,
      activeHeavyModel: health.heavyModel,
      error: health.error,
      tenantLinked: Boolean(ctx.tenantId),
      tenantSlug: ctx.tenantSlug,
    };
  }),

  chat: protectedProcedure.input(z.object({
    messages: z.array(z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1).max(4000),
    })).min(1).max(24),
    page: z.object({
      path: z.string().max(200).optional(),
      label: z.string().max(120).optional(),
      breadcrumb: z.string().max(240).optional(),
      screenKind: z.string().max(80).optional(),
      screenTitle: z.string().max(200).optional(),
      screenSummary: z.string().max(8000).optional(),
    }).optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "ai_tools", "assistant", "viewDoc");
    if (ctx.saasUser?.role === "superadmin" && !ctx.tenantSlug) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "افتح برنامج شركة من لوحة السوبر أدمن لاستخدام المساعد داخل سياق الشركة",
      });
    }

    try {
      return await runAssistantChat({
        tenantSlug: ctx.tenantSlug,
        userName: ctx.saasUser?.name || ctx.user?.name || undefined,
        messages: input.messages,
        page: input.page,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "فشل الاتصال بمساعد الذكاء الاصطناعي";
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
    }
  }),
});
