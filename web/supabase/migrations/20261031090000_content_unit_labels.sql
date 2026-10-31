-- Labels on content units, the second target of the shared academy catalog. Organizational metadata:
-- applying or removing never touches a unit's version, draft or publications, is allowed on archived
-- units and in closed years, and is not carried over by unit copies. Students read nothing here.

create table public.content_unit_labels (
  academy_id uuid not null,
  unit_id uuid not null,
  label_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (unit_id, label_id),
  foreign key (academy_id, unit_id) references public.content_units (academy_id, id) on delete cascade,
  foreign key (academy_id, label_id) references public.labels (academy_id, id) on delete cascade
);
create index content_unit_labels_label_idx on public.content_unit_labels (label_id);
create index content_unit_labels_academy_idx on public.content_unit_labels (academy_id);

alter table public.content_unit_labels enable row level security;
create policy content_unit_labels_select_staff on public.content_unit_labels for select to authenticated using (public.is_academy_member(academy_id));
revoke all on table public.content_unit_labels from public, anon, authenticated;
grant select on table public.content_unit_labels to authenticated;

-- Applies or removes one label on one unit: the desired state, not a toggle, so retries and other
-- staff members' concurrent changes to other labels are preserved. Returns the unit's label IDs.
create function public.set_content_unit_label(p_academy_id uuid, p_unit_id uuid, p_label_id uuid, p_applied boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform edra_private.require_label_role(p_academy_id, false);
  if p_unit_id is null or p_label_id is null or p_applied is null then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  if not exists (select 1 from public.content_units where id = p_unit_id and academy_id = p_academy_id) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  -- Share lock: waits for a deletion in progress and blocks one from starting until this commits.
  perform 1 from public.labels where id = p_label_id and academy_id = p_academy_id for share;
  if not found and p_applied then raise exception using errcode = 'P0001', message = 'label_not_found'; end if;
  if p_applied then
    insert into public.content_unit_labels (academy_id, unit_id, label_id) values (p_academy_id, p_unit_id, p_label_id) on conflict do nothing;
  else
    delete from public.content_unit_labels where unit_id = p_unit_id and label_id = p_label_id;
  end if;
  return coalesce((select jsonb_agg(l.label_id order by l.label_id) from public.content_unit_labels l where l.unit_id = p_unit_id), '[]'::jsonb);
end;
$$;
revoke all on function public.set_content_unit_label(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.set_content_unit_label(uuid, uuid, uuid, boolean) to authenticated;

-- The same deletion, now also counting content units as uses. The row lock serializes this with both set commands.
create or replace function public.delete_label(p_academy_id uuid, p_label_id uuid, p_confirmed boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uses integer;
begin
  perform edra_private.require_label_role(p_academy_id, true);
  if p_label_id is null or p_confirmed is null then
    raise exception using errcode = 'P0001', message = 'validation';
  end if;
  perform 1 from public.labels where id = p_label_id and academy_id = p_academy_id for update;
  if not found then return jsonb_build_object('status', 'deleted', 'uses', 0); end if;
  uses := (select count(*) from public.assignment_labels where label_id = p_label_id)
    + (select count(*) from public.quiz_labels where label_id = p_label_id)
    + (select count(*) from public.exam_labels where label_id = p_label_id)
    + (select count(*) from public.content_unit_labels where label_id = p_label_id);
  if uses > 0 and not p_confirmed then return jsonb_build_object('status', 'confirm', 'uses', uses); end if;
  delete from public.labels where id = p_label_id and academy_id = p_academy_id;
  return jsonb_build_object('status', 'deleted', 'uses', uses);
end;
$$;
