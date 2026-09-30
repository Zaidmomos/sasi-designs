import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  InputError, normalizePhone, validateCheckout, priceOrder,
  verifyCheckoutSignature, verifyWebhookSignature,
} from "../netlify/functions/_lib/order-logic.mjs";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const products = [
  { id: P1, name: "Kurta", price: 1000, sizes: ["M", "L"], active: true, in_stock: true },
  { id: P2, name: "Nighty", price: 500, sizes: ["L"], active: true, in_stock: true },
];
const settings = { free_shipping_above: 999, shipping_fee: 79 };
const goodBody = () => ({
  items: [{ product_id: P1, size: "M", qty: 1 }],
  customer: { name: "Asha Rao", phone: "+91 98765 43210", email: "Asha@Example.com", address: "12 MG Road, Indiranagar", city: "Bengaluru", pin: "560038" },
  payment_method: "cod",
});

test("normalizePhone accepts common Indian formats", () => {
  assert.equal(normalizePhone("9876543210"), "9876543210");
  assert.equal(normalizePhone("+91 98765-43210"), "9876543210");
  assert.equal(normalizePhone("09876543210"), "9876543210");
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizePhone("5876543210"), null);
});

test("validateCheckout cleans a good order", () => {
  const v = validateCheckout(goodBody());
  assert.equal(v.customer.phone, "9876543210");
  assert.equal(v.customer.email, "asha@example.com");
  assert.equal(v.paymentMethod, "cod");
  assert.deepEqual(v.lines, [{ product_id: P1, size: "M", qty: 1 }]);
});

test("validateCheckout merges duplicate lines and caps quantity", () => {
  const b = goodBody();
  b.items = [{ product_id: P1, size: "M", qty: 4 }, { product_id: P1, size: "M", qty: 3 }];
  assert.equal(validateCheckout(b).lines[0].qty, 7);
  b.items.push({ product_id: P1, size: "M", qty: 5 });
  assert.throws(() => validateCheckout(b), InputError);
});

test("validateCheckout rejects bad input", () => {
  const cases = [
    (b) => (b.items = []),
    (b) => (b.items[0].qty = 0),
    (b) => (b.items[0].qty = 1.5),
    (b) => (b.items[0].product_id = "not-a-uuid"),
    (b) => (b.customer.phone = "123"),
    (b) => (b.customer.pin = "012345"),
    (b) => (b.customer.address = "short"),
    (b) => (b.customer.email = "nope"),
    (b) => (b.payment_method = "bitcoin"),
    (b) => (b.website = "http://spam"),
  ];
  for (const mutate of cases) {
    const b = goodBody();
    mutate(b);
    assert.throws(() => validateCheckout(b), InputError, JSON.stringify(b));
  }
});

test("priceOrder uses database prices and applies shipping", () => {
  const small = priceOrder([{ product_id: P2, size: "L", qty: 1 }], products, settings);
  assert.deepEqual([small.subtotal, small.shipping, small.total], [500, 79, 579]);
  const big = priceOrder([{ product_id: P1, size: "L", qty: 1 }, { product_id: P2, size: "L", qty: 2 }], products, settings);
  assert.deepEqual([big.subtotal, big.shipping, big.total], [2000, 0, 2000]);
  assert.equal(big.items[1].line_total, 1000);
});

test("priceOrder refuses unavailable products and sizes", () => {
  assert.throws(() => priceOrder([{ product_id: P2, size: "M", qty: 1 }], products, settings), /Size M/);
  const soldOut = [{ ...products[0], in_stock: false }];
  assert.throws(() => priceOrder([{ product_id: P1, size: "M", qty: 1 }], soldOut, settings), /out of stock/);
  assert.throws(() => priceOrder([{ product_id: P1, size: "M", qty: 1 }], [], settings), /no longer available/);
});

test("Razorpay checkout signature is verified", () => {
  const secret = "test_secret";
  const signature = createHmac("sha256", secret).update("order_1|pay_1").digest("hex");
  assert.ok(verifyCheckoutSignature({ razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", signature, secret }));
  assert.ok(!verifyCheckoutSignature({ razorpayOrderId: "order_2", razorpayPaymentId: "pay_1", signature, secret }));
  assert.ok(!verifyCheckoutSignature({ razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", signature: "00", secret }));
});

test("Razorpay webhook signature is verified", () => {
  const secret = "whsec";
  const rawBody = JSON.stringify({ event: "payment.captured" });
  const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
  assert.ok(verifyWebhookSignature({ rawBody, signature, secret }));
  assert.ok(!verifyWebhookSignature({ rawBody: rawBody + " ", signature, secret }));
});
