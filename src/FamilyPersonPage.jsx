import React, { useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, LockKeyhole, Plus, UserRound } from 'lucide-react';
import './family-person-page.css';

const hasAnswer = row => Boolean(row.body || row.transcript_raw || row.media_count);

export default function FamilyPersonPage({ person, stories = [], facts = [], questions = [],
  activeTab = 'life', onTabChange, onBack, onProfile, onOpenStory, onAddFact, busy = false }) {
  const [showQuestions, setShowQuestions] = useState(false);
  const saved = stories.filter(hasAnswer);
  const timeline = [...facts];
  return <main className="fp-person-page">
    <header className="fp-person-topbar">
      <button type="button" onClick={onBack} aria-label="家族ホームへ戻る"><ChevronLeft/></button>
      <strong>{person.display_name}さん</strong><span aria-hidden="true"/>
    </header>
    <section className="fp-person-intro">
      <div className="fp-person-portrait" aria-label="プロフィール写真未登録">
        {person.portrait_url ? <img src={person.portrait_url} alt={`${person.display_name}さんの写真`}/>
          : <UserRound aria-hidden="true"/>}
      </div>
      <div className="fp-person-intro-copy">
        <h1>{person.display_name}</h1>
        {(person.birth_year || person.death_year) && <p className="fp-person-dates">
          {person.birth_year ? `${person.birth_year}年生まれ` : '生年未登録'}
          {person.death_year ? `・${person.death_year}年逝去` : ''}</p>}
        {person.notes && <p className="fp-person-bio">{person.notes}</p>}
      </div>
    </section>
    <button type="button" className="fp-person-profile" onClick={onProfile}><UserRound aria-hidden="true"/>プロフィールを見る・編集する<ChevronRight aria-hidden="true"/></button>
    <div className="fp-person-tabs" role="tablist" aria-label="人物ページ">
      {[['life','人生'],['memories','思い出'],['timeline','年表']].map(([key,label]) =>
        <button type="button" key={key} role="tab" aria-selected={activeTab===key}
          onClick={() => onTabChange(key)}>{label}</button>)}
    </div>
    {activeTab === 'life' && <section className="fp-person-content" role="tabpanel">
      <div className="fp-person-book-empty"><span className="fp-person-book-icon"><BookOpen/></span>
        <div><strong>人生の物語</strong><small>この人物ページで、語りを少しずつ残せます。</small></div></div>
      <h2>人生の語り</h2>
      {saved.length ? <div className="fp-person-stories">{saved.map(row =>
        <button type="button" className="fp-person-story" key={row.id}
          onClick={() => onOpenStory(questions[row.question_slot-1])}>
          <BookOpen aria-hidden="true"/><span><strong>{row.question_text}</strong><small>{row.visibility === 'private' && <LockKeyhole size={12} aria-label="自分だけ"/>}保存した語りを見る</small></span><ChevronRight aria-hidden="true"/>
        </button>)}</div> : <div className="fp-person-story-empty">まだ語りはありません。<br/>声・文章・写真から、好きな方法で始められます。</div>}
      <button type="button" className="fp-person-add-story" onClick={() => setShowQuestions(current => !current)}>
        <Plus aria-hidden="true"/>{saved.length ? '新しい語りを追加する' : '最初の語りを残す'}</button>
      {showQuestions && <div className="fp-person-questions" aria-label="無料3問">
        {questions.map(question => <button type="button" key={question.id} disabled={busy}
          onClick={() => onOpenStory(question)}>{question.slot}問目：{question.text}<ChevronRight aria-hidden="true"/></button>)}
        <p>質問文は暫定です。</p>
      </div>}
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
