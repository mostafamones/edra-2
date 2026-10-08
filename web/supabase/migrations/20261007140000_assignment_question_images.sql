-- Assignments: images pasted into online question text and choices.
--
-- Scope (staff authoring only):
--   * A private Storage bucket `assignment-images` holds the images, named `<academy_id>/<image_id>`
--     (no extension; the content type is stored by Storage). PNG, JPEG, WebP or GIF, at most 5 MB,
--     enforced by the bucket itself.
--   * Staff (owner, admin, instructor) of the academy in the first path segment may upload and read.
--     Nobody may update or delete through the API: an image may be referenced by saved or published
--     questions, so objects are immutable. Unreferenced uploads are left in place (no cleanup yet).
--   * A question's prompt and choice labels reference images inline with the token
--     `{{image:<image_id>}}`. A deferred constraint trigger checks, at commit, that every referenced
--     image exists in this academy's folder and that a question references at most 10 images across
--     its prompt and choices. Violations raise the existing `validation` error (hint `questions`).
--
-- NOT in this migration: student read access (student endpoints do not exist yet), cleanup of
-- unreferenced uploads.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assignment-images', 'assignment-images', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- True when the caller is staff of the academy named by an `<academy_id>/<image_id>` object name.
create or replace function public.is_assignment_image_staff(p_name text)
returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  uuid_pattern constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
begin
  if auth.uid() is null or p_name is null or p_name !~ ('^' || uuid_pattern || '/' || uuid_pattern || '$') then
    return false;
  end if;
  return public.academy_role_for(split_part(p_name, '/', 1)::uuid) is not null;
end;
$$;

revoke all on function public.is_assignment_image_staff(text) from public;
grant execute on function public.is_assignment_image_staff(text) to authenticated;

create policy assignment_images_insert_staff on storage.objects
  for insert to authenticated
  with check (bucket_id = 'assignment-images' and public.is_assignment_image_staff(name));
create policy assignment_images_select_staff on storage.objects
  for select to authenticated
  using (bucket_id = 'assignment-images' and public.is_assignment_image_staff(name));

-- Image ids referenced by a text, in order (duplicates kept).
create or replace function edra_private.image_tokens(p_text text)
returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(m[1]), '{}')
  from regexp_matches(coalesce(p_text, ''),
    '\{\{image:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}\}', 'g') as m;
$$;

create or replace function edra_private.check_question_images()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target uuid := case when tg_table_name = 'assignment_part_questions' then new.id else new.question_id end;
  owner uuid;
  tokens text[];
begin
  select q.academy_id, edra_private.image_tokens(q.prompt)
    || coalesce((select array_agg(t) from public.assignment_question_choices c, unnest(edra_private.image_tokens(c.label)) t
        where c.question_id = q.id), '{}')
  into owner, tokens
  from public.assignment_part_questions q where q.id = target;
  -- The question was removed later in the same transaction.
  if not found or cardinality(tokens) = 0 then return null; end if;
  if cardinality(tokens) > 10 or exists (
    select 1 from unnest(tokens) t where not exists (
      select 1 from storage.objects o where o.bucket_id = 'assignment-images' and o.name = owner::text || '/' || t))
  then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'questions';
  end if;
  return null;
end;
$$;

create constraint trigger assignment_part_questions_images after insert or update of prompt on public.assignment_part_questions
deferrable initially deferred for each row execute function edra_private.check_question_images();
create constraint trigger assignment_question_choices_images after insert or update of label on public.assignment_question_choices
deferrable initially deferred for each row execute function edra_private.check_question_images();
