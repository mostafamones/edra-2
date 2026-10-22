begin;

create table public.content_access_accounts (
  academy_id uuid not null,
  academic_year_id uuid not null,
  annual_record_id uuid not null,
  unit_id uuid not null,
  current_grant_id uuid,
  primary key(annual_record_id,unit_id),
  unique(academy_id,academic_year_id,annual_record_id,unit_id),
  foreign key(academy_id,academic_year_id,annual_record_id) references public.annual_student_records(academy_id,academic_year_id,id),
  foreign key(academy_id,unit_id) references public.content_units(academy_id,id)
);

create table public.content_access_grants (
  id uuid primary key,
  academy_id uuid not null,
  academic_year_id uuid not null,
  annual_record_id uuid not null,
  unit_id uuid not null,
  kind text not null check(kind in ('staff','code','staff_extension','student_extension')),
  actor_id uuid not null references public.profiles(id),
  issued_at timestamptz not null,
  previous_grant_id uuid references public.content_access_grants(id),
  previous_expiry timestamptz,
  starts_at timestamptz not null,
  expires_at timestamptz not null check(expires_at>starts_at),
  duration_seconds bigint not null check(duration_seconds>0),
  unique(id,annual_record_id,unit_id),
  foreign key(academy_id,academic_year_id,annual_record_id,unit_id) references public.content_access_accounts(academy_id,academic_year_id,annual_record_id,unit_id)
);
alter table public.content_access_accounts add foreign key(current_grant_id,annual_record_id,unit_id) references public.content_access_grants(id,annual_record_id,unit_id);
create index content_access_grants_history on public.content_access_grants(annual_record_id,unit_id,issued_at desc,id);

create table public.content_access_revocations (
  id uuid primary key,
  grant_id uuid not null unique references public.content_access_grants(id),
  actor_id uuid not null references public.profiles(id),
  revoked_at timestamptz not null default clock_timestamp(),
  reason text not null check(char_length(btrim(reason)) between 1 and 1000)
);

create table edra_private.content_access_requests (
  id uuid primary key,
  actor_id uuid not null,
  academy_id uuid not null,
  operation text not null,
  payload jsonb not null,
  result jsonb not null
);
create table edra_private.content_annual_extensions (
  academy_id uuid not null,
  academic_year_id uuid not null,
  annual_record_id uuid not null,
  grant_id uuid not null unique references public.content_access_grants(id),
  primary key(academy_id,academic_year_id,annual_record_id),
  foreign key(academy_id,academic_year_id,annual_record_id) references public.annual_student_records(academy_id,academic_year_id,id)
);

create table public.content_code_batches (
  id uuid primary key,
  academy_id uuid not null,
  unit_id uuid not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(),
  quantity integer not null check(quantity between 1 and 1000),
  unique(academy_id,unit_id,id),
  foreign key(academy_id,unit_id) references public.content_units(academy_id,id)
);
create table public.content_access_codes (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  unit_id uuid not null,
  batch_id uuid not null,
  code text not null unique check(code ~ '^[0-9a-f]{32}$'),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id),
  foreign key(academy_id,unit_id,batch_id) references public.content_code_batches(academy_id,unit_id,id),
  check((revoked_at is null)=(revoked_by is null))
);
create table public.content_code_redemptions (
  code_id uuid primary key references public.content_access_codes(id),
  annual_record_id uuid not null references public.annual_student_records(id),
  unit_id uuid not null references public.content_units(id),
  grant_id uuid not null unique references public.content_access_grants(id),
  unique(annual_record_id,unit_id)
);

alter table public.content_access_accounts enable row level security;
alter table public.content_access_grants enable row level security;
alter table public.content_access_revocations enable row level security;
alter table public.content_code_batches enable row level security;
alter table public.content_access_codes enable row level security;
alter table public.content_code_redemptions enable row level security;
revoke all on public.content_access_accounts,public.content_access_grants,public.content_access_revocations,public.content_code_batches,public.content_access_codes,public.content_code_redemptions from anon,authenticated;
revoke all on edra_private.content_access_requests,edra_private.content_annual_extensions from public,anon,authenticated;

create function edra_private.content_access_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'history_protected'; end $$;
create trigger content_grant_history before update or delete on public.content_access_grants for each row execute function edra_private.content_access_immutable();
create trigger content_revocation_history before update or delete on public.content_access_revocations for each row execute function edra_private.content_access_immutable();
create trigger content_redemption_history before update or delete on public.content_code_redemptions for each row execute function edra_private.content_access_immutable();
create trigger content_extension_history before update or delete on edra_private.content_annual_extensions for each row execute function edra_private.content_access_immutable();
create trigger content_request_history before update or delete on edra_private.content_access_requests for each row execute function edra_private.content_access_immutable();

-- Lock the publication/year before selecting its live duration. Draft changes are never authority.
create function edra_private.learning_publication(p_academy uuid,p_unit uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u public.content_units; p public.content_programs; doc jsonb;
begin
  select * into u from public.content_units where id=p_unit and academy_id=p_academy for share;
  if not found or u.state<>'published' then raise exception 'content_unavailable'; end if;
  select * into strict p from public.content_programs where id=u.program_id for share;
  perform 1 from public.academic_years where id=p.academic_year_id and academy_id=p_academy and closed_at is null for share;
  if not found then raise exception 'year_closed'; end if;
  select document into strict doc from public.content_revisions where unit_id=u.id and revision=u.published_revision;
  return jsonb_build_object('year',p.academic_year_id,'level',p.level_id,'track',p.track_id,'document',doc);
end $$;

create function edra_private.learning_record(p_academy uuid,p_scope jsonb,p_record uuid) returns public.annual_student_records
language plpgsql security definer set search_path='' as $$
declare r public.annual_student_records; profile public.academy_student_profiles;
begin
  select * into r from public.annual_student_records where id=p_record and academy_id=p_academy and academic_year_id=(p_scope->>'year')::uuid for share;
  if not found then raise exception 'student_unavailable'; end if;
  select * into strict profile from public.academy_student_profiles where id=r.academy_student_profile_id for share;
  if profile.user_id is null or edra_private.student_access_suspended(r,profile) then raise exception 'student_unavailable'; end if;
  if r.level_id<>p_scope->>'level' or (p_scope->>'track' is not null and r.track_id is distinct from (p_scope->>'track')::uuid) then raise exception 'student_unavailable'; end if;
  return r;
end $$;

create function edra_private.learning_actor(p_academy uuid,p_manager boolean default false) returns void
language plpgsql security definer set search_path='' as $$
begin
  if edra_auth.session_allowed() is not true then raise exception 'forbidden'; end if;
  perform edra_private.content_actor(p_academy,p_manager);
end $$;

create function edra_private.learning_student(p_academy uuid,p_unit uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare year_id uuid; record_id uuid; scope jsonb;
begin
  if edra_auth.session_allowed() is not true or auth.uid() is null then raise exception 'student_unavailable'; end if;
  select id into year_id from public.academic_years where academy_id=p_academy and closed_at is null for share;
  record_id:=edra_private.student_caller_record(p_academy,year_id);
  if record_id is null then raise exception 'student_unavailable'; end if;
  scope:=edra_private.learning_publication(p_academy,p_unit);
  perform edra_private.learning_record(p_academy,scope,record_id);
  return scope||jsonb_build_object('record',record_id);
end $$;

-- All mutations share the same request lock, actor/payload check and immutable receipt.
create function edra_private.learning_retry(p_id uuid,p_academy uuid,p_operation text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare receipt edra_private.content_access_requests;
begin
  if p_id is null then raise exception 'validation'; end if;
  perform pg_advisory_xact_lock(hashtextextended('learning-request:'||p_id::text,0));
  select * into receipt from edra_private.content_access_requests where id=p_id;
  if found then
    if receipt.actor_id<>auth.uid() or receipt.academy_id<>p_academy or receipt.operation<>p_operation or receipt.payload<>p_payload then raise exception 'request_conflict'; end if;
    return receipt.result;
  end if;
  return null;
end $$;

create function edra_private.learning_receipt(p_id uuid,p_academy uuid,p_operation text,p_payload jsonb,p_result jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  insert into edra_private.content_access_requests values(p_id,auth.uid(),p_academy,p_operation,p_payload,p_result);
  return p_result;
end $$;

create function edra_private.learning_state(p_record uuid,p_unit uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.content_access_grants; status text;
begin
  select x.* into g from public.content_access_accounts a join public.content_access_grants x on x.id=a.current_grant_id where a.annual_record_id=p_record and a.unit_id=p_unit;
  if not found then return jsonb_build_object('status','locked','expiresAt',null,'grantId',null); end if;
  status:=case when exists(select 1 from public.content_access_revocations where grant_id=g.id) then 'revoked' when g.expires_at<=clock_timestamp() then 'expired' else 'active' end;
  return jsonb_build_object('status',status,'expiresAt',g.expires_at,'grantId',g.id);
end $$;

create function edra_private.learning_issue(p_id uuid,p_academy uuid,p_scope jsonb,p_record uuid,p_unit uuid,p_kind text,p_seconds bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous public.content_access_grants; issued timestamptz; starts timestamptz; expires timestamptz;
begin
  if p_seconds is null or p_seconds<1 then raise exception 'validation'; end if;
  insert into public.content_access_accounts(academy_id,academic_year_id,annual_record_id,unit_id) values(p_academy,(p_scope->>'year')::uuid,p_record,p_unit) on conflict do nothing;
  perform 1 from public.content_access_accounts where annual_record_id=p_record and unit_id=p_unit for update;
  issued:=clock_timestamp();
  select g.* into previous from public.content_access_grants g join public.content_access_accounts a on a.current_grant_id=g.id where a.annual_record_id=p_record and a.unit_id=p_unit;
  starts:=issued;
  if p_kind in ('staff_extension','student_extension') then
    if previous.id is null then raise exception 'previous_access_required'; end if;
    if exists(select 1 from public.content_access_revocations where grant_id=previous.id) then raise exception 'access_revoked'; end if;
    if p_kind='student_extension' and previous.expires_at>issued then raise exception 'access_not_expired'; end if;
    starts:=greatest(issued,previous.expires_at);
  end if;
  begin expires:=starts+(p_seconds::text||' seconds')::interval;
  exception when datetime_field_overflow then raise exception 'validation'; end;
  insert into public.content_access_grants(id,academy_id,academic_year_id,annual_record_id,unit_id,kind,actor_id,issued_at,previous_grant_id,previous_expiry,starts_at,expires_at,duration_seconds)
    values(p_id,p_academy,(p_scope->>'year')::uuid,p_record,p_unit,p_kind,auth.uid(),issued,previous.id,previous.expires_at,starts,expires,p_seconds);
  update public.content_access_accounts set current_grant_id=p_id where annual_record_id=p_record and unit_id=p_unit;
  return jsonb_build_object('grantId',p_id,'expiresAt',expires,'issuedAt',issued,'previousExpiry',previous.expires_at);
end $$;

create function public.issue_content_access(p_academy_id uuid,p_unit_id uuid,p_record_id uuid,p_request_id uuid,p_extension_hours integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare scope jsonb; payload jsonb; retry jsonb; result jsonb; seconds bigint;
begin
  perform edra_private.learning_actor(p_academy_id);
  scope:=edra_private.learning_publication(p_academy_id,p_unit_id);
  perform edra_private.learning_record(p_academy_id,scope,p_record_id);
  if p_extension_hours is not null and p_extension_hours<1 then raise exception 'validation'; end if;
  payload:=jsonb_build_object('unit',p_unit_id,'record',p_record_id,'hours',p_extension_hours);
  retry:=edra_private.learning_retry(p_request_id,p_academy_id,'staff',payload);
  if retry is not null then return retry; end if;
  seconds:=case when p_extension_hours is null then coalesce((scope->'document'->>'accessDays')::bigint,7)*86400 else p_extension_hours::bigint*3600 end;
  result:=edra_private.learning_issue(p_request_id,p_academy_id,scope,p_record_id,p_unit_id,case when p_extension_hours is null then 'staff' else 'staff_extension' end,seconds);
  return edra_private.learning_receipt(p_request_id,p_academy_id,'staff',payload,result);
end $$;

create function public.revoke_content_access(p_academy_id uuid,p_unit_id uuid,p_record_id uuid,p_request_id uuid,p_reason text,p_grant_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare scope jsonb; payload jsonb; retry jsonb; current_id uuid; result jsonb;
begin
  perform edra_private.learning_actor(p_academy_id,true);
  scope:=edra_private.learning_publication(p_academy_id,p_unit_id);
  perform edra_private.learning_record(p_academy_id,scope,p_record_id);
  if char_length(btrim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception 'validation'; end if;
  payload:=jsonb_build_object('unit',p_unit_id,'record',p_record_id,'reason',btrim(p_reason),'grant',p_grant_id);
  retry:=edra_private.learning_retry(p_request_id,p_academy_id,'revoke',payload);
  if retry is not null then return retry; end if;
  select current_grant_id into current_id from public.content_access_accounts where annual_record_id=p_record_id and unit_id=p_unit_id for update;
  if current_id is null or current_id is distinct from p_grant_id then raise exception 'content_conflict'; end if;
  if exists(select 1 from public.content_access_revocations where grant_id=current_id) then raise exception 'access_revoked'; end if;
  insert into public.content_access_revocations(id,grant_id,actor_id,reason) values(p_request_id,current_id,auth.uid(),btrim(p_reason));
  result:=jsonb_build_object('grantId',current_id,'status','revoked');
  return edra_private.learning_receipt(p_request_id,p_academy_id,'revoke',payload,result);
end $$;

create function public.generate_content_codes(p_academy_id uuid,p_unit_id uuid,p_request_id uuid,p_quantity integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare scope jsonb; payload jsonb; retry jsonb; result jsonb;
begin
  perform edra_private.learning_actor(p_academy_id);
  scope:=edra_private.learning_publication(p_academy_id,p_unit_id);
  if p_quantity is null or p_quantity not between 1 and 1000 then raise exception 'validation'; end if;
  payload:=jsonb_build_object('unit',p_unit_id,'quantity',p_quantity);
  retry:=edra_private.learning_retry(p_request_id,p_academy_id,'generate',payload);
  if retry is not null then return retry; end if;
  insert into public.content_code_batches values(p_request_id,p_academy_id,p_unit_id,auth.uid(),clock_timestamp(),p_quantity);
  insert into public.content_access_codes(academy_id,unit_id,batch_id,code)
    select p_academy_id,p_unit_id,p_request_id,encode(extensions.gen_random_bytes(16),'hex') from generate_series(1,p_quantity);
  select jsonb_build_object('batchId',p_request_id,'codes',jsonb_agg(jsonb_build_object('id',id,'code',code) order by id)) into result from public.content_access_codes where batch_id=p_request_id;
  return edra_private.learning_receipt(p_request_id,p_academy_id,'generate',payload,result);
end $$;

create function public.revoke_content_code(p_academy_id uuid,p_unit_id uuid,p_code_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare code_row public.content_access_codes; payload jsonb; retry jsonb; result jsonb;
begin
  perform edra_private.learning_actor(p_academy_id,true);
  perform edra_private.learning_publication(p_academy_id,p_unit_id);
  payload:=jsonb_build_object('unit',p_unit_id,'code',p_code_id);
  retry:=edra_private.learning_retry(p_request_id,p_academy_id,'revoke_code',payload);
  if retry is not null then return retry; end if;
  select * into code_row from public.content_access_codes where id=p_code_id and academy_id=p_academy_id and unit_id=p_unit_id for update;
  if not found then raise exception 'code_unavailable'; end if;
  if exists(select 1 from public.content_code_redemptions where code_id=p_code_id) then raise exception 'code_used'; end if;
  update public.content_access_codes set revoked_at=coalesce(revoked_at,clock_timestamp()),revoked_by=coalesce(revoked_by,auth.uid()) where id=p_code_id;
  result:=jsonb_build_object('codeId',p_code_id,'status','revoked');
  return edra_private.learning_receipt(p_request_id,p_academy_id,'revoke_code',payload,result);
end $$;

create function public.redeem_content_code(p_academy_id uuid,p_unit_id uuid,p_code text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare scope jsonb; record_id uuid; payload jsonb; retry jsonb; code_row public.content_access_codes; result jsonb; normalized text;
begin
  scope:=edra_private.learning_student(p_academy_id,p_unit_id);
  record_id:=(scope->>'record')::uuid;
  normalized:=lower(regexp_replace(coalesce(p_code,''),'[[:space:]-]','','g'));
  if normalized !~ '^[0-9a-f]{32}$' then raise exception 'code_unavailable'; end if;
  payload:=jsonb_build_object('unit',p_unit_id,'code',normalized);
  retry:=edra_private.learning_retry(p_request_id,p_academy_id,'redeem',payload);
  if retry is not null then return retry; end if;
  -- All issuers lock the access head before code rows, preserving one lock order.
  insert into public.content_access_accounts(academy_id,academic_year_id,annual_record_id,unit_id) values(p_academy_id,(scope->>'year')::uuid,record_id,p_unit_id) on conflict do nothing;
  perform 1 from public.content_access_accounts where annual_record_id=record_id and unit_id=p_unit_id for update;
  select * into code_row from public.content_access_codes where code=normalized and academy_id=p_academy_id and unit_id=p_unit_id for update;
  if not found or code_row.revoked_at is not null then raise exception 'code_unavailable'; end if;
  if exists(select 1 from public.content_code_redemptions where code_id=code_row.id or (annual_record_id=record_id and unit_id=p_unit_id)) then raise exception 'code_used'; end if;
  -- Deliberately use the published default AT REDEMPTION, not generation.
  result:=edra_private.learning_issue(p_request_id,p_academy_id,scope,record_id,p_unit_id,'code',coalesce((scope->'document'->>'accessDays')::bigint,7)*86400);
  insert into public.content_code_redemptions values(code_row.id,record_id,p_unit_id,p_request_id);
  return edra_private.learning_receipt(p_request_id,p_academy_id,'redeem',payload,result);
end $$;

create function public.extend_my_content_access(p_academy_id uuid,p_unit_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare scope jsonb; record_id uuid; payload jsonb; retry jsonb; result jsonb;
begin
  scope:=edra_private.learning_student(p_academy_id,p_unit_id);
  record_id:=(scope->>'record')::uuid;
  payload:=jsonb_build_object('unit',p_unit_id);
  retry:=edra_private.learning_retry(p_request_id,p_academy_id,'self_extend',payload);
  if retry is not null then return retry; end if;
  perform pg_advisory_xact_lock(hashtextextended('learning-annual:'||record_id::text,0));
  if exists(select 1 from edra_private.content_annual_extensions where academy_id=p_academy_id and academic_year_id=(scope->>'year')::uuid and annual_record_id=record_id) then raise exception 'extension_used'; end if;
  result:=edra_private.learning_issue(p_request_id,p_academy_id,scope,record_id,p_unit_id,'student_extension',172800);
  insert into edra_private.content_annual_extensions values(p_academy_id,(scope->>'year')::uuid,record_id,p_request_id);
  return edra_private.learning_receipt(p_request_id,p_academy_id,'self_extend',payload,result);
end $$;

-- Restrict every private helper, including trigger helpers, before exposing the bounded RPCs.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='edra_private' and (p.proname like 'learning_%' or p.proname='content_access_immutable') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  end loop;
end $$;
revoke all on function public.issue_content_access(uuid,uuid,uuid,uuid,integer),public.revoke_content_access(uuid,uuid,uuid,uuid,text,uuid),public.generate_content_codes(uuid,uuid,uuid,integer),public.revoke_content_code(uuid,uuid,uuid,uuid),public.redeem_content_code(uuid,uuid,text,uuid),public.extend_my_content_access(uuid,uuid,uuid) from public,anon;
grant execute on function public.issue_content_access(uuid,uuid,uuid,uuid,integer),public.revoke_content_access(uuid,uuid,uuid,uuid,text,uuid),public.generate_content_codes(uuid,uuid,uuid,integer),public.revoke_content_code(uuid,uuid,uuid,uuid),public.redeem_content_code(uuid,uuid,text,uuid),public.extend_my_content_access(uuid,uuid,uuid) to authenticated;

commit;
