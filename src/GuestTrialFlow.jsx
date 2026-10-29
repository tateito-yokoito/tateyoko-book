import React, { useCallback, useEffect, useState } from 'react';
import { Scene_Recording, ensureUserFoundation, ensureUserQuestions, supabaseClient } from './App.jsx';
import { CHILDHOOD_TRIAL_QUESTIONS } from './lib/childhoodTrial.js';
import TrialCompletionExperience from './TrialCompletionExperience.jsx';
import { guestCheckout, guestPurchaseStatus, claimGuestPurchase } from './lib/guestPurchaseApi.js';
import { hasLineIdentity, linkLineToCurrentAccount, startLineSignIn } from './lib/lineAuth.js';
import {
  guestTrialRequest, guestTrialStorageKey,
  ensureGuestTrialStorage, readGuestTrialSession, storeGuestTrialSession,
} from './lib/guestTrialApi.js';

// The public entry remains on the established flow until the full purchase,
// recovery, and handoff gate passes. The API always follows this app's
// configured Supabase project; a production build must never call the test DB.
const TRIAL_API = supabaseClient.supabaseUrl.replace(/\/$/, '');
const developmentPreview = import.meta.env.DEV
  && import.meta.env.VITE_GUEST_TRIAL_PURCHASE_PREVIEW_ENABLED === 'true';
const purchasePreviewEnabled = developmentPreview
  || import.meta.env.VITE_GUEST_TRIAL_PURCHASE_ENABLED === 'true';
const giftToken = new URLSearchParams(window.location.search).get('gift_trial_token') || null;
const questions = CHILDHOOD_TRIAL_QUESTIONS.map((question, index) => ({
  ...question, question_id: question.id, onboarding_group: 'trial_experience',
  content: question.content, prompt_hint: question.hint,
  chapter_label: '幼い頃', theme_label: '幼い頃', theme_order: 1,
  sequence_order: index + 1,
}));

export default function GuestTrialFlow() {
  const [key, setKey] = useState(null);
  const [session, setSession] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [index, setIndex] = useState(0);
  const [screen, setScreen] = useState('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingBlob, setPendingBlob] = useState(null);
  const [pendingAudioUrl, setPendingAudioUrl] = useState('');
  const [uploadDone, setUploadDone] = useState(false);
  const [canRetryTranscription, setCanRetryTranscription] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [editing, setEditing] = useState(false);
  const [quote, setQuote] = useState(null);
  const [familyName, setFamilyName] = useState('');
  const [givenName, setGivenName] = useState('');

  async function showPaidHandoff() {
    const { data: auth } = await supabaseClient.auth.getSession();
    if (auth?.session) {
      const { data: identity } = await supabaseClient.auth.getUser();
      if (hasLineIdentity(identity?.user)) {
        setScreen('identity_name');
        return;
      }
    }
    setScreen('paid');
  }

  const refresh = useCallback(async currentSession => {
    const state = await guestTrialRequest(TRIAL_API, 'status', { sessionToken: currentSession.token });
    const rows = state.answers || [];
    setAnswers(rows);
    if (state.status === 'checkout_pending') {
      setScreen(new URLSearchParams(window.location.search).get('guest_trial_payment') === 'cancel'
        ? 'payment_cancelled' : 'payment_pending');
      return 'payment_pending';
    }
    if (state.status === 'paid_unclaimed') {
      await showPaidHandoff();
      return 'paid';
    }
    if (state.status === 'completed') {
      setScreen('finished');
      return 'finished';
    } else {
      const next = questions.findIndex(question => !rows.some(row => row.question_id === question.id
        && row.transcription_state === 'complete'));
      setIndex(next < 0 ? 2 : next);
      const savedRow = next >= 0 ? rows.find(row => row.question_id === questions[next].id) : null;
      const savedAudio = Boolean(savedRow);
      setUploadDone(savedAudio);
      setCanRetryTranscription(savedRow?.transcription_retryable !== false
        && Number(savedRow?.transcription_attempts || 0) < 3);
      if (savedAudio) setError('声は保存されています。文字起こしをやり直すか、文章を入力してください。');
      setScreen(next < 0 ? 'review' : savedAudio ? 'save_error' : 'intro');
      if (next < 0) setTranscript(rows.find(row => row.question_id === questions[2].id)?.transcript || '');
      return next < 0 ? 'review' : savedAudio ? 'save_error' : 'intro';
    }
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      const nextKey = await guestTrialStorageKey(giftToken);
      if (!live) return;
      setKey(nextKey);
      let saved = null;
      try { saved = readGuestTrialSession(localStorage, nextKey); }
      catch { setScreen('intro'); return; }
      if (!saved) { setScreen('intro'); return; }
      setSession(saved);
      try { await refresh(saved); }
      catch (cause) {
        if (!live) return;
        if (cause.status === 401) {
          // The guest-trial endpoint stops accepting a claimed ticket, but
          // the purchase status endpoint can still identify its handoff.
          try {
            const purchase = await guestPurchaseStatus(TRIAL_API, saved.token);
            if (purchase.status === 'connected') { setScreen('connected'); return; }
            if (purchase.status === 'ready_to_connect') { await showPaidHandoff(); return; }
            if (purchase.status === 'payment_pending') {
              setScreen(new URLSearchParams(window.location.search).get('guest_trial_payment') === 'cancel'
                ? 'payment_cancelled' : 'payment_pending');
              return;
            }
            if (purchase.status === 'refunded') { setScreen('refunded'); return; }
          } catch { /* An expired/invalid ticket is handled below. */ }
          try { localStorage.removeItem(nextKey); } catch { /* No persistent token remains usable. */ }
          setSession(null);
        }
        setError(cause.status === 401 ? '体験の期限が切れました。新しく始められます。' : '接続を確認できません。もう一度お試しください。');
        setScreen('intro');
      }
    })();
    return () => { live = false; };
  }, [refresh]);

  async function begin() {
    setBusy(true); setError('');
    try {
      let current = session;
      if (!current) {
        ensureGuestTrialStorage(localStorage);
        const issued = await guestTrialRequest(TRIAL_API, 'start', { giftToken });
        current = storeGuestTrialSession(localStorage, key, issued);
        setSession(current);
      }
      const destination = await refresh(current);
      if (destination === 'intro') setScreen('record');
    } catch (cause) { setError(cause.message || '始められませんでした'); }
    finally { setBusy(false); }
  }

  async function fillTestAnswers() {
    if (!developmentPreview || !session || giftToken) return;
    setBusy(true); setError('');
    try {
      const { loadGuestTrialDemoAudio } = await import('./lib/guestTrialDemo.dev.js');
      const audio = await loadGuestTrialDemoAudio();
      for (const question of questions) {
        await guestTrialRequest(TRIAL_API, 'save', {
          sessionToken: session.token, questionId: question.id, audio,
        });
        const result = await guestTrialRequest(TRIAL_API, 'transcribe', {
          sessionToken: session.token, questionId: question.id,
        });
        if (!result.transcript?.trim()) throw new Error('テスト音声の文字起こしが空でした');
      }
      await guestTrialRequest(TRIAL_API, 'complete', { sessionToken: session.token });
      await refresh(session);
    } catch (cause) { setError(cause.message || 'テスト体験を準備できませんでした'); }
    finally { setBusy(false); }
  }

  async function saveRecording(_text, _duration, audioUrl, blob) {
    setScreen('saving'); setError(''); setBusy(true);
    setPendingBlob(blob);
    setPendingAudioUrl(audioUrl);
    setUploadDone(false);
    setCanRetryTranscription(true);
    await uploadAndTranscribe(blob, false);
  }

  async function uploadAndTranscribe(blob, alreadyUploaded) {
    try {
      const currentId = questions[index].id;
      if (!alreadyUploaded) {
        await guestTrialRequest(TRIAL_API, 'save', {
          sessionToken: session.token, questionId: currentId, audio: blob,
        });
        setUploadDone(true);
      }
      const result = await guestTrialRequest(TRIAL_API, 'transcribe', {
        sessionToken: session.token, questionId: currentId,
      });
      setTranscript(result.transcript || '');
      setAnswers(previous => [...previous.filter(row => row.question_id !== currentId), {
        question_id: currentId, transcript: result.transcript || '', transcription_state: 'complete',
      }]);
      setScreen('review');
    } catch (cause) {
      setError(cause.message || '保存できませんでした');
      setCanRetryTranscription(cause.retryable !== false);
      setScreen('save_error');
    } finally { setBusy(false); }
  }

  async function next() {
    setBusy(true); setError('');
    try {
      if (editing) {
        const saved = await guestTrialRequest(TRIAL_API, 'edit', {
          sessionToken: session.token, questionId: questions[index].id, text: transcript,
        });
        setTranscript(saved.transcript);
        setAnswers(previous => previous.map(row => row.question_id === questions[index].id
          ? { ...row, transcript: saved.transcript, transcription_state: 'complete' } : row));
        setEditing(false);
      }
      if (index < 2) {
        setIndex(index + 1); setPendingBlob(null); setPendingAudioUrl('');
        setTranscript(''); setScreen('record');
      } else {
        await guestTrialRequest(TRIAL_API, 'complete', { sessionToken: session.token });
        setScreen('finished');
      }
    } catch (cause) { setError(cause.message || '進めませんでした'); }
    finally { setBusy(false); }
  }

  async function useWrittenWords() {
    const words = transcript.trim();
    if (!words) { setError('お話しした内容を入力してください'); return; }
    setBusy(true); setError('');
    try {
      const saved = await guestTrialRequest(TRIAL_API, 'edit', {
        sessionToken: session.token, questionId: questions[index].id, text: words,
      });
      setTranscript(saved.transcript);
      setAnswers(previous => {
        const next = previous.filter(row => row.question_id !== questions[index].id);
        return [...next, { question_id: questions[index].id, transcript: saved.transcript,
          transcription_state: 'complete' }];
      });
      setEditing(false);
      setScreen('review');
    } catch (cause) { setError(cause.message || '文章を保存できませんでした'); }
    finally { setBusy(false); }
  }

  async function openConversion() {
    setBusy(true); setError('');
    try {
      const response = await guestTrialRequest(TRIAL_API, 'quote', { sessionToken: session.token });
      setQuote(response.quote);
      setScreen('conversion');
    } catch (cause) { setError(cause.message || '金額を確認できませんでした'); }
    finally { setBusy(false); }
  }

  async function checkPayment() {
    setBusy(true); setError('');
    try {
      const state = await guestPurchaseStatus(TRIAL_API, session.token);
      if (state.status === 'ready_to_connect') await showPaidHandoff();
      else if (state.status === 'connected') setScreen('connected');
      else if (state.status === 'refunded') setScreen('refunded');
      else setError('まだお支払いの確定を確認できません。少し待ってからもう一度お試しください。');
    } catch (cause) { setError(cause.message || 'お支払いを確認できませんでした'); }
    finally { setBusy(false); }
  }

  async function beginLineHandoff() {
    setBusy(true); setError('');
    try {
      const { data: auth, error: sessionError } = await supabaseClient.auth.getSession();
      if (sessionError) throw sessionError;
      const { data: identity, error: userError } = auth?.session
        ? await supabaseClient.auth.getUser() : { data: { user: null }, error: null };
      if (userError) throw userError;
      if (identity?.user && hasLineIdentity(identity.user)) {
        setScreen('identity_name');
        return;
      }
      const redirect = new URL(window.location.href);
      redirect.searchParams.set('guest_trial_preview', '1');
      redirect.searchParams.delete('guest_trial_payment');
      redirect.searchParams.delete('checkout_session');
      const { error: oauthError } = identity?.user
        ? await linkLineToCurrentAccount(supabaseClient, redirect.toString())
        : await startLineSignIn(supabaseClient, redirect.toString());
      if (oauthError) throw oauthError;
    } catch (cause) { setError(cause.message || 'LINEでの確認を始められませんでした'); }
    finally { setBusy(false); }
  }

  async function connectPaidStory() {
    if (!familyName.trim() || !givenName.trim()) {
      setError('お名前を入力してください');
      return;
    }
    setBusy(true); setError('');
    try {
      const { data: identity, error: userError } = await supabaseClient.auth.getUser();
      if (userError || !identity?.user || !hasLineIdentity(identity.user))
        throw new Error('先にLINEで本人確認してください');
      const { data: auth, error: sessionError } = await supabaseClient.auth.getSession();
      if (sessionError || !auth?.session?.access_token)
        throw new Error('本人確認をもう一度お試しください');
      const profile = {
        family_name: familyName.trim(), given_name: givenName.trim(),
        name: `${familyName.trim()} ${givenName.trim()}`,
        preferred_name: `${givenName.trim()}さん`,
      };
      const foundation = await ensureUserFoundation(identity.user.id, profile);
      await ensureUserQuestions(identity.user.id, foundation);
      await claimGuestPurchase(TRIAL_API, session.token, foundation.project.id, auth.session.access_token);
      setScreen('connected');
    } catch (cause) { setError(cause.message || '作品へ接続できませんでした'); }
    finally { setBusy(false); }
  }

  const stories = questions.map(question => {
    const answer = answers.find(row => row.question_id === question.id);
    return {
      id: question.id, question: question.content, title: '',
      text: answer?.transcript || '',
      audio: answer ? [{ id: question.id, asset_type: 'audio', storage_path: 'private' }] : [],
      photos: [], state: answer?.transcription_state === 'complete' ? 'ready' : 'missing_audio',
    };
  });

  return <div className="app-container min-h-[100dvh] bg-[#101729] text-white">
    <div className="mx-auto min-h-[100dvh] max-w-xl">
      <header className="px-7 pt-8 text-[0.8rem] tracking-[0.18em] text-white/60">縦糸＋横糸　／　{giftToken ? '贈られた3問' : '無料の3問'}</header>
      {screen === 'loading' && <p className="px-7 py-20">体験を確認しています…</p>}
      {screen === 'intro' && <main className="flex min-h-[75dvh] flex-col justify-center px-7 text-center">
        <p className="text-[0.8rem] tracking-widest text-white/55">本人確認・カード登録なし</p>
        <h1 className="mt-7 text-[1.5rem] leading-[1.7]">幼い頃を、<br />声でたどる三つの問い。</h1>
        <p className="mt-8 leading-[2] text-white/65">名前もメールも不要です。<br />この端末から10日間、再開できます。</p>
        {giftToken && <p className="mt-3 text-sm leading-loose text-white/55">語った内容は、あなたが選ばない限り<br />贈り主に共有されません。</p>}
        <button type="button" disabled={busy || !key} onClick={begin} className="mt-12 rounded-full px-7 py-5 disabled:opacity-50" style={{ background: '#e9e5d9', color: '#15243a' }}>{busy ? '準備しています…' : '3問を始める'}</button>
        {!giftToken && <a
          href="mailto:sugawara@saltlight.co.jp?subject=%E8%B3%BC%E5%85%A5%E5%BE%8C%E3%81%AE%E7%B6%9A%E3%81%8D%E3%81%8C%E8%A6%8B%E3%81%A4%E3%81%8B%E3%82%89%E3%81%AA%E3%81%84"
          className="mt-8 text-sm text-white/60 underline underline-offset-4"
        >購入済みで続きが見つからないとき</a>}
        {error && <p role="alert" className="mt-6 text-rose-200">{error}</p>}
      </main>}
      {screen === 'record' && <Scene_Recording key={questions[index].id} question={questions[index]}
        progress={`${index + 1} / 3`} userName="あなた" onBack={() => setScreen('intro')}
        onComplete={saveRecording} />}
      {screen === 'record' && developmentPreview && !giftToken && <div className="px-7 pb-8 text-center">
        <button type="button" disabled={busy} onClick={fillTestAnswers}
          className="text-xs text-white/50 underline disabled:opacity-40">
          {busy ? 'デモ音声を確認中…' : '開発用：公開デモ音声で3問を完了する'}
        </button>
        {error && <p role="alert" className="mt-3 text-sm text-rose-200">{error}</p>}
      </div>}
      {screen === 'saving' && <main className="px-7 py-28 text-center leading-loose">声を保存し、言葉にしています…<br /><span className="text-white/55">この画面を閉じずにお待ちください。</span></main>}
      {screen === 'save_error' && <main className="px-7 py-20 text-center">
        <h1 className="text-2xl">声は保存されています</h1>
        <p role="alert" className="mt-6 leading-loose text-rose-200">{error}</p>
        {canRetryTranscription && <button type="button" disabled={busy} onClick={() => { setBusy(true); setError(''); setScreen('saving'); uploadAndTranscribe(pendingBlob, uploadDone); }} className="btn-quiet mt-9 rounded-full bg-[#e9e5d9] px-7 py-4 text-[#15243a]">もう一度試す</button>}
        <p className="mt-9 text-sm leading-loose text-white/60">文字起こしがうまくいかないときは、<br />話した内容を入力して進めます。</p>
        <textarea value={transcript} onChange={event => setTranscript(event.target.value)} rows={5}
          placeholder="話したことをここに入力" aria-label="話した内容"
          className="mt-4 w-full rounded-2xl border border-white/25 bg-white/[0.06] p-4 text-white outline-none" />
        <button type="button" disabled={busy || !transcript.trim()} onClick={useWrittenWords}
          className="mt-4 w-full rounded-full border border-white/35 px-6 py-4 disabled:opacity-40">入力した文章で進む</button>
        <button type="button" onClick={() => setScreen('record')} className="mt-6 block w-full text-white/60 underline">録音し直す</button>
      </main>}
      {screen === 'review' && <main className="px-7 py-14">
        <p className="text-center text-white/55">{index + 1} / 3　語りを確認</p>
        <h1 className="mt-7 text-center text-[1.35rem] leading-[1.8]">{questions[index].content}</h1>
        <div className="mt-10 rounded-3xl border border-white/15 bg-white/[0.05] p-6">
          {editing ? <textarea value={transcript} onChange={event => setTranscript(event.target.value)} rows={8}
            className="w-full bg-transparent leading-loose outline-none" aria-label="語りの文章" />
            : <p className="whitespace-pre-wrap leading-[2]">{transcript || '声は保存されました。文字起こしが空の場合は文章を追加できます。'}</p>}
          {pendingAudioUrl && <audio className="mt-5 w-full" controls src={pendingAudioUrl} />}
        </div>
        <button type="button" onClick={() => setEditing(true)} className="mt-5 w-full text-sm text-white/60 underline">文章を直す</button>
        <button type="button" disabled={busy || (editing && !transcript.trim())} onClick={next} className="btn-quiet mt-9 w-full rounded-full bg-[#e9e5d9] px-7 py-4 text-[#15243a] disabled:opacity-50">{busy ? '保存しています…' : index === 2 ? '三つの問いを終える' : '次の問いへ'}</button>
        {error && <p role="alert" className="mt-5 text-rose-200">{error}</p>}
      </main>}
      {screen === 'finished' && <main className="px-7 py-24 text-center">
        <h1 className="text-[1.7rem] leading-[1.8]">三つの問いを、<br />語り終えました。</h1>
        <p className="mt-9 leading-loose text-white/65">この端末で期限まで語りを確認できます。</p>
        {!giftToken && <button type="button" disabled={busy} onClick={openConversion}
          className="mt-10 w-full rounded-full px-7 py-5 disabled:opacity-50"
          style={{ background: '#e9e5d9', color: '#15243a' }}>{busy ? '確認しています…' : 'この先を見てみる'}</button>}
        {giftToken && <p className="mt-9 text-sm leading-loose text-white/55">語りは贈り主へ自動で共有されません。</p>}
        {error && <p role="alert" className="mt-5 text-rose-200">{error}</p>}
      </main>}
      {screen === 'conversion' && <>{(developmentPreview || !purchasePreviewEnabled) &&
        <p className="px-7 pt-5 text-center text-xs text-amber-100/75">
          {developmentPreview ? 'テスト用決済の確認画面です' : '接続確認用プレビュー・この画面から決済されません'}
        </p>}
        <TrialCompletionExperience stories={stories} mode="self" quote={quote} fastFlow reviewOnly={!purchasePreviewEnabled}
          onEvent={({ name }) => {
            // Conversion events are best-effort hints, not proof of purchase or
            // LINE friendship. Never send the speaker's words in event data.
            void guestTrialRequest(TRIAL_API, 'event', {
              sessionToken: session.token, eventName: name,
            }).catch(() => {});
          }}
          resolveMedia={async asset => {
            const response = await guestTrialRequest(TRIAL_API, 'audio', {
              sessionToken: session.token, questionId: asset.id,
            });
            return response.url;
          }}
          onApplyDiscount={async code => {
            const response = await guestTrialRequest(TRIAL_API, 'quote', {
              sessionToken: session.token, discountCode: code,
            });
            return response.quote;
          }}
          onPurchase={async options => {
            if (!purchasePreviewEnabled) throw new Error('決済への接続はまだ検証中です。このプレビューから注文は作成しません。');
            const result = await guestCheckout(TRIAL_API, session.token, options);
            if (!result.url?.startsWith('https://checkout.stripe.com/'))
              throw new Error('安全な決済画面を確認できませんでした');
            window.location.assign(result.url);
          }}
          onFinish={() => setScreen('end')} /></>}
      {screen === 'payment_pending' && <main className="px-7 py-24 text-center">
        <h1 className="text-2xl">お支払いを確認しています</h1>
        <p className="mt-7 leading-loose text-white/65">確認後、この端末から本編へ進めます。<br />まだLINEでの本人確認は必要ありません。</p>
        <button type="button" disabled={busy} onClick={checkPayment}
          className="mt-10 w-full rounded-full bg-[#e9e5d9] px-7 py-4 text-[#15243a] disabled:opacity-50">{busy ? '確認中…' : 'お支払いを確認する'}</button>
        <button type="button" disabled={busy} onClick={openConversion}
          className="mt-8 w-full text-sm text-white/65 underline">申し込みを見直す</button>
        {error && <p role="alert" className="mt-5 text-rose-200">{error}</p>}
      </main>}
      {screen === 'payment_cancelled' && <main className="px-7 py-24 text-center">
        <h1 className="text-2xl">お支払いは、まだ完了していません</h1>
        <p className="mt-7 leading-loose text-white/65">今は決めずに終えても大丈夫です。<br />この端末から、また続きを見られます。</p>
        <button type="button" disabled={busy} onClick={checkPayment}
          className="mt-10 w-full rounded-full bg-[#e9e5d9] px-7 py-4 text-[#15243a] disabled:opacity-50">{busy ? '確認中…' : 'お支払いを確認する'}</button>
        <button type="button" disabled={busy} onClick={openConversion}
          className="mt-8 block w-full text-sm text-white/65 underline">もう一度、申し込みを見る</button>
        <button type="button" onClick={() => setScreen('end')}
          className="mt-8 block w-full text-sm text-white/65 underline">今日はここまで</button>
        {error && <p role="alert" className="mt-5 text-rose-200">{error}</p>}
      </main>}
      {screen === 'paid' && <main className="px-7 py-24 text-center">
        <h1 className="text-2xl">お支払いを確認しました</h1>
        <p className="mt-7 leading-loose text-white/65">ここから本編を始めます。<br />語りを守るため、LINEで本人確認します。</p>
        <button type="button" disabled={busy} onClick={beginLineHandoff}
          className="mt-10 w-full rounded-full bg-[#e9e5d9] px-7 py-4 text-[#15243a] disabled:opacity-50">{busy ? '準備中…' : 'LINEで続ける'}</button>
        {error && <p role="alert" className="mt-5 text-rose-200">{error}</p>}
      </main>}
      {screen === 'identity_name' && <main className="px-7 py-20 text-center">
        <h1 className="text-2xl">お名前を教えてください</h1>
        <p className="mt-5 text-sm text-white/60">本編の作品に使います。</p>
        <div className="mt-9 grid grid-cols-2 gap-3">
          <input aria-label="姓" placeholder="姓" autoComplete="family-name" value={familyName}
            onChange={event => setFamilyName(event.target.value)} className="min-w-0 rounded-xl border border-white/25 bg-white/10 p-4 text-white" />
          <input aria-label="名" placeholder="名" autoComplete="given-name" value={givenName}
            onChange={event => setGivenName(event.target.value)} className="min-w-0 rounded-xl border border-white/25 bg-white/10 p-4 text-white" />
        </div>
        <button type="button" disabled={busy} onClick={connectPaidStory}
          className="mt-9 w-full rounded-full bg-[#e9e5d9] px-7 py-4 text-[#15243a] disabled:opacity-50">{busy ? '作品につないでいます…' : '本編を始める準備へ'}</button>
        {error && <p role="alert" className="mt-5 text-rose-200">{error}</p>}
        {error && <a href="mailto:sugawara@saltlight.co.jp?subject=%E6%9C%AC%E7%B7%A8%E3%81%B8%E3%81%AE%E6%8E%A5%E7%B6%9A%E3%81%AE%E7%9B%B8%E8%AB%87"
          className="mt-6 block text-sm text-white/65 underline">解決しないときは相談する</a>}
      </main>}
      {screen === 'connected' && <main className="px-7 py-24 text-center">
        <h1 className="text-2xl">語りが作品につながりました</h1>
        <p className="mt-7 leading-loose text-white/65">次に、無料の3問を本編へ引き継ぐか選べます。</p>
        <a href="/?app=1" className="mt-10 block w-full rounded-full bg-[#e9e5d9] px-7 py-4 text-[#15243a]">本編へ進む</a>
      </main>}
      {screen === 'refunded' && <main className="px-7 py-24 text-center">
        <h1 className="text-2xl">お支払いは取り消されています</h1>
        <p className="mt-7 leading-loose text-white/65">作品への接続は行いません。</p>
      </main>}
      {screen === 'end' && <main className="px-7 py-28 text-center leading-loose">
        <h1 className="text-2xl">今日はここまで。</h1>
        <p className="mt-7 text-white/60">この端末では、期限まで語りを再び開けます。</p>
        <button type="button" className="mt-8 underline" onClick={() => setScreen('finished')}>語りに戻る</button>
      </main>}
    </div>
  </div>;
}
