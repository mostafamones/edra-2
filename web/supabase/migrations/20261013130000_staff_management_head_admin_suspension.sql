-- Four-role staff management with suspension and restoration.
--
-- Appointment/management matrix (staff_role_can_invite decides both):
--   Owner      -> Head Admin, Admin, Instructor
--   Head Admin -> Admin, Instructor
--   Admin      -> Instructor
--   Instructor -> nobody
-- A role change needs authority over the member's current role and over the proposed role, so an
-- Admin cannot promote an Instructor and a Head Admin cannot touch a peer Head Admin. Nobody manages
-- the Owner or themselves. Every actor check requires the actor's own active membership.
--
-- Suspension keeps the membership, role and attribution; restoration only clears it and never
-- inserts a membership (a removed member needs a new invitation). A role change never restores
-- access. Acceptance never changes or restores an existing membership.
--
-- Lock order for every membership change: the target membership advisory lock (shared with
-- invitation acceptance), then the actor and target membership rows in user_id order (actor FOR
-- SHARE, target FOR UPDATE). Acceptance takes the invitation row, the recipient advisory lock and
-- then the creator row FOR SHARE. Neither path waits for an advisory lock while holding a row lock,
-- and row locks are always taken in one global order, so opposing operations cannot deadlock.

alter table public.staff_invitations drop constraint staff_invitations_role_check;
alter table public.staff_invitations add constraint staff_invitations_role_check
  check (role in ('head_admin', 'admin', 'instructor'));

create or replace function public.staff_role_can_invite(actor_role public.academy_role, target_role public.academy_role)
returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(case actor_role
    when 'owner' then target_role in ('head_admin', 'admin', 'instructor')
    when 'head_admin' then target_role in ('admin', 'instructor')
    when 'admin' then target_role = 'instructor'
    else false
  end, false);
$$;

-- Owners and Head Admins manage invitations for roles they may appoint; Admins only their own
-- Instructor invitations.
create or replace function public.staff_can_manage_invitation(
  actor uuid, actor_role public.academy_role, invitation_role public.academy_role, invitation_creator uuid
)
returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(
    (actor_role in ('owner', 'head_admin') and public.staff_role_can_invite(actor_role, invitation_role))
      or (actor_role = 'admin' and invitation_role = 'instructor' and invitation_creator = actor),
    false
  );
$$;

-- Takes the membership locks described above and reports both memberships. actor_role is null
-- unless the actor's membership is active and their session is allowed.
create function edra_private.lock_staff_memberships(
  p_academy_id uuid, p_actor uuid, p_target uuid,
  out actor_role public.academy_role, out target_role public.academy_role, out target_suspended_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare
  actor_suspended_at timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'academy_membership:' || p_academy_id::text || ':' || p_target::text, 0));
  if p_actor < p_target then
    select m.role, m.suspended_at into actor_role, actor_suspended_at from public.academy_memberships m
      where m.academy_id = p_academy_id and m.user_id = p_actor for share;
    select m.role, m.suspended_at into target_role, target_suspended_at from public.academy_memberships m
      where m.academy_id = p_academy_id and m.user_id = p_target for update;
  else
    select m.role, m.suspended_at into target_role, target_suspended_at from public.academy_memberships m
      where m.academy_id = p_academy_id and m.user_id = p_target for update;
    select m.role, m.suspended_at into actor_role, actor_suspended_at from public.academy_memberships m
      where m.academy_id = p_academy_id and m.user_id = p_actor for share;
  end if;
  if actor_suspended_at is not null or not edra_auth.session_allowed() then
    actor_role := null;
  end if;
end;
$$;
revoke all on function edra_private.lock_staff_memberships(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.change_staff_member_role(p_academy_id uuid, p_user_id uuid, p_role public.academy_role)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  locked record;
begin
  if actor is null or p_academy_id is null or p_user_id is null or actor = p_user_id or p_role is null then
    return jsonb_build_object('result', 'forbidden');
  end if;
  select * into locked from edra_private.lock_staff_memberships(p_academy_id, actor, p_user_id);
  if locked.actor_role is null or locked.actor_role = 'instructor' then
    return jsonb_build_object('result', 'forbidden');
  end if;
  if locked.target_role is null then return jsonb_build_object('result', 'not_found'); end if;
  if not public.staff_role_can_invite(locked.actor_role, locked.target_role)
    or not public.staff_role_can_invite(locked.actor_role, p_role) then
    return jsonb_build_object('result', 'forbidden');
  end if;
  if locked.target_role = p_role then return jsonb_build_object('result', 'unchanged'); end if;
  -- Suspension is untouched: changing a suspended member's role does not restore access.
  update public.academy_memberships set role = p_role
    where academy_id = p_academy_id and user_id = p_user_id;
  insert into edra_private.staff_access_events (academy_id, user_id, action, from_role, to_role, actor_id)
    values (p_academy_id, p_user_id, 'role_changed', locked.target_role, p_role, actor);
  perform realtime.send(jsonb_build_object('academyId', p_academy_id),
    'staff_role_changed', 'staff-membership:' || p_user_id::text || ':' || p_academy_id::text, true);
  return jsonb_build_object('result', 'role_changed');
end;
$$;

create function public.suspend_staff_member(p_academy_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  locked record;
begin
  if actor is null or p_academy_id is null or p_user_id is null or actor = p_user_id then
    return jsonb_build_object('result', 'forbidden');
  end if;
  select * into locked from edra_private.lock_staff_memberships(p_academy_id, actor, p_user_id);
  if locked.actor_role is null or locked.actor_role = 'instructor' then
    return jsonb_build_object('result', 'forbidden');
  end if;
  if locked.target_role is null then return jsonb_build_object('result', 'not_found'); end if;
  if not public.staff_role_can_invite(locked.actor_role, locked.target_role) then
    return jsonb_build_object('result', 'forbidden');
  end if;
  if locked.target_suspended_at is not null then return jsonb_build_object('result', 'unchanged'); end if;
  update public.academy_memberships set suspended_at = pg_catalog.clock_timestamp(), suspended_by = actor
    where academy_id = p_academy_id and user_id = p_user_id;
  insert into edra_private.staff_access_events (academy_id, user_id, action, from_role, to_role, actor_id)
    values (p_academy_id, p_user_id, 'suspended', locked.target_role, locked.target_role, actor);
  -- Private user channel: no other academy or account receives this event.
  perform realtime.send(jsonb_build_object('academyId', p_academy_id),
    'staff_suspended', 'staff-membership:' || p_user_id::text || ':' || p_academy_id::text, true);
  return jsonb_build_object('result', 'suspended');
end;
$$;

create function public.restore_staff_member(p_academy_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  locked record;
begin
  if actor is null or p_academy_id is null or p_user_id is null or actor = p_user_id then
    return jsonb_build_object('result', 'forbidden');
  end if;
  select * into locked from edra_private.lock_staff_memberships(p_academy_id, actor, p_user_id);
  if locked.actor_role is null or locked.actor_role = 'instructor' then
    return jsonb_build_object('result', 'forbidden');
  end if;
  -- A removed member has no row to restore; returning requires a new invitation.
  if locked.target_role is null then return jsonb_build_object('result', 'not_found'); end if;
  if not public.staff_role_can_invite(locked.actor_role, locked.target_role) then
    return jsonb_build_object('result', 'forbidden');
  end if;
  if locked.target_suspended_at is null then return jsonb_build_object('result', 'unchanged'); end if;
  update public.academy_memberships set suspended_at = null, suspended_by = null
    where academy_id = p_academy_id and user_id = p_user_id;
  insert into edra_private.staff_access_events (academy_id, user_id, action, from_role, to_role, actor_id)
    values (p_academy_id, p_user_id, 'restored', locked.target_role, locked.target_role, actor);
  perform realtime.send(jsonb_build_object('academyId', p_academy_id),
    'staff_restored', 'staff-membership:' || p_user_id::text || ':' || p_academy_id::text, true);
  return jsonb_build_object('result', 'restored');
end;
$$;

create or replace function public.remove_staff_member(p_academy_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  locked record;
begin
  if actor is null or p_academy_id is null or p_user_id is null or actor = p_user_id then
    return jsonb_build_object('result', 'forbidden');
  end if;
  select * into locked from edra_private.lock_staff_memberships(p_academy_id, actor, p_user_id);
  if locked.actor_role is null or locked.actor_role = 'instructor' then
    return jsonb_build_object('result', 'forbidden');
  end if;
  if locked.target_role is null then return jsonb_build_object('result', 'not_found'); end if;
  if not public.staff_role_can_invite(locked.actor_role, locked.target_role) then
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

revoke all on function public.suspend_staff_member(uuid, uuid) from public, anon;
revoke all on function public.restore_staff_member(uuid, uuid) from public, anon;
grant execute on function public.suspend_staff_member(uuid, uuid) to authenticated;
grant execute on function public.restore_staff_member(uuid, uuid) to authenticated;

-- The signed-in account's own suspended memberships, so the app can explain a suspension instead
-- of treating it as removal or offering an old invitation. Discloses nothing about coworkers.
create function public.own_suspended_staff_academies()
returns table (id uuid, name text, slug text, icon text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.name, a.slug, a.icon
  from public.academy_memberships m
  join public.academies a on a.id = m.academy_id
  where m.user_id = auth.uid() and m.suspended_at is not null and edra_auth.session_allowed()
  order by a.name, a.id;
$$;
revoke all on function public.own_suspended_staff_academies() from public, anon;
grant execute on function public.own_suspended_staff_academies() to authenticated;

-- Invitation functions: identical except that the actor's authority comes from academy_role_for
-- (active membership and allowed session), and the creator must still hold an active membership
-- with authority over the invitation's role when it is accepted.

create or replace function public.create_staff_invitation(
  p_academy_id uuid, p_phone text, p_role public.academy_role, p_token text, p_token_ciphertext text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
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

  actor_role := public.academy_role_for(p_academy_id);
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

  -- Only reveals whether the phone already belongs to a member (active or suspended) of the actor's
  -- own academy.
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

create or replace function public.list_staff_invitations(p_academy_id uuid, p_status text, p_page_index integer, p_page_size integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_role public.academy_role;
  page jsonb;
  total integer;
begin
  actor_role := public.academy_role_for(p_academy_id);
  if actor is null or actor_role is null or actor_role not in ('owner', 'head_admin', 'admin') then
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

create or replace function public.revoke_staff_invitation(p_academy_id uuid, p_invitation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
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

  actor_role := public.academy_role_for(p_academy_id);
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

create or replace function public.staff_invitation_link_ciphertext(p_academy_id uuid, p_invitation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_role public.academy_role;
  invitation public.staff_invitations%rowtype;
begin
  actor_role := public.academy_role_for(p_academy_id);
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

-- An existing membership, active or suspended, always reports already_member: acceptance never
-- restores access or changes a role.
create or replace function public.staff_invitation_state(invitation public.staff_invitations, p_actor uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
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

  -- A suspended, removed or demoted creator no longer has authority to appoint this role.
  select m.role into creator_role
  from public.academy_memberships m
  where m.academy_id = invitation.academy_id and m.user_id = invitation.created_by
    and m.suspended_at is null;
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
