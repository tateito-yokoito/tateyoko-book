let published = {};
let lastLoadedAt = 0;
let pendingLoad = null;

export async function loadPublishedQuestionCopy(client, maxAgeMs = 60000) {
  if (!client || typeof client.rpc !== 'function') return published;
  if (Date.now() - lastLoadedAt < maxAgeMs) return published;
  if (pendingLoad) return pendingLoad;
  pendingLoad = client.rpc('published_question_copy').then(({ data, error }) => {
    if (error) throw error;
    published = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    lastLoadedAt = Date.now();
    return published;
  }).finally(() => { pendingLoad = null; });
  return pendingLoad;
}

export function publishedCopyFor(key) { return published[key] || null; }

export function copyKeyForQuestion(question) {
  const kind = question?.bookend_kind || question?.meta_json?.bookend_kind;
  if (kind === 'intro' || kind === 'outro') return `bookend:${kind}`;
  const extra = question?.theme_extra_id || question?.meta_json?.theme_extra_id;
  if (extra) return `extra:${extra}`;
  const base = question?.question_id || question?.id;
  return base ? `base:${base}` : null;
}

export function withPublishedQuestionCopy(question) {
  if (!question || ['answered', 'skipped'].includes(question.status)) return question;
  const copy = publishedCopyFor(copyKeyForQuestion(question));
  if (!copy) return question;
  return {
    ...question,
    content: copy.text || question.content,
    text: copy.text || question.text,
    question_text: copy.text || question.question_text,
    prompt_hint: copy.hint ?? question.prompt_hint,
  };
}

export function resetPublishedQuestionCopyForTests() {
  published = {}; lastLoadedAt = 0; pendingLoad = null;
}
