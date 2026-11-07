import React from 'react';
import { Home } from 'lucide-react';

export default function QuestionFlowTopBar({ onBack, theme, progress, onHome }) {
  return <header className="question-flow-top-bar grid min-h-11 grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)_minmax(0,1fr)] items-center gap-2">
    <div className="min-w-0 justify-self-start">
      {onBack && <button type="button" onClick={onBack} className="min-h-11 text-left text-[1rem] text-white/70" aria-label="前の画面へ戻る">← 戻る</button>}
    </div>
    <p className="min-w-0 truncate text-center text-[0.875rem] text-[#d6bb86]" title={theme || undefined}>{theme}</p>
    <div className="min-w-0 justify-self-end">
      {onHome ? <button type="button" onClick={onHome} className="flex min-h-11 min-w-11 items-center justify-end text-white/70" aria-label="ホームへ戻る"><Home size={20} strokeWidth={1.7} /></button>
        : progress && <span className="whitespace-nowrap text-[1rem] text-white/75">{progress}</span>}
    </div>
  </header>;
}
