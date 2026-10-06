-- Phone-targeted staff invitations.
--
-- An Owner invites Admins and Instructors; an Admin invites Instructors. An invitation is bound to
-- one normalized phone, expires seven days after creation (database time), can be revoked while
-- pending, and is accepted at most once. The raw link token is never stored: lookups use its SHA-256
-- digest, and `token_ciphertext` holds the token encrypted by the application with a server-only key
-- so a permitted manager can copy a pending link again. Neither column is ever returned to clients
-- except the ciphertext, and only to a manager allowed to copy that invitation.
--
-- Owner decisions: 7-day lifetime; links may be copied again while pending; Owner and Admin see every
-- invitation in their academy; one pending invitation per academy and phone; acceptance fails when
-- the creator no longer has authority to invite that role.
--
-- Clients have no table grants. Every read and write goes through the functions below, which derive
-- the actor from auth.uid() and re-read academy roles from academy_memberships on every call.
--
-- Lock order (every path that takes more than one lock follows it):
--   1. advisory lock on (academy, phone)      creation
--   2. invitation row FOR UPDATE              revoke, accept
--   3. advisory lock on (academy, user)       accept, before inserting the membership
--   4. creator membership row FOR SHARE       accept, inviter-authority recheck
--
-- Outcomes are returned as jsonb {"result": <code>, ...}; only programming errors raise.

create type public.staff_invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies (id) on delete cascade,
  phone text not null check (phone ~ '^\+201[0125][0-9]{8}$'),
  role public.academy_role not null check (role in ('admin', 'instructor')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_ciphertext text not null check (char_length(token_ciphertext) between 1 and 512),
  status public.staff_invitation_status not null default 'pending',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_by uuid references public.profiles (id),
  accepted_at timestamptz,
  revoked_by uuid references public.profiles (id),
  revoked_at timestamptz,
  constraint staff_invitations_expiry_after_creation check (expires_at > created_at),
  constraint staff_invitations_acceptance_metadata check (
    (status = 'accepted') = (accepted_by is not null)
    and (accepted_by is null) = (accepted_at is null)
  ),
  constraint staff_invitations_revocation_metadata check (
    (status = 'revoked') = (revoked_by is not null)
    and (revoked_by is null) = (revoked_at is null)
  )
);

-- One live invitation per academy and phone. Expired rows are retired under the creation lock.
create unique index staff_invitations_one_pending_per_phone
  on public.staff_invitations (academy_id, phone)
  where status = 'pending';

create index staff_invitations_academy_created_idx
  on public.staff_invitations (academy_id, created_at desc);

create index staff_invitations_creator_created_idx
  on public.staff_invitations (created_by, created_at desc);

-- Failed token lookups per account, so links cannot be probed from a signed-in session.
create table public.staff_invitation_lookup_limits (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  window_started_at timestamptz not null,
  failures integer not null check (failures >= 0)
);

alter table public.staff_invitations enable row level security;
alter table public.staff_invitation_lookup_limits enable row level security;

revoke all on public.staff_invitations from public, anon, authenticated;
revoke all on public.staff_invitation_lookup_limits from public, anon, authenticated;

-- Memberships are created only by trusted functions (academy setup, invitation acceptance). No write
-- policy ever existed; remove the default table grants as well.
revoke insert, update, delete, truncate on public.academy_memberships from anon, authenticated;

create or replace function public.staff_role_can_invite(
  actor_role public.academy_role,
  target_role public.academy_role
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    target_role in ('admin', 'instructor')
      and (actor_role = 'owner' or (actor_role = 'admin' and target_role = 'instructor')),
    false
  );
$$;

-- Revoking and copying a pending link: Owner for any invitation, Admin only for Instructor
-- invitations they created.
create or replace function public.staff_can_manage_invitation(
  actor uuid,
  actor_role public.academy_role,
  invitation_role public.academy_role,
  invitation_creator uuid
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    actor_role = 'owner'
      or (actor_role = 'admin' and invitation_role = 'instructor' and invitation_creator = actor),
    false
  );
$$;

create or replace function public.staff_invitation_digest(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

-- The account phone counts only once Supabase Auth has verified it. Auth stores it without "+".
create or replace function public.verified_account_phone(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.normalize_egyptian_phone(u.phone)
  from auth.users u
  where u.id = p_user_id and u.phone_confirmed_at is not null;
$$;

create or replace function public.staff_invitation_lookup_blocked(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_invitation_lookup_limits l
    where l.user_id = p_user_id
      and l.window_started_at > pg_catalog.clock_timestamp() - interval '15 minutes'
      and l.failures >= 20
  );
$$;

create or replace function public.note_staff_invitation_lookup_failure(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.staff_invitation_lookup_limits as l (user_id, window_started_at, failures)
  values (p_user_id, pg_catalog.clock_timestamp(), 1)
  on conflict (user_id) do update
  set window_started_at = case
        when l.window_started_at > pg_catalog.clock_timestamp() - interval '15 minutes'
          then l.window_started_at else pg_catalog.clock_timestamp() end,
      failures = case
        when l.window_started_at > pg_catalog.clock_timestamp() - interval '15 minutes'
          then l.failures + 1 else 1 end;
$$;

-- What the given account may learn about, and do with, an invitation right now. Callers that act on
-- the result hold the locks listed in the header first.
create or replace function public.staff_invitation_state(
  invitation public.staff_invitations,
  p_actor uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_phone text;
  creator_role public.academy_role;
  live boolean := invitation.status = 'pending' and invitation.expires_at > pg_catalog.clock_timestamp();
begin
  if invitation.status = 'accepted' then
    return case when invitation.accepted_by = p_actor then 'accepted' else 'unavailable' end;
  end if;

  actor_phone := public.verified_account_phone(p_actor);
  if actor_phone is null then return 'unverified'; end if;
  if actor_phone <> invitation.phone then
    return case when live then 'wrong_account' else 'unavailable' end;
  end if;

  if invitation.status = 'revoked' then return 'revoked'; end if;
  if not live then return 'expired'; end if;

  select m.role into creator_role
  from public.academy_memberships m
  where m.academy_id = invitation.academy_id and m.user_id = invitation.created_by;
  if not public.staff_role_can_invite(creator_role, invitation.role) then
    return 'inviter_unavailable';
  end if;

  if exists (
    select 1 from public.academy_memberships m
    where m.academy_id = invitation.academy_id and m.user_id = p_actor
  ) then
    return 'already_member';
  end if;

  return 'valid';
end;
$$;

-- Academy details are shown only to the invited account, never to wrong-phone or unverified visitors.
create or replace function public.staff_invitation_response(
  state text,
  invitation public.staff_invitations
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when state in ('valid', 'joined', 'accepted', 'already_member', 'revoked', 'expired', 'inviter_unavailable') then
      jsonb_build_object(
        'result', state,
        'role', invitation.role,
        'expiresAt', invitation.expires_at,
        'academy', (
          select jsonb_build_object('id', a.id, 'name', a.name, 'slug', a.slug, 'icon', a.icon)
          from public.academies a where a.id = invitation.academy_id
        )
      )
    else jsonb_build_object('result', state)
  end;
$$;

create or replace function public.create_staff_invitation(
  p_academy_id uuid,
  p_phone text,
  p_role public.academy_role,
  p_token text,
  p_token_ciphertext text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_role public.academy_role;
  invite_phone text := public.normalize_egyptian_phone(p_phone);
  created_at_value timestamptz;
  created public.staff_invitations%rowtype;
  failed_constraint text;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$'
    or p_token_ciphertext is null or char_length(p_token_ciphertext) not between 1 and 512 then
    raise exception using errcode = 'P0001', message = 'invalid_token';
  end if;
  if actor is null or p_academy_id is null then
    return jsonb_build_object('result', 'forbidden');
  end if;

  select m.role into actor_role
  from public.academy_memberships m
  where m.academy_id = p_academy_id and m.user_id = actor;
  if p_role is null or not public.staff_role_can_invite(actor_role, p_role) then
    return jsonb_build_object('result', 'forbidden');
  end if;
  if invite_phone is null then
    return jsonb_build_object('result', 'invalid_phone');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('staff_invitation:' || p_academy_id::text || ':' || invite_phone, 0)
  );

  if (
    select count(*) from public.staff_invitations i
    where i.academy_id = p_academy_id
      and i.created_by = actor
      and i.created_at > pg_catalog.clock_timestamp() - interval '1 hour'
  ) >= 30 then
    return jsonb_build_object('result', 'rate_limited');
  end if;

  update public.staff_invitations i
  set status = 'expired'
  where i.academy_id = p_academy_id
    and i.phone = invite_phone
    and i.status = 'pending'
    and i.expires_at <= pg_catalog.clock_timestamp();

  if exists (
    select 1 from public.staff_invitations i
    where i.academy_id = p_academy_id and i.phone = invite_phone and i.status = 'pending'
  ) then
    return jsonb_build_object('result', 'pending_exists');
  end if;

  -- Only reveals whether the phone already belongs to a member of the actor's own academy.
  if exists (
    select 1
    from public.academy_memberships m
    join auth.users u on u.id = m.user_id
    where m.academy_id = p_academy_id
      and u.phone_confirmed_at is not null
      and public.normalize_egyptian_phone(u.phone) = invite_phone
  ) then
    return jsonb_build_object('result', 'already_member');
  end if;

  created_at_value := pg_catalog.clock_timestamp();
  insert into public.staff_invitations as i (
    academy_id, phone, role, token_hash, token_ciphertext, created_by, created_at, expires_at
  )
  values (
    p_academy_id, invite_phone, p_role, public.staff_invitation_digest(p_token), p_token_ciphertext,
    actor, created_at_value, created_at_value + interval '7 days'
  )
  returning i.* into created;

  return jsonb_build_object(
    'result', 'created',
    'invitation', jsonb_build_object(
      'id', created.id,
      'phone', created.phone,
      'role', created.role,
      'createdAt', created.created_at,
      'expiresAt', created.expires_at
    )
  );
exception
  when unique_violation then
    get stacked diagnostics failed_constraint = constraint_name;
    if failed_constraint = 'staff_invitations_one_pending_per_phone' then
      return jsonb_build_object('result', 'pending_exists');
    end if;
    raise;
end;
$$;

create or replace function public.list_staff_invitations(
  p_academy_id uuid,
  p_status text,
  p_page_index integer,
  p_page_size integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_role public.academy_role;
  page jsonb;
  total integer;
begin
  select m.role into actor_role
  from public.academy_memberships m
  where m.academy_id = p_academy_id and m.user_id = actor;
  if actor is null or actor_role is null or actor_role not in ('owner', 'admin') then
    raise exception using errcode = 'P0001', message = 'forbidden';
  end if;
  if (p_status is not null and p_status not in ('pending', 'accepted', 'revoked', 'expired'))
    or p_page_index is null or p_page_index < 0
    or p_page_size is null or p_page_size not between 1 and 100 then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;

  with invitations as (
    select i.*,
      case
        when i.status = 'pending' and i.expires_at <= pg_catalog.clock_timestamp() then 'expired'
        else i.status::text
      end as effective_status
    from public.staff_invitations i
    where i.academy_id = p_academy_id
  ),
  filtered as (
    select * from invitations where p_status is null or effective_status = p_status
  )
  select
    (select count(*) from filtered),
    coalesce((
      select jsonb_agg(row_data order by created_at desc, id)
      from (
        select f.created_at, f.id, jsonb_build_object(
          'id', f.id,
          'phone', f.phone,
          'role', f.role,
          'status', f.effective_status,
          'createdAt', f.created_at,
          'expiresAt', f.expires_at,
          'acceptedAt', f.accepted_at,
          'revokedAt', f.revoked_at,
          'createdByName', creator.full_name,
          'acceptedByName', acceptor.full_name,
          'revokedByName', revoker.full_name,
          'canManage', f.effective_status = 'pending'
            and public.staff_can_manage_invitation(actor, actor_role, f.role, f.created_by)
        ) as row_data
        from filtered f
        left join public.profiles creator on creator.id = f.created_by
        left join public.profiles acceptor on acceptor.id = f.accepted_by
        left join public.profiles revoker on revoker.id = f.revoked_by
        order by f.created_at desc, f.id
        limit p_page_size offset p_page_index * p_page_size
      ) rows_page
    ), '[]'::jsonb)
  into total, page;

  return jsonb_build_object('rows', page, 'total', total);
end;
$$;

-- Returns the encrypted token of a pending invitation to a manager allowed to copy it. The
-- application decrypts it with its server-only key.
create or replace function public.staff_invitation_link_ciphertext(
  p_academy_id uuid,
  p_invitation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_role public.academy_role;
  invitation public.staff_invitations%rowtype;
begin
  select m.role into actor_role
  from public.academy_memberships m
  where m.academy_id = p_academy_id and m.user_id = actor;
  if actor is null or actor_role is null then return jsonb_build_object('result', 'forbidden'); end if;

  select * into invitation
  from public.staff_invitations i
  where i.id = p_invitation_id and i.academy_id = p_academy_id;
  if not found then return jsonb_build_object('result', 'not_found'); end if;
  if not public.staff_can_manage_invitation(actor, actor_role, invitation.role, invitation.created_by) then
    return jsonb_build_object('result', 'forbidden');
  end if;
  if invitation.status <> 'pending' or invitation.expires_at <= pg_catalog.clock_timestamp() then
    return jsonb_build_object('result', 'not_pending');
  end if;

  return jsonb_build_object('result', 'ok', 'ciphertext', invitation.token_ciphertext);
end;
$$;

create or replace function public.revoke_staff_invitation(
  p_academy_id uuid,
  p_invitation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_role public.academy_role;
  invitation public.staff_invitations%rowtype;
begin
  if actor is null then return jsonb_build_object('result', 'forbidden'); end if;

  select * into invitation
  from public.staff_invitations i
  where i.id = p_invitation_id and i.academy_id = p_academy_id
  for update;
  if not found then return jsonb_build_object('result', 'not_found'); end if;

  select m.role into actor_role
  from public.academy_memberships m
  where m.academy_id = p_academy_id and m.user_id = actor;
  if not public.staff_can_manage_invitation(actor, actor_role, invitation.role, invitation.created_by) then
    return jsonb_build_object('result', 'forbidden');
  end if;

  if invitation.status = 'accepted' then return jsonb_build_object('result', 'already_accepted'); end if;
  if invitation.status = 'revoked' then return jsonb_build_object('result', 'revoked'); end if;
  if invitation.status = 'expired' or invitation.expires_at <= pg_catalog.clock_timestamp() then
    update public.staff_invitations i set status = 'expired'
    where i.id = invitation.id and i.status = 'pending';
    return jsonb_build_object('result', 'expired');
  end if;

  update public.staff_invitations i
  set status = 'revoked', revoked_by = actor, revoked_at = pg_catalog.clock_timestamp()
  where i.id = invitation.id;
  return jsonb_build_object('result', 'revoked');
end;
$$;

-- Read-only: opening or previewing a link never consumes it and grants no academy access.
create or replace function public.preview_staff_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  invitation public.staff_invitations%rowtype;
begin
  if actor is null then return jsonb_build_object('result', 'unauthenticated'); end if;
  if public.staff_invitation_lookup_blocked(actor) then
    return jsonb_build_object('result', 'rate_limited');
  end if;

  if p_token is not null and p_token ~ '^[A-Za-z0-9_-]{43}$' then
    select * into invitation
    from public.staff_invitations i
    where i.token_hash = public.staff_invitation_digest(p_token);
  end if;
  if invitation.id is null then
    perform public.note_staff_invitation_lookup_failure(actor);
    return jsonb_build_object('result', 'unavailable');
  end if;

  return public.staff_invitation_response(public.staff_invitation_state(invitation, actor), invitation);
end;
$$;

create or replace function public.accept_staff_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  invitation public.staff_invitations%rowtype;
  state text;
begin
  if actor is null then return jsonb_build_object('result', 'unauthenticated'); end if;
  if public.staff_invitation_lookup_blocked(actor) then
    return jsonb_build_object('result', 'rate_limited');
  end if;

  if p_token is not null and p_token ~ '^[A-Za-z0-9_-]{43}$' then
    select * into invitation
    from public.staff_invitations i
    where i.token_hash = public.staff_invitation_digest(p_token)
    for update;
  end if;
  if invitation.id is null then
    perform public.note_staff_invitation_lookup_failure(actor);
    return jsonb_build_object('result', 'unavailable');
  end if;

  -- A retry by the successful recipient returns the original outcome without writing.
  if invitation.status = 'accepted' then
    return public.staff_invitation_response(public.staff_invitation_state(invitation, actor), invitation);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('academy_membership:' || invitation.academy_id::text || ':' || actor::text, 0)
  );
  perform 1 from public.academy_memberships m
  where m.academy_id = invitation.academy_id and m.user_id = invitation.created_by
  for share;

  -- Evaluated after every lock wait, against the current wall clock.
  state := public.staff_invitation_state(invitation, actor);

  if state = 'expired' and invitation.status = 'pending' then
    update public.staff_invitations i set status = 'expired' where i.id = invitation.id;
  end if;
  if state <> 'valid' then
    return public.staff_invitation_response(state, invitation);
  end if;

  begin
    insert into public.academy_memberships (academy_id, user_id, role, created_by)
    values (invitation.academy_id, actor, invitation.role, invitation.created_by);
  exception
    when unique_violation then
      return public.staff_invitation_response('already_member', invitation);
  end;

  update public.staff_invitations i
  set status = 'accepted', accepted_by = actor, accepted_at = pg_catalog.clock_timestamp()
  where i.id = invitation.id
  returning i.* into invitation;

  return public.staff_invitation_response('joined', invitation);
end;
$$;

revoke all on function public.staff_role_can_invite(public.academy_role, public.academy_role) from public, anon, authenticated;
revoke all on function public.staff_can_manage_invitation(uuid, public.academy_role, public.academy_role, uuid) from public, anon, authenticated;
revoke all on function public.staff_invitation_digest(text) from public, anon, authenticated;
revoke all on function public.verified_account_phone(uuid) from public, anon, authenticated;
revoke all on function public.staff_invitation_lookup_blocked(uuid) from public, anon, authenticated;
revoke all on function public.note_staff_invitation_lookup_failure(uuid) from public, anon, authenticated;
revoke all on function public.staff_invitation_state(public.staff_invitations, uuid) from public, anon, authenticated;
revoke all on function public.staff_invitation_response(text, public.staff_invitations) from public, anon, authenticated;
revoke all on function public.create_staff_invitation(uuid, text, public.academy_role, text, text) from public, anon;
revoke all on function public.list_staff_invitations(uuid, text, integer, integer) from public, anon;
revoke all on function public.staff_invitation_link_ciphertext(uuid, uuid) from public, anon;
revoke all on function public.revoke_staff_invitation(uuid, uuid) from public, anon;
revoke all on function public.preview_staff_invitation(text) from public, anon;
revoke all on function public.accept_staff_invitation(text) from public, anon;

grant execute on function public.create_staff_invitation(uuid, text, public.academy_role, text, text) to authenticated;
grant execute on function public.list_staff_invitations(uuid, text, integer, integer) to authenticated;
grant execute on function public.staff_invitation_link_ciphertext(uuid, uuid) to authenticated;
grant execute on function public.revoke_staff_invitation(uuid, uuid) to authenticated;
grant execute on function public.preview_staff_invitation(text) to authenticated;
grant execute on function public.accept_staff_invitation(text) to authenticated;
