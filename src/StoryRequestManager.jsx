import React, { useEffect, useState } from 'react';
import { ChevronLeft, Clipboard, Users } from 'lucide-react';
import { invokeStoryRequest, STORY_REQUEST_MESSAGE } from './StoryRequestComposer.jsx';
import { STORY_THEMES } from './lib/storyThemes.js';

const themeLabel = code => STORY_THEMES.find(theme => theme.code === code)?.label || '語り';
const textName = value => String(value || '').trim();

export default function StoryRequestManager({ client, bookProjectId, onBack, onLegacy }) {
  const [requests, setRequests] = useState([]), [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const load = async () => {
    setBusy(true); setError('');
    try { const data = await invokeStoryRequest(client, { action: 'list_owner', bookProjectId }); setRequests(data.requests || []); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  useEffect(() => { if (bookProjectId) void load(); }, [bookProjectId]);
  const open = async id => {
    setBusy(true); setError('');
    try { const data = await invokeStoryRequest(client, { action: 'owner_preview', requestId: id }); setDetail(data); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  const review = async (answerId, publicationStatus) => {
    setBusy(true); setError('');
    try {
      await invokeStoryRequest(client, { action: 'review', requestId: detail.request.id, answerId, publicationStatus });
      await open(detail.request.id);
      await load();
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  const copyLink = async url => {
    try { await navigator.clipboard.writeText(url); setError('リンクをコピーしました。'); }
    catch { setError('リンクをコピーできませんでした。'); }
  };
  const lineShare = (item, url) => {
    let message = STORY_REQUEST_MESSAGE;
    try { message = localStorage.getItem(`story-request-message:${item.id}`) || message; } catch {}
    window.open(`https://line.me/R/share?text=${encodeURIComponent(`${message.trim()}\n\n【質問を見てみる】\n${url}`)}`, '_blank', 'noopener,noreferrer');
  };
  const revoke = async item => {
    if (!window.confirm('この依頼リンクを無効にしますか？')) return;
    setBusy(true); setError('');
    try { await invokeStoryRequest(client, { action: 'revoke', requestId: item.id }); setDetail(null); await load(); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  return <div className="flow-scene-shell fade-enter"><main className="mx-auto w-full max-w-[520px] pb-10 text-white">
    <button type="button" className="mb-6 flex min-h-11 items-center gap-1 text-white/70" onClick={() => detail ? setDetail(null) : onBack()}><ChevronLeft size={18}/>{detail ? '一覧へ' : '戻る'}</button>
    <h1 className="text-narrative text-[1.4rem]">{detail ? `${textName(detail.request.recipient_name)}さんの語り` : '届いた語り'}</h1>
    {error && <p role="status" className="mt-4 text-sm text-amber-200">{error}</p>}
    {!detail && <div className="mt-7 space-y-3">{requests.map(item => <div key={item.id} className="rounded-xl border border-white/20 p-4">
      <button type="button" onClick={() => open(item.id)} className="flex w-full items-center gap-3 text-left"><Users size={20}/><span className="flex-1"><strong className="block font-medium">{textName(item.recipient_name)}さん</strong><small className="mt-1 block text-white/60">{themeLabel(item.theme_code)} · {item.theme_memory_answer_records?.length ? '回答が届きました' : item.revoked_at ? '依頼を終了しました' : '回答待ち'}</small></span><span>→</span></button>
      {!item.revoked_at && <div className="mt-4 flex gap-3 border-t border-white/10 pt-3 text-sm text-white/65"><button type="button" onClick={() => lineShare(item, item.url)}>LINEで再共有</button><button type="button" onClick={() => copyLink(item.url)}>リンクをコピー</button></div>}
    </div>)}
    {!requests.length && !busy && <p className="text-white/60">まだ語りの依頼はありません。</p>}
    {onLegacy && <button type="button" className="mt-5 text-sm text-white/60 underline" onClick={onLegacy}>以前の家族への依頼を見る</button>}
    </div>}
    {detail && <div className="mt-7 space-y-5">
      <p className="text-sm text-white/65">{themeLabel(detail.request.theme_code)} · {textName(detail.request.relationship_label)}</p>
      {(detail.answers || []).map(answer => <section key={answer.id} className="rounded-xl border border-white/20 p-5">
        <p className="text-narrative text-[1rem] leading-[1.7]">{answer.prompt_snapshot}</p>
        <p className="mt-5 whitespace-pre-wrap rounded-lg bg-[#f5f3ed] p-4 text-[1.1rem] leading-[1.75] text-[#18243a]">{answer.current_text}</p>
        {(answer.audio_records || []).map((record, index) => detail.mediaUrls?.[record.path] && <audio controls key={`${record.path}:${index}`} src={detail.mediaUrls[record.path]} className="mt-4 w-full"/>)}
        <p className="mt-4 text-sm text-white/55">{answer.publication_status === 'included' ? '作品に掲載' : answer.publication_status === 'excluded' ? '掲載しない' : '掲載を未選択'}</p>
        <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={busy} onClick={() => review(answer.id, 'included')} className="min-h-12 rounded-lg bg-[#f5f3ed] text-[#18243a]">掲載する</button><button type="button" disabled={busy} onClick={() => review(answer.id, 'excluded')} className="min-h-12 rounded-lg border border-white/25">掲載しない</button></div>
      </section>)}
      {!detail.answers?.length && <p className="text-white/60">まだ回答は届いていません。</p>}
      {!detail.request.revoked_at && <button type="button" disabled={busy} onClick={() => revoke(detail.request)} className="mt-6 text-sm text-white/55 underline">依頼リンクを無効にする</button>}
    </div>}
  </main></div>;
}
