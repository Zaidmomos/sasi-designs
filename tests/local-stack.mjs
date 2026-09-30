// Local end-to-end test stack (no Docker or accounts needed).
//
//   :8888  the website (public/) + the Netlify functions under /api/*
//   :54321 a stand-in for Supabase: /rest/v1 proxied to PostgREST, a tiny
//          password login at /auth/v1, and file storage at /storage/v1.
//          Also fakes the Razorpay orders API and the WhatsApp Cloud API.
//   :2525  an SMTP server that prints received emails.
//
// Needs Postgres (with tests/supabase-shim.sql + supabase/schema.sql loaded)
// and PostgREST running with tests/postgrest.conf. See tests/README.md.
import http from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { SMTPServer } from "smtp-server";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const JWT_SECRET = "local-test-secret-at-least-32-characters-long";
const POSTGREST = "http://localhost:3001";
const STORE_DIR = join(process.env.TMPDIR || "/tmp", "sasi-storage");
export const log = { emails: [], whatsapp: [], razorpayOrders: [] };

const b64url = (b) => Buffer.from(b).toString("base64url");
export function signJwt(payload) {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 * 24, ...payload }));
  const sig = createHmac("sha256", JWT_SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
export const ANON_KEY = signJwt({ role: "anon" });
export const SERVICE_KEY = signJwt({ role: "service_role" });

Object.assign(process.env, {
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  RAZORPAY_KEY_ID: "rzp_test_local",
  RAZORPAY_KEY_SECRET: "local_key_secret",
  RAZORPAY_WEBHOOK_SECRET: "local_webhook_secret",
  RAZORPAY_API_BASE: "http://localhost:54321/razorpay/v1",
  SMTP_HOST: "localhost", SMTP_PORT: "2525", SMTP_USER: "shop@test.local", SMTP_PASS: "x",
  EMAIL_FROM: "Sasi Designs <shop@test.local>",
  ALERT_EMAILS: "owner1@test.local,owner2@test.local",
  WHATSAPP_TOKEN: "local", WHATSAPP_PHONE_NUMBER_ID: "123", ALERT_WHATSAPP_NUMBERS: "919000000001,919000000002",
  WHATSAPP_API_BASE: "http://localhost:54321/whatsapp",
  URL: "http://localhost:8888",
});

const readBody = (req) => new Promise((res) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => res(Buffer.concat(c))); });
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  "access-control-expose-headers": "content-range, content-profile",
};
function send(res, status, data, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...cors, ...headers });
  res.end(typeof data === "string" || Buffer.isBuffer(data) ? data : JSON.stringify(data));
}

/* ---------------- Fake Supabase / Razorpay / WhatsApp ---------------- */

// Reads auth.users directly, since PostgREST only exposes the public schema.
async function pg(sql) {
  const { execFileSync } = await import("node:child_process");
  return execFileSync("/opt/homebrew/opt/postgresql@14/bin/psql", ["postgresql://postgres@localhost:55432/sasi", "-tAc", sql]).toString().trim();
}

const supa = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, "");
  const url = new URL(req.url, "http://x");
  const body = await readBody(req);

  if (url.pathname.startsWith("/rest/v1/")) {
    const headers = { ...req.headers };
    delete headers.host;
    headers.authorization = headers.authorization || `Bearer ${headers.apikey}`;
    const r = await fetch(POSTGREST + url.pathname.slice(8) + url.search, {
      method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
    });
    const out = Buffer.from(await r.arrayBuffer());
    const h = {};
    for (const k of ["content-type", "content-range", "preference-applied"]) if (r.headers.get(k)) h[k] = r.headers.get(k);
    return send(res, r.status, out, h);
  }

  if (url.pathname === "/auth/v1/token") {
    const { email, password } = JSON.parse(body.toString() || "{}");
    const esc = (s) => String(s).replace(/'/g, "''");
    const row = await pg(`select id from auth.users where email='${esc(email)}' and password='${esc(password)}'`);
    if (!row) return send(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials", msg: "Invalid login credentials", code: 400 });
    const user = { id: row, aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
    const access_token = signJwt({ sub: row, role: "authenticated", email, aud: "authenticated" });
    return send(res, 200, { access_token, token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: randomUUID(), user });
  }
  if (url.pathname === "/auth/v1/user") {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    const claims = JSON.parse(Buffer.from(token.split(".")[1] || "", "base64url").toString() || "{}");
    return send(res, 200, { id: claims.sub, email: claims.email, aud: "authenticated", role: "authenticated" });
  }
  if (url.pathname === "/auth/v1/logout") return send(res, 204, "");

  const up = url.pathname.match(/^\/storage\/v1\/object\/product-images\/(.+)$/);
  if (up && req.method === "POST") {
    await mkdir(STORE_DIR, { recursive: true });
    let file = body;
    const boundary = (req.headers["content-type"] || "").match(/boundary=(.+)$/)?.[1];
    if (boundary) {
      // supabase-js sends Blobs as multipart/form-data; keep only the file part.
      const parts = body.toString("latin1").split(`--${boundary}`);
      const part = parts.find((p) => /filename=|content-type: image/i.test(p)) ?? "";
      file = Buffer.from(part.slice(part.indexOf("\r\n\r\n") + 4).replace(/\r\n$/, ""), "latin1");
    }
    await writeFile(join(STORE_DIR, normalize(up[1]).replace(/^(\.\.\/)+/, "")), file);
    return send(res, 200, { Key: `product-images/${up[1]}` });
  }
  if (url.pathname === "/storage/v1/object/product-images" && req.method === "DELETE") return send(res, 200, []);
  const pub = url.pathname.match(/^\/storage\/v1\/object\/public\/product-images\/(.+)$/);
  if (pub) {
    try { return send(res, 200, await readFile(join(STORE_DIR, normalize(pub[1]))), { "content-type": "image/jpeg" }); }
    catch { return send(res, 404, { error: "not found" }); }
  }

  if (url.pathname === "/razorpay/v1/orders") {
    const auth = Buffer.from((req.headers.authorization || "").replace("Basic ", ""), "base64").toString();
    if (auth !== "rzp_test_local:local_key_secret") return send(res, 401, { error: { description: "Authentication failed" } });
    const input = JSON.parse(body.toString());
    const order = { id: `order_${randomUUID().replace(/-/g, "").slice(0, 14)}`, amount: input.amount, currency: input.currency, receipt: input.receipt, status: "created" };
    log.razorpayOrders.push(order);
    return send(res, 200, order);
  }
  if (url.pathname.startsWith("/whatsapp/")) {
    const msg = JSON.parse(body.toString());
    log.whatsapp.push(msg);
    console.log(`[whatsapp] to ${msg.to}: ${msg.template.components[0].parameters.map((p) => p.text).join(" | ")}`);
    return send(res, 200, { messages: [{ id: "wamid.local" }] });
  }
  send(res, 404, { error: `No stub for ${req.method} ${url.pathname}` });
});

/* ---------------- Website + functions ---------------- */

const functions = {
  "/api/create-order": (await import("../netlify/functions/create-order.mjs")).default,
  "/api/verify-payment": (await import("../netlify/functions/verify-payment.mjs")).default,
  "/api/razorpay-webhook": (await import("../netlify/functions/razorpay-webhook.mjs")).default,
};
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg" };

const site = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:8888");
  const fn = functions[url.pathname];
  if (fn) {
    const body = await readBody(req);
    const request = new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
    const response = await fn(request, {});
    res.writeHead(response.status, Object.fromEntries(response.headers));
    return res.end(Buffer.from(await response.arrayBuffer()));
  }
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  if (path.endsWith("/")) path += "index.html";
  try {
    let data = await readFile(join(ROOT, "public", path));
    if (path === "/config.js") {
      data = `window.SASI_CONFIG = { supabaseUrl: "http://localhost:54321", supabaseAnonKey: "${ANON_KEY}" };`;
    }
    res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

const smtp = new SMTPServer({
  authOptional: true, allowInsecureAuth: true, disabledCommands: ["STARTTLS"],
  onAuth(auth, session, cb) { cb(null, { user: auth.username }); },
  onData(stream, session, cb) {
    let raw = "";
    stream.on("data", (d) => (raw += d));
    stream.on("end", () => {
      const subject = raw.match(/^Subject: (.*)$/m)?.[1] ?? "";
      const to = session.envelope.rcptTo.map((r) => r.address);
      log.emails.push({ to, subject, raw });
      console.log(`[email] to ${to.join(", ")}: ${subject}`);
      cb();
    });
  },
});

export async function start() {
  await Promise.all([
    new Promise((r) => supa.listen(54321, r)),
    new Promise((r) => site.listen(8888, r)),
    new Promise((r) => smtp.listen(2525, r)),
  ]);
}
export function stop() {
  supa.close(); site.close(); smtp.close();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await start();
  console.log("Shop:  http://localhost:8888\nAdmin: http://localhost:8888/admin/");
}
