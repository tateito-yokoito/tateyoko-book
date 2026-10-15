export const FREE_STORY_FALLBACK_TITLE = '幼い頃の思い出';
export const normalizeFreeStoryTitle = title => Array.from(String(title || '').replace(/\s+/g, ' ').trim()).slice(0, 40).join('');

// Conservative local suggestion: extract the first sentence, never invent details.
// A future server summarizer can be injected into the review component.
export function suggestFreeStoryTitle(transcript) {
  const text = String(transcript || '').replace(/\s+/g, ' ').replace(/^(えー|えっと|あの)[、,\s]*/, '').trim();
  const first = text.split(/[。！？!?]/)[0];
  if (Array.from(first).length < 6) return FREE_STORY_FALLBACK_TITLE;
  const chars = Array.from(first);
  return chars.length > 24 ? chars.slice(0, 23).join('') + '…' : first;
}
