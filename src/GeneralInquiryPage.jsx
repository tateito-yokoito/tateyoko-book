import React, { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const categories = ['サービス・料金について', 'ご利用方法について', 'BOOK・Webブックについて',
  'ご注文・お支払いについて', '不具合・エラーについて', 'その他'];
const endpoint = import.meta.env.VITE_SUPABASE_URL || '';
const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const client = endpoint && publishableKey ? createClient(endpoint, publishableKey) : null;
const source = new URLSearchParams(window.location.search).get('source') === 'app' ? 'app' : 'hp';

export default function GeneralInquiryPage() {
  const [values, setValues] = useState({ name: '', email: '', category: '', message: '', website: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const requestKey = useRef(crypto.randomUUID());
  const submissionLock = useRef(false);
  useEffect(() => {
    if (!client) return;
    let active = true;
    client.auth.getUser().then(async ({ data }) => {
      const user = data?.user;
      if (!active || !user) return;
      const metadata = user.user_metadata || {};
      const { data: profile } = await client.from('profiles').select('display_name,name,family_name,given_name')
        .eq('id', user.id).maybeSingle();
      if (!active) return;
      const name = profile?.display_name || profile?.name
        || [profile?.family_name, profile?.given_name].filter(Boolean).join(' ')
        || metadata.display_name || metadata.name
        || [metadata.family_name, metadata.given_name].filter(Boolean).join(' ');
      setValues(current => ({ ...current, name: current.name || name || '', email: current.email || user.email || '' }));
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const update = (field, value) => { setValues(current => ({ ...current, [field]: value })); setError(''); };
  const submit = async event => {
    event.preventDefault();
    if (submissionLock.current) return;
    const name = values.name.trim();
    const email = values.email.trim();
    const message = values.message.trim();
    if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || email.length > 254 || !categories.includes(values.category)
      || !message || message.length > 4000) {
      setError('必須項目とメールアドレスを確認してください。'); return;
    }
    if (!client) { setError('受付の準備ができていません。'); return; }
    submissionLock.current = true;
    setBusy(true);
    setError('');
    try {
      const { data: session } = await client.auth.getSession();
      const response = await fetch(`${endpoint}/functions/v1/submit-general-inquiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: publishableKey,
          ...(session?.session?.access_token ? { Authorization: `Bearer ${session.session.access_token}` } : {}) },
        body: JSON.stringify({ requestKey: requestKey.current, name, email,
          category: values.category, message, source, website: values.website }),
      });
      const result = await response.json();
      if (!response.ok || !result.success || !result.id) throw new Error(result.error || '送信できませんでした。');
      setReceipt(result);
    } catch (cause) {
      setError(cause.message || '送信できませんでした。時間をおいて再度お試しください。');
      submissionLock.current = false; // same request key makes an uncertain retry idempotent
    } finally { setBusy(false); }
  };
  const backUrl = source === 'app' ? '/?app=1' : '/';
  return <div className="gi-page">
    <header className="gi-header"><a href={backUrl} aria-label="縦糸横糸へ戻る"><img src="/brand-logo-official.svg" alt="縦糸横糸" /></a></header>
    <main className="gi-main">
      {receipt ? <section className="gi-complete" role="status">
        <h1>お問い合わせを受け付けました。</h1>
        <p>内容を確認のうえ、ご入力いただいたメールアドレスへご連絡いたします。</p>
        <p className="gi-id">問い合わせID：{receipt.id}</p>
        <a className="gi-back" href={backUrl}>縦糸横糸へ戻る</a>
      </section> : <>
        <h1>お問い合わせ</h1>
        <p className="gi-lead">ご不明な点やお困りのことがありましたら、お気軽にお問い合わせください。</p>
        <form onSubmit={submit} noValidate>
          <label>お名前 <span>必須</span><input value={values.name} onChange={e => update('name', e.target.value)} autoComplete="name" maxLength="120" required /></label>
          <label>メールアドレス <span>必須</span><input type="email" value={values.email} onChange={e => update('email', e.target.value)} autoComplete="email" maxLength="254" required /></label>
          <label>お問い合わせ種別 <span>必須</span><select value={values.category} onChange={e => update('category', e.target.value)} required>
            <option value="">選択してください</option>{categories.map(value => <option key={value}>{value}</option>)}
          </select></label>
          <label>お問い合わせ内容 <span>必須</span><textarea value={values.message} onChange={e => update('message', e.target.value)} rows="7" maxLength="4000" required /></label>
          <label className="gi-honeypot" aria-hidden="true">ウェブサイト<input tabIndex="-1" autoComplete="off" value={values.website} onChange={e => update('website', e.target.value)} /></label>
          <p className="gi-privacy">ご入力いただいた内容は、お問い合わせへの対応に使用します。<a href="/?info=privacy">プライバシーについて</a></p>
          {error && <p className="gi-error" role="alert">{error}</p>}
          <button type="submit" disabled={busy}>{busy ? '送信中…' : 'お問い合わせを送信する'}</button>
        </form>
      </>}
    </main>
    <footer className="gi-footer"><a href={backUrl}>縦糸横糸へ戻る</a></footer>
  </div>;
}
