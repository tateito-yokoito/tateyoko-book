import React, { useEffect, useState } from "react";
import "./landing.css";

const APP_ENTRY_URL = "/?app=1";
const TRIAL_ENTRY_URL = "/?app=1&entry=trial";
const PURCHASE_ENTRY_URL = "/?app=1&entry=purchase";

function BrandMark({ compact = false }) {
  return (
    <span className={`landing-brand ${compact ? "is-compact" : ""}`}>
      <svg
        className="landing-brand-mark"
        viewBox="0 0 64 64"
        aria-hidden="true"
      >
        <g fill="none" strokeLinecap="round" strokeWidth="3.2">
          <path stroke="#173f70" d="M10 23h44M8 29h48M8 35h48M10 41h44" />
          <path stroke="#c84b1d" d="M23 10v44M29 8v48M35 8v48M41 10v44" />
          <rect x="13" y="13" width="38" height="38" rx="14" stroke="#173f70" />
          <rect x="18" y="8" width="28" height="48" rx="12" stroke="#c84b1d" />
        </g>
      </svg>
      <span>縦糸横糸</span>
    </span>
  );
}

function ArrowLink({ children }) {
  return <span className="landing-arrow-link">{children}<span aria-hidden="true">→</span></span>;
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.body.classList.add("landing-page-active");
    return () => document.body.classList.remove("landing-page-active");
  }, []);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="landing-site">
      <header className="landing-header">
        <button
          type="button"
          className="landing-menu-button"
          onClick={() => setMenuOpen(value => !value)}
          aria-expanded={menuOpen}
          aria-controls="landing-navigation"
        >
          <span>Menu</span>
          <span className="landing-menu-lines" aria-hidden="true"><i /><i /></span>
        </button>

        <a className="landing-header-brand" href="#top" aria-label="縦糸横糸 トップへ">
          <BrandMark compact />
        </a>

        <a className="landing-login" href={APP_ENTRY_URL}>ログイン</a>

        <nav
          id="landing-navigation"
          className={`landing-navigation ${menuOpen ? "is-open" : ""}`}
          aria-hidden={!menuOpen}
        >
          <a href="#experience" onClick={closeMenu}>体験</a>
          <a href="#how-it-works" onClick={closeMenu}>仕組み</a>
          <a href="#price" onClick={closeMenu}>料金</a>
          <a href="#faq" onClick={closeMenu}>よくある質問</a>
          <a href={APP_ENTRY_URL}>ログイン</a>
        </nav>
      </header>

      <main id="top">
        <section className="landing-hero landing-shell" aria-labelledby="landing-title">
          <div className="landing-hero-media">
            <img src="/site/hero-book.jpg" alt="深緑の布張りで仕上げた縦糸横糸ブック" />
            <div className="landing-hero-copy">
              <p className="landing-eyebrow">声で残す、家族の物語</p>
              <h1 id="landing-title">声を、<br />本にする。</h1>
              <p className="landing-hero-lead">時を越えて、<br />家族に残る声がある。</p>
              <p className="landing-hero-description">
                毎週届く問いに、声で答える。<br />
                語った言葉と写真を、音声QR付きの一冊に仕上げます。
              </p>
              <div className="landing-actions">
                <a className="landing-primary-button" href={TRIAL_ENTRY_URL}>
                  無料で3問を試す <span aria-hidden="true">→</span>
                </a>
                <a
                  className="landing-secondary-link"
                  href={PURCHASE_ENTRY_URL}
                >
                  購入して始める
                </a>
              </div>
              <p className="landing-hero-note">約10分・カード登録不要・自動課金なし</p>
            </div>
          </div>
        </section>

        <section className="landing-intro landing-shell landing-section" id="experience">
          <div className="landing-section-number">01</div>
          <div className="landing-intro-copy">
            <p className="landing-kicker">ひとつのサービスから、三つの始まり方。</p>
            <h2>語る人と、残したい人に合わせて。</h2>
            <p>
              自分自身の歩みも、大切な人への贈りものも、故人を囲む記憶も。<br />
              それぞれに合った入口から始められます。
            </p>
          </div>

          <div className="landing-paths">
            <article>
              <p className="landing-path-label">自分</p>
              <h3>自分の物語をつくる</h3>
              <p>ご自身の声で、これまでの歩みを残します。</p>
              <a href={TRIAL_ENTRY_URL}><ArrowLink>無料で試す</ArrowLink></a>
            </article>
            <article>
              <p className="landing-path-label">贈る</p>
              <h3>大切な人へ、<br />物語づくりを届ける</h3>
              <p>まず無料で試してもらい、贈るだけでも、お手伝いしながら一緒につくる形にもできます。</p>
              <a href="#gift"><ArrowLink>贈り方を見る</ArrowLink></a>
            </article>
            <article>
              <p className="landing-path-label">偲ぶ</p>
              <h3>故人の記憶を残す</h3>
              <p>家族や親しい方の記憶を集め、ひとつの物語に。複数の方に語ってもらうこともできます。</p>
              <a href="#memorial"><ArrowLink>残し方を見る</ArrowLink></a>
            </article>
          </div>
        </section>

        <section className="landing-trial landing-section" id="gift">
          <div className="landing-shell landing-trial-grid">
            <div>
              <div className="landing-section-number">02</div>
              <p className="landing-kicker">最初は、味見から。</p>
              <h2>無料で、三つの問いに<br />語ってみる。</h2>
              <p className="landing-body-copy">
                話すことに慣れる問いから始まり、答えやすい記憶へ。最後は、少し心に触れる問いへ進みます。
                約10分で、声が文章になる体験まで確認できます。
              </p>
              <div className="landing-actions landing-actions-dark">
                <a className="landing-primary-button" href={TRIAL_ENTRY_URL}>無料体験を始める <span>→</span></a>
              </div>
              <p className="landing-small-note">体験した内容は、購入後もそのまま引き継がれます。</p>
            </div>

            <ol className="landing-trial-steps">
              <li><span>01</span><div><strong>声を出してみる</strong><p>お名前と、今いる場所から。</p></div></li>
              <li><span>02</span><div><strong>ひとつ思い出す</strong><p>答えやすい記憶を、短く。</p></div></li>
              <li><span>03</span><div><strong>心に触れる</strong><p>少し大切な記憶を、言葉に。</p></div></li>
            </ol>
          </div>
        </section>

        <section className="landing-story landing-shell landing-section" id="how-it-works">
          <div className="landing-story-grid">
            <figure className="landing-figure">
              <img src="/site/lifestyle.jpg" alt="家族で縦糸横糸ブックを開く時間のイメージ" />
              <figcaption>語った時間が、家族に手渡せる一冊になります。</figcaption>
            </figure>
            <div>
              <div className="landing-section-number">03</div>
              <p className="landing-kicker">声だから、残せるもの。</p>
              <h2>うまく話さなくて、<br />大丈夫です。</h2>
              <p className="landing-body-copy">
                質問に答えるように、思い出したことをそのまま話してください。
                言い直しも、沈黙も、その人らしい時間として受け止めます。
              </p>
              <blockquote>
                いつもの声と、語った言葉。<br />
                その両方を、未来へ残します。
              </blockquote>
            </div>
          </div>
        </section>

        <section className="landing-process landing-section">
          <div className="landing-shell">
            <div className="landing-section-head">
              <div className="landing-section-number">04</div>
              <p className="landing-kicker">始めてから、一冊になるまで。</p>
              <h2>少しずつ語り、最後に整える。</h2>
            </div>
            <ol className="landing-process-list">
              <li><span>01</span><strong>問いが届く</strong><p>受け取りやすい曜日と時間を選べます。</p></li>
              <li><span>02</span><strong>声で語る</strong><p>スマートフォンから、好きな時に録音します。</p></li>
              <li><span>03</span><strong>写真を添える</strong><p>思い出の写真を、その場で補正して残せます。</p></li>
              <li><span>04</span><strong>文章を確かめる</strong><p>文字起こしと文章を確認し、自分で直せます。</p></li>
              <li><span>05</span><strong>本に仕上げる</strong><p>紙面を確認してから、完成を注文します。</p></li>
            </ol>
          </div>
        </section>

        <section className="landing-book landing-shell landing-section" id="memorial">
          <div className="landing-book-grid">
            <div>
              <div className="landing-section-number">05</div>
              <p className="landing-kicker">紙の温かみと、声の記録。</p>
              <h2>開けば読めて、<br />かざせば声に会える。</h2>
              <p className="landing-body-copy">
                一つひとつの語りを、写真とともにB5判の布張り本へ。
                紙面のQRコードから、語ったそのままの声を聴くことができます。
              </p>
              <dl className="landing-specs">
                <div><dt>判型</dt><dd>B5・182 × 257 mm</dd></div>
                <div><dt>製本</dt><dd>布張り・ハードカバー</dd></div>
                <div><dt>音声</dt><dd>各語りに音声QR</dd></div>
              </dl>
            </div>
            <figure className="landing-figure landing-book-figure">
              <img src="/site/book-spread.jpg" alt="質問、写真、音声QRを収録した本の見開きイメージ" />
              <figcaption>完成イメージ。写真素材は撮影予定のイメージです。</figcaption>
            </figure>
          </div>
        </section>

        <section className="landing-price landing-section" id="price">
          <div className="landing-shell landing-price-grid">
            <div>
              <div className="landing-section-number">06</div>
              <p className="landing-kicker">料金と、含まれるもの。</p>
              <h2>一冊の物語を、<br />最後まで。</h2>
              <p className="landing-price-value">49,800<span>円（税込）</span></p>
              <p className="landing-price-note">追加冊子・追加ページなどは、完成時に選択。注文前に総額を確認できます。</p>
              <div className="landing-assurance">
                親御さんが途中で止まった場合も、録音済みの内容は保存されます。使い方や進め方をご相談いただけます。
              </div>
            </div>
            <div>
              <p className="landing-included-title">基本料金に含まれるもの</p>
              <ul className="landing-included-list">
                <li>問いの配信と音声録音</li>
                <li>文字起こしと文章づくり</li>
                <li>写真の補正と紙面編集</li>
                <li>B5判・布張り本 1冊</li>
                <li>語った声を聴ける音声QR</li>
                <li>完成前の確認と操作サポート</li>
              </ul>
              <div className="landing-actions landing-actions-dark">
                <a
                  className="landing-primary-button"
                  href={PURCHASE_ENTRY_URL}
                >
                  購入して始める <span>→</span>
                </a>
                <a className="landing-secondary-link" href={TRIAL_ENTRY_URL}>先に無料で試す</a>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-privacy landing-shell landing-section">
          <div className="landing-section-number">07</div>
          <div className="landing-privacy-grid">
            <div>
              <p className="landing-kicker">語り手の尊厳を、中心に。</p>
              <h2>見せる相手は、<br />自分で決められます。</h2>
            </div>
            <div className="landing-body-copy">
              <p>物語全体は「ファミリー」「選んだ人」「自分だけ」から設定できます。</p>
              <p>一つの語りだけを非公開にすることもできます。お手伝いする方にも、非公開の語りは表示されません。</p>
            </div>
          </div>
        </section>

        <section className="landing-faq landing-section" id="faq">
          <div className="landing-shell">
            <div className="landing-section-head">
              <div className="landing-section-number">08</div>
              <p className="landing-kicker">よくあるご質問</p>
              <h2>始める前の不安を、ひとつずつ。</h2>
            </div>
            <div className="landing-faq-list">
              <details><summary>スマートフォンに慣れていなくても使えますか？</summary><p>問いを開き、録音ボタンを押して話すことから始められます。ご家族をお手伝いする人として設定することもできます。</p></details>
              <details><summary>無料体験の後、自動で課金されますか？</summary><p>自動課金はありません。続けたい場合だけ、ご本人または贈り主が購入手続きへ進みます。</p></details>
              <details><summary>途中でやめた場合、録音は消えますか？</summary><p>保存済みの録音と文章は残ります。時間を置いて、前回の続きから再開できます。</p></details>
              <details><summary>家族以外に贈ることもできますか？</summary><p>できます。受け取った方がご自身で進める形と、贈り主がお手伝いする形を選べます。</p></details>
            </div>
          </div>
        </section>

        <section className="landing-final-cta landing-section">
          <BrandMark />
          <h2>最初の声から、<br />物語は始まります。</h2>
          <p>まずは三つの問いで、声が文章になる体験をお試しください。</p>
          <div className="landing-actions landing-actions-dark">
            <a className="landing-primary-button" href={TRIAL_ENTRY_URL}>無料で試す <span>→</span></a>
            <a
              className="landing-secondary-link"
              href={PURCHASE_ENTRY_URL}
            >
              購入して始める
            </a>
          </div>
        </section>
      </main>

      <footer className="landing-footer landing-shell">
        <BrandMark compact />
        <div className="landing-footer-links">
          <a href="#experience">私たちについて</a>
          <a href="#faq">よくある質問</a>
          <a href="#faq">お問い合わせ</a>
          <a href="#faq">プライバシー</a>
          <a href="#faq">特定商取引法</a>
        </div>
        <p>© 縦糸横糸</p>
      </footer>

    </div>
  );
}
