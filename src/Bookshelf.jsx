import React, { useId, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, UserRound } from 'lucide-react';
import { chronologicalBooks, formatBookMonth } from './lib/bookshelf.js';
import './bookshelf.css';

export function BookCover({ book, className = '' }) {
  return <div className={`bs-cover ${className}`} data-book-id={book.id} style={{ '--book-color': book.color || '#d6dcc5' }}>
    <div className="bs-cover-content"><div className="bs-cover-title">{book.title}</div>{book.subtitle && <div className="bs-cover-subtitle">{book.subtitle}</div>}
      {book.photo && <div className="bs-cover-photo"><img src={book.photo.src} alt="" loading="lazy" style={book.photo.crop ? { position: 'absolute', maxWidth: 'none', height: 'auto', ...book.photo.crop } : undefined} /></div>}
      <time className="bs-cover-date" dateTime={book.publishedAt || undefined}>{formatBookMonth(book.publishedAt)}</time>
    </div>
  </div>;
}

export function BookStack({ books }) {
  return <div className="bs-stack" aria-hidden="true" data-count={books.length}>
    {books.slice(0, 3).map((book, i) => <div className={`bs-stack-layer ${i === 0 ? 'bs-stack-front' : ''}`} key={book.id} style={{ '--stack-index': i, zIndex: 3 - i }}><BookCover book={book} /></div>)}
  </div>;
}

function PersonRow({ person, onOpen, passive }) {
  const contents = <><span className="bs-avatar">{person.avatar ? <img src={person.avatar} alt="" /> : <UserRound aria-hidden="true" size={27} strokeWidth={1.2} />}</span>
    <span className="bs-person-copy"><span className="bs-person-name">{person.name}</span><span className="bs-person-count">{person.books.length}冊</span>{person.note && <span className="bs-person-note">{person.note}</span>}</span>
    <BookStack books={person.books} /><ChevronRight className="bs-chevron" size={21} strokeWidth={1.2} aria-hidden="true" /></>;
  return passive ? <div className="bs-person-row" data-person-id={person.id}>{contents}</div>
    : <button className="bs-person-row" data-person-id={person.id} onClick={() => onOpen(person)} aria-label={`${person.name}の本棚、${person.books.length}冊`}>{contents}</button>;
}

function BookGrid({ books, onOpen, passive }) {
  return <div className="bs-book-grid">{chronologicalBooks(books).map(book => <div className="bs-book-slot" key={book.id}>
    {passive ? <BookCover book={book} /> : <button className="bs-book-open" onClick={() => onOpen(book)} aria-label={`${book.title}、${formatBookMonth(book.publishedAt)}のWebブックを開く`}><BookCover book={book} /></button>}
  </div>)}</div>;
}

// The same UI is interactive in the app and a non-clickable exhibit in conversion.
export default function Bookshelf({ ownBooks = [], familyPeople = [], initialTab = 'own', passive = false, onOpenBook, renderBookDetails }) {
  const [tab, setTab] = useState(initialTab), [person, setPerson] = useState(null), [book, setBook] = useState(null);
  const id = useId(), heading = useRef(null), tabs = useRef([]);
  const focusHeading = () => requestAnimationFrame(() => heading.current?.focus());
  const openBook = selected => { if (onOpenBook) onOpenBook(selected); else { setBook(selected); focusHeading(); } };
  const selectTab = value => { setTab(value); setPerson(null); setBook(null); };
  const title = book ? book.title : person ? person.name : '本棚';
  const panel = <div className="bs-wood">
    {book ? <div className="bs-book-detail"><BookCover book={book} /><p>{book.subtitle}</p><p>{formatBookMonth(book.publishedAt)}</p>{renderBookDetails ? renderBookDetails(book) : <p className="bs-demo-note">確認用の架空のWebブックです。</p>}</div>
      : person ? <><p className="bs-person-detail-count">{person.books.length}冊</p><BookGrid books={person.books} onOpen={openBook} passive={passive} /></>
      : tab === 'own' ? ownBooks.length ? <BookGrid books={ownBooks} onOpen={openBook} passive={passive} /> : <p className="bs-empty">完成したWebブックが、ここに並びます。</p>
      : familyPeople.length ? <div className="bs-person-list">{familyPeople.map(p => <PersonRow key={p.id} person={p} passive={passive} onOpen={p => { setPerson(p); focusHeading(); }} />)}</div> : <p className="bs-empty">ご家族から共有されたWebブックが、ここに並びます。</p>}
  </div>;
  return <div className={`bs-root ${passive ? 'bs-passive' : ''}`}>
    <header className="bs-header">
      {(person || book) && <button className="bs-back" onClick={() => { if (book) setBook(null); else setPerson(null); focusHeading(); }} aria-label={book ? '本の一覧へ戻る' : '家族の本棚へ戻る'}><ChevronLeft size={21} /></button>}
      <h2 ref={heading} tabIndex={-1}>{title}</h2>
      {!person && !book && (passive ? <div className="bs-tabs bs-tab-labels"><span data-active={tab === 'own'}>わたしの本棚</span><span data-active={tab === 'family'}>家族の本棚</span></div>
        : <div className="bs-tabs" role="tablist" aria-label="本棚の切り替え">{[['own', 'わたしの本棚'], ['family', '家族の本棚']].map(([value, label], index) => <button key={value} ref={el => tabs.current[index] = el} id={`${id}-${value}`} role="tab" aria-selected={tab === value} aria-controls={`${id}-panel`} tabIndex={tab === value ? 0 : -1} data-active={tab === value} onClick={() => selectTab(value)} onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? 1 : 1-index; selectTab(next ? 'family' : 'own'); tabs.current[next]?.focus(); } }}>{label}</button>)}</div>)}
    </header>
    {!person && !book && !passive ? <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`}>{panel}</div> : panel}
  </div>;
}
