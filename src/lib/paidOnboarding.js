// One persisted checkpoint model for paid self-purchases, regardless of entry URL.
// Trial answers never satisfy the separate starting_conversation questions.
export function paidOnboardingApplies(project, questions = []) {
  return project?.access_status === 'paid'
    && !project?.onboarding_preferences?.family_invitation_id
    && questions.some(q => q.onboarding_group === 'starting_conversation');
}

export function paidOnboardingCheckpoint(project, questions = [], context = {}) {
  if (!paidOnboardingApplies(project, questions)) return null;
  if (!project.onboarding_overview_completed_at) return 'onboarding_overview';
  const conversation = questions.filter(q => q.onboarding_group === 'starting_conversation');
  if (conversation.some(q => q.status !== 'answered')) return 0;
  if (!project.theme_guide_completed_at) return project.onboarding_ritual_step === 'theme_guide'
    ? 'theme_guide' : 'starting_conversation_complete';
  if (!project.onboarding_preferences_completed_at) return 'onboarding_preferences';
  if (project.onboarding_ritual_step === 'notification' || !context.notificationPref) return 'notification_setup';
  if (['sharing', 'support'].includes(project.onboarding_ritual_step) || !context.sharingPreference?.initial_setup_completed_at) return project.onboarding_ritual_step === 'support'
    ? 'supporter_invite_initial' : 'sharing_setup';
  if (project.onboarding_status === 'completed') return null;
  if (project.theme_experience_state?.pending_transition_phase === 'bookend_intro') return 'bookend_intro';
  return project.onboarding_ritual_step === 'theme_intro' ? 'theme_intro' : 'hajimari_complete';
}

export function paidConversationIndex(project, questions = []) {
  if (!paidOnboardingApplies(project, questions)) return -1;
  return questions.findIndex(q => q.onboarding_group === 'starting_conversation' && q.status !== 'answered');
}

const gatedScenes = new Set([
  'home', 'trial_complete', 'onboarding_overview', 'onboarding_pace',
  'starting_conversation_complete', 'theme_guide', 'onboarding_preferences',
  'notification_setup', 'sharing_setup', 'supporter_invite_initial', 'hajimari_complete',
  'theme_intro', 'theme_resume', 'theme_complete', 'theme_more', 'bookend_intro', 'bookend_outro',
  'photo_story_start', 'question_library', 'book_builder', 'milestone_edit',
  'life_outline_summary', 'life_outline_recording', 'life_outline_complete',
  'closing_complete', 'daily_mic_check', 'end_today', 'journey_wait', 'journey_finished',
]);
export function resolvePaidOnboardingScene(requested, project, questions, context = {}) {
  const checkpoint = paidOnboardingCheckpoint(project, questions, context);
  if (checkpoint === null || requested === checkpoint) return requested;
  // A completed project's home remains a safe place to pause, even when a
  // legacy starting-conversation question is still awaiting an answer.
  if (requested === 'home' && project?.onboarding_status === 'completed') return requested;
  if (checkpoint === 'onboarding_overview' && requested === 'onboarding_pace') return requested;
  // These are recording/review steps for the enforced starting-conversation question.
  if (checkpoint === 0 && (typeof requested === 'number' && requested >= 0
    || ['daily_mic_check', 'end_today'].includes(requested))) return requested;
  return (typeof requested === 'number' && requested >= 0 || gatedScenes.has(requested))
    ? checkpoint : requested;
}
