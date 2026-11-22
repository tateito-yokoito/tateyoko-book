import React from 'react';
import { Bell, BookOpen, ChevronRight, Home, Image, Network, Plus, Settings, Users } from 'lucide-react';
import './family-place-home.css';

/** The same home is used by the authenticated app and its isolated visual review. */
export default function FamilyHome({ people = [], storyCounts = {}, onAddPerson, onOpenPerson }) {
  const hasStories = people.some(person => Number(storyCounts[person.id]) > 0);
  return <div className="fp-home-shell">
    <header className="fp-home-header">
      <span className="fp-home-brand"><Home aria-hidden="true"/>縦糸∞横糸</span>
      <span className="fp-home-header-icons" aria-hidden="true"><Bell/><Settings/></span>
    </header>
    <main className="fp-home-main">
      <section className="fp-home-hero" aria-label="家族のチカラは、人生を照らす。">
        <h1>家族のチカラは、<br/>人生を照らす。</h1>
      </section>
      <section className="fp-home-content" aria-label="家族の人生の物語">
        <h2>家族の人生の物語</h2>
        <div className="fp-home-book-empty">
          <div className="fp-home-book-shape" aria-hidden="true"><BookOpen/></div>
          <div><strong>{hasStories ? '家族の語りが集まりはじめました' : '家族の人生の物語は、これから'}</strong>
            <p>{hasStories ? '人物ページから、残した語りを読み返せます。' : '大切な人を登録すると、ここから物語が始まります。'}</p></div>
        </div>
        <button type="button" className="fp-home-primary" onClick={onAddPerson}><Plus aria-hidden="true"/>自分・家族を登録する</button>
        <div className="fp-home-shortcuts" aria-label="これから使える家族の機能">
          <div><Network aria-hidden="true"/><strong>家系図</strong><small>準備中</small></div>
          <div><BookOpen aria-hidden="true"/><strong>家族年表</strong><small>準備中</small></div>
          <div><Image aria-hidden="true"/><strong>家族の思い出</strong><small>準備中</small></div>
        </div>
        <h2 className="fp-home-people-title">家族の人たち</h2>
        {people.length ? <div className="fp-home-people-list">{people.map(person =>
          <button type="button" className="fp-home-person" key={person.id} onClick={() => onOpenPerson(person.id)}>
            <span className="fp-home-avatar" aria-hidden="true">{person.display_name.slice(0, 1)}</span>
            <span className="fp-home-person-copy"><strong>{person.display_name}</strong><small>{storyCounts[person.id]
              ? `人生の語り ${storyCounts[person.id]}件` : '人物ページを見る'}</small></span>
            <ChevronRight aria-hidden="true"/>
          </button>)}</div> : <p className="fp-home-people-empty">まだ家族は登録されていません。<br/>自分か家族を一人登録して、家族の場所を始めましょう。</p>}
      </section>
    </main>
  </div>;
}

export function FamilyHomeNav({ onHome, onStories, onFamily }) {
  return <nav className="fp-home-nav" aria-label="家族の場所">
    <button type="button" className="is-active" onClick={onHome}><Home/>ホーム</button>
    <button type="button" onClick={onStories}><BookOpen/>人生の物語</button>
    <button type="button" onClick={onFamily}><Users/>家族</button>
    <button type="button" disabled><Image/>思い出</button>
  </nav>;
}
