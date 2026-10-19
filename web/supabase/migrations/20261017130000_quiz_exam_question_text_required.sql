-- Quizzes and exams: every question needs its text (or a pasted image), in both part types.
--
-- Every quiz and exam is answered both online and on paper, so a question without a prompt is unfinished.
-- Readiness gains the question-level issue `prompt`. The structure lock already freezes prompts, and
-- work can only start on a ready assessment, so a locked assessment can never become unready this way.
-- Existing unlocked drafts with empty prompts report the issue until their text is added.

-- Unresolved configuration: [{scope: quiz|part|question, id, issue}]. Empty means ready.
create or replace function edra_private.quiz_issues(p_quiz_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(i.item order by i.ord, i.pos, i.qpos), '[]'::jsonb) from (
    select 0 as ord, 0 as pos, 0 as qpos, jsonb_build_object('scope', 'quiz', 'id', z.id, 'issue', 'target') as item
    from public.quizzes z where z.id = p_quiz_id and z.audience is null
    union all
    select 0, 0, 0, jsonb_build_object('scope', 'quiz', 'id', z.id, 'issue', 'parts')
    from public.quizzes z where z.id = p_quiz_id and not exists (select 1 from public.quiz_parts p where p.quiz_id = z.id)
    union all
    select 1, p.position, 0, jsonb_build_object('scope', 'part', 'id', p.id, 'issue', 'questions')
    from public.quiz_parts p where p.quiz_id = p_quiz_id and not exists (select 1 from public.quiz_questions q where q.part_id = p.id)
    union all
    select 2, p.position, q.position, jsonb_build_object('scope', 'question', 'id', q.id, 'issue', x.issue)
    from public.quiz_parts p
    join public.quiz_questions q on q.part_id = p.id
    cross join lateral (
      select 'choices' as issue where (select count(*) from public.quiz_choices c where c.question_id = q.id) < 2
      union all
      select 'correct_choice' where not exists (select 1 from public.quiz_choices c where c.question_id = q.id and c.is_correct)
      union all
      select 'choice_text' where exists (select 1 from public.quiz_choices c where c.question_id = q.id and btrim(c.label) = '')
    ) x
    where p.quiz_id = p_quiz_id and p.kind = 'question_sheet'
    union all
    -- Every question needs its text or an image, whatever its part type: every quiz is answered both online and on paper.
    select 2, p.position, q.position, jsonb_build_object('scope', 'question', 'id', q.id, 'issue', 'prompt')
    from public.quiz_parts p
    join public.quiz_questions q on q.part_id = p.id
    where p.quiz_id = p_quiz_id and btrim(q.prompt) = ''
  ) i;
$$;

-- Unresolved configuration: [{scope: exam|part|question, id, issue}]. Empty means ready.
-- issue: target, timer, parts, questions, choices, correct_choice, choice_text, prompt.
create or replace function edra_private.exam_issues(p_exam_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(i.item order by i.ord, i.pos, i.qpos), '[]'::jsonb) from (
    select 0 as ord, 0 as pos, 0 as qpos, jsonb_build_object('scope', 'exam', 'id', z.id, 'issue', 'target') as item
    from public.exams z where z.id = p_exam_id and z.audience is null
    union all
    select 0, 0, 0, jsonb_build_object('scope', 'exam', 'id', z.id, 'issue', 'timer')
    from public.exams z where z.id = p_exam_id and z.time_limit_minutes is null
    union all
    select 0, 0, 0, jsonb_build_object('scope', 'exam', 'id', z.id, 'issue', 'parts')
    from public.exams z where z.id = p_exam_id and not exists (select 1 from public.exam_parts p where p.exam_id = z.id)
    union all
    select 1, p.position, 0, jsonb_build_object('scope', 'part', 'id', p.id, 'issue', 'questions')
    from public.exam_parts p where p.exam_id = p_exam_id and not exists (select 1 from public.exam_questions q where q.part_id = p.id)
    union all
    select 2, p.position, q.position, jsonb_build_object('scope', 'question', 'id', q.id, 'issue', x.issue)
    from public.exam_parts p
    join public.exam_questions q on q.part_id = p.id
    cross join lateral (
      select 'choices' as issue where (select count(*) from public.exam_choices c where c.question_id = q.id) < 2
      union all
      select 'correct_choice' where not exists (select 1 from public.exam_choices c where c.question_id = q.id and c.is_correct)
      union all
      select 'choice_text' where exists (select 1 from public.exam_choices c where c.question_id = q.id and btrim(c.label) = '')
    ) x
    where p.exam_id = p_exam_id and p.kind = 'question_sheet'
    union all
    -- Every question needs its text or an image, whatever its part type: every exam is answered both online and on paper.
    select 2, p.position, q.position, jsonb_build_object('scope', 'question', 'id', q.id, 'issue', 'prompt')
    from public.exam_parts p
    join public.exam_questions q on q.part_id = p.id
    where p.exam_id = p_exam_id and btrim(q.prompt) = ''
  ) i;
$$;

revoke all on function edra_private.quiz_issues(uuid) from public, anon, authenticated;
revoke all on function edra_private.exam_issues(uuid) from public, anon, authenticated;
