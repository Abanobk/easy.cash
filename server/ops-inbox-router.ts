import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "./db";
import {
  confirmOpsItem,
  getFactoryConvertPreview,
  getFactoryDailyContent,
  getOpsInboxContent,
  ingestWhatsAppItem,
  listFactoryDaily,
  listOpsInbox,
  markFactoryDailyPosted,
  reextractOpsItem,
  setFactoryDailyStatus,
  setOpsInboxStatus,
  updateOpsDraft,
  uploadFactoryDaily,
  type OpsDraft,
} from "./ops-inbox";
import { protectedProcedure, router } from "./_core/trpc";
import { assertEntityAction } from "./entity-permission-service";

function requireTenant(tenantId: number | null | undefined) {
  if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "لا توجد شركة" });
  return tenantId;
}

const suggestedType = z.enum([
  "incoming_check",
  "outgoing_check",
  "check_deposit",
  "cash_receive",
  "bank_deposit",
  "expense",
  "note",
  "other",
]);

const draftInput = z.object({
  suggestedType,
  checkNumber: z.string().optional(),
  amount: z.number().optional(),
  date: z.string().optional(),
  dueDate: z.string().optional(),
  bankName: z.string().optional(),
  partyName: z.string().optional(),
  customerId: z.number().int().positive().optional(),
  supplierId: z.number().int().positive().optional(),
  bankAccountId: z.number().int().positive().optional(),
  description: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const opsInboxRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          source: z.enum(["whatsapp", "factory", "manual"]).optional(),
          status: z.string().optional(),
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
          limit: z.number().int().min(1).max(300).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenant(ctx.tenantId);
      await assertEntityAction(ctx, "ops", "whatsappInbox", "viewDoc");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
      return listOpsInbox(db, tenantId, input || {});
    }),

  ingestWhatsApp: protectedProcedure
    .input(
      z.object({
        channelNote: z.string().max(255).optional(),
        workDate: z.string().optional(),
        rawText: z.string().max(20000).optional(),
        fileName: z.string().max(255).optional(),
        mimeType: z.string().max(120).optional(),
        contentBase64: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenant(ctx.tenantId);
      await assertEntityAction(ctx, "ops", "whatsappInbox", "add");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
      try {
        return await ingestWhatsAppItem(db, tenantId, {
          ...input,
          createdBy: ctx.user?.id || ctx.saasUser?.id,
        });
      } catch (e: unknown) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: e instanceof Error ? e.message : "فشل إدخال الوارد",
        });
      }
    }),

  updateDraft: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), draft: draftInput }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenant(ctx.tenantId);
      await assertEntityAction(ctx, "ops", "whatsappInbox", "edit");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
      try {
        return await updateOpsDraft(db, tenantId, input.id, input.draft as OpsDraft);
      } catch (e: unknown) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: e instanceof Error ? e.message : "فشل تحديث المسودة",
        });
      }
    }),

  confirm: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), draft: draftInput.optional() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenant(ctx.tenantId);
      await assertEntityAction(ctx, "ops", "whatsappInbox", "edit");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
      const userId = ctx.user?.id || ctx.saasUser?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED", message: "غير مصرح" });
      try {
        return await confirmOpsItem(db, tenantId, userId, input.id, input.draft as Partial<OpsDraft> | undefined);
      } catch (e: unknown) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: e instanceof Error ? e.message : "فشل التأكيد",
        });
      }
    }),

  setStatus: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(["ignored", "rejected", "pending"]),
        reviewNote: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenant(ctx.tenantId);
      await assertEntityAction(ctx, "ops", "whatsappInbox", "edit");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
      return setOpsInboxStatus(
        db,
        tenantId,
        input.id,
        input.status,
        input.reviewNote,
        ctx.user?.id || ctx.saasUser?.id,
      );
    }),

  reextract: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenant(ctx.tenantId);
      await assertEntityAction(ctx, "ops", "whatsappInbox", "edit");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
      try {
        return await reextractOpsItem(db, tenantId, input.id);
      } catch (e: unknown) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: e instanceof Error ? e.message : "فشل إعادة الاستخراج",
        });
      }
    }),

  content: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenant(ctx.tenantId);
      await assertEntityAction(ctx, "ops", "whatsappInbox", "viewDoc");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
      const row = await getOpsInboxContent(db, tenantId, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "غير موجود" });
      return row;
    }),

  factoryList: protectedProcedure
    .input(
      z
        .object({
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
          status: z.string().optional(),
          type: z.enum(["purchase", "sales", "mixing", "general"]).optional(),
          limit: z.number().int().min(1).max(300).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenant(ctx.tenantId);
      await assertEntityAction(ctx, "ops", "factoryDaily", "viewDoc");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
      return listFactoryDaily(db, tenantId, input || {});
    }),

  factoryUpload: protectedProcedure
    .input(
      z.object({
        workDate: z.string().min(8),
        title: z.string().min(1).max(255),
        fileName: z.string().min(1).max(255).optional(),
        mimeType: z.string().min(3).max(120).optional(),
        contentBase64: z.string().min(20).optional(),
        notes: z.string().max(5000).optional(),
        alsoToInbox: z.boolean().optional(),
        type: z.enum(["purchase", "sales", "mixing", "general"]).optional(),
        partyName: z.string().max(255).optional(),
        partyId: z.number().int().positive().optional(),
        itemDescription: z.string().max(255).optional(),
        productItemId: z.number().int().positive().optional(),
        quantity: z.string().optional(),
        amount: z.string().optional(),
        materialsUsed: z.string().max(5000).optional(),
        items: z.array(z.object({
          itemDescription: z.string().min(1).max(255),
          itemId: z.number().int().positive().optional(),
          quantity: z.string().optional(),
          amount: z.string().optional(),
        })).max(50).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenant(ctx.tenantId);
      await assertEntityAction(ctx, "ops", "factoryDaily", "add");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
      try {
        return await uploadFactoryDaily(db, tenantId, {
          ...input,
          createdBy: ctx.user?.id || ctx.saasUser?.id,
        });
      } catch (e: unknown) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: e instanceof Error ? e.message : "فشل رفع شغل المصنع",
        });
      }
    }),

  factoryContent: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenant(ctx.tenantId);
      await assertEntityAction(ctx, "ops", "factoryDaily", "viewDoc");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
      const row = await getFactoryDailyContent(db, tenantId, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "غير موجود" });
      return row;
    }),

  factorySetStatus: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(["uploaded", "reviewed", "posted", "ignored"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenant(ctx.tenantId);
      await assertEntityAction(ctx, "ops", "factoryDaily", "edit");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
      return setFactoryDailyStatus(db, tenantId, input.id, input.status);
    }),

  /** اقتراحات مطابقة (مورد/عميل/صنف/خامات) قبل تحويل بيان المصنع لمستند رسمي — للمراجعة قبل الاعتماد */
  factoryConvertPreview: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenant(ctx.tenantId);
      await assertEntityAction(ctx, "ops", "factoryDaily", "viewDoc");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
      try {
        return await getFactoryConvertPreview(db, tenantId, input.id);
      } catch (e: unknown) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: e instanceof Error ? e.message : "فشل تجهيز المطابقة",
        });
      }
    }),

  /** يُستدعى بعد ما المحاسب يعتمد الفاتورة/أمر الإنتاج فعلياً (عبر الطلبات الحقيقية) — يربط البيان بالمستند الناتج */
  factoryMarkPosted: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      entityType: z.enum(["purchase_invoice", "sales_invoice", "production_order"]),
      entityId: z.number().int().positive(),
      ref: z.string().max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenant(ctx.tenantId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
      return markFactoryDailyPosted(db, tenantId, input.id, input);
    }),
});
