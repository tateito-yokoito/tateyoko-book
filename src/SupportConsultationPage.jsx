import React, { useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  CONSULTATION_FOR_OPTIONS, AGE_OPTIONS, SMARTPHONE_OPTIONS, CALL_OPTIONS, SELF_CALL_OPTIONS,
  FAMILY_OPTIONS, SELF_FAMILY_OPTIONS, FAMILY_HELP_OPTIONS, SELF_FAMILY_HELP_OPTIONS,
  RELATION_OPTIONS, CONTACT_METHOD_OPTIONS, isSelfConsultation, needsFamilyHelp, getSupportSource,
  validateSupportConsultation, formatSupportConsultation, consultationReceiptNumber,
} from './lib/supportConsultation.js';

const empty = {
  consultationFor: '', age: '', smartphone: '', call: '', family: '', familyHelp: [], name: '', relation: '',
  email: '', phone: '', contactMethod: '', message: '', consent: false, receiveCopy: false, website: '',
};

function requestKey() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readPurchaseSelection() {
  try {
    const value = JSON.parse(sessionStorage.getItem('supportConsultationSelection') || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch { return {}; }
}

function ChoiceGroup({ number, legend, name, options, value, onChange, multiple = false, required = true }) {
  return <fieldset className="sc-question" aria-required={required}>
    <legend><span className="sc-number">Q{number}</span>{legend}{required && <small>必須</small>}</legend>
    <div className="sc-options">{options.map(option => <label key={option} className="sc-option">
      <input type={multiple ? 'checkbox' : 'radio'} name={name} value={option}
        checked={multiple ? value.includes(option) : value === option} onChange={() => onChange(option)} />
      <span>{option}</span>
    </label>)}</div>
  </fieldset>;
}

export default function SupportConsultationPage() {
  const params = new URLSearchParams(window.location.search);
  const selection = useRef(readPurchaseSelection()).current;
  const source = getSupportSource(params.get('source') || (selection.edition ? 'product-selection' : 'hp-product'));
  const preview = params.has('preview');
  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const productionHost = ['tateito-yokoito.jp', 'www.tateito-yokoito.jp'].includes(window.location.hostname);
  const testMode = local && params.has('test');
  const endpoint = import.meta.env.VITE_SUPABASE_URL || '';
  const publishableKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const correctEndpoint = productionHost
    ? endpoint === 'https://wquxjeqkumossjxehdop.supabase.co'
    : testMode && endpoint === 'https://gmyqqcnbuiaghbrxnkaz.supabase.co';
  const canSubmit = !preview && correctEndpoint && Boolean(publishableKey);
  const privacyUrl = local ? '/hp-nov8-full-preview.html?hp_preview_nov8=1&info=privacy' : '/?info=privacy';
  const [values, setValues] = useState(empty);
  const self = isSelfConsultation(values);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(null);
  const [copied, setCopied] = useState(false);
  const key = useRef(requestKey());
  const update = (field, value) => { setValues(current => ({ ...current, [field]: value })); setError(''); };
  const toggleHelp = option => update('familyHelp', values.familyHelp.includes(option)
    ? values.familyHelp.filter(value => value !== option) : [...values.familyHelp, option]);

  const submit = async event => {
    event.preventDefault();
    if (busy) return;
    const problem = validateSupportConsultation(values);
    if (problem) { setError(problem); document.getElementById('sc-error')?.scrollIntoView({ block: 'center' }); return; }
    if (!canSubmit) { setError('このプレビューからは送信できません。'); return; }
    const consultationText = formatSupportConsultation(values, source);
    if (consultationText.length > 2000) { setError('入力内容が長すぎます。その他のご希望を短くしてください。'); return; }
    setBusy(true);
    setError('');
    try {
      let accessToken = '';
      if (selection.familyInvitationId) {
        const authClient = createClient(endpoint, publishableKey);
        const { data } = await authClient.auth.getSession();
        accessToken = data.session?.access_token || '';
        if (!accessToken) throw new Error('家族招待に紐づくご相談は、購入画面にログインしてからお進みください。');
      }
      const response = await fetch(`${endpoint}/functions/v1/submit-commerce-v2-consultation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: publishableKey, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify({
          requestKey: key.current,
          orderType: selection.orderType === 'gift' ? 'gift' : 'self',
          productPreference: ['standard', 'premium'].includes(selection.edition) ? selection.edition : 'undecided',
          standardExtraCount: Number.isInteger(selection.standardExtraCount) ? selection.standardExtraCount : 0,
          premiumExtraCount: Number.isInteger(selection.premiumExtraCount) ? selection.premiumExtraCount : 0,
          familyInvitationId: selection.familyInvitationId || null,
          giftRecipientName: selection.orderType === 'gift' ? selection.giftRecipientName || null : null,
          contactName: values.name.trim(), contactEmail: values.email.trim(), contactPhone: values.phone.trim(),
          consultationText, consentToContact: values.consent, receiveCopy: values.receiveCopy, website: values.website,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || '送信できませんでした。時間をおいて再度お試しください。');
      sessionStorage.removeItem('supportConsultationSelection');
      const receiptNumber = result.receiptNumber || consultationReceiptNumber(result.consultationId, result.receivedAt);
      const answers = consultationText;
      setComplete({ receiptNumber, answers, customerEmailStatus: result.customerEmailStatus });
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch (cause) { setError(cause.message || '送信できませんでした。時間をおいて再度お試しください。'); }
    finally { setBusy(false); }
  };

  return <div className="sc-page">
    <header className="sc-header"><a href="/" aria-label="縦糸横糸のサイトへ"><img src={window.location.protocol === 'file:' ? '../../brand-logo-official.svg' : '/brand-logo-official.svg'} alt="縦糸横糸" width="190" height="46" /></a></header>
    <main className="sc-main">
      {complete ? <section className="sc-complete" role="status">
        <p className="sc-eyebrow">聞き取り制作サポート</p>
        <h1>ご相談を受け付けました。</h1>
        <p>聞き取り制作サポートへのご関心をありがとうございます。</p>
        <p>内容を確認のうえ、ご希望の方法でご連絡いたします。</p>
        <p className="sc-receipt-number">受付番号：<strong>{complete.receiptNumber}</strong></p>
        {values.receiveCopy && complete.customerEmailStatus !== 'sent' && <p className="sc-mail-warning">送信内容の控えメールを確認できませんでした。受付は完了しています。下の内容をコピーして保存してください。</p>}
        {values.receiveCopy && complete.customerEmailStatus === 'sent' && <p>送信内容の控えをメールでお送りしました。</p>}
        <div className="sc-answer-copy"><h2>送信内容の控え</h2><pre>{complete.answers}</pre><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(`受付番号：${complete.receiptNumber}\n${complete.answers}`); setCopied(true); } catch { setCopied(false); } }}>{copied ? 'コピーしました' : '受付番号と回答内容をコピー'}</button></div>
        <p className="sc-assurance">※この時点では、お申し込み・お支払いは発生しません。</p>
        <a className="sc-home" href="/">縦糸横糸のサイトへ戻る →</a>
      </section> : <>
        {local && <div className="sc-preview-note" role="note">TEST環境のプレビューです。{canSubmit ? '架空のデータのみ送信してください。' : 'この画面から送信はできません。'}</div>}
        <div className="sc-intro"><p className="sc-eyebrow">縦糸横糸｜年輪 nenrin</p><h1>聞き取り制作サポート<br />事前相談フォーム</h1>
          <p>ご本人の状況や、ご家族のサポート体制などをお伺いします。<br />ご回答をもとに、制作の進め方をご案内いたします。</p>
          <p className="sc-intro-note">相談無料・所要時間約2〜3分</p></div>
        <form onSubmit={submit} noValidate>
          <section className="sc-group"><h2><span>A</span>まず、ご相談について</h2>
            <ChoiceGroup number="1" legend="今回のご相談は、どなたの人生史についてですか？" name="consultationFor" options={CONSULTATION_FOR_OPTIONS} value={values.consultationFor} onChange={answer => { setValues(current => ({ ...current, consultationFor: answer, call: '', family: '', familyHelp: [], relation: '' })); setError(''); }} />
          </section>
          {values.consultationFor && <>
          <section className="sc-group"><h2><span>B</span>{self ? 'あなたについて' : '人生史を制作する方について'}</h2>
            <ChoiceGroup number="2" legend={self ? 'あなたの年代を教えてください。' : '人生史を制作する方の年代を教えてください。'} name="age" options={AGE_OPTIONS} value={values.age} onChange={answer => update('age', answer)} />
            <ChoiceGroup number="3" legend={self ? '普段、スマートフォンをどの程度使っていますか？' : 'その方は、普段どの程度スマートフォンを使っていますか？'} name="smartphone" options={SMARTPHONE_OPTIONS} value={values.smartphone} onChange={answer => update('smartphone', answer)} />
            <ChoiceGroup number="4" legend={self ? '電話やLINE通話でスタッフとお話しすることに不安はありますか？（日程や回数などはご希望に合わせて設定します）' : 'その方は、電話やLINE通話でスタッフとお話しできそうですか？'} name="call" options={self ? SELF_CALL_OPTIONS : CALL_OPTIONS} value={values.call} onChange={answer => update('call', answer)} />
          </section>
          <section className="sc-group"><h2><span>C</span>ご家族などのサポートについて</h2>
            <ChoiceGroup number="5" legend={self ? '制作を手伝ってもらう予定の方はいらっしゃいますか？' : 'あなたやご家族など、制作を手伝える方はいらっしゃいますか？'} name="family" options={self ? SELF_FAMILY_OPTIONS : FAMILY_OPTIONS} value={values.family} onChange={answer => { setValues(current => ({ ...current, family: answer, familyHelp: [] })); setError(''); }} />
            {needsFamilyHelp(values.family, self) && <ChoiceGroup number="6" legend={self ? '直接会って手伝ってもらえますか？ 離れた場所からのサポートですか？' : '直接会ってのサポート、遠隔でのサポートなど、可能な方法を教えてください。'} name="familyHelp" options={self ? SELF_FAMILY_HELP_OPTIONS : FAMILY_HELP_OPTIONS} value={values.familyHelp} multiple onChange={toggleHelp} />}
          </section>
          <section className="sc-group"><h2><span>D</span>ご相談者について</h2>
            <label className="sc-question sc-field"><span className="sc-field-title"><span className="sc-number">Q7</span>お名前<small>必須</small></span><input type="text" name="name" autoComplete="name" maxLength="200" value={values.name} onChange={event => update('name', event.target.value)} /></label>
            {!self && <ChoiceGroup number="8" legend="人生史を制作する方とのご関係を教えてください。" name="relation" options={RELATION_OPTIONS.slice(1)} value={values.relation} onChange={answer => update('relation', answer)} />}
            <div className="sc-question sc-contact"><p className="sc-field-title"><span className="sc-number">Q9</span>ご連絡先<small>いずれか必須</small></p><div className="sc-contact-fields">
              <label>メールアドレス<input type="email" name="email" autoComplete="email" maxLength="254" inputMode="email" value={values.email} onChange={event => update('email', event.target.value)} /></label>
              <label>電話番号<input type="tel" name="phone" autoComplete="tel" maxLength="30" inputMode="tel" value={values.phone} onChange={event => update('phone', event.target.value)} /></label>
            </div></div>
            <ChoiceGroup number="10" legend="ご希望の連絡方法" name="contactMethod" options={CONTACT_METHOD_OPTIONS} value={values.contactMethod} onChange={answer => update('contactMethod', answer)} />
            <label className="sc-question sc-field"><span className="sc-field-title"><span className="sc-number">Q11</span>その他、ご希望やご質問があればお聞かせください。</span><textarea name="message" rows="5" maxLength="500" placeholder={self ? '電話でお話しすることに少し不安があります。家族に写真の準備を手伝ってもらえます。' : '母が80代で、スマホは電話とLINE程度です。私が写真の準備はできますが、聞き取りはお願いしたいです。'} value={values.message} onChange={event => update('message', event.target.value)} /></label>
          </section>
          </>}
          <div className="sc-submit-area"><p>ご入力いただいた内容は、相談へのご連絡と制作方法のご案内のために利用します。送信時点では購入・決済は発生しません。</p>
            <p><a href={privacyUrl}>プライバシーについて確認する →</a></p>
            <label className="sc-consent"><input type="checkbox" checked={values.consent} onChange={event => update('consent', event.target.checked)} /><span>個人情報の利用目的を確認し、連絡を受けることに同意します。<strong>必須</strong></span></label>
            <label className="sc-consent sc-copy-choice"><input type="checkbox" checked={values.receiveCopy} onChange={event => update('receiveCopy', event.target.checked)} /><span>送信内容の控えをメールで受け取る</span></label>
            <label className="sc-honeypot" aria-hidden="true">こちらは入力しないでください<input type="text" name="website" tabIndex="-1" autoComplete="off" value={values.website} onChange={event => update('website', event.target.value)} /></label>
            {error && <p className="sc-error" id="sc-error" role="alert">{error}</p>}
            <button type="submit" disabled={busy || !canSubmit}>{busy ? '送信しています…' : '事前相談を送信する'}</button>
            {!canSubmit && <p className="sc-disabled-note">プレビューでは送信できません。</p>}
          </div>
        </form>
      </>}
    </main>
    <footer className="sc-footer"><a href="/">縦糸横糸のサイトへ戻る</a><span>© 縦糸横糸</span></footer>
  </div>;
}
