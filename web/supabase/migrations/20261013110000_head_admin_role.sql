-- Head Admin: the fourth fixed academy staff role (wire value `head_admin`).
--
-- Postgres cannot use an enum value in the transaction that adds it, so this migration only adds
-- the value. Functions, constraints and policies that reference it follow in later migrations.
-- Existing memberships keep their roles; nobody is promoted. Until those later migrations apply,
-- no write path accepts the new role (invitation and role-change guards still reject it).
alter type public.academy_role add value if not exists 'head_admin' after 'owner';
