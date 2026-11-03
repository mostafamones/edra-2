-- Gives every academy three starter student labels: existing academies now, new ones on creation.
-- Like the other starters they are ordinary labels; a deleted one does not come back.
create or replace function edra_private.add_default_labels(p_academy_id uuid)
returns void
language sql security definer set search_path = '' as $$
  insert into public.labels (id, academy_id, domain, name, color)
  select gen_random_uuid(), p_academy_id, defaults.domain, defaults.name, defaults.color
  from (values
    ('assessments', 'Online only', 'blue'), ('assessments', 'Ready for in-person', 'green'), ('assessments', 'Needs review', 'amber'),
    ('content', 'Core', 'blue'), ('content', 'Revision', 'green'), ('content', 'Needs update', 'amber'),
    ('students', 'Scholarship', 'blue'), ('students', 'Top student', 'green'), ('students', 'Needs follow-up', 'amber')
  ) as defaults(domain, name, color)
  on conflict (academy_id, domain, lower(name)) do nothing;
$$;

-- Starters a manager deleted in the other catalogs must stay deleted, so only the new student ones are added here.
insert into public.labels (id, academy_id, domain, name, color)
select gen_random_uuid(), a.id, 'students', defaults.name, defaults.color
from public.academies a
cross join (values ('Scholarship', 'blue'), ('Top student', 'green'), ('Needs follow-up', 'amber')) as defaults(name, color)
on conflict (academy_id, domain, lower(name)) do nothing;
