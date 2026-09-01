import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { buildAssistantCalcReference } from "./assistant-calc-knowledge";
import { buildAdvancedAuditKnowledge } from "./assistant-audit-advanced-knowledge";
import {
  buildAccountingAuditReport,
  findingsPromptBlock,
} from "./accounting-auditor";
import { defaultAuditPolicy, loadAuditPolicy, saveAuditPolicy } from "./audit-policy";
import {
  getBankStatementDetail,
  importBankStatement,
  listFindingClosures,
  listStatementUploads,
  reconcileBankStatementImport,
  saveGenericStatementUpload,
  upsertFindingClosure,
} from "./bank-statement-reconcile";
import { getPartyStatementDetail, importPartyStatement } from "./party-statement-reconcile";
import { bankAccounts } from "../drizzle/schema";
import { getDb } from "./db";
import { ollamaChat } from "./ollama";
import { tenantWhere } from "./tenant-scope";
import { protectedProcedure, router } from "./_core/trpc";
import { assertEntityAction } from "./entity-permission-service";

const policyInput = z.object({
  targetGrossMarginPct: z.number().min(0).max(100),
  targetNetMarginPct: z.number().min(-100).max(100),
  maxArDays: z.number().int().min(1).max(3650),
  maxApDays: z.number().int().min(1).max(3650),
  minCashReserveEgp: z.number().min(0),
  debtProvisionAfterDays: z.number().int().min(1).max(3650),
  debtProvisionRate: z.number().min(0).max(1),
  defaultDepreciationRate: z.number().min(0).max(1),
  bankVarianceToleranceEgp: z.number().min(0),
  materialityEgp: z.number().min(0),
  notes: z.string().max(2000).optional(),
});

async function buildAiNarrative(findingsText: string, userName?: string): Promise<string> {
  try {
    return await ollamaChat(
      [
        {
          role: "system",
          content: `أنت مدير مراجعة حسابات (مكتب محاسبة كامل) داخل نظام Easy Cash.
الدقة المحاسبية أهم من الاختصار. اعتمادك فقط على نتائج الفحص الآلي المرفقة ومرجع مكتب المحاسبة
وسياسة الشركة وكشوف الحساب المرفوعة أدناه — ممنوع اختراع مستندات أو أرصدة غير موجودة فيها.

قواعد تنسيق صارمة (التقرير يُعرض في شاشة تفصل كل بند تلقائياً حسب رقمه، فالتزم بالشكل بالحرف):
- ابدأ كل بند من الـ12 بسطر عنوان مستقل بالشكل: "### N) العنوان" (N هو رقم البند، بلا أي رمز تنسيق تاني على نفس السطر).
- داخل البند: فقرات عادية، أو نقاط تبدأ بـ"- "، أو خطوات مرقمة تبدأ بـ"1. ".
- ممنوع نجوم التشديد (**) وممنوع أي جدول Markdown (|---|). لو عايز تبرز رقم أو اسم حساب اكتبه عادي في الجملة.
- لو محتاج رابط شاشة استخدم بالظبط: [[النص الظاهر|/المسار]] — النص العربي أولاً ثم خط مائل | ثم المسار الإنجليزي اللي يبدأ بـ/. لا تعكس الترتيب ولا تنسَ الـ/.
- لا تكرر نفس الرقم لبندين، ولا تدمج بندين في عنوان واحد.
- كل مرة تشير فيها لملاحظة بعينها اذكر رقمها المرجعي بالظبط زي ما جالك (مثال: F-002)، بدل
  "الملاحظة الأولى" أو إعادة صياغة العنوان — ده أسلوب أوراق العمل المهنية القابلة للتتبع.

الترتيب الإلزامي للبنود:
1) رأي المراجع الداخلي — افتتح فوراً بالتقييم المحسوب آلياً المرفق أدناه بالحرف (لا تخترع رأياً
   مختلفاً ولا تلطّفه أو تشدّده)، ثم اشرح سببه باختصار.
2) حالة ميزان المراجعة
3) نتيجة مطابقة كشوف البنوك المرفوعة
4) المطابقات الداخلية (بنوك/ذمم) مقابل السياسة
5) مسار المستند وثغراته
6) مقارنة الفترات والهوامش
7) توقعات السيولة 30/60/90
8) جاهزية الإقفال
9) الملاحظات المتكررة وحالة الإغلاق (اذكر أرقامها المرجعية F-xxx)
10) عينات المراجعة الجوهرية
11) خطة تصحيح (اليوم / الأسبوع / متابعة) — اربط كل بند بالرقم المرجعي للملاحظة التي يعالجها
12) خاتمة للإدارة وإقرار المسؤولية — أنهِ بفقرة قصيرة قياسية: الإدارة مسؤولة عن صحة القيود
    والمستندات المدخلة للنظام؛ دور هذا المراجع الآلي هو الفحص والتنبيه بناءً على ما هو مسجَّل
    فعلياً، وليس تدقيقاً قانونياً خارجياً معتمداً.

استخدم المرجع المتقدم أدناه لتعميق حكمك المهني، بدون اختراع أرقام غير موجودة في نتائج الفحص:
- في بند 6 (مقارنة الفترات والهوامش): وظّف النسب المتقدمة (سيولة، دورة تحويل نقدي، دوران أصول)
  إذا سمحت البيانات المتاحة، لا تكتفِ بالهامش المجمل/الصافي فقط.
- في بند 9 (الملاحظات المتكررة): لو ظهر نمط يطابق أكثر من علامة من علامات التلاعب في المرجع
  المتقدم، اذكره صراحة كخطر رقابي يستحق متابعة، دون اتهام قاطع.
- في بند 10 (عينات المراجعة): بيّن أساس اختيار العينة (خطورة/عشوائي منتظم/حكمي) حسب منهجية
  المرجع المتقدم، مش مجرد سرد أرقام.

--- مرجع مكتب المحاسبة والصيغ ---
${buildAssistantCalcReference()}

--- مرجع متقدم: معايير، كشف تلاعب، منهجية عينات، نسب مالية، رقابة داخلية ---
${buildAdvancedAuditKnowledge()}`,
        },
        {
          role: "user",
          content: `المستخدم: ${userName || "مستخدم"}\nنتائج الفحص الشامل:\n${findingsText}\n\nاكتب تقرير المراجع الكامل الآن.`,
        },
      ],
      { numPredict: 8192, temperature: 0.12, tier: "heavy" },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "تعذر توليد التحليل";
    return `تعذر توليد التحليل الذكي حالياً (${msg}). الملاحظات الآلية والكشوف والمطابقات أدناه جاهزة للمراجعة.`;
  }
}

function requireTenant(tenantId?: number | null) {
  if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "لا توجد شركة محددة" });
  return tenantId;
}

export const accountingAuditorRouter = router({
  getPolicy: protectedProcedure.query(async ({ ctx }) => {
    await assertEntityAction(ctx, "ai_tools", "accountingAuditor", "viewDoc");
    const tenantId = requireTenant(ctx.tenantId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
    try {
      return await loadAuditPolicy(db, tenantId);
    } catch {
      return defaultAuditPolicy();
    }
  }),

  savePolicy: protectedProcedure.input(policyInput).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "ai_tools", "accountingAuditor", "edit");
    const tenantId = requireTenant(ctx.tenantId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
    return saveAuditPolicy(db, tenantId, input);
  }),

  bankAccounts: protectedProcedure.query(async ({ ctx }) => {
    await assertEntityAction(ctx, "ai_tools", "accountingAuditor", "viewDoc");
    const tenantId = requireTenant(ctx.tenantId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
    return db.select().from(bankAccounts).where(tenantWhere(bankAccounts, tenantId, eq(bankAccounts.isActive, true)));
  }),

  uploadBankStatement: protectedProcedure.input(z.object({
    bankAccountId: z.number().int().positive(),
    fileName: z.string().min(1).max(255),
    contentBase64: z.string().min(10),
    openingBalance: z.number().optional(),
    closingBalance: z.number().optional(),
    notes: z.string().max(2000).optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "ai_tools", "accountingAuditor", "add");
    const tenantId = requireTenant(ctx.tenantId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
    try {
      return await importBankStatement(db, tenantId, {
        ...input,
        createdBy: ctx.user?.id || ctx.saasUser?.id,
      });
    } catch (e: unknown) {
      throw new TRPCError({ code: "BAD_REQUEST", message: e instanceof Error ? e.message : "فشل استيراد الكشف" });
    }
  }),

  reReconcileBankStatement: protectedProcedure.input(z.object({
    importId: z.number().int().positive(),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "ai_tools", "accountingAuditor", "edit");
    const tenantId = requireTenant(ctx.tenantId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
    return reconcileBankStatementImport(db, tenantId, input.importId);
  }),

  bankStatementDetail: protectedProcedure.input(z.object({
    importId: z.number().int().positive(),
  })).query(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "ai_tools", "accountingAuditor", "viewDoc");
    const tenantId = requireTenant(ctx.tenantId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
    return getBankStatementDetail(db, tenantId, input.importId);
  }),

  uploadStatement: protectedProcedure.input(z.object({
    kind: z.enum(["customer", "supplier", "customs", "tax", "other"]),
    title: z.string().min(1).max(255),
    fileName: z.string().min(1).max(255),
    partyName: z.string().max(255).optional(),
    /** لعميل/مورد: لو اخترت الطرف من القائمة، هنعمل مطابقة حقيقية بدفتره بدل تخزين مرجعي بس */
    partyId: z.number().int().positive().optional(),
    closingBalance: z.number().optional(),
    periodFrom: z.string().optional(),
    periodTo: z.string().optional(),
    contentBase64: z.string().optional(),
    textContent: z.string().max(200000).optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "ai_tools", "accountingAuditor", "add");
    const tenantId = requireTenant(ctx.tenantId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });

    if ((input.kind === "customer" || input.kind === "supplier") && input.partyId && input.contentBase64) {
      return importPartyStatement(db, tenantId, {
        kind: input.kind,
        partyId: input.partyId,
        title: input.title,
        fileName: input.fileName,
        contentBase64: input.contentBase64,
        closingBalance: input.closingBalance,
        createdBy: ctx.user?.id || ctx.saasUser?.id,
      });
    }

    return saveGenericStatementUpload(db, tenantId, {
      ...input,
      createdBy: ctx.user?.id || ctx.saasUser?.id,
    });
  }),

  partyStatementDetail: protectedProcedure.input(z.object({
    importId: z.number().int().positive(),
  })).query(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "ai_tools", "accountingAuditor", "viewDoc");
    const tenantId = requireTenant(ctx.tenantId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
    return getPartyStatementDetail(db, tenantId, input.importId);
  }),

  listUploads: protectedProcedure.query(async ({ ctx }) => {
    await assertEntityAction(ctx, "ai_tools", "accountingAuditor", "viewDocList");
    const tenantId = requireTenant(ctx.tenantId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
    try {
      return await listStatementUploads(db, tenantId);
    } catch {
      return { banks: [], others: [] };
    }
  }),

  listClosures: protectedProcedure.query(async ({ ctx }) => {
    await assertEntityAction(ctx, "ai_tools", "accountingAuditor", "viewDocList");
    const tenantId = requireTenant(ctx.tenantId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
    try {
      return await listFindingClosures(db, tenantId);
    } catch {
      return [];
    }
  }),

  setFindingStatus: protectedProcedure.input(z.object({
    findingTitle: z.string().min(1),
    category: z.string().optional(),
    severity: z.string().optional(),
    status: z.enum(["open", "closed", "accepted_risk"]),
    resolutionNote: z.string().max(2000).optional(),
  })).mutation(async ({ ctx, input }) => {
    await assertEntityAction(ctx, "ai_tools", "accountingAuditor", "edit");
    const tenantId = requireTenant(ctx.tenantId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
    return upsertFindingClosure(db, tenantId, {
      ...input,
      closedBy: ctx.user?.id || ctx.saasUser?.id,
    });
  }),

  run: protectedProcedure
    .input(z.object({
      withAi: z.boolean().optional().default(true),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      await assertEntityAction(ctx, "ai_tools", "accountingAuditor", "add");
      const tenantId = requireTenant(ctx.tenantId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });

      const report = await buildAccountingAuditReport(db, tenantId, {
        userId: ctx.user?.id || ctx.saasUser?.id,
        persist: true,
      });
      const narrative = input?.withAi === false
        ? "تم عرض النتائج الآلية فقط بدون تحليل لغوي."
        : await buildAiNarrative(
          findingsPromptBlock(report),
          ctx.saasUser?.name || ctx.user?.name || undefined,
        );

      return { ...report, narrative };
    }),

  latestSnapshot: protectedProcedure.query(async ({ ctx }) => {
    await assertEntityAction(ctx, "ai_tools", "accountingAuditor", "viewDoc");
    const tenantId = requireTenant(ctx.tenantId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
    const report = await buildAccountingAuditReport(db, tenantId, { persist: false });
    return {
      generatedAt: report.generatedAt,
      summary: report.summary,
      opinion: report.opinion,
      trialBalance: report.trialBalance
        ? {
          balanced: report.trialBalance.balanced,
          difference: report.trialBalance.difference,
          accountsReviewed: report.trialBalance.accountsReviewed,
          periodLabel: report.trialBalance.periodLabel,
        }
        : null,
      topFindings: report.findings.slice(0, 12),
    };
  }),
});
