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

const STEP_TITLES = {
  person: "どなたへ届けますか？",
  assistance: "操作のお手伝いは必要ですか？",
  offer: "何を届けますか？",
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

export default function FamilyStoryInviteFlow({ supabaseClient, onBack, onStartCheckout, onComplete }) {
  const [step, setStep] = useState("person");
  const [recipientName, setRecipientName] = useState("");
  const [relationship, setRelationship] = useState("parent");
  const [assistanceMode, setAssistanceMode] = useState("recipient_chooses");
  const [offerType, setOfferType] = useState("referral");
  const [deliveryMethod, setDeliveryMethod] = useState("email");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("hear_your_story");
  const [personalMessage, setPersonalMessage] = useState("");
  const [shipping, setShipping] = useState({ postal_code: "", prefecture: "", city: "", line1: "", line2: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const createdRef = useRef(null);

  const steps = useMemo(() => ["person", "assistance", "offer", "delivery", "details", "review"], []);
  const currentStepIndex = steps.indexOf(step);

  const goBack = () => {
    setError("");
    if (step === "person") {
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
    if (step === "person" && !recipientName.trim()) {
      setError("お名前を入力してください。");
      return;
    }
    if (step === "offer" && offerType === "referral") setDeliveryMethod("email");
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

      const needsPayment = offerType === "full_gift" || (offerType === "trial_gift" && deliveryMethod === "package");
      if (needsPayment) {
        const started = await onStartCheckout?.({
          invitation,
          orderType: offerType === "full_gift" ? "gift" : "family_trial_package",
          includeGiftPackage: deliveryMethod === "package",
          gift: {
            recipient_name: recipientName.trim(),
            recipient_email: recipientEmail.trim().toLowerCase() || null,
            gift_message: personalMessage.trim() || null,
            shipping_address: deliveryMethod === "package" ? shipping : {}
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
  const offerLabel = offerType === "referral" ? "家族として招待" : offerType === "trial_gift" ? "まず3問を贈る" : "スタンダードプランを贈る";
  const deliveryLabel = deliveryMethod === "package" ? "ギフトパッケージ" : "メール";

  return (
    <div className="h-full overflow-y-auto px-4 py-8 fade-enter">
      <div className="mx-auto flex min-h-full w-full max-w-[440px] flex-col">
        <div className="relative mb-8 flex h-10 shrink-0 items-center justify-center">
          <button type="button" onClick={goBack} disabled={busy} className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] disabled:opacity-35" aria-label="前へ戻る">
            <ChevronLeft size={20} className="text-white/55" strokeWidth={1.8} />
          </button>
          <p className="text-narrative text-[1.02rem] text-white/88">家族の物語を追加</p>
        </div>

        {step !== "complete" && (
          <div className="mb-8">
            <div className="mb-5 flex items-center gap-2" aria-hidden="true">
              {steps.map((item, index) => <span key={item} className={`h-1 flex-1 rounded-full ${index <= currentStepIndex ? "bg-white/42" : "bg-white/[0.07]"}`} />)}
            </div>
            <h1 className="text-narrative text-center text-[1.18rem] text-white/90">{STEP_TITLES[step]}</h1>
          </div>
        )}

        <div className="flex-1 space-y-4">
          {step === "person" && (
            <>
              <p className="mb-6 text-center text-sm leading-loose text-white/42">ご本人が主役となる、新しい物語を用意します。</p>
              <Field label="お名前">
                <input className="quiet-input" value={recipientName} onChange={event => setRecipientName(event.target.value)} placeholder="例：菅原 花子" maxLength={80} />
              </Field>
              <Field label="あなたとの関係">
                <select className="quiet-select" value={relationship} onChange={event => setRelationship(event.target.value)}>
                  {RELATIONSHIPS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
            </>
          )}

          {step === "assistance" && (
            <>
              <p className="mb-5 text-center text-sm leading-loose text-white/42">内容は、ご本人の許可なく共有されません。</p>
              <OptionCard icon={Smartphone} title="本人だけで進められる" detail="招待された方のスマートフォンで進めます。" selected={assistanceMode === "recipient_led"} onClick={() => setAssistanceMode("recipient_led")} />
              <OptionCard icon={Users} title="私もお手伝いする" detail="ご本人が承認すると、あなたのスマートフォンから録音や写真、本の準備を手伝えます。" selected={assistanceMode === "support_requested"} onClick={() => setAssistanceMode("support_requested")} />
              <OptionCard icon={Smartphone} title="本人に選んでもらう" detail="招待を開いた時に、お手伝いを頼むか選んでもらいます。" selected={assistanceMode === "recipient_chooses"} onClick={() => setAssistanceMode("recipient_chooses")} />
            </>
          )}

          {step === "offer" && (
            <>
              <OptionCard icon={Mail} title="家族として招待" detail="まず3問を無料で試せます。その先は、家族招待の特別価格で始められます。" selected={offerType === "referral"} onClick={() => { setOfferType("referral"); setDeliveryMethod("email"); }} />
              <OptionCard icon={Gift} title="まず3問を贈る" detail="お試しの完了だけをお知らせします。語りの中身は届きません。" selected={offerType === "trial_gift"} onClick={() => setOfferType("trial_gift")} />
              <OptionCard icon={Gift} title="スタンダードプランを贈る" detail="基本プランを先に購入して贈ります。追加オプションは、ご本人も後から選べます。" note="家族招待 特別価格は、お支払い前に表示します。" selected={offerType === "full_gift"} onClick={() => setOfferType("full_gift")} />
            </>
          )}

          {step === "delivery" && (
            <>
              <OptionCard icon={Mail} title="メールで届ける" detail="短いメッセージと一緒に、すぐ招待を送ります。" selected={deliveryMethod === "email"} onClick={() => setDeliveryMethod("email")} />
              <OptionCard icon={Package} title="ギフトパッケージで届ける" detail="感謝の気持ちを形にして、ご指定の住所へ届けます。" note="パッケージ代と送料は、お支払い前に表示します。" selected={deliveryMethod === "package"} disabled={offerType === "referral"} onClick={() => setDeliveryMethod("package")} />
              {offerType === "referral" && <p className="px-3 text-xs leading-relaxed text-white/30">家族としての紹介は、メールでお届けします。</p>}
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
              <Field label="気持ちを選ぶ">
                <select className="quiet-select" value={messageTemplate} onChange={event => setMessageTemplate(event.target.value)}>
                  {MESSAGE_TEMPLATES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <Field label="ひとこと（任意）">
                <textarea className="min-h-[112px] w-full rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm leading-loose text-white/84 outline-none placeholder:text-white/24" value={personalMessage} onChange={event => setPersonalMessage(event.target.value)} maxLength={300} placeholder="短い言葉を添えられます" />
              </Field>
            </>
          )}

          {step === "review" && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 text-sm leading-[2] text-white/58">
                <p className="text-[1.05rem] text-white/88">{recipientName.trim()}さん</p>
                <p className="mt-3">関係：{relationLabel}</p>
                <p>内容：{offerLabel}</p>
                <p>届け方：{deliveryLabel}</p>
                <p>お手伝い：{assistanceMode === "recipient_led" ? "本人だけで進める" : assistanceMode === "support_requested" ? "私もお手伝いする" : "本人に選んでもらう"}</p>
              </div>
              <div className="rounded-2xl border border-emerald-100/10 bg-emerald-100/[0.035] px-5 py-4">
                <p className="text-sm leading-loose text-emerald-50/62">語りの中身は、ご本人の許可なくあなたへ共有されません。</p>
              </div>
            </div>
          )}

          {step === "complete" && (
            <div className="flex min-h-[55vh] flex-col items-center justify-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-100/20 bg-emerald-100/[0.07]"><Check size={25} className="text-emerald-100/76" /></div>
              <h1 className="text-narrative mt-7 text-[1.35rem] text-white/90">{recipientName.trim()}さんへ<br />招待を送りました</h1>
              <p className="mt-6 text-sm leading-loose text-white/44">受け取った方が主役となって進めます。<br />節目だけをお知らせします。</p>
              <button type="button" onClick={onComplete} className="btn-quiet mt-10 w-full rounded-full bg-white py-4 text-slate-900">ホームへ戻る</button>
            </div>
          )}
        </div>

        {error && <p className="mt-5 rounded-2xl border border-red-200/15 bg-red-200/[0.05] px-5 py-4 text-sm leading-relaxed text-red-100/75">{error}</p>}

        {step !== "complete" && (
          <button type="button" onClick={step === "review" ? createInvitation : goNext} disabled={busy} className="btn-quiet mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-white py-4 text-slate-900 disabled:opacity-40">
            {busy ? "準備しています…" : step === "review" ? (offerType === "referral" || (offerType === "trial_gift" && deliveryMethod === "email") ? "この内容で送る" : "お支払いへ進む") : "次へ"}
            {!busy && step !== "review" && <ChevronRight size={17} />}
          </button>
        )}
      </div>
    </div>
  );
}
