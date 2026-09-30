// Pure order logic: input validation, pricing and signature checks.
// No network or database access here, so it can be unit tested directly.
import { createHmac, timingSafeEqual } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LINES = 30;
const MAX_QTY = 10;

export class InputError extends Error {}

const clean = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Accepts 10-digit Indian mobiles with optional +91 / 91 / 0 prefix. Returns "9XXXXXXXXX". */
export function normalizePhone(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** Validates the checkout request body. Throws InputError with a customer-friendly message. */
export function validateCheckout(body) {
  if (!body || typeof body !== "object") throw new InputError("Invalid request.");
  if (body.website) throw new InputError("Invalid request."); // honeypot field

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw new InputError("Your bag is empty.");
  if (items.length > MAX_LINES) throw new InputError("Too many items in one order.");

  const lines = new Map();
  for (const it of items) {
    const productId = String(it?.product_id ?? "");
    const size = clean(it?.size, 8);
    const qty = Number(it?.qty);
    if (!UUID.test(productId) || !size || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      throw new InputError("Some items in your bag are invalid. Please refresh and try again.");
    }
    const key = `${productId}|${size}`;
    const merged = (lines.get(key)?.qty ?? 0) + qty;
    if (merged > MAX_QTY) throw new InputError(`You can order at most ${MAX_QTY} of one item.`);
    lines.set(key, { product_id: productId, size, qty: merged });
  }

  const c = body.customer ?? {};
  const customer = {
    name: clean(c.name, 80),
    phone: normalizePhone(c.phone),
    email: clean(c.email, 120).toLowerCase() || null,
    address: clean(c.address, 300),
    city: clean(c.city, 60),
    pin: clean(c.pin, 6),
    note: clean(c.note, 300) || null,
  };
  if (customer.name.length < 2) throw new InputError("Please enter your full name.");
  if (!customer.phone) throw new InputError("Please enter a valid 10-digit mobile number.");
  if (customer.email && !EMAIL.test(customer.email)) throw new InputError("Please enter a valid email address.");
  if (customer.address.length < 10) throw new InputError("Please enter your full delivery address.");
  if (customer.city.length < 2) throw new InputError("Please enter your city.");
  if (!/^[1-9]\d{5}$/.test(customer.pin)) throw new InputError("Please enter a valid 6-digit PIN code.");

  const paymentMethod = body.payment_method === "cod" ? "cod" : body.payment_method === "online" ? "online" : null;
  if (!paymentMethod) throw new InputError("Please choose a payment method.");

  return { lines: [...lines.values()], customer, paymentMethod };
}

/**
 * Prices the order from database products (never from prices sent by the browser).
 * products: rows from the products table. settings: the settings row.
 */
export function priceOrder(lines, products, settings) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const items = lines.map((l) => {
    const p = byId.get(l.product_id);
    if (!p || !p.active) throw new InputError("An item in your bag is no longer available. Please remove it and try again.");
    if (!p.in_stock) throw new InputError(`Sorry, "${p.name}" just went out of stock.`);
    if (!p.sizes.includes(l.size)) throw new InputError(`Size ${l.size} isn't available for "${p.name}".`);
    return {
      product_id: p.id,
      product_name: p.name,
      size: l.size,
      qty: l.qty,
      unit_price: p.price,
      line_total: p.price * l.qty,
    };
  });
  const subtotal = items.reduce((s, i) => s + i.line_total, 0);
  const shipping = subtotal >= settings.free_shipping_above ? 0 : settings.shipping_fee;
  return { items, subtotal, shipping, total: subtotal + shipping };
}

function safeEqualHex(a, b) {
  const x = Buffer.from(String(a), "utf8");
  const y = Buffer.from(String(b), "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Razorpay Checkout success signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyCheckoutSignature({ razorpayOrderId, razorpayPaymentId, signature, secret }) {
  if (!razorpayOrderId || !razorpayPaymentId || !signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Razorpay webhook signature: HMAC_SHA256(raw request body, webhook secret). */
export function verifyWebhookSignature({ rawBody, signature, secret }) {
  if (!rawBody || !signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}

export const orderLabel = (n) => `SD-${n}`;
export const rupee = (n) => "₹" + Number(n).toLocaleString("en-IN");
