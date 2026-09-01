/** طباعة/PDF لتقرير مراجع الحسابات */
import { parseAuditNarrative, type NarrativeBlock, type NarrativeInline } from "./audit-narrative";

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function inlineHtml(part: NarrativeInline): string {
  if (part.type === "bold") return `<strong>${esc(part.text)}</strong>`;
  if (part.type === "link") return `<span class="link">${esc(part.label || part.path)}</span>`;
  return esc(part.text);
}

function blockHtml(block: NarrativeBlock): string {
  if (block.type === "paragraph") {
    return `<p>${block.parts.map(inlineHtml).join("")}</p>`;
  }
  const tag = block.type === "numbered" ? "ol" : "ul";
  const items = block.items.map((parts) => `<li>${parts.map(inlineHtml).join("")}</li>`).join("");
  return `<${tag}>${items}</${tag}>`;
}

/** يحوّل نص المراجع الحر (عناوين ### وقوائم وروابط) لتقرير مقسّم بصرياً بدل نص خام، لعرضه في نافذة الطباعة. */
function narrativeToHtml(narrative: string): string {
  const parsed = parseAuditNarrative(narrative);
  const introHtml = parsed.intro.length
    ? `<div class="intro">${parsed.intro.map(blockHtml).join("")}</div>`
    : "";
  const sectionsHtml = parsed.sections
    .filter((s) => s.blocks.length)
    .map(
      (s) => `
      <div class="nsection">
        <h3>${s.index !== null ? `<span class="nnum">${s.index}</span>` : ""}${esc(s.title)}</h3>
        ${s.blocks.map(blockHtml).join("")}
      </div>`
    )
    .join("");
  return introHtml + sectionsHtml;
}

const OPINION_STYLE: Record<string, { bg: string; border: string; label: string }> = {
  unqualified: { bg: "#ecfdf5", border: "#10b981", label: "رأي غير متحفظ" },
  qualified: { bg: "#fffbeb", border: "#f59e0b", label: "رأي متحفظ" },
  adverse: { bg: "#fef2f2", border: "#ef4444", label: "رأي سلبي" },
  disclaimer: { bg: "#f8fafc", border: "#64748b", label: "امتناع عن إبداء الرأي" },
};

export function printAccountingAuditReport(input: {
  companyName?: string;
  narrative?: string;
  generatedAt: string;
  summary: { critical: number; warning: number; info: number; total: number };
  opinion?: { type: string; label: string; rationale: string } | null;
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
    refCode?: string;
    severity: string;
    category: string;
    title: string;
    detail: string;
    recommendation: string;
    closureStatus?: string;
  }>;
}) {
  const money = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

  const findingsHtml = input.findings
    .map(
      (f, i) => `
    <tr>
      <td>${esc(f.refCode || i + 1)}</td>
      <td>${esc(f.severity)}</td>
      <td>${esc(f.category)}</td>
      <td><strong>${esc(f.title)}</strong><div class="muted">${esc(f.detail)}</div><div class="rec">التعديل: ${esc(f.recommendation)}</div></td>
      <td>${esc(f.closureStatus || "open")}</td>
    </tr>`
    )
    .join("");

  const opStyle = input.opinion ? OPINION_STYLE[input.opinion.type] || OPINION_STYLE.disclaimer : null;

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
  .opinion{border:1px solid;border-radius:8px;padding:12px 14px;margin-bottom:14px}
  .opinion .tag{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;margin-bottom:2px}
  .opinion .label{font-size:14px;font-weight:700;margin-bottom:4px}
  table{width:100%;border-collapse:collapse}
  th{background:#0f766e;color:#fff;padding:6px;text-align:right;font-size:11px}
  td{border-bottom:1px solid #e2e8f0;padding:6px;vertical-align:top;font-size:11px}
  .muted{color:#64748b;margin-top:3px}
  .rec{color:#065f46;margin-top:4px}
  .narrative{line-height:1.8}
  .narrative p{margin:0 0 8px}
  .narrative ul,.narrative ol{margin:0 0 8px;padding-inline-start:18px}
  .narrative li{margin-bottom:3px}
  .narrative .link{color:#0f766e;text-decoration:underline}
  .narrative .intro{color:#475569;margin-bottom:10px}
  .nsection{border-top:1px solid #e2e8f0;padding-top:8px;margin-top:8px}
  .nsection:first-child{border-top:none;padding-top:0;margin-top:0}
  .nsection h3{font-size:12.5px;margin:0 0 5px;color:#0f172a}
  .nnum{display:inline-block;background:#f1f5f9;color:#64748b;border-radius:4px;padding:0 5px;font-size:10px;margin-inline-end:5px}
  @media print{body{padding:0} @page{margin:10mm}}
</style>
</head>
<body>
  <h1>تقرير مراجع الحسابات الذكي — ${esc(input.companyName || "Easy Cash")}</h1>
  <div class="meta">تاريخ التقرير: ${esc(new Date(input.generatedAt).toLocaleString("en-US"))}</div>
  ${
    input.opinion && opStyle
      ? `<div class="opinion" style="background:${opStyle.bg};border-color:${opStyle.border}">
           <div class="tag">رأي المراجع الداخلي</div>
           <div class="label">${esc(input.opinion.label)}</div>
           <div class="muted">${esc(input.opinion.rationale)}</div>
         </div>`
      : ""
  }
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
  ${input.narrative ? `<div class="box"><strong>تقرير المكتب</strong><div class="narrative">${narrativeToHtml(input.narrative)}</div></div>` : ""}
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
