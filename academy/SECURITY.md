# Security

## Controls implemented
- **Authorization in the database:** RLS on every table, a SELECT-only learner role, and no grants on keys, coupons, webhooks, refunds or the demo ledger. Function EXECUTE is revoked from PUBLIC and re-granted to an allow-list (a regression test caught the default PUBLIC grant).
- **Server-derived values:** price, scope, provider, pass/fail, tenant and role always come from DB rows. The client sends only ids, answers and a price code.
- **Payments:** an order exists before any invoice. Access is granted only from provider-queried status, inside a transaction with an order row lock, an amount equality check, a payment captured once per order, and an entitlement granted once per source. Webhook events are deduplicated by `(provider, event_id)`. Demo webhooks use HMAC-SHA256 with timing-safe comparison. QPay callbacks carry an HMAC token per order and are then confirmed via the provider API. Mismatches and payments on closed orders go to the outbox for manual review. No card data is ever handled.
- **Credentials:** unguessable 20-character public ids. The public read model exposes minimal fields. Revocation is audited.
- **Organizations:** manager role checked from the DB on every mutation; target user must be an active member of the same org; seat capacity enforced under a row lock; invitation tokens stored as SHA-256 hashes and bound to the invitee's email; all actions audited.
- **CSRF:** Origin/host check on all state-changing route handlers plus SameSite=Lax cookies. Webhooks are exempt and authenticated by signature instead.
- **Open redirect:** `safeNext()` allows relative paths only.
- **Headers:** CSP, frame-ancestors none, nosniff, Referrer-Policy, Permissions-Policy.
- **CSV:** formula-injection neutralised.
- **PWA:** the service worker caches only `/_next/static` and icons; never HTML, APIs or PDFs.
- **Secrets:** server-only env vars; `.env*` gitignored; production refuses dev auth, demo payments and unverified QPay.

## Known gaps / before production
1. CSP uses `'unsafe-inline'` for scripts (Next hydration). Move to nonces.
2. Rate limiting is per-instance in memory. Use Postgres/Redis.
3. Enforce MFA for admin accounts in Supabase Auth.
4. Email delivery, data export/deletion self-service, and a breach runbook.
5. Penetration test and OWASP ASVS review; dependency audit (`npm audit` currently reports advisories in dev tooling — review).
6. QPay/Bonum: verify webhook authenticity mechanisms with each provider.
7. Exam integrity: no proctoring; the question bank should grow before credentials carry hiring weight.
8. Legal review of terms, privacy, refund policy and certificate wording.
