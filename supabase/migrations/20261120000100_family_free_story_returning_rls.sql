-- Bind person/family checks to the outer story row explicitly.
-- Keep the read helper non-cached for subsequent changes within a transaction.
-- The client performs INSERT and SELECT as separate requests because
-- INSERT ... RETURNING still cannot see a newly inserted row through this RLS.
begin;

create or replace function public.family_free_story_can_read(input_story_id uuid)
returns boolean language sql volatile security definer set search_path=public,auth as $$
  select auth.uid() is not null and exists (
    select 1 from public.family_free_stories s
    join public.families f on f.id=s.family_id
    where s.id=input_story_id
      and exists(select 1 from public.persons p
        where p.id=s.person_id and p.family_id=s.family_id)
      and (
        (s.visibility='private' and exists (
          select 1 from public.user_person_links l
          where l.person_id=s.person_id and l.user_id=auth.uid() and l.role='self'))
        or (s.visibility='family' and f.owner_user_id=auth.uid())
      )
  );
$$;

alter policy family_free_stories_insert on public.family_free_stories
  with check (
    created_by=(select auth.uid())
    and exists(select 1 from public.families f join public.persons p
      on p.family_id=f.id
      where f.id=family_free_stories.family_id
        and p.id=family_free_stories.person_id
        and f.owner_user_id=(select auth.uid()))
    and (visibility='family' or exists (
      select 1 from public.user_person_links l
      where l.person_id=family_free_stories.person_id
        and l.user_id=(select auth.uid()) and l.role='self'))
  );

alter policy family_free_stories_update on public.family_free_stories
  with check (
    public.family_free_story_can_write(id)
    and (visibility='family' or exists (
      select 1 from public.user_person_links l
      where l.person_id=family_free_stories.person_id
        and l.user_id=(select auth.uid()) and l.role='self'))
  );

commit;
