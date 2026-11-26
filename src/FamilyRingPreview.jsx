import React, { useState } from 'react';
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, Ellipsis, Image, LockKeyhole, Mic, Video } from 'lucide-react';
import FamilyPersonPage from './FamilyPersonPage.jsx';
import './family-ring-preview.css';

const initialStories = [
  { id: 'start-1', theme: 'はじまりの章', question: 'ご自身のお名前を教えてください。', body: '森野ひかりです。家族と過ごす時間を大切にしています。' },
  { id: 'start-2', theme: 'はじまりの章', question: '最近は、どんなふうに一日を過ごすことが多いですか？', body: '朝は庭の花を眺めてから、一日を始めます。' },
  { id: 'start-3', theme: 'はじまりの章', question: '日々の中で、楽しみにしている時間はありますか？', body: '週末に家族と食卓を囲む時間が楽しみです。' },
  { id: 'school-1', theme: '学生時代', question: '学校で、今でもよく覚えている出来事はありますか？', body: '文化祭の準備を、友人と遅くまで続けたことを覚えています。', photo: true },
  { id: 'school-2', theme: '学生時代', question: '仲の良かった友達や、心に残っている先生はどんな方でしたか？', body: 'いつも話を聞いてくれた友人がいました。卒業後も手紙を交わしました。', locked: true, audio: true },
  { id: 'school-3', theme: '学生時代', question: '学生時代や若い頃、夢中になっていたことは何でしたか？', body: '放課後の写真部に夢中でした。帰り道の光まで写真に残したくて、毎日カメラを持ち歩いていました。', photo: true, audio: true, video: true },
];

function RingContent() {
  const [stories, setStories] = useState(initialStories);
  const [openTheme, setOpenTheme] = useState('学生時代');
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [owner, setOwner] = useState(true);
  const [message, setMessage] = useState('');
  const selected = stories.find(story => story.id === selectedId);
  const themes = [...new Set(stories.map(story => story.theme))];

  const openStory = story => {
    setSelectedId(story.id);
    setEditing(false);
    setMenuOpen(false);
    setMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const goBack = () => {
    setEditing(false);
    setSelectedId(null);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const save = () => {
    if (!draft.trim()) return;
    setStories(previous => previous.map(story => story.id === selectedId ? { ...story, body: draft.trim() } : story));
    setEditing(false);
    setMessage('語りを更新しました。');
  };
  const toggleLock = () => {
    setStories(previous => previous.map(story => story.id === selectedId ? { ...story, locked: !story.locked } : story));
    setMenuOpen(false);
  };

  return <div className="fp-ring-review">
    <div className="fp-ring-review-switch" aria-label="表示権限の確認">
      <span>表示を確認</span>
      <button type="button" aria-pressed={owner} onClick={() => { setOwner(true); setSelectedId(null); }}>本人</button>
      <button type="button" aria-pressed={!owner} onClick={() => { setOwner(false); setSelectedId(null); }}>共有された家族</button>
    </div>
    {!selected ? <>
      <div className="fp-ring-review-heading"><div><h2>年輪</h2><p>語りを、テーマごとに読み返す。</p></div><span>{stories.filter(story => owner || !story.locked).length}つの語り</span></div>
      <div className="fp-ring-themes">{themes.map(theme => {
        const rows = stories.filter(story => story.theme === theme && (owner || !story.locked));
        if (!rows.length) return null;
        const opened = openTheme === theme;
        return <section className="fp-ring-theme" key={theme}>
          <button type="button" className="fp-ring-theme-toggle" aria-expanded={opened} onClick={() => setOpenTheme(opened ? '' : theme)}>
            <span><strong>{theme}</strong><small>{rows.length}つの語り</small></span><ChevronDown aria-hidden="true"/>
          </button>
          {opened && <div className="fp-ring-theme-rows">{rows.map(story => <button className="fp-ring-story-row" key={story.id} type="button" onClick={() => openStory(story)}>
            <span><strong>{story.locked && <LockKeyhole size={14} aria-label="自分だけ"/>}{story.question}</strong><small>{story.body}</small></span><ChevronRight aria-hidden="true"/>
          </button>)}</div>}
        </section>;
      })}</div>
      <button type="button" className="fp-ring-continue" onClick={() => setMessage('このプレビューではBOOK制作へ移動しません。')}>BOOKの制作を続ける <ChevronRight size={18}/></button>
      {message && <p className="fp-ring-message" role="status">{message}</p>}
    </> : <>
      <div className="fp-ring-detail-top"><button type="button" onClick={goBack}><ChevronLeft size={20}/>年輪へ</button><span>{selected.theme}</span>
        {owner && <div className="fp-ring-detail-menu"><button type="button" aria-label="語りの操作" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><Ellipsis/></button>
          {menuOpen && <div role="menu"><button type="button" role="menuitem" onClick={() => { setDraft(selected.body); setEditing(true); setMenuOpen(false); }}>語りを編集</button>
            <button type="button" role="menuitem" onClick={toggleLock}>{selected.locked ? 'ロックを外す' : '自分だけにロックする'}</button></div>}
        </div>}
      </div>
      {editing ? <div className="fp-ring-editor"><h2>{selected.question}</h2><label htmlFor="fp-ring-draft">語りの本文</label>
        <textarea id="fp-ring-draft" value={draft} onChange={event => setDraft(event.target.value)}/>
        <p>制作中は同じ語りがBOOKにも反映されます。完成後の追記は年輪に保存され、完成したBOOKの内容は変わりません。</p>
        <button type="button" className="fp-ring-save" disabled={!draft.trim()} onClick={save}>変更を保存する</button>
        <button type="button" className="fp-ring-cancel" onClick={() => setEditing(false)}>キャンセル</button>
      </div> : <article className="fp-ring-detail">
        <p className="fp-ring-detail-kicker">{selected.locked ? <><LockKeyhole size={16}/> 自分だけの語り</> : '家族と共有する語り'}</p>
        <h2>{selected.question}</h2><p className="fp-ring-detail-body">{selected.body}</p>
        {selected.photo && <div className="fp-ring-photo"><Image size={26}/><span>写真の表示位置</span></div>}
        {selected.audio && <div className="fp-ring-media"><Mic size={19}/><span>声を聴く</span><small>プレビューでは再生しません</small></div>}
        {selected.video && <div className="fp-ring-media"><Video size={19}/><span>動画を見る</span><small>プレビューでは再生しません</small></div>}
        {message && <p className="fp-ring-message" role="status">{message}</p>}
      </article>}
    </>}
  </div>;
}

export default function FamilyRingPreview() {
  const [tab, setTab] = useState('ring');
  return <div className="fp-ring-preview-shell">
    <p className="fp-ring-preview-banner"><BookOpen size={17}/>年輪UIの画面プレビュー ・ 架空データ ・ 保存はこの画面内のみ</p>
    <FamilyPersonPage person={{ id: 'preview-person', display_name: '森野 ひかり' }}
      activeTab={tab} onTabChange={setTab} onBack={() => setTab('ring')} onProfile={() => setTab('ring')}
      ringPreviewContent={<RingContent/>}/>
  </div>;
}
