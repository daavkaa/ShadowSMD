-- Simulated EXTERNAL payment provider state used only by the DemoPaymentAdapter
-- (PAYMENT_PROVIDER=demo, refused in production). It models the provider's own
-- ledger so that our order pipeline still has to *query* a provider and verify
-- before granting access — exactly like a real integration. No grants.
create table public.demo_provider_invoices (
  invoice_id text primary key,
  amount_mnt int not null check (amount_mnt > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  payment_id text unique,
  paid_amount_mnt int,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table public.demo_provider_invoices enable row level security;
revoke all on public.demo_provider_invoices from anon, authenticated;
