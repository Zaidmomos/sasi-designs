(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const rupee = (n) => "₹" + Number(n).toLocaleString("en-IN");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const HEX = /^#[0-9a-f]{6}$/i;
  const tint = (p) => (HEX.test(p.colors?.[0]) ? p.colors[0] : "#f3d9c4");
  const typeLabel = (p) => (p.type === "nighty" ? "Nighty" : "Kurta");
  const garment = (p, opts) => window.SasiGarment.svg(p, opts);

  let PRODUCTS = [];
  let byId = {};
  let STORE = {
    store_name: "Sasi Designs", whatsapp: "", phone_display: "", email: "",
    free_shipping_above: 999, shipping_fee: 79, cod_enabled: true, online_enabled: true, announcement: "",
  };

  /* ---------- Data from Supabase ---------- */
  const cfg = window.SASI_CONFIG || {};
  const configured = cfg.supabaseUrl && !cfg.supabaseUrl.includes("YOUR-PROJECT") && cfg.supabaseAnonKey && !cfg.supabaseAnonKey.includes("YOUR-");

  async function rest(path) {
    const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, {
      headers: { apikey: cfg.supabaseAnonKey, authorization: `Bearer ${cfg.supabaseAnonKey}` },
    });
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  }

  async function loadData() {
    if (!configured) throw new Error("not-configured");
    const [products, settings] = await Promise.all([
      rest("products?select=id,type,name,description,fabric,price,mrp,sizes,image_url,colors,pattern,tag,in_stock&active=eq.true&order=sort_order.asc,created_at.asc"),
      rest("settings?select=*&id=eq.1"),
    ]);
    PRODUCTS = products;
    byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
    if (settings[0]) STORE = settings[0];
  }

  function media(p, opts) {
    return p.image_url
      ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy">`
      : garment(p, opts);
  }

  /* ---------- Storage-safe cart ---------- */
  const CART_KEY = "sasi-cart-v2";
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { cart = []; }
  const saveCart = () => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch {} };

  function addToCart(id, size, qty = 1) {
    const line = cart.find((i) => i.id === id && i.size === size);
    if (line) line.qty = Math.min(10, line.qty + qty); else cart.push({ id, size, qty });
    saveCart(); renderCart();
    toast(`Added ${byId[id].name} (${size}) to your bag`);
  }

  const cartCount = () => cart.reduce((s, i) => s + i.qty, 0);
  const cartSubtotal = () => cart.reduce((s, i) => s + byId[i.id].price * i.qty, 0);
  const shippingFor = (sub) => (sub === 0 || sub >= STORE.free_shipping_above ? 0 : STORE.shipping_fee);

  /* ---------- Product grid ---------- */
  let filter = "all";
  let sort = "featured";
  const grid = $("#productGrid");

  function sizeOptions(p) {
    const def = p.sizes.includes("L") ? "L" : p.sizes[0];
    return p.sizes.map((s) => `<option${s === def ? " selected" : ""}>${esc(s)}</option>`).join("");
  }

  function renderGrid() {
    let list = PRODUCTS.filter((p) => filter === "all" || p.type === filter);
    if (sort === "low") list = [...list].sort((a, b) => a.price - b.price);
    if (sort === "high") list = [...list].sort((a, b) => b.price - a.price);
    if (!list.length) {
      grid.innerHTML = `<p class="grid-msg">No products here yet. Please check back soon.</p>`;
      return;
    }
    grid.innerHTML = list.map((p) => {
      const off = p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0;
      return `
        <article class="card${p.in_stock ? "" : " sold-out"}" data-id="${p.id}">
          <button class="card-media${p.image_url ? " has-photo" : ""}" data-open="${p.id}" aria-label="View ${esc(p.name)}" style="--tint:${tint(p)}">
            ${!p.in_stock ? `<span class="badge badge-muted">Sold out</span>` : p.tag ? `<span class="badge">${esc(p.tag)}</span>` : ""}
            ${media(p)}
          </button>
          <div class="card-body">
            <p class="card-type">${typeLabel(p)}${p.fabric ? ` · ${esc(p.fabric.split(",")[0])}` : ""}</p>
            <h3 class="card-title"><button data-open="${p.id}">${esc(p.name)}</button></h3>
            <div class="price-row">
              <span class="price">${rupee(p.price)}</span>
              ${off ? `<span class="mrp">${rupee(p.mrp)}</span><span class="off">${off}% off</span>` : ""}
            </div>
            <div class="card-actions">
              <select class="size-select" aria-label="Size for ${esc(p.name)}" ${p.in_stock ? "" : "disabled"}>${sizeOptions(p)}</select>
              <button class="btn btn-primary btn-sm" data-add="${p.id}" ${p.in_stock ? "" : "disabled"}>${p.in_stock ? "Add to bag" : "Sold out"}</button>
            </div>
          </div>
        </article>`;
    }).join("");
  }

  grid.addEventListener("click", (e) => {
    const open = e.target.closest("[data-open]");
    if (open) return openProduct(open.dataset.open);
    const add = e.target.closest("[data-add]");
    if (add) addToCart(add.dataset.add, add.closest(".card").querySelector(".size-select").value);
  });

  function setFilter(f) {
    filter = f;
    $$(".tab").forEach((t) => {
      const on = t.dataset.filter === f;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on);
    });
    renderGrid();
  }

  $$(".tab").forEach((t) => t.addEventListener("click", () => setFilter(t.dataset.filter)));
  $$("[data-filter-link]").forEach((a) => a.addEventListener("click", () => { setFilter(a.dataset.filterLink); closeMenu(); }));
  $("#sortSelect").addEventListener("change", (e) => { sort = e.target.value; renderGrid(); });

  /* ---------- Product modal ---------- */
  const modal = $("#productModal");
  let lastFocus = null;

  function openProduct(id) {
    const p = byId[id];
    const off = p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0;
    const def = p.sizes.includes("L") ? "L" : p.sizes[0];
    lastFocus = document.activeElement;
    $("#modalBody").innerHTML = `
      <div class="modal-media${p.image_url ? " has-photo" : ""}" style="--tint:${tint(p)}">${media(p)}</div>
      <div class="modal-info">
        <p class="card-type">${typeLabel(p)}</p>
        <h3 id="modalTitle">${esc(p.name)}</h3>
        <div class="price-row">
          <span class="price">${rupee(p.price)}</span>
          ${off ? `<span class="mrp">${rupee(p.mrp)}</span><span class="off">${off}% off</span>` : ""}
        </div>
        <p class="desc">${esc(p.description)}</p>
        ${p.fabric ? `<p class="fabric"><strong>Fabric:</strong> ${esc(p.fabric)}</p>` : ""}
        ${p.in_stock ? `
        <fieldset class="sizes">
          <legend>Select size</legend>
          ${p.sizes.map((s) => `<label><input type="radio" name="msize" value="${esc(s)}"${s === def ? " checked" : ""}><span>${esc(s)}</span></label>`).join("")}
        </fieldset>
        <div class="qty-row">
          <div class="qty">
            <button type="button" data-q="-1" aria-label="Decrease quantity">−</button>
            <output id="mqty">1</output>
            <button type="button" data-q="1" aria-label="Increase quantity">+</button>
          </div>
          <button class="btn btn-primary" id="modalAdd">Add to bag</button>
        </div>` : `<p class="sold-note">This piece is sold out right now. Message us on WhatsApp to hear when it's back.</p>`}
        <ul class="assure">
          ${STORE.cod_enabled ? "<li>Cash on delivery available</li>" : ""}
          ${STORE.online_enabled ? "<li>Secure online payment: UPI, cards, net banking</li>" : ""}
          <li>7-day size exchange</li><li>Ships in 2–3 working days</li>
        </ul>
      </div>`;
    let qty = 1;
    $$("[data-q]", modal).forEach((b) => b.addEventListener("click", () => {
      qty = Math.max(1, Math.min(10, qty + Number(b.dataset.q)));
      $("#mqty").textContent = qty;
    }));
    $("#modalAdd")?.addEventListener("click", () => {
      addToCart(id, $("input[name=msize]:checked", modal).value, qty);
      closeModal();
    });
    modal.hidden = false;
    document.body.classList.add("locked");
    $(".icon-close", modal).focus();
  }

  function closeModal() {
    modal.hidden = true;
    unlockIfIdle();
    lastFocus?.focus();
  }
  $$("[data-close]", modal).forEach((el) => el.addEventListener("click", closeModal));

  /* ---------- Cart drawer & checkout ---------- */
  const drawer = $("#cartDrawer");
  let view = "bag"; // "bag" | "checkout" | "done"
  let placed = null; // { order_number, total, payment_method }
  let checkoutDraft = {};
  let busy = false;

  function renderCart() {
    cart = cart.filter((i) => byId[i.id]?.in_stock && byId[i.id].sizes.includes(i.size));
    $("#cartCount").textContent = cartCount();
    $("#cartCount").classList.toggle("show", cartCount() > 0);
    const items = $("#cartItems");
    const foot = $("#cartFoot");

    if (view === "done" && placed) {
      items.innerHTML = `
        <div class="done">
          <div class="done-icon" aria-hidden="true">✓</div>
          <h4>Thank you! Your order is placed.</h4>
          <p>Order number <strong>${esc(placed.order_number)}</strong></p>
          <p>${placed.payment_method === "cod"
            ? `Please keep <strong>${rupee(placed.total)}</strong> ready to pay on delivery.`
            : `We've received your payment of <strong>${rupee(placed.total)}</strong>.`}
          We'll message you when it ships.</p>
          <button class="btn btn-ghost" data-close-cart>Continue shopping</button>
        </div>`;
      foot.innerHTML = "";
      bindCartClose();
      return;
    }

    if (!cart.length) {
      view = "bag";
      items.innerHTML = `<div class="empty"><p>Your bag is empty.</p><button class="btn btn-ghost" data-close-cart>Continue shopping</button></div>`;
      foot.innerHTML = "";
      bindCartClose();
      return;
    }

    items.innerHTML = cart.map((i, idx) => {
      const p = byId[i.id];
      return `
        <div class="line">
          <div class="line-media" style="--tint:${tint(p)}">${media(p, { withBg: false })}</div>
          <div class="line-info">
            <p class="line-name">${esc(p.name)}</p>
            <p class="line-meta">Size ${esc(i.size)} · ${rupee(p.price)}</p>
            <div class="qty qty-sm">
              <button data-line="${idx}" data-d="-1" aria-label="Decrease">−</button>
              <output>${i.qty}</output>
              <button data-line="${idx}" data-d="1" aria-label="Increase">+</button>
            </div>
          </div>
          <div class="line-end">
            <span>${rupee(p.price * i.qty)}</span>
            <button class="link" data-remove="${idx}">Remove</button>
          </div>
        </div>`;
    }).join("");

    const sub = cartSubtotal();
    const ship = shippingFor(sub);
    const left = STORE.free_shipping_above - sub;
    const methods = [
      STORE.online_enabled && { v: "online", t: "Pay online", s: "UPI, cards, net banking, wallets" },
      STORE.cod_enabled && { v: "cod", t: "Cash on delivery", s: "Pay when your order arrives" },
    ].filter(Boolean);
    const d = checkoutDraft;
    const chosen = methods.some((m) => m.v === d.payment_method) ? d.payment_method : methods[0]?.v;

    foot.innerHTML = `
      ${left > 0 ? `<p class="ship-note">Add ${rupee(left)} more for free shipping</p>` : `<p class="ship-note ok">You've unlocked free shipping</p>`}
      <div class="totals">
        <div><span>Subtotal</span><span>${rupee(sub)}</span></div>
        <div><span>Shipping</span><span>${ship ? rupee(ship) : "Free"}</span></div>
        <div class="grand"><span>Total</span><span>${rupee(sub + ship)}</span></div>
      </div>
      ${view === "checkout" ? `
        <form class="checkout" id="checkoutForm" novalidate>
          <label>Full name<input name="name" required autocomplete="name" value="${esc(d.name)}"></label>
          <label>Mobile number<input name="phone" required inputmode="tel" autocomplete="tel" placeholder="10-digit mobile" value="${esc(d.phone)}"></label>
          <label>Email <span class="opt">(optional, for your receipt)</span><input name="email" type="email" autocomplete="email" value="${esc(d.email)}"></label>
          <label>Delivery address<textarea name="address" rows="3" required autocomplete="street-address" placeholder="House no., street, area, landmark">${esc(d.address)}</textarea></label>
          <div class="row-2">
            <label>City<input name="city" required autocomplete="address-level2" value="${esc(d.city)}"></label>
            <label>PIN code<input name="pin" required inputmode="numeric" maxlength="6" autocomplete="postal-code" value="${esc(d.pin)}"></label>
          </div>
          <label>Note for us <span class="opt">(optional)</span><input name="note" maxlength="300" value="${esc(d.note)}"></label>
          <input name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
          ${methods.length ? `
          <fieldset class="pay-methods">
            <legend>Payment</legend>
            ${methods.map((m) => `
              <label class="pay-option"><input type="radio" name="payment_method" value="${m.v}"${m.v === chosen ? " checked" : ""}>
                <span><strong>${m.t}</strong><small>${m.s}</small></span></label>`).join("")}
          </fieldset>
          <p class="form-error" id="checkoutError" role="alert"></p>
          <button class="btn btn-primary btn-block" type="submit" id="placeBtn">${chosen === "cod" ? "Place order" : `Pay ${rupee(sub + ship)}`}</button>
          <button class="link back-link" type="button" id="backToBag">Back to bag</button>`
          : `<p class="form-error">Ordering is paused right now. Please message us on WhatsApp.</p>`}
        </form>` : `<button class="btn btn-primary btn-block" id="toCheckout">Checkout</button>`}`;

    $$("[data-d]", items).forEach((b) => b.addEventListener("click", () => {
      const line = cart[b.dataset.line];
      line.qty = Math.min(10, line.qty + Number(b.dataset.d));
      if (line.qty < 1) cart.splice(b.dataset.line, 1);
      saveCart(); renderCart();
    }));
    $$("[data-remove]", items).forEach((b) => b.addEventListener("click", () => {
      cart.splice(b.dataset.remove, 1); saveCart(); renderCart();
    }));
    $("#toCheckout")?.addEventListener("click", () => { view = "checkout"; renderCart(); $("#checkoutForm input").focus(); });
    $("#backToBag")?.addEventListener("click", () => { view = "bag"; renderCart(); });
    const form = $("#checkoutForm");
    if (form) {
      form.addEventListener("input", () => { checkoutDraft = Object.fromEntries(new FormData(form)); });
      form.addEventListener("change", (e) => {
        if (e.target.name === "payment_method") {
          $("#placeBtn").textContent = e.target.value === "cod" ? "Place order" : `Pay ${rupee(sub + ship)}`;
        }
      });
      form.addEventListener("submit", placeOrder);
    }
    bindCartClose();
  }

  function bindCartClose() {
    $$("[data-close-cart]", drawer).forEach((el) => { el.onclick = closeCart; });
  }

  function openCart() {
    lastFocus = document.activeElement;
    drawer.hidden = false;
    document.body.classList.add("locked");
    requestAnimationFrame(() => drawer.classList.add("open"));
    $(".icon-close", drawer).focus();
  }
  function closeCart() {
    if (busy) return;
    drawer.classList.remove("open");
    setTimeout(() => {
      drawer.hidden = true;
      if (view === "done") { view = "bag"; placed = null; renderCart(); }
      unlockIfIdle();
    }, 250);
    lastFocus?.focus();
  }
  $("#cartBtn").addEventListener("click", openCart);

  function unlockIfIdle() {
    if (modal.hidden && drawer.hidden) document.body.classList.remove("locked");
  }

  function setBusy(on, label) {
    busy = on;
    const btn = $("#placeBtn");
    if (!btn) return;
    btn.disabled = on;
    if (label) btn.textContent = label;
  }

  function showCheckoutError(msg) {
    const el = $("#checkoutError");
    if (el) el.textContent = msg;
  }

  async function postJSON(url, data) {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Something went wrong. Please try again.");
    return body;
  }

  function orderComplete(result) {
    placed = result;
    cart = [];
    checkoutDraft = {};
    saveCart();
    view = "done";
    busy = false;
    renderCart();
  }

  async function placeOrder(e) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.target);
    const method = f.get("payment_method");
    showCheckoutError("");
    setBusy(true, "Placing order…");

    try {
      const order = await postJSON("/api/create-order", {
        items: cart.map((i) => ({ product_id: i.id, size: i.size, qty: i.qty })),
        customer: {
          name: f.get("name"), phone: f.get("phone"), email: f.get("email"),
          address: f.get("address"), city: f.get("city"), pin: f.get("pin"), note: f.get("note"),
        },
        payment_method: method,
        website: f.get("website"),
      });

      if (order.payment_method === "cod") return orderComplete(order);

      setBusy(true, "Opening payment…");
      await loadRazorpay();
      const r = order.razorpay;
      const rzp = new window.Razorpay({
        key: r.key_id,
        order_id: r.order_id,
        amount: r.amount,
        currency: r.currency,
        name: r.name,
        description: `Order ${order.order_number}`,
        prefill: r.prefill,
        theme: { color: "#a23b2a" },
        handler: async (resp) => {
          setBusy(true, "Confirming payment…");
          try {
            const done = await postJSON("/api/verify-payment", resp);
            orderComplete({ ...done, payment_method: "online" });
          } catch (err) {
            setBusy(false, `Pay ${rupee(order.total)}`);
            showCheckoutError(err.message);
          }
        },
        modal: {
          ondismiss: () => {
            if (view !== "checkout") return;
            setBusy(false, `Pay ${rupee(order.total)}`);
            showCheckoutError("Payment was cancelled. Your bag is saved, so you can try again.");
          },
        },
      });
      rzp.on("payment.failed", (resp) => {
        showCheckoutError(`Payment failed: ${resp.error?.description || "please try another method"}.`);
      });
      rzp.open();
    } catch (err) {
      setBusy(false, method === "cod" ? "Place order" : `Pay ${rupee(cartSubtotal() + shippingFor(cartSubtotal()))}`);
      showCheckoutError(err.message);
    }
  }

  let rzpScript;
  function loadRazorpay() {
    if (window.Razorpay) return Promise.resolve();
    rzpScript ??= new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = resolve;
      s.onerror = () => { rzpScript = null; reject(new Error("Couldn't load the payment window. Check your connection and try again.")); };
      document.head.appendChild(s);
    });
    return rzpScript;
  }

  /* ---------- Contact (WhatsApp) ---------- */
  const whatsappReady = () => /^\d{10,15}$/.test(STORE.whatsapp);

  $("#contactForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!whatsappReady()) return toast("WhatsApp isn't set up yet. Please email us instead.");
    const f = new FormData(e.target);
    const text = `Hi ${STORE.store_name}, this is ${f.get("name")}.\n\n${f.get("message")}`;
    window.open(`https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    e.target.reset();
  });

  /* ---------- Misc UI ---------- */
  let toastTimer;
  function toast(text) {
    const t = $("#toast");
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
  }

  const menuBtn = $("#menuBtn");
  function closeMenu() { $("#nav").classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); }
  menuBtn.addEventListener("click", () => {
    const open = $("#nav").classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", open);
  });
  $$("#nav a").forEach((a) => a.addEventListener("click", closeMenu));

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!modal.hidden) closeModal();
    else if (!drawer.hidden) closeCart();
  });

  function applyStore() {
    if (STORE.announcement) $("#announce").textContent = STORE.announcement;
    else $("#announce").hidden = true;
    $$('[data-store="phoneDisplay"]').forEach((el) => (el.textContent = STORE.phone_display || "Coming soon"));
    $$('[data-store="emailLink"]').forEach((el) => {
      el.textContent = STORE.email || "Coming soon";
      if (STORE.email) el.href = `mailto:${STORE.email}`;
    });
  }
  $("#year").textContent = new Date().getFullYear();

  /* ---------- Start ---------- */
  grid.innerHTML = `<p class="grid-msg">Loading the collection…</p>`;
  loadData()
    .then(() => {
      applyStore();
      const heroPieces = [PRODUCTS.find((p) => p.type === "nighty"), PRODUCTS.find((p) => p.type === "kurta")].filter(Boolean);
      $("#heroArt").innerHTML = `<div class="arch"></div>` + heroPieces
        .map((p, i) => `<div class="hero-piece ${i ? "hero-b" : "hero-a"}${p.image_url ? " has-photo" : ""}">${media(p)}</div>`).join("");
      renderGrid();
      renderCart();
    })
    .catch((err) => {
      console.error(err);
      grid.innerHTML = `<p class="grid-msg">${err.message === "not-configured"
        ? "The shop isn't connected to its database yet. Add your Supabase details to <code>config.js</code>."
        : "We couldn't load the collection. Please refresh the page."}</p>`;
      renderCart();
    });
})();
