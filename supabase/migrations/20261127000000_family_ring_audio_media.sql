-- Year-ring audio added after a BOOK is confirmed belongs to the live ring,
-- never to the immutable publication or its source media_assets rows.
begin;

alter table public.family_ring_story_media
  add column asset_type text not null default 'photo'
  check (asset_type in ('photo','audio'));

update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png','image/webp',
  'audio/mp4','audio/webm','audio/mpeg','audio/aac','audio/ogg','audio/wav']
where id = 'family-ring-media';

commit;
