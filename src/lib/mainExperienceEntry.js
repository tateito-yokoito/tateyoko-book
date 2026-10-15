export function requiresMainExperienceStart(question) {
  return Boolean(question) && question.onboarding_group !== "trial_experience" &&
    (question.sequence_order == null || Number(question.sequence_order) > 4);
}

export function needsMainExperienceIntroduction(project, question, requestedScene, access) {
  return project?.onboarding_status === "completed" &&
    requiresMainExperienceStart(question) &&
    ["theme_resume", "daily_mic_check", 1].includes(requestedScene) &&
    access?.policy_version === "2.0" && access.paid === true &&
    !access.main_started_at;
}
