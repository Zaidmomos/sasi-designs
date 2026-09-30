// End-to-end checks against the running local stack (node tests/local-stack.mjs).
// Run with: node --test tests/e2e-api.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const SITE = "http://localhost:8888";
const SUPA = "http://localhost:54321";
const cfgText = await (await fetch(`${SITE}/config.js`)).text();
const ANON = cfgText.match(/supabaseAnonKey: "([^"]+)"/)[1];

const rest = (path, { token = ANON, method = "GET", body, prefer } = {}) =>
  fetch(`${SUPA}/rest/v1/${path}`, {
    method,
    headers: { apikey: ANON, authorization: `Bearer ${token}`, "content-type": "application/json", ...(prefer ? { prefer } : {}) },
    body: body && JSON.stringify(body),
  });
const login = async (email, password) =>
  (await (await fetch(`${SUPA}/auth/v1/token?grant_type=password`, { method: "POST", body: JSON.stringify({ email, password }) })).json()).access_token;
const post = async (path, body, headers = {}) => {
  const r = await fetch(`${SITE}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

const products = await (await rest("products?select=*&order=sort_order")).json();
const [settings] = await (await rest("settings?select=*")).json();
const kurta = products.find((p) => p.type === "kurta");
const nighty = products.find((p) => p.type === "nighty");
const customer = { name: "Asha Rao", phone: "98765 43210", email: "asha@test.local", address: "12 MG Road, Indiranagar", city: "Bengaluru", pin: "560038" };
const admin = await login("owner1@test.local", "testpass1");
const outsider = await login("notadmin@test.local", "testpass3");
const getOrder = async (num) => (await (await rest(`orders?select=*,order_items(*)&order_number=eq.${num.replace("SD-", "")}`, { token: admin })).json())[0];

test("shop can list products", () => {
  assert.ok(products.length >= 1);
  assert.ok(products.every((p) => p.active), "hidden products are not public");
});

test("COD order is priced on the server and saved", async () => {
  const r = await post("/api/create-order", {
    items: [{ product_id: nighty.id, size: "L", qty: 1, price: 1 }],
    customer, payment_method: "cod", total: 1,
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const o = await getOrder(r.body.order_number);
  assert.equal(o.subtotal, nighty.price);
  assert.equal(o.shipping, nighty.price >= settings.free_shipping_above ? 0 : settings.shipping_fee);
  assert.equal(o.total, o.subtotal + o.shipping);
  assert.equal(o.status, "new");
  assert.equal(o.payment_status, "cod");
  assert.equal(o.ship_phone, "9876543210");
  assert.ok(o.notified_at, "alerts sent");
  assert.equal(o.order_items[0].product_name, nighty.name);
});

test("bad checkout input is rejected with a friendly message", async () => {
  const r = await post("/api/create-order", { items: [{ product_id: kurta.id, size: "XS", qty: 1 }], customer, payment_method: "cod" });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Size XS/);
  const r2 = await post("/api/create-order", "not json");
  assert.equal(r2.status, 400);
});

test("online payment: bad signature refused, good signature marks paid once", async () => {
  const r = await post("/api/create-order", { items: [{ product_id: kurta.id, size: "M", qty: 2 }], customer, payment_method: "online" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.razorpay.amount, kurta.price * 2 * 100);
  let o = await getOrder(r.body.order_number);
  assert.equal(o.status, "awaiting_payment");
  assert.equal(o.notified_at, null, "no alert before payment");

  const rzpOrder = r.body.razorpay.order_id;
  const bad = await post("/api/verify-payment", { razorpay_order_id: rzpOrder, razorpay_payment_id: "pay_1", razorpay_signature: "forged" });
  assert.equal(bad.status, 400);

  const sig = createHmac("sha256", "local_key_secret").update(`${rzpOrder}|pay_TEST1`).digest("hex");
  const good = await post("/api/verify-payment", { razorpay_order_id: rzpOrder, razorpay_payment_id: "pay_TEST1", razorpay_signature: sig });
  assert.equal(good.status, 200, JSON.stringify(good.body));
  assert.equal(good.body.payment_status, "paid");
  o = await getOrder(r.body.order_number);
  assert.equal(o.status, "new");
  assert.equal(o.payment_status, "paid");
  assert.equal(o.razorpay_payment_id, "pay_TEST1");
  const firstNotified = o.notified_at;

  // Razorpay's webhook arriving afterwards must not re-send alerts.
  const event = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_TEST1", order_id: rzpOrder } } } });
  const wh = await post("/api/razorpay-webhook", event, { "x-razorpay-signature": createHmac("sha256", "local_webhook_secret").update(event).digest("hex") });
  assert.equal(wh.status, 200);
  o = await getOrder(r.body.order_number);
  assert.equal(o.notified_at, firstNotified);
});

test("webhook alone confirms payment if the customer closed the browser", async () => {
  const r = await post("/api/create-order", { items: [{ product_id: kurta.id, size: "L", qty: 1 }], customer, payment_method: "online" });
  const rzpOrder = r.body.razorpay.order_id;
  const event = JSON.stringify({ event: "order.paid", payload: { payment: { entity: { id: "pay_TEST2", order_id: rzpOrder } } } });
  const forged = await post("/api/razorpay-webhook", event, { "x-razorpay-signature": "nope" });
  assert.equal(forged.status, 401);
  const wh = await post("/api/razorpay-webhook", event, { "x-razorpay-signature": createHmac("sha256", "local_webhook_secret").update(event).digest("hex") });
  assert.equal(wh.status, 200);
  const o = await getOrder(r.body.order_number);
  assert.equal(o.payment_status, "paid");
  assert.ok(o.notified_at);
});

test("public visitors cannot see customers or orders, or edit products", async () => {
  assert.deepEqual(await (await rest("customers?select=*")).json(), []);
  assert.deepEqual(await (await rest("orders?select=*")).json(), []);
  assert.deepEqual(await (await rest("order_items?select=*")).json(), []);
  const ins = await rest("products", { method: "POST", body: { type: "kurta", name: "Hack", price: 1 } });
  assert.ok(ins.status >= 400, `insert status ${ins.status}`);
  const upd = await (await rest(`products?id=eq.${kurta.id}`, { method: "PATCH", body: { price: 1 }, prefer: "return=representation" })).json();
  assert.deepEqual(upd, []);
});

test("logged-in non-admins get nothing", async () => {
  assert.deepEqual(await (await rest("orders?select=*", { token: outsider })).json(), []);
  assert.deepEqual(await (await rest("customers?select=*", { token: outsider })).json(), []);
  const upd = await (await rest("settings?id=eq.1", { token: outsider, method: "PATCH", body: { shipping_fee: 0 }, prefer: "return=representation" })).json();
  assert.deepEqual(upd, []);
});

test("admins can manage orders but not change amounts", async () => {
  const orders = await (await rest("orders?select=id,total&limit=1", { token: admin })).json();
  assert.equal(orders.length, 1);
  const ok = await rest(`orders?id=eq.${orders[0].id}`, { token: admin, method: "PATCH", body: { status: "confirmed", tracking_info: "DTDC 1" } });
  assert.ok(ok.status < 300, `status update ${ok.status}`);
  const bad = await rest(`orders?id=eq.${orders[0].id}`, { token: admin, method: "PATCH", body: { total: 1 } });
  assert.ok(bad.status >= 400, `amount update should fail, got ${bad.status}`);
  const customers = await (await rest("customers?select=*&phone=eq.9876543210", { token: admin })).json();
  assert.equal(customers.length, 1, "guest checkouts with one phone share a customer record");
});
