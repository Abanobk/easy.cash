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
