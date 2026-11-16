import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './general-inquiry.css';

const endpoint = import.meta.env.VITE_SUPABASE_URL || '';
const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

function LaunchInterestPage() {
  const [email, setEmail] = useState('');
  const [interestFor, setInterestFor] = useState('');
  const [purchaseIntent, setPurchaseIntent] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [reason, setReason] = useState('');
  const [registered, setRegistered] = useState(false);
  const [confirmationEmailSent, setConfirmationEmailSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = useRef(crypto.randomUUID());
  const lock = useRef(false);

  async function send(body) {
    const response = await fetch(`${endpoint}/functions/v1/submit-launch-interest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: publishableKey },
      body: JSON.stringify({ ...body, requestKey: key.current, website }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) throw new Error(result?.error || '登録できませんでした。');
    return result;
  }
  async function register(event) {
    event.preventDefault();
    if (lock.current) return;
    if (!endpoint || !publishableKey || !consent || !interestFor || !purchaseIntent) {
      setError('入力内容と同意を確認してください。'); return;
    }
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await send({ action: 'register', email: email.trim(), interestFor, purchaseIntent,
        reason: reason.trim(), consent });
      setConfirmationEmailSent(result.confirmationEmailSent === true);
      setRegistered(true);
    } catch (cause) { setError(cause.message); lock.current = false; }
    finally { setBusy(false); lock.current = false; }
  }
  return <div className="gi-page">
    <header className="gi-header"><a href="/" aria-label="縦糸横糸 トップへ"><img src="/brand-logo-official.svg" alt="縦糸横糸" /></a></header>
    <main className="gi-main">
      {registered ? <section className="gi-complete" role="status">
        <h1>登録を受け付けました。</h1>
        <p>正式リリース時に、優先してご案内します。</p>
        {confirmationEmailSent && <p>確認メールをお送りしました。</p>}
        <a className="gi-back" href="/">トップへ戻る</a>
      </section> : <>
        <h1>先行案内を受け取る</h1>
        <p className="gi-lead">正式リリース時に、優先してご案内します。</p>
        <form onSubmit={register}>
          <label>メールアドレス <span>必須</span><input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} maxLength="254" required /></label>
          <label>誰の人生や想いを残してみたいですか？ <span>必須</span><select value={interestFor} onChange={event => setInterestFor(event.target.value)} required><option value="">選択してください</option><option value="self">自分</option><option value="family">親・家族</option><option value="both">両方</option></select></label>
          <label>利用意向 <span>必須</span><select value={purchaseIntent} onChange={event => setPurchaseIntent(event.target.value)} required><option value="">選択してください</option><option value="considering">利用したい</option><option value="updates">興味があるのでリリース案内が欲しい</option></select></label>
          <label>興味を持っていただいた経緯や、ご質問など（任意）<textarea value={reason} onChange={event => setReason(event.target.value)} maxLength="1000" rows="4" /></label>
          <label className="gi-honeypot" aria-hidden="true">ウェブサイト<input tabIndex="-1" autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} /></label>
          <label className="launch-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} required />正式リリース時の案内メールを受け取ることに同意します。</label>
          <p className="gi-privacy">登録情報は先行案内の送付、関心の把握、ご質問への対応に使用します。購入は成立せず、自動課金もありません。<a href="/?info=privacy">個人情報の取り扱い</a></p>
          {error && <p className="gi-error" role="alert">{error}</p>}
          <button type="submit" disabled={busy}>{busy ? '登録中…' : '先行案内を受け取る'}</button>
        </form>
      </>}
    </main>
    <footer className="gi-footer"><a href="/">縦糸横糸へ戻る</a></footer>
  </div>;
}

createRoot(document.getElementById('root')).render(<LaunchInterestPage />);
