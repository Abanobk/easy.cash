/** طباعة/تنزيل تقرير جدولي بترويسة الشركة — نفس أسلوب PrintInvoice بس لجدول تقرير بدل فاتورة واحدة. */
export type PrintReportColumn = { key: string; label: string };

export type PrintReportOptions = {
  title: string;
  dateFrom?: string;
  dateTo?: string;
  columns: PrintReportColumn[];
  rows: Record<string, unknown>[];
  totals?: Record<string, number> | null;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyTaxNumber?: string;
  companyLogo?: string | null;
};

function fmtCell(v: unknown) {
  if (typeof v === "number") {
    if (Number.isNaN(v)) return "";
    return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return v == null ? "" : String(v);
}

function fmtDate(d?: string) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-GB");
}

export type GroupedInvoiceLine = {
  name: string;
  unit: string;
  quantity: number;
  price: number;
  discount: number;
  tax: number;
  total: number;
};

export type GroupedInvoiceDoc = {
  serial: string;
  ref: string;
  date: string;
  party: string;
  subtotal: number;
  discount: number;
  tax: number;
  net: number;
  due: number;
  lines: GroupedInvoiceLine[];
};

export type PrintGroupedReportOptions = {
  title: string;
  partyLabel: string;
  dateFrom?: string;
  dateTo?: string;
  documents: GroupedInvoiceDoc[];
  summary: {
    netTotal: number;
    discount: number;
    tax: number;
    grossTotal: number;
    due: number;
    paid: number;
    documentsCount: number;
    quantityTotal: number;
  };
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyTaxNumber?: string;
  companyLogo?: string | null;
};

const n2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** طباعة تقرير مشتريات/مبيعات مفصّل — فاتورة برأسها ثم أسطرها، بنفس شكل تقرير ميجا كاش المطبوع. */
export function printGroupedInvoiceReport(opts: PrintGroupedReportOptions) {
  const {
    title, partyLabel, dateFrom, dateTo, documents, summary,
    companyName = "Easy Cash", companyAddress, companyPhone, companyTaxNumber, companyLogo,
  } = opts;

  const logoHtml = companyLogo
    ? `<img src="${companyLogo}" alt="logo" style="max-height:56px;max-width:110px;object-fit:contain;margin-bottom:6px" />`
    : "";

  const docsHtml = documents.map((d) => {
    const linesHtml = d.lines.map((l) => `
      <tr>
        <td>${l.name}</td>
        <td>${n2(l.price)}</td>
        <td>${n2(l.quantity)}</td>
        <td>${l.unit}</td>
        <td>${n2(l.total)}</td>
        <td>${l.discount ? n2(l.discount) : "0"}</td>
        <td>${l.tax ? n2(l.tax) : "0"}</td>
        <td>${n2(l.total - l.discount + l.tax)}</td>
      </tr>
    `).join("");
    const lineQty = d.lines.reduce((s, l) => s + l.quantity, 0);
    return `
      <div class="doc-block">
        <table class="doc-table">
          <thead>
            <tr class="doc-head">
              <th>مسلسل</th><th>رقم المرجع</th><th>التاريخ</th><th>${partyLabel}</th>
              <th>الاجمالى</th><th>الخصم</th><th>الضريبة</th><th>الصافى</th><th>المستحق سداده</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${d.serial}</td><td>${d.ref}</td><td>${fmtDate(d.date)}</td><td>${d.party}</td>
              <td>${n2(d.subtotal)}</td><td>${n2(d.discount)}</td><td>${n2(d.tax)}</td><td>${n2(d.net)}</td><td>${n2(d.due)}</td>
            </tr>
          </tbody>
        </table>
        <table class="lines-table">
          <thead>
            <tr>
              <th>الصنف</th><th>سعر الوحدة</th><th>الكمية</th><th>وحدة / تشغيلة</th>
              <th>الاجمالي</th><th>الخصم</th><th>الضريبة</th><th>الصافي</th>
            </tr>
          </thead>
          <tbody>
            ${linesHtml}
            <tr class="lines-subtotal">
              <td></td><td></td><td>${n2(lineQty)}</td><td></td>
              <td>${n2(d.subtotal)}</td><td>${n2(d.discount)}</td><td>${n2(d.tax)}</td><td>${n2(d.net)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }).join("");

  const printWindow = window.open("", "_blank", "width=1000,height=750");
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8" />
      <title>${title}</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Cairo', sans-serif; font-size: 11px; color: #1e293b; background: white; direction: rtl; }
        @page { size: A4; margin: 10mm; }
        .page { padding: 16px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 2px solid #a4741f; gap: 12px; }
        .company-info h1 { font-size: 16px; font-weight: 800; color: #12222c; margin-bottom: 4px; }
        .company-info p { font-size: 9.5px; color: #5a6b73; line-height: 1.5; }
        .report-title { text-align: left; }
        .report-title h2 { font-size: 14px; font-weight: 800; color: #12222c; margin-bottom: 4px; }
        .report-title p { font-size: 10px; color: #5a6b73; }
        h3.center-title { text-align: center; font-size: 18px; font-weight: 800; margin: 10px 0; color: #12222c; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
        .doc-table thead tr { background: #1b3a4b; color: white; }
        .doc-table th, .doc-table td { padding: 5px 6px; text-align: center; font-size: 9.5px; }
        .lines-table thead tr { background: #ece6d8; }
        .lines-table th { padding: 4px 6px; text-align: center; font-size: 9px; font-weight: 700; color: #1b3a4b; }
        .lines-table td { padding: 4px 6px; text-align: center; font-size: 9px; border-bottom: 1px solid #f3efe6; }
        .lines-subtotal td { font-weight: 800; border-top: 1px solid #a4741f; }
        .doc-block { break-inside: avoid; margin-bottom: 10px; border: 1px solid #ddd4bf; border-radius: 4px; overflow: hidden; }
        .summary-title { text-align: center; font-weight: 800; font-size: 13px; background: #1b3a4b; color: white; padding: 6px; margin-top: 16px; }
        .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid #ddd4bf; border-top: none; }
        .summary-cell { padding: 8px 10px; border: 1px solid #ece6d8; font-size: 10.5px; display: flex; justify-content: space-between; gap: 8px; }
        .summary-cell b { color: #12222c; }
        .footer { text-align: center; font-size: 9.5px; color: #94a3b8; padding-top: 10px; margin-top: 10px; border-top: 1px solid #e2e8f0; }
        @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="header">
          <div class="company-info">
            ${logoHtml}
            <h1>${companyName}</h1>
            ${companyAddress ? `<p>${companyAddress}</p>` : ""}
            ${companyPhone ? `<p>هاتف: ${companyPhone}</p>` : ""}
            ${companyTaxNumber ? `<p>الرقم الضريبي: ${companyTaxNumber}</p>` : ""}
          </div>
          <div class="report-title">
            ${dateFrom || dateTo ? `<p>من: ${fmtDate(dateFrom)}</p><p>إلى: ${fmtDate(dateTo)}</p>` : ""}
          </div>
        </div>
        <h3 class="center-title">${title}</h3>
        ${docsHtml}
        <div class="summary-title">إجمالي الكل</div>
        <div class="summary-grid">
          <div class="summary-cell"><span>اجمالي:</span><b>${n2(summary.grossTotal)}</b></div>
          <div class="summary-cell"><span>خصم:</span><b>${n2(summary.discount)}</b></div>
          <div class="summary-cell"><span>ضرائب:</span><b>${n2(summary.tax)}</b></div>
          <div class="summary-cell"><span>صافي:</span><b>${n2(summary.netTotal)}</b></div>
          <div class="summary-cell"><span>المستحق:</span><b>${n2(summary.due)}</b></div>
          <div class="summary-cell"><span>تم سداده:</span><b>${n2(summary.paid)}</b></div>
          <div class="summary-cell"><span>عدد المستندات:</span><b>${summary.documentsCount}</b></div>
          <div class="summary-cell"><span>اجمالي كميات:</span><b>${n2(summary.quantityTotal)}</b></div>
        </div>
        <div class="footer"><p>تم إنشاء هذا التقرير بواسطة نظام Easy Cash للمحاسبة والإدارة المتكاملة</p></div>
      </div>
      <script>window.onload = () => { window.print(); }</script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

/** تنسيق تاريخ عرض ميجا: DD/MM/YYYY */
function fmtDateMega(d?: string) {
  if (!d) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function escHtml(v: unknown) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CURRENCY_AR: Record<string, string> = {
  EGP: "جنيه مصري",
  USD: "دولار أمريكي",
  EUR: "يورو",
  SAR: "ريال سعودي",
  AED: "درهم إماراتي",
};

export type PrintAccountStatementOptions = {
  dateFrom?: string;
  dateTo?: string;
  accountLabel: string;
  currencyCode?: string;
  currencyLabel?: string;
  rows: Record<string, unknown>[];
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyMobile?: string;
  companyLogo?: string | null;
  printedBy?: string;
};

/**
 * طباعة/PDF كشف حساب — نفس أسلوب عرض ميجا (ترويسة شركة + عنوان الفترة/العملة + جدول الحركات).
 * المرجع: artifacts/mega-account-statement/كشف-حساب.pdf + لقطة العرض.
 */
export function printAccountStatementReport(opts: PrintAccountStatementOptions) {
  const {
    dateFrom,
    dateTo,
    accountLabel,
    currencyCode = "EGP",
    currencyLabel,
    rows,
    companyName = "Easy Cash",
    companyAddress,
    companyPhone,
    companyMobile,
    companyLogo,
    printedBy,
  } = opts;

  const currencyName = currencyLabel || CURRENCY_AR[currencyCode] || currencyCode || "جنيه مصري";
  const fromStr = fmtDateMega(dateFrom);
  const toStr = fmtDateMega(dateTo);
  // ميجا: «كشف حساب فى الفترة من … الى … بالعملة …»
  const title = `كشف حساب فى الفترة من ${fromStr || "—"} الى ${toStr || "—"} بالعملة ${currencyName}`;
  const metaLine = `من تاريخ: ${fromStr || "—"}    الى تاريخ: ${toStr || "—"}    اسم الحساب: ${accountLabel}`;
  const printedAt = new Date().toLocaleString("ar-EG", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const logoHtml = companyLogo
    ? `<img src="${escHtml(companyLogo)}" alt="logo" class="logo" />`
    : "";

  const columns: PrintReportColumn[] = [
    { key: "date", label: "التاريخ" },
    { key: "entryNumber", label: "رقم القيد" },
    { key: "documentNumber", label: "رقم المستند" },
    { key: "debit", label: "مدين" },
    { key: "credit", label: "دائن" },
    { key: "balance", label: "الرصيد" },
    { key: "exchangeRate", label: "سعر الصرف" },
    { key: "description", label: "الوصف" },
  ];

  const fmtAsCell = (key: string, v: unknown, isSpecial: boolean) => {
    if (key === "date" && typeof v === "string" && v) return escHtml(fmtDateMega(v));
    if (key === "description") {
      return escHtml(v == null ? "" : String(v)).replace(/\n/g, "<br/>");
    }
    if ((key === "debit" || key === "credit") && isSpecial && (v === 0 || v === "0")) return "";
    if (typeof v === "number") {
      if (Number.isNaN(v)) return "";
      if ((key === "debit" || key === "credit") && v === 0) return "";
      return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (v == null || v === "") return "";
    return escHtml(v);
  };

  const bodyRows = rows.map((r) => {
    const desc = String(r.description ?? "");
    const isOpening = desc === "رصيد سابق";
    const isTotal = desc === "اجمالي حركات الفترة";
    const cls = isOpening ? "row-opening" : isTotal ? "row-total" : "";
    const isSpecial = isOpening || isTotal;
    return `<tr class="${cls}">${columns
      .map((c) => {
        const align = ["debit", "credit", "balance", "exchangeRate"].includes(c.key)
          ? "num"
          : c.key === "description"
            ? "desc"
            : "center";
        return `<td class="${align}">${fmtAsCell(c.key, r[c.key], isSpecial)}</td>`;
      })
      .join("")}</tr>`;
  }).join("");

  const headRow = columns.map((c) => `<th>${c.label}</th>`).join("");

  const printWindow = window.open("", "_blank", "width=1100,height=800");
  if (!printWindow) {
    window.alert("المتصفح منع نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.");
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8" />
      <title>${escHtml(title)}</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" />
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Cairo', Tahoma, sans-serif; font-size: 11px; color: #111; background: #fff; direction: rtl; }
        @page { size: A4 landscape; margin: 8mm; }
        .page { padding: 12px 16px; }
        .print-meta { font-size: 9px; color: #555; margin-bottom: 8px; }
        .header {
          display: flex; justify-content: space-between; align-items: flex-start;
          gap: 16px; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #ccc;
        }
        .company-info { text-align: right; line-height: 1.55; }
        .company-info .name { font-size: 15px; font-weight: 800; color: #0f172a; margin-bottom: 2px; }
        .company-info .line { font-size: 10px; color: #334155; }
        .company-info .lbl { color: #64748b; margin-left: 4px; }
        .logo-wrap { text-align: left; min-width: 120px; }
        .logo { max-height: 64px; max-width: 140px; object-fit: contain; }
        .report-title { text-align: center; font-size: 15px; font-weight: 800; margin: 10px 0 6px; color: #0f172a; }
        .report-meta { text-align: center; font-size: 11px; color: #334155; margin-bottom: 10px; }
        .account-banner {
          border: 2px solid #111; padding: 5px 10px; font-weight: 700; font-size: 12px;
          margin-bottom: 0; background: #f8fafc;
        }
        table { width: 100%; border-collapse: collapse; border: 1px solid #333; }
        thead th {
          background: #f1f5f9; color: #0f172a; border: 1px solid #333;
          padding: 5px 6px; font-size: 10.5px; font-weight: 700; white-space: nowrap; text-align: center;
        }
        tbody td {
          border: 1px solid #94a3b8; padding: 4px 6px; font-size: 10px; vertical-align: top;
        }
        td.center { text-align: center; white-space: nowrap; }
        td.num { text-align: left; font-variant-numeric: tabular-nums; white-space: nowrap; direction: ltr; }
        td.desc { text-align: right; white-space: pre-wrap; max-width: 280px; line-height: 1.35; }
        tr.row-opening td, tr.row-total td { font-weight: 800; background: #f8fafc; }
        tr.row-total td { border-top: 2px solid #111; }
        .footer { text-align: center; font-size: 9px; color: #94a3b8; margin-top: 10px; padding-top: 6px; border-top: 1px solid #e2e8f0; }
        @media print {
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="print-meta">وقت الطباعة: ${escHtml(printedAt)}${printedBy ? `  -  بواسطة: ${escHtml(printedBy)}` : ""}</div>
        <div class="header">
          <div class="company-info">
            <div class="name">${escHtml(companyName)}</div>
            ${companyPhone ? `<div class="line"><span class="lbl">تليفون:</span>${escHtml(companyPhone)}</div>` : ""}
            ${companyMobile ? `<div class="line"><span class="lbl">موبايل:</span>${escHtml(companyMobile)}</div>` : ""}
            ${companyAddress ? `<div class="line"><span class="lbl">العنوان:</span>${escHtml(companyAddress)}</div>` : ""}
          </div>
          <div class="logo-wrap">${logoHtml}</div>
        </div>
        <div class="report-title">${escHtml(title)}</div>
        <div class="report-meta">${escHtml(metaLine)}</div>
        <div class="account-banner">${escHtml(accountLabel)}</div>
        <table>
          <thead><tr>${headRow}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
        <div class="footer"><p>تم إنشاء هذا التقرير بواسطة نظام Easy Cash للمحاسبة والإدارة المتكاملة</p></div>
      </div>
      <script>window.onload = () => { window.print(); }</script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

export function printTableReport(opts: PrintReportOptions) {
  const {
    title, dateFrom, dateTo, columns, rows, totals,
    companyName = "Easy Cash", companyAddress, companyPhone, companyTaxNumber, companyLogo,
  } = opts;

  const logoHtml = companyLogo
    ? `<img src="${companyLogo}" alt="logo" style="max-height:56px;max-width:110px;object-fit:contain;margin-bottom:6px" />`
    : "";

  const headRow = columns.map((c) => `<th>${c.label}</th>`).join("");
  const bodyRows = rows.map((r) => `<tr>${columns.map((c) => `<td>${fmtCell(r[c.key])}</td>`).join("")}</tr>`).join("");
  const totalsRow = totals
    ? `<tr class="totals-row">${columns.map((c, i) => {
        if (i === 0 && totals[c.key] == null) return `<td>الإجمالي (${rows.length})</td>`;
        return `<td>${totals[c.key] != null ? fmtCell(totals[c.key]) : ""}</td>`;
      }).join("")}</tr>`
    : "";

  const printWindow = window.open("", "_blank", "width=1000,height=750");
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8" />
      <title>${title}</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Cairo', sans-serif; font-size: 12px; color: #1e293b; background: white; direction: rtl; }
        @page { size: A4 landscape; margin: 10mm; }
        .page { padding: 16px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 2px solid #a4741f; gap: 12px; }
        .company-info h1 { font-size: 18px; font-weight: 800; color: #12222c; margin-bottom: 4px; }
        .company-info p { font-size: 10px; color: #5a6b73; line-height: 1.5; }
        .report-title { text-align: left; }
        .report-title h2 { font-size: 15px; font-weight: 800; color: #12222c; margin-bottom: 4px; }
        .report-title p { font-size: 10.5px; color: #5a6b73; }
        table { width: 100%; border-collapse: collapse; }
        thead tr { background: #1b3a4b; color: white; }
        thead th { padding: 6px 8px; text-align: start; font-size: 10.5px; white-space: nowrap; }
        tbody td { padding: 6px 8px; font-size: 10.5px; border-bottom: 1px solid #ece6d8; white-space: nowrap; }
        tbody tr:nth-child(even) { background: #faf8f3; }
        .totals-row td { font-weight: 800; background: #ece6d8 !important; border-top: 2px solid #a4741f; }
        .footer { text-align: center; font-size: 9.5px; color: #94a3b8; padding-top: 10px; margin-top: 10px; border-top: 1px solid #e2e8f0; }
        @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="header">
          <div class="company-info">
            ${logoHtml}
            <h1>${companyName}</h1>
            ${companyAddress ? `<p>${companyAddress}</p>` : ""}
            ${companyPhone ? `<p>هاتف: ${companyPhone}</p>` : ""}
            ${companyTaxNumber ? `<p>الرقم الضريبي: ${companyTaxNumber}</p>` : ""}
          </div>
          <div class="report-title">
            <h2>${title}</h2>
            ${dateFrom || dateTo ? `<p>من: ${fmtDate(dateFrom)} — إلى: ${fmtDate(dateTo)}</p>` : ""}
            <p>عدد السجلات: ${rows.length}</p>
          </div>
        </div>
        <table>
          <thead><tr>${headRow}</tr></thead>
          <tbody>${bodyRows}${totalsRow}</tbody>
        </table>
        <div class="footer"><p>تم إنشاء هذا التقرير بواسطة نظام Easy Cash للمحاسبة والإدارة المتكاملة</p></div>
      </div>
      <script>window.onload = () => { window.print(); }</script>
    </body>
    </html>
  `);
  printWindow.document.close();
}
