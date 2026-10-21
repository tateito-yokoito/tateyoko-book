import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './today-sky-admin.css';
import {skyAssetUrl} from '../home/skyAssetUrl.js';
import ApprovedHome from '../home/ApprovedHome.jsx';
import { Scene1_MyPage } from '../App.jsx';
import { encodeDailySkyImage } from './skyImage.js';

const todayJst = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const position = (x, y) => `${x}% ${y}%`;
const fixedHomeHeight = 260;
const parsePosition = value => {
  const [x, y] = String(value || '50% 50%').split(' ');
  return [Number.parseInt(x, 10) || 0, y === 'center' ? 50 : Number.parseInt(y, 10) || 0];
};

const previewQuestion = {
  content: '子どもの頃は、どのあたりで暮らしていましたか？',
  chapter: '幼い頃',
  chapter_label: '幼い頃',
  prompt_hint: '地名や地域の様子から、覚えている範囲でお話しください。',
  reassurance_text: '正確な住所を思い出さなくても大丈夫です。'
};
const previewQuestions = [previewQuestion];
const previewThemeProgress = { currentTheme: { order: 1, label: '幼い頃のこと' } };
const previewStoryProgress = { currentIndex: 0, total: 25 };
const noop = () => {};

function SkyFrame({ label, sky, home = false, desktop = false }) {
  const frameRef = useRef(null);
  const windowRef = useRef(null);
  const [frameBody, setFrameBody] = useState(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const viewportWidth = desktop ? 1100 : 390;
  const viewportHeight = desktop ? 760 : 844;
  const scale = Math.min(1, (availableWidth || viewportWidth) / viewportWidth);

  useEffect(() => {
    const element = windowRef.current;
    if (!element) return undefined;
    const measure = () => setAvailableWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const prepareFrame = () => {
    const frameDocument = frameRef.current?.contentDocument;
    if (!frameDocument) return;
    frameDocument.head.replaceChildren();
    const base = frameDocument.createElement('base');
    base.href = document.baseURI;
    frameDocument.head.append(base);
    for (const stylesheet of document.head.querySelectorAll('link[rel="stylesheet"], style')) {
      frameDocument.head.append(stylesheet.cloneNode(true));
    }
    if (desktop && home) {
      const staticPreviewStyle = frameDocument.createElement('style');
      staticPreviewStyle.textContent = 'html, body, .app-container, .approved-home { overflow: hidden !important; }';
      frameDocument.head.append(staticPreviewStyle);
      frameRef.current.contentWindow?.scrollTo(0, 0);
    }
    setFrameBody(frameDocument.body);
  };

  return <div className={`sky-check ${desktop ? 'sky-check-desktop' : 'sky-check-phone'} ${home ? 'sky-check-home' : 'sky-check-question'}`}>
    <div className="sky-check-label">{label}</div>
    <div className="sky-check-window" ref={windowRef} style={{height: viewportHeight * scale}}>
      <iframe
        ref={frameRef}
        title={`${label}の顧客画面プレビュー`}
        className="sky-check-frame"
        srcDoc="<!doctype html><html lang='ja'><head></head><body></body></html>"
        onLoad={prepareFrame}
        style={{width: viewportWidth, height: viewportHeight, transform: `scale(${scale})`}}
      />
      {frameBody && createPortal(
        <div className="app-container">
          {home ? <ApprovedHome skyOverride={sky} questionSet={previewQuestions} themeProgress={previewThemeProgress} onOpenShelf={noop} />
            : <Scene1_MyPage question={previewQuestion} storyProgress={previewStoryProgress} userName="あなた" skyOverride={sky} onBack={noop} onNext={noop} onSkip={noop} onEndToday={noop} />}
        </div>, frameBody)}
    </div>
  </div>;
}

function NumberControl({ label, value, min, max, onChange }) {
  return <label className="sky-control">{label}<span>{value}</span><input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} /></label>;
}

export default function TodaySkyAdmin({ client }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editorError, setEditorError] = useState('');
  const [editorMessage, setEditorMessage] = useState('');
  const [file, setFile] = useState(null);
  const [src, setSrc] = useState('');
  const [editId, setEditId] = useState(null);
  const [organizingLibrary, setOrganizingLibrary] = useState(false);
  const [libraryView, setLibraryView] = useState('compact');
  const [homeX, setHomeX] = useState(50), [homeY, setHomeY] = useState(50);
  const [questionX, setQuestionX] = useState(50), [questionY, setQuestionY] = useState(50), [dim, setDim] = useState(85);
  const [pcHomeX, setPcHomeX] = useState(50), [pcHomeY, setPcHomeY] = useState(50);
  const [pcQuestionX, setPcQuestionX] = useState(50), [pcQuestionY, setPcQuestionY] = useState(50);
  const [pcOverride, setPcOverride] = useState(false);
  const [checked, setChecked] = useState(false);
  const [until, setUntil] = useState(() => `${todayJst().slice(0,4)}-12-31`);
  const [assignDay, setAssignDay] = useState('');
  const [assignId, setAssignId] = useState('');
  const load = useCallback(async () => {
    const { data: result, error: e } = await client.rpc('admin_daily_sky_overview', { input_from: todayJst(), input_to: `${new Date().getFullYear() + 1}-12-31` });
    if (e) setError(e.message); else { setData(result); setError(''); }
  }, [client]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!file) { setSrc(''); return; }
    const url = URL.createObjectURL(file); setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const catalog = data?.catalog || [];
  const editingItem = catalog.find(item => item.id === editId);
  const previewSrc = editingItem ? skyAssetUrl(client, editingItem.sky.src) : src;
  const today = data?.today || todayJst();
  const todayEntry = data?.schedule?.find(s => s.day === today);
  const todaySky = catalog.find(s => s.id === todayEntry?.sky_id);
  const active = useMemo(() => catalog.filter(s => s.active), [catalog]);
  const previewSky = useMemo(() => ({ id:'preview', src:previewSrc,
    ...(editingItem?.sky.questionSrc ? {questionSrc:skyAssetUrl(client, editingItem.sky.questionSrc)} : {}),
    homeObjectPosition:position(homeX,homeY), homeHeightPx:fixedHomeHeight,
    questionObjectPosition:position(questionX,questionY), questionDim:dim/100,
    ...(pcOverride ? {pcHomeObjectPosition:position(pcHomeX,pcHomeY),pcQuestionObjectPosition:position(pcQuestionX,pcQuestionY)} : {})
  }), [previewSrc,editingItem,client,homeX,homeY,questionX,questionY,dim,pcOverride,pcHomeX,pcHomeY,pcQuestionX,pcQuestionY]);
  function startEdit(item) {
    const sky = item.sky;
    const [hx, hy] = parsePosition(sky.homeObjectPosition);
    const [qx, qy] = parsePosition(sky.questionObjectPosition);
    const [phx, phy] = parsePosition(sky.pcHomeObjectPosition || sky.homeObjectPosition);
    const [pqx, pqy] = parsePosition(sky.pcQuestionObjectPosition || sky.questionObjectPosition);
    setHomeX(hx); setHomeY(hy); setQuestionX(qx); setQuestionY(qy);
    setPcHomeX(phx); setPcHomeY(phy); setPcQuestionX(pqx); setPcQuestionY(pqy);
    setDim(Math.round((sky.questionDim ?? .85) * 100));
    setPcOverride(Boolean(sky.pcHomeObjectPosition || sky.pcQuestionObjectPosition));
    setFile(null); setEditId(item.id); setChecked(false);
    setEditorError(''); setEditorMessage('');
    document.getElementById('sky-editor')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function run(task, success, scope = 'global') {
    setBusy(true); setError(''); setMessage(''); setEditorError(''); setEditorMessage('');
    try { await task(); await load(); (scope === 'editor' ? setEditorMessage : setMessage)(success); }
    catch (e) { (scope === 'editor' ? setEditorError : setError)(e.message || String(e)); }
    finally { setBusy(false); }
  }
  async function register() {
    if (!file || !checked) return;
    await run(async () => {
      if (!file.type.startsWith('image/')) throw new Error('画像ファイルを選択してください。');
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      const { blob, extension, contentType } = await encodeDailySkyImage(canvas);
      const id = `sky-${crypto.randomUUID()}`;
      const name = `${id}.${extension}`;
      const { error: uploadError } = await client.storage.from('daily-skies').upload(name, blob, { contentType, upsert: false });
      if (uploadError) throw uploadError;
      const sky = { id, src: `/storage/v1/object/public/daily-skies/${name}`, homeObjectPosition: position(homeX, homeY), homeHeightPx: fixedHomeHeight,
        questionObjectPosition: position(questionX, questionY), questionDim: dim / 100,
        ...(pcOverride ? { pcHomeObjectPosition: position(pcHomeX, pcHomeY), pcQuestionObjectPosition: position(pcQuestionX, pcQuestionY) } : {}) };
      const { error: registerError } = await client.rpc('admin_register_daily_sky', { input_id: id, input_sky: sky });
      if (registerError) throw registerError;
      setFile(null); setChecked(false);
    }, '空をライブラリへ登録しました。日付への割当はまだ行われていません。', 'editor');
  }
  async function saveEdits() {
    if (!editingItem || !checked) return;
    await run(async () => {
      const sky = { ...editingItem.sky,
        homeObjectPosition: position(homeX, homeY), homeHeightPx: fixedHomeHeight,
        questionObjectPosition: position(questionX, questionY), questionDim: dim / 100 };
      if (pcOverride) {
        sky.pcHomeObjectPosition = position(pcHomeX, pcHomeY);
        sky.pcQuestionObjectPosition = position(pcQuestionX, pcQuestionY);
      } else {
        delete sky.pcHomeObjectPosition;
        delete sky.pcQuestionObjectPosition;
      }
      const { error: updateError } = await client.rpc('admin_update_daily_sky_display', { input_id: editId, input_sky: sky });
      if (updateError) throw updateError;
      setEditId(null); setChecked(false);
    }, '表示調整を保存しました。過去の日付の表示は変更されません。', 'editor');
  }
  function jumpTo(sectionId) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  return <div className="sky-admin">
    <header><h3>今日の空</h3><p>日本時間の一日につき一枚。同じ日に、みんなが同じ空を見ます。</p></header>
    <nav className="sky-section-nav" aria-label="今日の空の画面内メニュー">
      <button type="button" onClick={() => jumpTo('sky-today')}>今日の空</button>
      <button type="button" onClick={() => jumpTo('sky-library-section')}>空の一覧 <span>{catalog.length}枚</span></button>
      <button type="button" onClick={() => jumpTo('sky-editor')}>{editingItem ? '表示を調整' : '空を追加'}</button>
      <button type="button" onClick={() => jumpTo('sky-schedule')}>未来の割当</button>
    </nav>
    {error && <p role="alert" className="sky-admin-error">{error}</p>}
    {message && <p role="status" className="sky-admin-message">{message}</p>}
    <section id="sky-today"><h4>今日の空 <small>{today}</small></h4>{todaySky ? <div className="sky-today"><img src={skyAssetUrl(client,(todayEntry.sky || todaySky.sky).src)} alt="今日の空" /><span>{todaySky.id}</span></div> : <p>今日の割当はまだありません。顧客が最初に開いた際に確定します。</p>}</section>
    <section id="sky-library-section"><div className="sky-library-heading"><h4>空のライブラリ <small>{catalog.length}枚</small></h4><div className="sky-library-heading-actions"><button type="button" aria-pressed={libraryView === 'large'} onClick={() => setLibraryView(value => value === 'compact' ? 'large' : 'compact')}>{libraryView === 'compact' ? '大きく見る' : '一覧を詰めて見る'}</button><button type="button" aria-pressed={organizingLibrary} onClick={() => setOrganizingLibrary(value => !value)}>{organizingLibrary ? '整理を終える' : '整理する'}</button></div></div><div className={`sky-library sky-library-${libraryView}`}>{catalog.map(item => <div key={item.id} className="sky-library-item"><div className="approved-home sky-library-home-preview"><div className="ah-sky" role="img" aria-label={`${item.id}のスマホホーム表示`}><img src={skyAssetUrl(client,item.sky.src)} alt="" style={{objectPosition:item.sky.homeObjectPosition || '50% 50%','--sky-phone-position':item.sky.homeObjectPosition || '50% 50%'}} /></div></div><b>{item.id}</b><span>登録日 {item.registered_on || '2026-09-24'}</span><span>{item.active ? '今後使用する' : '今後使用しない'} · 使用済み {item.used_count}日{item.next_day ? ` · 次回 ${item.next_day}` : ''}</span><div className="sky-library-actions"><button disabled={busy} onClick={() => startEdit(item)}>表示を調整</button>{organizingLibrary && <button className="sky-library-archive" disabled={busy} onClick={() => { if (!window.confirm(`${item.id}を${item.active ? '今後使用しない' : '今後使用する'}設定にしますか？\n過去に割り当てた日は変更されません。`)) return; void run(async () => { const { error: e } = await client.rpc('admin_set_daily_sky_active', { input_id: item.id, input_active: !item.active }); if (e) throw e; }, '今後の利用設定を変更しました。過去の日付は変更していません。'); }}>{item.active ? '今後使用しない' : '今後使用する'}</button>}</div></div>)}</div></section>
    <section id="sky-editor"><h4>{editingItem ? `${editingItem.id} の表示調整` : '空を追加'}</h4><p>{editingItem ? '画像は変えずに構図と暗さを調整します。過去に表示された日の見え方は変えません。' : '画像を選び、ホームと質問画面をスマホ・PCで確認してください。登録だけでは顧客画面には表示されません。'}</p>{editingItem ? <button onClick={() => {setEditId(null);setChecked(false);setEditorError('');setEditorMessage('');}}>調整をやめる</button> : <input type="file" accept="image/*" onChange={e => { setFile(e.target.files?.[0] || null); setChecked(false); setEditorError(''); setEditorMessage(''); }} />}
      {previewSrc && <><div className="sky-controls"><NumberControl label="ホーム・横位置" value={homeX} min={0} max={100} onChange={setHomeX} /><NumberControl label="ホーム・縦位置" value={homeY} min={0} max={100} onChange={setHomeY} /><NumberControl label="質問・横位置" value={questionX} min={0} max={100} onChange={setQuestionX} /><NumberControl label="質問・縦位置" value={questionY} min={0} max={100} onChange={setQuestionY} /><NumberControl label="質問・暗さ（%）" value={dim} min={0} max={100} onChange={setDim} /></div>
      <p>ホーム画像の高さは全画像共通で260pxです。</p>
      <div className="sky-check-grid">
        <SkyFrame label="スマホ · ホーム" sky={previewSky} home />
        <SkyFrame label="スマホ · 質問" sky={previewSky} />
        <div className="sky-check-pc-controls">
          <label><input type="checkbox" checked={pcOverride} onChange={e => setPcOverride(e.target.checked)} /> PC用の構図を個別に調整する</label>
          {pcOverride && <div className="sky-controls"><NumberControl label="PCホーム・横位置" value={pcHomeX} min={0} max={100} onChange={setPcHomeX} /><NumberControl label="PCホーム・縦位置" value={pcHomeY} min={0} max={100} onChange={setPcHomeY} /><NumberControl label="PC質問・横位置" value={pcQuestionX} min={0} max={100} onChange={setPcQuestionX} /><NumberControl label="PC質問・縦位置" value={pcQuestionY} min={0} max={100} onChange={setPcQuestionY} /></div>}
        </div>
        <SkyFrame label="PC · ホーム" sky={previewSky} home desktop />
        <SkyFrame label="PC · 質問" sky={previewSky} desktop />
      </div>
      <label><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} /> 4画面の構図と文字の読みやすさを確認しました</label><button disabled={busy || !checked} onClick={editingItem ? saveEdits : register}>{editingItem ? '表示調整を保存する' : 'この空を登録する'}</button></>}
      {editorError && <p role="alert" className="sky-admin-error sky-editor-feedback">{editorError}</p>}
      {editorMessage && <p role="status" className="sky-admin-message sky-editor-feedback">{editorMessage}</p>}
    </section>
    <section id="sky-schedule"><h4>未来の割当</h4><p>今日と過去は変更できません。画像追加・非表示の後も予定は自動では変わりません。</p><div className="sky-schedule-actions"><label>再配置の最終日 <input type="date" value={until} min={today} onChange={e => setUntil(e.target.value)} /></label><button disabled={busy || !active.length} onClick={() => { if (window.confirm(`明日から${until}までの予定を再配置します。今日と過去は変更しません。`)) void run(async () => { const { error: e } = await client.rpc('admin_rebuild_future_daily_skies', { input_until: until }); if (e) throw e; }, '未来の空を再配置しました。'); }}>今後の空に反映する</button></div>
      <div className="sky-schedule-actions"><label>日付 <input type="date" value={assignDay} min={today} onChange={e => setAssignDay(e.target.value)} /></label><label>空 <select value={assignId} onChange={e => setAssignId(e.target.value)}><option value="">選択してください</option>{active.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}</select></label><button disabled={busy || !assignDay || !assignId || assignDay <= today} onClick={() => run(async () => { const { error: e } = await client.rpc('admin_assign_daily_sky', { input_day: assignDay, input_id: assignId }); if (e) throw e; }, '未来の日付を変更しました。')}>この日に割り当てる</button></div>
      <div className="sky-calendar">{data?.schedule?.filter(s => s.day > today).slice(0, 365).map(s => <div key={s.day}><time>{s.day}</time><span>{s.sky_id}{s.manual ? ' · 手動指定' : ''}</span></div>)}</div>
    </section>
  </div>;
}
