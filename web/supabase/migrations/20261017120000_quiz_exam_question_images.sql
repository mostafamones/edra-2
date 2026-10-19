-- Quizzes and exams: images pasted into question text and choices, as in assignments
-- (20261007140000_assignment_question_images.sql and its fixes).
--
-- The images share the private `assignment-images` bucket and its staff-only policies: objects are named
-- `<academy_id>/<image_id>` and readable and insertable only by staff of that academy. A question's prompt
-- and choice labels reference images inline with `{{image:<image_id>}}`. A deferred constraint trigger
-- checks, at commit, that every referenced image exists in the question's academy folder and that a
-- question references at most 10 images across its prompt and choices. Violations raise the existing
-- `validation` error (hint `questions`).
--
-- NOT in this migration: student read access (student endpoints are not connected yet), cleanup of
-- unreferenced uploads.

create or replace function edra_private.check_sheet_question_images()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
  academy uuid;
  tokens text[];
begin
  if tg_table_name in ('quiz_questions', 'exam_questions') then
    target := new.id;
  else
    target := new.question_id;
  end if;
  if tg_table_name in ('quiz_questions', 'quiz_choices') then
    select q.academy_id, edra_private.image_tokens(q.prompt)
      || coalesce((select array_agg(t) from public.quiz_choices c, unnest(edra_private.image_tokens(c.label)) t
          where c.question_id = q.id), '{}')
    into academy, tokens
    from public.quiz_questions q where q.id = target;
  else
    select q.academy_id, edra_private.image_tokens(q.prompt)
      || coalesce((select array_agg(t) from public.exam_choices c, unnest(edra_private.image_tokens(c.label)) t
          where c.question_id = q.id), '{}')
    into academy, tokens
    from public.exam_questions q where q.id = target;
  end if;
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

revoke all on function edra_private.check_sheet_question_images() from public;

create constraint trigger quiz_questions_images after insert or update of prompt on public.quiz_questions
deferrable initially deferred for each row execute function edra_private.check_sheet_question_images();
create constraint trigger quiz_choices_images after insert or update of label on public.quiz_choices
deferrable initially deferred for each row execute function edra_private.check_sheet_question_images();
create constraint trigger exam_questions_images after insert or update of prompt on public.exam_questions
deferrable initially deferred for each row execute function edra_private.check_sheet_question_images();
create constraint trigger exam_choices_images after insert or update of label on public.exam_choices
deferrable initially deferred for each row execute function edra_private.check_sheet_question_images();
