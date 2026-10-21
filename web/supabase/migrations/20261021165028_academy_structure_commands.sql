-- EDRA-129: session-authorized structure reads, exact previews and retry-safe maintenance.
begin;

create function edra_private.structure_actor(p_academy uuid,p_manage boolean default false)
returns public.academy_role language plpgsql security definer set search_path='' as $$
declare r public.academy_role;
begin
  if auth.uid() is null or not edra_auth.session_allowed() then raise exception 'forbidden'; end if;
  r:=public.academy_role_for(p_academy);
  if r is null or (p_manage and r not in ('owner','head_admin','admin')) then raise exception 'forbidden'; end if;
  return r;
end $$;

-- Every academic/configuration table with a direct offering reference is included, irrespective
-- of archive state/year. A new such table is covered automatically. No cascade removes history.
create function edra_private.offering_dependencies(p_academy uuid,p_level text,p_track uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t record; amount bigint; result jsonb:='{}';
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relname not in ('academy_levels','global_levels')
      and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='academy_id' and not a.attisdropped)
      and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname=case when p_track is null then 'level_id' else 'track_id' end and not a.attisdropped)
    order by c.relname
  loop
    execute format('select count(*) from public.%I where academy_id=$1 and %I=$2::%s',t.relname,
      case when p_track is null then 'level_id' else 'track_id' end,
      case when p_track is null then 'text' else 'uuid' end)
      into amount using p_academy,case when p_track is null then p_level else p_track::text end;
    if amount>0 then result:=result||jsonb_build_object(t.relname,amount); end if;
  end loop;
  return result;
end $$;

-- Conservative exact comparison: includes related membership, records, attempts, schedules,
-- audiences, publications and configuration, not just an offering revision. Unrelated academy
-- changes can also require another review; missing a relevant change is never acceptable.
create function edra_private.offering_fingerprint(p_academy uuid,p_change jsonb)
returns text language plpgsql stable security definer set search_path='' as $$
declare t record; digest text; snapshot jsonb:=jsonb_build_object('change',p_change);
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
      and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='academy_id' and not a.attisdropped)
    order by c.relname
  loop
    execute format('select md5(coalesce(string_agg(row_value,chr(10) order by row_value),'''')) from (select to_jsonb(x)::text row_value from public.%I x where academy_id=$1) r',t.relname)
      into digest using p_academy;
    snapshot:=snapshot||jsonb_build_object(t.relname,digest);
  end loop;
  return md5(snapshot::text);
end $$;

create function edra_private.structure_json(p_academy uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('academyId',p_academy,'accountId',auth.uid(),'canManage',public.is_academy_manager(p_academy),
    'revision',coalesce((select revision from edra_private.offering_revisions where academy_id=p_academy),1),
    'levels',coalesce((select jsonb_agg(jsonb_build_object(
      'id',l.level_id,'name',g.name,'stoppedAt',l.stopped_at,'resumedAt',l.resumed_at,'version',l.version,
      'dependencies',edra_private.offering_dependencies(p_academy,l.level_id),
      'tracks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,
        'retiredAt',t.retired_at,'version',t.version) order by t.sort_order,t.id)
        from public.academy_tracks t where t.academy_id=p_academy and t.level_id=l.level_id),'[]'::jsonb)
      ) order by l.sort_order) from public.academy_levels l join public.global_levels g on g.id=l.level_id
      where l.academy_id=p_academy),'[]'::jsonb));
$$;

create function public.get_academy_structure(p_academy_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform edra_private.structure_actor(p_academy_id);
  return edra_private.structure_json(p_academy_id);
end $$;

create function edra_private.validate_offering_change(p_change jsonb)
returns void language plpgsql immutable set search_path='' as $$
begin
  if p_change is null or jsonb_typeof(p_change)<>'object'
    or p_change->>'operation' is null or p_change->>'operation' not in
      ('add_level','add_track','rename_track','remove_track','remove_level','stop_level','resume_level')
    or nullif(p_change->>'levelId','') is null
    or exists(select 1 from jsonb_object_keys(p_change) k where k not in ('operation','levelId','trackId','name'))
  then raise exception 'validation'; end if;
  if p_change->>'operation' in ('rename_track','remove_track') and (p_change->>'trackId')::uuid is null then raise exception 'validation'; end if;
  if p_change->>'operation' in ('add_track','rename_track') and
    char_length(btrim(coalesce(p_change->>'name',''))) not between 1 and 60 then raise exception 'validation'; end if;
end $$;

-- Impact has one stable snapshot. Blockers and dependency details are functional confirmation
-- feedback; final authority always recomputes them after taking the offering barrier.
create function edra_private.offering_impact(p_academy uuid,p_change jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l text:=p_change->>'levelId'; t uuid:=(p_change->>'trackId')::uuid; op text:=p_change->>'operation';
  y uuid; students bigint; groups_count bigint; schedules_count bigint; live bigint; attempts bigint;
  legacy_quizzes bigint; dependencies jsonb; blockers jsonb:='{}'; changes jsonb:='{}';
begin
  perform edra_private.validate_offering_change(p_change);
  select id into y from public.academic_years where academy_id=p_academy and closed_at is null;
  dependencies:=edra_private.offering_dependencies(p_academy,l,case when op='remove_track' then t end);
  select count(*) into students from public.annual_student_records r where r.academy_id=p_academy
    and r.academic_year_id=y and r.level_id=l and (t is null or r.track_id=t) and r.archived_at is null;
  select count(*) into groups_count from public.groups g where g.academy_id=p_academy
    and g.academic_year_id=y and g.level_id=l and (t is null or g.track_id=t) and g.archived_at is null;
  select count(*) into schedules_count from public.schedules s left join public.groups g on g.id=s.group_id
    where s.academy_id=p_academy and s.academic_year_id=y and s.archived_at is null
      and coalesce(s.level_id,g.level_id)=l and (t is null or coalesce(s.track_id,g.track_id)=t);
  select count(*) into live from public.sessions s where s.academy_id=p_academy and s.academic_year_id=y
    and s.level_id=l and (t is null or s.track_id=t) and s.state='live' and s.auto_end_at>statement_timestamp();
  select count(*) into attempts from (
    select a.id from public.exam_attempts a join public.exams z on z.id=a.exam_id
    join public.annual_student_records r on r.id=a.annual_student_record_id
    where z.academy_id=p_academy and z.academic_year_id=y and r.level_id=l
      and a.finalized_at is null and a.superseded_at is null
      and least(a.deadline_at,z.actual_closes_at)>statement_timestamp()
    union all
    select a.id from public.quiz_attempts a join public.quizzes z on z.id=a.quiz_id
    join public.annual_student_records r on r.id=a.annual_student_record_id
    where z.academy_id=p_academy and z.academic_year_id=y and r.level_id=l
      and a.finalized_at is null and a.superseded_at is null
      and least(a.deadline_at,z.actual_closes_at)>statement_timestamp()
  ) running;
  select count(*) into legacy_quizzes from public.quizzes q where q.academy_id=p_academy and q.academic_year_id=y
    and q.archived_at is null and (q.level_id=l and (t is null or q.track_id=t) or exists(
      select 1 from public.quiz_audience_groups x join public.groups g on g.id=x.group_id
      where x.quiz_id=q.id and g.level_id=l and (t is null or g.track_id=t)))
    and not exists(select 1 from public.content_assessments ca where ca.kind='quiz' and ca.assessment_id=q.id);
  if op='remove_level' then blockers:=dependencies;
  elsif op='stop_level' then
    if live>0 then blockers:=blockers||jsonb_build_object('liveSessions',live); end if;
    if attempts>0 then blockers:=blockers||jsonb_build_object('runningAttempts',attempts); end if;
    if legacy_quizzes>0 then blockers:=blockers||jsonb_build_object('unattachedQuizzes',legacy_quizzes); end if;
  elsif op='remove_track' and legacy_quizzes>0 then blockers:=jsonb_build_object('unattachedQuizzes',legacy_quizzes);
  end if;
  changes:=jsonb_build_object('students',students,'groups',groups_count,'schedules',schedules_count,
    'liveSessions',live,'runningAttempts',attempts,'unattachedQuizzes',legacy_quizzes);
  return jsonb_build_object('change',p_change,'revision',coalesce((select revision from edra_private.offering_revisions where academy_id=p_academy),1),
    'fingerprint',md5((edra_private.offering_fingerprint(p_academy,p_change)||changes::text)::text),
    'changes',changes,'blockers',blockers,'dependencies',dependencies,'academicYearId',y);
end $$;

create function public.preview_offering_change(p_academy_id uuid,p_change jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform edra_private.structure_actor(p_academy_id,true);
  return edra_private.offering_impact(p_academy_id,p_change);
end $$;

-- The transition integration is added by the next migration. This maintenance command deliberately
-- refuses multi-domain operations until that contract exists; UI release remains gated separately.
create function public.maintain_academy_offering(p_academy_id uuid,p_change jsonb,
  p_expected_revision bigint,p_fingerprint text,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare op text:=p_change->>'operation'; l text:=p_change->>'levelId'; t uuid:=(p_change->>'trackId')::uuid;
  payload jsonb; prior edra_private.offering_requests; impact jsonb; result jsonb; current_revision bigint;
begin
  -- EXCLUSIVE is always first; never upgrade a held SHARE barrier to EXCLUSIVE.
  perform pg_advisory_xact_lock(129,1);
  perform edra_private.structure_actor(p_academy_id,true);
  perform edra_private.validate_offering_change(p_change);
  if p_request_key is null or p_expected_revision is null or p_fingerprint is null then raise exception 'validation'; end if;
  payload:=jsonb_build_object('change',p_change,'revision',p_expected_revision,'fingerprint',p_fingerprint);
  select * into prior from edra_private.offering_requests where academy_id=p_academy_id
    and actor_id=auth.uid() and request_key=p_request_key;
  if found then
    if prior.payload<>payload then raise exception 'idempotency_conflict'; end if;
    return prior.result||jsonb_build_object('replayed',true);
  end if;
  insert into edra_private.offering_revisions(academy_id) values(p_academy_id) on conflict do nothing;
  select revision into current_revision from edra_private.offering_revisions where academy_id=p_academy_id for update;
  impact:=edra_private.offering_impact(p_academy_id,p_change);
  if current_revision<>p_expected_revision or impact->>'fingerprint'<>p_fingerprint then
    return jsonb_build_object('outcome','conflict','preview',impact);
  end if;
  if impact->'blockers'<>'{}'::jsonb then return jsonb_build_object('outcome','blocked','preview',impact); end if;
  if op='add_level' then
    if not exists(select 1 from public.global_levels where id=l and selectable) then raise exception 'validation'; end if;
    insert into public.academy_levels(academy_id,level_id,sort_order)
    select p_academy_id,l,coalesce(max(sort_order),0)+1 from public.academy_levels where academy_id=p_academy_id;
  elsif op='add_track' then
    perform edra_private.require_offering(p_academy_id,l);
    insert into public.academy_tracks(academy_id,level_id,name,sort_order)
    select p_academy_id,l,btrim(p_change->>'name'),coalesce(max(sort_order),-1)+1
    from public.academy_tracks where academy_id=p_academy_id and level_id=l returning id into t;
  elsif op='rename_track' then
    perform edra_private.require_offering(p_academy_id,l,t);
    update public.academy_tracks set name=btrim(p_change->>'name'),version=version+1
    where academy_id=p_academy_id and level_id=l and id=t;
    if not found then raise exception 'not_found'; end if;
  elsif op='remove_level' then
    delete from public.academy_levels where academy_id=p_academy_id and level_id=l;
    if not found then raise exception 'not_found'; end if;
  elsif op='resume_level' then
    update public.academy_levels set stopped_at=null,stopped_by=null,resumed_at=clock_timestamp(),
      resumed_by=auth.uid(),version=version+1 where academy_id=p_academy_id and level_id=l and stopped_at is not null;
    if not found then raise exception 'not_found'; end if;
  else raise exception 'transition_unavailable';
  end if;
  update edra_private.offering_revisions set revision=revision+1 where academy_id=p_academy_id;
  result:=jsonb_build_object('outcome','committed','trackId',t,'replayed',false,'structure',edra_private.structure_json(p_academy_id));
  insert into edra_private.offering_requests(academy_id,actor_id,request_key,payload,result)
  values(p_academy_id,auth.uid(),p_request_key,payload,result);
  return result;
end $$;

revoke all on function public.get_academy_structure(uuid),public.preview_offering_change(uuid,jsonb),
  public.maintain_academy_offering(uuid,jsonb,bigint,text,uuid) from public,anon,authenticated;
grant execute on function public.get_academy_structure(uuid),public.preview_offering_change(uuid,jsonb),
  public.maintain_academy_offering(uuid,jsonb,bigint,text,uuid) to authenticated;
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='edra_private' and p.proname in ('structure_actor','offering_dependencies','offering_fingerprint',
      'structure_json','validate_offering_change','offering_impact')
  loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature); end loop;
end $$;

commit;
