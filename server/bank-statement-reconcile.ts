/**
 * مطابقة كشف البنك المرفوع مع حركات البرنامج + كشوف عامة للمراجع.
 */
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "./db";
import {
  auditFindingClosures,
  auditStatementUploads,
  bankAccounts,
  bankStatementImports,
  bankStatementLines,
  bankTransactions,
} from "../drizzle/schema";
import type { AuditFinding } from "./accounting-auditor";
import { daysBetween, parseBankStatementFile, type ParsedBankLine } from "./bank-statement-parse";
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

function findingKey(title: string, category?: string) {
  return `${category || ""}::${title}`.slice(0, 180);
}

export async function importBankStatement(
  db: Db,
  tenantId: number,
  input: {
    bankAccountId: number;
    fileName: string;
    contentBase64: string;
    openingBalance?: number;
    closingBalance?: number;
    notes?: string;
    createdBy?: number;
  },
) {
  const [bank] = await db
    .select()
    .from(bankAccounts)
    .where(tenantWhere(bankAccounts, tenantId, eq(bankAccounts.id, input.bankAccountId)))
    .limit(1);
  if (!bank) throw new Error("حساب البنك غير موجود");

  const lines = await parseBankStatementFile({
    fileName: input.fileName,
    contentBase64: input.contentBase64,
  });
  if (!lines.length) {
    throw new Error(
      "لم يتم التعرف على أسطر في الملف — للـ PDF تأكد أنه نصي (مش صورة)، وللـ Excel تأكد من وجود تاريخ ومبلغ/مدين/دائن",
    );
  }

  const dates = lines.map((l) => l.txnDate).sort();
  const periodFrom = dates[0];
  const periodTo = dates[dates.length - 1];

  const [insertResult] = await db.insert(bankStatementImports).values({
    tenantId,
    bankAccountId: input.bankAccountId,
    fileName: input.fileName.slice(0, 255),
    periodFrom: periodFrom as any,
    periodTo: periodTo as any,
    openingBalance: String(input.openingBalance ?? 0),
    closingBalance: String(input.closingBalance ?? 0),
    lineCount: lines.length,
    matchedCount: 0,
    unmatchedCount: lines.length,
    status: "imported",
    notes: input.notes || null,
    createdBy: input.createdBy || null,
  });
  const importId = Number((insertResult as { insertId?: number }).insertId ?? 0);
  if (!importId) throw new Error("فشل حفظ رأس الكشف");

  await db.insert(bankStatementLines).values(
    lines.map((l, i) => ({
      tenantId,
      importId,
      lineNo: i + 1,
      txnDate: l.txnDate as any,
      valueDate: (l.valueDate || null) as any,
      description: l.description,
      reference: l.reference || null,
      debit: String(l.debit),
      credit: String(l.credit),
      balance: l.balance != null ? String(l.balance) : null,
      matchStatus: "unmatched",
    })),
  );

  const match = await reconcileBankStatementImport(db, tenantId, importId);
  return { importId, ...match, periodFrom, periodTo, bankName: bank.name };
}

export async function reconcileBankStatementImport(
  db: Db,
  tenantId: number,
  importId: number,
) {
  const [imp] = await db
    .select()
    .from(bankStatementImports)
    .where(tenantWhere(bankStatementImports, tenantId, eq(bankStatementImports.id, importId)))
    .limit(1);
  if (!imp) throw new Error("الكشف غير موجود");

  const lines = await db
    .select()
    .from(bankStatementLines)
    .where(tenantWhere(bankStatementLines, tenantId, eq(bankStatementLines.importId, importId)));

  const from = String(imp.periodFrom || "").slice(0, 10);
  const to = String(imp.periodTo || "").slice(0, 10);
  const txns = await db
    .select()
    .from(bankTransactions)
    .where(
      tenantWhere(
        bankTransactions,
        tenantId,
        and(
          eq(bankTransactions.bankAccountId, imp.bankAccountId),
          from ? gte(bankTransactions.date, from as any) : undefined,
          to ? lte(bankTransactions.date, to as any) : undefined,
        ),
      ),
    );

  type Cand = { id: number; date: string; amount: number; signed: number; ref: string; desc: string; used?: boolean };
  const candidates: Cand[] = txns.map((t) => {
    const amount = n(t.amount);
    const isIn = t.type === "deposit" || t.type === "deposit_customer";
    return {
      id: t.id,
      date: String(t.date).slice(0, 10),
      amount,
      signed: isIn ? amount : -amount,
      ref: String(t.reference || t.number || ""),
      desc: String(t.description || ""),
    };
  });

  let matched = 0;
  for (const line of lines) {
    const debit = n(line.debit);
    const credit = n(line.credit);
    const signed = credit > 0 ? credit : -debit;
    const abs = Math.abs(signed);
    const date = String(line.txnDate).slice(0, 10);
    const ref = String(line.reference || "").trim();

    let best: Cand | null = null;
    let bestScore = 0;
    for (const c of candidates) {
      if (c.used) continue;
      if (Math.abs(c.amount - abs) > 0.05) continue;
      // same direction
      if ((signed > 0 && c.signed < 0) || (signed < 0 && c.signed > 0)) continue;
      let score = 10;
      const dd = daysBetween(date, c.date);
      if (dd === 0) score += 8;
      else if (dd <= 2) score += 5;
      else if (dd <= 5) score += 2;
      else continue;
      if (ref && c.ref && (c.ref.includes(ref) || ref.includes(c.ref))) score += 6;
      if (bestScore < score) {
        bestScore = score;
        best = c;
      }
    }

    if (best && bestScore >= 15) {
      best.used = true;
      matched += 1;
      await db
        .update(bankStatementLines)
        .set({
          matchStatus: "matched",
          matchedBankTxnId: best.id,
          matchNote: `مطابقة تلقائية (درجة ${bestScore})`,
        })
        .where(eq(bankStatementLines.id, line.id));
    } else {
      await db
        .update(bankStatementLines)
        .set({
          matchStatus: "unmatched",
          matchedBankTxnId: null,
          matchNote: null,
        })
        .where(eq(bankStatementLines.id, line.id));
    }
  }

  const unmatched = lines.length - matched;
  const systemOnly = candidates.filter((c) => !c.used).length;
  await db
    .update(bankStatementImports)
    .set({
      matchedCount: matched,
      unmatchedCount: unmatched,
      status: unmatched === 0 ? "reconciled" : "partial",
    })
    .where(eq(bankStatementImports.id, importId));

  return {
    lineCount: lines.length,
    matchedCount: matched,
    unmatchedCount: unmatched,
    systemOnlyCount: systemOnly,
  };
}

export async function auditUploadedBankStatements(
  db: Db,
  tenantId: number,
  out: AuditFinding[],
  materialityEgp: number,
) {
  const imports = await db
    .select()
    .from(bankStatementImports)
    .where(tenantWhere(bankStatementImports, tenantId))
    .orderBy(desc(bankStatementImports.id))
    .limit(5);

  if (!imports.length) {
    push(out, {
      severity: "info",
      category: "كشف بنك",
      title: "لا يوجد كشف بنك مرفوع للمطابقة",
      detail: "ارفع كشف الحساب البنكي (Excel/CSV) من شاشة المراجع لمطابقة الحركات مع البرنامج.",
      recommendation: "من تبويب الكشوف: اختر البنك وارفع الملف ثم أعد المراجعة.",
      link: "/accounting-auditor",
    });
    return;
  }

  for (const imp of imports) {
    if (n(imp.unmatchedCount) > 0) {
      push(out, {
        severity: n(imp.unmatchedCount) >= 5 || n(imp.unmatchedCount) * 1 >= 1 ? "warning" : "info",
        category: "كشف بنك",
        title: `أسطر غير مطابقة في كشف: ${imp.fileName}`,
        detail: `مطابق ${imp.matchedCount} / ${imp.lineCount} · غير مطابق ${imp.unmatchedCount} · الحالة ${imp.status}.`,
        recommendation: "راجع الأسطر غير المطابقة: إما حركة ناقصة في البرنامج أو في الكشف أو تاريخ/مرجع مختلف.",
        link: "/accounting-auditor",
      });
    } else {
      push(out, {
        severity: "info",
        category: "كشف بنك",
        title: `كشف مطابق بالكامل: ${imp.fileName}`,
        detail: `${imp.lineCount} سطر تم مطابقتها مع حركات البرنامج.`,
        recommendation: "حافظ على رفع الكشف شهرياً ضمن روتين الإقفال.",
        link: "/accounting-auditor",
      });
    }

    // closing balance vs last line balance if provided
    if (n(imp.closingBalance) > 0) {
      const [last] = await db
        .select()
        .from(bankStatementLines)
        .where(tenantWhere(bankStatementLines, tenantId, eq(bankStatementLines.importId, imp.id)))
        .orderBy(desc(bankStatementLines.lineNo))
        .limit(1);
      if (last?.balance != null && Math.abs(n(last.balance) - n(imp.closingBalance)) > Math.max(1, materialityEgp * 0.01)) {
        push(out, {
          severity: "warning",
          category: "كشف بنك",
          title: `فرق رصيد إقفال الكشف: ${imp.fileName}`,
          detail: `رصيد آخر سطر ${money(n(last.balance))} ≠ رصيد إقفال مدخل ${money(n(imp.closingBalance))}.`,
          recommendation: "تحقق من ترتيب الأسطر أو رصيد أول المدة المدخل.",
          link: "/accounting-auditor",
        });
      }
    }
  }
}

export async function saveGenericStatementUpload(
  db: Db,
  tenantId: number,
  input: {
    kind: string;
    title: string;
    fileName: string;
    partyName?: string;
    periodFrom?: string;
    periodTo?: string;
    contentBase64?: string;
    textContent?: string;
    createdBy?: number;
  },
) {
  let rawText = input.textContent || "";
  let summary: Record<string, unknown> = { kind: input.kind };

  if (input.contentBase64) {
    try {
      const lines = await parseBankStatementFile({
        fileName: input.fileName,
        contentBase64: input.contentBase64,
        allowAiFallback: false,
      });
      if (lines.length) {
        const debit = lines.reduce((s, l) => s + l.debit, 0);
        const credit = lines.reduce((s, l) => s + l.credit, 0);
        summary = {
          kind: input.kind,
          parsedLines: lines.length,
          totalDebit: debit,
          totalCredit: credit,
          net: credit - debit,
          sample: lines.slice(0, 5),
        };
        rawText = lines
          .slice(0, 200)
          .map((l) => `${l.txnDate}\t${l.description}\tD:${l.debit}\tC:${l.credit}`)
          .join("\n");
      }
    } catch {
      // keep text only
    }
  }

  const [result] = await db.insert(auditStatementUploads).values({
    tenantId,
    kind: input.kind.slice(0, 40),
    title: input.title.slice(0, 255),
    fileName: input.fileName.slice(0, 255),
    partyName: input.partyName || null,
    periodFrom: (input.periodFrom || null) as any,
    periodTo: (input.periodTo || null) as any,
    rawText: rawText.slice(0, 500000) || null,
    summaryJson: JSON.stringify(summary),
    createdBy: input.createdBy || null,
  });

  return {
    id: Number((result as { insertId?: number }).insertId ?? 0),
    summary,
  };
}

export async function listStatementUploads(db: Db, tenantId: number) {
  const banks = await db
    .select()
    .from(bankStatementImports)
    .where(tenantWhere(bankStatementImports, tenantId))
    .orderBy(desc(bankStatementImports.id))
    .limit(20);
  const others = await db
    .select()
    .from(auditStatementUploads)
    .where(tenantWhere(auditStatementUploads, tenantId))
    .orderBy(desc(auditStatementUploads.id))
    .limit(30);
  return { banks, others };
}

export async function getBankStatementDetail(db: Db, tenantId: number, importId: number) {
  const [imp] = await db
    .select()
    .from(bankStatementImports)
    .where(tenantWhere(bankStatementImports, tenantId, eq(bankStatementImports.id, importId)))
    .limit(1);
  if (!imp) throw new Error("الكشف غير موجود");
  const lines = await db
    .select()
    .from(bankStatementLines)
    .where(tenantWhere(bankStatementLines, tenantId, eq(bankStatementLines.importId, importId)))
    .orderBy(bankStatementLines.lineNo);
  return { import: imp, lines };
}

export async function upsertFindingClosure(
  db: Db,
  tenantId: number,
  input: {
    findingTitle: string;
    category?: string;
    severity?: string;
    status: "open" | "closed" | "accepted_risk";
    resolutionNote?: string;
    closedBy?: number;
  },
) {
  const key = findingKey(input.findingTitle, input.category);
  const [existing] = await db
    .select()
    .from(auditFindingClosures)
    .where(tenantWhere(auditFindingClosures, tenantId, eq(auditFindingClosures.findingKey, key)))
    .limit(1);

  const payload = {
    findingKey: key,
    findingTitle: input.findingTitle.slice(0, 500),
    category: input.category || null,
    severity: input.severity || null,
    status: input.status,
    resolutionNote: input.resolutionNote || null,
    closedAt: input.status === "open" ? null : new Date(),
    closedBy: input.status === "open" ? null : input.closedBy || null,
  };

  if (existing) {
    await db.update(auditFindingClosures).set(payload).where(eq(auditFindingClosures.id, existing.id));
    return { id: existing.id, ...payload };
  }
  const [result] = await db.insert(auditFindingClosures).values({ ...payload, tenantId });
  return { id: Number((result as { insertId?: number }).insertId ?? 0), ...payload };
}

export async function listFindingClosures(db: Db, tenantId: number) {
  return db
    .select()
    .from(auditFindingClosures)
    .where(tenantWhere(auditFindingClosures, tenantId))
    .orderBy(desc(auditFindingClosures.updatedAt))
    .limit(200);
}

export async function applyClosureStatusToFindings(
  db: Db,
  tenantId: number,
  findings: AuditFinding[],
) {
  try {
    const closures = await listFindingClosures(db, tenantId);
    const map = new Map(closures.map((c) => [c.findingKey, c]));
    return findings.map((f) => {
      const key = findingKey(f.title, f.category);
      const c = map.get(key);
      if (!c) return { ...f, closureStatus: "open" as const };
      return {
        ...f,
        closureStatus: c.status as "open" | "closed" | "accepted_risk",
        closureNote: c.resolutionNote || undefined,
      };
    });
  } catch {
    return findings.map((f) => ({ ...f, closureStatus: "open" as const }));
  }
}

export type ParsedBankLineExport = ParsedBankLine;
