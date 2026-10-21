-- Development tooling registry (docs/product/domains/development-tools.md).
--
-- Private bookkeeping for synthetic development academies: generation runs, their generated
-- accounts and reserved contacts, the developer allowlist mirror, and a suppression ledger for
-- outbox effects of synthetic academies. The registry, never editable user metadata, proves that an
-- account, contact or academy is synthetic.
--
-- Nothing here is readable or writable by browser roles. The generator CLI writes these tables on a
-- privileged connection; the only public entry point is a service-role adapter with an empty
-- search path. Synthetic-effect suppression is maintained by insert triggers that are a no-op for
-- ordinary academies. Future assessment/message effect consumers must exclude
-- edra_private.dev_effect_suppressions in the same way edra_private.attendance_effect_pending does.

create table edra_private.dev_developers (
  user_id uuid primary key,
  added_at timestamptz not null default now()
);

create table edra_private.dev_runs (
  id uuid primary key,
  project_ref text not null check (project_ref ~ '^[a-z]{20}$'),
  recipe_version text not null,
  seed text not null,
  reference_date date not null,
  student_count integer not null check (student_count = 20),
  scenario_hash text not null check (scenario_hash ~ '^[0-9a-f]{64}$'),
  developer_id uuid not null,
  -- Set inside the loading transaction, before any domain row exists.
  academy_id uuid unique,
  state text not null default 'planned' check (state in (
    'planned', 'provisioning', 'loading', 'ready', 'failed', 'resetting', 'auth_cleanup_pending', 'reset'
  )),
  error_stage text,
  error_detail text,
  lock_token uuid,
  lock_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ready_at timestamptz,
  constraint dev_runs_ready_shape check (state <> 'ready' or (academy_id is not null and ready_at is not null))
);

-- Reserved before any account operation; kept until a completed reset releases it.
create table edra_private.dev_contacts (
  phone text primary key check (phone ~ '^\+201[0125][0-9]{8}$'),
  run_id uuid not null references edra_private.dev_runs (id),
  logical_id text not null,
  purpose text not null check (purpose in ('login', 'parent')),
  reserved_at timestamptz not null default now(),
  released_at timestamptz,
  unique (run_id, logical_id, purpose)
);

create table edra_private.dev_accounts (
  run_id uuid not null references edra_private.dev_runs (id),
  logical_id text not null check (logical_id ~ '^account:(staff|student):[a-z0-9-]+$'),
  kind text not null check (kind in ('owner', 'head_admin', 'admin', 'instructor', 'student')),
  display_name text not null,
  phone text not null references edra_private.dev_contacts (phone),
  user_id uuid unique,
  annual_student_record_id uuid unique,
  -- AES-256-GCM ciphertext bound to project/run/user; never plaintext.
  credential_ciphertext text,
  state text not null default 'reserved' check (state in ('reserved', 'created', 'loaded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (run_id, logical_id),
  constraint dev_accounts_created_shape check (
    state = 'reserved' or (user_id is not null and credential_ciphertext is not null)
  ),
  constraint dev_accounts_student_shape check ((kind = 'student') = (logical_id like 'account:student:%'))
);

create table edra_private.dev_effect_suppressions (
  source_table text not null check (source_table in ('attendance_effects', 'assignment_result_effects', 'exam_result_effects')),
  effect_id uuid not null,
  run_id uuid not null references edra_private.dev_runs (id),
  reason text not null default 'synthetic_data' check (reason = 'synthetic_data'),
  suppressed_at timestamptz not null default now(),
  primary key (source_table, effect_id)
);
create index dev_effect_suppressions_run_idx on edra_private.dev_effect_suppressions (run_id);

alter table edra_private.dev_developers enable row level security;
alter table edra_private.dev_runs enable row level security;
alter table edra_private.dev_contacts enable row level security;
alter table edra_private.dev_accounts enable row level security;
alter table edra_private.dev_effect_suppressions enable row level security;
revoke all on edra_private.dev_developers, edra_private.dev_runs, edra_private.dev_contacts,
  edra_private.dev_accounts, edra_private.dev_effect_suppressions
  from public, anon, authenticated, service_role;

-- Records a suppression for each new outbox effect of a registered synthetic academy, including
-- effects created later by ordinary actions during preview. Ordinary academies match no run.
create function edra_private.dev_suppress_synthetic_effect()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into edra_private.dev_effect_suppressions (source_table, effect_id, run_id)
  select tg_table_name, new.id, r.id from edra_private.dev_runs r where r.academy_id = new.academy_id
  on conflict do nothing;
  return null;
end;
$$;
revoke all on function edra_private.dev_suppress_synthetic_effect() from public, anon, authenticated;

create trigger dev_synthetic_effect_suppression after insert on public.attendance_effects
for each row execute function edra_private.dev_suppress_synthetic_effect();
create trigger dev_synthetic_effect_suppression after insert on public.assignment_result_effects
for each row execute function edra_private.dev_suppress_synthetic_effect();
create trigger dev_synthetic_effect_suppression after insert on public.exam_result_effects
for each row execute function edra_private.dev_suppress_synthetic_effect();

-- Supersedes 20261013200000: a synthetic-suppressed effect is never pending, so the existing claim
-- boundary (edra_private.claim_attendance_effect) refuses it. Ordinary effects are unchanged.
create or replace function edra_private.attendance_effect_pending(p_effect_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.attendance_effects e
    join public.sessions s on s.id = e.session_id
    where e.id = p_effect_id and e.processed_at is null and s.archived_at is null
      and not exists (select 1 from public.attendance_effect_suppressions x where x.effect_id = e.id)
      and not exists (
        select 1 from edra_private.dev_effect_suppressions d
        where d.source_table = 'attendance_effects' and d.effect_id = e.id
      )
  );
$$;
revoke all on function edra_private.attendance_effect_pending(uuid) from public, anon, authenticated;

-- Delivery guard for Edge functions: true when the recipient is a reserved synthetic contact or the
-- account is a registered generated account. Callers must fail closed when this call errors.
create function public.dev_delivery_blocked(p_user_id uuid, p_phone text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from edra_private.dev_contacts c
    where p_phone is not null and c.released_at is null
      and ltrim(c.phone, '+') = ltrim(btrim(p_phone), '+')
  ) or exists (
    select 1 from edra_private.dev_accounts a where p_user_id is not null and a.user_id = p_user_id
  );
$$;
revoke all on function public.dev_delivery_blocked(uuid, text) from public, anon, authenticated;
grant execute on function public.dev_delivery_blocked(uuid, text) to service_role;
