-- Academy profile and contact settings (EDRA-128).
-- Adds optional academy phone and WhatsApp numbers (canonical Egyptian mobile form, unverified),
-- narrows direct academy edits to Owner and Head Admin, and limits authenticated writes to the
-- five profile columns. The slug trigger, creation identity and the shared manager helper are
-- unchanged; Admin keeps its manager authority in every other domain.

alter table public.academies
  add column phone text default null,
  add column whatsapp text default null,
  add constraint academies_phone_format check (phone is null or phone ~ '^\+201[0125][0-9]{8}$'),
  add constraint academies_whatsapp_format check (whatsapp is null or whatsapp ~ '^\+201[0125][0-9]{8}$');

-- academy_role_for already requires an active membership and an allowed session.
alter policy academies_update_owner_or_admin on public.academies
  using (public.academy_role_for(id) in ('owner', 'head_admin'))
  with check (public.academy_role_for(id) in ('owner', 'head_admin'));
alter policy academies_update_owner_or_admin on public.academies rename to academies_update_owner_or_head_admin;

-- Identity, attribution and timestamps are never directly writable; the trigger still sets updated_at.
revoke update on table public.academies from anon, authenticated;
grant update (name, icon, subject, phone, whatsapp) on table public.academies to authenticated;
