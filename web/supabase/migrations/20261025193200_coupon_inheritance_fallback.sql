-- A retired selection on the latest publication falls back to Regular, rather than
-- silently inheriting a different type from an older publication.
begin;
create or replace function edra_private.default_coupon_type(p_program uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.content_programs; result uuid;
begin
 select * into strict p from public.content_programs where id=p_program;
 select t.id into result from (
  select v.document->>'couponTypeId' as type_id
  from public.content_units u join public.content_programs source on source.id=u.program_id
  join public.content_revisions v on v.unit_id=u.id and v.revision=u.published_revision
  where u.academy_id=p.academy_id and u.state='published'
  and source.academic_year_id=p.academic_year_id and source.level_id=p.level_id
  and source.track_id is not distinct from p.track_id
  order by v.published_at desc,u.id limit 1
 ) latest join public.content_coupon_types t on t.id::text=latest.type_id
 where t.academy_id=p.academy_id and t.academic_year_id=p.academic_year_id
 and t.level_id is null and not t.retired;
 return coalesce(result,edra_private.academy_coupon_default(p.academy_id,p.academic_year_id));
end $$;
commit;
