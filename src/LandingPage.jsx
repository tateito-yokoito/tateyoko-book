import React, { useEffect, useRef, useState } from "react";
import { createRoot } from 'react-dom/client';
import "./landing-parity.css";
import "./monitor-launch.css";
import "./hp-nov8-hero-preview.css";
import "./hp-nenrin-focused-release.css";
import StoryIntro from './landing/StoryIntro.jsx';
import SupportConsultationInline from './SupportConsultationInline.jsx';

const LOGIN = "/?app=1&entry=login";
const TRIAL = import.meta.env.VITE_GUEST_TRIAL_ENABLED === 'true'
  ? '/?guest_trial=1' : '/?app=1&entry=trial';
const PURCHASE = "/?app=1&entry=purchase";
const GIFT_PURCHASE = PURCHASE;
const EMAIL = "sugawara@saltlight.co.jp";
const QUESTIONS = [
  "幼い頃、どんなところに住んでいましたか？",
  "その頃、よく一緒にいた人を一人思い浮かべてください。どんな人でしたか？",
  "その頃、どんな遊びが好きでしたか？"
];
const FAQS = [
  ["スマートフォンが苦手でも使えますか？", "問いを読み、録音ボタンを押して話すところから始められます。写真や文章の整理、本に仕上げる作業は、信頼する方に手伝ってもらうこともできます。"],
  ["親の物語を、子どものスマホだけで作れますか？", "ギフトでは、ご本人が制作する方法と、ご家族が制作を管理する方法を選べます。聞き取り制作サポートも事前相談後に追加できます。"],
  ["離れていても手伝えますか？", "信頼する方をサポーターとして招き、離れた場所から制作を手伝ってもらう仕組みです。利用できる範囲と手順は、ご案内時に確認できます。"],
  ["無料体験後に自動課金されますか？", "自動課金はありません。無料の3問にカード登録は不要です。続けたいと思ったときに、ご自身で購入を選べます。"],
  ["どのくらいで完成しますか？", "語る量やペースによって異なります。一度にすべてを話す必要はありません。製本・発送の時期は、内容が確定してからご案内します。"],
  ["語った内容は誰に見えますか？", "完成した物語を家族に見せる範囲は、自分たちで選べます。Webブックの共有リンクや暗証番号は、見せたい相手にお伝えください。"],
  ["サポーターには何が見えますか？", "サポーターは、本づくりを手伝うために語りや写真などの制作情報を扱います。完成した物語を閲覧する家族とは役割が異なります。依頼するときに、制作のために共有する範囲を確認してください。"],
  ["途中で休んでも大丈夫ですか？", "一度に語り終える必要はありません。無理のないペースで進められます。利用期間などの条件は、お申し込み時の案内をご確認ください。"]
];
const MORE_FAQS = [
  ["料金には何が含まれますか？", "スタンダード35,000円、プレミアム65,000円（いずれも税込）。どちらもブック1冊とWebブックを含み、違いは紙のブックの装丁です。聞き取り制作サポートは事前相談後に20,000円（税込）で追加できます。"],
  ["スタンダードとプレミアムの違いは何ですか？", "違いは紙のブックの装丁です。スタンダードはソフトカバー、プレミアムは布貼り上製本・箔押しです。問い、制作体験、Webブックは共通です。"],
  ["ギフトの返金保証はありますか？", "新規ギフトには決済日から45日以内、かつ本編開始前までの返金保証があります。詳しい条件は購入画面でご確認ください。"],
  ["本から声を聴けますか？", "縦糸横糸ブックのQRから、縦糸横糸Webブックへ進み、声を聴けます。紙の作品を読む時間と、声に触れる時間のどちらも楽しめます。"]
];

function TrialLink({ reviewOnly = false }) {
  return <a className="hp-button" href={reviewOnly ? "#hp-review-notice" : TRIAL}>無料で3問、話してみる <span aria-hidden="true">↗</span></a>;
}
function Placeholder({ name, children, className = "" }) {
  return <div className={"hp-placeholder " + className}><span className="hp-placeholder-label">ビジュアル仮置き · {name}</span>{children}</div>;
}
function SectionLabel({ children }) { return <p className="hp-label">{children}</p>; }

function MonitorApplicationDialog({ close, reviewOnly }) {
  const dialog = useRef(null);
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    return () => { previous?.focus(); };
  }, []);
  const prepareDraft = event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const email = String(form.get("email") || "").trim();
    const interest = String(form.get("interest") || "").trim();
    if (!name || !email) return;
    const body = [
      "縦糸横糸のモニター利用を希望します。",
      "",
      `お名前：${name}`,
      `返信先メールアドレス：${email}`,
      `残したい物語：${interest || "未記入"}`
    ].join("\n");
    setDraft(`mailto:${EMAIL}?subject=${encodeURIComponent("縦糸横糸 モニター利用のお申し込み")}&body=${encodeURIComponent(body)}`);
  };
  return <dialog className="hp-monitor-dialog" ref={dialog} aria-labelledby="hp-monitor-title" onCancel={close} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="hp-monitor-dialog-inner">
      <button className="hp-monitor-close" type="button" onClick={close} aria-label="閉じる">×</button>
      <h2 id="hp-monitor-title">モニター利用のお申し込み</h2>
      <p>正式リリース前のサービスをご案内しています。お申し込みをいただいた後、運営からご連絡します。</p>
      <form onSubmit={prepareDraft} onChange={() => setDraft(null)}>
        <label>お名前<input name="name" type="text" autoComplete="name" maxLength="80" required /></label>
        <label>メールアドレス<input name="email" type="email" autoComplete="email" maxLength="254" required /></label>
        <label>どなたの物語を残したいですか（任意）<textarea name="interest" maxLength="500" placeholder="ご自身・ご家族など" /></label>
        <button className="hp-monitor-primary" type="submit">申込メールを作成する</button>
      </form>
      {draft && <div className="hp-monitor-draft" role="status">
        <p>メールアプリが開きます。内容を確認し、送信してください。</p>
        <a className="hp-monitor-primary" href={reviewOnly ? "#hp-review-notice" : draft}>メールアプリを開く ↗</a>
        {!reviewOnly && <p className="hp-monitor-fallback">開かない場合は、{EMAIL} に「モニター利用希望」とメールしてください。</p>}
      </div>}
      <p className="hp-monitor-note">入力内容は、この画面では送信・保存されません。メールアプリで送信して初めてお申し込みとなります。</p>
    </div>
  </dialog>;
}

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
      {panel === "privacy" && <><p>本づくりを手伝うサポーターと、完成した物語を見る家族は別の役割です。</p><p>サポーターは制作に必要な情報を扱います。完成した物語の共有範囲とは分けて、ご本人の同意のもとで依頼してください。</p><p>録音、文章、写真、アカウント情報は、サービスの提供とサポートに必要な範囲で取り扱います。ご質問は運営窓口へご連絡ください。</p><p>操作のお困りごとへの対応と不具合の改善のため、配信リンクからのアクセス、ログインや問いの画面表示、録音・保存の操作状況、エラーの種類をアカウント・物語に関連付けて記録します。この操作記録に、お話の内容、入力した文章、録音データは含めません。</p><p>詳細な操作記録は90日を過ぎた後、毎日の削除処理で削除します。配信結果や保存した語りの履歴は別に管理します。操作記録はサポートを担当する管理者が確認し、広告目的には利用しません。</p></>}
      {panel === "commerce" && <dl>{[
        ["販売事業者", "株式会社SaltLight"], ["運営責任者", "菅原 英俊"], ["連絡先", EMAIL],
        ["販売価格", "スタンダード 35,000円（税込）、プレミアム 65,000円（税込）。聞き取り制作サポートは各プランに20,000円（税込）で追加できます。追加冊子はスタンダード5,000円／冊、プレミアム35,000円／冊（いずれも税込）。"],
        ["支払方法", "クレジットカード決済（Stripe）"],
        ["提供時期", "購入後にご利用を開始できます。冊子は内容確定後に製本し、発送時にご案内します。"],
        ["取消・返金", "適用条件を確認のうえ個別にご案内します。お申し込み前にご相談いただけます。"],
        ["所在地・電話番号", "請求があった場合、遅滞なく電子メールで開示します。"]
      ].map(([k,v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
    </div></dialog>;
}

function ProductImageDialog({ product, close }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.current.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);
  return <dialog className="hp-product-zoom" ref={dialog} aria-labelledby="hp-product-zoom-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="hp-product-zoom-inner">
      <button type="button" className="hp-product-zoom-close" onClick={close} aria-label="拡大画像を閉じる">×</button>
      <img src={product.src} alt={product.alt} width="1536" height="1024" />
      <p id="hp-product-zoom-title">{product.title}</p>
    </div>
  </dialog>;
}

export default function LandingPage({ reviewOnly = false, heroLayout = 'integrated' }) {
  const nov8Preview = true;
  const [menu, setMenu] = useState(false);
  const [panel, setPanel] = useState(null);
  const [zoomedProduct, setZoomedProduct] = useState(null);
  const [moreFaq, setMoreFaq] = useState(false);
  const [monitorApplicationOpen, setMonitorApplicationOpen] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('info') === 'privacy') setPanel('privacy');
  }, []);
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
    {reviewOnly && <div id="hp-review-notice" className="hp-preview-note" role="note">HP Preview <span>表示確認専用：登録・購入・ログイン・送信はできません。</span></div>}
    {!nov8Preview && <div className="hp-monitor-strip" role="note" aria-label="モニター利用のご案内">
      <p><strong>正式リリース前</strong><span aria-hidden="true">｜</span>現在はモニター利用をご案内しています。</p>
      <button type="button" onClick={() => setMonitorApplicationOpen(true)}>モニター利用を申し込む <span aria-hidden="true">↗</span></button>
    </div>}
    <header className="hp-header">
      <a href="#top" aria-label="縦糸横糸 トップへ"><img src="/brand-logo-official.svg" alt="縦糸横糸" width="200" height="48" /></a>
      <div className="hp-header-actions"><a href={reviewOnly ? "#hp-review-notice" : LOGIN}>ログイン</a><button id="hp-menu-toggle" aria-label={menu ? "メニューを閉じる" : "メニューを開く"} aria-expanded={menu} aria-controls="hp-nav" onClick={() => setMenu(!menu)}>{menu ? "閉じる ×" : "メニュー ☰"}</button></div>
      {menu && <nav id="hp-nav" aria-label="メインメニュー">{[["#experience", "縦糸横糸とは"], ["#works", "二つの作品"], ["#price", "料金"], ["#support", "制作のお手伝い"], ["#faq", "よくある質問"]].map(([href,label]) => <a key={href} href={href} onClick={() => setMenu(false)}>{label}<span aria-hidden="true">↗</span></a>)}</nav>}
    </header>

    <main id="hp-main">
      <section className={`hp-hero hp-shell${heroLayout === 'integrated' ? ' hp-hero-integrated' : ''}${nov8Preview ? ' hp-hero-nov8' : ''}`} id="top" aria-labelledby="hp-title">
        <div className="hp-hero-title">{nov8Preview ? <>
          <h1 id="hp-title">誰にだって、<br />まだ語られていない<br />人生がある。</h1>
          <p className="hp-hero-category">声も残せる。季節とともに育つ。<br />自分史づくりの新しいかたち。</p>
        </> : <h1 id="hp-title">人生を、<br />声でのこす。</h1>}</div>
        <figure className="hp-hero-art hp-hero-photo"><img src="/site/hp-renewal/hero-woman-remembering.png" alt="窓辺でスマートフォンを手に、アルバムを前に思い出を辿る女性" width="1536" height="1024" fetchPriority="high" /></figure>
        <div className="hp-hero-body">{nov8Preview ? <div className="hp-hero-offer">
          <p className="hp-hero-ease">スマホに届く質問に、つぶやくだけ。<br />人生の物語を、一冊の本とWebブックに。</p>
          <figure className="hp-hero-products" id="experience"><img src="/site/hp-renewal/book-web-pair-mobile.jpg" alt="一冊の縦糸横糸ブックと、声や写真に触れられるWebブックを並べたイメージ" width="1536" height="1024" loading="eager" /></figure>
          <div className="hp-hero-start">
            <div className="hp-hero-benefits" aria-label="縦糸横糸でできること">
              <div className="hp-hero-benefit"><span className="hp-hero-benefit-icons" aria-hidden="true"><span className="hp-hero-benefit-icon"><svg viewBox="0 0 32 32" fill="none"><path d="M13 22c-4-2-6-5-6-9a9 9 0 0 1 15-7m-9 16-2 5 6-2m7-15c3 2 3 9 0 12m4-16c4 5 4 15 0 20"/></svg></span><span className="hp-hero-benefit-icon"><svg viewBox="0 0 32 32" fill="none"><rect x="3" y="5" width="26" height="22" rx="2"/><circle cx="11" cy="12" r="2"/><path d="m5 23 7-7 5 5 4-4 6 6"/></svg></span><span className="hp-hero-benefit-icon"><svg viewBox="0 0 32 32" fill="none"><rect x="3" y="5" width="26" height="22" rx="3"/><path d="m13 11 8 5-8 5z"/></svg></span></span><p><strong>声も、写真も、動画も。</strong><span>思い出を、そのまま残せる。</span></p></div>
              <div className="hp-hero-benefit"><span className="hp-hero-benefit-icons" aria-hidden="true"><span className="hp-hero-benefit-icon"><svg viewBox="0 0 32 32" fill="none"><rect x="6" y="13" width="20" height="16" rx="3"/><path d="M10 13V9a6 6 0 0 1 12 0v4"/><circle cx="16" cy="21" r="1.5"/><path d="M16 22.5v2"/></svg></span><span className="hp-hero-benefit-icon"><svg viewBox="0 0 32 32" fill="none"><circle cx="12" cy="10" r="4"/><path d="M4 26v-2a8 8 0 0 1 13-6m4-9h7m-3-3 3 3-3 3m-6 7h9m-3-3 3 3-3 3"/></svg></span></span><p><strong>自分だけの記録にも。</strong><span>いつか、大切な人と分かち合うことも。</span></p></div>
              <div className="hp-hero-benefit"><span className="hp-hero-benefit-icon" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><path d="M24 42V24m0 9c-10 0-16-7-16-18 9 0 16 5 16 14m0 2c0-11 6-18 16-18 0 11-6 18-16 18"/></svg></span><p><strong>完成後も、育っていく。</strong><span>季節ごとに、新しい語りを重ねられる。</span></p></div>
            </div>
            <div className="hp-hero-start-actions">
              <a className="hp-button" href={reviewOnly ? '#hp-review-notice' : TRIAL}>登録不要の無料3問を試す <span aria-hidden="true">↗</span></a>
              <a className="hp-hero-purchase-link hp-hero-purchase-button" href={reviewOnly ? '#hp-review-notice' : PURCHASE}>商品を選んで購入する <span aria-hidden="true">→</span></a>
            </div>
          </div>
        </div> : <><p>スマホに届く質問に、つぶやくだけ。<br /><strong>あなたの人生が、家族に残る物語になる。</strong></p><div className="hp-hero-start"><p className="hp-hero-start-description">自分や大切な人の歩みと想いを、問いに声や文章で答えながら記録。写真・声・動画も添えて、ブックとWebブックに仕上げます。</p><p className="hp-hero-start-after">家族と分かち合い、完成後も季節ごとに記録を重ねていけます。</p><div className="hp-hero-start-actions"><a className="hp-button" href={reviewOnly ? '#hp-review-notice' : TRIAL}>登録不要の無料3問を試す <span aria-hidden="true">↗</span></a><a className="hp-hero-purchase-link" href={reviewOnly ? '#hp-review-notice' : PURCHASE}>商品を選んで購入する <span aria-hidden="true">→</span></a></div></div></>}
        </div>
      </section>

      {!nov8Preview && <section className="hp-v4-answer hp-shell" id="experience" aria-labelledby="v4-answer-title">
        <h2 id="v4-answer-title">語りは、二つの作品に。</h2>
        <div className="hp-v4-answer-grid">
          <article><figure><button type="button" className="hp-v4-answer-image" aria-haspopup="dialog" aria-label="縦糸横糸ブックの写真を拡大" onClick={() => setZoomedProduct({ title: '縦糸横糸ブック', src: '/site/hp-story-preview/book-and-spread-user.png', alt: '縦糸横糸ブックの表紙と、写真・文章を収めた見開き' })}><img src="/site/hp-story-preview/book-and-spread-user.png" alt="" width="1536" height="1024" loading="eager" /><span aria-hidden="true">＋</span></button></figure><h3>縦糸横糸ブック</h3><p>ここまでの人生を、一冊に。</p></article>
          <article><figure><button type="button" className="hp-v4-answer-image" aria-haspopup="dialog" aria-label="縦糸横糸Webブックの写真を拡大" onClick={() => setZoomedProduct({ title: '縦糸横糸Webブック', src: '/site/hp-story-preview/web-book-user.png', alt: '本のQRから声や写真に触れるWebブックのイメージ' })}><img src="/site/hp-story-preview/web-book-user.png" alt="" width="1536" height="1024" loading="eager" /><span aria-hidden="true">＋</span></button></figure><h3>縦糸横糸Webブック</h3><p>声と写真に、いつでも逢える。</p></article>
        </div>
        <a className="hp-button hp-v4-answer-cta" href={reviewOnly ? "#hp-review-notice" : TRIAL}>無料で3問、話してみる。 <span aria-hidden="true">↗</span></a>
        <p className="hp-note hp-v4-answer-note">カード登録不要。</p>
      </section>}

      <StoryIntro nov8Preview={nov8Preview} />

      {nov8Preview && <section className="hp-nenrin hp-section hp-shell" id="nenrin" aria-labelledby="hp-nenrin-title">
        <div className="hp-nenrin-intro">
          <SectionLabel>縦糸横糸｜年輪 nenrin</SectionLabel>
          <h2 id="hp-nenrin-title">作って終わらない。<br />年輪を刻むように。</h2>
          <p>一冊の本が完成しても、人生は続いていく。<br />3か月ごと、年4回。新しい記録を、少しずつ重ねていけます。</p>
        </div>
        <div className="hp-nenrin-stories" aria-label="年輪の記録の例">
          {[
            { number: '01', title: '今しかない想いを、残す', date: '2027年 春｜子どもの小学校入学', image: '/site/hp-renewal/nenrin/spring-school.jpg', alt: '桜の下をランドセルを背負った子どもと両親が歩く後ろ姿', voice: '「小さかったあの子が、もう小学生。今日の気持ちを、いつかこの子にも伝えたい。」', value: '人生の節目に、そのときの想いを。' },
            { number: '02', title: '思い出は、あとからよみがえる', date: '2027年 秋｜幼い頃のこと', image: '/site/hp-renewal/nenrin/autumn-album.jpg', alt: '祖母と幼い女の子の写真を、古いアルバムからスマートフォンで撮影する女性', voice: '「去年はおじいちゃんの話をしたけれど、今度はおばあちゃんとの思い出も、写真と一緒に残しておきたくなった。」', value: '一度で、すべてを語らなくてもいい。' },
            { number: '03', title: '家族から届いた言葉も、残す', date: '2027年 冬｜誕生日のこと', image: '/site/hp-renewal/nenrin/winter-letter.jpg', alt: '子どもからの手書きの誕生日の手紙をスマートフォンで撮影する場面', voice: '「また一つ歳を重ねた。子どもからもらった手紙が、何より嬉しかった。いつの間にか、こんな言葉を書けるようになったんだなあ。」', value: '家族の想いも、人生の大切な記録。' },
          ].map(story => <article className="hp-nenrin-story" key={story.number}>
            <figure><img src={story.image} alt={story.alt} width="1448" height="1086" loading="eager" fetchPriority="low" /></figure>
            <div className="hp-nenrin-story-copy"><p className="hp-nenrin-story-number">CARD {story.number}</p><h3>{story.title}</h3><p className="hp-nenrin-story-date">{story.date}</p><p className="hp-nenrin-story-voice">{story.voice}</p><p className="hp-nenrin-story-value">{story.value}</p></div>
          </article>)}
        </div>
        <p className="hp-nenrin-swipe">横にスワイプして次の記録へ <span aria-hidden="true">→</span></p>
      </section>}

      <section className="hp-v4-scenes hp-section hp-shell" id="scenes" aria-labelledby="scenes-title">
        <h2 id="scenes-title">誰の人生を、残しますか。</h2>
        <div className="hp-v4-scenes-grid">
          <article className="hp-v4-scene-card hp-v4-scene-family">
            <p className="hp-v4-scene-label" lang="en">For Family</p>
            <h3>家族に語ってもらう。</h3>
            <p className="hp-v4-scene-copy">親や大切な人の人生を残したい方へ。<br />“いつか聞こう”を今かたちに。</p>
            <figure className="hp-v4-scene-photo hp-v4-scene-photo-family"><img src="/site/hp-story-preview/usage-scenes-reference.png" alt="アルバムを広げながら、スマートフォンを見て語り合うシニア夫婦" width="1200" height="1310" loading="lazy" /></figure>
            <p className="hp-v4-scene-tag-label">こんなときに</p>
            <ul className="hp-v4-scene-tags"><li>還暦・古希</li><li>退職祝い</li><li>誕生日</li><li>母の日・父の日</li><li>親孝行ギフト</li></ul>
            <p className="hp-v4-scene-assist"><strong>あなたの端末から、語りや仕上げのお手伝いもできます。</strong></p>
            <a className="hp-v4-scene-action" href={reviewOnly ? '#hp-review-notice' : PURCHASE}>ギフトとして購入する <span aria-hidden="true">→</span></a>
          </article>
          <article className="hp-v4-scene-card hp-v4-scene-you">
            <p className="hp-v4-scene-label" lang="en">For You</p>
            <h3>自分で語ってみる。</h3>
            <p className="hp-v4-scene-copy">自分の人生を残したい方へ。<br />出てきた言葉を大切に残す。</p>
            <figure className="hp-v4-scene-photo hp-v4-scene-photo-you"><img src="/site/hp-story-preview/usage-scenes-reference.png" alt="書斎で静かにスマートフォンに語る男性と、明るい部屋でスマートフォンを持つ女性" width="1200" height="1310" loading="lazy" /><span className="hp-v4-scene-photo-younger" aria-hidden="true"><img src="/site/hp-story-preview/usage-scenes-younger-man.png" alt="" width="1200" height="1310" loading="lazy" /></span></figure>
            <p className="hp-v4-scene-tag-label">こんなときに</p>
            <ul className="hp-v4-scene-tags"><li>人生の節目</li><li>退職</li><li>家族が増えたとき</li><li>これからの人生を考えるとき</li></ul>
            <a className="hp-v4-scene-action" href={reviewOnly ? '#hp-review-notice' : TRIAL}>無料3問を試す <span aria-hidden="true">→</span></a>
          </article>
        </div>
      </section>

      {!nov8Preview && <section className="hp-trial hp-dark" id="trial"><div className="hp-shell hp-section">
        <SectionLabel>無料で体験する、三つの問い</SectionLabel><h2>まずは、三つだけ。</h2><p>最初は思い出しやすい幼い頃から。</p>
        <ol className="hp-questions">{QUESTIONS.map((q,i) => <li key={q}><span>0{i+1}</span><p>{q}</p></li>)}</ol>
        <TrialLink reviewOnly={reviewOnly} /><p className="hp-note">約10分・カード登録不要・自動課金なし。</p>
      </div></section>}

      {!nov8Preview && <><section className="hp-who hp-section hp-shell">
        <h2>自分でも、<br className="hp-mobile-break" />大切な人とでも。</h2>
        <div className="hp-who-grid">
          <article><Placeholder name="WHO · 自分"><span className="hp-person-circle" aria-hidden="true" /></Placeholder><h3>自分の物語</h3><p>自分のスマホで、<br />自分のペースで。</p></article>
          <article><Placeholder name="WHO · 大切な人"><span className="hp-person-circle hp-pair" aria-hidden="true" /></Placeholder><h3>大切な人の物語</h3><p>一緒でも。<br />おまかせでも。</p></article>
        </div>
        <div className="hp-who-foot"><h3>語る人と、つくる人は、<br className="hp-mobile-break" />同じでなくていい。</h3><p>写真や本への仕上げは、信頼する方に手伝ってもらえます。<br />お手伝いする方を「サポーター」と呼びます。</p></div>
      </section>

      <section className="hp-process hp-section hp-shell"><h2>少しずつ語り、<br className="hp-mobile-break" />一冊に仕上げる。</h2>
        <ol>{["問いが届く", "声で語る", "写真を添える", "一冊に仕上げる"].map((s,i) => <li key={s}><span>0{i+1}</span><h3>{s}</h3></li>)}</ol>
      </section></>}

      {!nov8Preview && <section className="hp-works" id="works">
        <div className="hp-shell hp-section hp-works-heading"><SectionLabel>人生が、かたちになる。</SectionLabel><h2>語った人生は、<br />二つの作品として残ります。</h2><p>どちらも「縦糸横糸」に含まれます。</p></div>
        <figure className="hp-works-overview hp-shell"><img src="/site/hp-renewal/book-and-webbook-approved.png" alt="縦糸横糸ブックと、写真・文章・本人の声に触れる縦糸横糸Webブックのイメージ" width="1536" height="1024" loading="lazy" /></figure>
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
      </section>}

      {nov8Preview && <section id="works" aria-label="商品と価格の全体プレビュー"><div id="price"><iframe title="縦糸横糸｜年輪の商品・価格と聞き取り制作サポート" src="/product-section-nov8-after.html?embedded=1" allowFullScreen style={{display:'block',width:'100%',height:2600,border:0}} onLoad={event => { const frame=event.currentTarget; const body=frame.contentDocument?.body; if (!body) return; const resize=()=>{frame.style.height=`${Math.ceil(body.scrollHeight)}px`}; resize(); new ResizeObserver(resize).observe(body); for (const [selector, target] of [[".action-trial",TRIAL],[".action-purchase",PURCHASE],[".action-gift-purchase",GIFT_PURCHASE]]) { const link=body.querySelector(selector); if(link){link.dataset.releaseHref=target;link.href=reviewOnly?"#hp-review-notice":target;} }
        {
          const cta = body.querySelector('.consultation-cta');
          const free = body.querySelector('.consultation-free');
          if (cta && free) {
            const style = body.ownerDocument.createElement('link');
            style.rel = 'stylesheet';
            style.href = '/support-consultation-inline.css';
            body.ownerDocument.head.append(style);
            const mount = body.ownerDocument.createElement('div');
            mount.id = 'inline-consultation';
            mount.hidden = true;
            free.after(mount);
            createRoot(mount).render(<SupportConsultationInline reviewOnly={reviewOnly} />);
            cta.href = '#inline-consultation';
            cta.textContent = '事前相談フォームを開く';
            cta.setAttribute('role', 'button');
            cta.setAttribute('aria-controls', mount.id);
            cta.setAttribute('aria-expanded', 'false');
            cta.addEventListener('click', click => {
              click.preventDefault();
              mount.hidden = !mount.hidden;
              cta.textContent = mount.hidden ? '事前相談フォームを開く' : '事前相談フォームを閉じる';
              cta.setAttribute('aria-expanded', String(!mount.hidden));
              resize();
            });
          }
        }
      }} /></div></section>}
      {!nov8Preview && <section className="hp-support hp-section hp-shell" id="support">
        <div><SectionLabel>ともに、かたちにする。</SectionLabel><h2>一人で、全部<br className="hp-mobile-break" />やらなくていい。</h2><p>写真を選ぶ。文章を整える。本に仕上げる。<br />家族や友人など、信頼する方と進められます。</p>
          <div className="hp-support-staff"><h3>頼める方がいない場合も。</h3><p>スタッフによる制作サポートを、<br />少人数で試験的にご案内する予定です。</p><span className="hp-status">希望受付は準備中</span><p className="hp-note">受付開始後は、ご希望を伺ってからスタッフがご連絡します。<br />希望受付の時点で、利用が確定するものではありません。</p></div></div>
        <Placeholder name="SUPPORT"><div className="hp-support-lines" aria-hidden="true" /><span className="hp-art-caption">一緒に選ぶ。<br />一緒に残す。</span></Placeholder>
      </section>}

      <section className="hp-privacy hp-section hp-shell"><SectionLabel>大切なことだから。</SectionLabel><h2>残すことと、<br className="hp-mobile-break" />見せることは別です。</h2><p>家族に共有するものは、自分たちで選べます。</p><p>本づくりを手伝う「サポーター」と、<br />完成した物語を見る家族は別です。</p><button className="hp-text-link" onClick={() => setPanel("privacy")}>詳しく見る <span aria-hidden="true">＋</span></button></section>

      {!nov8Preview && <section className="hp-life" id="life"><img src="/site/theme-now-future.jpg" alt="広がる空の下、枝葉を重ねて立つ大きな木" loading="lazy" width="1536" height="1024" /><div className="hp-life-copy hp-shell"><SectionLabel>その先の時間へ。</SectionLabel><h2>そして、<br />人生は続いていく。</h2><p className="hp-life-name">縦糸横糸ライフ</p><span className="hp-status">COMING SOON</span><p>今を残し続け、<br />人生の年輪を重ねていく。</p><p className="hp-note">縦糸横糸の完成後に続く、新しいサービスです。</p></div></section>}
      <section className="hp-vision hp-shell hp-section"><SectionLabel>辿る。触れる。重ねる。また、辿る。</SectionLabel><h2>いつでも、<br />“家族に還れる”場所を。</h2><div className="hp-vision-ring" aria-hidden="true" /></section>

      <section className="hp-faq hp-section hp-shell" id="faq"><SectionLabel>安心して、始めるために。</SectionLabel><h2>よくあるご質問</h2><div>{FAQS.map(([q,a]) => <details key={q}><summary>{q}<span aria-hidden="true">＋</span></summary><p>{a}</p></details>)}</div>
        <><button className="hp-text-link hp-more-faq" aria-expanded={moreFaq} aria-controls="hp-more-faq" onClick={() => setMoreFaq(!moreFaq)}>{moreFaq ? "追加の質問を閉じる −" : "すべての質問を見る ＋"}</button>
        <div id="hp-more-faq" hidden={!moreFaq}>{MORE_FAQS.map(([q,a]) => <details key={q}><summary>{q}<span aria-hidden="true">＋</span></summary><p>{a}</p></details>)}</div></>
      </section>
      <section className="hp-final hp-dark hp-section"><div className="hp-shell"><img src="/brand-logo-symbol.svg" alt="" width="52" height="52" /><h2>まずは、三つだけ。</h2><p>幼い頃のことを、<br />少し話してみませんか。</p><TrialLink reviewOnly={reviewOnly} /><p className="hp-note">約10分・カード登録不要・自動課金なし。</p></div></section>
    </main>
    <footer className="hp-footer hp-shell"><a href="#top"><img src="/brand-logo-official.svg" alt="縦糸横糸" width="200" height="48" /></a><div><button onClick={() => setPanel("contact")}>お問い合わせ</button><button onClick={() => setPanel("privacy")}>プライバシー</button><button onClick={() => setPanel("commerce")}>特定商取引法に基づく表記</button></div><p>© 縦糸横糸</p></footer>
    {panel && <InformationDialog reviewOnly={reviewOnly} panel={panel} close={() => setPanel(null)} />}
    {monitorApplicationOpen && <MonitorApplicationDialog reviewOnly={reviewOnly} close={() => setMonitorApplicationOpen(false)} />}
    {zoomedProduct && <ProductImageDialog product={zoomedProduct} close={() => setZoomedProduct(null)} />}
  </div>;
}
