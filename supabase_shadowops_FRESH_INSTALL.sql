-- SHADOWOPS v1.7 — COMPLETE FRESH DATABASE INSTALLER
-- For a NEW Supabase project only. No earlier migrations are required.
-- FIRST: create your login in Supabase Authentication > Users.
-- Replace YOUR_LOGIN_EMAIL_HERE below with that exact login email.
-- Paste and Run this ENTIRE file in SQL Editor (postgres role).
-- All work is one transaction. If anything fails, no partial installation remains.
begin;
set local shadowops.owner_email = 'YOUR_LOGIN_EMAIL_HERE';
do $$
declare uid uuid;
begin
 if position('@' in current_setting('shadowops.owner_email'))=0 then
  raise exception 'Replace YOUR_LOGIN_EMAIL_HERE at the top with your login email, then run the whole file.';
 end if;
 select id into uid from auth.users where lower(email)=lower(trim(current_setting('shadowops.owner_email')));
 if uid is null then raise exception 'Create this email as a login in Authentication > Users first, then run the whole file again.'; end if;
 if to_regclass('public.workspaces') is not null then raise exception 'This database already has ShadowOPS tables. Use the v1.7 incremental migration on an existing install.'; end if;
 perform set_config('shadowops.owner_id',uid::text,true);
end $$;
create table public.workspaces (
 id uuid primary key default gen_random_uuid(),name text not null,
 created_by uuid references auth.users(id),created_at timestamptz not null default now()
);
create table public.workspace_members (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),primary key(workspace_id,user_id)
);
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
do $$
declare ws uuid;
begin
 insert into public.workspaces(name,created_by) values('ShadowOPS',current_setting('shadowops.owner_id')::uuid) returning id into ws;
 perform set_config('shadowops.workspace_id',ws::text,true);
end $$;


-- ShadowOPS v2.1 Command Center migration
-- Run once in Supabase > SQL Editor after the original ShadowOPS database setup.

create extension if not exists pgcrypto;

create table if not exists public.personnel (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  unit_type text not null check (unit_type in ('designer','manager')),
  name text not null,
  role text,
  email text,
  notes text,
  capacity_units numeric not null default 40,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  logo_data text,
  accent_color text not null default '#5f9f35',
  contract_start date,
  contract_end date,
  poster_count integer not null default 0,
  reel_count integer not null default 0,
  satisfaction numeric not null default 100,
  service_consistency numeric not null default 100,
  status text not null default 'active' check(status in ('active','paused','ended','archived')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.client_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  personnel_id uuid not null references public.personnel(id) on delete cascade,
  unit_type text not null check(unit_type in ('designer','manager')),
  created_at timestamptz not null default now(),
  unique(client_id, personnel_id)
);

create table if not exists public.measurements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  unit_type text not null check(unit_type in ('designer','manager')),
  record_type text not null check(record_type in ('error','achievement','consistency')),
  name text not null,
  description text,
  points numeric not null default 1,
  pillar text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_records_v2 (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  personnel_id uuid not null references public.personnel(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  measurement_id uuid references public.measurements(id) on delete set null,
  unit_type text not null check(unit_type in ('designer','manager')),
  record_type text not null check(record_type in ('error','achievement','consistency')),
  record_date date not null default current_date,
  severity integer not null default 1 check(severity between 1 and 3),
  distress_level integer not null default 0 check(distress_level between 0 and 4),
  description text,
  action_taken text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists personnel_workspace_idx on public.personnel(workspace_id,unit_type);
create index if not exists clients_workspace_idx on public.clients(workspace_id,status);
create index if not exists measurements_workspace_idx on public.measurements(workspace_id,unit_type,record_type);
create index if not exists activities_workspace_idx on public.activity_records_v2(workspace_id,record_date);
create index if not exists assignments_personnel_idx on public.client_assignments(personnel_id);
create index if not exists assignments_client_idx on public.client_assignments(client_id);

alter table public.personnel enable row level security;
alter table public.clients enable row level security;
alter table public.client_assignments enable row level security;
alter table public.measurements enable row level security;
alter table public.activity_records_v2 enable row level security;

drop policy if exists "workspace personnel access" on public.personnel;
create policy "workspace personnel access" on public.personnel for all using (
 exists(select 1 from public.workspace_members wm where wm.workspace_id=personnel.workspace_id and wm.user_id=auth.uid())
) with check (
 exists(select 1 from public.workspace_members wm where wm.workspace_id=personnel.workspace_id and wm.user_id=auth.uid())
);
drop policy if exists "workspace clients access" on public.clients;
create policy "workspace clients access" on public.clients for all using (
 exists(select 1 from public.workspace_members wm where wm.workspace_id=clients.workspace_id and wm.user_id=auth.uid())
) with check (
 exists(select 1 from public.workspace_members wm where wm.workspace_id=clients.workspace_id and wm.user_id=auth.uid())
);
drop policy if exists "workspace assignments access" on public.client_assignments;
create policy "workspace assignments access" on public.client_assignments for all using (
 exists(select 1 from public.workspace_members wm where wm.workspace_id=client_assignments.workspace_id and wm.user_id=auth.uid())
) with check (
 exists(select 1 from public.workspace_members wm where wm.workspace_id=client_assignments.workspace_id and wm.user_id=auth.uid())
);
drop policy if exists "workspace measurements access" on public.measurements;
create policy "workspace measurements access" on public.measurements for all using (
 exists(select 1 from public.workspace_members wm where wm.workspace_id=measurements.workspace_id and wm.user_id=auth.uid())
) with check (
 exists(select 1 from public.workspace_members wm where wm.workspace_id=measurements.workspace_id and wm.user_id=auth.uid())
);
drop policy if exists "workspace activities v2 access" on public.activity_records_v2;
create policy "workspace activities v2 access" on public.activity_records_v2 for all using (
 exists(select 1 from public.workspace_members wm where wm.workspace_id=activity_records_v2.workspace_id and wm.user_id=auth.uid())
) with check (
 exists(select 1 from public.workspace_members wm where wm.workspace_id=activity_records_v2.workspace_id and wm.user_id=auth.uid())
);

grant all on public.personnel, public.clients, public.client_assignments, public.measurements, public.activity_records_v2 to authenticated;

-- Seed standards. Duplicate-safe by name/unit/type.
insert into public.measurements(workspace_id,unit_type,record_type,name,description,points,pillar)
select w.id, x.unit_type, x.record_type, x.name, x.description, x.points, x.pillar
from public.workspaces w
cross join (values
('manager','consistency','Time consistency','Maintains reliable timing across recurring responsibilities',1.0,'Reliability'),
('manager','consistency','Plan consistency','Plans are delivered with stable quality and timing',1.2,'Planning'),
('manager','achievement','Effective plan','Plan produces strong outcomes and clear execution',2.0,'Planning'),
('manager','achievement','Effective client communication','Clear, proactive and useful communication with client',2.0,'Client Impact'),
('manager','achievement','Effective designer communication','Briefs and feedback enable efficient design work',2.0,'Teamwork'),
('manager','consistency','Work-time punctuality','Arrives and responds reliably during work hours',1.0,'Reliability'),
('manager','achievement','Extra workload','Took meaningful additional responsibility',1.5,'Teamwork'),
('manager','achievement','Helped the team','Removed blockers or supported teammates',1.5,'Teamwork'),
('manager','consistency','Deadline performance','Consistently meets agreed deadlines',1.5,'Reliability'),
('manager','error','Missed deadline','Failed to meet an agreed deadline',-2.0,'Reliability'),
('manager','error','Weak client communication','Communication caused confusion, delay or dissatisfaction',-2.0,'Client Impact'),
('manager','error','Weak designer brief','Brief or feedback was incomplete or unclear',-2.0,'Teamwork'),
('designer','error','Typography hierarchy','Typography hierarchy or readability issue',-1.5,'Quality'),
('designer','error','Brand inconsistency','Work does not follow the brand system',-2.0,'Quality'),
('designer','error','Missed deadline','Creative delivery missed the agreed deadline',-2.0,'Reliability'),
('designer','achievement','Strong creative concept','Concept materially improved the work',2.0,'Quality'),
('designer','achievement','Client compliment','Client explicitly praised the work',2.0,'Client Impact'),
('designer','achievement','Helped the team','Meaningfully supported another team member',1.5,'Teamwork'),
('designer','consistency','Reliable delivery','Consistent delivery against plan',1.2,'Reliability'),
('designer','consistency','Brand consistency','Consistently follows brand systems',1.0,'Quality'),
('designer','consistency','Proactive communication','Raises risks and updates stakeholders early',1.0,'Teamwork')
) as x(unit_type,record_type,name,description,points,pillar)
where not exists (
 select 1 from public.measurements m where m.workspace_id=w.id and m.unit_type=x.unit_type and m.record_type=x.record_type and lower(m.name)=lower(x.name)
);



-- ShadowOPS v1.2 — Team Access, Tasks, Revenue, Profiles
-- ADDITIVE migration. Run once in Supabase SQL Editor BEFORE deploying the v1.2 frontend.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Access / clearance
-- ---------------------------------------------------------------------------
alter table public.workspace_members add column if not exists access_level text not null default 'owner';
alter table public.workspace_members add column if not exists personnel_id uuid references public.personnel(id) on delete set null;
alter table public.workspace_members add column if not exists is_default boolean not null default true;
create unique index if not exists workspace_members_workspace_user_uq on public.workspace_members(workspace_id,user_id);

alter table public.personnel add column if not exists clearance_level text not null default 'p';
alter table public.personnel add column if not exists avatar_data text;
alter table public.clients add column if not exists monthly_price_mnt numeric not null default 0;
alter table public.clients add column if not exists termination_reason text;
alter table public.clients add column if not exists termination_note text;
alter table public.clients add column if not exists status_changed_at timestamptz;

-- Normalize legacy values before installing checks.
update public.workspace_members set access_level='owner' where access_level is null or access_level not in ('owner','e','m','p','a');
update public.personnel set clearance_level='p' where clearance_level is null or clearance_level not in ('e','m','p','a');

do $$ begin
  if not exists (select 1 from pg_constraint where conname='workspace_members_access_level_check') then
    alter table public.workspace_members add constraint workspace_members_access_level_check check(access_level in ('owner','e','m','p','a'));
  end if;
  if not exists (select 1 from pg_constraint where conname='personnel_clearance_level_check') then
    alter table public.personnel add constraint personnel_clearance_level_check check(clearance_level in ('e','m','p','a'));
  end if;
end $$;

-- Pending invitations. No email provider is required: an owner can stage access by
-- email, and the membership is claimed automatically when that email signs in.
create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  access_level text not null check(access_level in ('e','m','p','a')),
  personnel_id uuid references public.personnel(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  unique(workspace_id,email)
);

-- ---------------------------------------------------------------------------
-- Task management
-- ---------------------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  title text not null,
  details text,
  designer_id uuid references public.personnel(id) on delete set null,
  manager_id uuid references public.personnel(id) on delete set null,
  supervisor_id uuid references public.personnel(id) on delete set null,
  due_at timestamptz,
  status text not null default 'assigned' check(status in ('assigned','in_progress','completed','cancelled','rejected','delayed','postponed')),
  status_reason text,
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_workspace_status_idx on public.tasks(workspace_id,status,due_at);
create index if not exists tasks_designer_idx on public.tasks(designer_id);
create index if not exists tasks_manager_idx on public.tasks(manager_id);
create index if not exists tasks_supervisor_idx on public.tasks(supervisor_id);

create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  event_type text not null,
  reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists task_events_task_idx on public.task_events(task_id,created_at desc);

alter table public.activity_records_v2 add column if not exists task_id uuid references public.tasks(id) on delete set null;
create unique index if not exists activity_task_person_uq on public.activity_records_v2(task_id,personnel_id) where task_id is not null;

-- ---------------------------------------------------------------------------
-- Revenue / bonus work
-- ---------------------------------------------------------------------------
create table if not exists public.client_revenue_months (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  month date not null,
  billing_status text not null default 'billable' check(billing_status in ('billable','paused','cancelled')),
  override_amount_mnt numeric,
  reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id,month)
);
create index if not exists client_revenue_month_idx on public.client_revenue_months(workspace_id,month);

create table if not exists public.bonus_work (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  personnel_id uuid not null references public.personnel(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  title text not null,
  amount_mnt numeric not null default 0,
  work_date date not null default current_date,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists bonus_work_person_idx on public.bonus_work(personnel_id,work_date desc);

-- Full client lifecycle history (Hotfix 4 only stored the latest transition).
create table if not exists public.client_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  status text not null check(status in ('active','paused','ended','archived')),
  reason text,
  note text,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);
create index if not exists client_lifecycle_events_idx on public.client_lifecycle_events(client_id,changed_at desc);

-- ---------------------------------------------------------------------------
-- Access helper functions (SECURITY DEFINER avoids RLS recursion)
-- ---------------------------------------------------------------------------
create or replace function public.shadowops_access_level(ws uuid)
returns text language sql stable security definer set search_path=public as $$
  select wm.access_level from public.workspace_members wm
  where wm.workspace_id=ws and wm.user_id=auth.uid() limit 1
$$;

create or replace function public.shadowops_personnel_id(ws uuid)
returns uuid language sql stable security definer set search_path=public as $$
  select wm.personnel_id from public.workspace_members wm
  where wm.workspace_id=ws and wm.user_id=auth.uid() limit 1
$$;

create or replace function public.shadowops_is_exec(ws uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(public.shadowops_access_level(ws) in ('owner','e','m'),false)
$$;

create or replace function public.shadowops_is_owner(ws uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(public.shadowops_access_level(ws)='owner',false)
$$;

create or replace function public.shadowops_is_member(ws uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.workspace_members wm where wm.workspace_id=ws and wm.user_id=auth.uid())
$$;

grant execute on function public.shadowops_access_level(uuid), public.shadowops_personnel_id(uuid), public.shadowops_is_exec(uuid), public.shadowops_is_owner(uuid), public.shadowops_is_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Membership RPCs
-- ---------------------------------------------------------------------------
-- Older ShadowOPS installs may have a legacy `role` column on workspace_members.
-- This helper keeps Team Access compatible whether that column exists or not.
create or replace function public.shadowops_upsert_membership(
  p_workspace uuid,
  p_user uuid,
  p_access text,
  p_personnel uuid,
  p_default boolean
)
returns void language plpgsql security definer set search_path=public as $$
declare role_nullable text; role_default text;
begin
  select c.is_nullable,c.column_default into role_nullable,role_default
  from information_schema.columns c
  where c.table_schema='public' and c.table_name='workspace_members' and c.column_name='role';

  if found and role_nullable='NO' and role_default is null then
    execute $sql$
      insert into public.workspace_members(workspace_id,user_id,role,access_level,personnel_id,is_default)
      values($1,$2,$3,$4,$5,$6)
      on conflict(workspace_id,user_id) do update set
        access_level=excluded.access_level,
        personnel_id=excluded.personnel_id,
        is_default=excluded.is_default
    $sql$ using p_workspace,p_user,case when p_access='owner' then 'owner' else 'member' end,p_access,p_personnel,p_default;
  else
    insert into public.workspace_members(workspace_id,user_id,access_level,personnel_id,is_default)
    values(p_workspace,p_user,p_access,p_personnel,p_default)
    on conflict(workspace_id,user_id) do update set
      access_level=excluded.access_level,
      personnel_id=excluded.personnel_id,
      is_default=excluded.is_default;
  end if;
end $$;
revoke all on function public.shadowops_upsert_membership(uuid,uuid,text,uuid,boolean) from public;
revoke all on function public.shadowops_upsert_membership(uuid,uuid,text,uuid,boolean) from authenticated;
create or replace function public.shadowops_claim_invites()
returns integer language plpgsql security definer set search_path=public,auth as $$
declare
  user_email text := lower(coalesce(auth.jwt()->>'email',''));
  inv record;
  n integer := 0;
begin
  if auth.uid() is null or user_email='' then return 0; end if;
  for inv in select * from public.workspace_invites where lower(email)=user_email and claimed_at is null loop
    update public.workspace_members set is_default=false where user_id=auth.uid();
    perform public.shadowops_upsert_membership(inv.workspace_id,auth.uid(),inv.access_level,inv.personnel_id,true);
    update public.workspace_invites set claimed_at=now() where id=inv.id;
    n:=n+1;
  end loop;
  return n;
end $$;

grant execute on function public.shadowops_claim_invites() to authenticated;

create or replace function public.shadowops_my_memberships()
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'workspace_id',wm.workspace_id,
    'access_level',wm.access_level,
    'personnel_id',wm.personnel_id,
    'is_default',wm.is_default
  ) order by wm.is_default desc, wm.access_level='owner' desc),'[]'::jsonb)
  from public.workspace_members wm where wm.user_id=auth.uid()
$$;
grant execute on function public.shadowops_my_memberships() to authenticated;

create or replace function public.shadowops_list_team_access(ws uuid)
returns jsonb language plpgsql security definer set search_path=public,auth as $$
begin
  if not public.shadowops_is_exec(ws) then raise exception 'Not authorized'; end if;
  return jsonb_build_object(
    'members',coalesce((select jsonb_agg(jsonb_build_object(
      'user_id',wm.user_id,'email',u.email,'access_level',wm.access_level,
      'personnel_id',wm.personnel_id,'is_default',wm.is_default
    ) order by case wm.access_level when 'owner' then 0 when 'e' then 1 when 'm' then 2 when 'p' then 3 else 4 end,u.email)
      from public.workspace_members wm left join auth.users u on u.id=wm.user_id where wm.workspace_id=ws),'[]'::jsonb),
    'invites',coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'email',i.email,'access_level',i.access_level,'personnel_id',i.personnel_id,'created_at',i.created_at
    ) order by i.created_at desc) from public.workspace_invites i where i.workspace_id=ws and i.claimed_at is null),'[]'::jsonb)
  );
end $$;
grant execute on function public.shadowops_list_team_access(uuid) to authenticated;

create or replace function public.shadowops_add_member(ws uuid, member_email text, level text, linked_personnel uuid default null)
returns text language plpgsql security definer set search_path=public,auth as $$
declare uid uuid; clean_email text:=lower(trim(member_email));
begin
  if not public.shadowops_is_owner(ws) then raise exception 'Only the Owner can change Team Access'; end if;
  if level not in ('e','m','p','a') then raise exception 'Invalid access level'; end if;
  if level in ('p','a') and linked_personnel is null then raise exception 'P-Level and A-Level access must be linked to a personnel profile'; end if;
  select id into uid from auth.users where lower(email)=clean_email limit 1;
  if uid is not null then
    update public.workspace_members set is_default=false where user_id=uid;
    perform public.shadowops_upsert_membership(ws,uid,level,linked_personnel,true);
    return 'member_added';
  end if;
  insert into public.workspace_invites(workspace_id,email,access_level,personnel_id,created_by)
  values(ws,clean_email,level,linked_personnel,auth.uid())
  on conflict(workspace_id,email) do update set access_level=excluded.access_level,personnel_id=excluded.personnel_id,created_by=auth.uid(),created_at=now(),claimed_at=null;
  return 'invite_staged';
end $$;
grant execute on function public.shadowops_add_member(uuid,text,text,uuid) to authenticated;

create or replace function public.shadowops_update_member(ws uuid, target_user uuid, level text, linked_personnel uuid default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.shadowops_is_owner(ws) then raise exception 'Only the Owner can change Team Access'; end if;
  if target_user=auth.uid() then raise exception 'Owner cannot downgrade the currently signed-in Owner account'; end if;
  if level not in ('e','m','p','a') then raise exception 'Invalid access level'; end if;
  if level in ('p','a') and linked_personnel is null then raise exception 'P-Level and A-Level access must be linked to personnel'; end if;
  update public.workspace_members set access_level=level,personnel_id=linked_personnel where workspace_id=ws and user_id=target_user;
end $$;
grant execute on function public.shadowops_update_member(uuid,uuid,text,uuid) to authenticated;

create or replace function public.shadowops_remove_member(ws uuid,target_user uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.shadowops_is_owner(ws) then raise exception 'Only the Owner can remove access'; end if;
  if target_user=auth.uid() then raise exception 'You cannot remove your own Owner access'; end if;
  delete from public.workspace_members where workspace_id=ws and user_id=target_user;
end $$;
grant execute on function public.shadowops_remove_member(uuid,uuid) to authenticated;

create or replace function public.shadowops_cancel_invite(ws uuid,invite_uuid uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.shadowops_is_owner(ws) then raise exception 'Only the Owner can remove invitations'; end if;
  delete from public.workspace_invites where id=invite_uuid and workspace_id=ws;
end $$;
grant execute on function public.shadowops_cancel_invite(uuid,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Task status RPC. Assigned personnel can complete; executives can set all states.
-- Completion creates neutral Activity records (measurement NULL) for each assignee.
-- E/M can later edit those Activity records and attach measuring factors / distress.
-- ---------------------------------------------------------------------------
create or replace function public.shadowops_set_task_status(task_uuid uuid,new_status text,reason_text text default null)
returns void language plpgsql security definer set search_path=public as $$
declare t public.tasks%rowtype; self_person uuid; can_manage boolean; old_status text;
begin
  select * into t from public.tasks where id=task_uuid;
  if not found then raise exception 'Task not found'; end if;
  self_person:=public.shadowops_personnel_id(t.workspace_id);
  can_manage:=public.shadowops_is_exec(t.workspace_id);
  if new_status not in ('assigned','in_progress','completed','cancelled','rejected','delayed','postponed') then raise exception 'Invalid task state'; end if;
  if not can_manage and not (new_status='completed' and self_person is not null and self_person in (t.designer_id,t.manager_id,t.supervisor_id)) then raise exception 'Not authorized'; end if;
  if new_status in ('cancelled','rejected','delayed','postponed') and coalesce(trim(reason_text),'')='' then raise exception 'A reason is required for this task state'; end if;
  old_status:=t.status;
  update public.tasks set status=new_status,status_reason=case when new_status in ('cancelled','rejected','delayed','postponed') then reason_text else null end,
    completed_at=case when new_status='completed' then coalesce(completed_at,now()) else null end,updated_at=now()
  where id=task_uuid;
  insert into public.task_events(workspace_id,task_id,event_type,reason,created_by)
  values(t.workspace_id,t.id,new_status,reason_text,auth.uid());
  if new_status='completed' and old_status<>'completed' then
    insert into public.activity_records_v2(workspace_id,personnel_id,client_id,measurement_id,task_id,unit_type,record_type,record_date,severity,distress_level,description,action_taken,created_by)
    select t.workspace_id,pid,t.client_id,null,t.id,p.unit_type,'consistency',(now() at time zone 'Asia/Ulaanbaatar')::date,1,0,'Completed task: '||t.title,null,auth.uid()
    from (select distinct unnest(array[t.designer_id,t.manager_id,t.supervisor_id]) pid) q
    join public.personnel p on p.id=q.pid
    where q.pid is not null
    on conflict(task_id,personnel_id) where task_id is not null do nothing;
  end if;
end $$;
grant execute on function public.shadowops_set_task_status(uuid,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Client lifecycle automatic history
-- ---------------------------------------------------------------------------
create or replace function public.shadowops_client_lifecycle_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' or old.status is distinct from new.status then
    insert into public.client_lifecycle_events(workspace_id,client_id,status,reason,note,changed_by,changed_at)
    values(new.workspace_id,new.id,new.status,new.termination_reason,new.termination_note,auth.uid(),coalesce(new.status_changed_at,now()));
  end if;
  return new;
end $$;
drop trigger if exists shadowops_client_lifecycle_history on public.clients;
create trigger shadowops_client_lifecycle_history after insert or update of status on public.clients
for each row execute function public.shadowops_client_lifecycle_trigger();

-- Seed one lifecycle event for existing clients if none exists.
insert into public.client_lifecycle_events(workspace_id,client_id,status,reason,note,changed_by,changed_at)
select c.workspace_id,c.id,c.status,c.termination_reason,c.termination_note,c.created_by,coalesce(c.status_changed_at,c.created_at)
from public.clients c where not exists(select 1 from public.client_lifecycle_events e where e.client_id=c.id);

-- ---------------------------------------------------------------------------
-- RLS / permissions
-- ---------------------------------------------------------------------------
alter table public.tasks enable row level security;
alter table public.task_events enable row level security;
alter table public.client_revenue_months enable row level security;
alter table public.bonus_work enable row level security;
alter table public.client_lifecycle_events enable row level security;
alter table public.workspace_invites enable row level security;

-- Personnel: executives see all; P/A see only linked self.
drop policy if exists "workspace personnel access" on public.personnel;
drop policy if exists "shadowops personnel select" on public.personnel;
drop policy if exists "shadowops personnel write" on public.personnel;
create policy "shadowops personnel select" on public.personnel for select using (
  public.shadowops_is_exec(workspace_id) or id=public.shadowops_personnel_id(workspace_id)
);
create policy "shadowops personnel write" on public.personnel for all using (public.shadowops_is_exec(workspace_id)) with check (public.shadowops_is_exec(workspace_id));

-- Clients: executives see all; P/A see assigned clients only.
drop policy if exists "workspace clients access" on public.clients;
drop policy if exists "shadowops clients select" on public.clients;
drop policy if exists "shadowops clients write" on public.clients;
create policy "shadowops clients select" on public.clients for select using (
  public.shadowops_is_exec(workspace_id) or exists(
    select 1 from public.client_assignments ca where ca.client_id=clients.id and ca.personnel_id=public.shadowops_personnel_id(workspace_id)
  )
);
create policy "shadowops clients write" on public.clients for all using (public.shadowops_is_exec(workspace_id)) with check (public.shadowops_is_exec(workspace_id));

-- Assignments.
drop policy if exists "workspace assignments access" on public.client_assignments;
drop policy if exists "shadowops assignments select" on public.client_assignments;
drop policy if exists "shadowops assignments write" on public.client_assignments;
create policy "shadowops assignments select" on public.client_assignments for select using (
  public.shadowops_is_exec(workspace_id) or personnel_id=public.shadowops_personnel_id(workspace_id)
);
create policy "shadowops assignments write" on public.client_assignments for all using (public.shadowops_is_exec(workspace_id)) with check (public.shadowops_is_exec(workspace_id));

-- Measurements are readable by members but editable by executives.
drop policy if exists "workspace measurements access" on public.measurements;
drop policy if exists "shadowops measurements select" on public.measurements;
drop policy if exists "shadowops measurements write" on public.measurements;
create policy "shadowops measurements select" on public.measurements for select using (public.shadowops_is_member(workspace_id));
create policy "shadowops measurements write" on public.measurements for all using (public.shadowops_is_exec(workspace_id)) with check (public.shadowops_is_exec(workspace_id));

-- Activity writes. Base-table SELECT is revoked below; read through safe view.
drop policy if exists "workspace activities v2 access" on public.activity_records_v2;
drop policy if exists "shadowops activity insert" on public.activity_records_v2;
drop policy if exists "shadowops activity update" on public.activity_records_v2;
drop policy if exists "shadowops activity delete" on public.activity_records_v2;
create policy "shadowops activity insert" on public.activity_records_v2 for insert with check (
  public.shadowops_is_exec(workspace_id) or (
    personnel_id=public.shadowops_personnel_id(workspace_id)
    and measurement_id is null and distress_level=0
    and (client_id is null or exists(select 1 from public.client_assignments ca where ca.client_id=activity_records_v2.client_id and ca.personnel_id=public.shadowops_personnel_id(workspace_id)))
  )
);
create policy "shadowops activity update" on public.activity_records_v2 for update using (
  public.shadowops_is_exec(workspace_id) or (personnel_id=public.shadowops_personnel_id(workspace_id) and created_by=auth.uid() and measurement_id is null)
) with check (
  public.shadowops_is_exec(workspace_id) or (personnel_id=public.shadowops_personnel_id(workspace_id) and created_by=auth.uid() and measurement_id is null and distress_level=0)
);
create policy "shadowops activity delete" on public.activity_records_v2 for delete using (
  public.shadowops_is_exec(workspace_id) or (personnel_id=public.shadowops_personnel_id(workspace_id) and created_by=auth.uid() and measurement_id is null)
);

-- Task policies.
drop policy if exists "shadowops tasks select" on public.tasks;
drop policy if exists "shadowops tasks write" on public.tasks;
create policy "shadowops tasks select" on public.tasks for select using (
  public.shadowops_is_exec(workspace_id) or public.shadowops_personnel_id(workspace_id) in (designer_id,manager_id,supervisor_id)
);
create policy "shadowops tasks write" on public.tasks for all using (public.shadowops_is_exec(workspace_id)) with check (public.shadowops_is_exec(workspace_id));

drop policy if exists "shadowops task events select" on public.task_events;
drop policy if exists "shadowops task events write" on public.task_events;
create policy "shadowops task events select" on public.task_events for select using (
  public.shadowops_is_exec(workspace_id) or exists(select 1 from public.tasks t where t.id=task_events.task_id and public.shadowops_personnel_id(workspace_id) in (t.designer_id,t.manager_id,t.supervisor_id))
);
create policy "shadowops task events write" on public.task_events for all using (public.shadowops_is_exec(workspace_id)) with check (public.shadowops_is_exec(workspace_id));

-- Financial tables: executives only at base table level.
drop policy if exists "shadowops revenue access" on public.client_revenue_months;
create policy "shadowops revenue access" on public.client_revenue_months for all using (public.shadowops_is_exec(workspace_id)) with check (public.shadowops_is_exec(workspace_id));
drop policy if exists "shadowops bonus write" on public.bonus_work;
create policy "shadowops bonus write" on public.bonus_work for all using (public.shadowops_is_exec(workspace_id)) with check (public.shadowops_is_exec(workspace_id));

drop policy if exists "shadowops lifecycle select" on public.client_lifecycle_events;
drop policy if exists "shadowops lifecycle write" on public.client_lifecycle_events;
create policy "shadowops lifecycle select" on public.client_lifecycle_events for select using (
  public.shadowops_is_exec(workspace_id) or exists(select 1 from public.client_assignments ca where ca.client_id=client_lifecycle_events.client_id and ca.personnel_id=public.shadowops_personnel_id(workspace_id))
);
create policy "shadowops lifecycle write" on public.client_lifecycle_events for all using (public.shadowops_is_exec(workspace_id)) with check (public.shadowops_is_exec(workspace_id));

-- Safe Activity read view: distress is physically NULL for P/A users.
drop view if exists public.activity_records_access;
create view public.activity_records_access with (security_barrier=true) as
select a.id,a.workspace_id,a.personnel_id,a.client_id,a.measurement_id,a.task_id,a.unit_type,a.record_type,a.record_date,a.severity,
  case when public.shadowops_is_exec(a.workspace_id) then a.distress_level else null end as distress_level,
  a.description,a.action_taken,a.created_by,a.created_at
from public.activity_records_v2 a
where public.shadowops_is_member(a.workspace_id)
  and (public.shadowops_is_exec(a.workspace_id) or a.personnel_id=public.shadowops_personnel_id(a.workspace_id));

-- Safe bonus-work view: P/A can see their own extra-work titles, but NEVER the price.
drop view if exists public.bonus_work_access;
create view public.bonus_work_access with (security_barrier=true) as
select b.id,b.workspace_id,b.personnel_id,b.client_id,b.title,
  case when public.shadowops_is_exec(b.workspace_id) then b.amount_mnt else null end as amount_mnt,
  b.work_date,b.notes,b.created_by,b.created_at
from public.bonus_work b
where public.shadowops_is_exec(b.workspace_id) or b.personnel_id=public.shadowops_personnel_id(b.workspace_id);

revoke select on public.activity_records_v2 from authenticated;
revoke select on public.bonus_work from authenticated;
grant select on public.activity_records_access, public.bonus_work_access to authenticated;
grant select,insert,update,delete on public.tasks,public.task_events,public.client_revenue_months,public.client_lifecycle_events to authenticated;
grant insert,update,delete on public.bonus_work,public.activity_records_v2 to authenticated;
grant select,insert,update,delete on public.personnel,public.clients,public.client_assignments,public.measurements to authenticated;



-- ShadowOPS v1.3 incremental migration
-- Run AFTER supabase_shadowops_v1_2.sql.
-- Adds self-service avatar update, Owner-to-personnel linking,
-- and lets assigned P/A personnel start, complete, cancel or reject their own tasks.

create or replace function public.shadowops_update_own_avatar(ws uuid, avatar_value text default null)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare pid uuid;
begin
  pid:=public.shadowops_personnel_id(ws);
  if pid is null then raise exception 'Your login is not linked to a personnel profile'; end if;
  if avatar_value is not null and length(avatar_value)>3000000 then raise exception 'Profile image is too large'; end if;
  update public.personnel set avatar_data=avatar_value where id=pid and workspace_id=ws;
end $$;
grant execute on function public.shadowops_update_own_avatar(uuid,text) to authenticated;

create or replace function public.shadowops_link_owner_personnel(ws uuid, linked_personnel uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.shadowops_is_owner(ws) then raise exception 'Only the Owner can link the Owner account'; end if;
  if not exists(select 1 from public.personnel p where p.id=linked_personnel and p.workspace_id=ws) then raise exception 'Personnel profile is not in this workspace'; end if;
  update public.workspace_members
  set personnel_id=linked_personnel,is_default=true
  where workspace_id=ws and user_id=auth.uid() and access_level='owner';
end $$;
grant execute on function public.shadowops_link_owner_personnel(uuid,uuid) to authenticated;

create or replace function public.shadowops_set_task_status(task_uuid uuid,new_status text,reason_text text default null)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare t public.tasks%rowtype; self_person uuid; can_manage boolean; self_assigned boolean; old_status text;
begin
  select * into t from public.tasks where id=task_uuid;
  if not found then raise exception 'Task not found'; end if;
  self_person:=public.shadowops_personnel_id(t.workspace_id);
  can_manage:=public.shadowops_is_exec(t.workspace_id);
  self_assigned:=self_person is not null and self_person in (t.designer_id,t.manager_id,t.supervisor_id);

  if new_status not in ('assigned','in_progress','completed','cancelled','rejected','delayed','postponed') then raise exception 'Invalid task state'; end if;
  if not can_manage and not (self_assigned and new_status in ('in_progress','completed','cancelled','rejected')) then raise exception 'Not authorized'; end if;
  if new_status in ('cancelled','rejected','delayed','postponed') and coalesce(trim(reason_text),'')='' then raise exception 'A reason is required for this task state'; end if;

  old_status:=t.status;
  update public.tasks
  set status=new_status,
      status_reason=case when new_status in ('cancelled','rejected','delayed','postponed') then reason_text else null end,
      completed_at=case when new_status='completed' then coalesce(completed_at,now()) else null end,
      updated_at=now()
  where id=task_uuid;

  insert into public.task_events(workspace_id,task_id,event_type,reason,created_by)
  values(t.workspace_id,t.id,new_status,reason_text,auth.uid());

  if new_status='completed' and old_status<>'completed' then
    insert into public.activity_records_v2(workspace_id,personnel_id,client_id,measurement_id,task_id,unit_type,record_type,record_date,severity,distress_level,description,action_taken,created_by)
    select t.workspace_id,pid,t.client_id,null,t.id,p.unit_type,'consistency',(now() at time zone 'Asia/Ulaanbaatar')::date,1,0,'Completed task: '||t.title,null,auth.uid()
    from (select distinct unnest(array[t.designer_id,t.manager_id,t.supervisor_id]) pid) q
    join public.personnel p on p.id=q.pid
    where q.pid is not null
    on conflict(task_id,personnel_id) where task_id is not null do nothing;
  end if;
end $$;
grant execute on function public.shadowops_set_task_status(uuid,text,text) to authenticated;



-- Complete the profile, access-approval and daily-board APIs used by this app.
alter table public.personnel add column if not exists preferred_name text;
alter table public.personnel add column if not exists phone text;
alter table public.personnel add column if not exists contact_email text;
alter table public.personnel add column if not exists contact_link text;
alter table public.personnel add column if not exists bio text;
alter table public.personnel add column if not exists terminated_at timestamptz;
alter table public.personnel add column if not exists termination_reason text;

create table public.access_requests (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 personnel_id uuid not null references public.personnel(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 requested_at timestamptz not null default now(),reviewed_at timestamptz,reviewed_by uuid references auth.users(id),
 unique(workspace_id,user_id)
);
alter table public.access_requests enable row level security;
revoke all on public.access_requests from anon,authenticated;

create policy workspace_read on public.workspaces for select to authenticated using(public.shadowops_is_member(id));
create policy memberships_read on public.workspace_members for select to authenticated using(user_id=auth.uid() or public.shadowops_is_owner(workspace_id));
grant select on public.workspaces,public.workspace_members to authenticated;

-- Membership links must stay inside a workspace, even when changed by an Owner.
create or replace function public.shadowops_validate_membership() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.personnel_id is not null and not exists(select 1 from public.personnel p where p.id=new.personnel_id and p.workspace_id=new.workspace_id and p.is_active) then raise exception 'Personnel must be active and belong to this workspace'; end if;
 if new.personnel_id is not null and exists(select 1 from public.workspace_members wm where wm.workspace_id=new.workspace_id and wm.personnel_id=new.personnel_id and wm.user_id<>new.user_id) then raise exception 'Personnel is already linked to a login'; end if;
 return new;
end $$;
create trigger shadowops_validate_membership before insert or update on public.workspace_members for each row execute function public.shadowops_validate_membership();
create unique index workspace_personnel_login_unique on public.workspace_members(workspace_id,personnel_id) where personnel_id is not null;
-- A direct Owner invitation/link also resolves an existing pending claim.
create or replace function public.shadowops_activate_membership() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 update public.access_requests set status='approved',reviewed_at=now(),reviewed_by=auth.uid()
 where workspace_id=new.workspace_id and user_id=new.user_id and status='pending';
 if new.personnel_id is not null then
  update public.personnel set clearance_level=case when new.access_level='owner' then 'e' else new.access_level end where id=new.personnel_id and workspace_id=new.workspace_id;
 end if;
 return new;
end $$;
create trigger shadowops_activate_membership after insert or update on public.workspace_members for each row execute function public.shadowops_activate_membership();


create or replace function public.shadowops_my_memberships_v14() returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('workspace_id',wm.workspace_id,'access_level',wm.access_level,'personnel_id',wm.personnel_id,'is_default',wm.is_default,'has_data',true) order by wm.is_default desc),'[]'::jsonb)
 from public.workspace_members wm where wm.user_id=auth.uid()
$$;
create or replace function public.shadowops_my_access_request() returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',r.id,'status',r.status,'personnel_id',r.personnel_id,'personnel_name',p.name,'requested_at',r.requested_at)
 from public.access_requests r join public.personnel p on p.id=r.personnel_id
 where r.user_id=auth.uid() order by r.requested_at desc limit 1
$$;
-- Limit pre-approval discovery to the profile's recorded email or an Owner invitation.
-- A signed-in stranger cannot enumerate the company's employee directory by name.
create or replace function public.shadowops_find_personnel_for_claim(search_name text) returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(q),'[]'::jsonb) from (
  select p.id as personnel_id,p.name,p.role,p.unit_type,p.avatar_data
  from public.personnel p
  where auth.uid() is not null and length(trim(search_name))>=2 and p.is_active
   and position(lower(trim(search_name)) in lower(p.name||' '||coalesce(p.preferred_name,'')))>0
   and (lower(coalesce(p.email,''))=lower(coalesce(auth.jwt()->>'email','')) or exists(select 1 from public.workspace_invites i where i.personnel_id=p.id and i.workspace_id=p.workspace_id and lower(i.email)=lower(auth.jwt()->>'email') and i.claimed_at is null))
   and not exists(select 1 from public.workspace_members wm where wm.workspace_id=p.workspace_id and wm.personnel_id=p.id)
  order by p.name limit 15
 ) q
$$;
create or replace function public.shadowops_request_access(linked_personnel uuid) returns void
language plpgsql security definer set search_path=public as $$
declare p public.personnel%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 select * into p from public.personnel where id=linked_personnel and is_active for update;
 if not found then raise exception 'Active personnel profile not found'; end if;
 if not (lower(coalesce(p.email,''))=lower(coalesce(auth.jwt()->>'email','')) or exists(select 1 from public.workspace_invites i where i.personnel_id=p.id and i.workspace_id=p.workspace_id and lower(i.email)=lower(auth.jwt()->>'email') and i.claimed_at is null)) then raise exception 'Ask the Owner to add your login email to your personnel profile or invite you'; end if;
 if exists(select 1 from public.workspace_members where workspace_id=p.workspace_id and personnel_id=p.id and user_id<>auth.uid()) then raise exception 'Personnel is already linked to another account'; end if;
 insert into public.access_requests(workspace_id,user_id,personnel_id) values(p.workspace_id,auth.uid(),p.id)
 on conflict(workspace_id,user_id) do update set personnel_id=excluded.personnel_id,status='pending',requested_at=now(),reviewed_at=null,reviewed_by=null;
end $$;
create or replace function public.shadowops_list_owned_access_requests() returns jsonb
language sql stable security definer set search_path=public,auth as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'personnel_id',p.id,'personnel_name',p.name,'role',p.role,'unit_type',p.unit_type,'email',u.email,'requested_at',r.requested_at) order by r.requested_at),'[]'::jsonb)
 from public.access_requests r join public.personnel p on p.id=r.personnel_id join auth.users u on u.id=r.user_id
 where r.status='pending' and public.shadowops_is_owner(r.workspace_id)
$$;
create or replace function public.shadowops_approve_access_request(request_uuid uuid,level text) returns void
language plpgsql security definer set search_path=public as $$
declare r public.access_requests%rowtype;
begin
 select * into r from public.access_requests where id=request_uuid for update;
 if not found or not public.shadowops_is_owner(r.workspace_id) then raise exception 'Owner access required'; end if;
 if r.status<>'pending' then raise exception 'Request has already been reviewed'; end if;
 if level is null or level not in('e','m','p','a') then raise exception 'Invalid access level'; end if;
 update public.workspace_members set is_default=false where user_id=r.user_id;
 perform public.shadowops_upsert_membership(r.workspace_id,r.user_id,level,r.personnel_id,true);
 update public.personnel set clearance_level=level where id=r.personnel_id;
 update public.access_requests set status='approved',reviewed_at=now(),reviewed_by=auth.uid() where id=r.id;
end $$;
create or replace function public.shadowops_reject_access_request(request_uuid uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r public.access_requests%rowtype;
begin
 select * into r from public.access_requests where id=request_uuid for update;
 if not found or not public.shadowops_is_owner(r.workspace_id) then raise exception 'Owner access required'; end if;
 if r.status<>'pending' then raise exception 'Request has already been reviewed'; end if;
 update public.access_requests set status='rejected',reviewed_at=now(),reviewed_by=auth.uid() where id=r.id;
end $$;

create or replace function public.shadowops_task_directory(ws uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'preferred_name',p.preferred_name,'unit_type',p.unit_type,'role',p.role,'avatar_data',p.avatar_data,'is_active',p.is_active) order by p.name),'[]'::jsonb)
 from public.personnel p where p.workspace_id=ws and public.shadowops_is_member(ws) and p.is_active
$$;
create or replace function public.shadowops_task_clients(ws uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'status',c.status) order by c.name),'[]'::jsonb)
 from public.clients c where c.workspace_id=ws and public.shadowops_is_member(ws)
$$;
create or replace function public.shadowops_task_assignments(ws uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('client_id',a.client_id,'personnel_id',a.personnel_id,'unit_type',a.unit_type)),'[]'::jsonb)
 from public.client_assignments a where a.workspace_id=ws and public.shadowops_is_member(ws)
$$;
create or replace function public.shadowops_review_task(task_uuid uuid,action_type text,note_text text) returns void
language plpgsql security definer set search_path=public as $$
declare t public.tasks%rowtype;
begin
 select * into t from public.tasks where id=task_uuid;
 if not found or not public.shadowops_is_exec(t.workspace_id) then raise exception 'Management access required'; end if;
 if action_type is null or action_type not in('questioned','reminded') or coalesce(trim(note_text),'')='' then raise exception 'Choose a review action and enter a note'; end if;
 insert into public.task_events(workspace_id,task_id,event_type,reason,created_by) values(t.workspace_id,t.id,action_type,note_text,auth.uid());
end $$;
create or replace function public.shadowops_update_own_profile(ws uuid,preferred text,phone_value text,contact_email_value text,contact_link_value text,bio_value text) returns void
language plpgsql security definer set search_path=public as $$
declare pid uuid:=public.shadowops_personnel_id(ws);
begin
 if pid is null or not public.shadowops_is_member(ws) then raise exception 'Linked login required'; end if;
 if length(coalesce(bio_value,''))>5000 or length(coalesce(preferred,''))>100 then raise exception 'Profile text too long'; end if;
 update public.personnel set preferred_name=preferred,phone=phone_value,contact_email=contact_email_value,contact_link=contact_link_value,bio=bio_value where id=pid and workspace_id=ws;
end $$;
create or replace function public.shadowops_fire_personnel(ws uuid,target_personnel uuid,reason_text text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not public.shadowops_is_owner(ws) then raise exception 'Owner access required'; end if;
 if coalesce(trim(reason_text),'')='' then raise exception 'A reason is required'; end if;
 if exists(select 1 from public.workspace_members where workspace_id=ws and personnel_id=target_personnel and access_level='owner') then raise exception 'Cannot remove the workspace Owner'; end if;
 update public.personnel set is_active=false,terminated_at=now(),termination_reason=reason_text where id=target_personnel and workspace_id=ws;
 if not found then raise exception 'Personnel not found'; end if;
 delete from public.client_assignments where workspace_id=ws and personnel_id=target_personnel;
 delete from public.workspace_members where workspace_id=ws and personnel_id=target_personnel;
 delete from public.workspace_invites where workspace_id=ws and personnel_id=target_personnel;
 update public.access_requests set status='rejected',reviewed_at=now(),reviewed_by=auth.uid() where workspace_id=ws and personnel_id=target_personnel and status='pending';
end $$;
create or replace function public.shadowops_restore_personnel(ws uuid,target_personnel uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not public.shadowops_is_owner(ws) then raise exception 'Owner access required'; end if;
 update public.personnel set is_active=true,terminated_at=null,termination_reason=null where workspace_id=ws and id=target_personnel;
 if not found then raise exception 'Personnel not found'; end if;
end $$;

-- Create the initial Owner link from a real, pre-created Supabase Auth user.
do $$
declare pid uuid; ws uuid:=current_setting('shadowops.workspace_id')::uuid; uid uuid:=current_setting('shadowops.owner_id')::uuid;
begin
 insert into public.personnel(workspace_id,unit_type,name,role,email,clearance_level,created_by)
 values(ws,'manager','Workspace Owner','Owner',trim(current_setting('shadowops.owner_email')),'e',uid) returning id into pid;
 insert into public.workspace_members(workspace_id,user_id,access_level,personnel_id,is_default) values(ws,uid,'owner',pid,true);
end $$;

-- Validate other linked rows in addition to task links validated by v1.7.
create or replace function public.shadowops_validate_links() returns trigger
language plpgsql security definer set search_path=public as $$
declare row_data jsonb:=to_jsonb(new); pid uuid; cid uuid; mid uuid; tid uuid;
begin
 pid:=nullif(row_data->>'personnel_id','')::uuid;cid:=nullif(row_data->>'client_id','')::uuid;
 mid:=nullif(row_data->>'measurement_id','')::uuid;tid:=nullif(row_data->>'task_id','')::uuid;
 if pid is not null and not exists(select 1 from public.personnel p where p.id=pid and p.workspace_id=new.workspace_id) then raise exception 'Personnel outside workspace'; end if;
 if cid is not null and not exists(select 1 from public.clients c where c.id=cid and c.workspace_id=new.workspace_id) then raise exception 'Client outside workspace'; end if;
 if mid is not null and not exists(select 1 from public.measurements m where m.id=mid and m.workspace_id=new.workspace_id) then raise exception 'Measurement outside workspace'; end if;
 if tid is not null and not exists(select 1 from public.tasks t where t.id=tid and t.workspace_id=new.workspace_id) then raise exception 'Task outside workspace'; end if;
 return new;
end $$;
do $$
declare tn text;
begin
 foreach tn in array array['client_assignments','activity_records_v2','bonus_work','client_revenue_months','workspace_invites'] loop
  execute format('create trigger shadowops_validate_links before insert or update on public.%I for each row execute function public.shadowops_validate_links()',tn);
 end loop;
end $$;
-- No public caller can create a workspace/Owner. Setup is controlled by SQL Editor.
create or replace function public.create_shadowops_workspace(workspace_name text) returns uuid
language plpgsql as $$ begin raise exception 'Workspace creation is managed by the database administrator'; end $$;


-- ShadowOPS v1.7 incremental update for the supplied existing ShadowOPS install.
-- Run on the current database after v1.2 / v1.3 (and any installed v1.4-v1.6 migrations).
-- Transactional, rerunnable; preserves existing records and legacy task status values.

alter table public.tasks add column if not exists work_type text;
alter table public.tasks add column if not exists load_points numeric not null default 1;
alter table public.tasks add column if not exists priority integer not null default 2;
alter table public.tasks add column if not exists task_date date;
alter table public.tasks add column if not exists workflow_stage text;
alter table public.tasks add column if not exists measurement_due_at timestamptz;
update public.tasks set workflow_stage=case status when 'completed' then 'approved' when 'in_progress' then 'in_design' else 'todo' end where workflow_stage is null;
update public.tasks set measurement_due_at=due_at where measurement_due_at is null and due_at is not null;
update public.tasks set task_date=(assigned_at at time zone 'Asia/Ulaanbaatar')::date where task_date is null;
alter table public.tasks alter column workflow_stage set default 'todo';
alter table public.tasks alter column workflow_stage set not null;
alter table public.tasks drop constraint if exists tasks_workflow_stage_v17_check;
alter table public.tasks add constraint tasks_workflow_stage_v17_check check(workflow_stage in ('todo','in_design','design_done','in_review','changes','approved','scheduled'));

create table if not exists public.playtime_projects (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 client_id uuid references public.clients(id) on delete set null,
 owner_id uuid references public.personnel(id) on delete set null,
 title text not null check(length(trim(title))>0), brief text,
 start_date date, due_date date,
 status text not null default 'planning' check(status in ('planning','in_progress','on_hold','completed')),
 created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(start_date is null or due_date is null or due_date>=start_date)
);
alter table public.tasks add column if not exists project_id uuid references public.playtime_projects(id) on delete set null;
create index if not exists tasks_project_v17_idx on public.tasks(project_id);
create index if not exists projects_workspace_v17_idx on public.playtime_projects(workspace_id);
create table if not exists public.attendance_records (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 personnel_id uuid not null references public.personnel(id) on delete cascade,
 work_date date not null, check_in timestamptz not null, check_out timestamptz,
 break_minutes integer not null default 0 check(break_minutes>=0), notes text,
 created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,personnel_id,work_date),
 check(check_out is null or check_out>check_in),
 check(check_out is null or extract(epoch from(check_out-check_in))/60>=break_minutes),
 check(work_date=(check_in at time zone 'Asia/Ulaanbaatar')::date)
);
create index if not exists attendance_workspace_date_v17_idx on public.attendance_records(workspace_id,work_date);
alter table public.playtime_projects enable row level security;
alter table public.attendance_records enable row level security;
-- New-table writes only through the validated RPCs below.
revoke all on public.playtime_projects,public.attendance_records from anon,authenticated;
grant select on public.playtime_projects,public.attendance_records to authenticated;
drop policy if exists playtime_read_v17 on public.playtime_projects;
create policy playtime_read_v17 on public.playtime_projects for select to authenticated using (
 public.shadowops_is_exec(workspace_id) or (public.shadowops_is_member(workspace_id) and exists(
  select 1 from public.tasks t where t.project_id=playtime_projects.id and t.workspace_id=playtime_projects.workspace_id
  and public.shadowops_personnel_id(t.workspace_id) in(t.designer_id,t.manager_id,t.supervisor_id)
 ))
);
drop policy if exists attendance_read_v17 on public.attendance_records;
create policy attendance_read_v17 on public.attendance_records for select to authenticated using(public.shadowops_is_exec(workspace_id));

-- Keep old views/status counters compatible, enforce tenant-safe links, protect timestamps.
create or replace function public.shadowops_task_sync_v17() returns trigger
language plpgsql security definer set search_path=public as $$
declare old_stage text; old_done boolean:=false; new_done boolean;
begin
 if tg_op='UPDATE' then
  if new.workspace_id<>old.workspace_id then raise exception 'Cannot move tasks between workspaces'; end if;
  old_stage:=old.workflow_stage; old_done:=old.status='completed';
  -- Older clients using the legacy status RPC stay compatible with the process.
  if new.status is distinct from old.status and new.workflow_stage is not distinct from old.workflow_stage then
   new.workflow_stage:=case new.status when 'completed' then 'approved' when 'assigned' then 'todo' when 'in_progress' then 'in_design' else new.workflow_stage end;
  end if;
  new.measurement_due_at:=coalesce(old.measurement_due_at,old.due_at,new.due_at);
 else new.measurement_due_at:=new.due_at;
 end if;
 if new.client_id is not null and not exists(select 1 from public.clients where id=new.client_id and workspace_id=new.workspace_id) then raise exception 'Client outside workspace'; end if;
 if exists(select 1 from unnest(array[new.designer_id,new.manager_id,new.supervisor_id]) pid where pid is not null and not exists(select 1 from public.personnel p where p.id=pid and p.workspace_id=new.workspace_id)) then raise exception 'Personnel outside workspace'; end if;
 if new.project_id is not null and not exists(select 1 from public.playtime_projects where id=new.project_id and workspace_id=new.workspace_id) then raise exception 'Project outside workspace'; end if;
 if new.priority not between 1 and 3 or new.load_points<0 then raise exception 'Invalid urgency or workload'; end if;
 if new.status not in ('cancelled','rejected','delayed','postponed') or new.workflow_stage is distinct from old_stage then
  new.status:=case when new.workflow_stage in ('approved','scheduled') then 'completed' when new.workflow_stage='todo' then 'assigned' else 'in_progress' end;
 end if;
 new_done:=new.status='completed';
 if new_done then
  if old_done then new.completed_at:=old.completed_at;
  else new.completed_at:=now(); end if;
 else new.completed_at:=null;
 end if;
 new.updated_at:=now();
 return new;
end $$;
drop trigger if exists shadowops_task_sync_v17 on public.tasks;
create trigger shadowops_task_sync_v17 before insert or update on public.tasks for each row execute function public.shadowops_task_sync_v17();

create or replace function public.shadowops_task_audit_v17() returns trigger
language plpgsql security definer set search_path=public as $$
declare changed boolean; note text;
begin
 changed:=tg_op='INSERT';
 if tg_op='UPDATE' then changed:=new.workflow_stage is distinct from old.workflow_stage or new.status is distinct from old.status; end if;
 if changed then
  note:='Process: '||case when tg_op='UPDATE' then old.workflow_stage||' → ' else '' end||new.workflow_stage;
  if new.status_reason is not null then note:=note||' · '||new.status_reason; end if;
  insert into public.task_events(workspace_id,task_id,event_type,reason,created_by) values(new.workspace_id,new.id,new.status,note,auth.uid());
 end if;
 if tg_op='UPDATE' and new.due_at is distinct from old.due_at then
  insert into public.task_events(workspace_id,task_id,event_type,reason,created_by) values(new.workspace_id,new.id,new.status,'Deadline changed: '||coalesce(old.due_at::text,'none')||' → '||coalesce(new.due_at::text,'none')||'. Efficiency retains first deadline.',auth.uid());
 end if;
 if new.status='completed' and changed then
  insert into public.activity_records_v2(workspace_id,personnel_id,client_id,measurement_id,task_id,unit_type,record_type,record_date,severity,distress_level,description,created_by)
  select new.workspace_id,p.id,new.client_id,null,new.id,p.unit_type,'consistency',(now() at time zone 'Asia/Ulaanbaatar')::date,1,0,'Approved/Ready task: '||new.title,auth.uid()
  from public.personnel p where p.id in(new.designer_id,new.manager_id,new.supervisor_id) and p.workspace_id=new.workspace_id
  on conflict(task_id,personnel_id) where task_id is not null do nothing;
 end if;
 return new;
end $$;
drop trigger if exists shadowops_task_audit_v17 on public.tasks;
create trigger shadowops_task_audit_v17 after insert or update on public.tasks for each row execute function public.shadowops_task_audit_v17();

create or replace function public.shadowops_set_process_v17(task_uuid uuid,stage_value text,reason_text text default null) returns void
language plpgsql security definer set search_path=public as $$
declare t public.tasks%rowtype; pid uuid;
begin
 select * into t from public.tasks where id=task_uuid for update;
 if not found then raise exception 'Task not found'; end if;
 pid:=public.shadowops_personnel_id(t.workspace_id);
 if auth.uid() is null or not public.shadowops_is_member(t.workspace_id) then raise exception 'Not authorized'; end if;
 if not public.shadowops_is_exec(t.workspace_id) and not (coalesce(t.created_by=auth.uid(),false) or coalesce(pid in(t.designer_id,t.manager_id,t.supervisor_id),false)) then raise exception 'Not authorized'; end if;
 if stage_value is null or stage_value not in ('todo','in_design','design_done','in_review','changes','approved','scheduled','cancelled','rejected','delayed','postponed') then raise exception 'Invalid process'; end if;
 if stage_value in ('changes','cancelled','rejected','delayed','postponed') and coalesce(trim(reason_text),'')='' then raise exception 'A reason is required'; end if;
 if stage_value in ('cancelled','rejected','delayed','postponed') then
  update public.tasks set status=stage_value,status_reason=reason_text where id=t.id;
 else
  update public.tasks set workflow_stage=stage_value,status=case when stage_value in('approved','scheduled') then 'completed' when stage_value='todo' then 'assigned' else 'in_progress' end,status_reason=reason_text where id=t.id;
 end if;
end $$;

create or replace function public.shadowops_save_task_v17(task_uuid uuid,ws uuid,task_data jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare t public.tasks%rowtype; task_id uuid; pid uuid; d uuid; m uuid; s uuid; stage text; project uuid; can_manage boolean;
begin
 if auth.uid() is null or not public.shadowops_is_member(ws) then raise exception 'Not authorized'; end if;
 can_manage:=public.shadowops_is_exec(ws); pid:=public.shadowops_personnel_id(ws);
 d:=nullif(task_data->>'designer_id','')::uuid; m:=nullif(task_data->>'manager_id','')::uuid; s:=nullif(task_data->>'supervisor_id','')::uuid;
 project:=nullif(task_data->>'project_id','')::uuid; stage:=coalesce(task_data->>'workflow_stage','todo');
 if task_uuid is not null then
  select * into t from public.tasks where id=task_uuid and workspace_id=ws for update;
  if not found then raise exception 'Task not found'; end if;
  if not can_manage and not (coalesce(t.created_by=auth.uid(),false) or coalesce(pid in(t.designer_id,t.manager_id,t.supervisor_id),false)) then raise exception 'Not authorized'; end if;
  -- Staff may correct their work; only management can reassign staff/project/deadline.
  if not can_manage and (d is distinct from t.designer_id or m is distinct from t.manager_id or s is distinct from t.supervisor_id or project is distinct from t.project_id or nullif(task_data->>'due_at','')::timestamptz is distinct from t.due_at) then raise exception 'Ask management to change assignees, project or deadline'; end if;
 else
  if not can_manage and not coalesce(pid in(d,m,s),false) then raise exception 'A new personal task must include you as an assignee'; end if;
  if not can_manage and project is not null and not exists(select 1 from public.tasks x where x.project_id=project and x.workspace_id=ws and pid in(x.designer_id,x.manager_id,x.supervisor_id)) then raise exception 'Project not assigned to you'; end if;
 end if;
 if coalesce(trim(task_data->>'title'),'')='' then raise exception 'Task title is required'; end if;
 if stage not in ('todo','in_design','design_done','in_review','changes','approved','scheduled') then raise exception 'Invalid process'; end if;
 if stage='changes' and (task_uuid is null or t.workflow_stage<>'changes') and coalesce(trim(task_data->>'details'),'')='' then raise exception 'Describe the requested changes in Notes'; end if;
 if task_uuid is null then
  insert into public.tasks(workspace_id,client_id,title,details,work_type,load_points,priority,task_date,due_at,designer_id,manager_id,supervisor_id,project_id,workflow_stage,created_by)
  values(ws,nullif(task_data->>'client_id','')::uuid,trim(task_data->>'title'),task_data->>'details',task_data->>'work_type',coalesce((task_data->>'load_points')::numeric,1),coalesce((task_data->>'priority')::integer,2),coalesce(nullif(task_data->>'task_date','')::date,(now() at time zone 'Asia/Ulaanbaatar')::date),nullif(task_data->>'due_at','')::timestamptz,d,m,s,project,stage,auth.uid()) returning id into task_id;
 else
  update public.tasks set client_id=nullif(task_data->>'client_id','')::uuid,title=trim(task_data->>'title'),details=task_data->>'details',work_type=task_data->>'work_type',load_points=coalesce((task_data->>'load_points')::numeric,1),priority=coalesce((task_data->>'priority')::integer,2),task_date=coalesce(nullif(task_data->>'task_date','')::date,t.task_date),due_at=nullif(task_data->>'due_at','')::timestamptz,designer_id=d,manager_id=m,supervisor_id=s,project_id=project,workflow_stage=stage,
  status=case when stage is distinct from t.workflow_stage then case when stage in('approved','scheduled') then 'completed' when stage='todo' then 'assigned' else 'in_progress' end else t.status end,
  status_reason=case when stage='changes' then task_data->>'details' when stage is distinct from t.workflow_stage then null else t.status_reason end
  where id=t.id returning id into task_id;
 end if;
 return task_id;
end $$;

create or replace function public.shadowops_save_project_v17(project_uuid uuid,ws uuid,project_data jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare result_id uuid; cid uuid; owner_pid uuid;
begin
 if auth.uid() is null or not public.shadowops_is_exec(ws) then raise exception 'Management access required'; end if;
 cid:=nullif(project_data->>'client_id','')::uuid; owner_pid:=nullif(project_data->>'owner_id','')::uuid;
 if cid is not null and not exists(select 1 from public.clients where id=cid and workspace_id=ws) then raise exception 'Client outside workspace'; end if;
 if owner_pid is not null and not exists(select 1 from public.personnel where id=owner_pid and workspace_id=ws) then raise exception 'Lead outside workspace'; end if;
 if project_uuid is null then
  insert into public.playtime_projects(workspace_id,title,brief,client_id,owner_id,start_date,due_date,status,created_by)
  values(ws,trim(project_data->>'title'),project_data->>'brief',cid,owner_pid,nullif(project_data->>'start_date','')::date,nullif(project_data->>'due_date','')::date,coalesce(project_data->>'status','planning'),auth.uid()) returning id into result_id;
 else
  update public.playtime_projects set title=trim(project_data->>'title'),brief=project_data->>'brief',client_id=cid,owner_id=owner_pid,start_date=nullif(project_data->>'start_date','')::date,due_date=nullif(project_data->>'due_date','')::date,status=project_data->>'status',updated_at=now() where id=project_uuid and workspace_id=ws returning id into result_id;
  if not found then raise exception 'Project not found'; end if;
 end if;
 return result_id;
end $$;

create or replace function public.shadowops_save_attendance_v17(entry_uuid uuid,ws uuid,entry_data jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare pid uuid; result_id uuid;
begin
 if auth.uid() is null or not public.shadowops_is_exec(ws) then raise exception 'Management access required'; end if;
 pid:=nullif(entry_data->>'personnel_id','')::uuid;
 if pid is null or not exists(select 1 from public.personnel where id=pid and workspace_id=ws) then raise exception 'Employee outside workspace'; end if;
 if entry_uuid is null then
  insert into public.attendance_records(workspace_id,personnel_id,work_date,check_in,check_out,break_minutes,notes,created_by)
  values(ws,pid,(entry_data->>'work_date')::date,(entry_data->>'check_in')::timestamptz,nullif(entry_data->>'check_out','')::timestamptz,coalesce((entry_data->>'break_minutes')::integer,0),entry_data->>'notes',auth.uid()) returning id into result_id;
 else
  update public.attendance_records set personnel_id=pid,work_date=(entry_data->>'work_date')::date,check_in=(entry_data->>'check_in')::timestamptz,check_out=nullif(entry_data->>'check_out','')::timestamptz,break_minutes=coalesce((entry_data->>'break_minutes')::integer,0),notes=entry_data->>'notes',updated_at=now() where id=entry_uuid and workspace_id=ws returning id into result_id;
  if not found then raise exception 'Attendance record not found'; end if;
 end if;
 return result_id;
exception when unique_violation then raise exception 'Attendance already exists for this employee and date. Edit the existing entry.';
end $$;
revoke all on function public.shadowops_task_sync_v17(),public.shadowops_task_audit_v17() from public,anon,authenticated;
revoke all on function public.shadowops_set_process_v17(uuid,text,text),public.shadowops_save_task_v17(uuid,uuid,jsonb),public.shadowops_save_project_v17(uuid,uuid,jsonb),public.shadowops_save_attendance_v17(uuid,uuid,jsonb) from public,anon;
grant execute on function public.shadowops_set_process_v17(uuid,text,text),public.shadowops_save_task_v17(uuid,uuid,jsonb),public.shadowops_save_project_v17(uuid,uuid,jsonb),public.shadowops_save_attendance_v17(uuid,uuid,jsonb) to authenticated;



-- Legacy task APIs delegate to the current validated APIs, without duplicate logs.
create or replace function public.shadowops_set_task_status(task_uuid uuid,new_status text,reason_text text default null) returns void
language plpgsql security definer set search_path=public as $$
begin
 perform public.shadowops_set_process_v17(task_uuid,case new_status when 'assigned' then 'todo' when 'in_progress' then 'in_design' when 'completed' then 'approved' else new_status end,reason_text);
end $$;
create or replace function public.shadowops_set_task_status_v15(task_uuid uuid,new_status text,reason_text text default null) returns void
language sql security definer set search_path=public as $$select public.shadowops_set_task_status(task_uuid,new_status,reason_text)$$;
create or replace function public.shadowops_save_task_v16(task_uuid uuid,ws uuid,client_uuid uuid,task_title text,task_details text,work_type_value text,load_value numeric,priority_value integer,task_date_value date,due_value timestamptz,designer_uuid uuid,manager_uuid uuid,supervisor_uuid uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare t public.tasks%rowtype;
begin
 if task_uuid is not null then select * into t from public.tasks where id=task_uuid and workspace_id=ws; end if;
 return public.shadowops_save_task_v17(task_uuid,ws,jsonb_build_object('client_id',client_uuid,'title',task_title,'details',task_details,'work_type',work_type_value,'load_points',load_value,'priority',priority_value,'task_date',task_date_value,'due_at',due_value,'designer_id',designer_uuid,'manager_id',manager_uuid,'supervisor_id',supervisor_uuid,'project_id',t.project_id,'workflow_stage',coalesce(t.workflow_stage,'todo')));
end $$;
create or replace function public.shadowops_save_task_v15(task_uuid uuid,ws uuid,client_uuid uuid,task_title text,task_details text,work_type_value text,priority_value integer,due_value timestamptz,designer_uuid uuid,manager_uuid uuid,supervisor_uuid uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare t public.tasks%rowtype;
begin
 if task_uuid is not null then select * into t from public.tasks where id=task_uuid and workspace_id=ws; end if;
 return public.shadowops_save_task_v16(task_uuid,ws,client_uuid,task_title,task_details,work_type_value,coalesce(t.load_points,1),priority_value,coalesce(t.task_date,(now() at time zone 'Asia/Ulaanbaatar')::date),due_value,designer_uuid,manager_uuid,supervisor_uuid);
end $$;
-- Default Supabase grants are broad. Explicitly restrict this application's objects.
do $$
declare obj record;
begin
 for obj in select c.oid::regclass as ident from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','v') loop
  execute format('revoke all on %s from anon',obj.ident);
 end loop;
 for obj in select p.oid::regprocedure as ident,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'shadowops_%' or p.proname='create_shadowops_workspace') loop
  execute format('revoke all on function %s from public, anon, authenticated',obj.ident);
  if obj.proname not in ('create_shadowops_workspace','shadowops_upsert_membership','shadowops_client_lifecycle_trigger','shadowops_task_sync_v17','shadowops_task_audit_v17','shadowops_validate_membership','shadowops_activate_membership','shadowops_validate_links') then
   execute format('grant execute on function %s to authenticated',obj.ident);
  end if;
 end loop;
end $$;
notify pgrst, 'reload schema';
commit;
select 'ShadowOPS fresh installation complete. Sign in with your Owner email.' as result;
