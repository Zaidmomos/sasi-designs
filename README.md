# Sasi Designs

An online store for **Sasi Designs**, which sells Indian nighties and kurtas.

- **Shop:** products, a bag, and guest checkout with **online payment (Razorpay)** or **cash on delivery**.
- **Admin panel** at `/admin`: manage orders, products (with photos), customers and store settings. No coding needed.
- **Backend:** every customer and order is stored in a database (Supabase). Payments are verified on the server.
- **Alerts:** each new order sends an **email** to the store team and the customer, and an optional **WhatsApp** message to the store team.

| Part | Service | Cost to start |
|---|---|---|
| Database, admin logins, photo storage | [Supabase](https://supabase.com) | Free plan |
| Website hosting + server functions | [Netlify](https://netlify.com) | Free plan |
| Payments | [Razorpay](https://razorpay.com) | ~2% per online payment |
| Email alerts | Any SMTP mailbox, e.g. Gmail | Free |
| WhatsApp alerts (optional) | Meta WhatsApp Cloud API | Small fee per message |

---

## One-time setup

Do these in order. Nothing secret goes into this repository. It's public, so secret keys go only into Netlify's settings.

### 1. Supabase (database)

1. Create a free account at supabase.com, then **New project**. Pick the **Mumbai** region and save the database password somewhere safe.
2. Open **SQL Editor**, paste in all of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
3. In a new query, run [`supabase/seed.sql`](supabase/seed.sql) to add 12 sample products. You can edit or hide them later.
4. Go to **Project Settings → API** and copy:
   - the **Project URL** and the **anon public** key → put both in [`public/config.js`](public/config.js), then commit. These two are safe to publish.
   - the **service_role** key → you'll paste this into Netlify in step 3. **Never put it in any file.**

### 2. Admin accounts (for your 2 store managers)

1. In Supabase go to **Authentication → Users → Add user → Create new user**. Enter each person's email and a password, and tick **Auto Confirm User**.
2. In **SQL Editor**, run this with your two real emails:
   ```sql
   insert into public.admins (user_id, email)
   select id, email from auth.users
   where email in ('first.person@example.com', 'second.person@example.com');
   ```
3. Go to **Authentication → URL Configuration** and set **Site URL** to your Netlify address from step 3 (for example `https://sasi-designs.netlify.app`). Password-reset emails link there.

**Adding an admin later:** repeat both steps for the new person.
**Removing one:** `delete from public.admins where email = 'their@email.com';`

### 3. Netlify (hosting)

1. Sign up at netlify.com with your GitHub account.
2. **Add new site → Import an existing project → GitHub →** choose **sasi-designs**. The build settings come from `netlify.toml`, so leave them as they are and click **Deploy**.
3. Go to **Site configuration → Environment variables** and add everything listed in [`.env.example`](.env.example) (sections 4–6 below explain where each value comes from). At minimum you need:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
4. Click **Deploys → Trigger deploy** so the new variables take effect.
5. Once the Netlify site works, turn off the old GitHub Pages copy: GitHub repo **Settings → Pages → Source: None**.

### 4. Razorpay (online payments)

1. Sign up at razorpay.com. Start in **Test mode**: you can take fake payments right away, before business verification (KYC).
2. **Account & Settings → API Keys → Generate key.** Put the Key ID in `RAZORPAY_KEY_ID` and the Key Secret in `RAZORPAY_KEY_SECRET` (in Netlify).
3. **Account & Settings → Webhooks → Add new webhook:**
   - URL: `https://YOUR-SITE.netlify.app/api/razorpay-webhook`
   - Secret: make up a long random password and also put it in `RAZORPAY_WEBHOOK_SECRET`
   - Events: `payment.captured`, `order.paid`, `payment.failed`
4. Make sure payments are captured automatically (**Account & Settings → Payment capture → Automatic**).
5. To accept real money, complete KYC (PAN, bank account, business details). Razorpay checks that your site has the policy pages: they're under `public/policies/`. **First replace every `[placeholder]` in them with your real details.** Then generate **Live** keys and swap them into Netlify. Set up the webhook again in Live mode.

### 5. Email alerts

Using Gmail as the sender:

1. Turn on **2-Step Verification** for the Google account, then create an **App password** at myaccount.google.com/apppasswords.
2. In Netlify set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=` the Gmail address, `SMTP_PASS=` the app password, and `ALERT_EMAILS=` both managers' emails, separated by a comma.

Each order then emails both managers, plus the customer if they entered an email. Gmail allows about 500 emails a day.

### 6. WhatsApp alerts (optional)

Meta requires a verified business and an approved message template, so setup takes a few days. The shop works fully without it: email alerts and the admin panel cover everything.

1. In [Meta for Developers](https://developers.facebook.com), create a **Business** app and add **WhatsApp**. Add a phone number to send from.
2. In **WhatsApp Manager → Message templates**, create a template:
   - Name: `new_order_alert` · Category: **Utility** · Language: **English**
   - Body: `New order {{1}} from {{2}}. Total {{3}} ({{4}}). Deliver to {{5}}. Open the admin panel to process it.`
3. Create a permanent access token (Business Settings → System users → Generate token with `whatsapp_business_messaging`).
4. In Netlify set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and `ALERT_WHATSAPP_NUMBERS` (both managers, e.g. `919876543210,919812345678`).

Separately, the admin panel has **WhatsApp** buttons on every order that open a chat with the customer using a ready-made message. They need no setup.

### 7. Test before going live

With Razorpay in test mode:
1. Place a **cash on delivery** order and an **online** order on the live site. Use Razorpay's test UPI ID `success@razorpay`, or a test card from Razorpay's docs.
2. Check that both orders appear in `/admin`, that the online one shows **Paid online**, and that the alert emails arrived.

---

## Using the admin panel

Open `https://YOUR-SITE/admin/` and sign in.

- **Orders:** new orders appear under **To do**. Open one to see the items and address, copy the address for the courier, call or WhatsApp the customer, and move it through **New → Confirmed → Shipped → Delivered**. Add the courier and tracking number before marking it shipped. **Unfinished payments** lists customers who opened the payment window but didn't pay; don't ship those. **Export CSV** downloads orders for Excel.
- **Products:** add, edit or delete products, upload photos, and switch **Visible** and **In stock** on or off with one tap.
- **Customers:** everyone who has ordered, with their order count and total spent. Click one to see their orders.
- **Settings:** shipping fee, free-shipping amount, WhatsApp number, the announcement bar, and turning COD or online payment on or off.

Admins can change an order's status, tracking and notes, but never its amounts or payment details. Those are set only by the server.

---

## How it works

```
Browser (public/)                    Netlify Functions (netlify/functions/)          Supabase
 shop: reads products & settings ─────────────────────────────────────────────────▶ products, settings (public read)
 checkout ──────────────────────▶ /api/create-order  → re-prices from DB, saves  ──▶ customers, orders, order_items
                                                       COD: send alerts
                                                       Online: create Razorpay order
 Razorpay popup ── success ─────▶ /api/verify-payment → checks signature, marks paid, alerts
 Razorpay servers ──────────────▶ /api/razorpay-webhook → same, even if the customer closed the tab
 admin (/admin) ── login ──────────────────────────────────────────────────────────▶ Row Level Security: admins only
```

- Prices are always recalculated on the server, so a customer can't change what they pay.
- Alerts are sent exactly once per order, even when the browser and the webhook both confirm a payment.
- Database rules (Row Level Security) mean the public key can only read visible products and store settings. Customer and order data is visible only to admins.

## Project layout

```
public/                 the website (served by Netlify)
  index.html, script.js, styles.css, garments.js, config.js
  admin/                the admin panel
  policies/             shipping, refund, privacy, terms and contact pages
netlify/functions/      server code: create-order, verify-payment, razorpay-webhook
supabase/               schema.sql (tables, security rules) and seed.sql (sample products)
tests/                  unit tests and a local end-to-end test setup
```

## Development

```bash
npm install
npm test            # unit tests
```

To run the whole shop locally with a local database and fake Razorpay, email and WhatsApp services, see [`tests/README.md`](tests/README.md).
