import * as XLSX from "xlsx";

export type ParsedBankLine = {
  txnDate: string;
  valueDate?: string;
  description: string;
  reference?: string;
  debit: number;
  credit: number;
  balance?: number;
};

function n(v: unknown) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "")
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/,/g, "")
    .replace(/\s/g, "")
    .replace(/[^\d.-]/g, "")
    .trim();
  const x = Number(s);
  return Number.isFinite(x) ? x : 0;
}

/** يحوّل مبالغ بنكية شائعة: 1,234.56 أو 1.234,56 أو (1,234.56) */
export function parseMoneyToken(raw: string): number {
  let s = String(raw || "")
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/EGP|LE|ج\.?م\.?|جنيه|USD|\$/gi, "")
    .replace(/\s/g, "")
    .trim();
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s) || s.endsWith("-") || s.startsWith("-");
  s = s.replace(/[()]/g, "").replace(/-$/, "").replace(/^-/, "");
  if (/\d\.\d{3},\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/\d,\d{3}\.\d{1,2}$/.test(s) || /,/.test(s) && !/\.\d+$/.test(s)) {
    s = s.replace(/,/g, "");
  } else {
    s = s.replace(/,/g, "");
  }
  const x = Number(s);
  if (!Number.isFinite(x)) return 0;
  return neg ? -Math.abs(x) : x;
}

export function asDate(v: unknown): string | null {
  if (!v && v !== 0) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && XLSX.SSF?.parse_date_code) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) {
      const mm = String(d.m).padStart(2, "0");
      const dd = String(d.d).padStart(2, "0");
      return `${d.y}-${mm}-${dd}`;
    }
  }
  const s = String(v)
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let a = Number(m[1]);
    let b = Number(m[2]);
    let year = m[3];
    if (year.length === 2) year = `20${year}`;
    // Egyptian banks usually DD/MM/YYYY; if first > 12 treat as day
    let day: number;
    let month: number;
    if (a > 12) {
      day = a;
      month = b;
    } else if (b > 12) {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

function normHeader(h: unknown) {
  return String(h || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function pickCol(headers: string[], candidates: string[]) {
  for (const c of candidates) {
    const i = headers.findIndex((h) => h.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

const DATE_RE = /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2})/;
const MONEY_RE = /\(?-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?\)?-?|\(?-?\d+[.,]\d{1,2}\)?-?/g;

function classifyDebitCredit(amount: number, hint: string): { debit: number; credit: number } {
  const h = hint.toLowerCase();
  const abs = Math.abs(amount);
  if (amount < 0 || /debit|مدين|سحب|withdraw|dr\b|outgoing|خصم|مدفوع/.test(h)) {
    return { debit: abs, credit: 0 };
  }
  if (/credit|دائن|ايداع|إيداع|deposit|cr\b|incoming|تحصيل|وارد/.test(h)) {
    return { debit: 0, credit: abs };
  }
  // default: positive = credit (deposit), negative handled above
  return { debit: 0, credit: abs };
}

/**
 * يحوّل نص كشف بنك (من PDF أو TXT) إلى أسطر حركات.
 * يتعامل مع أنماط البنوك المصرية الشائعة: تاريخ + بيان + مبلغ/مبلغين + رصيد.
 */
export function parseBankStatementText(text: string): ParsedBankLine[] {
  const cleaned = text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!cleaned) return [];

  const lines = cleaned.split("\n").map((l) => l.trim()).filter(Boolean);
  const out: ParsedBankLine[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length < 8) continue;
    if (/^(statement|account|page|صفحة|كشف|رصيد أول|opening|closing|إجمالي|total|iban|swift)/i.test(line)) {
      continue;
    }

    const dateMatch = line.match(DATE_RE);
    if (!dateMatch) continue;
    const txnDate = asDate(dateMatch[1]);
    if (!txnDate) continue;

    const moneyMatches = [...line.matchAll(MONEY_RE)]
      .map((m) => ({ raw: m[0], value: parseMoneyToken(m[0]), index: m.index ?? 0 }))
      .filter((m) => Math.abs(m.value) > 0 || m.raw.includes("0"));

    // drop the date tokens that look like money (rare) — keep amounts after date
    const afterDate = moneyMatches.filter((m) => m.index > (dateMatch.index || 0) + dateMatch[0].length - 1);
    const amounts = (afterDate.length ? afterDate : moneyMatches).filter((m) => {
      // ignore year-like 2024 alone
      const abs = Math.abs(m.value);
      return abs !== Number(txnDate.slice(0, 4)) && !(abs >= 1900 && abs <= 2100 && Number.isInteger(abs));
    });

    if (!amounts.length) {
      // maybe amounts on next line
      const next = lines[i + 1] || "";
      const nextMoney = [...next.matchAll(MONEY_RE)].map((m) => parseMoneyToken(m[0])).filter((v) => v !== 0);
      if (!nextMoney.length) continue;
      amounts.push(...nextMoney.map((value, idx) => ({ raw: String(value), value, index: idx })));
    }

    let debit = 0;
    let credit = 0;
    let balance: number | undefined;

    if (amounts.length >= 3) {
      // debit, credit, balance — or amount, balance with empty column
      const a = amounts[amounts.length - 3].value;
      const b = amounts[amounts.length - 2].value;
      const c = amounts[amounts.length - 1].value;
      if (a !== 0 && b === 0) {
        ({ debit, credit } = classifyDebitCredit(a, line));
        balance = c;
      } else if (b !== 0 && a === 0) {
        ({ debit, credit } = classifyDebitCredit(b, line));
        balance = c;
      } else if (a !== 0 && b !== 0) {
        debit = Math.abs(a);
        credit = Math.abs(b);
        balance = c;
      } else {
        ({ debit, credit } = classifyDebitCredit(c, line));
      }
    } else if (amounts.length === 2) {
      const a = amounts[0].value;
      const b = amounts[1].value;
      ({ debit, credit } = classifyDebitCredit(a, line));
      balance = b;
    } else {
      ({ debit, credit } = classifyDebitCredit(amounts[0].value, line));
    }

    if (!debit && !credit) continue;

    let description = line
      .replace(DATE_RE, " ")
      .replace(MONEY_RE, " ")
      .replace(/\b(DR|CR|مدين|دائن)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (description.length < 2 && lines[i + 1] && !DATE_RE.test(lines[i + 1])) {
      description = lines[i + 1].replace(MONEY_RE, " ").replace(/\s+/g, " ").trim();
    }
    if (!description) description = "—";

    const refMatch = line.match(/(?:ref|مرجع|cheque|شيك|trn)[:\s#-]*([A-Za-z0-9\-\/]+)/i);
    const key = `${txnDate}|${debit}|${credit}|${description.slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      txnDate,
      description: description.slice(0, 500),
      reference: refMatch?.[1],
      debit,
      credit,
      balance,
    });
  }

  return out;
}

async function extractPdfText(buf: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const result = await extractText(pdf, { mergePages: true });
  return String(result.text || "").trim();
}

async function parseBankTextWithAi(text: string): Promise<ParsedBankLine[]> {
  try {
    const { ollamaChat } = await import("./ollama");
    const raw = await ollamaChat(
      [
        {
          role: "system",
          content: `أنت محلل كشوف حساب بنكية. استخرج الحركات من النص وأرجع JSON فقط (مصفوفة) بدون markdown.
كل عنصر: {"txnDate":"YYYY-MM-DD","description":"...","debit":0,"credit":0,"balance":null,"reference":null}
- debit = سحب/مدين، credit = إيداع/دائن (أرقام موجبة).
- تجاهل العناوين والرصيد الافتتاحي/الختامي إن لم يكن حركة.
- أقصى 400 حركة.`,
        },
        { role: "user", content: text.slice(0, 28000) },
      ],
      { temperature: 0, numPredict: 10000, tier: "heavy" },
    );
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const arr = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((row) => {
        const txnDate = asDate(row.txnDate);
        if (!txnDate) return null;
        let debit = Math.abs(n(row.debit));
        let credit = Math.abs(n(row.credit));
        if (!debit && !credit) {
          const amt = n(row.amount);
          if (!amt) return null;
          ({ debit, credit } = classifyDebitCredit(amt, String(row.type || row.description || "")));
        }
        if (!debit && !credit) return null;
        return {
          txnDate,
          description: String(row.description || "—").slice(0, 500),
          reference: row.reference ? String(row.reference) : undefined,
          debit,
          credit,
          balance: row.balance != null && row.balance !== "" ? n(row.balance) : undefined,
        } satisfies ParsedBankLine;
      })
      .filter((x): x is ParsedBankLine => !!x);
  } catch {
    return [];
  }
}

function parseSpreadsheet(buf: Buffer): ParsedBankLine[] {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as unknown[][];
  if (!rows.length) return [];

  let headerIdx = 0;
  let headers = rows[0].map(normHeader);
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const h = rows[i].map(normHeader);
    const score =
      (pickCol(h, ["date", "تاريخ", "txn"]) >= 0 ? 2 : 0) +
      (pickCol(h, ["debit", "مدين", "سحب", "withdraw"]) >= 0 ? 2 : 0) +
      (pickCol(h, ["credit", "دائن", "ايداع", "إيداع", "deposit"]) >= 0 ? 2 : 0) +
      (pickCol(h, ["desc", "بيان", "وصف", "narration", "particular"]) >= 0 ? 1 : 0) +
      (pickCol(h, ["amount", "مبلغ", "قيمة"]) >= 0 ? 1 : 0);
    if (score >= 4) {
      headerIdx = i;
      headers = h;
      break;
    }
  }

  const dateI = pickCol(headers, ["date", "تاريخ", "txn date", "value date", "تاريخ الحركة"]);
  const valueI = pickCol(headers, ["value date", "تاريخ القيمة"]);
  const descI = pickCol(headers, ["desc", "بيان", "وصف", "narration", "particular", "details", "البيان"]);
  const refI = pickCol(headers, ["ref", "مرجع", "reference", "رقم العملية", "cheque", "شيك"]);
  const debitI = pickCol(headers, ["debit", "مدين", "سحب", "withdraw", "outgoing"]);
  const creditI = pickCol(headers, ["credit", "دائن", "ايداع", "إيداع", "deposit", "incoming"]);
  const amountI = pickCol(headers, ["amount", "مبلغ", "قيمة"]);
  const balI = pickCol(headers, ["balance", "رصيد"]);
  const typeI = pickCol(headers, ["type", "نوع", "dr/cr", "دائن/مدين"]);

  const out: ParsedBankLine[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => String(c).trim() === "")) continue;
    const txnDate = asDate(dateI >= 0 ? row[dateI] : row[0]);
    if (!txnDate) continue;

    let debit = debitI >= 0 ? n(row[debitI]) : 0;
    let credit = creditI >= 0 ? n(row[creditI]) : 0;
    if (!debit && !credit && amountI >= 0) {
      const amt = n(row[amountI]);
      const typ = typeI >= 0 ? String(row[typeI]).toLowerCase() : "";
      if (amt < 0 || /debit|مدين|سحب|dr/.test(typ)) debit = Math.abs(amt);
      else credit = Math.abs(amt);
    }
    if (!debit && !credit) continue;

    out.push({
      txnDate,
      valueDate: valueI >= 0 ? asDate(row[valueI]) || undefined : undefined,
      description: String(descI >= 0 ? row[descI] : "").trim() || "—",
      reference: refI >= 0 ? String(row[refI] || "").trim() || undefined : undefined,
      debit,
      credit,
      balance: balI >= 0 ? n(row[balI]) : undefined,
    });
  }
  return out;
}

function extOf(fileName: string) {
  const m = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m?.[1] || "";
}

function looksLikePdf(buf: Buffer, fileName: string) {
  if (extOf(fileName) === "pdf") return true;
  return buf.slice(0, 5).toString("utf8") === "%PDF-";
}

/** يقرأ PDF أو CSV/Excel (base64) ويحاول اكتشاف أسطر الحركات */
export async function parseBankStatementFile(opts: {
  fileName: string;
  contentBase64: string;
  allowAiFallback?: boolean;
}): Promise<ParsedBankLine[]> {
  const buf = Buffer.from(opts.contentBase64.replace(/^data:[^;]+;base64,/, ""), "base64");
  if (!buf.length) return [];

  if (looksLikePdf(buf, opts.fileName)) {
    let text = "";
    try {
      text = await extractPdfText(buf);
    } catch (e: unknown) {
      throw new Error(`تعذر قراءة ملف PDF: ${e instanceof Error ? e.message : "خطأ غير معروف"}`);
    }
    if (!text || text.replace(/\s/g, "").length < 20) {
      throw new Error(
        "ملف PDF بدون نص قابل للقراءة (غالباً صورة ممسوحة). صدّر الكشف من البنك الإلكتروني كـ PDF نصي أو Excel، أو أعد رفع ملف أوضح.",
      );
    }

    let lines = parseBankStatementText(text);
    if (lines.length < 2 && opts.allowAiFallback !== false) {
      const aiLines = await parseBankTextWithAi(text);
      if (aiLines.length > lines.length) lines = aiLines;
    }
    return lines;
  }

  if (extOf(opts.fileName) === "txt" || extOf(opts.fileName) === "text") {
    return parseBankStatementText(buf.toString("utf8"));
  }

  return parseSpreadsheet(buf);
}

export function daysBetween(a: string, b: string) {
  const da = new Date(a);
  const db = new Date(b);
  return Math.abs(Math.round((da.getTime() - db.getTime()) / 86400000));
}
