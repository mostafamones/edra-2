-- Unknown string literals with array concatenation resolve as text[] operands and
-- fail on incomplete parts. Append issue codes explicitly as text elements instead.
create or replace function edra_private.part_issues(p_part_id uuid)
returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare
  target public.assignment_parts%rowtype;
  issues text[] := '{}';
begin
  select * into target from public.assignment_parts p where p.id = p_part_id;
  if not found then return issues; end if;
  if target.kind is null then
    if target.max_score <= 0 then issues := pg_catalog.array_append(issues, 'maximum'); end if;
    return issues;
  end if;
  if not exists (select 1 from public.assignment_part_questions q where q.part_id = target.id) then
    return pg_catalog.array_append(issues, 'questions');
  end if;
  if target.kind in ('online_questions', 'answer_sheet') then
    if exists (
      select 1 from public.assignment_part_questions q
      where q.part_id = target.id
        and (select count(*) from public.assignment_question_choices c where c.question_id = q.id) < 2
    ) then issues := pg_catalog.array_append(issues, 'choices'); end if;
    if exists (
      select 1 from public.assignment_part_questions q
      where q.part_id = target.id
        and not exists (select 1 from public.assignment_question_choices c where c.question_id = q.id and c.is_correct)
    ) then issues := pg_catalog.array_append(issues, 'correct_choice'); end if;
  end if;
  if target.kind = 'online_questions' then
    if exists (select 1 from public.assignment_part_questions q where q.part_id = target.id and q.prompt = '') then
      issues := pg_catalog.array_append(issues, 'prompt');
    end if;
    if exists (select 1 from public.assignment_question_choices c where c.part_id = target.id and c.label = '') then
      issues := pg_catalog.array_append(issues, 'choice_text');
    end if;
  end if;
  return issues;
end;
$$;
