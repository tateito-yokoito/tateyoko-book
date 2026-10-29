import React, { useState } from 'react';
import { ChevronLeft, ArrowRight, Check } from 'lucide-react';
import { selectedMoreOptions } from './lib/themeMore.js';
import './theme-more.css';

export default function ThemeMorePicker({ theme, options = [], selectedIds = [], onSelectionChange, onStart, onNextTheme, onBack }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = selectedMoreOptions(options, selectedIds);
  const run = async action => {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); } catch (_) { setError('選択を保存できませんでした。選んだ内容はそのままです。もう一度お試しください。'); }
    finally { setBusy(false); }
  };
  const toggle = id => onSelectionChange(selectedIds.includes(id) ? selectedIds.filter(item => item !== id) : [...selectedIds, id]);
  return <main className="theme-more">
    <header className="tm-nav"><button type="button" onClick={onBack} disabled={busy} aria-label="テーマ完了に戻る"><ChevronLeft size={20}/></button><span>{theme?.label || '幼い頃'} · 問いを追加</span></header>
    <div className="tm-scroll">
      <div className="tm-intro"><h1 className="tm-picker-title">追加の質問を選んでください。</h1><p className="tm-count">ホームからも追加できます。</p></div>
      {[['skipped', 'スキップした質問'], ['extra', '追加の質問'], ['free', '問いにとらわれず']].map(([kind, title]) => {
        const items = options.filter(option => option.kind === kind);
        if (theme && !items.length) return null;
        return <fieldset key={kind} className="tm-group"><legend>{title}</legend>
          {!items.length && <p className="tm-empty">{kind === 'skipped' ? 'スキップした質問はありません。' : '用意した追加の質問は、すべて語りました。'}</p>}
          <div className="tm-options">{items.map(option => <label className={`tm-option ${selectedIds.includes(option.id) ? 'is-selected' : ''}`} key={option.id}>
            <input type="checkbox" checked={selectedIds.includes(option.id)} disabled={busy} onChange={() => toggle(option.id)}/>
            <span className="tm-check" aria-hidden="true">{selectedIds.includes(option.id) && <Check size={15}/>}</span>
            <span><span className="tm-option-text">{option.text}</span>{option.description && <span className="tm-description">{option.description}</span>}</span>
          </label>)}</div></fieldset>;
      })}
    </div>
    <footer className="tm-footer">
      {error && <p role="alert" className="tm-error">{error}</p>}
      <p className="tm-count">{theme ? `${selected.length}問選択中。選んだ後も、一問ずつスキップできます。` : 'あとからでも追加できます。'}</p>
      <button type="button" className="tm-primary" disabled={busy || !selected.length} onClick={() => run(() => onStart(selected))}>{busy ? '準備しています…' : `選んだ${selected.length}件を語る`}<ArrowRight size={18}/></button>
      <button type="button" className="tm-secondary tm-next" disabled={busy} onClick={() => run(onNextTheme)}>{theme ? 'このテーマを終える' : '次のテーマへ進む'}<ArrowRight size={18}/></button>
    </footer>
  </main>;
}

export function ThemeMoreComplete({ onMore, onContinue, onHome }) {
  return <main className="theme-more tm-complete"><p className="tm-eyebrow">テーマ 1 / 9</p>
    <h1>「幼い頃」を<br/>終えました</h1>
    <div className="tm-divider" aria-hidden="true">✧</div>
    <button className="tm-primary" onClick={onContinue}>次のテーマへ進む<ArrowRight size={18}/></button>
    <p className="tm-add-guidance">このテーマで問いを追加して答えることもできます。</p>
    <button className="tm-secondary tm-next" onClick={onMore}>問いの追加<ArrowRight size={18}/></button>
    <p className="tm-count tm-after-add">あとからでも追加できます。</p>
    <button className="tm-tertiary" onClick={onHome}>今日はここまで</button>
  </main>;
}
