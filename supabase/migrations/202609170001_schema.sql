begin;
create table public.companies(id text primary key, name text not null);
create table public.teams(id integer primary key, company_id text not null references public.companies(id), name text not null unique, kind text not null);
create table public.inspections(
 team_id integer not null references public.teams(id),
 cycle_id text not null check(cycle_id ~ '^\d{4}-(0[1-9]|1[0-2])-C[12]$'),
 inspected_at timestamptz,
 version integer not null default 0 check(version>=0),
 primary key(team_id,cycle_id)
);
create table public.inspection_events(
 id bigint generated always as identity primary key,
 request_id uuid not null unique,
 team_id integer not null references public.teams(id),
 cycle_id text not null,
 action text not null check(action in ('inspect','undo')),
 occurred_at timestamptz not null default now(),
 version integer not null,
 unique(team_id,cycle_id,version),
 foreign key(team_id,cycle_id) references public.inspections(team_id,cycle_id)
);
create index inspection_events_cycle_date on public.inspection_events(cycle_id,occurred_at desc);
alter table public.companies enable row level security;
alter table public.teams enable row level security;
alter table public.inspections enable row level security;
alter table public.inspection_events enable row level security;
revoke all on public.companies,public.teams,public.inspections,public.inspection_events from anon,authenticated;
grant select on public.companies,public.teams,public.inspections,public.inspection_events to anon,authenticated;
create policy public_read on public.companies for select to anon,authenticated using(true);
create policy public_read on public.teams for select to anon,authenticated using(true);
create policy public_read on public.inspections for select to anon,authenticated using(true);
create policy public_read on public.inspection_events for select to anon,authenticated using(true);

create function public.current_inspection_cycle() returns text language sql stable set search_path='' as $$
 select to_char(now() at time zone 'America/Campo_Grande','YYYY-MM')||'-C'||case when extract(day from now() at time zone 'America/Campo_Grande')<=15 then '1' else '2' end;
$$;
revoke all on function public.current_inspection_cycle() from public,anon,authenticated;
grant execute on function public.current_inspection_cycle() to anon,authenticated;

-- The only public mutation surface. No administrative key is used by the app.
create function public.set_inspection(p_team_id integer,p_cycle_id text,p_action text,p_expected_version integer,p_request_id uuid)
returns public.inspections language plpgsql security definer set search_path='' as $$
declare current_row public.inspections; old_event public.inspection_events;
begin
 if p_action is null or p_action not in ('inspect','undo') or p_expected_version is null or p_expected_version<0 or p_request_id is null then
  raise exception 'INVALID_OPERATION';
 end if;
 if p_cycle_id is null or p_cycle_id<>public.current_inspection_cycle() then raise exception 'CYCLE_CHANGED'; end if;
 -- Serialize writes to the same team, including initial creation.
 perform 1 from public.teams where id=p_team_id for update;
 if not found then raise exception 'TEAM_NOT_FOUND'; end if;
 select * into old_event from public.inspection_events where request_id=p_request_id;
 if found then
  if old_event.team_id<>p_team_id or old_event.cycle_id<>p_cycle_id or old_event.action<>p_action then raise exception 'INVALID_REQUEST_ID'; end if;
  select * into current_row from public.inspections where team_id=p_team_id and cycle_id=p_cycle_id;
  return current_row;
 end if;
 insert into public.inspections(team_id,cycle_id) values(p_team_id,p_cycle_id) on conflict do nothing;
 select * into current_row from public.inspections where team_id=p_team_id and cycle_id=p_cycle_id for update;
 if current_row.version<>p_expected_version then raise exception 'STALE_STATE'; end if;
 if (p_action='inspect' and current_row.inspected_at is not null) or (p_action='undo' and current_row.inspected_at is null) then raise exception 'STALE_STATE'; end if;
 -- Bound repeated toggles in the database, even if a caller bypasses the UI.
 if (select count(*) from public.inspection_events where team_id=p_team_id and occurred_at>now()-interval '1 minute')>=12 then raise exception 'RATE_LIMIT'; end if;
 update public.inspections set inspected_at=case when p_action='inspect' then now() else null end,version=version+1
 where team_id=p_team_id and cycle_id=p_cycle_id returning * into current_row;
 insert into public.inspection_events(request_id,team_id,cycle_id,action,version) values(p_request_id,p_team_id,p_cycle_id,p_action,current_row.version);
 return current_row;
end;
$$;
revoke all on function public.set_inspection(integer,text,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.set_inspection(integer,text,text,integer,uuid) to anon,authenticated;
-- Postgres Changes uses the same SELECT policies above.
alter publication supabase_realtime add table public.inspections,public.inspection_events;
commit;
