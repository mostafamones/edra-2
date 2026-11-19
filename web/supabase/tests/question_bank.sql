begin;
do $$ begin
  if not exists(select 1 from edra_db_test.target where name like 'edra-db-check-%') then
    raise exception 'Isolated Edra test target required';
  end if;
end $$;

create temp table bank_context(owner_id uuid, outsider_id uuid, instructor_id uuid, academy uuid, other_academy uuid, unit_id uuid, foreign_unit uuid, question_id uuid);
insert into bank_context select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid();
grant select on bank_context to authenticated;
insert into auth.users(id) select owner_id from bank_context union all select outsider_id from bank_context union all select instructor_id from bank_context;
insert into public.academies(id,name,slug,icon,subject,created_by)
  select academy,'Bank test','bank-'||academy,'school','Math',owner_id from bank_context
  union all select other_academy,'Other bank','bank-'||other_academy,'school','Math',outsider_id from bank_context;
insert into public.academy_memberships(academy_id,user_id,role,created_by)
  select academy,owner_id,'owner'::public.academy_role,owner_id from bank_context
  union all select academy,instructor_id,'instructor'::public.academy_role,owner_id from bank_context
  union all select other_academy,outsider_id,'owner'::public.academy_role,outsider_id from bank_context;
insert into public.academy_levels(academy_id,level_id,sort_order)
  select academy,'secondary-3',0 from bank_context union all select other_academy,'secondary-3',0 from bank_context;

set local role authenticated;
select set_config('request.jwt.claim.sub',outsider_id::text,true) from bank_context;
select public.create_content_unit(c.other_academy,y.id,'secondary-3',null,c.foreign_unit,'Foreign unit')
  from bank_context c join public.academic_years y on y.academy_id=c.other_academy and y.closed_at is null;
select set_config('request.jwt.claim.sub',owner_id::text,true) from bank_context;
select public.create_content_unit(c.academy,y.id,'secondary-3',null,c.unit_id,'Linear equations')
  from bank_context c join public.academic_years y on y.academy_id=c.academy and y.closed_at is null;

do $$
declare c record; program uuid; questions jsonb; rejected boolean := false;
begin
  select * into c from bank_context;
  select program_id into program from public.content_units where id=c.unit_id;
  if jsonb_array_length(public.get_question_bank_units(c.academy)) <> 1 then raise exception 'Incorrect catalog'; end if;
  questions := jsonb_build_array(jsonb_build_object('id',c.question_id,'unitId',c.unit_id,'payload',
    jsonb_build_object('prompt','Find x.','choices','[]'::jsonb,'visuals','[]'::jsonb,'source','{}'::jsonb)));
  begin
    perform public.save_question_bank_questions(c.academy,questions||jsonb_build_array(
      jsonb_set(jsonb_set(questions->0,'{unitId}',to_jsonb(c.foreign_unit)),'{id}',to_jsonb(gen_random_uuid()))),program);
  exception when raise_exception then
    if sqlerrm='invalid_unit' then rejected := true; else raise; end if;
  end;
  if not rejected or exists(select 1 from public.question_bank_questions) then raise exception 'Foreign link or partial save accepted'; end if;
  if public.save_question_bank_questions(c.academy,questions,program) <> 1
    or public.save_question_bank_questions(c.academy,questions,program) <> 1
    then raise exception 'Save or identical retry failed'; end if;
  if (select count(*) from public.question_bank_questions where unit_id=c.unit_id) <> 1 then raise exception 'Duplicate or missing row'; end if;
  if (select state from public.content_units where id=c.unit_id) <> 'draft' then raise exception 'Save changed publication'; end if;
end $$;

select set_config('request.jwt.claim.sub',instructor_id::text,true) from bank_context;
do $$
declare c record; rejected boolean := false;
begin
  select * into c from bank_context;
  if exists(select 1 from public.question_bank_questions) then raise exception 'Instructor can read manager question bank'; end if;
  begin perform public.save_question_bank_questions(c.academy,'[]'::jsonb);
  exception when raise_exception then
    if sqlerrm='forbidden' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'Instructor can save questions'; end if;
end $$;
select set_config('request.jwt.claim.sub',outsider_id::text,true) from bank_context;
do $$ begin
  if exists(select 1 from public.question_bank_questions) then raise exception 'Cross-academy question read'; end if;
end $$;
rollback;
