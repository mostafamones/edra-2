-- Submission tables intentionally have no browser SELECT grants. Keep them private and expose
-- only this scoped aggregate: staff_home checks the live academy role before reading, and every
-- academy/year source is explicitly restricted to that validated academy and its open year.
-- The fixed empty search_path and schema-qualified relations prevent caller object substitution.
alter function public.staff_home(uuid) security definer;
