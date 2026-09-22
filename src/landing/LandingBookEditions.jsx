import React, { useState } from 'react';
import './book-editions.css';

const COLORS = [
  { id:'ivory', label:'アイボリー', color:'#e9e1d1', ink:'#28312c' },
  { id:'rose', label:'ダスティローズ', color:'#bb8f8d', ink:'#292b29' },
  { id:'sage', label:'セージグリーン', color:'#a5ad92', ink:'#28312c' },
  { id:'navy', label:'ネイビー', color:'#182a43', ink:'#f4f0e5' },
];

function BookObject({ premium = false, color }) {
  return <div className={`hp-edition-scene ${premium ? 'hp-edition-scene-premium' : 'hp-edition-scene-standard'}`} role="img" aria-label={premium ? '深緑の布貼り、薄く端正なB5上製本の表紙デザイン見本。縦糸横糸、紡木誠、2026年3月を金色で配置。ロゴマークなし。' : `${color.label}の薄いソフトカバーと写真表紙、本文の小口を見せるB5ブックの見本。`}>
    <div className="hp-edition-object" style={premium ? undefined : {'--cover-color':color.color,'--cover-ink':color.ink}} aria-hidden="true">
      <div className="hp-edition-back" />
      <div className="hp-edition-pages" />
      <div className="hp-edition-page-top" />
      <div className="hp-edition-front">
        <div className="hp-edition-texture" />
        {premium ? <>
          <span className="hp-edition-foil-title">縦糸横糸</span>
          <div className="hp-edition-foil-name"><span>紡木 誠</span><span>2026.03</span></div>
        </> : <>
          <div className="hp-edition-cover-name"><span>紡木 誠</span><span>45年目の現在地</span></div>
          <div className="hp-edition-cover-photo" />
          <img className="hp-edition-official-mark" src="/brand-logo-symbol.svg" alt="" width="122" height="119" />
          <span className="hp-edition-cover-brand">縦糸横糸</span>
        </>}
      </div>
    </div>
  </div>;
}

export default function LandingBookEditions() {
  const [color, setColor] = useState(COLORS[2]);
  return <aside className="hp-editions" id="book-editions" aria-label="標準ブックと追加のプレミアムブック">
    <div className="hp-editions-pair">
      <section className="hp-edition hp-edition-standard" aria-labelledby="hp-standard-title">
        <header><p className="hp-label">標準の一冊</p><h3 id="hp-standard-title">縦糸横糸ブック</h3></header>
        <div className="hp-edition-options" role="group" aria-label="表紙カラーの表示見本">
          {COLORS.map(c=><button key={c.id} type="button" aria-pressed={color.id === c.id} onClick={()=>setColor(c)}><span className="hp-edition-swatch" style={{backgroundColor:c.color}} /><span>{c.label}</span></button>)}
        </div>
        <BookObject color={color} />
        <div className="hp-edition-description"><h4>写真とともに、<br />その人らしい一冊を。</h4><p>B5・ソフトカバー</p><p>基本料金に1冊含まれます。</p></div>
      </section>
      <div className="hp-editions-plus" aria-label="標準ブックに追加"><span aria-hidden="true">＋</span></div>
      <section className="hp-edition hp-edition-premium" aria-labelledby="hp-premium-title">
        <header><p className="hp-label">追加オプション</p><h3 id="hp-premium-title">縦糸横糸プレミアムブック</h3></header>
        <div className="hp-edition-binding"><span className="hp-edition-swatch" />深緑・B5 布貼り上製本</div>
        <BookObject premium />
        <div className="hp-edition-description"><h4>大切な一冊に、<br />ふさわしい装いを。</h4><p>深緑の布貼りと箔押しで仕立てる、<span className="hp-edition-phrase">特別な一冊。</span></p><p className="hp-edition-price">＋30,000円（税込）</p><p>標準ブックとの置換ではなく、追加の1冊です。</p></div>
      </section>
    </div>
    <p className="hp-editions-disclaimer">表紙・製本はイメージです。</p>
  </aside>;
}
