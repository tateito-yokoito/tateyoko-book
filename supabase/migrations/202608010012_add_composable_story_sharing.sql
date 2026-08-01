begin;

alter table public.story_sharing_preferences
  add column if not exists family_sharing_enabled boolean not null default false,
  add column if not exists selected_sharing_enabled boolean not null default false;

update public.story_sharing_preferences
set
  family_sharing_enabled = (live_scope = 'family'),
  selected_sharing_enabled = (live_scope = 'selected')
where family_sharing_enabled = false
  and selected_sharing_enabled = false
  and live_scope <> 'private';

comment on column public.story_sharing_preferences.family_sharing_enabled is
  'ファミリーへの現在共有を有効にする。選んだ人への共有と併用できる。';

comment on column public.story_sharing_preferences.selected_sharing_enabled is
  '選んだ人への現在共有を有効にする。サポーターはこの共有相手にも登録される。';

insert into public.story_share_recipients (
  sharing_preference_id,
  recipient_person_id,
  recipient_user_id,
  recipient_phase,
  source,
  status,
  meta_json
)
select
  pref.id,
  supporter.supporter_person_id,
  supporter.supporter_user_id,
  'live',
  'supporter',
  'active',
  jsonb_build_object('source', 'supporter_scope_backfill')
from public.project_supporters supporter
join public.story_sharing_preferences pref
  on pref.book_project_id = supporter.book_project_id
where supporter.status = 'active'
on conflict do nothing;

update public.story_share_recipients recipient
set
  source = 'supporter',
  status = 'active',
  updated_at = now()
from public.project_supporters supporter,
     public.story_sharing_preferences pref
where pref.book_project_id = supporter.book_project_id
  and recipient.sharing_preference_id = pref.id
  and supporter.status = 'active'
  and recipient.recipient_user_id = supporter.supporter_user_id
  and recipient.recipient_phase = 'live';

update public.story_sharing_preferences pref
set
  selected_sharing_enabled = true,
  live_scope = 'selected',
  updated_at = now()
where exists (
  select 1
  from public.project_supporters supporter
  where supporter.book_project_id = pref.book_project_id
    and supporter.status = 'active'
);

create or replace function public.sync_supporter_recipient_sharing_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source = 'supporter'
    and new.status = 'active'
    and new.recipient_phase in ('live', 'both') then
    update public.story_sharing_preferences pref
    set
      selected_sharing_enabled = true,
      live_scope = 'selected',
      updated_at = now()
    where pref.id = new.sharing_preference_id;
  end if;

  return new;
end;
$$;

drop trigger if exists story_share_recipients_supporter_scope_sync
  on public.story_share_recipients;

create trigger story_share_recipients_supporter_scope_sync
after insert or update of source, status, recipient_phase
on public.story_share_recipients
for each row
execute function public.sync_supporter_recipient_sharing_scope();

create or replace function public.supporter_can_view_shared_story(
  input_book_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.project_supporters ps
    join public.story_sharing_preferences pref
      on pref.book_project_id = ps.book_project_id
    where ps.book_project_id = input_book_project_id
      and ps.supporter_user_id = auth.uid()
      and ps.status = 'active'
      and pref.selected_sharing_enabled = true
      and exists (
        select 1
        from public.story_share_recipients recipient
        where recipient.sharing_preference_id = pref.id
          and recipient.recipient_user_id = auth.uid()
          and recipient.status = 'active'
          and recipient.recipient_phase in ('live', 'both')
      )
  );
$$;

revoke all on function public.supporter_can_view_shared_story(uuid) from public;
grant execute on function public.supporter_can_view_shared_story(uuid) to authenticated;

commit;
