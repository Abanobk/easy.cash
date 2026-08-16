import {
  ALLOC_LABELS,
  resolvedFreight,
  type ImportCostHeader,
  type ImportCostResult,
  type ShippingQuote,
} from "@shared/import-costing";

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n: number, digits = 2) {
  return Number(n || 0).toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

function pct(rate: number) {
  return Math.round((Number(rate) || 0) * 10000) / 100;
}

export type ImportCostingPrintInput = {
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyTaxNumber?: string;
  companyLogo?: string | null;
  name: string;
  number?: string;
  shipmentDate: string;
  typeLabel: string;
  notes: string;
  header: ImportCostHeader;
  quote: ShippingQuote;
  computed: ImportCostResult;
};

export function printImportCostingReport(input: ImportCostingPrintInput) {
  const { header, quote, computed } = input;
  const freight = resolvedFreight(header);
  const t = computed.totals;
  const title = `تقرير تكليف شحنة — ${input.name || "بدون اسم"}`;
  const printedAt = new Date().toLocaleString("en-US");

  const logoHtml =
    input.companyLogo
      ? `<img src="${esc(input.companyLogo)}" alt="logo" style="max-height:56px;max-width:120px;object-fit:contain;margin-bottom:6px" />`
      : "";

  const costRows: Array<[string, string]> = [
    ["الفاتورة الجمركية", `${money(header.customsAssessableUsd)} $`],
    ["سعر صرف الجمرك", money(header.customsFxRate)],
    ["سعر صرف التكلفة", money(header.costFxRate)],
    ["نسبة الجمارك", `${money(pct(header.customsRate))}%`],
    ["قيمة الجمارك", `${money(computed.pools.customsEgp)} ج`],
    ["نسبة الضريبة", `${money(pct(header.vatRate))}%`],
    ["قيمة الضريبة", `${money(computed.pools.vatEgp)} ج`],
    ["نسبة أ.ت.ص", `${money(pct(header.withholdingRate))}%`],
    ["قيمة أ.ت.ص", `${money(computed.pools.withholdingEgp)} ج`],
    ["شحن بحري / OF", `${money(freight.shippingUsd)} $`],
    ["عمولة الصين", `${money(header.agentFeeUsd)} $`],
    ["OCA", `${money(header.ocaUsd)} $`],
    ["أرضيات", `${money(header.yardFeesEgp)} ج`],
    ["رسوم المخلص", `${money(header.brokerFeesEgp)} ج`],
    ["تكلفة البطاريات", `${money(header.batteriesEgp)} ج`],
    ["شحن محلي", `${money(freight.freightLocalEgp)} ج`],
    ["توزيع OCA", ALLOC_LABELS[header.ocaAlloc]],
    ["توزيع الشحن", ALLOC_LABELS[header.shippingAlloc]],
    ["توزيع العمولة", ALLOC_LABELS[header.agentAlloc]],
    ["توزيع المحلي", ALLOC_LABELS[header.localAlloc]],
  ];

  const quoteBlock = quote.enabled
    ? `
      <h3 class="section">عرض شركة الشحن</h3>
      <table class="meta">
        <tr><td>المسار</td><td>${esc(quote.pol)} → ${esc(quote.pod)}</td></tr>
        <tr><td>الحجم</td><td>${money(quote.volumeCbm)} CBM (محسوب ${money(freight.quote.chargeableCbm)})</td></tr>
        <tr><td>المدة المتوقعة</td><td>${esc(quote.expectedWeeks)} أسبوع · أيام إضافية ${money(freight.quote.extraDays)}</td></tr>
        <tr><td>OF</td><td>${money(freight.quote.ofUsd)} $</td></tr>
        <tr><td>THC + ضريبة</td><td>${money(freight.quote.thcEgp + freight.quote.thcVatEgp)} ج</td></tr>
        <tr><td>تخزين + ضريبة</td><td>${money(freight.quote.storageEgp + freight.quote.storageVatEgp)} ج</td></tr>
        <tr><td>أيام إضافية + ضريبة</td><td>${money(freight.quote.extraEgp + freight.quote.extraVatEgp)} ج</td></tr>
        <tr><td><strong>إجمالي محلي من العرض</strong></td><td><strong>${money(freight.quote.localEgp)} ج</strong></td></tr>
      </table>
    `
    : "";

  const itemRows = computed.lines
    .filter((l) => (l.itemName || "").trim())
    .map(
      (l, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>
          <div class="item-name">${esc(l.itemName || "—")}</div>
          ${
            l.category || l.barcode
              ? `<div class="muted">${esc([l.category, l.barcode].filter(Boolean).join(" · "))}</div>`
              : ""
          }
        </td>
        <td class="num">${money(l.quantity)}</td>
        <td class="num">${money(l.unitCostUsd, 3)}</td>
        <td class="num">${money(l.lineTotalUsd, 3)}</td>
        <td class="num">${money(l.unitUsd, 3)}</td>
        <td class="num">${money(l.unitEgp)}</td>
        <td class="num">${money(l.customsUnitEgp)}</td>
        <td class="num">${money(l.vatUnitEgp)}</td>
        <td class="num">${money(l.withholdingUnitEgp)}</td>
        <td class="num">${money(l.yardUnitEgp + l.brokerUnitEgp + l.batteriesUnitEgp + l.freightLocalUnitEgp)}</td>
        <td class="num strong">${money(l.landedUnitEgp)}</td>
        <td class="num strong">${money(l.landedUnitEgp * l.quantity)}</td>
      </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8" />
  <title>${esc(title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Cairo', Tahoma, sans-serif;
      color: #0f172a;
      background: #fff;
      direction: rtl;
      font-size: 12px;
    }
    .page { max-width: 1100px; margin: 0 auto; padding: 18px 20px 28px; }
    .header {
      display: flex; justify-content: space-between; gap: 16px;
      padding-bottom: 12px; margin-bottom: 14px;
      border-bottom: 2px solid #0f766e;
    }
    .company h1 { font-size: 20px; color: #0f766e; font-weight: 800; }
    .company p { color: #64748b; font-size: 11px; line-height: 1.5; }
    .doc-title { text-align: left; }
    .doc-title .badge {
      display: inline-block; background: #ccfbf1; color: #0f766e;
      padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; margin-bottom: 4px;
    }
    .doc-title h2 { font-size: 16px; font-weight: 800; }
    .doc-title .meta-line { color: #64748b; font-size: 11px; margin-top: 2px; }
    .kpis {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
      margin-bottom: 14px;
    }
    .kpi {
      border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; background: #f8fafc;
    }
    .kpi .label { font-size: 10px; color: #64748b; }
    .kpi .value { font-size: 15px; font-weight: 800; margin-top: 2px; tabular-nums: true; }
    .kpi.accent { background: #0f766e; border-color: #0f766e; color: #fff; }
    .kpi.accent .label { color: #ccfbf1; }
    .section {
      font-size: 13px; font-weight: 800; color: #0f766e;
      margin: 16px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0;
    }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    table.meta td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; }
    table.meta td:first-child { width: 38%; color: #64748b; }
    table.meta td:last-child { font-weight: 600; }
    table.items th {
      background: #0f766e; color: #fff; padding: 6px 5px; font-size: 10px;
      text-align: right; white-space: nowrap; font-weight: 700;
    }
    table.items td {
      padding: 5px; border-bottom: 1px solid #e2e8f0; font-size: 10px; vertical-align: top;
    }
    table.items tr:nth-child(even) td { background: #f8fafc; }
    .num { text-align: left; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .strong { font-weight: 800; color: #0f172a; }
    .item-name { font-weight: 700; }
    .muted { color: #94a3b8; font-size: 9px; margin-top: 1px; }
    .notes {
      background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
      padding: 10px 12px; margin-top: 10px; font-size: 11px;
    }
    .footer {
      margin-top: 18px; padding-top: 10px; border-top: 1px solid #e2e8f0;
      text-align: center; color: #94a3b8; font-size: 10px;
    }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .page { padding: 0; max-width: none; }
      @page { size: A4 landscape; margin: 10mm; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="company">
        ${logoHtml}
        <h1>${esc(input.companyName || "Easy Cash")}</h1>
        ${input.companyAddress ? `<p>${esc(input.companyAddress)}</p>` : ""}
        ${input.companyPhone ? `<p>هاتف: ${esc(input.companyPhone)}</p>` : ""}
        ${input.companyTaxNumber ? `<p>الرقم الضريبي: ${esc(input.companyTaxNumber)}</p>` : ""}
      </div>
      <div class="doc-title">
        <div class="badge">تقرير تكليف شحنة</div>
        <h2>${esc(input.name || "بدون اسم")}</h2>
        <div class="meta-line">${esc(input.number || "مسودة")} · ${esc(input.typeLabel)} · ${esc(input.shipmentDate || "—")}</div>
        <div class="meta-line">طُبع: ${esc(printedAt)}</div>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi accent">
        <div class="label">التكلفة الإجمالية</div>
        <div class="value">${money(t.landedEgp)} ج</div>
      </div>
      <div class="kpi">
        <div class="label">متوسط القطعة</div>
        <div class="value">${money(t.avgLandedUnitEgp)} ج</div>
      </div>
      <div class="kpi">
        <div class="label">مطلوب دولار</div>
        <div class="value">${money(t.dueUsd)} $</div>
      </div>
      <div class="kpi">
        <div class="label">مطلوب جنيه · الكمية</div>
        <div class="value">${money(t.dueLocalEgp)} ج · ${money(t.quantity)}</div>
      </div>
    </div>

    <div class="grid-2">
      <div>
        <h3 class="section">ملخص الحسابات</h3>
        <table class="meta">
          ${costRows
            .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`)
            .join("")}
          <tr><td>إجمالي دولار مطلوب</td><td><strong>${money(t.dueUsd)} $</strong></td></tr>
          <tr><td>دولار محوّل بسعر التكلفة</td><td><strong>${money(t.dueUsd * header.costFxRate)} ج</strong></td></tr>
          <tr><td>إجمالي محلي مطلوب</td><td><strong>${money(t.dueLocalEgp)} ج</strong></td></tr>
          <tr><td>تكلفة الوصول الإجمالية</td><td><strong>${money(t.landedEgp)} ج</strong></td></tr>
        </table>
      </div>
      <div>
        ${quoteBlock || `
          <h3 class="section">بيانات التقرير</h3>
          <table class="meta">
            <tr><td>الاسم</td><td>${esc(input.name || "—")}</td></tr>
            <tr><td>النوع</td><td>${esc(input.typeLabel)}</td></tr>
            <tr><td>التاريخ</td><td>${esc(input.shipmentDate || "—")}</td></tr>
            <tr><td>الرقم</td><td>${esc(input.number || "—")}</td></tr>
            <tr><td>عدد الأصناف</td><td>${computed.lines.length}</td></tr>
            <tr><td>إجمالي الوزن</td><td>${money(t.totalWeight)}</td></tr>
          </table>
        `}
        ${
          quote.enabled
            ? `
          <h3 class="section">بيانات التقرير</h3>
          <table class="meta">
            <tr><td>الاسم</td><td>${esc(input.name || "—")}</td></tr>
            <tr><td>النوع</td><td>${esc(input.typeLabel)}</td></tr>
            <tr><td>التاريخ</td><td>${esc(input.shipmentDate || "—")}</td></tr>
            <tr><td>الرقم</td><td>${esc(input.number || "—")}</td></tr>
            <tr><td>عدد الأصناف</td><td>${computed.lines.length}</td></tr>
          </table>
        `
            : ""
        }
      </div>
    </div>

    <h3 class="section">الأصناف وتكلفة الوصول للمراجعة</h3>
    <table class="items">
      <thead>
        <tr>
          <th>#</th>
          <th>الصنف</th>
          <th>كمية</th>
          <th>سعر $</th>
          <th>إجمالي $</th>
          <th>وحدة $</th>
          <th>وحدة ج</th>
          <th>جمارك</th>
          <th>ضريبة</th>
          <th>أ.ت.ص</th>
          <th>محلي/أخرى</th>
          <th>وصول / وحدة</th>
          <th>وصول السطر</th>
        </tr>
      </thead>
      <tbody>
        ${
          itemRows ||
          `<tr><td colspan="13" style="text-align:center;padding:16px;color:#94a3b8">لا توجد أصناف</td></tr>`
        }
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2"><strong>الإجمالي</strong></td>
          <td class="num strong">${money(t.quantity)}</td>
          <td></td>
          <td class="num strong">${money(t.lineTotalUsd, 3)}</td>
          <td colspan="6"></td>
          <td></td>
          <td class="num strong">${money(t.landedEgp)}</td>
        </tr>
      </tfoot>
    </table>

    ${
      input.notes
        ? `<div class="notes"><strong>ملاحظات:</strong> ${esc(input.notes)}</div>`
        : ""
    }

    <div class="footer">
      تقرير مراجعة تكلفة وصول الشحنة — Easy Cash · لا يؤثر على المخزن أو القيود المحاسبية
    </div>
  </div>
  <script>
    window.onload = function () {
      setTimeout(function () { window.print(); }, 250);
    };
  </script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=1200,height=800");
  if (!win) {
    window.alert("المتصفح منع نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
}
