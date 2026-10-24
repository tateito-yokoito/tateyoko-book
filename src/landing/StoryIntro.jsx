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
      <p className="hp-origin-kicker">Origin｜縦糸♾️横糸が生まれた理由</p>
      <h2 id="origin-title">家族でも知らない、<br className="hp-origin-heading-break" />人生がある。</h2>
      <div className="hp-origin-brief">
        <p>18年間、約1,000世帯の方々の人生に関わってきました。</p>
        <p>その中で感じたのは、誰の人生にも、<br />家族さえ知らない物語や想いがあるということです。<br />けれど、その多くは、語られないまま失われていきます。</p>
        <p>私自身、祖父が用意した「家族史」を見つけたとき、<br />胸を突かれる思いがしました。</p>
        <p>最初のページには家紋が貼られていましたが、<br />その先は全て白紙のままだったのです。</p>
      </div>
      <div className="hp-origin-photo-stack">
        <figure className="hp-origin-cover"><img src={asset + 'family-history-spine-wide-20261023.png'} alt="祖父が用意した「わが家の歴史」の冊子と背表紙" width="2852" height="1534" loading="lazy" /></figure>
        <figure className="hp-origin-book"><img src={asset + 'origin-family-history-open-20261023.jpg'} alt="家紋が貼られたページと、白紙のままの家系図のページ" width="1024" height="768" loading="lazy" /></figure>
      </div>
      <div className="hp-origin-closing">
        <p>祖父は、どんな想いでこの冊子を用意したのか。<br />何を残したかったのか。</p>
        <p>今なら聞いてみたいことが、たくさんあります。<br />でも、もう聞くことはできません。</p>
      </div>
      <button className="hp-origin-toggle" type="button" aria-expanded={originExpanded} aria-controls="origin-full-story" onClick={() => setOriginExpanded(!originExpanded)}>{originExpanded ? '− 実話を閉じる' : '＋ 縦糸♾️横糸が生まれた２つの実話を読む'}</button>
      <div id="origin-full-story" hidden={!originExpanded}>
        <div className="hp-origin-scene hp-origin-client">
          <h3>01　家族に届いた、<br className="hp-origin-heading-mobile-break" />12年前の言葉</h3>
          <p>私が初めて死亡保険金をお支払いしたのは、<br />当時の私と同じ、37歳の男性でした。</p>
          <p>持病もなく、いつもの通勤電車で突然具合が悪くなり、<br />病院へ運ばれ、数日後にこの世を去りました。</p>
          <p>九州から駆けつけたご両親とお姉さまは、<br />深い悲しみと戸惑いの中にいらっしゃいました。</p>
          <p>そんなご家族に、私ができたことが一つ。</p>
          <p>それは、12年前、彼が25歳のときの面談で聞いた、<br />家族への想いや、今の自分のこと、将来への希望。</p>
          <p>それらを記したメモを、お渡しすることでした。</p>
          <p>決して十分なものではありません。</p>
          <p>それでも、ご両親から、こんな言葉をいただきました。</p>
          <blockquote>東京に出てから、あまり話もできていなかった。<br />息子を誇りに思う。</blockquote>
          <p>その言葉を、今も忘れることができません。</p>
        </div>
        <div className="hp-origin-scene hp-origin-scene-grandparents">
          <h3>02　聞けなかったこと。<br className="hp-origin-heading-mobile-break" />まだ聞けること。</h3>
          <div className="hp-origin-grandparents-layout">
            <figure className="hp-origin-grandparents-photo"><img src={asset + 'grandparents.jpg'} alt="創業者の祖父母の写真" width="1102" height="713" loading="lazy" /></figure>
            <div className="hp-origin-grandparents-copy">
              <p>多くの方々の人生に触れてきた私自身、<br />身近な祖父母の人生については、<br />驚くほど何も聞けていませんでした。</p>
              <p>あの「わが家の歴史」には、<br />どんな物語が綴られるはずだったのだろう。</p>
              <p>今となっては、想像することしかできません。</p>
              <p>そして、思いました。</p>
              <p>まだ話を聞ける両親についても、<br />いつか同じ後悔をするのではないか、と。</p>
            </div>
          </div>
        </div>
      </div>
      <div className="hp-origin-vision">
        <p className="hp-origin-vision-label">創業者の想い</p>
        <h3>家族に還れる場所をつくる</h3>
        <div className="hp-origin-vision-layout">
          <div className="hp-origin-vision-copy">
            <p>特別な人だけが、自伝を書くのではなく。<br />成功した人生だけを、きれいな物語にするのでもなく。</p>
            <p className="hp-origin-vision-pledge">誰もが、自分の人生を気軽に残せないか。</p>
            <p>語ることで、自分の人生をもう一度辿り、<br />忙しい日々に埋もれていた、大切なものに気づく。</p>
            <p>そして、家族が受け取りたいと思ったときには、<br />時を越えて、その人らしさに触れられる場所として。</p>
            <p>そんな願いを、<br className="hp-origin-mobile-break" />「縦糸♾️横糸」に込めています。</p>
            <address className="hp-origin-vision-signature"><span>株式会社SaltLight 代表取締役</span><strong>菅原 英俊</strong></address>
          </div>
          <div className="hp-origin-vision-person">
            <figure><img src={asset + 'founder-and-son-landscape-20261022.png'} alt="創業者・菅原英俊と息子" width="1402" height="1122" loading="lazy" /></figure>
          </div>
        </div>
      </div>
    </section>
  );
}
