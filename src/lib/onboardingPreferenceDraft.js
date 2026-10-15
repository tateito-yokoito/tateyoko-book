const keyFor = projectId => `tateyoko:onboarding-preferences:${projectId}`;
const sharingKeyFor = projectId => `tateyoko:onboarding-sharing:${projectId}`;
const notificationKeyFor = projectId => `tateyoko:onboarding-notification:${projectId}`;
export const draftTimestamp = value => value ? (Date.parse(value) || 0) : 0;

export function normalizeOnboardingPreferenceDraft(value = {}) {
  return {
    expectations: Array.isArray(value.expectations) ? value.expectations : [],
    preferred_themes: Array.isArray(value.preferred_themes) ? value.preferred_themes : [],
    people: Array.isArray(value.people) ? value.people : [],
    draft_step: Math.min(3, Math.max(1, Number(value.draft_step) || 1)),
    draft_updated_at: value.draft_updated_at || null,
  };
}

export function readOnboardingPreferenceDraft(projectId, serverValue, completedAt, storage) {
  const serverDraft = normalizeOnboardingPreferenceDraft(serverValue);
  if (!projectId || completedAt) return serverDraft;
  try {
    const local = JSON.parse((storage || globalThis.localStorage).getItem(keyFor(projectId)) || 'null');
    if (local && draftTimestamp(local.draft_updated_at) > draftTimestamp(serverDraft.draft_updated_at)) {
      return normalizeOnboardingPreferenceDraft(local);
    }
  } catch {
    // Server draft remains authoritative when browser storage is unavailable.
  }
  return serverDraft;
}

export function writeOnboardingPreferenceDraft(projectId, draft, storage) {
  if (!projectId) return;
  try { (storage || globalThis.localStorage).setItem(keyFor(projectId), JSON.stringify(draft)); } catch {
    // The server save still works in private browsing with storage disabled.
  }
}

export function clearOnboardingPreferenceDraft(projectId, storage) {
  if (!projectId) return;
  try { (storage || globalThis.localStorage).removeItem(keyFor(projectId)); } catch { /* Nothing to clear. */ }
}

export function readOnboardingSharingDraft(projectId, fallback, storage) {
  if (!projectId) return fallback;
  try {
    const stored = (storage || globalThis.localStorage).getItem(sharingKeyFor(projectId));
    return ['family', 'selected', 'private'].includes(stored) ? stored : fallback;
  } catch { return fallback; }
}

export function writeOnboardingSharingDraft(projectId, scope, storage) {
  if (!projectId) return;
  try { (storage || globalThis.localStorage).setItem(sharingKeyFor(projectId), scope); } catch { /* Server save remains available. */ }
}

export function clearOnboardingSharingDraft(projectId, storage) {
  if (!projectId) return;
  try { (storage || globalThis.localStorage).removeItem(sharingKeyFor(projectId)); } catch { /* Nothing to clear. */ }
}

export function readOnboardingNotificationDraft(projectId, storage) {
  if (!projectId) return null;
  try {
    const schedules = JSON.parse((storage || globalThis.localStorage).getItem(notificationKeyFor(projectId)) || 'null');
    return Array.isArray(schedules) && schedules.length ? schedules : null;
  } catch { return null; }
}

export function writeOnboardingNotificationDraft(projectId, schedules, storage) {
  if (!projectId) return;
  try { (storage || globalThis.localStorage).setItem(notificationKeyFor(projectId), JSON.stringify(schedules)); } catch { /* Retry remains on screen. */ }
}

export function clearOnboardingNotificationDraft(projectId, storage) {
  if (!projectId) return;
  try { (storage || globalThis.localStorage).removeItem(notificationKeyFor(projectId)); } catch { /* Nothing to clear. */ }
}
