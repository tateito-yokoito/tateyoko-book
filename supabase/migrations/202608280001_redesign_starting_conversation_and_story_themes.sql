begin;

-- =========================================================
-- 縦糸横糸 質問体験 v3
--
-- ・初回体験を「はじめの会話」3問へ整理する
-- ・本編23問を、固定した9テーマへ再編する
-- ・既存の回答本文と音声は残し、回答済みの質問文も変更しない
-- =========================================================


-- =========================================================
-- 1. 初回選択とテーマ案内の完了状態
-- =========================================================

alter table public.book_projects
  add column if not exists onboarding_preferences jsonb
  not null default '{}'::jsonb;

alter table public.book_projects
  add column if not exists onboarding_preferences_completed_at timestamptz;

alter table public.book_projects
  add column if not exists starting_motivation_completed_at timestamptz;

alter table public.book_projects
  add column if not exists theme_guide_completed_at timestamptz;

comment on column public.book_projects.onboarding_preferences is
  'はじめの会話後に選ぶ、期待・関心のあるテーマ・話題にしてよい人物。';

comment on column public.book_projects.onboarding_preferences_completed_at is
  '初回の選択画面を完了した日時。';

comment on column public.book_projects.starting_motivation_completed_at is
  '任意の「始めたきっかけ・今の気持ち」を録音またはスキップした日時。';

comment on column public.book_projects.theme_guide_completed_at is
  '9テーマの進め方を確認した日時。';

-- すでに初回体験を終えた利用者へ、新しい初回画面を再表示しない。
update public.book_projects
set
  onboarding_preferences_completed_at = coalesce(
    onboarding_preferences_completed_at,
    onboarding_completed_at,
    life_outline_completed_at,
    now()
  ),
  starting_motivation_completed_at = coalesce(
    starting_motivation_completed_at,
    onboarding_completed_at,
    life_outline_completed_at,
    now()
  ),
  theme_guide_completed_at = coalesce(
    theme_guide_completed_at,
    onboarding_completed_at,
    life_outline_completed_at,
    now()
  )
where onboarding_status in (
  'introduction_review',
  'life_outline_completed',
  'completed'
);


-- =========================================================
-- 2. 初回体験を「はじめの会話」3問へ変更
-- =========================================================

with starting_questions as (
  select *
  from (values
    (
      'TY_ONB01'::text,
      1,
      'はじめに、ご自身のお名前をフルネームで教えてください。'::text,
      'お名前を、普段どおりにお話しください。'::text,
      'ゆっくりで大丈夫です。'::text,
      '1 / 3'::text,
      3,
      1
    ),
    (
      'TY_ONB02'::text,
      2,
      'まずは今のことから教えてください。最近は、どんなふうに一日を過ごすことが多いですか？'::text,
      '朝から夜までを順番に話さなくても、よくしていることを一つお話しいただくだけで大丈夫です。'::text,
      '特別な出来事でなくても大丈夫です。'::text,
      '2 / 3'::text,
      8,
      15
    ),
    (
      'TY_ONB03'::text,
      3,
      '日々の中で、楽しみにしている時間や出来事はありますか？'::text,
      '食事、散歩、テレビ、人と話す時間など、小さな楽しみでも大丈夫です。'::text,
      '思い浮かんだものを一つからお話しください。'::text,
      '3 / 3'::text,
      8,
      15
    )
  ) as values_table (
    question_id,
    onboarding_order,
    question_text,
    prompt_hint,
    reassurance_text,
    progress_label,
    min_duration_seconds,
    min_transcript_chars
  )
)
update public.questions question
set
  sequence_order = source.onboarding_order,
  chapter = 'はじめの会話',
  content = source.question_text,
  is_active = true,
  chapter_id = null,
  meta_json =
    (coalesce(question.meta_json, '{}'::jsonb)
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
      'question_role', 'starting_conversation',
      'flow_type', 'onboarding',
      'onboarding_group', 'starting_conversation',
      'onboarding_order', source.onboarding_order,
      'include_in_profile_text', false,
      'include_in_profile_audio', true,
      'include_in_story_list', false,
      'include_in_book_body', false
    )
from starting_questions source
where question.id = source.question_id;

with starting_questions as (
  select *
  from (values
    ('TY_ONB01'::text, 1, 'はじめに、ご自身のお名前をフルネームで教えてください。'::text, 'お名前を、普段どおりにお話しください。'::text, 'ゆっくりで大丈夫です。'::text, '1 / 3'::text, 3, 1),
    ('TY_ONB02'::text, 2, 'まずは今のことから教えてください。最近は、どんなふうに一日を過ごすことが多いですか？'::text, '朝から夜までを順番に話さなくても、よくしていることを一つお話しいただくだけで大丈夫です。'::text, '特別な出来事でなくても大丈夫です。'::text, '2 / 3'::text, 8, 15),
    ('TY_ONB03'::text, 3, '日々の中で、楽しみにしている時間や出来事はありますか？'::text, '食事、散歩、テレビ、人と話す時間など、小さな楽しみでも大丈夫です。'::text, '思い浮かんだものを一つからお話しください。'::text, '3 / 3'::text, 8, 15)
  ) as values_table (question_id, onboarding_order, question_text, prompt_hint, reassurance_text, progress_label, min_duration_seconds, min_transcript_chars)
)
update public.question_set_items item
set
  chapter_id = null,
  chapter_title_snapshot = 'はじめの会話',
  chapter_subtitle_snapshot = source.progress_label,
  question_text_snapshot = source.question_text,
  is_required = true,
  is_active = true,
  prompt_style = 'gentle',
  prompt_hint_snapshot = source.prompt_hint,
  reassurance_text_snapshot = source.reassurance_text,
  followup_hint_snapshot = null,
  min_duration_seconds = source.min_duration_seconds,
  min_transcript_chars = source.min_transcript_chars,
  meta_json =
    (coalesce(item.meta_json, '{}'::jsonb)
      - 'question_role'
      - 'onboarding_group'
      - 'onboarding_order'
      - 'progress_label')
    || jsonb_build_object(
      'flow_type', 'onboarding',
      'flow_phase', 'onboarding',
      'question_role', 'starting_conversation',
      'onboarding_group', 'starting_conversation',
      'onboarding_order', source.onboarding_order,
      'progress_label', source.progress_label,
      'include_in_profile_text', false,
      'include_in_profile_audio', true,
      'include_in_story_list', false,
      'include_in_book_body', false
    )
from starting_questions source, public.question_sets question_set
where
  question_set.id = item.question_set_id
  and
  item.question_id = source.question_id
  and question_set.code = 'tateito_yokoito_standard_v2';

-- 回答済みの表示文は思い出の記録として保持する。
with starting_questions as (
  select *
  from (values
    ('TY_ONB01'::text, 1, 'はじめに、ご自身のお名前をフルネームで教えてください。'::text, 'お名前を、普段どおりにお話しください。'::text, 'ゆっくりで大丈夫です。'::text, '1 / 3'::text, 3, 1),
    ('TY_ONB02'::text, 2, 'まずは今のことから教えてください。最近は、どんなふうに一日を過ごすことが多いですか？'::text, '朝から夜までを順番に話さなくても、よくしていることを一つお話しいただくだけで大丈夫です。'::text, '特別な出来事でなくても大丈夫です。'::text, '2 / 3'::text, 8, 15),
    ('TY_ONB03'::text, 3, '日々の中で、楽しみにしている時間や出来事はありますか？'::text, '食事、散歩、テレビ、人と話す時間など、小さな楽しみでも大丈夫です。'::text, '思い浮かんだものを一つからお話しください。'::text, '3 / 3'::text, 8, 15)
  ) as values_table (question_id, onboarding_order, question_text, prompt_hint, reassurance_text, progress_label, min_duration_seconds, min_transcript_chars)
)
update public.user_questions user_question
set
  chapter = 'はじめの会話',
  chapter_title_snapshot = 'はじめの会話',
  chapter_subtitle_snapshot = source.progress_label,
  question_text_snapshot = case
    when user_question.status = 'answered'
      then user_question.question_text_snapshot
    else source.question_text
  end,
  is_active = true,
  meta_json =
    (coalesce(user_question.meta_json, '{}'::jsonb)
      - 'question_role'
      - 'onboarding_group'
      - 'onboarding_order'
      - 'progress_label')
    || jsonb_build_object(
      'flow_type', 'onboarding',
      'flow_phase', 'onboarding',
      'question_role', 'starting_conversation',
      'onboarding_group', 'starting_conversation',
      'onboarding_order', source.onboarding_order,
      'progress_label', source.progress_label,
      'include_in_profile_text', false,
      'include_in_profile_audio', true,
      'include_in_story_list', false,
      'include_in_book_body', false,
      'prompt_style', 'gentle',
      'prompt_hint', source.prompt_hint,
      'reassurance_text', source.reassurance_text,
      'followup_hint', null,
      'min_duration_seconds', source.min_duration_seconds,
      'min_transcript_chars', source.min_transcript_chars
    )
from starting_questions source
where user_question.question_id = source.question_id;

-- 旧4問目は、必須3問後に本人が選べる任意の語りへ転用する。
update public.questions question
set
  sequence_order = 4,
  chapter = 'はじめの会話',
  content = '今回、声でお話を残すことになったきっかけや、始める今のお気持ちを、よければ聞かせてください。',
  is_active = true,
  chapter_id = null,
  meta_json =
    (coalesce(question.meta_json, '{}'::jsonb)
      - 'question_role'
      - 'onboarding_group'
      - 'onboarding_order'
      - 'include_in_profile_text'
      - 'include_in_profile_audio'
      - 'include_in_story_list'
      - 'include_in_book_body')
    || jsonb_build_object(
      'product_brand', 'tateito_yokoito',
      'question_role', 'starting_motivation',
      'flow_type', 'onboarding',
      'onboarding_group', 'starting_motivation',
      'onboarding_order', 4,
      'include_in_profile_text', false,
      'include_in_profile_audio', true,
      'include_in_story_list', false,
      'include_in_book_body', false
    )
where question.id = 'TY_ONB04';

update public.question_set_items item
set
  sequence_order = 4,
  chapter_id = null,
  chapter_title_snapshot = 'はじめの会話',
  chapter_subtitle_snapshot = '任意',
  question_text_snapshot = '今回、声でお話を残すことになったきっかけや、始める今のお気持ちを、よければ聞かせてください。',
  is_required = false,
  is_active = true,
  prompt_style = 'gentle',
  prompt_hint_snapshot = 'きっかけがはっきりしていなくても、今感じていることだけで大丈夫です。',
  reassurance_text_snapshot = '今は残さず、そのまま次へ進むこともできます。',
  followup_hint_snapshot = null,
  min_duration_seconds = 5,
  min_transcript_chars = 5,
  meta_json =
    (coalesce(item.meta_json, '{}'::jsonb)
      - 'question_role'
      - 'onboarding_group'
      - 'onboarding_order'
      - 'progress_label')
    || jsonb_build_object(
      'flow_type', 'onboarding',
      'flow_phase', 'onboarding',
      'question_role', 'starting_motivation',
      'onboarding_group', 'starting_motivation',
      'onboarding_order', 4,
      'progress_label', '任意',
      'include_in_profile_text', false,
      'include_in_profile_audio', true,
      'include_in_story_list', false,
      'include_in_book_body', false
    )
from public.question_sets question_set
where
  item.question_set_id = question_set.id
  and item.question_id = 'TY_ONB04'
  and question_set.code = 'tateito_yokoito_standard_v2';

-- 回答済みだった旧4問目の質問文は記録として維持する。
update public.user_questions user_question
set
  sequence_order = 4,
  chapter = 'はじめの会話',
  chapter_title_snapshot = 'はじめの会話',
  chapter_subtitle_snapshot = '任意',
  question_text_snapshot = case
    when user_question.status = 'answered'
      then user_question.question_text_snapshot
    else '今回、声でお話を残すことになったきっかけや、始める今のお気持ちを、よければ聞かせてください。'
  end,
  is_active = true,
  meta_json =
    (coalesce(user_question.meta_json, '{}'::jsonb)
      - 'question_role'
      - 'onboarding_group'
      - 'onboarding_order'
      - 'progress_label')
    || jsonb_build_object(
      'flow_type', 'onboarding',
      'flow_phase', 'onboarding',
      'question_role', 'starting_motivation',
      'onboarding_group', 'starting_motivation',
      'onboarding_order', 4,
      'progress_label', '任意',
      'include_in_profile_text', false,
      'include_in_profile_audio', true,
      'include_in_story_list', false,
      'include_in_book_body', false,
      'prompt_style', 'gentle',
      'prompt_hint', 'きっかけがはっきりしていなくても、今感じていることだけで大丈夫です。',
      'reassurance_text', '今は残さず、そのまま次へ進むこともできます。',
      'followup_hint', null,
      'min_duration_seconds', 5,
      'min_transcript_chars', 5
    )
where user_question.question_id = 'TY_ONB04';

-- 旧4問目へすでに回答済みの場合は、任意の語りも完了済みとして扱う。
update public.book_projects project
set starting_motivation_completed_at = coalesce(
  project.starting_motivation_completed_at,
  (
    select user_question.answered_at
    from public.user_questions user_question
    where
      user_question.book_project_id = project.id
      and user_question.question_id = 'TY_ONB04'
      and user_question.status = 'answered'
    order by user_question.answered_at desc nulls last
    limit 1
  ),
  now()
)
where
  project.starting_motivation_completed_at is null
  and exists (
    select 1
    from public.user_questions user_question
    where
      user_question.book_project_id = project.id
      and user_question.question_id = 'TY_ONB04'
      and user_question.status = 'answered'
  );


-- =========================================================
-- 3. 本編の固定9テーマ
-- =========================================================

insert into public.chapters (
  id,
  label,
  description,
  display_order,
  is_active
)
values
  ('ty_theme_childhood', '幼い頃', '家、遊び、家族、地域の風景など、具体的な記憶から語るテーマ。', 1, true),
  ('ty_theme_youth', '学生時代・若い頃', '学校生活、友人、夢中になったこと、進路などを語るテーマ。', 2, true),
  ('ty_theme_likes', '好きなこと', '趣味、食べ物、音楽、本、映画など、自分らしさにつながる好みを語るテーマ。', 3, true),
  ('ty_theme_living', '暮らし', '住まい、旅、習慣、家庭の味など、日々の営みを語るテーマ。', 4, true),
  ('ty_theme_work', '仕事・役割', '仕事、家事、地域で担った役割や、大切にしてきた姿勢を語るテーマ。', 5, true),
  ('ty_theme_connections', '人とのつながり', '友人、恩人、先生、仕事仲間など、人との出会いを語るテーマ。', 6, true),
  ('ty_theme_family', '家族の記憶', '親、祖父母、きょうだい、親戚など、家族の記憶を語るテーマ。', 7, true),
  ('ty_theme_turning_points', '人生の転機', '決断、変化、苦労、乗り越えたことを語るテーマ。', 8, true),
  ('ty_theme_now_future', '今とこれから', '現在大切にしていること、楽しみ、未来へ残したい言葉を語るテーマ。', 9, true)
on conflict (id)
do update set
  label = excluded.label,
  description = excluded.description,
  display_order = excluded.display_order,
  is_active = excluded.is_active;

with story_questions as (
  select *
  from (values
    ('TY_Q01'::text, 4, 'ty_theme_childhood'::text, '幼い頃'::text, 1, '場所・地域'::text, '子どもの頃は、どのあたりで暮らしていましたか？'::text, 'memory', '地名や地域の様子から、覚えている範囲でお話しください。', '正確な住所を思い出さなくても大丈夫です。'),
    ('TY_Q02', 5, 'ty_theme_childhood', '幼い頃', 1, '遊び・場所', 'その頃、よく遊んでいた場所はどこでしたか？', 'memory', '誰と、どのように遊んでいたかも思い出せればお話しください。', '一つの場所だけでも大丈夫です。'),
    ('TY_Q03', 6, 'ty_theme_childhood', '幼い頃', 1, '家・風景', '子どもの頃の家や、その周りで覚えている風景を教えてください。', 'memory', '部屋、庭、道、音、匂い、近所の様子などから話してみてください。', '細かなことを思い出せなくても大丈夫です。'),
    ('TY_Q04', 7, 'ty_theme_youth', '学生時代・若い頃', 2, '学校生活', '学校で、今でもよく覚えている出来事はありますか？', 'memory', '行事、授業、休み時間など、思い浮かぶ場面からお話しください。', '小さな出来事でも大丈夫です。'),
    ('TY_Q05', 8, 'ty_theme_youth', '学生時代・若い頃', 2, '友人・先生', '仲の良かった友達や、心に残っている先生はどんな方でしたか？', 'memory', 'その方との思い出を一つ添えてみてください。', '一人に絞れなくても大丈夫です。'),
    ('TY_Q06', 9, 'ty_theme_youth', '学生時代・若い頃', 2, '熱中・進路', '学生時代や若い頃、夢中になっていたことは何でしたか？', 'memory', '部活動、勉強、遊び、仕事など、どのようなことでも大丈夫です。', 'うまく続かなかったことでも大丈夫です。'),
    ('TY_Q07', 10, 'ty_theme_likes', '好きなこと', 3, '趣味・特技', 'これまで夢中になってきた趣味や好きなことは何ですか？', 'memory', '始めたきっかけや、好きな理由も思い出せればお話しください。', '今は続けていないことでも大丈夫です。'),
    ('TY_Q08', 11, 'ty_theme_likes', '好きなこと', 3, '好み・作品', '好きな食べ物、音楽、本、映画など、思い出と結びついているものはありますか？', 'memory', '一つ選び、それにまつわる場面をお話しください。', 'どの分野から選んでも大丈夫です。'),
    ('TY_Q09', 12, 'ty_theme_living', '暮らし', 4, '住まい', 'これまで暮らした中で、特に思い出深い住まいはどこですか？', 'memory', '家の様子や、一緒に暮らしていた方、その場所での出来事をお話しください。', '今の住まいのお話でも大丈夫です。'),
    ('TY_Q10', 13, 'ty_theme_living', '暮らし', 4, '日々・旅', '旅や日々の習慣、家庭の味など、暮らしの中で残しておきたい思い出はありますか？', 'memory', '旅、料理、ペット、季節の行事などから一つ選んでみてください。', '特別な出来事でなくても大丈夫です。'),
    ('TY_Q11', 14, 'ty_theme_work', '仕事・役割', 5, '経歴・役割', 'これまで、どのような仕事や役割を担ってきましたか？', 'memory', '最初にしたことや、一番長く続けたことからお話しください。', '仕事だけでなく、家庭や地域で担ったことも含めて大丈夫です。'),
    ('TY_Q12', 15, 'ty_theme_work', '仕事・役割', 5, 'やりがい', '仕事や役割の中で、特にやりがいを感じた出来事は何ですか？', 'reflection', 'うまくいったことや、誰かに喜ばれた場面を思い出してみてください。', '大きな成果でなくても大丈夫です。'),
    ('TY_Q13', 16, 'ty_theme_work', '仕事・役割', 5, '姿勢・価値観', '仕事や役割を担ううえで、大切にしてきた考え方や姿勢はありますか？', 'reflection', '具体的な出来事から思い出してみてください。', 'きれいな言葉にまとめなくても大丈夫です。'),
    ('TY_Q14', 17, 'ty_theme_connections', '人とのつながり', 6, '友人・恩人', '親友と呼べる人や、思い出深い友人・恩人はどんな方ですか？', 'memory', '出会った頃や、その方らしい出来事をお話しください。', '一人に絞れなくても大丈夫です。'),
    ('TY_Q15', 18, 'ty_theme_connections', '人とのつながり', 6, '影響・関係', '人との出会いや付き合いの中で、今の自分につながっているものはありますか？', 'reflection', '受け取った言葉、教わったこと、続いている習慣などを思い出してみてください。', 'すぐに答えがまとまらなくても大丈夫です。'),
    ('TY_Q16', 19, 'ty_theme_family', '家族の記憶', 7, '人物像', 'お母さんやお父さん、祖父母、きょうだいは、それぞれどんな方でしたか？', 'memory', '今、話しておきたい方を一人選んでお話しください。', 'すべての方について話さなくても大丈夫です。'),
    ('TY_Q17', 20, 'ty_theme_family', '家族の記憶', 7, '場面・エピソード', '家族や親戚とのことで、懐かしく思い出す場面を教えてください。', 'memory', '食卓、行事、旅行、何気ない会話などから思い出してみてください。', '楽しい思い出だけでなく、話したい場面で大丈夫です。'),
    ('TY_Q18', 21, 'ty_theme_turning_points', '人生の転機', 8, '転機・決断', '振り返ると、人生の流れが変わったと感じる出来事はありますか？', 'reflection', '仕事、結婚、引っ越し、出会いなど、思い浮かぶ節目からお話しください。', '一番大きな出来事でなくても大丈夫です。'),
    ('TY_Q19', 22, 'ty_theme_turning_points', '人生の転機', 8, '支え・回復', '大変だった時期を支えた人やもの、乗り越える力になったことは何でしたか？', 'reflection', '話せる範囲で、その時期と支えになったものをお話しください。', 'つらい部分を詳しく話さなくても大丈夫です。'),
    ('TY_Q20', 23, 'ty_theme_turning_points', '人生の転機', 8, '再解釈', '当時は失敗だと思ったけれど、今は意味があったと思える出来事はありますか？', 'reflection', 'その時と今で、見方がどう変わったかをお話しください。', '思い当たらなければ、この問いは飛ばして大丈夫です。'),
    ('TY_Q21', 24, 'ty_theme_now_future', '今とこれから', 9, '現在・価値観', '今、日々の中で大切にしていることは何ですか？', 'reflection', '人、時間、習慣、考え方などから思い浮かぶものをお話しください。', '一つだけでも大丈夫です。'),
    ('TY_Q22', 25, 'ty_theme_now_future', '今とこれから', 9, '楽しみ・願い', 'これから楽しみにしていることや、挑戦してみたいことはありますか？', 'reflection', '小さな楽しみや、実現するか分からない夢でも大丈夫です。', '今は思い浮かばなくても大丈夫です。'),
    ('TY_Q23', 26, 'ty_theme_now_future', '今とこれから', 9, '未来・継承', '家族や未来の人へ、残しておきたい言葉はありますか？', 'legacy', '大切にしてほしいことや、伝えておきたい気持ちをお話しください。', 'きれいにまとめず、普段の言葉で大丈夫です。')
  ) as values_table (
    question_id,
    sequence_order,
    chapter_id,
    theme_label,
    theme_order,
    angle,
    question_text,
    prompt_style,
    prompt_hint,
    reassurance_text
  )
)
update public.questions question
set
  chapter = source.theme_label,
  content = source.question_text,
  is_active = true,
  chapter_id = source.chapter_id,
  meta_json =
    (coalesce(question.meta_json, '{}'::jsonb)
      - 'onboarding_group'
      - 'completes_onboarding'
      - 'flow_phase'
      - 'theme_code'
      - 'theme_label'
      - 'theme_order'
      - 'angle')
    || jsonb_build_object(
      'product_brand', 'tateito_yokoito',
      'flow_type', 'story',
      'question_role', case
        when source.question_id = 'TY_Q01' then 'first_weekly_question'
        else 'story_question'
      end,
      'theme_code', source.chapter_id,
      'theme_label', source.theme_label,
      'theme_order', source.theme_order,
      'angle', source.angle,
      'include_in_profile_text', false,
      'include_in_profile_audio', false,
      'include_in_story_list', true,
      'include_in_book_body', true
    )
from story_questions source
where question.id = source.question_id;

with story_questions as (
  select *
  from (values
    ('TY_Q01'::text, 4, 'ty_theme_childhood'::text, '幼い頃'::text, 1, '場所・地域'::text, '子どもの頃は、どのあたりで暮らしていましたか？'::text, 'memory', '地名や地域の様子から、覚えている範囲でお話しください。', '正確な住所を思い出さなくても大丈夫です。'),
    ('TY_Q02', 5, 'ty_theme_childhood', '幼い頃', 1, '遊び・場所', 'その頃、よく遊んでいた場所はどこでしたか？', 'memory', '誰と、どのように遊んでいたかも思い出せればお話しください。', '一つの場所だけでも大丈夫です。'),
    ('TY_Q03', 6, 'ty_theme_childhood', '幼い頃', 1, '家・風景', '子どもの頃の家や、その周りで覚えている風景を教えてください。', 'memory', '部屋、庭、道、音、匂い、近所の様子などから話してみてください。', '細かなことを思い出せなくても大丈夫です。'),
    ('TY_Q04', 7, 'ty_theme_youth', '学生時代・若い頃', 2, '学校生活', '学校で、今でもよく覚えている出来事はありますか？', 'memory', '行事、授業、休み時間など、思い浮かぶ場面からお話しください。', '小さな出来事でも大丈夫です。'),
    ('TY_Q05', 8, 'ty_theme_youth', '学生時代・若い頃', 2, '友人・先生', '仲の良かった友達や、心に残っている先生はどんな方でしたか？', 'memory', 'その方との思い出を一つ添えてみてください。', '一人に絞れなくても大丈夫です。'),
    ('TY_Q06', 9, 'ty_theme_youth', '学生時代・若い頃', 2, '熱中・進路', '学生時代や若い頃、夢中になっていたことは何でしたか？', 'memory', '部活動、勉強、遊び、仕事など、どのようなことでも大丈夫です。', 'うまく続かなかったことでも大丈夫です。'),
    ('TY_Q07', 10, 'ty_theme_likes', '好きなこと', 3, '趣味・特技', 'これまで夢中になってきた趣味や好きなことは何ですか？', 'memory', '始めたきっかけや、好きな理由も思い出せればお話しください。', '今は続けていないことでも大丈夫です。'),
    ('TY_Q08', 11, 'ty_theme_likes', '好きなこと', 3, '好み・作品', '好きな食べ物、音楽、本、映画など、思い出と結びついているものはありますか？', 'memory', '一つ選び、それにまつわる場面をお話しください。', 'どの分野から選んでも大丈夫です。'),
    ('TY_Q09', 12, 'ty_theme_living', '暮らし', 4, '住まい', 'これまで暮らした中で、特に思い出深い住まいはどこですか？', 'memory', '家の様子や、一緒に暮らしていた方、その場所での出来事をお話しください。', '今の住まいのお話でも大丈夫です。'),
    ('TY_Q10', 13, 'ty_theme_living', '暮らし', 4, '日々・旅', '旅や日々の習慣、家庭の味など、暮らしの中で残しておきたい思い出はありますか？', 'memory', '旅、料理、ペット、季節の行事などから一つ選んでみてください。', '特別な出来事でなくても大丈夫です。'),
    ('TY_Q11', 14, 'ty_theme_work', '仕事・役割', 5, '経歴・役割', 'これまで、どのような仕事や役割を担ってきましたか？', 'memory', '最初にしたことや、一番長く続けたことからお話しください。', '仕事だけでなく、家庭や地域で担ったことも含めて大丈夫です。'),
    ('TY_Q12', 15, 'ty_theme_work', '仕事・役割', 5, 'やりがい', '仕事や役割の中で、特にやりがいを感じた出来事は何ですか？', 'reflection', 'うまくいったことや、誰かに喜ばれた場面を思い出してみてください。', '大きな成果でなくても大丈夫です。'),
    ('TY_Q13', 16, 'ty_theme_work', '仕事・役割', 5, '姿勢・価値観', '仕事や役割を担ううえで、大切にしてきた考え方や姿勢はありますか？', 'reflection', '具体的な出来事から思い出してみてください。', 'きれいな言葉にまとめなくても大丈夫です。'),
    ('TY_Q14', 17, 'ty_theme_connections', '人とのつながり', 6, '友人・恩人', '親友と呼べる人や、思い出深い友人・恩人はどんな方ですか？', 'memory', '出会った頃や、その方らしい出来事をお話しください。', '一人に絞れなくても大丈夫です。'),
    ('TY_Q15', 18, 'ty_theme_connections', '人とのつながり', 6, '影響・関係', '人との出会いや付き合いの中で、今の自分につながっているものはありますか？', 'reflection', '受け取った言葉、教わったこと、続いている習慣などを思い出してみてください。', 'すぐに答えがまとまらなくても大丈夫です。'),
    ('TY_Q16', 19, 'ty_theme_family', '家族の記憶', 7, '人物像', 'お母さんやお父さん、祖父母、きょうだいは、それぞれどんな方でしたか？', 'memory', '今、話しておきたい方を一人選んでお話しください。', 'すべての方について話さなくても大丈夫です。'),
    ('TY_Q17', 20, 'ty_theme_family', '家族の記憶', 7, '場面・エピソード', '家族や親戚とのことで、懐かしく思い出す場面を教えてください。', 'memory', '食卓、行事、旅行、何気ない会話などから思い出してみてください。', '楽しい思い出だけでなく、話したい場面で大丈夫です。'),
    ('TY_Q18', 21, 'ty_theme_turning_points', '人生の転機', 8, '転機・決断', '振り返ると、人生の流れが変わったと感じる出来事はありますか？', 'reflection', '仕事、結婚、引っ越し、出会いなど、思い浮かぶ節目からお話しください。', '一番大きな出来事でなくても大丈夫です。'),
    ('TY_Q19', 22, 'ty_theme_turning_points', '人生の転機', 8, '支え・回復', '大変だった時期を支えた人やもの、乗り越える力になったことは何でしたか？', 'reflection', '話せる範囲で、その時期と支えになったものをお話しください。', 'つらい部分を詳しく話さなくても大丈夫です。'),
    ('TY_Q20', 23, 'ty_theme_turning_points', '人生の転機', 8, '再解釈', '当時は失敗だと思ったけれど、今は意味があったと思える出来事はありますか？', 'reflection', 'その時と今で、見方がどう変わったかをお話しください。', '思い当たらなければ、この問いは飛ばして大丈夫です。'),
    ('TY_Q21', 24, 'ty_theme_now_future', '今とこれから', 9, '現在・価値観', '今、日々の中で大切にしていることは何ですか？', 'reflection', '人、時間、習慣、考え方などから思い浮かぶものをお話しください。', '一つだけでも大丈夫です。'),
    ('TY_Q22', 25, 'ty_theme_now_future', '今とこれから', 9, '楽しみ・願い', 'これから楽しみにしていることや、挑戦してみたいことはありますか？', 'reflection', '小さな楽しみや、実現するか分からない夢でも大丈夫です。', '今は思い浮かばなくても大丈夫です。'),
    ('TY_Q23', 26, 'ty_theme_now_future', '今とこれから', 9, '未来・継承', '家族や未来の人へ、残しておきたい言葉はありますか？', 'legacy', '大切にしてほしいことや、伝えておきたい気持ちをお話しください。', 'きれいにまとめず、普段の言葉で大丈夫です。')
  ) as values_table (question_id, sequence_order, chapter_id, theme_label, theme_order, angle, question_text, prompt_style, prompt_hint, reassurance_text)
)
update public.question_set_items item
set
  chapter_id = source.chapter_id,
  chapter_title_snapshot = source.theme_label,
  chapter_subtitle_snapshot = null,
  question_text_snapshot = source.question_text,
  is_active = true,
  prompt_style = source.prompt_style,
  prompt_hint_snapshot = source.prompt_hint,
  reassurance_text_snapshot = source.reassurance_text,
  meta_json =
    (coalesce(item.meta_json, '{}'::jsonb)
      - 'onboarding_group'
      - 'completes_onboarding'
      - 'flow_phase'
      - 'theme_code'
      - 'theme_label'
      - 'theme_order'
      - 'angle')
    || jsonb_build_object(
      'flow_type', 'story',
      'question_role', case
        when source.question_id = 'TY_Q01' then 'first_weekly_question'
        else 'story_question'
      end,
      'theme_code', source.chapter_id,
      'theme_label', source.theme_label,
      'theme_order', source.theme_order,
      'angle', source.angle,
      'include_in_profile_text', false,
      'include_in_profile_audio', false,
      'include_in_story_list', true,
      'include_in_book_body', true
    )
from story_questions source, public.question_sets question_set
where
  question_set.id = item.question_set_id
  and
  item.question_id = source.question_id
  and question_set.code = 'tateito_yokoito_standard_v2';

-- 既存利用者にはテーマ情報を付ける。回答済みの質問文は変えない。
with story_questions as (
  select *
  from (values
    ('TY_Q01'::text, '幼い頃'::text, 1, '場所・地域'::text, '子どもの頃は、どのあたりで暮らしていましたか？'::text, 'memory', '地名や地域の様子から、覚えている範囲でお話しください。', '正確な住所を思い出さなくても大丈夫です。', 'ty_theme_childhood'::text),
    ('TY_Q02', '幼い頃', 1, '遊び・場所', 'その頃、よく遊んでいた場所はどこでしたか？', 'memory', '誰と、どのように遊んでいたかも思い出せればお話しください。', '一つの場所だけでも大丈夫です。', 'ty_theme_childhood'),
    ('TY_Q03', '幼い頃', 1, '家・風景', '子どもの頃の家や、その周りで覚えている風景を教えてください。', 'memory', '部屋、庭、道、音、匂い、近所の様子などから話してみてください。', '細かなことを思い出せなくても大丈夫です。', 'ty_theme_childhood'),
    ('TY_Q04', '学生時代・若い頃', 2, '学校生活', '学校で、今でもよく覚えている出来事はありますか？', 'memory', '行事、授業、休み時間など、思い浮かぶ場面からお話しください。', '小さな出来事でも大丈夫です。', 'ty_theme_youth'),
    ('TY_Q05', '学生時代・若い頃', 2, '友人・先生', '仲の良かった友達や、心に残っている先生はどんな方でしたか？', 'memory', 'その方との思い出を一つ添えてみてください。', '一人に絞れなくても大丈夫です。', 'ty_theme_youth'),
    ('TY_Q06', '学生時代・若い頃', 2, '熱中・進路', '学生時代や若い頃、夢中になっていたことは何でしたか？', 'memory', '部活動、勉強、遊び、仕事など、どのようなことでも大丈夫です。', 'うまく続かなかったことでも大丈夫です。', 'ty_theme_youth'),
    ('TY_Q07', '好きなこと', 3, '趣味・特技', 'これまで夢中になってきた趣味や好きなことは何ですか？', 'memory', '始めたきっかけや、好きな理由も思い出せればお話しください。', '今は続けていないことでも大丈夫です。', 'ty_theme_likes'),
    ('TY_Q08', '好きなこと', 3, '好み・作品', '好きな食べ物、音楽、本、映画など、思い出と結びついているものはありますか？', 'memory', '一つ選び、それにまつわる場面をお話しください。', 'どの分野から選んでも大丈夫です。', 'ty_theme_likes'),
    ('TY_Q09', '暮らし', 4, '住まい', 'これまで暮らした中で、特に思い出深い住まいはどこですか？', 'memory', '家の様子や、一緒に暮らしていた方、その場所での出来事をお話しください。', '今の住まいのお話でも大丈夫です。', 'ty_theme_living'),
    ('TY_Q10', '暮らし', 4, '日々・旅', '旅や日々の習慣、家庭の味など、暮らしの中で残しておきたい思い出はありますか？', 'memory', '旅、料理、ペット、季節の行事などから一つ選んでみてください。', '特別な出来事でなくても大丈夫です。', 'ty_theme_living'),
    ('TY_Q11', '仕事・役割', 5, '経歴・役割', 'これまで、どのような仕事や役割を担ってきましたか？', 'memory', '最初にしたことや、一番長く続けたことからお話しください。', '仕事だけでなく、家庭や地域で担ったことも含めて大丈夫です。', 'ty_theme_work'),
    ('TY_Q12', '仕事・役割', 5, 'やりがい', '仕事や役割の中で、特にやりがいを感じた出来事は何ですか？', 'reflection', 'うまくいったことや、誰かに喜ばれた場面を思い出してみてください。', '大きな成果でなくても大丈夫です。', 'ty_theme_work'),
    ('TY_Q13', '仕事・役割', 5, '姿勢・価値観', '仕事や役割を担ううえで、大切にしてきた考え方や姿勢はありますか？', 'reflection', '具体的な出来事から思い出してみてください。', 'きれいな言葉にまとめなくても大丈夫です。', 'ty_theme_work'),
    ('TY_Q14', '人とのつながり', 6, '友人・恩人', '親友と呼べる人や、思い出深い友人・恩人はどんな方ですか？', 'memory', '出会った頃や、その方らしい出来事をお話しください。', '一人に絞れなくても大丈夫です。', 'ty_theme_connections'),
    ('TY_Q15', '人とのつながり', 6, '影響・関係', '人との出会いや付き合いの中で、今の自分につながっているものはありますか？', 'reflection', '受け取った言葉、教わったこと、続いている習慣などを思い出してみてください。', 'すぐに答えがまとまらなくても大丈夫です。', 'ty_theme_connections'),
    ('TY_Q16', '家族の記憶', 7, '人物像', 'お母さんやお父さん、祖父母、きょうだいは、それぞれどんな方でしたか？', 'memory', '今、話しておきたい方を一人選んでお話しください。', 'すべての方について話さなくても大丈夫です。', 'ty_theme_family'),
    ('TY_Q17', '家族の記憶', 7, '場面・エピソード', '家族や親戚とのことで、懐かしく思い出す場面を教えてください。', 'memory', '食卓、行事、旅行、何気ない会話などから思い出してみてください。', '楽しい思い出だけでなく、話したい場面で大丈夫です。', 'ty_theme_family'),
    ('TY_Q18', '人生の転機', 8, '転機・決断', '振り返ると、人生の流れが変わったと感じる出来事はありますか？', 'reflection', '仕事、結婚、引っ越し、出会いなど、思い浮かぶ節目からお話しください。', '一番大きな出来事でなくても大丈夫です。', 'ty_theme_turning_points'),
    ('TY_Q19', '人生の転機', 8, '支え・回復', '大変だった時期を支えた人やもの、乗り越える力になったことは何でしたか？', 'reflection', '話せる範囲で、その時期と支えになったものをお話しください。', 'つらい部分を詳しく話さなくても大丈夫です。', 'ty_theme_turning_points'),
    ('TY_Q20', '人生の転機', 8, '再解釈', '当時は失敗だと思ったけれど、今は意味があったと思える出来事はありますか？', 'reflection', 'その時と今で、見方がどう変わったかをお話しください。', '思い当たらなければ、この問いは飛ばして大丈夫です。', 'ty_theme_turning_points'),
    ('TY_Q21', '今とこれから', 9, '現在・価値観', '今、日々の中で大切にしていることは何ですか？', 'reflection', '人、時間、習慣、考え方などから思い浮かぶものをお話しください。', '一つだけでも大丈夫です。', 'ty_theme_now_future'),
    ('TY_Q22', '今とこれから', 9, '楽しみ・願い', 'これから楽しみにしていることや、挑戦してみたいことはありますか？', 'reflection', '小さな楽しみや、実現するか分からない夢でも大丈夫です。', '今は思い浮かばなくても大丈夫です。', 'ty_theme_now_future'),
    ('TY_Q23', '今とこれから', 9, '未来・継承', '家族や未来の人へ、残しておきたい言葉はありますか？', 'legacy', '大切にしてほしいことや、伝えておきたい気持ちをお話しください。', 'きれいにまとめず、普段の言葉で大丈夫です。', 'ty_theme_now_future')
  ) as values_table (question_id, theme_label, theme_order, angle, question_text, prompt_style, prompt_hint, reassurance_text, theme_code)
)
update public.user_questions user_question
set
  chapter = source.theme_label,
  chapter_title_snapshot = source.theme_label,
  chapter_subtitle_snapshot = null,
  question_text_snapshot = case
    when user_question.status = 'answered'
      then user_question.question_text_snapshot
    else source.question_text
  end,
  meta_json =
    (coalesce(user_question.meta_json, '{}'::jsonb)
      - 'onboarding_group'
      - 'completes_onboarding'
      - 'flow_phase'
      - 'theme_code'
      - 'theme_label'
      - 'theme_order'
      - 'angle')
    || jsonb_build_object(
      'flow_type', 'story',
      'question_role', case
        when source.question_id = 'TY_Q01' then 'first_weekly_question'
        else 'story_question'
      end,
      'theme_code', source.theme_code,
      'theme_label', source.theme_label,
      'theme_order', source.theme_order,
      'angle', source.angle,
      'include_in_profile_text', false,
      'include_in_profile_audio', false,
      'include_in_story_list', true,
      'include_in_book_body', true,
      'prompt_style', source.prompt_style,
      'prompt_hint', source.prompt_hint,
      'reassurance_text', source.reassurance_text
    )
from story_questions source
where user_question.question_id = source.question_id;


-- =========================================================
-- 4. 質問セットの表示情報
-- =========================================================

update public.question_sets
set
  description = 'はじめの会話3問・任意の語り1問と、本編9テーマ23問からなる正式質問セット。',
  meta_json =
    (coalesce(meta_json, '{}'::jsonb)
      - 'question_count'
      - 'onboarding_question_count'
      - 'story_question_count'
      - 'theme_count')
    || jsonb_build_object(
      'question_count', 27,
      'onboarding_question_count', 4,
      'required_onboarding_question_count', 3,
      'story_question_count', 23,
      'theme_count', 9
    )
where code = 'tateito_yokoito_standard_v2';


-- =========================================================
-- 5. 旧4問目を指している途中利用者を安全な位置へ戻す
-- =========================================================

update public.book_projects project
set
  current_onboarding_user_question_id = coalesce(
    (
      select user_question.id
      from public.user_questions user_question
      where
        user_question.book_project_id = project.id
        and user_question.question_id in ('TY_ONB01', 'TY_ONB02', 'TY_ONB03')
        and user_question.is_active = true
        and user_question.status <> 'answered'
      order by user_question.sequence_order
      limit 1
    ),
    (
      select user_question.id
      from public.user_questions user_question
      where
        user_question.book_project_id = project.id
        and user_question.question_id = 'TY_ONB04'
        and user_question.is_active = true
        and user_question.status <> 'answered'
        and project.starting_motivation_completed_at is null
      limit 1
    ),
    (
      select user_question.id
      from public.user_questions user_question
      where
        user_question.book_project_id = project.id
        and user_question.question_id = 'TY_Q01'
        and user_question.is_active = true
      limit 1
    )
  ),
  onboarding_status = case
    when not exists (
      select 1
      from public.user_questions user_question
      where
        user_question.book_project_id = project.id
        and user_question.question_id in ('TY_ONB01', 'TY_ONB02', 'TY_ONB03')
        and user_question.is_active = true
        and user_question.status <> 'answered'
    ) then 'life_outline_completed'
    else 'in_progress'
  end,
  life_outline_completed_at = case
    when not exists (
      select 1
      from public.user_questions user_question
      where
        user_question.book_project_id = project.id
        and user_question.question_id in ('TY_ONB01', 'TY_ONB02', 'TY_ONB03')
        and user_question.is_active = true
        and user_question.status <> 'answered'
    ) then coalesce(project.life_outline_completed_at, now())
    else project.life_outline_completed_at
  end
where
  project.onboarding_status = 'in_progress'
  and (
    project.current_onboarding_user_question_id is null
    or exists (
      select 1
      from public.user_questions current_question
      where
        current_question.id = project.current_onboarding_user_question_id
        and current_question.question_id not in (
          'TY_ONB01',
          'TY_ONB02',
          'TY_ONB03'
        )
    )
  );

commit;
