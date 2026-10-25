-- Owner-approved development coupon reset. Preserve grants and published documents.
begin;
alter table public.content_coupon_redemptions disable trigger content_coupon_redemption_history;
alter table public.content_coupon_batches disable trigger content_coupon_batch_history;
alter table edra_private.content_access_requests disable trigger content_request_history;
delete from public.content_coupon_redemptions;
delete from public.content_coupons;
delete from public.content_coupon_batches;
delete from edra_private.content_access_requests where operation like 'coupon%';
alter table edra_private.content_access_requests enable trigger content_request_history;
alter table public.content_coupon_redemptions enable trigger content_coupon_redemption_history;
alter table public.content_coupon_batches enable trigger content_coupon_batch_history;
-- Keep old type identities solely for immutable publication references.
update public.content_coupon_types set retired=true,is_default=false where level_id is not null;
alter table public.content_coupon_types add constraint content_coupon_academy_only check(retired or (level_id is null and track_id is null and program_id is null));

create or replace function edra_private.default_coupon_type(p_program uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.content_programs; result uuid;
begin
 select * into strict p from public.content_programs where id=p_program;
 select t.id into result from public.content_units u join public.content_programs source on source.id=u.program_id
 join public.content_revisions v on v.unit_id=u.id and v.revision=u.published_revision
 join public.content_coupon_types t on t.id::text=v.document->>'couponTypeId'
 where u.academy_id=p.academy_id and u.state='published' and source.academic_year_id=p.academic_year_id
 and source.level_id=p.level_id and source.track_id is not distinct from p.track_id
 and t.academy_id=p.academy_id and t.academic_year_id=p.academic_year_id and t.level_id is null and not t.retired
 order by v.published_at desc,u.id limit 1;
 return coalesce(result,edra_private.academy_coupon_default(p.academy_id,p.academic_year_id));
end $$;
-- Repair working selections without rewriting a published snapshot or existing access.
update public.content_units u set draft=jsonb_set(u.draft,'{couponTypeId}',to_jsonb(edra_private.academy_coupon_default(u.academy_id,p.academic_year_id))),version=u.version+1,updated_at=now()
 from public.content_programs p,public.content_coupon_types old
 where p.id=u.program_id and old.id::text=u.draft->>'couponTypeId' and old.level_id is not null;

create or replace function public.get_content_coupon_options(p_academy_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform edra_private.learning_actor(p_academy_id);
 return jsonb_build_object('programs',coalesce((select jsonb_agg(jsonb_build_object('id',y.id,'yearId',y.id,'year',y.start_year,'closed',y.closed_at is not null,'levelId',null,'level',null,'trackId',null,'track',null) order by y.start_year desc) from public.academic_years y where y.academy_id=p_academy_id),'[]'::jsonb),
 'types',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'programId',null,'yearId',t.academic_year_id,'levelId',null,'trackId',null,'name',t.name,'prefix',t.prefix,'isDefault',t.is_default,'allTracks',true) order by t.is_default desc,t.name,t.id) from public.content_coupon_types t where t.academy_id=p_academy_id and t.level_id is null and not t.retired),'[]'::jsonb));
end $$;

-- All manual type mutations require management authority, including legacy endpoints.
do $$ declare signature text; definition text; updated text;
begin
 foreach signature in array array['public.create_academy_coupon_type(uuid,uuid,text,text,uuid)','public.rename_content_coupon_type(uuid,uuid,text,uuid)','public.change_content_coupon_prefix(uuid,uuid,text,uuid)','public.change_academy_default_prefix(uuid,uuid,text,uuid)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  updated:=replace(definition,'edra_private.learning_actor(p_academy_id);','edra_private.learning_actor(p_academy_id,true);');
  if updated=definition and position('learning_actor(p_academy_id,true)' in definition)=0 then raise exception 'Type authority contract changed: %',signature; end if;
  execute updated;
 end loop;
end $$;
revoke all on function public.create_content_coupon_type(uuid,uuid,text,uuid,text,boolean),public.create_scoped_coupon_type(uuid,uuid,text,uuid,text,text,boolean,uuid),public.generate_default_coupons(uuid,uuid,text,uuid,integer,uuid),public.change_default_coupon_prefix(uuid,uuid,text,uuid,text,uuid) from public,anon,authenticated;

-- Existing legacy publications accept the academy Regular after the approved reset.
-- A new publication still accepts its explicitly chosen academy type only.
do $$ declare definition text; updated text; start_at integer; end_at integer;
begin
 definition:=pg_get_functiondef('public.redeem_content_coupon(uuid,uuid,text,uuid)'::regprocedure);
 updated:=replace(definition,'(scope->''document''->>''couponTypeId'')::uuid is distinct from t.id',
  '(scope->''document''->>''couponTypeId'')::uuid is distinct from t.id and not (t.is_default and t.level_id is null and exists(select 1 from public.content_coupon_types legacy where legacy.id::text=scope->''document''->>''couponTypeId'' and legacy.academy_id=p_academy_id and legacy.level_id is not null and legacy.retired))');
 if updated=definition then raise exception 'Redemption selection contract changed'; end if;
 -- Parenthesize the selected-type alternative so it never bypasses the year/audience checks.
 updated:=replace(updated,'or (scope->''document''->>''couponTypeId'')::uuid is distinct', 'or ((scope->''document''->>''couponTypeId'')::uuid is distinct');
 updated:=replace(updated,'and legacy.retired)) then raise exception ''coupon_type_mismatch''','and legacy.retired))) then raise exception ''coupon_type_mismatch''');
 execute updated;
 definition:=pg_get_functiondef('public.get_content_requirement_options(uuid,uuid)'::regprocedure);
 updated:=replace(definition,'where t.academy_id=p_academy_id and','where t.level_id is null and t.academy_id=p_academy_id and');
 if updated=definition then raise exception 'Requirement options contract changed'; end if; execute updated;
end $$;

-- Developer shortcuts use live profile/role/participation, not synthetic seed labels.
create or replace function public.dev_run_targets(p_run_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'staff',coalesce((select jsonb_agg(jsonb_build_object('logical_id',a.logical_id,'role',m.role,'display_name',coalesce(nullif(btrim(p.display_name),''),nullif(btrim(p.full_name),''),a.display_name)) order by array_position(array['owner','head_admin','admin','instructor'],m.role::text),a.logical_id)
 from edra_private.dev_accounts a join public.academy_memberships m on m.user_id=a.user_id and m.academy_id=r.academy_id left join public.profiles p on p.id=a.user_id where a.run_id=r.id and a.kind<>'student' and a.state='loaded'),'[]'::jsonb),
 'students',coalesce((select jsonb_agg(jsonb_build_object('logical_id',a.logical_id,'display_name',coalesce(nullif(btrim(p.display_name),''),nullif(btrim(p.full_name),''),a.display_name),'annual_student_record_id',a.annual_student_record_id,'participation_type',s.participation_type) order by a.logical_id)
 from edra_private.dev_accounts a left join public.profiles p on p.id=a.user_id left join public.annual_student_records s on s.id=a.annual_student_record_id where a.run_id=r.id and a.kind='student' and a.state='loaded'),'[]'::jsonb)) from edra_private.dev_runs r where r.id=p_run_id and r.state='ready';
$$;
revoke all on function public.dev_run_targets(uuid) from public,anon,authenticated;
grant execute on function public.dev_run_targets(uuid) to service_role;
commit;
