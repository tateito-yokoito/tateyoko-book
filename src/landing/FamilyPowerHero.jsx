import React from 'react';
import './family-power-hero.css';

export function FamilyPowerWordmark() {
  return <span className="hp-family-power-wordmark">
    <img src="/site/hp-renewal/tateito-yokoito-wordmark.png" width="362" height="104" alt="たて糸 ∞ よこ糸" />
  </span>;
}

export default function FamilyPowerHero() {
  return <section className="hp-family-power" id="top" aria-labelledby="hp-family-power-title">
    <h1 id="hp-family-power-title">自分のチカラだけで<br />人生を生きていませんか？</h1>
    <div className="hp-family-power-copy">
      <p>あなたにはまだ<br />受け取っていないチカラがある。</p>
      <p>あなたが存在している奇跡。</p>
      <p>両親、祖父母、幾百、幾千ものご先祖様。<br />誰一人が欠けても、あなたはいない。</p>
      <p>その大応援団を味方につけたとき</p>
      <p className="hp-family-power-close">人生は、新たな輝きを放ち<br />力強く動き始める。</p>
    </div>
    <figure className="hp-family-power-photo">
      <img src="/site/hp-renewal/family-roots-hero.jpg" width="1199" height="1312" fetchPriority="high"
        alt="陽の差す緑の中で、大きな木の幹を見上げる男性と、地面に広がる根" />
    </figure>
  </section>;
}
