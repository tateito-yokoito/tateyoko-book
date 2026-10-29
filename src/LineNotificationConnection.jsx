import React, { useEffect, useState } from 'react';
import { hasLineIdentity, linkLineToCurrentAccount, markLineNotificationReturn, startLineSignIn } from './lib/lineAuth.js';

// Uses the current session, never an ID or destination supplied by the UI.
export default function LineNotificationConnection({ client, initialEnabled, ready = true, onChanged }) {
  const [state, setState] = useState('loading');
  const [enabled, setEnabled] = useState(Boolean(initialEnabled));
  const [message, setMessage] = useState('');
  const [linked, setLinked] = useState(false);
  async function check(action = 'check') {
    setState('loading'); setMessage('');
    try {
      const { data: { user }, error: userError } = await client.auth.getUser();
      if (userError || !user) throw new Error('session');
      const isLinked = hasLineIdentity(user);
      setLinked(isLinked);
      if (!isLinked) { setState('unlinked'); return; }
      const { data: { session }, error: sessionError } = await client.auth.getSession();
      if (sessionError || !session) throw new Error('session');
      const { data, error } = await client.functions.invoke('line-connection', {
        body: { action, provider_token: session.provider_token || undefined },
      });
      if (error || !data?.status) {
        if (action === 'enable' && error) {
          setState('active');
          setMessage('受け取り時間が保存されているか確認し、もう一度お試しください。');
          return;
        }
        throw new Error('connection');
      }
      setState(data.status);
      if (typeof data.notification_enabled === 'boolean') {
        setEnabled(data.notification_enabled);
        onChanged?.({ line_enabled: data.notification_enabled });
      }
    } catch {
      setState('error');
      setMessage('確認できませんでした。もう一度お試しください。');
    }
  }
  useEffect(() => { check(); }, []);
  async function connect() {
    setState('loading'); setMessage('');
    try {
      // Link existing accounts; signing them in afresh would create duplicates.
      const url = new URL(location.href); url.hash = ''; url.searchParams.delete('code');
      markLineNotificationReturn(window.sessionStorage);
      const result = await linkLineToCurrentAccount(client, url.toString());
      if (result.error) throw result.error;
    } catch { window.sessionStorage.removeItem('tateyoko:line-notification-return'); setState('error'); setMessage('LINEを開けませんでした。もう一度お試しください。'); }
  }
  async function confirmFriendship() {
    setState('loading'); setMessage('');
    try {
      // If the OAuth provider token expired, a fresh LINE login can verify
      // friendship without treating a merely reachable bot profile as consent.
      const url = new URL(location.href); url.hash = ''; url.searchParams.delete('code');
      markLineNotificationReturn(window.sessionStorage);
      const result = await startLineSignIn(client, url.toString());
      if (result.error) throw result.error;
    } catch { window.sessionStorage.removeItem('tateyoko:line-notification-return'); setState('error'); setMessage('LINEの確認を開けませんでした。もう一度お試しください。'); }
  }
  const busy = state === 'loading';
  return <section className="rounded-2xl border border-white/20 bg-white/[0.025] p-4" aria-label="LINEの受け取り設定">
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-white text-base font-semibold">LINE</h3>
      <span className="text-white/80 text-base">{busy ? '確認中…' : state === 'active' ? enabled ? '受け取り中' : '友だち追加済み' : '未設定'}</span>
    </div>
    <p className="mt-2 text-white/80 text-base leading-relaxed">
      {state === 'active' ? ready ? '選んだ時間に、LINEで問いをお届けします。' : '受け取り時間を保存すると、LINEで問いを受け取れます。' : state === 'reachable_unconfirmed' ? 'LINEで友だち状態を確認してください。' : state === 'error' ? 'LINEの状態を確認できませんでした。' : '縦糸＋横糸を友だち追加すると、LINEで問いを受け取れます。'}
    </p>
    {message && <p role="alert" className="mt-2 text-rose-200">{message}</p>}
    <div className="mt-3 flex flex-wrap gap-3">
      {state === 'active' ? <button type="button" disabled={!enabled && !ready} onClick={() => check(enabled ? 'disable' : 'enable')} className="rounded-full border border-white/30 px-5 py-3 text-white disabled:opacity-50">{enabled ? 'LINEの通知を停止' : ready ? 'LINEで受け取る' : '先に受け取り時間を保存'}</button>
        : linked && state === 'reachable_unconfirmed' ? <button type="button" onClick={confirmFriendship} className="rounded-full bg-[#06c755] px-5 py-3 font-semibold text-white">LINEの状態を確認</button>
        : linked && state === 'error' ? null
        : linked ? <a href="https://line.me/R/ti/p/%40558hxwaz" target="_blank" rel="noopener noreferrer" className="rounded-full bg-[#06c755] px-5 py-3 font-semibold text-white">LINEで友だち追加</a>
        : <button type="button" disabled={busy} onClick={connect} className="rounded-full bg-[#06c755] px-5 py-3 font-semibold text-white disabled:opacity-50">LINEにつなぐ</button>}
      {!busy && <button type="button" onClick={() => check()} className="px-3 py-3 text-white/80 underline underline-offset-4">もう一度確認</button>}
    </div>
  </section>;
}
