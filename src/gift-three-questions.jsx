import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { CHILDHOOD_TRIAL_QUESTIONS } from './lib/childhoodTrial.js';
import { GIFT_THREE_MESSAGE, compactGiftThreeRecipientUrl, giftThreeRequest, giftThreeTokenFromUrl } from './lib/giftThreeQuestions.js';
import './gift-three-questions.css';

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL || 'https://wquxjeqkumossjxehdop.supabase.co', import.meta.env.VITE_SUPABASE_ANON_KEY || '');
const params = new URLSearchParams(location.search);

function MessageCard({ url, note = '' }) {
  return <div className="g3-card">
    {note.trim() && <p className="g3-personal-note">{note.trim()}</p>}
    {note.trim() && <div className="g3-message-divider" aria-hidden="true" />}
    <strong>【縦糸＋横糸からのご案内】</strong>
    <p>縦糸＋横糸は、スマホに届く質問に答えながら、人生を振り返り、歩みや想いを言葉にしていくサービスです。<br />ご自身のペースで答えられます。語った声や内容は、ご本人が選ばない限り贈り主にも共有されません。</p>
    <p>まずは無料の3問からお試しください。</p>
    <a href={url || undefined}>3問を開く：{url || '［専用リンク］'}</a>
  </div>;
}

function QuestionSample() {
  const [index, setIndex] = useState(0);
  return <><div className="g3-question"><small>無料の3問　{index + 1} / 3</small><h3>{CHILDHOOD_TRIAL_QUESTIONS[index].content}</h3></div><div className="g3-question-nav"><button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label="前の問い">‹</button><button type="button" disabled={index === 2} onClick={() => setIndex(index + 1)} aria-label="次の問い">›</button></div><p className="g3-small">左右のボタンで3問を確認できます。</p></>;
}

function FeedbackSample() {
  return <div className="g3-sample"><h3>やってみて、どうでしたか？</h3><div className="g3-chips"><span className="selected">☑ 懐かしかった</span><span>□ 楽しかった</span><span className="selected">☑ 少し戸惑った</span><span>□ むずかしかった</span></div><p>続けてみたいお気持ちはありますか？</p><div className="g3-chips"><span className="selected">◉ はい</span><span>○ 分からない</span></div><p className="g3-small">語った内容・音声は共有されません。感想だけが、登録された贈り主のメールに届きます。</p><p>［贈り主に感想を送る］</p></div>;
}

function SenderPage() {
  const [screen, setScreen] = useState('intro');
  const [link, setLink] = useState('');
  const [managerToken, setManagerToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [email, setEmail] = useState('');
  const [emailStatus, setEmailStatus] = useState('');
  const [personalNote, setPersonalNote] = useState('');

  async function copyMessage() {
    setBusy(true); setStatus('');
    try {
      let destination = link;
      if (!destination) {
        const created = await giftThreeRequest('create');
        destination = compactGiftThreeRecipientUrl(created.recipientUrl);
        setLink(destination); setManagerToken(created.managerToken);
      }
      if (!navigator.clipboard?.writeText) throw new Error('このブラウザでは自動コピーが利用できません。表示されたメッセージを選択してコピーしてください。');
      await navigator.clipboard.writeText(GIFT_THREE_MESSAGE(destination, personalNote));
      setStatus('メッセージをコピーしました。LINEなどに貼り付けて送れます。');
    } catch (error) { setStatus(error.message || 'コピーできませんでした。'); }
    finally { setBusy(false); }
  }

  async function registerEmail() {
    if (!managerToken) { setEmailStatus('先にメッセージをコピーしてください。'); return; }
    setBusy(true); setEmailStatus('');
    try {
      await giftThreeRequest('register_email', { managerToken, email });
      setEmailStatus('確認メールを送りました。メール内のリンクを開くと登録が完了します。');
    } catch (error) { setEmailStatus(error.message || '登録できませんでした。'); }
    finally { setBusy(false); }
  }

  return <><header className="g3-head">縦糸横糸</header><main className="g3-main">{screen === 'intro' ? <section className="g3-intro"><div><p className="g3-kicker">FOR FAMILY</p><h1 className="g3-title">家族に、<br />三つの問いを贈る。</h1><div className="g3-line" /><p className="g3-emotion">いつか聞きたいと思ったとき、<br />聞けるとは限らない。<br />でも、今なら。</p><p className="g3-lead">語ってほしい。でも、本人が乗り気かどうかは分からない。<br />だからまずは、無料の三つの問いを届けてみませんか。</p></div><div><div className="g3-steps"><section className="g3-step"><div className="g3-step-head"><span className="g3-number">1</span><h2>「3つの問い」を贈る</h2></div><details><summary>メッセージを見る</summary><div><p className="g3-small">LINEなどにコピペするだけ。</p><MessageCard /></div></details></section><section className="g3-step"><div className="g3-step-head"><span className="g3-number">2</span><h2>ご本人が、自分のペースで語る</h2></div><p>3問語るのに、5〜10分程度。<br />語った内容は、ご本人以外に勝手に共有されません。</p><details><summary>実際の3問を見る</summary><div><QuestionSample /></div></details></section><section className="g3-step"><div className="g3-step-head"><span className="g3-number">3</span><h2>感想と、続けてみたいかを選ぶ</h2></div><p>ご本人が共有を選ぶと、あなたのメールアドレスに感想が届きます。語りの内容は届きません。</p><details><summary>3問後の画面</summary><div><FeedbackSample /></div></details></section></div><button className="g3-cta" type="button" onClick={() => { setScreen('send'); window.scrollTo(0, 0); }}>贈るメッセージを確認する <span aria-hidden="true">→</span></button><p className="g3-assurance">無料3問・カード登録不要・自動課金なし</p></div></section> : <section className="g3-panel">
    <button className="g3-back" type="button" onClick={() => setScreen('intro')}>← 前の画面に戻る</button>
    <h1>このまま贈れます。</h1>
    <p>この案内をコピーして、LINEなどで送れます。</p>
    <label className="g3-note-label" htmlFor="g3-personal-note">あなたからの一言（任意）</label>
    <textarea id="g3-personal-note" className="g3-note-input" value={personalNote} onChange={event => setPersonalNote(event.target.value)} placeholder="これ良いみたいだよ。よかったらやってみて！" rows={3} />
    <p className="g3-small">入力した場合だけ、案内の一番上に入ります。</p>
    <h2>贈るメッセージ</h2>
    <MessageCard url={link} note={personalNote} />
    <button className="g3-cta" type="button" disabled={busy} onClick={copyMessage}>メッセージをコピー <span aria-hidden="true">⧉</span></button>
    <p className="g3-status" role="status">{status}</p>
    <h2>感想を受け取る</h2>
    <p>メールアドレスを登録しておくと、ご本人が「贈り主に感想を送る」を選んだ場合に、感想が届きます。</p>
    <label>メールアドレス（任意）<input type="email" inputMode="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="example@example.com" /></label>
    <p className="g3-small">このメールアドレスは確認メールと感想の通知以外には利用しません。確認メールからの登録完了が必要です。</p>
    <button className="g3-secondary" type="button" disabled={busy} onClick={registerEmail}>メールアドレスを登録する</button>
    <p className="g3-status" role="status">{emailStatus}</p>
  </section>}</main></>;
}

function RecipientPage({ recipientToken }) {
  const [state, setState] = useState({ loading: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { let live = true; giftThreeRequest('open', { recipientToken }).then(result => { if (live) setState({ loading: false, ...result }); }).catch(() => { if (live) setState({ loading: false, valid: false }); }); return () => { live = false; }; }, [recipientToken]);
  async function start() {
    setBusy(true); setError('');
    try {
      // A shared device must not silently open the sender's existing account.
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      if (signOutError) throw signOutError;
      location.assign(`/?app=1&entry=trial&gift_three=${recipientToken}`);
    } catch { setError('別のアカウントへの切り替えを完了できませんでした。もう一度お試しください。'); setBusy(false); }
  }
  return <><header className="g3-head">縦糸横糸</header><main className="g3-main g3-recipient g3-recipient-entry">{state.loading ? <p>リンクを確認しています…</p> : !state.valid ? <><h1 className="g3-title">このリンクは利用できません。</h1><p>贈り主に新しいリンクを送ってもらってください。</p></> : <><p className="g3-kicker">無料の3問</p><h1 className="g3-title">まずは、<br />幼い頃のことから。</h1><div className="g3-recipient-entry-copy"><p>三つの問いに、自分のペースで<br className="g3-mobile-break" />声で答えてみてください。</p><p>語りの内容は、贈り主にも<br className="g3-mobile-break" />勝手に共有されません。</p></div><p className="g3-small g3-recipient-entry-note">この端末で別の方がログイン中の場合は、<br className="g3-mobile-break" />アカウントを切り替えてから始まります。</p><button className="g3-cta" type="button" disabled={busy} onClick={start}>3問を試す <span aria-hidden="true">→</span></button><a className="g3-about-link" href="/" target="_blank" rel="noopener noreferrer">縦糸＋横糸について</a>{error && <p className="g3-status g3-error" role="alert">{error}</p>}</>}</main></>;
}

function VerifyPage({ verifyToken }) {
  const [status, setStatus] = useState('確認しています…');
  useEffect(() => { giftThreeRequest('verify_email', { verifyToken }).then(() => setStatus('メールアドレスの確認が完了しました。感想が共有された場合に通知します。')).catch(() => setStatus('確認リンクを利用できません。再度登録してください。')); }, [verifyToken]);
  return <><header className="g3-head">縦糸横糸</header><main className="g3-main g3-recipient"><h1 className="g3-title">感想の通知先</h1><p role="status">{status}</p></main></>;
}

export default function GiftThreeQuestionsPage() {
  useEffect(() => {
    document.body.classList.add('g3-page');
    return () => document.body.classList.remove('g3-page');
  }, []);
  return params.has('gift_three_verify')
    ? <VerifyPage verifyToken={params.get('gift_three_verify')} />
    : giftThreeTokenFromUrl() ? <RecipientPage recipientToken={giftThreeTokenFromUrl()} /> : <SenderPage />;
}
