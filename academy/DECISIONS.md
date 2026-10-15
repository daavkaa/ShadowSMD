# Decisions

Brief decisions D001–D010 are adopted as written. Implementation decisions:

| ID | Decision | Why |
|---|---|---|
| I001 | App lives in `academy/`; the existing ShadowOPS files are untouched | The repo already contained an unrelated product |
| I002 | Next.js 15.5 (App Router), React 19, TS strict + `noUncheckedIndexedAccess`, Tailwind 4 | Stable, well-known APIs; Next 16 postponed |
| I003 | DB access via `postgres.js` with `withUser` (RLS as `authenticated`) / `withService` (owner) instead of supabase-js for data | One code path for local and prod; real RLS enforcement in tests; server-side transactions with row locks |
| I004 | Learner role is SELECT-only; all state transitions are server-side | Clients cannot pick amount, scope, pass/fail, tenant or role (brief §8) |
| I005 | Answer keys in separate, ungranted tables | Keys can never leak through RLS mistakes or `select *` |
| I006 | Monthly/yearly = **prepaid fixed term, no auto-renew** | QR invoices aren't recurring; no verified recurring provider yet (brief §9). Schema supports `auto_renew` later |
| I007 | Demo provider simulates an external ledger; our pipeline must still query it | Exercises the real verification path; demo grants and credentials are flagged `is_demo` and shown as "ДЕМО" |
| I008 | QPay adapter shipped as an unverified draft, refused in production until contract tests pass | Docs were unreachable from the build environment; never invent merchant behaviour as fact |
| I009 | Student plans displayed but not purchasable | No eligibility verification yet |
| I010 | B2B seats are provisioned via invoice/admin seat pools, not B2C checkout | Matches the sales-led B2B flow; avoids card-checkout seat fraud |
| I011 | Zero-total orders are rejected | No access without a payment record |
| I012 | Lesson = map level; MVP has 5 lessons + final exam (6 levels) | Matches the brief's 5/6 example; first 3 free |
| I013 | Exam: 30-question bank, 20 drawn, 40 min, 80% pass (floored), 24h cooldown, no per-question answers revealed | Protects the bank; brief's "~40 questions" is aspirational — UI states actual count |
| I014 | XP once per source (DB unique); full XP first try, half on retry; streaks never deduct | Anti-abuse, non-manipulative (brief §3.3) |
| I015 | Spaced review: first-try misses only, 1→3→7 days then ×ease | Experimental default, documented as a hypothesis |
| I016 | Seed ids = `md5(key)::uuid`, content authored in `/content/*.mjs` → generated `seed.sql` | Deterministic, idempotent, reviewable content |
| I017 | Certificates rendered on demand (pdf-lib + embedded DejaVu Sans for Mongolian Cyrillic) | Revocation/corrections always reflected; no stale stored PDFs |
| I018 | Public verifier shows name only if the learner allows; never score or exam data | Data minimisation (brief §3.3) |
| I019 | Org managers get an aggregate security-definer report only, no raw learner tables | Worker privacy (D006) |
| I020 | Dev auth (signed cookie) exists for local/test only; `getEnv()` refuses it when `APP_STAGE=production` | Lets tests run without a live Supabase project, fails closed in prod |
| I021 | In-memory rate limiting for MVP | Simple; must move to a shared store for multi-instance hosting |
| I022 | 10% VAT shown as included | Placeholder; accountant must confirm |
