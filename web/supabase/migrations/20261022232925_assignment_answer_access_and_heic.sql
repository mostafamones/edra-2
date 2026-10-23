-- EDRA-81 follow-up: HEIC/HEIF Written Work photos, record-scoped editor documents, a submitted
-- recheck after the draft lock (concurrent submissions), and the manager answer-access ledger.
begin;

alter table public.assignment_work_files drop constraint assignment_work_files_mime_check;
alter table public.assignment_work_files add constraint assignment_work_files_mime_check
  check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'));
update storage.buckets set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  where id = 'assignment-work';

-- The document names its annual record so browser recovery data is scoped by record too.
create or replace function edra_private.assignment_editor_document(p_assignment uuid, p_record uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('recordId', d.record_id, 'generation', d.generation, 'version', d.version, 'answers', d.answers, 'leaseUntil', d.lease_until,
    'scoringRevision', a.scoring_revision,
    'parts', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'instructions', p.instructions, 'kind', p.kind,
      'questions', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'number', q.position,
        'prompt', case when p.kind = 'online_questions' then q.prompt else '' end,
        'choices', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'position', c.position,
          'label', case when p.kind = 'online_questions' then c.label else '' end) order by c.position)
          from public.assignment_question_choices c where c.question_id = q.id), '[]')) order by q.position)
        from public.assignment_part_questions q where q.part_id = p.id and not q.excluded and p.kind <> 'file_upload'), '[]')) order by p.position)
      from public.assignment_parts p where p.assignment_id = a.id), '[]'),
    'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'partId', f.part_id, 'name', f.name, 'size', f.size, 'mime', f.mime, 'state', f.state, 'path', f.storage_path)
      order by f.created_at, f.id) from public.assignment_work_files f
      where f.assignment_id = a.id and f.record_id = d.record_id and f.state in ('pending', 'complete')), '[]'))
  from edra_private.assignment_online_drafts d join public.assignments a on a.id = d.assignment_id
  where d.assignment_id = p_assignment and d.record_id = p_record;
$$;

create or replace function public.assignment_student_command(p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  academy uuid; target uuid; operation text; token uuid; editor integer; expected integer; key uuid;
  scope jsonb; rec uuid; a public.assignments; d edra_private.assignment_online_drafts;
  request edra_private.assignment_online_requests; result jsonb; entry record; q public.assignment_part_questions;
  f public.assignment_work_files; stamp timestamptz; manifest jsonb; snapshot jsonb; publication uuid; late boolean;
  lease constant interval := interval '90 seconds';
begin
  begin
    academy := (p_input->>'academyId')::uuid; target := (p_input->>'assignmentId')::uuid; operation := p_input->>'operation';
    token := (p_input->>'token')::uuid; editor := (p_input->>'generation')::integer;
    expected := (p_input->>'version')::integer; key := (p_input->>'key')::uuid;
  exception when others then raise exception 'validation';
  end;
  if jsonb_typeof(p_input) is distinct from 'object' or token is null
    or operation is null or operation not in ('claim', 'renew', 'read', 'save', 'register', 'finish', 'remove', 'submit')
    or (operation in ('save', 'register', 'finish', 'remove', 'submit') and (key is null or editor is null)) then raise exception 'validation'; end if;
  scope := edra_private.assignment_student_scope(academy, target);
  rec := (scope->>'recordId')::uuid;
  select * into strict a from public.assignments where id = target;

  if key is not null then
    -- An exact retry replays its receipt. A lost submit response recovers receipt metadata only.
    select * into request from edra_private.assignment_online_requests where id = key;
    if found then
      if request.actor_id <> auth.uid() or request.assignment_id <> target or request.record_id <> rec or request.payload <> p_input
        then raise exception 'idempotency_conflict'; end if;
      if operation = 'submit' then return edra_private.assignment_student_overview(target, scope); end if;
      return request.result;
    end if;
  end if;
  if scope->>'reason' is not null then raise exception '%', scope->>'reason'; end if;

  if operation = 'claim' then
    insert into edra_private.assignment_online_drafts(assignment_id, record_id, editor_token, lease_until)
      values (target, rec, token, clock_timestamp() + lease) on conflict do nothing;
    select * into strict d from edra_private.assignment_online_drafts where assignment_id = target and record_id = rec for update;
    if d.editor_token <> token then
      -- Another live editor keeps authority unless the student explicitly transfers it here.
      if d.lease_until > clock_timestamp() and not coalesce((p_input->>'transfer')::boolean, false) then
        return jsonb_build_object('busy', true);
      end if;
      update edra_private.assignment_online_drafts set generation = generation + 1, editor_token = token, lease_until = clock_timestamp() + lease
        where assignment_id = target and record_id = rec;
    else
      update edra_private.assignment_online_drafts set lease_until = clock_timestamp() + lease where assignment_id = target and record_id = rec;
    end if;
    return edra_private.assignment_editor_document(target, rec);
  end if;

  select * into d from edra_private.assignment_online_drafts where assignment_id = target and record_id = rec for update;
  if not found or d.editor_token <> token or (editor is not null and d.generation <> editor) or d.lease_until <= clock_timestamp()
    then raise exception 'editor_stale'; end if;
  -- A concurrent submission may have committed while this command waited on the draft lock.
  if exists (select 1 from public.assignment_online_submissions s where s.assignment_id = target and s.record_id = rec) then raise exception 'submitted'; end if;
  update edra_private.assignment_online_drafts set lease_until = clock_timestamp() + lease where assignment_id = target and record_id = rec;
  if operation = 'renew' then return jsonb_build_object('leaseUntil', clock_timestamp() + lease, 'version', d.version); end if;
  if operation = 'read' then return edra_private.assignment_editor_document(target, rec); end if;
  if operation in ('save', 'submit') and d.version is distinct from expected then raise exception 'draft_conflict'; end if;

  if operation = 'save' then
    if jsonb_typeof(p_input->'answers') is distinct from 'object' or (select count(*) from jsonb_object_keys(p_input->'answers')) not between 1 and 300
      then raise exception 'validation'; end if;
    for entry in select * from jsonb_each(p_input->'answers') loop
      begin
        select * into q from public.assignment_part_questions where id = entry.key::uuid and assignment_id = target;
      exception when invalid_text_representation then raise exception 'validation';
      end;
      if not found or not exists (select 1 from public.assignment_parts where id = q.part_id and kind in ('online_questions', 'answer_sheet'))
        then raise exception 'validation'; end if;
      if q.excluded then raise exception 'question_excluded'; end if;
      if entry.value <> 'null'::jsonb and (jsonb_typeof(entry.value) <> 'string'
        or not exists (select 1 from public.assignment_question_choices where question_id = q.id and id::text = entry.value#>>'{}'))
        then raise exception 'validation'; end if;
    end loop;
    perform edra_private.assignment_select_online(a, rec);
    update edra_private.assignment_online_drafts set answers = answers || (p_input->'answers'), version = version + 1, updated_at = clock_timestamp()
      where assignment_id = target and record_id = rec;
    result := jsonb_build_object('version', d.version + 1);

  elsif operation = 'register' then
    if not exists (select 1 from public.assignment_parts where assignment_id = target and id::text = p_input->>'partId' and kind = 'file_upload')
      or char_length(btrim(coalesce(p_input->>'name', ''))) not between 1 and 250
      or coalesce(p_input->>'mime', '') not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')
      or jsonb_typeof(p_input->'size') is distinct from 'number' or (p_input->>'size')::numeric not between 1 and 8388608
      then raise exception 'validation'; end if;
    -- The draft row lock serializes registrations, so the per-part count is atomic.
    if (select count(*) from public.assignment_work_files where assignment_id = target and record_id = rec
      and part_id = (p_input->>'partId')::uuid and state in ('pending', 'complete')) >= 20 then raise exception 'file_limit'; end if;
    insert into public.assignment_work_files(assignment_id, record_id, part_id, actor_id, generation, storage_path, name, mime, size)
      values (target, rec, (p_input->>'partId')::uuid, auth.uid(), d.generation,
        academy::text || '/' || rec::text || '/' || gen_random_uuid()::text, btrim(p_input->>'name'), p_input->>'mime', (p_input->>'size')::integer)
      returning * into f;
    result := jsonb_build_object('fileId', f.id, 'path', f.storage_path);

  elsif operation = 'finish' then
    select * into f from public.assignment_work_files where id::text = p_input->>'fileId' and assignment_id = target and record_id = rec for update;
    if not found or f.state <> 'pending' or f.generation <> d.generation or f.sha256 is null then raise exception 'file_unavailable'; end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'assignment-work' and o.name = f.storage_path
      and (o.metadata->>'size')::bigint = f.size) then raise exception 'file_unavailable'; end if;
    perform edra_private.assignment_select_online(a, rec);
    update public.assignment_work_files set state = 'complete', completed_at = clock_timestamp() where id = f.id;
    result := jsonb_build_object('fileId', f.id, 'state', 'complete');

  elsif operation = 'remove' then
    update public.assignment_work_files set state = 'removed', completed_at = null where id::text = p_input->>'fileId' and assignment_id = target
      and record_id = rec and submission_id is null and state in ('pending', 'complete') returning * into f;
    if f.id is null then raise exception 'file_unavailable'; end if;
    result := jsonb_build_object('fileId', f.id, 'state', 'removed');

  elsif operation = 'submit' then
    if a.scoring_revision is distinct from (p_input->>'scoringRevision')::integer then raise exception 'draft_conflict'; end if;
    if exists (select 1 from public.assignment_work_files where assignment_id = target and record_id = rec and state = 'pending') then raise exception 'uploads_pending'; end if;
    if exists (select 1 from public.assignment_parts p where p.assignment_id = target and p.kind = 'file_upload' and not exists (
      select 1 from public.assignment_work_files f2 where f2.assignment_id = target and f2.record_id = rec and f2.part_id = p.id and f2.state = 'complete'))
      then raise exception 'files_required'; end if;
    perform edra_private.assignment_select_online(a, rec);
    select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'partId', w.part_id, 'path', w.storage_path, 'name', w.name, 'mime', w.mime,
      'size', w.size, 'sha256', w.sha256) order by w.part_id, w.created_at, w.id), '[]') into manifest
      from public.assignment_work_files w where w.assignment_id = target and w.record_id = rec and w.state = 'complete';
    stamp := clock_timestamp();
    late := a.due_at is not null and stamp > a.due_at;
    insert into public.assignment_online_submissions(id, assignment_id, record_id, actor_id, generation, draft_version, scoring_revision, answers, manifest, submitted_at, late)
      values (key, target, rec, auth.uid(), d.generation, d.version, a.scoring_revision, d.answers, manifest, stamp, late);
    update public.assignment_work_files set submission_id = key where assignment_id = target and record_id = rec and state = 'complete';
    -- Grade choices with the current scoring basis; blanks are recorded as unanswered (score 0).
    insert into public.assignment_question_answers(assignment_id, annual_student_record_id, part_id, question_id, academy_id, choice_id, score, updated_by)
      select target, rec, q2.part_id, q2.id, a.academy_id, c.id, case when c.is_correct then q2.max_score else 0 end, auth.uid()
      from public.assignment_part_questions q2 join public.assignment_parts p on p.id = q2.part_id
      left join public.assignment_question_choices c on c.question_id = q2.id and c.id::text = d.answers->>(q2.id::text)
      where q2.assignment_id = target and p.kind in ('online_questions', 'answer_sheet') and not q2.excluded;
    insert into public.assignment_marks(assignment_id, annual_student_record_id, part_id, academy_id, kind, score, from_answers, updated_by)
      select target, rec, p.id, a.academy_id, 'mark', coalesce((select sum(x.score) from public.assignment_question_answers x
        where x.assignment_id = target and x.annual_student_record_id = rec and x.part_id = p.id), 0), true, auth.uid()
      from public.assignment_parts p where p.assignment_id = target and p.kind in ('online_questions', 'answer_sheet');
    update public.assignment_recipients set work_status = case when late then 'late' else 'submitted' end::public.assignment_work_status,
      received_at = stamp, work_recorded_by = auth.uid(), work_recorded_at = stamp, version = version + 1, updated_at = stamp
      where assignment_id = target and annual_student_record_id = rec;
    -- Fully automatic work announces its complete result once; any Written Work waits for staff.
    if not exists (select 1 from public.assignment_parts where assignment_id = target and kind = 'file_upload') then
      select coalesce(jsonb_agg(jsonb_build_object('part_id', p.id, 'position', p.position, 'title', p.title,
        'max_score', edra_private.assignment_part_max(p.id)::text, 'kind', m.kind, 'score', m.score::text, 'reason', m.reason,
        'scoring_revision', a.scoring_revision) order by p.position), '[]') into snapshot
        from public.assignment_parts p join public.assignment_marks m on m.assignment_id = p.assignment_id and m.part_id = p.id
          and m.annual_student_record_id = rec where p.assignment_id = target;
      insert into public.assignment_result_publications(academy_id, academic_year_id, assignment_id, annual_student_record_id, revision, total, max_score,
        work_status, marks, feedback, content_hash, published_by, scoring_revision)
        select a.academy_id, a.academic_year_id, target, rec, 1,
          (select coalesce(sum(m.score), 0) from public.assignment_marks m where m.assignment_id = target and m.annual_student_record_id = rec),
          edra_private.assignment_max(target), x.work_status, snapshot, x.feedback,
          md5(edra_private.assignment_result_content(target, rec)::text), auth.uid(), a.scoring_revision
        from public.assignment_recipients x where x.assignment_id = target and x.annual_student_record_id = rec
        returning id into publication;
      insert into public.assignment_result_effects(academy_id, assignment_id, annual_student_record_id, publication_id, effect_type)
        values (a.academy_id, target, rec, publication, 'result_published');
      update public.assignment_recipients set published_revision = 1 where assignment_id = target and annual_student_record_id = rec;
    end if;
    result := edra_private.assignment_student_overview(target, scope || jsonb_build_object('reason', 'submitted'));
  end if;

  insert into edra_private.assignment_online_requests(id, actor_id, assignment_id, record_id, payload, result)
    values (key, auth.uid(), target, rec, p_input, result);
  return result;
end $$;

-- Revocation and restoration of earned answer access, with reasons, kept as immutable history.
-- The latest event decides; restoring needs the qualifying work to remain valid.
create table public.assignment_answer_access_events (
  id uuid primary key,
  assignment_id uuid not null references public.assignments(id),
  record_id uuid not null references public.annual_student_records(id),
  action text not null check (action in ('revoke', 'restore')),
  reason text not null check (char_length(reason) between 1 and 1000 and reason = btrim(reason)),
  actor_id uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp()
);
create index assignment_answer_access_events_idx on public.assignment_answer_access_events(assignment_id, record_id, created_at desc);
alter table public.assignment_answer_access_events enable row level security;
revoke all on public.assignment_answer_access_events from public, anon, authenticated;
create trigger assignment_answer_access_history before update or delete on public.assignment_answer_access_events
  for each row execute function edra_private.reject_assignment_history_change();

create function edra_private.assignment_answer_work(p_assignment uuid, p_record uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.assignment_online_submissions where assignment_id = p_assignment and record_id = p_record)
    or exists (select 1 from public.assignment_recipients x join public.assignment_result_publications p
      on p.assignment_id = x.assignment_id and p.annual_student_record_id = x.annual_student_record_id and p.revision = x.published_revision
      where x.assignment_id = p_assignment and x.annual_student_record_id = p_record and p.work_status in ('submitted', 'late'));
$$;
create function edra_private.assignment_answer_revoked(p_assignment uuid, p_record uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select e.action = 'revoke' from public.assignment_answer_access_events e
    where e.assignment_id = p_assignment and e.record_id = p_record order by e.created_at desc, e.id desc limit 1), false);
$$;
-- Every answer surface (overview, unit page, playback authorization) goes through this check.
create or replace function edra_private.assignment_answer_qualified(p_assignment uuid, p_record uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select edra_private.assignment_answer_work(p_assignment, p_record) and not edra_private.assignment_answer_revoked(p_assignment, p_record);
$$;

create function public.get_assignment_answer_access(p_academy_id uuid, p_assignment_id uuid, p_record_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.assignments;
begin
  if edra_auth.session_allowed() is not true then raise exception 'forbidden'; end if;
  perform edra_private.require_assignment_role(p_academy_id, false);
  select * into a from public.assignments where id = p_assignment_id and academy_id = p_academy_id;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object(
    'hasAnswerVideos', exists (select 1 from public.content_units u join public.content_revisions v on v.unit_id = u.id and v.revision = u.published_revision
      cross join lateral jsonb_array_elements(v.document->'items') i
      where u.id = edra_private.assignment_unit(a.id) and i->>'kind' = 'answer' and i->>'assessmentKind' = 'assignment' and i->>'assessmentId' = a.id::text),
    'qualifyingWork', edra_private.assignment_answer_work(a.id, p_record_id),
    'revoked', edra_private.assignment_answer_revoked(a.id, p_record_id),
    'history', coalesce((select jsonb_agg(jsonb_build_object('action', e.action, 'reason', e.reason, 'createdAt', e.created_at,
      'actor', coalesce(nullif(btrim(pr.full_name), ''), 'Staff')) order by e.created_at desc, e.id desc)
      from public.assignment_answer_access_events e left join public.profiles pr on pr.id = e.actor_id
      where e.assignment_id = a.id and e.record_id = p_record_id), '[]'));
end $$;

-- Owner/Head Admin/Admin only. The retry key replays an identical request and rejects a different one.
create function public.change_assignment_answer_access(p_academy_id uuid, p_assignment_id uuid, p_record_id uuid,
  p_action text, p_reason text, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.assignments; previous public.assignment_answer_access_events; reason text := btrim(coalesce(p_reason, ''));
begin
  if edra_auth.session_allowed() is not true then raise exception 'forbidden'; end if;
  perform edra_private.require_assignment_role(p_academy_id, true);
  if p_request_id is null or p_action is null or p_action not in ('revoke', 'restore') or char_length(reason) not between 1 and 1000
    then raise exception 'validation'; end if;
  a := edra_private.lock_assignment_for_marking(p_academy_id, p_assignment_id);
  perform edra_private.require_open_assignment_year(a.academy_id, a.academic_year_id);
  select * into previous from public.assignment_answer_access_events where id = p_request_id;
  if found then
    if previous.actor_id <> auth.uid() or previous.assignment_id <> a.id or previous.record_id <> p_record_id
      or previous.action <> p_action or previous.reason <> reason then raise exception 'idempotency_conflict'; end if;
    return public.get_assignment_answer_access(p_academy_id, a.id, p_record_id);
  end if;
  -- The recipient row serializes access changes with submission and result publication.
  perform 1 from public.assignment_recipients where assignment_id = a.id and annual_student_record_id = p_record_id for update;
  if not edra_private.assignment_answer_work(a.id, p_record_id) then raise exception 'not_qualified'; end if;
  if (p_action = 'revoke') = edra_private.assignment_answer_revoked(a.id, p_record_id) then raise exception 'assignment_conflict'; end if;
  insert into public.assignment_answer_access_events(id, assignment_id, record_id, action, reason, actor_id)
    values (p_request_id, a.id, p_record_id, p_action, reason, auth.uid());
  return public.get_assignment_answer_access(p_academy_id, a.id, p_record_id);
end $$;

revoke all on function edra_private.assignment_answer_work(uuid, uuid), edra_private.assignment_answer_revoked(uuid, uuid),
  edra_private.assignment_answer_qualified(uuid, uuid), edra_private.assignment_editor_document(uuid, uuid),
  public.assignment_student_command(jsonb), public.get_assignment_answer_access(uuid, uuid, uuid),
  public.change_assignment_answer_access(uuid, uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.assignment_student_command(jsonb), public.get_assignment_answer_access(uuid, uuid, uuid),
  public.change_assignment_answer_access(uuid, uuid, uuid, text, text, uuid) to authenticated;

commit;
