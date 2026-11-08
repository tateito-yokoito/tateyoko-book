import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import QuestionFlowTopBar from './QuestionFlowTopBar.jsx';

export function AnswerTextLayout({ question, theme, progress, onBack, children }) {
  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-950 text-white flex flex-col px-5 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-[calc(0.75rem+env(safe-area-inset-bottom))] overflow-y-auto">
      <div className="mx-auto w-full max-w-xl flex min-h-0 flex-1 flex-col">
        <QuestionFlowTopBar onBack={onBack} theme={theme || question?.theme_label || question?.chapter_label || ''} progress={progress} />
        <h2 className="text-center text-narrative text-[1.3rem] leading-[1.7] mt-7 mb-4 max-h-[20dvh] overflow-y-auto shrink-0">{question?.content || question?.question_text_snapshot}</h2>
        {children}
      </div>
    </div>, document.body
  );
}

export function AnswerTextCandidate({ candidate, onUse, onDiscard }) {
  const [showOriginal, setShowOriginal] = useState(false);
  return <>
    <h3 className="text-lg mb-4">整えた文章を確認</h3>
    <div className="rounded-xl bg-[#f5f3ed] p-5 text-[#24302d] whitespace-pre-wrap leading-loose text-lg">{candidate.text}</div>
    <button type="button" onClick={() => setShowOriginal(!showOriginal)} className="py-4 text-white/70 underline">元の文章を{showOriginal ? '閉じる' : '確認する'}</button>
    {showOriginal && <div className="rounded-xl border border-white/20 p-5 whitespace-pre-wrap leading-loose">{candidate.original}</div>}
    <div className="mt-5 space-y-3">
      <button type="button" className="w-full min-h-14 rounded-xl bg-white text-slate-900" onClick={onUse}>この文章を使う</button>
      <button type="button" className="w-full min-h-14 rounded-xl border border-white/30" onClick={onDiscard}>元の文章に戻す</button>
    </div>
    <p className="text-white/50 text-sm mt-4">まだ確定していません。編集画面で「保存する」を押すと反映されます。</p>
  </>;
}

export function AnswerTextFields({ value, onChange, busy, status, onSave, onPolish, onDiscard,
  showStyles, onToggleStyles, saveDisabled = false, inputDisabled = false, canPolish = true, beforeActions, children }) {
  return <>
    <div className="flex items-center justify-between gap-3 mb-2 shrink-0">
      <p role="status" className="text-white/55 text-xs">{status}</p>
      {children}
    </div>
    <textarea aria-label="回答の文章" value={value} onChange={event => onChange(event.target.value)} disabled={inputDisabled}
      className="w-full min-h-[48dvh] flex-1 rounded-xl border border-white/20 bg-[#f5f3ed] p-5 text-[#24302d] text-lg leading-loose outline-none resize-y"
      placeholder="ここに思い出を書く" />
    <div className="pt-3 space-y-2 shrink-0">
      {beforeActions}
      {canPolish && showStyles && <div role="group" aria-label="文章の整え方" className="grid grid-cols-3 gap-2">
        {[["clean", "そのまま"], ["narrative", "語り調"], ["essay", "作品調"]].map(([style, label]) =>
          <button key={style} type="button" onClick={() => onPolish(style)} disabled={busy}
            className="min-h-12 rounded-xl border border-white/30 text-sm disabled:opacity-40">{label}</button>)}
      </div>}
      <div className={canPolish ? "grid grid-cols-[1fr_1.25fr] gap-2" : "grid"}>
        {canPolish && <button type="button" onClick={onToggleStyles} disabled={busy || !value.trim()}
          className="min-h-14 rounded-xl border border-white/30 disabled:opacity-40">✦ 整える</button>
        }
        <button type="button" onClick={onSave} disabled={busy || !value.trim() || saveDisabled}
          className="min-h-14 rounded-xl bg-white text-slate-900 disabled:opacity-40">{busy ? '処理中…' : '保存する'}</button>
      </div>
      {onDiscard && <button type="button" onClick={onDiscard} disabled={busy}
        className="w-full min-h-11 text-white/55 text-sm">保存せず終了</button>}
    </div>
  </>;
}
