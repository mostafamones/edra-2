-- Preserve schedule validation errors when the audience group does not exist.
begin;

create or replace function edra_private.guard_offering_use()
returns trigger language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new); o jsonb:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  a uuid:=(n->>'academy_id')::uuid; l text:=n->>'level_id'; t uuid:=(n->>'track_id')::uuid;
  g public.groups; p public.content_programs; must_check boolean:=false;
begin
  if tg_table_name in ('annual_student_records','groups') then
    must_check:=tg_op='INSERT' or (n->>'archived_at' is null and o->>'archived_at' is not null)
      or (n->>'level_id',n->>'track_id',n->>'primary_group_id') is distinct from (o->>'level_id',o->>'track_id',o->>'primary_group_id');
    if tg_op='UPDATE' and edra_private.offering_transition(a,l,old.track_id,'remove_track')
      and new.track_id is null and new.level_id=old.level_id then must_check:=false; end if;
  elsif tg_table_name='schedules' then
    must_check:=tg_op='INSERT' or (n->>'archived_at' is null and o->>'archived_at' is not null)
      or (n->>'audience',n->>'group_id',l,t) is distinct from (o->>'audience',o->>'group_id',o->>'level_id',(o->>'track_id')::uuid);
    if n->>'audience'='group' then
      select * into g from public.groups where id=(n->>'group_id')::uuid and academy_id=a;
      -- Leave invalid references to schedules_validate_write and its existing domain error.
      if not found then return new; end if;
      l:=g.level_id; t:=g.track_id;
    end if;
  elsif tg_table_name in ('schedule_slots','schedule_sessions') then
    perform edra_private.require_schedule_offering(new.schedule_id); return new;
  elsif tg_table_name in ('assignments','quizzes','exams') then
    if tg_op='UPDATE' and o->>'offering_closed_at' is not null and (
      n->>'offering_closed_at' is distinct from o->>'offering_closed_at'
      or (tg_table_name='assignments' and n->>'state'='active')
      or (n->>'opens_at',n->>'closes_at',n->>'actual_closes_at') is distinct from (o->>'opens_at',o->>'closes_at',o->>'actual_closes_at')) then
      raise exception 'offering_closed';
    end if;
    must_check:=tg_op='INSERT' or (n->>'audience',l,t) is distinct from (o->>'audience',o->>'level_id',(o->>'track_id')::uuid)
      or (n->>'opens_at',n->>'closes_at') is distinct from (o->>'opens_at',o->>'closes_at');
    if tg_op='UPDATE' and edra_private.offering_transition(a,coalesce(l,old.level_id),old.track_id,'remove_track')
      and n->>'audience'='level' and t is null then must_check:=false; end if;
    if tg_op='UPDATE' and edra_private.offering_transition(a,l,null,'stop_level') then must_check:=false; end if;
  elsif tg_table_name='content_programs' then must_check:=true;
  elsif tg_table_name='content_units' then
    select * into strict p from public.content_programs where id=new.program_id and academy_id=a;
    l:=p.level_id; t:=p.track_id;
    must_check:=tg_op='INSERT' or n->>'program_id' is distinct from o->>'program_id'
      or (n->>'state'='published' and (n->>'state' is distinct from o->>'state'
        or n->>'published_version' is distinct from o->>'published_version'));
    if must_check and n->>'state'='published' then
      select learning_epoch into new.offering_epoch from public.academy_levels where academy_id=a and level_id=l;
    end if;
  end if;
  if must_check and l is not null then perform edra_private.require_offering(a,l,t); end if;
  return new;
end $$;

commit;
