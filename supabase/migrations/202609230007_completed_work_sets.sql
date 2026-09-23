begin;

-- One library entry per published edition. A completed candidate identifies
-- the paper + Web work set; legacy publications remain available unchanged.
create or replace function public.list_completed_web_book_library() returns jsonb
language sql stable security definer set search_path=public,auth as $$
 select coalesce(jsonb_agg(item order by sort_date desc nulls last),'[]'::jsonb) from (
   select to_jsonb(l)||jsonb_build_object('status','published',
     'can_manage_access',public.can_read_private_web_book(l.book_project_id),
     'work_set_id',coalesce(c.id,p.id),
     'paper_book_ordered',c.state='completed',
     'paper_order_id',c.order_id,
     'qr_in_book',c.qr_in_book) item,
     l.published_at sort_date
   from public.list_voice_library() l
   join public.voice_publications p on p.id=l.publication_id
   left join public.book_completion_candidates c on c.publication_id=p.id and c.state='completed'
   union all
   select jsonb_build_object('publication_id',p.id,'public_id',p.public_id,
     'book_project_id',p.book_project_id,'title',p.book_title,'subtitle',p.book_subtitle,
     'subject_name',p.subject_name,'published_at',p.published_at,'access_mode',p.access_mode,
     'relationship',case when b.owner_user_id=auth.uid() then 'owner' else 'managed' end,
     'status','disabled','can_manage_access',true,
     'work_set_id',coalesce(c.id,p.id),
     'paper_book_ordered',c.state='completed',
     'paper_order_id',c.order_id,
     'qr_in_book',c.qr_in_book),p.published_at
   from public.voice_publications p join public.book_projects b on b.id=p.book_project_id
   left join public.book_completion_candidates c on c.publication_id=p.id and c.state='completed'
   where p.status='disabled' and p.published_at is not null
     and public.can_read_private_web_book(p.book_project_id)
 ) entries
$$;

commit;
