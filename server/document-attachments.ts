/**
 * مرفقات اختيارية للفواتير/الإيصالات + استخراج ومقارنة مع بيانات النظام.
 * غير إلزامي عند الإدخال — للمراجعة المستندية فقط.
 */
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { Db } from "./db";
import {
  customers,
  documentAttachments,
  purchaseInvoices,
  salesInvoices,
  suppliers,
} from "../drizzle/schema";
import type { AuditFinding } from "./accounting-auditor";
import { asDate, parseMoneyToken } from "./bank-statement-parse";
import { tenantWhere } from "./tenant-scope";

export type AttachmentEntityType = "sales_invoice" | "purchase_invoice";
export type AttachmentKind = "invoice_scan" | "payment_receipt" | "other";

export type ExtractedDocFields = {
  docNumber?: string;
  date?: string;
  total?: number;
  partyName?: string;
  rawTextPreview?: string;
  source?: "pdf_text" | "image_ai" | "none";
};

const MAX_BASE64_CHARS = 7_000_000; // ~5MB binary

function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function money(v: number) {
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function push(out: AuditFinding[], finding: Omit<AuditFinding, "id"> & { id?: string }) {
  out.push({ id: finding.id || `${finding.category}-${out.length + 1}`, ...finding });
}

function stripDataUrl(b64: string) {
  return b64.replace(/^data:[^;]+;base64,/, "");
}

/** استخراج حقول فاتورة/إيصال من نص PDF أو OCR */
export function extractDocFieldsFromText(text: string): ExtractedDocFields {
  const cleaned = text.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!cleaned) return { source: "none" };

  const numberMatch =
    cleaned.match(/(?:فاتورة|invoice|inv|رقم(?:\s*الفاتورة)?|doc(?:ument)?\s*no\.?|رقم)\s*[:#-]?\s*([A-Za-z0-9\-\/]+)/i) ||
    cleaned.match(/\b([A-Z]{0,4}\d{2,}[\-\/]?\d*)\b/);

  const dateMatch = cleaned.match(/(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? asDate(dateMatch[1]) || undefined : undefined;

  const totalMatch =
    cleaned.match(/(?:الإجمالي|اجمالي|الصافي|grand\s*total|total\s*amount|amount\s*due|المبلغ)\s*[:\-]?\s*([\d.,]+)/i) ||
    cleaned.match(/(?:EGP|ج\.?\s*م\.?|LE)\s*([\d.,]+)/i);

  let total: number | undefined;
  if (totalMatch) {
    const t = Math.abs(parseMoneyToken(totalMatch[1]));
    if (t > 0) total = t;
  }

  const partyMatch =
    cleaned.match(/(?:العميل|المورد|customer|supplier|إلى|to)\s*[:\-]?\s*([^\n]{3,80})/i) ||
    cleaned.match(/(?:اسم)\s*[:\-]?\s*([^\n]{3,80})/i);

  return {
    docNumber: numberMatch?.[1]?.trim(),
    date,
    total,
    partyName: partyMatch?.[1]?.replace(/\s+/g, " ").trim().slice(0, 120),
    rawTextPreview: cleaned.slice(0, 800),
    source: "pdf_text",
  };
}

async function extractTextFromPdfBase64(contentBase64: string): Promise<string> {
  const buf = Buffer.from(stripDataUrl(contentBase64), "base64");
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const result = await extractText(pdf, { mergePages: true });
  return String(result.text || "").trim();
}

async function extractFieldsFromImageWithAi(
  contentBase64: string,
  mimeType: string,
): Promise<ExtractedDocFields> {
  try {
    const { ollamaVisionExtract } = await import("./ollama");
    const raw = await ollamaVisionExtract({
      mimeType,
      imageBase64: stripDataUrl(contentBase64),
      prompt: `هذه صورة فاتورة أو إيصال. استخرج JSON فقط بدون markdown:
{"docNumber":"...","date":"YYYY-MM-DD","total":0,"partyName":"..."}
لو حقل غير واضح ضعه null.`,
    });
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return { source: "none" };
    const obj = JSON.parse(m[0]) as Record<string, unknown>;
    const date = obj.date ? asDate(obj.date) || undefined : undefined;
    const total = obj.total != null ? Math.abs(n(obj.total)) : undefined;
    return {
      docNumber: obj.docNumber ? String(obj.docNumber) : undefined,
      date,
      total: total && total > 0 ? total : undefined,
      partyName: obj.partyName ? String(obj.partyName).slice(0, 120) : undefined,
      rawTextPreview: raw.slice(0, 400),
      source: "image_ai",
    };
  } catch {
    return { source: "none" };
  }
}

export async function extractAttachmentFields(opts: {
  fileName: string;
  mimeType: string;
  contentBase64: string;
}): Promise<ExtractedDocFields> {
  const mime = (opts.mimeType || "").toLowerCase();
  const name = opts.fileName.toLowerCase();
  const isPdf = mime.includes("pdf") || name.endsWith(".pdf");
  const isImage = mime.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(name);

  if (isPdf) {
    try {
      const text = await extractTextFromPdfBase64(opts.contentBase64);
      if (text.length >= 20) return extractDocFieldsFromText(text);
    } catch {
      /* fall through */
    }
  }

  if (isImage) {
    return extractFieldsFromImageWithAi(opts.contentBase64, mime || "image/jpeg");
  }

  if (mime.includes("text") || name.endsWith(".txt") || name.endsWith(".csv")) {
    const text = Buffer.from(stripDataUrl(opts.contentBase64), "base64").toString("utf8");
    return extractDocFieldsFromText(text);
  }

  return { source: "none" };
}

type SystemDoc = {
  id: number;
  number: string;
  date: string;
  total: number;
  partyName: string;
  link: string;
};

async function loadSystemDoc(
  db: Db,
  tenantId: number,
  entityType: AttachmentEntityType,
  entityId: number,
): Promise<SystemDoc | null> {
  if (entityType === "sales_invoice") {
    const [inv] = await db
      .select({
        id: salesInvoices.id,
        number: salesInvoices.number,
        date: salesInvoices.date,
        total: salesInvoices.total,
        customerName: customers.name,
      })
      .from(salesInvoices)
      .leftJoin(customers, and(eq(customers.id, salesInvoices.customerId), eq(customers.tenantId, tenantId)))
      .where(tenantWhere(salesInvoices, tenantId, eq(salesInvoices.id, entityId)))
      .limit(1);
    if (!inv) return null;
    return {
      id: inv.id,
      number: inv.number,
      date: String(inv.date || "").slice(0, 10),
      total: n(inv.total),
      partyName: inv.customerName || "",
      link: `/sales/invoices/${inv.id}`,
    };
  }

  const [inv] = await db
    .select({
      id: purchaseInvoices.id,
      number: purchaseInvoices.number,
      date: purchaseInvoices.date,
      total: purchaseInvoices.total,
      supplierName: suppliers.name,
    })
    .from(purchaseInvoices)
    .leftJoin(suppliers, and(eq(suppliers.id, purchaseInvoices.supplierId), eq(suppliers.tenantId, tenantId)))
    .where(tenantWhere(purchaseInvoices, tenantId, eq(purchaseInvoices.id, entityId)))
    .limit(1);
  if (!inv) return null;
  return {
    id: inv.id,
    number: inv.number,
    date: String(inv.date || "").slice(0, 10),
    total: n(inv.total),
    partyName: inv.supplierName || "",
    link: `/purchases/invoices/${inv.id}`,
  };
}

function compareExtracted(
  system: SystemDoc,
  extracted: ExtractedDocFields,
  kind: AttachmentKind,
  toleranceEgp = 1,
): { status: string; notes: string } {
  if (extracted.source === "none" && !extracted.total && !extracted.docNumber && !extracted.date) {
    return {
      status: "no_extract",
      notes: "تم حفظ المرفق دون استخراج تلقائي كافٍ — راجع يدوياً عند الحاجة.",
    };
  }

  const issues: string[] = [];

  if (extracted.total != null && Math.abs(extracted.total - system.total) > toleranceEgp) {
    issues.push(`المبلغ في المستند ${money(extracted.total)} ≠ النظام ${money(system.total)}`);
  }

  if (extracted.date && system.date && extracted.date !== system.date) {
    const diff = Math.abs(new Date(extracted.date).getTime() - new Date(system.date).getTime()) / 86400000;
    if (diff > 3) issues.push(`التاريخ في المستند ${extracted.date} ≠ النظام ${system.date}`);
  }

  if (kind === "invoice_scan" && extracted.docNumber) {
    const a = extracted.docNumber.replace(/\s/g, "").toLowerCase();
    const b = system.number.replace(/\s/g, "").toLowerCase();
    if (a && b && !a.includes(b) && !b.includes(a)) {
      issues.push(`رقم المستند ${extracted.docNumber} يختلف عن رقم الفاتورة ${system.number}`);
    }
  }

  if (extracted.partyName && system.partyName) {
    const a = extracted.partyName.toLowerCase();
    const b = system.partyName.toLowerCase();
    if (a.length >= 3 && b.length >= 3 && !a.includes(b.slice(0, 4)) && !b.includes(a.slice(0, 4))) {
      issues.push(`اسم الطرف في المستند «${extracted.partyName}» يختلف عن «${system.partyName}»`);
    }
  }

  if (issues.length) {
    return { status: "mismatch", notes: issues.join(" · ") };
  }
  return {
    status: "matched",
    notes: `متوافق مع النظام (فاتورة ${system.number} / ${money(system.total)} ج).`,
  };
}

export async function uploadDocumentAttachment(
  db: Db,
  tenantId: number,
  input: {
    entityType: AttachmentEntityType;
    entityId: number;
    kind?: AttachmentKind;
    fileName: string;
    mimeType: string;
    contentBase64: string;
    createdBy?: number;
  },
) {
  const contentBase64 = stripDataUrl(input.contentBase64);
  if (contentBase64.length > MAX_BASE64_CHARS) {
    throw new Error("حجم الملف كبير — الحد الأقصى تقريباً 5 ميجابايت");
  }

  const system = await loadSystemDoc(db, tenantId, input.entityType, input.entityId);
  if (!system) throw new Error("الفاتورة غير موجودة");

  const kind = input.kind || "invoice_scan";
  const extracted = await extractAttachmentFields({
    fileName: input.fileName,
    mimeType: input.mimeType,
    contentBase64,
  });
  const compare = compareExtracted(system, extracted, kind);

  const [insertResult] = await db.insert(documentAttachments).values({
    tenantId,
    entityType: input.entityType,
    entityId: input.entityId,
    kind,
    fileName: input.fileName.slice(0, 255),
    mimeType: (input.mimeType || "application/octet-stream").slice(0, 120),
    contentBase64,
    extractedJson: JSON.stringify(extracted),
    compareStatus: compare.status,
    compareNotes: compare.notes,
    createdBy: input.createdBy || null,
  });

  const id = Number((insertResult as { insertId?: number }).insertId ?? 0);
  return {
    id,
    compareStatus: compare.status,
    compareNotes: compare.notes,
    extracted,
  };
}

export async function listDocumentAttachments(
  db: Db,
  tenantId: number,
  entityType: AttachmentEntityType,
  entityId: number,
) {
  const rows = await db
    .select({
      id: documentAttachments.id,
      entityType: documentAttachments.entityType,
      entityId: documentAttachments.entityId,
      kind: documentAttachments.kind,
      fileName: documentAttachments.fileName,
      mimeType: documentAttachments.mimeType,
      compareStatus: documentAttachments.compareStatus,
      compareNotes: documentAttachments.compareNotes,
      extractedJson: documentAttachments.extractedJson,
      createdAt: documentAttachments.createdAt,
      hasContent: documentAttachments.contentBase64,
    })
    .from(documentAttachments)
    .where(
      tenantWhere(
        documentAttachments,
        tenantId,
        and(eq(documentAttachments.entityType, entityType), eq(documentAttachments.entityId, entityId)),
      ),
    )
    .orderBy(desc(documentAttachments.id));

  return rows.map((r) => ({
    id: r.id,
    entityType: r.entityType,
    entityId: r.entityId,
    kind: r.kind,
    fileName: r.fileName,
    mimeType: r.mimeType,
    compareStatus: r.compareStatus,
    compareNotes: r.compareNotes,
    extracted: (() => {
      try {
        return r.extractedJson ? (JSON.parse(r.extractedJson) as ExtractedDocFields) : null;
      } catch {
        return null;
      }
    })(),
    createdAt: r.createdAt,
    hasFile: !!r.hasContent,
  }));
}

export async function getDocumentAttachmentContent(
  db: Db,
  tenantId: number,
  id: number,
) {
  const [row] = await db
    .select()
    .from(documentAttachments)
    .where(tenantWhere(documentAttachments, tenantId, eq(documentAttachments.id, id)))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    contentBase64: row.contentBase64,
  };
}

export async function deleteDocumentAttachment(
  db: Db,
  tenantId: number,
  id: number,
) {
  await db
    .delete(documentAttachments)
    .where(tenantWhere(documentAttachments, tenantId, eq(documentAttachments.id, id)));
  return { ok: true };
}

export async function recompareDocumentAttachment(
  db: Db,
  tenantId: number,
  id: number,
) {
  const [row] = await db
    .select()
    .from(documentAttachments)
    .where(tenantWhere(documentAttachments, tenantId, eq(documentAttachments.id, id)))
    .limit(1);
  if (!row || !row.contentBase64) throw new Error("المرفق غير موجود");

  const entityType = row.entityType as AttachmentEntityType;
  const system = await loadSystemDoc(db, tenantId, entityType, row.entityId);
  if (!system) throw new Error("الفاتورة غير موجودة");

  const extracted = await extractAttachmentFields({
    fileName: row.fileName,
    mimeType: row.mimeType,
    contentBase64: row.contentBase64,
  });
  const compare = compareExtracted(system, extracted, (row.kind as AttachmentKind) || "invoice_scan");

  await db
    .update(documentAttachments)
    .set({
      extractedJson: JSON.stringify(extracted),
      compareStatus: compare.status,
      compareNotes: compare.notes,
    })
    .where(eq(documentAttachments.id, id));

  return { compareStatus: compare.status, compareNotes: compare.notes, extracted };
}

/** مراجعة المرفقات: فروقات + تنبيه اختياري لفواتير كبيرة بدون مرفق */
export async function auditDocumentAttachments(
  db: Db,
  tenantId: number,
  out: AuditFinding[],
  opts?: { materialityEgp?: number },
) {
  const materiality = opts?.materialityEgp ?? 5000;

  try {
    const mismatches = await db
      .select()
      .from(documentAttachments)
      .where(tenantWhere(documentAttachments, tenantId, eq(documentAttachments.compareStatus, "mismatch")))
      .orderBy(desc(documentAttachments.id))
      .limit(40);

    for (const row of mismatches) {
      const link =
        row.entityType === "sales_invoice"
          ? `/sales/invoices/${row.entityId}`
          : `/purchases/invoices/${row.entityId}`;
      push(out, {
        severity: "warning",
        category: "مرفقات مستندية",
        title: `فرق بين المرفق والنظام: ${row.fileName}`,
        detail: row.compareNotes || "المبلغ أو التاريخ أو الطرف لا يطابق بيانات الفاتورة.",
        recommendation: "راجع صورة/ملف المستند وصحّح البيانات أو استبدل المرفق.",
        link,
      });
    }

    // Informative only — attachments are optional
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const sinceStr = since.toISOString().slice(0, 10);

    const bigSales = await db
      .select({ id: salesInvoices.id, number: salesInvoices.number, total: salesInvoices.total })
      .from(salesInvoices)
      .where(
        tenantWhere(
          salesInvoices,
          tenantId,
          and(
            gte(salesInvoices.date as any, sinceStr as any),
            inArray(salesInvoices.status, ["confirmed", "paid", "partial"]),
          ),
        ),
      )
      .limit(200);

    const attachedSales = new Set(
      (
        await db
          .select({ entityId: documentAttachments.entityId })
          .from(documentAttachments)
          .where(tenantWhere(documentAttachments, tenantId, eq(documentAttachments.entityType, "sales_invoice")))
      ).map((r) => r.entityId),
    );

    let missingSales = 0;
    for (const inv of bigSales) {
      if (n(inv.total) >= materiality && !attachedSales.has(inv.id)) missingSales++;
    }
    if (missingSales > 0) {
      push(out, {
        severity: "info",
        category: "مرفقات مستندية",
        title: `فواتير مبيعات كبيرة بدون مرفق اختياري (${missingSales})`,
        detail: `خلال 90 يوم: فواتير ≥ ${money(materiality)} ج بدون صورة/PDF مرفق. الرفع اختياري وغير مطلوب للإدخال.`,
        recommendation: "ارفع صورة/PDF الفاتورة أو إيصال التحصيل من صفحة الفاتورة عند التوفر.",
        link: "/sales/invoices",
      });
    }

    const bigPurchases = await db
      .select({ id: purchaseInvoices.id, number: purchaseInvoices.number, total: purchaseInvoices.total })
      .from(purchaseInvoices)
      .where(
        tenantWhere(
          purchaseInvoices,
          tenantId,
          and(
            gte(purchaseInvoices.date as any, sinceStr as any),
            inArray(purchaseInvoices.status, ["confirmed", "paid", "partial"]),
          ),
        ),
      )
      .limit(200);

    const attachedPurchases = new Set(
      (
        await db
          .select({ entityId: documentAttachments.entityId })
          .from(documentAttachments)
          .where(tenantWhere(documentAttachments, tenantId, eq(documentAttachments.entityType, "purchase_invoice")))
      ).map((r) => r.entityId),
    );

    let missingPurchases = 0;
    for (const inv of bigPurchases) {
      if (n(inv.total) >= materiality && !attachedPurchases.has(inv.id)) missingPurchases++;
    }
    if (missingPurchases > 0) {
      push(out, {
        severity: "info",
        category: "مرفقات مستندية",
        title: `فواتير مشتريات كبيرة بدون مرفق اختياري (${missingPurchases})`,
        detail: `خلال 90 يوم: فواتير ≥ ${money(materiality)} ج بدون مستند مرفق. غير إلزامي للإدخال.`,
        recommendation: "ارفع فاتورة المورد أو إيصال السداد من صفحة الفاتورة عند التوفر.",
        link: "/purchases/invoices",
      });
    }
  } catch {
    // table may not exist yet before migration
  }
}
