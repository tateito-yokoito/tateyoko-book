import { STORY_THEMES } from './lib/storyThemes.js';
import './childhood-trial.css';

export default function ChildhoodTrialIntro({ onStart, resuming = false }) {
  const theme = STORY_THEMES.find(item => item.code === 'ty_theme_childhood');
  return <section className="childhood-trial-intro fade-enter" aria-labelledby="childhood-trial-title">
    <p className="childhood-trial-eyebrow">体験の一頁</p>
    <h1 id="childhood-trial-title" className="text-narrative">幼い頃</h1>
    <figure><img src={theme.image} alt={theme.imageAlt} /></figure>
    <p className="childhood-trial-opening">まずは、あなたの幼い頃を<br />3つの問いから少しだけ辿ってみましょう。</p>
    <p className="childhood-trial-reassurance">うまく話そうとしなくて大丈夫です。<br />問いを見て、最初に浮かんだ景色から。</p>
    <button type="button" className="btn-quiet" onClick={onStart}>{resuming ? 'つづきからはじめる' : 'はじめる'}</button>
  </section>;
}
