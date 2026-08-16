import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "./db";
import { amountToCents } from "./paymob";
import { getAppUserById } from "./saas-auth";
import {
  subscriptionPayments,
  subscriptionPlans,
  subscriptions,
  userNotifications,
} from "../drizzle/schema";

export type PaymentActivationResult =
  | { ok: true; paymentId: number; alreadyPaid?: boolean }
  | { ok: false; reason: string };

/** يتحقق من المبلغ ويفعّل الاشتراك تلقائياً عند نجاح الدفع */
export async function activateSubscriptionPayment(
  paymentId: number,
  opts?: {
    providerReference?: string | null;
    paidAmountCents?: number | null;
    force?: boolean;
  },
): Promise<PaymentActivationResult> {
  const db = await getDb();
  if (!db) return { ok: false, reason: "قاعدة البيانات غير متاحة" };

  const [payment] = await db
    .select()
    .from(subscriptionPayments)
    .where(eq(subscriptionPayments.id, paymentId))
    .limit(1);
  if (!payment) return { ok: false, reason: "عملية الدفع غير موجودة" };
  if (payment.status === "paid") return { ok: true, paymentId, alreadyPaid: true };

  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, payment.planId))
    .limit(1);
  if (!plan) return { ok: false, reason: "خطة الاشتراك غير موجودة" };

  const expectedCents = amountToCents(payment.amount);
  const planCents = amountToCents(plan.price);
  if (expectedCents !== planCents) {
    return { ok: false, reason: "مبلغ الطلب لا يطابق سعر الخطة" };
  }

  if (
    opts?.paidAmountCents != null &&
    opts.paidAmountCents !== expectedCents &&
    !opts.force
  ) {
    await db
      .update(subscriptionPayments)
      .set({ status: "failed", providerReference: opts.providerReference || payment.providerReference })
      .where(eq(subscriptionPayments.id, paymentId));
    return {
      ok: false,
      reason: `المبلغ المدفوع (${(opts.paidAmountCents / 100).toFixed(2)}) لا يطابق المطلوب (${Number(payment.amount).toFixed(2)})`,
    };
  }

  const user = await getAppUserById(payment.userId);
  const tenantId = user?.tenantId ?? null;

  await db
    .update(subscriptionPayments)
    .set({
      status: "paid",
      providerReference: opts?.providerReference || payment.providerReference,
    })
    .where(eq(subscriptionPayments.id, paymentId));

  const today = new Date().toISOString().split("T")[0];
  const [existingSub] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        tenantId ? eq(subscriptions.tenantId, tenantId) : eq(subscriptions.userId, payment.userId),
        gte(subscriptions.endDate, today as any),
      ),
    )
    .orderBy(desc(subscriptions.endDate))
    .limit(1);

  const baseDate =
    existingSub && String(existingSub.endDate) >= today
      ? new Date(String(existingSub.endDate))
      : new Date();
  const endDate = new Date(baseDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  if (existingSub) {
    await db
      .update(subscriptions)
      .set({
        planId: payment.planId,
        status: "active",
        endDate: endDate as any,
        tenantId: tenantId ?? existingSub.tenantId,
        startDate:
          existingSub.status === "expired" || String(existingSub.endDate) < today
            ? (today as any)
            : existingSub.startDate,
      })
      .where(eq(subscriptions.id, existingSub.id));
  } else {
    const [latestSub] = await db
      .select()
      .from(subscriptions)
      .where(
        tenantId
          ? eq(subscriptions.tenantId, tenantId)
          : eq(subscriptions.userId, payment.userId),
      )
      .orderBy(desc(subscriptions.endDate))
      .limit(1);

    if (latestSub) {
      await db
        .update(subscriptions)
        .set({
          planId: payment.planId,
          status: "active",
          tenantId: tenantId ?? latestSub.tenantId,
          startDate: today as any,
          endDate: endDate as any,
        })
        .where(eq(subscriptions.id, latestSub.id));
    } else {
      await db.insert(subscriptions).values({
        userId: payment.userId,
        tenantId,
        planId: payment.planId,
        status: "active",
        startDate: today as any,
        endDate: endDate as any,
      });
    }
  }

  await db.insert(userNotifications).values({
    userId: payment.userId,
    type: "success",
    title: "تم تفعيل الاشتراك",
    message: `تم الدفع بنجاح وتفعيل خطة ${plan.nameAr}`,
  });

  return { ok: true, paymentId };
}

export async function markSubscriptionPaymentPaid(
  paymentId: number,
  providerReference?: string | null,
  paidAmountCents?: number | null,
) {
  const result = await activateSubscriptionPayment(paymentId, {
    providerReference,
    paidAmountCents,
  });
  if (!result.ok) {
    console.warn(`[subscription-payment] activation failed #${paymentId}:`, result.reason);
    return null;
  }
  const db = await getDb();
  const [payment] = await db!
    .select()
    .from(subscriptionPayments)
    .where(eq(subscriptionPayments.id, paymentId))
    .limit(1);
  return payment || null;
}

export async function markSubscriptionPaymentFailed(paymentId: number, providerReference?: string | null) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(subscriptionPayments)
    .set({
      status: "failed",
      providerReference: providerReference || undefined,
    })
    .where(eq(subscriptionPayments.id, paymentId));
}
