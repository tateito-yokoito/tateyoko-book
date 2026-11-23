-- One-time, transactional setup for four fictional, password-based demo users.
-- First create and confirm the four auth.users through the Supabase Auth UI.
-- Never store passwords, tokens, or service-role keys in this file.
begin;
do $seed$
declare
  slot integer;
  actor uuid;
  family uuid;
  subject uuid;
  parent_one uuid;
  parent_two uuid;
  child uuid;
  project uuid;
  speaker uuid;
  question_set uuid;
  question uuid;
  answer uuid;
  manifest uuid;
  publication uuid;
  revision_number integer;
  count_users integer;
  sample text;
begin
  select count(*) into count_users from auth.users
   where lower(email) = any(array[
     'family-demo-01@tateito-yokoito.jp',
     'family-demo-02@tateito-yokoito.jp',
     'family-demo-03@tateito-yokoito.jp',
     'family-demo-04@tateito-yokoito.jp'])
     and email_confirmed_at is not null and encrypted_password is not null;
  if count_users <> 4 then raise exception 'All four confirmed password users are required'; end if;
  select id into question_set from public.question_sets
   where product_type='koebook' and is_default and is_active limit 1;
  if question_set is null then raise exception 'Default BOOK question set missing'; end if;

  for slot in 1..4 loop
    select id into actor from auth.users
     where lower(email)=format('family-demo-0%s@tateito-yokoito.jp',slot);
    if actor is null or exists(select 1 from public.families where owner_user_id=actor)
      or exists(select 1 from public.family_place_early_access where user_id=actor) then
      raise exception 'Demo slot % already has app data or is missing',slot;
    end if;
    insert into public.family_place_early_access(user_id) values(actor);
    insert into public.families(owner_user_id,name)
      values(actor,format('架空デモ家族%s',slot)) returning id into family;
    if slot=1 then continue; end if;

    insert into public.persons(family_id,display_name,family_name,given_name,birth_year,gender)
      values(family,'架空 あおい','架空','あおい',1985,'female') returning id into subject;
    insert into public.user_person_links(user_id,person_id,role)
      values(actor,subject,'self');
    insert into public.persons(family_id,display_name,family_name,given_name,birth_year,gender)
      values(family,'架空 光','架空','光',1958,'female') returning id into parent_one;
    insert into public.persons(family_id,display_name,family_name,given_name,birth_year,gender)
      values(family,'架空 隆','架空','隆',1956,'male') returning id into parent_two;
    insert into public.family_person_relations(family_id,person_a_id,person_b_id,relation_type)
      values(family,parent_one,subject,'parent_child'),
            (family,parent_two,subject,'parent_child');
    if slot=2 then
      insert into public.persons(family_id,display_name,family_name,given_name,birth_year,gender)
        values(family,'架空 そら','架空','そら',2013,'male') returning id into child;
      insert into public.family_person_relations(family_id,person_a_id,person_b_id,relation_type)
        values(family,subject,child,'parent_child');
      insert into public.family_free_stories
        (family_id,person_id,question_slot,question_key,question_text,body,visibility,created_by)
      values
        (family,parent_one,1,'TY_TRIAL_CHILDHOOD01','幼い頃、どんなところに住んでいましたか？',
         '架空の小さな町で暮らしていました。家の前には大きな木がありました。','family',actor),
        (family,parent_one,2,'TY_TRIAL_CHILDHOOD02','その頃、よく一緒にいた人を一人思い浮かべてください。どんな人でしたか？',
         '架空の友だちと、よく外で遊びました。いつも笑顔の人でした。','family',actor),
        (family,parent_one,3,'TY_TRIAL_CHILDHOOD03','その頃、どんな遊びが好きでしたか？',
         '紙で作った小さな船を水に浮かべる遊びが好きでした。','family',actor);
      continue;
    end if;

    -- Legacy entitlement is deliberately orderless: no purchase, shipment,
    -- gift, or book-production job can be created by this seed.
    insert into public.book_projects
      (family_id,owner_user_id,subject_person_id,project_type,title,status,
       base_question_set_id,onboarding_status,onboarding_completed_at,access_status)
      values(family,actor,subject,'koebook',
        case when slot=3 then '架空 あおいの制作中BOOK' else '架空 あおいの完成BOOK' end,
        'active',question_set,'completed',now(),'legacy') returning id into project;
    insert into public.project_participants(book_project_id,user_id,person_id,role,invite_status)
      values(project,actor,subject,'owner','active'),
            (project,actor,subject,'subject','active');
    insert into public.project_participants(book_project_id,user_id,person_id,role,invite_status)
      values(project,actor,subject,'speaker','active') returning id into speaker;
    insert into public.user_questions
      (user_id,book_project_id,participant_id,question_id,sequence_order,is_active,
       chapter,chapter_title_snapshot,chapter_subtitle_snapshot,question_text_snapshot,status,meta_json)
    select actor,project,speaker,qi.question_id,qi.sequence_order,true,
      qi.chapter_title_snapshot,qi.chapter_title_snapshot,qi.chapter_subtitle_snapshot,
      qi.question_text_snapshot,'pending',
      coalesce(qi.meta_json,'{}'::jsonb)||jsonb_build_object(
        'question_set_id',question_set,'question_set_code','tateito_yokoito_standard_v2')
    from public.question_set_items qi
    where qi.question_set_id=question_set and qi.is_active
    order by qi.sequence_order;
    select id into question from public.user_questions
      where book_project_id=project and question_id='TY_Q01' limit 1;
    if question is null then raise exception 'Demo BOOK question missing'; end if;
    sample := case when slot=3
      then '架空の町で暮らしていた頃、毎朝庭の木を眺めていました。これは制作途中のデモ用文章です。'
      else '架空の町で育ちました。家族と歩いた道や、庭の木を今も覚えています。これは完成デモ用の架空の語りです。' end;
    insert into public.answers
      (user_id,question_id,sequence_order,transcript_raw,transcript_edited,
       transcript_clean,transcript_readable,transcript_essay,book_project_id,
       speaker_person_id,subject_person_id,user_question_id,access_override)
      values(actor,'TY_Q01',5,sample,sample,sample,sample,sample,project,
        subject,subject,question,'inherit') returning id into answer;
    update public.user_questions set status='answered',answered_at=now() where id=question;
    insert into public.book_cover_settings(book_project_id,title,subtitle,print_color,footer_text)
      values(project,case when slot=3 then '制作中の人生の物語' else '架空 あおいの人生の物語' end,
        '縦糸横糸 デモ', '#a9bcb6','架空のデモ作品');

    if slot=4 then
      -- Freeze using the existing legacy completion RPC. No order is touched.
      perform set_config('request.jwt.claim.sub',actor::text,true);
      select (public.save_book_selection(project,array[answer],0)->>'revision')::integer
        into revision_number;
      perform public.confirm_book_work(project,revision_number,true);
      select id into manifest from public.book_work_manifests
        where book_project_id=project and confirmed_at is not null;
      if manifest is null then raise exception 'Demo BOOK was not fixed'; end if;
      insert into public.voice_publications
        (public_id,book_project_id,work_manifest_id,status,book_title,book_subtitle,
         subject_name,created_by)
        values(encode(gen_random_bytes(24),'hex'),project,manifest,'draft',
          '架空 あおいの人生の物語','縦糸横糸 デモ','架空 あおい',actor)
        returning id into publication;
      perform public.replace_voice_publication_snapshot(
        publication,'draft','架空 あおいの人生の物語','縦糸横糸 デモ','架空 あおい',
        jsonb_build_object(
          'cover',jsonb_build_object('title','架空 あおいの人生の物語',
            'subtitle','縦糸横糸 デモ','print_color','#a9bcb6',
            'footer_text','架空のデモ作品'),
          'footerText','架空のデモ作品','sourceAnswerCount',1,
          'revisionId',manifest::text),
        '[]'::jsonb,
        jsonb_build_array(jsonb_build_object('item_order',1,'source_answer_id',answer,
          'chapter_title','幼い頃','question_text','子どもの頃は、どのあたりで暮らしていましたか？',
          'transcript_text',sample,'audio_assets','[]'::jsonb,
          'photo_assets','[]'::jsonb,'metadata','{}'::jsonb)),
        now(),true);
      perform set_config('request.jwt.claim.sub','',true);
    end if;
  end loop;
end
$seed$;
commit;
