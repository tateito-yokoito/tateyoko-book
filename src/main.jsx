import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import App, { Scene_BookBuilder, Scene_Login, Scene_SupporterInviteReceived, supabaseClient as adminSupabaseClient } from "./App.jsx";
import { SupporterSmsEntry } from './SupporterSms.jsx';
import LandingPage from "./LandingPage.jsx";
import CommerceV2Purchase from './CommerceV2Purchase.jsx';
import { commercePurchaseReviewRequested, readCommercePurchaseIntent, saveCommercePurchaseIntent } from './lib/commercePurchaseIntent.js';
import { createPurchaseHandoff, purchaseHandoffToken, restorePurchaseHandoff, savePendingGuestHandoff } from './lib/commercePurchaseHandoff.js';
import { canonicalPurchaseUrl } from './lib/canonicalPurchaseUrl.js';
import GiftThreeQuestionsPage from "./gift-three-questions.jsx";
import VoiceLibraryPage from "./VoiceLibraryPage.jsx";
import PublishedWebBook from "./PublishedWebBook.jsx";
import { ThemeMemoryRequestRecipient } from "./ThemeMemoryRequestFlow.jsx";
import StoryRequestRecipient from "./StoryRequestRecipient.jsx";
import "./index.css";
import FamilyConnectionTest from './FamilyConnectionTest.jsx';
import FamilyRecordingFlow from './FamilyRecordingFlow.jsx';
import FamilySharedStories from './FamilySharedStories.jsx';
import FamilyPhotoUpload from './FamilyPhotoUpload.jsx';
import FamilyPrivacySettings from './FamilyPrivacySettings.jsx';
import FamilyStartingFlow from './FamilyStartingFlow.jsx';
import FamilyPhotoStoryFlow from './FamilyPhotoStoryFlow.jsx';
import FamilySubjectStories from './FamilySubjectStories.jsx';
import FamilyThemeFlow from './FamilyThemeFlow.jsx';
import FamilyDeliverySettings from './FamilyDeliverySettings.jsx';

const AdminReview = import.meta.env.VITE_PUBLIC_TEST_MODE === 'true'
  ? null : React.lazy(() => import('./admin/AdminReview.jsx'));
const guestTrialEnabled = import.meta.env.VITE_GUEST_TRIAL_ENABLED === 'true';
const GuestTrialFlow = guestTrialEnabled ? React.lazy(() => import('./GuestTrialFlow.jsx')) : null;

function shouldOpenApplication() {
  const params = new URLSearchParams(window.location.search);
  const applicationParameters = [
    "app",
    "entry",
    "family",
    "family_connect",
    "gift_three",
    "beta",
    "dev",
    "token",
    "supporter_invite",
    "sharing_invite",
    "family_invite",
    "family_invite_checkout",
    "sequence"
  ];

  return applicationParameters.some(key => params.has(key));
}

function PurchaseHandoffGate({ token }) {
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const restoring = useRef(false);
  const restore = async () => {
    if (restoring.current) return;
    restoring.current = true;
    try {
      const { data, error: sessionError } = await adminSupabaseClient.auth.getSession();
      if (sessionError) throw sessionError;
      if (!data?.session?.access_token) {
        restoring.current = false;
        setState('login');
        return;
      }
      setState('loading');
      const handoff = await restorePurchaseHandoff(adminSupabaseClient, token, data.session.access_token);
      saveCommercePurchaseIntent(window.localStorage, handoff.selection);
      if (handoff.hasGuestTrial) savePendingGuestHandoff(window.localStorage, token);
      const url = new URL(window.location.href);
      url.searchParams.delete('purchase_handoff');
      if (!handoff.hasGuestTrial) url.searchParams.delete('guest_trial_claim');
      window.location.replace(url.toString());
    } catch (cause) {
      setError(cause?.message || '購入手続きを引き継げませんでした');
      setState('error');
      restoring.current = false;
    }
  };
  useEffect(() => {
    void restore();
    const { data } = adminSupabaseClient.auth.onAuthStateChange((event, session) => {
      if (session && state === 'login') window.setTimeout(() => { void restore(); }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, [token, state]);
  if (state === 'login') return <Scene_Login onLogin={() => { void restore(); }} />;
  if (state === 'error') return <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-7 text-center text-white">
    <h1 className="text-2xl">購入内容を引き継げませんでした</h1>
    <p role="alert" className="mt-6 leading-7">{error}</p>
    <p className="mt-5 text-sm leading-7 text-white/70">無料3問の回答は保存期限内であれば再開URLから開けます。商品選択から手続きをやり直してください。</p>
  </main>;
  return <main className="flex min-h-screen items-center justify-center text-white">購入内容を確認しています…</main>;
}

function RootScreen() {
  const params = new URLSearchParams(window.location.search);
  const canonicalUrl = canonicalPurchaseUrl(window.location);
  if (canonicalUrl) return <CanonicalPurchaseRedirect url={canonicalUrl} />;
  const purchaseIntent = params.get('entry') === 'purchase'
    ? readCommercePurchaseIntent(window.localStorage) : null;

  if (GuestTrialFlow && params.has('guest_trial')) {
    return <React.Suspense fallback={<p>体験を準備しています…</p>}><GuestTrialFlow /></React.Suspense>;
  }

  const handoffToken = purchaseHandoffToken(params.toString());
  if (import.meta.env.VITE_COMMERCE_V2_ENABLED === 'true'
    && params.get('entry') === 'purchase' && commercePurchaseReviewRequested()
    && !params.has('checkout') && handoffToken)
    return <PurchaseHandoffGate token={handoffToken} />;

  if (import.meta.env.VITE_COMMERCE_V2_ENABLED === 'true'
    && params.get('entry') === 'purchase' && commercePurchaseReviewRequested()
    && !params.has('checkout') && !purchaseIntent) {
    return <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-7 py-16 text-center text-white">
      <h1 className="text-2xl leading-relaxed">購入内容を引き継げませんでした</h1>
      <p className="mt-7 leading-8 text-white/75">メールのURLが別のタブで開いた場合は、元の認証画面に戻り、メールに記載された数字を入力してください。無料3問の語りも元のタブに残っています。</p>
      <p className="mt-5 text-sm leading-7 text-white/60">元のタブがない場合は、無料3問の再開URLから開き直してください。</p>
    </main>;
  }

  if (import.meta.env.VITE_COMMERCE_V2_ENABLED === 'true'
    && params.get('entry') === 'purchase' && !params.has('checkout')
    && !params.has('consultation') && !params.has('family_invite')
    && !params.has('gift') && params.get('purchase_for') !== 'family_trial_package'
    && !commercePurchaseReviewRequested()) {
    return <CommerceV2Purchase phase="selection" client={adminSupabaseClient}
      initialOrderType={params.get('purchase_for') === 'gift' ? 'gift' : 'self'}
      initialSelection={purchaseIntent}
      onProceed={async selection => {
        const handoffToken = await createPurchaseHandoff(adminSupabaseClient, selection,
          params.get('guest_trial_claim') === '1');
        saveCommercePurchaseIntent(window.localStorage, selection);
        const url = new URL(window.location.href);
        url.searchParams.set('app', '1');
        if (selection.purchaseFor === 'gift') url.searchParams.set('purchase_for', 'gift');
        else url.searchParams.delete('purchase_for');
        url.searchParams.set('purchase_review', '1');
        url.searchParams.set('purchase_handoff', handoffToken);
        window.location.assign(url.toString());
      }} />;
  }

  if (window.location.pathname === '/gift-three-questions.html' || /^\/g\/[^/]+\/?$/.test(window.location.pathname)) {
    return <GiftThreeQuestionsPage />;
  }

  if (params.has('supporter_sms')) return <SupporterSmsEntry client={adminSupabaseClient} inviteId={params.get('supporter_sms')} renderInvitation={props=><Scene_SupporterInviteReceived {...props} />} />;

  if (import.meta.env.VITE_FAMILY_CONNECTION_TEST === 'true' && shouldOpenApplication()) {
    return <FamilyTestGate params={params} />;
  }

  if (params.has("memory_request")) {
    if (params.has("request_token")) return <StoryRequestRecipient
      client={adminSupabaseClient}
      requestId={params.get("memory_request") || ""}
      requestToken={params.get("request_token") || ""}
    />;
    return (
      <ThemeMemoryRequestRecipient
        supabaseClient={adminSupabaseClient}
        requestId={params.get("memory_request") || ""}
      />
    );
  }

  if (params.has("voice")) {
    return (
      <PublishedWebBook
        supabaseClient={adminSupabaseClient}
        publicId={params.get("voice") || ""}
      />
    );
  }

  if (params.has("library")) {
    return <VoiceLibraryPage supabaseClient={adminSupabaseClient} />;
  }

  if (params.has("admin")) {
    if (!AdminReview) return <p>この確認用サイトではご利用いただけません。</p>;
    return <React.Suspense fallback={null}><AdminReview supabaseClient={adminSupabaseClient} /></React.Suspense>;
  }

  return shouldOpenApplication() ? <App /> : <LandingPage />;
}

function CanonicalPurchaseRedirect({ url }) {
  useEffect(() => { window.location.replace(url); }, [url]);
  return <main className="flex min-h-screen items-center justify-center text-white">購入画面を開いています…</main>;
}

function FamilyTestGate({params}) {
  const [ready, setReady] = React.useState(false);
  const [phoneAccount, setPhoneAccount] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    adminSupabaseClient.auth.getSession().then(({data}) => {
      if (!live) return;
      setPhoneAccount(Boolean(data?.session?.user?.phone)); setReady(true);
    }).catch(()=>{if(live)setReady(true);});
    const {data}=adminSupabaseClient.auth.onAuthStateChange((_event,session)=>{if(live)setPhoneAccount(Boolean(session?.user?.phone));});
    return () => {live=false;data.subscription.unsubscribe();};
  }, []);
  if (!ready) return <p>準備しています…</p>;
  // Phone-only subjects must never enter the legacy auto-create Person path.
  if (phoneAccount || params.has('family_connect') || params.has('family')) return <FamilyConnectionTest
    client={adminSupabaseClient}
    onOwnStory={phoneAccount ? undefined : ()=>location.assign('/?app=1')}
    renderBook={props=><FamilyBookFlow {...props} client={adminSupabaseClient}/>}
    renderRecording={({key,...props})=><FamilyRecordingFlow key={key} {...props}/>}
    renderSharedStories={({workspace,api,onBack})=><FamilySharedStories key={workspace.project_id} api={api} projectId={workspace.project_id} onBack={onBack}/>}
    renderSubjectStories={props=><FamilySubjectStories key={`${props.session.user.id}:${props.workspace.project_id}`} {...props}/>}
    renderSupporterPhoto={({workspace,api,onBack})=><FamilyPhotoUpload key={workspace.project_id} api={api} projectId={workspace.project_id} onBack={onBack}/>}
    renderPrivacy={props=><FamilyPrivacySettings {...props}/>}
    renderStarting={props=><FamilyStartingFlow key={props.workspace.project_id} {...props}/>}
    renderSubjectPhoto={props=><FamilyPhotoStoryFlow key={props.workspace.project_id} {...props}/>}
    renderTheme={props=><FamilyThemeFlow key={props.workspace.project_id} {...props}/>}
    renderDelivery={props=><FamilyDeliverySettings key={props.workspace.project_id} {...props}/>}
  />;
  return <><nav style={{background:'#101c2c',padding:12,color:'#eee',textAlign:'center'}} aria-label="物語を切り替える"><a href="/?app=1&family=1">わたしの物語 ／ 支えている物語　〉</a></nav><App /></>;
}

if (import.meta.env.VITE_FAMILY_CONNECTION_TEST === 'true' && 'serviceWorker' in navigator) {
  window.addEventListener('load',()=>navigator.serviceWorker.register('/pwa-sw.js').catch(()=>{}));
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {import.meta.env.VITE_PUBLIC_TEST_MODE === 'true' && <aside style={{background:'#fff4ce',color:'#342f22',padding:'8px 12px',fontSize:12,textAlign:'center'}}>
      TEST専用・本番の記録には接続しません　<a href="/?app=1&family=1" style={{textDecoration:'underline'}}>母娘接続の確認</a>
    </aside>}
    <RootScreen />
  </React.StrictMode>
);
import FamilyBookFlow from './FamilyBookFlow.jsx';
