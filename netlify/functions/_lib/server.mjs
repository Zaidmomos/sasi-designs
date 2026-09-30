// Shared server helpers: Supabase admin client, env access, JSON responses.
import { createClient } from "@supabase/supabase-js";

export function env(name, { required = true } = {}) {
  const v = process.env[name];
  if (required && !v) throw new Error(`Missing environment variable ${name}`);
  return v ?? "";
}

let client;
/** Supabase client using the service role key. Server-side only: it bypasses Row Level Security. */
export function db() {
  client ??= createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export const json = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export async function readJson(req) {
  if (req.method !== "POST") throw Object.assign(new Error("Method not allowed"), { status: 405 });
  const text = await req.text();
  if (text.length > 20_000) throw Object.assign(new Error("Request too large"), { status: 413 });
  try { return JSON.parse(text); } catch { throw Object.assign(new Error("Invalid JSON"), { status: 400 }); }
}

/** Base URL for the Razorpay API (overridable so tests can point at a stub). */
export const razorpayBase = () => process.env.RAZORPAY_API_BASE || "https://api.razorpay.com/v1";

export async function createRazorpayOrder({ amountPaise, receipt, notes }) {
  const auth = Buffer.from(`${env("RAZORPAY_KEY_ID")}:${env("RAZORPAY_KEY_SECRET")}`).toString("base64");
  const res = await fetch(`${razorpayBase()}/orders`, {
    method: "POST",
    headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
    body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt, notes }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) {
    throw new Error(`Razorpay order failed (${res.status}): ${data?.error?.description ?? "unknown error"}`);
  }
  return data;
}

/**
 * Marks an order paid exactly once. Returns the updated order, or null if it was
 * already paid (so callers only send alerts the first time).
 */
export async function markOrderPaid({ razorpayOrderId, razorpayPaymentId }) {
  const { data, error } = await db()
    .from("orders")
    .update({
      payment_status: "paid",
      status: "new",
      razorpay_payment_id: razorpayPaymentId,
      paid_at: new Date().toISOString(),
    })
    .eq("razorpay_order_id", razorpayOrderId)
    .in("payment_status", ["unpaid", "failed"])
    .select("id, order_number")
    .maybeSingle();
  if (error) throw error;
  return data;
}
