import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Scene1_MyPage, Scene_Recording, ensureUserFoundation, ensureUserQuestions, supabaseClient } from './App.jsx';
import { CHILDHOOD_TRIAL_QUESTIONS } from './lib/childhoodTrial.js';
import TrialCompletionExperience, { StoryCard } from './TrialCompletionExperience.jsx';
import './guest-trial-finished.css';
import './guest-trial-navigation.css';
import { guestCheckout, guestPurchaseStatus, claimGuestPurchase } from './lib/guestPurchaseApi.js';
import { hasLineIdentity, linkLineToCurrentAccount, startLineSignIn } from './lib/lineAuth.js';
import {
  guestTrialRequest, guestTrialStorageKey,
  ensureGuestTrialStorage, readGuestTrialSession, storeGuestTrialSession,
  guestTrialResumeUrl, guestTrialCanonicalUrl, takeGuestTrialResumeToken,
} from './lib/guestTrialApi.js';
import { clearGuestTrialPending, guestTrialPurchaseUrl } from './lib/guestTrialClaim.js';

// The public entry remains on the established flow until the full purchase,
// recovery, and handoff gate passes. The API always follows this app's
// configured Supabase project; a production build must never call the test DB.
const TRIAL_API = supabaseClient.supabaseUrl.replace(/\/$/, '');
const developmentPreview = import.meta.env.DEV
  && import.meta.env.VITE_GUEST_TRIAL_PURCHASE_PREVIEW_ENABLED === 'true';
// The old pay-before-login proof of concept used the legacy product. Never
// expose it from the adopted pay-after-login route.
const purchasePreviewEnabled = false;
const giftToken = new URLSearchParams(window.location.search).get('gift_trial_token') || null;
const questions = CHILDHOOD_TRIAL_QUESTIONS.map((question, index) => ({
  ...question, question_id: question.id, onboarding_group: 'trial_experience',
  content: question.content, prompt_hint: question.hint,
  chapter_label: '幼い頃', theme_label: '幼い頃', theme_order: 1,
  sequence_order: index + 1,
}));

function GuestTrialPolishControls({ session, question, text, onUse, saveButton, disabled,
  reviewMode = false, originalText = '', onBlockedChange, children }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showStyles, setShowStyles] = useState(false);
  const [candidate, setCandidate] = useState(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState('clean');
  const latestText = useRef(text);
  latestText.current = text;
  useEffect(() => {
    if (candidate && text.trim() !== candidate.original) setCandidate(null);
  }, [text, candidate]);
  useEffect(() => {
    if (reviewMode) onBlockedChange?.(busy || Boolean(candidate));
  }, [reviewMode, onBlockedChange, busy, candidate]);

  const polish = async style => {
    setShowStyles(false);
    if (style === 'clean') {
      setSelectedStyle(style);
      if (reviewMode) onUse(originalText);
      return;
    }
    const source = text.trim();
    if (!source || busy) return;
    setBusy(true); setError('');
    try {
      const result = await guestTrialRequest(TRIAL_API, 'polish', {
        sessionToken: session.token, questionId: question.id,
        text: source, style,
      });
      if (latestText.current.trim() !== source) {
        setError('整形中に文章が変更されたため、古い候補は表示しませんでした。');
        return;
      }
      setSelectedStyle(style);
      setCandidate({ original: source, text: result.candidate });
      setShowOriginal(false);
    } catch (cause) {
      setError(cause?.message || '文章を整えられませんでした。元の文章は残っています。');
    } finally { setBusy(false); }
  };

  return <div className={`${reviewMode ? '' : 'mt-5'} space-y-3`}>
    {candidate ? <>
      <h3 className="text-lg">整えた文章を確認</h3>
      <div className="rounded-xl bg-[#f5f3ed] p-5 text-lg leading-loose whitespace-pre-wrap text-[#24302d]">{candidate.text}</div>
      <button type="button" onClick={() => setShowOriginal(value => !value)} className="min-h-11 text-white/70 underline">元の文章を{showOriginal ? '閉じる' : '確認する'}</button>
      {showOriginal && <div className="rounded-xl border border-white/20 p-5 leading-loose whitespace-pre-wrap">{candidate.original}</div>}
      <button type="button" onClick={() => { onUse(candidate.text); setCandidate(null); }} className="block min-h-14 w-full rounded-xl bg-white text-slate-900">この文章を使う</button>
      <button type="button" onClick={() => { setCandidate(null); setSelectedStyle('clean'); }} className="block min-h-14 w-full rounded-xl border border-white/30">元の文章に戻す</button>
      <p className="text-sm text-white/50">候補を選んだ後、保存すると反映されます。</p>
    </> : <>
      {(reviewMode || showStyles) && <div role="group" aria-label="文章の整え方" className="grid grid-cols-3 gap-2">
        {[["clean", "そのまま"], ["narrative", "語り調"], ["essay", "作品調"]].map(([value, label]) =>
          <button key={value} type="button" onClick={() => void polish(value)} disabled={busy || disabled}
            aria-pressed={reviewMode ? selectedStyle === value : undefined}
            className={`min-h-12 rounded-full border text-sm disabled:opacity-40 ${reviewMode && selectedStyle === value
              ? 'border-white/30 bg-white/15 text-white' : 'border-white/15 text-white/60'}`}>{label}</button>)}
      </div>}
      {children}
      {!reviewMode && <div className="grid grid-cols-[1fr_1.25fr] gap-2">
        <button type="button" onClick={() => setShowStyles(value => !value)} disabled={busy || disabled || !text.trim()}
          className="min-h-14 rounded-xl border border-white/30 disabled:opacity-40">✦ 整える</button>
        {saveButton(busy)}
      </div>}
    </>}
    {busy && <p role="status" className="text-sm text-white/60">文章を整えています…</p>}
    {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
  </div>;
}

export default function GuestTrialFlow() {
  const legacyHost = window.location.hostname === 'tateyoko-book.vercel.app';
  useEffect(() => {
    if (!legacyHost) return;
    (async () => {
      const storageKey = await guestTrialStorageKey(giftToken);
      const saved = readGuestTrialSession(localStorage, storageKey);
      window.location.replace(guestTrialCanonicalUrl(window.location, saved));
    })();
  }, [legacyHost]);
  if (legacyHost) return <p>無料の3問を準備しています…</p>;
  return <GuestTrialExperience />;
}

function GuestTrialExperience() {
  const [key, setKey] = useState(null);
  const [session, setSession] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [index, setIndex] = useState(0);
  const [screen, setScreen] = useState('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingBlob, setPendingBlob] = useState(null);
  const [pendingAudioUrl, setPendingAudioUrl] = useState('');
  const [audioPlaying, setAudioPlaying] = useState(false);
  const reviewAudioRef = useRef(null);
  const [uploadDone, setUploadDone] = useState(false);
  const [canRetryTranscription, setCanRetryTranscription] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [editing, setEditing] = useState(false);
  const [reviewBlocked, setReviewBlocked] = useState(false);
  const [quote, setQuote] = useState(null);
  const [familyName, setFamilyName] = useState('');
  const [givenName, setGivenName] = useState('');
  const [resumeUrl, setResumeUrl] = useState('');
  const [shareStatus, setShareStatus] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (!reviewBlocked) return;
    reviewAudioRef.current?.pause();
    setAudioPlaying(false);
  }, [reviewBlocked]);

  useEffect(() => {
    const openResume = () => {
      if (new URLSearchParams(window.location.hash.slice(1)).has('resume')) window.location.reload();
    };
    window.addEventListener('hashchange', openResume);
    return () => window.removeEventListener('hashchange', openResume);
  }, []);

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
      setScreen(next < 0 ? 'review' : savedAudio ? 'save_error' : 'choice');
      if (next < 0) setTranscript(rows.find(row => row.question_id === questions[2].id)?.transcript || '');
      return next < 0 ? 'review' : savedAudio ? 'save_error' : 'choice';
    }
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      const nextKey = await guestTrialStorageKey(giftToken);
      if (!live) return;
      setKey(nextKey);
      let saved = null;
      try {
        const resumeToken = takeGuestTrialResumeToken();
        if (resumeToken) {
          const state = await guestTrialRequest(TRIAL_API, 'status', { sessionToken: resumeToken });
          saved = storeGuestTrialSession(localStorage, nextKey, {
            sessionToken: resumeToken, expiresAt: state.expiresAt,
          });
        } else saved = readGuestTrialSession(localStorage, nextKey);
      }
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
      if (destination === 'choice') setScreen('theme_intro');
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
    setAudioPlaying(false);
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
      reviewAudioRef.current?.pause();
      setAudioPlaying(false);
      const savedText = answers.find(row => row.question_id === questions[index].id)?.transcript || '';
      if (editing || transcript.trim() !== savedText.trim()) {
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
        setTranscript(''); setScreen('choice');
      } else {
        await guestTrialRequest(TRIAL_API, 'complete', { sessionToken: session.token });
        setScreen('finished');
      }
    } catch (cause) { setError(cause.message || '進めませんでした'); }
    finally { setBusy(false); }
  }

  async function saveWrittenAnswer() {
    const words = transcript.trim();
    if (!words) { setError('文章を入力してください'); return; }
    setBusy(true); setError('');
    try {
      const saved = await guestTrialRequest(TRIAL_API, 'write', {
        sessionToken: session.token, questionId: questions[index].id, text: words,
      });
      setAnswers(previous => [...previous.filter(row => row.question_id !== questions[index].id), {
        question_id: questions[index].id, transcript: saved.transcript,
        transcription_state: 'complete', audio_path: null,
      }]);
      setTranscript(saved.transcript);
      setScreen('review');
    } catch (cause) { setError(cause.message || '文章を保存できませんでした'); }
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

  function openExit() {
    setError('');
    setShareStatus('');
    setConfirmDiscard(false);
    setScreen('end_choice');
  }

  function saveAndExit() {
    setResumeUrl(guestTrialResumeUrl(window.location, session));
    setScreen('end_saved');
  }

  async function shareResumeUrl() {
    try {
      if (navigator.share) await navigator.share({ title: '無料3問の再開', url: resumeUrl });
      else { await navigator.clipboard.writeText(resumeUrl); setShareStatus('再開URLをコピーしました'); }
    } catch (cause) {
      if (cause?.name !== 'AbortError') setShareStatus('共有できませんでした。下のURLをコピーしてください。');
    }
  }

  async function discardAndExit() {
    setBusy(true); setError('');
    try {
      const result = await guestTrialRequest(TRIAL_API, 'discard', { sessionToken: session.token });
      if (result.status !== 'discarded') throw new Error('削除を確認できませんでした');
      localStorage.removeItem(key);
      clearGuestTrialPending(localStorage);
      window.location.replace('/');
    } catch (cause) { setError(cause.message || '削除できませんでした。もう一度お試しください。'); }
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
      redirect.searchParams.set('guest_trial', '1');
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
      audio: answer?.audio_path ? [{ id: question.id, asset_type: 'audio', storage_path: 'private' }] : [],
      photos: [], state: answer?.transcription_state === 'complete' ? 'ready' : 'missing_audio',
    };
  });

  return <div className={`app-container guest-trial-flow min-h-[100dvh] ${screen === 'intro' ? 'bg-[#f5f3ed] text-[#182a35]' : 'bg-[#101729] text-white'}`} style={{ maxWidth: 'none', padding: 0 }}>
    <div className="min-h-[100dvh] w-full">
      {screen === 'loading' && <p className="px-7 py-20">体験を確認しています…</p>}
      {screen === 'intro' && <main className="mx-auto flex min-h-[100dvh] w-full max-w-[690px] flex-col justify-center px-[30px] text-center" style={{ paddingTop: 'calc(64px + env(safe-area-inset-top))', paddingBottom: 'calc(64px + env(safe-area-inset-bottom))' }}>
        <p className="text-[clamp(16px,4.2vw,22px)] tracking-[0.09em] text-[#28473e]" style={{ fontFamily: 'var(--font-display)' }}>縦糸横糸 ｜ 年輪 nenrin</p>
        <h1 className="mt-[58px] text-[clamp(29px,7.1vw,43px)] font-medium leading-[1.75] tracking-[0.035em] sm:mt-[70px]" style={{ fontFamily: 'var(--font-display)' }}>質問を通じて<br />人生を振り返り、<br />言葉にする。</h1>
        <p className="mt-6 text-[clamp(18px,4.7vw,23px)] leading-[1.85] text-[#455650]">その体験をお試しいただけます。</p>
        <ul className="mx-auto mt-[46px] w-full max-w-[560px] space-y-5 text-left text-[clamp(16px,4.1vw,20px)] leading-[1.9] text-[#455650] sm:mt-[58px]">
          <li className="flex gap-3"><span aria-hidden="true">・</span><span>お名前や連絡先の登録は不要です。</span></li>
          <li className="flex gap-3"><span aria-hidden="true">・</span><span>この語りは、本編をご購入の際に<br />引き継ぐこともできます。</span></li>
        </ul>
        {giftToken && <p className="mt-5 text-sm leading-loose text-[#5b685f]">語った内容は、あなたが選ばない限り<br />贈り主に共有されません。</p>}
        <button type="button" disabled={busy || !key} onClick={begin} className="mx-auto mt-[60px] min-h-[72px] w-full max-w-[560px] rounded-full bg-[#28473e] px-7 py-5 text-[clamp(18px,4.7vw,22px)] text-[#f5f3ed] disabled:opacity-50 sm:mt-[76px]">{busy ? '準備しています…' : '「お試し３問」を始める'}</button>
        {error && <p role="alert" className="mt-6 text-[#a6472d]">{error}</p>}
      </main>}
      {screen === 'theme_intro' && <main className="mx-auto flex min-h-[100dvh] w-full max-w-[580px] flex-col px-6 text-center" style={{ paddingTop: 'calc(28px + env(safe-area-inset-top))', paddingBottom: 'calc(48px + env(safe-area-inset-bottom))' }}>
        <div className="flex min-h-12 items-center justify-between text-base text-white/80">
          <button type="button" onClick={() => setScreen('intro')}>← 戻る</button>
          <span className="text-sm">お試し３問</span>
        </div>
        <div className="pt-10 sm:pt-12">
          <p className="text-[13px] tracking-[0.13em] text-[#d9c9a5]">テーマ</p>
          <h1 className="mt-[22px] text-[clamp(29px,7vw,39px)] font-normal leading-[1.6] tracking-[0.04em]" style={{ fontFamily: 'var(--font-display)' }}>「幼い頃のこと」</h1>
        </div>
        <img src="/site/theme-childhood-triptych.jpg" alt="幼い頃を思い出す三つの情景"
          className="mt-[39px] h-[clamp(210px,62vw,315px)] w-[calc(100%+48px)] max-w-none -translate-x-6 object-cover sm:w-full sm:translate-x-0 sm:rounded-3xl" />
        <p className="mx-auto mt-[35px] max-w-[470px] text-[clamp(16px,4.2vw,19px)] leading-[2] text-[#d5dae2]">本編では、<br />様々なテーマの質問に触れながら、<br />人生を辿っていきます。</p>
        <p className="mx-auto mt-[30px] max-w-[470px] text-[clamp(17px,4.3vw,20px)] leading-[2] text-[#e0e2e5]">幼少期から中学生くらいまでを<br />少しずつ、思い出してみてください。</p>
        <div className="min-h-8 flex-1" />
        <button type="button" onClick={() => setScreen('choice')} className="mt-[52px] min-h-[65px] w-full rounded-full bg-[#e9e6dd] px-6 text-lg font-medium text-[#172539]">1問目へ進む</button>
        <p className="mt-[15px] text-[13px] text-[#9fa8b7]">この後、声または文字で答えられます。</p>
      </main>}
      {screen === 'choice' && <Scene1_MyPage
        question={questions[index]} userName="あなた"
        progress={{ currentIndex: index, total: 3 }}
        onBack={() => setScreen(index === 0 ? 'theme_intro' : 'intro')}
        onNext={() => setScreen('record')}
        onWrite={() => { setTranscript(''); setScreen('write'); }}
        onEndToday={openExit}
      />}
      {screen === 'write' && <main className="guest-trial-question-screen">
        <header className="guest-trial-question-nav">
          <button type="button" onClick={() => setScreen('choice')} className="min-h-11 text-white/65">← 戻る</button>
          <p className="flex min-h-11 shrink-0 items-center text-[1rem] text-white/75">{index + 1} / 3</p>
        </header>
        <h1 className="mt-8 text-center text-[1.35rem] leading-[1.8]">{questions[index].content}</h1>
        <label htmlFor="guest-trial-writing" className="mt-10 block text-white/80">書いて答える</label>
        <textarea id="guest-trial-writing" value={transcript} onChange={event => setTranscript(event.target.value)} rows={9}
          placeholder="思い出したことを、自由に書いてください" maxLength={100000}
          className="mt-4 w-full rounded-2xl border border-white/25 bg-white/[0.06] p-4 text-white outline-none" />
        <GuestTrialPolishControls key={questions[index].id} session={session} question={questions[index]}
          text={transcript} onUse={setTranscript} disabled={busy}
          saveButton={polishing => <button type="button" disabled={busy || polishing || !transcript.trim()} onClick={saveWrittenAnswer}
            className="min-h-14 rounded-xl bg-white text-slate-900 disabled:opacity-40">{busy ? '保存中…' : '保存する'}</button>} />
        {error && <p role="alert" className="mt-5 text-rose-200">{error}</p>}
      </main>}
      {screen === 'record' && <Scene_Recording key={questions[index].id} question={questions[index]}
        storyProgress={{ currentIndex: index, total: 3 }} userName="あなた" onBack={() => setScreen('choice')}
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
      {screen === 'review' && <main className="guest-trial-question-screen">
        <header className="guest-trial-question-nav">
          <button type="button" onClick={() => setScreen(pendingAudioUrl ? 'record' : 'write')} className="min-h-11 text-white/65">← 戻る</button>
          <p className="flex min-h-11 shrink-0 items-center text-[1rem] text-white/75">{index + 1} / 3</p>
        </header>
        <h1 className="mt-8 text-center text-[1.35rem] leading-[1.8]">{questions[index].content}</h1>
        <div className="mt-10 rounded-3xl border border-white/15 bg-white/[0.05] p-6">
          <GuestTrialPolishControls key={questions[index].id} session={session} question={questions[index]}
            text={transcript} originalText={answers.find(row => row.question_id === questions[index].id)?.transcript || ''}
            onUse={setTranscript} onBlockedChange={setReviewBlocked} disabled={busy || editing || !transcript.trim()} reviewMode>
            {editing ? <textarea value={transcript} onChange={event => setTranscript(event.target.value)} rows={8}
              className="mt-5 w-full bg-transparent leading-loose outline-none" aria-label="語りの文章" />
              : <p className="mt-5 whitespace-pre-wrap leading-[2]">{transcript || '声は保存されました。文字起こしが空の場合は文章を追加できます。'}</p>}
            <div className="mt-4 flex items-center justify-between gap-3">
              {pendingAudioUrl && <>
                <audio ref={reviewAudioRef} className="hidden" src={pendingAudioUrl} onEnded={() => setAudioPlaying(false)} />
                <button type="button" onClick={async () => {
                  const audio = reviewAudioRef.current;
                  if (!audio) return;
                  if (!audio.paused) { audio.pause(); setAudioPlaying(false); return; }
                  try { await audio.play(); setAudioPlaying(true); }
                  catch { setError('録音を再生できませんでした'); }
                }} aria-label={audioPlaying ? '録音の再生を止める' : '録音を再生する'}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/20 text-white/70">
                  {audioPlaying ? 'Ⅱ' : '▶'}
                </button>
              </>}
              {!editing && <button type="button" onClick={() => setEditing(true)} aria-label="本文を修正する"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/20 text-white/70">✎</button>}
            </div>
          </GuestTrialPolishControls>
        </div>
        {editing && <button type="button" onClick={() => {
          setTranscript(answers.find(row => row.question_id === questions[index].id)?.transcript || '');
          setEditing(false);
        }} className="mt-5 w-full text-sm text-white/60 underline">編集をやめる</button>}
        <button type="button" disabled={busy || reviewBlocked || (editing && !transcript.trim())} onClick={next} className="btn-quiet mt-9 w-full rounded-full bg-[#e9e5d9] px-7 py-4 text-[#15243a] disabled:opacity-50">{busy ? '保存しています…' : index === 2 ? '三つの問いを終える' : '次の問いへ'}</button>
        {error && <p role="alert" className="mt-5 text-rose-200">{error}</p>}
      </main>}
      {screen === 'finished' && <main className="guest-trial-finished">
        <h1>3問の体験が完了しました</h1>
        <div className="guest-trial-finished-answers">{stories.map((story, storyIndex) => <StoryCard key={story.id} story={story} index={storyIndex}
          resolveMedia={async asset => {
            const response = await guestTrialRequest(TRIAL_API, 'audio', { sessionToken: session.token, questionId: asset.id });
            return response.url;
          }} />)}</div>
        {!giftToken && <section className="guest-trial-reflection" aria-labelledby="guest-trial-reflection-title">
          <p className="guest-trial-theme">テーマ「幼い頃のこと」</p>
          <h2 id="guest-trial-reflection-title">3問だけでしたが、<br />いかがでしたか？</h2>
          <p className="guest-trial-lead">少し懐かしい記憶が、<br />開いたでしょうか。</p>
          <p className="guest-trial-copy">
            <span>本編では、語りやすい問いから始まり、</span>
            <span>大切な人のこと、苦しかった時のこと、</span>
            <span>大事にしてきたこと、</span>
            <span>そしてこれからのことまで。</span>
            <span className="guest-trial-copy-gap">様々なテーマを、少しずつ辿っていきます。</span>
          </p>
          <img className="guest-trial-reflection-image" src="/site/guest-trial-album-import-20261107.jpg"
            alt="アルバムの写真をスマホで取り込み、思い出とともにブックへ残すイメージ" />
          <p className="guest-trial-copy guest-trial-image-caption">
            <span>懐かしいアルバム、スマホで撮った写真、</span>
            <span>簡単に取り込むことができます。</span>
            <span className="guest-trial-copy-gap">大量に、ではなく、選ぶ。</span>
            <span>それも縦糸横糸の体験です。</span>
          </p>
        </section>}
        {!giftToken && <button type="button" onClick={() => setScreen('service')}
          className="guest-trial-finished-primary">縦糸横糸について詳しく見る</button>}
        {!giftToken && <button type="button" onClick={openExit}
          className="guest-trial-finished-secondary">ここで終了する</button>}
        {giftToken && <p className="mt-9 text-sm leading-loose text-white/55">語りは贈り主へ自動で共有されません。</p>}
        {error && <p role="alert" className="mt-5 text-rose-200">{error}</p>}
      </main>}
      {screen === 'service' && <main className="px-7 py-14">
        <button type="button" onClick={() => setScreen('finished')} className="text-white/70">← 語りに戻る</button>
        <h1 className="mt-8 text-2xl leading-relaxed">縦糸横糸ブックについて</h1>
        <p className="mt-6 leading-loose text-white/75">問いに答えながら人生をたどり、声と文章、写真を一冊のブックとWebブックに残せます。</p>
        <img src="/site/hp-renewal/book-and-webbook-approved.png" alt="縦糸横糸ブックとWebブック" className="mt-8 w-full rounded-2xl" />
        <p className="mt-8 leading-loose text-white/75">商品と金額は購入画面で確認できます。無料3問の語りは購入手続き中も保持され、新規購入が確定した物語に引き継ぎます。</p>
        <a href={guestTrialPurchaseUrl()} className="mt-10 block w-full rounded-full bg-[#e9e5d9] px-7 py-5 text-center text-[#15243a]">商品を選んで購入へ進む</a>
        <button type="button" onClick={openExit} className="mt-5 w-full rounded-full border border-white/35 px-7 py-5">ここで終了する</button>
      </main>}
      {screen === 'end_choice' && <main className="px-7 py-20 text-center">
        <h1 className="text-2xl">ここで終了する</h1>
        <p className="mt-6 leading-loose text-white/65">無料3問の開始から10日間、再開できます。</p>
        <button type="button" onClick={saveAndExit} className="mt-10 w-full rounded-full bg-[#e9e5d9] px-7 py-5 text-[#15243a]">10日間保存する</button>
        <button type="button" onClick={() => { setError(''); setConfirmDiscard(true); }} className="mt-5 w-full rounded-full border border-white/35 px-7 py-5">保存せずに終了する</button>
        <button type="button" onClick={() => setScreen('finished')} className="mt-8 text-sm text-white/65 underline">語りに戻る</button>
        {confirmDiscard && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
          <div role="alertdialog" aria-modal="true" aria-labelledby="guest-trial-discard-prompt" className="w-full max-w-sm rounded-3xl border border-white/25 bg-[#1d2536] px-6 py-8 shadow-2xl">
            <p id="guest-trial-discard-prompt" className="text-lg leading-loose">先ほどの語りが消えますが<br />よろしいですか？</p>
            <div className="mt-8 flex gap-3">
              <button type="button" disabled={busy} onClick={() => { setConfirmDiscard(false); setError(''); }} className="min-h-14 flex-1 rounded-full border border-white/40 disabled:opacity-50">戻る</button>
              <button type="button" disabled={busy} onClick={discardAndExit} className="min-h-14 flex-1 rounded-full bg-[#e9e5d9] text-[#15243a] disabled:opacity-50">{busy ? '削除中…' : 'OK'}</button>
            </div>
            {error && <p role="alert" className="mt-5 text-sm text-rose-200">{error}</p>}
          </div>
        </div>}
      </main>}
      {screen === 'end_saved' && <main className="px-7 py-20 text-center">
        <h1 className="text-2xl">再開URLを保存してください</h1>
        <p className="mt-6 leading-loose text-white/65">有効期限は無料3問の開始から10日間です。URLを知っている人は語りを見られるため、他の人へ送らないでください。</p>
        <button type="button" onClick={shareResumeUrl} className="mt-9 w-full rounded-full bg-[#e9e5d9] px-7 py-5 text-[#15243a]">共有・コピーする</button>
        <input readOnly aria-label="再開URL" value={resumeUrl} onFocus={event => event.target.select()} className="mt-5 w-full rounded-xl border border-white/20 bg-white/5 p-3 text-xs" />
        {shareStatus && <p role="status" className="mt-4 text-sm">{shareStatus}</p>}
        <button type="button" onClick={() => setScreen('finished')} className="mt-8 text-sm underline">語りに戻る</button>
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
          onFinish={openExit} /></>}
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
        <button type="button" className="mt-8 underline" onClick={() => { void refresh(session).catch(() => setError('続きを確認できませんでした。もう一度お試しください。')); }}>語りに戻る</button>
      </main>}
    </div>
  </div>;
}
