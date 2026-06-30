import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "./db";
import {
  subscriptionPayments,
  subscriptionPlans,
  subscriptions,
  userNotifications,
} from "../drizzle/schema";

export async function markSubscriptionPaymentPaid(paymentId: number, providerReference?: string | null) {
  const db = await getDb();
  if (!db) return null;

  const [payment] = await db
    .select()
    .from(subscriptionPayments)
    .where(eq(subscriptionPayments.id, paymentId))
    .limit(1);
  if (!payment) return null;
  if (payment.status === "paid") return payment;

  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, payment.planId))
    .limit(1);
  if (!plan) return null;

  await db
    .update(subscriptionPayments)
    .set({
      status: "paid",
      providerReference: providerReference || payment.providerReference,
    })
    .where(eq(subscriptionPayments.id, paymentId));

  const today = new Date().toISOString().split("T")[0];
  const [existingSub] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, payment.userId),
        gte(subscriptions.endDate, today as any)
      )
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
      .where(eq(subscriptions.userId, payment.userId))
      .orderBy(desc(subscriptions.endDate))
      .limit(1);

    if (latestSub) {
      await db
        .update(subscriptions)
        .set({
          planId: payment.planId,
          status: "active",
          startDate: today as any,
          endDate: endDate as any,
        })
        .where(eq(subscriptions.id, latestSub.id));
    } else {
      await db.insert(subscriptions).values({
        userId: payment.userId,
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

  return payment;
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
