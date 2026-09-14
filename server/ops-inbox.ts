/**
 * وارد العمليات: واتساب (نص + صور شيكات/إيداعات) + رفع شغل المصنع اليومي.
 * الاستخراج يقترح مسودة — التأكيد يدوياً من المحاسب.
 */
import { and, count, desc, eq, gte, inArray, like, lte } from "drizzle-orm";
import type { Db } from "./db";
import {
  bankAccounts,
  bankTransactions,
  cashTransactions,
  checkRoutings,
  checks,
  customers,
  factoryDailyUploadItems,
  factoryDailyUploads,
  items,
  opsInboxItems,
  suppliers,
} from "../drizzle/schema";
import { asDate, parseMoneyToken } from "./bank-statement-parse";
import { createCheckWithJournal } from "./check-actions";
import { depositRoutedCheck } from "./check-routing";
import {
  postBankTransactionJournal,
  postCashTransactionJournal,
} from "./auto-journal";
import { assertDateNotInClosedPeriod } from "./fiscal-period-guard";
import { tenantWhere, withTenantId } from "./tenant-scope";

export type OpsSource = "whatsapp" | "factory" | "manual";
export type OpsSuggestedType =
  | "incoming_check"
  | "outgoing_check"
  | "check_deposit"
  | "cash_receive"
  | "bank_deposit"
  | "expense"
  | "note"
  | "other";

export type OpsDraft = {
  suggestedType: OpsSuggestedType;
  checkNumber?: string;
  amount?: number;
  date?: string;
  dueDate?: string;
  bankName?: string;
  partyName?: string;
  customerId?: number;
  supplierId?: number;
  bankAccountId?: number;
  description?: string;
  confidence?: number;
};

const MAX_BASE64 = 7_000_000;

function stripDataUrl(b64: string) {
  return b64.replace(/^data:[^;]+;base64,/, "");
}

function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * drizzle-orm بيرجّع عمود date() كـ JS Date object (مش نص) لأن الجدول مش معرَّف بـ{mode:"string"}.
 * String(dateObj) بينادي .toString() مش .toISOString() فبيطلع "Tue Sep 01" (بلا سنة!) بدل
 * "2026-09-01" — لازم نتعامل مع الحالتين هنا لأي قيمة تاريخ خارجة من قاعدة البيانات مباشرة
 * (مش راجعة عن طريق tRPC/superjson اللي بيسلسل الـDate صح تلقائياً).
 */
function toDateStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v || "").slice(0, 10);
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeType(raw: unknown): OpsSuggestedType {
  const s = String(raw || "")
    .toLowerCase()
    .trim();
  if (/(incoming.?check|شيك.?وارد|استلام.?شيك|check.?in)/.test(s)) return "incoming_check";
  if (/(outgoing.?check|شيك.?صادر|صرف.?شيك|check.?out)/.test(s)) return "outgoing_check";
  if (/(check.?deposit|ايداع.?شيك|إيداع.?شيك|deposit.?check)/.test(s)) return "check_deposit";
  if (/(cash.?receive|تحصيل|استلام.?نقد|قبض)/.test(s)) return "cash_receive";
  if (/(bank.?deposit|ايداع.?بنك|إيداع.?بنك|تحويل.?وارد)/.test(s)) return "bank_deposit";
  if (/(expense|مصروف|صرف)/.test(s)) return "expense";
  if (/(note|ملاحظة|تنويه)/.test(s)) return "note";
  return "other";
}

function draftFromPartial(p: Record<string, unknown>): OpsDraft {
  const amountRaw = p.amount ?? p.total;
  let amount: number | undefined;
  if (typeof amountRaw === "number") amount = Math.abs(amountRaw);
  else if (amountRaw != null) {
    const m = Math.abs(parseMoneyToken(String(amountRaw)));
    if (m > 0) amount = m;
  }
  const date = p.date ? asDate(p.date) || undefined : undefined;
  const dueDate = p.dueDate ? asDate(p.dueDate) || undefined : date;
  return {
    suggestedType: normalizeType(p.suggestedType || p.type),
    checkNumber: p.checkNumber ? String(p.checkNumber).trim() : undefined,
    amount,
    date: date || today(),
    dueDate,
    bankName: p.bankName ? String(p.bankName).trim() : undefined,
    partyName: p.partyName ? String(p.partyName).trim() : undefined,
    customerId: p.customerId != null ? n(p.customerId) || undefined : undefined,
    supplierId: p.supplierId != null ? n(p.supplierId) || undefined : undefined,
    bankAccountId: p.bankAccountId != null ? n(p.bankAccountId) || undefined : undefined,
    description: p.description ? String(p.description).trim() : undefined,
    confidence: p.confidence != null ? Math.min(1, Math.max(0, n(p.confidence))) : undefined,
  };
}

async function fuzzyFindParty(
  db: Db,
  tenantId: number,
  name: string | undefined,
  prefer: "customer" | "supplier" | "any",
): Promise<{ customerId?: number; supplierId?: number; matchedName?: string }> {
  if (!name || name.trim().length < 2) return {};
  const q = `%${name.trim().slice(0, 40)}%`;

  if (prefer === "customer" || prefer === "any") {
    const [c] = await db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(tenantWhere(customers, tenantId, like(customers.name, q)))
      .limit(1);
    if (c) return { customerId: c.id, matchedName: c.name };
  }
  if (prefer === "supplier" || prefer === "any") {
    const [s] = await db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(tenantWhere(suppliers, tenantId, like(suppliers.name, q)))
      .limit(1);
    if (s) return { supplierId: s.id, matchedName: s.name };
  }
  return {};
}

async function fuzzyFindBank(
  db: Db,
  tenantId: number,
  bankName?: string,
): Promise<number | undefined> {
  if (!bankName) return undefined;
  const q = `%${bankName.trim().slice(0, 40)}%`;
  const [b] = await db
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(tenantWhere(bankAccounts, tenantId, like(bankAccounts.name, q)))
    .limit(1);
  return b?.id;
}

async function extractFromImage(contentBase64: string, mimeType: string): Promise<OpsDraft> {
  try {
    const { ollamaVisionExtract } = await import("./ollama");
    const raw = await ollamaVisionExtract({
      mimeType,
      imageBase64: contentBase64,
      prompt: `هذه صورة من جروب واتساب لشركة (شيك / إيداع شيك / إيصال / تحويل).
حدّد النوع وأرجع JSON فقط بدون markdown:
{
  "suggestedType": "incoming_check|outgoing_check|check_deposit|cash_receive|bank_deposit|expense|note|other",
  "checkNumber": "رقم الشيك أو null",
  "amount": 0,
  "date": "YYYY-MM-DD أو null",
  "dueDate": "YYYY-MM-DD أو null",
  "bankName": "اسم البنك أو null",
  "partyName": "اسم العميل/المورد إن ظهر أو null",
  "description": "ملخص قصير بالعربي",
  "confidence": 0.0
}
- incoming_check = صورة شيك مستلم من عميل
- check_deposit = صورة إيداع شيك في البنك / قسيمة إيداع
- لو غير واضح استخدم other مع confidence منخفضة`,
    });
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return { suggestedType: "other", description: "تعذر استخراج الحقول من الصورة", confidence: 0 };
    return draftFromPartial(JSON.parse(m[0]) as Record<string, unknown>);
  } catch (e: unknown) {
    return {
      suggestedType: "other",
      description: `صورة محفوظة — الاستخراج الآلي غير متاح (${e instanceof Error ? e.message : "خطأ"})`,
      confidence: 0,
      date: today(),
    };
  }
}

async function extractFromText(text: string): Promise<OpsDraft> {
  const cleaned = text.trim();
  if (!cleaned) return { suggestedType: "note", description: "", confidence: 0, date: today() };

  // Heuristic first (fast, offline)
  let suggestedType: OpsSuggestedType = "note";
  if (/ايداع\s*شيك|إيداع\s*شيك|قسيمة\s*ايداع/i.test(cleaned)) suggestedType = "check_deposit";
  else if (/شيك\s*وارد|استلمنا\s*شيك|شيك\s*من/i.test(cleaned)) suggestedType = "incoming_check";
  else if (/شيك\s*صادر|صرفنا\s*شيك|شيك\s*لـ/i.test(cleaned)) suggestedType = "outgoing_check";
  else if (/تحصيل|قبض|استلمنا\s*نقد/i.test(cleaned)) suggestedType = "cash_receive";
  else if (/ايداع|إيداع|تحويل/i.test(cleaned)) suggestedType = "bank_deposit";
  else if (/مصروف|صرفنا/i.test(cleaned)) suggestedType = "expense";

  const amountMatch = cleaned.match(/(?:مبلغ|قيمة|بمبلغ)?\s*([\d.,]+)\s*(?:ج|جنيه|EGP)?/i);
  const amount = amountMatch ? Math.abs(parseMoneyToken(amountMatch[1])) : undefined;
  const checkMatch = cleaned.match(/(?:شيك|check)\s*(?:رقم|رقم|#)?\s*([A-Za-z0-9\-\/]+)/i);
  const dateMatch = cleaned.match(/(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2})/);

  let draft: OpsDraft = {
    suggestedType,
    amount: amount && amount > 0 ? amount : undefined,
    checkNumber: checkMatch?.[1],
    date: dateMatch ? asDate(dateMatch[1]) || today() : today(),
    description: cleaned.slice(0, 500),
    confidence: amount ? 0.55 : 0.35,
  };

  // AI refine when available
  try {
    const { ollamaChat } = await import("./ollama");
    const raw = await ollamaChat(
      [
        {
          role: "system",
          content: `حلّل رسالة واتساب محاسبية عربية وأرجع JSON واحد فقط:
{"suggestedType":"incoming_check|outgoing_check|check_deposit|cash_receive|bank_deposit|expense|note|other","checkNumber":null,"amount":null,"date":null,"dueDate":null,"bankName":null,"partyName":null,"description":"...","confidence":0.0}`,
        },
        { role: "user", content: cleaned.slice(0, 4000) },
      ],
      { temperature: 0, numPredict: 800, tier: "heavy" },
    );
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      const ai = draftFromPartial(JSON.parse(m[0]) as Record<string, unknown>);
      draft = {
        ...draft,
        ...Object.fromEntries(Object.entries(ai).filter(([, v]) => v != null && v !== "")),
        suggestedType: ai.suggestedType || draft.suggestedType,
        confidence: Math.max(draft.confidence || 0, ai.confidence || 0.6),
      };
    }
  } catch {
    /* keep heuristic */
  }

  return draft;
}

async function enrichDraft(
  db: Db,
  tenantId: number,
  draft: OpsDraft,
): Promise<OpsDraft> {
  const prefer =
    draft.suggestedType === "outgoing_check" || draft.suggestedType === "expense"
      ? "supplier"
      : draft.suggestedType === "incoming_check" ||
          draft.suggestedType === "cash_receive" ||
          draft.suggestedType === "check_deposit"
        ? "customer"
        : "any";

  const party = await fuzzyFindParty(db, tenantId, draft.partyName, prefer);
  const bankAccountId = draft.bankAccountId || (await fuzzyFindBank(db, tenantId, draft.bankName));
  return {
    ...draft,
    customerId: draft.customerId || party.customerId,
    supplierId: draft.supplierId || party.supplierId,
    bankAccountId,
    partyName: draft.partyName || party.matchedName,
  };
}

function publicItem(row: typeof opsInboxItems.$inferSelect) {
  return {
    id: row.id,
    source: row.source,
    channelNote: row.channelNote,
    workDate: row.workDate ? toDateStr(row.workDate) : null,
    rawText: row.rawText,
    fileName: row.fileName,
    mimeType: row.mimeType,
    hasFile: !!row.contentBase64,
    suggestedType: row.suggestedType,
    extracted: parseJson<Record<string, unknown>>(row.extractedJson, {}),
    draft: parseJson<OpsDraft>(row.draftJson, { suggestedType: (row.suggestedType as OpsSuggestedType) || "other" }),
    status: row.status,
    confidence: n(row.confidence),
    confirmedEntityType: row.confirmedEntityType,
    confirmedEntityId: row.confirmedEntityId,
    confirmedRef: row.confirmedRef,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function ingestWhatsAppItem(
  db: Db,
  tenantId: number,
  input: {
    channelNote?: string;
    workDate?: string;
    rawText?: string;
    fileName?: string;
    mimeType?: string;
    contentBase64?: string;
    createdBy?: number;
  },
) {
  const hasText = !!(input.rawText && input.rawText.trim());
  const hasFile = !!(input.contentBase64 && input.contentBase64.length > 20);
  if (!hasText && !hasFile) throw new Error("أضف نص الرسالة أو صورة من الواتساب");

  let contentBase64: string | null = null;
  if (hasFile) {
    contentBase64 = stripDataUrl(input.contentBase64!);
    if (contentBase64.length > MAX_BASE64) throw new Error("حجم الصورة كبير — الحد 5 ميجابايت تقريباً");
  }

  const mime = (input.mimeType || "").toLowerCase();
  const isImage = mime.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(input.fileName || "");

  let draft: OpsDraft;
  if (hasFile && isImage) {
    draft = await extractFromImage(contentBase64!, mime || "image/jpeg");
    if (hasText) {
      const textDraft = await extractFromText(input.rawText!);
      draft = {
        ...textDraft,
        ...Object.fromEntries(Object.entries(draft).filter(([, v]) => v != null && v !== "")),
        description: draft.description || textDraft.description,
        suggestedType:
          draft.suggestedType !== "other" ? draft.suggestedType : textDraft.suggestedType,
      };
    }
  } else if (hasText) {
    draft = await extractFromText(input.rawText!);
  } else {
    draft = {
      suggestedType: "other",
      description: `مرفق: ${input.fileName || "ملف"}`,
      date: input.workDate || today(),
      confidence: 0.2,
    };
  }

  draft = await enrichDraft(db, tenantId, draft);
  const workDate = input.workDate || draft.date || today();

  const [insertResult] = await db.insert(opsInboxItems).values({
    tenantId,
    source: "whatsapp",
    channelNote: input.channelNote || null,
    workDate: workDate as any,
    rawText: input.rawText?.trim() || null,
    fileName: input.fileName || null,
    mimeType: input.mimeType || null,
    contentBase64,
    suggestedType: draft.suggestedType,
    extractedJson: JSON.stringify(draft),
    draftJson: JSON.stringify(draft),
    status: "pending",
    confidence: String(draft.confidence ?? 0),
    createdBy: input.createdBy || null,
  });

  const id = Number((insertResult as { insertId?: number }).insertId ?? 0);
  const [row] = await db.select().from(opsInboxItems).where(eq(opsInboxItems.id, id)).limit(1);
  return publicItem(row!);
}

export async function listOpsInbox(
  db: Db,
  tenantId: number,
  opts: {
    source?: OpsSource;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  },
) {
  const filters = [];
  if (opts.source) filters.push(eq(opsInboxItems.source, opts.source));
  if (opts.status) filters.push(eq(opsInboxItems.status, opts.status));
  if (opts.dateFrom) filters.push(gte(opsInboxItems.workDate as any, opts.dateFrom as any));
  if (opts.dateTo) filters.push(lte(opsInboxItems.workDate as any, opts.dateTo as any));

  const rows = await db
    .select()
    .from(opsInboxItems)
    .where(tenantWhere(opsInboxItems, tenantId, filters.length ? and(...filters) : undefined))
    .orderBy(desc(opsInboxItems.id))
    .limit(opts.limit ?? 100);

  return rows.map(publicItem);
}

export async function getOpsInboxContent(db: Db, tenantId: number, id: number) {
  const [row] = await db
    .select()
    .from(opsInboxItems)
    .where(tenantWhere(opsInboxItems, tenantId, eq(opsInboxItems.id, id)))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    contentBase64: row.contentBase64,
  };
}

export async function updateOpsDraft(
  db: Db,
  tenantId: number,
  id: number,
  draft: OpsDraft,
) {
  const [row] = await db
    .select()
    .from(opsInboxItems)
    .where(tenantWhere(opsInboxItems, tenantId, eq(opsInboxItems.id, id)))
    .limit(1);
  if (!row) throw new Error("العنصر غير موجود");
  if (row.status === "confirmed") throw new Error("تم تأكيد العنصر مسبقاً");

  const enriched = await enrichDraft(db, tenantId, draftFromPartial(draft as unknown as Record<string, unknown>));
  await db
    .update(opsInboxItems)
    .set({
      draftJson: JSON.stringify(enriched),
      suggestedType: enriched.suggestedType,
      status: "reviewing",
      confidence: String(enriched.confidence ?? row.confidence ?? 0),
    })
    .where(eq(opsInboxItems.id, id));

  const [updated] = await db.select().from(opsInboxItems).where(eq(opsInboxItems.id, id)).limit(1);
  return publicItem(updated!);
}

export async function setOpsInboxStatus(
  db: Db,
  tenantId: number,
  id: number,
  status: "ignored" | "rejected" | "pending",
  reviewNote?: string,
  reviewedBy?: number,
) {
  await db
    .update(opsInboxItems)
    .set({
      status,
      reviewNote: reviewNote || null,
      reviewedBy: reviewedBy || null,
    })
    .where(tenantWhere(opsInboxItems, tenantId, eq(opsInboxItems.id, id)));
  return { ok: true };
}

export async function reextractOpsItem(db: Db, tenantId: number, id: number) {
  const [row] = await db
    .select()
    .from(opsInboxItems)
    .where(tenantWhere(opsInboxItems, tenantId, eq(opsInboxItems.id, id)))
    .limit(1);
  if (!row) throw new Error("العنصر غير موجود");

  let draft: OpsDraft;
  if (row.contentBase64 && (row.mimeType || "").startsWith("image/")) {
    draft = await extractFromImage(row.contentBase64, row.mimeType || "image/jpeg");
  } else if (row.rawText) {
    draft = await extractFromText(row.rawText);
  } else {
    throw new Error("لا يوجد محتوى لإعادة الاستخراج");
  }
  draft = await enrichDraft(db, tenantId, draft);

  await db
    .update(opsInboxItems)
    .set({
      extractedJson: JSON.stringify(draft),
      draftJson: JSON.stringify(draft),
      suggestedType: draft.suggestedType,
      confidence: String(draft.confidence ?? 0),
      status: row.status === "confirmed" ? row.status : "pending",
    })
    .where(eq(opsInboxItems.id, id));

  const [updated] = await db.select().from(opsInboxItems).where(eq(opsInboxItems.id, id)).limit(1);
  return publicItem(updated!);
}

export async function confirmOpsItem(
  db: Db,
  tenantId: number,
  userId: number,
  id: number,
  overrides?: Partial<OpsDraft>,
) {
  const [row] = await db
    .select()
    .from(opsInboxItems)
    .where(tenantWhere(opsInboxItems, tenantId, eq(opsInboxItems.id, id)))
    .limit(1);
  if (!row) throw new Error("العنصر غير موجود");
  if (row.status === "confirmed") throw new Error("تم التأكيد مسبقاً");

  const draft = await enrichDraft(
    db,
    tenantId,
    draftFromPartial({
      ...parseJson<OpsDraft>(row.draftJson, { suggestedType: "other" }),
      ...(overrides || {}),
    } as unknown as Record<string, unknown>),
  );

  const date = draft.date || (row.workDate ? toDateStr(row.workDate) : "") || today();
  const amount = draft.amount != null ? String(draft.amount) : "";
  let confirmedEntityType: string | null = null;
  let confirmedEntityId: number | null = null;
  let confirmedRef: string | null = null;

  if (draft.suggestedType === "incoming_check" || draft.suggestedType === "outgoing_check") {
    if (!draft.checkNumber) throw new Error("رقم الشيك مطلوب قبل التأكيد");
    if (!amount || n(amount) <= 0) throw new Error("مبلغ الشيك مطلوب");
    if (draft.suggestedType === "incoming_check" && !draft.customerId) {
      throw new Error("اختر العميل قبل تأكيد الشيك الوارد");
    }
    if (draft.suggestedType === "outgoing_check" && !draft.supplierId) {
      throw new Error("اختر المورد قبل تأكيد الشيك الصادر");
    }
    const [countResult] = await db.select({ count: count() }).from(checks).where(tenantWhere(checks, tenantId));
    const number = `CHK-${String(countResult.count + 1).padStart(5, "0")}`;
    const created = await createCheckWithJournal(db, tenantId, userId, {
      type: draft.suggestedType === "incoming_check" ? "incoming" : "outgoing",
      checkNumber: draft.checkNumber,
      bankAccountId: draft.bankAccountId,
      customerId: draft.customerId,
      supplierId: draft.supplierId,
      amount,
      dueDate: draft.dueDate || date,
      date,
      description: draft.description || `من وارد واتساب #${id}`,
      number,
    });
    const [createdRow] = await db
      .select({ id: checks.id })
      .from(checks)
      .where(tenantWhere(checks, tenantId, eq(checks.number, created.number)))
      .orderBy(desc(checks.id))
      .limit(1);
    confirmedEntityType = "check";
    confirmedEntityId = createdRow?.id || null;
    confirmedRef = created.number;
  } else if (draft.suggestedType === "check_deposit") {
    // Match pending incoming check then deposit via routing
    const checkFilters = [eq(checks.type, "incoming"), eq(checks.status, "pending")];
    if (draft.checkNumber) checkFilters.push(eq(checks.checkNumber, draft.checkNumber));
    if (amount) checkFilters.push(eq(checks.amount, amount));

    const [chk] = await db
      .select()
      .from(checks)
      .where(tenantWhere(checks, tenantId, and(...checkFilters)))
      .orderBy(desc(checks.id))
      .limit(1);

    if (!chk) {
      throw new Error(
        draft.checkNumber
          ? `لم يُعثر على شيك وارد معلّق برقم ${draft.checkNumber}`
          : "حدّد رقم الشيك أو سجّل الشيك أولاً ثم أكّد الإيداع",
      );
    }
    if (!draft.bankAccountId) throw new Error("اختر البنك المودع فيه قبل التأكيد");

    const [routing] = await db
      .select()
      .from(checkRoutings)
      .where(tenantWhere(checkRoutings, tenantId, eq(checkRoutings.checkId, chk.id)))
      .orderBy(desc(checkRoutings.id))
      .limit(1);

    if (!routing) {
      throw new Error("الشيك بلا توجيه — افتح توجيه الشيكات ثم أعد التأكيد");
    }

    await depositRoutedCheck(db, tenantId, userId, {
      routingId: routing.id,
      depositDate: date,
      bankAccountId: draft.bankAccountId,
      notes: draft.description || `إيداع من وارد واتساب #${id}`,
    });
    confirmedEntityType = "check";
    confirmedEntityId = chk.id;
    confirmedRef = chk.number;
  } else if (draft.suggestedType === "cash_receive") {
    if (!amount || n(amount) <= 0) throw new Error("المبلغ مطلوب");
    if (!draft.customerId) throw new Error("اختر العميل للتحصيل النقدي");
    await assertDateNotInClosedPeriod(db, tenantId, date);
    const [countResult] = await db
      .select({ count: count() })
      .from(cashTransactions)
      .where(tenantWhere(cashTransactions, tenantId));
    const number = `CT-${String(countResult.count + 1).padStart(5, "0")}`;
    const [insertResult] = await db.insert(cashTransactions).values(
      withTenantId(tenantId, {
        number,
        type: "receive_customer",
        date: date as any,
        customerId: draft.customerId,
        amount,
        description: draft.description || `من وارد واتساب #${id}`,
        createdBy: userId,
      }) as any,
    );
    const [c] = await db
      .select({ name: customers.name })
      .from(customers)
      .where(tenantWhere(customers, tenantId, eq(customers.id, draft.customerId!)));
    await postCashTransactionJournal(db, tenantId, userId, {
      number,
      type: "receive_customer",
      date,
      amount,
      description: draft.description,
      customerName: c?.name,
    });
    confirmedEntityType = "cash_transaction";
    confirmedEntityId = Number((insertResult as { insertId?: number }).insertId ?? 0) || null;
    confirmedRef = number;
  } else if (draft.suggestedType === "bank_deposit" || draft.suggestedType === "expense") {
    if (!amount || n(amount) <= 0) throw new Error("المبلغ مطلوب");
    if (!draft.bankAccountId) throw new Error("اختر الحساب البنكي");
    await assertDateNotInClosedPeriod(db, tenantId, date);
    const type =
      draft.suggestedType === "expense"
        ? draft.supplierId
          ? "withdraw_supplier"
          : "withdraw"
        : draft.customerId
          ? "deposit_customer"
          : "deposit";
    const [countResult] = await db
      .select({ count: count() })
      .from(bankTransactions)
      .where(tenantWhere(bankTransactions, tenantId));
    const number = `BT-${String(countResult.count + 1).padStart(5, "0")}`;
    const [insertResult] = await db.insert(bankTransactions).values(
      withTenantId(tenantId, {
        number,
        type,
        bankAccountId: draft.bankAccountId,
        date: date as any,
        customerId: draft.customerId,
        supplierId: draft.supplierId,
        amount,
        description: draft.description || `من وارد واتساب #${id}`,
        createdBy: userId,
      }) as any,
    );
    let customerName: string | undefined;
    let supplierName: string | undefined;
    if (draft.customerId) {
      const [c] = await db
        .select({ name: customers.name })
        .from(customers)
        .where(tenantWhere(customers, tenantId, eq(customers.id, draft.customerId)));
      customerName = c?.name;
    }
    if (draft.supplierId) {
      const [s] = await db
        .select({ name: suppliers.name })
        .from(suppliers)
        .where(tenantWhere(suppliers, tenantId, eq(suppliers.id, draft.supplierId)));
      supplierName = s?.name;
    }
    await postBankTransactionJournal(db, tenantId, userId, {
      number,
      type,
      date,
      amount,
      description: draft.description,
      customerName,
      supplierName,
      bankAccountId: draft.bankAccountId,
    });
    confirmedEntityType = "bank_transaction";
    confirmedEntityId = Number((insertResult as { insertId?: number }).insertId ?? 0) || null;
    confirmedRef = number;
  } else if (draft.suggestedType === "note" || draft.suggestedType === "other") {
    confirmedEntityType = "note";
    confirmedRef = "archived-note";
  } else {
    throw new Error("نوع غير مدعوم للتأكيد التلقائي — عدّل النوع أو تجاهل العنصر");
  }

  await db
    .update(opsInboxItems)
    .set({
      status: "confirmed",
      draftJson: JSON.stringify(draft),
      suggestedType: draft.suggestedType,
      confirmedEntityType,
      confirmedEntityId,
      confirmedRef,
      reviewedBy: userId,
      reviewNote: overrides?.description || row.reviewNote,
    })
    .where(eq(opsInboxItems.id, id));

  return {
    ok: true,
    confirmedEntityType,
    confirmedEntityId,
    confirmedRef,
  };
}

// ——— Factory daily ———

export async function uploadFactoryDaily(
  db: Db,
  tenantId: number,
  input: {
    workDate: string;
    title: string;
    fileName?: string;
    mimeType?: string;
    contentBase64?: string;
    notes?: string;
    createdBy?: number;
    alsoToInbox?: boolean;
    type?: "purchase" | "sales" | "mixing" | "general";
    partyName?: string;
    itemDescription?: string;
    quantity?: string;
    amount?: string;
    materialsUsed?: string;
    items?: Array<{ itemDescription: string; quantity?: string; amount?: string }>;
  },
) {
  const hasFile = !!input.contentBase64;
  const contentBase64 = hasFile ? stripDataUrl(input.contentBase64!) : "";
  if (contentBase64.length > MAX_BASE64) throw new Error("حجم الملف كبير — الحد ~5 ميجابايت");
  const fileName = input.fileName?.trim() || "بدون ملف مرفق";
  const lineItems = (input.items || []).filter((i) => i.itemDescription.trim());
  const totalAmount = lineItems.length
    ? lineItems.reduce((s, i) => s + (Number(i.amount) || 0), 0)
    : null;

  const [insertResult] = await db.insert(factoryDailyUploads).values({
    tenantId,
    workDate: input.workDate as any,
    title: input.title.slice(0, 255) || fileName,
    fileName: fileName.slice(0, 255),
    mimeType: (input.mimeType || "application/octet-stream").slice(0, 120),
    contentBase64: hasFile ? contentBase64 : null,
    notes: input.notes || null,
    status: "uploaded",
    type: input.type || "general",
    partyName: input.partyName || null,
    // بيان بأكتر من صنف: الهيدر بيحمل الإجمالي بس، والبنود التفصيلية في factory_daily_upload_items
    itemDescription: lineItems.length ? null : input.itemDescription || null,
    quantity: lineItems.length ? null : input.quantity || null,
    amount: lineItems.length ? (totalAmount != null ? String(totalAmount) : null) : input.amount || null,
    materialsUsed: input.materialsUsed || null,
    createdBy: input.createdBy || null,
  });
  const id = Number((insertResult as { insertId?: number }).insertId ?? 0);

  if (lineItems.length) {
    await db.insert(factoryDailyUploadItems).values(
      lineItems.map((item, i) => ({
        tenantId,
        uploadId: id,
        itemDescription: item.itemDescription.trim().slice(0, 255),
        quantity: item.quantity || null,
        amount: item.amount || null,
        sortOrder: i,
      })),
    );
  }

  let linkedInboxItemId: number | null = null;
  if (hasFile && input.alsoToInbox !== false) {
    const mime = (input.mimeType || "").toLowerCase();
    const isImage = mime.startsWith("image/");
    const isPdf = mime.includes("pdf") || fileName.toLowerCase().endsWith(".pdf");
    let draft: OpsDraft = {
      suggestedType: "other",
      date: input.workDate,
      description: input.title,
      confidence: 0.3,
    };
    if (isImage) draft = await extractFromImage(contentBase64, mime || "image/jpeg");
    else if (isPdf) {
      try {
        const { extractText, getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(contentBase64, "base64")));
        const result = await extractText(pdf, { mergePages: true });
        const text = String(result.text || "").trim();
        if (text.length > 20) draft = await extractFromText(text.slice(0, 4000));
      } catch {
        /* keep */
      }
    }
    draft = await enrichDraft(db, tenantId, { ...draft, date: draft.date || input.workDate });
    const [inboxInsert] = await db.insert(opsInboxItems).values({
      tenantId,
      source: "factory",
      channelNote: "شغل المصنع اليومي",
      workDate: input.workDate as any,
      rawText: input.notes || input.title,
      fileName,
      mimeType: input.mimeType || "application/octet-stream",
      contentBase64,
      suggestedType: draft.suggestedType,
      extractedJson: JSON.stringify(draft),
      draftJson: JSON.stringify(draft),
      status: "pending",
      confidence: String(draft.confidence ?? 0),
      createdBy: input.createdBy || null,
    });
    linkedInboxItemId = Number((inboxInsert as { insertId?: number }).insertId ?? 0) || null;
    if (linkedInboxItemId) {
      await db
        .update(factoryDailyUploads)
        .set({ linkedInboxItemId, extractedJson: JSON.stringify(draft) })
        .where(eq(factoryDailyUploads.id, id));
    }
  }

  return { id, linkedInboxItemId };
}

export async function listFactoryDaily(
  db: Db,
  tenantId: number,
  opts: { dateFrom?: string; dateTo?: string; status?: string; type?: string; limit?: number },
) {
  const filters = [];
  if (opts.dateFrom) filters.push(gte(factoryDailyUploads.workDate as any, opts.dateFrom as any));
  if (opts.dateTo) filters.push(lte(factoryDailyUploads.workDate as any, opts.dateTo as any));
  if (opts.status) filters.push(eq(factoryDailyUploads.status, opts.status));
  if (opts.type) filters.push(eq(factoryDailyUploads.type, opts.type as any));

  const rows = await db
    .select({
      id: factoryDailyUploads.id,
      workDate: factoryDailyUploads.workDate,
      title: factoryDailyUploads.title,
      fileName: factoryDailyUploads.fileName,
      mimeType: factoryDailyUploads.mimeType,
      notes: factoryDailyUploads.notes,
      status: factoryDailyUploads.status,
      linkedInboxItemId: factoryDailyUploads.linkedInboxItemId,
      extractedJson: factoryDailyUploads.extractedJson,
      createdAt: factoryDailyUploads.createdAt,
      hasFile: factoryDailyUploads.contentBase64,
      type: factoryDailyUploads.type,
      partyName: factoryDailyUploads.partyName,
      itemDescription: factoryDailyUploads.itemDescription,
      quantity: factoryDailyUploads.quantity,
      amount: factoryDailyUploads.amount,
      materialsUsed: factoryDailyUploads.materialsUsed,
      postedEntityType: factoryDailyUploads.postedEntityType,
      postedRef: factoryDailyUploads.postedRef,
    })
    .from(factoryDailyUploads)
    .where(tenantWhere(factoryDailyUploads, tenantId, filters.length ? and(...filters) : undefined))
    .orderBy(desc(factoryDailyUploads.workDate), desc(factoryDailyUploads.id))
    .limit(opts.limit ?? 200);

  const ids = rows.map((r) => r.id);
  const itemRows = ids.length
    ? await db
        .select({
          uploadId: factoryDailyUploadItems.uploadId,
          itemDescription: factoryDailyUploadItems.itemDescription,
          quantity: factoryDailyUploadItems.quantity,
          amount: factoryDailyUploadItems.amount,
        })
        .from(factoryDailyUploadItems)
        .where(and(eq(factoryDailyUploadItems.tenantId, tenantId), inArray(factoryDailyUploadItems.uploadId, ids)))
        .orderBy(factoryDailyUploadItems.sortOrder, factoryDailyUploadItems.id)
    : [];
  const itemsByUpload = new Map<number, Array<{ itemDescription: string; quantity: number | null; amount: number | null }>>();
  for (const it of itemRows) {
    const list = itemsByUpload.get(it.uploadId) || [];
    list.push({
      itemDescription: it.itemDescription,
      quantity: it.quantity != null ? Number(it.quantity) : null,
      amount: it.amount != null ? Number(it.amount) : null,
    });
    itemsByUpload.set(it.uploadId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    workDate: toDateStr(r.workDate),
    title: r.title,
    fileName: r.fileName,
    mimeType: r.mimeType,
    notes: r.notes,
    status: r.status,
    linkedInboxItemId: r.linkedInboxItemId,
    extracted: parseJson(r.extractedJson, null),
    type: r.type,
    partyName: r.partyName,
    itemDescription: r.itemDescription,
    quantity: r.quantity != null ? Number(r.quantity) : null,
    amount: r.amount != null ? Number(r.amount) : null,
    materialsUsed: r.materialsUsed,
    items: itemsByUpload.get(r.id) || [],
    createdAt: r.createdAt,
    hasFile: !!r.hasFile,
    postedEntityType: r.postedEntityType,
    postedRef: r.postedRef,
  }));
}

export async function getFactoryDailyContent(db: Db, tenantId: number, id: number) {
  const [row] = await db
    .select()
    .from(factoryDailyUploads)
    .where(tenantWhere(factoryDailyUploads, tenantId, eq(factoryDailyUploads.id, id)))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    contentBase64: row.contentBase64,
  };
}

export async function setFactoryDailyStatus(
  db: Db,
  tenantId: number,
  id: number,
  status: "uploaded" | "reviewed" | "posted" | "ignored",
) {
  await db
    .update(factoryDailyUploads)
    .set({ status })
    .where(tenantWhere(factoryDailyUploads, tenantId, eq(factoryDailyUploads.id, id)));
  return { ok: true };
}

/** توحيد نص عربي/إنجليزي للمطابقة التقريبية (تشكيل، تطويل، أشكال الألف/الياء/التاء المربوطة) */
function normalizeMatchKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/ـ/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\s\-_/\\]+/g, " ")
    .trim();
}

export type MatchCandidate = { id: number; name: string; score: number };

function rankCandidates<T extends { id: number; name: string | null }>(
  rows: T[],
  query: string,
): MatchCandidate[] {
  const key = normalizeMatchKey(query);
  if (!key) return [];
  const scored: MatchCandidate[] = [];
  for (const r of rows) {
    const name = normalizeMatchKey(r.name || "");
    if (!name) continue;
    let score = 0;
    if (name === key) score = 100;
    else if (name.includes(key) || key.includes(name)) score = 70;
    else {
      const a = new Set(key.split(" "));
      const b = new Set(name.split(" "));
      const common = [...a].filter((w) => b.has(w)).length;
      if (common > 0) score = 30 + common * 10;
    }
    if (score > 0) scored.push({ id: r.id, name: r.name || "", score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 5);
}

/** يحاول يفصّل سطر "اسم الخامة: كمية" أو "اسم الخامة - كمية" لاسم ورقم؛ يرجّع الاسم كله لو مقدرش */
function parseMaterialLine(line: string): { name: string; quantity: number | null } {
  const m = line.match(/^(.+?)[\s]*[:\-–—][\s]*([\d.,]+)\s*$/) || line.match(/^(.+?)[\s]+([\d.,]+)\s*$/);
  if (m) {
    const qty = Number(m[2].replace(/,/g, ""));
    if (Number.isFinite(qty)) return { name: m[1].trim(), quantity: qty };
  }
  return { name: line.trim(), quantity: null };
}

export type FactoryConvertPreview = {
  id: number;
  type: "purchase" | "sales" | "mixing" | "general";
  workDate: string;
  quantity: number | null;
  amount: number | null;
  itemDescription: string | null;
  partyName: string | null;
  party: { input: string; candidates: MatchCandidate[] } | null;
  item: { input: string; candidates: MatchCandidate[] } | null;
  materials: Array<{ input: string; quantity: number | null; candidates: MatchCandidate[] }>;
  /** بنود بيان الشراء/المبيعات لو البيان اتسجّل بأكتر من صنف (factory_daily_upload_items) */
  items: Array<{ input: string; quantity: number | null; amount: number | null; candidates: MatchCandidate[] }>;
};

export async function getFactoryConvertPreview(
  db: Db,
  tenantId: number,
  id: number,
): Promise<FactoryConvertPreview> {
  const [row] = await db
    .select()
    .from(factoryDailyUploads)
    .where(tenantWhere(factoryDailyUploads, tenantId, eq(factoryDailyUploads.id, id)))
    .limit(1);
  if (!row) throw new Error("البيان غير موجود");
  if (row.type === "general") {
    throw new Error("بيان عام — لا يوجد تحويل تلقائي له");
  }

  const itemRows = await db
    .select({ id: items.id, name: items.name })
    .from(items)
    .where(tenantWhere(items, tenantId, eq(items.isActive, true)));

  let party: FactoryConvertPreview["party"] = null;
  if (row.type === "purchase" || row.type === "sales") {
    const partyRows = row.type === "purchase"
      ? await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(tenantWhere(suppliers, tenantId))
      : await db.select({ id: customers.id, name: customers.name }).from(customers).where(tenantWhere(customers, tenantId));
    party = { input: row.partyName || "", candidates: rankCandidates(partyRows, row.partyName || "") };
  }

  let item: FactoryConvertPreview["item"] = null;
  const materials: FactoryConvertPreview["materials"] = [];
  const lineItems: FactoryConvertPreview["items"] = [];
  if (row.type === "purchase" || row.type === "sales") {
    const childItems = await db
      .select({
        itemDescription: factoryDailyUploadItems.itemDescription,
        quantity: factoryDailyUploadItems.quantity,
        amount: factoryDailyUploadItems.amount,
      })
      .from(factoryDailyUploadItems)
      .where(and(eq(factoryDailyUploadItems.tenantId, tenantId), eq(factoryDailyUploadItems.uploadId, id)))
      .orderBy(factoryDailyUploadItems.sortOrder, factoryDailyUploadItems.id);
    for (const it of childItems) {
      lineItems.push({
        input: it.itemDescription,
        quantity: it.quantity != null ? Number(it.quantity) : null,
        amount: it.amount != null ? Number(it.amount) : null,
        candidates: rankCandidates(itemRows, it.itemDescription),
      });
    }
  }
  if ((row.type === "purchase" || row.type === "sales" || row.type === "mixing") && !lineItems.length) {
    item = { input: row.itemDescription || "", candidates: rankCandidates(itemRows, row.itemDescription || "") };
  }
  if (row.type === "mixing" && row.materialsUsed) {
    const lines = row.materialsUsed.split(/\n|,/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const parsed = parseMaterialLine(line);
      materials.push({
        input: parsed.name,
        quantity: parsed.quantity,
        candidates: rankCandidates(itemRows, parsed.name),
      });
    }
  }

  return {
    id: row.id,
    type: row.type,
    workDate: toDateStr(row.workDate),
    quantity: row.quantity != null ? Number(row.quantity) : null,
    amount: row.amount != null ? Number(row.amount) : null,
    itemDescription: row.itemDescription,
    partyName: row.partyName,
    party,
    item,
    materials,
    items: lineItems,
  };
}

export async function markFactoryDailyPosted(
  db: Db,
  tenantId: number,
  id: number,
  posted: { entityType: string; entityId: number; ref: string },
) {
  await db
    .update(factoryDailyUploads)
    .set({
      status: "posted",
      postedEntityType: posted.entityType,
      postedEntityId: posted.entityId,
      postedRef: posted.ref,
    })
    .where(tenantWhere(factoryDailyUploads, tenantId, eq(factoryDailyUploads.id, id)));
  return { ok: true };
}

export const OPS_TYPE_LABELS: Record<OpsSuggestedType, string> = {
  incoming_check: "شيك وارد",
  outgoing_check: "شيك صادر",
  check_deposit: "إيداع شيك",
  cash_receive: "تحصيل نقدي",
  bank_deposit: "إيداع بنكي",
  expense: "صرف/مصروف",
  note: "ملاحظة",
  other: "أخرى",
};
