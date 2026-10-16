import React, { useState } from 'react';

const asset = '/site/hp-story-preview/';
const waysImage = asset + 'ways-to-preserve-reference.jpg';

export default function StoryIntro() {
  return <>
    <section className="hp-v4-memory" id="memory" aria-labelledby="memory-title">
      <div className="hp-shell hp-v4-memory-heading"><h2 id="memory-title">写真は、こんなに残る。<br />では、想いはどうだろう。</h2></div>
      <figure className="hp-v4-record"><img src={asset + 'records-photos-and-phone.png'} alt="古いアルバム、たくさんの写真、写真一覧を表示するスマートフォン" width="1024" height="1536" loading="lazy" /></figure>
      <div className="hp-v4-moments-copy hp-shell"><p>どんな気持ち<br className="hp-mobile-break" />だったんだろう。</p><p>何を思って<br className="hp-mobile-break" />いたんだろう。</p></div>
      <div className="hp-v4-moments hp-shell" aria-label="過去と今の、語られなかった想い">
        <figure><img src={asset + 'past-family-photograph.png'} alt="旅先で母と子どもを撮影する父親の後ろ姿" width="1024" height="1536" loading="lazy" /></figure>
        <figure><img src={asset + 'present-mother-daughter.png'} alt="台所で一緒に料理をする母と成人した娘" width="1024" height="1536" loading="lazy" /></figure>
      </div>
      <div className="hp-v4-questions hp-shell" id="loved-one"><h2>いつか聞こう。<br />いつか残そう。</h2><p className="hp-v4-question-end">でも、今日の言葉は、<br />今日しか残せない。</p></div>
    </section>
    <section className="hp-v4-ways hp-shell" id="ways" aria-labelledby="ways-title">
      <h2 id="ways-title">人生を残す方法は、<br />これまでもありました。</h2>
      <div className="hp-v4-way-grid">
        <article className="hp-v4-way-card">
          <h3>自分で残す</h3>
          <figure className="hp-v4-crop hp-v4-crop-self"><img src={waysImage} alt="日記や写真、スマートフォンを並べた机" width="853" height="1280" loading="lazy" /></figure>
          <p>日記、メモ、写真、自分史…<br />続けるのが、むずかしい。</p>
        </article>
        <article className="hp-v4-way-card">
          <h3>プロに頼む</h3>
          <figure className="hp-v4-crop hp-v4-crop-pro"><img src={waysImage} alt="取材を受けて人生を語る男性" width="853" height="1280" loading="lazy" /></figure>
          <p>プロの力で、しっかり残せる。<br /><strong>20万円〜数十万円</strong><br />のサービスも。</p>
        </article>
      </div>
      <p className="hp-v4-ways-note">※国内のインタビュー・執筆・製本を含む自分史制作サービスの公開価格例を参考。仕様等により異なります。</p>
      <span className="hp-v4-ways-arrow" aria-hidden="true">↓</span>
      <h2 className="hp-v4-ways-bridge">だから、語るだけにした。</h2>
      <ol className="hp-v4-way-steps">
        <li><span className="hp-v4-way-number">1</span><h3>問いが届く</h3><figure className="hp-v4-crop hp-v4-crop-step-one"><img src={waysImage} alt="今日の問いを表示するスマートフォン" width="853" height="1280" loading="lazy" /></figure><p>専門家監修。<br />心地よい回想。</p></li>
        <li><span className="hp-v4-way-number">2</span><h3>声で語る</h3><figure className="hp-v4-crop hp-v4-crop-step-two"><img src={waysImage} alt="スマートフォンに声で語る女性" width="853" height="1280" loading="lazy" /></figure><p>誰でも。<br />自分のペースで。</p></li>
        <li><span className="hp-v4-way-number">3</span><h3>作品になる</h3><figure className="hp-v4-crop hp-v4-crop-step-three"><img src={waysImage} alt="完成した本とWebブック" width="853" height="1280" loading="lazy" /></figure><p>1〜3ヶ月で完成。<br />写真や動画も添えて。</p></li>
      </ol>
    </section>
  </>;
}

export function StoryToday() {
  return (
    <section className="hp-story hp-story-self hp-section hp-shell" id="today" aria-labelledby="story-today-title">
      <h2 id="story-today-title">2026年の自分が<br className="hp-mobile-break" />語る人生は、<br />2036年の自分には、<br className="hp-mobile-break" />もう語れない。</h2>
      <div className="hp-story-self-copy"><p>人生は、完成してから残すものではない。</p><p className="hp-story-emphasis">今日の自分は、今日しか残せない。</p></div>
    </section>
  );
}

export function StoryOrigin() {
  const [originExpanded, setOriginExpanded] = useState(false);
  return (
    <section className="hp-story hp-origin hp-section hp-shell" id="origin" aria-labelledby="origin-title">
      <h2 id="origin-title">だから、縦糸横糸を<br className="hp-mobile-break" />つくりました。</h2>
      <div className="hp-origin-brief">
        <p>私は18年間、生命保険の仕事を通じて、<br />1000世帯を超える方々の<br className="hp-mobile-break" />人生に触れてきました。</p>
        <p>誰の中にも、まだ語られていない人生がある。<br />そして、それを受け取りたい<br className="hp-mobile-break" />と思ったときには、<br />もう聞けないことがある。</p>
        <p className="hp-story-emphasis">そのことを、仕事でも、自分の家族でも知りました。</p>
      </div>
      <div className="hp-origin-teasers">
        <article><figure><img src={asset + 'founder-and-son.jpg'} alt="窓辺で息子とスマートフォンを見る創業者・菅原英俊" loading="lazy" width="890" height="1122" /></figure><div><h3>生命保険の現場で知ったこと</h3><p>私が初めて死亡保険金をお支払いしたのは、当時の私と同じ33歳の男性でした。</p></div></article>
        <article><figure><img src={asset + 'family-history-cover.jpg'} alt="祖父が用意した「わが家の歴史」の表紙" loading="lazy" width="746" height="1020" /></figure><div><h3>祖父が残した、真っ白な家族史</h3><p>亡くなった祖父が用意していた「わが家の歴史」。その先は、真っ白でした。</p></div></article>
      </div>
      <button className="hp-origin-toggle" type="button" aria-expanded={originExpanded} aria-controls="origin-full-story" onClick={() => setOriginExpanded(!originExpanded)}>{originExpanded ? '− 閉じる' : '＋ 続きを読む'}</button>

      <div id="origin-full-story" hidden={!originExpanded}>
      <div className="hp-origin-full-intro"><p>私は18年間、生命保険の仕事を通じて、<br />1000世帯を超える方々の人生に伴走してきました。</p><p>20代から90代まで。</p><p>家族のこと。仕事のこと。<br />叶えたかったこと。<br />誰にも言わず、抱えてきたこと。</p><p className="hp-story-emphasis">どんな人の中にも、<br />まだ言葉になっていない人生がありました。</p><p>でも、その多くは、どこにも残りません。</p></div>

      <div className="hp-origin-scene hp-origin-client">
        <p>私が初めて死亡保険金をお支払いしたのは、<br />当時の私と同じ、33歳の男性でした。</p>
        <p>持病もなく、いつもの通勤電車で突然具合が悪くなり、<br />病院へ運ばれ、数日後にこの世を去りました。</p>
        <p>九州から駆けつけたご両親とお姉さまに、<br />私ができたことが一つありました。</p>
        <p>それまで彼と何度も話す中で聞いていた、<br />家族への想い。今の自分。これからやりたいこと。</p>
        <p>そのメモを、お渡しすることでした。</p>
        <p>決して十分なものではありません。</p>
        <p>それでも、ご家族から、</p>
        <blockquote>「何を考えているかわからないところもあった息子だったけれど、<br />その話を聞いて、誇らしく思った」</blockquote>
        <p className="hp-origin-quote-note">という趣旨の言葉をいただいたことを、今も忘れません。</p>
      </div>

      <div className="hp-origin-scene hp-origin-grandfather">
        <p>一方で、ある日、実家から、<br />亡くなった祖父が用意した<br />「わが家の歴史」という冊子が出てきました。</p>
        <div className="hp-origin-documents"><figure><img src={asset + 'family-history-cover.jpg'} alt="祖父が用意した「わが家の歴史」の表紙" loading="lazy" width="746" height="1020" /></figure><figure><img src={asset + 'family-history-contents.jpg'} alt="「わが家の歴史」の目次" loading="lazy" width="1008" height="779" /></figure></div>
        <p>家系図。<br />古来から言い伝えられたこと。<br />亡くなった人たちの思い出。</p>
        <p>残そうとしていたものが、目次には並んでいました。</p>
        <figure className="hp-origin-blank"><img src={asset + 'family-history-blank.jpg'} alt="家紋の隣で、記入されないまま残った家系図のページ" loading="lazy" width="1050" height="746" /></figure>
        <p className="hp-origin-white">その先は、真っ白でした。</p>
        <p>祖父は、いつこれを準備したのか。<br />何を残そうとしていたのか。</p><p>もう、聞くことはできません。</p>
        <div className="hp-origin-split hp-origin-memory"><figure><img src={asset + 'grandparents.jpg'} alt="創業者の祖父母の実際の写真" loading="lazy" width="1102" height="713" /></figure><p>1000世帯を超える方々の人生を聞いてきた私自身、<br />一番身近な家族については、<br />恥ずかしいほど何も聞けていませんでした。</p></div>
      </div>

      <div className="hp-origin-conclusion"><p>特別な人だけが、自伝を書くのではなく。<br />成功した人生だけを、きれいな物語にするのでもなく。</p><p className="hp-story-emphasis">誰もが、自分の人生を気軽に語れるものをつくりたい。</p><p>語ることで、自分の人生をもう一度辿る。<br />忙しい毎日の中では見えなかったものに気づく。</p><p>そして、いつか誰かがその人生を受け取りたいと思ったとき、</p><p className="hp-story-emphasis">時を越えて、その人らしさに触れられる器をつくりたい。</p><p>それが、縦糸横糸の始まりです。</p><p className="hp-origin-signature">菅原 英俊</p></div>
      </div>
    </section>
  );
}
