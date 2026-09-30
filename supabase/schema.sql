-- Sasi Designs database schema.
-- Run this once in the Supabase SQL editor (or with `supabase db reset` locally).
-- Safe to re-run: every object is created with IF NOT EXISTS / OR REPLACE.

-- ---------------------------------------------------------------
-- Admins: Supabase Auth users who may manage the store.
-- ---------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------
-- Store settings (shipping, contact details, announcement bar).
-- ---------------------------------------------------------------
create table if not exists public.settings (
  id                  int primary key default 1 check (id = 1),
  store_name          text not null default 'Sasi Designs',
  whatsapp            text not null default '',
  phone_display       text not null default '',
  email               text not null default '',
  free_shipping_above int  not null default 999 check (free_shipping_above >= 0),
  shipping_fee        int  not null default 79  check (shipping_fee >= 0),
  cod_enabled         boolean not null default true,
  online_enabled      boolean not null default true,
  announcement        text not null default 'Free shipping across India on orders above ₹999 · Easy 7-day exchange',
  updated_at          timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict do nothing;

-- ---------------------------------------------------------------
-- Products.
-- ---------------------------------------------------------------
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('nighty', 'kurta')),
  name        text not null check (char_length(name) between 2 and 120),
  description text not null default '',
  fabric      text not null default '',
  price       int  not null check (price > 0),
  mrp         int  check (mrp is null or mrp >= price),
  sizes       text[] not null default array['S','M','L','XL','XXL','3XL','4XL'],
  image_url   text,
  colors      text[] not null default array['#f3d9c4','#b5452f'],
  pattern     text not null default 'plain'
              check (pattern in ('buti','stripe','floral','check','paisley','plain')),
  tag         text,
  in_stock    boolean not null default true,
  active      boolean not null default true,
  sort_order  int not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists products_listing_idx on public.products (active, sort_order);

-- ---------------------------------------------------------------
-- Customers (guest checkout: one row per phone number).
-- ---------------------------------------------------------------
create table if not exists public.customers (
  id         uuid primary key default gen_random_uuid(),
  phone      text not null unique,
  name       text not null,
  email      text,
  address    text,
  city       text,
  pin        text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Orders and order lines.
-- ---------------------------------------------------------------
create sequence if not exists public.order_number_seq start 1001;

create table if not exists public.orders (
  id                  uuid primary key default gen_random_uuid(),
  order_number        bigint not null unique default nextval('public.order_number_seq'),
  customer_id         uuid references public.customers (id) on delete set null,
  status              text not null default 'new'
                      check (status in ('awaiting_payment','new','confirmed','shipped','delivered','cancelled')),
  payment_method      text not null check (payment_method in ('online','cod')),
  payment_status      text not null default 'unpaid'
                      check (payment_status in ('unpaid','paid','cod','failed','refunded')),
  razorpay_order_id   text unique,
  razorpay_payment_id text,
  subtotal            int not null,
  shipping            int not null,
  total               int not null,
  ship_name           text not null,
  ship_phone          text not null,
  ship_email          text,
  ship_address        text not null,
  ship_city           text not null,
  ship_pin            text not null,
  customer_note       text,
  admin_note          text,
  tracking_info       text,
  paid_at             timestamptz,
  notified_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists orders_status_idx  on public.orders (status);
create index if not exists orders_customer_idx on public.orders (customer_id);

create table if not exists public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  product_id   uuid references public.products (id) on delete set null,
  product_name text not null,
  size         text not null,
  qty          int  not null check (qty between 1 and 20),
  unit_price   int  not null,
  line_total   int  not null
);
create index if not exists order_items_order_idx on public.order_items (order_id);

-- ---------------------------------------------------------------
-- updated_at triggers.
-- ---------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['settings','products','customers','orders'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format('create trigger touch_%1$s before update on public.%1$s
                    for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------
-- Row Level Security.
-- The public (anon) key can only read visible products and settings.
-- Customers and orders are written by the server (service role key,
-- which bypasses RLS) and read/updated by admins.
-- ---------------------------------------------------------------
alter table public.admins      enable row level security;
alter table public.settings    enable row level security;
alter table public.products    enable row level security;
alter table public.customers   enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "admins see admin list" on public.admins;
create policy "admins see admin list" on public.admins
  for select to authenticated using (public.is_admin());

drop policy if exists "anyone reads settings" on public.settings;
create policy "anyone reads settings" on public.settings
  for select to anon, authenticated using (true);
drop policy if exists "admins update settings" on public.settings;
create policy "admins update settings" on public.settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "anyone reads visible products" on public.products;
create policy "anyone reads visible products" on public.products
  for select to anon, authenticated using (active or public.is_admin());
drop policy if exists "admins manage products" on public.products;
create policy "admins manage products" on public.products
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins read customers" on public.customers;
create policy "admins read customers" on public.customers
  for select to authenticated using (public.is_admin());
drop policy if exists "admins update customers" on public.customers;
create policy "admins update customers" on public.customers
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins read orders" on public.orders;
create policy "admins read orders" on public.orders
  for select to authenticated using (public.is_admin());
drop policy if exists "admins update orders" on public.orders;
create policy "admins update orders" on public.orders
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins read order items" on public.order_items;
create policy "admins read order items" on public.order_items
  for select to authenticated using (public.is_admin());

-- Admins may only change workflow fields on an order, never amounts or payment data.
revoke update on public.orders from authenticated;
grant update (status, admin_note, tracking_info) on public.orders to authenticated;

-- ---------------------------------------------------------------
-- Product photo storage: public to view, admins to upload.
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "admins upload product images" on storage.objects;
create policy "admins upload product images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());
drop policy if exists "admins change product images" on storage.objects;
create policy "admins change product images" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
drop policy if exists "admins delete product images" on storage.objects;
create policy "admins delete product images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
