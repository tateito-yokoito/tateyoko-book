// A ritual in progress takes precedence over the ordinary question/home entry,
// even for projects whose legacy onboarding_status is already "completed".
// Only explicit in-progress steps are used so established users are not sent
// through a new first-time setup merely because an old timestamp is absent.
const ritualScenes = Object.freeze({
  conversation_complete: 'starting_conversation_complete',
  theme_guide: 'theme_guide',
  preferences: 'onboarding_preferences',
  notification: 'notification_setup',
  sharing: 'sharing_setup',
  support: 'supporter_invite_initial',
});

export function getActiveOnboardingRitualScene(project) {
  return ritualScenes[project?.onboarding_ritual_step] || null;
}

const questionEntryScenes = new Set(['home', 'theme_resume', 'daily_mic_check', 'end_today']);

export function resolveOnboardingRitualEntryScene(requested, project) {
  const checkpoint = getActiveOnboardingRitualScene(project);
  if (!checkpoint) return requested;
  return (typeof requested === 'number' && requested >= 0) || questionEntryScenes.has(requested)
    ? checkpoint
    : requested;
}

export const onboardingSetupScenes = new Set([
  'starting_conversation_complete',
  'theme_guide',
  'onboarding_preferences',
  'notification_setup',
  'sharing_setup',
  'supporter_invite_initial',
]);
