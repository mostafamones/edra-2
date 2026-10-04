-- Numbered, persistent import logs and atomic removal of selected draft entries.
alter table public.student_import_sessions
  add column import_number integer,
  add column imported_by_name text;

with numbered as (
  select id, row_number() over (partition by academy_id order by created_at, id)::integer as n
  from public.student_import_sessions
)
update public.student_import_sessions s set import_number = n.n,
  imported_by_name = coalesce(nullif(p.full_name, ''), 'Staff member')
from numbered n, public.profiles p where s.id = n.id and p.id = s.created_by;

alter table public.student_import_sessions
  alter column import_number set not null,
  alter column imported_by_name set not null,
  add constraint student_import_number_positive check (import_number > 0),
  add constraint student_import_number_unique unique (academy_id, import_number);

-- This private counter serializes concurrent starts without exposing other academies' activity.
create table public.student_import_counters (
  academy_id uuid primary key references public.academies(id),
  last_number integer not null check (last_number > 0)
);
alter table public.student_import_counters enable row level security;
revoke all on public.student_import_counters from public, anon, authenticated;
insert into public.student_import_counters(academy_id, last_number)
select academy_id, max(import_number) from public.student_import_sessions group by academy_id;

create function public.number_student_import()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.student_import_counters as counter(academy_id, last_number)
  values(new.academy_id, 1)
  on conflict(academy_id) do update set last_number = counter.last_number + 1
  returning last_number into new.import_number;
  select coalesce(nullif(p.full_name, ''), 'Staff member') into new.imported_by_name
  from public.profiles p where p.id = new.created_by;
  return new;
end;
$$;
revoke all on function public.number_student_import() from public, anon, authenticated;
create trigger number_student_import before insert on public.student_import_sessions
for each row execute function public.number_student_import();

create function public.remove_student_import_entries(
  p_session_id uuid, p_expected_revision integer, p_ordinals integer[]
)
returns integer language plpgsql security definer set search_path = '' as $$
declare s public.student_import_sessions%rowtype;
begin
  s := public.lock_student_import_session(p_session_id);
  perform public.require_student_import_state(s, 'reviewing');
  perform public.require_student_import_year(s);
  if p_expected_revision is distinct from s.revision then
    raise exception using errcode = 'P0001', message = 'stale_revision';
  end if;
  if p_ordinals is null or cardinality(p_ordinals) not between 1 and 5000
    or exists(select 1 from unnest(p_ordinals) o where o is null or o not between 1 and 5000)
    or cardinality(p_ordinals) <> (select count(distinct o) from unnest(p_ordinals) o) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if (select count(*) from public.student_import_rows r where r.session_id = s.id and r.ordinal = any(p_ordinals)) <> cardinality(p_ordinals) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  update public.student_import_rows r set excluded = true where r.session_id = s.id and r.ordinal = any(p_ordinals);
  perform public.refresh_student_import(s.id, null);
  update public.student_import_sessions set revision = revision + 1, updated_at = now()
  where id = s.id returning revision into s.revision;
  return s.revision;
end;
$$;
revoke all on function public.remove_student_import_entries(uuid, integer, integer[]) from public, anon;
grant execute on function public.remove_student_import_entries(uuid, integer, integer[]) to authenticated;

-- The entries filter hides removed rows while retaining them in the log.
create or replace function public.list_student_import_rows(
  p_session_id uuid, p_status text, p_search text, p_page_index integer, p_page_size integer
)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  term text := nullif(pg_catalog.btrim(coalesce(p_search, '')), '');
  pattern text;
  digits text;
  total bigint;
  page jsonb;
begin
  if p_page_size is null or p_page_size not in (10, 20, 50, 100) or p_page_index is null or p_page_index < 0
    or (p_status is not null and p_status not in ('ready', 'invalid', 'duplicate_existing', 'duplicate_file',
      'excluded', 'pending', 'created', 'skipped', 'failed', 'entries')) then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if term is not null then
    term := left(term, 100);
    pattern := '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    if term ~ '^[+0-9[:space:]().-]+$' then
      digits := nullif(pg_catalog.regexp_replace(term, '[^0-9]', '', 'g'), '');
      if digits like '00%' then digits := substr(digits, 3); elsif digits like '0%' then digits := substr(digits, 2); end if;
      digits := nullif(digits, '');
    end if;
  end if;

  select count(*) into total from public.student_import_rows r
  where r.session_id = p_session_id
    and (p_status is null or r.status = p_status or r.outcome = p_status or (p_status = 'entries' and not r.excluded))
    and (pattern is null or r.source ->> 'full_name' ilike pattern or r.input ->> 'full_name' ilike pattern
      or r.source ->> 'student_phone' ilike pattern or r.source ->> 'parent_phone' ilike pattern
      or r.source_row::text = term
      or (digits is not null and (r.student_phone like '%' || digits || '%' or r.input ->> 'parent_phone' like '%' || digits || '%')));

  select coalesce(jsonb_agg(to_jsonb(x) order by x.ordinal), '[]'::jsonb) into page from (
    select r.ordinal, r.source_row, r.source, r.corrected is not null as corrected, r.input, r.issues, r.excluded,
      r.status, r.existing_archived, r.duplicate_rows, r.batch_index, r.outcome, r.outcome_code, r.record_id,
      gl.name as level_name, t.name as track_name, g.name as group_name
    from public.student_import_rows r
    left join public.global_levels gl on gl.id = r.input ->> 'level_id'
    left join public.academy_tracks t on t.id = (r.input ->> 'track_id')::uuid
    left join public.groups g on g.id = (r.input ->> 'primary_group_id')::uuid
    where r.session_id = p_session_id
      and (p_status is null or r.status = p_status or r.outcome = p_status or (p_status = 'entries' and not r.excluded))
      and (pattern is null or r.source ->> 'full_name' ilike pattern or r.input ->> 'full_name' ilike pattern
        or r.source ->> 'student_phone' ilike pattern or r.source ->> 'parent_phone' ilike pattern
        or r.source_row::text = term
        or (digits is not null and (r.student_phone like '%' || digits || '%' or r.input ->> 'parent_phone' like '%' || digits || '%')))
    order by r.ordinal
    limit p_page_size offset p_page_index * p_page_size
  ) x;
  return jsonb_build_object('rows', page, 'total', total);
end;
$$;
