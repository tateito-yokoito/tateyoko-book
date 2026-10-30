import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ImagePlus, Mic, Pencil, Square, X } from 'lucide-react';
import { invokeStoryRequest } from './StoryRequestComposer.jsx';
import { STORY_THEMES } from './lib/storyThemes.js';
import { audioDraftKey, saveAudioDraft, loadAudioDraft, removeAudioDraft } from './lib/storyRequestAudioDraft.js';

const siteUrl = 'https://www.tateito-yokoito.jp/';
const primary = 'min-h-14 w-full rounded-xl bg-[#f5f3ed] px-4 py-3 text-[1rem] font-medium text-[#18243a] disabled:opacity-40';
const secondary = 'min-h-13 w-full rounded-xl border border-white/30 px-4 py-3 text-[1rem] text-white/85';
const localKey = id => `tateyoko:story-request:${id}:v1`;
const niceName = value => { const text = String(value || '').trim(); return text.endsWith('さん') ? text : `${text}さん`; };
const requestBody = (requestId, requestToken, extra) => ({ requestId, requestToken, ...extra });

function ReadableQuestion({ theme, prompt }) {
  return <div className="mb-6 text-center"><p className="text-sm text-[#d6bb86]">{theme}</p><h2 className="mt-4 text-narrative text-[1.45rem] leading-[1.7] text-white">{prompt}</h2></div>;
}

function AudioCapture({ onRecorded, disabled }) {
  const recorder = useRef(null), stream = useRef(null), chunks = useRef([]);
  const [recording, setRecording] = useState(false), [error, setError] = useState('');
  useEffect(() => () => { if (recorder.current?.state === 'recording') recorder.current.stop(); stream.current?.getTracks().forEach(track => track.stop()); }, []);
  const start = async () => {
    setError('');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(type => MediaRecorder.isTypeSupported(type));
      recorder.current = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      recorder.current.ondataavailable = event => { if (event.data?.size) chunks.current.push(event.data); };
      recorder.current.onstop = () => {
        const type = recorder.current?.mimeType || chunks.current[0]?.type || 'audio/webm';
        const blob = new Blob(chunks.current, { type });
        stream.current?.getTracks().forEach(track => track.stop());
        if (blob.size) onRecorded(blob);
      };
      recorder.current.start(500);
      setRecording(true);
    } catch { setError('マイクを使えませんでした。端末の設定をご確認ください。'); }
  };
  const stop = () => { if (recorder.current?.state === 'recording') recorder.current.stop(); setRecording(false); };
  return <div><button type="button" disabled={disabled} className={`${primary} flex items-center justify-center gap-2`} onClick={recording ? stop : start}>
    {recording ? <><Square size={18}/>録音を終える</> : <><Mic size={20}/>録音を始める</>}
  </button>{recording && <p className="mt-3 text-center text-sm text-[#f5a665]">● 録音中</p>}{error && <p role="alert" className="mt-3 text-sm text-rose-200">{error}</p>}</div>;
}

export default function StoryRequestRecipient({ client, requestId, requestToken }) {
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [request, setRequest] = useState(null), [drafts, setDrafts] = useState({});
  const [screen, setScreen] = useState('intro'), [index, setIndex] = useState(0), [mode, setMode] = useState('choose');
  const [busy, setBusy] = useState(false), [styles, setStyles] = useState({});
  const [consent, setConsent] = useState(false), [responderName, setResponderName] = useState('');
  const [conflicts, setConflicts] = useState({});
  const [candidate, setCandidate] = useState(null);
  const [pendingAudio, setPendingAudio] = useState(false);
  const local = useRef({ answers: {}, revisions: {}, pendingDiscards: {} });
  const syncTimer = useRef(null);
  const syncQueue = useRef({});
  const invoke = extra => invokeStoryRequest(client, requestBody(requestId, requestToken, extra));
  const question = request?.questions?.[index];
  const answer = question ? local.current.answers[question.id] || { text: '', audioRecords: [] } : null;
  const answered = useMemo(() => (request?.questions || []).every(q => Boolean(local.current.answers[q.id]?.text?.trim())), [request, drafts]);
  const update = () => setDrafts({ ...local.current.answers });
  const persist = () => { try { localStorage.setItem(localKey(requestId), JSON.stringify(local.current)); update(); return true; } catch { setError('端末に保存できません。空き容量をご確認ください。'); return false; } };

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const data = await invoke({ action: 'preview' });
        if (!live) return;
        setRequest(data.request);
        setResponderName(data.request.recipientName || '');
        let stored = null;
        try { stored = JSON.parse(localStorage.getItem(localKey(requestId)) || 'null'); } catch {}
        local.current = stored && typeof stored === 'object' ? {
          answers: stored.answers || {}, revisions: stored.revisions || {}, pendingDiscards: stored.pendingDiscards || {}
        } : { answers: {}, revisions: {}, pendingDiscards: {} };
        const nextConflicts = {};
        for (const remote of data.drafts || []) {
          const key = remote.question_key;
          const own = local.current.answers[key];
          local.current.revisions[key] = remote.revision;
          if (local.current.pendingDiscards[key]) continue;
          if (remote.discarded_at) { if (!own?.dirty) delete local.current.answers[key]; continue; }
          if (own?.dirty && own.text !== remote.draft_text) nextConflicts[key] = remote;
          else if (!own?.dirty) local.current.answers[key] = { ...own, text: remote.draft_text,
            audioRecords: remote.audio_records || own?.audioRecords || [],
            photoPaths: remote.photo_paths || own?.photoPaths || [], dirty: false };
        }
        setConflicts(nextConflicts);
        persist();
        if (data.request.submitted) setScreen('done');
      } catch (cause) { if (live) setError(cause.message); }
      finally { if (live) setLoading(false); }
    })();
    return () => { live = false; window.clearTimeout(syncTimer.current); };
  }, [requestId, requestToken]);

  useEffect(() => {
    if (!request) return;
    const retry = () => Object.keys(local.current.pendingDiscards || {}).forEach(key => { void discardServer(key); });
    window.addEventListener('online', retry); retry();
    return () => window.removeEventListener('online', retry);
  }, [request]);

  useEffect(() => {
    if (!question || screen !== 'question') return;
    let active = true;
    loadAudioDraft(audioDraftKey(requestId, question.id))
      .then(blob => { if (active) setPendingAudio(Boolean(blob)); })
      .catch(() => { if (active) setError('端末の録音保存領域を確認できません。'); });
    return () => { active = false; };
  }, [requestId, question?.id, screen]);

  const setAnswer = (key, patch) => {
    const previous = local.current.answers[key];
    local.current.answers[key] = { ...(previous || { text: '', audioRecords: [] }), ...patch };
    if (!persist()) { if (previous) local.current.answers[key] = previous; else delete local.current.answers[key]; return false; }
    return true;
  };
  const syncText = key => {
    const previous = syncQueue.current[key] || Promise.resolve();
    const next = previous.catch(() => {}).then(() => syncCurrent(key));
    syncQueue.current[key] = next;
    return next;
  };
  const syncCurrent = async key => {
    const snapshot = local.current.answers[key]?.text || '';
    const audioSnapshot = local.current.answers[key]?.audioRecords || [];
    const photoSnapshot = local.current.answers[key]?.photoPaths || [];
    if (conflicts[key] || local.current.pendingDiscards[key]) return;
    try {
      const data = await invoke({ action: 'save_draft', questionKey: key, text: snapshot,
        audioRecords: audioSnapshot, photoPaths: photoSnapshot,
        expectedRevision: local.current.revisions[key] || 0 });
      local.current.revisions[key] = data.revision;
      if (local.current.answers[key]?.text === snapshot
        && JSON.stringify(local.current.answers[key]?.audioRecords || []) === JSON.stringify(audioSnapshot)
        && JSON.stringify(local.current.answers[key]?.photoPaths || []) === JSON.stringify(photoSnapshot)) local.current.answers[key].dirty = false;
      persist();
      if (local.current.answers[key]?.dirty) await syncCurrent(key);
    } catch (cause) {
      if (cause.conflict) {
        setConflicts(current => ({ ...current, [key]: cause.serverDraft || { draft_text: '' } }));
      }
      throw cause;
    }
  };
  const editText = text => {
    if (!setAnswer(question.id, { text, dirty: true })) return;
    window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => { void syncText(question.id).catch(() => {}); }, 900);
  };
  const resolveConflict = choice => {
    const remote = conflicts[question.id];
    if (!remote) return;
    if (choice === 'remote') setAnswer(question.id, { text: remote.draft_text || '', audioRecords: remote.audio_records || [],
      photoPaths: remote.photo_paths || [], dirty: false });
    else setAnswer(question.id, { dirty: true });
    local.current.revisions[question.id] = remote.revision || 0;
    setConflicts(current => { const next = { ...current }; delete next[question.id]; return next; });
    if (choice === 'local') window.setTimeout(() => { void syncText(question.id).catch(() => {}); }, 0);
  };
  const discardServer = async key => {
    try {
      const data = await invoke({ action: 'discard_draft', questionKey: key,
        expectedRevision: local.current.revisions[key] || 0 });
      local.current.revisions[key] = data.revision;
      delete local.current.pendingDiscards[key];
      persist();
    } catch (cause) {
      if (cause.conflict) {
        const remote = cause.serverDraft;
        if (remote?.discarded_at) { delete local.current.pendingDiscards[key]; local.current.revisions[key] = remote.revision; persist(); }
        else if (remote?.revision != null) { local.current.revisions[key] = remote.revision; void discardServer(key); }
      }
    }
  };
  const discard = () => {
    if (!window.confirm('編集中の文章を破棄して終了しますか？ 破棄すると、編集前の文章に戻ります。')) return;
    local.current.pendingDiscards[question.id] = true;
    delete local.current.answers[question.id];
    if (!persist()) return;
    void removeAudioDraft(audioDraftKey(requestId, question.id));
    void discardServer(question.id);
    setMode('choose');
  };
  const uploadAndTranscribe = async blob => {
    setBusy(true); setError('');
    try {
      const draftKey = audioDraftKey(requestId, question.id);
      if (blob) { await saveAudioDraft(draftKey, blob); setPendingAudio(true); }
      const retainedBlob = blob || await loadAudioDraft(draftKey);
      if (!retainedBlob) throw new Error('端末内の録音が見つかりません。');
      const signed = await invoke({ action: 'sign_upload', kind: 'audio', mimeType: retainedBlob.type });
      const { error: uploadError } = await client.storage.from('memory-contributions')
        .uploadToSignedUrl(signed.path, signed.token, retainedBlob, { contentType: retainedBlob.type.split(';')[0] });
      if (uploadError) throw uploadError;
      const earlier = local.current.answers[question.id]?.audioRecords || [];
      setAnswer(question.id, { audioRecords: [...earlier, { path: signed.path, transcript: '', purpose: 'answer' }], dirty: true });
      await syncText(question.id);
      await removeAudioDraft(draftKey);
      setPendingAudio(false);
      const result = await invoke({ action: 'transcribe', path: signed.path });
      const currentText = local.current.answers[question.id]?.text?.trim() || '';
      const newText = String(result.transcript || '').trim();
      setAnswer(question.id, { text: currentText ? `${currentText}\n\n${newText}` : newText,
        audioRecords: [...earlier, { path: signed.path, transcript: result.transcript, purpose: 'answer' }], dirty: true });
      setMode('review');
      await syncText(question.id);
    } catch (cause) { setError(`${cause.message} 録音は端末かサーバーに残っています。再試行できます。`); }
    finally { setBusy(false); }
  };
  const retryTranscript = async () => {
    const record = answer?.audioRecords?.at(-1);
    if (!record) return;
    setBusy(true); setError('');
    try {
      const result = await invoke({ action: 'transcribe', path: record.path });
      const currentText = local.current.answers[question.id]?.text?.trim() || '';
      const newText = String(result.transcript || '').trim();
      setAnswer(question.id, { text: currentText ? `${currentText}\n\n${newText}` : newText,
        audioRecords: [...answer.audioRecords.slice(0, -1), { ...record, transcript: result.transcript }], dirty: true });
      setMode('review'); void syncText(question.id);
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  const uploadPhoto = async file => {
    if (!file || !question) return;
    if ((answer?.photoPaths || []).length >= 3) { setError('写真は1問につき3枚までです。'); return; }
    if (file.size > 15_000_000 || !['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(file.type)) {
      setError('15MB以下の写真を選んでください。'); return;
    }
    setBusy(true); setError('');
    try {
      const signed = await invoke({ action: 'sign_upload', kind: 'photo', mimeType: file.type });
      const { error: uploadError } = await client.storage.from('memory-contributions')
        .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const paths = [...(local.current.answers[question.id]?.photoPaths || []), signed.path];
      if (!setAnswer(question.id, { photoPaths: paths, dirty: true })) throw new Error('端末に写真を記録できませんでした。');
      await syncText(question.id);
    } catch (cause) { setError(`${cause.message} 写真をもう一度選んでください。`); }
    finally { setBusy(false); }
  };
  const removePhoto = path => {
    if (!setAnswer(question.id, { photoPaths: (answer?.photoPaths || []).filter(item => item !== path), dirty: true })) return;
    void syncText(question.id).catch(() => {});
  };
  const chooseStyle = async style => {
    setStyles(current => ({ ...current, [question.id]: style }));
    if (style === 'clean') { setCandidate(null); return; }
    setBusy(true); setError('');
    try { const result = await invoke({ action: 'polish', questionKey: question.id,
      text: answer.text, style });
      setCandidate({ text: result.candidate, original: answer.text });
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  const advance = async () => {
    setBusy(true); setError('');
    try {
      if (!answer?.text?.trim()) throw new Error('文章を入力するか、録音してください。');
      await syncText(question.id);
      if (local.current.answers[question.id]?.dirty) throw new Error('サーバーに下書きを保存できませんでした。通信を確認して再試行してください。');
      if (conflicts[question.id]) throw new Error('別の端末の下書きを確認してください。');
      if (index + 1 < request.questions.length) { setIndex(index + 1); setMode('choose'); }
      else setScreen('confirm');
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    setBusy(true); setError('');
    try {
      if (!consent) throw new Error('掲載について確認してください。');
      const answers = request.questions.map(q => ({ questionKey: q.id,
        text: local.current.answers[q.id]?.text || '', audioRecords: local.current.answers[q.id]?.audioRecords || [],
        photoPaths: local.current.answers[q.id]?.photoPaths || [] }));
      await invoke({ action: 'submit', responderName, publicationConsent: true, answers });
      try { localStorage.removeItem(localKey(requestId)); } catch {}
      setScreen('done');
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };

  if (loading) return <main className="min-h-screen bg-[#0f172a] p-8 text-center text-white">読み込んでいます…</main>;
  if (!request) return <main className="min-h-screen bg-[#0f172a] p-8 text-center text-white">{error || 'この依頼を開けませんでした。'}</main>;
  const theme = STORY_THEMES.find(item => item.code === request.themeCode)?.label || '';
  return <div className="min-h-screen bg-[#0f172a] px-5 py-5 text-white"><main className="mx-auto flex w-full max-w-[520px] flex-col">
    {screen !== 'done' && <button type="button" className="mb-7 flex min-h-11 items-center gap-1 self-start text-[1rem] text-white/75" onClick={() => screen === 'question' ? setScreen('intro') : screen === 'confirm' ? setScreen('question') : history.back()}><ChevronLeft size={18}/>戻る</button>}
    {screen === 'intro' && <>
      <div className="pt-3"><p className="text-center text-sm text-[#d6bb86]">{niceName(request.recipientName)}へ</p>
        <h1 className="mx-auto mt-6 max-w-[22em] text-center text-narrative text-[clamp(1.35rem,5vw,1.75rem)] leading-[1.75] text-balance">あなたに、聞いてみたいことがあります。</h1></div>
      <p className="mt-12 text-[1.1rem] leading-[1.8]">声でも、文章でも。<br/>あなたの言葉で、気軽にお答えください。</p>
      <button type="button" className={`${primary} mt-7`} onClick={() => setScreen('question')}>質問を見る →</button>
      <p className="mt-6 text-[0.95rem] leading-[1.8] text-white/70">回答は{request.requesterName ? niceName(request.requesterName) : '依頼した方'}の「縦糸横糸ブック」に収録されることがあります。</p>
      <details className="mt-3 text-[0.95rem] leading-[1.8] text-white/75"><summary className="cursor-pointer underline underline-offset-4">掲載について詳しく見る ＋</summary><p className="mt-3">送信した文章や、声で答えた場合の音声・写真は、依頼した方が確認し、掲載を選んだ場合にBOOKやWebブックに収録されます。掲載の確認は送信直前に行います。</p></details>
      <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="mt-10 self-start text-[0.95rem] text-white/70 underline underline-offset-4">縦糸横糸について知る ↗</a>
    </>}
    {screen === 'question' && question && <>
      <div className="mb-6 flex items-center justify-end text-sm text-white/65">{index + 1} / {request.questions.length}</div>
      <ReadableQuestion theme={theme} prompt={question.prompt}/>
      {conflicts[question.id] ? <div className="space-y-4"><h3 className="text-lg">下書きが2つあります</h3>
        <div className="rounded-xl bg-[#f5f3ed] p-4 text-[#18243a]"><p>この端末</p><p className="whitespace-pre-wrap">{answer?.text}</p></div>
        <div className="rounded-xl bg-[#f5f3ed] p-4 text-[#18243a]"><p>別の端末</p><p className="whitespace-pre-wrap">{conflicts[question.id].draft_text}</p></div>
        <button type="button" className={primary} onClick={() => resolveConflict('local')}>この端末の文章で続ける</button>
        <button type="button" className={secondary} onClick={() => resolveConflict('remote')}>別の端末の文章で続ける</button>
      </div> : <>
        {mode === 'choose' && <div className="space-y-3"><button type="button" className={`${primary} flex items-center justify-center gap-2`} onClick={() => setMode('voice')}><Mic size={20}/>話して答える</button><button type="button" className={`${primary} flex items-center justify-center gap-2`} onClick={() => setMode('write')}><Pencil size={20}/>書いて答える</button>{answer?.text && <p className="mt-5 whitespace-pre-wrap rounded-xl bg-[#f5f3ed] p-5 text-[1.1rem] leading-[1.75] text-[#18243a]">{answer.text}</p>}</div>}
        {mode === 'voice' && <div className="space-y-5"><AudioCapture onRecorded={uploadAndTranscribe} disabled={busy}/>{busy && <p role="status" className="text-sm text-white/60">録音を保存し、文字にしています…</p>}{pendingAudio && <button type="button" disabled={busy} className={secondary} onClick={() => void uploadAndTranscribe(null)}>端末に残った録音を送る</button>}{answer?.audioRecords?.at(-1)?.path && !answer?.text && <button type="button" className={secondary} onClick={retryTranscript}>文字起こしを再試行</button>}</div>}
        {(mode === 'write' || mode === 'review') && <div className="flex min-h-[54dvh] flex-col"><div className="mb-3 flex gap-2 text-sm text-white/75">{mode === 'review' && [['clean','そのまま'],['narrative','語り調'],['essay','作品調']].map(([value,label]) => <button type="button" key={value} disabled={busy} className={`rounded-full border px-3 py-2 ${styles[question.id] === value ? 'border-[#d6bb86]' : 'border-white/25'}`} onClick={() => void chooseStyle(value)}>{label}</button>)}</div>
          {candidate ? <div className="rounded-xl bg-[#f5f3ed] p-5 text-[18px] leading-[1.75] text-[#18243a]"><p className="mb-3 text-sm">整えた候補</p><div className="whitespace-pre-wrap">{candidate.text}</div><details className="mt-5 border-t border-[#18243a]/20 pt-3 text-[16px]"><summary>元の文章を見る</summary><p className="mt-3 whitespace-pre-wrap">{candidate.original}</p></details></div> : <textarea aria-label="回答の文章" value={answer?.text || ''} onChange={event => editText(event.target.value)} placeholder="思い出をここに書く" className="min-h-[40dvh] w-full flex-1 resize-y rounded-xl border border-white/20 bg-[#f5f3ed] p-5 text-[18px] leading-[1.75] text-[#18243a] outline-none"/>}
          {candidate ? <div className="mt-3 flex gap-2"><button type="button" className={secondary} onClick={() => setCandidate(null)}>元の文章で続ける</button><button type="button" className={primary} onClick={() => { if (setAnswer(question.id, { text: candidate.text, dirty: true })) { setCandidate(null); void syncText(question.id).catch(() => {}); } }}>この文章を使う</button></div> : <div className="mt-3 flex gap-2"><button type="button" disabled={busy} className={secondary} onClick={() => void chooseStyle('narrative')}>✦ 整える</button><button type="button" disabled={busy || !answer?.text?.trim()} className={primary} onClick={advance}>保存する</button></div>}
          {mode === 'review' && <button type="button" className="mt-3 min-h-11 text-sm text-white/70" onClick={() => { setCandidate(null); setMode('voice'); }}>もう一度話す</button>}
          <button type="button" className="mt-3 min-h-11 text-sm text-white/60" onClick={discard}>保存せず終了</button>
        </div>}
        {answer?.text && <div className="mt-6 border-t border-white/15 pt-5">
          <label className={`${secondary} flex cursor-pointer items-center justify-center gap-2 ${busy ? 'opacity-50' : ''}`}><ImagePlus size={19}/>写真を添える
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="sr-only" disabled={busy || (answer.photoPaths || []).length >= 3}
              onChange={event => { void uploadPhoto(event.target.files?.[0]); event.target.value = ''; }}/>
          </label>
          {(answer.photoPaths || []).map((path, photoIndex) => <div key={path} className="mt-2 flex items-center justify-between rounded-lg border border-white/20 px-3 py-2 text-sm text-white/75">
            <span>写真 {photoIndex + 1} を保存しました</span><button type="button" aria-label={`写真 ${photoIndex + 1} を外す`} onClick={() => removePhoto(path)}><X size={18}/></button>
          </div>)}
        </div>}
        {mode === 'choose' && answer?.text && <button type="button" className={`${primary} mt-6`} onClick={advance}>次へ →</button>}
      </>}
      {error && <p role="alert" className="mt-4 text-sm text-rose-200">{error}</p>}
    </>}
    {screen === 'confirm' && <div className="space-y-6"><h1 className="text-narrative text-[1.5rem]">回答を送る前に</h1>
      <label className="block text-[1rem]">作品に載せるお名前<input value={responderName} onChange={event => setResponderName(event.target.value)} className="mt-2 min-h-14 w-full rounded-xl border border-white/30 bg-white/[0.06] px-4 text-[1.1rem]"/></label>
      <p className="text-[1rem] leading-[1.8] text-white/80">お答えいただいた文章・音声・写真は、依頼した方が確認し、選んだ場合にBOOKやWebブックに掲載されます。</p>
      <label className="flex items-start gap-3 text-[1rem] leading-[1.7]"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-2 h-5 w-5"/><span>本やWebブックへの掲載について確認しました</span></label>
      {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
      <button type="button" disabled={busy || !consent || !responderName.trim() || !answered} className={primary} onClick={submit}>{busy ? '送信中…' : '回答を送る'}</button>
    </div>}
    {screen === 'done' && <div className="pt-[22dvh] text-center"><Check className="mx-auto text-[#d6bb86]" size={32}/><h1 className="mt-7 text-narrative text-[1.55rem]">ありがとうございました</h1><p className="mt-5 text-[1rem] leading-[1.8] text-white/70">お答えいただいた言葉を、大切に預かりました。</p><a href={siteUrl} target="_blank" rel="noopener noreferrer" className="mt-10 inline-block rounded-xl border border-white/35 px-6 py-4 text-[1rem]">縦糸横糸について知る ↗</a></div>}
  </main></div>;
}
