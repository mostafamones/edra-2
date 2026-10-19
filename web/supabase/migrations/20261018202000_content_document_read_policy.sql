begin;
-- `name` inside the subquery otherwise binds to content_assets.name (the display
-- filename), rather than the outer Storage object's key. Qualify the outer row.
drop policy content_document_read on storage.objects;
create policy content_document_read on storage.objects for select to authenticated
using(bucket_id='content-documents' and exists(
  select 1 from public.content_assets a
  where a.storage_path=objects.name and public.is_academy_member(a.academy_id)
));
commit;
