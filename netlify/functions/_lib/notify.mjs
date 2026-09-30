// New-order alerts: email (SMTP) to the store team and the customer, WhatsApp to the store team.
// Every channel is optional: if its environment variables aren't set, it is skipped.
// Alerts never throw, so a broken email setup can't lose an order.
import nodemailer from "nodemailer";
import { db } from "./server.mjs";
import { orderLabel, rupee } from "./order-logic.mjs";

const list = (v) => String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Sends alerts for an order once. Safe to call from several places (verify + webhook). */
export async function notifyNewOrder(orderId) {
  try {
    // Claim the order for notification; only the first caller gets a row back.
    const { data: claimed, error } = await db()
      .from("orders")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", orderId)
      .is("notified_at", null)
      .select("*, order_items(*)")
      .maybeSingle();
    if (error) throw error;
    if (!claimed) return;

    const { data: settings } = await db().from("settings").select("*").single();
    const results = await Promise.allSettled([
      sendStoreEmail(claimed),
      sendCustomerEmail(claimed, settings),
      sendStoreWhatsApp(claimed),
    ]);
    results.forEach((r) => r.status === "rejected" && console.error("Order alert failed:", r.reason));
  } catch (err) {
    console.error("notifyNewOrder failed:", err);
  }
}

/* ---------------- Email ---------------- */

let transport;
function mailer() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  const port = Number(process.env.SMTP_PORT || 465);
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transport;
}

const fromAddress = () => process.env.EMAIL_FROM || `Sasi Designs <${process.env.SMTP_USER}>`;
const paymentText = (o) => (o.payment_method === "cod" ? "Cash on delivery" : `Paid online (${o.razorpay_payment_id ?? "Razorpay"})`);

function itemsTable(o) {
  const rows = o.order_items
    .map((i) => `<tr><td style="padding:6px 0">${esc(i.product_name)} — Size ${esc(i.size)} × ${i.qty}</td>
      <td style="padding:6px 0;text-align:right">${rupee(i.line_total)}</td></tr>`)
    .join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}
    <tr><td style="padding:6px 0;border-top:1px solid #ddd">Shipping</td><td style="text-align:right;border-top:1px solid #ddd">${o.shipping ? rupee(o.shipping) : "Free"}</td></tr>
    <tr><td style="padding:6px 0"><strong>Total</strong></td><td style="text-align:right"><strong>${rupee(o.total)}</strong></td></tr></table>`;
}

async function sendStoreEmail(o) {
  const to = list(process.env.ALERT_EMAILS);
  const m = mailer();
  if (!m || !to.length) return;
  const site = process.env.URL || process.env.SITE_URL || "";
  await m.sendMail({
    from: fromAddress(),
    to,
    subject: `New order ${orderLabel(o.order_number)} — ${rupee(o.total)} (${o.payment_method === "cod" ? "COD" : "Paid"})`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px">
      <h2 style="margin:0 0 8px">New order ${orderLabel(o.order_number)}</h2>
      <p style="margin:0 0 16px">${esc(paymentText(o))}</p>
      ${itemsTable(o)}
      <h3 style="margin:20px 0 6px">Deliver to</h3>
      <p style="margin:0">${esc(o.ship_name)}<br>${esc(o.ship_phone)}${o.ship_email ? `<br>${esc(o.ship_email)}` : ""}<br>
      ${esc(o.ship_address)}<br>${esc(o.ship_city)} — ${esc(o.ship_pin)}</p>
      ${o.customer_note ? `<p><strong>Customer note:</strong> ${esc(o.customer_note)}</p>` : ""}
      ${site ? `<p><a href="${esc(site)}/admin/">Open the admin panel</a></p>` : ""}
    </div>`,
  });
}

async function sendCustomerEmail(o, settings) {
  const m = mailer();
  if (!m || !o.ship_email) return;
  const store = settings?.store_name || "Sasi Designs";
  await m.sendMail({
    from: fromAddress(),
    to: o.ship_email,
    replyTo: settings?.email || undefined,
    subject: `Your ${store} order ${orderLabel(o.order_number)} is confirmed`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px">
      <h2 style="margin:0 0 8px">Thank you, ${esc(o.ship_name)}!</h2>
      <p>We've received your order <strong>${orderLabel(o.order_number)}</strong>.
      ${o.payment_method === "cod" ? `Please keep ${rupee(o.total)} ready to pay on delivery.` : "Your payment was successful."}
      We'll let you know when it ships.</p>
      ${itemsTable(o)}
      <p style="margin-top:20px">Delivering to:<br>${esc(o.ship_address)}, ${esc(o.ship_city)} — ${esc(o.ship_pin)}</p>
      <p style="color:#777;font-size:13px">Questions? Reply to this email${settings?.phone_display ? ` or WhatsApp us on ${esc(settings.phone_display)}` : ""}.</p>
    </div>`,
  });
}

/* ---------------- WhatsApp (Meta WhatsApp Cloud API) ---------------- */

async function sendStoreWhatsApp(o) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const to = list(process.env.ALERT_WHATSAPP_NUMBERS);
  if (!token || !phoneId || !to.length) return;

  // Template variables can't contain line breaks or tabs.
  const flat = (s) => String(s ?? "").replace(/[\n\t]+/g, " ").replace(/ {4,}/g, " ").slice(0, 200);
  const params = [
    orderLabel(o.order_number),
    flat(o.ship_name),
    rupee(o.total),
    o.payment_method === "cod" ? "Cash on delivery" : "Paid online",
    flat(`${o.ship_city} ${o.ship_pin}`),
  ].map((text) => ({ type: "text", text }));

  const base = process.env.WHATSAPP_API_BASE || "https://graph.facebook.com/v21.0";
  await Promise.all(
    to.map(async (number) => {
      const res = await fetch(`${base}/${phoneId}/messages`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: number.replace(/\D/g, ""),
          type: "template",
          template: {
            name: process.env.WHATSAPP_TEMPLATE || "new_order_alert",
            language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "en" },
            components: [{ type: "body", parameters: params }],
          },
        }),
      });
      if (!res.ok) throw new Error(`WhatsApp alert to ${number} failed (${res.status}): ${await res.text()}`);
    }),
  );
}
