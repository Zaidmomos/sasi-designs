import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const rupee = (n) => "₹" + Number(n ?? 0).toLocaleString("en-IN");
const label = (n) => `SD-${n}`;
const fmtDate = (d) => new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const fmtDay = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const cfg = window.SASI_CONFIG || {};
if (!cfg.supabaseUrl || cfg.supabaseUrl.includes("YOUR-PROJECT")) {
  document.body.innerHTML = `<p style="padding:2rem;font-family:sans-serif">Admin isn't connected yet: add your Supabase URL and anon key to <code>public/config.js</code>.</p>`;
  throw new Error("Supabase not configured");
}
const sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

const STANDARD_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "Free size"];
const STATUS = {
  awaiting_payment: { t: "Awaiting payment", c: "grey" },
  new: { t: "New", c: "red" },
  confirmed: { t: "Confirmed", c: "amber" },
  shipped: { t: "Shipped", c: "blue" },
  delivered: { t: "Delivered", c: "green" },
  cancelled: { t: "Cancelled", c: "grey" },
};
const PAYMENT = {
  paid: { t: "Paid online", c: "green" },
  cod: { t: "COD", c: "amber" },
  unpaid: { t: "Unpaid", c: "grey" },
  failed: { t: "Payment failed", c: "red" },
  refunded: { t: "Refunded", c: "grey" },
};
const badge = (map, key) => `<span class="badge ${map[key]?.c ?? "grey"}">${esc(map[key]?.t ?? key)}</span>`;

let toastTimer;
function toast(text, bad = false) {
  const t = $("#toast");
  t.textContent = text;
  t.classList.toggle("bad", bad);
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}

function fail(err, fallback = "Something went wrong.") {
  console.error(err);
  toast(err?.message || fallback, true);
}

/** Wraps spreadsheet cells so values like "=SUM()" can't run as formulas. */
function downloadCSV(filename, rows) {
  const cell = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const blob = new Blob(["﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* =============================== Auth =============================== */

let session = null;
let started = false;

function showAuth(which = "login") {
  $("#appView").hidden = true;
  $("#authView").hidden = false;
  $("#loginForm").hidden = which !== "login";
  $("#resetForm").hidden = which !== "reset";
}

async function enterApp() {
  const { data: isAdmin, error } = await sb.rpc("is_admin");
  if (error || !isAdmin) {
    await sb.auth.signOut();
    showAuth("login");
    $("#loginMsg").textContent = error ? error.message : "This account isn't a store admin.";
    return;
  }
  $("#authView").hidden = true;
  $("#appView").hidden = false;
  $("#whoEmail").textContent = session.user.email;
  if (!started) {
    started = true;
    switchTab(location.hash.slice(1) || "orders");
  }
}

sb.auth.onAuthStateChange((event, s) => {
  session = s;
  if (event === "PASSWORD_RECOVERY") return showAuth("reset");
  if (event === "SIGNED_OUT") { started = false; return showAuth("login"); }
  if (s && (event === "INITIAL_SESSION" || event === "SIGNED_IN")) setTimeout(enterApp, 0);
  else if (!s && event === "INITIAL_SESSION") showAuth("login");
});

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  $("#loginMsg").textContent = "";
  const { error } = await sb.auth.signInWithPassword({ email: f.get("email"), password: f.get("password") });
  if (error) $("#loginMsg").textContent = error.message === "Invalid login credentials" ? "Wrong email or password." : error.message;
});

$("#forgotBtn").addEventListener("click", async () => {
  const email = $("#loginForm [name=email]").value.trim();
  if (!email) return ($("#loginMsg").textContent = "Enter your email above first.");
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  $("#loginMsg").textContent = error ? error.message : "If that email is an admin, a reset link is on its way.";
});

$("#resetForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = await sb.auth.updateUser({ password: new FormData(e.target).get("password") });
  if (error) return ($("#resetMsg").textContent = error.message);
  history.replaceState(null, "", location.pathname);
  toast("Password updated.");
  enterApp();
});

$("#signOut").addEventListener("click", () => sb.auth.signOut());

/* =============================== Tabs =============================== */

const loaders = { orders: loadOrders, products: loadProducts, customers: loadCustomers, settings: loadSettings };

function switchTab(name) {
  if (!loaders[name]) name = "orders";
  $$("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $$("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== name));
  history.replaceState(null, "", `#${name}`);
  loaders[name]();
}
$$("#tabs button").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

/* Sheets (side panels) */
let sheetReturnFocus = null;
function openSheet(id) {
  sheetReturnFocus = document.activeElement;
  $(id).hidden = false;
  document.body.classList.add("locked");
  requestAnimationFrame(() => $(id).classList.add("open"));
}
function closeSheet(el) {
  el.classList.remove("open");
  setTimeout(() => { el.hidden = true; if ($$(".sheet.open").length === 0) document.body.classList.remove("locked"); }, 200);
  sheetReturnFocus?.focus?.();
}
$$(".sheet").forEach((sh) => $$("[data-close-sheet]", sh).forEach((b) => b.addEventListener("click", () => closeSheet(sh))));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { const open = $$(".sheet.open").pop(); if (open) closeSheet(open); }
});

/* =============================== Orders =============================== */

const ORDER_FILTERS = [
  { k: "active", t: "To do", statuses: ["new", "confirmed"] },
  { k: "new", t: "New", statuses: ["new"] },
  { k: "confirmed", t: "Confirmed", statuses: ["confirmed"] },
  { k: "shipped", t: "Shipped", statuses: ["shipped"] },
  { k: "delivered", t: "Delivered", statuses: ["delivered"] },
  { k: "cancelled", t: "Cancelled", statuses: ["cancelled"] },
  { k: "unpaid", t: "Unfinished payments", statuses: ["awaiting_payment"] },
  { k: "all", t: "All", statuses: null },
];
const PAGE = 50;
let orderFilter = "active";
let orderSearch = "";
let orders = [];
let ordersEnd = false;
let settingsCache = null;

$("#orderFilters").innerHTML = ORDER_FILTERS.map((f) => `<button class="chip${f.k === orderFilter ? " active" : ""}" data-of="${f.k}">${f.t}</button>`).join("");
$("#orderFilters").addEventListener("click", (e) => {
  const b = e.target.closest("[data-of]");
  if (!b) return;
  orderFilter = b.dataset.of;
  $$("#orderFilters .chip").forEach((c) => c.classList.toggle("active", c === b));
  loadOrders();
});
let searchTimer;
$("#orderSearch").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { orderSearch = e.target.value.trim(); loadOrders(); }, 300);
});
$("#refreshOrders").addEventListener("click", () => loadOrders());
$("#moreOrders").addEventListener("click", () => loadOrders({ append: true }));

function orderQuery() {
  let q = sb.from("orders").select("*, order_items(product_name, size, qty, unit_price, line_total)").order("created_at", { ascending: false });
  const f = ORDER_FILTERS.find((x) => x.k === orderFilter);
  if (f.statuses) q = q.in("status", f.statuses);
  else q = q.neq("status", "awaiting_payment");
  if (orderSearch) {
    const digits = orderSearch.replace(/^sd-?/i, "").replace(/\D/g, "");
    const term = orderSearch.replace(/[,()%]/g, " ").trim();
    const parts = [`ship_name.ilike.%${term}%`, `ship_city.ilike.%${term}%`];
    if (digits) parts.push(`ship_phone.ilike.%${digits}%`);
    if (digits && digits.length <= 9) parts.push(`order_number.eq.${digits}`);
    q = q.or(parts.join(","));
  }
  return q;
}

async function loadOrders({ append = false } = {}) {
  const from = append ? orders.length : 0;
  if (!append) $("#ordersBody").innerHTML = `<tr><td colspan="7" class="empty">Loading…</td></tr>`;
  const { data, error } = await orderQuery().range(from, from + PAGE - 1);
  if (error) return fail(error);
  orders = append ? orders.concat(data) : data;
  ordersEnd = data.length < PAGE;
  renderOrders();
  loadStats();
}

function renderOrders() {
  $("#moreOrders").hidden = ordersEnd;
  if (!orders.length) {
    $("#ordersBody").innerHTML = `<tr><td colspan="7" class="empty">No orders here.</td></tr>`;
    return;
  }
  $("#ordersBody").innerHTML = orders.map((o) => `
    <tr data-order="${o.id}" tabindex="0">
      <td><strong>${label(o.order_number)}</strong></td>
      <td>${fmtDate(o.created_at)}</td>
      <td>${esc(o.ship_name)}<div class="muted small">${esc(o.ship_city)} · ${esc(o.ship_phone)}</div></td>
      <td>${o.order_items.reduce((s, i) => s + i.qty, 0)}</td>
      <td>${rupee(o.total)}</td>
      <td>${badge(PAYMENT, o.payment_status)}</td>
      <td>${badge(STATUS, o.status)}</td>
    </tr>`).join("");
}

$("#ordersBody").addEventListener("click", (e) => {
  const tr = e.target.closest("[data-order]");
  if (tr) openOrder(tr.dataset.order);
});
$("#ordersBody").addEventListener("keydown", (e) => {
  const tr = e.target.closest("[data-order]");
  if (tr && e.key === "Enter") openOrder(tr.dataset.order);
});

async function loadStats() {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [newQ, toShipQ, monthQ] = await Promise.all([
    sb.from("orders").select("id", { count: "exact", head: true }).eq("status", "new"),
    sb.from("orders").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
    sb.from("orders").select("total").gte("created_at", monthStart.toISOString()).not("status", "in", "(awaiting_payment,cancelled)"),
  ]);
  if (newQ.error || toShipQ.error || monthQ.error) return;
  const monthTotal = monthQ.data.reduce((s, o) => s + o.total, 0);
  $("#stats").innerHTML = `
    <div class="stat"><span>New orders</span><strong>${newQ.count}</strong></div>
    <div class="stat"><span>Confirmed, not shipped</span><strong>${toShipQ.count}</strong></div>
    <div class="stat"><span>Orders this month</span><strong>${monthQ.data.length}</strong></div>
    <div class="stat"><span>Sales this month</span><strong>${rupee(monthTotal)}</strong></div>`;
  $("#newCount").textContent = newQ.count;
  $("#newCount").hidden = !newQ.count;
}

$("#exportOrders").addEventListener("click", async () => {
  const { data, error } = await orderQuery().range(0, 4999);
  if (error) return fail(error);
  downloadCSV(`sasi-orders-${new Date().toISOString().slice(0, 10)}.csv`, [
    ["Order", "Date", "Status", "Payment method", "Payment status", "Razorpay payment ID", "Name", "Phone", "Email", "Address", "City", "PIN", "Items", "Subtotal", "Shipping", "Total", "Tracking", "Customer note", "Admin note"],
    ...data.map((o) => [
      label(o.order_number), new Date(o.created_at).toLocaleString("en-IN"), STATUS[o.status]?.t, o.payment_method, o.payment_status, o.razorpay_payment_id,
      o.ship_name, o.ship_phone, o.ship_email, o.ship_address, o.ship_city, o.ship_pin,
      o.order_items.map((i) => `${i.product_name} (${i.size}) x${i.qty}`).join("; "),
      o.subtotal, o.shipping, o.total, o.tracking_info, o.customer_note, o.admin_note,
    ]),
  ]);
});

async function getSettings() {
  if (settingsCache) return settingsCache;
  const { data } = await sb.from("settings").select("*").single();
  settingsCache = data;
  return data;
}

function waLink(o, kind) {
  const store = settingsCache?.store_name || "Sasi Designs";
  const msgs = {
    confirm: `Hello ${o.ship_name}, thank you for shopping with ${store}! Your order ${label(o.order_number)} (${rupee(o.total)}) is confirmed${o.payment_method === "cod" ? " and will be cash on delivery" : ""}. We'll update you when it ships.`,
    shipped: `Hello ${o.ship_name}, your ${store} order ${label(o.order_number)} has been shipped!${o.tracking_info ? ` Tracking: ${o.tracking_info}` : ""}`,
    blank: `Hello ${o.ship_name}, this is ${store} about your order ${label(o.order_number)}.`,
  };
  return `https://wa.me/91${o.ship_phone}?text=${encodeURIComponent(msgs[kind])}`;
}

async function openOrder(id) {
  const o = orders.find((x) => x.id === id);
  if (!o) return;
  await getSettings();
  const next = { new: "confirmed", confirmed: "shipped", shipped: "delivered" }[o.status];
  const address = `${o.ship_name}\n${o.ship_address}\n${o.ship_city} - ${o.ship_pin}\nPhone: ${o.ship_phone}`;
  $("#orderDetail").innerHTML = `
    <div class="od-head">
      <h2 id="orderTitle">Order ${label(o.order_number)}</h2>
      <p class="muted">${fmtDate(o.created_at)}</p>
      <div class="badges">${badge(STATUS, o.status)} ${badge(PAYMENT, o.payment_status)}</div>
    </div>

    <div class="od-section">
      <h3>Items</h3>
      <table class="items">
        ${o.order_items.map((i) => `<tr><td>${esc(i.product_name)}<div class="muted small">Size ${esc(i.size)} · ${rupee(i.unit_price)} × ${i.qty}</div></td><td>${rupee(i.line_total)}</td></tr>`).join("")}
        <tr class="sub"><td>Subtotal</td><td>${rupee(o.subtotal)}</td></tr>
        <tr class="sub"><td>Shipping</td><td>${o.shipping ? rupee(o.shipping) : "Free"}</td></tr>
        <tr class="grand"><td>Total</td><td>${rupee(o.total)}</td></tr>
      </table>
      <p class="small muted">${o.payment_method === "cod" ? "Collect cash on delivery." : `Paid online${o.razorpay_payment_id ? ` · Razorpay ID ${esc(o.razorpay_payment_id)}` : ""}${o.paid_at ? ` · ${fmtDate(o.paid_at)}` : ""}`}</p>
    </div>

    <div class="od-section">
      <h3>Customer</h3>
      <pre class="address">${esc(address)}</pre>
      ${o.ship_email ? `<p class="small"><a href="mailto:${esc(o.ship_email)}">${esc(o.ship_email)}</a></p>` : ""}
      <div class="btn-row">
        <button class="btn btn-ghost btn-sm" id="copyAddr">Copy address</button>
        <a class="btn btn-ghost btn-sm" href="tel:+91${esc(o.ship_phone)}">Call</a>
        <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${waLink(o, "blank")}">WhatsApp</a>
      </div>
      ${o.customer_note ? `<p class="note"><strong>Customer note:</strong> ${esc(o.customer_note)}</p>` : ""}
    </div>

    <form class="od-section" id="orderForm">
      <h3>Update order</h3>
      ${o.status === "awaiting_payment" ? `<p class="note">The customer started paying online but didn't finish. Don't ship this unless they pay. It updates by itself if Razorpay confirms payment.</p>` : ""}
      <label>Status
        <select name="status">
          ${Object.entries(STATUS).filter(([k]) => k !== "awaiting_payment" || o.status === "awaiting_payment")
            .map(([k, v]) => `<option value="${k}"${k === o.status ? " selected" : ""}>${v.t}</option>`).join("")}
        </select>
      </label>
      <label>Courier &amp; tracking number<input name="tracking_info" maxlength="200" value="${esc(o.tracking_info)}" placeholder="e.g. DTDC 123456789"></label>
      <label>Private note <small>only admins see this</small><textarea name="admin_note" rows="2" maxlength="1000">${esc(o.admin_note)}</textarea></label>
      <div class="btn-row">
        <button class="btn btn-primary btn-sm" type="submit">Save</button>
        ${next ? `<button class="btn btn-ghost btn-sm" type="button" id="advance">Mark as ${STATUS[next].t.toLowerCase()}</button>` : ""}
      </div>
      <div class="wa-quick">
        <span class="small muted">Message the customer:</span>
        <a class="link" target="_blank" rel="noopener" href="${waLink(o, "confirm")}">Order confirmed</a>
        <a class="link" target="_blank" rel="noopener" href="${waLink(o, "shipped")}">Order shipped</a>
      </div>
    </form>`;

  $("#copyAddr").addEventListener("click", () => navigator.clipboard.writeText(address).then(() => toast("Address copied.")));
  const form = $("#orderForm");
  const save = async (patch) => {
    const { data, error } = await sb.from("orders").update(patch).eq("id", o.id).select("*, order_items(product_name, size, qty, unit_price, line_total)").single();
    if (error) return fail(error);
    Object.assign(o, data);
    toast(`Order ${label(o.order_number)} saved.`);
    renderOrders();
    loadStats();
    openOrder(o.id);
  };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(form);
    save({ status: f.get("status"), tracking_info: f.get("tracking_info").trim() || null, admin_note: f.get("admin_note").trim() || null });
  });
  $("#advance")?.addEventListener("click", () => {
    const f = new FormData(form);
    save({ status: next, tracking_info: f.get("tracking_info").trim() || null, admin_note: f.get("admin_note").trim() || null });
  });
  if ($("#orderSheet").hidden) openSheet("#orderSheet");
}

/* =============================== Products =============================== */

let products = [];
let productFilter = "all";
let productSearch = "";
let editing = null; // product being edited, or {} for new
let pendingPhoto = null; // { blob, url } waiting to upload
let removePhoto = false;

$("#productFilters").addEventListener("click", (e) => {
  const b = e.target.closest("[data-pf]");
  if (!b) return;
  productFilter = b.dataset.pf;
  $$("#productFilters .chip").forEach((c) => c.classList.toggle("active", c === b));
  renderProducts();
});
$("#productSearch").addEventListener("input", (e) => { productSearch = e.target.value.trim().toLowerCase(); renderProducts(); });
$("#addProduct").addEventListener("click", () => editProduct(null));

async function loadProducts() {
  const { data, error } = await sb.from("products").select("*").order("sort_order").order("created_at");
  if (error) return fail(error);
  products = data;
  renderProducts();
}

const productMedia = (p) =>
  p.image_url ? `<img src="${esc(p.image_url)}" alt="" loading="lazy">` : window.SasiGarment.svg(p, { withBg: false });

function renderProducts() {
  const list = products.filter((p) => {
    if (productFilter === "nighty" || productFilter === "kurta") { if (p.type !== productFilter) return false; }
    if (productFilter === "hidden" && p.active) return false;
    if (productFilter === "soldout" && p.in_stock) return false;
    return !productSearch || `${p.name} ${p.fabric} ${p.tag ?? ""}`.toLowerCase().includes(productSearch);
  });
  if (!list.length) {
    $("#productList").innerHTML = `<p class="empty">No products match.</p>`;
    return;
  }
  $("#productList").innerHTML = list.map((p) => `
    <article class="p-card${p.active ? "" : " is-hidden"}">
      <button class="p-media" data-edit="${p.id}" aria-label="Edit ${esc(p.name)}">${productMedia(p)}</button>
      <div class="p-body">
        <p class="muted small">${p.type === "nighty" ? "Nighty" : "Kurta"}${p.tag ? ` · ${esc(p.tag)}` : ""}</p>
        <h3>${esc(p.name)}</h3>
        <p><strong>${rupee(p.price)}</strong>${p.mrp ? ` <s class="muted small">${rupee(p.mrp)}</s>` : ""}</p>
        <div class="toggles">
          <label class="switch"><input type="checkbox" data-toggle="active" data-id="${p.id}"${p.active ? " checked" : ""}><span></span>Visible</label>
          <label class="switch"><input type="checkbox" data-toggle="in_stock" data-id="${p.id}"${p.in_stock ? " checked" : ""}><span></span>In stock</label>
        </div>
        <button class="btn btn-ghost btn-sm" data-edit="${p.id}">Edit</button>
      </div>
    </article>`).join("");
}

$("#productList").addEventListener("click", (e) => {
  const b = e.target.closest("[data-edit]");
  if (b) editProduct(products.find((p) => p.id === b.dataset.edit));
});
$("#productList").addEventListener("change", async (e) => {
  const t = e.target.closest("[data-toggle]");
  if (!t) return;
  const field = t.dataset.toggle;
  const { error } = await sb.from("products").update({ [field]: t.checked }).eq("id", t.dataset.id);
  if (error) { t.checked = !t.checked; return fail(error); }
  const p = products.find((x) => x.id === t.dataset.id);
  p[field] = t.checked;
  toast(`${p.name}: ${field === "active" ? (t.checked ? "visible in shop" : "hidden from shop") : (t.checked ? "in stock" : "sold out")}.`);
  renderProducts();
});

function editProduct(p) {
  editing = p ?? {};
  pendingPhoto = null;
  removePhoto = false;
  const f = $("#productForm");
  f.reset();
  $("#productTitle").textContent = p ? "Edit product" : "Add product";
  $("#productMsg").textContent = "";
  f.name.value = p?.name ?? "";
  f.type.value = p?.type ?? "nighty";
  f.tag.value = p?.tag ?? "";
  f.price.value = p?.price ?? "";
  f.mrp.value = p?.mrp ?? "";
  f.fabric.value = p?.fabric ?? "";
  f.description.value = p?.description ?? "";
  f.active.checked = p?.active ?? true;
  f.in_stock.checked = p?.in_stock ?? true;
  f.sort_order.value = p?.sort_order ?? (products.reduce((m, x) => Math.max(m, x.sort_order), 0) + 10);
  f.color0.value = p?.colors?.[0] ?? "#f3d9c4";
  f.color1.value = p?.colors?.[1] ?? "#b5452f";
  f.pattern.value = p?.pattern ?? "plain";
  const sizes = p?.sizes ?? ["S", "M", "L", "XL", "XXL", "3XL", "4XL"];
  const all = [...new Set([...STANDARD_SIZES, ...sizes])];
  $("#pfSizes").innerHTML = all.map((s) => `<label class="size-chip"><input type="checkbox" name="sizes" value="${esc(s)}"${sizes.includes(s) ? " checked" : ""}><span>${esc(s)}</span></label>`).join("");
  $("#pfDelete").hidden = !p;
  renderPreview();
  openSheet("#productSheet");
  f.name.focus();
}

function previewProduct() {
  const f = $("#productForm");
  return {
    name: f.name.value || "Preview",
    type: f.type.value,
    colors: [f.color0.value, f.color1.value],
    pattern: f.pattern.value,
    image_url: pendingPhoto ? pendingPhoto.url : removePhoto ? null : editing?.image_url,
  };
}

function renderPreview() {
  const p = previewProduct();
  $("#pfPreview").innerHTML = productMedia(p);
  $("#pfRemovePhoto").hidden = !p.image_url;
}
["type", "color0", "color1", "pattern"].forEach((n) => $(`#productForm [name=${n}]`).addEventListener("input", renderPreview));

/** Shrinks a photo to at most 1600px on its long side and re-encodes it as JPEG. */
async function resizeImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = Object.assign(document.createElement("canvas"), {
    width: Math.round(bitmap.width * scale),
    height: Math.round(bitmap.height * scale),
  });
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
}

$("#pfFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const blob = await resizeImage(file);
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.url);
    pendingPhoto = { blob, url: URL.createObjectURL(blob) };
    removePhoto = false;
    renderPreview();
  } catch (err) {
    fail(err, "Couldn't read that image. Try a JPG or PNG.");
  }
});
$("#pfRemovePhoto").addEventListener("click", () => {
  if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.url);
  pendingPhoto = null;
  removePhoto = true;
  renderPreview();
});

const photoPath = (url) => url?.split("/product-images/")[1]?.split("?")[0];

$("#productForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const sizes = $$("input[name=sizes]:checked", f).map((i) => i.value);
  const price = Number(f.price.value);
  const mrp = f.mrp.value ? Number(f.mrp.value) : null;
  if (!sizes.length) return ($("#productMsg").textContent = "Pick at least one size.");
  if (mrp !== null && mrp < price) return ($("#productMsg").textContent = "MRP can't be lower than the selling price.");

  $("#pfSave").disabled = true;
  $("#productMsg").textContent = "Saving…";
  try {
    const oldPhoto = editing.image_url;
    let image_url = removePhoto ? null : oldPhoto ?? null;
    if (pendingPhoto) {
      const path = `${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from("product-images").upload(path, pendingPhoto.blob, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (error) throw error;
      image_url = sb.storage.from("product-images").getPublicUrl(path).data.publicUrl;
    }
    const row = {
      name: f.name.value.trim(),
      type: f.type.value,
      tag: f.tag.value.trim() || null,
      price,
      mrp,
      fabric: f.fabric.value.trim(),
      description: f.description.value.trim(),
      sizes,
      active: f.active.checked,
      in_stock: f.in_stock.checked,
      sort_order: Number(f.sort_order.value) || 100,
      colors: [f.color0.value, f.color1.value],
      pattern: f.pattern.value,
      image_url,
    };
    const q = editing.id ? sb.from("products").update(row).eq("id", editing.id) : sb.from("products").insert(row);
    const { error } = await q;
    if (error) throw error;
    if (oldPhoto && oldPhoto !== image_url && photoPath(oldPhoto)) {
      await sb.storage.from("product-images").remove([photoPath(oldPhoto)]);
    }
    toast(`${row.name} saved.`);
    closeSheet($("#productSheet"));
    loadProducts();
  } catch (err) {
    $("#productMsg").textContent = "";
    fail(err);
  } finally {
    $("#pfSave").disabled = false;
  }
});

$("#pfDelete").addEventListener("click", async () => {
  if (!editing?.id) return;
  if (!confirm(`Delete "${editing.name}" permanently?\n\nPast orders keep their details. To just take it off the shop, untick "Visible in shop" instead.`)) return;
  const { error } = await sb.from("products").delete().eq("id", editing.id);
  if (error) return fail(error);
  if (photoPath(editing.image_url)) await sb.storage.from("product-images").remove([photoPath(editing.image_url)]);
  toast(`${editing.name} deleted.`);
  closeSheet($("#productSheet"));
  loadProducts();
});

/* =============================== Customers =============================== */

let customers = [];
let customerSearch = "";

async function loadCustomers() {
  $("#customersBody").innerHTML = `<tr><td colspan="7" class="empty">Loading…</td></tr>`;
  const { data, error } = await sb
    .from("customers")
    .select("*, orders(total, status, created_at)")
    .order("updated_at", { ascending: false })
    .limit(2000);
  if (error) return fail(error);
  customers = data.map((c) => {
    const real = c.orders.filter((o) => o.status !== "awaiting_payment" && o.status !== "cancelled");
    return {
      ...c,
      orderCount: real.length,
      spent: real.reduce((s, o) => s + o.total, 0),
      last: real.map((o) => o.created_at).sort().pop(),
    };
  });
  renderCustomers();
}

function filteredCustomers() {
  const q = customerSearch.toLowerCase();
  return customers.filter((c) => !q || `${c.name} ${c.phone} ${c.email ?? ""} ${c.city ?? ""}`.toLowerCase().includes(q));
}

function renderCustomers() {
  const list = filteredCustomers();
  $("#customerCount").textContent = `${list.length} customer${list.length === 1 ? "" : "s"}`;
  $("#customersBody").innerHTML = list.length
    ? list.map((c) => `
      <tr data-phone="${esc(c.phone)}" tabindex="0" title="Show this customer's orders">
        <td><strong>${esc(c.name)}</strong></td>
        <td>${esc(c.phone)}</td>
        <td>${esc(c.email ?? "")}</td>
        <td>${esc(c.city ?? "")}</td>
        <td>${c.orderCount}</td>
        <td>${rupee(c.spent)}</td>
        <td>${c.last ? fmtDay(c.last) : "—"}</td>
      </tr>`).join("")
    : `<tr><td colspan="7" class="empty">No customers yet.</td></tr>`;
}

$("#customerSearch").addEventListener("input", (e) => { customerSearch = e.target.value.trim(); renderCustomers(); });
$("#customersBody").addEventListener("click", (e) => {
  const tr = e.target.closest("[data-phone]");
  if (!tr) return;
  orderFilter = "all";
  orderSearch = tr.dataset.phone;
  $("#orderSearch").value = orderSearch;
  $$("#orderFilters .chip").forEach((c) => c.classList.toggle("active", c.dataset.of === "all"));
  switchTab("orders");
});
$("#exportCustomers").addEventListener("click", () => {
  downloadCSV(`sasi-customers-${new Date().toISOString().slice(0, 10)}.csv`, [
    ["Name", "Phone", "Email", "Address", "City", "PIN", "Orders", "Total spent", "Last order", "First seen"],
    ...filteredCustomers().map((c) => [c.name, c.phone, c.email, c.address, c.city, c.pin, c.orderCount, c.spent, c.last ? fmtDay(c.last) : "", fmtDay(c.created_at)]),
  ]);
});

/* =============================== Settings =============================== */

async function loadSettings() {
  const [{ data, error }, admins] = await Promise.all([
    sb.from("settings").select("*").single(),
    sb.from("admins").select("email, created_at").order("created_at"),
  ]);
  if (error) return fail(error);
  settingsCache = data;
  const f = $("#settingsForm");
  for (const k of ["store_name", "whatsapp", "phone_display", "email", "announcement", "shipping_fee", "free_shipping_above"]) f[k].value = data[k] ?? "";
  f.cod_enabled.checked = data.cod_enabled;
  f.online_enabled.checked = data.online_enabled;
  $("#adminList").innerHTML = (admins.data ?? []).map((a) => `<li>${esc(a.email ?? "(no email)")} <span class="muted small">since ${fmtDay(a.created_at)}</span></li>`).join("");
}

$("#settingsForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  if (!f.cod_enabled.checked && !f.online_enabled.checked && !confirm("With both payment methods off, customers can't place orders. Save anyway?")) return;
  const row = {
    store_name: f.store_name.value.trim(),
    whatsapp: f.whatsapp.value.replace(/\D/g, ""),
    phone_display: f.phone_display.value.trim(),
    email: f.email.value.trim(),
    announcement: f.announcement.value.trim(),
    shipping_fee: Number(f.shipping_fee.value),
    free_shipping_above: Number(f.free_shipping_above.value),
    cod_enabled: f.cod_enabled.checked,
    online_enabled: f.online_enabled.checked,
  };
  const { data, error } = await sb.from("settings").update(row).eq("id", 1).select().single();
  if (error) return fail(error);
  settingsCache = data;
  $("#settingsMsg").textContent = "";
  toast("Settings saved. The shop shows them straight away.");
});
