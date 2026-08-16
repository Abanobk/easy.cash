import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { paymobSettings, subscriptionPayments } from "../drizzle/schema";
import {
  parsePaymentReference,
  paymobHmacMatches,
  paymobTransactionState,
  loadPaymobSecrets,
} from "./paymob";
import {
  activateSubscriptionPayment,
  markSubscriptionPaymentFailed,
  markSubscriptionPaymentPaid,
} from "./paymob-subscription";
import { getSaasSessionFromRequest } from "./saas-auth";
import { paymobRequireHmac } from "./security-secrets";

async function getPaymobHmacSecret() {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(paymobSettings).limit(1);
  if (!row?.encryptedSecret) return null;
  const secret = loadPaymobSecrets(row.encryptedSecret);
  return secret.hmacSecret || null;
}

function resolvePaymentId(payload: Record<string, unknown>): number | null {
  const fromQuery = Number(payload.paymentId);
  if (Number.isFinite(fromQuery) && fromQuery > 0) return fromQuery;
  const reference = String(payload.special_reference || payload.merchant_order_id || payload.order_id || "");
  return parsePaymentReference(reference);
}

export function registerPaymobRoutes(app: Express) {
  app.post("/api/webhooks/paymob", async (req: Request, res: Response) => {
    try {
      const payload = req.body as Record<string, unknown>;
      const obj = ((payload.obj as Record<string, unknown> | undefined) ?? payload) as Record<string, unknown>;
      const receivedHmac = String((req.query as Record<string, unknown>).hmac || "");
      const reference = String(obj.special_reference || obj.merchant_order_id || obj.order_id || "");
      const paymentId = parsePaymentReference(reference);

      if (!paymentId) {
        res.json({ ok: true, ignored: true });
        return;
      }

      const hmacSecret = await getPaymobHmacSecret();
      if (paymobRequireHmac() && !hmacSecret) {
        res.status(503).json({ message: "Paymob HMAC غير مضبوط — ارفض الويب هوك" });
        return;
      }
      if (hmacSecret && !paymobHmacMatches(obj, hmacSecret, receivedHmac)) {
        res.status(401).json({ message: "Invalid Paymob webhook signature" });
        return;
      }
      if (!hmacSecret && !paymobRequireHmac()) {
        console.warn("[Paymob webhook] HMAC غير مضبوط — مسموح فقط في التطوير");
      }

      const { success, pending, transactionId, amountCents } = paymobTransactionState(obj);
      if (success) {
        await markSubscriptionPaymentPaid(paymentId, transactionId || null, amountCents);
      } else if (!pending) {
        await markSubscriptionPaymentFailed(paymentId, transactionId || null);
      }

      res.json({ ok: true });
    } catch (error) {
      console.error("[Paymob webhook]", error);
      res.status(500).json({ message: "Webhook processing failed" });
    }
  });

  app.get("/api/webhooks/paymob", (_req, res) => {
    res.json({ ok: true, service: "easy-cash-paymob" });
  });

  /** تأكيد الدفع عند الرجوع من Paymob — يتطلب جلسة المالك + HMAC في الإنتاج */
  app.post("/api/payments/paymob/return", async (req: Request, res: Response) => {
    try {
      const payload = req.body as Record<string, unknown>;
      const paymentId = resolvePaymentId(payload);
      if (!paymentId) {
        res.json({ ok: true, status: "ignored" });
        return;
      }

      const db = await getDb();
      if (!db) {
        res.status(500).json({ message: "قاعدة البيانات غير متاحة" });
        return;
      }

      const [payment] = await db
        .select()
        .from(subscriptionPayments)
        .where(eq(subscriptionPayments.id, paymentId))
        .limit(1);
      if (!payment) {
        res.status(404).json({ message: "عملية الدفع غير موجودة" });
        return;
      }

      const session = await getSaasSessionFromRequest(req);
      if (!session) {
        res.status(401).json({ message: "يجب تسجيل الدخول لتأكيد الدفع" });
        return;
      }
      if (payment.userId !== session.userId) {
        res.status(403).json({ message: "غير مصرح" });
        return;
      }

      if (payment.status === "paid") {
        res.json({ ok: true, status: "paid", paymentId });
        return;
      }

      const hmacSecret = await getPaymobHmacSecret();
      if (paymobRequireHmac() && !hmacSecret) {
        res.status(503).json({
          message: "HMAC غير مضبوط. أدخل HMAC Secret من السوبر أدمن → Paymob قبل تفعيل الاشتراكات.",
        });
        return;
      }

      if (hmacSecret) {
        const receivedHmac = String(payload.hmac || "");
        if (!paymobHmacMatches(payload, hmacSecret, receivedHmac)) {
          res.status(401).json({ message: "توقيع Paymob غير صالح" });
          return;
        }
      } else if (!paymobRequireHmac()) {
        console.warn("[Paymob return] تفعيل بدون HMAC — تطوير فقط");
      } else {
        res.status(401).json({ message: "توقيع Paymob مطلوب" });
        return;
      }

      const { success, pending, transactionId, amountCents } = paymobTransactionState(payload);

      if (success) {
        const result = await activateSubscriptionPayment(paymentId, {
          providerReference: transactionId || null,
          paidAmountCents: amountCents,
        });
        res.json({
          ok: result.ok,
          status: result.ok ? "paid" : "failed",
          message: result.ok ? "تم تفعيل الاشتراك" : result.reason,
          paymentId,
        });
        return;
      }
      if (!pending) {
        await markSubscriptionPaymentFailed(paymentId, transactionId || null);
      }
      res.json({
        ok: true,
        status: pending ? "pending" : "failed",
        message: pending
          ? "الدفع قيد المعالجة — سيُفعَّل بعد تأكيد Paymob"
          : "فشل الدفع",
        paymentId,
      });
    } catch (error) {
      console.error("[Paymob return]", error);
      res.status(500).json({ message: "تعذر معالجة رجوع الدفع" });
    }
  });
}
