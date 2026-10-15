import React, { useEffect, useState } from 'react';
import { callSupporterSms, loadSupporterSmsToken, normalizeSupporterPhone } from './lib/supporterSms.js';
import { supporterIdentityParams } from './lib/supporterIdentity.js';
import { familyAuthFeedback } from './lib/familyAuthFeedback.js';

export function SupporterSmsComposer({ client, projectId, onSent, initialPhone = '', selectedSharingEnabled = false }) {
  const [phone, setPhone] = useState(initialPhone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const send = async () => {
    if (busy) return;
    setError('');
    let normalized;
    try { normalized = normalizeSupporterPhone(phone); } catch (e) { setError(e.message); return; }
    if (!window.confirm(selectedSharingEnabled
      ? 'この番号へお手伝いの依頼を送ります。相手が引き受けるまで権限は付きません。'
      : '相手が引き受けると「選んだ人へ共有」が有効になります。「ずっと自分だけ」の語りは共有されません。依頼を送りますか？')) return;
    setBusy(true);
    try { await callSupporterSms(client, { action: 'send', projectId, phone: normalized }); await onSent?.(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <div className="space-y-4 text-left">
    <label className="block text-white/65 text-sm">手伝ってもらう方の携帯電話番号
      <input className="quiet-input mt-2" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} disabled={busy} />
    </label>
    <p className="text-white/45 text-xs">SMSで依頼リンクを送ります。定期配信の登録はしません。</p>
    {error && <p role="alert" className="text-rose-200 text-sm">{error}</p>}
    <button type="button" className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white text-sm disabled:opacity-40" disabled={busy || !phone.trim()} onClick={send}>{busy ? '送信しています…' : 'SMSで依頼を送る'}</button>
  </div>;
}

export function SupporterSmsEntry({ client, inviteId, renderInvitation }) {
  const [token] = useState(()=>loadSupporterSmsToken(inviteId));
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [info, setInfo] = useState(null);
  const [mode, setMode] = useState('choose');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(()=>{
    let live=true;
    client.auth.getSession().then(({data})=>{if(live){setSession(data?.session || null);setAuthReady(true);}}).catch(()=>{if(live)setAuthReady(true);});
    const {data}=client.auth.onAuthStateChange((_event,next)=>{if(live){setSession(next);setAuthReady(true);setCode('');setNotice('');}});
    return ()=>{live=false;data.subscription.unsubscribe();};
  },[client]);
  const request = (action, extra={}) => callSupporterSms(client,{action,inviteId,token,...extra});
  const refresh = async () => { const next=await request('info');setInfo(next);return next; };
  useEffect(()=>{
    let live=true;
    if(!authReady || !token) return;
    setInfo(null);setError('');
    request('info').then(next=>{if(live)setInfo(next);}).catch(e=>{if(live)setError(e.message);});
    return ()=>{live=false;};
  },[authReady,session?.user?.id,inviteId,token]);
  const run = async fn => {
    if(busy)return;setBusy(true);setError('');
    try { await fn(); } catch(e) { setError(e.message); } finally { setBusy(false); }
  };
  const finish = () => {
    try { sessionStorage.removeItem(`tateyoko:supporter-sms:${inviteId}`); } catch { /* optional storage */ }
    if (!info?.projectId) { setError('物語を開けませんでした。依頼リンクを開き直してください。'); return; }
    location.assign('/?app=1&support_project='+encodeURIComponent(info.projectId));
  };
  const sendPhoneOtp = async () => {
    await request('phone_otp');
    setCode('');setMode('phone_code');setNotice('');
  };
  const verifyPhoneOtp = async () => {
    const result=await request('verify_phone_otp',{code});
    const {data,error}=await client.auth.setSession(result.session);
    if(error)throw Error(familyAuthFeedback(error));
    setSession(data.session);
  };
  if(!token) return <div className="p-8 text-white/80 leading-loose">SMSに届いた依頼リンクをもう一度開いてください。ログイン済みの場合、そのまま続きを開けます。</div>;
  if(info?.verified && session) return renderInvitation({
    user:{...session.user,...info.profile}, invite:{invite_id:inviteId,subject_name:info.subjectName,inviter_name:info.inviterName},
    onAccept:async identity=>{
      const {error}=await client.rpc('accept_supporter_invite_with_identity',{input_invite_id:inviteId,...supporterIdentityParams(identity)});
      if(error){await refresh();throw Error('依頼を引き受けられませんでした。期限とログイン中のアカウントをご確認ください。');}
      finish();
    },
    onDecline:async()=>{
      const {error}=await client.rpc('respond_to_supporter_invite_resilient',{input_invite_id:inviteId,input_accept:false});
      if(error)throw Error('辞退を保存できませんでした。');setInfo({declined:true});
    }
  });
  return <main className="h-full overflow-y-auto px-6 py-10"><div className="max-w-[360px] mx-auto space-y-6">
    <h1 className="text-white/90 text-xl text-narrative">お手伝いの依頼</h1>
    {!authReady && <p className="text-white/60">準備しています…</p>}
    {info?.declined ? <p className="text-white/80">辞退しました。この画面を閉じてください。</p> : info?.accepted ? <><p className="text-white/80">お手伝いの登録ができています。</p><button type="button" className="btn-quiet w-full py-4 bg-white/10 rounded-full" onClick={finish}>物語を開く</button></> : <>
      {info && !session && mode==='choose' && <>
        <p className="text-white/80">末尾{info.phoneSuffix}の携帯電話で確認します。</p>
        <button type="button" disabled={busy} className="btn-quiet w-full py-4 bg-white/10 rounded-full" onClick={()=>run(sendPhoneOtp)}>確認番号を受け取る</button>
        <p className="text-white/70 text-base">初めての方は、この番号で登録します。</p>
        <button type="button" className="w-full py-3 text-white/80 underline" onClick={()=>setMode('email')}>メールで登録済みの方はこちら</button>
      </>}
      {info && !session && mode==='email' && <>
        <label className="block text-sm text-white/70">登録済みのメールアドレス<input className="quiet-input mt-2" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} /></label>
        <button type="button" disabled={busy || !email.trim()} className="btn-quiet w-full py-4 bg-white/10 rounded-full" onClick={()=>run(async()=>{
          const {error}=await client.auth.signInWithOtp({email:email.trim(),options:{shouldCreateUser:false,emailRedirectTo:location.origin+location.pathname+location.search}});
          if(error)throw Error('ログインメールを送れませんでした。登録済みのアドレスをご確認ください。');
          setNotice('ログインメールを送りました。メールでログイン後、このSMSのリンクをもう一度開いてください。');
        })}>ログインメールを受け取る</button>
      </>}
      {info && session && !info.verified && <>
        <p className="text-white/70 text-sm">{session.user.email || 'ログイン中のアカウント'}で引き受けます。</p>
        <p className="text-white/55 text-sm">末尾{info.phoneSuffix}の携帯電話で、依頼を確認します。</p>
        <button type="button" disabled={busy} className="btn-quiet w-full py-4 bg-white/10 rounded-full" onClick={()=>run(async()=>{await request('code');setMode('invite_code');setCode('');setNotice('SMSに届いた6桁の番号を入力してください。');})}>SMSで確認番号を受け取る</button>
        <button type="button" disabled={busy} className="text-white/50 text-sm underline" onClick={()=>run(async()=>{await client.auth.signOut();setMode('choose');})}>別のアカウントで開く</button>
      </>}
      {((!session && mode==='phone_code') || (session && mode==='invite_code')) && <>
        <label className="block text-white/80 text-base">SMSに届いた6桁の番号<input className="quiet-input mt-2" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} /></label>
        <button type="button" disabled={busy || code.length!==6} className="btn-quiet w-full py-4 bg-white/10 rounded-full disabled:opacity-40" onClick={()=>run(mode==='phone_code'?verifyPhoneOtp:async()=>{await request('verify_code',{code});await refresh();})}>確認する</button>
      </>}
      {!session && mode!=='choose' && <button type="button" disabled={busy} className="text-white/50 text-sm underline" onClick={()=>{setMode('choose');setCode('');setNotice('');}}>戻る</button>}
    </>}
    {notice && <p role="status" className="text-white/65 text-sm leading-loose">{notice}</p>}
    {error && <p role="alert" className="text-rose-200 text-sm leading-loose">{error}</p>}
    {busy && <p className="text-white/50 text-sm" role="status">確認しています…</p>}
  </div></main>;
}
