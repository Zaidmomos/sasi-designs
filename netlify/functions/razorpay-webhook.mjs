// POST /api/razorpay-webhook
// Razorpay calls this directly, so orders are marked paid even if the customer
// closes the browser before returning to the site.
// Subscribe to: payment.captured, order.paid, payment.failed
import { verifyWebhookSignature } from "./_lib/order-logic.mjs";
import { db, env, json, markOrderPaid } from "./_lib/server.mjs";
import { notifyNewOrder } from "./_lib/notify.mjs";

export const config = { path: "/api/razorpay-webhook" };

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const rawBody = await req.text();
  const valid = verifyWebhookSignature({
    rawBody,
    signature: req.headers.get("x-razorpay-signature"),
    secret: env("RAZORPAY_WEBHOOK_SECRET"),
  });
  if (!valid) return json(401, { error: "Invalid signature" });

  try {
    const event = JSON.parse(rawBody);
    const payment = event?.payload?.payment?.entity;
    const rzpOrderId = payment?.order_id ?? event?.payload?.order?.entity?.id;
    if (!rzpOrderId) return json(200, { ok: true, ignored: true });

    if (event.event === "payment.captured" || event.event === "order.paid") {
      const updated = await markOrderPaid({ razorpayOrderId: rzpOrderId, razorpayPaymentId: payment?.id ?? null });
      if (updated) await notifyNewOrder(updated.id);
    } else if (event.event === "payment.failed") {
      await db().from("orders").update({ payment_status: "failed" }).eq("razorpay_order_id", rzpOrderId).eq("payment_status", "unpaid");
    }
    return json(200, { ok: true });
  } catch (err) {
    console.error("razorpay-webhook failed:", err);
    // A non-2xx response makes Razorpay retry later.
    return json(500, { error: "Webhook processing failed" });
  }
};
