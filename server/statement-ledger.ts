export type LedgerRow = {
  date: string;
  docType: string;
  docNumber: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
};

type RawEntry = {
  date: string;
  docType: string;
  docNumber: string;
  description: string;
  debit: number;
  credit: number;
};

/** AR (customer): positive = العميل مدين لنا. AP (supplier): positive = نحن مدينون للمورد. */
export type LedgerMode = "ar" | "ap";

function parseAmount(v: unknown): number {
  const n = parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

/**
 * drizzle-orm بيرجّع عمود date() كـ JS Date object (مش نص) لأن أعمدة التاريخ في schema.ts
 * معرّفة من غير {mode:"string"}. String(dateObj) بينادي .toString() مش .toISOString() فبيطلع
 * "Sat Aug 01" (بلا سنة!) بدل "2026-08-01" — ده كان بيكسر مطابقة التواريخ في مطابقة الكشوف
 * (لو الطرفين بيتكسروا لنفس الشكل الغلط لتاريخ واحد بيتطابقوا بالصدفة، لكن أي فرق أيام حقيقي
 * أو حدود سنة بيتحسب غلط). لازم نتعامل مع الحالتين هنا.
 */
function dateKey(d: string | Date | null | undefined): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d || "").slice(0, 10);
}

function sortEntries(entries: RawEntry[]): RawEntry[] {
  return [...entries].sort((a, b) => {
    const d = String(a.date).localeCompare(String(b.date));
    if (d !== 0) return d;
    if (a.docType === "رصيد أول المدة" && b.docType !== "رصيد أول المدة") return -1;
    if (b.docType === "رصيد أول المدة" && a.docType !== "رصيد أول المدة") return 1;
    return a.docNumber.localeCompare(b.docNumber);
  });
}

function runningBalance(entries: RawEntry[], mode: LedgerMode): LedgerRow[] {
  let balance = 0;
  return sortEntries(entries).map((row) => {
    balance += mode === "ap" ? row.credit - row.debit : row.debit - row.credit;
    return { ...row, balance };
  });
}

/** أثر حركة واحدة على الرصيد حسب نوع الكشف */
export function entryImpact(entry: Pick<RawEntry, "debit" | "credit">, mode: LedgerMode): number {
  return mode === "ap" ? entry.credit - entry.debit : entry.debit - entry.credit;
}

export function openingLedgerEntry(
  opening: number,
  mode: LedgerMode,
  asOfDate = "0000-01-01",
): RawEntry | null {
  if (!opening || !Number.isFinite(opening)) return null;
  const date = dateKey(asOfDate) || "0000-01-01";
  const desc =
    date && !date.startsWith("0000")
      ? `رصيد افتتاحي بتاريخ ${date}`
      : "رصيد افتتاحي";
  if (mode === "ar") {
    return {
      date,
      docType: "رصيد أول المدة",
      docNumber: "—",
      description: desc,
      debit: opening > 0 ? opening : 0,
      credit: opening < 0 ? Math.abs(opening) : 0,
    };
  }
  return {
    date,
    docType: "رصيد أول المدة",
    docNumber: "—",
    description: desc,
    debit: opening < 0 ? Math.abs(opening) : 0,
    credit: opening > 0 ? opening : 0,
  };
}

/**
 * يبني الكشف مع دعم تاريخ الرصيد الافتتاحي + فلتر الفترة.
 * - الرصيد الافتتاحي يُسجَّل بتاريخه (openingBalanceDate)
 * - عند فلتر من تاريخ: يُحسب رصيد أول المدة للفترة من الافتتاحي (إن كان أقدم) + الحركات السابقة
 */
export function finalizeLedger(
  movements: RawEntry[],
  opts: {
    openingBalance?: number | string | null;
    openingBalanceDate?: string | Date | null;
    dateFrom?: string;
    dateTo?: string;
    mode: LedgerMode;
  },
): { ledger: LedgerRow[]; openingBalance: number; closingBalance: number; openingBalanceDate: string | null } {
  const masterOpening = parseAmount(opts.openingBalance);
  const openDateRaw = dateKey(opts.openingBalanceDate);
  const openDate = openDateRaw || "0000-01-01";
  const dateFrom = opts.dateFrom?.trim() || "";
  const dateTo = opts.dateTo?.trim() || "";

  let priorImpact = 0;
  const inPeriod: RawEntry[] = [];

  // الرصيد الافتتاحي كحركة بتاريخه
  if (masterOpening !== 0) {
    const openRow = openingLedgerEntry(masterOpening, opts.mode, openDate)!;
    if (dateFrom && openDate < dateFrom) {
      priorImpact += entryImpact(openRow, opts.mode);
    } else if ((!dateFrom || openDate >= dateFrom) && (!dateTo || openDate <= dateTo)) {
      inPeriod.push(openRow);
    }
  }

  for (const m of movements) {
    const d = dateKey(m.date);
    if (!d || d.startsWith("0000")) continue;
    if (dateFrom && d < dateFrom) {
      priorImpact += entryImpact(m, opts.mode);
      continue;
    }
    if (dateTo && d > dateTo) continue;
    inPeriod.push(m);
  }

  const entries: RawEntry[] = [];
  if (dateFrom) {
    const periodOpenRow = openingLedgerEntry(priorImpact, opts.mode, dateFrom);
    if (periodOpenRow) {
      periodOpenRow.description =
        priorImpact !== 0
          ? "رصيد أول المدة للفترة (افتتاحي + حركات سابقة)"
          : "رصيد أول المدة للفترة";
      entries.push(periodOpenRow);
    } else if (inPeriod.length > 0) {
      entries.push({
        date: dateFrom,
        docType: "رصيد أول المدة",
        docNumber: "—",
        description: "رصيد أول المدة للفترة",
        debit: 0,
        credit: 0,
      });
    }
  }

  entries.push(...inPeriod);
  const ledger = runningBalance(entries, opts.mode);
  const openingShown = dateFrom
    ? priorImpact
    : masterOpening;
  return {
    ledger,
    openingBalance: openingShown,
    closingBalance: ledger.length ? ledger[ledger.length - 1].balance : openingShown,
    openingBalanceDate: openDateRaw || null,
  };
}

export function buildCustomerMovements(data: {
  invoices: Array<{ number: string; date: string | Date | null; total: string | null }>;
  cashTransactions: Array<{ number: string; date: string | Date | null; type: string; amount: string | null; description?: string | null }>;
  bankTransactions: Array<{ number?: string | null; date: string | Date | null; type: string; amount: string | null; description?: string | null }>;
  returns: Array<{ number: string; date: string | Date | null; total: string | null; reason?: string | null }>;
}): RawEntry[] {
  const entries: RawEntry[] = [];

  for (const inv of data.invoices) {
    entries.push({
      date: dateKey(inv.date),
      docType: "فاتورة بيع",
      docNumber: inv.number,
      description: "فاتورة مبيعات",
      debit: parseAmount(inv.total),
      credit: 0,
    });
  }

  for (const tx of data.cashTransactions) {
    const amount = parseAmount(tx.amount);
    const isReceipt = tx.type === "receive_customer" || tx.type === "receive";
    const isCustomerRefund = tx.type === "pay_customer";
    entries.push({
      date: dateKey(tx.date),
      docType: "نقدية",
      docNumber: tx.number,
      description: tx.description || (isCustomerRefund ? "رد للعميل" : isReceipt ? "تحصيل" : "صرف"),
      debit: isReceipt ? 0 : amount,
      credit: isReceipt ? amount : 0,
    });
  }

  for (const tx of data.bankTransactions) {
    const amount = parseAmount(tx.amount);
    const isDeposit = tx.type === "deposit_customer" || tx.type === "deposit";
    const isCustomerRefund = tx.type === "withdraw_customer";
    entries.push({
      date: dateKey(tx.date),
      docType: "بنك",
      docNumber: tx.number || "—",
      description: tx.description || (isCustomerRefund ? "رد بنكي للعميل" : isDeposit ? "إيداع بنكي" : "سحب بنكي"),
      debit: isDeposit ? 0 : amount,
      credit: isDeposit ? amount : 0,
    });
  }

  for (const ret of data.returns) {
    entries.push({
      date: dateKey(ret.date),
      docType: "مردود بيع",
      docNumber: ret.number,
      description: ret.reason || "مردود مبيعات",
      debit: 0,
      credit: parseAmount(ret.total),
    });
  }

  return entries;
}

export function buildSupplierMovements(data: {
  invoices: Array<{ number: string; date: string | Date | null; total: string | null }>;
  cashTransactions: Array<{ number: string; date: string | Date | null; type: string; amount: string | null; description?: string | null }>;
  bankTransactions: Array<{ number?: string | null; date: string | Date | null; type: string; amount: string | null; description?: string | null }>;
  returns: Array<{ number: string; date: string | Date | null; total: string | null; reason?: string | null }>;
}): RawEntry[] {
  const entries: RawEntry[] = [];

  for (const inv of data.invoices) {
    entries.push({
      date: dateKey(inv.date),
      docType: "فاتورة شراء",
      docNumber: inv.number,
      description: "فاتورة مشتريات",
      debit: 0,
      credit: parseAmount(inv.total),
    });
  }

  for (const tx of data.cashTransactions) {
    const amount = parseAmount(tx.amount);
    const isPayment = tx.type === "pay_supplier" || tx.type === "pay";
    entries.push({
      date: dateKey(tx.date),
      docType: "نقدية",
      docNumber: tx.number,
      description: tx.description || (isPayment ? "سداد مورد" : "قبض"),
      debit: isPayment ? amount : 0,
      credit: isPayment ? 0 : amount,
    });
  }

  for (const tx of data.bankTransactions) {
    const amount = parseAmount(tx.amount);
    const isWithdraw = tx.type === "withdraw_supplier" || tx.type === "withdraw";
    entries.push({
      date: dateKey(tx.date),
      docType: "بنك",
      docNumber: tx.number || "—",
      description: tx.description || (isWithdraw ? "سداد بنكي" : "إيداع"),
      debit: isWithdraw ? amount : 0,
      credit: isWithdraw ? 0 : amount,
    });
  }

  for (const ret of data.returns) {
    entries.push({
      date: dateKey(ret.date),
      docType: "مردود شراء",
      docNumber: ret.number,
      description: ret.reason || "مردود مشتريات",
      debit: parseAmount(ret.total),
      credit: 0,
    });
  }

  return entries;
}

export function buildCustomerLedger(data: {
  invoices: Array<{ number: string; date: string | Date | null; total: string | null }>;
  cashTransactions: Array<{ number: string; date: string | Date | null; type: string; amount: string | null; description?: string | null }>;
  bankTransactions: Array<{ number?: string | null; date: string | Date | null; type: string; amount: string | null; description?: string | null }>;
  returns: Array<{ number: string; date: string | Date | null; total: string | null; reason?: string | null }>;
  openingBalance?: number | string | null;
  openingBalanceDate?: string | Date | null;
  dateFrom?: string;
  dateTo?: string;
}): LedgerRow[] {
  return finalizeLedger(buildCustomerMovements(data), {
    openingBalance: data.openingBalance,
    openingBalanceDate: data.openingBalanceDate,
    dateFrom: data.dateFrom,
    dateTo: data.dateTo,
    mode: "ar",
  }).ledger;
}

export function buildSupplierLedger(data: {
  invoices: Array<{ number: string; date: string | Date | null; total: string | null }>;
  cashTransactions: Array<{ number: string; date: string | Date | null; type: string; amount: string | null; description?: string | null }>;
  bankTransactions: Array<{ number?: string | null; date: string | Date | null; type: string; amount: string | null; description?: string | null }>;
  returns: Array<{ number: string; date: string | Date | null; total: string | null; reason?: string | null }>;
  openingBalance?: number | string | null;
  openingBalanceDate?: string | Date | null;
  dateFrom?: string;
  dateTo?: string;
}): LedgerRow[] {
  return finalizeLedger(buildSupplierMovements(data), {
    openingBalance: data.openingBalance,
    openingBalanceDate: data.openingBalanceDate,
    dateFrom: data.dateFrom,
    dateTo: data.dateTo,
    mode: "ap",
  }).ledger;
}
