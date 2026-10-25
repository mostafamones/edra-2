-- Keep every stored draft of a unit so staff can see who changed the working document and when,
-- alongside published revisions. A trigger records each write, so every draft writer (editor save,
-- save-and-publish, material reuse, attached assessment creation) is covered without changing them.
-- History starts with this migration; drafts saved earlier were never retained.
begin;
create table public.content_drafts (
  id bigint generated always as identity primary key,
  unit_id uuid not null,
  academy_id uuid not null,
  version integer not null,
  kind text not null check (kind in ('created','saved')),
  document jsonb not null,
  saved_by uuid references public.profiles(id),
  saved_at timestamptz not null default now(),
  foreign key(academy_id,unit_id) references public.content_units(academy_id,id)
);
create index content_drafts_unit on public.content_drafts(unit_id,saved_at desc);

alter table public.content_drafts enable row level security;
create policy content_drafts_staff on public.content_drafts for select to authenticated using(public.is_academy_member(academy_id));
revoke all on public.content_drafts from public,anon,authenticated;
grant select on public.content_drafts to authenticated;

create function edra_private.record_content_draft()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.content_drafts(unit_id,academy_id,version,kind,document,saved_by)
  values(new.id,new.academy_id,new.version,case when tg_op='INSERT' then 'created' else 'saved' end,new.draft,auth.uid());
  return null;
end $$;
revoke all on function edra_private.record_content_draft() from public,anon,authenticated;

create trigger content_units_draft_created after insert on public.content_units
  for each row execute function edra_private.record_content_draft();
create trigger content_units_draft_saved after update of draft on public.content_units
  for each row when (old.draft is distinct from new.draft) execute function edra_private.record_content_draft();
commit;
