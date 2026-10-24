-- Accept the academy-wide coupon contract already supported in development.
-- Nullable grade types apply across grades; tenant/year and staff authority stay unchanged.
begin;
do $$
declare definition text; updated text;
begin
  definition:=pg_get_functiondef('public.get_scoped_content_coupons(uuid,uuid,text,uuid,uuid,text,text,integer)'::regprocedure);
  updated:=replace(definition,'t.academic_year_id=p_year_id and t.level_id=p_level_id',
    't.academic_year_id=p_year_id and (t.level_id is null or t.level_id=p_level_id)');
  if updated=definition then raise exception 'Scoped coupon list contract changed'; end if;
  execute updated;
end $$;
commit;
