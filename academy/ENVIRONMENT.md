# Environment setup

All variables are documented inline in `.env.example`. Values marked **[server]** must never be exposed to the browser.

## Local development
`AUTH_MODE=dev`, `PAYMENT_PROVIDER=demo`, `APP_STAGE=local`, DB from `npm run db:local:start` (see README).

## Staging / production on Supabase + Vercel
1. Create a Supabase project. Apply migrations in order: `supabase/migrations/*.sql` (`supabase db push`, or `DATABASE_URL=<direct connection> node scripts/migrate.mjs`). **Never** apply `supabase/local/*` or `supabase/demo/*`.
2. Seed the catalog with `node scripts/migrate.mjs --seed` (content only, no fake users).
3. Supabase Auth: enable email/password and magic link; add `https://<domain>/auth/callback` to redirect URLs; enable MFA for staff.
4. Vercel env:
   - `APP_STAGE=production`, `APP_URL=https://<domain>`
   - `DATABASE_URL` = Supabase pooler (transaction mode)
   - `AUTH_MODE=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `PAYMENT_PROVIDER=qpay` plus `QPAY_*` (only after the sandbox contract passes, then `QPAY_CONTRACT_VERIFIED=true`)
   - `CRON_SECRET`, `CREDENTIAL_ISSUER_NAME`
5. Schedule `GET /api/cron/reconcile` (header `Authorization: Bearer $CRON_SECRET`) every 10 minutes.
6. Grant staff roles manually: `insert into public.platform_roles (user_id, role) values ('<uuid>', 'admin');`
7. B2B pilot: create `organizations`, `organization_memberships` (owner) and a `seat_pools` row after a verified invoice.

## Blockers that need the founder
- QPay merchant + sandbox credentials; Bonum contract for recurring cards.
- Accountant decision on VAT inclusion and eBarimt.
- Legal texts; brand/domain; instructor IP contract (e.g. Solongo) before publishing her name.
