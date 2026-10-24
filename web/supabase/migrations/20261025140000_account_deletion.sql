-- Self-service account deletion. Academy history references profiles without cascading, so the
-- account is anonymized instead of removed: personal data and sign-in identity are erased, the
-- profile row stays as "Deleted user" for attribution. Owners must transfer their academy first.

-- The phone guard admits the deleting account's own phone erasure inside delete_my_account.
create or replace function edra_private.guard_auth_phone_change()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c public.account_contact_changes%rowtype;
begin
  if old.phone_confirmed_at is null or nullif(old.phone, '') is null then return new; end if;
  if new.phone is null and current_setting('edra.deleting_account', true) = new.id::text then return new; end if;
  select * into c from public.account_contact_changes where user_id = new.id and purpose = 'login_phone' for update;
  if not found or c.stage <> 'committing' or c.old_phone is distinct from old.phone
    or edra_private.digits(c.new_phone) is distinct from new.phone then
    raise exception using errcode = 'P0001', message = 'phone_change_requires_verification';
  end if;
  update public.account_contact_changes set stage = 'completed', code_hash = null, expires_at = null, updated_at = now()
  where user_id = new.id and purpose = 'login_phone';
  return new;
end;
$$;

create function public.delete_my_account()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not edra_auth.session_allowed() then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if exists (select 1 from public.academy_memberships where user_id = me and role = 'owner') then
    raise exception using errcode = 'P0001', message = 'owner_must_transfer';
  end if;

  delete from public.academy_memberships where user_id = me;
  delete from public.student_profiles where user_id = me;
  delete from public.account_contact_changes where user_id = me;
  delete from public.account_password_challenges where user_id = me;
  update public.profiles set full_name = 'Deleted user', display_name = null, avatar_path = null, updated_at = now()
  where id = me;

  perform set_config('edra.deleting_account', me::text, true);
  -- Erasing the phone also clears profiles.phone through the sync trigger.
  update auth.users set phone = null, phone_confirmed_at = null, email = null, email_confirmed_at = null,
    encrypted_password = '', raw_user_meta_data = '{}'::jsonb, banned_until = 'infinity', updated_at = now()
  where id = me;
  delete from auth.identities where user_id = me;
  delete from auth.sessions where user_id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
