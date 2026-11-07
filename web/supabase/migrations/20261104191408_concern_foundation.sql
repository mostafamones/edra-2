-- Minimum authority substrate for messaging. Lifecycle commands follow in EDRA-292.
create table public.concerns (
  id uuid primary key,
  academy_id uuid not null references public.academies(id),
  title text not null check (length(btrim(title)) > 0),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  status text not null default 'ongoing' check (status in ('ongoing', 'settled')),
  version bigint not null default 1 check (version > 0),
  settled_at timestamptz,
  settled_by uuid references public.profiles(id),
  outcome text,
  unique (academy_id, id),
  check ((status = 'ongoing' and settled_at is null and settled_by is null and outcome is null)
    or (status = 'settled' and settled_at is not null and settled_by is not null and length(btrim(outcome)) > 0 and outcome is not null))
);
create index concerns_academy_updated_idx on public.concerns(academy_id, updated_at desc, id);

create table public.concern_participants (
  academy_id uuid not null,
  concern_id uuid not null,
  user_id uuid not null references public.profiles(id),
  membership_created_at timestamptz not null,
  added_by uuid not null references public.profiles(id),
  added_at timestamptz not null default clock_timestamp(),
  removed_at timestamptz,
  removed_by uuid references public.profiles(id),
  muted boolean not null default false,
  primary key (concern_id, user_id),
  foreign key (academy_id, concern_id) references public.concerns(academy_id, id),
  check ((removed_at is null) = (removed_by is null))
);
create index concern_participants_user_idx on public.concern_participants(user_id, academy_id, concern_id) where removed_at is null;

-- Lifecycle/membership events carry no message text. Messaging adds its durable events here.
create table public.concern_events (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null,
  concern_id uuid not null,
  actor_id uuid not null references public.profiles(id),
  kind text not null check (kind in ('created','participant_added','participant_removed','owner_recovered',
    'settled','reopened','message_sent','message_edited','message_deleted','reaction_changed','read_updated')),
  subject_id uuid,
  detail jsonb not null default '{}',
  occurred_at timestamptz not null default clock_timestamp(),
  foreign key (academy_id, concern_id) references public.concerns(academy_id, id)
);
create index concern_events_history_idx on public.concern_events(academy_id, concern_id, occurred_at, id);

-- Safe boolean RLS helper: uses auth.uid(), never accepts a caller-selected identity.
create function public.concern_has_access(p_academy_id uuid, p_concern_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_academy_member(p_academy_id) and exists (
    select 1 from public.concern_participants p
    join public.academy_memberships m on m.academy_id = p.academy_id and m.user_id = p.user_id
    where p.academy_id = p_academy_id and p.concern_id = p_concern_id
      and p.user_id = auth.uid() and p.removed_at is null
      and m.suspended_at is null and m.created_at = p.membership_created_at
  );
$$;
revoke all on function public.concern_has_access(uuid,uuid) from public, anon;
grant execute on function public.concern_has_access(uuid,uuid) to authenticated;

-- All conversation/lifecycle mutations serialize on this row. Never grant this helper directly.
create function edra_private.require_concern(p_academy_id uuid, p_concern_id uuid,
  p_write boolean default false, p_manager boolean default false)
returns public.concerns language plpgsql security definer set search_path = '' as $$
declare item public.concerns;
begin
  select * into item from public.concerns
    where academy_id = p_academy_id and id = p_concern_id for update;
  if not found or not public.concern_has_access(p_academy_id, p_concern_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_manager and not public.is_academy_manager(p_academy_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_write and item.status <> 'ongoing' then
    raise exception 'concern_settled' using errcode = '55000';
  end if;
  return item;
end;
$$;
revoke all on function edra_private.require_concern(uuid,uuid,boolean,boolean) from public, anon, authenticated;

alter table public.concerns enable row level security;
alter table public.concern_participants enable row level security;
alter table public.concern_events enable row level security;
revoke all on public.concerns, public.concern_participants, public.concern_events from public, anon, authenticated;
grant select on public.concerns, public.concern_participants, public.concern_events to authenticated;
grant all on public.concerns, public.concern_participants, public.concern_events to service_role;
create policy concerns_participant_read on public.concerns for select to authenticated
  using (public.concern_has_access(academy_id, id));
create policy concern_participants_read on public.concern_participants for select to authenticated
  using (public.concern_has_access(academy_id, concern_id));
create policy concern_events_read on public.concern_events for select to authenticated
  using (public.concern_has_access(academy_id, concern_id));
