import type { MySql2Database } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { companySettings } from "../drizzle/schema";
import { getOperationalAlerts } from "./operational-alerts";
import { tenantWhere } from "./tenant-scope";

type AlertEmailSettings = {
  alertEmailsEnabled: boolean;
  alertEmailRecipients: string | null;
  alertEmailsLastSent: Date | null;
};

function parseRecipients(raw: string | null | undefined) {
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
}

function buildDigestHtml(companyName: string, alerts: Awaited<ReturnType<typeof getOperationalAlerts>>) {
  const lines: string[] = [];
  const c = alerts.counts;

  if (c.lowStock > 0) lines.push(`• مخزون منخفض: ${c.lowStock} صنف`);
  if (c.unpaidSales > 0) lines.push(`• فواتير بيع غير مسددة: ${c.unpaidSales}`);
  if (c.unpaidPurchases > 0) lines.push(`• فواتير شراء غير مسددة: ${c.unpaidPurchases}`);
  if (c.overdueSales > 0) lines.push(`• فواتير بيع متأخرة: ${c.overdueSales}`);
  if (c.overdueChecks > 0) lines.push(`• شيكات متأخرة: ${c.overdueChecks}`);
  if (c.dueChecks > 0) lines.push(`• شيكات مستحقة قريباً: ${c.dueChecks}`);
  if (c.unroutedChecks > 0) lines.push(`• شيكات غير موجهة: ${c.unroutedChecks}`);
  if (c.depositDueSoon > 0) lines.push(`• مواعيد إيداع قريبة: ${c.depositDueSoon}`);
  if (c.overdueDeposits > 0) lines.push(`• متأخرة عن الإيداع: ${c.overdueDeposits}`);
  if (c.depositedOverdueClear > 0) lines.push(`• مودعة ومتأخرة عن التحصيل: ${c.depositedOverdueClear}`);
  if (c.creditExceeded > 0) lines.push(`• عملاء تجاوزوا حد الائتمان: ${c.creditExceeded}`);
  if (c.dueInstallments > 0) lines.push(`• أقساط مستحقة: ${c.dueInstallments}`);
  if (c.draftDocs > 0) lines.push(`• مستندات مسودة: ${c.draftDocs}`);

  if (lines.length === 0) {
    return `<p>لا توجد تنبيهات تشغيلية عاجلة في ${companyName}.</p>`;
  }

  return `
    <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif">
      <h2>ملخص تنبيهات Easy Cash — ${companyName}</h2>
      <p>تاريخ الإرسال: ${new Date().toLocaleString("ar-EG")}</p>
      <ul>${lines.map((l) => `<li>${l.replace("• ", "")}</li>`).join("")}</ul>
      <p style="color:#64748b;font-size:12px">سجّل دخولك للنظام لمتابعة التفاصيل والإجراءات.</p>
    </div>
  `;
}

async function sendViaResend(opts: { to: string[]; subject: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_EMAIL_FROM || "Easy Cash <onboarding@resend.dev>";
  if (!apiKey) return { sent: false, reason: "RESEND_API_KEY not configured" as const };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return { sent: false, reason: `Resend error ${response.status}: ${detail}` as const };
  }

  return { sent: true as const };
}

export async function sendOperationalAlertDigest(
  db: MySql2Database,
  tenantId: number,
  opts?: { force?: boolean },
) {
  const [company] = await db
    .select()
    .from(companySettings)
    .where(tenantWhere(companySettings, tenantId))
    .limit(1);

  if (!company?.alertEmailsEnabled) {
    return { sent: false, reason: "alert emails disabled" };
  }

  const recipients = parseRecipients(company.alertEmailRecipients);
  if (recipients.length === 0) {
    return { sent: false, reason: "no recipients" };
  }

  const lastSent = company.alertEmailsLastSent ? new Date(company.alertEmailsLastSent) : null;
  const hoursSince = lastSent ? (Date.now() - lastSent.getTime()) / 3_600_000 : Infinity;
  if (!opts?.force && hoursSince < 20) {
    return { sent: false, reason: "digest already sent recently" };
  }

  const alerts = await getOperationalAlerts(db, tenantId);
  const totalAlerts =
    alerts.counts.lowStock +
    alerts.counts.unpaidSales +
    alerts.counts.unpaidPurchases +
    alerts.counts.overdueSales +
    alerts.counts.overdueChecks +
    alerts.counts.dueChecks +
    (alerts.counts.unroutedChecks || 0) +
    (alerts.counts.depositDueSoon || 0) +
    (alerts.counts.overdueDeposits || 0) +
    (alerts.counts.depositedOverdueClear || 0) +
    alerts.counts.creditExceeded +
    alerts.counts.dueInstallments +
    alerts.counts.draftDocs;

  if (totalAlerts === 0 && !opts?.force) {
    return { sent: false, reason: "no alerts to send" };
  }

  const html = buildDigestHtml(company.name, alerts);
  const subject = totalAlerts > 0
    ? `تنبيهات Easy Cash — ${totalAlerts} عنصر يحتاج متابعة`
    : `ملخص Easy Cash — لا توجد تنبيهات عاجلة`;

  const result = await sendViaResend({ to: recipients, subject, html });
  if (!result.sent) {
    console.warn("[alert-email]", result.reason);
    return result;
  }

  await db
    .update(companySettings)
    .set({ alertEmailsLastSent: new Date() })
    .where(tenantWhere(companySettings, tenantId, eq(companySettings.id, company.id)));

  return { sent: true, recipients: recipients.length, totalAlerts };
}
