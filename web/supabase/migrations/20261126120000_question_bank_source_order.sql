-- List saved questions in source order (file, page, printed number) instead of newest first,
-- so the printed number reads against its PDF page.
create or replace function public.list_question_bank_questions(p_academy_id uuid, p_collection_id uuid, p_query text, p_offset integer, p_limit integer)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_pattern text := '%' || replace(replace(replace(lower(btrim(coalesce(p_query,''))),'\','\\'),'%','\%'),'_','\_') || '%';
begin
  if not public.is_academy_manager(p_academy_id) then raise exception 'forbidden'; end if;
  if p_offset not between 0 and 100000 or p_limit not between 1 and 50 or char_length(coalesce(p_query,'')) > 200 then
    raise exception 'invalid_query';
  end if;
  return (
    with matches as (
      select q.id, q.unit_id, q.created_at, q.payload->>'prompt' prompt, q.payload->>'printedNumber' printed_number,
        q.payload->'source'->>'file' file, (q.payload->'source'->>'page')::integer page,
        jsonb_array_length(q.payload->'choices') > 0 choice
      from public.question_bank_questions q
      where q.academy_id=p_academy_id and q.search_text like v_pattern
        and (p_collection_id is null or exists (select 1 from public.question_bank_memberships m
          where m.academy_id=q.academy_id and m.collection_id=p_collection_id and m.question_id=q.id))
    ), page as (select * from matches order by lower(file), file, page, (substring(printed_number from '[0-9]+'))::numeric nulls last, printed_number, created_at, id offset p_offset limit p_limit)
    select jsonb_build_object('total',(select count(*) from matches),'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'unitId',unit_id,'prompt',prompt,'printedNumber',printed_number,'file',file,'page',page,'choice',choice
    ) order by lower(file), file, page, (substring(printed_number from '[0-9]+'))::numeric nulls last, printed_number, created_at, id) from page),'[]'::jsonb))
  );
end;
$$;
