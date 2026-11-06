import React, { useRef, useState } from 'react';
import {
  CONSULTATION_FOR_OPTIONS, AGE_OPTIONS, SMARTPHONE_OPTIONS, CALL_OPTIONS, SELF_CALL_OPTIONS,
  FAMILY_OPTIONS, SELF_FAMILY_OPTIONS, FAMILY_HELP_OPTIONS, SELF_FAMILY_HELP_OPTIONS,
  RELATION_OPTIONS, CONTACT_METHOD_OPTIONS, isSelfConsultation, needsFamilyHelp,
  validateSupportConsultation, formatSupportConsultation, consultationReceiptNumber,
} from './lib/supportConsultation.js';

const initialValues = {
  consultationFor: '', age: '', smartphone: '', call: '', family: '', familyHelp: [],
  name: '', relation: '', email: '', phone: '', contactMethod: '', message: '',
  consent: false, receiveCopy: false, website: '',
};

function requestKey() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function stepsFor(values) {
  const self = isSelfConsultation(values);
  const steps = ['consultationFor', 'age', 'smartphone', 'call', 'family'];
  if (needsFamilyHelp(values.family, self)) steps.push('familyHelp');
  if (!self) steps.push('relation');
  steps.push('contact', 'message', 'consent');
  return steps;
}

function OptionList({ name, options, value, onSelect, multiple = false, compact = false }) {
  return <div className={`inline-consult-options${compact ? ' inline-consult-options-compact' : ''}`}>{options.map(option =>
    <label className="inline-consult-option" key={option}>
      <input type={multiple ? 'checkbox' : 'radio'} name={name} checked={multiple ? value.includes(option) : value === option}
        onChange={() => onSelect(option)} />
      <span>{option}</span>
    </label>
  )}</div>;
}

export default function SupportConsultationInline({ reviewOnly = false }) {
  const [values, setValues] = useState(initialValues);
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const key = useRef(requestKey());
  const frame = useRef(null);
  const params = new URLSearchParams(window.location.search);
  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const preview = reviewOnly || params.has('consultation_inline_preview');
  const endpoint = import.meta.env.VITE_SUPABASE_URL || '';
  const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const productionHost = ['tateito-yokoito.jp', 'www.tateito-yokoito.jp'].includes(window.location.hostname);
  const correctEndpoint = productionHost
    ? endpoint === 'https://wquxjeqkumossjxehdop.supabase.co'
    : local && params.has('test') && endpoint === 'https://gmyqqcnbuiaghbrxnkaz.supabase.co';
  const canSubmit = !preview && correctEndpoint && Boolean(publishableKey);
  const steps = stepsFor(values);
  const index = Math.min(stepIndex, steps.length - 1);
  const step = steps[index];
  const self = isSelfConsultation(values);
  const answers = formatSupportConsultation(values, 'hp-product');

  function change(field, value) {
    setValues(current => ({ ...current, [field]: value }));
    setError('');
  }

  function select(field, value, advance = true) {
    setValues(current => ({
      ...current,
      [field]: value,
      ...(field === 'consultationFor' ? { call: '', family: '', familyHelp: [], relation: '' } : {}),
      ...(field === 'family' ? { familyHelp: [] } : {}),
    }));
    setError('');
    if (advance) setStepIndex(current => current + 1);
  }

  function next() {
    const value = values[step];
    if (step === 'familyHelp' && !value.length) return setError('サポート方法を選択してください。');
    if (step === 'contact') {
      if (!values.name.trim()) return setError('お名前を入力してください。');
      if (!CONTACT_METHOD_OPTIONS.includes(values.contactMethod)) return setError('連絡方法を選択してください。');
      const email = values.email.trim();
      const phone = values.phone.trim();
      if (values.contactMethod === 'メール' && !email) return setError('メールアドレスを入力してください。');
      if (['電話', 'SMS（ショートメッセージ）'].includes(values.contactMethod) && !phone) return setError('電話番号を入力してください。');
      if (values.contactMethod === 'どれでもよい' && !email && !phone) return setError('メールか電話番号を入力してください。');
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('メールアドレスを確認してください。');
      if (phone && (!/^[0-9+()\-\s]{8,30}$/.test(phone) || phone.replace(/\D/g, '').length < 8)) return setError('電話番号を確認してください。');
    }
    if (step === 'message') { setError(''); setStepIndex(current => current + 1); return; }
    if (!value && step !== 'contact') return setError('回答を入力してください。');
    setError('');
    setStepIndex(current => current + 1);
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const problem = validateSupportConsultation(values);
    if (problem) { setError(problem); return; }
    if (answers.length > 2000) { setError('ご希望・ご質問を短くしてください。'); return; }
    if (preview) {
      setCompleted({ receiptNumber: 'SC-PREVIEW-0001', answers, customerEmailStatus: values.receiveCopy ? 'sent' : 'not_requested' });
      return;
    }
    if (!canSubmit) { setError('相談受付の準備中です。'); return; }
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${endpoint}/functions/v1/submit-commerce-v2-consultation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: publishableKey },
        body: JSON.stringify({
          requestKey: key.current,
          orderType: 'self', productPreference: 'undecided',
          standardExtraCount: 0, premiumExtraCount: 0,
          familyInvitationId: null, giftRecipientName: null,
          contactName: values.name.trim(), contactEmail: values.email.trim(), contactPhone: values.phone.trim(),
          consultationText: answers, consentToContact: values.consent, receiveCopy: values.receiveCopy,
          website: values.website,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || '送信できませんでした。時間をおいて再度お試しください。');
      setCompleted({
        receiptNumber: result.receiptNumber || consultationReceiptNumber(result.consultationId, result.receivedAt),
        answers, customerEmailStatus: result.customerEmailStatus,
      });
      frame.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } catch (cause) {
      setError(cause.message || '送信できませんでした。時間をおいて再度お試しください。');
    } finally {
      setBusy(false);
    }
  }

  let title = '';
  let content = null;
  const radio = (field, options) => <OptionList name={field} options={options} value={values[field]} onSelect={choice => select(field, choice)} />;
  switch (step) {
    case 'consultationFor':
      title = '今回のご相談は、どなたの人生史についてですか？';
      content = radio(step, CONSULTATION_FOR_OPTIONS); break;
    case 'age':
      title = self ? 'あなたの年代を教えてください。' : '人生史を制作する方の年代を教えてください。';
      content = radio(step, AGE_OPTIONS); break;
    case 'smartphone':
      title = self ? '普段、スマートフォンをどの程度使っていますか？' : 'その方は、普段どの程度スマートフォンを使っていますか？';
      content = radio(step, SMARTPHONE_OPTIONS); break;
    case 'call':
      title = self ? '電話やLINE通話でスタッフとお話しすることに不安はありますか？' : 'その方は、電話やLINE通話でスタッフとお話しできそうですか？';
      content = <>{self && <p className="inline-consult-hint">日程や回数などはご希望に合わせて設定します。</p>}{radio(step, self ? SELF_CALL_OPTIONS : CALL_OPTIONS)}</>; break;
    case 'family':
      title = self ? '制作を手伝ってもらう予定の方はいらっしゃいますか？' : 'あなたやご家族など、制作を手伝える方はいらっしゃいますか？';
      content = radio(step, self ? SELF_FAMILY_OPTIONS : FAMILY_OPTIONS); break;
    case 'familyHelp':
      title = self ? '直接会って手伝ってもらえますか？ 離れた場所からのサポートですか？' : '直接会ってのサポート、遠隔でのサポートなど、可能な方法を教えてください。';
      content = <><p className="inline-consult-hint">複数選択できます。</p><OptionList name={step} options={self ? SELF_FAMILY_HELP_OPTIONS : FAMILY_HELP_OPTIONS} value={values.familyHelp} multiple
        onSelect={choice => change('familyHelp', values.familyHelp.includes(choice) ? values.familyHelp.filter(item => item !== choice) : [...values.familyHelp, choice])} /></>; break;
    case 'relation':
      title = '人生史を制作する方とのご関係を教えてください。';
      content = radio(step, RELATION_OPTIONS.slice(1)); break;
    case 'contact':
      title = 'お名前とご連絡先';
      content = <>
        <div className="inline-consult-contact-fields">
          <input aria-label="お名前" placeholder="お名前" type="text" autoComplete="name" maxLength="200" value={values.name} onChange={event => change('name', event.target.value)} />
          <input aria-label="メールアドレス" placeholder="メールアドレス" type="email" autoComplete="email" maxLength="254" value={values.email} onChange={event => change('email', event.target.value)} />
          <input aria-label="電話番号" placeholder="電話番号" type="tel" autoComplete="tel" maxLength="30" value={values.phone} onChange={event => change('phone', event.target.value)} />
        </div>
        <p className="inline-consult-field-title">ご希望の連絡方法</p>
        <OptionList name="contactMethod" options={CONTACT_METHOD_OPTIONS} value={values.contactMethod} compact onSelect={choice => change('contactMethod', choice)} />
      </>; break;
    case 'message':
      title = 'その他、ご希望やご質問があればお聞かせください。';
      content = <textarea aria-label="その他、ご希望やご質問" rows="4" maxLength="500" value={values.message} onChange={event => change('message', event.target.value)} />; break;
    default:
      title = '送信前の確認';
      content = <><p className="inline-consult-hint">ご入力いただいた内容は、相談へのご連絡と制作方法のご案内のために利用します。送信時点では購入・決済は発生しません。</p>
        <label className="inline-consult-check"><input type="checkbox" checked={values.consent} onChange={event => change('consent', event.target.checked)} />個人情報の利用目的を確認し、連絡を受けることに同意します。</label>
        <label className="inline-consult-check"><input type="checkbox" checked={values.receiveCopy} onChange={event => change('receiveCopy', event.target.checked)} />送信内容の控えをメールで受け取る</label>
        {values.receiveCopy && !values.email.trim() && <label className="inline-consult-field">控えの送付先メールアドレス<input type="email" autoComplete="email" maxLength="254" value={values.email} onChange={event => change('email', event.target.value)} /></label>}
        <p className="inline-consult-hint">控えを希望する場合は、メールアドレスが必要です。</p>
        <a className="inline-consult-privacy" href={preview && local ? '/hp-nov8-full-preview.html?hp_preview_nov8=1&info=privacy' : '/?info=privacy'} target="_blank" rel="noopener noreferrer">プライバシーについて確認する →</a></>;
  }

  if (completed) return <section ref={frame} className="inline-consult-wizard inline-consult-complete" aria-live="polite">
    <p className="inline-consult-kicker">聞き取り制作サポート｜事前相談</p>
    <h4>ご相談を受け付けました。</h4>
    <p>内容を確認のうえ、ご希望の方法でご連絡いたします。</p>
    <p className="inline-consult-receipt">受付番号：<strong>{completed.receiptNumber}</strong></p>
    {preview && <p className="inline-consult-hint">これはプレビューです。受付保存・メール送信は行っていません。</p>}
    {values.receiveCopy && !preview && completed.customerEmailStatus !== 'sent' &&
      <p className="inline-consult-error" role="status">控えメールを送信できませんでした。受付は完了しています。下の内容をコピーして保存してください。</p>}
    {values.receiveCopy && !preview && completed.customerEmailStatus === 'sent' && <p>送信内容の控えをメールでお送りしました。</p>}
    <details><summary>送信内容の控えを表示</summary><pre>{completed.answers}</pre></details>
    <button type="button" className="inline-consult-secondary" onClick={async () => {
      try { await navigator.clipboard.writeText(`受付番号：${completed.receiptNumber}\n${completed.answers}`); setCopied(true); } catch { setCopied(false); }
    }}>{copied ? 'コピーしました' : '受付番号と回答内容をコピー'}</button>
  </section>;

  return <form ref={frame} className="inline-consult-wizard" onSubmit={submit} noValidate>
    <label className="inline-consult-honeypot" aria-hidden="true">こちらは入力しないでください<input type="text" name="website" tabIndex="-1" autoComplete="off" value={values.website} onChange={event => change('website', event.target.value)} /></label>
    <p className="inline-consult-kicker">聞き取り制作サポート｜事前相談</p>
    <p className="inline-consult-intro">ご本人の状況や、ご家族のサポート体制などをお伺いします。約2〜3分。</p>
    <div className="inline-consult-progress" aria-label={`質問 ${index + 1} / ${steps.length}`}><span style={{ width: `${((index + 1) / steps.length) * 100}%` }} /></div>
    <p className="inline-consult-count">{index + 1} / {steps.length}</p>
    <div className="inline-consult-question" key={step}>
      <h4>{step === 'consent' ? '' : `Q${index + 1}　`}{title}</h4>
      {content}
    </div>
    {error && <p className="inline-consult-error" role="alert">{error}</p>}
    <div className="inline-consult-actions">
      {index > 0 && <button type="button" className="inline-consult-secondary" onClick={() => { setStepIndex(index - 1); setError(''); }}>戻る</button>}
      {step === 'consent' ? <button type="submit" className="inline-consult-primary" disabled={busy || (!preview && !canSubmit)}>{busy ? '送信しています…' : '事前相談を送信する'}</button>
        : !['consultationFor', 'age', 'smartphone', 'call', 'family', 'relation'].includes(step)
          && <button type="button" className="inline-consult-primary" onClick={event => { event.preventDefault(); next(); }}>次へ →</button>}
    </div>
    {preview && <p className="inline-consult-preview-note">表示確認用プレビューです。実際の送信は行いません。</p>}
    {!preview && !canSubmit && <p className="inline-consult-error">相談受付の準備中です。</p>}
  </form>;
}
