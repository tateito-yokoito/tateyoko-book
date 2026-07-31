begin;

-- =========================================================
-- 縦糸横糸 正式質問セット v2
--
-- 初回体験
--   ONB01：声の入口
--   ONB02〜04：人生の輪郭
--
-- 本編
--   TYQ01〜TYQ23：7章・23問
--
-- 既存の koebook_standard_v1 は削除・変更しない。
-- =========================================================


-- =========================================================
-- 1. 本編7章
-- =========================================================

insert into public.chapters (
  id,
  label,
  description,
  display_order,
  is_active
)
values
  (
    'ty_origin',
    '生まれ育ちと原点',
    '幼少期の風景や家族、自分の原点を振り返る章。',
    1,
    true
  ),
  (
    'ty_youth',
    '学びと青春',
    '学校生活や夢中になったこと、若い頃の出会いを振り返る章。',
    2,
    true
  ),
  (
    'ty_work',
    '仕事と担ってきた役割',
    '仕事や社会で担ってきた役割、大切にしてきた姿勢を振り返る章。',
    3,
    true
  ),
  (
    'ty_relationships',
    '家族と大切な人',
    '家族や大切な人との関係、受け取ったものや伝えたい思いを振り返る章。',
    4,
    true
  ),
  (
    'ty_turning_points',
    '転機と心に残る出来事',
    '人生の転機や困難、それを支えたものを振り返る章。',
    5,
    true
  ),
  (
    'ty_values',
    '大切にしてきたこと',
    '人生を通して大切にしてきた価値観や、自分らしい歩みを振り返る章。',
    6,
    true
  ),
  (
    'ty_legacy',
    '受け継いだもの、伝えたいこと',
    '先人から受け継いだものと、次の世代へ手渡したい言葉を残す章。',
    7,
    true
  )
on conflict (id)
do update set
  label = excluded.label,
  description = excluded.description,
  display_order = excluded.display_order,
  is_active = excluded.is_active;


-- =========================================================
-- 2. 初回体験4問
-- =========================================================

insert into public.questions (
  id,
  sequence_order,
  chapter,
  content,
  is_active,
  meta_json,
  chapter_id
)
values
  (
    'TY_ONB01',
    1,
    '声の入口',
    'お名前と、今いる場所を教えてください。',
    true,
    '{
      "product_brand": "tateito_yokoito",
      "question_role": "voice_intro",
      "flow_type": "onboarding",
      "onboarding_group": "voice_intro",
      "onboarding_order": 1,
      "include_in_profile_text": false,
      "include_in_profile_audio": true,
      "include_in_story_list": false,
      "include_in_book_body": false
    }'::jsonb,
    null
  ),
  (
    'TY_ONB02',
    2,
    '人生の輪郭',
    'いつ、どこで生まれ、どのような家族の中で育ちましたか。',
    true,
    '{
      "product_brand": "tateito_yokoito",
      "question_role": "profile_source",
      "flow_type": "onboarding",
      "onboarding_group": "life_outline",
      "onboarding_order": 1,
      "include_in_profile_text": true,
      "include_in_profile_audio": true,
      "include_in_story_list": false,
      "include_in_book_body": false
    }'::jsonb,
    null
  ),
  (
    'TY_ONB03',
    3,
    '人生の輪郭',
    'これまで、どのような仕事や役割を担ってきましたか。',
    true,
    '{
      "product_brand": "tateito_yokoito",
      "question_role": "profile_source",
      "flow_type": "onboarding",
      "onboarding_group": "life_outline",
      "onboarding_order": 2,
      "include_in_profile_text": true,
      "include_in_profile_audio": true,
      "include_in_story_list": false,
      "include_in_book_body": false
    }'::jsonb,
    null
  ),
  (
    'TY_ONB04',
    4,
    '人生の輪郭',
    '今は、どなたと、どのような毎日を過ごしていますか。',
    true,
    '{
      "product_brand": "tateito_yokoito",
      "question_role": "profile_source",
      "flow_type": "onboarding",
      "onboarding_group": "life_outline",
      "onboarding_order": 3,
      "include_in_profile_text": true,
      "include_in_profile_audio": true,
      "include_in_story_list": false,
      "include_in_book_body": false
    }'::jsonb,
    null
  )
on conflict (id)
do update set
  sequence_order = excluded.sequence_order,
  chapter = excluded.chapter,
  content = excluded.content,
  is_active = excluded.is_active,
  meta_json = excluded.meta_json,
  chapter_id = excluded.chapter_id;


-- =========================================================
-- 3. 本編23問
-- =========================================================

insert into public.questions (
  id,
  sequence_order,
  chapter,
  content,
  is_active,
  meta_json,
  chapter_id
)
values
  (
    'TY_Q01',
    5,
    '生まれ育ちと原点',
    '子どもの頃に暮らしていた家や、その周りは、どのような場所でしたか。',
    true,
    '{
      "product_brand": "tateito_yokoito",
      "flow_type": "story",
      "onboarding_group": "first_story",
      "question_role": "first_story",
      "include_in_profile_text": false,
      "include_in_profile_audio": false,
      "include_in_story_list": true,
      "include_in_book_body": true
    }'::jsonb,
    'ty_origin'
  ),
  (
    'TY_Q02',
    6,
    '生まれ育ちと原点',
    '子どもの頃、家族とはどのように過ごしていましたか。よく覚えている場面を教えてください。',
    true,
    '{"product_brand":"tateito_yokoito","flow_type":"story","include_in_story_list":true,"include_in_book_body":true}'::jsonb,
    'ty_origin'
  ),
  (
    'TY_Q03',
    7,
    '生まれ育ちと原点',
    '子どもの頃の自分は、どのような子どもだったと思いますか。',
    true,
    '{"product_brand":"tateito_yokoito","flow_type":"story","include_in_story_list":true,"include_in_book_body":true}'::jsonb,
    'ty_origin'
  ),
  (
    'TY_Q04',
    8,
    '学びと青春',
    '学校生活の中で、今でもよく覚えている出来事はありますか。',
    true,
    '{"product_brand":"tateito_yokoito","flow_type":"story","include_in_story_list":true,"include_in_book_body":true}'::jsonb,
    'ty_youth'
  ),
  (
    'TY_Q05',
    9,
    '学びと青春',
    '夢中になっていたことや、時間を忘れて取り組んでいたことは何でしたか。',
    true,
    '{"product_brand":"tateito_yokoito","flow_type":"story","include_in_story_list":true,"include_in_book_body":true}'::jsonb,
    'ty_youth'
  ),
  (
    'TY_Q06',
    10,
    '学びと青春',
    '若い頃に出会い、その後の自分に影響を与えた人や言葉はありますか。',
    true,
    '{"product_brand":"tateito_yokoito","flow_type":"story","include_in_story_list":true,"include_in_book_body":true}'::jsonb,
    'ty_youth'
  ),
  (
    'TY_Q07',
    11,
    '仕事と担ってきた役割',
    '最初に仕事を始めた頃のことを教えてください。どのような気持ちで働いていましたか。',
    true,
    '{"product_brand":"tateito_yokoito","flow_type":"story","include_in_story_list":true,"include_in_book_body":true}'::jsonb,
    'ty_work'
  ),
  (
    'TY_Q08',
    12,
    '仕事と担ってきた役割',
    'これまでの仕事や役割の中で、特に心に残っている出来事は何ですか。',
    true,
    '{"product_brand":"tateito_yokoito","flow_type":"story","include_in_story_list":true,"include_in_book_body":true}'::jsonb,
    'ty_work'
  ),
  (
    'TY_Q09',
    13,
    '仕事と担ってきた役割',
    '仕事や役割を担ううえで、大切にしてきた考え方や姿勢はありますか。',
    true,
    '{"product_brand":"tateito_yokoito","flow_type":"story","include_in_story_list":true,"include_in_book_body":true}'::jsonb,
    'ty_work'
  ),
  (
    'TY_Q10',
    14,
    '家族と大切な人',
    '家族や大切な人との思い出で、今でもよく覚えている場面はありますか。',
    true,
    '{"product_brand":"tateito_yokoito","flow_type":"story","include_in_story_list":true,"include_in_book_body":true}'::jsonb,
    'ty_relationships'
  ),
  (
    'TY_Q11',
    15,
    '家族と大切な人',
    '家族から受け取ったものの中で、今の自分につながっているものは何ですか。',
    true,
    '{"product_brand":"tateito_yokoito","flow_type":"story","include_in_story_list":true,"include_in_book_body":true}'::jsonb,
    'ty_relationships'
  ),
  (
    'TY_Q12',
    16,
    '家族と大切な人',
    '家族や大切な人に、これまで十分に言葉にしてこなかった思いはありますか。',
    true,
    '{"product_brand":"tateito_yokoito","flow_type":"story","include_in_story_list":true,"include_in_book_body":true}'::jsonb,
    'ty_relationships'
  ),
  (
    'TY_Q13',
    17,
    '転機と心に残る出来事',
    '振り返ると、人生の流れが変わったと感じる出来事はありますか。',
    true,
    '{"product_brand":"tateito_yokoito","flow_type":"story","include_in_story_list":true,"include_in_book_body":true}'::jsonb,
    'ty_turning_points'
  ),
  (
    'TY_Q14',
    18,
    '転機と心に残る出来事',
    'これまでの人生で、特に大変だった時期について、話せる範囲で教えてください。',
    true,
    '{"product_brand":"tateito_yokoito","flow_type":"story","include_in_story_list":true,"include_in_book_body":true}'::jsonb,
    'ty_turning_points'
  ),
  (
    'TY_Q15',
    19,
    '転機と心に残る出来事',
    'その時期を乗り越える支えになったものは何でしたか。',
    true,
    '{"product_brand":"tateito_yokoito","flow_type":"story","include_in_story_list":true,"include_in_book_body":true}'::jsonb,
    'ty_turning_points'
  ),
  (
    'TY_Q16',
    20,
    '転機と心に残る出来事',
    '当時は失敗だと思っていたけれど、今振り返ると意味があったと思える出来事はありますか。',
    true,
    '{"product_brand":"tateito_yokoito","flow_type":"story","include_in_story_list":true,"include_in_book_body":true}'::jsonb,
    'ty_turning_points'
  ),
  (
    'TY_Q17',
    21,
    '大切にしてきたこと',
    '人生を通して、「これは大切にしてきた」と言えるものは何ですか。',
    true,
    '{"product_brand":"tateito_yokoito","flow_type":"story","include_in_story_list":true,"include_in_book_body":true}'::jsonb,
    'ty_values'
  ),
  (
    'TY_Q18',
    22,
    '大切にしてきたこと',
    '何かを決めるとき、自分なりによりどころとしてきた考え方はありますか。',
    true,
    '{"product_brand":"tateito_yokoito","flow_type":"story","include_in_story_list":true,"include_in_book_body":true}'::jsonb,
    'ty_values'
  ),
  (
    'TY_Q19',
    23,
    '大切にしてきたこと',
    '今振り返って、「自分なりによくやってきた」と思えることは何ですか。',
    true,
    '{"product_brand":"tateito_yokoito","flow_type":"story","include_in_story_list":true,"include_in_book_body":true}'::jsonb,
    'ty_values'
  ),
  (
    'TY_Q20',
    24,
    '受け継いだもの、伝えたいこと',
    '親や祖父母、先人から受け継いだと感じるものはありますか。',
    true,
    '{"product_brand":"tateito_yokoito","flow_type":"story","include_in_story_list":true,"include_in_book_body":true}'::jsonb,
    'ty_legacy'
  ),
  (
    'TY_Q21',
    25,
    '受け継いだもの、伝えたいこと',
    '次の世代にも残ってほしいと思う、家族の習慣や考え方はありますか。',
    true,
    '{"product_brand":"tateito_yokoito","flow_type":"story","include_in_story_list":true,"include_in_book_body":true}'::jsonb,
    'ty_legacy'
  ),
  (
    'TY_Q22',
    26,
    '受け継いだもの、伝えたいこと',
    '家族が迷ったり困ったりしたときに、思い出してほしいことは何ですか。',
    true,
    '{"product_brand":"tateito_yokoito","flow_type":"story","include_in_story_list":true,"include_in_book_body":true}'::jsonb,
    'ty_legacy'
  ),
  (
    'TY_Q23',
    27,
    '受け継いだもの、伝えたいこと',
    'いつか家族がこの本を読むとしたら、最後にどのような言葉を手渡したいですか。',
    true,
    '{"product_brand":"tateito_yokoito","flow_type":"story","include_in_story_list":true,"include_in_book_body":true}'::jsonb,
    'ty_legacy'
  )
on conflict (id)
do update set
  sequence_order = excluded.sequence_order,
  chapter = excluded.chapter,
  content = excluded.content,
  is_active = excluded.is_active,
  meta_json = excluded.meta_json,
  chapter_id = excluded.chapter_id;


-- =========================================================
-- 4. v2質問セット
-- =========================================================

insert into public.question_sets (
  code,
  name,
  description,
  product_type,
  version,
  is_active,
  is_default,
  meta_json
)
values (
  'tateito_yokoito_standard_v2',
  '縦糸横糸 Standard v2',
  '初回の人生の輪郭4問と、本編7章23問からなる正式質問セット。',
  'koebook',
  'v2',
  true,
  false,
  '{
    "brand": "縦糸横糸",
    "question_count": 27,
    "onboarding_question_count": 4,
    "story_question_count": 23,
    "published": true,
    "immutable_after_release": true
  }'::jsonb
)
on conflict (code)
do update set
  name = excluded.name,
  description = excluded.description,
  product_type = excluded.product_type,
  version = excluded.version,
  is_active = excluded.is_active,
  meta_json = excluded.meta_json;


-- =========================================================
-- 5. 質問セットへ27問を登録
-- =========================================================

insert into public.question_set_items (
  question_set_id,
  question_id,
  sequence_order,
  chapter_id,
  chapter_title_snapshot,
  chapter_subtitle_snapshot,
  question_text_snapshot,
  is_required,
  is_active,
  meta_json,
  prompt_style,
  prompt_hint_snapshot,
  reassurance_text_snapshot,
  followup_hint_snapshot,
  min_duration_seconds,
  min_transcript_chars
)
select
  qs.id,
  source.question_id,
  source.sequence_order,
  source.chapter_id,
  source.chapter_title,
  source.chapter_subtitle,
  q.content,
  source.is_required,
  true,
  q.meta_json || source.item_meta,
  source.prompt_style,
  source.prompt_hint,
  source.reassurance_text,
  source.followup_hint,
  source.min_duration_seconds,
  source.min_transcript_chars
from public.question_sets qs
join (
  values
    (
      'TY_ONB01', 1, null::text,
      '声の入口', null::text,
      true,
      '{"flow_phase":"onboarding","progress_label":null}'::jsonb,
      'gentle',
      '短く、普段どおりにお話しください。',
      'うまく話そうとしなくても大丈夫です。',
      null::text,
      5,
      1
    ),
    (
      'TY_ONB02', 2, null::text,
      '人生の輪郭', '1 / 3',
      true,
      '{"flow_phase":"onboarding","progress_label":"1 / 3"}'::jsonb,
      'gentle',
      '思い出せるところから、ゆっくりお話しください。',
      '正確な年代を思い出せなくても大丈夫です。',
      '生まれた場所、家族構成、家の雰囲気などから話してみてください。',
      15,
      30
    ),
    (
      'TY_ONB03', 3, null::text,
      '人生の輪郭', '2 / 3',
      true,
      '{"flow_phase":"onboarding","progress_label":"2 / 3"}'::jsonb,
      'gentle',
      '仕事以外の役割も含めて、思い浮かぶことをお話しください。',
      'すべてを順番に話さなくても大丈夫です。',
      '仕事、家事、地域での役割なども含めて考えてみてください。',
      15,
      30
    ),
    (
      'TY_ONB04', 4, null::text,
      '人生の輪郭', '3 / 3',
      true,
      '{"flow_phase":"onboarding","progress_label":"3 / 3"}'::jsonb,
      'gentle',
      '今の暮らしの様子を、普段の言葉でお話しください。',
      '特別な出来事でなくても大丈夫です。',
      '一緒に暮らす人、日課、楽しみなどから話してみてください。',
      15,
      30
    ),
    (
      'TY_Q01', 5, 'ty_origin',
      '生まれ育ちと原点', null::text,
      true,
      '{"flow_phase":"first_story","completes_onboarding":true}'::jsonb,
      'memory',
      '家の中や外の風景を思い浮かべながらお話しください。',
      '細かなことを思い出せなくても大丈夫です。',
      '部屋、庭、道、音、匂い、近所の様子などから話してみてください。',
      25,
      80
    ),
    (
      'TY_Q02', 6, 'ty_origin',
      '生まれ育ちと原点', null::text,
      false, '{}'::jsonb, 'memory', null::text,
      'ひとつの場面だけでも大丈夫です。', null::text, 25, 80
    ),
    (
      'TY_Q03', 7, 'ty_origin',
      '生まれ育ちと原点', null::text,
      false, '{}'::jsonb, 'reflection', null::text,
      '今の自分から見た印象で大丈夫です。', null::text, 25, 80
    ),
    (
      'TY_Q04', 8, 'ty_youth',
      '学びと青春', null::text,
      false, '{}'::jsonb, 'memory', null::text,
      '小さな出来事でも大丈夫です。', null::text, 25, 80
    ),
    (
      'TY_Q05', 9, 'ty_youth',
      '学びと青春', null::text,
      false, '{}'::jsonb, 'memory', null::text,
      '趣味や遊び、勉強、仕事など、どのようなことでも大丈夫です。', null::text, 25, 80
    ),
    (
      'TY_Q06', 10, 'ty_youth',
      '学びと青春', null::text,
      false, '{}'::jsonb, 'reflection', null::text,
      'すぐに一人に絞れなくても大丈夫です。', null::text, 25, 80
    ),
    (
      'TY_Q07', 11, 'ty_work',
      '仕事と担ってきた役割', null::text,
      false, '{}'::jsonb, 'memory', null::text,
      '最初の仕事に限らず、本格的に役割を担い始めた頃でも大丈夫です。', null::text, 25, 80
    ),
    (
      'TY_Q08', 12, 'ty_work',
      '仕事と担ってきた役割', null::text,
      false, '{}'::jsonb, 'memory', null::text,
      '成功したことだけでなく、心に残る出来事で大丈夫です。', null::text, 25, 80
    ),
    (
      'TY_Q09', 13, 'ty_work',
      '仕事と担ってきた役割', null::text,
      false, '{}'::jsonb, 'reflection', null::text,
      'うまく言葉にできなくても、具体的な場面から話してみてください。', null::text, 25, 80
    ),
    (
      'TY_Q10', 14, 'ty_relationships',
      '家族と大切な人', null::text,
      false, '{}'::jsonb, 'memory', null::text,
      '家族以外の大切な方について話しても大丈夫です。', null::text, 25, 80
    ),
    (
      'TY_Q11', 15, 'ty_relationships',
      '家族と大切な人', null::text,
      false, '{}'::jsonb, 'reflection', null::text,
      '言葉、習慣、姿勢、考え方など、形のないものでも大丈夫です。', null::text, 25, 80
    ),
    (
      'TY_Q12', 16, 'ty_relationships',
      '家族と大切な人', null::text,
      false, '{}'::jsonb, 'message', null::text,
      '話せる範囲で大丈夫です。', null::text, 25, 80
    ),
    (
      'TY_Q13', 17, 'ty_turning_points',
      '転機と心に残る出来事', null::text,
      false, '{}'::jsonb, 'reflection', null::text,
      'その時には転機だと気づいていなかった出来事でも大丈夫です。', null::text, 25, 80
    ),
    (
      'TY_Q14', 18, 'ty_turning_points',
      '転機と心に残る出来事', null::text,
      false, '{}'::jsonb, 'sensitive', null::text,
      '無理に詳しく話す必要はありません。話せる範囲で大丈夫です。', null::text, 25, 80
    ),
    (
      'TY_Q15', 19, 'ty_turning_points',
      '転機と心に残る出来事', null::text,
      false, '{}'::jsonb, 'reflection', null::text,
      '人、言葉、習慣、環境など、どのようなものでも大丈夫です。', null::text, 25, 80
    ),
    (
      'TY_Q16', 20, 'ty_turning_points',
      '転機と心に残る出来事', null::text,
      false, '{}'::jsonb, 'reflection', null::text,
      '今も失敗だったと感じている場合は、その気持ちのままでも大丈夫です。', null::text, 25, 80
    ),
    (
      'TY_Q17', 21, 'ty_values',
      '大切にしてきたこと', null::text,
      false, '{}'::jsonb, 'reflection', null::text,
      'ひとつに絞れなくても大丈夫です。', null::text, 25, 80
    ),
    (
      'TY_Q18', 22, 'ty_values',
      '大切にしてきたこと', null::text,
      false, '{}'::jsonb, 'reflection', null::text,
      '立派な言葉でなく、普段の判断の癖でも大丈夫です。', null::text, 25, 80
    ),
    (
      'TY_Q19', 23, 'ty_values',
      '大切にしてきたこと', null::text,
      false, '{}'::jsonb, 'reflection', null::text,
      '人から評価されたことではなく、ご自身の感覚で大丈夫です。', null::text, 25, 80
    ),
    (
      'TY_Q20', 24, 'ty_legacy',
      '受け継いだもの、伝えたいこと', null::text,
      false, '{}'::jsonb, 'reflection', null::text,
      '考え方、性格、技術、習慣など、どのようなものでも大丈夫です。', null::text, 25, 80
    ),
    (
      'TY_Q21', 25, 'ty_legacy',
      '受け継いだもの、伝えたいこと', null::text,
      false, '{}'::jsonb, 'message', null::text,
      '小さな習慣や家族らしい言葉でも大丈夫です。', null::text, 25, 80
    ),
    (
      'TY_Q22', 26, 'ty_legacy',
      '受け継いだもの、伝えたいこと', null::text,
      false, '{}'::jsonb, 'message', null::text,
      '答えを示す言葉でなくても大丈夫です。', null::text, 25, 80
    ),
    (
      'TY_Q23', 27, 'ty_legacy',
      '受け継いだもの、伝えたいこと', null::text,
      false, '{}'::jsonb, 'message', null::text,
      '今の時点で伝えたい言葉を、そのままお話しください。', null::text, 25, 80
    )
) as source (
  question_id,
  sequence_order,
  chapter_id,
  chapter_title,
  chapter_subtitle,
  is_required,
  item_meta,
  prompt_style,
  prompt_hint,
  reassurance_text,
  followup_hint,
  min_duration_seconds,
  min_transcript_chars
)
  on true
join public.questions q
  on q.id = source.question_id
where qs.code = 'tateito_yokoito_standard_v2'
on conflict (question_set_id, question_id)
do update set
  sequence_order = excluded.sequence_order,
  chapter_id = excluded.chapter_id,
  chapter_title_snapshot = excluded.chapter_title_snapshot,
  chapter_subtitle_snapshot = excluded.chapter_subtitle_snapshot,
  question_text_snapshot = excluded.question_text_snapshot,
  is_required = excluded.is_required,
  is_active = excluded.is_active,
  meta_json = excluded.meta_json,
  prompt_style = excluded.prompt_style,
  prompt_hint_snapshot = excluded.prompt_hint_snapshot,
  reassurance_text_snapshot = excluded.reassurance_text_snapshot,
  followup_hint_snapshot = excluded.followup_hint_snapshot,
  min_duration_seconds = excluded.min_duration_seconds,
  min_transcript_chars = excluded.min_transcript_chars,
  updated_at = now();


-- =========================================================
-- 6. デフォルト質問セットをv2へ切り替える
--
-- 既存プロジェクト・既存user_questionsには影響しない。
-- 新規プロジェクト作成時にv2を採用する。
-- =========================================================

update public.question_sets
set
  is_default = false,
  updated_at = now()
where product_type = 'koebook'
  and code <> 'tateito_yokoito_standard_v2'
  and is_default = true;

update public.question_sets
set
  is_default = true,
  is_active = true,
  updated_at = now()
where code = 'tateito_yokoito_standard_v2';


-- =========================================================
-- 7. 登録件数を検証
-- 27問でなければマイグレーションを中止する
-- =========================================================

do $$
declare
  registered_count integer;
begin
  select count(*)
    into registered_count
  from public.question_set_items qsi
  join public.question_sets qs
    on qs.id = qsi.question_set_id
  where qs.code = 'tateito_yokoito_standard_v2'
    and qsi.is_active = true;

  if registered_count <> 27 then
    raise exception
      'tateito_yokoito_standard_v2 must contain 27 active questions, but found %',
      registered_count;
  end if;
end;
$$;

commit;