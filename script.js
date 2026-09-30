(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const rupee = (n) => "₹" + n.toLocaleString("en-IN");
  const byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

  /* ---------- Garment illustrations (SVG) ---------- */
  let svgUid = 0;

  const SHAPES = {
    kurta: {
      body: "M80 30 L60 36 L30 50 L16 122 L38 127 L52 76 L50 238 L150 238 L148 76 L162 127 L184 122 L170 50 L140 36 L120 30 Q100 46 80 30 Z",
      details: `
        <path d="M100 42 V80" />
        <path d="M80 30 Q100 50 120 30" />
        <path d="M50 238 L50 190 M150 238 L150 190" />
        <path d="M16 122 L38 127" />`,
    },
    nighty: {
      body: "M82 28 L62 34 L40 44 L30 80 L52 85 L58 66 L36 246 Q100 258 164 246 L142 66 L148 85 L170 80 L160 44 L138 34 L118 28 Q100 48 82 28 Z",
      details: `
        <path d="M59 96 Q100 106 141 96" />
        <path d="M82 28 Q100 48 118 28" />
        <path d="M100 38 V96" stroke-dasharray="3 3" />
        <path d="M36 246 Q100 258 164 246" />`,
    },
  };

  function patternDef(id, pattern, [base, accent]) {
    const a = accent;
    const tiles = {
      buti: `<rect width="22" height="22" fill="${base}"/>
        <g fill="${a}"><circle cx="5.5" cy="5.5" r="1.6"/><circle cx="5.5" cy="2.8" r=".9"/><circle cx="5.5" cy="8.2" r=".9"/><circle cx="2.8" cy="5.5" r=".9"/><circle cx="8.2" cy="5.5" r=".9"/>
        <circle cx="16.5" cy="16.5" r="1.6"/><circle cx="16.5" cy="13.8" r=".9"/><circle cx="16.5" cy="19.2" r=".9"/><circle cx="13.8" cy="16.5" r=".9"/><circle cx="19.2" cy="16.5" r=".9"/></g>`,
      stripe: `<rect width="12" height="12" fill="${base}"/><rect x="0" width="2.5" height="12" fill="${a}" opacity=".75"/><rect x="6" width="1" height="12" fill="${a}" opacity=".45"/>`,
      floral: `<rect width="30" height="30" fill="${base}"/>
        <g fill="${a}" opacity=".85"><circle cx="8" cy="5" r="2.4"/><circle cx="11.6" cy="7.6" r="2.4"/><circle cx="10.2" cy="11.8" r="2.4"/><circle cx="5.8" cy="11.8" r="2.4"/><circle cx="4.4" cy="7.6" r="2.4"/></g>
        <circle cx="8" cy="8.6" r="1.6" fill="${base}"/>
        <g fill="${a}" opacity=".55"><circle cx="23" cy="22" r="1.4"/><circle cx="25" cy="24" r="1.4"/><circle cx="21" cy="24" r="1.4"/><circle cx="23" cy="26" r="1.4"/></g>`,
      check: `<rect width="16" height="16" fill="${base}"/><rect width="16" height="5" fill="${a}" opacity=".28"/><rect width="5" height="16" fill="${a}" opacity=".28"/><rect x="10" width="1" height="16" fill="${a}" opacity=".5"/><rect y="10" width="16" height="1" fill="${a}" opacity=".5"/>`,
      paisley: `<rect width="28" height="28" fill="${base}"/>
        <g fill="none" stroke="${a}" stroke-width="1.3"><path d="M7 20 C1 16 3 6 10 5 C16 4 18 11 13 14 C10 16 9 19 7 20 Z"/><path d="M21 26 C15 22 17 12 24 11" opacity=".6"/></g>
        <circle cx="10" cy="9.5" r="1.8" fill="${a}"/><circle cx="23" cy="4" r="1" fill="${a}" opacity=".6"/>`,
      plain: `<rect width="8" height="8" fill="${base}"/><circle cx="2" cy="2" r=".5" fill="${a}" opacity=".25"/><circle cx="6" cy="6" r=".5" fill="${a}" opacity=".18"/>`,
    };
    const size = { buti: 22, stripe: 12, floral: 30, check: 16, paisley: 28, plain: 8 }[pattern];
    return `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse">${tiles[pattern]}</pattern>`;
  }

  function garmentSVG(p, { withBg = true } = {}) {
    const uid = `g${++svgUid}`;
    const shape = SHAPES[p.type];
    const [base, accent] = p.colors;
    return `
      <svg viewBox="0 0 200 270" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${p.name}">
        <defs>
          ${patternDef(uid + "p", p.pattern, p.colors)}
          <linearGradient id="${uid}s" x1="0" x2="1">
            <stop offset="0" stop-color="#000" stop-opacity=".16"/>
            <stop offset=".35" stop-color="#fff" stop-opacity=".12"/>
            <stop offset=".65" stop-color="#fff" stop-opacity="0"/>
            <stop offset="1" stop-color="#000" stop-opacity=".18"/>
          </linearGradient>
        </defs>
        ${withBg ? `<ellipse cx="100" cy="252" rx="70" ry="8" fill="#000" opacity=".08"/>` : ""}
        <path d="M100 6 V20" stroke="#8a7a66" stroke-width="2"/>
        <path d="M70 26 Q100 8 130 26" fill="none" stroke="#8a7a66" stroke-width="2.4" stroke-linecap="round"/>
        <path d="${shape.body}" fill="url(#${uid}p)"/>
        <path d="${shape.body}" fill="url(#${uid}s)"/>
        <g fill="none" stroke="${accent}" stroke-opacity=".55" stroke-width="1.4" stroke-linecap="round">${shape.details}</g>
        <path d="${shape.body}" fill="none" stroke="${shade(base, -0.35)}" stroke-width="1.6" stroke-linejoin="round"/>
      </svg>`;
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const ch = (v) => Math.max(0, Math.min(255, Math.round(v + (amt < 0 ? v * amt : (255 - v) * amt))));
    const r = ch(n >> 16), g = ch((n >> 8) & 255), b = ch(n & 255);
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  /* ---------- Storage-safe cart ---------- */
  const CART_KEY = "sasi-cart-v1";
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { cart = []; }
  cart = cart.filter((i) => byId[i.id]);
  const saveCart = () => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch {} };

  function addToCart(id, size, qty = 1) {
    const line = cart.find((i) => i.id === id && i.size === size);
    if (line) line.qty += qty; else cart.push({ id, size, qty });
    saveCart(); renderCart();
    toast(`Added ${byId[id].name} (${size}) to your bag`);
  }

  const cartCount = () => cart.reduce((s, i) => s + i.qty, 0);
  const cartSubtotal = () => cart.reduce((s, i) => s + byId[i.id].price * i.qty, 0);
  const shippingFor = (sub) => (sub === 0 || sub >= STORE.freeShippingAbove ? 0 : STORE.shippingFee);

  /* ---------- Product grid ---------- */
  let filter = "all";
  let sort = "featured";
  const grid = $("#productGrid");

  function renderGrid() {
    let list = PRODUCTS.filter((p) => filter === "all" || p.type === filter);
    if (sort === "low") list = [...list].sort((a, b) => a.price - b.price);
    if (sort === "high") list = [...list].sort((a, b) => b.price - a.price);
    grid.innerHTML = list.map((p) => {
      const off = Math.round((1 - p.price / p.mrp) * 100);
      return `
        <article class="card" data-id="${p.id}">
          <button class="card-media" data-open="${p.id}" aria-label="View ${p.name}" style="--tint:${p.colors[0]}">
            ${p.tag ? `<span class="badge">${p.tag}</span>` : ""}
            ${garmentSVG(p)}
          </button>
          <div class="card-body">
            <p class="card-type">${p.type === "nighty" ? "Nighty" : "Kurta"} · ${p.fabric.split(",")[0]}</p>
            <h3 class="card-title"><button data-open="${p.id}">${p.name}</button></h3>
            <div class="price-row">
              <span class="price">${rupee(p.price)}</span>
              <span class="mrp">${rupee(p.mrp)}</span>
              <span class="off">${off}% off</span>
            </div>
            <div class="card-actions">
              <select class="size-select" aria-label="Size for ${p.name}">
                ${SIZES.map((s) => `<option${s === "L" ? " selected" : ""}>${s}</option>`).join("")}
              </select>
              <button class="btn btn-primary btn-sm" data-add="${p.id}">Add to bag</button>
            </div>
          </div>
        </article>`;
    }).join("");
  }

  grid.addEventListener("click", (e) => {
    const open = e.target.closest("[data-open]");
    if (open) return openProduct(open.dataset.open);
    const add = e.target.closest("[data-add]");
    if (add) {
      const size = add.closest(".card").querySelector(".size-select").value;
      addToCart(add.dataset.add, size);
    }
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
    lastFocus = document.activeElement;
    $("#modalBody").innerHTML = `
      <div class="modal-media" style="--tint:${p.colors[0]}">${garmentSVG(p)}</div>
      <div class="modal-info">
        <p class="card-type">${p.type === "nighty" ? "Nighty" : "Kurta"}</p>
        <h3 id="modalTitle">${p.name}</h3>
        <div class="price-row">
          <span class="price">${rupee(p.price)}</span>
          <span class="mrp">${rupee(p.mrp)}</span>
          <span class="off">${Math.round((1 - p.price / p.mrp) * 100)}% off</span>
        </div>
        <p>${p.desc}</p>
        <p class="fabric"><strong>Fabric:</strong> ${p.fabric}</p>
        <fieldset class="sizes">
          <legend>Select size</legend>
          ${SIZES.map((s) => `<label><input type="radio" name="msize" value="${s}"${s === "L" ? " checked" : ""}><span>${s}</span></label>`).join("")}
        </fieldset>
        <div class="qty-row">
          <div class="qty">
            <button type="button" data-q="-1" aria-label="Decrease quantity">−</button>
            <output id="mqty">1</output>
            <button type="button" data-q="1" aria-label="Increase quantity">+</button>
          </div>
          <button class="btn btn-primary" id="modalAdd">Add to bag</button>
        </div>
        <ul class="assure"><li>Cash on delivery available</li><li>7-day size exchange</li><li>Ships in 2–3 working days</li></ul>
      </div>`;
    let qty = 1;
    $$("[data-q]", modal).forEach((b) => b.addEventListener("click", () => {
      qty = Math.max(1, Math.min(10, qty + Number(b.dataset.q)));
      $("#mqty").textContent = qty;
    }));
    $("#modalAdd").addEventListener("click", () => {
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

  /* ---------- Cart drawer ---------- */
  const drawer = $("#cartDrawer");
  let checkoutStep = false;

  function renderCart() {
    $("#cartCount").textContent = cartCount();
    $("#cartCount").classList.toggle("show", cartCount() > 0);
    const items = $("#cartItems");
    const foot = $("#cartFoot");

    if (!cart.length) {
      checkoutStep = false;
      items.innerHTML = `<div class="empty"><p>Your bag is empty.</p><button class="btn btn-ghost" data-close-cart>Continue shopping</button></div>`;
      foot.innerHTML = "";
      bindCartClose();
      return;
    }

    items.innerHTML = cart.map((i, idx) => {
      const p = byId[i.id];
      return `
        <div class="line">
          <div class="line-media" style="--tint:${p.colors[0]}">${garmentSVG(p, { withBg: false })}</div>
          <div class="line-info">
            <p class="line-name">${p.name}</p>
            <p class="line-meta">Size ${i.size} · ${rupee(p.price)}</p>
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
    const left = STORE.freeShippingAbove - sub;
    foot.innerHTML = `
      ${left > 0 ? `<p class="ship-note">Add ${rupee(left)} more for free shipping</p>` : `<p class="ship-note ok">You've unlocked free shipping</p>`}
      <div class="totals">
        <div><span>Subtotal</span><span>${rupee(sub)}</span></div>
        <div><span>Shipping</span><span>${ship ? rupee(ship) : "Free"}</span></div>
        <div class="grand"><span>Total</span><span>${rupee(sub + ship)}</span></div>
      </div>
      ${checkoutStep ? `
        <form class="checkout" id="checkoutForm">
          <label>Full name<input name="name" required autocomplete="name"></label>
          <label>Phone<input name="phone" required inputmode="tel" autocomplete="tel" pattern="[0-9+\\s-]{10,15}"></label>
          <label>Delivery address<textarea name="address" rows="3" required autocomplete="street-address"></textarea></label>
          <label>PIN code<input name="pin" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="postal-code"></label>
          <button class="btn btn-primary btn-block" type="submit">Place order on WhatsApp</button>
          <p class="fine">Payment: Cash on delivery or UPI. We'll confirm your order on WhatsApp.</p>
        </form>` : `<button class="btn btn-primary btn-block" id="toCheckout">Checkout</button>`}`;

    $$("[data-d]", items).forEach((b) => b.addEventListener("click", () => {
      const line = cart[b.dataset.line];
      line.qty += Number(b.dataset.d);
      if (line.qty < 1) cart.splice(b.dataset.line, 1);
      saveCart(); renderCart();
    }));
    $$("[data-remove]", items).forEach((b) => b.addEventListener("click", () => {
      cart.splice(b.dataset.remove, 1); saveCart(); renderCart();
    }));
    $("#toCheckout")?.addEventListener("click", () => { checkoutStep = true; renderCart(); $("#checkoutForm input").focus(); });
    $("#checkoutForm")?.addEventListener("submit", placeOrder);
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
    drawer.classList.remove("open");
    setTimeout(() => { drawer.hidden = true; unlockIfIdle(); }, 250);
    lastFocus?.focus();
  }
  $("#cartBtn").addEventListener("click", openCart);

  function unlockIfIdle() {
    if (modal.hidden && drawer.hidden) document.body.classList.remove("locked");
  }

  /* ---------- WhatsApp ordering ---------- */
  const whatsappReady = () => /^\d{10,15}$/.test(STORE.whatsapp);

  function openWhatsApp(text) {
    if (!whatsappReady()) {
      toast("Store owner: set your WhatsApp number in products.js to receive orders.");
      return false;
    }
    window.open(`https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    return true;
  }

  function placeOrder(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    const sub = cartSubtotal();
    const ship = shippingFor(sub);
    const lines = cart.map((i) => {
      const p = byId[i.id];
      return `• ${p.name} — Size ${i.size} × ${i.qty} = ${rupee(p.price * i.qty)}`;
    });
    const msg = [
      `Hello ${STORE.name}! I'd like to place an order:`, "", ...lines, "",
      `Subtotal: ${rupee(sub)}`, `Shipping: ${ship ? rupee(ship) : "Free"}`, `Total: ${rupee(sub + ship)}`, "",
      `Name: ${f.get("name")}`, `Phone: ${f.get("phone")}`, `Address: ${f.get("address")}`, `PIN: ${f.get("pin")}`,
    ].join("\n");
    if (openWhatsApp(msg)) {
      cart = []; checkoutStep = false; saveCart(); renderCart();
      toast("Thank you! Finish sending your order in WhatsApp.");
    }
  }

  $("#contactForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (openWhatsApp(`Hi ${STORE.name}, this is ${f.get("name")}.\n\n${f.get("message")}`)) e.target.reset();
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

  // Store details
  $$('[data-store="phoneDisplay"]').forEach((el) => (el.textContent = STORE.phoneDisplay));
  $$('[data-store="emailLink"]').forEach((el) => { el.textContent = STORE.email; el.href = `mailto:${STORE.email}`; });
  $("#year").textContent = new Date().getFullYear();

  // Hero art: one nighty and one kurta
  $("#heroArt").innerHTML = `
    <div class="arch"></div>
    <div class="hero-piece hero-a">${garmentSVG(byId.n2)}</div>
    <div class="hero-piece hero-b">${garmentSVG(byId.k1)}</div>`;

  renderGrid();
  renderCart();
})();
