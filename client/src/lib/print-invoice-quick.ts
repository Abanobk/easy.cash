/** طباعة سريعة فور الحفظ/الاعتماد أو إذن مخزن مرافق — نفس أسلوب window.open + document.write المستخدم في print-report.ts */
export interface QuickInvoiceLine {
  name: string;
  quantity: number;
  unit?: string | null;
  warehouseName?: string | null;
  price?: number;
  total?: number;
}

export interface QuickInvoiceDoc {
  title: string;
  number: string;
  date: string;
  partyLabel: string;
  partyName: string;
  lines: QuickInvoiceLine[];
  subtotal?: number;
  discount?: number;
  tax?: number;
  total?: number;
  paymentType?: string;
  companyName?: string;
}

function n2(v: number | undefined) {
  return (v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function baseHtml(doc: QuickInvoiceDoc, colsHtml: string, rowsHtml: string, footerHtml: string) {
  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8" />
      <title>${doc.title} ${doc.number}</title>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" />
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Cairo', sans-serif; font-size: 12px; color: #1e293b; direction: rtl; padding: 16px; }
        @page { size: A4; margin: 12mm; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #1b3a4b; padding-bottom: 8px; margin-bottom: 10px; }
        .header h1 { font-size: 16px; font-weight: 800; }
        .meta { font-size: 11px; color: #475569; line-height: 1.8; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th { background: #1b3a4b; color: white; padding: 6px; font-size: 10.5px; }
        td { padding: 6px; border-bottom: 1px solid #eef2f6; font-size: 10.5px; text-align: center; }
        .footer { margin-top: 12px; display: flex; justify-content: flex-end; }
        .footer table { width: 260px; }
        .footer td { text-align: right; }
        @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div><h1>${doc.companyName || "Easy Cash"}</h1><div class="meta">${doc.title} رقم ${doc.number}</div></div>
        <div class="meta">
          <div>التاريخ: ${doc.date}</div>
          <div>${doc.partyLabel}: ${doc.partyName}</div>
          ${doc.paymentType ? `<div>نوع الدفع: ${doc.paymentType === "cash" ? "نقدي" : "آجل"}</div>` : ""}
        </div>
      </div>
      <table><thead><tr>${colsHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>
      ${footerHtml}
      <script>window.onload = () => { window.print(); }</script>
    </body>
    </html>
  `;
}

export function printInvoiceQuick(doc: QuickInvoiceDoc) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  const cols = `<th>الصنف</th><th>الكمية</th><th>الوحدة</th><th>السعر</th><th>الإجمالي</th>`;
  const rows = doc.lines.map((l) => `<tr><td>${l.name}</td><td>${l.quantity}</td><td>${l.unit || ""}</td><td>${n2(l.price)}</td><td>${n2(l.total)}</td></tr>`).join("");
  const footer = `
    <div class="footer"><table>
      <tr><td>المجموع الفرعي:</td><td>${n2(doc.subtotal)}</td></tr>
      <tr><td>الخصم:</td><td>${n2(doc.discount)}</td></tr>
      <tr><td>الضريبة:</td><td>${n2(doc.tax)}</td></tr>
      <tr><td><b>الإجمالي:</b></td><td><b>${n2(doc.total)}</b></td></tr>
    </table></div>`;
  win.document.write(baseHtml(doc, cols, rows, footer));
  win.document.close();
}

/** إذن استلام/صرف مخزن — بيانات الأصناف والكميات والمخازن فقط من غير أسعار، يتطبع مرفق مع الفاتورة */
export function printWarehouseNote(doc: QuickInvoiceDoc) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  const cols = `<th>الصنف</th><th>الكمية</th><th>الوحدة</th><th>المخزن</th>`;
  const rows = doc.lines.map((l) => `<tr><td>${l.name}</td><td>${l.quantity}</td><td>${l.unit || ""}</td><td>${l.warehouseName || ""}</td></tr>`).join("");
  win.document.write(baseHtml({ ...doc, title: "إذن مخزن" }, cols, rows, ""));
  win.document.close();
}
