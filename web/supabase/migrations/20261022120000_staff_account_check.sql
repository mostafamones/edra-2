-- Staff accounts cannot use the student portal (owner decision, 2026-10-22). The web server sends a
-- signed-in account with any academy membership, suspended ones included, to the staff platform.
-- Membership RLS hides suspended rows from their own account, so the check runs as definer.
create or replace function public.is_staff_account()
returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from public.academy_memberships m where m.user_id = auth.uid());
$$;

revoke all on function public.is_staff_account() from public, anon;
grant execute on function public.is_staff_account() to authenticated;
