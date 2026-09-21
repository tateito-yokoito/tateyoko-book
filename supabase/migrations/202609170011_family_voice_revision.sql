begin;
create table family_private.voice_revisions (
 upload_id uuid primary key, answer_id uuid not null, mode text not null,
 original jsonb not null, actor_id uuid not null, created_at timestamptz not null default now()
);
revoke all on family_private.voice_revisions from public,anon,authenticated;

create function family_private.story_revision(a uuid) returns text
language sql stable security definer set search_path=public as $$
 select md5(jsonb_build_object('raw',x.transcript_raw,'clean',x.transcript_clean,
 'readable',x.transcript_readable,'essay',x.transcript_essay,'edited',x.transcript_edited,
 'style',x.selected_style,'audio',(select coalesce(jsonb_agg(m.id order by m.id),'[]')
 from media_assets m where m.answer_id=x.id and m.asset_type='audio'))::text) from answers x where x.id=a
$$;
revoke all on function family_private.story_revision(uuid) from public,anon,authenticated;

create function public.family_voice_edit_context(p uuid, target uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare a answers%rowtype;
begin
 if not family_subject(p) or not experience_data_allowed(p,true) then raise exception 'Subject access required' using errcode='42501'; end if;
 select * into a from answers where id=target and book_project_id=p;
 if a.id is null or not family_question_allowed(a.user_question_id) then raise exception 'Story unavailable'; end if;
 return jsonb_build_object('answerId',a.id,'questionId',a.user_question_id,'revision',family_private.story_revision(a.id),
 'baseText',coalesce(nullif(a.transcript_edited,''),nullif(a.transcript_readable,''),a.transcript_raw,''),
 'audioPaths',(select coalesce(jsonb_agg(storage_path order by created_at,id),'[]') from media_assets where answer_id=a.id and asset_type='audio'));
end $$;
revoke all on function public.family_voice_edit_context(uuid,uuid) from public,anon;
grant execute on function public.family_voice_edit_context(uuid,uuid) to authenticated;

create function public.family_revise_voice(p uuid, target uuid, uploads uuid[], mode text, draft jsonb, expected_revision text) returns uuid
language plpgsql security definer set search_path=public as $$
declare a answers%rowtype; b book_projects%rowtype; u family_uploads%rowtype; m media_assets%rowtype;
 prior family_private.voice_revisions%rowtype; style text; display_text text; audio_count integer;
begin
 if not family_subject(p) or not experience_data_allowed(p,true) then raise exception 'Subject access required' using errcode='42501'; end if;
 if mode is null or mode not in ('append','replace') or coalesce(cardinality(uploads),0) not between 1 and 5
 or (select count(distinct x) from unnest(uploads) x)<>cardinality(uploads) then raise exception 'Invalid revision';end if;
 perform 1 from family_uploads where id=any(uploads) order by id for update;
 select * into a from answers where id=target and book_project_id=p for update;
 if a.id is null or not family_question_allowed(a.user_question_id) then raise exception 'Story unavailable';end if;
 select * into prior from family_private.voice_revisions where upload_id=uploads[1];
 if prior.upload_id is not null then
  if prior.answer_id<>target or prior.mode<>mode or prior.actor_id<>auth.uid()
  or exists(select 1 from unnest(uploads) x left join family_uploads f on f.id=x where f.id is null or f.answer_id is distinct from target or f.actor_id<>auth.uid()) then raise exception 'Invalid retry';end if;
  return target;
 end if;
 perform family_pending_voice_scope(p,auth.uid(),uploads);
 if expected_revision is distinct from family_private.story_revision(target) then raise exception 'Story changed; reload before editing' using errcode='40001';end if;
 style:=coalesce(draft->>'selectedStyle','readable');
 if draft is null or jsonb_typeof(draft)<>'object' or octet_length(draft::text)>400000 or style not in ('clean','readable','essay') then raise exception 'Invalid draft';end if;
 select count(*) into audio_count from media_assets where answer_id=target and asset_type='audio';
 if mode='append' and audio_count+cardinality(uploads)>5 then raise exception 'Audio part limit';end if;
 insert into family_private.voice_revisions(upload_id,answer_id,mode,original,actor_id) values(uploads[1],target,mode,to_jsonb(a),auth.uid());
 if mode='replace' then
  for m in select * from media_assets where answer_id=target and asset_type='audio' for update loop
   insert into family_private.retired_media(id,project_id,bucket,path,original,retired_by)
   values(m.id,p,'audio',m.storage_path,to_jsonb(m),auth.uid());
   delete from media_assets where id=m.id;
  end loop;
 end if;
 select * into b from book_projects where id=p;
 for u in select * from family_uploads where id=any(uploads) order by created_at,id loop
  insert into media_assets(answer_id,user_id,family_id,book_project_id,person_id,asset_type,storage_path,meta_json)
  values(target,auth.uid(),b.family_id,p,b.subject_person_id,'audio',u.path,jsonb_build_object('actor_user_id',auth.uid(),'segment_id',u.id));
  update family_uploads set answer_id=target,committed_at=now() where id=u.id;
 end loop;
 display_text:=coalesce(draft->>'editedText',draft->>'transcriptReadable',draft->>'transcript','');
 update answers set transcript_raw=coalesce(draft->>'transcript',''),transcript_clean=coalesce(draft->>'transcriptClean',''),
 transcript_readable=coalesce(draft->>'transcriptReadable',''),transcript_essay=coalesce(draft->>'transcriptEssay',''),
 transcript_edited=display_text,selected_style=style,
 meta_json=coalesce(meta_json,'{}')||jsonb_build_object('last_actor_user_id',auth.uid()) where id=target;
 -- Original actor, subject, question, privacy, photos and purchased Project stay unchanged.
 return target;
end $$;
revoke all on function public.family_revise_voice(uuid,uuid,uuid[],text,jsonb,text) from public,anon;
grant execute on function public.family_revise_voice(uuid,uuid,uuid[],text,jsonb,text) to authenticated;
commit;
