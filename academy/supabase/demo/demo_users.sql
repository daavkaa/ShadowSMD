-- LOCAL DEMO DATA ONLY (fake people, fake companies). Refused on non-local DBs by scripts/migrate.mjs.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  (md5('demo:learner')::uuid,        'learner@demo.local',        '{"display_name":"Болд (демо суралцагч)"}'),
  (md5('demo:manager')::uuid,        'manager@demo.local',        '{"display_name":"Сарнай (демо HR менежер)"}'),
  (md5('demo:employee')::uuid,       'employee@demo.local',       '{"display_name":"Тэмүүлэн (демо ажилтан)"}'),
  (md5('demo:other-manager')::uuid,  'other-manager@demo.local',  '{"display_name":"Ану (өөр компанийн менежер)"}'),
  (md5('demo:other-employee')::uuid, 'other-employee@demo.local', '{"display_name":"Ганзориг (өөр компанийн ажилтан)"}'),
  (md5('demo:admin')::uuid,          'admin@demo.local',          '{"display_name":"Админ (демо)"}')
on conflict (id) do nothing;

insert into public.platform_roles (user_id, role) values (md5('demo:admin')::uuid, 'admin') on conflict do nothing;

insert into public.organizations (id, slug, name, legal_name, billing_email, owner_user_id, pilot_ends_at) values
  (md5('org:demo-agency')::uuid, 'demo-agency', 'Демо Агентлаг ХХК', 'Демо Агентлаг ХХК', 'billing@demo.local', md5('demo:manager')::uuid, now() + interval '7 days'),
  (md5('org:other-company')::uuid, 'other-company', 'Өөр Компани ХХК', 'Өөр Компани ХХК', 'billing@other.local', md5('demo:other-manager')::uuid, null)
on conflict (id) do nothing;

insert into public.organization_memberships (org_id, user_id, role) values
  (md5('org:demo-agency')::uuid, md5('demo:manager')::uuid, 'owner'),
  (md5('org:demo-agency')::uuid, md5('demo:employee')::uuid, 'member'),
  (md5('org:other-company')::uuid, md5('demo:other-manager')::uuid, 'owner'),
  (md5('org:other-company')::uuid, md5('demo:other-employee')::uuid, 'member')
on conflict do nothing;

insert into public.organization_assigned_paths (org_id, course_id, due_date) values
  (md5('org:demo-agency')::uuid, md5('course:smm-foundations')::uuid, (now() + interval '30 days')::date),
  (md5('org:other-company')::uuid, md5('course:smm-foundations')::uuid, null)
on conflict do nothing;

-- 7-day pilot seat pool granted manually by platform admin (no payment involved; labelled admin_grant).
insert into public.seat_pools (id, org_id, product_id, purchased_seats, active_from, active_until) values
  (md5('pool:demo-agency')::uuid, md5('org:demo-agency')::uuid, md5('product:b2b_seat')::uuid, 5, now() - interval '1 day', now() + interval '7 days'),
  (md5('pool:other-company')::uuid, md5('org:other-company')::uuid, md5('product:b2b_seat')::uuid, 5, now() - interval '1 day', now() + interval '30 days')
on conflict (id) do nothing;

insert into public.seat_assignments (id, seat_pool_id, org_id, user_id, assigned_by) values
  (md5('seat:demo-employee')::uuid, md5('pool:demo-agency')::uuid, md5('org:demo-agency')::uuid, md5('demo:employee')::uuid, md5('demo:manager')::uuid),
  (md5('seat:other-employee')::uuid, md5('pool:other-company')::uuid, md5('org:other-company')::uuid, md5('demo:other-employee')::uuid, md5('demo:other-manager')::uuid)
on conflict (id) do nothing;

insert into public.entitlements (subject_user_id, organization_id, scope_kind, source_kind, source_id, valid_from, valid_until, is_demo)
select s.user_id, s.org_id, 'library_pro', 'seat', s.id, now() - interval '1 day', p.active_until, true
from public.seat_assignments s join public.seat_pools p on p.id = s.seat_pool_id
where s.id in (md5('seat:demo-employee')::uuid, md5('seat:other-employee')::uuid)
on conflict do nothing;

insert into public.coupons (code, discount_type, value, usage_limit, expires_at) values
  ('PILOT10', 'percent', 10, 100, now() + interval '90 days')
on conflict (code) do nothing;
commit;
