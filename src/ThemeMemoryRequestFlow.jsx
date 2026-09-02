import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Image as ImageIcon, Mail, Mic, Square, Users } from "lucide-react";

export const THEME_MEMORY_RELATIONSHIPS = [
  { value: "mother", label: "母" },
  { value: "father", label: "父" },
  { value: "grandmother", label: "祖母" },
  { value: "grandfather", label: "祖父" },
  { value: "sibling", label: "きょうだい" },
  { value: "relative", label: "親戚" },
  { value: "other", label: "その他" }
];

const QUESTION_DEFINITIONS = {
  childhood_character: subject => `幼い頃の${subject}は、どんな子どもでしたか？`,
  characteristic_memory: subject => `「${subject}らしい」と感じた、幼い頃の出来事はありますか？`,
  favorite_play: subject => `幼い頃、${subject}が夢中になっていた遊びや、よくしていたことは何でしたか？`,
  family_scene: () => "家族で過ごした時間の中で、今も覚えている場面を教えてください。",
  birth_memory: subject => `${subject}が生まれた時のことで、今も覚えていることを教えてください。`,
  name_story: subject => `${subject}の名前を決めた時のことや、名前に込めた思いを教えてください。`,
  growth_memory: subject => `${subject}の成長を感じた、忘れられない出来事はありますか？`,
  first_meeting: subject => `${subject}と初めて会った時のことを覚えていますか？`,
  shared_play: subject => `幼い頃、${subject}と一緒によく遊んだことを教えてください。`,
  sibling_memory: () => "きょうだいで過ごした時間の中で、今も覚えている出来事はありますか？"
};

const RELATIONSHIP_QUESTION_ORDER = {
  mother: ["birth_memory", "name_story", "childhood_character", "growth_memory", "characteristic_memory", "favorite_play", "family_scene"],
  father: ["birth_memory", "name_story", "childhood_character", "growth_memory", "characteristic_memory", "favorite_play", "family_scene"],
  grandmother: ["first_meeting", "childhood_character", "family_scene", "characteristic_memory", "favorite_play"],
  grandfather: ["first_meeting", "childhood_character", "family_scene", "characteristic_memory", "favorite_play"],
  sibling: ["shared_play", "sibling_memory", "characteristic_memory", "family_scene", "childhood_character"],
  relative: ["childhood_character", "family_scene", "characteristic_memory", "favorite_play", "first_meeting"],
  other: ["childhood_character", "characteristic_memory", "family_scene", "favorite_play", "first_meeting"]
};

function withHonorific(value, fallback = "ご家族") {
  const text = String(value || "").trim() || fallback;
  return text.endsWith("さん") ? text : `${text}さん`;
}

function questionsForRelationship(relationship, subjectName) {
  const subject = withHonorific(subjectName);
  return (RELATIONSHIP_QUESTION_ORDER[relationship] || RELATIONSHIP_QUESTION_ORDER.other).map(id => ({
    id,
    prompt: QUESTION_DEFINITIONS[id](subject)
  }));
}

function relationshipLabel(value) {
  return THEME_MEMORY_RELATIONSHIPS.find(item => item.value === value)?.label || "ご家族";
}

async function invokeMemoryFunction(supabaseClient, body) {
  const { data, error } = await supabaseClient.functions.invoke("theme-memory-request-response", { body });
  if (error || !data?.success) {
    let responseData = data;
    if (!responseData && error?.context?.json) {
      try { responseData = await error.context.json(); } catch (_readError) {}
    }
    throw new Error(responseData?.error || error?.message || "処理を完了できませんでした");
  }
  return data;
}

export function ThemeMemoryRequestComposer({
  supabaseClient,
  bookProjectId,
  subjectName = "あなた",
  onBack,
  onSent
}) {
  const [step, setStep] = useState("relationship");
  const [relationship, setRelationship] = useState("");
  const [selectedQuestionIds, setSelectedQuestionIds] = useState([]);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const questions = useMemo(
    () => questionsForRelationship(relationship, subjectName),
    [relationship, subjectName]
  );

  const chooseRelationship = value => {
    setRelationship(value);
    setSelectedQuestionIds(questionsForRelationship(value, subjectName).slice(0, 2).map(item => item.id));
    setStep("questions");
  };

  const toggleQuestion = id => {
    setSelectedQuestionIds(current => {
      if (current.includes(id)) return current.filter(item => item !== id);
      if (current.length >= 3) return current;
      return [...current, id];
    });
  };

  const sendRequest = async () => {
    setStatus("sending");
    setError("");
    try {
      const { data, error: invokeError } = await supabaseClient.functions.invoke("send-theme-memory-request", {
        body: {
          bookProjectId,
          recipientName,
          recipientEmail,
          relationshipLabel: relationship,
          selectedQuestionIds
        }
      });
      if (invokeError || !data?.success) {
        let responseData = data;
        if (!responseData && invokeError?.context?.json) {
          try { responseData = await invokeError.context.json(); } catch (_readError) {}
        }
        throw new Error(responseData?.error || invokeError?.message || "依頼を送れませんでした");
      }
      setStatus("sent");
      onSent?.(data.requestId);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "依頼を送れませんでした");
      setStatus("error");
    }
  };

  if (status === "sent") {
    return (
      <div className="flow-scene-shell fade-enter">
        <div className="mx-auto flex min-h-full w-full max-w-[520px] flex-col justify-center text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-200/10">
            <Mail size={26} className="text-emerald-100/75" strokeWidth={1.5} />
          </div>
          <h1 className="mt-8 text-narrative text-[1.25rem] leading-[1.9] text-white/90">思い出のお願いを<br />送りました</h1>
          <p className="mt-5 text-sm leading-[2] text-white/45">届いた回答は、あなたが内容を確認してから<br />物語に加わります。</p>
          <button type="button" onClick={onBack} className="btn-quiet mt-10 w-full rounded-full bg-white/10 py-4 text-white/80">テーマの区切りへ戻る</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flow-scene-shell fade-enter">
      <div className="mx-auto w-full max-w-[520px]">
        <button type="button" onClick={() => {
          if (step === "recipient") setStep("questions");
          else if (step === "questions") setStep("relationship");
          else onBack?.();
        }} className="mb-7 flex items-center gap-2 text-sm text-white/42">
          <ChevronLeft size={17} />戻る
        </button>

        <p className="text-center text-[0.67rem] tracking-[0.2em] text-amber-100/42">「幼い頃のこと」から、もう一つ</p>
        <h1 className="mt-4 text-center text-narrative text-[1.2rem] leading-[1.9] text-white/90">家族の記憶を<br />添えてみませんか</h1>
        <p className="mt-4 text-center text-sm leading-[2] text-white/42">同じ時間を知る人へ、聞いてみたい問いだけを送れます。</p>

        {step === "relationship" && (
          <div className="mt-9">
            <p className="mb-4 text-sm text-white/62">誰に聞きますか？</p>
            <div className="grid grid-cols-2 gap-3">
              {THEME_MEMORY_RELATIONSHIPS.map(item => (
                <button key={item.value} type="button" onClick={() => chooseRelationship(item.value)} className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-5 text-left text-narrative text-white/76">
                  <span className="flex items-center justify-between">{item.label}<ChevronRight size={16} className="text-white/24" /></span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "questions" && (
          <div className="mt-9">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div><p className="text-sm text-white/65">聞きたいことを選ぶ</p><p className="mt-1 text-xs text-white/30">2問がおすすめ。1〜3問まで選べます。</p></div>
              <p className="text-xs text-white/42">{selectedQuestionIds.length}/3</p>
            </div>
            <div className="space-y-3">
              {questions.map(question => {
                const selected = selectedQuestionIds.includes(question.id);
                return (
                  <button key={question.id} type="button" onClick={() => toggleQuestion(question.id)} className={`w-full rounded-2xl border px-4 py-4 text-left transition ${selected ? "border-amber-100/30 bg-amber-50/[0.07]" : "border-white/8 bg-white/[0.025]"}`}>
                    <span className="flex items-start gap-3">
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? "border-amber-100/40 bg-amber-100/15" : "border-white/15"}`}>{selected && <Check size={13} className="text-amber-50/80" />}</span>
                      <span className="text-sm leading-[1.8] text-white/72">{question.prompt}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <button type="button" disabled={selectedQuestionIds.length < 1} onClick={() => setStep("recipient")} className="btn-quiet mt-7 w-full rounded-full bg-white/10 py-4 text-white/80 disabled:opacity-30">送り先を入力する</button>
          </div>
        )}

        {step === "recipient" && (
          <div className="mt-9 space-y-5">
            <div className="rounded-2xl border border-white/8 bg-white/[0.025] px-5 py-4">
              <p className="text-xs text-white/32">送り先</p>
              <p className="mt-1 text-sm text-white/68">{relationshipLabel(relationship)}へ、{selectedQuestionIds.length}問を送ります</p>
            </div>
            <label className="block text-sm text-white/60">お名前
              <input value={recipientName} onChange={event => setRecipientName(event.target.value)} placeholder="例：花子" className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-white outline-none placeholder:text-white/20" />
            </label>
            <label className="block text-sm text-white/60">メールアドレス
              <input type="email" value={recipientEmail} onChange={event => setRecipientEmail(event.target.value)} placeholder="example@email.com" className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-white outline-none placeholder:text-white/20" />
            </label>
            <p className="rounded-2xl border border-white/7 px-4 py-4 text-xs leading-[1.9] text-white/34">相手には選んだ問いだけが届きます。あなたの他の語りや物語の設定は共有されません。</p>
            {error && <p className="rounded-2xl border border-rose-200/15 bg-rose-100/[0.04] px-4 py-3 text-sm text-rose-100/65">{error}</p>}
            <button type="button" disabled={!recipientName.trim() || !recipientEmail.trim() || status === "sending"} onClick={sendRequest} className="btn-quiet w-full rounded-full bg-white/10 py-4 text-white/82 disabled:opacity-30">{status === "sending" ? "送っています…" : "この内容でお願いする"}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function MemoryAudioRecorder({ value, onChange }) {
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startedAtRef = useRef(0);
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => () => {
    window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  const start = async () => {
    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const preferred = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find(type => window.MediaRecorder?.isTypeSupported?.(type));
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = event => { if (event.data?.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const type = recorder.mimeType || chunksRef.current[0]?.type || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        onChange({ blob, url: URL.createObjectURL(blob), duration: Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)) });
        stream.getTracks().forEach(track => track.stop());
      };
      startedAtRef.current = Date.now();
      setDuration(0);
      setRecording(true);
      recorder.start(500);
      timerRef.current = window.setInterval(() => setDuration(Math.floor((Date.now() - startedAtRef.current) / 1000)), 1000);
    } catch (_error) {
      setError("マイクを使えませんでした。端末の設定をご確認ください。");
    }
  };

  const stop = () => {
    window.clearInterval(timerRef.current);
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
    setRecording(false);
  };

  return (
    <div className="mt-3">
      {value?.url ? (
        <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-black/15 px-3 py-3">
          <audio controls src={value.url} className="h-9 min-w-0 flex-1" />
          <button type="button" onClick={() => onChange(null)} className="shrink-0 px-2 text-xs text-white/35">録り直す</button>
        </div>
      ) : (
        <button type="button" onClick={recording ? stop : start} className={`flex w-full items-center justify-center gap-2 rounded-full border py-3 text-sm ${recording ? "border-rose-200/25 bg-rose-100/[0.06] text-rose-100/75" : "border-white/10 text-white/56"}`}>
          {recording ? <><Square size={15} fill="currentColor" />録音を止める（{duration}秒）</> : <><Mic size={16} />声で答える</>}
        </button>
      )}
      {error && <p className="mt-2 text-xs text-rose-100/60">{error}</p>}
    </div>
  );
}

export function ThemeMemoryRequestRecipient({ supabaseClient, requestId }) {
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [request, setRequest] = useState(null);
  const [extraQuestions, setExtraQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [extraMode, setExtraMode] = useState("none");
  const [extraQuestionId, setExtraQuestionId] = useState("");
  const [extraText, setExtraText] = useState("");
  const [extraAudio, setExtraAudio] = useState(null);
  const [photos, setPhotos] = useState([]);

  useEffect(() => {
    let active = true;
    invokeMemoryFunction(supabaseClient, { action: "preview", requestId })
      .then(data => {
        if (!active) return;
        setRequest(data.request);
        setExtraQuestions(data.extraQuestions || []);
        setAnswers(Object.fromEntries((data.request?.questions || []).map(question => [question.id, { text: "", audio: null }])));
        setStatus(data.request?.submitted ? "submitted" : "ready");
      })
      .catch(loadError => { if (active) { setError(loadError.message); setStatus("error"); } });
    return () => { active = false; };
  }, [requestId, supabaseClient]);

  const uploadFile = async (file, kind) => {
    const mimeType = file.type || (kind === "audio" ? "audio/webm" : "image/jpeg");
    const signed = await invokeMemoryFunction(supabaseClient, { action: "sign_upload", requestId, kind, mimeType });
    const { error: uploadError } = await supabaseClient.storage.from("memory-contributions").uploadToSignedUrl(signed.path, signed.token, file, { contentType: mimeType });
    if (uploadError) throw uploadError;
    return signed.path;
  };

  const submit = async () => {
    setStatus("submitting");
    setError("");
    try {
      const answerPayload = [];
      for (const question of request.questions) {
        const answer = answers[question.id] || {};
        let audioPath = null;
        if (answer.audio?.blob) audioPath = await uploadFile(answer.audio.blob, "audio");
        answerPayload.push({ questionId: question.id, text: answer.text || "", audioPath });
      }
      let extraAudioPath = null;
      if (extraAudio?.blob) extraAudioPath = await uploadFile(extraAudio.blob, "audio");
      const photoPaths = [];
      for (const photo of photos) photoPaths.push(await uploadFile(photo.file, "photo"));
      const selectedExtra = extraQuestions.find(item => item.id === extraQuestionId);
      await invokeMemoryFunction(supabaseClient, {
        action: "submit",
        requestId,
        responderName: request.recipientName,
        answers: answerPayload,
        extraResponse: {
          mode: extraMode,
          questionId: extraMode === "question" ? extraQuestionId : null,
          prompt: extraMode === "question" ? selectedExtra?.prompt : extraMode === "free" ? "ほかに残しておきたいこと" : "",
          text: extraText,
          audioPath: extraAudioPath
        },
        photoPaths
      });
      setStatus("submitted");
      scheduleMicroScrollTop();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "回答を送れませんでした");
      setStatus("ready");
    }
  };

  if (status === "loading") return <MemoryPublicShell><p className="animate-pulse text-center text-white/40">依頼を読み込んでいます…</p></MemoryPublicShell>;
  if (status === "error") return <MemoryPublicShell><h1 className="text-center text-narrative text-xl text-white/85">依頼を開けませんでした</h1><p className="mt-5 text-center text-sm leading-loose text-white/42">{error}</p></MemoryPublicShell>;
  if (status === "submitted") return <MemoryPublicShell><div className="text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-200/10"><Check size={27} className="text-emerald-100/70" /></div><h1 className="mt-7 text-narrative text-[1.35rem] leading-loose text-white/88">思い出を<br />ありがとうございました</h1><p className="mt-5 text-sm leading-[2] text-white/42">{withHonorific(request?.subjectName)}が内容を確認したあとで、物語に加わります。</p></div></MemoryPublicShell>;

  const canSubmit = request.questions.every(question => {
    const answer = answers[question.id];
    return Boolean(answer?.text?.trim() || answer?.audio?.blob);
  });

  return (
    <MemoryPublicShell>
      <div className="text-center">
        <p className="text-[0.68rem] tracking-[0.2em] text-amber-100/42">家族の記憶を、もう一つ</p>
        <h1 className="mt-5 text-narrative text-[1.25rem] leading-[1.9] text-white/90">{withHonorific(request.subjectName)}の<br />幼い頃について教えてください</h1>
        <p className="mt-5 text-sm leading-[2] text-white/42">正確な時期や順番を思い出せなくても大丈夫です。<br />覚えている場面を、ご自身の言葉でお話しください。</p>
      </div>

      <div className="mt-10 space-y-5">
        {request.questions.map((question, index) => (
          <section key={question.id} className="rounded-[24px] border border-white/9 bg-white/[0.03] px-5 py-5">
            <p className="text-[0.64rem] tracking-[0.18em] text-white/30">問い {index + 1}</p>
            <p className="mt-3 text-narrative text-[1rem] leading-[1.9] text-white/82">{question.prompt}</p>
            <textarea value={answers[question.id]?.text || ""} onChange={event => setAnswers(current => ({ ...current, [question.id]: { ...current[question.id], text: event.target.value } }))} rows={4} placeholder="文章で答える" className="mt-4 w-full resize-none rounded-2xl border border-white/8 bg-black/15 px-4 py-3 text-sm leading-relaxed text-white outline-none placeholder:text-white/22" />
            <div className="my-3 flex items-center gap-3 text-[0.65rem] text-white/22"><span className="h-px flex-1 bg-white/7" />または<span className="h-px flex-1 bg-white/7" /></div>
            <MemoryAudioRecorder value={answers[question.id]?.audio} onChange={audio => setAnswers(current => ({ ...current, [question.id]: { ...current[question.id], audio } }))} />
          </section>
        ))}
      </div>

      <section className="mt-8 rounded-[24px] border border-white/9 bg-white/[0.025] px-5 py-5">
        <p className="text-narrative text-[1rem] text-white/75">もう一つ、語りますか？</p>
        <p className="mt-2 text-xs leading-relaxed text-white/32">依頼された問い以外にも、残したい記憶を一つ加えられます。</p>
        <div className="mt-4 grid gap-2">
          {[
            { value: "free", label: "自由に語る" },
            { value: "question", label: "ほかの質問から選ぶ" },
            { value: "none", label: "今回はここまで" }
          ].map(option => (
            <button key={option.value} type="button" onClick={() => setExtraMode(option.value)} className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm ${extraMode === option.value ? "border-amber-100/25 bg-amber-50/[0.06] text-white/78" : "border-white/7 text-white/45"}`}><span>{option.label}</span>{extraMode === option.value && <Check size={15} />}</button>
          ))}
        </div>
        {extraMode === "question" && (
          <select value={extraQuestionId} onChange={event => setExtraQuestionId(event.target.value)} className="mt-4 w-full rounded-2xl border border-white/9 bg-[#141d31] px-4 py-4 text-sm text-white/72 outline-none">
            <option value="">質問を選ぶ</option>
            {extraQuestions.map(question => <option key={question.id} value={question.id}>{question.prompt}</option>)}
          </select>
        )}
        {extraMode !== "none" && (extraMode !== "question" || extraQuestionId) && (
          <div className="mt-4">
            <p className="mb-3 text-sm leading-relaxed text-white/60">{extraMode === "free" ? "ほかに残しておきたいこと" : extraQuestions.find(item => item.id === extraQuestionId)?.prompt}</p>
            <textarea value={extraText} onChange={event => setExtraText(event.target.value)} rows={4} placeholder="文章で答える" className="w-full resize-none rounded-2xl border border-white/8 bg-black/15 px-4 py-3 text-sm text-white outline-none placeholder:text-white/22" />
            <MemoryAudioRecorder value={extraAudio} onChange={setExtraAudio} />
          </div>
        )}
      </section>

      <section className="mt-6 rounded-[24px] border border-white/9 bg-white/[0.025] px-5 py-5">
        <div className="flex items-center gap-3"><ImageIcon size={19} className="text-white/50" /><div><p className="text-sm text-white/70">写真を添える（任意）</p><p className="mt-1 text-xs text-white/28">5枚まで選べます</p></div></div>
        <label className="mt-4 flex cursor-pointer items-center justify-center rounded-full border border-white/10 py-3 text-sm text-white/52">写真を選ぶ<input type="file" multiple accept="image/*" className="hidden" onChange={event => {
          const next = [...(event.target.files || [])].slice(0, Math.max(0, 5 - photos.length)).map(file => ({ file, url: URL.createObjectURL(file) }));
          setPhotos(current => [...current, ...next].slice(0, 5));
          event.target.value = "";
        }} /></label>
        {photos.length > 0 && <div className="mt-4 grid grid-cols-3 gap-2">{photos.map((photo, index) => <button key={`${photo.file.name}-${index}`} type="button" onClick={() => setPhotos(current => current.filter((_, itemIndex) => itemIndex !== index))} className="relative aspect-square overflow-hidden rounded-xl"><img src={photo.url} alt="" className="h-full w-full object-cover" /><span className="absolute inset-x-0 bottom-0 bg-black/55 py-1 text-[0.6rem] text-white/70">外す</span></button>)}</div>}
      </section>

      {error && <p className="mt-5 rounded-2xl border border-rose-200/15 bg-rose-100/[0.04] px-4 py-3 text-sm text-rose-100/65">{error}</p>}
      <button type="button" disabled={!canSubmit || status === "submitting"} onClick={submit} className="btn-quiet mt-7 w-full rounded-full bg-white/10 py-4 text-white/82 disabled:opacity-30">{status === "submitting" ? "送っています…" : "この内容を送る"}</button>
      <p className="mt-4 text-center text-xs leading-relaxed text-white/26">回答は、ご本人が確認するまで物語には表示されません。</p>
    </MemoryPublicShell>
  );
}

function MemoryPublicShell({ children }) {
  return <div className="min-h-screen bg-[#0f172a] px-5 py-10 text-white"><main className="mx-auto w-full max-w-[520px]">{children}</main></div>;
}

function scheduleMicroScrollTop() {
  window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
}

export function ThemeMemoryRequestManager({ supabaseClient, bookProjectId, onBack, onStartNew }) {
  const [status, setStatus] = useState("loading");
  const [requests, setRequests] = useState([]);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    setStatus("loading");
    try {
      const data = await invokeMemoryFunction(supabaseClient, { action: "list_owner", bookProjectId });
      setRequests(data.requests || []);
      setStatus("ready");
    } catch (loadError) {
      setError(loadError.message);
      setStatus("error");
    }
  };
  useEffect(() => { load(); }, [bookProjectId]);

  const openDetail = async requestId => {
    setStatus("loading_detail");
    try {
      const data = await invokeMemoryFunction(supabaseClient, { action: "owner_preview", requestId });
      setDetail(data);
      setStatus("ready");
    } catch (detailError) {
      setError(detailError.message);
      setStatus("ready");
    }
  };

  const review = async action => {
    setStatus("reviewing");
    try {
      await invokeMemoryFunction(supabaseClient, { action, requestId: detail.request.id });
      setDetail(null);
      await load();
    } catch (reviewError) {
      setError(reviewError.message);
      setStatus("ready");
    }
  };

  if (detail) {
    const mediaUrls = detail.mediaUrls || {};
    return (
      <div className="flow-scene-shell fade-enter"><div className="mx-auto w-full max-w-[520px]">
        <button type="button" onClick={() => setDetail(null)} className="mb-7 flex items-center gap-2 text-sm text-white/42"><ChevronLeft size={17} />一覧へ</button>
        <p className="text-[0.67rem] tracking-[0.2em] text-amber-100/42">届いた家族の記憶</p>
        <h1 className="mt-4 text-narrative text-[1.25rem] text-white/88">{withHonorific(detail.request.recipientName)}から</h1>
        <div className="mt-7 space-y-4">
          {(detail.response.answers || []).map((answer, index) => <section key={answer.questionId || index} className="rounded-2xl border border-white/9 bg-white/[0.03] px-5 py-5"><p className="text-sm leading-[1.8] text-white/52">{answer.prompt}</p>{answer.text && <p className="mt-4 whitespace-pre-wrap text-sm leading-[2] text-white/78">{answer.text}</p>}{answer.audioPath && mediaUrls[answer.audioPath] && <audio controls src={mediaUrls[answer.audioPath]} className="mt-4 w-full" />}</section>)}
          {detail.response.extra_response?.mode !== "none" && (detail.response.extra_response?.text || detail.response.extra_response?.audioPath) && <section className="rounded-2xl border border-white/9 bg-white/[0.03] px-5 py-5"><p className="text-sm leading-[1.8] text-white/52">{detail.response.extra_response.prompt || "ほかに残しておきたいこと"}</p>{detail.response.extra_response.text && <p className="mt-4 whitespace-pre-wrap text-sm leading-[2] text-white/78">{detail.response.extra_response.text}</p>}{detail.response.extra_response.audioPath && mediaUrls[detail.response.extra_response.audioPath] && <audio controls src={mediaUrls[detail.response.extra_response.audioPath]} className="mt-4 w-full" />}</section>}
        </div>
        {(detail.response.photo_paths || []).length > 0 && <div className="mt-5 grid grid-cols-2 gap-3">{detail.response.photo_paths.map(path => mediaUrls[path] && <img key={path} src={mediaUrls[path]} alt="家族から届いた写真" className="aspect-square w-full rounded-2xl object-cover" />)}</div>}
        {error && <p className="mt-5 text-sm text-rose-100/65">{error}</p>}
        {detail.response.status === "approved" ? <p className="mt-7 rounded-2xl border border-emerald-100/15 bg-emerald-100/[0.04] px-5 py-4 text-center text-sm text-emerald-100/65">この記憶は物語に加わりました</p> : <div className="mt-7 grid gap-3"><button type="button" disabled={status === "reviewing"} onClick={() => review("approve")} className="btn-quiet w-full rounded-full bg-white/10 py-4 text-white/82">内容を確認して物語に加える</button><button type="button" disabled={status === "reviewing"} onClick={() => review("reject")} className="py-3 text-sm text-white/35 underline underline-offset-4">今回は加えない</button></div>}
      </div></div>
    );
  }

  const statusLabel = item => {
    if (item.status === "approved") return "物語に追加済み";
    if (item.status === "submitted") return "回答が届きました";
    if (item.email_delivery_status === "failed") return "メール送信エラー";
    if (item.status === "opened") return "相手が開きました";
    if (item.status === "cancelled") return "取り消しました";
    return "お願いを送りました";
  };

  return (
    <div className="flow-scene-shell fade-enter"><div className="mx-auto w-full max-w-[520px]">
      <button type="button" onClick={onBack} className="mb-7 flex items-center gap-2 text-sm text-white/42"><ChevronLeft size={17} />戻る</button>
      <h1 className="text-narrative text-[1.25rem] text-white/88">家族から聞いた記憶</h1>
      <p className="mt-3 text-sm leading-[1.9] text-white/38">「幼い頃のこと」に、家族が覚えている場面を添えられます。</p>
      {status === "loading" ? <p className="mt-10 animate-pulse text-center text-white/35">読み込んでいます…</p> : <div className="mt-7 space-y-3">{requests.map(item => <button key={item.id} type="button" disabled={!item.theme_memory_responses?.length} onClick={() => openDetail(item.id)} className="w-full rounded-2xl border border-white/9 bg-white/[0.03] px-5 py-5 text-left disabled:opacity-75"><span className="flex items-center gap-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06]"><Users size={18} className="text-white/55" /></span><span className="min-w-0 flex-1"><span className="block text-narrative text-white/78">{withHonorific(item.recipient_name)}</span><span className={`mt-1 block text-xs ${item.status === "submitted" ? "text-amber-100/65" : "text-white/32"}`}>{statusLabel(item)}</span></span>{item.theme_memory_responses?.length > 0 && <ChevronRight size={17} className="text-white/25" />}</span></button>)}{requests.length === 0 && <p className="rounded-2xl border border-white/8 px-5 py-6 text-center text-sm leading-loose text-white/38">まだお願いした記憶はありません。</p>}</div>}
      {error && <p className="mt-5 text-sm text-rose-100/65">{error}</p>}
      <button type="button" onClick={onStartNew} className="btn-quiet mt-7 w-full rounded-full bg-white/10 py-4 text-white/78">家族に思い出を聞いてみる</button>
    </div></div>
  );
}
