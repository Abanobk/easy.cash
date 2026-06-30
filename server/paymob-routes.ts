import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { paymobSettings } from "../drizzle/schema";
import {
  decodeSecret,
  parsePaymentReference,
  paymobHmacMatches,
  paymobTransactionState,
  type PaymobSecretConfig,
} from "./paymob";
import { markSubscriptionPaymentFailed, markSubscriptionPaymentPaid } from "./paymob-subscription";

async function getPaymobHmacSecret() {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(paymobSettings).limit(1);
  if (!row?.encryptedSecret) return null;
  const secret = decodeSecret<PaymobSecretConfig>(row.encryptedSecret);
  return secret.hmacSecret || null;
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
      if (hmacSecret && !paymobHmacMatches(obj, hmacSecret, receivedHmac)) {
        res.status(401).json({ message: "Invalid Paymob webhook signature" });
        return;
      }

      const { success, pending, transactionId } = paymobTransactionState(obj);
      if (success) {
        await markSubscriptionPaymentPaid(paymentId, transactionId || null);
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
}
