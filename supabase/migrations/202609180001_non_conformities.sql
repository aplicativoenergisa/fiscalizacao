begin;
create table public.non_conformities (
 id uuid primary key,
 team_id integer not null references public.teams(id),
 inspection_id bigint not null references public.inspection_events(id),
 description text not null check (length(btrim(description)) between 1 and 2000),
 status text not null default 'open' check (status in ('open','resolved')),
 opened_at timestamptz not null default now(),
 resolved_at timestamptz,
 check ((status='open' and resolved_at is null) or (status='resolved' and resolved_at>=opened_at))
);
create index non_conformities_team_status on public.non_conformities(team_id,status);
alter table public.non_conformities enable row level security;
revoke all on public.non_conformities from anon,authenticated;
grant select on public.non_conformities to anon,authenticated;
create policy public_read on public.non_conformities for select to anon,authenticated using(true);

-- Immutable opening record, single terminal transition, idempotent retries.
create function public.open_non_conformity(p_id uuid,p_team_id integer,p_description text)
returns public.non_conformities language plpgsql security definer set search_path='' as $$
declare item public.non_conformities; event_id bigint;
begin
 if p_id is null or p_description is null or length(btrim(p_description)) not between 1 and 2000 then raise exception 'INVALID_DESCRIPTION'; end if;
 perform 1 from public.teams where id=p_team_id for update;
 if not found then raise exception 'TEAM_NOT_FOUND'; end if;
 select * into item from public.non_conformities where id=p_id;
 if found then
  if item.team_id<>p_team_id or item.description<>btrim(p_description) then raise exception 'INVALID_REQUEST_ID'; end if;
  return item;
 end if;
 select e.id into event_id from public.inspection_events e
 join public.inspections i on i.team_id=e.team_id and i.cycle_id=e.cycle_id and i.version=e.version
 where e.team_id=p_team_id and e.action='inspect' and i.inspected_at is not null
 and i.cycle_id=public.current_inspection_cycle() order by e.id desc limit 1;
 if event_id is null then raise exception 'INSPECTION_REQUIRED'; end if;
 if (select count(*) from public.non_conformities where team_id=p_team_id and opened_at>now()-interval '1 minute')>=20 then raise exception 'RATE_LIMIT'; end if;
 insert into public.non_conformities(id,team_id,inspection_id,description) values(p_id,p_team_id,event_id,btrim(p_description)) returning * into item;
 return item;
end;
$$;
create function public.resolve_non_conformity(p_id uuid)
returns public.non_conformities language plpgsql security definer set search_path='' as $$
declare item public.non_conformities;
begin
 select * into item from public.non_conformities where id=p_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if item.status='open' then
  update public.non_conformities set status='resolved',resolved_at=clock_timestamp() where id=p_id returning * into item;
 end if;
 return item;
end;
$$;
revoke all on function public.open_non_conformity(uuid,integer,text),public.resolve_non_conformity(uuid) from public,anon,authenticated;
grant execute on function public.open_non_conformity(uuid,integer,text),public.resolve_non_conformity(uuid) to anon,authenticated;
alter publication supabase_realtime add table public.non_conformities;
commit;
