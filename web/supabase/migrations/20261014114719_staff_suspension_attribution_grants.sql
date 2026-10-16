-- The legacy table-wide SELECT grant also exposed the later-added suspended_by column.
-- Keep membership and suspension state readable through RLS; actor attribution remains private.
revoke select on public.academy_memberships from authenticated;
revoke select (suspended_by) on public.academy_memberships from authenticated;
grant select (academy_id, user_id, role, created_by, created_at, suspended_at)
  on public.academy_memberships to authenticated;
