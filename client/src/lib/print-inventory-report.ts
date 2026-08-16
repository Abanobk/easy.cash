/** طباعة تقارير المخازن بجداول واضحة للمراجع */

export type PrintInventoryColumn = {
  key: string;
  label: string;
  align?: "right" | "left" | "center";
  /** عرض تقريبي للعمود (مثلاً 12% أو 3cm) */
  width?: string;
  /** خلية فارغة للكتابة اليدوية عند الجرد */
  blank?: boolean;
};

export type PrintInventoryRow = Record<string, string | number | null | undefined>;

function esc(v: unknown) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cellText(value: string | number | null | undefined) {
  if (value == null || value === "") return "—";
  return esc(value);
}

export function printInventoryReport(input: {
  title: string;
  companyName?: string;
  subtitle?: string;
  filters?: string[];
  columns: PrintInventoryColumn[];
  rows: PrintInventoryRow[];
  /** صف إجمالي اختياري: قيم بنفس مفاتيح الأعمدة */
  totals?: PrintInventoryRow | null;
  /** landscape لتقارير الأعمدة الكثيرة مثل الجرد */
  landscape?: boolean;
}) {
  const printedAt = new Date().toLocaleString("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const filtersHtml = (input.filters || [])
    .filter(Boolean)
    .map((f) => `<span class="chip">${esc(f)}</span>`)
    .join("");

  const headCells = input.columns
    .map(
      (c) =>
        `<th style="${c.width ? `width:${c.width};` : ""}${c.align === "center" ? "text-align:center;" : ""}">${esc(c.label)}</th>`
    )
    .join("");

  const bodyRows = input.rows
    .map((row, i) => {
      const tds = input.columns
        .map((c) => {
          if (c.blank) {
            return `<td class="blank" style="${c.align === "center" ? "text-align:center;" : ""}">&nbsp;</td>`;
          }
          const raw = row[c.key];
          const align =
            c.align === "center" ? "center" : typeof raw === "number" || /^-?[\d.,]+$/.test(String(raw ?? "")) ? "left" : "right";
          return `<td style="text-align:${align}">${cellText(raw)}</td>`;
        })
        .join("");
      return `<tr class="${i % 2 === 0 ? "even" : "odd"}"><td class="idx">${i + 1}</td>${tds}</tr>`;
    })
    .join("");

  const totalsRow = input.totals
    ? `<tr class="totals"><td class="idx"></td>${input.columns
        .map((c) => {
          if (c.blank) return `<td class="blank"></td>`;
          const v = input.totals![c.key];
          if (v == null || v === "") return `<td></td>`;
          return `<td style="text-align:left">${cellText(v)}</td>`;
        })
        .join("")}</tr>`
    : "";

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8" />
<title>${esc(input.title)} — Easy Cash</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" />
<style>
  :root {
    --ink: #0f172a;
    --muted: #475569;
    --line: #94a3b8;
    --head: #1e3a5f;
    --stripe: #f1f5f9;
    --blank: #fffbeb;
    --brand: #1d4ed8;
  }
  * { box-sizing: border-box; }
  body {
    font-family: Cairo, Tahoma, sans-serif;
    color: var(--ink);
    margin: 0;
    padding: 14mm 10mm;
    font-size: 11px;
    line-height: 1.45;
  }
  .sheet-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    border-bottom: 2.5px solid var(--head);
    padding-bottom: 10px;
    margin-bottom: 12px;
  }
  .brand {
    font-size: 13px;
    font-weight: 800;
    color: var(--brand);
    letter-spacing: 0.02em;
  }
  h1 {
    margin: 4px 0 0;
    font-size: 18px;
    font-weight: 800;
    color: var(--head);
  }
  .sub { color: var(--muted); margin-top: 4px; font-size: 11px; }
  .meta {
    text-align: left;
    color: var(--muted);
    font-size: 10px;
    white-space: nowrap;
  }
  .meta b { color: var(--ink); }
  .filters { margin: 0 0 12px; display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    display: inline-block;
    border: 1px solid var(--line);
    background: #f8fafc;
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 10px;
    color: var(--muted);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  th, td {
    border: 1px solid var(--line);
    padding: 5px 6px;
    vertical-align: middle;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  th {
    background: var(--head);
    color: #fff;
    font-weight: 700;
    font-size: 10px;
    text-align: right;
  }
  th.idx, td.idx {
    width: 28px;
    text-align: center;
    font-weight: 700;
    color: var(--muted);
    background: #e2e8f0;
  }
  tr.even td { background: #fff; }
  tr.odd td { background: var(--stripe); }
  td.blank {
    background: var(--blank) !important;
    min-height: 22px;
    height: 22px;
  }
  tr.totals td {
    background: #dbeafe !important;
    font-weight: 800;
    border-top: 2px solid var(--head);
  }
  .legend {
    margin-top: 10px;
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    font-size: 10px;
    color: var(--muted);
  }
  .legend span::before {
    content: "";
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 1px solid var(--line);
    margin-left: 6px;
    vertical-align: -2px;
  }
  .legend .sys::before { background: #fff; }
  .legend .hand::before { background: var(--blank); }
  .sign {
    margin-top: 18px;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 16px;
  }
  .sign .box {
    border: 1px dashed var(--line);
    border-radius: 6px;
    padding: 10px;
    min-height: 64px;
  }
  .sign .label { font-weight: 700; color: var(--head); margin-bottom: 22px; font-size: 11px; }
  .sign .line { border-top: 1px solid #cbd5e1; margin-top: 18px; padding-top: 4px; color: var(--muted); font-size: 10px; }
  .footer-note {
    margin-top: 10px;
    font-size: 9px;
    color: #64748b;
    border-top: 1px solid #e2e8f0;
    padding-top: 6px;
  }
  @page {
    size: ${input.landscape ? "A4 landscape" : "A4"};
    margin: 8mm;
  }
  @media print {
    body { padding: 0; }
    * {
      print-color-adjust: exact !important;
      -webkit-print-color-adjust: exact !important;
    }
  }
</style>
</head>
<body>
  <div class="sheet-head">
    <div>
      <div class="brand">Easy Cash</div>
      <h1>${esc(input.title)}</h1>
      ${input.subtitle ? `<div class="sub">${esc(input.subtitle)}</div>` : ""}
      ${input.companyName ? `<div class="sub">${esc(input.companyName)}</div>` : ""}
    </div>
    <div class="meta">
      <div>تاريخ الطباعة: <b>${esc(printedAt)}</b></div>
      <div>عدد الأسطر: <b>${input.rows.length}</b></div>
    </div>
  </div>
  ${filtersHtml ? `<div class="filters">${filtersHtml}</div>` : ""}
  <table>
    <thead>
      <tr>
        <th class="idx">م</th>
        ${headCells}
      </tr>
    </thead>
    <tbody>
      ${bodyRows || `<tr><td colspan="${input.columns.length + 1}" style="text-align:center;padding:24px;color:#64748b">لا توجد بيانات</td></tr>`}
    </tbody>
    ${totalsRow ? `<tfoot>${totalsRow}</tfoot>` : ""}
  </table>
  <div class="legend">
    <span class="sys">بيانات النظام</span>
    <span class="hand">خانات فارغة للتعبئة اليدوية عند المراجعة / الجرد</span>
  </div>
  <div class="sign">
    <div class="box"><div class="label">إعداد التقرير</div><div class="line">التوقيع / التاريخ</div></div>
    <div class="box"><div class="label">مراجع المخازن</div><div class="line">التوقيع / التاريخ</div></div>
    <div class="box"><div class="label">اعتماد الإدارة</div><div class="line">التوقيع / التاريخ</div></div>
  </div>
  <div class="footer-note">Easy Cash — تقرير للمراجعة الداخلية. لا يُستخدم كمستند تسوية إلا بعد اعتماد الفروقات.</div>
  <script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=1200,height=860");
  if (!win) {
    window.alert("المتصفح منع نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
}

/** أعمدة جرد المخازن المناسبة للمراجع (كمية فعلية + ملاحظات) */
export function stocktakePrintColumns(): PrintInventoryColumn[] {
  return [
    { key: "code", label: "الكود", width: "8%" },
    { key: "name", label: "الصنف", width: "18%" },
    { key: "warehouse", label: "المخزن", width: "12%" },
    { key: "category", label: "الفئة", width: "9%" },
    { key: "qty", label: "كمية النظام", width: "8%", align: "center" },
    { key: "unit", label: "الوحدة", width: "6%", align: "center" },
    { key: "cost", label: "التكلفة", width: "8%", align: "center" },
    { key: "value", label: "القيمة", width: "9%", align: "center" },
    { key: "physical", label: "كمية فعلية", width: "8%", blank: true, align: "center" },
    { key: "diff", label: "الفرق", width: "7%", blank: true, align: "center" },
    { key: "notes", label: "ملاحظات", width: "7%", blank: true },
  ];
}
