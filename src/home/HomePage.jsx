import React, { useEffect, useState } from 'react';
import { ArrowRight, ChevronRight, Image, BookOpen, Files, Settings, Users } from 'lucide-react';
import { HOME_COPY } from './homeModel.js';
import './home.css';

function HomeSky({ sky }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [sky?.id]);
  return <header className="home-sky" data-sky={sky?.id || 'fallback'}>
    {sky && !failed && <img src={sky.src} srcSet={sky.srcSet} sizes="(max-width: 480px) 100vw, 480px" alt="" width="960" height="640" fetchPriority="high" onError={() => setFailed(true)} style={{ objectPosition: sky.position || '50% 65%' }} />}
    <div className="home-sky-shade" />
  </header>;
}

function QuietRow({ icon: Icon, title, onClick, count }) {
  return <button className="home-row" onClick={onClick} type="button">
    <Icon size={20} strokeWidth={1.4} aria-hidden="true" />
    <span className="home-row-copy"><span className="home-row-title">{title}</span></span>
    {count != null && <span className="home-count" aria-label={`${count}件の語り`}>{count}</span>}<ChevronRight size={17} strokeWidth={1.3} aria-hidden="true" />
  </button>;
}

function Primary({ children, onClick }) {
  return <button className="home-primary" onClick={onClick} type="button">{children}<ArrowRight size={19} strokeWidth={1.4} aria-hidden="true" /></button>;
}

function CurrentJourney({ model, onAction }) {
  const phase = model.phase, copy = {...(HOME_COPY[phase] || HOME_COPY.beginning), ...model.copy};
  const isMaking = phase === 'finishing', isComplete = phase === 'complete';
  return <section className={`home-journey home-journey-${phase}`} aria-labelledby="home-journey-title">
    {copy.eyebrow && <p className="home-eyebrow">{copy.eyebrow}</p>}
    <div className="home-journey-content">
      {isMaking && <img className="home-work-thumb" src={model.cover} alt="" width="90" height="127" />}
      <div className={!isMaking && !isComplete ? 'home-theme-summary' : undefined}><h1 id="home-journey-title">{copy.title || model.theme.label}</h1><p className="home-description">{copy.description}</p></div>
    </div>
    <Primary onClick={() => onAction(isMaking ? 'book' : isComplete ? 'ownShelf' : 'question')}>{copy.action}</Primary>
    {!isMaking && !isComplete && <p className="home-progress"><span aria-label={`${model.theme.total}問中${model.theme.answered}問回答済み`}>{model.theme.answered} / {model.theme.total}</span>{model.theme.order != null && <span aria-label={`9テーマ中${model.theme.order}番目`}>{model.theme.order} / 9</span>}</p>}
  </section>;
}

function StoriesSummary({ count, onAction }) {
  return <div className="home-stories">
    <QuietRow icon={Files} title="これまでの語り" count={count} onClick={() => onAction('stories')} />
  </div>;
}

function BookJourney({ onAction }) {
  return <div className="home-book">
    <QuietRow icon={BookOpen} title="本にまとめる" onClick={() => onAction('book')} />
  </div>;
}

// Pure view with callbacks: no Supabase, payment, recorder or permission side effects.
// Production adapters will supply authorized Person-scoped data after review.
export default function HomePage({ model, sky, onAction }) {
  const complete = model.phase === 'complete';
  return <main className="home-v2" data-phase={model.phase}>
    <HomeSky sky={sky} />
    <div className="home-body">
      <CurrentJourney model={model} onAction={onAction} />
      {complete ? <>
        <QuietRow icon={BookOpen} title="家族の本棚" onClick={() => onAction('familyShelf')} />
        <section className="home-seasonal"><h2 className="home-eyebrow">季節の問い</h2>
          {model.seasonalQuestion ? <><h3>{model.seasonalQuestion}</h3><button className="home-text-action" onClick={() => onAction('seasonal')} type="button">この問いから語る<ArrowRight size={17} aria-hidden="true" /></button><p className="home-note">問いはここに残ります。話したくなったときに。</p></> : <p>次の問いが届くまで、<br />残した物語をゆっくりと。</p>}
        </section><StoriesSummary count={model.storyCount} onAction={onAction} />
      </> : <>
        <QuietRow icon={Image} title="写真から語る" onClick={() => onAction('photo')} />
        <StoriesSummary count={model.storyCount} onAction={onAction} />
        {model.phase === 'finishing' ? <QuietRow icon={Files} title="もう少し、問いから辿る" onClick={() => onAction('question')} /> : <BookJourney onAction={onAction} />}
      </>}
      <footer className="home-utilities" aria-label="その他の機能">
        <button onClick={() => onAction('questions')} type="button">問いの一覧</button>
        <button onClick={() => onAction('family')} type="button"><Users size={16} aria-hidden="true" />家族とのつながり</button>
        <button onClick={() => onAction('settings')} type="button"><Settings size={16} aria-hidden="true" />設定</button>
      </footer>
    </div>
  </main>;
}
