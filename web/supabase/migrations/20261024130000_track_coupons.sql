-- EDRA-252: new track/type coupons. Legacy code tables/history are untouched.
begin;

create table public.content_coupon_types (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id),
  program_id uuid not null references public.content_programs(id),
  academic_year_id uuid not null,
  level_id text not null,
  track_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(),
  unique (academy_id,id),
  foreign key (academy_id,academic_year_id) references public.academic_years(academy_id,id),
  foreign key (academy_id,level_id) references public.academy_levels(academy_id,level_id),
  foreign key (academy_id,level_id,track_id) references public.academy_tracks(academy_id,level_id,id)
);
create unique index content_coupon_type_name on public.content_coupon_types(academy_id,academic_year_id,level_id,
  coalesce(track_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(btrim(name)));
create table public.content_coupon_batches (
  id uuid primary key,
  academy_id uuid not null,
  type_id uuid not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(),
  quantity integer not null check (quantity between 1 and 1000),
  unique (academy_id,type_id,id),
  foreign key (academy_id,type_id) references public.content_coupon_types(academy_id,id)
);
create table public.content_coupons (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  type_id uuid not null,
  batch_id uuid not null,
  code text not null check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id),
  unique (academy_id,code),
  unique (academy_id,id),
  foreign key (academy_id,type_id,batch_id) references public.content_coupon_batches(academy_id,type_id,id),
  check ((revoked_at is null)=(revoked_by is null))
);
create table public.content_coupon_redemptions (
  coupon_id uuid primary key references public.content_coupons(id),
  annual_record_id uuid not null references public.annual_student_records(id),
  unit_id uuid not null references public.content_units(id),
  grant_id uuid not null unique references public.content_access_grants(id),
  redeemed_at timestamptz not null default clock_timestamp(),
  unique (annual_record_id,unit_id)
);
create table edra_private.content_coupon_attempts (
  academy_id uuid not null references public.academies(id),
  actor_id uuid not null references public.profiles(id),
  window_start timestamptz not null,
  attempts integer not null,
  primary key (academy_id,actor_id)
);

alter table public.content_coupon_types enable row level security;
alter table public.content_coupon_batches enable row level security;
alter table public.content_coupons enable row level security;
alter table public.content_coupon_redemptions enable row level security;
alter table edra_private.content_coupon_attempts enable row level security;
revoke all on public.content_coupon_types,public.content_coupon_batches,public.content_coupons,public.content_coupon_redemptions,
  edra_private.content_coupon_attempts from public,anon,authenticated;
create trigger content_coupon_redemption_history before update or delete on public.content_coupon_redemptions
  for each row execute function edra_private.content_access_immutable();
create trigger content_coupon_batch_history before update or delete on public.content_coupon_batches
  for each row execute function edra_private.content_access_immutable();

create function edra_private.coupon_program(p_academy uuid,p_program uuid) returns public.content_programs
language plpgsql security definer set search_path='' as $$
declare p public.content_programs;
begin
  select * into p from public.content_programs where id=p_program and academy_id=p_academy for share;
  if not found then raise exception 'validation'; end if;
  perform 1 from public.academic_years where id=p.academic_year_id and academy_id=p_academy and closed_at is null for share;
  if not found then raise exception 'year_closed'; end if;
  perform edra_private.require_offering(p.academy_id,p.level_id,p.track_id);
  return p;
end $$;

create function public.create_content_coupon_type(p_academy_id uuid,p_program_id uuid,p_name text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare payload jsonb; retry jsonb; result jsonb; p public.content_programs;
begin
  perform edra_private.offering_gate();
  perform edra_private.learning_actor(p_academy_id);
  p:=edra_private.coupon_program(p_academy_id,p_program_id);
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then raise exception 'validation'; end if;
  payload:=jsonb_build_object('program',p_program_id,'name',btrim(p_name));
  retry:=edra_private.learning_retry(p_request_id,p_academy_id,'coupon_type',payload);
  if retry is not null then return retry; end if;
  begin
    insert into public.content_coupon_types(id,academy_id,program_id,academic_year_id,level_id,track_id,name,created_by)
      values(p_request_id,p_academy_id,p_program_id,p.academic_year_id,p.level_id,p.track_id,btrim(p_name),auth.uid());
  exception when unique_violation then raise exception 'coupon_type_exists'; end;
  result:=jsonb_build_object('id',p_request_id);
  return edra_private.learning_receipt(p_request_id,p_academy_id,'coupon_type',payload,result);
end $$;

create function edra_private.new_coupon_code() returns text
language plpgsql volatile set search_path='' as $$
declare alphabet constant text:='ABCDEFGHJKMNPQRSTUVWXYZ23456789'; result text:=''; b integer;
begin
  -- Rejection sampling keeps all 31 symbols equally likely.
  while length(result)<8 loop
    b:=get_byte(extensions.gen_random_bytes(1),0);
    if b<248 then result:=result||substr(alphabet,(b%31)+1,1); end if;
  end loop;
  return result;
end $$;

create function public.generate_content_coupons(p_academy_id uuid,p_type_id uuid,p_quantity integer,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.content_coupon_types; payload jsonb; retry jsonb; result jsonb; i integer; collisions integer;
begin
  perform edra_private.offering_gate();
  perform edra_private.learning_actor(p_academy_id);
  select * into t from public.content_coupon_types where id=p_type_id and academy_id=p_academy_id for share;
  if not found then raise exception 'validation'; end if;
  perform edra_private.coupon_program(p_academy_id,t.program_id);
  perform edra_private.require_offering(t.academy_id,t.level_id,t.track_id);
  if p_quantity is null or p_quantity not between 1 and 1000 then raise exception 'validation'; end if;
  payload:=jsonb_build_object('type',p_type_id,'quantity',p_quantity);
  retry:=edra_private.learning_retry(p_request_id,p_academy_id,'coupon_generate',payload);
  if retry is not null then return retry; end if;
  insert into public.content_coupon_batches(id,academy_id,type_id,created_by,quantity)
    values(p_request_id,p_academy_id,p_type_id,auth.uid(),p_quantity);
  for i in 1..p_quantity loop
    collisions:=0;
    loop
      begin
        insert into public.content_coupons(academy_id,type_id,batch_id,code)
          values(p_academy_id,p_type_id,p_request_id,edra_private.new_coupon_code());
        exit;
      exception when unique_violation then
        collisions:=collisions+1;
        if collisions>=32 then raise exception 'unavailable'; end if;
      end;
    end loop;
  end loop;
  select jsonb_build_object('batchId',p_request_id,'codes',jsonb_agg(jsonb_build_object('id',id,'code',code) order by id))
    into result from public.content_coupons where batch_id=p_request_id;
  return edra_private.learning_receipt(p_request_id,p_academy_id,'coupon_generate',payload,result);
end $$;

create function public.revoke_content_coupon(p_academy_id uuid,p_coupon_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.content_coupons; payload jsonb; retry jsonb; result jsonb;
begin
  perform edra_private.offering_gate();
  perform edra_private.learning_actor(p_academy_id,true);
  payload:=jsonb_build_object('coupon',p_coupon_id);
  retry:=edra_private.learning_retry(p_request_id,p_academy_id,'coupon_revoke',payload);
  if retry is not null then return retry; end if;
  select * into c from public.content_coupons where id=p_coupon_id and academy_id=p_academy_id for update;
  if not found or exists(select 1 from public.content_coupon_redemptions where coupon_id=c.id) then raise exception 'code_unavailable'; end if;
  perform edra_private.coupon_program(p_academy_id,(select program_id from public.content_coupon_types where id=c.type_id));
  update public.content_coupons set revoked_at=coalesce(revoked_at,clock_timestamp()),revoked_by=coalesce(revoked_by,auth.uid()) where id=c.id;
  result:=jsonb_build_object('revoked',true);
  return edra_private.learning_receipt(p_request_id,p_academy_id,'coupon_revoke',payload,result);
end $$;

create function public.redeem_content_coupon(p_academy_id uuid,p_unit_id uuid,p_code text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare scope jsonb; payload jsonb; retry jsonb; result jsonb; record_id uuid; c public.content_coupons; t public.content_coupon_types;
  program_id uuid; normalized text; attempt_count integer;
begin
  perform edra_private.offering_gate();
  scope:=edra_private.learning_student(p_academy_id,p_unit_id);
  record_id:=(scope->>'record')::uuid;
  normalized:=upper(regexp_replace(coalesce(p_code,''),'[[:space:]-]','','g'));
  payload:=jsonb_build_object('unit',p_unit_id,'code',normalized);
  retry:=edra_private.learning_retry(p_request_id,p_academy_id,'coupon_redeem',payload);
  if retry is not null then return retry; end if;
  insert into edra_private.content_coupon_attempts(academy_id,actor_id,window_start,attempts)
    values(p_academy_id,auth.uid(),clock_timestamp(),1)
    on conflict(academy_id,actor_id) do update set
      attempts=case when content_coupon_attempts.window_start<=clock_timestamp()-interval '10 minutes' then 1 else content_coupon_attempts.attempts+1 end,
      window_start=case when content_coupon_attempts.window_start<=clock_timestamp()-interval '10 minutes' then clock_timestamp() else content_coupon_attempts.window_start end
    returning attempts into attempt_count;
  if attempt_count>20 then return jsonb_build_object('error','coupon_rate_limited'); end if;
  -- Business denials are returned, not raised outside this subtransaction: the
  -- throttle survives a failed attempt while code/grant mutations roll back.
  begin
    if normalized !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$' then raise exception 'code_unavailable'; end if;
    insert into public.content_access_accounts(academy_id,academic_year_id,annual_record_id,unit_id)
      values(p_academy_id,(scope->>'year')::uuid,record_id,p_unit_id) on conflict do nothing;
    perform 1 from public.content_access_accounts where annual_record_id=record_id and unit_id=p_unit_id for update;
    select * into c from public.content_coupons where academy_id=p_academy_id and code=normalized for update;
    if not found or c.revoked_at is not null or exists(select 1 from public.content_coupon_redemptions where coupon_id=c.id) then raise exception 'code_unavailable'; end if;
    select * into strict t from public.content_coupon_types where id=c.type_id;
    select u.program_id into strict program_id from public.content_units u where u.id=p_unit_id;
    if t.academic_year_id<>(scope->>'year')::uuid or t.level_id<>scope->>'level'
      or t.track_id is distinct from (scope->>'track')::uuid
      or (scope->'document'->>'couponTypeId')::uuid is distinct from t.id then raise exception 'coupon_type_mismatch'; end if;
    -- Serialize both the new and legacy redemption paths for this student/unit.
    perform pg_advisory_xact_lock(hashtextextended('learning-coupon:'||record_id::text||':'||p_unit_id::text,0));
    if exists(select 1 from public.content_coupon_redemptions where annual_record_id=record_id and unit_id=p_unit_id)
      or exists(select 1 from public.content_code_redemptions where annual_record_id=record_id and unit_id=p_unit_id) then raise exception 'code_used'; end if;
    result:=edra_private.learning_issue(p_request_id,p_academy_id,scope,record_id,p_unit_id,'code',coalesce((scope->'document'->>'accessDays')::bigint,7)*86400);
    insert into public.content_coupon_redemptions(coupon_id,annual_record_id,unit_id,grant_id) values(c.id,record_id,p_unit_id,p_request_id);
    return edra_private.learning_receipt(p_request_id,p_academy_id,'coupon_redeem',payload,result);
  exception when others then
    return jsonb_build_object('error',case when sqlerrm in ('code_unavailable','code_used','coupon_type_mismatch','prerequisites_required','validation','request_conflict') then sqlerrm else 'unavailable' end);
  end;
end $$;

create function public.get_content_coupons(p_academy_id uuid,p_program_id uuid default null,p_type_id uuid default null,
  p_status text default 'all',p_search text default '',p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; manager boolean;
begin
  perform edra_private.learning_actor(p_academy_id);
  if p_offset is null or p_offset not between 0 and 100000 or p_status is null or p_status not in ('all','unused','redeemed','revoked')
    or char_length(coalesce(p_search,''))>100 then raise exception 'validation'; end if;
  manager:=public.is_academy_manager(p_academy_id);
  with matches as (
    select c.id,c.code,c.type_id,t.name as type_name,b.created_at,c.revoked_at,r.redeemed_at,r.unit_id,
      case when r.coupon_id is not null then 'redeemed' when c.revoked_at is not null then 'revoked' else 'unused' end as status,
      ar.full_name as student_name,cr.document->>'title' as unit_title
    from public.content_coupons c join public.content_coupon_types t on t.id=c.type_id
    join public.content_coupon_batches b on b.id=c.batch_id
    left join public.content_coupon_redemptions r on r.coupon_id=c.id
    left join public.annual_student_records ar on ar.id=r.annual_record_id
    left join public.content_units u on u.id=r.unit_id
    left join public.content_revisions cr on cr.unit_id=u.id and cr.revision=u.published_revision
    where c.academy_id=p_academy_id and (p_program_id is null or exists(select 1 from public.content_programs p
      where p.id=p_program_id and p.academy_id=p_academy_id and p.academic_year_id=t.academic_year_id
        and p.level_id=t.level_id and p.track_id is not distinct from t.track_id))
      and (p_type_id is null or c.type_id=p_type_id)
      and (coalesce(p_search,'')='' or position(upper(regexp_replace(p_search,'[[:space:]-]','','g')) in c.code)>0)
  ), page as (
    select * from matches where p_status='all' or status=p_status order by created_at desc,id limit 26 offset p_offset
  )
  select jsonb_build_object('manager',manager,'codes',coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc,id)
    from (select * from page order by created_at desc,id limit 25)x),'[]'::jsonb),'hasMore',(select count(*)>25 from page)) into result;
  return result;
end $$;

create function public.get_content_coupon_options(p_academy_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform edra_private.learning_actor(p_academy_id);
  return jsonb_build_object(
    'programs',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'yearId',y.id,'year',y.start_year,'closed',y.closed_at is not null,
      'levelId',p.level_id,'level',l.name,'trackId',p.track_id,'track',t.name) order by y.start_year desc,l.sort_order,t.name)
      from public.content_programs p join public.academic_years y on y.id=p.academic_year_id
      join public.global_levels l on l.id=p.level_id left join public.academy_tracks t on t.id=p.track_id
      where p.academy_id=p_academy_id),'[]'::jsonb),
    'types',coalesce((select jsonb_agg(jsonb_build_object('id',id,'programId',program_id,'yearId',academic_year_id,'levelId',level_id,'trackId',track_id,'name',name) order by name,id)
      from public.content_coupon_types where academy_id=p_academy_id),'[]'::jsonb));
end $$;

-- A legacy coupon must not issue another coupon grant after the new path wins.
do $$
declare definition text; updated text;
begin
  definition:=pg_get_functiondef('public.redeem_content_code(uuid,uuid,text,uuid)'::regprocedure);
  updated:=replace(definition,
    'if exists(select 1 from public.content_code_redemptions where code_id=code_row.id or (annual_record_id=record_id and unit_id=p_unit_id)) then',
    'if exists(select 1 from public.content_code_redemptions where code_id=code_row.id or (annual_record_id=record_id and unit_id=p_unit_id)) or exists(select 1 from public.content_coupon_redemptions where annual_record_id=record_id and unit_id=p_unit_id) then');
  if updated=definition then raise exception 'Legacy coupon guard changed'; end if;
  execute updated;
end $$;

revoke all on function edra_private.coupon_program(uuid,uuid),edra_private.new_coupon_code() from public,anon,authenticated;
revoke all on function public.create_content_coupon_type(uuid,uuid,text,uuid),public.generate_content_coupons(uuid,uuid,integer,uuid),
  public.revoke_content_coupon(uuid,uuid,uuid),public.redeem_content_coupon(uuid,uuid,text,uuid),
  public.get_content_coupons(uuid,uuid,uuid,text,text,integer),public.get_content_coupon_options(uuid) from public,anon;
grant execute on function public.create_content_coupon_type(uuid,uuid,text,uuid),public.generate_content_coupons(uuid,uuid,integer,uuid),
  public.revoke_content_coupon(uuid,uuid,uuid),public.redeem_content_coupon(uuid,uuid,text,uuid),
  public.get_content_coupons(uuid,uuid,uuid,text,text,integer),public.get_content_coupon_options(uuid) to authenticated;

commit;
