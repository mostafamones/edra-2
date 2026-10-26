-- Learning activity is separate from entitlement and official assessment work.
begin;
alter table public.content_assets add column duration_seconds numeric
  check (duration_seconds > 0 and duration_seconds <= 43200);

create table edra_private.content_video_progress (
  annual_record_id uuid not null references public.annual_student_records(id),
  unit_id uuid not null references public.content_units(id),
  asset_id uuid not null references public.content_assets(id),
  watched nummultirange not null default '{}'::nummultirange,
  position_seconds numeric not null default 0 check (position_seconds >= 0),
  resume_session uuid,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (annual_record_id, unit_id, asset_id)
);
create table edra_private.content_progress_sessions (
  id uuid primary key default gen_random_uuid(),
  annual_record_id uuid not null,
  unit_id uuid not null,
  asset_id uuid not null,
  item_id uuid not null,
  sequence integer not null default 0,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (annual_record_id,unit_id,asset_id)
    references edra_private.content_video_progress(annual_record_id,unit_id,asset_id)
);
alter table edra_private.content_video_progress enable row level security;
alter table edra_private.content_progress_sessions enable row level security;
revoke all on edra_private.content_video_progress,edra_private.content_progress_sessions from public,anon,authenticated;

create function edra_private.content_watched(p_ranges nummultirange) returns numeric
language sql immutable set search_path='' as $$
  select coalesce(sum(upper(r)-lower(r)),0) from unnest(p_ranges) r;
$$;

create function public.start_my_content_progress(p_academy_id uuid,p_unit_id uuid,p_item_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare scope jsonb; item jsonb; asset public.content_assets; record_id uuid; session_id uuid:=gen_random_uuid();
  progress edra_private.content_video_progress;
begin
  -- Identical live access and answer qualification checks to playback authorization.
  perform public.authorize_content_material(p_academy_id,p_unit_id,p_item_id);
  scope:=edra_private.learning_student(p_academy_id,p_unit_id);
  record_id:=(scope->>'record')::uuid;
  select value into item from jsonb_array_elements(scope->'document'->'items') where value->>'id'=p_item_id::text;
  select * into asset from public.content_assets where id=(item->>'assetId')::uuid and academy_id=p_academy_id;
  if asset.kind is distinct from 'video' then raise exception 'material_unavailable'; end if;
  insert into edra_private.content_video_progress(annual_record_id,unit_id,asset_id,resume_session)
    values(record_id,p_unit_id,asset.id,session_id)
    on conflict(annual_record_id,unit_id,asset_id) do update set resume_session=excluded.resume_session
    returning * into progress;
  insert into edra_private.content_progress_sessions(id,annual_record_id,unit_id,asset_id,item_id)
    values(session_id,record_id,p_unit_id,asset.id,p_item_id);
  return jsonb_build_object('sessionId',session_id,'assetId',asset.id,'providerAssetId',asset.provider_asset_id,
    'durationSeconds',asset.duration_seconds,'positionSeconds',progress.position_seconds);
end $$;

create function public.save_my_content_progress(p_academy_id uuid,p_unit_id uuid,p_session_id uuid,p_sequence integer,p_position numeric,p_ranges jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare scope jsonb; session edra_private.content_progress_sessions; progress edra_private.content_video_progress;
  item jsonb; part jsonb; coverage nummultirange:='{}'; duration numeric; lower_bound numeric; upper_bound numeric;
begin
  scope:=edra_private.learning_student(p_academy_id,p_unit_id);
  select * into session from edra_private.content_progress_sessions where id=p_session_id
    and annual_record_id=(scope->>'record')::uuid and unit_id=p_unit_id for update;
  if not found then raise exception 'material_unavailable'; end if;
  perform public.authorize_content_material(p_academy_id,p_unit_id,session.item_id);
  select value into item from jsonb_array_elements(scope->'document'->'items') where value->>'id'=session.item_id::text;
  if (item->>'assetId')::uuid is distinct from session.asset_id then raise exception 'content_conflict'; end if;
  select duration_seconds into duration from public.content_assets where id=session.asset_id;
  if duration is null then raise exception 'progress_unavailable'; end if;
  if p_sequence is null or p_sequence<1 or p_position is null or p_position<0 or p_position>duration
    or p_position::text in ('NaN','Infinity','-Infinity')
    or jsonb_typeof(p_ranges) is distinct from 'array' or jsonb_array_length(p_ranges)>100 then raise exception 'validation'; end if;
  for part in select value from jsonb_array_elements(p_ranges) loop
    if jsonb_typeof(part) is distinct from 'array' or jsonb_array_length(part)<>2
      or jsonb_typeof(part->0) is distinct from 'number' or jsonb_typeof(part->1) is distinct from 'number' then raise exception 'validation'; end if;
    lower_bound:=(part->>0)::numeric; upper_bound:=(part->>1)::numeric;
    if lower_bound<0 or upper_bound>duration or lower_bound>=upper_bound then raise exception 'validation'; end if;
    coverage:=coverage+nummultirange(numrange(lower_bound,upper_bound,'[)'));
  end loop;
  select * into strict progress from edra_private.content_video_progress where annual_record_id=session.annual_record_id
    and unit_id=p_unit_id and asset_id=session.asset_id for update;
  if p_sequence>session.sequence then
    update edra_private.content_video_progress set watched=watched+coverage,
      position_seconds=case when resume_session=p_session_id then p_position else position_seconds end,
      updated_at=clock_timestamp()
      where annual_record_id=session.annual_record_id and unit_id=p_unit_id and asset_id=session.asset_id returning * into progress;
    update edra_private.content_progress_sessions set sequence=p_sequence where id=p_session_id;
  end if;
  return jsonb_build_object('positionSeconds',progress.position_seconds,'watchedSeconds',edra_private.content_watched(progress.watched),
    'durationSeconds',duration,'completed',edra_private.content_watched(progress.watched)>=duration*0.9);
end $$;

create function edra_private.content_unit_progress(p_unit uuid,p_record uuid,p_document jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare item jsonb; result jsonb:='[]'; done boolean; total integer:=0; completed integer:=0;
  progress edra_private.content_video_progress; duration numeric; watched numeric;
begin
  for item in select value from jsonb_array_elements(p_document->'items') loop
    done:=false;
    if item->>'kind'='explanation' then
      total:=total+1;
      select * into progress from edra_private.content_video_progress where annual_record_id=p_record and unit_id=p_unit and asset_id=(item->>'assetId')::uuid;
      select duration_seconds into duration from public.content_assets where id=(item->>'assetId')::uuid;
      watched:=edra_private.content_watched(coalesce(progress.watched,'{}'::nummultirange));
      done:=coalesce(watched>=duration*0.9,false);
      result:=result||jsonb_build_array(jsonb_build_object('itemId',item->>'id','completed',done,
        'watchedSeconds',watched,'durationSeconds',duration,'positionSeconds',coalesce(progress.position_seconds,0)));
    elsif item->>'kind'='assessment' then
      total:=total+1;
      if item->>'assessmentKind'='assignment' then
        done:=exists(select 1 from public.assignment_recipients r where r.assignment_id=(item->>'assessmentId')::uuid
          and r.annual_student_record_id=p_record and r.work_status in ('submitted','late') and r.received_at is not null);
      elsif item->>'assessmentKind'='quiz' then
        done:=exists(select 1 from public.quiz_submissions s where s.quiz_id=(item->>'assessmentId')::uuid and s.annual_student_record_id=p_record);
      elsif item->>'assessmentKind'='exam' then
        done:=exists(select 1 from public.exam_submissions s where s.exam_id=(item->>'assessmentId')::uuid and s.annual_student_record_id=p_record);
      end if;
      result:=result||jsonb_build_array(jsonb_build_object('itemId',item->>'id','completed',done));
    end if;
    if done then completed:=completed+1; end if;
  end loop;
  return jsonb_build_object('items',result,'completed',completed,'total',total);
end $$;

-- Decorate existing authoritative projections without changing their eligibility or pagination.
alter function public.get_my_content_unit(uuid,uuid) rename to get_my_content_unit_before_progress;
create function public.get_my_content_unit(p_academy_id uuid,p_unit_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; scope jsonb;
begin
 result:=public.get_my_content_unit_before_progress(p_academy_id,p_unit_id);
 scope:=edra_private.learning_student(p_academy_id,p_unit_id);
 return result||jsonb_build_object('progress',edra_private.content_unit_progress(p_unit_id,(scope->>'record')::uuid,scope->'document'));
end $$;
alter function public.list_my_content_units(uuid,integer,integer,text) rename to list_my_content_units_before_progress;
create function public.list_my_content_units(p_academy_id uuid,p_offset integer default 0,p_limit integer default 24,p_search text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; items jsonb; record_id uuid; year_id uuid;
begin
 result:=public.list_my_content_units_before_progress(p_academy_id,p_offset,p_limit,p_search);
 select id into year_id from public.academic_years where academy_id=p_academy_id and closed_at is null;
 record_id:=edra_private.student_caller_record(p_academy_id,year_id);
 select coalesce(jsonb_agg(x.item||jsonb_build_object('progress',edra_private.content_unit_progress(u.id,record_id,v.document)) order by x.ord),'[]') into items
 from jsonb_array_elements(result->'units') with ordinality x(item,ord)
 join public.content_units u on u.id=(x.item->>'id')::uuid
 join public.content_revisions v on v.unit_id=u.id and v.revision=u.published_revision;
 return result||jsonb_build_object('units',items);
end $$;

revoke all on function edra_private.content_watched(nummultirange),edra_private.content_unit_progress(uuid,uuid,jsonb),
 public.get_my_content_unit_before_progress(uuid,uuid),public.list_my_content_units_before_progress(uuid,integer,integer,text),
 public.start_my_content_progress(uuid,uuid,uuid),public.save_my_content_progress(uuid,uuid,uuid,integer,numeric,jsonb),
 public.get_my_content_unit(uuid,uuid),public.list_my_content_units(uuid,integer,integer,text) from public,anon,authenticated;
grant execute on function public.start_my_content_progress(uuid,uuid,uuid),public.save_my_content_progress(uuid,uuid,uuid,integer,numeric,jsonb),
 public.get_my_content_unit(uuid,uuid),public.list_my_content_units(uuid,integer,integer,text) to authenticated;
commit;
