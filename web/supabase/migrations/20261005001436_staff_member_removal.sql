-- Staff removal preserves profiles and academic history. Only membership access is removed.
create schema if not exists edra_private;
revoke all on schema edra_private from public, anon, authenticated;

create table edra_private.staff_member_removals (
  academy_id uuid not null references public.academies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  removed_by uuid references public.profiles(id) on delete set null,
  removed_at timestamptz not null default now(),
  primary key (academy_id, user_id)
);
alter table edra_private.staff_member_removals enable row level security;
revoke all on edra_private.staff_member_removals from public, anon, authenticated;

create function public.remove_staff_member(p_academy_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_role public.academy_role;
  target_role public.academy_role;
begin
  if actor is null or actor = p_user_id then
    return jsonb_build_object('result', 'forbidden');
  end if;
  -- Serialize with invitation acceptance for this recipient.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'academy_membership:' || p_academy_id::text || ':' || p_user_id::text, 0));
  select role into actor_role from public.academy_memberships
    where academy_id = p_academy_id and user_id = actor for share;
  if actor_role is null or actor_role not in ('owner', 'admin') then
    return jsonb_build_object('result', 'forbidden');
  end if;
  select role into target_role from public.academy_memberships
    where academy_id = p_academy_id and user_id = p_user_id for update;
  if target_role is null then return jsonb_build_object('result', 'not_found'); end if;
  if target_role = 'owner' or (actor_role = 'admin' and target_role <> 'instructor') then
    return jsonb_build_object('result', 'forbidden');
  end if;
  insert into edra_private.staff_member_removals (academy_id, user_id, removed_by)
    values (p_academy_id, p_user_id, actor)
    on conflict (academy_id, user_id) do update
      set removed_by = excluded.removed_by, removed_at = pg_catalog.clock_timestamp();
  delete from public.academy_memberships
    where academy_id = p_academy_id and user_id = p_user_id;
  -- Private user channel: no other academy or account receives this event.
  perform realtime.send(jsonb_build_object('academyId', p_academy_id),
    'staff_removed', 'staff-membership:' || p_user_id::text || ':' || p_academy_id::text, true);
  return jsonb_build_object('result', 'removed');
end;
$$;
revoke all on function public.remove_staff_member(uuid, uuid) from public, anon;
grant execute on function public.remove_staff_member(uuid, uuid) to authenticated;

-- Distinguish a previously removed member from an unknown/inaccessible academy (which remains 404).
create function public.was_removed_from_academy(p_slug text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from edra_private.staff_member_removals r
      join public.academies a on a.id = r.academy_id
    where r.user_id = auth.uid() and a.slug = p_slug
      and not exists (select 1 from public.academy_memberships m
        where m.academy_id = r.academy_id and m.user_id = auth.uid())
  );
$$;
revoke all on function public.was_removed_from_academy(text) from public, anon;
grant execute on function public.was_removed_from_academy(text) to authenticated;

create policy staff_receive_own_membership_events on realtime.messages
  for select to authenticated using (
    extension = 'broadcast' and realtime.topic() like 'staff-membership:' || (select auth.uid())::text || ':%'
  );
-- There is deliberately no INSERT policy: clients cannot forge removal events.
