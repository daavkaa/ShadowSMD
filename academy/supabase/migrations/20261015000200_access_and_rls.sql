-- Access resolution + Row Level Security.
-- Principle: learners (role "authenticated") may only READ their own rows and
-- published catalog content. Every state transition that touches money,
-- entitlements, scores, XP or credentials is performed server-side by the
-- trusted backend connection (table owner) after explicit checks. The
-- authenticated role therefore gets SELECT-only grants (plus a few narrowly
-- scoped writes on its own profile/events).

-- Start from zero privileges (Supabase grants broad defaults on new tables).
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;
grant usage on schema public to anon, authenticated;

-- Enable RLS everywhere (defence in depth even for tables with no grants).
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- ───────────── access functions ─────────────
-- Internal: does p_user hold an active premium entitlement covering p_course?
-- Not executable by clients (would leak other users' purchase state).
create or replace function public.has_premium_access(p_user uuid, p_course uuid, p_at timestamptz default now())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.entitlements e
    join public.courses c on c.id = p_course
    where e.subject_user_id = p_user
      and e.status = 'active'
      and e.valid_from <= p_at
      and (e.valid_until is null or e.valid_until > p_at)
      and (
        e.scope_kind = 'library_pro'
        or (e.scope_kind = 'library_core' and c.library_tier = 'core')
        or (e.scope_kind = 'course' and e.scope_course_id = p_course)
        or (e.scope_kind = 'bundle' and exists (
              select 1 from public.bundle_courses b
              where b.bundle_product_id = e.scope_bundle_product_id and b.course_id = p_course))
      )
  )
$$;

-- Client-callable: may the *current* user read this lesson's steps?
create or replace function public.can_access_lesson(p_lesson uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.lessons l
    join public.courses c on c.id = l.course_id
    where l.id = p_lesson
      and l.status = 'published'
      and c.status = 'published'
      and (l.access_tier = 'free' or (auth.uid() is not null and public.has_premium_access(auth.uid(), l.course_id)))
  )
$$;
grant execute on function public.can_access_lesson(uuid) to anon, authenticated;

create or replace function public.is_org_manager(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.org_id = p_org and m.user_id = auth.uid()
      and m.status = 'active' and m.role in ('owner', 'manager')
  )
$$;
grant execute on function public.is_org_manager(uuid) to authenticated;

create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active'
  )
$$;
grant execute on function public.is_org_member(uuid) to authenticated;

create or replace function public.is_platform_staff(p_role text default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.platform_roles r
    where r.user_id = auth.uid() and (p_role is null or r.role = p_role or r.role = 'admin')
  )
$$;
grant execute on function public.is_platform_staff(text) to authenticated;

-- ───────────── identity ─────────────
grant select, update (display_name, locale, timezone, onboarding_goal, daily_minutes, onboarded_at, show_name_on_credentials)
  on public.profiles to authenticated;
create policy profiles_self_select on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_self_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

grant select on public.consents to authenticated;
create policy consents_self on public.consents for select to authenticated using (user_id = auth.uid());

grant select on public.platform_roles to authenticated;
create policy platform_roles_self on public.platform_roles for select to authenticated using (user_id = auth.uid());

-- ───────────── catalog (public read of published content) ─────────────
grant select on public.academies, public.tracks, public.courses, public.units, public.lessons,
  public.learning_prerequisites, public.assessments, public.products, public.prices, public.bundle_courses
  to anon, authenticated;
create policy academies_read on public.academies for select to anon, authenticated using (status = 'published');
create policy tracks_read on public.tracks for select to anon, authenticated using (status = 'published');
create policy courses_read on public.courses for select to anon, authenticated using (status in ('published', 'coming_soon'));
create policy units_read on public.units for select to anon, authenticated
  using (exists (select 1 from public.courses c where c.id = course_id and c.status = 'published'));
create policy lessons_read on public.lessons for select to anon, authenticated
  using (status = 'published' and exists (select 1 from public.courses c where c.id = course_id and c.status = 'published'));
create policy prereq_read on public.learning_prerequisites for select to anon, authenticated using (true);
create policy assessments_read on public.assessments for select to anon, authenticated using (status = 'published');
create policy products_read on public.products for select to anon, authenticated using (status = 'active');
create policy prices_read on public.prices for select to anon, authenticated using (active);
create policy bundle_courses_read on public.bundle_courses for select to anon, authenticated using (true);

-- Step content is the protected resource: premium steps require an entitlement.
grant select on public.lesson_steps to anon, authenticated;
create policy lesson_steps_gated on public.lesson_steps for select to anon, authenticated
  using (public.can_access_lesson(lesson_id));
-- lesson_step_keys / assessment_questions / assessment_question_keys: NO grants.

-- ───────────── learning (own rows only, read-only) ─────────────
grant select on public.enrollments, public.lesson_progress, public.step_responses, public.xp_ledger,
  public.streaks, public.review_items, public.assessment_attempts, public.project_submissions to authenticated;
create policy enrollments_self on public.enrollments for select to authenticated using (user_id = auth.uid());
create policy lesson_progress_self on public.lesson_progress for select to authenticated using (user_id = auth.uid());
create policy step_responses_self on public.step_responses for select to authenticated using (user_id = auth.uid());
create policy xp_self on public.xp_ledger for select to authenticated using (user_id = auth.uid());
create policy streaks_self on public.streaks for select to authenticated using (user_id = auth.uid());
create policy review_self on public.review_items for select to authenticated using (user_id = auth.uid());
create policy attempts_self on public.assessment_attempts for select to authenticated using (user_id = auth.uid());
create policy projects_self on public.project_submissions for select to authenticated using (user_id = auth.uid());

-- ───────────── commerce (own rows, read-only) ─────────────
grant select on public.orders, public.payments, public.subscriptions, public.entitlements to authenticated;
create policy orders_self on public.orders for select to authenticated using (buyer_user_id = auth.uid());
create policy payments_self on public.payments for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.buyer_user_id = auth.uid()));
create policy subscriptions_self on public.subscriptions for select to authenticated using (user_id = auth.uid());
create policy entitlements_self on public.entitlements for select to authenticated using (subject_user_id = auth.uid());
-- coupons, coupon_redemptions, webhook events, refunds, tax_documents: server only.

-- ───────────── organizations ─────────────
grant select on public.organizations, public.organization_memberships, public.seat_pools,
  public.seat_assignments, public.organization_invitations, public.organization_assigned_paths to authenticated;
create policy orgs_members_read on public.organizations for select to authenticated using (public.is_org_member(id));
create policy memberships_read on public.organization_memberships for select to authenticated
  using (user_id = auth.uid() or public.is_org_manager(org_id));
create policy seat_pools_read on public.seat_pools for select to authenticated using (public.is_org_manager(org_id));
create policy seat_assignments_read on public.seat_assignments for select to authenticated
  using (user_id = auth.uid() or public.is_org_manager(org_id));
create policy invitations_read on public.organization_invitations for select to authenticated using (public.is_org_manager(org_id));
create policy assigned_paths_read on public.organization_assigned_paths for select to authenticated using (public.is_org_member(org_id));

-- Manager-facing report: aggregate, minimal fields, only active members of THIS org.
-- Deliberately excludes email, answers, attempt details and activity timestamps.
create or replace function public.org_member_progress(p_org uuid)
returns table (
  user_id uuid,
  display_name text,
  role text,
  has_active_seat boolean,
  lessons_completed int,
  final_passed boolean,
  credential_number text
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_org_manager(p_org) then
    raise exception 'not_org_manager' using errcode = '42501';
  end if;
  return query
  select m.user_id,
         p.display_name,
         m.role,
         exists (select 1 from public.seat_assignments s join public.seat_pools sp on sp.id = s.seat_pool_id
                 where s.org_id = p_org and s.user_id = m.user_id and s.revoked_at is null and sp.active_until > now()),
         (select count(*)::int from public.lesson_progress lp
            join public.organization_assigned_paths ap on ap.org_id = p_org
            join public.lessons l on l.id = lp.lesson_id and l.course_id = ap.course_id
          where lp.user_id = m.user_id and lp.status = 'completed'),
         exists (select 1 from public.credentials c join public.organization_assigned_paths ap on ap.org_id = p_org and ap.course_id = c.course_id
                 where c.user_id = m.user_id and c.revoked_at is null),
         (select c.credential_number from public.credentials c join public.organization_assigned_paths ap on ap.org_id = p_org and ap.course_id = c.course_id
          where c.user_id = m.user_id and c.revoked_at is null order by c.issued_at desc limit 1)
  from public.organization_memberships m
  join public.profiles p on p.id = m.user_id
  where m.org_id = p_org and m.status = 'active'
  order by p.display_name;
end $$;
grant execute on function public.org_member_progress(uuid) to authenticated;

-- ───────────── credentials ─────────────
grant select on public.credentials to authenticated;
create policy credentials_self on public.credentials for select to authenticated using (user_id = auth.uid());

-- Public verification read-model: no table access for anon, just this function.
create or replace function public.verify_credential(p_public_id text)
returns table (
  credential_number text,
  credential_title text,
  holder_name text,
  issuer_name text,
  issued_at timestamptz,
  expires_at timestamptz,
  status text,
  is_demo boolean
) language sql stable security definer set search_path = public as $$
  select c.credential_number,
         c.credential_title,
         case when p.show_name_on_credentials then c.holder_name else null end,
         c.issuer_name,
         c.issued_at,
         c.expires_at,
         case when c.revoked_at is not null then 'revoked'
              when c.expires_at is not null and c.expires_at <= now() then 'expired'
              else 'valid' end,
         c.is_demo
  from public.credentials c
  join public.profiles p on p.id = c.user_id
  where c.public_id = p_public_id
$$;
grant execute on function public.verify_credential(text) to anon, authenticated;

-- ───────────── analytics ─────────────
grant insert (user_id, anonymous_id, event_name, properties) on public.product_events to authenticated;
create policy product_events_insert_self on public.product_events for insert to authenticated with check (user_id = auth.uid());

-- ───────────── function privileges (final say) ─────────────
-- Per-schema default privileges cannot remove PostgreSQL's built-in PUBLIC
-- EXECUTE grant, so revoke explicitly after all functions exist, then re-grant
-- the client-callable allow-list.
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.can_access_lesson(uuid) to anon, authenticated;
grant execute on function public.verify_credential(text) to anon, authenticated;
grant execute on function public.is_org_manager(uuid) to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_platform_staff(text) to authenticated;
grant execute on function public.org_member_progress(uuid) to authenticated;
