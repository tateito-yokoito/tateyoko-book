import React from "react";
import { createRoot } from "react-dom/client";
import App, { supabaseClient as adminSupabaseClient } from "./App.jsx";
import LandingPage from "./LandingPage.jsx";
import VoiceLibraryPage from "./VoiceLibraryPage.jsx";
import VoicePlaybackPage from "./VoicePlaybackPage.jsx";
import { ThemeMemoryRequestRecipient } from "./ThemeMemoryRequestFlow.jsx";
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
import {familyRollout} from './lib/familyRollout.js';
const familyRelease=familyRollout(import.meta.env);

const AdminReview = import.meta.env.VITE_PUBLIC_TEST_MODE === 'true'
  ? null : React.lazy(() => import('./admin/AdminReview.jsx'));

function shouldOpenApplication() {
  const params = new URLSearchParams(window.location.search);
  const applicationParameters = [
    "app",
    "entry",
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

function RootScreen() {
  const params = new URLSearchParams(window.location.search);


  if (familyRelease.enabled && shouldOpenApplication()) {
    if(params.has('family_connect')&&!familyRelease.subjectConnection)return <p>ご本人のスマホ接続は、現在ご案内していません。</p>;
    return <FamilyTestGate params={params} />;
  }

  if (params.has("memory_request")) {
    return (
      <ThemeMemoryRequestRecipient
        supabaseClient={adminSupabaseClient}
        requestId={params.get("memory_request") || ""}
      />
    );
  }

  if (params.has("voice")) {
    return (
      <VoicePlaybackPage
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

function FamilyTestGate({params}) {
  const [ready, setReady] = React.useState(false);
  const [phoneAccount, setPhoneAccount] = React.useState(false);
  const [existingSubject, setExistingSubject] = React.useState(false);
  const [routeError, setRouteError] = React.useState(false);
  React.useEffect(() => {
    let live = true, revision = 0;
    const resolve = async session => {
      const ticket=++revision;
      if(!live)return;
      setReady(false);setRouteError(false);
      const phone=Boolean(session?.user?.phone);
      let bound=false;
      // An already verified email subject can be adopted without the C/SMS
      // flow. Do not let legacy bootstrap create/rewrite their existing story.
      if(session?.user && !phone && !params.has('family') && !params.has('family_connect')) {
        const {data,error}=await adminSupabaseClient.from('family_subject_bindings')
          .select('person_id').eq('subject_user_id',session.user.id).maybeSingle();
        if(!live||ticket!==revision)return;
        if(error){setRouteError(true);setReady(true);return;}
        bound=Boolean(data);
      }
      if(!live||ticket!==revision)return;
      setPhoneAccount(phone);setExistingSubject(bound);setReady(true);
    };
    adminSupabaseClient.auth.getSession().then(({data})=>resolve(data?.session))
      .catch(()=>{if(live){setRouteError(true);setReady(true);}});
    // No awaited Supabase request inside the Auth callback/lock.
    const {data}=adminSupabaseClient.auth.onAuthStateChange((event,session)=>{
      if(event!=='TOKEN_REFRESHED')setTimeout(()=>{if(live)resolve(session);},0);
    });
    return () => {live=false;data.subscription.unsubscribe();};
  }, []);
  if (!ready) return <p>準備しています…</p>;
  if (routeError) return <p role="alert">物語の接続を確認できませんでした。<button onClick={()=>location.reload()}>もう一度確認する</button></p>;
  // Phone-only subjects must never enter the legacy auto-create Person path.
  if (phoneAccount || existingSubject || params.has('family_connect') || params.has('family')) return <FamilyConnectionTest
    client={adminSupabaseClient}
    onOwnStory={phoneAccount || existingSubject ? undefined : ()=>location.assign('/?app=1')}
    renderBook={props=><FamilyBookFlow {...props} client={adminSupabaseClient}/>}
    renderRecording={({key,...props})=><FamilyRecordingFlow key={key} {...props}/>}
    renderSharedStories={({workspace,api,onBack})=><FamilySharedStories key={workspace.project_id} api={api} projectId={workspace.project_id} onBack={onBack}/>}
    renderSubjectStories={props=><FamilySubjectStories key={`${props.session.user.id}:${props.workspace.project_id}`} {...props}/>}
    renderSupporterPhoto={({workspace,api,onBack})=><FamilyPhotoUpload key={workspace.project_id} api={api} projectId={workspace.project_id} onBack={onBack}/>}
    renderPrivacy={props=><FamilyPrivacySettings {...props}/>}
    renderStarting={props=><FamilyStartingFlow key={props.workspace.project_id} {...props}/>}
    renderSubjectPhoto={props=><FamilyPhotoStoryFlow key={props.workspace.project_id} {...props}/>}
    renderTheme={props=><FamilyThemeFlow key={props.workspace.project_id} {...props}/>}
    renderDelivery={familyRelease.delivery ? props=><FamilyDeliverySettings key={props.workspace.project_id} {...props}/> : undefined}
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
