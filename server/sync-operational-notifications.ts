import { and, eq, like, notInArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { notifications } from "../drizzle/schema";
import { getOperationalAlerts } from "./operational-alerts";
import { tenantWhere, withTenantId } from "./tenant-scope";

export type OperationalNotificationDraft = {
  referenceKey: string;
  title: string;
  message: string;
  type: "info" | "warning" | "error" | "success";
  href?: string;
};

export function buildOperationalNotificationDrafts(alerts: Awaited<ReturnType<typeof getOperationalAlerts>>): OperationalNotificationDraft[] {
  const drafts: OperationalNotificationDraft[] = [];

  for (const item of alerts.lowStockItems) {
    drafts.push({
      referenceKey: `ops:low_stock:${item.id}`,
      title: "مخزون منخفض",
      message: `الصنف «${item.name}» وصل للحد الأدنى (${Number(item.currentStock).toLocaleString("ar-EG")} / ${Number(item.minStock).toLocaleString("ar-EG")})`,
      type: "warning",
      href: "/items",
    });
  }

  for (const inv of alerts.unpaidSales) {
    drafts.push({
      referenceKey: `ops:unpaid_sale:${inv.id}`,
      title: "فاتورة بيع غير مسددة",
      message: `فاتورة ${inv.number} — ${inv.customerName || "عميل"} — متبقي ${Number(inv.remaining).toLocaleString("ar-EG")} ج.م`,
      type: "warning",
      href: `/sales/invoices/${inv.id}`,
    });
  }

  for (const inv of alerts.unpaidPurchases) {
    drafts.push({
      referenceKey: `ops:unpaid_purchase:${inv.id}`,
      title: "فاتورة شراء غير مسددة",
      message: `فاتورة ${inv.number} — ${inv.supplierName || "مورد"} — متبقي ${Number(inv.remaining).toLocaleString("ar-EG")} ج.م`,
      type: "warning",
      href: `/purchases/invoices/${inv.id}`,
    });
  }

  for (const chk of alerts.dueChecks) {
    drafts.push({
      referenceKey: `ops:due_check:${chk.id}`,
      title: "شيك مستحق قريباً",
      message: `شيك ${chk.checkNumber} بقيمة ${Number(chk.amount).toLocaleString("ar-EG")} ج.م — استحقاق ${String(chk.dueDate).slice(0, 10)}`,
      type: "info",
      href: "/bank/check-routing",
    });
  }

  for (const chk of alerts.overdueChecks) {
    drafts.push({
      referenceKey: `ops:overdue_check:${chk.id}`,
      title: "شيك متأخر",
      message: `شيك ${chk.checkNumber} بقيمة ${Number(chk.amount).toLocaleString("ar-EG")} ج.م — متأخر منذ ${String(chk.dueDate).slice(0, 10)}`,
      type: "error",
      href: "/bank/check-routing",
    });
  }

  for (const chk of alerts.unroutedChecks || []) {
    drafts.push({
      referenceKey: `ops:unrouted_check:${chk.id}`,
      title: "شيك غير موجه",
      message: `شيك ${chk.checkNumber} — ${chk.customerName || "عميل"} — ${Number(chk.amount).toLocaleString("ar-EG")} ج.م يحتاج توجيه/حيازة`,
      type: "warning",
      href: "/bank/check-routing",
    });
  }

  for (const chk of alerts.depositDueSoon || []) {
    drafts.push({
      referenceKey: `ops:deposit_due:${chk.id}`,
      title: "موعد إيداع شيك قريب",
      message: `شيك ${chk.checkNumber} — إيداع مخطط ${String(chk.plannedDepositDate).slice(0, 10)} — ${Number(chk.amount).toLocaleString("ar-EG")} ج.م`,
      type: "info",
      href: "/bank/check-routing",
    });
  }

  for (const chk of alerts.overdueDeposits || []) {
    drafts.push({
      referenceKey: `ops:overdue_deposit:${chk.id}`,
      title: "شيك متأخر عن الإيداع",
      message: `شيك ${chk.checkNumber} كان موعد إيداعه ${String(chk.plannedDepositDate).slice(0, 10)} — ${Number(chk.amount).toLocaleString("ar-EG")} ج.م`,
      type: "error",
      href: "/bank/check-routing",
    });
  }

  for (const chk of alerts.depositedOverdueClear || []) {
    drafts.push({
      referenceKey: `ops:deposited_overdue:${chk.id}`,
      title: "شيك مودع متأخر عن التحصيل",
      message: `شيك ${chk.checkNumber} لدى البنك ومتأخر عن الاستحقاق ${String(chk.dueDate).slice(0, 10)}`,
      type: "warning",
      href: "/bank/check-routing",
    });
  }

  for (const inv of alerts.overdueSales) {
    drafts.push({
      referenceKey: `ops:overdue_sale:${inv.id}`,
      title: "فاتورة بيع متأخرة السداد",
      message: `فاتورة ${inv.number} — ${inv.customerName || "عميل"} — متبقي ${Number(inv.remaining).toLocaleString("ar-EG")} ج.م`,
      type: "error",
      href: `/sales/invoices/${inv.id}`,
    });
  }

  for (const c of alerts.creditExceededCustomers) {
    drafts.push({
      referenceKey: `ops:credit_customer:${c.id}`,
      title: "تجاوز حد الائتمان",
      message: `العميل «${c.name}» تجاوز حد الائتمان (${Number(c.balance).toLocaleString("ar-EG")} / ${Number(c.creditLimit).toLocaleString("ar-EG")} ج.م)`,
      type: "error",
      href: `/contacts/statement?type=customer&id=${c.id}`,
    });
  }

  for (const inst of alerts.dueInstallments) {
    drafts.push({
      referenceKey: `ops:due_installment:${inst.id}`,
      title: inst.isOverdue ? "قسط متأخر" : "قسط مستحق قريباً",
      message: `قسط ${Number(inst.amount).toLocaleString("ar-EG")} ج.م — ${inst.partyName} — ${String(inst.dueDate).slice(0, 10)}`,
      type: inst.isOverdue ? "error" : "warning",
      href: "/loans",
    });
  }

  if (alerts.counts.draftDocs > 0) {
    drafts.push({
      referenceKey: "ops:draft_docs",
      title: "مستندات مسودة",
      message: `يوجد ${alerts.counts.draftDocs} مستند مسودة يحتاج مراجعة`,
      type: "info",
      href: "/pending-docs",
    });
  }

  return drafts;
}

export async function syncOperationalNotifications(
  db: MySql2Database,
  tenantId: number,
  userId: number,
) {
  const alerts = await getOperationalAlerts(db, tenantId);
  const drafts = buildOperationalNotificationDrafts(alerts);
  const currentKeys = drafts.map((d) => d.referenceKey);

  const existing = await db
    .select({
      id: notifications.id,
      referenceKey: notifications.referenceKey,
    })
    .from(notifications)
    .where(
      tenantWhere(
        notifications,
        tenantId,
        and(eq(notifications.userId, userId), like(notifications.referenceKey, "ops:%")),
      ),
    );

  const existingKeys = new Set(
    existing.map((row) => row.referenceKey).filter(Boolean) as string[],
  );

  if (currentKeys.length === 0) {
    await db
      .delete(notifications)
      .where(
        tenantWhere(
          notifications,
          tenantId,
          and(eq(notifications.userId, userId), like(notifications.referenceKey, "ops:%")),
        ),
      );
  } else {
    await db
      .delete(notifications)
      .where(
        tenantWhere(
          notifications,
          tenantId,
          and(
            eq(notifications.userId, userId),
            like(notifications.referenceKey, "ops:%"),
            notInArray(notifications.referenceKey, currentKeys),
          ),
        ),
      );
  }

  let created = 0;
  for (const draft of drafts) {
    if (existingKeys.has(draft.referenceKey)) continue;
    await db.insert(notifications).values(
      withTenantId(tenantId, {
        title: draft.title,
        message: draft.message,
        type: draft.type,
        userId,
        referenceKey: draft.referenceKey,
        href: draft.href,
        isRead: false,
      }) as any,
    );
    created += 1;
  }

  let emailResult: Awaited<ReturnType<typeof import("./alert-email").sendOperationalAlertDigest>> | null = null;
  try {
    const { sendOperationalAlertDigest } = await import("./alert-email");
    emailResult = await sendOperationalAlertDigest(db, tenantId);
  } catch (err) {
    console.warn("[sync-operational-notifications] email digest failed", err);
  }

  return { created, total: drafts.length, alerts: alerts.counts, email: emailResult };
}
