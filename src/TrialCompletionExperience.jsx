import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, BookOpen, Check, ChevronRight, Pause, Play, ShieldCheck, X } from 'lucide-react';
import { STORY_THEMES } from './lib/storyThemes.js';
import { guaranteeDays, trialEvent, trialIsReady, yen } from './lib/trialConversion.js';
import './trial-completion.css';
import BrandLogo from './BrandLogo.jsx';

const valueItems = ['1〜3ヶ月、人生を辿る体験', '問いに声で語り、文章に整える', '大切な写真と、動画2本まで', '縦糸横糸ブック 1冊・国内送料込み', '声や動画にも触れられるWebブック', 'わたしの本棚／家族の本棚', 'ブックができたあとも、季節の問い'];
const sectionEvents = { C03: 'trial_problem_section_reached', C06: 'trial_journey_preview_reached', C08: 'trial_book_preview_reached', C09: 'trial_webbook_preview_reached', C12: 'trial_price_viewed', C14: 'trial_refund_section_viewed', C15: 'trial_payment_options_viewed' };

function Section({ id, children, className = '' }) {
  return <section id={`trial-${id}`} data-section={id} className={`tc-section ${className}`}>{children}</section>;
}

function VoiceSample({ src, onPlay }) {
  const audio = useRef(null);
  const [playing, setPlaying] = useState(false), [heard, setHeard] = useState(false), [error, setError] = useState('');
  return <div className="tc-voice-sample">
    <button className="tc-voice-button" aria-pressed={playing} onClick={async () => {
      setError('');
      if (!audio.current.paused) { audio.current.pause(); return; }
      try { await audio.current.play(); } catch { setError('再生できませんでした。もう一度お試しください。'); }
    }}><span className="tc-voice-play-symbol" aria-hidden="true">{playing ? <Pause size={22} /> : <Play size={22} />}</span><span>{playing ? '声を一時停止する' : 'あの時の声を、少し聞いてみる'}<small>約7秒・合成音声のデモ</small></span></button>
    <audio ref={audio} src={src} preload="none" onPlay={event => { setPlaying(true); onPlay(event); }} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setHeard(true); }} onError={() => { setPlaying(false); setError('音声を開けませんでした。もう一度お試しください。'); }} />
    <small>架空の語りを読み上げています。実際の利用者の肉声ではありません。</small>
    <p className="tc-voice-afterword" data-heard={heard} role="status">{heard ? <>声には、文字だけでは<br className="tc-mobile-break" />残らないものがあります。</> : ''}</p>
    {error && <p role="alert" className="tc-error">{error}</p>}
  </div>;
}

function StoryCard({ story, index, resolveMedia, onReplay }) {
  const [audioUrls, setAudioUrls] = useState([]), [photoUrls, setPhotoUrls] = useState([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function openMedia() {
    setBusy(true); setError('');
    try {
      const urls = await Promise.all(story.audio.map(asset => resolveMedia(asset)));
      setAudioUrls(urls);
    } catch { setError('音声を開けませんでした。もう一度お試しください。'); }
    finally { setBusy(false); }
  }
  return <article className="tc-story">
    <div className="tc-story-top"><span className="tc-number">0{index + 1}</span><h2>{story.title || story.question}</h2></div>
    {story.title && <p className="tc-question">{story.question}</p>}
    {story.text ? <><p className="tc-story-excerpt">{story.text.slice(0, 150)}{story.text.length > 150 ? '…' : ''}</p>
      {story.text.length > 150 && <details><summary>語りの全文を読む</summary><p className="tc-preserve">{story.text}</p></details>}</>
      : <p>{story.state === 'missing_audio' ? '録音の保存を確認できません。保存状態を確認してから進んでください。' : '声は保存されています。文章はまだ準備中です。'}</p>}
    {!!story.audio.length && (!audioUrls.length ? <button className="tc-text-button" onClick={openMedia} disabled={busy}><Play size={16} />{busy ? '音声を準備中…' : 'このときの声を聴く'}</button>
      : audioUrls.map((url, i) => <label className="tc-audio" key={url}>録音 {audioUrls.length > 1 ? `${i + 1} / ${audioUrls.length}` : ''}<audio controls preload="none" src={url} onPlay={onReplay} onError={() => { setAudioUrls([]); setError('音声を開けませんでした。もう一度お試しください。'); }} /></label>))}
    {!!story.photos.length && (photoUrls.length ? photoUrls.map((url, i) => <img key={url} className="tc-record-photo" src={url} alt={`この語りに添えた写真 ${i + 1}`} onError={() => { setPhotoUrls([]); setError('写真を開けませんでした。もう一度お試しください。'); }} />)
      : <button className="tc-text-button" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { setPhotoUrls(await Promise.all(story.photos.map(resolveMedia))); } catch { setError('写真を開けませんでした。もう一度お試しください。'); } finally { setBusy(false); } }}>添えた写真を見る</button>)}
    {story.state === 'text_pending' && <small>文章の準備が終わったら、ページを開き直すと確認できます。</small>}
    {error && <p role="alert" className="tc-error">{error}</p>}
  </article>;
}

export function TrialOrderConfirmation({ mode, quote, onBack, onSubmit, onApplyDiscount, busy, error, reviewOnly = false, recipientName = '' }) {
  const [recipient, setRecipient] = useState(recipientName);
  const [agreed, setAgreed] = useState(false);
  const [code,setCode]=useState(''),[appliedCode,setAppliedCode]=useState('');
  const [discountQuote,setDiscountQuote]=useState(null),[quoting,setQuoting]=useState(false),[discountError,setDiscountError]=useState('');
  const currentQuote=discountQuote||quote;
  const unapplied=code.trim()!==appliedCode;
  async function applyCode(){
    setQuoting(true);setAgreed(false);setDiscountError('');
    try {
      const next=await onApplyDiscount(code.trim());
      if(!Number.isInteger(next?.amount_total)||next.amount_total<0)throw Error();
      setDiscountQuote(next);setAppliedCode(code.trim());
    }catch{setDiscountError('割引コードを確認できませんでした。入力内容・有効期限をご確認ください。');}
    finally{setQuoting(false);}
  }
  return <div className="tc-confirm">
    <button className="tc-text-button" onClick={onBack} disabled={busy}>← ご案内に戻る</button>
    <p className="tc-eyebrow"><BrandLogo /></p><h1 tabIndex={-1}>お申し込み内容の確認</h1>
    <p>{mode === 'gift' ? '大切な方へ、人生を辿る時間を贈ります。' : '体験の一頁で残した語りは、そのまま引き継がれます。'}</p>
    <dl className="tc-order-lines"><div><dt>お申し込み</dt><dd>{mode === 'gift' ? '購入して贈る' : 'ご自身で始める'}</dd></div>
      <div><dt>含まれるブック</dt><dd>B5・ソフトカバー・フルカラー 1冊<br />国内1ヶ所送料込み／Webブック付き</dd></div>
      <div><dt>{appliedCode ? '割引適用後のお支払い総額' : quote.family_price ? 'ご家族向け特別価格' : 'お支払い総額'}</dt><dd className="tc-order-price">{yen(currentQuote.amount_total)}<small>（税込）</small></dd></div></dl>
    {onApplyDiscount && <details><summary>割引コードをお持ちの方</summary>
      <label className="tc-field">割引コード<input value={code} disabled={busy||quoting} onChange={e=>{setCode(e.target.value);setAgreed(false);setDiscountError('');}} autoComplete="off" autoCapitalize="off" spellCheck={false}/></label>
      <button className="tc-secondary" disabled={busy||quoting} onClick={applyCode}>{quoting?'確認しています…':'コードを適用する'}</button>
      {appliedCode&&!unapplied&&<p role="status">割引を適用しました。上記のお支払い総額をご確認ください。</p>}
      {unapplied&&<p className="tc-small">変更したコードを適用してから、お申し込みください。空欄で適用すると割引を解除できます。</p>}
      {discountError&&<p className="tc-error" role="alert">{discountError}</p>}
    </details>}
    {mode === 'gift' && <label className="tc-field">贈る相手のお名前<input required readOnly={!!recipientName} value={recipient} onChange={e => setRecipient(e.target.value)} autoComplete="off" /><small>購入後にお渡しする案内をご用意します。物理ギフトパッケージは含みません。</small></label>}
    <p>本体代金 全額返金保証：お支払い確定から{guaranteeDays(mode)}日以内、かつ{mode === 'gift' ? '受取人の' : ''}本編開始前。同一語り手につき1回。</p>
    <p className="tc-small">制作期間：{mode === 'gift' ? '購入から6ヶ月以内に有料の「はじまりの章」を開始し、開始から1年間。' : 'お支払いから1年間。'}目安は1〜3ヶ月です。</p>
    <p className="tc-small">{currentQuote.amount_total===0?'お支払いは発生しません。返金対象は実際にお支払いいただいた本体代金です。':'クレジットカードの一括払い・分割払い。利用可否・回数・手数料は、Stripeの決済画面でご確認ください。'}</p>
    <label className="tc-agreement"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />金額と返金保証・制作期間を確認しました。</label>
    {error && <p className="tc-error" role="alert">{error}</p>}
    <button className="tc-primary" disabled={busy || quoting || unapplied || !!discountError || !agreed || (mode === 'gift' && !recipient.trim())} onClick={() => onSubmit({ orderType: mode, includeGiftPackage: false, gift: { recipient_name: recipient.trim() }, discountCode:appliedCode, expectedAmount: currentQuote.amount_total })}>{busy ? '確認しています…' : reviewOnly ? '確認を完了する（テスト・決済なし）' : currentQuote.amount_total===0?'0円で申し込みを確定する':'Stripeの決済画面へ進む'}<ArrowRight size={18} /></button>
    <p className="tc-small">{reviewOnly ? 'ローカル確認用です。実際の注文・課金・通知は行いません。' : currentQuote.amount_total===0?'ボタンを押すと0円でお申し込みが完了します。カード情報の入力は不要です。':'この画面ではまだ支払われません。次の画面で最終確認できます。'}</p>
  </div>;
}

export default function TrialCompletionExperience({ stories = [], mode = 'self', subjectName = '', quote,
  loading = false, error = '', onRetry, resolveMedia, onPurchase, onInvite, onContinue, onFinish,
  onEvent, onApplyDiscount, reviewOnly = false, intent = null, demoContent, demoAudioUrl }) {
  const root = useRef(null), previousFocus = useRef(null);
  const [confirmation, setConfirmation] = useState(false), [busy, setBusy] = useState(false), [actionError, setActionError] = useState('');
  const [decision, setDecision] = useState(intent), [theme, setTheme] = useState(0);
  const gift = mode === 'gift', recipient = mode === 'recipient', paid = mode === 'paid', sales = !recipient && !paid;
  const ready = !loading && trialIsReady(stories);
  const canBuy = ready && quote && Number.isFinite(quote.amount_total) && !error;
  const emit = name => trialEvent(name, mode, onEvent);
  useEffect(() => { setDecision(intent); }, [intent]);
  useEffect(() => {
    emit('trial_conversion_page_viewed');
    const reached = new Set();
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      const id = entry.target.dataset.section;
      if (entry.isIntersecting && !reached.has(id) && (id !== 'C12' || quote)) { reached.add(id); emit(sectionEvents[id]); }
    }), { root: root.current, threshold: 0.15 });
    root.current?.querySelectorAll('[data-section]').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [mode, loading, quote]);
  useEffect(() => {
    if (confirmation) root.current?.querySelector('.tc-confirm h1')?.focus();
    else previousFocus.current?.focus({ preventScroll: true });
  }, [confirmation]);
  const pauseOtherMedia = event => {
    root.current?.querySelectorAll('audio,video').forEach(el => { if (el !== event.target) el.pause(); });
  };
  const stopOtherMedia = event => {
    pauseOtherMedia(event);
    emit('trial_story_replayed');
  };
  const openOrder = event => { root.current?.querySelectorAll('audio,video').forEach(el => el.pause()); previousFocus.current = event.currentTarget; emit(gift ? 'trial_gift_cta_clicked' : 'trial_purchase_cta_clicked'); setConfirmation(true); };
  const action = async callback => { setBusy(true); setActionError(''); try { await callback(); } catch (e) { setActionError(e?.message || '操作を完了できませんでした。もう一度お試しください。'); } finally { setBusy(false); } };
  const buyButton = <button className="tc-primary" disabled={!canBuy || busy} onClick={openOrder}>{gift ? '購入して親に贈る' : '縦糸横糸をはじめる'}<ArrowRight size={19} /></button>;
  return <div className="tc-root" ref={root}>
    <header className="tc-header"><span className="tc-brand"><BrandLogo>縦糸横糸<small>TATEITO YOKOITO</small></BrandLogo></span>
      {!confirmation && <a href={sales ? '#trial-C12' : '#trial-next'}>{sales ? '内容・料金を見る' : 'このあとのこと'}<ArrowDown size={15} /></a>}</header>
    <main hidden={confirmation}>
      <Section id="C01" className="tc-reflection">
        <div><p className="tc-eyebrow">体験の一頁</p><h1>3つの問いを、<br />語り終えました。</h1>
          <p>少しだけ、振り返ってみてください。</p><p>話しているうちに、<br />久しぶりに思い出したことはありましたか？</p>
          <p>誰かの顔が浮かんだり、<br />「そういえば」と感じたことはありましたか？</p></div>
        <div className="tc-stories" aria-busy={loading}>
          <p className="tc-eyebrow">{subjectName ? `${subjectName}さんが残した語り` : 'あなたが残した語り'}</p>
          {loading ? <p role="status">保存した語りを開いています…</p> : stories.map((story, i) => <StoryCard key={story.id} story={story} index={i} resolveMedia={resolveMedia} onReplay={stopOtherMedia} />)}
          {error && <div role="alert"><p className="tc-error">{error}</p>{onRetry && <button className="tc-text-button" onClick={onRetry}>もう一度確認する</button>}</div>}
          {!loading && !ready && <p className="tc-error">3つの録音の保存を確認してから、お申し込みへ進めます。</p>}
        </div>
      </Section>
      {!paid && <>
        <div className="tc-opening">
          <Section id="C02" className="tc-centered"><h2>たった3つの問いでも、<br />いくつかの記憶が動きはじめます。</h2><p>人生には、まだ言葉にしていないことが<br />たくさんあります。</p></Section>
          <Section id="C03" className="tc-ink tc-centered"><h2>思い出すきっかけがなければ、<br />言葉にならないまま過ぎていく。</h2><p>子どもの頃のこと。<br />あの人に助けてもらった日のこと。<br />家族ができた日のこと。</p><p className="tc-statement">忘れたわけではない。<br />ただ、思い出す機会がなかっただけ。</p></Section>
          <Section id="C04" className="tc-photo-section"><img src="/site/theme-family-memory-triptych.jpg" loading="lazy" alt="家族の記憶を描いたテーマイメージ" /><div><h2>写真は残る。<br />でも、そのとき<br className="tc-desktop" />何を思っていたかは。</h2><p>写真だけでは分からないことがあります。</p><p>未来に残したいのは、出来事だけではなく、<br />その人がどう生きていたか。</p></div></Section>
          <Section id="C05" className="tc-centered tc-possibility"><h2>でも、今なら。</h2><p>問いがあれば、思い出せることがあります。<br />声にしてみると、初めて見えてくることがあります。</p><p className="tc-onward">ここから、もう少し。</p><ArrowDown size={23} aria-hidden="true" /></Section>
        </div>
      </>}
      <Section id="C06" className="tc-journey"><div className="tc-door"><img src="/site/hajimari-doorway-v2.jpg" loading="lazy" alt="光が差し込む扉の向こうの景色" /><div><p className="tc-eyebrow">辿る・再発見する</p><h2>ここから、<br />あなたの物語を<br />もう少し辿っていきます。</h2></div></div>
        <p className="tc-centered">1〜3ヶ月を目安に、少しずつ。<br />すべての問いに答える必要はありません。</p>
        <div className="tc-theme-grid">{STORY_THEMES.map((item, i) => <button key={item.code} aria-pressed={theme === i} onClick={() => setTheme(i)}><span>0{i + 1}</span>{item.label}<ChevronRight size={16} /></button>)}</div>
        <div className="tc-theme-detail"><img src={STORY_THEMES[theme].image} loading="lazy" alt={STORY_THEMES[theme].imageAlt} /><p>{STORY_THEMES[theme].hint}</p></div>
      </Section>
      <Section id="C07" className="tc-value-bridge"><ol className="tc-value-flow" aria-label="縦糸横糸の体験">{['辿る', '再発見する', '結晶化する', '還る'].map((title, i) => <li key={title}><span>{title}</span>{i < 3 && <ArrowRight size={12} aria-hidden="true" />}</li>)}</ol></Section>
      <Section id="C08" className="tc-crystallization">
        <div className="tc-centered"><p className="tc-eyebrow">結晶化する</p><h2>語ったものが、<br />一冊の物語になる。</h2></div>
        <figure className="tc-crystal-cover"><img src="/site/standard-softcover-family-logo-corrected.png" width="1145" height="1374" loading="lazy" alt="家族写真と「紡木 誠・45年目の現在地」を表紙にした、標準ソフトカバーの装丁イメージ" /><figcaption>B5・ソフトカバー・フルカラー<br />1冊・国内1ヶ所送料込み<small>表紙は装丁イメージです。</small></figcaption></figure>
        {/* C09 remains an analytics anchor within the single crystallization section. */}
        <div id="trial-C09" data-section="C09" className="tc-crystal-web">
        <figure className="tc-web-keyvisual"><img src="/site/web-book-qr-voice.png" width="1536" height="1024" alt="本を片手に、あの時の声を聞く。ブックのQRからWebブックへ。誕生日の写真を載せた本と、同じ写真・文章・音声再生画面を表示するスマートフォン。" loading="lazy" /></figure>
        <p className="tc-crystal-caption">ブックのQRからWebブックへ。<br />文章や写真とともに、<br className="tc-mobile-break" />そのときの声や動画にも触れられます。</p>
        <div className="tc-web-inline-audio">{demoAudioUrl && <><p className="tc-small">音声見本「日が暮れるまで。」<br />画像とは別の架空の語りを使ったデモです。</p><VoiceSample src={demoAudioUrl} onPlay={pauseOtherMedia} /></>}{demoContent}</div>
        </div>
      </Section>
      <Section id="C10" className="tc-bookshelf tc-bookshelf-approved tc-centered">
        <div className="tc-return-heading"><h2>いつか、<br />この声を<br className="tc-mobile-break" />聞きたくなる日がくる。</h2><p>自分が。家族が。</p><p className="tc-return-reunion">ここに還れば、また逢える。</p></div>
        <figure className="tc-return-visual"><img src="/site/bookshelf-return-approved.png" width="1312" height="1199" loading="lazy" alt="わたしの本棚に自分のWebブックが並び、家族の本棚には家族それぞれのWebブックが残る。" /></figure>
        <p className="tc-return-vision">いつでも、“家族に還れる”場所を。</p>
      </Section>
      <Section id="C11" className="tc-centered tc-short"><h2>ブックができた、そのあとも。</h2><p>季節ごとに、小さな問いが届きます。<br />すぐに答えなくても大丈夫。<br />届いた問いは残っているので、また話したくなったときに、<br />そこから語ることができます。</p></Section>
      {sales ? <>
        <Section id="C12" className="tc-price-section"><div className="tc-price-card"><p className="tc-eyebrow">人生を辿り、未来へ手渡す。</p><h2><BrandLogo /></h2>{quote?.family_price && <p>ご家族向け特別価格</p>}<p className="tc-price">{quote ? yen(quote.amount_total) : '金額を確認中…'}<small>（税込）</small></p>{quote?.family_price && <p className="tc-small">縦糸横糸をご利用のご家族へ広げるための特別価格です。</p>}
          <ul>{valueItems.map(value => <li key={value}><Check size={17} />{value}</li>)}</ul>{buyButton}
          {gift && <button className="tc-secondary" onClick={onInvite}>まず、親にも3問試してもらう</button>}
          <p className="tc-small">本体代金 全額返金保証・{guaranteeDays(mode)}日以内／本編開始前</p><a href="#trial-C13">まだ少し不安な方へ ↓</a></div>
          <div className="tc-price-meaning"><h2>本一冊の<br />価格ではありません。</h2><p>人生を辿り、再発見し、<br />大切なものを一度結晶化する。</p><p>そして未来の自分や家族が、<br />そこへ還れるようにする。</p><p>そこまでが、縦糸横糸です。</p></div></Section>
        <Section id="C13"><h2>最後までできるかな、<br />と思った方へ。</h2><div className="tc-reassurance">{[['書き始めなくて大丈夫', '基本は、届く問いに声で話すことから。'], ['全部答えなくて大丈夫', 'すべての問いに答える必要はありません。'], ['自分のペースで', '目安は1〜3ヶ月。制作期間は1年間。特別な休止手続きは必要ありません。'], ['一人でも。家族と一緒でも。', '写真を手伝ってもらったり、一緒に昔のことを思い出したりすることもできます。']].map(([title, text]) => <div key={title}><h3>{title}</h3><p>{text}</p></div>)}</div></Section>
        <Section id="C14" className="tc-guarantee"><ShieldCheck size={28} strokeWidth={1.3} /><div><p className="tc-eyebrow">本体代金 全額返金保証</p><h2>はじめてみて、<br />合わなかったら。</h2><p>{gift ? '親御さんに合わなかった場合も、安心して贈れるように。' : '合うかどうかの不安まで、抱えたまま始めなくていいように。'}</p><p>お支払いから<strong>{guaranteeDays(mode)}日以内</strong>、かつ{gift ? '受取人の' : ''}<strong>本編開始前</strong>なら、理由を問わず、お支払いいただいた本体代金を全額返金します。</p><details><summary>返金保証について</summary><p>「はじまりの章」の後、ご本人が「本編をはじめる」と明示した時点で保証は終了します。章を読み終えただけでは終了しません。</p><p>本人購入は30日、購入して贈る場合は45日。同一語り手につき1回です。一括・分割で条件は変わりません。</p><p>返金確定後は制作を停止し、対象記録は30日間、本人が閲覧・取得できます。本保証とは別に、サービス不備等への対応を行います。</p></details></div></Section>
        <Section id="C15" className="tc-short"><h2>お支払い方法</h2><p>クレジットカードの一括払い・分割払いに対応しています。</p><p className="tc-small">分割払いの利用可否・回数・手数料は、ご利用のカードによって異なります。Stripeの決済画面でお確かめください。</p></Section>
        <Section id="C16" className="tc-final tc-ink tc-centered"><p className="tc-eyebrow">まだ、あなたの中にある物語へ。</p><h2>{gift ? <>親御さんにも、<br />こんな時間を贈ってみませんか。</> : <>あなたの物語の、<br />つづきを辿ってみませんか。</>}</h2>{buyButton}<p>{quote && yen(quote.amount_total)}（税込）・一括／対応カードの分割</p>{gift && <button className="tc-secondary" onClick={onInvite}>まず、親にも3問試してもらう</button>}<button className="tc-text-button" onClick={onFinish}>今はここまでにする</button></Section>
      </> : <section id="trial-next" className="tc-section tc-centered"><h2>{paid ? 'ここから、はじまりの章へ。' : 'ここから先も、もう少し辿ってみたいですか？'}</h2>
        {paid ? <><p>すでに贈られているため、追加のお支払いはありません。</p><button className="tc-primary" disabled={!ready || busy} onClick={() => action(onPurchase)}>はじまりの章をはじめる<ArrowRight size={18} /></button></>
          : decision === 'continue' ? <p role="status">「続きをやってみたい」というお気持ちを受け付けました。贈り主へのお知らせを準備しています。語りの中身は送りません。</p>
          : <><p>{subjectName || '語り手'}さんご本人の気持ちとしてお選びください。<br />選ぶと、続けたいというお気持ちだけを贈り主へお知らせします。</p><button className="tc-primary" disabled={!ready || busy} onClick={() => action(async () => { await onContinue('continue'); setDecision('continue'); emit('trial_recipient_continue_requested'); })}>続きをやってみたい</button><button className="tc-secondary" disabled={busy} onClick={() => action(async () => { await onContinue('later'); onFinish(); })}>今回はここまで</button></>}
        {actionError && <p role="alert" className="tc-error">{actionError}</p>}{(paid || decision === 'continue') && <button className="tc-text-button" onClick={onFinish}>今はここまでにする</button>}</section>}
      <footer className="tc-footer"><BrandLogo align="center" /><span>辿る。再発見する。結晶化する。還る。</span></footer>
    </main>
    {confirmation && <TrialOrderConfirmation mode={mode} quote={quote} onApplyDiscount={onApplyDiscount} reviewOnly={reviewOnly} busy={busy} error={actionError}
      onBack={() => setConfirmation(false)} onSubmit={options => action(() => onPurchase(options))} />}
  </div>;
}
