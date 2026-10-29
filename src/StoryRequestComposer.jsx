import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, Clipboard, List, Plus } from 'lucide-react';
import { THEME_EXTRA_QUESTIONS } from './lib/themeExtras.js';

export async function invokeStoryRequest(client, body) {
  const { data, error } = await client.functions.invoke('story-request', { body });
  if (error || !data?.success) {
    let detail = data;
    if (!detail && error?.context?.json) { try { detail = await error.context.json(); } catch {} }
    const failure = new Error(detail?.error || error?.message || '処理を完了できませんでした');
    failure.conflict = Boolean(detail?.conflict);
    failure.serverDraft = detail?.serverDraft;
    throw failure;
  }
  return data;
}

export const STORY_REQUEST_MESSAGE = `今、「縦糸♾️横糸 tateito yokoito」というサービスで、自分の人生を振り返り、思い出や言葉を一冊の本に残そうとしています。
よかったら、いくつか質問に答えてもらえたら嬉しいです。
声でも文章でも答えられるので、2週間くらいを目安に、時間のあるときにぜひお願いします😊`;

function PaperHeartIcon() {
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m4 10 17-7-6.8 17-3.1-7L4 10Z"/><path d="m21 3-9.9 10"/>
    <path d="M3 17.5c-1.1-.8-2-1.7-2-2.6 0-.6.4-1 1-1 .5 0 .8.2 1 .6.2-.4.5-.6 1-.6.6 0 1 .4 1 1 0 .9-.9 1.8-2 2.6Z" transform="translate(-0.15 -0.785) scale(1.05)" fill="currentColor" stroke="none"/>
  </svg>;
}

export { PaperHeartIcon };

const quiet = 'min-h-12 w-full rounded-xl border border-white/25 px-4 py-3 text-left text-[1rem] text-white/80';
const primary = 'min-h-14 w-full rounded-xl bg-[#f5f3ed] px-4 py-3 text-[1rem] font-medium text-[#18243a] disabled:opacity-40';

export default function StoryRequestComposer({ client, bookProjectId, theme, questions = [], onBack }) {
  const [step, setStep] = useState('questions');
  const [selected, setSelected] = useState([]);
  const [custom, setCustom] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [created, setCreated] = useState(null);
  const [message, setMessage] = useState(STORY_REQUEST_MESSAGE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const available = useMemo(() => {
    const existing = questions.filter(q => q.theme_code === theme?.code && q.content && q.user_question_id);
    const usedExtras = new Set(existing.map(q => q.theme_extra_id).filter(Boolean));
    const base = existing.map(q => ({ key: `source:${q.user_question_id}`, text: q.content,
      answered: q.status === 'answered' || Boolean(q.answered_at), kind: 'source', id: q.user_question_id }));
    const extra = (THEME_EXTRA_QUESTIONS[theme?.code] || [])
      .filter(([id]) => !usedExtras.has(id))
      .map(([id, text]) => ({ key: `extra:${id}`, text, answered: false, kind: 'extra', id }));
    return [...base, ...extra];
  }, [questions, theme?.code]);
  const count = selected.length + (custom.trim() ? 1 : 0);
  const toggle = key => setSelected(current => current.includes(key) ? current.filter(id => id !== key)
    : current.length + (custom.trim() ? 1 : 0) >= 3 ? current : [...current, key]);
  useEffect(() => {
    if (!created?.requestId) return;
    const key = `story-request-message:${created.requestId}`;
    try { setMessage(localStorage.getItem(key) || STORY_REQUEST_MESSAGE); } catch {}
  }, [created?.requestId]);
  const editMessage = text => {
    setMessage(text);
    try { if (created?.requestId) localStorage.setItem(`story-request-message:${created.requestId}`, text); } catch {}
  };
  const create = async () => {
    setBusy(true); setError('');
    try {
      const payload = selected.map(key => {
        const item = available.find(q => q.key === key);
        return item?.kind === 'source' ? { sourceQuestionId: item.id } : { extraId: item?.id };
      });
      if (custom.trim()) payload.push({ customText: custom.trim() });
      const result = await invokeStoryRequest(client, { action: 'create', bookProjectId,
        themeCode: theme.code, recipientName: recipientName.trim(), relationship: relationship.trim(), questions: payload });
      setCreated(result); setStep('share');
    } catch (caught) { setError(caught.message); }
    finally { setBusy(false); }
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`${message.trim()}\n\n【質問を見てみる】\n${created.url}`); setCopied(true); }
    catch { setError('リンクをコピーできませんでした。端末の設定を確認してください。'); }
  };
  const sendLine = () => {
    const text = `${message.trim()}\n\n【質問を見てみる】\n${created.url}`;
    window.open(`https://line.me/R/share?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };
  return <div className="flow-scene-shell fade-enter"><main className="mx-auto w-full max-w-[520px] pb-10 text-white">
    <button type="button" className="mb-8 flex min-h-11 items-center gap-1 text-[1rem] text-white/75" onClick={() => step === 'share' ? onBack() : step === 'recipient' ? setStep('questions') : onBack()}><ChevronLeft size={18}/>戻る</button>
    <p className="text-center text-sm text-[#d6bb86]">{theme?.label}</p>
    <h1 className="mt-4 text-center text-narrative text-[1.5rem] leading-[1.7]">誰かの記憶も、<br/>この物語に</h1>
    {step === 'questions' && <div className="mt-9 space-y-5">
      <div className="flex items-center justify-between"><h2 className="text-[1.05rem]">聞きたい問い</h2><span className="text-sm text-white/55">{count} / 3問</span></div>
      <p className="text-sm leading-relaxed text-white/60">このテーマの質問から選ぶか、ご自身でつくれます。両方を組み合わせても大丈夫です。</p>
      <div className="space-y-2">{available.map(item => <button type="button" key={item.key} onClick={() => toggle(item.key)}
        className={`${quiet} flex items-start gap-3 ${selected.includes(item.key) ? 'border-[#d6bb86] bg-[#d6bb86]/10' : ''}`}>
        <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-white/50">{selected.includes(item.key) && <Check size={14}/>}</span>
        <span><span className="block leading-[1.7]">{item.text}</span><small className="mt-1 block text-[#d6bb86]">{item.answered ? '本人が語った' : 'まだ語っていない'}</small></span>
      </button>)}</div>
      <label className="block text-[1rem]">自分で質問をつくる
        <textarea value={custom} onChange={event => setCustom(event.target.value)} maxLength={500} rows={3} placeholder="相手に聞いてみたいことを書く" className="mt-2 w-full rounded-xl border border-white/25 bg-white/[0.06] p-4 text-[1rem] leading-[1.7] outline-none placeholder:text-white/35"/>
      </label>
      {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
      <button type="button" disabled={count < 1 || count > 3} className={primary} onClick={() => setStep('recipient')}>送り先を入力する <ArrowRight className="inline" size={18}/></button>
    </div>}
    {step === 'recipient' && <div className="mt-10 space-y-6">
      <p className="text-sm text-white/60">選んだ{count}問を送ります。</p>
      <label className="block">相手のお名前<input value={recipientName} onChange={event => setRecipientName(event.target.value)} maxLength={80} placeholder="例：誠" className="mt-2 min-h-14 w-full rounded-xl border border-white/25 bg-white/[0.06] px-4 text-[1.1rem] outline-none"/></label>
      <label className="block">あなたとの関係<input value={relationship} onChange={event => setRelationship(event.target.value)} maxLength={80} placeholder="例：夫、姉、友人" className="mt-2 min-h-14 w-full rounded-xl border border-white/25 bg-white/[0.06] px-4 text-[1.1rem] outline-none"/></label>
      {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
      <button type="button" disabled={busy || !recipientName.trim() || !relationship.trim()} className={primary} onClick={create}>{busy ? 'リンクを作っています…' : '依頼内容を確認してリンクを作る'}</button>
    </div>}
    {step === 'share' && created && <div className="mt-9 space-y-5">
      <h2 className="text-[1.15rem]">{recipientName}さんへのメッセージ</h2>
      <textarea value={message} onChange={event => editMessage(event.target.value)} rows={9} className="w-full rounded-xl border border-[#d6bb86]/30 bg-[#f5f3ed] px-4 py-4 text-[1rem] leading-[1.7] text-[#18243a] outline-none"/>
      <button type="button" className="text-sm text-white/65 underline" onClick={() => editMessage(STORY_REQUEST_MESSAGE)}>雛形に戻す</button>
      <div className="rounded-xl border border-white/20 px-4 py-4 text-sm leading-[1.7] text-white/75">【質問を見てみる】<br/><span className="break-all">{created.url}</span></div>
      <p className="text-sm text-white/70">メッセージと質問へのリンクを、LINEで送れます。</p>
      <button type="button" className={primary} onClick={sendLine}><PaperHeartIcon/> LINEで送る</button>
      <button type="button" className={`${quiet} text-center`} onClick={copyLink}><Clipboard className="inline" size={19}/> {copied ? 'コピーしました' : 'メッセージとリンクをコピー'}</button>
      {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
      <p className="text-sm leading-[1.8] text-white/55">リンクを開いた人が回答できます。送り先を確認してから共有してください。共有をやめても、あとから同じ依頼リンクを送れます。</p>
      <p className="text-sm leading-[1.8] text-white/55">リンクは、宛先の方以外に共有しないでください。</p>
    </div>}
  </main></div>;
}
