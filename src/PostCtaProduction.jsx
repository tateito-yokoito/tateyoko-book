import React from "react";
import { StoryOrigin } from "./landing/StoryIntro.jsx";
import "./postcta-preview.css";

const TRIAL = "/?app=1&entry=trial";
const GIFT = "/?app=1&entry=login";

const FAQS = [
  ["無料3問の後、勝手に課金されますか？", "自動課金はありません。無料の3問にカード登録は不要です。続けたいと思ったときに、ご自身で購入を選べます。"],
  ["完成までどのくらいかかりますか？", "語る量やペースによって異なります。1〜3ヶ月を目安に、ゆっくりなら最長1年間取り組めます。製本・発送の時期は、内容が確定してからご案内します。"],
  ["途中で休んでも大丈夫ですか？", "一度に語り終える必要はありません。無理のないペースで進められます。利用期間などの条件は、お申し込み時の案内をご確認ください。"],
  ["スマートフォンが苦手でも使えますか？", "問いを読み、録音ボタンを押して話すところから始められます。写真や文章の整理、本に仕上げる作業は、信頼する方に手伝ってもらうこともできます。"],
  ["家族が制作を手伝えますか？", "ご本人の同意のもと、一緒に思い出を辿り、制作を手伝えます。信頼する方をサポーターとして招く方法もあります。ご本人のアカウントがない場合の始め方は、現在ご案内を準備しています。"],
  ["語った内容は誰に見えますか？", "完成した物語を家族に見せる範囲は、自分たちで選べます。本づくりを手伝うサポーターは、制作に必要な語りや写真などを扱います。完成した物語を見る家族とは役割が異なります。"],
  ["家族へのギフトはどう進めますか？", "現在の「家族に3問を贈る」はログイン画面へ進みます。ギフトの開始方法と受け取る方の手順は、正式公開前にご案内します。"],
  ["ギフトの返金保証はありますか？", "ギフト購入には、決済日から45日以内かつ本編開始前までの返金保証があります。適用条件は、お申し込み前にご確認ください。"],
];

function openExistingPrivacy() {
  const button = [...document.querySelectorAll(".hp-footer button")].find(node => node.textContent.trim() === "プライバシー");
  button?.click();
}

export default function PostCtaProduction() {
  return <>
    <StoryOrigin />

    <section className="hp-trust hp-section hp-shell" id="trust" aria-labelledby="trust-title">
      <h2 id="trust-title">大切な人生を、<br className="hp-mobile-break" />お預かりするから。</h2>
      <div className="hp-trust-grid">
        <article><h3>公開範囲</h3><p>誰に見せるかは、自分で選べます。</p></article>
        <article><h3>プライバシー</h3><p>語った内容や写真、音声を大切に扱います。</p></article>
        <article><h3>家族のサポート</h3><p>必要に応じて、家族と一緒に進められます。</p></article>
      </div>
      <button type="button" className="hp-text-link" onClick={openExistingPrivacy}>プライバシーとデータの取り扱いについて <span aria-hidden="true">→</span></button>
    </section>

    <section className="hp-faq hp-section hp-shell" id="faq" aria-labelledby="faq-title">
      <p className="hp-label">始める前に、気になること。</p>
      <h2 id="faq-title">よくあるご質問</h2>
      <div>{FAQS.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">＋</span></summary><p>{answer}</p></details>)}</div>
    </section>

    <section className="hp-final hp-dark hp-section" aria-labelledby="final-title"><div className="hp-shell">
      <h2 id="final-title">まずは、3問。</h2>
      <p>人生を語るって、どんな感じだろう。<br />声で気軽に試してみてください。</p>
      <div className="hp-final-actions"><a className="hp-button" href={TRIAL}>3問を試してみる <span aria-hidden="true">→</span></a><a className="hp-button hp-final-gift" href={GIFT}>家族に3問を贈る <span aria-hidden="true">→</span></a></div>
      <p className="hp-note">カード登録不要・自動課金なし</p>
    </div></section>
  </>;
}
