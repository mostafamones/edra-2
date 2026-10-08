-- Corrects edra_private.check_question_images (20261007150000): the `owner` variable clashed with
-- the storage.objects.owner column. Renamed to `academy`.

create or replace function edra_private.check_question_images()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
  academy uuid;
  tokens text[];
begin
  if tg_table_name = 'assignment_part_questions' then
    target := new.id;
  else
    target := new.question_id;
  end if;
  select q.academy_id, edra_private.image_tokens(q.prompt)
    || coalesce((select array_agg(t) from public.assignment_question_choices c, unnest(edra_private.image_tokens(c.label)) t
        where c.question_id = q.id), '{}')
  into academy, tokens
  from public.assignment_part_questions q where q.id = target;
  -- The question was removed later in the same transaction.
  if not found or cardinality(tokens) = 0 then return null; end if;
  if cardinality(tokens) > 10 or exists (
    select 1 from unnest(tokens) t where not exists (
      select 1 from storage.objects o where o.bucket_id = 'assignment-images' and o.name = academy::text || '/' || t))
  then
    raise exception using errcode = 'P0001', message = 'validation', hint = 'questions';
  end if;
  return null;
end;
$$;
