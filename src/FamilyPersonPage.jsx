import React, { useEffect, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, LockKeyhole, Plus, UserRound } from 'lucide-react';
import FamilyAvatar from './FamilyAvatar.jsx';
import WebBookCover, { publicationCoverImageUrl } from './WebBookCover.jsx';
import { currentPersonAge } from './lib/personAge.js';
import './family-person-page.css';

const hasAnswer = row => Boolean(row.body || row.transcript_raw || row.media_count);
const bookDate = value => value ? new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric', month: 'long', timeZone: 'Asia/Tokyo',
}).format(new Date(value)) : '';

function PublishedBookThumbnail({ book, supabaseClient }) {
  const [publication, setPublication] = useState(null);
  const [coverUrl, setCoverUrl] = useState('');
  useEffect(() => {
    let live = true;
    setPublication(null);
    setCoverUrl('');
    (async () => {
      let accessToken = '';
      try { accessToken = JSON.parse(localStorage.getItem(`tateyoko.voice.${book.public_id}.access.v1`) || '{}').token || ''; }
      catch { /* The reader also treats an unreadable cached token as absent. */ }
      const { data, error } = await supabaseClient.functions.invoke('public-voice', {
        body: { publicId: book.public_id, accessToken },
      });
      if (!live || error || !data?.success || !data.publication) return;
      setPublication(data.publication);
      if (!data.publication.hasCover) return;
      const asset = await supabaseClient.functions.invoke('public-voice', {
        body: { action: 'asset', publicId: book.public_id, kind: 'cover', accessToken },
      });
      if (live && !asset.error && asset.data?.success) setCoverUrl(asset.data.asset?.url || '');
    })().catch(() => {});
    return () => { live = false; };
  }, [book.public_id, supabaseClient]);
  const cover = { title: book.title || '人生の物語', subtitle: book.subtitle || '',
    subjectName: book.subject_name || '', ...publication,
    coverImageUrl: publicationCoverImageUrl(book.public_id) };
  return <div className="fp-person-book-cover-art wb" role="img" aria-label={`${cover.title}の表紙`}>
    <div aria-hidden="true"><WebBookCover publication={cover} coverUrl={coverUrl}/></div>
  </div>;
}

export default function FamilyPersonPage({ person, stories = [], books = [], booksStatus = 'ready',
  facts = [], questions = [], activeTab = 'ring', onTabChange, onBack, onProfile,
  onOpenStory, onAddFact, onRetryBooks, supabaseClient, busy = false }) {
  const [showQuestions, setShowQuestions] = useState(false);
  const saved = stories.filter(hasAnswer);
  const timeline = [...facts];
  const age = currentPersonAge(person);
  return <main className="fp-person-page">
    <header className="fp-person-topbar">
      <button type="button" onClick={onBack} aria-label="家族ホームへ戻る"><ChevronLeft/></button>
      <strong>{person.display_name}さん</strong><span aria-hidden="true"/>
    </header>
    <section className="fp-person-intro">
      <div className="fp-person-portrait" aria-label={person.portrait_url ? undefined : 'プロフィール写真未登録'}>
        <FamilyAvatar person={person}/>
      </div>
      <div className="fp-person-intro-copy">
        <div className="fp-person-name-line"><h1>{person.display_name}</h1>
          {age !== null && <span className="fp-person-age">{age}歳</span>}</div>
        {(person.birth_year || person.death_year) && <p className="fp-person-dates">
          {person.birth_year ? `${person.birth_year}年${person.birth_month ? `${person.birth_month}月${person.birth_day ? `${person.birth_day}日` : ''}` : ''}生まれ` : '生年未登録'}
          {person.death_year ? `・${person.death_year}年逝去` : ''}</p>}
        {person.notes && <p className="fp-person-bio">{person.notes}</p>}
      </div>
    </section>
    <button type="button" className="fp-person-profile" onClick={onProfile}><UserRound aria-hidden="true"/>プロフィールを見る・編集する<ChevronRight aria-hidden="true"/></button>
    <div className="fp-person-tabs" role="tablist" aria-label="人物ページ">
      {[['ring','年輪'],['books','本棚'],['memories','思い出'],['timeline','年表']].map(([key,label]) =>
        <button type="button" key={key} role="tab" aria-selected={activeTab===key}
          onClick={() => onTabChange(key)}>{label}</button>)}
    </div>
    {activeTab === 'ring' && <section className="fp-person-content" role="tabpanel">
      <h2>年輪</h2><p className="fp-person-section-note">人生の語りを、少しずつ残していく場所です。</p>
      {saved.length ? <div className="fp-person-stories">{saved.map(row =>
        <button type="button" className="fp-person-story" key={row.id}
          onClick={() => onOpenStory(questions[row.question_slot-1])}>
          <BookOpen aria-hidden="true"/><span><strong>{row.visibility === 'private' && <LockKeyhole size={13} aria-label="自分だけ"/>}{row.question_text}</strong></span><ChevronRight aria-hidden="true"/>
        </button>)}</div> : <div className="fp-person-story-empty">まだ語りはありません。<br/>声・文章・写真から、好きな方法で始められます。</div>}
      <button type="button" className="fp-person-add-story" onClick={() => setShowQuestions(current => !current)}>
        <Plus aria-hidden="true"/>{saved.length ? '新しい語りを追加する' : '最初の語りを残す'}</button>
      {showQuestions && <div className="fp-person-questions" aria-label="無料3問">
        {questions.map(question => <button type="button" key={question.id} disabled={busy}
          onClick={() => onOpenStory(question)}>{question.slot}問目：{question.text}<ChevronRight aria-hidden="true"/></button>)}
        <p>質問文は暫定です。</p>
      </div>}
    </section>}
    {activeTab === 'books' && <section className="fp-person-content" role="tabpanel">
      <h2>本棚</h2>
      {booksStatus === 'loading' ? <p className="fp-person-story-empty" role="status">本棚を読み込んでいます。</p>
        : booksStatus === 'error' ? <div className="fp-person-story-empty" role="alert">本棚を読み込めませんでした。<button type="button" onClick={onRetryBooks}>もう一度試す</button></div>
        : books.length ? <div className="fp-person-books">{books.map(book =>
          <article className="fp-person-book" key={book.publication_id}>
            <PublishedBookThumbnail book={book} supabaseClient={supabaseClient}/>
            <div className="fp-person-book-copy"><strong>{book.title || '人生の物語'}</strong>
              {book.subtitle && <small>{book.subtitle}</small>}
              {book.published_at && <time>{bookDate(book.published_at)} 公開</time>}
              <a href={`/?voice=${encodeURIComponent(book.public_id)}`}>Webブックを読む<ChevronRight aria-hidden="true"/></a>
            </div>
          </article>)}</div>
          : <div className="fp-person-story-empty">この人物の完成したBOOKは、まだありません。</div>}
    </section>}
    {activeTab === 'memories' && <section className="fp-person-content" role="tabpanel">
      <h2>思い出</h2><div className="fp-person-story-empty">この人物の思い出は、まだありません。</div>
    </section>}
    {activeTab === 'timeline' && <section className="fp-person-content" role="tabpanel">
      <h2>年表</h2>
      {timeline.length ? <div className="fp-person-timeline">{timeline.map(item =>
        <article key={item.id} className="fp-person-event">
          <time>{item.year ? `${item.year}年${item.month ? item.month+'月' : ''}${item.day ? item.day+'日' : ''}` : '時期未登録'}</time>
          <strong>{item.label}</strong>{item.detail && <p>{item.detail}</p>}
        </article>)}</div> : <div className="fp-person-story-empty">プロフィールに登録した出来事が、ここに時系列で並びます。</div>}
      <button type="button" className="fp-person-add-story" onClick={onAddFact}><Plus aria-hidden="true"/>出来事を登録する</button>
    </section>}
  </main>;
}
