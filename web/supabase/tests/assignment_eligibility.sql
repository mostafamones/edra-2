-- Task 4 / G06: cohort capture/reset, empty cohorts, optional late physical/code work,
-- required-only filters, placement exit, preserved official results and delivery-state gates.
begin;
create function pg_temp.check(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'Eligibility check failed: %',label; end if; end $$;
create function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
begin execute statement; raise exception 'Expected %',expected using errcode='XX001';
exception when sqlstate 'XX001' then raise;
when others then if sqlerrm not like expected then raise exception 'Expected %, got %',expected,sqlerrm; end if; end $$;
create temporary table cohort_ids(name text primary key,id uuid not null default gen_random_uuid());
insert into cohort_ids(name) values('owner'),('other'),('academy'),('assignment'),('empty'),('reset'),('g1'),('g2');
grant select on pg_temp.cohort_ids to authenticated;
create function pg_temp.id(label text) returns uuid language sql as $$select id from pg_temp.cohort_ids where name=label$$;
insert into auth.users(id) values(pg_temp.id('owner')),(pg_temp.id('other'));
insert into public.academies(id,name,slug,icon,subject,created_by)
values(pg_temp.id('academy'),'Cohort fixture','cohort-'||pg_temp.id('academy'),'school','Math',pg_temp.id('owner'));
insert into public.academy_memberships(academy_id,user_id,role,created_by)
values(pg_temp.id('academy'),pg_temp.id('owner'),'owner',pg_temp.id('owner'));
insert into cohort_ids(name,id) select 'year',id from public.academic_years where academy_id=pg_temp.id('academy');
insert into public.academy_levels(academy_id,level_id,sort_order)
values(pg_temp.id('academy'),'preparatory-3',9),(pg_temp.id('academy'),'secondary-1',10);
insert into public.groups(id,academy_id,academic_year_id,level_id,name)
values(pg_temp.id('g1'),pg_temp.id('academy'),pg_temp.id('year'),'preparatory-3','One'),
(pg_temp.id('g2'),pg_temp.id('academy'),pg_temp.id('year'),'preparatory-3','Two');
select set_config('request.jwt.claim.sub',pg_temp.id('owner')::text,true);
insert into cohort_ids(name,id) select 's'||n,(public.create_student_record(pg_temp.id('academy'),pg_temp.id('year'),'Cohort student '||n,
 '0106100000'||n,'01100000000','preparatory-3',null,pg_temp.id('g'||n),'in_person')).id from generate_series(1,2)n;
-- Exercise the exact migration helper against legacy stored rows, rather than copying its SQL.
-- The stored recipient is deliberately outside today's target; history, not placement, wins.
insert into cohort_ids(name) values('legacy'),('legacy-empty'),('legacy-invalid'),('legacy-part');
insert into public.assignments(id,academy_id,academic_year_id,title,audience,level_id,created_by,updated_by)
select pg_temp.id(n),pg_temp.id('academy'),pg_temp.id('year'),'Legacy transition','level','secondary-1',pg_temp.id('owner'),pg_temp.id('owner')
from unnest(array['legacy','legacy-empty']) n;
insert into public.assignments(id,academy_id,academic_year_id,title,audience,created_by,updated_by)
values(pg_temp.id('legacy-invalid'),pg_temp.id('academy'),pg_temp.id('year'),'No valid audience','groups',pg_temp.id('owner'),pg_temp.id('owner'));
insert into public.assignment_parts(id,academy_id,assignment_id,position,title,max_score)
values(pg_temp.id('legacy-part'),pg_temp.id('academy'),pg_temp.id('legacy'),1,'Legacy marks',5);
insert into public.assignment_recipients(assignment_id,annual_student_record_id,academy_id,academic_year_id,work_status,received_at,work_recorded_at,work_recorded_by)
values(pg_temp.id('legacy'),pg_temp.id('s1'),pg_temp.id('academy'),pg_temp.id('year'),'submitted',now(),now(),pg_temp.id('owner'));
insert into public.assignment_marks(assignment_id,annual_student_record_id,part_id,academy_id,kind,score,updated_by)
values(pg_temp.id('legacy'),pg_temp.id('s1'),pg_temp.id('legacy-part'),pg_temp.id('academy'),'mark',3,pg_temp.id('owner'));
select public.publish_assignment_results(pg_temp.id('academy'),pg_temp.id('legacy'),jsonb_build_array(jsonb_build_object('annual_student_record_id',pg_temp.id('s1'),'expected_version',1)),gen_random_uuid());
create temporary table legacy_official_before as select to_jsonb(p) as item from public.assignment_result_publications p where p.assignment_id=pg_temp.id('legacy');
select edra_private.backfill_assignment_cohorts();
select pg_temp.check((select source='existing_recipients' from public.assignment_cohorts where assignment_id=pg_temp.id('legacy'))
 and (select count(*)=1 from public.assignment_cohort_members where assignment_id=pg_temp.id('legacy') and annual_student_record_id=pg_temp.id('s1')),'backfill preserves stored required recipient despite placement');
select pg_temp.check((select recipient_count=0 and cohort_revision=1 from public.assignments where id=pg_temp.id('legacy-empty'))
 and (select cohort_revision=0 from public.assignments where id=pg_temp.id('legacy-invalid')),'backfill distinguishes established empty and incomplete audience');
select pg_temp.check((select to_jsonb(p)=b.item from public.assignment_result_publications p cross join legacy_official_before b where p.assignment_id=pg_temp.id('legacy'))
 and (select score=3 from public.assignment_marks where assignment_id=pg_temp.id('legacy')),'backfill preserves official payload, receipt and marks');
select edra_private.backfill_assignment_cohorts();
select pg_temp.check((select count(*)=1 from public.assignment_cohort_members where assignment_id=pg_temp.id('legacy')),'backfill idempotent');
create function pg_temp.draft() returns jsonb language sql as $$select jsonb_build_object('title','Cohort','audience','groups','group_ids',jsonb_build_array(pg_temp.id('g1'),pg_temp.id('g2')),
 'parts',jsonb_build_array(jsonb_build_object('title','Written','kind','file_upload','questions',jsonb_build_array(jsonb_build_object('prompt','','max_score','5')))))$$;
create function pg_temp.document(label text) returns jsonb language sql security definer as $$select edra_private.assignment_json(pg_temp.id(label))$$;
create function pg_temp.row_for(label text) returns jsonb language sql security definer as $$select edra_private.assignment_recipient_json(pg_temp.id('assignment'),pg_temp.id(label))$$;
set local role authenticated;
select public.create_assignment(pg_temp.id('academy'),pg_temp.id('year'),pg_temp.id('assignment'),pg_temp.draft());
select public.create_assignment(pg_temp.id('academy'),pg_temp.id('year'),pg_temp.id('reset'),pg_temp.draft());
select public.create_assignment(pg_temp.id('academy'),pg_temp.id('year'),pg_temp.id('empty'),
 pg_temp.draft()||jsonb_build_object('audience','level','group_ids','[]'::jsonb,'level_id','secondary-1'));
select pg_temp.check(pg_temp.document('assignment')->>'recipient_count'='2' and pg_temp.document('assignment')->>'cohort_revision'='1','first valid audience captures required');
select pg_temp.check(pg_temp.document('empty')->>'recipient_count'='0' and pg_temp.document('empty')->>'cohort_revision'='1','valid empty cohort initialized');
reset role;
insert into cohort_ids(name,id) select 's3',id from public.create_student_record(pg_temp.id('academy'),pg_temp.id('year'),'Late Optional','01061000003','01100000000','preparatory-3',null,pg_temp.id('g1'),'in_person');
insert into cohort_ids(name,id) select 's4',id from public.create_student_record(pg_temp.id('academy'),pg_temp.id('year'),'Empty Late','01061000004','01100000000','secondary-1',null,null,'online_only');
set local role authenticated;
-- No author save or read write is needed to discover either late student.
select pg_temp.check(public.list_assignment_marks(pg_temp.id('academy'),pg_temp.id('assignment'))->>'total'='3'
 and public.list_assignment_marks(pg_temp.id('academy'),pg_temp.id('assignment'),'not_received')->>'total'='2','optional late student discovered but never missing');
select pg_temp.check(public.list_assignment_marks(pg_temp.id('academy'),pg_temp.id('assignment'),'all',1,0,'Late Optional')->>'total'='1','search before paging includes optional');
select public.update_assignment(pg_temp.id('academy'),pg_temp.id('assignment'),1,pg_temp.document('assignment')||jsonb_build_object('title','Title autosave'));
select public.update_assignment(pg_temp.id('academy'),pg_temp.id('assignment'),2,pg_temp.document('assignment')||jsonb_build_object('group_ids',jsonb_build_array(pg_temp.id('g2'),pg_temp.id('g1'))));
select pg_temp.check(pg_temp.document('assignment')->>'recipient_count'='2' and pg_temp.document('assignment')->>'cohort_revision'='1','same audience/order edits never refresh');
select public.update_assignment(pg_temp.id('academy'),pg_temp.id('empty'),1,pg_temp.document('empty')||jsonb_build_object('title','Empty autosave'));
select pg_temp.check(pg_temp.document('empty')->>'recipient_count'='0' and pg_temp.document('empty')->>'optional_eligible_count'='1','empty cohort stays empty');
-- An allowed deliberate audience change captures a new required set and retains old provenance.
select public.update_assignment(pg_temp.id('academy'),pg_temp.id('reset'),1,pg_temp.document('reset')||jsonb_build_object('audience','level','level_id','secondary-1','group_ids','[]'::jsonb));
select pg_temp.check(pg_temp.document('reset')->>'cohort_revision'='2' and pg_temp.document('reset')->>'recipient_count'='1','deliberate audience reset captures new target');
-- Reads, code lookup and unrelated saves must not establish optional aggregate rows.
select public.save_student_code_settings(pg_temp.id('academy'),0,true,'####','[]');
select public.change_student_code(pg_temp.id('academy'),pg_temp.id('s3'),'assign','0613',0,gen_random_uuid());
select pg_temp.check(public.resolve_assignment_student(pg_temp.id('academy'),pg_temp.id('assignment'),'0613')->>'required'='false','optional student code resolves');
reset role;
select pg_temp.check(not exists(select 1 from public.assignment_recipients where assignment_id=pg_temp.id('assignment') and annual_student_record_id=pg_temp.id('s3')),'reads never create optional work');
select pg_temp.check((select count(*)=3 from public.assignment_cohort_members where assignment_id=pg_temp.id('reset')),'prior reset membership retained');
set local role authenticated;
do $$declare saved jsonb; key uuid:=gen_random_uuid(); part uuid; begin
 part:=(pg_temp.document('assignment')#>>'{parts,0,id}')::uuid;
 saved:=public.save_assignment_marks(pg_temp.id('academy'),pg_temp.id('assignment'),null,'0613',1,jsonb_build_object('marks',jsonb_build_array(jsonb_build_object('part_id',part,'score','4'))),key,pg_temp.id('s3'));
 perform pg_temp.check(saved->>'outcome'='saved' and saved#>>'{recipient,required}'='false' and saved#>>'{recipient,work_status}'='submitted','optional physical/code work creates aggregate');
 perform pg_temp.check((public.save_assignment_marks(pg_temp.id('academy'),pg_temp.id('assignment'),null,'0613',1,jsonb_build_object('marks',jsonb_build_array(jsonb_build_object('part_id',part,'score','4'))),key,pg_temp.id('s3'))->>'replayed')::boolean,'optional work retry receipt stable');
 perform public.publish_assignment_results(pg_temp.id('academy'),pg_temp.id('assignment'),jsonb_build_array(jsonb_build_object('annual_student_record_id',pg_temp.id('s3'),'expected_version',(saved#>>'{recipient,version}')::integer)),gen_random_uuid());
end $$;
select pg_temp.check(pg_temp.document('assignment')->>'recipient_count'='2' and pg_temp.row_for('s3')->>'publication_state'='published','optional announcement preserves required denominator');
select pg_temp.expect_error($q$select public.update_assignment(pg_temp.id('academy'),pg_temp.id('assignment'),3,pg_temp.document('assignment')||jsonb_build_object('group_ids',jsonb_build_array(pg_temp.id('g1'))))$q$,'structure_locked');
reset role;
-- Placement exit ends only unfinished required work; its stored aggregate and history survive.
update public.annual_student_records set primary_group_id=null where id in(pg_temp.id('s1'),pg_temp.id('s3'));
select pg_temp.check(pg_temp.row_for('s1')->>'required'='true' and pg_temp.row_for('s1')->>'requirement_ended_at' is not null
 and pg_temp.row_for('s1')->>'eligible'='false','unfinished required placement exit recorded');
select pg_temp.check(pg_temp.row_for('s3')->>'publication_state'='published','optional official result unchanged by placement');
set local role authenticated;
select pg_temp.check(public.list_assignment_marks(pg_temp.id('academy'),pg_temp.id('assignment'),'not_received')->>'total'='1','ended requirement excluded from missing');
select pg_temp.expect_error($q$select public.record_assignment_work(pg_temp.id('academy'),pg_temp.id('assignment'),pg_temp.id('s1'),1,'submitted',now(),'')$q$,'not_recipient');
reset role;
update public.annual_student_records set primary_group_id=pg_temp.id('g1') where id=pg_temp.id('s1');
select pg_temp.check(pg_temp.row_for('s1')->>'eligible'='true' and pg_temp.row_for('s1')->>'requirement_ended_at' is not null,'placement return does not reinstate required work');
set local role authenticated;
select public.change_assignment_state(pg_temp.id('academy'),pg_temp.id('assignment'),3,'close');
select pg_temp.expect_error($q$select public.record_assignment_work(pg_temp.id('academy'),pg_temp.id('assignment'),pg_temp.id('s2'),1,'submitted',now(),'')$q$,'assignment_closed');
select public.publish_assignment_results(pg_temp.id('academy'),pg_temp.id('assignment'),jsonb_build_array(jsonb_build_object('annual_student_record_id',pg_temp.id('s3'),'expected_version',(pg_temp.row_for('s3')->>'version')::integer)),gen_random_uuid());
select pg_temp.check(pg_temp.row_for('s3')->>'publication_state'='published','closed allows received work/unchanged announcement');
select set_config('request.jwt.claim.sub',pg_temp.id('other')::text,true);
select pg_temp.check(public.list_assignment_marks(pg_temp.id('academy'),pg_temp.id('assignment')) is null,'unrelated caller denied');
select pg_temp.expect_error($q$select * from public.assignment_cohort_members$q$,'%permission denied%');
reset role;
-- Closure forbids late aggregate creation, and archived students cannot begin work.
select set_config('request.jwt.claim.sub',pg_temp.id('owner')::text,true);
update public.annual_student_records set archived_at=now() where id=pg_temp.id('s4');
select pg_temp.expect_error($q$select public.record_assignment_work(pg_temp.id('academy'),pg_temp.id('empty'),pg_temp.id('s4'),1,'submitted',now(),'')$q$,'not_recipient');
update public.academic_years set closed_at=now() where id=pg_temp.id('year');
select pg_temp.expect_error($q$select public.record_assignment_work(pg_temp.id('academy'),pg_temp.id('empty'),pg_temp.id('s4'),1,'submitted',now(),'')$q$,'year_unavailable');
rollback;
