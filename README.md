# Sasi Designs

A storefront website for **Sasi Designs**, which sells Indian nighties and kurtas.

It's a static site (plain HTML, CSS and JavaScript, with no build step), so it can be hosted free on GitHub Pages.

## Features

- A product catalogue of nighties and kurtas, with category filters and sorting
- A quick-view window for each product, with size and quantity pickers
- A shopping bag that is saved in the browser, with a free-shipping threshold
- Checkout that sends the order to the store on WhatsApp (cash on delivery or UPI)
- A contact form that also opens WhatsApp
- A responsive layout for phones, tablets and desktops

## Setup

Open `products.js` and edit the `STORE` settings:

```js
const STORE = {
  whatsapp: "919876543210",        // country code + number, digits only
  phoneDisplay: "+91 98765 43210",
  email: "hello@sasidesigns.in",
  freeShippingAbove: 999,
  shippingFee: 79,
};
```

Orders go nowhere until you set a real WhatsApp number.

## Adding or editing products

Every product is an entry in the `PRODUCTS` list in `products.js`:

```js
{
  id: "k7", type: "kurta", name: "Green Leheriya Kurta",
  price: 1049, mrp: 1399, fabric: "Cotton, leheriya dye",
  colors: ["#8fbf7a", "#2f5a2a"], pattern: "stripe", tag: "New",
  desc: "Short description shown in the quick view.",
}
```

- `type` is `"nighty"` or `"kurta"`.
- `pattern` is one of `buti`, `stripe`, `floral`, `check`, `paisley` or `plain`.
- `colors` sets the fabric colour and the print colour of the drawn garment.

## Running locally

Open `index.html` in a browser, or run a local server:

```bash
python3 -m http.server 8000
```
