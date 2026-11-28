import React from 'react';
import './family-power-hero.css';

export function FamilyPowerLayoutControls({ desktop, mobile }) {
  const variants = [
    { device: 'PC', param: 'pc', selected: desktop, labels: ['本文と写真を横並び', '見出しを上段に'] },
    { device: 'スマートフォン', param: 'mobile', selected: mobile, labels: ['本文を先に', '写真を先に'] },
  ];

  return <nav className="hp-family-power-controls" aria-label="ファーストビューのレイアウト比較">
    {variants.map(({ device, param, selected, labels }) => <div key={param} aria-label={device} role="group">
      <span>{device}</span>
      {['a', 'b'].map((layout, index) => {
        const params = new URLSearchParams({ 'family-power': '1', pc: desktop, mobile });
        params.set(param, layout);
        return <a key={layout} href={`?${params}`} aria-current={selected === layout ? 'true' : undefined}>
          {layout.toUpperCase()} <span>{labels[index]}</span>
        </a>;
      })}
    </div>)}
  </nav>;
}

export default function FamilyPowerHero({ desktop, mobile }) {
  return <section className="hp-family-power" id="top" aria-labelledby="hp-family-power-title"
    data-desktop-layout={desktop} data-mobile-layout={mobile}>
    <h1 id="hp-family-power-title">自分のチカラだけで、<br />人生を生きていませんか？</h1>
    <div className="hp-family-power-copy">
      <p>あなたには<br />まだ受け取っていないチカラがある。</p>
      <p>あなたが存在している奇跡。</p>
      <p>親、祖父母、幾百、幾千ものご先祖さま。<br />誰一人が欠けても、今のあなたはいない。</p>
      <p>その大応援団を味方につけたとき</p>
      <p className="hp-family-power-close">人生は、新たな輝きを放ち<br />力強く動き始める。</p>
    </div>
    <figure className="hp-family-power-photo">
      <img src="/site/hp-renewal/family-roots-hero.jpg" width="1199" height="1312" fetchPriority="high"
        alt="陽の差す緑の中で、大きな木の幹を見上げる男性と、地面に広がる根" />
    </figure>
  </section>;
}
