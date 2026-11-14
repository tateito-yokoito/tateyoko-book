import React, { useEffect, useRef, useState } from 'react';
import { clearCommercePurchaseIntent, readCommercePurchaseIntent } from './lib/commercePurchaseIntent.js';
import SupportConsultationInline from './SupportConsultationInline.jsx';

const yen = amount => Number.isInteger(amount) ? `${amount.toLocaleString('ja-JP')}円` : '価格を確認中';

function newRequestKey() {
  // crypto.randomUUID() is unavailable on HTTP LAN previews used by phones.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function checkoutErrorMessage(invokeError, data, fallback) {
  if (data?.error) return data.error;
  const response = invokeError?.context;
  if (typeof response?.json === 'function') {
    const details = await (typeof response.clone === 'function' ? response.clone() : response)
      .json().catch(() => null);
    if (details?.error) return details.error;
  }
  return fallback;
}

export default function CommerceV2Purchase({ client, projectId, initialOrderType = 'self', familyInvitation = null, onTryFree,
  phase, initialSelection = null, onProceed, onCompleted, projectAccessStatus = null }) {
  const isSelection = phase === 'selection';
  const isReview = phase === 'review';
  const [edition, setEdition] = useState(initialSelection?.edition || 'standard');
  const [method, setMethod] = useState(initialSelection?.productionMethod || 'self_or_family');
  const [standardExtraCount, setStandardExtraCount] = useState(initialSelection?.standardExtraCount || 0);
  const [premiumExtraCount, setPremiumExtraCount] = useState(initialSelection?.premiumExtraCount || 0);
  const [discountCode, setDiscountCode] = useState(initialSelection?.discountCode || '');
  const [purchaseFor, setPurchaseFor] = useState(initialSelection?.purchaseFor || (initialOrderType === 'gift' ? 'gift' : 'self'));
  const [giftMode, setGiftMode] = useState(initialSelection?.giftMode || 'recipient_led');
  const [gift, setGift] = useState({ recipient_name: familyInvitation?.recipient_name || initialSelection?.recipientName || '',
    recipient_email: familyInvitation?.recipient_email || '', gift_message: '' });
  const [quote, setQuote] = useState(null);
  const [catalogPrices, setCatalogPrices] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [approvedConsultation, setApprovedConsultation] = useState(null);
  const [consultationLoading, setConsultationLoading] = useState(false);
  const [consultationOpen, setConsultationOpen] = useState(false);
  const requestKey = useRef(newRequestKey());
  const linkedConsultationId = new URLSearchParams(window.location.search).get('consultation');
  const orderType = approvedConsultation?.orderType || purchaseFor;
  const alreadyPurchased = orderType === 'self' && ['paid', 'gifted', 'legacy'].includes(projectAccessStatus);
  const selection = { edition, productionMethod: method, standardExtraCount, premiumExtraCount, discountCode,
    purchaseFor: orderType, giftMode, recipientName: gift.recipient_name };

  // Derive the displayed product prices from the same server quote used for
  // checkout. A change in the catalog can no longer leave stale card prices.
  useEffect(() => {
    if (!isSelection) return;
    let active = true;
    const request = (edition, productionMethod = 'self_or_family', standardExtraCount = 0, premiumExtraCount = 0) =>
      client.functions.invoke('create-commerce-v2-checkout', { body: {
        action: 'public_quote', orderType: 'self', edition, productionMethod,
        standardExtraCount, premiumExtraCount,
      } }).then(({ data, error: invokeError }) => {
        if (invokeError || !data?.success || !Number.isInteger(data.quote?.amount_subtotal))
          throw new Error('商品価格を確認できませんでした');
        return data.quote.amount_subtotal;
      });
    Promise.all([
      request('standard'), request('premium'), request('standard', 'self_or_family', 1),
      request('standard', 'self_or_family', 0, 1), request('standard', 'interview_staff'),
    ]).then(([standard, premium, withStandard, withPremium, withInterview]) => {
      if (active) setCatalogPrices({ standard, premium,
        standardExtra: withStandard - standard, premiumExtra: withPremium - standard,
        interview: withInterview - standard });
    }).catch(() => { if (active) setCatalogPrices(null); });
    return () => { active = false; };
  }, [client, isSelection]);

  useEffect(() => {
    if (!isSelection || !consultationOpen) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/support-consultation-inline.css';
    document.head.appendChild(link);
    return () => link.remove();
  }, [isSelection, consultationOpen]);

  useEffect(() => {
    if (!isSelection) return;
    const restoreAfterBack = () => {
      const saved = readCommercePurchaseIntent(window.localStorage);
      if (!saved) return;
      setEdition(saved.edition);
      setMethod(saved.productionMethod);
      setStandardExtraCount(saved.standardExtraCount);
      setPremiumExtraCount(saved.premiumExtraCount);
      setDiscountCode(saved.discountCode);
      setPurchaseFor(saved.purchaseFor);
      setGiftMode(saved.giftMode);
      setGift(current => ({ ...current, recipient_name: saved.recipientName }));
    };
    window.addEventListener('pageshow', restoreAfterBack);
    return () => window.removeEventListener('pageshow', restoreAfterBack);
  }, [isSelection]);

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
    let active = true;
    setQuote(null);
    setError(alreadyPurchased ? 'この物語は購入済みです。ホームから制作を続けてください。' : '');
    if (alreadyPurchased) return () => { active = false; };
    const load = () => client.functions.invoke('create-commerce-v2-checkout', { body: {
      // The public estimate has no purchaser or gift context; the authenticated
      // quote below rechecks the actual order type before Checkout.
      action: isSelection ? 'public_quote' : 'quote', orderType: isSelection ? 'self' : orderType,
      projectId, edition, productionMethod: method,
      standardExtraCount, premiumExtraCount, discountCode,
      consultationId: approvedConsultation?.id || null,
    } }).then(async ({ data, error: invokeError }) => {
      if (!active) return;
      if (invokeError || !data?.success) {
        setQuote(null);
        const message = await checkoutErrorMessage(invokeError, data, '金額を確認できませんでした');
        if (active) setError(message);
      } else setQuote(data.quote);
    });
    const timer = isSelection ? window.setTimeout(load, 300) : null;
    if (!isSelection) void load();
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [client, orderType, projectId, edition, method, standardExtraCount, premiumExtraCount, discountCode, approvedConsultation?.id, isSelection, alreadyPurchased]);

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
      if (invokeError || !data?.success)
        throw new Error(await checkoutErrorMessage(invokeError, data, '購入手続きを開始できませんでした'));
      if (data.retryRequired) {
        requestKey.current = newRequestKey();
        setError(data.message || '決済期限が切れました。もう一度お試しください');
        setBusy(false);
        return;
      }
      if (data.completed) {
        if (isReview && orderType === 'gift') {
          if (!data.order?.id || !data.gift?.claim_token || !onCompleted) {
            throw new Error('贈り物の購入内容を確認できませんでした');
          }
          onCompleted(data);
          return;
        }
        if (isReview) {
          clearCommercePurchaseIntent(window.localStorage);
          const url = new URL(window.location.href);
          url.searchParams.delete('purchase_review');
          url.searchParams.delete('purchase_handoff');
          url.searchParams.set('entry', 'purchased');
          window.location.replace(url.toString());
        } else window.location.reload();
        return;
      }
      if (!data.url) throw new Error('決済画面を開けませんでした');
      window.location.assign(data.url);
    } catch (cause) {
      setError(cause.message || '購入手続きを開始できませんでした');
      setBusy(false);
    }
  };

  const openSupportConsultation = () => {
    if (orderType === 'gift' && !gift.recipient_name.trim()) {
      setError('贈る相手のお名前を入力してください');
      return;
    }
    try {
      window.sessionStorage.setItem('supportConsultationSelection', JSON.stringify({
        orderType, edition, standardExtraCount, premiumExtraCount, giftMode, discountCode,
        giftRecipientName: orderType === 'gift' ? gift.recipient_name.trim() : null,
        familyInvitationId: familyInvitation?.id || null,
      }));
      const url = new URL('/support-consultation/', window.location.origin);
      url.searchParams.set('source', 'product-selection');
      if (['localhost', '127.0.0.1'].includes(window.location.hostname)) url.searchParams.set('test', '1');
      window.location.assign(url.toString());
    } catch {
      setError('相談内容を引き継げません。ブラウザの保存設定を確認してください。');
    }
  };
  if (linkedConsultationId && consultationLoading) return <p className="px-6 py-16 text-center text-white">相談内容を確認しています…</p>;
  if (approvedConsultation?.status === 'paid') return (
    <p className="px-6 py-16 text-center text-white">お支払いが完了しました。スタッフからのご連絡をお待ちください。</p>
  );
  if (approvedConsultation && !['agreed', 'checkout_pending'].includes(approvedConsultation.status)) return (
    <p className="px-6 py-16 text-center text-white">相談内容の確認中です。スタッフからのご案内をお待ちください。</p>
  );

  if (isSelection) return (
    <section className="min-h-screen bg-[#f8f7f2] px-5 py-8 font-sans text-[#203a34] sm:px-8">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs tracking-[0.18em] text-[#65756b]">縦糸横糸｜年輪 nenrin</p>
        <h1 className="mt-3 font-serif text-3xl leading-relaxed">あなたに合う一冊をお選びください。</h1>
        <product-comparison-media class="mt-6" />

        {!familyInvitation && !approvedConsultation && <div className="mt-9">
          <h2 className="font-serif text-xl">どなたの人生史をつくりますか？</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[#e9ece5] p-1">
            <button type="button" aria-pressed={orderType === 'self'} className={`rounded-lg px-2 py-3 text-sm ${orderType === 'self' ? 'bg-white font-bold shadow-sm' : ''}`} onClick={() => setPurchaseFor('self')}>自分の人生史</button>
            <button type="button" aria-pressed={orderType === 'gift'} className={`rounded-lg px-2 py-3 text-sm ${orderType === 'gift' ? 'bg-white font-bold shadow-sm' : ''}`} onClick={() => setPurchaseFor('gift')}>大切な方へ贈る</button>
          </div>
          {orderType === 'gift' && <div className="mt-5">
            <h3 className="text-lg font-semibold leading-7">どなたのスマホで作品づくりを進めますか？</h3>
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[#e9ece5] p-1">
              <button type="button" aria-pressed={giftMode === 'family_managed'} className={`rounded-lg px-2 py-3 text-sm ${giftMode === 'family_managed' ? 'bg-white font-bold shadow-sm' : ''}`} onClick={() => setGiftMode('family_managed')}>あなたのスマホ</button>
              <button type="button" aria-pressed={giftMode === 'recipient_led'} className={`rounded-lg px-2 py-3 text-sm ${giftMode === 'recipient_led' ? 'bg-white font-bold shadow-sm' : ''}`} onClick={() => setGiftMode('recipient_led')}>贈り先の方のスマホ</button>
            </div>
            <div className="mt-3 rounded-xl border border-[#d7dbd0] bg-white px-4 py-4">
              <ul className="list-disc space-y-1 pl-5 text-sm leading-7">
                {(giftMode === 'family_managed'
                  ? ['ご本人のスマホ操作・会員登録は不要です。', 'あなたのスマホで、質問の回答や写真追加などを進められます。', '後からご本人のスマホを招待し、一緒に進めることもできます。']
                  : ['贈られた方、本人のスマホで登録し、作品づくりを進めます。', 'ご家族も招待を受けて、お手伝いできます。']).map(item => <li key={item}>{item}</li>)}
              </ul>
              <p className="mt-4 font-semibold text-[#a34b35]">45日間の返金保証で安心して贈ることができます</p>
              <p className="mt-1 text-sm leading-6 text-[#6b5d57]">決済日から45日以内、かつ本編開始前まで。追加冊子・聞き取り制作サポートを含む、お支払い総額が対象です。</p>
            </div>
          </div>}
        </div>}

        <div className="mt-9">
          <h2 className="font-serif text-xl">ブックの装いを選ぶ</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {[['standard', 'スタンダード', '軽やかで、手に取りやすい一冊。', '上質なソフトカバー'], ['premium', 'プレミアム', '想いをのせる、特別な装い。', '布貼り上製本・箔押し']].map(([value, name, description, cover]) => (
              <button key={value} type="button" aria-pressed={edition === value} disabled={Boolean(approvedConsultation)} onClick={() => { setEdition(value); requestKey.current = newRequestKey(); }}
                className={`min-h-48 rounded-xl border p-4 text-left ${edition === value ? 'border-[#315a49] bg-white' : 'border-[#cfd5ca] bg-[#f1f6ef]'}`}>
                <span className="block text-lg font-bold">{name}</span>
                <span className="mt-2 block text-sm leading-6">{description}</span>
                <span className="mt-2 block text-sm font-semibold">{cover}</span>
                <span className="mt-3 block text-xl font-bold">{yen(catalogPrices?.[value])}<small className="ml-1 text-xs font-normal">税込</small></span>
                <span className="mt-1 block text-xs text-[#2a6550]">{edition === value ? '✓ 選択中' : '選択する'}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-9">
          <h2 className="font-serif text-xl">追加の冊子</h2>
          <p className="mt-2 text-sm leading-7 text-[#65756b]">必要な場合だけお選びください。物語の制作開始後にも追加できます。</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-2 border-b border-[#e5e6df] py-3 text-sm">スタンダードを追加（{yen(catalogPrices?.standardExtra)}／冊）<select className="rounded-lg border border-[#cbd4cb] bg-white p-2 text-base" value={standardExtraCount} disabled={Boolean(approvedConsultation)} onChange={event => { setStandardExtraCount(Number(event.target.value)); requestKey.current = newRequestKey(); }}>{Array.from({ length: 31 }, (_, count) => <option key={count} value={count}>{count}冊</option>)}</select></label>
            <label className="flex items-center justify-between gap-2 border-b border-[#e5e6df] py-3 text-sm">プレミアムを追加（{yen(catalogPrices?.premiumExtra)}／冊）<select className="rounded-lg border border-[#cbd4cb] bg-white p-2 text-base" value={premiumExtraCount} disabled={Boolean(approvedConsultation)} onChange={event => { setPremiumExtraCount(Number(event.target.value)); requestKey.current = newRequestKey(); }}>{Array.from({ length: 31 }, (_, count) => <option key={count} value={count}>{count}冊</option>)}</select></label>
          </div>
        </div>

        <div className="mt-9 rounded-xl border border-[#cdd6ca] bg-[#f4f6ef] p-5">
          <p className="text-xs text-[#47745e]">制作方法のオプション</p>
          <h2 className="mt-1 text-xl font-bold">聞き取り制作サポート</h2>
          <p className="mt-3 text-sm leading-7">スタッフが電話・LINE通話でお話を伺い、制作も進めます。<br />対面ご希望の場合は、その旨も相談フォームにご記入ください。</p>
          <p className="mt-3 text-2xl font-bold">＋{yen(catalogPrices?.interview)} <small className="text-xs font-normal">税込</small></p>
          <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={method === 'interview_staff'} disabled={Boolean(approvedConsultation)} onChange={event => { setMethod(event.target.checked ? 'interview_staff' : 'self_or_family'); requestKey.current = newRequestKey(); }} />聞き取り制作サポートを選ぶ</label>
          <p className="mt-3 text-sm leading-7">お気軽にご相談ください。決済は前後しても構いません。</p>
          <button type="button" aria-expanded={consultationOpen} aria-controls="purchase-consultation-form" className={`mt-3 w-full border border-[#315a49] bg-white px-4 py-3 font-semibold ${consultationOpen ? 'rounded-t-lg border-b-0' : 'rounded-lg'}`} onClick={() => setConsultationOpen(open => !open)}>{consultationOpen ? '事前相談フォームを閉じる' : '事前相談フォームを開く'}</button>
          {consultationOpen && <div id="purchase-consultation-form" className="rounded-b-lg border border-t-0 border-[#315a49] bg-white"><SupportConsultationInline purchaseSelection={selection} /></div>}
        </div>

        {orderType === 'gift' && <label className="mt-8 block text-sm font-semibold">贈る相手のお名前<input className="mt-2 w-full rounded-lg border border-[#bfc9bd] bg-white p-3 text-base" value={gift.recipient_name} disabled={Boolean(familyInvitation)} onChange={event => setGift(current => ({ ...current, recipient_name: event.target.value }))} /></label>}
        <label className="mt-8 block text-sm font-semibold">割引コード（お持ちの方）<input className="mt-2 w-full rounded-lg border border-[#bfc9bd] bg-white p-3 text-base" value={discountCode} onChange={event => { setDiscountCode(event.target.value); requestKey.current = newRequestKey(); }} /></label>
        <div className="mt-7 rounded-xl bg-[#eaf0e8] p-5" aria-live="polite">
          <p className="flex justify-between gap-3 py-2 text-sm"><span>商品・オプション</span><span>{quote ? yen(quote.amount_subtotal) : '確認中'}</span></p>
          <p className="flex justify-between gap-3 py-2 text-sm"><span>割引</span><span>{quote ? `−${Number(quote.discount_amount || 0).toLocaleString('ja-JP')}円` : '—'}</span></p>
          <p className="mt-2 flex justify-between gap-3 border-t border-[#c4d1c5] pt-4 text-lg font-bold"><span>お支払い合計</span><span>{quote ? `${Number(quote.amount_total).toLocaleString('ja-JP')}円` : error ? '確認できませんでした' : '確認中'}</span></p>
          <p className="mt-2 text-xs leading-6 text-[#65756b]">税込。正式な価格・割引は認証後に再確認します。</p>
        </div>
        {method === 'interview_staff' && <p role="note" className="mt-4 text-sm font-semibold leading-7 text-[#a34b35]">聞き取り制作サポートにお申し込みの方は、必ず事前相談フォームにもご入力ください。</p>}
        <button type="button" className="mt-5 w-full rounded-full bg-[#244c3c] px-5 py-4 text-lg font-bold text-white disabled:opacity-50" disabled={busy || !quote || !catalogPrices || (orderType === 'gift' && !gift.recipient_name.trim())} onClick={async () => {
          setBusy(true); setError('');
          try { await onProceed?.({ ...selection, quotedAmountTotal: quote?.amount_total, quotedDiscountAmount: quote?.discount_amount }); }
          catch (cause) { setError(cause?.message || '購入内容を保存できませんでした。もう一度お試しください。'); setBusy(false); }
        }}>購入手続きへ進む</button>
        <p className="mt-3 text-center text-sm text-[#65756b]">購入手続きには登録またはログインが必要です。</p>
        {error && <p role="alert" className="mt-5 text-[#a34b35]">{error}</p>}
        {onTryFree && <button className="mt-8 text-sm text-[#53645b] underline" onClick={onTryFree}>無料で3問体験する</button>}
      </div>
    </section>
  );

  if (isReview) return (
    <section className="mx-auto max-w-2xl px-6 py-12 text-white">
      <h1 className="text-2xl">注文内容の最終確認</h1>
      <p className="mt-3 text-sm leading-7 text-white/75">お支払いの前に、選んだ内容と認証後の金額をご確認ください。</p>
      <div className="mt-8 rounded-2xl border border-white/20 bg-white/[0.05] p-5">
        <dl className="space-y-4">
          <div className="flex justify-between gap-4"><dt className="text-white/70">商品</dt><dd className="text-right">{edition === 'premium' ? 'プレミアム' : 'スタンダード'}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-white/70">購入対象</dt><dd className="text-right">{orderType === 'gift' ? `贈り物・${giftMode === 'family_managed' ? 'あなたのスマホで制作' : '贈り先の方のスマホで制作'}` : '自分の人生史'}</dd></div>
          {orderType === 'gift' && <div className="flex justify-between gap-4"><dt className="text-white/70">物語のご本人</dt><dd className="text-right">{gift.recipient_name}</dd></div>}
          <div className="flex justify-between gap-4"><dt className="text-white/70">制作方法</dt><dd className="text-right">{method === 'interview_staff' ? 'スタッフに聞き取ってもらう' : '自分・家族で制作する'}</dd></div>
          {standardExtraCount > 0 && <div className="flex justify-between gap-4"><dt className="text-white/70">追加スタンダード冊子</dt><dd>{standardExtraCount}冊</dd></div>}
          {premiumExtraCount > 0 && <div className="flex justify-between gap-4"><dt className="text-white/70">追加プレミアム冊子</dt><dd>{premiumExtraCount}冊</dd></div>}
          {discountCode.trim() && <div className="flex justify-between gap-4"><dt className="text-white/70">割引コード</dt><dd className="break-all text-right">{discountCode.trim()}</dd></div>}
        </dl>
        <div className="mt-6 space-y-3 border-t border-white/20 pt-5" aria-live="polite">
          <p className="flex justify-between gap-4"><span className="text-white/70">商品・オプション</span><span>{quote ? Number(quote.amount_subtotal).toLocaleString('ja-JP') + '円' : '確認中'}</span></p>
          <p className="flex justify-between gap-4"><span className="text-white/70">割引</span><span>{quote ? '−' + Number(quote.discount_amount || 0).toLocaleString('ja-JP') + '円' : '—'}</span></p>
          <p className="flex justify-between gap-4 border-t border-white/20 pt-4 text-xl"><span>お支払い合計</span><strong>{quote ? Number(quote.amount_total).toLocaleString('ja-JP') + '円（税込）' : error ? '確認できませんでした' : '確認中'}</strong></p>
        </div>
      </div>
      {initialSelection?.quotedAmountTotal != null && quote
        && Number(quote.amount_total) !== initialSelection.quotedAmountTotal &&
        <p role="status" className="mt-5 rounded-xl border border-amber-200/50 p-4 text-sm leading-6 text-amber-100">認証後の割引条件または商品価格が変わりました。選択時のお支払い合計は{initialSelection.quotedAmountTotal.toLocaleString('ja-JP')}円、現在は{Number(quote.amount_total).toLocaleString('ja-JP')}円です。新しい金額を確認してからお進みください。</p>}
      {error && <p role="alert" className="mt-5 text-rose-200">{error}</p>}
      {method === 'interview_staff' && <p role="note" className="mt-5 text-sm font-semibold leading-7 text-rose-200">聞き取り制作サポートにお申し込みの方は、必ず事前相談フォームにもご入力ください。</p>}
      <button type="button" className="mt-8 w-full rounded-full bg-white py-4 text-slate-900 disabled:opacity-50" disabled={busy || !quote} onClick={checkout}>お支払いへ進む</button>
      <button type="button" className="mt-5 w-full text-sm text-white/70 underline" onClick={() => {
        const url = new URL(window.location.href);
        url.searchParams.delete('purchase_review');
        window.location.assign(url.toString());
      }}>選択内容を変更する</button>
    </section>
  );

  return null;
}
