-- A newly linked keyed Person story must not remain in an unconfirmed BOOK
-- selection, including family-managed projects whose legacy BOOK rules permit
-- other private answers. Confirmed snapshots remain immutable.
begin;

create function public.guard_keyed_person_story_book_selection()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.confirmed_at is null and exists (
    select 1 from unnest(coalesce(new.answer_ids,'{}'::uuid[])) selected(answer_id)
    join public.person_story_book_links link on link.answer_id=selected.answer_id
      and link.book_project_id=new.book_project_id
    join public.family_free_stories story on story.id=link.story_id
    where story.visibility='private'
  ) then
    raise exception 'Keyed Person stories cannot be included in an unfinished BOOK'
      using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_keyed_person_story_book_selection()
  from public,anon,authenticated;
create trigger guard_keyed_person_story_book_selection
  before insert or update of answer_ids on public.book_work_manifests
  for each row execute function public.guard_keyed_person_story_book_selection();

create function public.prune_newly_keyed_person_story_selection()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.visibility='private' and old.visibility is distinct from 'private' then
    update public.book_work_manifests manifest set
      answer_ids=array_remove(manifest.answer_ids, link.answer_id),
      revision=manifest.revision+1
    from public.person_story_book_links link
    where link.story_id=new.id
      and manifest.book_project_id=link.book_project_id
      and manifest.confirmed_at is null
      and link.answer_id=any(manifest.answer_ids);
  end if;
  return new;
end;
$$;
revoke all on function public.prune_newly_keyed_person_story_selection()
  from public,anon,authenticated;
create trigger prune_newly_keyed_person_story_selection
  after update of visibility on public.family_free_stories
  for each row execute function public.prune_newly_keyed_person_story_selection();

commit;
