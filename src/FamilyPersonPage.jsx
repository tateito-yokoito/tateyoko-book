import React, { useEffect, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, LockKeyhole, Plus, UserRound } from 'lucide-react';
import FamilyAvatar from './FamilyAvatar.jsx';
import FamilyRingContent from './FamilyRingContent.jsx';
import WebBookCover, { publicationCoverImageUrl } from './WebBookCover.jsx';
import { currentPersonAge } from './lib/personAge.js';
import './family-person-page.css';

const hasAnswer = row => Boolean(row.body || row.transcript_raw || row.media_count);
const bookDate = value => value ? new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric', month: 'long', timeZone: 'Asia/Tokyo',
}).format(new Date(value)) : '';

function PublishedBookThumbnail({ book, supabaseClient, preloadedPublication = null }) {
  const [publication, setPublication] = useState(preloadedPublication);
  const [coverUrl, setCoverUrl] = useState('');
  useEffect(() => {
    let live = true;
    setPublication(preloadedPublication);
    setCoverUrl('');
    if (preloadedPublication) return undefined;
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
  }, [book.public_id, supabaseClient, preloadedPublication]);
  const cover = { title: book.title || '人生の物語', subtitle: book.subtitle || '',
    subjectName: book.subject_name || '', ...publication,
    coverImageUrl: publicationCoverImageUrl(book.public_id) };
  return <div className="fp-person-book-cover-art wb" role="img" aria-label={`${cover.title}の表紙`}>
    <div aria-hidden="true"><WebBookCover publication={cover} coverUrl={coverUrl}/></div>
  </div>;
}

export default function FamilyPersonPage({ person, stories = [], bookStories = [], books = [], booksStatus = 'ready',
  memories = [], onAddMemory = null,
  publishedPublication = null, publicDemo = false,
  visibleBookProjects = [], projectsStatus = 'ready',
  facts = [], questions = [], activeTab = 'ring', onTabChange, onBack, onProfile,
  onOpenStory, onAddFact, onRetryBooks, supabaseClient, busy = false,
  backLabel = 'ホーム', entryOrigin = 'home', onOpenBook = null, onResumeBook = null,
  ringPreviewContent = null, ringStories = null, ringCanEdit = false,
  onSaveRingStory = null, onLockRingStory = null, onLoadRingMedia = null,
  onLoadRingListPhotos = null,
  onAddRingPhoto = null, onAddRingVoice = null, onPolishRingStory = null }) {
  const [showQuestions, setShowQuestions] = useState(false);
  const [ringDetailOpen, setRingDetailOpen] = useState(false);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const saved = stories.filter(hasAnswer);
  const savedCount = saved.length + bookStories.length;
  const publishedChapters = new Map();
  for (const item of publishedPublication?.items || []) {
    const title = item.chapterTitle || 'その他の語り';
    if (!publishedChapters.has(title)) publishedChapters.set(title, []);
    publishedChapters.get(title).push(item);
  }
  const timeline = [...facts];
  const age = currentPersonAge(person);
  const purchasedProject = visibleBookProjects.find(project =>
    ['paid','gifted','legacy'].includes(project.access_status));
  const resume = purchasedProject && onResumeBook
    ? () => onResumeBook(purchasedProject.id) : null;
  return <main className={`fp-person-page${ringDetailOpen && activeTab === 'ring' ? ' fp-person-page-detail' : ''}`}>
    <header className="fp-person-topbar">
      <button type="button" onClick={onBack} aria-label={`${backLabel}へ戻る`}><ChevronLeft/><span>{backLabel}</span></button>
      {ringDetailOpen && activeTab === 'ring' ? <span className="fp-person-compact-identity"><span className="fp-person-compact-avatar"><FamilyAvatar person={person}/></span><strong>{person.display_name}</strong></span> : <strong>人物ページ</strong>}<span aria-hidden="true"/>
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
      <button type="button" className="fp-person-profile" onClick={onProfile} aria-label="プロフィールを見る・編集する"><UserRound aria-hidden="true"/><span>編集</span></button>
    </section>
    {booksStatus === 'ready' && books.length > 1 && <div className="fp-book-preview-entry">
      <button type="button" onClick={() => onTabChange('books')}>本棚でBOOKを選ぶ<ChevronRight aria-hidden="true"/></button>
    </div>}
    {booksStatus === 'ready' && books.length === 1 && <div className="fp-book-preview-entry">
      <button type="button" onClick={() => onTabChange('books')}>完成したBOOKを見る<ChevronRight aria-hidden="true"/></button>
    </div>}
    {booksStatus === 'ready' && projectsStatus === 'ready' && !books.length && resume && <div className="fp-book-preview-entry">
      <button className="fp-book-preview-button" type="button" onClick={() => setShowResumeDialog(true)}>BOOK制作を再開する<ChevronRight aria-hidden="true"/></button>
    </div>}
    {onOpenBook && booksStatus === 'ready' && projectsStatus === 'ready' && !books.length && !purchasedProject && <div className="fp-book-preview-entry">
      <button type="button" onClick={() => onOpenBook('person')}>この人の人生を本にする<ChevronRight aria-hidden="true"/></button>
    </div>}
    <div className="fp-person-tabs" role="tablist" aria-label="人物ページ">
      {[['ring','年輪'],['books','本棚'],['memories','思い出'],['timeline','年表']].map(([key,label]) =>
        <button type="button" key={key} role="tab" aria-selected={activeTab===key}
          onClick={() => { setRingDetailOpen(false); onTabChange(key); }}>{label}</button>)}
    </div>
    {activeTab === 'ring' && <section className="fp-person-content" role="tabpanel">
      {ringPreviewContent || (ringStories && <FamilyRingContent key={person.id} stories={ringStories}
        onDetailChange={setRingDetailOpen}
        canEdit={ringCanEdit} onSave={ringCanEdit ? onSaveRingStory : null}
        onLock={ringCanEdit ? onLockRingStory : null} onLoadMedia={onLoadRingMedia}
        onLoadListPhotos={onLoadRingListPhotos}
        onAddPhoto={ringCanEdit ? onAddRingPhoto : null}
        onAddVoice={ringCanEdit ? onAddRingVoice : null}
        onPolish={ringCanEdit ? onPolishRingStory : null}
        onAddStory={onOpenStory} questions={questions}/>) || <>
      <h2>年輪</h2><p className="fp-person-section-note">人生の語りを、少しずつ残していく場所です。</p>
      {!questions.length && !savedCount ? <div className="fp-person-story-empty">年輪の体験は、次の段階で公開します。</div>
      : savedCount ? <div className="fp-person-stories">{saved.map(row =>
        <button type="button" className="fp-person-story" key={row.id}
          onClick={() => onOpenStory(questions[row.question_slot-1])}>
          <BookOpen aria-hidden="true"/><span><strong>{row.visibility === 'private' && <LockKeyhole size={13} aria-label="自分だけ"/>}{row.question_text}</strong></span><ChevronRight aria-hidden="true"/>
        </button>)}{bookStories.map(row =>
        <button type="button" className="fp-person-story" key={`book-${row.id}`}
          onClick={() => onResumeBook?.(row.book_project_id)}
          aria-label={`${row.question_text}。BOOK制作で開く`}>
          <BookOpen aria-hidden="true"/><span><strong>{row.visibility === 'private' && <LockKeyhole size={13} aria-label="自分だけ"/>}{row.question_text}</strong><small className="fp-person-story-excerpt">{row.body}</small></span><ChevronRight aria-hidden="true"/>
        </button>)}</div> : <div className="fp-person-story-empty">まだ語りはありません。<br/>声・文章・写真から、好きな方法で始められます。</div>}
      {questions.length > 0 && <button type="button" className="fp-person-add-story" onClick={() => setShowQuestions(current => !current)}>
        <Plus aria-hidden="true"/>{savedCount ? '新しい語りを追加する' : '最初の語りを残す'}</button>}
      {questions.length > 0 && showQuestions && <div className="fp-person-questions" aria-label="無料3問">
        {questions.map(question => <button type="button" key={question.id} disabled={busy}
          onClick={() => onOpenStory(question)}>{question.slot}問目：{question.text}<ChevronRight aria-hidden="true"/></button>)}
        <p>質問文は暫定です。</p>
      </div>}
      {publishedChapters.size > 0 && <section className="fp-published-ring" aria-label="完成BOOKから残された語り">
        <h2>完成BOOKから</h2>
        <p className="fp-person-section-note">完成したBOOKの語りを、テーマごとに振り返れます。</p>
        {[...publishedChapters].map(([title, items]) => <details className="fp-published-chapter" key={title}>
          <summary><span>{title}</span><small>{items.length}つの語り</small></summary>
          <div className="fp-published-chapter-stories">{items.map(item => <details key={item.order}>
            <summary>{item.question || '人生の語り'}</summary>
            {item.transcript && <p>{item.transcript}</p>}
            {(item.audio?.length > 0 || item.photos?.length > 0) &&
              <small>{item.audio?.length > 0 ? '声' : ''}{item.audio?.length > 0 && item.photos?.length > 0 ? '・' : ''}{item.photos?.length > 0 ? '写真' : ''}はWebブックで見られます。</small>}
          </details>)}</div>
        </details>)}
        <a href={`/?voice=${encodeURIComponent(books[0].public_id)}&demo_return=books`}>完成Webブックを開く<ChevronRight aria-hidden="true"/></a>
      </section>}
      </>}
    </section>}
    {activeTab === 'books' && <section className="fp-person-content" role="tabpanel">
      <h2>この人のBOOK</h2>
      {booksStatus === 'loading' ? <p className="fp-person-story-empty" role="status">本棚を読み込んでいます。</p>
        : booksStatus === 'error' ? <div className="fp-person-story-empty" role="alert">本棚を読み込めませんでした。<button type="button" onClick={onRetryBooks}>もう一度試す</button></div>
        : books.length ? <div className="fp-person-books">{books.map(book =>
          <article className="fp-person-book" key={book.publication_id}>
            <PublishedBookThumbnail book={book} supabaseClient={supabaseClient}
              preloadedPublication={publicDemo && book.public_id === books[0]?.public_id ? publishedPublication : null}/>
            <div className="fp-person-book-copy"><strong>{book.title || '人生の物語'}</strong>
              {book.subtitle && <small>{book.subtitle}</small>}
              {book.published_at && <time>{bookDate(book.published_at)} 公開</time>}
              <a href={publicDemo
                ? `/?voice=${encodeURIComponent(book.public_id)}&demo_return=books`
                : `/?voice=${encodeURIComponent(book.public_id)}`}>
                Webブックを読む<ChevronRight aria-hidden="true"/></a>
            </div>
          </article>)}</div>
          : <div className="fp-person-story-empty">{purchasedProject ? '制作中のBOOKがあります。上の「BOOK制作を再開する」から続きを開けます。' : '完成したBOOKはまだありません。これから、この人の物語を一冊にしていけます。'}
              {!purchasedProject && projectsStatus === 'ready' && onOpenBook && <button type="button" className="fp-person-add-story" onClick={() => onOpenBook('books')}>人生のBOOKについて見る<ChevronRight aria-hidden="true"/></button>}
            </div>}
    </section>}
    {activeTab === 'memories' && <section className="fp-person-content" role="tabpanel">
      <h2>写真と思い出</h2>
      {memories.length ? <div className="fp-person-memories">{memories.map(item =>
        <article className="fp-person-memory" key={item.id}>
          <img src={item.photo_url} alt={item.title || '思い出の写真'}/>
          <div>{item.event_date && <time>{item.event_date}</time>}
            {item.title && <strong>{item.title}</strong>}
            {item.comment && <p>{item.comment}</p>}</div>
        </article>)}</div>
        : <div className="fp-person-story-empty">これからの思い出を、写真と一緒に残せます。<br/>一枚の写真から、家族の会話が始まります。</div>}
      {onAddMemory && <button type="button" className="fp-person-add-story" onClick={onAddMemory}>
        <Plus aria-hidden="true"/>写真と思い出を残す</button>}
    </section>}
    {activeTab === 'timeline' && <section className="fp-person-content" role="tabpanel">
      <h2>人生の年表</h2>
      {timeline.length ? <div className="fp-person-timeline">{timeline.map(item =>
        <article key={item.id} className="fp-person-event">
          <time>{item.year ? `${item.year}年${item.month ? item.month+'月' : ''}${item.day ? item.day+'日' : ''}` : '時期未登録'}</time>
          <strong>{item.label}</strong>{item.detail && <p>{item.detail}</p>}
        </article>)}</div> : <div className="fp-person-story-empty">生まれた年や家族との出来事から、年表が育っていきます。<br/>思い出したことから少しずつ残せます。</div>}
      <button type="button" className="fp-person-add-story" onClick={onAddFact}><Plus aria-hidden="true"/>出来事を登録する</button>
    </section>}
    {showResumeDialog && <div className="fp-resume-dialog-backdrop" onClick={() => setShowResumeDialog(false)}>
      <section className="fp-resume-dialog" role="dialog" aria-modal="true" aria-labelledby="fp-resume-dialog-title"
        onClick={event => event.stopPropagation()}>
        <h2 id="fp-resume-dialog-title">BOOK制作を再開しますか？</h2>
        <p>別ウィンドウでBOOK制作ホームを開きます。</p>
        <div className="fp-resume-dialog-actions">
          <button type="button" onClick={() => { setShowResumeDialog(false); resume?.(); }}>はい</button>
          <button type="button" onClick={() => setShowResumeDialog(false)}>戻る</button>
        </div>
      </section>
    </div>}
  </main>;
}
