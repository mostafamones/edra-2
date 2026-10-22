-- EDRA-81: student web assignment journey (cookie session). New tables stay default-deny; every
-- student operation re-resolves the ordinary-session account, annual record and academy here.
begin;

-- Manager-controlled academy setting: in-person students may submit online (off by default).
create table public.assignment_online_settings (
  academy_id uuid primary key references public.academies(id),
  in_person_enabled boolean not null default false,
  version integer not null default 1 check (version >= 1),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

-- One online draft per student and assignment. source_selected marks the first accepted answer or
-- file: from then on online work is the student's active work source.
create table edra_private.assignment_online_drafts (
  assignment_id uuid not null references public.assignments(id),
  record_id uuid not null references public.annual_student_records(id),
  generation integer not null default 1 check (generation > 0),
  editor_token uuid not null,
  lease_until timestamptz not null,
  version integer not null default 0 check (version >= 0),
  answers jsonb not null default '{}' check (jsonb_typeof(answers) = 'object'),
  source_selected boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (assignment_id, record_id)
);

-- Exact retry receipts for mutating commands. The stored result commits with its write.
create table edra_private.assignment_online_requests (
  id uuid primary key,
  actor_id uuid not null references public.profiles(id),
  assignment_id uuid not null references public.assignments(id),
  record_id uuid not null references public.annual_student_records(id),
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

-- The accepted final online submission: an immutable snapshot of choices and file manifest.
create table public.assignment_online_submissions (
  id uuid primary key,
  assignment_id uuid not null references public.assignments(id),
  record_id uuid not null references public.annual_student_records(id),
  actor_id uuid not null references public.profiles(id),
  generation integer not null,
  draft_version integer not null,
  scoring_revision integer not null,
  answers jsonb not null,
  manifest jsonb not null,
  submitted_at timestamptz not null,
  late boolean not null,
  unique (assignment_id, record_id)
);

-- Written Work files. Bytes live in the private assignment-work bucket at storage_path.
create table public.assignment_work_files (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id),
  record_id uuid not null references public.annual_student_records(id),
  part_id uuid not null,
  actor_id uuid not null references public.profiles(id),
  generation integer not null,
  storage_path text not null unique,
  name text not null check (char_length(name) between 1 and 250),
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size integer not null check (size between 1 and 8388608),
  state text not null default 'pending' check (state in ('pending', 'complete', 'removed', 'cleaning', 'cleaned')),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  submission_id uuid references public.assignment_online_submissions(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (assignment_id, part_id) references public.assignment_parts(assignment_id, id),
  check (state <> 'complete' or (completed_at is not null and sha256 is not null)),
  check (submission_id is null or state = 'complete')
);
create index assignment_work_files_draft_idx on public.assignment_work_files(assignment_id, record_id, part_id, state);
create index assignment_work_files_submission_idx on public.assignment_work_files(submission_id) where submission_id is not null;

-- Earlier unannounced physical work replaced when online work became the active source.
create table public.assignment_physical_history (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id),
  record_id uuid not null references public.annual_student_records(id),
  recipient jsonb not null,
  marks jsonb not null,
  answers jsonb not null,
  superseded_at timestamptz not null default now()
);

alter table public.assignment_online_settings enable row level security;
alter table edra_private.assignment_online_drafts enable row level security;
alter table edra_private.assignment_online_requests enable row level security;
alter table public.assignment_online_submissions enable row level security;
alter table public.assignment_work_files enable row level security;
alter table public.assignment_physical_history enable row level security;
revoke all on public.assignment_online_settings, public.assignment_online_submissions, public.assignment_work_files,
  public.assignment_physical_history, edra_private.assignment_online_drafts, edra_private.assignment_online_requests
  from public, anon, authenticated;

create trigger assignment_online_submission_history before update or delete on public.assignment_online_submissions
  for each row execute function edra_private.reject_assignment_history_change();
create trigger assignment_physical_source_history before update or delete on public.assignment_physical_history
  for each row execute function edra_private.reject_assignment_history_change();
create trigger assignment_online_request_history before update or delete on edra_private.assignment_online_requests
  for each row execute function edra_private.reject_assignment_history_change();

-- Accepted files are academic history: never changed or deleted.
create function edra_private.guard_accepted_assignment_file() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.submission_id is not null then raise exception 'history_immutable'; end if;
  return coalesce(new, old);
end $$;
create trigger assignment_files_preserve_accepted before update or delete on public.assignment_work_files
  for each row execute function edra_private.guard_accepted_assignment_file();

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
  values ('assignment-work', 'assignment-work', false, 8388608, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do nothing;
-- No client Storage policies: uploads use server-issued signed upload URLs; reads use server signing.

-- The published unit an assignment belongs to, or null while standalone. A working (unpublished)
-- attachment is not authority: the published revision must contain the assignment.
create function edra_private.assignment_unit(p_assignment uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id from public.content_assessments l
    join public.content_units u on u.id = l.unit_id and u.state = 'published'
    join public.content_revisions v on v.unit_id = u.id and v.revision = u.published_revision
  where l.kind = 'assignment' and l.assessment_id = p_assignment
    and exists (select 1 from jsonb_array_elements(v.document->'items') i
      where i->>'kind' = 'assessment' and i->>'assessmentKind' = 'assignment' and i->>'assessmentId' = p_assignment::text);
$$;

-- Answer videos: an accepted online submission, or announced physical work received from the student.
create function edra_private.assignment_answer_qualified(p_assignment uuid, p_record uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.assignment_online_submissions where assignment_id = p_assignment and record_id = p_record)
    or exists (select 1 from public.assignment_recipients x join public.assignment_result_publications p
      on p.assignment_id = x.assignment_id and p.annual_student_record_id = x.annual_student_record_id and p.revision = x.published_revision
      where x.assignment_id = p_assignment and x.annual_student_record_id = p_record and p.work_status in ('submitted', 'late'));
$$;

-- Online work is activity: it locks structure and an existing content attachment.
create or replace function edra_private.assignment_has_activity(p_assignment_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.assignment_recipients r
      where r.assignment_id = p_assignment_id and (r.work_status <> 'expected' or r.published_revision > 0))
    or exists (select 1 from public.assignment_marks m where m.assignment_id = p_assignment_id)
    or exists (select 1 from edra_private.assignment_online_drafts d where d.assignment_id = p_assignment_id and d.source_selected);
$$;

-- Resolves the caller's annual record for an assignment and why online work is blocked (null = may
-- edit). Lock order: unit -> assignment -> record -> profile -> access account; writers then lock
-- the draft and recipient rows. Invisible assignments are not_found, whatever the reason.
create function edra_private.assignment_student_scope(p_academy uuid, p_assignment uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.assignments; r public.annual_student_records; profile public.academy_student_profiles;
  unit uuid; scope jsonb; record_id uuid; reason text; enabled boolean;
begin
  if auth.uid() is null or edra_auth.session_allowed() is not true then raise exception 'student_unavailable'; end if;
  if p_academy is null or p_assignment is null then raise exception 'not_found'; end if;
  perform edra_private.offering_gate();
  unit := edra_private.assignment_unit(p_assignment);
  if unit is not null then
    select jsonb_build_object('year', p.academic_year_id, 'level', p.level_id, 'track', p.track_id) into scope
      from public.content_units u join public.content_programs p on p.id = u.program_id
      where u.id = unit and u.academy_id = p_academy for share of u;
    if scope is null then raise exception 'not_found'; end if;
  end if;
  select * into a from public.assignments where id = p_assignment and academy_id = p_academy for share;
  if not found or a.state = 'archived' or not edra_private.assignment_ready(a.id) then raise exception 'not_found'; end if;
  record_id := edra_private.student_caller_record(a.academy_id, a.academic_year_id);
  if record_id is null then raise exception 'student_unavailable'; end if;
  select * into strict r from public.annual_student_records where id = record_id for share;
  select * into strict profile from public.academy_student_profiles where id = r.academy_student_profile_id for share;
  if profile.user_id is distinct from auth.uid() or edra_private.student_access_suspended(r, profile) then raise exception 'student_unavailable'; end if;
  if unit is not null and (scope->>'year' <> a.academic_year_id::text or scope->>'level' <> r.level_id
    or (scope->>'track' is not null and scope->>'track' is distinct from r.track_id::text)) then raise exception 'not_found'; end if;
  if not edra_private.assignment_matches_record(a, r)
    and not exists (select 1 from public.assignment_recipients where assignment_id = a.id and annual_student_record_id = r.id)
    and not exists (select 1 from edra_private.assignment_online_drafts d where d.assignment_id = a.id and d.record_id = r.id)
    then raise exception 'not_found'; end if;
  select s.in_person_enabled into enabled from public.assignment_online_settings s where s.academy_id = p_academy for share;
  if exists (select 1 from public.assignment_online_submissions s where s.assignment_id = a.id and s.record_id = r.id) then reason := 'submitted';
  elsif exists (select 1 from public.assignment_recipients x where x.assignment_id = a.id and x.annual_student_record_id = r.id and x.published_revision > 0) then reason := 'result_announced';
  elsif a.state <> 'active' or a.offering_closed_at is not null then reason := 'assignment_closed';
  elsif exists (select 1 from public.assignment_parts p where p.assignment_id = a.id and p.kind is null) then reason := 'online_unavailable';
  elsif not edra_private.assignment_matches_record(a, r) then reason := 'not_recipient';
  elsif r.participation_type = 'in_person' and not coalesce(enabled, false) then reason := 'in_person_disabled';
  elsif unit is not null then
    -- Current or expired, unrevoked explanation entitlement. The ledger's single current grant is
    -- authoritative: a revoked head never falls back to an older grant.
    perform 1 from public.content_access_accounts ca where ca.annual_record_id = r.id and ca.unit_id = unit for share;
    if edra_private.learning_state(r.id, unit)->>'status' not in ('active', 'expired') then reason := 'entitlement_required'; end if;
  end if;
  return jsonb_build_object('recordId', r.id, 'unitId', unit, 'reason', reason);
end $$;

-- Student-safe metadata: no questions, answers, keys, private marks or media URLs.
create function edra_private.assignment_student_overview(p_assignment uuid, p_scope jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', a.id, 'title', a.title, 'instructions', a.instructions, 'dueAt', a.due_at,
    'unit', (select jsonb_build_object('id', u.id, 'title', v.document->>'title') from public.content_units u
      join public.content_revisions v on v.unit_id = u.id and v.revision = u.published_revision where u.id = (p_scope->>'unitId')::uuid),
    'blockedReason', p_scope->'reason', 'canEdit', p_scope->>'reason' is null,
    'required', exists (select 1 from public.assignment_cohort_members m where m.assignment_id = a.id and m.cohort_revision = a.cohort_revision
      and m.annual_student_record_id = (p_scope->>'recordId')::uuid and m.requirement_ended_at is null),
    'started', exists (select 1 from edra_private.assignment_online_drafts d
      where d.assignment_id = a.id and d.record_id = (p_scope->>'recordId')::uuid and d.source_selected),
    'receipt', (select jsonb_build_object('submittedAt', s.submitted_at, 'late', s.late) from public.assignment_online_submissions s
      where s.assignment_id = a.id and s.record_id = (p_scope->>'recordId')::uuid),
    'result', (select jsonb_build_object('total', p.total::text, 'maxScore', p.max_score::text, 'feedback', p.feedback, 'publishedAt', p.published_at)
      from public.assignment_recipients x join public.assignment_result_publications p on p.assignment_id = x.assignment_id
        and p.annual_student_record_id = x.annual_student_record_id and p.revision = x.published_revision
      where x.assignment_id = a.id and x.annual_student_record_id = (p_scope->>'recordId')::uuid),
    'answerVideos', case when edra_private.assignment_answer_qualified(a.id, (p_scope->>'recordId')::uuid) then
      coalesce((select jsonb_agg(jsonb_build_object('id', i->>'id', 'title', i->>'title') order by ord)
        from public.content_units u join public.content_revisions v on v.unit_id = u.id and v.revision = u.published_revision
        cross join lateral jsonb_array_elements(v.document->'items') with ordinality items(i, ord)
        where u.id = (p_scope->>'unitId')::uuid and i->>'kind' = 'answer'
          and i->>'assessmentKind' = 'assignment' and i->>'assessmentId' = a.id::text), '[]'::jsonb)
      else '[]'::jsonb end)
  from public.assignments a where a.id = p_assignment;
$$;

create function public.get_my_assignment(p_academy_id uuid, p_assignment_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return edra_private.assignment_student_overview(p_assignment_id, edra_private.assignment_student_scope(p_academy_id, p_assignment_id));
end $$;

-- Standalone and published-unit assignments for the caller's open-year record; newest first.
-- Attached work follows its published unit's audience; unpublished attachments stay standalone.
create function public.list_my_assignments(p_academy_id uuid, p_offset integer default 0, p_search text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare year_id uuid; record_id uuid; r public.annual_student_records; a record; items jsonb := '[]'; more boolean := false; seen integer := 0;
begin
  if auth.uid() is null or edra_auth.session_allowed() is not true then raise exception 'student_unavailable'; end if;
  if p_offset is null or p_offset not between 0 and 100000 or char_length(coalesce(p_search, '')) > 100 then raise exception 'validation'; end if;
  select id into year_id from public.academic_years where academy_id = p_academy_id and closed_at is null;
  record_id := edra_private.student_caller_record(p_academy_id, year_id);
  if record_id is null then raise exception 'student_unavailable'; end if;
  select * into strict r from public.annual_student_records where id = record_id;
  for a in select x.id from public.assignments x
    where x.academy_id = p_academy_id and x.academic_year_id = year_id and x.state <> 'archived' and edra_private.assignment_ready(x.id)
      and (edra_private.assignment_matches_record(x, r)
        or exists (select 1 from public.assignment_recipients w where w.assignment_id = x.id and w.annual_student_record_id = r.id))
      and (coalesce(p_search, '') = '' or position(lower(btrim(p_search)) in lower(x.title)) > 0)
      and not exists (select 1 from public.content_units u join public.content_programs p on p.id = u.program_id
        where u.id = edra_private.assignment_unit(x.id) and (p.level_id <> r.level_id or (p.track_id is not null and p.track_id is distinct from r.track_id)))
    order by x.created_at desc, x.id limit 26 offset p_offset
  loop
    seen := seen + 1;
    if seen > 25 then more := true; exit; end if;
    items := items || (edra_private.assignment_student_overview(a.id, edra_private.assignment_student_scope(p_academy_id, a.id))
      - 'instructions' - 'answerVideos');
  end loop;
  return jsonb_build_object('items', items, 'hasMore', more);
end $$;

-- Online work becomes the active source. Earlier unannounced physical work is preserved as
-- history and removed from the live marks so it is never mixed into the online result.
create function edra_private.assignment_select_online(p_target public.assignments, p_record uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d edra_private.assignment_online_drafts; x public.assignment_recipients;
begin
  select * into strict d from edra_private.assignment_online_drafts where assignment_id = p_target.id and record_id = p_record for update;
  if d.source_selected then return; end if;
  perform edra_private.ensure_assignment_recipient(p_target, p_record);
  select * into strict x from public.assignment_recipients where assignment_id = p_target.id and annual_student_record_id = p_record for update;
  if x.published_revision > 0 then raise exception 'result_announced'; end if;
  if x.work_status <> 'expected' or exists (select 1 from public.assignment_marks m where m.assignment_id = p_target.id and m.annual_student_record_id = p_record) then
    insert into public.assignment_physical_history(assignment_id, record_id, recipient, marks, answers)
    select p_target.id, p_record, to_jsonb(x),
      coalesce((select jsonb_agg(to_jsonb(m)) from public.assignment_marks m where m.assignment_id = p_target.id and m.annual_student_record_id = p_record), '[]'),
      coalesce((select jsonb_agg(to_jsonb(q)) from public.assignment_question_answers q where q.assignment_id = p_target.id and q.annual_student_record_id = p_record), '[]');
    delete from public.assignment_question_answers where assignment_id = p_target.id and annual_student_record_id = p_record;
    delete from public.assignment_marks where assignment_id = p_target.id and annual_student_record_id = p_record;
    update public.assignment_recipients set work_status = 'expected', received_at = null, work_note = '', feedback = '',
      work_recorded_by = null, work_recorded_at = null, version = version + 1, updated_at = clock_timestamp()
      where assignment_id = p_target.id and annual_student_record_id = p_record;
  end if;
  update edra_private.assignment_online_drafts set source_selected = true where assignment_id = p_target.id and record_id = p_record;
end $$;

-- The editing document: ordered parts and their non-excluded questions (original numbers), the
-- caller's draft answers and draft files. Answer Sheet choices are letters only. No keys or marks.
create function edra_private.assignment_editor_document(p_assignment uuid, p_record uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('generation', d.generation, 'version', d.version, 'answers', d.answers, 'leaseUntil', d.lease_until,
    'scoringRevision', a.scoring_revision,
    'parts', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'instructions', p.instructions, 'kind', p.kind,
      'questions', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'number', q.position,
        'prompt', case when p.kind = 'online_questions' then q.prompt else '' end,
        'choices', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'position', c.position,
          'label', case when p.kind = 'online_questions' then c.label else '' end) order by c.position)
          from public.assignment_question_choices c where c.question_id = q.id), '[]')) order by q.position)
        from public.assignment_part_questions q where q.part_id = p.id and not q.excluded and p.kind <> 'file_upload'), '[]')) order by p.position)
      from public.assignment_parts p where p.assignment_id = a.id), '[]'),
    'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'partId', f.part_id, 'name', f.name, 'size', f.size, 'mime', f.mime, 'state', f.state)
      order by f.created_at, f.id) from public.assignment_work_files f
      where f.assignment_id = a.id and f.record_id = d.record_id and f.state in ('pending', 'complete')), '[]'))
  from edra_private.assignment_online_drafts d join public.assignments a on a.id = d.assignment_id
  where d.assignment_id = p_assignment and d.record_id = p_record;
$$;

-- All student editing operations. claim/renew/read need no key; every write needs a retry key, the
-- current editor token and generation; save and submit also need the acknowledged answers version.
create function public.assignment_student_command(p_input jsonb) returns jsonb
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
      or coalesce(p_input->>'mime', '') not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
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

-- Server-only content attestation (service role) after reading the uploaded bytes. It records the
-- digest; acceptance still happens through the student's fenced finish command.
create function public.attest_assignment_upload(p_file_id uuid, p_sha256 text, p_size integer, p_mime text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'validation'; end if;
  update public.assignment_work_files set sha256 = p_sha256
    where id = p_file_id and state = 'pending' and submission_id is null and size = p_size and mime = p_mime;
  if not found then raise exception 'file_unavailable'; end if;
end $$;

-- Bounded cleanup of the caller's unaccepted file objects. Returns up to 20 reserved paths; the
-- server deletes them from Storage and confirms. A crashed deletion is retried on a later call.
create function public.assignment_file_cleanup(p_academy_id uuid, p_assignment_id uuid, p_completed uuid[] default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare scope jsonb; rec uuid; result jsonb;
begin
  if cardinality(coalesce(p_completed, '{}')) > 20 then raise exception 'validation'; end if;
  scope := edra_private.assignment_student_scope(p_academy_id, p_assignment_id);
  rec := (scope->>'recordId')::uuid;
  update public.assignment_work_files set state = 'cleaned' where id = any(p_completed) and assignment_id = p_assignment_id
    and record_id = rec and submission_id is null and state = 'cleaning';
  update public.assignment_work_files set state = 'cleaning' where id in (
    select id from public.assignment_work_files where assignment_id = p_assignment_id and record_id = rec and submission_id is null
      and (state = 'removed' or (state = 'pending' and created_at < clock_timestamp() - interval '24 hours'))
    order by created_at, id limit 20 for update skip locked);
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'path', storage_path)), '[]') into result from (
    select id, storage_path from public.assignment_work_files where assignment_id = p_assignment_id and record_id = rec
      and state = 'cleaning' and submission_id is null order by created_at, id limit 20) x;
  return result;
end $$;

-- Question images of the caller's editing document (current editor only).
create function public.authorize_my_assignment_images(p_input jsonb, p_ids uuid[]) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare doc jsonb; ids uuid[];
begin
  if cardinality(p_ids) not between 1 and 20 then raise exception 'validation'; end if;
  doc := public.assignment_student_command(jsonb_build_object('operation', 'read', 'academyId', p_input->'academyId',
    'assignmentId', p_input->'assignmentId', 'token', p_input->'token', 'generation', p_input->'generation'));
  select array_agg(distinct m[1]::uuid) into ids
    from jsonb_array_elements(doc->'parts') p cross join lateral jsonb_array_elements(p->'questions') q
    cross join lateral regexp_matches((q->>'prompt') || ' ' || coalesce((select string_agg(c->>'label', ' ') from jsonb_array_elements(q->'choices') c), ''),
      '\{\{image:([0-9a-f-]{36})\}\}', 'g') m
    where m[1]::uuid = any(p_ids);
  return coalesce(ids, '{}');
end $$;

-- Staff may mark accepted online Written Work, never a draft or a separate physical source.
alter function edra_private.save_assignment_marks(uuid, uuid, uuid, text, integer, jsonb, uuid, uuid) rename to save_assignment_marks_before_online;
create function edra_private.save_assignment_marks(p_academy_id uuid, p_assignment_id uuid, p_record_id uuid, p_code text,
  p_expected_version integer, p_changes jsonb, p_key uuid, p_expected_record_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.assignments; r uuid;
begin
  perform edra_private.require_assignment_role(p_academy_id, false);
  a := edra_private.lock_assignment_for_marking(p_academy_id, p_assignment_id);
  r := coalesce(p_record_id, edra_private.resolve_assignment_code(a, p_code));
  if exists (select 1 from edra_private.assignment_online_drafts d where d.assignment_id = a.id and d.record_id = r and d.source_selected) then
    if not exists (select 1 from public.assignment_online_submissions s where s.assignment_id = a.id and s.record_id = r) then raise exception 'online_draft'; end if;
    -- Choice answers of online work are the student's own; only Written Work is staff-marked.
    if exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p_changes->'answers') = 'array' then p_changes->'answers' else '[]' end) v
        join public.assignment_part_questions q on q.id::text = v->>'question_id'
        join public.assignment_parts p on p.id = q.part_id where p.kind <> 'file_upload')
      or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p_changes->'marks') = 'array' then p_changes->'marks' else '[]' end) v
        join public.assignment_parts p on p.id::text = v->>'part_id' where p.kind <> 'file_upload')
      then raise exception 'source_locked'; end if;
  end if;
  return edra_private.save_assignment_marks_before_online(p_academy_id, p_assignment_id, p_record_id, p_code, p_expected_version, p_changes, p_key, p_expected_record_id);
end $$;

alter function edra_private.record_assignment_work(uuid, uuid, uuid, integer, public.assignment_work_status, timestamptz, text) rename to record_assignment_work_before_online;
create function edra_private.record_assignment_work(p_academy_id uuid, p_assignment_id uuid, p_record_id uuid, p_expected_version integer,
  p_status public.assignment_work_status, p_received_at timestamptz, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.require_assignment_role(p_academy_id, false);
  perform edra_private.lock_assignment_for_marking(p_academy_id, p_assignment_id);
  if exists (select 1 from edra_private.assignment_online_drafts where assignment_id = p_assignment_id and record_id = p_record_id and source_selected)
    then raise exception 'source_locked'; end if;
  return edra_private.record_assignment_work_before_online(p_academy_id, p_assignment_id, p_record_id, p_expected_version, p_status, p_received_at, p_note);
end $$;

alter function edra_private.publish_assignment_results(uuid, uuid, jsonb, uuid) rename to publish_assignment_results_before_online;
create function edra_private.publish_assignment_results(p_academy_id uuid, p_assignment_id uuid, p_items jsonb, p_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.require_assignment_role(p_academy_id, false);
  perform edra_private.lock_assignment_for_marking(p_academy_id, p_assignment_id);
  if jsonb_typeof(p_items) = 'array' and exists (select 1 from jsonb_array_elements(p_items) i join edra_private.assignment_online_drafts d
    on d.assignment_id = p_assignment_id and d.record_id::text = i->>'annual_student_record_id' and d.source_selected
    where not exists (select 1 from public.assignment_online_submissions s where s.assignment_id = d.assignment_id and s.record_id = d.record_id))
    then raise exception 'online_draft'; end if;
  return edra_private.publish_assignment_results_before_online(p_academy_id, p_assignment_id, p_items, p_key);
end $$;

-- Manager setting: read for any staff member; change for Owner/Head Admin/Admin.
create function public.assignment_online_setting(p_academy_id uuid, p_enabled boolean default null, p_version integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.assignment_online_settings;
begin
  if edra_auth.session_allowed() is not true then raise exception 'forbidden'; end if;
  perform edra_private.require_assignment_role(p_academy_id, p_enabled is not null);
  if p_enabled is not null then
    insert into public.assignment_online_settings(academy_id) values (p_academy_id) on conflict do nothing;
    select * into strict s from public.assignment_online_settings where academy_id = p_academy_id for update;
    if p_version is distinct from s.version then raise exception 'assignment_conflict'; end if;
    update public.assignment_online_settings set in_person_enabled = p_enabled, version = version + 1, updated_by = auth.uid(), updated_at = clock_timestamp()
      where academy_id = p_academy_id;
  end if;
  select * into s from public.assignment_online_settings where academy_id = p_academy_id;
  return jsonb_build_object('enabled', coalesce(s.in_person_enabled, false), 'version', coalesce(s.version, 1));
end $$;

-- Accepted online files for staff review. Drafts are never listed.
create function public.list_assignment_received_files(p_academy_id uuid, p_assignment_id uuid, p_record_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if edra_auth.session_allowed() is not true then raise exception 'forbidden'; end if;
  perform edra_private.require_assignment_role(p_academy_id, false);
  if not exists (select 1 from public.assignments where id = p_assignment_id and academy_id = p_academy_id) then raise exception 'not_found'; end if;
  return jsonb_build_object('submittedAt', (select s.submitted_at from public.assignment_online_submissions s
      where s.assignment_id = p_assignment_id and s.record_id = p_record_id),
    'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'partId', f.part_id, 'name', f.name, 'size', f.size, 'mime', f.mime)
      order by f.created_at, f.id) from public.assignment_work_files f
      where f.assignment_id = p_assignment_id and f.record_id = p_record_id and f.submission_id is not null), '[]'));
end $$;

create function public.authorize_assignment_received_file(p_academy_id uuid, p_file_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if edra_auth.session_allowed() is not true then raise exception 'forbidden'; end if;
  perform edra_private.require_assignment_role(p_academy_id, false);
  select jsonb_build_object('path', f.storage_path, 'name', f.name, 'mime', f.mime) into result from public.assignment_work_files f
    join public.assignments a on a.id = f.assignment_id and a.academy_id = p_academy_id
    where f.id = p_file_id and f.submission_id is not null;
  if result is null then raise exception 'not_found'; end if;
  return result;
end $$;

-- Answer videos: playback for qualified assignment work through the existing signing path. Other
-- materials keep their explanation-access rules.
alter function public.authorize_content_material(uuid, uuid, uuid) rename to authorize_content_material_before_assignments;
create function public.authorize_content_material(p_academy_id uuid, p_unit_id uuid, p_item_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare scope jsonb; item jsonb; asset public.content_assets;
begin
  scope := edra_private.learning_student(p_academy_id, p_unit_id);
  select value into item from jsonb_array_elements(scope->'document'->'items') where value->>'id' = p_item_id::text;
  if item->>'kind' is distinct from 'answer' then return public.authorize_content_material_before_assignments(p_academy_id, p_unit_id, p_item_id); end if;
  if item->>'assessmentKind' <> 'assignment' or edra_private.assignment_unit((item->>'assessmentId')::uuid) is distinct from p_unit_id
    or not edra_private.assignment_answer_qualified((item->>'assessmentId')::uuid, (scope->>'record')::uuid)
    then raise exception 'material_unavailable'; end if;
  select * into asset from public.content_assets where id = (item->>'assetId')::uuid and academy_id = p_academy_id
    and status = 'ready' and deletion_token is null for share;
  if not found or asset.kind = 'document' or asset.playback_id is null then raise exception 'material_unavailable'; end if;
  return jsonb_build_object('kind', asset.kind, 'playbackId', asset.playback_id, 'storagePath', null,
    'expiresAt', clock_timestamp() + interval '15 minutes');
end $$;

-- The unit page links its attached assignment and marks qualified answer videos available,
-- independently of explanation access.
alter function public.get_my_content_unit(uuid, uuid) rename to get_my_content_unit_before_assignments;
create function public.get_my_content_unit(p_academy_id uuid, p_unit_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare scope jsonb; doc jsonb; items jsonb;
begin
  scope := edra_private.learning_student(p_academy_id, p_unit_id);
  doc := public.get_my_content_unit_before_assignments(p_academy_id, p_unit_id);
  select coalesce(jsonb_agg(x.item || case when i->>'assessmentKind' = 'assignment' and i->>'kind' in ('assessment', 'answer') then
      jsonb_build_object('assessmentId', i->>'assessmentId', 'available', case when i->>'kind' = 'assessment' then true
        else edra_private.assignment_answer_qualified((i->>'assessmentId')::uuid, (scope->>'record')::uuid) end)
      else '{}'::jsonb end order by x.ord), '[]') into items
    from jsonb_array_elements(doc->'items') with ordinality x(item, ord)
    join lateral (select value i from jsonb_array_elements(scope->'document'->'items') where value->>'id' = x.item->>'id') original on true;
  return doc || jsonb_build_object('items', items);
end $$;

revoke all on function
  edra_private.guard_accepted_assignment_file(), edra_private.assignment_unit(uuid), edra_private.assignment_answer_qualified(uuid, uuid),
  edra_private.assignment_has_activity(uuid), edra_private.assignment_student_scope(uuid, uuid), edra_private.assignment_student_overview(uuid, jsonb),
  edra_private.assignment_select_online(public.assignments, uuid), edra_private.assignment_editor_document(uuid, uuid),
  edra_private.save_assignment_marks(uuid, uuid, uuid, text, integer, jsonb, uuid, uuid),
  edra_private.save_assignment_marks_before_online(uuid, uuid, uuid, text, integer, jsonb, uuid, uuid),
  edra_private.record_assignment_work(uuid, uuid, uuid, integer, public.assignment_work_status, timestamptz, text),
  edra_private.record_assignment_work_before_online(uuid, uuid, uuid, integer, public.assignment_work_status, timestamptz, text),
  edra_private.publish_assignment_results(uuid, uuid, jsonb, uuid), edra_private.publish_assignment_results_before_online(uuid, uuid, jsonb, uuid),
  public.get_my_assignment(uuid, uuid), public.list_my_assignments(uuid, integer, text), public.assignment_student_command(jsonb),
  public.attest_assignment_upload(uuid, text, integer, text), public.assignment_file_cleanup(uuid, uuid, uuid[]),
  public.authorize_my_assignment_images(jsonb, uuid[]), public.assignment_online_setting(uuid, boolean, integer),
  public.list_assignment_received_files(uuid, uuid, uuid), public.authorize_assignment_received_file(uuid, uuid),
  public.authorize_content_material(uuid, uuid, uuid), public.authorize_content_material_before_assignments(uuid, uuid, uuid),
  public.get_my_content_unit(uuid, uuid), public.get_my_content_unit_before_assignments(uuid, uuid)
  from public, anon, authenticated;
grant execute on function
  public.get_my_assignment(uuid, uuid), public.list_my_assignments(uuid, integer, text), public.assignment_student_command(jsonb),
  public.assignment_file_cleanup(uuid, uuid, uuid[]), public.authorize_my_assignment_images(jsonb, uuid[]),
  public.assignment_online_setting(uuid, boolean, integer), public.list_assignment_received_files(uuid, uuid, uuid),
  public.authorize_assignment_received_file(uuid, uuid), public.authorize_content_material(uuid, uuid, uuid), public.get_my_content_unit(uuid, uuid)
  to authenticated;
revoke all on function public.attest_assignment_upload(uuid, text, integer, text) from service_role;
grant execute on function public.attest_assignment_upload(uuid, text, integer, text) to service_role;

commit;
