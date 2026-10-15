export const BOOKEND_PROMPTS = Object.freeze({
  intro: { label: "はじめに", text: "語り始める今、どんな気持ちですか？" },
  outro: { label: "あとがき", text: "ここまで語ってみて、今どんな気持ちですか？" }
});

export function bookendPrompt(kind) {
  const base = BOOKEND_PROMPTS[kind];
  const copy = publishedCopyFor(`bookend:${kind}`);
  return base ? { ...base, text: copy?.text || base.text, hint: copy?.hint ?? '短くても大丈夫です。' } : null;
}

export const bookendKindForQuestion = question =>
  question?.question_role === "bookend_voice" ? question.bookend_kind : null;

export const bookendKindForVideo = story =>
  story?.metadata?.bookend_kind === "intro" || story?.metadata?.bookend_kind === "outro"
    ? story.metadata.bookend_kind
    : story?.metadata?.milestone_key === "opening" ? "intro"
    : story?.metadata?.milestone_key === "closing" ? "outro" : null;
import { publishedCopyFor } from './questionCopy.js';
