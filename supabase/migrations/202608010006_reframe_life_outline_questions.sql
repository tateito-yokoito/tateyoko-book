begin;

-- 人生の輪郭は、現在の答えやすい話から始め、時間をさかのぼる。
-- 既存の4つの録音枠を使い、初回の負担を増やさず人物像を残す。

with outline_questions as (
  select *
  from (values
    (
      'TY_ONB01'::text,
      1,
      'まず、今はどのあたりで、どのように暮らしていますか。普段の過ごし方も、言える範囲で教えてください。'::text,
      '1 / 4'::text,
      '地域名や、普段よくしていることから短くお話しください。'::text,
      '地域名だけでも大丈夫です。'::text,
      '普段どなたと過ごしているか、よくしていることを一つか二つ話してみてください。'::text,
      8,
      15
    ),
    (
      'TY_ONB02'::text,
      2,
      'では、少し時間をさかのぼります。生まれた地域と、長く育った地域、ご家族のことを教えてください。'::text,
      '2 / 4'::text,
      '場所と、一緒に暮らしていた方からお話しください。'::text,
      '正確な年代や住所を思い出さなくても大丈夫です。'::text,
      '生まれた場所と育った場所が同じか、ご兄弟がいたかなどから話してみてください。'::text,
      15,
      30
    ),
    (
      'TY_ONB03'::text,
      3,
      'どのような地域で学校生活を送り、その後どのような道へ進みましたか。覚えているところから教えてください。'::text,
      '3 / 4'::text,
      '小学校、中学校、その後の進路など、話しやすいところからお話しください。'::text,
      '学校名や卒業年を正確に思い出さなくても大丈夫です。'::text,
      '長く過ごした学校や、学校を終えた後に最初にしたことから話してみてください。'::text,
      15,
      30
    ),
    (
      'TY_ONB04'::text,
      4,
      '学校を終えた後、どのような仕事や役割を担ってきましたか。暮らしが大きく変わった時期も、思い当たる範囲で教えてください。'::text,
      '4 / 4'::text,
      '最初にしたことや、一番長く続けたことからお話しください。'::text,
      '仕事だけでなく、家庭や地域で担ったことも含めて大丈夫です。'::text,
      '転居、仕事、結婚、家族の変化など、大きな節目があれば一つだけでも話してみてください。'::text,
      20,
      40
    )
  ) as values_table (
    question_id,
    onboarding_order,
    question_text,
    progress_label,
    prompt_hint,
    reassurance_text,
    followup_hint,
    min_duration_seconds,
    min_transcript_chars
  )
)
update public.questions q
set
  chapter = '人生の輪郭',
  content = source.question_text,
  is_active = true,
  meta_json =
    (coalesce(q.meta_json, '{}'::jsonb)
      - 'question_role'
      - 'flow_type'
      - 'onboarding_group'
      - 'onboarding_order'
      - 'include_in_profile_text'
      - 'include_in_profile_audio'
      - 'include_in_story_list'
      - 'include_in_book_body')
    || jsonb_build_object(
      'product_brand', 'tateito_yokoito',
      'question_role', 'profile_source',
      'flow_type', 'onboarding',
      'onboarding_group', 'life_outline',
      'onboarding_order', source.onboarding_order,
      'include_in_profile_text', true,
      'include_in_profile_audio', true,
      'include_in_story_list', false,
      'include_in_book_body', false
    )
from outline_questions source
where q.id = source.question_id;

with outline_questions as (
  select *
  from (values
    ('TY_ONB01'::text, 1, 'まず、今はどのあたりで、どのように暮らしていますか。普段の過ごし方も、言える範囲で教えてください。'::text, '1 / 4'::text, '地域名や、普段よくしていることから短くお話しください。'::text, '地域名だけでも大丈夫です。'::text, '普段どなたと過ごしているか、よくしていることを一つか二つ話してみてください。'::text, 8, 15),
    ('TY_ONB02'::text, 2, 'では、少し時間をさかのぼります。生まれた地域と、長く育った地域、ご家族のことを教えてください。'::text, '2 / 4'::text, '場所と、一緒に暮らしていた方からお話しください。'::text, '正確な年代や住所を思い出さなくても大丈夫です。'::text, '生まれた場所と育った場所が同じか、ご兄弟がいたかなどから話してみてください。'::text, 15, 30),
    ('TY_ONB03'::text, 3, 'どのような地域で学校生活を送り、その後どのような道へ進みましたか。覚えているところから教えてください。'::text, '3 / 4'::text, '小学校、中学校、その後の進路など、話しやすいところからお話しください。'::text, '学校名や卒業年を正確に思い出さなくても大丈夫です。'::text, '長く過ごした学校や、学校を終えた後に最初にしたことから話してみてください。'::text, 15, 30),
    ('TY_ONB04'::text, 4, '学校を終えた後、どのような仕事や役割を担ってきましたか。暮らしが大きく変わった時期も、思い当たる範囲で教えてください。'::text, '4 / 4'::text, '最初にしたことや、一番長く続けたことからお話しください。'::text, '仕事だけでなく、家庭や地域で担ったことも含めて大丈夫です。'::text, '転居、仕事、結婚、家族の変化など、大きな節目があれば一つだけでも話してみてください。'::text, 20, 40)
  ) as values_table (question_id, onboarding_order, question_text, progress_label, prompt_hint, reassurance_text, followup_hint, min_duration_seconds, min_transcript_chars)
)
update public.question_set_items item
set
  chapter_title_snapshot = '人生の輪郭',
  chapter_subtitle_snapshot = source.progress_label,
  question_text_snapshot = source.question_text,
  is_required = true,
  is_active = true,
  meta_json =
    (coalesce(item.meta_json, '{}'::jsonb)
      - 'question_role'
      - 'onboarding_group'
      - 'onboarding_order'
      - 'progress_label')
    || jsonb_build_object(
      'flow_type', 'onboarding',
      'flow_phase', 'onboarding',
      'question_role', 'profile_source',
      'onboarding_group', 'life_outline',
      'onboarding_order', source.onboarding_order,
      'progress_label', source.progress_label,
      'include_in_profile_text', true,
      'include_in_profile_audio', true,
      'include_in_story_list', false,
      'include_in_book_body', false
    ),
  prompt_style = 'gentle',
  prompt_hint_snapshot = source.prompt_hint,
  reassurance_text_snapshot = source.reassurance_text,
  followup_hint_snapshot = source.followup_hint,
  min_duration_seconds = source.min_duration_seconds,
  min_transcript_chars = source.min_transcript_chars
from outline_questions source
where item.question_id = source.question_id;

with outline_questions as (
  select *
  from (values
    ('TY_ONB01'::text, 1, 'まず、今はどのあたりで、どのように暮らしていますか。普段の過ごし方も、言える範囲で教えてください。'::text, '1 / 4'::text, '地域名や、普段よくしていることから短くお話しください。'::text, '地域名だけでも大丈夫です。'::text, '普段どなたと過ごしているか、よくしていることを一つか二つ話してみてください。'::text, 8, 15),
    ('TY_ONB02'::text, 2, 'では、少し時間をさかのぼります。生まれた地域と、長く育った地域、ご家族のことを教えてください。'::text, '2 / 4'::text, '場所と、一緒に暮らしていた方からお話しください。'::text, '正確な年代や住所を思い出さなくても大丈夫です。'::text, '生まれた場所と育った場所が同じか、ご兄弟がいたかなどから話してみてください。'::text, 15, 30),
    ('TY_ONB03'::text, 3, 'どのような地域で学校生活を送り、その後どのような道へ進みましたか。覚えているところから教えてください。'::text, '3 / 4'::text, '小学校、中学校、その後の進路など、話しやすいところからお話しください。'::text, '学校名や卒業年を正確に思い出さなくても大丈夫です。'::text, '長く過ごした学校や、学校を終えた後に最初にしたことから話してみてください。'::text, 15, 30),
    ('TY_ONB04'::text, 4, '学校を終えた後、どのような仕事や役割を担ってきましたか。暮らしが大きく変わった時期も、思い当たる範囲で教えてください。'::text, '4 / 4'::text, '最初にしたことや、一番長く続けたことからお話しください。'::text, '仕事だけでなく、家庭や地域で担ったことも含めて大丈夫です。'::text, '転居、仕事、結婚、家族の変化など、大きな節目があれば一つだけでも話してみてください。'::text, 20, 40)
  ) as values_table (question_id, onboarding_order, question_text, progress_label, prompt_hint, reassurance_text, followup_hint, min_duration_seconds, min_transcript_chars)
)
update public.user_questions user_question
set
  chapter = '人生の輪郭',
  chapter_title_snapshot = '人生の輪郭',
  chapter_subtitle_snapshot = source.progress_label,
  question_text_snapshot = source.question_text,
  meta_json =
    (coalesce(user_question.meta_json, '{}'::jsonb)
      - 'question_role'
      - 'onboarding_group'
      - 'onboarding_order'
      - 'progress_label')
    || jsonb_build_object(
      'flow_type', 'onboarding',
      'flow_phase', 'onboarding',
      'question_role', 'profile_source',
      'onboarding_group', 'life_outline',
      'onboarding_order', source.onboarding_order,
      'progress_label', source.progress_label,
      'include_in_profile_text', true,
      'include_in_profile_audio', true,
      'include_in_story_list', false,
      'include_in_book_body', false,
      'prompt_style', 'gentle',
      'prompt_hint', source.prompt_hint,
      'reassurance_text', source.reassurance_text,
      'followup_hint', source.followup_hint,
      'min_duration_seconds', source.min_duration_seconds,
      'min_transcript_chars', source.min_transcript_chars
    )
from outline_questions source
where user_question.question_id = source.question_id;

commit;
