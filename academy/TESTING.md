# Testing

| Layer | Tool | What | Command |
|---|---|---|---|
| Unit | Vitest | scoring, XP, exam floor, pricing/coupons/VAT/savings, streak timezone, review intervals, map states, dev-session signing, HMAC, entitlement resolver, CSV injection, CMS key validation, production env safety | `npm run test:unit` |
| Integration | Vitest + real PostgreSQL 16 | RLS (premium steps, keys, function grants, write denial, learner isolation, tenant isolation), learning flow, payments (server price, reuse, pending ≠ paid, signatures, replays, concurrency ×5, amount mismatch, bundle ownership, term extension, refund), coupons (atomic, per-user, release), exam (gates, fail/cooldown, exact 80%, demo flag, name hiding), expiry, B2B (seats, cross-tenant, invitations, capacity, CSV) | `npm run test:integration` |
| E2E | Playwright (Chromium) | full free→paywall→demo payment→premium→exam→certificate→verify→PDF; org isolation via UI/API/CSV; CSRF/401/forged webhook/cron; headers; 360px overflow + keyboard; 1440px layout | `npm run build && npm run test:e2e` |

Integration tests create `academy_test` and E2E creates `academy_e2e` on the local cluster (`127.0.0.1:54329`), rebuilt from migrations on every run. Override with `TEST_DATABASE_URL` / `E2E_DATABASE_URL` (CI uses a Postgres service container).

Last local run: unit 30/30, integration 36/36, E2E 8/8.

**Not covered yet:** a live Supabase Auth round trip, the QPay sandbox contract (`QPAY_SANDBOX_CONTRACT=1`, to be written once credentials exist), visual regression, axe accessibility audits, load tests, Safari/WebKit.
