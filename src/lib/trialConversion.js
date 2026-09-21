// Safe display models only. Never associate records using the logged-in account's latest answers.
export function matchesTrialQuestion(row, question) {
  const questionId = row.user_question_id || row.meta_json?.user_question_id;
  return Boolean(question.user_question_id && questionId === question.user_question_id)
    || Boolean(!questionId && question.answer_id && row.id === question.answer_id);
}
export function buildTrialStories({ projectId, personId, questions, answers, media }) {
  return questions.slice(0, 3).map(question => {
    const answer = answers.find(row => row.book_project_id === projectId
      && (!row.subject_person_id || row.subject_person_id === personId)
      && matchesTrialQuestion(row, question));
    const assets = answer ? media.filter(row => row.answer_id === answer.id) : [];
    const audio = assets.filter(row => row.asset_type === 'audio' && row.storage_path)
      .sort((a,b) => Number(a.meta_json?.part || 1) - Number(b.meta_json?.part || 1));
    const text = answer?.transcript_edited || (answer?.selected_style === 'essay'
      ? answer?.transcript_essay : answer?.selected_style === 'clean' ? answer?.transcript_clean : answer?.transcript_readable) || answer?.transcript_clean || answer?.transcript_raw || '';
    return {
      id: question.user_question_id, answerId: answer?.id,
      question: question.content || question.question_text || '',
      title: answer?.meta_json?.print_title || '', text,
      audio, photos: assets.filter(row => row.asset_type === 'photo' && row.storage_path),
      state: !answer || !audio.length ? 'missing_audio' : text ? 'ready' : 'text_pending'
    };
  });
}

export const trialIsReady = stories => stories.length === 3 && stories.every(story => story.state !== 'missing_audio');
export const yen = value => `${Number(value).toLocaleString('ja-JP')}円`;
export const guaranteeDays = mode => mode === 'gift' ? 45 : 30;

// No narrative content, names, IDs, URLs, or free-form attributes leave this boundary.
export function trialEvent(name, mode, onEvent) {
  const allowed = ['trial_conversion_page_viewed', 'trial_story_replayed', 'trial_problem_section_reached',
    'trial_journey_preview_reached', 'trial_book_preview_reached', 'trial_webbook_preview_reached',
    'trial_price_viewed', 'trial_refund_section_viewed', 'trial_payment_options_viewed',
    'trial_purchase_cta_clicked', 'trial_gift_cta_clicked', 'trial_recipient_continue_requested'];
  if (allowed.includes(name)) onEvent?.({ name, version: '1.2', mode: ['self', 'gift', 'recipient', 'paid'].includes(mode) ? mode : 'self' });
}
