-- Skills Academy — core schema (identity, catalog, learning, assessment,
-- commerce, entitlements, organizations, credentials, analytics).
-- Conventions: uuid PKs, timestamptz, money as integer MNT (whole tögrög),
-- CHECK constraints for every enum-like column, FK indexes.

create extension if not exists pgcrypto;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ───────────────────────────── identity ─────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  locale text not null default 'mn' check (locale in ('mn', 'en')),
  timezone text not null default 'Asia/Ulaanbaatar',
  onboarding_goal text check (onboarding_goal in ('career', 'business', 'agency', 'student', 'curious')),
  daily_minutes int check (daily_minutes in (5, 10, 15, 20, 30)),
  onboarded_at timestamptz,
  show_name_on_credentials boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

-- Auto-create a profile for every new auth user.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(left(new.raw_user_meta_data ->> 'display_name', 80), split_part(coalesce(new.email, ''), '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Platform staff roles. Org roles live in organization_memberships.
create table public.platform_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin', 'editor', 'support')),
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  consent_type text not null check (consent_type in ('terms', 'privacy', 'marketing_email', 'org_progress_sharing')),
  version text not null,
  accepted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index consents_user_idx on public.consents(user_id);

-- ───────────────────────────── catalog ─────────────────────────────
create table public.academies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  description text not null default '',
  sort_order int not null default 0,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now()
);
create index tracks_academy_idx on public.tracks(academy_id);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  summary text not null default '',
  level text not null default 'beginner' check (level in ('beginner', 'intermediate', 'advanced')),
  language text not null default 'mn' check (language in ('mn', 'en')),
  library_tier text not null default 'core' check (library_tier in ('core', 'pro')),
  estimated_minutes int not null default 0 check (estimated_minutes >= 0),
  version int not null default 1 check (version >= 1),
  reviewed_at date,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived', 'coming_soon')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index courses_track_idx on public.courses(track_id);
create trigger courses_touch before update on public.courses for each row execute function public.touch_updated_at();

create table public.units (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  sort_order int not null default 0
);
create index units_course_idx on public.units(course_id);

-- A lesson is one "level" node on the learning map.
create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  summary text not null default '',
  sort_order int not null,
  access_tier text not null check (access_tier in ('free', 'premium')),
  content_version int not null default 1,
  estimated_minutes int not null default 5,
  pass_score_pct int not null default 60 check (pass_score_pct between 0 and 100),
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  updated_at timestamptz not null default now(),
  unique (course_id, slug),
  unique (course_id, sort_order)
);
create index lessons_unit_idx on public.lessons(unit_id);
create trigger lessons_touch before update on public.lessons for each row execute function public.touch_updated_at();

-- Public step content. Correct answers live in lesson_step_keys (no learner grant).
create table public.lesson_steps (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  kind text not null check (kind in ('text', 'single_choice', 'multi_choice', 'ordering', 'scenario', 'reflection')),
  sort_order int not null,
  points int not null default 0 check (points between 0 and 20),
  content jsonb not null,
  unique (lesson_id, sort_order)
);
create index lesson_steps_lesson_idx on public.lesson_steps(lesson_id);

create table public.lesson_step_keys (
  step_id uuid primary key references public.lesson_steps(id) on delete cascade,
  answer jsonb not null,
  explanation text not null default ''
);

create table public.learning_prerequisites (
  required_lesson_id uuid not null references public.lessons(id) on delete cascade,
  target_lesson_id uuid not null references public.lessons(id) on delete cascade,
  primary key (required_lesson_id, target_lesson_id),
  check (required_lesson_id <> target_lesson_id)
);
create index learning_prereq_target_idx on public.learning_prerequisites(target_lesson_id);

create table public.course_publish_versions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  version int not null,
  change_note text not null default '',
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  published_at timestamptz not null default now(),
  unique (course_id, version)
);

-- ───────────────────────────── learning ─────────────────────────────
create table public.enrollments (
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'completed')),
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, course_id)
);
create index enrollments_course_idx on public.enrollments(course_id);

create table public.lesson_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  first_started_at timestamptz not null default now(),
  completed_at timestamptz,
  last_step_id uuid references public.lesson_steps(id) on delete set null,
  best_score_pct int check (best_score_pct between 0 and 100),
  primary key (user_id, lesson_id)
);
create index lesson_progress_lesson_idx on public.lesson_progress(lesson_id);

create table public.step_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  step_id uuid not null references public.lesson_steps(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  attempt_no int not null check (attempt_no >= 1),
  answer jsonb not null,
  is_correct boolean,
  score int not null default 0 check (score >= 0),
  submitted_at timestamptz not null default now(),
  unique (user_id, step_id, attempt_no)
);
create index step_responses_user_lesson_idx on public.step_responses(user_id, lesson_id);
create index step_responses_step_idx on public.step_responses(step_id);

-- XP is granted at most once per (user, event_type, source): replay-safe.
create table public.xp_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('step_correct', 'lesson_complete', 'review_complete', 'exam_pass')),
  source_id text not null,
  points int not null check (points between 0 and 200),
  created_at timestamptz not null default now(),
  unique (user_id, event_type, source_id)
);

create table public.streaks (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  current_days int not null default 0 check (current_days >= 0),
  best_days int not null default 0 check (best_days >= 0),
  last_qualified_date date,
  timezone text not null default 'Asia/Ulaanbaatar'
);

-- Spaced review of missed steps (MVP: concept = step). Intervals are an experiment, not proof.
create table public.review_items (
  user_id uuid not null references public.profiles(id) on delete cascade,
  step_id uuid not null references public.lesson_steps(id) on delete cascade,
  next_review_at timestamptz not null,
  interval_days int not null default 1 check (interval_days >= 0),
  ease numeric(4,2) not null default 2.30,
  repetitions int not null default 0,
  lapses int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, step_id)
);
create index review_items_due_idx on public.review_items(user_id, next_review_at);

-- ───────────────────────────── assessment ─────────────────────────────
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  slug text not null unique,
  title text not null,
  kind text not null default 'final' check (kind in ('final', 'practice', 'placement')),
  pass_score_pct int not null default 80 check (pass_score_pct between 1 and 100),
  question_count int not null check (question_count between 1 and 100),
  time_limit_minutes int not null default 45 check (time_limit_minutes between 1 and 240),
  cooldown_hours int not null default 24 check (cooldown_hours >= 0),
  requires_entitlement boolean not null default true,
  version int not null default 1,
  status text not null default 'published' check (status in ('draft', 'published', 'archived'))
);
create index assessments_course_idx on public.assessments(course_id);

create table public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  kind text not null check (kind in ('single_choice', 'multi_choice')),
  topic text not null default 'general',
  body jsonb not null,
  version int not null default 1,
  active boolean not null default true
);
create index assessment_questions_assessment_idx on public.assessment_questions(assessment_id);

create table public.assessment_question_keys (
  question_id uuid primary key references public.assessment_questions(id) on delete cascade,
  correct jsonb not null,
  explanation text not null default ''
);

create table public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  attempt_number int not null check (attempt_number >= 1),
  question_ids uuid[] not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'expired')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  score_pct int check (score_pct between 0 and 100),
  passed boolean,
  unique (user_id, assessment_id, attempt_number)
);
create unique index assessment_attempts_one_open on public.assessment_attempts(user_id, assessment_id) where status = 'in_progress';
create index assessment_attempts_assessment_idx on public.assessment_attempts(assessment_id);

create table public.assessment_answers (
  attempt_id uuid not null references public.assessment_attempts(id) on delete cascade,
  question_id uuid not null references public.assessment_questions(id) on delete cascade,
  answer jsonb not null,
  is_correct boolean not null,
  primary key (attempt_id, question_id)
);

create table public.project_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  artifact_refs jsonb not null default '[]'::jsonb,
  review_status text not null default 'submitted' check (review_status in ('submitted', 'approved', 'changes_requested')),
  reviewer_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index project_submissions_user_idx on public.project_submissions(user_id);

-- ───────────────────────────── commerce ─────────────────────────────
create table public.products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  kind text not null check (kind in ('library_plan', 'course', 'bundle', 'b2b_seat')),
  name text not null,
  description text not null default '',
  -- What access this product grants. library_core < library_pro.
  scope_kind text not null check (scope_kind in ('library_core', 'library_pro', 'course', 'bundle')),
  scope_course_id uuid references public.courses(id),
  audience text not null default 'b2c' check (audience in ('b2c', 'b2b')),
  requires_student_verification boolean not null default false,
  status text not null default 'active' check (status in ('active', 'archived')),
  check ((scope_kind = 'course') = (scope_course_id is not null))
);

-- Named catalog snapshot that a bundle grants (never "all future courses").
create table public.bundle_courses (
  bundle_product_id uuid not null references public.products(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  primary key (bundle_product_id, course_id)
);
create index bundle_courses_course_idx on public.bundle_courses(course_id);

create table public.prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  code text not null unique,
  currency text not null default 'MNT' check (currency = 'MNT'),
  amount_mnt int not null check (amount_mnt > 0),
  billing_interval text not null check (billing_interval in ('one_time', 'month', 'year')),
  -- Prepaid fixed term in days (null = perpetual access to purchased scope while service operates).
  access_days int check (access_days is null or access_days > 0),
  auto_renew boolean not null default false,
  tax_mode text not null default 'vat_inclusive' check (tax_mode in ('vat_inclusive', 'vat_exclusive')),
  min_quantity int not null default 1 check (min_quantity >= 1),
  active boolean not null default true,
  check (not auto_renew or billing_interval <> 'one_time')
);
create index prices_product_idx on public.prices(product_id);

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code)),
  discount_type text not null check (discount_type in ('percent', 'fixed_mnt')),
  value int not null check (value > 0),
  usage_limit int check (usage_limit is null or usage_limit > 0),
  used_count int not null default 0 check (used_count >= 0),
  per_user_limit int not null default 1 check (per_user_limit > 0),
  applies_to_price_ids uuid[],
  starts_at timestamptz,
  expires_at timestamptz,
  active boolean not null default true,
  check (discount_type <> 'percent' or value <= 100),
  check (usage_limit is null or used_count <= usage_limit)
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  legal_name text,
  registration_number text,
  billing_email text,
  owner_user_id uuid references public.profiles(id),
  pilot_ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_user_id uuid not null references public.profiles(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  product_id uuid not null references public.products(id),
  price_id uuid not null references public.prices(id),
  quantity int not null default 1 check (quantity >= 1),
  unit_amount_mnt int not null check (unit_amount_mnt > 0),
  subtotal_mnt int not null check (subtotal_mnt > 0),
  discount_mnt int not null default 0 check (discount_mnt >= 0),
  total_mnt int not null check (total_mnt >= 0),
  currency text not null default 'MNT' check (currency = 'MNT'),
  coupon_id uuid references public.coupons(id),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded')),
  provider text not null check (provider in ('qpay', 'bonum', 'demo', 'manual_invoice')),
  provider_invoice_id text,
  provider_payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  expires_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (subtotal_mnt = unit_amount_mnt * quantity),
  check (total_mnt = subtotal_mnt - discount_mnt),
  check ((status = 'paid') = (paid_at is not null) or status = 'refunded')
);
create unique index orders_provider_invoice_uq on public.orders(provider, provider_invoice_id) where provider_invoice_id is not null;
-- Prevent accidental double purchase: one open order per buyer+price.
create unique index orders_one_pending_per_price on public.orders(buyer_user_id, price_id) where status = 'pending';
create index orders_buyer_idx on public.orders(buyer_user_id);
create index orders_org_idx on public.orders(organization_id);
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'reserved' check (status in ('reserved', 'consumed', 'released')),
  created_at timestamptz not null default now()
);
create index coupon_redemptions_coupon_user_idx on public.coupon_redemptions(coupon_id, user_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  provider text not null,
  provider_payment_id text not null,
  amount_mnt int not null check (amount_mnt >= 0),
  status text not null check (status in ('paid', 'refunded', 'partially_refunded')),
  is_demo boolean not null default false,
  settled_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb,
  unique (provider, provider_payment_id)
);
-- An order can be captured at most once.
create unique index payments_one_per_order on public.payments(order_id);

create table public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  payload_hash text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'rejected', 'error')),
  detail text,
  unique (provider, event_id)
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id),
  amount_mnt int not null check (amount_mnt > 0),
  reason text not null,
  status text not null default 'requested' check (status in ('requested', 'succeeded', 'failed')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index refunds_payment_idx on public.refunds(payment_id);

create table public.tax_documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  document_type text not null check (document_type in ('ebarimt_b2c', 'ebarimt_b2b', 'invoice')),
  external_id text,
  status text not null default 'pending' check (status in ('pending', 'issued', 'failed', 'voided')),
  created_at timestamptz not null default now()
);
create index tax_documents_order_idx on public.tax_documents(order_id);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  price_id uuid not null references public.prices(id),
  provider text not null,
  provider_subscription_id text,
  status text not null check (status in ('active', 'past_due', 'canceled', 'expired')),
  auto_renew boolean not null default false,
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  next_bill_at timestamptz,
  source_order_id uuid references public.orders(id),
  created_at timestamptz not null default now(),
  check (user_id is not null or organization_id is not null),
  check (current_period_end > current_period_start),
  check (auto_renew or next_bill_at is null)
);
create index subscriptions_user_idx on public.subscriptions(user_id);
create unique index subscriptions_source_order_uq on public.subscriptions(source_order_id) where source_order_id is not null;

-- ───────────────────────────── organizations (B2B) ─────────────────────────────
create table public.organization_memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'member')),
  status text not null default 'active' check (status in ('active', 'removed')),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (org_id, user_id)
);
create index org_memberships_user_idx on public.organization_memberships(user_id);

create table public.seat_pools (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id),
  purchased_seats int not null check (purchased_seats > 0),
  active_from timestamptz not null,
  active_until timestamptz not null,
  source_order_id uuid references public.orders(id),
  created_at timestamptz not null default now(),
  check (active_until > active_from)
);
create index seat_pools_org_idx on public.seat_pools(org_id);
create unique index seat_pools_source_order_uq on public.seat_pools(source_order_id) where source_order_id is not null;

create table public.seat_assignments (
  id uuid primary key default gen_random_uuid(),
  seat_pool_id uuid not null references public.seat_pools(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id)
);
create unique index seat_assignments_active_uq on public.seat_assignments(seat_pool_id, user_id) where revoked_at is null;
create index seat_assignments_org_idx on public.seat_assignments(org_id);
create index seat_assignments_user_idx on public.seat_assignments(user_id);

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null default 'member' check (role in ('manager', 'member')),
  token_hash text not null unique,
  created_by uuid references public.profiles(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index org_invitations_org_idx on public.organization_invitations(org_id);

create table public.organization_assigned_paths (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  assigned_by uuid references public.profiles(id),
  due_date date,
  created_at timestamptz not null default now(),
  unique (org_id, course_id)
);

-- ───────────────────────────── entitlements ─────────────────────────────
-- Authoritative, provider-independent access grants.
create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  subject_user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  scope_kind text not null check (scope_kind in ('library_core', 'library_pro', 'course', 'bundle')),
  scope_course_id uuid references public.courses(id),
  scope_bundle_product_id uuid references public.products(id),
  source_kind text not null check (source_kind in ('order', 'subscription', 'seat', 'admin_grant')),
  source_id uuid not null,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  status text not null default 'active' check (status in ('active', 'revoked')),
  is_demo boolean not null default false,
  revoked_reason text,
  created_at timestamptz not null default now(),
  check ((scope_kind = 'course') = (scope_course_id is not null)),
  check ((scope_kind = 'bundle') = (scope_bundle_product_id is not null)),
  check (valid_until is null or valid_until > valid_from),
  -- Exactly-once grant per source and subject (webhook replays cannot double-issue).
  unique (source_kind, source_id, subject_user_id)
);
create index entitlements_subject_idx on public.entitlements(subject_user_id, status);

-- ───────────────────────────── credentials ─────────────────────────────
create sequence public.credential_number_seq start 1001;

create table public.credentials (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique check (public_id ~ '^[A-Za-z0-9]{16,40}$'),
  credential_number text not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id),
  assessment_attempt_id uuid not null unique references public.assessment_attempts(id),
  holder_name text not null,
  credential_title text not null,
  score_pct int not null check (score_pct between 0 and 100),
  issuer_name text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  is_demo boolean not null default false,
  -- One valid credential per user per course (re-issues require revocation first).
  constraint credentials_revoke_reason check (revoked_at is null or revoke_reason is not null)
);
create unique index credentials_one_valid_per_course on public.credentials(user_id, course_id) where revoked_at is null;

create table public.credential_events (
  id uuid primary key default gen_random_uuid(),
  credential_id uuid not null references public.credentials(id) on delete cascade,
  kind text not null check (kind in ('issued', 'revoked', 'corrected', 'downloaded')),
  actor_id uuid references public.profiles(id),
  reason text,
  occurred_at timestamptz not null default now()
);
create index credential_events_credential_idx on public.credential_events(credential_id);

-- ───────────────────────────── analytics / audit / outbox ─────────────────────────────
create table public.product_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  anonymous_id text,
  event_name text not null check (event_name ~ '^[a-z_]{3,64}$'),
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index product_events_name_time_idx on public.product_events(event_name, occurred_at);

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index admin_audit_org_idx on public.admin_audit_log(organization_id, occurred_at);

create table public.outbox_events (
  id bigint generated always as identity primary key,
  topic text not null,
  payload jsonb not null,
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts int not null default 0
);
create index outbox_unprocessed_idx on public.outbox_events(created_at) where processed_at is null;
