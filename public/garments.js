// Draws the garment illustrations used when a product has no photo.
// Shared by the shop and the admin panel.
window.SasiGarment = (() => {
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

  const HEX = /^#[0-9a-f]{6}$/i;
  const escAttr = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

  function garmentSVG(p, { withBg = true } = {}) {
    const uid = `g${++svgUid}`;
    const shape = SHAPES[p.type] || SHAPES.kurta;
    const colors = Array.isArray(p.colors) ? p.colors : [];
    const base = HEX.test(colors[0]) ? colors[0] : "#f3d9c4";
    const accent = HEX.test(colors[1]) ? colors[1] : "#b5452f";
    const pattern = ["buti", "stripe", "floral", "check", "paisley", "plain"].includes(p.pattern) ? p.pattern : "plain";
    return `
      <svg viewBox="0 0 200 270" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escAttr(p.name)}">
        <defs>
          ${patternDef(uid + "p", pattern, [base, accent])}
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

  return { svg: garmentSVG };
})();
