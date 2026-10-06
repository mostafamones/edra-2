-- Platform route reservations. Apply only after approved read-only collision preflight.
-- No slug is renamed: a collision makes this migration fail and requires an owner decision.
alter table public.academies drop constraint academies_slug_format;
alter table public.academies add constraint academies_slug_format check (
  char_length(slug) between 1 and 50
  and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  and slug not in ('app', 'learn', 'auth', 'onboarding', 'api', 'invite', 'account', 'profile', 'calendar', 'content', 'assignments', 'quizzes', 'attendance', 'results')
);

create or replace function public.academy_slug_is_available(candidate_slug text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if candidate_slug is null
    or char_length(candidate_slug) not between 1 and 50
    or candidate_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or candidate_slug in ('app', 'learn', 'auth', 'onboarding', 'api', 'invite', 'account', 'profile', 'calendar', 'content', 'assignments', 'quizzes', 'attendance', 'results') then
    return false;
  end if;

  return not exists (
    select 1 from public.academies where slug = candidate_slug
  );
end;
$$;

create or replace function public.create_academy_setup(
  academy_name text,
  academy_slug text,
  academy_icon text,
  academy_subject text,
  selected_level_ids text[],
  academy_tracks jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_academy_id uuid;
  track_value jsonb;
  track_level_id text;
  track_name text;
  track_sort_order smallint;
  failed_constraint text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if char_length(trim(coalesce(academy_name, ''))) not between 2 and 80 then
    raise exception 'invalid_academy_name';
  end if;

  if academy_slug is null
    or char_length(academy_slug) not between 1 and 50
    or academy_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or academy_slug in ('app', 'learn', 'auth', 'onboarding', 'api', 'invite', 'account', 'profile', 'calendar', 'content', 'assignments', 'quizzes', 'attendance', 'results') then
    raise exception 'invalid_academy_slug';
  end if;

  if academy_icon is null
    or academy_icon not in ('school', 'book', 'graduate', 'science', 'code', 'art', 'music', 'trophy', 'world') then
    raise exception 'invalid_academy_icon';
  end if;

  if char_length(trim(coalesce(academy_subject, ''))) not between 1 and 60 then
    raise exception 'invalid_academy_subject';
  end if;

  if coalesce(array_length(selected_level_ids, 1), 0) not between 1 and 100
    or exists (
      select 1
      from unnest(selected_level_ids) as selected(level_id)
      left join public.global_levels levels on levels.id = selected.level_id
      where levels.id is null
    )
    or (select count(*) from unnest(selected_level_ids))
      <> (select count(distinct level_id) from unnest(selected_level_ids) as selected(level_id)) then
    raise exception 'invalid_academy_levels';
  end if;

  if academy_tracks is null or jsonb_typeof(academy_tracks) <> 'array' then
    raise exception 'invalid_academy_tracks';
  end if;

  if jsonb_array_length(academy_tracks) > 100 then
    raise exception 'invalid_academy_tracks';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(academy_tracks) as tracks(value)
    where jsonb_typeof(tracks.value) <> 'object'
      or nullif(trim(tracks.value ->> 'levelId'), '') is null
      or nullif(trim(tracks.value ->> 'name'), '') is null
      or char_length(trim(tracks.value ->> 'name')) > 60
      or not (tracks.value ->> 'levelId' = any(selected_level_ids))
  ) then
    raise exception 'invalid_academy_tracks';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(academy_tracks) as tracks(value)
    group by tracks.value ->> 'levelId', lower(trim(tracks.value ->> 'name'))
    having count(*) > 1
  ) then
    raise exception 'duplicate_academy_track_names';
  end if;

  if exists (
    select 1 from public.academy_memberships
    where user_id = auth.uid() and role = 'owner'
  ) then
    raise exception 'academy_owner_limit';
  end if;

  insert into public.academies (name, slug, icon, subject, created_by)
  values (trim(academy_name), academy_slug, academy_icon, trim(academy_subject), auth.uid())
  returning id into new_academy_id;

  insert into public.academy_memberships (academy_id, user_id, role, created_by)
  values (new_academy_id, auth.uid(), 'owner', auth.uid());

  insert into public.academy_levels (academy_id, level_id, sort_order)
  select new_academy_id, selected.level_id, selected.ordinality::smallint
  from unnest(selected_level_ids) with ordinality as selected(level_id, ordinality);

  for track_value in select value from jsonb_array_elements(academy_tracks) as tracks(value)
  loop
    track_level_id := track_value ->> 'levelId';
    track_name := trim(track_value ->> 'name');
    select count(*)::smallint into track_sort_order
    from public.academy_tracks
    where academy_id = new_academy_id and level_id = track_level_id;

    insert into public.academy_tracks (academy_id, level_id, name, sort_order)
    values (new_academy_id, track_level_id, track_name, track_sort_order);
  end loop;

  return new_academy_id;
exception
  when unique_violation then
    get stacked diagnostics failed_constraint = constraint_name;
    if failed_constraint = 'academies_slug_unique_idx' then
      raise exception 'academy_slug_taken';
    elsif failed_constraint = 'academy_memberships_one_academy_per_owner_idx' then
      raise exception 'academy_owner_limit';
    elsif failed_constraint = 'academy_tracks_name_per_level_idx' then
      raise exception 'duplicate_academy_track_names';
    else
      raise;
    end if;
end;
$$;

revoke all on function public.create_academy(text) from public, anon, authenticated;
revoke all on function public.academy_slug_is_available(text) from public, anon, authenticated;
revoke all on function public.create_academy_setup(text, text, text, text, text[], jsonb) from public, anon, authenticated;

grant execute on function public.academy_slug_is_available(text) to authenticated;
grant execute on function public.create_academy_setup(text, text, text, text, text[], jsonb) to authenticated;
