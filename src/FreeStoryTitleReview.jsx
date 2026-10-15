import React, { useEffect, useRef, useState } from 'react';
import { FREE_STORY_FALLBACK_TITLE, normalizeFreeStoryTitle, suggestFreeStoryTitle } from './lib/freeStoryTitle.js';
import './theme-more.css';

export default function FreeStoryTitleReview({ transcript, initialTitle = '', suggestTitle = suggestFreeStoryTitle, onSave, onBack }) {
  const [title, setTitle] = useState(initialTitle || FREE_STORY_FALLBACK_TITLE);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const edited = useRef(Boolean(initialTitle)), saving = useRef(false);
  useEffect(() => {
    let active = true;
    if (!edited.current) Promise.resolve().then(() => suggestTitle(transcript)).then(value => {
      if (active && !edited.current) setTitle(normalizeFreeStoryTitle(value) || FREE_STORY_FALLBACK_TITLE);
    }).catch(() => {}); // The fallback remains editable; suggestion failure never blocks saving.
    return () => { active = false; };
  }, [transcript, suggestTitle]);
  const save = async () => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try { await onSave(normalizeFreeStoryTitle(title) || FREE_STORY_FALLBACK_TITLE); }
    catch (_) { setError('保存できませんでした。もう一度お試しください。'); }
    finally { saving.current = false; setBusy(false); }
  };
  return <main className="theme-more tm-title-review">
    <p className="tm-eyebrow">幼い頃 · 自由に語る</p>
    <h1>タイトルを決める</h1>
    <label htmlFor="free-story-title">タイトル案</label>
    <input id="free-story-title" value={title} maxLength={80} disabled={busy} onChange={event => { edited.current = true; setTitle(event.target.value); }}/>
    <p className="tm-count">書き換えられます。あとからの変更もできます。</p>
    <details><summary>語った内容を見る</summary><p>{transcript}</p></details>
    {error && <p className="tm-error" role="alert">{error}</p>}
    <button className="tm-primary" disabled={busy} onClick={save}>{busy ? '保存しています…' : 'このタイトルで保存'}</button>
    <button className="tm-secondary tm-next" disabled={busy} onClick={onBack}>戻る</button>
  </main>;
}
