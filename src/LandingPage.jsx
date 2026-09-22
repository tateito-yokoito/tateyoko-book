import React, { useEffect, useRef, useState } from "react";
import "./landing.css";
import LandingBookEditions from './landing/LandingBookEditions.jsx';

const LOGIN = "/?app=1&entry=login";
const TRIAL = "/?app=1&entry=trial";
const PURCHASE = "/?app=1&entry=purchase";
const EMAIL = "sugawara@saltlight.co.jp";
const QUESTIONS = [
  "幼い頃、どんなところに住んでいましたか？",
  "その頃、よく一緒にいた人を一人思い浮かべてください。どんな人でしたか？",
  "その頃、どんな遊びが好きでしたか？"
];
const THEMES = ["幼い頃", "学生時代", "好きなこと", "暮らし", "仕事・役割", "人とのつながり", "家族の記憶", "人生の転機", "今とこれから"];
const FAQS = [
  ["スマートフォンが苦手でも使えますか？", "問いを読み、録音ボタンを押して話すところから始められます。写真や文章の整理、本に仕上げる作業は、信頼する方に手伝ってもらうこともできます。"],
  ["親の物語を、子どものスマホだけで作れますか？", "ご本人の同意のもと、一緒に思い出を辿り、制作を手伝う使い方を想定しています。ご本人のアカウントがない場合の始め方は、現在ご案内を準備しています。"],
  ["離れていても手伝えますか？", "信頼する方をサポーターとして招き、離れた場所から制作を手伝ってもらう仕組みです。利用できる範囲と手順は、ご案内時に確認できます。"],
  ["無料体験後に自動課金されますか？", "自動課金はありません。無料の3問にカード登録は不要です。続けたいと思ったときに、ご自身で購入を選べます。"],
  ["どのくらいで完成しますか？", "語る量やペースによって異なります。一度にすべてを話す必要はありません。製本・発送の時期は、内容が確定してからご案内します。"],
  ["語った内容は誰に見えますか？", "完成した物語を家族に見せる範囲は、自分たちで選べます。Webブックの共有リンクや暗証番号は、見せたい相手にお伝えください。"],
  ["サポーターには何が見えますか？", "サポーターは、本づくりを手伝うために語りや写真などの制作情報を扱います。完成した物語を閲覧する家族とは役割が異なります。依頼するときに、制作のために共有する範囲を確認してください。"],
  ["途中で休んでも大丈夫ですか？", "一度に語り終える必要はありません。無理のないペースで進められます。利用期間などの条件は、お申し込み時の案内をご確認ください。"]
];
const MORE_FAQS = [
  ["49,800円には何が含まれますか？", "人生を辿る問い、音声・文章・写真の保存、標準の縦糸横糸ブック（ソフトカバー）1冊、縦糸横糸Webブックが含まれます。税込・国内送料込みです。"],
  ["プレミアムブックは標準ブックと入れ替わりますか？", "入れ替わりません。標準ブック1冊に加えて、30,000円（税込）でプレミアムブックをもう1冊追加するオプションです。"],
  ["本から声を聴けますか？", "縦糸横糸ブックのQRから、縦糸横糸Webブックへ進み、声を聴けます。紙の作品を読む時間と、声に触れる時間のどちらも楽しめます。"]
];

function TrialLink({ reviewOnly = false }) {
  return <a className="hp-button" href={reviewOnly ? "#hp-review-notice" : TRIAL}>無料で3問、話してみる <span aria-hidden="true">↗</span></a>;
}
function Placeholder({ name, children, className = "" }) {
  return <div className={"hp-placeholder " + className}><span className="hp-placeholder-label">ビジュアル仮置き · {name}</span>{children}</div>;
}
function SectionLabel({ children }) { return <p className="hp-label">{children}</p>; }

function InformationDialog({ panel, close, reviewOnly }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    return () => { previous?.focus(); };
  }, []);
  const title = { contact: "お問い合わせ", privacy: "残すことと、見せること", commerce: "特定商取引法に基づく表記" }[panel];
  return <dialog className="hp-dialog" ref={dialog} aria-labelledby="hp-dialog-title" onCancel={close} onClick={e => { if (e.target === e.currentTarget) close(); }}>
    <div className="hp-dialog-inner"><button className="hp-dialog-close" onClick={close} aria-label="閉じる">×</button>
      <h2 id="hp-dialog-title">{title}</h2>
      {panel === "contact" && <><p>使い方、制作やご注文について、メールでご相談いただけます。</p><a href={reviewOnly ? "#hp-review-notice" : "mailto:" + EMAIL}>{EMAIL}</a></>}
      {panel === "privacy" && <><p>本づくりを手伝うサポーターと、完成した物語を見る家族は別の役割です。</p><p>サポーターは制作に必要な情報を扱います。完成した物語の共有範囲とは分けて、ご本人の同意のもとで依頼してください。</p><p>録音、文章、写真、アカウント情報は、サービスの提供とサポートに必要な範囲で取り扱います。ご質問は運営窓口へご連絡ください。</p></>}
      {panel === "commerce" && <dl>{[
        ["販売事業者", "株式会社SaltLight"], ["運営責任者", "菅原 英俊"], ["連絡先", EMAIL],
        ["販売価格", "縦糸横糸 49,800円（税込・国内送料込み）。プレミアムブックの追加は30,000円（税込）。"],
        ["支払方法", "クレジットカード決済（Stripe）"],
        ["提供時期", "購入後にご利用を開始できます。冊子は内容確定後に製本し、発送時にご案内します。"],
        ["取消・返金", "適用条件を確認のうえ個別にご案内します。お申し込み前にご相談いただけます。"],
        ["所在地・電話番号", "請求があった場合、遅滞なく電子メールで開示します。"]
      ].map(([k,v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
    </div></dialog>;
}

export default function LandingPage({ reviewOnly = false, heroLayout = 'integrated' }) {
  const [menu, setMenu] = useState(false);
  const [panel, setPanel] = useState(null);
  const [moreFaq, setMoreFaq] = useState(false);
  useEffect(() => {
    document.body.classList.add("landing-page-active");
    return () => document.body.classList.remove("landing-page-active");
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = e => { if (e.key === "Escape") { setMenu(false); document.getElementById("hp-menu-toggle")?.focus(); } };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menu]);
  return <div className="landing-site">
    <a className="hp-skip" href="#hp-main">本文へ移動</a>
    <div id="hp-review-notice" className="hp-preview-note" role="note">{reviewOnly ? "HP Preview" : "サイト準備中"} <span>{reviewOnly ? "表示確認専用：登録・購入・ログイン・送信はできません。" : "画像・音声の一部は確認用です。"}</span></div>
    <header className="hp-header">
      <a href="#top" aria-label="縦糸横糸 トップへ"><img src="/brand-logo-lockup-kyokasho.svg" alt="縦糸横糸" width="200" height="48" /></a>
      <div className="hp-header-actions"><a href={reviewOnly ? "#hp-review-notice" : LOGIN}>ログイン</a><button id="hp-menu-toggle" aria-label={menu ? "メニューを閉じる" : "メニューを開く"} aria-expanded={menu} aria-controls="hp-nav" onClick={() => setMenu(!menu)}>{menu ? "閉じる ×" : "メニュー ☰"}</button></div>
      {menu && <nav id="hp-nav" aria-label="メインメニュー">{[["#experience", "縦糸横糸とは"], ["#works", "二つの作品"], ["#price", "料金"], ["#support", "制作のお手伝い"], ["#faq", "よくある質問"]].map(([href,label]) => <a key={href} href={href} onClick={() => setMenu(false)}>{label}<span aria-hidden="true">↗</span></a>)}</nav>}
    </header>

    <main id="hp-main">
      <section className={`hp-hero hp-shell${heroLayout === 'integrated' ? ' hp-hero-integrated' : ''}`} id="top" aria-labelledby="hp-title">
        <div className="hp-hero-title"><SectionLabel>あなたの人生に、耳を澄ます。</SectionLabel><h1 id="hp-title">人生を、<br />声でのこす。</h1></div>
        <figure className="hp-hero-art hp-hero-photo"><img src="/site/hp-renewal/hero-woman-remembering.png" alt="窓辺でスマートフォンを手に、アルバムを前に思い出を辿る女性" width="1536" height="1024" fetchPriority="high" /></figure>
        <div className="hp-hero-body"><p>スマホで問いに答えながら、<br />声で、人生を辿る。</p><p>声と言葉、写真が、<br />一冊の物語になります。</p><TrialLink reviewOnly={reviewOnly} /><p className="hp-note">約10分・カード登録不要。</p></div>
      </section>

      <section className="hp-why hp-section hp-shell" id="experience">
        <SectionLabel>辿ることで、見えてくる。</SectionLabel><h2>人生を、慈しむ。</h2>
        <div className="hp-why-layout"><figure><img src="/site/hajimari-doorway-v2.jpg" alt="庭の光が差し込む戸口で、思い出のページをひらく" loading="lazy" width="1200" height="800" /></figure>
          <div className="hp-why-copy"><p>幼い頃の景色。出会った人。<br />夢中になったこと。家族との時間。</p><p>辿ってみると、忘れていた景色や、<br />今だから気づけることがあります。</p><p>自分の人生を慈しみ、<br />大切な人の人生を、丁寧に受け取る。</p></div></div>
      </section>

      <section className="hp-how hp-section hp-shell" id="how-it-works">
        <SectionLabel>思い出すきっかけを、少しずつ。</SectionLabel><h2>書かなくていい。<br />声で、人生を辿る。</h2>
        <p>縦糸横糸から届く問いに、<br />思い出したことを、そのまま話してください。</p>
        <ol className="hp-how-flow"><li><span className="hp-flow-mark" aria-hidden="true">？</span><h3>問い</h3></li><li><span className="hp-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span><h3>話す</h3></li><li><span className="hp-lines" aria-hidden="true"><i /><i /><i /></span><h3>言葉になる</h3></li></ol>
        <p className="hp-note">人生を辿る、九つのテーマ</p><ul className="hp-themes">{THEMES.map((t,i) => <li key={t}><span>{String(i+1).padStart(2,"0")}</span>{t}</li>)}</ul>
      </section>

      <section className="hp-trial hp-dark" id="trial"><div className="hp-shell hp-section">
        <SectionLabel>無料で体験する、三つの問い</SectionLabel><h2>まずは、三つだけ。</h2><p>最初は思い出しやすい幼い頃から。</p>
        <ol className="hp-questions">{QUESTIONS.map((q,i) => <li key={q}><span>0{i+1}</span><p>{q}</p></li>)}</ol>
        <TrialLink reviewOnly={reviewOnly} /><p className="hp-note">約10分・カード登録不要・自動課金なし。</p>
      </div></section>

      <section className="hp-who hp-section hp-shell">
        <h2>自分でも、<br className="hp-mobile-break" />大切な人とでも。</h2>
        <div className="hp-who-grid">
          <article><Placeholder name="WHO · 自分"><span className="hp-person-circle" aria-hidden="true" /></Placeholder><h3>自分の物語</h3><p>自分のスマホで、<br />自分のペースで。</p></article>
          <article><Placeholder name="WHO · 大切な人"><span className="hp-person-circle hp-pair" aria-hidden="true" /></Placeholder><h3>大切な人の物語</h3><p>一緒でも。<br />おまかせでも。</p></article>
        </div>
        <div className="hp-who-foot"><h3>語る人と、つくる人は、<br className="hp-mobile-break" />同じでなくていい。</h3><p>写真や本への仕上げは、信頼する方に手伝ってもらえます。<br />お手伝いする方を「サポーター」と呼びます。</p></div>
      </section>

      <section className="hp-process hp-section hp-shell"><h2>少しずつ語り、<br className="hp-mobile-break" />一冊に仕上げる。</h2>
        <ol>{["問いが届く", "声で語る", "写真を添える", "一冊に仕上げる"].map((s,i) => <li key={s}><span>0{i+1}</span><h3>{s}</h3></li>)}</ol>
      </section>

      <section className="hp-works" id="works">
        <div className="hp-shell hp-section hp-works-heading"><SectionLabel>人生が、かたちになる。</SectionLabel><h2>語った人生は、<br />二つの作品として残ります。</h2><p>どちらも「縦糸横糸」に含まれます。</p></div>
        <article className="hp-paper-work hp-shell">
          <div className="hp-work-copy"><SectionLabel>縦糸横糸ブック</SectionLabel><h2>人生を、囲む。</h2><p>手に取り、ページをめくる。<br />一冊を囲むことで、<br />家族の会話が生まれる。</p></div>
          <figure><img src="/site/lifestyle.jpg" alt="二人で本を開き、ページを見ながら過ごす時間" loading="lazy" width="1400" height="933" /><figcaption>本を囲む時間のイメージ。標準本はソフトカバーです。</figcaption></figure>
        </article>
        <article className="hp-web-work hp-section hp-shell">
          <div className="hp-work-copy"><SectionLabel>縦糸横糸Webブック</SectionLabel><h2>人生に、逢う。</h2><p>言葉と写真、そして本人の声とともに。<br />離れていても、時が経っても、<br />その人らしさに、また逢える。</p></div>
          <div className="hp-web-experience">
          <h3>本を片手に、<br className="hp-mobile-break" />あの時の声を聞く。</h3>
          <p className="hp-web-bridge">縦糸横糸ブックのQRから、<br />縦糸横糸Webブックへ。</p>
          {/* TODO: Replace this interim visual when a real story's photo, text, voice and Web book UI exceed its quality. Keep the existing UI component available for that review. */}
          <figure className="hp-webbook-visual"><img src="/site/hp-renewal/web-book-qr-voice-screen-v2.png" alt="同じ思い出の写真と文章を載せた本と、声の再生画面を表示するスマートフォンのイメージ" width="1536" height="1024" loading="lazy" /></figure>
          </div>
        </article>
      </section>

      <section className="hp-price hp-section hp-shell" id="price">
        <SectionLabel>体験と、二つの作品。</SectionLabel><h2>縦糸横糸</h2>
        <p className="hp-price-amount">49,800<span>円（税込）</span></p><p>人生を声で辿る体験から、<br />二つの作品として残すところまで。</p>
        <ul className="hp-inclusions"><li>人生を辿る問い</li><li>音声・文章・写真の保存</li><li>縦糸横糸ブック 1冊<span>標準のソフトカバー</span></li><li>縦糸横糸Webブック</li></ul>
        <p className="hp-note">国内送料込み</p><div className="hp-price-actions"><a className="hp-button" href={reviewOnly ? "#hp-review-notice" : PURCHASE}>購入して始める <span aria-hidden="true">↗</span></a><a className="hp-text-link" href={reviewOnly ? "#hp-review-notice" : TRIAL}>先に無料で試す</a></div>
        <LandingBookEditions />
      </section>

      <section className="hp-support hp-section hp-shell" id="support">
        <div><SectionLabel>ともに、かたちにする。</SectionLabel><h2>一人で、全部<br className="hp-mobile-break" />やらなくていい。</h2><p>写真を選ぶ。文章を整える。本に仕上げる。<br />家族や友人など、信頼する方と進められます。</p>
          <div className="hp-support-staff"><h3>頼める方がいない場合も。</h3><p>スタッフによる制作サポートを、<br />少人数で試験的にご案内する予定です。</p><span className="hp-status">希望受付は準備中</span><p className="hp-note">受付開始後は、ご希望を伺ってからスタッフがご連絡します。<br />希望受付の時点で、利用が確定するものではありません。</p></div></div>
        <Placeholder name="SUPPORT"><div className="hp-support-lines" aria-hidden="true" /><span className="hp-art-caption">一緒に選ぶ。<br />一緒に残す。</span></Placeholder>
      </section>

      <section className="hp-privacy hp-section hp-shell"><SectionLabel>大切なことだから。</SectionLabel><h2>残すことと、<br className="hp-mobile-break" />見せることは別です。</h2><p>家族に共有するものは、自分たちで選べます。</p><p>本づくりを手伝う「サポーター」と、<br />完成した物語を見る家族は別です。</p><button className="hp-text-link" onClick={() => setPanel("privacy")}>詳しく見る <span aria-hidden="true">＋</span></button></section>

      <section className="hp-life" id="life"><img src="/site/theme-now-future.jpg" alt="広がる空の下、枝葉を重ねて立つ大きな木" loading="lazy" width="1536" height="1024" /><div className="hp-life-copy hp-shell"><SectionLabel>その先の時間へ。</SectionLabel><h2>そして、<br />人生は続いていく。</h2><p className="hp-life-name">縦糸横糸ライフ</p><span className="hp-status">COMING SOON</span><p>今を残し続け、<br />人生の年輪を重ねていく。</p><p className="hp-note">縦糸横糸の完成後に続く、新しいサービスです。</p></div></section>
      <section className="hp-vision hp-shell hp-section"><SectionLabel>辿る。触れる。重ねる。また、辿る。</SectionLabel><h2>いつでも、<br />“家族に還れる”場所を。</h2><div className="hp-vision-ring" aria-hidden="true" /></section>

      <section className="hp-faq hp-section hp-shell" id="faq"><SectionLabel>安心して、始めるために。</SectionLabel><h2>よくあるご質問</h2><div>{FAQS.map(([q,a]) => <details key={q}><summary>{q}<span aria-hidden="true">＋</span></summary><p>{a}</p></details>)}</div>
        <button className="hp-text-link hp-more-faq" aria-expanded={moreFaq} aria-controls="hp-more-faq" onClick={() => setMoreFaq(!moreFaq)}>{moreFaq ? "追加の質問を閉じる −" : "すべての質問を見る ＋"}</button>
        <div id="hp-more-faq" hidden={!moreFaq}>{MORE_FAQS.map(([q,a]) => <details key={q}><summary>{q}<span aria-hidden="true">＋</span></summary><p>{a}</p></details>)}</div>
      </section>
      <section className="hp-final hp-dark hp-section"><div className="hp-shell"><img src="/brand-logo-symbol.svg" alt="" width="52" height="52" /><h2>まずは、三つだけ。</h2><p>幼い頃のことを、<br />少し話してみませんか。</p><TrialLink reviewOnly={reviewOnly} /><p className="hp-note">約10分・カード登録不要・自動課金なし。</p></div></section>
    </main>
    <footer className="hp-footer hp-shell"><a href="#top"><img src="/brand-logo-lockup-kyokasho.svg" alt="縦糸横糸" width="200" height="48" /></a><div><button onClick={() => setPanel("contact")}>お問い合わせ</button><button onClick={() => setPanel("privacy")}>プライバシー</button><button onClick={() => setPanel("commerce")}>特定商取引法に基づく表記</button></div><p>© SaltLight</p></footer>
    {panel && <InformationDialog reviewOnly={reviewOnly} panel={panel} close={() => setPanel(null)} />}
  </div>;
}
