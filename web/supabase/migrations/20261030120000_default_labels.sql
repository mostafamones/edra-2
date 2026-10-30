-- Gives every academy three starter labels: existing academies now, new ones on creation. They are
-- ordinary labels that managers may rename, recolor or delete; a deleted one does not come back.
-- Existing academies keep any label that already uses one of these names.
create function edra_private.add_default_labels(p_academy_id uuid)
returns void
language sql security definer set search_path = '' as $$
  insert into public.labels (id, academy_id, name, color)
  select gen_random_uuid(), p_academy_id, defaults.name, defaults.color
  from (values ('Online only', 'blue'), ('Ready for in-person', 'green'), ('Needs review', 'amber')) as defaults(name, color)
  on conflict (academy_id, lower(name)) do nothing;
$$;

create function edra_private.academy_default_labels()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.add_default_labels(new.id);
  return null;
end;
$$;

revoke all on function edra_private.add_default_labels(uuid) from public, anon, authenticated;
revoke all on function edra_private.academy_default_labels() from public, anon, authenticated;

create trigger academies_default_labels after insert on public.academies
for each row execute function edra_private.academy_default_labels();

select edra_private.add_default_labels(id) from public.academies;
