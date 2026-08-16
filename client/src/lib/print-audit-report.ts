/** طباعة/PDF لتقرير مراجع الحسابات */
export function printAccountingAuditReport(input: {
  companyName?: string;
  narrative?: string;
  generatedAt: string;
  summary: { critical: number; warning: number; info: number; total: number };
  trialBalance?: {
    balanced: boolean;
    periodLabel: string;
    totalClosingDebit: number;
    totalClosingCredit: number;
    difference: number;
    accountsReviewed: number;
  } | null;
  income?: { revenue: number; cost: number; grossProfit: number; expenses: number; netProfit: number } | null;
  liquidity?: {
    net30: number;
    net60: number;
    net90: number;
    inflow30: number;
    outflow30: number;
  } | null;
  findings: Array<{
    severity: string;
    category: string;
    title: string;
    detail: string;
    recommendation: string;
    closureStatus?: string;
  }>;
}) {
  const esc = (v: unknown) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const money = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

  const findingsHtml = input.findings
    .map(
      (f, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(f.severity)}</td>
      <td>${esc(f.category)}</td>
      <td><strong>${esc(f.title)}</strong><div class="muted">${esc(f.detail)}</div><div class="rec">التعديل: ${esc(f.recommendation)}</div></td>
      <td>${esc(f.closureStatus || "open")}</td>
    </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8" />
<title>تقرير مراجع الحسابات</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" />
<style>
  body{font-family:Cairo,Tahoma,sans-serif;color:#0f172a;padding:18px;font-size:12px}
  h1{color:#0f766e;font-size:20px;margin:0 0 6px}
  .meta{color:#64748b;margin-bottom:14px}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
  .kpi{border:1px solid #e2e8f0;border-radius:8px;padding:10px;background:#f8fafc}
  .kpi b{display:block;font-size:16px;margin-top:4px}
  .box{border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:12px}
  table{width:100%;border-collapse:collapse}
  th{background:#0f766e;color:#fff;padding:6px;text-align:right;font-size:11px}
  td{border-bottom:1px solid #e2e8f0;padding:6px;vertical-align:top;font-size:11px}
  .muted{color:#64748b;margin-top:3px}
  .rec{color:#065f46;margin-top:4px}
  .narrative{white-space:pre-wrap;line-height:1.7}
  @media print{body{padding:0} @page{margin:10mm}}
</style>
</head>
<body>
  <h1>تقرير مراجع الحسابات الذكي — ${esc(input.companyName || "Easy Cash")}</h1>
  <div class="meta">تاريخ التقرير: ${esc(new Date(input.generatedAt).toLocaleString("en-US"))}</div>
  <div class="kpis">
    <div class="kpi">حرج<b>${input.summary.critical}</b></div>
    <div class="kpi">تحذير<b>${input.summary.warning}</b></div>
    <div class="kpi">معلومة<b>${input.summary.info}</b></div>
    <div class="kpi">الإجمالي<b>${input.summary.total}</b></div>
  </div>
  ${
    input.trialBalance
      ? `<div class="box"><strong>ميزان المراجعة:</strong> ${input.trialBalance.balanced ? "متوازن" : "غير متوازن"} · ${esc(input.trialBalance.periodLabel)} · مدين ${money(input.trialBalance.totalClosingDebit)} / دائن ${money(input.trialBalance.totalClosingCredit)} · فرق ${money(input.trialBalance.difference)} · حسابات ${input.trialBalance.accountsReviewed}</div>`
      : ""
  }
  ${
    input.income
      ? `<div class="box"><strong>الدخل:</strong> إيراد ${money(input.income.revenue)} · تكلفة ${money(input.income.cost)} · مجمل ${money(input.income.grossProfit)} · مصروفات ${money(input.income.expenses)} · صافي ${money(input.income.netProfit)}</div>`
      : ""
  }
  ${
    input.liquidity
      ? `<div class="box"><strong>سيولة متوقعة:</strong> صافي 30 يوم ${money(input.liquidity.net30)} (داخل ${money(input.liquidity.inflow30)} / خارج ${money(input.liquidity.outflow30)}) · صافي 60 ${money(input.liquidity.net60)} · صافي 90 ${money(input.liquidity.net90)}</div>`
      : ""
  }
  ${input.narrative ? `<div class="box"><strong>تقرير المكتب</strong><div class="narrative">${esc(input.narrative)}</div></div>` : ""}
  <table>
    <thead><tr><th>#</th><th>الشدة</th><th>التصنيف</th><th>الملاحظة</th><th>الإغلاق</th></tr></thead>
    <tbody>${findingsHtml || `<tr><td colspan="5">لا ملاحظات</td></tr>`}</tbody>
  </table>
  <script>window.onload=()=>setTimeout(()=>window.print(),250)</script>
</body></html>`;

  const win = window.open("", "_blank", "width=1100,height=800");
  if (!win) {
    window.alert("المتصفح منع نافذة الطباعة. اسمح بالنوافذ المنبثقة.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
}
