# Tests

## Unit tests

```bash
npm test
```

These check order validation, server-side pricing and Razorpay signature checks (`tests/order-logic.test.mjs`).

## Local end-to-end stack

This runs the real website, server functions and database rules on your machine, with no Supabase, Razorpay or Netlify accounts. It needs Postgres and PostgREST (`brew install postgresql@14 postgrest`).

```bash
# 1. A throwaway database on port 55432
initdb -D /tmp/sasi-pg -U postgres --auth=trust
pg_ctl -D /tmp/sasi-pg -o "-p 55432 -k ''" -l /tmp/sasi-pg.log start
psql postgresql://postgres@localhost:55432/postgres -c "create database sasi"

# 2. Load a small Supabase stand-in, the real schema, and sample products
DB=postgresql://postgres@localhost:55432/sasi
psql $DB -f tests/supabase-shim.sql
psql $DB -f supabase/schema.sql
psql $DB -f supabase/seed.sql

# 3. Test admin accounts (local only)
psql $DB -c "insert into auth.users (email, password) values
  ('owner1@test.local','testpass1'), ('owner2@test.local','testpass2'), ('notadmin@test.local','testpass3');
  insert into admins (user_id, email) select id, email from auth.users where email like 'owner%';"

# 4. Start PostgREST and the stack (two terminals)
postgrest tests/postgrest.conf
node tests/local-stack.mjs
```

Then open:

- Shop: http://localhost:8888
- Admin: http://localhost:8888/admin/ (sign in as `owner1@test.local` / `testpass1`)

The stack prints the emails and WhatsApp messages it would have sent. The Razorpay payment popup can't open locally because there are no real keys. `tests/e2e-api.mjs` covers the online payment flow instead:

```bash
node --test tests/e2e-api.mjs
```

It checks that orders are priced on the server, that forged payment signatures are refused, that the webhook marks orders paid, that alerts go out once, and that the public and non-admin accounts can't see customer data.
