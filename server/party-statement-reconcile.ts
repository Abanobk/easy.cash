/**
 * مطابقة كشف حساب عميل/مورد مرفوع مع دفتر أستاذ الطرف الفعلي في البرنامج
 * (فواتير + نقدية + بنك + مردودات — نفس مصادر الحركات المستخدمة في شاشة "كشف حساب"
 * وفي إعادة حساب رصيد العميل/المورد، عشان نكون متسقين مع باقي النظام).
 * مبني على نفس أسلوب مطابقة كشف البنك (bank-statement-reconcile.ts) لكن بدون اشتراط
 * اتجاه المدين/الدائن، لأن شكل الكشف المرفوع (منّا أو من الطرف نفسه) غير مضمون التوحيد.
 */
import { and, desc, eq, or } from "drizzle-orm";
import type { Db } from "./db";
import {
  auditStatementLines,
  auditStatementUploads,
  bankTransactions,
  cashTransactions,
  customers,
  purchaseInvoices,
  purchaseReturns,
  salesInvoices,
  salesReturns,
  suppliers,
} from "../drizzle/schema";
import type { AuditFinding } from "./accounting-auditor";
import { daysBetween, parseBankStatementFile } from "./bank-statement-parse";
import {
  buildCustomerMovements,
  buildSupplierMovements,
  finalizeLedger,
  type LedgerRow,
} from "./statement-ledger";
import { tenantWhere } from "./tenant-scope";

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

type PartyKind = "customer" | "supplier";

async function loadPartyLedger(
  db: Db,
  tenantId: number,
  kind: PartyKind,
  partyId: number,
): Promise<{ ledger: LedgerRow[]; partyName: string | null }> {
  if (kind === "customer") {
    const [party] = await db
      .select()
      .from(customers)
      .where(tenantWhere(customers, tenantId, eq(customers.id, partyId)));
    const invoices = await db
      .select({ number: salesInvoices.number, date: salesInvoices.date, total: salesInvoices.total })
      .from(salesInvoices)
      .where(tenantWhere(salesInvoices, tenantId, eq(salesInvoices.customerId, partyId)));
    const cashTx = await db
      .select()
      .from(cashTransactions)
      .where(tenantWhere(cashTransactions, tenantId, eq(cashTransactions.customerId, partyId)));
    const bankTx = await db
      .select()
      .from(bankTransactions)
      .where(tenantWhere(bankTransactions, tenantId, eq(bankTransactions.customerId, partyId)));
    const returns = await db
      .select({ number: salesReturns.number, date: salesReturns.date, total: salesReturns.total })
      .from(salesReturns)
      .where(tenantWhere(salesReturns, tenantId, eq(salesReturns.customerId, partyId)));
    const { ledger } = finalizeLedger(
      buildCustomerMovements({ invoices, cashTransactions: cashTx, bankTransactions: bankTx, returns }),
      { openingBalance: party?.openingBalance, openingBalanceDate: party?.openingBalanceDate, mode: "ar" },
    );
    return { ledger, partyName: party?.name || null };
  }

  const [party] = await db
    .select()
    .from(suppliers)
    .where(tenantWhere(suppliers, tenantId, eq(suppliers.id, partyId)));
  const invoices = await db
    .select({ number: purchaseInvoices.number, date: purchaseInvoices.date, total: purchaseInvoices.total })
    .from(purchaseInvoices)
    .where(tenantWhere(purchaseInvoices, tenantId, eq(purchaseInvoices.supplierId, partyId)));
  const cashTx = await db
    .select()
    .from(cashTransactions)
    .where(tenantWhere(cashTransactions, tenantId, eq(cashTransactions.supplierId, partyId)));
  const bankTx = await db
    .select()
    .from(bankTransactions)
    .where(tenantWhere(bankTransactions, tenantId, eq(bankTransactions.supplierId, partyId)));
  const returns = await db
    .select({ number: purchaseReturns.number, date: purchaseReturns.date, total: purchaseReturns.total })
    .from(purchaseReturns)
    .where(tenantWhere(purchaseReturns, tenantId, eq(purchaseReturns.supplierId, partyId)));
  const { ledger } = finalizeLedger(
    buildSupplierMovements({ invoices, cashTransactions: cashTx, bankTransactions: bankTx, returns }),
    { openingBalance: party?.openingBalance, openingBalanceDate: party?.openingBalanceDate, mode: "ap" },
  );
  return { ledger, partyName: party?.name || null };
}

export async function importPartyStatement(
  db: Db,
  tenantId: number,
  input: {
    kind: PartyKind;
    partyId: number;
    title: string;
    fileName: string;
    contentBase64: string;
    closingBalance?: number;
    createdBy?: number;
  },
) {
  const party = input.kind === "customer"
    ? (await db.select().from(customers).where(tenantWhere(customers, tenantId, eq(customers.id, input.partyId))))[0]
    : (await db.select().from(suppliers).where(tenantWhere(suppliers, tenantId, eq(suppliers.id, input.partyId))))[0];
  if (!party) throw new Error(input.kind === "customer" ? "العميل غير موجود" : "المورد غير موجود");

  const lines = await parseBankStatementFile({
    fileName: input.fileName,
    contentBase64: input.contentBase64,
    allowAiFallback: false,
  });
  if (!lines.length) {
    throw new Error(
      "لم يتم التعرف على أسطر في الملف — للـ PDF تأكد أنه نصي (مش صورة)، وللـ Excel تأكد من وجود تاريخ ومبلغ/مدين/دائن",
    );
  }

  const dates = lines.map((l) => l.txnDate).sort();
  const periodFrom = dates[0];
  const periodTo = dates[dates.length - 1];

  const [insertResult] = await db.insert(auditStatementUploads).values({
    tenantId,
    kind: input.kind,
    title: input.title.slice(0, 255),
    fileName: input.fileName.slice(0, 255),
    partyName: party.name,
    customerId: input.kind === "customer" ? input.partyId : null,
    supplierId: input.kind === "supplier" ? input.partyId : null,
    periodFrom: periodFrom as any,
    periodTo: periodTo as any,
    closingBalance: input.closingBalance != null ? String(input.closingBalance) : null,
    lineCount: lines.length,
    matchedCount: 0,
    unmatchedCount: lines.length,
    createdBy: input.createdBy || null,
  });
  const importId = Number((insertResult as { insertId?: number }).insertId ?? 0);
  if (!importId) throw new Error("فشل حفظ رأس الكشف");

  await db.insert(auditStatementLines).values(
    lines.map((l, i) => ({
      tenantId,
      importId,
      lineNo: i + 1,
      txnDate: l.txnDate as any,
      description: l.description,
      reference: l.reference || null,
      debit: String(l.debit),
      credit: String(l.credit),
      balance: l.balance != null ? String(l.balance) : null,
      matchStatus: "unmatched",
    })),
  );

  const match = await reconcilePartyStatementImport(db, tenantId, importId);
  return { importId, ...match, periodFrom, periodTo, partyName: party.name };
}

export async function reconcilePartyStatementImport(db: Db, tenantId: number, importId: number) {
  const [imp] = await db
    .select()
    .from(auditStatementUploads)
    .where(tenantWhere(auditStatementUploads, tenantId, eq(auditStatementUploads.id, importId)))
    .limit(1);
  if (!imp) throw new Error("الكشف غير موجود");
  if (!imp.customerId && !imp.supplierId) {
    return { lineCount: 0, matchedCount: 0, unmatchedCount: 0, systemOnlyCount: 0 };
  }

  const lines = await db
    .select()
    .from(auditStatementLines)
    .where(tenantWhere(auditStatementLines, tenantId, eq(auditStatementLines.importId, importId)));

  const kind: PartyKind = imp.customerId ? "customer" : "supplier";
  const partyId = (imp.customerId || imp.supplierId) as number;
  const { ledger } = await loadPartyLedger(db, tenantId, kind, partyId);

  type Cand = { date: string; amount: number; docType: string; docNumber: string; used?: boolean };
  const candidates: Cand[] = ledger
    .filter((row) => row.debit > 0 || row.credit > 0)
    .map((row) => ({
      date: row.date,
      amount: row.debit > 0 ? row.debit : row.credit,
      docType: row.docType,
      docNumber: row.docNumber,
    }));

  let matched = 0;
  for (const line of lines) {
    const debit = n(line.debit);
    const credit = n(line.credit);
    const abs = Math.max(debit, credit);
    const date = String(line.txnDate).slice(0, 10);
    const ref = String(line.reference || "").trim();

    if (abs <= 0) {
      await db
        .update(auditStatementLines)
        .set({ matchStatus: "unmatched", matchedDocType: null, matchedDocNumber: null, matchNote: null })
        .where(eq(auditStatementLines.id, line.id));
      continue;
    }

    let best: Cand | null = null;
    let bestScore = 0;
    for (const c of candidates) {
      if (c.used) continue;
      // فرق تقريب بسيط مسموح، لا مطابقة اتجاه (كشف الطرف قد يكون بعكس اتجاهنا)
      if (Math.abs(c.amount - abs) > Math.max(0.5, abs * 0.001)) continue;
      let score = 10;
      const dd = daysBetween(date, c.date);
      if (dd === 0) score += 8;
      else if (dd <= 3) score += 6;
      else if (dd <= 7) score += 3;
      else if (dd <= 15) score += 1;
      else continue;
      if (ref && c.docNumber && (c.docNumber.includes(ref) || ref.includes(c.docNumber))) score += 6;
      if (bestScore < score) {
        bestScore = score;
        best = c;
      }
    }

    if (best && bestScore >= 13) {
      best.used = true;
      matched += 1;
      await db
        .update(auditStatementLines)
        .set({
          matchStatus: "matched",
          matchedDocType: best.docType,
          matchedDocNumber: best.docNumber,
          matchNote: `مطابقة تلقائية (درجة ${bestScore})`,
        })
        .where(eq(auditStatementLines.id, line.id));
    } else {
      await db
        .update(auditStatementLines)
        .set({ matchStatus: "unmatched", matchedDocType: null, matchedDocNumber: null, matchNote: null })
        .where(eq(auditStatementLines.id, line.id));
    }
  }

  const unmatched = lines.length - matched;
  const systemOnly = candidates.filter((c) => !c.used).length;
  const reconcileStatus = unmatched === 0 && systemOnly === 0 ? "reconciled" : "partial";

  await db
    .update(auditStatementUploads)
    .set({ matchedCount: matched, unmatchedCount: unmatched, systemOnlyCount: systemOnly, reconcileStatus })
    .where(eq(auditStatementUploads.id, importId));

  return { lineCount: lines.length, matchedCount: matched, unmatchedCount: unmatched, systemOnlyCount: systemOnly };
}

export async function getPartyStatementDetail(db: Db, tenantId: number, importId: number) {
  const [imp] = await db
    .select()
    .from(auditStatementUploads)
    .where(tenantWhere(auditStatementUploads, tenantId, eq(auditStatementUploads.id, importId)))
    .limit(1);
  if (!imp) throw new Error("الكشف غير موجود");
  const lines = await db
    .select()
    .from(auditStatementLines)
    .where(tenantWhere(auditStatementLines, tenantId, eq(auditStatementLines.importId, importId)))
    .orderBy(auditStatementLines.lineNo);
  return { import: imp, lines };
}

export async function auditUploadedPartyStatements(
  db: Db,
  tenantId: number,
  out: AuditFinding[],
  _materialityEgp: number,
) {
  const imports = await db
    .select()
    .from(auditStatementUploads)
    .where(
      tenantWhere(
        auditStatementUploads,
        tenantId,
        or(eq(auditStatementUploads.kind, "customer"), eq(auditStatementUploads.kind, "supplier")),
      ),
    )
    .orderBy(desc(auditStatementUploads.id))
    .limit(10);

  // كشوف اتحطت قبل ما ميزة المطابقة تتفعّل (partyName حر بدون customerId/supplierId) — تخطاها بدل ما نبلغ عنها غلط
  const partyImports = imports.filter((i) => i.customerId || i.supplierId);
  if (!partyImports.length) return;

  for (const imp of partyImports) {
    const kindLabel = imp.customerId ? "كشف عميل" : "كشف مورد";
    const link = imp.customerId
      ? `/contacts/statement?type=customer&id=${imp.customerId}`
      : `/contacts/statement?type=supplier&id=${imp.supplierId}`;
    const total = imp.matchedCount + imp.unmatchedCount;

    if (imp.unmatchedCount > 0) {
      push(out, {
        severity: imp.unmatchedCount >= 3 ? "warning" : "info",
        category: kindLabel,
        title: `أسطر غير مطابقة في كشف ${imp.partyName || ""}: ${imp.fileName}`,
        detail: `مطابق ${imp.matchedCount} من ${total} · غير مطابق ${imp.unmatchedCount} — حركات في كشف الطرف بمبلغ/تاريخ مالهاش نظير في دفاترنا.`,
        recommendation: "راجع الأسطر غير المطابقة: فاتورة أو سداد لسه متسجلش، أو فرق مبلغ/تاريخ يحتاج تصحيح.",
        link,
      });
    }
    if (imp.systemOnlyCount > 0) {
      push(out, {
        severity: "info",
        category: kindLabel,
        title: `حركات في دفاترنا غير ظاهرة في كشف ${imp.partyName || ""}`,
        detail: `${imp.systemOnlyCount} حركة (فاتورة/سداد/مردود) مسجّلة عندنا بلا مقابل في الكشف المرفوع — قد تكون لسه معلّقة عند الطرف الآخر أو محل خلاف.`,
        recommendation: "تأكد إن الطرف استلم وسجّل هذه الحركات، خصوصاً القريبة من نهاية الفترة.",
        link,
      });
    }
    if (imp.unmatchedCount === 0 && imp.systemOnlyCount === 0) {
      push(out, {
        severity: "info",
        category: kindLabel,
        title: `كشف مطابق بالكامل: ${imp.partyName || imp.fileName}`,
        detail: `كل حركات كشف ${imp.partyName || ""} (${total}) متطابقة مع دفاترنا.`,
        recommendation: "حافظ على تكرار هذه المطابقة دورياً.",
        link,
      });
    }
    if (n(imp.closingBalance) !== 0) {
      // ملاحظة: مقارنة رصيد الإقفال بدقة تحتاج معرفة اتجاه كشف الطرف (نحن مدينون/دائنون) —
      // نكتفي هنا بعرضه للمراجعة اليدوية بدل استنتاج فرق قد يكون معكوساً بالخطأ.
      push(out, {
        severity: "info",
        category: kindLabel,
        title: `رصيد إقفال مُدخل لكشف ${imp.partyName || ""}: ${money(n(imp.closingBalance))} ج`,
        detail: "قارنه يدوياً برصيد الطرف في شاشة كشف الحساب — فروق الاتجاه (مدين/دائن) بين كشفين من طرفين مختلفين شائعة وتحتاج تفسير بشري.",
        recommendation: "افتح كشف حساب الطرف وقارن الرصيد الختامي بنفس التاريخ.",
        link,
      });
    }
  }
}
