export const CHILDHOOD_MORE_QUESTIONS = [
  { id: 'childhood-food', text: '幼い頃、楽しみにしていたおやつや食べ物はありますか？' },
  { id: 'childhood-season', text: '夏休みやお正月など、季節の行事で覚えていることはありますか？' },
  { id: 'childhood-treasure', text: '子どもの頃、大切にしていたものは何でしたか？' },
  { id: 'childhood-challenge', text: '初めてできるようになって、うれしかったことはありますか？' },
  { id: 'childhood-senses', text: '思い出すと幼い頃に戻るような、音や匂いはありますか？' },
];

// Stable option keys; the adapter must supply only this person's project data.
export function childhoodMoreOptions(questions = [], answeredExtraIds = []) {
  const answered = new Set(answeredExtraIds);
  const seen = new Set();
  const skipped = questions.filter(q => q.status === 'skipped' && q.is_active !== false
    && q.onboarding_group !== 'trial_experience'
    && (q.theme_code === 'ty_theme_childhood' || Number(q.theme_order) === 1)
    && q.user_question_id && !seen.has(q.user_question_id) && seen.add(q.user_question_id))
    .map(q => ({ id: `skipped:${q.user_question_id}`, text: q.content, kind: 'skipped', userQuestionId: q.user_question_id }));
  return [...skipped,
    ...CHILDHOOD_MORE_QUESTIONS.filter(q => !answered.has(q.id)).map(q => ({ ...q, kind: 'extra' })),
    { id: 'free', kind: 'free', text: '自由に語る', description: '問いに沿わず、幼い頃のことで残しておきたいことを。' },
  ];
}

export function selectedMoreOptions(options, selectedIds) {
  const selected = new Set(selectedIds);
  return options.filter(option => selected.has(option.id));
}
