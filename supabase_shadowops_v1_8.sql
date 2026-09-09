-- ShadowOPS v1.8 UPDATE: run after the successful fresh/v1.7 installation.
-- Existing company data is preserved. Do not run the fresh installer again.
begin;
do $$ begin
 if to_regclass('public.tasks') is null or to_regclass('public.playtime_projects') is null then
  raise exception 'Install ShadowOPS v1.7 first. This file updates an existing installation.';
 end if;
end $$;
alter table public.tasks add column if not exists step_order integer;
with ordered as (
 select id,row_number() over(partition by project_id order by assigned_at,id)::integer as n
 from public.tasks where project_id is not null
) update public.tasks t set step_order=o.n from ordered o where t.id=o.id and t.step_order is null;
create index if not exists tasks_project_step_idx on public.tasks(project_id,step_order,id);
create or replace function public.shadowops_assign_step_v18() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.project_id is null then new.step_order:=null;
 elsif tg_op='INSERT' then
  select coalesce(max(step_order),0)+1 into new.step_order from public.tasks where project_id=new.project_id;
 elsif new.project_id is distinct from old.project_id or new.step_order is null then
  select coalesce(max(step_order),0)+1 into new.step_order from public.tasks where project_id=new.project_id and id<>new.id;
 end if;
 return new;
end $$;
drop trigger if exists shadowops_assign_step_v18 on public.tasks;
create trigger shadowops_assign_step_v18 before insert or update on public.tasks for each row execute function public.shadowops_assign_step_v18();
create or replace function public.shadowops_move_step_v18(task_uuid uuid,direction_value integer) returns void
language plpgsql security definer set search_path=public as $$
declare t public.tasks%rowtype; ids uuid[]; pos integer; tmp uuid; ws uuid; project uuid;
begin
 select workspace_id,project_id into ws,project from public.tasks where id=task_uuid;
 if not found or not public.shadowops_is_exec(ws) then raise exception 'Management access required'; end if;
 if project is null or direction_value is null or direction_value not in(-1,1) then raise exception 'Choose a project task and move up or down'; end if;
 perform 1 from public.playtime_projects where id=project for update;
 perform 1 from public.tasks where project_id=project order by id for update;
 select array_agg(id order by step_order nulls last,assigned_at,id) into ids from public.tasks where project_id=project;
 pos:=array_position(ids,task_uuid);
 if pos is null then raise exception 'Task moved to another project. Refresh and retry.'; end if;
 if pos+direction_value<1 or pos+direction_value>array_length(ids,1) then return; end if;
 tmp:=ids[pos+direction_value];ids[pos+direction_value]:=ids[pos];ids[pos]:=tmp;
 update public.tasks x set step_order=a.n from unnest(ids) with ordinality a(id,n) where x.id=a.id;
end $$;
create or replace function public.shadowops_set_urgency_v18(task_uuid uuid,priority_value integer) returns void
language plpgsql security definer set search_path=public as $$
declare t public.tasks%rowtype; pid uuid;
begin
 select * into t from public.tasks where id=task_uuid for update;
 if not found then raise exception 'Task not found'; end if;
 pid:=public.shadowops_personnel_id(t.workspace_id);
 if auth.uid() is null or not public.shadowops_is_member(t.workspace_id) or
 not(public.shadowops_is_exec(t.workspace_id) or coalesce(t.created_by=auth.uid(),false) or coalesce(pid in(t.designer_id,t.manager_id,t.supervisor_id),false)) then raise exception 'Not authorized'; end if;
 if priority_value is null or priority_value not between 1 and 3 then raise exception 'Choose Low, Normal or Urgent'; end if;
 if priority_value=t.priority then return; end if;
 update public.tasks set priority=priority_value where id=t.id;
 insert into public.task_events(workspace_id,task_id,event_type,reason,created_by)
 values(t.workspace_id,t.id,t.status,'Urgency: '||coalesce(t.priority,2)||' → '||priority_value,auth.uid());
end $$;
revoke all on function public.shadowops_assign_step_v18() from public,anon,authenticated;
revoke all on function public.shadowops_move_step_v18(uuid,integer),public.shadowops_set_urgency_v18(uuid,integer) from public,anon;
grant execute on function public.shadowops_move_step_v18(uuid,integer),public.shadowops_set_urgency_v18(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
select 'ShadowOPS v1.8 project steps and urgency installed.' as result;
