// POST /api/create-order
// Validates the bag, prices it from the database, saves the customer and order,
// then either confirms a COD order or opens a Razorpay payment for an online one.
import { InputError, validateCheckout, priceOrder, orderLabel } from "./_lib/order-logic.mjs";
import { db, env, json, readJson, createRazorpayOrder } from "./_lib/server.mjs";
import { notifyNewOrder } from "./_lib/notify.mjs";

export const config = { path: "/api/create-order" };

export default async (req) => {
  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    return json(err.status ?? 400, { error: err.message });
  }

  try {
    const { lines, customer, paymentMethod } = validateCheckout(body);

    const [{ data: settings, error: sErr }, { data: products, error: pErr }] = await Promise.all([
      db().from("settings").select("*").single(),
      db().from("products").select("id, name, price, sizes, active, in_stock").in("id", [...new Set(lines.map((l) => l.product_id))]),
    ]);
    if (sErr) throw sErr;
    if (pErr) throw pErr;

    if (paymentMethod === "cod" && !settings.cod_enabled) throw new InputError("Cash on delivery isn't available right now.");
    if (paymentMethod === "online" && !settings.online_enabled) throw new InputError("Online payment isn't available right now.");

    const priced = priceOrder(lines, products, settings);

    // Guest checkout: one customer record per phone number, kept up to date.
    const { data: cust, error: cErr } = await db()
      .from("customers")
      .upsert(
        { phone: customer.phone, name: customer.name, email: customer.email, address: customer.address, city: customer.city, pin: customer.pin },
        { onConflict: "phone" },
      )
      .select("id")
      .single();
    if (cErr) throw cErr;

    const { data: order, error: oErr } = await db()
      .from("orders")
      .insert({
        customer_id: cust.id,
        status: paymentMethod === "online" ? "awaiting_payment" : "new",
        payment_method: paymentMethod,
        payment_status: paymentMethod === "online" ? "unpaid" : "cod",
        subtotal: priced.subtotal,
        shipping: priced.shipping,
        total: priced.total,
        ship_name: customer.name,
        ship_phone: customer.phone,
        ship_email: customer.email,
        ship_address: customer.address,
        ship_city: customer.city,
        ship_pin: customer.pin,
        customer_note: customer.note,
      })
      .select("id, order_number, total")
      .single();
    if (oErr) throw oErr;

    const { error: iErr } = await db()
      .from("order_items")
      .insert(priced.items.map((i) => ({ ...i, order_id: order.id })));
    if (iErr) {
      await db().from("orders").delete().eq("id", order.id);
      throw iErr;
    }

    if (paymentMethod === "cod") {
      await notifyNewOrder(order.id);
      return json(200, { order_id: order.id, order_number: orderLabel(order.order_number), total: order.total, payment_method: "cod" });
    }

    const rzp = await createRazorpayOrder({
      amountPaise: order.total * 100,
      receipt: orderLabel(order.order_number),
      notes: { order_id: order.id },
    });
    const { error: uErr } = await db().from("orders").update({ razorpay_order_id: rzp.id }).eq("id", order.id);
    if (uErr) throw uErr;

    return json(200, {
      order_id: order.id,
      order_number: orderLabel(order.order_number),
      total: order.total,
      payment_method: "online",
      razorpay: {
        key_id: env("RAZORPAY_KEY_ID"),
        order_id: rzp.id,
        amount: rzp.amount,
        currency: rzp.currency,
        name: settings.store_name,
        prefill: { name: customer.name, email: customer.email ?? "", contact: `+91${customer.phone}` },
      },
    });
  } catch (err) {
    if (err instanceof InputError) return json(400, { error: err.message });
    console.error("create-order failed:", err);
    return json(500, { error: "We couldn't place your order right now. Please try again in a minute." });
  }
};
