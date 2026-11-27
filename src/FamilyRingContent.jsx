import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Ellipsis, LockKeyhole, Volume2 } from 'lucide-react';
import { AnswerBodyEditor, AnswerEntryChoices, AnswerPhotoStrip } from './AnswerInputUI.jsx';
import { Scene_Recording } from './App.jsx';
import './family-ring-preview.css';

// The same reading surface is used by the family app and its isolated review.
export default function FamilyRingContent({ stories, canEdit = false, onSave, onLock,
  onLoadMedia, onAddPhoto, onAddVoice, onAddStory, onDetailChange, questions = [], loading = false }) {
  const [openTheme, setOpenTheme] = useState('');
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [media, setMedia] = useState([]);
  const [mediaError, setMediaError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [showQuestions, setShowQuestions] = useState(false);
  const [recording, setRecording] = useState(false);
  const photoInput = useRef(null);
  const themes = [...new Set(stories.map(story => story.theme || 'その他の語り'))];
  const orderedStories = themes.flatMap(theme => stories.filter(story => (story.theme || 'その他の語り') === theme));
  const selectedIndex = selected ? orderedStories.findIndex(story => story.source === selected.source && story.id === selected.id) : -1;
  const listScroll = useRef(0);
  const restoreListScroll = useRef(false);
  const mediaRequest = useRef(0);
  useLayoutEffect(() => {
    if (!restoreListScroll.current || selected) return;
    restoreListScroll.current = false;
    requestAnimationFrame(() => window.scrollTo({ top: listScroll.current, behavior: 'instant' }));
  }, [selected]);
  const revoke = items => items.forEach(item => { if (item.url?.startsWith('blob:')) URL.revokeObjectURL(item.url); });
  useEffect(() => () => revoke(media), [media]);
  useEffect(() => {
    if (!selected) return;
    const latest = stories.find(story => story.source === selected.source && story.id === selected.id);
    if (latest && !editing) setSelected(latest);
  }, [stories]);
  const openStory = async (story, keepListScroll = false) => {
    const request = ++mediaRequest.current;
    if (!keepListScroll) listScroll.current = window.scrollY;
    setSelected(story); setEditing(false); setRecording(false); setMenuOpen(false); setMessage('');
    onDetailChange?.(true);
    setMediaError(''); setMedia([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (!onLoadMedia) return;
    try {
      const nextMedia = await onLoadMedia(story);
      if (request === mediaRequest.current) setMedia(nextMedia);
      else revoke(nextMedia);
    } catch { if (request === mediaRequest.current) setMediaError('写真・音声を読み込めませんでした。'); }
  };
  const goBack = () => {
    mediaRequest.current += 1;
    setSelected(null); setEditing(false); setRecording(false); setMenuOpen(false); setMedia([]);
    onDetailChange?.(false);
    restoreListScroll.current = true;
  };
  const save = async () => {
    if (!draft.trim() || !onSave || busy) return;
    setBusy(true); setMessage('');
    try {
      const updated = await onSave(selected, draft.trim());
      setSelected(updated || { ...selected, body: draft.trim() });
      setEditing(false); setMessage('語りを更新しました。');
    } catch (cause) { setMessage(cause.message || '保存できませんでした。'); }
    finally { setBusy(false); }
  };
  const toggleLock = async () => {
    if (!onLock || busy) return;
    setBusy(true); setMenuOpen(false); setMessage('');
    try {
      const updated = await onLock(selected, selected.visibility !== 'private');
      setSelected(updated || { ...selected, visibility: selected.visibility === 'private' ? 'family' : 'private' });
      setMessage('公開範囲を更新しました。');
    } catch (cause) { setMessage(cause.message || '公開範囲を変更できませんでした。'); }
    finally { setBusy(false); }
  };
  const addPhoto = async event => {
    const file = event.target.files?.[0];
    if (!file || !onAddPhoto || busy) return;
    setBusy(true); setMessage('');
    try {
      await onAddPhoto(selected,file);
      setMedia(await onLoadMedia(selected));
      setMessage('写真を追加しました。');
    } catch (cause) { setMessage(cause.message || '写真を追加できませんでした。'); }
    finally { setBusy(false); event.target.value = ''; }
  };
  const addVoice = async (_transcript, seconds, _url, blob) => {
    if (!blob?.size || !onAddVoice || busy) return false;
    setBusy(true); setMessage('');
    try {
      await onAddVoice(selected, blob, Math.round(seconds));
      setMedia(await onLoadMedia(selected));
      setRecording(false); setMessage('声を追加しました。');
      return true;
    } catch (cause) {
      setMessage(cause.message || '声を追加できませんでした。');
      setRecording(false);
      return false;
    } finally { setBusy(false); }
  };
  if (recording && selected) return <div className="fp-ring-recorder"><Scene_Recording
    question={{ content:selected.question, question_role:'story_question' }} lightMode
    progress={{currentIndex:0,total:1}} userName="" autoStart={false}
    onBack={() => setRecording(false)} onComplete={addVoice}/></div>;
  return <div className="fp-ring-review">
    {!selected ? <>
      <div className="fp-ring-review-heading"><h2>これまでの語り</h2><p>テーマを開いて、語りを読み返す。</p></div>
      {loading && <p className="fp-ring-message" role="status">語りを読み込んでいます。</p>}
      {!loading && !stories.length && <div className="fp-person-story-empty">まだ語りはありません。<br/>声・文章・写真から、好きな方法で始められます。</div>}
      <div className="fp-ring-themes">{themes.map((theme, index) => {
        const rows = stories.filter(story => (story.theme || 'その他の語り') === theme);
        const opened = openTheme ? openTheme === theme : index === 0;
        return <section className="fp-ring-theme" key={theme}>
          <button type="button" className="fp-ring-theme-toggle" aria-expanded={opened} onClick={() => setOpenTheme(opened ? '-' : theme)}>
            <strong>{theme}<small>（{rows.length}）</small></strong><ChevronDown aria-hidden="true"/>
          </button>
          {opened && <div className="fp-ring-theme-rows">{rows.map(story => <button className="fp-ring-story-row" key={`${story.source}-${story.id}`} type="button" onClick={() => openStory(story)}>
            <span><strong>{story.visibility === 'private' && <LockKeyhole size={14} aria-label="自分だけ"/>}{story.question}</strong><small>{story.hasAudio && <Volume2 size={14} aria-label="音声あり"/>}{story.body || '写真・音声で残した語り'}</small></span><ChevronRight aria-hidden="true"/>
          </button>)}</div>}
        </section>;
      })}</div>
      {onAddStory && questions.length > 0 && <><button type="button" className="fp-ring-continue" onClick={() => setShowQuestions(value => !value)}>{stories.length ? '新しい語りを追加する' : '最初の語りを残す'} <ChevronDown size={18}/></button>
        {showQuestions && <div className="fp-person-questions">{questions.map(question => <button type="button" key={question.id} onClick={() => onAddStory(question)}>{question.slot}問目：{question.text}<ChevronRight size={16}/></button>)}</div>}</>}
    </> : <>
      <div className="fp-ring-detail-top"><button type="button" onClick={goBack}><ChevronLeft size={20}/>年輪へ</button><span>{selected.theme}</span>
        {canEdit && (onSave || onLock) && <div className="fp-ring-detail-menu"><button type="button" aria-label="語りの操作" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><Ellipsis/></button>
          {menuOpen && <div role="menu">{onSave && <button type="button" role="menuitem" onClick={() => { setDraft(selected.body || ''); setEditing(true); setMenuOpen(false); }}>語りを編集</button>}
            {onLock && <button type="button" role="menuitem" onClick={toggleLock}>{selected.visibility === 'private' ? 'ロックを外す' : '自分だけにロックする'}</button>}</div>}
        </div>}
      </div>
      <nav className="fp-ring-story-navigation" aria-label="前後の語り">
        <button type="button" disabled={selectedIndex <= 0} onClick={() => openStory(orderedStories[selectedIndex - 1], true)}>〈 前の語り</button>
        <span>{selectedIndex + 1} / {orderedStories.length}</span>
        <button type="button" disabled={selectedIndex < 0 || selectedIndex >= orderedStories.length - 1} onClick={() => openStory(orderedStories[selectedIndex + 1], true)}>次の語り 〉</button>
      </nav>
      {editing ? <div className="fp-ring-editor answer-light"><p className="fp-ring-editor-eyebrow">語りを編集</p><h2>{selected.question}</h2>
        <p className="fp-ring-editor-note">思い出したことを、声や文章で書き足せます。</p>
        <AnswerEntryChoices onVoice={onAddVoice ? () => setRecording(true) : null}
          onWrite={() => document.querySelector('.fp-ring-editor .answer-body-editor')?.focus()}
          onPhoto={onAddPhoto ? () => photoInput.current?.click() : null}/>
        <label className="fp-ring-editor-label" htmlFor="fp-ring-draft">語りの本文</label>
        <AnswerBodyEditor id="fp-ring-draft" value={draft} onChange={setDraft} label="語りの本文" placeholder="ここに思い出を書く"/>
        {onAddPhoto && <input ref={photoInput} className="fp-ring-editor-file" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={addPhoto} aria-label="写真を追加する"/>}
        <AnswerPhotoStrip photos={media.filter(item => item.kind === 'photo')}
          onOpen={item => window.open(item.url, '_blank', 'noopener,noreferrer')}/>
        {media.filter(item => item.kind === 'audio').map(item => <audio key={item.id} controls preload="none" src={item.url} aria-label="語りの音声"/>)}
        {message && <p className="fp-ring-message" role="status">{message}</p>}
        {selected.completed && <p className="fp-ring-editor-caution">変更は年輪に保存されます。完成したBOOKの内容は変わりません。</p>}
        <button type="button" className="fp-ring-save" disabled={!draft.trim() || busy} onClick={save}>{busy ? '保存しています…' : '変更を保存する'}</button>
        <button type="button" className="fp-ring-cancel" onClick={() => setEditing(false)}>キャンセル</button>
      </div> : <article className="fp-ring-detail">
        <p className="fp-ring-detail-kicker">{selected.visibility === 'private' ? <><LockKeyhole size={16}/> 自分だけの語り</> : '家族と共有する語り'}</p>
        <h2>{selected.question}</h2>{selected.body
          ? <p className="fp-ring-detail-body">{selected.body}</p>
          : <p className="fp-ring-detail-body">写真・音声で残した語りです。</p>}
        {media.filter(item => item.kind === 'photo').map(item => <img key={item.id} className="fp-ring-detail-photo" src={item.url} alt="語りに添えられた写真"/>)}
        {media.filter(item => item.kind === 'audio').map(item => <audio key={item.id} controls preload="none" src={item.url} aria-label="語りの音声"/>)}
        {media.filter(item => item.kind === 'video').map(item => <video key={item.id} controls playsInline preload="metadata" src={item.url} aria-label="語りの動画"/>)}
        {mediaError && <p className="fp-ring-message" role="alert">{mediaError}</p>}
        {message && <p className="fp-ring-message" role="status">{message}</p>}
      </article>}
    </>}
  </div>;
}
