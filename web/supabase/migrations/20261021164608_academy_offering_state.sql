-- EDRA-129. Additive state and private command infrastructure. No offering is stopped or
-- retired by this migration. Historical rows remain readable through their existing policies.
begin;

alter table public.academy_levels
  add column stopped_at timestamptz,
  add column stopped_by uuid references public.profiles(id),
  add column resumed_at timestamptz,
  add column resumed_by uuid references public.profiles(id),
  add column version integer not null default 1 check (version > 0),
  add column learning_epoch integer not null default 1 check (learning_epoch > 0),
  add constraint academy_levels_stop_actor check ((stopped_at is null) = (stopped_by is null)),
  add constraint academy_levels_resume_actor check ((resumed_at is null) = (resumed_by is null));

alter table public.academy_tracks
  add column retired_at timestamptz,
  add column retired_by uuid references public.profiles(id),
  add column version integer not null default 1 check (version > 0),
  add constraint academy_tracks_retire_actor check ((retired_at is null) = (retired_by is null));

-- A retired identity keeps its original name; a new active track may reuse that name.
drop index public.academy_tracks_name_per_level_idx;
create unique index academy_tracks_name_per_level_idx
  on public.academy_tracks(academy_id,level_id,lower(btrim(name))) where retired_at is null;

create table edra_private.offering_revisions (
  academy_id uuid primary key references public.academies(id),
  revision bigint not null default 1 check (revision > 0)
);
create table edra_private.offering_requests (
  academy_id uuid not null references public.academies(id),
  actor_id uuid not null references public.profiles(id),
  request_key uuid not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(academy_id,actor_id,request_key)
);
-- Only the trusted command can insert this capability. A caller-set GUC is never authority.
create table edra_private.offering_transitions (
  transaction_id xid8 not null,
  academy_id uuid not null,
  level_id text not null,
  track_id uuid,
  operation text not null check(operation in ('remove_track','stop_level')),
  primary key(transaction_id,academy_id)
);
create table edra_private.track_year_labels (
  track_id uuid not null references public.academy_tracks(id),
  academic_year_id uuid not null references public.academic_years(id),
  name text not null,
  captured_at timestamptz not null default clock_timestamp(),
  primary key(track_id,academic_year_id)
);
alter table edra_private.offering_revisions enable row level security;
alter table edra_private.offering_requests enable row level security;
alter table edra_private.offering_transitions enable row level security;
alter table edra_private.track_year_labels enable row level security;
revoke all on edra_private.offering_revisions,edra_private.offering_requests,
  edra_private.offering_transitions,edra_private.track_year_labels from public,anon,authenticated,service_role;

insert into edra_private.offering_revisions(academy_id) select id from public.academies;
-- These are the names known now, not a reconstruction of previously unrecorded renames.
insert into edra_private.track_year_labels(track_id,academic_year_id,name)
select t.id,y.id,t.name from public.academy_tracks t
join public.academic_years y on y.academy_id=t.academy_id;

create function edra_private.offering_available(p_academy uuid,p_level text,p_track uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.academy_levels l where l.academy_id=p_academy
    and l.level_id=p_level and l.stopped_at is null)
    and (p_track is null or exists(select 1 from public.academy_tracks t where t.id=p_track
      and t.academy_id=p_academy and t.level_id=p_level and t.retired_at is null));
$$;

create function edra_private.require_offering(p_academy uuid,p_level text,p_track uuid default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not edra_private.offering_available(p_academy,p_level,p_track) then
    raise exception using errcode='P0001',message='offering_unavailable';
  end if;
end $$;

create function edra_private.offering_transition(p_academy uuid,p_level text,p_track uuid,p_operation text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from edra_private.offering_transitions c
    where c.transaction_id=pg_current_xact_id() and c.academy_id=p_academy
      and c.level_id=p_level and c.operation=p_operation
      and (p_operation='stop_level' or c.track_id=p_track));
$$;

create function edra_private.track_label(p_track uuid,p_year uuid)
returns text language sql stable security definer set search_path='' as $$
  select case when y.closed_at is not null then coalesce(h.name,t.name) else t.name end
  from public.academy_tracks t
  left join public.academic_years y on y.id=p_year and y.academy_id=t.academy_id
  left join edra_private.track_year_labels h on h.track_id=t.id and h.academic_year_id=y.id
  where t.id=p_track and edra_auth.session_allowed() and public.is_academy_member(t.academy_id);
$$;

create function edra_private.capture_track_year_labels()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.closed_at is null and new.closed_at is not null then
    insert into edra_private.track_year_labels(track_id,academic_year_id,name)
    select t.id,new.id,t.name from public.academy_tracks t where t.academy_id=new.academy_id
    on conflict(track_id,academic_year_id) do update set name=excluded.name,captured_at=clock_timestamp();
  end if;
  return new;
end $$;
create trigger academic_years_capture_track_labels before update of closed_at on public.academic_years
  for each row execute function edra_private.capture_track_year_labels();

-- Coarse read/write barrier: ordinary academic commands take SHARE before their domain locks;
-- an offering transition takes EXCLUSIVE before any of them. This deliberately serializes an
-- offering transition with academic writes across academies, avoiding mixed domain lock orders.
-- Ordinary commands remain concurrent. A later per-academy optimization requires a new lock audit.
create function edra_private.offering_gate()
returns void language sql volatile security definer set search_path='' as $$
  select pg_advisory_xact_lock_shared(129,1);
$$;
create function edra_private.offering_statement_gate()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform edra_private.offering_gate();
  return null;
end $$;

-- Include direct RLS table writes, workers and future writes to existing academic tables.
do $$
declare t record;
begin
  for t in select distinct c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attname='academy_id' and not a.attisdropped
    where n.nspname='public' and c.relkind='r'
  loop
    execute format('create trigger offering_gate_before_write before insert or update or delete on public.%I for each statement execute function edra_private.offering_statement_gate()',t.relname);
  end loop;
end $$;

-- Add the barrier before the FIRST domain lock, including private workers and legacy helpers.
-- Preserve each installed body, signature, privileges and its internal lock ordering verbatim.
do $$
declare f record; definition text;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    join pg_language l on l.oid=p.prolang
    where n.nspname in ('public','edra_private') and l.lanname='plpgsql'
      and p.prosrc ~* '(for[[:space:]]+(no[[:space:]]+key[[:space:]]+update|key[[:space:]]+share|update|share)|pg_advisory)'
      and p.proname not like 'offering_%'
  loop
    definition:=pg_get_functiondef(f.oid);
    definition:=regexp_replace(definition,'\mbegin\M',E'begin\n  perform edra_private.offering_gate();','i');
    execute definition;
  end loop;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='edra_private' and p.proname in ('offering_available','require_offering',
      'offering_transition','track_label','capture_track_year_labels','offering_gate','offering_statement_gate')
  loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature); end loop;
end $$;

grant execute on function edra_private.track_label(uuid,uuid) to authenticated;

commit;
