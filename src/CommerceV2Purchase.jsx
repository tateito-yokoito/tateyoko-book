import React, { useEffect, useRef, useState } from 'react';

const choiceClass = 'rounded-2xl border border-white/20 bg-white/[0.05] px-4 py-4 text-left text-white';

function newRequestKey() {
  // crypto.randomUUID() is unavailable on HTTP LAN previews used by phones.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default function CommerceV2Purchase({ client, projectId, initialOrderType = 'self', familyInvitation = null, onTryFree }) {
  const [edition, setEdition] = useState('standard');
  const [method, setMethod] = useState('self_or_family');
  const [standardExtraCount, setStandardExtraCount] = useState(0);
  const [premiumExtraCount, setPremiumExtraCount] = useState(0);
  const [discountCode, setDiscountCode] = useState('');
  const [gift, setGift] = useState({ recipient_name: familyInvitation?.recipient_name || '',
    recipient_email: familyInvitation?.recipient_email || '', gift_message: '' });
  const [contact, setContact] = useState({ contactName: '', contactEmail: '', contactPhone: '', consultationText: '' });
  const [productPreference, setProductPreference] = useState('standard');
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [contactConsent, setContactConsent] = useState(false);
  const [consultationId, setConsultationId] = useState(null);
  const [approvedConsultation, setApprovedConsultation] = useState(null);
  const [consultationLoading, setConsultationLoading] = useState(false);
  const requestKey = useRef(newRequestKey());
  const consultationKey = useRef(newRequestKey());
  const linkedConsultationId = new URLSearchParams(window.location.search).get('consultation');
  const orderType = approvedConsultation?.orderType || (initialOrderType === 'gift' ? 'gift' : 'self');

  useEffect(() => {
    if (!linkedConsultationId) return;
    let active = true;
    setConsultationLoading(true);
    client.functions.invoke('get-commerce-v2-consultation', { body: { consultationId: linkedConsultationId } })
      .then(({ data, error: invokeError }) => {
        if (!active) return;
        if (invokeError || !data?.success) {
          setError(data?.error || '相談内容を確認できませんでした');
          return;
        }
        setApprovedConsultation(data.consultation);
        if (data.consultation.edition) setEdition(data.consultation.edition);
        setMethod('interview_staff');
        setStandardExtraCount(data.consultation.standardExtraCount);
        setPremiumExtraCount(data.consultation.premiumExtraCount);
        if (data.consultation.giftRecipientName) setGift(current => ({ ...current, recipient_name: data.consultation.giftRecipientName }));
      }).finally(() => { if (active) setConsultationLoading(false); });
    return () => { active = false; };
  }, [client, linkedConsultationId]);

  useEffect(() => {
    if (method !== 'self_or_family' && !['agreed', 'checkout_pending'].includes(approvedConsultation?.status)) {
      setQuote(null); return;
    }
    let active = true;
    setQuote(null);
    setError('');
    client.functions.invoke('create-commerce-v2-checkout', { body: {
      action: 'quote', orderType, projectId, edition, productionMethod: method,
      standardExtraCount, premiumExtraCount, discountCode,
      consultationId: approvedConsultation?.id || null,
    } }).then(({ data, error: invokeError }) => {
      if (!active) return;
      if (invokeError || !data?.success) {
        setQuote(null);
        setError(data?.error || '金額を確認できませんでした');
      } else setQuote(data.quote);
    });
    return () => { active = false; };
  }, [client, orderType, projectId, edition, method, standardExtraCount, premiumExtraCount, discountCode, approvedConsultation?.id]);

  const checkout = async () => {
    if (!quote || busy) return;
    if (orderType === 'gift' && !gift.recipient_name.trim()) {
      setError('贈る相手のお名前を入力してください');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data, error: invokeError } = await client.functions.invoke('create-commerce-v2-checkout', { body: {
        action: 'checkout', requestKey: requestKey.current,
        expectedQuote: quote, orderType, projectId, edition,
        productionMethod: method, standardExtraCount, premiumExtraCount,
        discountCode, gift, consultationId: approvedConsultation?.id || null,
        familyInvitationId: approvedConsultation?.familyInvitationId || familyInvitation?.id || null,
      } });
      if (invokeError || !data?.success) throw new Error(data?.error || '購入手続きを開始できませんでした');
      if (data.retryRequired) {
        requestKey.current = newRequestKey();
        setError(data.message || '決済期限が切れました。もう一度お試しください');
        setBusy(false);
        return;
      }
      if (data.completed) { window.location.reload(); return; }
      if (!data.url) throw new Error('決済画面を開けませんでした');
      window.location.assign(data.url);
    } catch (cause) {
      setError(cause.message || '購入手続きを開始できませんでした');
      setBusy(false);
    }
  };

  const submitConsultation = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: invokeError } = await client.functions.invoke('submit-commerce-v2-consultation', { body: {
        requestKey: consultationKey.current, productPreference,
        orderType,
        standardExtraCount, premiumExtraCount, ...contact,
        consentToContact: contactConsent,
        familyInvitationId: familyInvitation?.id || null,
        giftRecipientName: orderType === 'gift' ? gift.recipient_name : null,
      } });
      if (invokeError || !data?.success) throw new Error(data?.error || '無料相談を申し込めませんでした');
      setConsultationId(data.consultationId);
    } catch (cause) {
      setError(cause.message || '無料相談を申し込めませんでした');
    } finally { setBusy(false); }
  };

  if (consultationId) return (
    <section className="mx-auto max-w-xl px-6 py-20 text-center text-white">
      <h1 className="text-2xl">無料相談を受け付けました</h1>
      <p className="mt-6 leading-8 text-white/75">スタッフから電話またはメールでご連絡します。現時点で有料注文・決済は発生していません。</p>
    </section>
  );
  if (linkedConsultationId && consultationLoading) return <p className="px-6 py-16 text-center text-white">相談内容を確認しています…</p>;
  if (approvedConsultation?.status === 'paid') return (
    <p className="px-6 py-16 text-center text-white">お支払いが完了しました。スタッフからのご連絡をお待ちください。</p>
  );
  if (approvedConsultation && !['agreed', 'checkout_pending'].includes(approvedConsultation.status)) return (
    <p className="px-6 py-16 text-center text-white">相談内容の確認中です。スタッフからのご案内をお待ちください。</p>
  );

  return (
    <section className="mx-auto max-w-2xl px-6 py-12 text-white">
      <h1 className="text-2xl">縦糸横糸ブックを選ぶ</h1>
      <p className="mt-3 leading-7 text-white/75">どちらもWebブック付き。違いは紙のブックの装丁です。</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {[['standard', 'スタンダード', 'B5ソフトカバー', '35,000円'], ['premium', 'プレミアム', '布貼り上製本', '65,000円']].map(([value, name, cover, price]) => (
          <button key={value} type="button" className={`${choiceClass} ${edition === value ? 'border-amber-200 bg-amber-200/10' : ''}`}
            aria-pressed={edition === value} disabled={Boolean(approvedConsultation)} onClick={() => { setEdition(value); setProductPreference(value); requestKey.current = newRequestKey(); }}>
            <span className="flex items-center justify-between gap-3 text-lg"><span>{name}</span><span className="text-sm text-amber-200">{edition === value ? '✓ 選択中' : '選択する'}</span></span>
            <span className="mt-2 block text-sm text-white/70">{cover}・Webブック</span>
            <span className="mt-3 block">{price}（税込）</span>
          </button>
        ))}
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <label>追加スタンダード冊子（5,000円／冊）
          <select className="mt-2 w-full rounded-xl bg-white px-3 py-3 text-base text-slate-900" value={standardExtraCount} disabled={Boolean(approvedConsultation)}
            onChange={event => { setStandardExtraCount(Number(event.target.value)); requestKey.current = newRequestKey(); }}>
            {Array.from({ length: 31 }, (_, count) => <option key={count} value={count}>{count}冊</option>)}
          </select>
        </label>
        <label>追加プレミアム冊子（35,000円／冊）
          <select className="mt-2 w-full rounded-xl bg-white px-3 py-3 text-base text-slate-900" value={premiumExtraCount} disabled={Boolean(approvedConsultation)}
            onChange={event => { setPremiumExtraCount(Number(event.target.value)); requestKey.current = newRequestKey(); }}>
            {Array.from({ length: 31 }, (_, count) => <option key={count} value={count}>{count}冊</option>)}
          </select>
        </label>
      </div>
      <fieldset className="mt-8">
        <legend className="text-lg">制作方法</legend>
        <label className="mt-3 flex gap-3"><input type="radio" checked={method === 'self_or_family'} disabled={Boolean(approvedConsultation)} onChange={() => { setMethod('self_or_family'); requestKey.current = newRequestKey(); }} />自分・家族で制作する</label>
        <label className="mt-3 flex gap-3"><input type="radio" checked={method === 'interview_staff'} disabled={Boolean(approvedConsultation)} onChange={() => { setMethod('interview_staff'); requestKey.current = newRequestKey(); }} />スタッフに聞き取ってもらう（＋20,000円）</label>
        <p className="mt-3 text-sm leading-6 text-white/70">聞き取り制作サポートは無料相談後、合意してから一括決済します。スマホ操作が苦手な方もご相談いただけます。</p>
      </fieldset>
      {method === 'interview_staff' && !approvedConsultation ? (
        <div className="mt-8 space-y-4">
          {orderType === 'gift' && <label className="block">贈る相手のお名前<input className="mt-2 w-full rounded-xl bg-white px-3 py-2 text-slate-900" value={gift.recipient_name} disabled={Boolean(familyInvitation)}
            onChange={event => setGift(current => ({ ...current, recipient_name: event.target.value }))} /></label>}
          <label className="block">冊子タイプ
            <select className="mt-2 w-full rounded-xl bg-white px-3 py-2 text-slate-900" value={productPreference} onChange={event => setProductPreference(event.target.value)}>
              <option value="standard">スタンダード</option><option value="premium">プレミアム</option><option value="undecided">相談して決めたい</option>
            </select>
          </label>
          {[['contactName', 'お名前'], ['contactEmail', 'メールアドレス'], ['contactPhone', '電話番号']].map(([key, label]) => (
            <label key={key} className="block">{label}<input className="mt-2 w-full rounded-xl bg-white px-3 py-2 text-slate-900" value={contact[key]}
              onChange={event => setContact(current => ({ ...current, [key]: event.target.value }))} /></label>
          ))}
          <label className="block">ご相談内容<textarea className="mt-2 w-full rounded-xl bg-white px-3 py-2 text-slate-900" rows="4" value={contact.consultationText}
            onChange={event => setContact(current => ({ ...current, consultationText: event.target.value }))} /></label>
          <label className="flex gap-3 text-sm leading-6 text-white/70"><input type="checkbox" checked={contactConsent} onChange={event => setContactConsent(event.target.checked)} />ご連絡のために入力内容を利用することに同意します。送信時点で費用はかかりません。</label>
          <button className="w-full rounded-full bg-white py-4 text-slate-900 disabled:opacity-50" disabled={busy || !contactConsent || !contact.contactName.trim() || (orderType === 'gift' && !gift.recipient_name.trim()) || (!contact.contactEmail.trim() && !contact.contactPhone.trim())}
            onClick={submitConsultation}>無料相談を申し込む</button>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {orderType === 'gift' && <label className="block">贈る相手のお名前<input className="mt-2 w-full rounded-xl bg-white px-3 py-2 text-slate-900" value={gift.recipient_name} disabled={Boolean(familyInvitation)}
            onChange={event => setGift(current => ({ ...current, recipient_name: event.target.value }))} /></label>}
          <label className="block">割引コード<input className="mt-2 w-full rounded-xl bg-white px-3 py-2 text-slate-900" value={discountCode}
            onChange={event => { setDiscountCode(event.target.value); requestKey.current = newRequestKey(); }} /></label>
          <p className="text-xl">お支払い合計：{quote ? Number(quote.amount_total).toLocaleString('ja-JP') + '円（税込）' : error ? '確認できませんでした' : '確認中'}</p>
          <button className="w-full rounded-full bg-white py-4 text-slate-900 disabled:opacity-50" disabled={busy || !quote} onClick={checkout}>決済へ進む</button>
        </div>
      )}
      {error && <p role="alert" className="mt-5 text-rose-200">{error}</p>}
      {onTryFree && <button className="mt-8 text-sm text-white/70 underline" onClick={onTryFree}>無料で3問体験する</button>}
    </section>
  );
}
