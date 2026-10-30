const PREFIX = 'story-request-composer:v1';

export function storyRequestProgressKey(projectId, themeCode) {
  return projectId && themeCode ? `${PREFIX}:${projectId}:${themeCode}` : null;
}

export function readStoryRequestProgress(key, storage = globalThis.localStorage) {
  if (!key) return null;
  try {
    const value = JSON.parse(storage.getItem(key) || 'null');
    if (!value || value.version !== 1) return null;
    return {
      status: ['editing', 'creating', 'created'].includes(value.status) ? value.status : 'editing',
      step: value.step === 'recipient' ? 'recipient' : 'questions',
      selected: Array.isArray(value.selected) ? value.selected.filter(item => typeof item === 'string').slice(0, 3) : [],
      custom: typeof value.custom === 'string' ? value.custom.slice(0, 500) : '',
      recipientName: typeof value.recipientName === 'string' ? value.recipientName.slice(0, 80) : '',
      relationship: typeof value.relationship === 'string' ? value.relationship.slice(0, 80) : '',
      requestId: typeof value.requestId === 'string' ? value.requestId : null,
      createStartedAt: typeof value.createStartedAt === 'string' ? value.createStartedAt : null
    };
  } catch { return null; }
}

export function writeStoryRequestProgress(key, progress, storage = globalThis.localStorage) {
  if (!key) return;
  try { storage.setItem(key, JSON.stringify({ version: 1, ...progress })); } catch {}
}

export function clearStoryRequestProgress(key, storage = globalThis.localStorage) {
  if (!key) return;
  try { storage.removeItem(key); } catch {}
}

export function requestMatchesCreatingDraft(request, draft) {
  if (!request || !draft?.createStartedAt) return false;
  const started = Date.parse(draft.createStartedAt);
  const created = Date.parse(request.created_at);
  if (!Number.isFinite(started) || !Number.isFinite(created) || created < started - 10000) return false;
  if (request.recipient_name !== draft.recipientName.trim() || request.relationship_label !== draft.relationship.trim()) return false;
  const expected = [...draft.selected, ...(draft.custom.trim() ? [`custom:${draft.custom.trim()}`] : [])];
  const actual = (request.selected_questions || []).map(question => question.sourceQuestionId
    ? `source:${question.sourceQuestionId}`
    : question.sourceQuestionKey?.startsWith('extra:')
      ? question.sourceQuestionKey
      : `custom:${question.prompt}`);
  return JSON.stringify(expected) === JSON.stringify(actual);
}
