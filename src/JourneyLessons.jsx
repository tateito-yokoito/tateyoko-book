import React from 'react';
import './journey-lessons.css';

// Shared by the customer journey and its preview. These views do not perform
// navigation or writes; the caller owns first-use persistence and destinations.
export function StoriesLesson({onContinue}) {
  return <section className="journey-guide">
    <p className="journey-guide-label">語りを見る</p>
    <h2>語りを振り返り、<br/>思い出の一枚を。</h2>
    <p>ここまでの声と言葉は、<br/>ホームの「語りを見る」から振り返れます。</p>
    <div className="journey-guide-section">
      <h3>写真を添える</h3>
      <img src="/site/album-photo-capture-preview-20261012.png" alt="アルバムを開き、スマホで写真を撮る手元"/>
      <p>残しておきたい一枚を、語りのそばに。</p>
      <p>アルバムの写真も、スマホで撮影。<br/>傾きや切り抜きを整えて取り込めます。</p>
    </div>
    <button type="button" onClick={onContinue}>語りを見るへ</button>
  </section>;
}

export function BookLesson({onContinue}) {
  return <section className="journey-guide">
    <p className="journey-guide-label">本に仕上げる</p>
    <h2>語ってきた物語を、<br/>縦糸横糸ブックに。</h2>
    <p>ホームの「本に仕上げる」から、<br/>本の完成に向けて進められます。</p>
    <div className="journey-guide-section">
      <h3>仕上がりを見ながら</h3>
      <img src="/site/book-spread-slim-no-qr-preview-20261012.png" alt="写真と語りを収録した薄い冊子の見開き"/>
      <p>表紙を決め、残したい語りを選ぶ。<br/>紙面を確認してから、完成へ進めます。</p>
    </div>
    <button type="button" onClick={onContinue}>本に仕上げるへ</button>
  </section>;
}

export function ShelfLesson({onContinue}) {
  return <section className="journey-guide">
    <p className="journey-guide-label">私の本棚・家族の本棚</p>
    <h2>完成した物語が、<br/>本棚に並びます。</h2>
    <p>縦糸横糸ブックを発注して届く頃、<br/>もう一つの体験<br/>「縦糸横糸Webブック」が生まれます。</p>
    <div className="journey-guide-shelf"><img src="/site/bookshelf-one-own-book-preview-20261012.png" alt="私の本棚に一冊のWebブックが並び、隣に家族の本棚が見えるスマホ画面"/></div>
    <p>家族の本棚は、<br/>家族それぞれの語りがつながる場所。</p>
    <button type="button" onClick={onContinue}>本棚を見るへ</button>
  </section>;
}

export function WaitLesson({onHome}) {
  return <section className="journey-guide journey-guide-centered">
    <h2>いつ画面を閉じても大丈夫です。</h2>
    <p>ここまでの語りは保存されています。</p>
    <button type="button" onClick={onHome}>ホームへ</button>
    <p>ホームでは、語りを振り返ったり、<br/>写真を添えたりできます。<br/>次の問いも、ホームから開けます。</p>
  </section>;
}

export function JourneyFinished({onStories,onHome}) {
  return <section className="journey-guide journey-guide-centered">
    <h2>九つのテーマを、<br/>すべてたどりました。</h2>
    <button type="button" onClick={onStories}>これまでの語りを見る</button>
    <button type="button" className="journey-guide-secondary" onClick={onHome}>ホームへ戻る</button>
  </section>;
}
