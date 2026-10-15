import { STORY_THEMES } from './lib/storyThemes.js';
import './childhood-trial.css';

export default function ChildhoodTrialIntro({ onStart, onRestart, restartError = '', resuming = false, retentionDays = 10, retentionEnabled = false }) {
  const theme = STORY_THEMES.find(item => item.code === 'ty_theme_childhood');
  return <section className="childhood-trial-intro fade-enter" aria-labelledby="childhood-trial-title">
    <p className="childhood-trial-eyebrow">体験の一頁</p>
    <h1 id="childhood-trial-title" className="text-narrative">幼い頃</h1>
    <figure><img src={theme.image} alt={theme.imageAlt} /></figure>
    <p className="childhood-trial-opening">まずは、あなたの幼い頃を<br />3つの問いから少しだけ辿ってみましょう。</p>
    <p className="childhood-trial-reassurance">うまく話そうとしなくて大丈夫です。<br />問いを見て、最初に浮かんだ景色から。</p>
    {retentionEnabled && <p className="childhood-trial-reassurance">語った内容は、最後に語った日から{retentionDays}日間保存されます。縦糸横糸を始めると、そのまま引き継げます。</p>}
    <button type="button" className="btn-quiet" onClick={onStart}>{resuming ? 'つづきからはじめる' : 'はじめる'}</button>
    {retentionEnabled && resuming && <button type="button" className="mt-3 text-sm text-white/60 underline underline-offset-4" onClick={onRestart}>最初からやり直す</button>}
    {restartError && <p role="alert" className="mt-4 text-sm text-rose-200">{restartError}</p>}
  </section>;
}
