-- BEFORE-use guards run before foreign keys. Keep malformed offering references
-- distinguishable from stopped/retired offerings without permitting either use.
begin;

create or replace function edra_private.require_offering(p_academy uuid,p_level text,p_track uuid default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.academy_levels l
    where l.academy_id=p_academy and l.level_id=p_level) then
    raise exception using errcode='23503',message='Offering level foreign key violation';
  end if;
  if p_track is not null and not exists(select 1 from public.academy_tracks t
    where t.id=p_track and t.academy_id=p_academy and t.level_id=p_level) then
    raise exception using errcode='23503',message='Offering track foreign key violation';
  end if;
  if not edra_private.offering_available(p_academy,p_level,p_track) then
    raise exception using errcode='P0001',message='offering_unavailable';
  end if;
end $$;

commit;
