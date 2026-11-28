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

-- An existing saved question predates collections: it has no memberships or document identity.
reset role;
insert into public.question_bank_questions(academy_id,id,created_by,payload)
  select academy,gen_random_uuid(),owner_id,jsonb_build_object('prompt','Legacy question','choices','[]'::jsonb,'visuals','[]'::jsonb,
    'topic','Old label','source',jsonb_build_object('file','book.pdf','page',3)) from bank_context;
create temp table bank_ids(name text primary key, id uuid);
grant select, insert on bank_ids to authenticated;
insert into bank_ids select n, gen_random_uuid() from unnest(array['doc','doc_same_name','q2','q3','q4','q5','custom','hard']) n;

create function pg_temp.question(p_id uuid, p_page integer, p_section jsonb, p_topics jsonb, p_unit uuid default null) returns jsonb language sql as $q$
  select jsonb_build_object('id',p_id,'unitId',p_unit,'section',p_section,'topics',p_topics,'payload',jsonb_build_object(
    'prompt','Find x on page '||p_page,'choices',jsonb_build_array(jsonb_build_object('key','a','text','Quadrilateral')),'visuals','[]'::jsonb,
    'source',jsonb_build_object('file','book.pdf','page',p_page)));
$q$;
create function pg_temp.id(p_name text) returns uuid language sql as $q$ select id from bank_ids where name=p_name $q$;
create function pg_temp.sections(p_doc uuid) returns bigint language sql as $q$
  select count(*) from public.question_bank_collections where parent_id=p_doc and kind='source_section' $q$;
create function pg_temp.member(p_collection uuid, p_question uuid) returns boolean language sql as $q$
  select exists(select 1 from public.question_bank_memberships where collection_id=p_collection and question_id=p_question) $q$;

set local role authenticated;
select set_config('request.jwt.claim.sub',owner_id::text,true) from bank_context;

do $$
declare c record; program uuid; questions jsonb; rejected boolean := false; doc jsonb; section_id uuid; topic_id uuid; listed jsonb;
begin
  select * into c from bank_context;
  select program_id into program from public.content_units where id=c.unit_id;
  doc := jsonb_build_object('id',pg_temp.id('doc'),'name','Unit 3 book');
  if jsonb_array_length(public.get_question_bank_units(c.academy)) <> 1 then raise exception 'Incorrect catalog'; end if;
  if (public.list_question_bank_questions(c.academy,null,'',0,24)->>'total')::int <> 1 then raise exception 'Legacy question missing from All questions'; end if;

  -- Direct question saves would skip source memberships, so only the import command remains callable.
  begin perform public.save_question_bank_questions(c.academy,'[]'::jsonb);
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Legacy save remains callable without source memberships'; end if;

  -- A foreign unit or an invalid section rejects the whole save atomically.
  questions := jsonb_build_array(pg_temp.question(c.question_id,4,jsonb_build_object('name','Exercises','firstPage',4,'continues',false),
    '["Algebra","Equations"]'::jsonb,c.unit_id));
  rejected := false;
  begin
    perform public.save_question_bank_import(c.academy,questions||jsonb_build_array(pg_temp.question(gen_random_uuid(),4,null,'[]'::jsonb,c.foreign_unit)),doc,program);
  exception when raise_exception then if sqlerrm='invalid_unit' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'Foreign unit accepted'; end if;
  rejected := false;
  begin
    perform public.save_question_bank_import(c.academy,questions||jsonb_build_array(pg_temp.question(gen_random_uuid(),2,
      jsonb_build_object('name','Exercises','firstPage',4,'continues',false),'[]'::jsonb)),doc,program);
  exception when raise_exception then if sqlerrm='invalid_section' then rejected := true; else raise; end if;
  end;
  if not rejected or exists(select 1 from public.question_bank_questions where id=c.question_id)
    or exists(select 1 from public.question_bank_collections) then raise exception 'Partial save accepted'; end if;

  -- Save and identical retry: one question, one document, one section, two topics, no duplicate memberships.
  if public.save_question_bank_import(c.academy,questions,doc,program) <> 1 or public.save_question_bank_import(c.academy,questions,doc,program) <> 1
    then raise exception 'Save or identical retry failed'; end if;
  if (select count(*) from public.question_bank_questions where unit_id=c.unit_id) <> 1 then raise exception 'Duplicate or missing row'; end if;
  if (select count(*) from public.question_bank_memberships where question_id=c.question_id) <> 4 then raise exception 'Expected four overlapping memberships'; end if;
  if (select count(*) from public.question_bank_collections where kind='source_document') <> 1 or pg_temp.sections(pg_temp.id('doc')) <> 1
    then raise exception 'Source collections duplicated on retry'; end if;
  if (select state from public.content_units where id=c.unit_id) <> 'draft' then raise exception 'Save changed publication'; end if;
  select id into section_id from public.question_bank_collections where parent_id=pg_temp.id('doc');

  -- A later batch from the same section reuses it; a range-opening continuation of an adjacent run reuses it too.
  perform public.save_question_bank_import(c.academy,jsonb_build_array(pg_temp.question(pg_temp.id('q2'),5,
    jsonb_build_object('name','exercises','firstPage',4,'continues',false),'[" algebra "]'::jsonb)),doc);
  perform public.save_question_bank_import(c.academy,jsonb_build_array(pg_temp.question(pg_temp.id('q3'),6,
    jsonb_build_object('name','Exercises','firstPage',6,'continues',true),'[]'::jsonb)),doc);
  if pg_temp.sections(pg_temp.id('doc')) <> 1 or not pg_temp.member(section_id,pg_temp.id('q3'))
    then raise exception 'Section identity lost across batches or page ranges'; end if;
  -- The same heading later in the document is a different section.
  perform public.save_question_bank_import(c.academy,jsonb_build_array(pg_temp.question(pg_temp.id('q4'),9,
    jsonb_build_object('name','Exercises','firstPage',9,'continues',false),'[]'::jsonb)),doc);
  if pg_temp.sections(pg_temp.id('doc')) <> 2 then raise exception 'Repeated heading merged into an earlier section'; end if;
  -- Two documents with the same name stay distinct.
  perform public.save_question_bank_import(c.academy,jsonb_build_array(pg_temp.question(pg_temp.id('q5'),4,
    jsonb_build_object('name','Exercises','firstPage',4,'continues',false),'[]'::jsonb)),jsonb_build_object('id',pg_temp.id('doc_same_name'),'name','Unit 3 book'));
  if (select count(*) from public.question_bank_collections where kind='source_document' and name='Unit 3 book') <> 2
    or pg_temp.member(section_id,pg_temp.id('q5')) then raise exception 'Same-named documents merged'; end if;
  select id into topic_id from public.question_bank_collections where kind='topic' and name_key='algebra';
  if (select count(*) from public.question_bank_collections where kind='topic') <> 2 or not pg_temp.member(topic_id,pg_temp.id('q2'))
    then raise exception 'Topic reuse failed'; end if;

  -- Whole-library search and collection filters run server-side.
  listed := public.list_question_bank_questions(c.academy,null,'QUADRILATERAL',0,2);
  if (listed->>'total')::int <> 5 or jsonb_array_length(listed->'rows') <> 2 then raise exception 'Choice search or paging failed: %', listed; end if;
  -- Rows come back in source order: file, then page, then printed number.
  listed := public.list_question_bank_questions(c.academy,null,'',0,24);
  if exists(select 1 from (select r, lag(r) over (order by n) prev from jsonb_array_elements(listed->'rows') with ordinality t(r,n)) s
    where (lower(prev->>'file'),(prev->>'page')::int,(substring(prev->>'printedNumber' from '[0-9]+'))::numeric)
      > (lower(r->>'file'),(r->>'page')::int,(substring(r->>'printedNumber' from '[0-9]+'))::numeric))
    then raise exception 'Questions not in source order: %', listed; end if;
  if (public.list_question_bank_questions(c.academy,topic_id,'',0,24)->>'total')::int <> 2
    or (public.list_question_bank_questions(c.academy,null,'%',0,24)->>'total')::int <> 0 then raise exception 'Collection filter or escaping failed'; end if;

  -- Custom collections: create (idempotent), rename, bulk membership; removal keeps the question and its source.
  perform public.create_question_bank_collection(c.academy,pg_temp.id('custom'),'custom','Revision');
  perform public.create_question_bank_collection(c.academy,pg_temp.id('custom'),'custom','Revision');
  rejected := false;
  begin perform public.create_question_bank_collection(c.academy,gen_random_uuid(),'topic',' ALGEBRA ');
  exception when raise_exception then if sqlerrm='duplicate_name' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'Duplicate topic name accepted'; end if;
  perform public.rename_question_bank_collection(c.academy,pg_temp.id('custom'),'Final revision');
  if public.set_question_bank_memberships(c.academy,pg_temp.id('custom'),array[c.question_id,pg_temp.id('q2')],true) <> 2
    or public.set_question_bank_memberships(c.academy,pg_temp.id('custom'),array[c.question_id],true) <> 0 then raise exception 'Membership add failed'; end if;
  perform public.set_question_bank_memberships(c.academy,topic_id,array[c.question_id],false);
  if pg_temp.member(topic_id,c.question_id) or not pg_temp.member(pg_temp.id('doc'),c.question_id)
    or not exists(select 1 from public.question_bank_questions where id=c.question_id and payload->'source'->>'page'='4')
    then raise exception 'Removing a membership changed the question or its source'; end if;
  rejected := false;
  begin perform public.set_question_bank_memberships(c.academy,pg_temp.id('doc'),array[c.question_id],false);
  exception when raise_exception then if sqlerrm='invalid_collection' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'Source membership removable'; end if;
  if jsonb_array_length(public.get_question_bank_question(c.academy,c.question_id)->'collections') <> 4
    then raise exception 'Detail memberships incorrect'; end if;

  -- Editing: prompt, choice text and answer change; keys, source and memberships stay.
  perform public.update_question_bank_question(c.academy,pg_temp.id('q2'),jsonb_build_object('prompt',' Edited ',
    'choices',jsonb_build_array(jsonb_build_object('key','a','text','Square')),'answer','a'));
  if (select payload->>'prompt' <> 'Edited' or payload->>'answer' <> 'a' or payload->'choices'->0->>'text' <> 'Square'
      or payload->'source'->>'page' <> '5' from public.question_bank_questions where id=pg_temp.id('q2'))
    or not pg_temp.member(topic_id,pg_temp.id('q2')) then raise exception 'Question edit failed'; end if;
  rejected := false;
  begin perform public.update_question_bank_question(c.academy,pg_temp.id('q2'),jsonb_build_object('prompt','x',
    'choices',jsonb_build_array(jsonb_build_object('key','z','text','Other')),'answer','z'));
  exception when raise_exception then if sqlerrm='invalid_question' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'Choice keys changed by an edit'; end if;

  -- Labels: the questions catalog applies to saved questions; another catalog's label is rejected; retries change nothing.
  perform public.create_label(c.academy,pg_temp.id('hard'),'Hard','red','questions');
  if public.set_question_bank_label(c.academy,array[pg_temp.id('q2'),pg_temp.id('q2')],pg_temp.id('hard'),true) <> 1
    or public.set_question_bank_label(c.academy,array[pg_temp.id('q2')],pg_temp.id('hard'),true) <> 0
    or public.get_question_bank_question(c.academy,pg_temp.id('q2'))->'labels' <> jsonb_build_array(pg_temp.id('hard'))
    or not exists(select 1 from jsonb_array_elements(public.list_question_bank_questions(c.academy,null,'',0,24)->'rows') r
      where r->>'id'=pg_temp.id('q2')::text and r->'labels' = jsonb_build_array(pg_temp.id('hard')))
    then raise exception 'Question label not applied or listed'; end if;
  rejected := false;
  begin perform public.set_question_bank_label(c.academy,array[pg_temp.id('q2')],
    (select id from public.labels where academy_id=c.academy and domain='assessments' limit 1),true);
  exception when raise_exception then if sqlerrm='label_not_found' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'Assessment label applied to a question'; end if;
  if public.delete_label(c.academy,pg_temp.id('hard'),false)->>'status' <> 'confirm' then raise exception 'Used question label deleted without confirmation'; end if;

  -- Archive hides a question from lists and counts; restore returns it; delete removes it and its memberships.
  listed := public.get_question_bank_collections(c.academy);
  if public.set_question_bank_archived(c.academy,array[pg_temp.id('q2')],true) <> 1 then raise exception 'Archive failed'; end if;
  if (public.get_question_bank_collections(c.academy)->>'total')::int <> (listed->>'total')::int - 1
    or (public.get_question_bank_collections(c.academy)->>'archived')::int <> 1
    or (public.list_question_bank_questions(c.academy,topic_id,'',0,24)->>'total')::int <> 0
    or (public.list_question_bank_questions(c.academy,null,'',0,24,true)->>'total')::int <> 1
    then raise exception 'Archived question still listed or counted'; end if;
  perform public.set_question_bank_archived(c.academy,array[pg_temp.id('q2')],false);
  if (public.list_question_bank_questions(c.academy,topic_id,'',0,24)->>'total')::int <> 1 then raise exception 'Restore failed'; end if;
  if public.delete_question_bank_questions(c.academy,array[pg_temp.id('q2')]) <> 1
    or exists(select 1 from public.question_bank_questions where id=pg_temp.id('q2'))
    or exists(select 1 from public.question_bank_memberships where question_id=pg_temp.id('q2'))
    or exists(select 1 from public.question_bank_question_labels where question_id=pg_temp.id('q2')) then raise exception 'Delete failed'; end if;
end $$;

select set_config('request.jwt.claim.sub',instructor_id::text,true) from bank_context;
do $$
declare c record; rejected boolean := false;
begin
  select * into c from bank_context;
  if exists(select 1 from public.question_bank_questions) then raise exception 'Instructor can read manager question bank'; end if;
  if exists(select 1 from public.question_bank_collections) or exists(select 1 from public.question_bank_memberships)
    then raise exception 'Instructor can read collections'; end if;
  begin perform public.save_question_bank_import(c.academy,'[]'::jsonb,'{}'::jsonb);
  exception when raise_exception then
    if sqlerrm='forbidden' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'Instructor can save questions'; end if;
  rejected := false;
  begin perform public.create_question_bank_collection(c.academy,gen_random_uuid(),'topic','Instructor topic');
  exception when raise_exception then if sqlerrm='forbidden' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'Instructor can create collections'; end if;
  rejected := false;
  begin perform public.delete_question_bank_questions(c.academy,array[c.question_id]);
  exception when raise_exception then if sqlerrm='forbidden' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'Instructor can delete questions'; end if;
  rejected := false;
  begin perform public.set_question_bank_label(c.academy,array[c.question_id],gen_random_uuid(),true);
  exception when raise_exception then if sqlerrm='forbidden' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'Instructor can label questions'; end if;
end $$;
select set_config('request.jwt.claim.sub',outsider_id::text,true) from bank_context;
do $$
declare c record; rejected boolean := false; custom uuid;
begin
  select * into c from bank_context;
  if exists(select 1 from public.question_bank_questions) or exists(select 1 from public.question_bank_collections)
    or exists(select 1 from public.question_bank_memberships) then raise exception 'Cross-academy question bank read'; end if;
  begin perform public.list_question_bank_questions(c.academy,null,'',0,24);
  exception when raise_exception then if sqlerrm='forbidden' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'Cross-academy search allowed'; end if;
  -- Another academy's collection or questions cannot be used from the outsider's own academy.
  select id into custom from bank_ids where name='custom';
  rejected := false;
  begin perform public.set_question_bank_memberships(c.other_academy,custom,array[c.question_id],true);
  exception when raise_exception then if sqlerrm='invalid_collection' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'Foreign collection accepted'; end if;
  perform public.create_question_bank_collection(c.other_academy,gen_random_uuid(),'custom','Mine');
  rejected := false;
  begin perform public.set_question_bank_memberships(c.other_academy,(select id from public.question_bank_collections where name='Mine'),array[c.question_id],true);
  exception when raise_exception then if sqlerrm='invalid_questions' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'Foreign question accepted'; end if;
  -- Archive and delete are scoped to the caller's academy: another academy's question is untouched.
  if public.delete_question_bank_questions(c.other_academy,array[c.question_id]) <> 0 then raise exception 'Foreign question deleted'; end if;
  rejected := false;
  begin perform public.set_question_bank_archived(c.other_academy,array[c.question_id],true);
  exception when raise_exception then if sqlerrm='invalid_questions' then rejected := true; else raise; end if;
  end;
  if not rejected then raise exception 'Foreign question archived'; end if;
end $$;
rollback;
