// POST /api/verify-payment
// Called by the browser after Razorpay Checkout succeeds. Confirms the signature
// on the server before marking the order paid.
import { verifyCheckoutSignature, orderLabel } from "./_lib/order-logic.mjs";
import { db, env, json, readJson, markOrderPaid } from "./_lib/server.mjs";
import { notifyNewOrder } from "./_lib/notify.mjs";

export const config = { path: "/api/verify-payment" };

export default async (req) => {
  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    return json(err.status ?? 400, { error: err.message });
  }

  const { razorpay_order_id: rzpOrderId, razorpay_payment_id: rzpPaymentId, razorpay_signature: signature } = body ?? {};
  const valid = verifyCheckoutSignature({
    razorpayOrderId: rzpOrderId,
    razorpayPaymentId: rzpPaymentId,
    signature,
    secret: env("RAZORPAY_KEY_SECRET"),
  });
  if (!valid) return json(400, { error: "We couldn't verify this payment. If money was deducted, contact us with your order number." });

  try {
    await markOrderPaid({ razorpayOrderId: rzpOrderId, razorpayPaymentId: rzpPaymentId });

    const { data: order, error } = await db()
      .from("orders")
      .select("id, order_number, total, payment_status")
      .eq("razorpay_order_id", rzpOrderId)
      .single();
    if (error) throw error;

    await notifyNewOrder(order.id);
    return json(200, { order_number: orderLabel(order.order_number), total: order.total, payment_status: order.payment_status });
  } catch (err) {
    console.error("verify-payment failed:", err);
    return json(500, { error: "Your payment went through, but we couldn't update your order. We'll confirm it shortly." });
  }
};
