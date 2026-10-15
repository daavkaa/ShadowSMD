# Skills Academy — Mongolian multi-academy learning PWA (MVP)

Mongolian-first, gamified skills platform. It launches with **Social Media Marketing** (5 levels + final certification; levels 1–3 free) and is designed for an all-access, multi-academy subscription and B2B seats.

> This folder is self-contained. The repository root also holds an unrelated existing app (ShadowOPS), which was left untouched.

## What works (verified by automated tests)
- Free → paywall → **provider-verified** payment (demo provider) → premium lessons → final exam (80%) → credential + public `/verify/[id]` + PDF.
- Premium content is locked at the **database** (RLS) and in the services. Raw URLs and raw API calls return 402 or redirect.
- Idempotent payment processing: duplicate or replayed webhooks, concurrent verification, amount mismatch, coupon reservation and release, refunds.
- Expired access locks premium activity but keeps history and certificates.
- B2B: org dashboard (aggregate data only), seat assign/revoke with capacity, invitations (hashed tokens, email-bound), CSV export, tenant isolation.
- Responsive Mongolian UI (360px → 1440px), accessible SVG learning map, PWA manifest + safe service worker.

## What is NOT done or verified
- **No real payment provider is live.** QPay adapter = unverified draft; Bonum recurring = stub. See `docs/runbooks/qpay-sandbox.md`.
- Supabase Auth was not exercised against a live project here; tests use `AUTH_MODE=dev`.
- No email delivery (outbox rows only), no video hosting, no eBarimt.
- English UI is partial (chrome only); course content is Mongolian only.
- Legal texts (terms, privacy, refunds) are placeholders for local counsel.

## Quick start (local, no Docker)
Requirements: Node ≥ 20.11 and PostgreSQL 16 binaries (`initdb`, `pg_ctl`), e.g. `apt install postgresql-16` or `brew install postgresql@16`.

```bash
cd academy
npm ci
cp .env.example .env.local          # defaults: dev auth + demo payments
npm run db:local:start              # throwaway cluster on 127.0.0.1:54329
node scripts/build-seed.mjs         # regenerate supabase/seed.sql from /content
DATABASE_URL=postgres://postgres@127.0.0.1:54329/academy node scripts/migrate.mjs --reset --seed --demo
npm run dev                         # http://localhost:3000/mn
```
Demo accounts (local only, from the login page): `learner@`, `employee@`, `manager@`, `other-manager@`, `admin@demo.local`.

## Tests
```bash
npm run typecheck
npm test                 # unit + integration (starts local Postgres automatically)
npm run build && npm run test:e2e   # Playwright (Chromium) full journey, security, 360px
```
See [TESTING.md](TESTING.md).

## Docs
[ARCHITECTURE](ARCHITECTURE.md) · [DECISIONS](DECISIONS.md) · [SECURITY](SECURITY.md) · [ENVIRONMENT](ENVIRONMENT.md) · [TESTING](TESTING.md) · [CHANGELOG](CHANGELOG.md)
