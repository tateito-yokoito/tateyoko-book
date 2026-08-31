import React, { useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Gift, Mail, Package, Smartphone, Users } from "lucide-react";

const RELATIONSHIPS = [
  ["parent", "親"],
  ["grandparent", "祖父母"],
  ["spouse", "配偶者・パートナー"],
  ["sibling", "きょうだい"],
  ["child", "子ども"],
  ["grandchild", "孫"],
  ["other", "その他"]
];

const MESSAGE_TEMPLATES = [
  ["gratitude", "ありがとうを伝える"],
  ["hear_your_story", "あなたの話を聞きたい"],
  ["keep_in_family", "家族に残したい"],
  ["celebration", "お祝いとして贈る"],
  ["custom", "自分の言葉で書く"]
];

const MESSAGE_DRAFTS = {
  gratitude: "ありがとうを伝えたくて、贈ります。",
  hear_your_story: "あなたの話を、もっと聞いてみたいと思いました。",
  keep_in_family: "家族に残しておきたい物語があると思い、贈ります。",
  celebration: "お祝いの気持ちを込めて、贈ります。",
  custom: ""
};

const FAMILY_PLAN_LIST_PRICE = 49800;
const FAMILY_PLAN_PRICE = 34860;
const GIFT_PACKAGE_PRICE = 3000;

const formatPrice = value => `${Number(value || 0).toLocaleString("ja-JP")}円`;

const STEP_TITLES = {
  person: "どなたへ届けますか？",
  assistance: "操作のお手伝いは必要ですか？",
  offer: "何を届けますか？",
  trial_offer: "3問のあとについて",
  delivery: "届け方を選ぶ",
  details: "送り先とメッセージ",
  review: "内容を確認",
  complete: "準備ができました"
};

function OptionCard({ icon: Icon, title, detail, note, selected, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-2xl border p-5 text-left transition disabled:opacity-35 ${
        selected ? "border-white/28 bg-white/[0.09]" : "border-white/[0.08] bg-white/[0.025]"
      }`}
    >
      <div className="flex items-start gap-4">
        {Icon && (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.08]">
            <Icon size={20} className="text-white/74" strokeWidth={1.7} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-narrative text-[1rem] text-white/88">{title}</p>
            {selected && <Check size={18} className="shrink-0 text-emerald-100/72" />}
          </div>
          {detail && <p className="mt-2 text-sm leading-[1.9] text-white/46">{detail}</p>}
          {note && <p className="mt-2 text-xs leading-relaxed text-amber-100/50">{note}</p>}
        </div>
      </div>
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs text-white/46">{label}</span>
      {children}
    </label>
  );
}

function getOfferPreviewCopy(offerType, inviterName) {
  if (offerType === "full_gift") {
    return {
      subject: `【縦糸横糸】${inviterName}さんから、贈りものが届きました`,
      lead: "物語を一冊にするスタンダードプランが贈られています。"
    };
  }

  if (offerType === "trial_gift") {
    return {
      subject: `【縦糸横糸】${inviterName}さんから、贈りものが届きました`,
      lead: "まずは三つの問いを、無料でお試しいただけます。"
    };
  }

  return {
    subject: `【縦糸横糸】${inviterName}さんから、招待が届きました`,
    lead: "まずは三つの問いを無料で試し、その先は家族招待の特別価格34,860円（30%割引）で続けられます。"
  };
}

function InvitationPreview({ deliveryMethod, recipientName, recipientEmail, inviterName, offerType, message, shipping, onClose }) {
  const offerCopy = getOfferPreviewCopy(offerType, inviterName);
  const address = [
    shipping.postal_code ? `〒${shipping.postal_code}` : "",
    shipping.prefecture,
    shipping.city,
    shipping.line1,
    shipping.line2
  ].filter(Boolean).join(" ");

  if (deliveryMethod === "package") {
    return (
      <div className="h-full overflow-y-auto bg-[#0f172a] px-4 py-8 fade-enter">
        <div className="mx-auto w-full max-w-[440px]">
          <div className="relative mb-9 flex h-10 items-center justify-center">
            <button type="button" onClick={onClose} className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]" aria-label="元の画面へ戻る">
              <ChevronLeft size={20} className="text-white/55" strokeWidth={1.8} />
            </button>
            <p className="text-narrative text-[1.02rem] text-white/88">ギフトの内容</p>
          </div>

          <div className="rounded-[1.8rem] border border-amber-100/12 bg-amber-100/[0.035] p-6">
            <p className="text-xs tracking-[0.18em] text-amber-100/48">ギフトとしてお届け</p>
            <h1 className="text-narrative mt-5 text-[1.3rem] text-white/90">{recipientName || "お相手"}さんへ</h1>
            {message && (
              <div className="mt-6 border-l-2 border-amber-200/45 bg-white/[0.035] px-5 py-4">
                <p className="whitespace-pre-wrap text-sm leading-[2] text-white/68">{message}</p>
              </div>
            )}

            <div className="mt-7 border-t border-white/[0.08] pt-6">
              <p className="text-xs text-white/38">お届けするもの</p>
              <ul className="mt-4 space-y-3 text-sm leading-loose text-white/62">
                <li>・詳しいはじめ方を載せたブランドブック</li>
                <li>・物語づくりを始めるためのご案内</li>
                <li>・あなたからのメッセージ</li>
              </ul>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-4">
            <p className="text-xs text-white/38">お届け先</p>
            <p className="mt-2 text-sm leading-loose text-white/64">{address || "住所を入力すると表示されます"}</p>
          </div>

          <button type="button" onClick={onClose} className="btn-quiet mt-8 w-full rounded-full bg-white py-4 text-slate-900">元の画面へ戻る</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0f172a] px-4 py-8 fade-enter">
      <div className="mx-auto w-full max-w-[620px]">
        <div className="relative mb-7 flex h-10 items-center justify-center">
          <button type="button" onClick={onClose} className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]" aria-label="元の画面へ戻る">
            <ChevronLeft size={20} className="text-white/55" strokeWidth={1.8} />
          </button>
          <p className="text-narrative text-[1.02rem] text-white/88">送られるメール</p>
        </div>

        <div className="mb-5 rounded-2xl border border-white/[0.08] bg-white/[0.025] px-5 py-4 text-xs leading-[1.9] text-white/48">
          <p className="flex items-start gap-2"><span className="w-14 shrink-0 text-white/28">差出人</span><span className="min-w-0 flex-1 break-all">縦糸横糸 &lt;hello@tateito-yokoito.jp&gt;</span></p>
          <p className="mt-1 flex items-start gap-2"><span className="w-14 shrink-0 text-white/28">宛先</span><span className="min-w-0 flex-1 break-all">{recipientEmail || "メールアドレスを入力すると表示されます"}</span></p>
          <p className="mt-2 flex items-start gap-2"><span className="w-14 shrink-0 text-white/28">件名</span><span className="min-w-0 flex-1">{offerCopy.subject}</span></p>
        </div>

        <div className="rounded-[1.4rem] bg-[#fbfaf7] px-6 py-9 text-[#172033] shadow-2xl sm:px-10">
          <p className="text-xs text-slate-500">縦糸横糸への招待</p>
          <h1 className="mt-5 font-serif text-2xl font-normal">{recipientName || "お相手"}さんへ</h1>
          <p className="mt-6 font-serif text-[0.98rem] leading-[1.95]">{inviterName}さんから、あなたへ。縦糸横糸の贈りものが届きました。</p>
          {message && (
            <div className="mt-7 border-l-[3px] border-[#b97849] bg-[#f7f5ef] px-5 py-5">
              <p className="whitespace-pre-wrap font-serif text-[1rem] leading-[1.95]">{message}</p>
            </div>
          )}
          <p className="mt-7 font-serif text-[0.98rem] leading-[1.95]">縦糸横糸（たていと よこいと）は、スマートフォンに届く問いに声で答えながら人生を振り返り、思い出や考えをWebと冊子にまとめられるサービスです。</p>
          <p className="mt-5 font-serif text-[0.98rem] leading-[1.95]">人生を「再発見」し、「家族が還れる」場所をつくることを目指しています。</p>
          <p className="mt-7 font-serif text-[0.98rem] leading-[1.95]">{offerCopy.lead}</p>
          <div className="mt-8 inline-flex rounded-full bg-[#101827] px-7 py-4 font-serif text-white">招待を見る</div>
          <p className="mt-8 text-xs leading-loose text-slate-400">心当たりがない場合は、このメールを破棄してください。</p>
        </div>

        <p className="mt-5 text-center text-xs leading-loose text-white/34">このメールは「縦糸横糸」から送信されます。<br />招待した方のお名前は、件名に表示されます。</p>
        <button type="button" onClick={onClose} className="btn-quiet mt-7 w-full rounded-full bg-white py-4 text-slate-900">元の画面へ戻る</button>
      </div>
    </div>
  );
}

export default function FamilyStoryInviteFlow({ supabaseClient, inviterName = "ご家族", existingInvitation = null, onBack, onStartCheckout, onComplete }) {
  const isPaymentResume = Boolean(existingInvitation?.id);
  const isContinuationGift = Boolean(isPaymentResume && existingInvitation?.recipient_project_id);
  const isTrialPackagePayment = Boolean(
    isPaymentResume
    && existingInvitation?.offer_type === "trial_gift"
    && existingInvitation?.delivery_method === "package"
    && !existingInvitation?.recipient_project_id
  );
  const [step, setStep] = useState(isPaymentResume ? "review" : "person");
  const [recipientFamilyName, setRecipientFamilyName] = useState(existingInvitation?.recipient_name || "");
  const [recipientGivenName, setRecipientGivenName] = useState("");
  const [relationship, setRelationship] = useState(existingInvitation?.relationship_label || "parent");
  const [assistanceMode, setAssistanceMode] = useState(existingInvitation?.assistance_mode || "recipient_chooses");
  const [offerType, setOfferType] = useState(existingInvitation?.offer_type || "referral");
  const [deliveryMethod, setDeliveryMethod] = useState(existingInvitation?.delivery_method || "email");
  const [recipientEmail, setRecipientEmail] = useState(existingInvitation?.recipient_email || "");
  const [messageTemplate, setMessageTemplate] = useState(existingInvitation?.message_template || "hear_your_story");
  const [personalMessage, setPersonalMessage] = useState(
    existingInvitation?.personal_message
    || MESSAGE_DRAFTS[existingInvitation?.message_template]
    || MESSAGE_DRAFTS.hear_your_story
  );
  const [shipping, setShipping] = useState(existingInvitation?.shipping_address || { postal_code: "", prefecture: "", city: "", line1: "", line2: "" });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscountCode, setAppliedDiscountCode] = useState("");
  const [discountQuote, setDiscountQuote] = useState(null);
  const [discountStatus, setDiscountStatus] = useState("idle");
  const [discountError, setDiscountError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const createdRef = useRef(existingInvitation || null);
  const includesBasePlanPayment = isPaymentResume ? !isTrialPackagePayment : offerType === "full_gift";
  const includesGiftPackagePayment = isPaymentResume
    ? deliveryMethod === "package" && !isContinuationGift
    : deliveryMethod === "package";

  const steps = useMemo(
    () => ["person", "assistance", "offer", offerType === "full_gift" ? "delivery" : "trial_offer", "details", "review"],
    [offerType]
  );
  const currentStepIndex = steps.indexOf(step);
  const recipientName = `${recipientFamilyName.trim()} ${recipientGivenName.trim()}`.trim();

  const goBack = () => {
    setError("");
    if (isPaymentResume || step === "person") {
      onBack?.();
      return;
    }
    if (step === "complete") {
      onComplete?.();
      return;
    }
    setStep(steps[Math.max(0, currentStepIndex - 1)]);
  };

  const goNext = () => {
    setError("");
    if (step === "person" && (!recipientFamilyName.trim() || !recipientGivenName.trim())) {
      setError("姓と名を入力してください。");
      return;
    }
    if (step === "offer" && offerType !== "full_gift") setDeliveryMethod("email");
    if (step === "details") {
      if (deliveryMethod === "email" && !recipientEmail.trim()) {
        setError("メールアドレスを入力してください。");
        return;
      }
      if (deliveryMethod === "package" && ![shipping.postal_code, shipping.prefecture, shipping.city, shipping.line1].every(value => value.trim())) {
        setError("ギフトパッケージのお届け先を入力してください。");
        return;
      }
    }
    setStep(steps[Math.min(steps.length - 1, currentStepIndex + 1)]);
  };

  const applyDiscountCode = async () => {
    const code = discountCode.trim().toUpperCase();
    setDiscountError("");
    if (!code) {
      setAppliedDiscountCode("");
      setDiscountQuote(null);
      setDiscountStatus("idle");
      return;
    }

    setDiscountStatus("loading");
    try {
      const { data, error: quoteError } = await supabaseClient.rpc("get_commerce_quote", {
        input_product_code: "self_book_v1",
        input_discount_code: code,
        input_include_gift_package: includesGiftPackagePayment
      });
      if (quoteError || !data) throw new Error(quoteError?.message || "割引コードを確認できませんでした");
      let resolvedQuote = { ...data, discount_scope: "base_product" };
      if (data.campaign_id) {
        const { data: discountScope, error: scopeError } = await supabaseClient.rpc("get_discount_scope_for_quote", {
          input_campaign_id: data.campaign_id
        });
        if (scopeError) throw scopeError;
        if (discountScope === "entire_order") {
          resolvedQuote = {
            ...data,
            discount_scope: "entire_order",
            discount_amount: Number(data.amount_subtotal || 0) + Number(data.gift_package_amount || 0),
            amount_total: 0
          };
        }
      }
      setAppliedDiscountCode(code);
      setDiscountQuote(resolvedQuote);
      setDiscountStatus("ready");
    } catch (quoteError) {
      console.error("family gift discount quote error", quoteError);
      setAppliedDiscountCode("");
      setDiscountQuote(null);
      setDiscountStatus("error");
      setDiscountError(quoteError?.message || "割引コードを確認できませんでした。");
    }
  };

  const createInvitation = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      let invitation = createdRef.current;
      if (!invitation) {
        const { data, error: createError } = await supabaseClient.rpc("create_family_story_invitation", {
          input_recipient_name: recipientName.trim(),
          input_recipient_email: deliveryMethod === "email" ? recipientEmail.trim().toLowerCase() : null,
          input_relationship_label: relationship,
          input_assistance_mode: assistanceMode,
          input_offer_type: offerType,
          input_delivery_method: deliveryMethod,
          input_message_template: messageTemplate,
          input_personal_message: personalMessage.trim() || null,
          input_shipping_address: deliveryMethod === "package" ? shipping : {}
        });
        if (createError || !data?.id) throw new Error(createError?.message || "家族招待を用意できませんでした");
        invitation = data;
        createdRef.current = invitation;
      }

      const needsPayment = isPaymentResume || offerType === "full_gift" || (offerType === "trial_gift" && deliveryMethod === "package");
      if (needsPayment) {
        const started = await onStartCheckout?.({
          invitation,
          orderType: isTrialPackagePayment ? "family_trial_package" : "gift",
          discountCode: includesBasePlanPayment ? appliedDiscountCode : "",
          includeGiftPackage: isPaymentResume ? includesGiftPackagePayment : deliveryMethod === "package",
          gift: {
            recipient_name: recipientName.trim(),
            recipient_email: recipientEmail.trim().toLowerCase() || null,
            gift_message: personalMessage.trim() || null,
            shipping_address: includesGiftPackagePayment ? shipping : {}
          }
        });
        if (!started) throw new Error("購入画面を開けませんでした");
        return;
      }

      const { data: sent, error: sendError } = await supabaseClient.functions.invoke("send-family-story-invite", {
        body: { invitationId: invitation.id }
      });
      if (sendError || !sent?.success) throw new Error(sent?.error || "招待メールを送れませんでした");
      setStep("complete");
    } catch (submitError) {
      console.error("family story invite error", submitError);
      setError(submitError?.message || "家族招待を用意できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const relationLabel = RELATIONSHIPS.find(([value]) => value === relationship)?.[1] || "家族";
  const offerLabel = includesBasePlanPayment ? "基本プランを贈る" : "無料体験を贈る";
  const continuationLabel = offerType === "referral" ? "本人に案内" : "私に案内";
  const deliveryLabel = deliveryMethod === "package" ? "ギフトパッケージ" : "メール";
  const paymentBeforeCode = (includesBasePlanPayment ? FAMILY_PLAN_PRICE : 0)
    + (includesGiftPackagePayment ? GIFT_PACKAGE_PRICE : 0);
  const codeDiscountAmount = discountQuote?.discount_scope === "entire_order"
    ? paymentBeforeCode
    : includesBasePlanPayment
      ? Math.min(FAMILY_PLAN_PRICE, Number(discountQuote?.discount_amount || 0))
      : 0;
  const paymentTotal = Math.max(0, paymentBeforeCode - codeDiscountAmount);
  const resolvedMessage = personalMessage.trim() || MESSAGE_DRAFTS[messageTemplate] || "";
  const offerPreviewCopy = getOfferPreviewCopy(offerType, inviterName);

  if (previewOpen) {
    return (
      <InvitationPreview
        deliveryMethod={deliveryMethod}
        recipientName={recipientName.trim()}
        recipientEmail={recipientEmail.trim()}
        inviterName={inviterName}
        offerType={offerType}
        message={resolvedMessage}
        shipping={shipping}
        onClose={() => setPreviewOpen(false)}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-8 fade-enter">
      <div className="mx-auto flex min-h-full w-full max-w-[440px] flex-col">
        <div className="relative mb-8 flex h-10 shrink-0 items-center justify-center">
          <button type="button" onClick={goBack} disabled={busy} className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] disabled:opacity-35" aria-label="前へ戻る">
            <ChevronLeft size={20} className="text-white/55" strokeWidth={1.8} />
          </button>
          <p className="text-narrative text-[1.02rem] text-white/88">家族に贈る</p>
        </div>

        {step !== "complete" && !isPaymentResume && (
          <div className="mb-8">
            <div className="mb-5 flex items-center gap-2" aria-hidden="true">
              {steps.map((item, index) => <span key={item} className={`h-1 flex-1 rounded-full ${index <= currentStepIndex ? "bg-white/42" : "bg-white/[0.07]"}`} />)}
            </div>
            <h1 className="text-narrative text-center text-[1.18rem] text-white/90">{STEP_TITLES[step]}</h1>
          </div>
        )}

        {step !== "complete" && isPaymentResume && (
          <h1 className="mb-8 text-narrative text-center text-[1.18rem] text-white/90">お支払い内容を確認</h1>
        )}

        <div className="flex-1 space-y-4">
          {step === "person" && (
            <>
              <p className="mb-6 text-center text-sm leading-loose text-white/42">ご本人が主役となる、新しい物語を用意します。</p>
              <Field label="あなたとの関係">
                <select className="quiet-select" value={relationship} onChange={event => setRelationship(event.target.value)}>
                  {RELATIONSHIPS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="姓">
                  <input className="quiet-input" value={recipientFamilyName} onChange={event => setRecipientFamilyName(event.target.value)} autoComplete="family-name" maxLength={40} />
                </Field>
                <Field label="名">
                  <input className="quiet-input" value={recipientGivenName} onChange={event => setRecipientGivenName(event.target.value)} autoComplete="given-name" maxLength={40} />
                </Field>
              </div>
            </>
          )}

          {step === "assistance" && (
            <>
              <p className="mb-5 text-center text-sm leading-loose text-white/42">内容は、ご本人の許可なく共有されません。</p>
              <OptionCard icon={Smartphone} title="本人だけで進められる" detail="招待された方のスマートフォンだけで進めます。" selected={assistanceMode === "recipient_led"} onClick={() => setAssistanceMode("recipient_led")} />
              <OptionCard icon={Users} title="私もお手伝いする" detail="ご本人が承認すると、あなたのスマートフォンからも録音や写真追加などを手伝えます。" selected={assistanceMode === "support_requested"} onClick={() => setAssistanceMode("support_requested")} />
              <OptionCard icon={Smartphone} title="本人に選んでもらう" detail="招待を開いた時に、お手伝いを頼むか選んでもらいます。" selected={assistanceMode === "recipient_chooses"} onClick={() => setAssistanceMode("recipient_chooses")} />
            </>
          )}

          {step === "offer" && (
            <>
              <OptionCard
                icon={Gift}
                title="無料体験を贈る"
                detail="まずは3問を無料で試せます。続けるかはご本人が決められます。続ける場合は、家族招待だけの特別価格でご案内します。"
                selected={offerType !== "full_gift"}
                onClick={() => {
                  setOfferType(current => current === "trial_gift" ? "trial_gift" : "referral");
                  setDeliveryMethod("email");
                }}
              />

              <OptionCard
                icon={Gift}
                title="基本プランを贈る"
                detail="家族招待だけの特別価格34,860円（30%OFF）で購入して贈ります。メールかギフトパッケージを選べます。"
                selected={offerType === "full_gift"}
                onClick={() => setOfferType("full_gift")}
              />
            </>
          )}

          {step === "trial_offer" && (
            <>
              <p className="mb-1 text-center text-sm leading-loose text-white/46">3問のあと、特別価格でご案内できます。</p>
              <div className="rounded-2xl border border-amber-100/10 bg-amber-100/[0.035] px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xs tracking-[0.1em] text-amber-50/55">家族招待 特別価格</p>
                  <p className="text-sm text-amber-50/76">
                    <span className="mr-2 text-xs text-white/28 line-through">{formatPrice(FAMILY_PLAN_LIST_PRICE)}</span>
                    {formatPrice(FAMILY_PLAN_PRICE)}
                  </p>
                </div>
                <p className="mt-2 text-right text-[0.68rem] text-amber-100/40">30% OFF</p>
              </div>

              <p className="px-1 pt-3 text-xs text-white/44">ご案内先を選んでください</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setOfferType("referral")}
                  className={`min-h-[116px] rounded-2xl border px-4 py-4 text-left transition ${offerType === "referral" ? "border-white/28 bg-white/[0.09]" : "border-white/[0.08] bg-white/[0.02]"}`}
                >
                  <span className="flex items-center justify-between gap-2 text-sm text-white/82">本人に案内{offerType === "referral" && <Check size={15} className="text-emerald-100/72" />}</span>
                  <span className="mt-3 block text-xs leading-relaxed text-white/38">本人が続けるか決めて購入</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOfferType("trial_gift")}
                  className={`min-h-[116px] rounded-2xl border px-4 py-4 text-left transition ${offerType === "trial_gift" ? "border-white/28 bg-white/[0.09]" : "border-white/[0.08] bg-white/[0.02]"}`}
                >
                  <span className="flex items-center justify-between gap-2 text-sm text-white/82">私に案内{offerType === "trial_gift" && <Check size={15} className="text-emerald-100/72" />}</span>
                  <span className="mt-3 block text-xs leading-relaxed text-white/38">利用意向を確認して私が購入</span>
                </button>
              </div>
            </>
          )}

          {step === "delivery" && (
            <>
              <OptionCard icon={Mail} title="メールで贈る" detail="短いメッセージを添えてメールで招待。すぐ始められます。" note={`お支払い合計 ${formatPrice(FAMILY_PLAN_PRICE)}`} selected={deliveryMethod === "email"} onClick={() => setDeliveryMethod("email")} />
              <OptionCard icon={Package} title="ギフトとして贈る" detail="詳しいはじめ方も載ったブランドブックと共に、ご指定の住所に届けます。" note={`パッケージ 3,000円・お支払い合計 ${formatPrice(FAMILY_PLAN_PRICE + GIFT_PACKAGE_PRICE)}`} selected={deliveryMethod === "package"} onClick={() => setDeliveryMethod("package")} />
            </>
          )}

          {step === "details" && (
            <>
              {deliveryMethod === "email" ? (
                <Field label="送り先のメールアドレス">
                  <input type="email" className="quiet-input" value={recipientEmail} onChange={event => setRecipientEmail(event.target.value)} autoComplete="email" />
                </Field>
              ) : (
                <div className="space-y-4">
                  <Field label="郵便番号"><input className="quiet-input" value={shipping.postal_code} onChange={event => setShipping(previous => ({ ...previous, postal_code: event.target.value }))} inputMode="numeric" /></Field>
                  <Field label="都道府県"><input className="quiet-input" value={shipping.prefecture} onChange={event => setShipping(previous => ({ ...previous, prefecture: event.target.value }))} /></Field>
                  <Field label="市区町村"><input className="quiet-input" value={shipping.city} onChange={event => setShipping(previous => ({ ...previous, city: event.target.value }))} /></Field>
                  <Field label="番地"><input className="quiet-input" value={shipping.line1} onChange={event => setShipping(previous => ({ ...previous, line1: event.target.value }))} /></Field>
                  <Field label="建物名・部屋番号（任意）"><input className="quiet-input" value={shipping.line2} onChange={event => setShipping(previous => ({ ...previous, line2: event.target.value }))} /></Field>
                </div>
              )}
              <Field label="伝えたい気持ち">
                <select className="quiet-select" value={messageTemplate} onChange={event => {
                  const nextTemplate = event.target.value;
                  setMessageTemplate(nextTemplate);
                  setPersonalMessage(MESSAGE_DRAFTS[nextTemplate] || "");
                }}>
                  {MESSAGE_TEMPLATES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <p className="-mt-2 px-1 text-xs leading-loose text-white/32">選ぶと文章が入ります。自由に直せます。</p>
              <Field label={deliveryMethod === "email" ? "メールに載せるメッセージ（任意）" : "ギフトに添えるメッセージ（任意）"}>
                <textarea className="min-h-[132px] w-full rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm leading-loose text-white/84 outline-none placeholder:text-white/24" value={personalMessage} onChange={event => {
                  const nextMessage = event.target.value;
                  setPersonalMessage(nextMessage);
                  if (!nextMessage.trim()) setMessageTemplate("custom");
                }} maxLength={300} placeholder="相手に届けたい言葉を入力できます" />
              </Field>
              <button type="button" onClick={() => setPreviewOpen(true)} className="btn-quiet w-full rounded-full border border-white/14 bg-white/[0.04] py-4 text-sm text-white/76">
                {deliveryMethod === "email" ? "送られるメールを確認" : "ギフトに添える内容を確認"}
              </button>
            </>
          )}

          {step === "review" && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 text-sm leading-[2] text-white/58">
                <p className="text-[1.05rem] text-white/88">{recipientName.trim()}さん</p>
                <p className="mt-3">関係：{relationLabel}</p>
                <p>内容：{offerLabel}</p>
                {!isPaymentResume && offerType !== "full_gift" && <p>体験後の案内：{continuationLabel}</p>}
                {!isContinuationGift && <p>届け方：{deliveryLabel}</p>}
                <p>お手伝い：{assistanceMode === "recipient_led" ? "本人だけで進める" : assistanceMode === "support_requested" ? "私もお手伝いする" : "本人に選んでもらう"}</p>
                {(includesBasePlanPayment || isTrialPackagePayment) && (
                  <div className="mt-4 space-y-2 border-t border-white/[0.07] pt-4">
                    {includesBasePlanPayment && <>
                      <div className="flex items-center justify-between gap-3 text-white/46">
                        <span>基本プラン</span>
                        <span>{formatPrice(FAMILY_PLAN_LIST_PRICE)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-amber-100/58">
                        <span>家族招待 30%割引</span>
                        <span>−{formatPrice(FAMILY_PLAN_LIST_PRICE - FAMILY_PLAN_PRICE)}</span>
                      </div>
                    </>}
                    {codeDiscountAmount > 0 && (
                      <div className="flex items-center justify-between gap-3 text-emerald-100/64">
                        <span>割引コード</span>
                        <span>−{formatPrice(codeDiscountAmount)}</span>
                      </div>
                    )}
                    {includesGiftPackagePayment && (
                      <div className="flex items-center justify-between gap-3 text-white/46">
                        <span>ギフトパッケージ</span>
                        <span>{formatPrice(GIFT_PACKAGE_PRICE)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] pt-3 text-white/82">
                      <span>お支払い合計</span>
                      <span className="text-white/92">{formatPrice(paymentTotal)}</span>
                    </div>
                  </div>
                )}
              </div>
              {includesBasePlanPayment && (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] px-5 py-5">
                  <label className="text-xs tracking-[0.08em] text-white/42">割引コードをお持ちの方</label>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={discountCode}
                      onChange={event => {
                        setDiscountCode(event.target.value.toUpperCase());
                        setDiscountError("");
                      }}
                      placeholder="コードを入力"
                      className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm uppercase tracking-[0.08em] text-white/84 outline-none placeholder:text-white/24"
                    />
                    <button
                      type="button"
                      onClick={applyDiscountCode}
                      disabled={busy || discountStatus === "loading"}
                      className="shrink-0 rounded-2xl border border-white/12 px-4 text-sm text-white/66 disabled:opacity-40"
                    >
                      {discountStatus === "loading" ? "確認中" : "適用"}
                    </button>
                  </div>
                  {discountQuote?.campaign_name && appliedDiscountCode && (
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-emerald-100/64">
                      <span>{discountQuote.campaign_name}を適用しました。</span>
                      <button type="button" onClick={() => {
                        setDiscountCode("");
                        setAppliedDiscountCode("");
                        setDiscountQuote(null);
                        setDiscountStatus("idle");
                        setDiscountError("");
                      }} className="shrink-0 underline underline-offset-4 text-white/38">外す</button>
                    </div>
                  )}
                  {discountError && <p className="mt-3 text-xs leading-relaxed text-red-100/72">{discountError}</p>}
                  <p className="mt-3 text-[0.68rem] leading-relaxed text-white/28">
                    {discountQuote?.discount_scope === "entire_order"
                      ? "内部テスト用コードを、選択したすべての有料項目に適用しています。"
                      : "割引コードは基本プランに適用されます。ギフトパッケージ代は対象外です。"}
                  </p>
                </div>
              )}
              <div className="rounded-2xl border border-emerald-100/10 bg-emerald-100/[0.035] px-5 py-4">
                <p className="text-sm leading-loose text-emerald-50/62">語りの中身は、ご本人の許可なくあなたへ共有されません。</p>
              </div>
              {!isPaymentResume && <button type="button" onClick={() => setPreviewOpen(true)} className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.025] px-5 py-4 text-left">
                <span className="block text-xs text-white/38">{deliveryMethod === "email" ? "送られるメール" : "ギフトに添える内容"}</span>
                {deliveryMethod === "email" && <span className="mt-2 block text-sm leading-relaxed text-white/68">{offerPreviewCopy.subject}</span>}
                {resolvedMessage && <span className="mt-2 line-clamp-2 block text-xs leading-loose text-white/38">{resolvedMessage}</span>}
                <span className="mt-3 flex items-center justify-end gap-1 text-xs text-white/48">全文を確認 <ChevronRight size={14} /></span>
              </button>}
            </div>
          )}

          {step === "complete" && (
            <div className="flex min-h-[55vh] flex-col items-center justify-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-100/20 bg-emerald-100/[0.07]"><Check size={25} className="text-emerald-100/76" /></div>
              <h1 className="text-narrative mt-7 text-[1.35rem] text-white/90">{recipientName.trim()}さんへ<br />招待を送りました</h1>
              <p className="mt-6 text-sm leading-loose text-white/44">受け取った方が主役となって進めます。<br />語りの中身が自動で共有されることはありません。</p>
              <button type="button" onClick={onComplete} className="btn-quiet mt-10 w-full rounded-full bg-white py-4 text-slate-900">ホームへ戻る</button>
            </div>
          )}
        </div>

        {error && <p className="mt-5 rounded-2xl border border-red-200/15 bg-red-200/[0.05] px-5 py-4 text-sm leading-relaxed text-red-100/75">{error}</p>}

        {step !== "complete" && (
          <button type="button" onClick={step === "review" ? createInvitation : goNext} disabled={busy || discountStatus === "loading"} className="btn-quiet mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-white py-4 text-slate-900 disabled:opacity-40">
            {busy ? "準備しています…" : discountStatus === "loading" ? "割引コードを確認しています…" : step === "review" ? ((isPaymentResume || offerType === "full_gift") ? "お支払いへ進む" : "この内容でメールを送る") : "次へ"}
            {!busy && step !== "review" && <ChevronRight size={17} />}
          </button>
        )}
      </div>
    </div>
  );
}
