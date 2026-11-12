import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Camera, ChevronRight, Image, Lock, Mic, Pencil, Play } from 'lucide-react';
import { STORY_THEMES } from './lib/storyThemes.js';
import { SEASON_NAMES, hasSeasonalContent, invokeSeasonal, loadSeasonalMemories, seasonalBoxes, seasonalSaveArgs } from './lib/seasonalMemory.js';
import './seasonal-memory.css';

const STORE_KEY = id => `nenrin-seasonal-draft:${id}`;
const mediaFor = (media, record) => media.filter(item => item.record_id === record?.id);
const titleOf = record => record?.title?.trim() || (record?.kind === 'life' ? record.question_text : '今、残しておきたいこと');
const mimeExt = file => file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png'
  : file.type === 'image/webp' ? 'webp' : file.type === 'audio/webm' ? 'webm' : 'mp4';
const useSeasonalClock = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timerId = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timerId);
  }, []);
  return seasonalBoxes(now);
};

export function SeasonalHomeCards({ client, projectId, onOpen, onShelf }) {
  const [state, setState] = useState({ records: [], canEdit: false });
  useEffect(() => {
    if (!client || !projectId) return;
    let live = true;
    Promise.all([
      loadSeasonalMemories(client, projectId),
      client.rpc('seasonal_memory_can_edit', { input_project_id: projectId }),
    ]).then(([data, access]) => {
      if (live) setState({ records: data.records, canEdit: !access.error && access.data === true });
    }).catch(() => { if (live) setState({ records: [], canEdit: false }); });
    return () => { live = false; };
  }, [client, projectId]);
  const boxes = useSeasonalClock();
  const entries = [boxes.current, boxes.previous].filter(Boolean);
  return <div className="sm-home">
    {state.canEdit && entries.map((box, index) => {
      const record = state.records.find(item => item.season_start === box.start);
      if (record?.status === 'completed' && index > 0) return null;
      const finished = record?.status === 'completed';
      return <section className={`sm-home-box ${index ? 'sm-home-box--grace' : ''}`} key={box.start}>
        <p>{box.name}の記憶箱 <small>{box.year}年{box.months}</small></p>
        <h2>{finished ? `この${box.name}の記憶を残しました。`
          : index ? box.graceDays ? `あと${box.graceDays}日で、フタが閉まります。`
            : '今日で、フタが閉まります。'
            : `この${box.name}、何を残しますか？`}</h2>
        <button type="button" onClick={() => onOpen(finished ? 'fragments' : 'box', box.start)}>
          {finished ? '記憶のかけらで見る' : record ? '続きを残す' : '記憶を残す'}
        </button>
      </section>;
    })}
    <button className="sm-home-link" type="button" onClick={() => onOpen('fragments')}>記憶のかけら <ChevronRight size={18}/><small>季節ごとに積み重ねた思い出</small></button>
    <button className="sm-home-link" type="button" onClick={onShelf}>本棚 <ChevronRight size={18}/><small>完成した、あなたの人生の本</small></button>
  </div>;
}

export default function SeasonalMemoryFlow({
  client, projectId, questionSet = [], initialPage = 'box', initialSeason,
  onClose, onShelf, renderRecorder, renderPhotoCorrection,
}) {
  const [page, setPage] = useState(initialPage);
  const [season, setSeason] = useState(initialSeason || seasonalBoxes().current.start);
  const [records, setRecords] = useState([]);
  const [media, setMedia] = useState([]);
  const [record, setRecord] = useState(null);
  const [canEdit, setCanEdit] = useState(false);
  const [isSelf, setIsSelf] = useState(false);
  const [kind, setKind] = useState(null);
  const [theme, setTheme] = useState('recommended');
  const [form, setForm] = useState({ title: '', body: '', transcript_raw: '', transcript_clean: '', transcript_readable: '', transcript_essay: '', tone: 'readable' });
  const [saveState, setSaveState] = useState('idle');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState(null);
  const [mediaUrls, setMediaUrls] = useState({});
  const [voiceEditing, setVoiceEditing] = useState(false);
  const [audioToProcess, setAudioToProcess] = useState(null);
  const [polishProposal, setPolishProposal] = useState('');
  const recordRef = useRef(null), desiredRef = useRef(null), pendingRef = useRef(null);
  const conflictRef = useRef(false);
  const draftBaseRevision = useRef(0);
  const editVersion = useRef(0), savedVersion = useRef(0), timer = useRef(null);
  const boxes = useSeasonalClock();
  const activeRecord = record || records.find(item => item.season_start === season);
  const activeMedia = mediaFor(media, activeRecord);

  const refresh = async () => {
    const [data, editAccess, selfAccess] = await Promise.all([
      loadSeasonalMemories(client, projectId),
      client.rpc('seasonal_memory_can_edit', { input_project_id: projectId }),
      client.rpc('seasonal_memory_is_self', { input_project_id: projectId }),
    ]);
    setRecords(data.records); setMedia(data.media);
    setCanEdit(!editAccess.error && editAccess.data === true);
    setIsSelf(!selfAccess.error && selfAccess.data === true);
    if (recordRef.current) {
      const fresh = data.records.find(item => item.id === recordRef.current.id);
      // Keep the revision used by an unsaved draft. A focus refresh must not
      // silently rebase local text over another editor's newer save.
      if (fresh) {
        if (editVersion.current === savedVersion.current) {
          setCurrentRecord(fresh);
        }
      } else { recordRef.current = null; setRecord(null); setPage('fragments'); }
    }
    return data;
  };
  useEffect(() => { refresh().catch(cause => setError(cause.message)); }, [client, projectId]);
  useEffect(() => {
    const onFocus = () => refresh().catch(cause => setError(cause.message));
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [client, projectId]);
  useEffect(() => {
    let live = true;
    const objects = [];
    Promise.all(media.map(async item => {
      const { data, error: downloadError } = await client.functions.invoke('seasonal-memory-media', {
        body: { action: 'read', mediaId: item.id },
      });
      if (downloadError) return null;
      const url = URL.createObjectURL(data);
      if (!live) { URL.revokeObjectURL(url); return null; }
      objects.push(url);
      return [item.id, url];
    })).then(entries => { if (live) setMediaUrls(Object.fromEntries(entries.filter(Boolean))); });
    return () => { live = false; objects.forEach(url => URL.revokeObjectURL(url)); };
  }, [client, media.map(item => item.id).join(',')]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const setCurrentRecord = next => {
    recordRef.current = next; setRecord(next);
    const cached = localStorage.getItem(STORE_KEY(next.id));
    const initial = { title: next.title || '', body: next.body || '',
      transcript_raw: next.transcript_raw || '', transcript_clean: next.transcript_clean || '',
      transcript_readable: next.transcript_readable || '', transcript_essay: next.transcript_essay || '',
      tone: next.tone || 'readable', event_period: next.event_period || null };
    let resumable = false;
    conflictRef.current = false;
    draftBaseRevision.current = next.revision;
    if (cached && next.status === 'draft') {
      try {
        const draft = JSON.parse(cached);
        draftBaseRevision.current = draft.expectedRevision;
        if (draft.expectedRevision === next.revision) {
          Object.assign(initial, draft.fields); resumable = true; setSaveState('saving');
        } else {
          Object.assign(initial, draft.fields);
          conflictRef.current = true; setSaveState('failed');
          setError('別の端末で記録が更新されました。端末の下書きは残っています。');
        }
      } catch { localStorage.removeItem(STORE_KEY(next.id)); }
    } else setSaveState('idle');
    desiredRef.current = initial; setForm(initial);
    editVersion.current = resumable ? 1 : 0;
    savedVersion.current = 0;
    if (resumable) setTimeout(() => flush(), 0);
  };
  const flush = () => {
    if (conflictRef.current) return Promise.resolve(false);
    if (timer.current) clearTimeout(timer.current);
    if (pendingRef.current) return pendingRef.current;
    pendingRef.current = (async () => {
      while (savedVersion.current < editVersion.current) {
        const version = editVersion.current, fields = desiredRef.current;
        try {
          const updated = await invokeSeasonal(client, 'save_seasonal_memory',
            seasonalSaveArgs(recordRef.current, fields));
          recordRef.current = updated; setRecord(updated);
          savedVersion.current = version;
          draftBaseRevision.current = updated.revision;
          if (savedVersion.current === editVersion.current) {
            localStorage.removeItem(STORE_KEY(updated.id)); setSaveState('saved');
          }
        } catch (cause) {
          if (cause.code === '40001') conflictRef.current = true;
          setSaveState('failed'); setError(cause.message || '保存できませんでした');
          return false;
        }
      }
      return true;
    })().finally(() => { pendingRef.current = null; });
    return pendingRef.current;
  };
  const edit = fields => {
    const next = { ...desiredRef.current, ...fields };
    desiredRef.current = next; setForm(next); editVersion.current += 1;
    setPolishProposal('');
    setSaveState('saving'); setError('');
    try { localStorage.setItem(STORE_KEY(recordRef.current.id), JSON.stringify({
      expectedRevision: draftBaseRevision.current, fields: next,
    })); }
    catch { setSaveState('failed'); setError('端末に下書きを保持できません。画面を閉じずに確認してください。'); return; }
    if (conflictRef.current) {
      setSaveState('failed');
      setError('別の端末で記録が更新されました。端末の下書きは残っています。');
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  };
  const discardConflict = async () => {
    if (!window.confirm('この端末に残った未保存の下書きを破棄し、最新の記録を読み込みますか？')) return;
    const recordId = recordRef.current.id;
    localStorage.removeItem(STORE_KEY(recordId));
    conflictRef.current = false;
    editVersion.current = savedVersion.current = 0;
    const data = await refresh();
    const fresh = data.records.find(item => item.id === recordId);
    if (fresh) { setCurrentRecord(fresh); setError(''); }
  };
  const leave = async target => {
    if (editVersion.current > savedVersion.current && await flush() !== true) return;
    setPage(target);
  };
  const start = async (nextKind, question = null) => {
    setBusy(true); setError('');
    try {
      const next = await invokeSeasonal(client, 'start_seasonal_memory', {
        input_project_id: projectId, input_season_start: season,
        input_kind: nextKind, input_theme_code: question?.theme_code || null,
        input_question_id: question?.user_question_id || null,
        input_question_text: question?.content || null,
      });
      setCurrentRecord(next); setKind(next.kind); setPage('answer'); await refresh();
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  const addMedia = async (file, mediaKind, duration = null) => {
    if (!recordRef.current || file.size > 25000000) throw new Error('25MB以下のファイルを選んでください');
    if (editVersion.current > savedVersion.current && await flush() !== true) {
      throw new Error('文章の保存が完了していません。再試行してください。');
    }
    const recordId = recordRef.current.id, mediaId = crypto.randomUUID();
    const path = `${recordId}/${mediaId}.${mimeExt(file)}`;
    const { error: uploadError } = await client.storage.from('seasonal-memory')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    try {
      await invokeSeasonal(client, 'register_seasonal_memory_media', {
        input_record_id: recordId, input_media_id: mediaId, input_kind: mediaKind,
        input_path: path, input_mime_type: file.type, input_byte_size: file.size,
        input_duration_seconds: duration,
      });
    } catch (cause) {
      // Unregistered objects remain inaccessible; the server logs failed cleanup.
      throw cause;
    }
    await refresh();
    return path;
  };
  const processAudio = async (path, transcript = '') => {
    setPage('processing'); setSaveState('saving'); setError('');
    try {
      const { data: result, error: transcribeError } = await client.functions.invoke('transcribe-audio', {
        body: { seasonalRecordId: recordRef.current.id, bookProjectId: projectId,
          questionText: recordRef.current.question_text || titleOf(recordRef.current),
          audioPaths: [path], fallbackTranscript: transcript || '' },
      });
      if (transcribeError || !result?.success) throw transcribeError || new Error(result?.error || '文字起こしに失敗しました');
      const raw = result.transcript_raw || transcript || '';
      const { data: polished, error: polishError } = await client.functions.invoke('polish-transcript', {
        body: { seasonalRecordId: recordRef.current.id, bookProjectId: projectId,
          questionText: recordRef.current.question_text || titleOf(recordRef.current), transcriptRaw: raw },
      });
      if (polishError || !polished?.success) throw polishError || new Error(polished?.error || '文章整形に失敗しました');
      edit({ transcript_raw: raw, transcript_clean: polished.transcript_clean || raw,
        transcript_readable: polished.transcript_readable || raw,
        transcript_essay: polished.transcript_essay || raw,
        body: polished.transcript_readable || raw, tone: 'readable' });
      if (await flush() !== true) return;
      setAudioToProcess(null);
      setPage('voice_review'); setSaveState('saved');
    } catch (cause) { setSaveState('failed'); setError(cause.message); setPage('voice_review'); }
  };
  const recordAudio = async (transcript, duration, _url, blob) => {
    setPage('processing'); setSaveState('saving'); setError('');
    try {
      const mime = blob.type?.split(';')[0] || 'audio/mp4';
      const file = new File([blob], 'memory.' + (mime === 'audio/webm' ? 'webm' : 'mp4'), { type: mime });
      const path = await addMedia(file, 'audio', Math.max(1, Math.ceil(duration)));
      setAudioToProcess({path, transcript: transcript || ''});
      await processAudio(path, transcript);
    } catch (cause) { setSaveState('failed'); setError(cause.message); setPage('voice_review'); }
  };
  const proposePolish = async () => {
    if (!form.body.trim() || !recordRef.current) return;
    setBusy(true); setError(''); setPolishProposal('');
    try {
      if (editVersion.current > savedVersion.current && await flush() !== true) return;
      const sourceVersion = editVersion.current;
      const { data, error: polishError } = await client.functions.invoke('polish-transcript', {
        body: { seasonalRecordId: recordRef.current.id, bookProjectId: projectId,
          questionText: recordRef.current.question_text || titleOf(recordRef.current),
          transcriptRaw: form.body },
      });
      if (polishError || !data?.success) throw polishError || new Error(data?.error || '文章を整えられませんでした');
      if (editVersion.current !== sourceVersion) return;
      setPolishProposal(form.tone === 'essay' ? data.transcript_essay || data.transcript_readable
        : form.tone === 'clean' ? data.transcript_clean : data.transcript_readable);
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  const proposal = polishProposal && <div className="sm-proposal">
    <p>整えた文章を確認してください。</p><p>{polishProposal}</p>
    <button className="sm-primary" onClick={() => { edit({body:polishProposal}); setPolishProposal(''); }}>この文章を採用する</button>
    <button className="sm-secondary" onClick={() => setPolishProposal('')}>見送る</button>
  </div>;
  const finish = async () => {
    if (!window.confirm('この季節の記録を終えますか？ 確定後は編集できません。')) return;
    setBusy(true); setError('');
    try {
      if (editVersion.current > savedVersion.current && await flush() !== true) return;
      const finished = await invokeSeasonal(client, 'finish_seasonal_memory', {
        input_record_id: recordRef.current.id, input_expected_revision: recordRef.current.revision });
      recordRef.current = finished; setRecord(finished);
      await refresh(); setPage('fragments');
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  const removePhoto = async item => {
    if (!window.confirm('この写真を外しますか？')) return;
    try {
      const { data, error: deleteError } = await client.functions.invoke('seasonal-memory-media', {
        body: { action: 'delete', mediaId: item.id },
      });
      if (deleteError || !data?.success) throw deleteError || new Error(data?.error || '写真を外せませんでした');
      await refresh();
    } catch (cause) { setError(cause.message); await refresh().catch(() => {}); }
  };
  const movePhoto = async (item, direction) => {
    const photos = activeMedia.filter(m => m.kind === 'photo');
    const from = photos.findIndex(m => m.id === item.id), to = from + direction;
    if (to < 0 || to >= photos.length) return;
    const ids = photos.map(m => m.id);
    [ids[from], ids[to]] = [ids[to], ids[from]];
    try {
      await invokeSeasonal(client, 'reorder_seasonal_memory_photos', {
        input_record_id: activeRecord.id, input_photo_ids: ids,
      });
      await refresh();
    } catch (cause) { setError(cause.message); }
  };
  const questions = useMemo(() => {
    const available = questionSet.filter(item => item.content && item.is_active !== false);
    if (theme !== 'recommended') return available.filter(item => item.theme_code === theme ||
      item.chapter_label === STORY_THEMES.find(x => x.code === theme)?.label);
    const distinct = STORY_THEMES.map(storyTheme => available.find(item =>
      item.theme_code === storyTheme.code || item.chapter_label === storyTheme.label)).filter(Boolean);
    return distinct.length >= 3 ? distinct.slice(0, 3) : available.slice(0, 3);
  }, [questionSet, theme]);
  const finishedRecords = records.filter(item => item.status === 'completed');
  const fragmentGroups = [
    { title: '日々の記憶', entries: finishedRecords.filter(item => item.kind === 'daily')
      .sort((a,b) => b.completed_at.localeCompare(a.completed_at)) },
    ...STORY_THEMES.map(storyTheme => ({
      title: storyTheme.label,
      entries: finishedRecords.filter(item => item.kind === 'life' && item.theme_code === storyTheme.code)
        .sort((a,b) => b.completed_at.localeCompare(a.completed_at)),
    })),
  ];
  const [filter, setFilter] = useState('all');
  const visibleGroups = fragmentGroups.filter(group => group.entries.length &&
    (filter === 'all' || filter === 'daily' && group.title === '日々の記憶'
      || filter === 'life' && group.title !== '日々の記憶'));

  if (page === 'recording' && activeRecord) return renderRecorder({
    question: { content: activeRecord.question_text || titleOf(activeRecord),
      chapter_label: activeRecord.kind === 'life' ? STORY_THEMES.find(x => x.code === activeRecord.theme_code)?.label : '今の想いを残す' },
    photoUrls: activeMedia.filter(item => item.kind === 'photo').map(item => mediaUrls[item.id]).filter(Boolean),
    onBack: () => setPage('answer'), onComplete: recordAudio,
  });
  return <div className="sm-flow">
    <header className="sm-top"><button type="button" onClick={() => {
      if (page === 'box' || page === 'fragments') onClose();
      else leave(page === 'detail' ? 'fragments' : 'box');
    }}>← 戻る</button><span>縦糸∞横糸</span></header>
    <main>
      {error && <p className="sm-error" role="alert">{error}</p>}
      {page === 'home' && <button type="button" onClick={onClose}>ホームへ戻る</button>}
      {page === 'box' && <><h1>{season === boxes.current.start ? boxes.current.name : boxes.previous?.name}の記憶箱</h1>
        <p>この季節、残しておきたいことはありますか？</p>
        {activeRecord?.status === 'completed'
          ? <button className="sm-primary" onClick={() => { setCurrentRecord(activeRecord); setPage('detail'); }}>記憶のかけらで見る</button>
          : activeRecord ? <button className="sm-primary" onClick={() => { setCurrentRecord(activeRecord); setPage('answer'); }}>続きを残す</button>
            : canEdit && <><button className="sm-primary" disabled={busy} onClick={() => start('daily')}>今の想いを残す</button>
              <button className="sm-secondary" onClick={() => setPage('choose')}>人生をもう少し語る</button></>}
      </>}
      {page === 'choose' && <><p className="sm-kicker">人生をもう少し語る</p><h1>今日は、何を思い出しますか？</h1>
        <p>テーマを選ぶ</p><div className="sm-chips">
          {[{code:'recommended',label:'おすすめ'},...STORY_THEMES].map(item =>
            <button key={item.code} className={theme===item.code?'selected':''} onClick={() => setTheme(item.code)}>{item.label}</button>)}
        </div><h2>{theme === 'recommended' ? '今日のおすすめ' : STORY_THEMES.find(x => x.code === theme)?.label + 'の問い'}</h2>
        <div className="sm-question-list">{questions.map(item => <button key={item.user_question_id || item.id}
          onClick={() => start('life', item)}>{item.content}<ChevronRight size={18}/>{item.status === 'answered' && <small>以前の回答あり</small>}</button>)}</div>
      </>}
      {page === 'answer' && activeRecord && <><p className="sm-kicker">{activeRecord.kind === 'life' ? '人生をもう少し語る' : '今の想いを残す'}</p>
        {activeRecord.kind === 'life' ? <h1>{activeRecord.question_text}</h1> : <>
          <h1>{form.title.trim() || titleOf(activeRecord)}</h1>
          <label className="sm-title">題名をつける（任意）<input value={form.title} onChange={e => edit({title:e.target.value})} placeholder="題名をつける" /></label></>}
        {activeMedia.length > 0 && <div className="sm-thumbs">{activeMedia.filter(m => m.kind==='photo').map(m =>
          <img key={m.id} src={mediaUrls[m.id]} alt="" onClick={() => window.open(mediaUrls[m.id], '_blank')} />)}</div>}
        {(form.body || activeMedia.some(m => m.kind==='audio')) && <div className="sm-summary">
          {form.body && <p>{form.body.slice(0,180)}</p>}
          {activeMedia.filter(m => m.kind==='audio').map(m => <audio key={m.id} src={mediaUrls[m.id]} controls />)}
          {!form.transcript_raw && activeMedia.some(m => m.kind==='audio') &&
            <button className="sm-secondary" type="button" onClick={() => processAudio(activeMedia.find(m => m.kind==='audio').storage_path)}>
              文字起こしを再開する
            </button>}
        </div>}
        <div className="sm-entry-grid"><button onClick={() => setPage('recording')}><Mic/>声で語る</button>
          <button onClick={() => setPage('writing')}><Pencil/>書き込む</button>
          <button className="wide" onClick={() => setPage('photos')}><Camera/>写真を添える</button></div>
        <p className="sm-save-state" role="status">{saveState==='saving'?'保存中…':saveState==='saved'?'保存しました':saveState==='failed'?'保存できていません':''}</p>
        {saveState==='failed' && (conflictRef.current
          ? <button className="sm-retry" type="button" onClick={discardConflict}>端末の下書きを破棄して最新の記録を開く</button>
          : <button className="sm-retry" type="button" onClick={flush}>保存を再試行する</button>)}
        <button className="sm-primary sm-finish" disabled={busy || saveState==='saving' || saveState==='failed' || !hasSeasonalContent(activeRecord,activeMedia) && !form.body.trim()}
          onClick={finish}>この記録を終える</button>
      </>}
      {page === 'writing' && activeRecord && <><h1>{titleOf(activeRecord)}</h1>
        <div className="sm-thumbs">{activeMedia.filter(m=>m.kind==='photo').map(m=><img key={m.id} src={mediaUrls[m.id]} alt="" />)}</div>
        <textarea value={form.body} onChange={e=>edit({body:e.target.value})} placeholder="ここに思い出を書く" aria-label="記録の文章" />
        <button className="sm-secondary" disabled={busy || !form.body.trim()} onClick={proposePolish}>✦ 整える</button>{proposal}
        <p className="sm-save-state" role="status">{saveState==='saving'?'保存中…':saveState==='saved'?'保存しました':saveState==='failed'?'保存できていません':''}</p>
        {saveState==='failed' && (conflictRef.current
          ? <button className="sm-retry" type="button" onClick={discardConflict}>端末の下書きを破棄して最新の記録を開く</button>
          : <button className="sm-retry" type="button" onClick={flush}>保存を再試行する</button>)}
        <button className="sm-primary" onClick={() => leave('answer')}>回答を確認する</button></>}
      {page === 'photos' && activeRecord && <><h1>写真を添える</h1>
        <div className="sm-thumbs">{activeMedia.filter(m=>m.kind==='photo').map(m=><button
          className="sm-photo-thumb" key={m.id} type="button" aria-label="写真を確認・編集する"
          onClick={() => setSelectedPhotoId(selectedPhotoId === m.id ? null : m.id)}>
          <img src={mediaUrls[m.id]} alt="" /></button>)}</div>
        {selectedPhotoId && activeMedia.filter(m=>m.id===selectedPhotoId).map(m=><div className="sm-photo-tools" key={m.id}>
          <img src={mediaUrls[m.id]} alt="選択した写真" />
          <div><button onClick={() => movePhoto(m,-1)}>前へ移動</button><button onClick={() => movePhoto(m,1)}>後へ移動</button>
          <button onClick={() => { removePhoto(m); setSelectedPhotoId(null); }}>写真を外す</button></div></div>)}
        <button className="sm-primary" disabled={activeMedia.filter(m=>m.kind==='photo').length>=10}
          onClick={() => setPhotoOpen(true)}>カメラで撮る・写真から選ぶ</button>
        <button className="sm-secondary" onClick={() => leave('answer')}>回答を確認する</button></>}
      {page === 'processing' && <><h1>文字起こし中…</h1><p>音声は保存しました。処理が終わるまでお待ちください。</p></>}
      {page === 'voice_review' && activeRecord && <><h1>{titleOf(activeRecord)}</h1>
        {activeMedia.filter(m=>m.kind==='audio').map(m=><audio key={m.id} src={mediaUrls[m.id]} controls />)}
        {audioToProcess && <button className="sm-secondary" type="button" onClick={() => processAudio(audioToProcess.path,audioToProcess.transcript)}>文字起こしを再試行する</button>}
        <h2>文章の仕上がりを選ぶ</h2><div className="sm-tone">
          {[["clean","そのまま"],["readable","語り調"],["essay","作品調"]].map(([value,label]) =>
            <button className={form.tone===value?'selected':''} key={value} onClick={() => {
              if (form.body !== form['transcript_'+form.tone] && !window.confirm('編集した文章は保持されます。仕上がりを切り替えますか？')) return;
              edit({tone:value,body:form.body !== form['transcript_'+form.tone] ? form.body : form['transcript_'+value]});
            }}>{label}</button>)}</div>
        {voiceEditing ? <><textarea value={form.body} onChange={e=>edit({body:e.target.value})} aria-label="録音からの文章" />
          <div className="sm-edit-actions"><button className="sm-secondary" disabled={busy} onClick={proposePolish}>✦ 整える</button>
          <button className="sm-primary" onClick={async()=>{if(window.confirm('編集結果を上書き保存してよろしいですか？') && await flush())setVoiceEditing(false)}}>保存する</button></div>{proposal}
          <button className="sm-secondary" onClick={() => {if(window.confirm('編集を取り消して、元の語り調の文章に戻しますか？')) edit({body:form.transcript_readable,tone:'readable'});}}>元の文章に戻す</button></>
          : <><p className="sm-summary">{form.body || form.transcript_raw}</p><button className="sm-secondary" onClick={() => setVoiceEditing(true)}>✎ 編集する</button></>}
        <button className="sm-secondary" onClick={() => setPage('recording')}>録り直す</button>
        <button className="sm-primary" disabled={saveState==='failed'} onClick={() => leave('answer')}>回答を確認する</button></>}
      {page === 'fragments' && <><h1>記憶のかけら</h1>
        <div className="sm-tabs">{[['all','すべて'],['daily','日々の記憶'],['life','人生の語り']].map(([key,label])=>
          <button className={filter===key?'selected':''} key={key} onClick={() => setFilter(key)}>{label}</button>)}</div>
        {visibleGroups.length ? visibleGroups.map(group => <section key={group.title}><h2>{group.title}</h2>
          {group.entries.map(item => { const photo = mediaFor(media,item).find(m=>m.kind==='photo');
            return <button className="sm-fragment" key={item.id} onClick={()=>{setCurrentRecord(item);setPage('detail')}}>
              {photo && <img src={mediaUrls[photo.id]} alt="" />}
              <span>{item.locked && <Lock size={16}/>}<strong>{titleOf(item)}</strong>
              <small>{item.season_start.slice(0,4)}年{SEASON_NAMES[Math.floor((Number(item.season_start.slice(5,7))-1)/3)]}・{item.body.slice(0,60)}</small></span><ChevronRight size={18}/></button>})}</section>) : <p>記録はまだありません。</p>}</>}
      {page === 'detail' && activeRecord && <><h1>{titleOf(activeRecord)}</h1>
        <p>{activeRecord.season_start.slice(0,7).replace('-', '年')}月の記録</p>
        {activeMedia.filter(m=>m.kind==='photo').map(m=><img className="sm-detail-photo" key={m.id} src={mediaUrls[m.id]} alt="" />)}
        <p className="sm-detail-body">{activeRecord.body}</p>
        {activeMedia.filter(m=>m.kind==='audio').map(m=><audio key={m.id} controls src={mediaUrls[m.id]} />)}
        {activeRecord.event_period && <p>出来事の時期：{activeRecord.event_period}</p>}
        {isSelf && <button className="sm-secondary" onClick={async()=>{try {
          await invokeSeasonal(client,'set_seasonal_memory_lock',{input_record_id:activeRecord.id,input_locked:!activeRecord.locked});
          await refresh();
        }catch(cause){setError(cause.message)}}}>{activeRecord.locked?'カギを外す':'カギをかける'}</button>}
        {activeRecord.locked && <p><Lock size={15}/> カギをかけています</p>}</>}
    </main>
    {!['recording','writing','photos','voice_review','answer','processing'].includes(page) && <nav className="sm-nav">
      <button onClick={onClose}>ホーム</button><button onClick={()=>setPage('fragments')}>記憶のかけら</button><button onClick={onShelf}>本棚</button>
    </nav>}
    {photoOpen && renderPhotoCorrection({ open: photoOpen, onClose: () => setPhotoOpen(false),
      onComplete: async file => { await addMedia(file,'photo'); setSaveState('saved'); } })}
  </div>;
}
