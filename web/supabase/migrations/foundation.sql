create extension if not exists pgcrypto;

create type public.academy_role as enum ('owner', 'admin', 'instructor');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.academies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 100),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.academy_memberships (
  academy_id uuid not null references public.academies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.academy_role not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (academy_id, user_id)
);

create unique index one_owner_per_academy
  on public.academy_memberships (academy_id)
  where role = 'owner';

create index academy_memberships_user_id_idx
  on public.academy_memberships (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger academies_set_updated_at
before update on public.academies
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_academy_member(target_academy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.academy_memberships
    where academy_id = target_academy_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.academy_role_for(target_academy_id uuid)
returns public.academy_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.academy_memberships
  where academy_id = target_academy_id
    and user_id = auth.uid();
$$;

create or replace function public.shares_academy_with(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id = auth.uid() or exists (
    select 1
    from public.academy_memberships mine
    join public.academy_memberships theirs
      on theirs.academy_id = mine.academy_id
    where mine.user_id = auth.uid()
      and theirs.user_id = target_user_id
  );
$$;

create or replace function public.create_academy(academy_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_academy_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if char_length(trim(academy_name)) not between 2 and 100 then
    raise exception 'Academy name must contain 2 to 100 characters';
  end if;

  insert into public.academies (name, created_by)
  values (trim(academy_name), auth.uid())
  returning id into new_academy_id;

  insert into public.academy_memberships (
    academy_id,
    user_id,
    role,
    created_by
  )
  values (
    new_academy_id,
    auth.uid(),
    'owner',
    auth.uid()
  );

  return new_academy_id;
end;
$$;

revoke all on function public.is_academy_member(uuid) from public;
revoke all on function public.academy_role_for(uuid) from public;
revoke all on function public.shares_academy_with(uuid) from public;
revoke all on function public.create_academy(text) from public;

grant execute on function public.is_academy_member(uuid) to authenticated;
grant execute on function public.academy_role_for(uuid) to authenticated;
grant execute on function public.shares_academy_with(uuid) to authenticated;
grant execute on function public.create_academy(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.academies enable row level security;
alter table public.academy_memberships enable row level security;

create policy "profiles_select_shared_academy"
on public.profiles
for select
to authenticated
using (public.shares_academy_with(id));

create policy "profiles_update_self"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "academies_select_members"
on public.academies
for select
to authenticated
using (public.is_academy_member(id));

create policy "academies_update_owner_or_admin"
on public.academies
for update
to authenticated
using (public.academy_role_for(id) in ('owner', 'admin'))
with check (public.academy_role_for(id) in ('owner', 'admin'));

create policy "memberships_select_academy_members"
on public.academy_memberships
for select
to authenticated
using (public.is_academy_member(academy_id));
