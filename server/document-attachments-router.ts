import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "./db";
import {
  deleteDocumentAttachment,
  getDocumentAttachmentContent,
  listDocumentAttachments,
  recompareDocumentAttachment,
  uploadDocumentAttachment,
} from "./document-attachments";
import { protectedProcedure, router } from "./_core/trpc";

function requireTenant(tenantId: number | null | undefined) {
  if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "لا توجد شركة" });
  return tenantId;
}

const entityType = z.enum(["sales_invoice", "purchase_invoice"]);
const kind = z.enum(["invoice_scan", "payment_receipt", "other"]);

export const documentAttachmentsRouter = router({
  list: protectedProcedure
    .input(z.object({ entityType, entityId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenant(ctx.tenantId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
      return listDocumentAttachments(db, tenantId, input.entityType, input.entityId);
    }),

  upload: protectedProcedure
    .input(
      z.object({
        entityType,
        entityId: z.number().int().positive(),
        kind: kind.optional(),
        fileName: z.string().min(1).max(255),
        mimeType: z.string().min(3).max(120),
        contentBase64: z.string().min(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenant(ctx.tenantId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
      try {
        return await uploadDocumentAttachment(db, tenantId, {
          ...input,
          createdBy: ctx.user?.id || ctx.saasUser?.id,
        });
      } catch (e: unknown) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: e instanceof Error ? e.message : "فشل رفع المرفق",
        });
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenant(ctx.tenantId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
      return deleteDocumentAttachment(db, tenantId, input.id);
    }),

  recompare: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenant(ctx.tenantId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
      try {
        return await recompareDocumentAttachment(db, tenantId, input.id);
      } catch (e: unknown) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: e instanceof Error ? e.message : "فشل إعادة المقارنة",
        });
      }
    }),

  content: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenant(ctx.tenantId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
      const row = await getDocumentAttachmentContent(db, tenantId, input.id);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "المرفق غير موجود" });
      return row;
    }),
});
