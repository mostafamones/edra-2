-- Disposable GitHub Actions database only; all fixtures roll back.
begin;
do $$ begin
  if (select count(*) from edra_db_test.target)<>1 or not exists(select 1 from edra_db_test.target where name like 'edra-db-check-%') then raise exception 'Isolated Edra test target required'; end if;
end $$;
create temporary table learning_ids(name text primary key,id uuid not null default gen_random_uuid());
insert into learning_ids(name) values('owner'),('instructor'),('student'),('second'),('wrong-level'),('outsider'),('academy'),('other-academy'),('unit'),('second-unit'),('third-unit'),('draft'),('track-unit'),('track'),('request'),('batch'),('redeem'),('extension'),('revoke'),('allowance'),('coupon-type');
grant select on learning_ids to authenticated;
create function pg_temp.lid(label text) returns uuid language sql as $$ select id from pg_temp.learning_ids where name=label $$;
create function pg_temp.lact(label text) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims','',true);
  perform set_config('edra.verified_session','',true);
  perform set_config('request.jwt.claim.sub',pg_temp.lid(label)::text,true);
end $$;
create function pg_temp.lcheck(ok boolean,label text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'Learning access assertion: %',label; end if; end $$;
create function pg_temp.lerror(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if position(expected in sqlerrm)>0 then return; end if;
    raise exception 'Expected %, received %',expected,sqlerrm;
  end;
  raise exception 'Expected % but operation succeeded',expected;
end $$;

insert into auth.users(id) select id from learning_ids where name in ('owner','instructor','student','second','wrong-level','outsider');
insert into public.academies(id,name,slug,icon,subject,created_by) values
  (pg_temp.lid('academy'),'Learning access tests','learning-'||pg_temp.lid('academy'),'school','Math',pg_temp.lid('owner')),
  (pg_temp.lid('other-academy'),'Other learning','learn-b-'||pg_temp.lid('other-academy'),'school','Math',pg_temp.lid('outsider'));
insert into learning_ids(name,id) select 'year',id from public.academic_years where academy_id=pg_temp.lid('academy');
insert into public.academy_memberships(academy_id,user_id,role,created_by) values
  (pg_temp.lid('academy'),pg_temp.lid('owner'),'owner',pg_temp.lid('owner')),
  (pg_temp.lid('academy'),pg_temp.lid('instructor'),'instructor',pg_temp.lid('owner')),
  (pg_temp.lid('other-academy'),pg_temp.lid('outsider'),'owner',pg_temp.lid('outsider'));
insert into public.academy_levels(academy_id,level_id,sort_order) values(pg_temp.lid('academy'),'secondary-1',0),(pg_temp.lid('academy'),'secondary-2',1);
select pg_temp.lact('owner');
insert into learning_ids(name,id) select 'record-'||label,(public.create_student_record(pg_temp.lid('academy'),pg_temp.lid('year'),'Learning '||label,'0108817000'||n,'01188179999',level,null,null,'online_only')).id
  from (values('student',1,'secondary-1'),('second',2,'secondary-1'),('wrong-level',3,'secondary-2')) v(label,n,level);
update public.academy_student_profiles profile set user_id=pg_temp.lid(substr(ids.name,8)),linked_at=now()
  from public.annual_student_records r join learning_ids ids on ids.id=r.id and ids.name in ('record-student','record-second','record-wrong-level')
  where profile.id=r.academy_student_profile_id;
-- Adding an offering does not move the already enrolled level-wide students.
insert into public.academy_tracks(id,academy_id,level_id,name,sort_order) values(pg_temp.lid('track'),pg_temp.lid('academy'),'secondary-1','Science',0);

-- Provider-independent ready assets; no video upload or real Storage bytes are created.
do $$ declare label text; asset_id uuid; note_id uuid; doc jsonb; begin
  foreach label in array array['unit','second-unit','third-unit','draft','track-unit'] loop
    perform public.create_content_unit(pg_temp.lid('academy'),pg_temp.lid('year'),'secondary-1',case when label='track-unit' then pg_temp.lid('track') else null end,pg_temp.lid(label),'Lesson '||label);
    asset_id:=gen_random_uuid(); note_id:=gen_random_uuid();
    insert into public.content_assets(id,academy_id,unit_id,created_by,kind,name,mime_type,status,playback_id)
      values(asset_id,pg_temp.lid('academy'),pg_temp.lid(label),pg_temp.lid('owner'),'video','Learning video','video/mp4','ready','test-playback');
    insert into public.content_assets(id,academy_id,unit_id,created_by,kind,name,mime_type,status,storage_path)
      values(note_id,pg_temp.lid('academy'),pg_temp.lid(label),pg_temp.lid('owner'),'document','Learning PDF','application/pdf','ready',pg_temp.lid('academy')||'/'||pg_temp.lid(label)||'/'||note_id);
    doc:=jsonb_build_object('title','Lesson '||label,'description','','accessDays',case when label='second-unit' then 30 else 7 end,'items',jsonb_build_array(
      jsonb_build_object('id',asset_id,'kind','explanation','title','Explanation','assetId',asset_id),
      jsonb_build_object('id',note_id,'kind','document','title','Notes','assetId',note_id)));
    perform public.save_content_unit(pg_temp.lid('academy'),pg_temp.lid(label),1,doc);
    if label<>'draft' then perform public.change_content_unit(pg_temp.lid('academy'),pg_temp.lid(label),2,'publish'); end if;
  end loop;
end $$;

set local role authenticated;
select pg_temp.lact('student');
do $$ declare page jsonb; unit jsonb; item_id uuid; begin
  page:=public.list_my_content_units(pg_temp.lid('academy'));
  perform pg_temp.lcheck(jsonb_array_length(page->'units')=3,'draft and incompatible-track units hidden');
  perform pg_temp.lcheck(not jsonb_path_exists(page,'$.**.assetId') and not jsonb_path_exists(page,'$.**.storagePath'),'browse exposes no protected assets');
  unit:=public.get_my_content_unit(pg_temp.lid('academy'),pg_temp.lid('unit'));
  perform pg_temp.lcheck(unit->'access'->>'status'='locked','initial access locked');
  item_id:=(unit->'items'->0->>'id')::uuid;
  perform pg_temp.lerror(format('select public.authorize_content_material(%L,%L,%L)',pg_temp.lid('academy'),pg_temp.lid('unit'),item_id),'access_required');
  perform pg_temp.lerror(format('select public.extend_my_content_access(%L,%L,%L)',pg_temp.lid('academy'),pg_temp.lid('unit'),gen_random_uuid()),'previous_access_required');
  perform pg_temp.lerror(format('select public.generate_content_coupons(%L,%L,1,%L)',pg_temp.lid('academy'),pg_temp.lid('unit'),gen_random_uuid()),'forbidden');
  perform pg_temp.lerror(format('select public.issue_content_access(%L,%L,%L,%L)',pg_temp.lid('academy'),pg_temp.lid('unit'),pg_temp.lid('record-student'),gen_random_uuid()),'forbidden');
end $$;
select pg_temp.lact('owner');
select public.create_academy_coupon_type(pg_temp.lid('academy'),pg_temp.lid('year'),'Standard','STD',pg_temp.lid('coupon-type'));
select pg_temp.lact('instructor');
do $$ declare first_result jsonb; retry jsonb; extended jsonb; before_expiry timestamptz; begin
  first_result:=public.confirm_content_access(pg_temp.lid('academy'),pg_temp.lid('unit'),pg_temp.lid('record-student'),pg_temp.lid('request'),null,1);
  retry:=public.confirm_content_access(pg_temp.lid('academy'),pg_temp.lid('unit'),pg_temp.lid('record-student'),pg_temp.lid('request'),null,1);
  perform pg_temp.lcheck(first_result=retry,'staff lost-response retry preserves exact receipt');
  perform pg_temp.lerror(format('select public.confirm_content_access(%L,%L,%L,%L,null,1)',pg_temp.lid('academy'),pg_temp.lid('unit'),pg_temp.lid('record-student'),gen_random_uuid()),'content_conflict');
  perform pg_temp.lerror(format('select public.confirm_content_access(%L,%L,%L,%L,%L,99)',pg_temp.lid('academy'),pg_temp.lid('unit'),pg_temp.lid('record-student'),gen_random_uuid(),pg_temp.lid('request')),'content_conflict');
  perform pg_temp.lcheck(public.get_content_access_workspace(pg_temp.lid('academy'),pg_temp.lid('unit'))->>'publishedRevision'='1','staff previews have the publication basis');
  perform pg_temp.lcheck(abs(extract(epoch from ((first_result->>'expiresAt')::timestamptz-(first_result->>'issuedAt')::timestamptz))-604800)<1,'default seven-day grant');
  perform pg_temp.lerror(format('select public.issue_content_access(%L,%L,%L,%L,24)',pg_temp.lid('academy'),pg_temp.lid('unit'),pg_temp.lid('record-student'),pg_temp.lid('request')),'request_conflict');
  perform pg_temp.lerror(format('select public.issue_content_access(%L,%L,%L,%L)',pg_temp.lid('academy'),pg_temp.lid('unit'),pg_temp.lid('record-wrong-level'),gen_random_uuid()),'student_unavailable');
  perform pg_temp.lerror(format('select public.revoke_content_access(%L,%L,%L,%L,''No'',%L)',pg_temp.lid('academy'),pg_temp.lid('unit'),pg_temp.lid('record-student'),gen_random_uuid(),pg_temp.lid('request')),'forbidden');
  before_expiry:=(first_result->>'expiresAt')::timestamptz;
  extended:=public.issue_content_access(pg_temp.lid('academy'),pg_temp.lid('unit'),pg_temp.lid('record-student'),pg_temp.lid('extension'),48);
  perform pg_temp.lcheck((extended->>'expiresAt')::timestamptz=before_expiry+interval '48 hours','staff extension preserves remaining time');
  perform public.generate_content_coupons(pg_temp.lid('academy'),pg_temp.lid('coupon-type'),3,pg_temp.lid('batch'));
  perform pg_temp.lcheck(jsonb_array_length(public.generate_content_coupons(pg_temp.lid('academy'),pg_temp.lid('coupon-type'),3,pg_temp.lid('batch'))->'codes')=3,'code generation retry');
end $$;
select pg_temp.lact('student');
do $$ declare unit jsonb; item_id uuid; begin
  unit:=public.get_my_content_unit(pg_temp.lid('academy'),pg_temp.lid('unit'));
  perform pg_temp.lcheck(unit->'access'->>'status'='active','granted unit active');
  item_id:=(unit->'items'->1->>'id')::uuid;
  perform pg_temp.lcheck(public.authorize_content_material(pg_temp.lid('academy'),pg_temp.lid('unit'),item_id)->>'kind'='document','documents follow explanation access');
  perform pg_temp.lerror(format('select public.extend_my_content_access(%L,%L,%L)',pg_temp.lid('academy'),pg_temp.lid('unit'),gen_random_uuid()),'access_not_expired');
end $$;
reset role;
-- Change the publication AFTER generation: unused codes use this new default.
select pg_temp.lact('owner');
do $$ declare doc jsonb; begin
  select draft into doc from public.content_units where id=pg_temp.lid('second-unit');
  perform public.save_content_unit(pg_temp.lid('academy'),pg_temp.lid('second-unit'),3,doc||jsonb_build_object('accessDays',45,'couponTypeId',pg_temp.lid('coupon-type')));
  perform public.change_content_unit(pg_temp.lid('academy'),pg_temp.lid('second-unit'),4,'publish');
end $$;
create temporary table learning_codes(code text,id uuid);
insert into learning_codes select code,id from public.content_coupons where batch_id=pg_temp.lid('batch') order by id;
grant select on learning_codes to authenticated;
set local role authenticated;
select pg_temp.lact('student');
do $$ declare code_value text; result jsonb; begin
  select code into code_value from learning_codes order by id limit 1;
  result:=public.redeem_content_coupon(pg_temp.lid('academy'),pg_temp.lid('second-unit'),upper(code_value),pg_temp.lid('redeem'));
  perform pg_temp.lcheck(result=public.redeem_content_coupon(pg_temp.lid('academy'),pg_temp.lid('second-unit'),code_value,pg_temp.lid('redeem')),'redemption retry preserves original time');
  perform pg_temp.lcheck(abs(extract(epoch from ((result->>'expiresAt')::timestamptz-(result->>'issuedAt')::timestamptz))-3888000)<1,'redemption uses newly published 45-day default');
  select code into code_value from learning_codes order by id offset 1 limit 1;
  perform pg_temp.lcheck(public.redeem_content_coupon(pg_temp.lid('academy'),pg_temp.lid('second-unit'),code_value,gen_random_uuid())->>'error'='code_used','second coupon for same unit rejected');
end $$;
select pg_temp.lact('second');
do $$ declare code_value text; begin
  select code into code_value from learning_codes order by id limit 1;
  perform pg_temp.lcheck(public.redeem_content_coupon(pg_temp.lid('academy'),pg_temp.lid('second-unit'),code_value,gen_random_uuid())->>'error'='code_unavailable','used coupon rejected');
end $$;
select pg_temp.lact('owner');
select public.revoke_content_access(pg_temp.lid('academy'),pg_temp.lid('unit'),pg_temp.lid('record-student'),pg_temp.lid('revoke'),'Invalid access',pg_temp.lid('extension'));
select pg_temp.lact('student');
do $$ begin
  perform pg_temp.lcheck(public.get_my_content_unit(pg_temp.lid('academy'),pg_temp.lid('unit'))->'access'->>'status'='revoked','revoked latest does not restore older grant');
  perform pg_temp.lerror(format('select public.extend_my_content_access(%L,%L,%L)',pg_temp.lid('academy'),pg_temp.lid('unit'),gen_random_uuid()),'access_revoked');
end $$;
select pg_temp.lact('outsider');
select pg_temp.lerror(format('select public.get_content_access_workspace(%L,%L)',pg_temp.lid('academy'),pg_temp.lid('unit')),'forbidden');
select pg_temp.lerror(format('select public.get_my_content_unit(%L,%L)',pg_temp.lid('academy'),pg_temp.lid('unit')),'student_unavailable');
reset role;

-- Expired fixtures are INSERTED as history; production history is never updated to time-travel.
create function pg_temp.expired_unit(unit_label text) returns void language plpgsql as $$
declare grant_id uuid:=gen_random_uuid(); begin
  insert into public.content_access_accounts(academy_id,academic_year_id,annual_record_id,unit_id) values(pg_temp.lid('academy'),pg_temp.lid('year'),pg_temp.lid('record-second'),pg_temp.lid(unit_label));
  insert into public.content_access_grants(id,academy_id,academic_year_id,annual_record_id,unit_id,kind,actor_id,issued_at,starts_at,expires_at,duration_seconds)
    values(grant_id,pg_temp.lid('academy'),pg_temp.lid('year'),pg_temp.lid('record-second'),pg_temp.lid(unit_label),'staff',pg_temp.lid('owner'),now()-interval '10 days',now()-interval '10 days',now()-interval '3 days',604800);
  update public.content_access_accounts set current_grant_id=grant_id where annual_record_id=pg_temp.lid('record-second') and unit_id=pg_temp.lid(unit_label);
end $$;
select pg_temp.expired_unit('unit');
select pg_temp.expired_unit('third-unit');
set local role authenticated;
select pg_temp.lact('second');
do $$ declare result jsonb; begin
  result:=public.extend_my_content_access(pg_temp.lid('academy'),pg_temp.lid('unit'),pg_temp.lid('allowance'));
  perform pg_temp.lcheck(result=public.extend_my_content_access(pg_temp.lid('academy'),pg_temp.lid('unit'),pg_temp.lid('allowance')),'annual extension retry');
  perform pg_temp.lcheck(abs(extract(epoch from ((result->>'expiresAt')::timestamptz-(result->>'issuedAt')::timestamptz))-172800)<1,'annual extension is 48 hours');
  perform pg_temp.lerror(format('select public.extend_my_content_access(%L,%L,%L)',pg_temp.lid('academy'),pg_temp.lid('third-unit'),gen_random_uuid()),'extension_used');
end $$;
reset role;
do $$ begin
  perform pg_temp.lcheck(not has_table_privilege('authenticated','public.content_coupons','SELECT'),'raw codes are RPC-only');
  perform pg_temp.lcheck(not has_function_privilege('authenticated','edra_private.learning_issue(uuid,uuid,jsonb,uuid,uuid,text,bigint)','EXECUTE'),'private issuer inaccessible');
  perform pg_temp.lerror(format('update public.content_access_grants set expires_at=now() where id=%L',pg_temp.lid('request')),'history_protected');
end $$;
update public.academy_student_profiles p set access_suspended_at=clock_timestamp() from public.annual_student_records r where r.academy_student_profile_id=p.id and r.id=pg_temp.lid('record-student');
set local role authenticated;
select pg_temp.lact('student');
select pg_temp.lerror(format('select public.get_my_content_unit(%L,%L)',pg_temp.lid('academy'),pg_temp.lid('second-unit')),'student_unavailable');
select pg_temp.lact('instructor');
select pg_temp.lerror(format('select public.issue_content_access(%L,%L,%L,%L)',pg_temp.lid('academy'),pg_temp.lid('unit'),pg_temp.lid('record-student'),gen_random_uuid()),'student_unavailable');
select pg_temp.lact('second');
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.lid('second'),'session_id',gen_random_uuid(),'amr',jsonb_build_array(jsonb_build_object('method','otp')))::text,true);
select pg_temp.lerror(format('select public.get_my_content_unit(%L,%L)',pg_temp.lid('academy'),pg_temp.lid('unit')),'student_unavailable');
reset role;
select set_config('request.jwt.claims','',true);
update public.academic_years set closed_at=clock_timestamp() where id=pg_temp.lid('year');
set local role authenticated;
select pg_temp.lact('second');
select pg_temp.lerror(format('select public.list_my_content_units(%L)',pg_temp.lid('academy')),'student_unavailable');
reset role;
rollback;
select 'Learning access: grants, codes, redemption, expiry, annual extensions, history and isolation passed' as result;
