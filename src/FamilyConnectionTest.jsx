import React, {useEffect, useMemo, useRef, useState} from 'react';
import FamilyProductionSupporters from './FamilyProductionSupporters.jsx';
import {createFamilyApi, familyInvitationUrl, japaneseMobile, canProduce} from './lib/familyConnection.js';
import {familyAuthFeedback} from './lib/familyAuthFeedback.js';
import {familyRollout} from './lib/familyRollout.js';
import './family-connection-test.css';
import HomePage from './home/HomePage.jsx';
import HomeInstall, {installWasShown} from './home/HomeInstall.jsx';
import {familyJourney} from './home/familyHomeModel.js';
import {BOOK_MILESTONES_ENABLED} from './lib/bookMilestones.js';
import {JourneyClosing} from './BookMilestoneFlow.jsx';
import {firstStoryGuideState, finishFirstStoryGuide, firstStoryDestination} from './home/firstStoryGuide.js';

// Person-bound adapter. Do not mount App's legacy Person bootstrap here.
export default function FamilyConnectionTest({client, onOwnStory, renderBook, renderRecording, renderSharedStories, renderSubjectStories, renderSupporterPhoto, renderPrivacy, renderStarting, renderSubjectPhoto, renderTheme, renderDelivery, fixtureUpload = false}) {
  const release=familyRollout(import.meta.env);
  const api = useMemo(() => createFamilyApi(client), [client]);
  const [session, setSession] = useState(undefined);
  const [list, setList] = useState([]), [workspace, setWorkspace] = useState(null);
  const [phone, setPhone] = useState(''), [code, setCode] = useState('');
  const [sent, setSent] = useState(false), [consent, setConsent] = useState(false);
  const [entry, setEntry] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [retryAfter, setRetryAfter] = useState(0);
  const [scene,setScene]=useState(()=>new URLSearchParams(location.search).has('create')?'switch':new URLSearchParams(location.search).get('family_scene')==='book'?'book':'home');
  const [install,setInstall]=useState(false), [intent,setIntent]=useState(false);
  const [deliveryReturn,setDeliveryReturn]=useState('settings');
  const [guideActive,setGuideActive]=useState(false);
  const [,refreshGuide]=useState(0);
  const [seconds,setSeconds]=useState(0);
  const actionLock=useRef(false), checkoutChecked=useRef(false);
  const loadedFor=useRef(''), identity=useRef(null);
  const [subjectName, setSubjectName] = useState(''), [createConsent, setCreateConsent] = useState(false);
  const creationKey = useRef(crypto.randomUUID());
  const [inviteUrl, setInviteUrl] = useState(''), [question, setQuestion] = useState('');
  const [together, setTogether] = useState(false), [text, setText] = useState('');
  const [blob, setBlob] = useState(null), [recording, setRecording] = useState(false);
  const [continuation, setContinuation] = useState(null), [playback, setPlayback] = useState(null);
  const recorder = useRef(null), stream = useRef(null), uploaded = useRef(null), cooldown = useRef(0);
  const [inviteToken, setInviteToken] = useState(() => {
    if(!release.subjectConnection)return '';
    const token = new URLSearchParams(location.hash.slice(1)).get('connect');
    if (/^[a-f0-9]{64}$/.test(token || '')) {
      sessionStorage.setItem('family-connect-pending', token);
      history.replaceState(null, '', location.pathname + location.search);
      return token;
    }
    return sessionStorage.getItem('family-connect-pending') || '';
  });
  const run = async (task, authOperation = false) => {
    if (actionLock.current) return;
    actionLock.current=true;
    setBusy(true); setMessage('');
    try { await task(); } catch (error) {
      // Never display backend errors containing a token/phone or data from another Person.
      setMessage(authOperation ? familyAuthFeedback(error) : error?.name==='NotAllowedError' ? 'マイクの利用を許可してください。ブラウザの設定から変更できます。' : error?.message?.includes('rollout') ? 'TESTの接続準備中です。まだ接続を開始できません。' : '操作を完了できませんでした。入力と接続状態を確認し、もう一度お試しください。');
    } finally { setBusy(false); actionLock.current=false; }
  };
  useEffect(() => {
    if (!retryAfter) return;
    const timer = setTimeout(() => setRetryAfter(Math.max(0, Math.ceil((cooldown.current-Date.now())/1000))), 1000);
    return () => clearTimeout(timer);
  }, [retryAfter]);
  const open = async p => {
    const userId=identity.current;
    const next = await api.workspace(p);if(identity.current!==userId)return;setWorkspace(next);
    setQuestion(familyJourney(next).next?.id || '');
    setTogether(false);setInviteUrl('');setIntent(false);
    setBlob(null); uploaded.current = null; setContinuation(null); setPlayback(null); setText('');
    return next;
  };
  const reload = async selected => {
    const userId=identity.current;
    const items = await api.list();if(identity.current!==userId)return;setList(items);
    const requested=selected || new URLSearchParams(location.search).get('family_project');
    if (requested && items.some(i=>i.project_id===requested)) await open(requested);
    else if(items.length === 1) await open(items[0].project_id);
  };
  useEffect(() => {
    let mounted = true;
    const accept=next=>{if(!mounted)return;if(identity.current!==next?.user?.id){identity.current=next?.user?.id;loadedFor.current='';setWorkspace(null);setList([]);setBlob(null);setPlayback(null);setInviteUrl('');stream.current?.getTracks().forEach(t=>t.stop());}setSession(next);};
    client.auth.getSession().then(({data}) => accept(data?.session || null)).catch(()=>accept(null));
    const {data} = client.auth.onAuthStateChange((_event, next) => accept(next));
    return () => { mounted = false; data.subscription.unsubscribe(); stream.current?.getTracks().forEach(t=>t.stop()); };
  }, [client]);
  useEffect(() => {
    if (session && !inviteToken && !busy && loadedFor.current!==session.user.id) {
      loadedFor.current=session.user.id;run(() => reload());
    }
    // A connection claim is only executed by the explicit consent button.
  }, [session?.user?.id, inviteToken, busy]);
  useEffect(()=>{
    window.scrollTo(0,0);
  },[scene]);
  useEffect(()=>{
    if(workspace?.role==='subject' && session?.user && !installWasShown(session.user.id))setInstall(true);
  },[workspace?.role,session?.user?.id]);
  useEffect(()=>{setGuideActive(false);},[workspace?.person_id,session?.user?.id]);
  useEffect(()=>{
    if(!recording)return;
    const timer=setInterval(()=>setSeconds(s=>s+1),1000);
    return ()=>clearInterval(timer);
  },[recording]);
  useEffect(()=>{if(recording && seconds>=300)recorder.current?.stop();},[seconds,recording]);
  useEffect(()=>{
    if(!recording && !blob)return;
    const prevent=e=>{e.preventDefault();e.returnValue='';};
    window.addEventListener('beforeunload',prevent);
    return ()=>window.removeEventListener('beforeunload',prevent);
  },[recording,blob]);
  useEffect(()=>{
    const params=new URLSearchParams(location.search), sid=params.get('session_id');
    if(!session || !workspace || checkoutChecked.current || params.get('checkout')!=='success' || !sid)return;
    checkoutChecked.current=true;
    run(async()=>{const {error,data}=await client.functions.invoke('sync-checkout-session',{body:{sessionId:sid}});if(error || data?.success===false)throw error||Error('sync');await open(workspace.project_id);setMessage('購入状態を確認しました。');
      history.replaceState(null,'',`/?app=1&family=1&family_project=${workspace.project_id}`);
    });
  },[session?.user?.id,workspace?.project_id]);
  const connect = async () => {
    const project = await api.claim(inviteToken, consent);
    sessionStorage.removeItem('family-connect-pending'); setInviteToken('');
    await reload(project); setMessage('接続できました。同じ物語の続きを、このスマートフォンで語れます。');
  };
  const startRecording = async () => {
    if (!question || (workspace.role === 'supporter' && !together)) return;
    stream.current = await navigator.mediaDevices.getUserMedia({audio: true});
    const mime = ['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
    if (!mime) {stream.current.getTracks().forEach(t=>t.stop()); throw Error('録音に対応していません');}
    const instance = new MediaRecorder(stream.current, {mimeType: mime}); recorder.current = instance;
    const chunks = [];
    instance.ondataavailable = event => {if (event.data.size) chunks.push(event.data);};
    instance.onstop = () => { setBlob(new Blob(chunks, {type:mime})); setRecording(false); stream.current?.getTracks().forEach(t=>t.stop()); uploaded.current = null; };
    instance.onerror = () => { setRecording(false); stream.current?.getTracks().forEach(t=>t.stop()); setMessage('録音できませんでした。もう一度お試しください。'); };
    setBlob(null);setSeconds(0); instance.start(); setRecording(true);
  };
  const save = async () => {
    const savingUser=session.user.id;
    const guided=guideActive && workspace.role==='subject';
    uploaded.current ||= await api.reserve(workspace.project_id, blob, 'audio');
    await api.commitRecording(uploaded.current, question, text, continuation);
    if(identity.current!==savingUser)return;
    const refreshed=await open(workspace.project_id);if(!refreshed)return;
    if(workspace.role==='subject')finishFirstStoryGuide(session.user.id,workspace.person_id);
    refreshGuide(n=>n+1);setGuideActive(false);
    setScene(guided?'firstSaved':'home'); setMessage(guided?'':'語りを保存しました。');
  };
  const journey=workspace? familyJourney(workspace):null;
  const producer=canProduce(workspace);
  // Existing stories are progress, even on a new device or after operator adoption.
  const guidePending=workspace?.role==='subject' && !(workspace.answers?.length>0) &&
    firstStoryGuideState(session?.user?.id,workspace.person_id)==='pending';
  const guideWelcome=Boolean(session && !inviteToken && workspace && !install && scene==='home' && guidePending && !guideActive && firstStoryDestination(workspace).scene!=='home');
  const startGuidedQuestion=next=>{
    const destination=firstStoryDestination(next);
    if(destination.questionId)setQuestion(destination.questionId);
    setGuideActive(destination.scene!=='home');setMessage('');setIntent(false);setScene(destination.scene);
  };
  const goQuestion=()=>{
    setIntent(false);
    if(workspace.role==='supporter' && workspace.access?.paid && !producer){setScene('delegation');return;}
    if(['purchase','startingConsent','mainConsent','inactive'].includes(journey.stage)){setScene(journey.stage);return;}
    if(producer && workspace.theme_navigation && renderTheme){setScene('theme');return;}
    if(!question){setScene('questions');return;}
    if(renderRecording && workspace.role==='supporter'){
      if(!window.confirm('ご本人と一緒にいて、録音の同意を確認しましたか？'))return;
      setTogether(true);
    }
    setScene('record');
  };
  const selectRecording=(id,answerId=null)=>{
    if(!workspace?.questions.some(q=>q.id===id && q.available))return;
    if(renderRecording && workspace.role==='supporter'){
      if(!window.confirm('ご本人と一緒にいて、録音の同意を確認しましたか？'))return;
      setTogether(true);
    }
    setQuestion(id);setContinuation(answerId);setScene('record');
  };
  const homeAction=action=>{
    if(action==='question')goQuestion();
    else if(action==='book' && !workspace.access?.paid)setScene('purchase');
    else setScene(action);
  };
  const home=Boolean(session && !inviteToken && workspace && scene==='home' && !install && !guideWelcome);
  const recordingQuestion=workspace?.questions.find(q=>q.id===question && q.available);
  const advanceRecording=async()=>{
    const refreshed=await open(workspace.project_id);
    if(!refreshed)return;
    const next=familyJourney(refreshed);
    if(['purchase','startingConsent','mainConsent','inactive'].includes(next.stage)){setScene(next.stage);return;}
    if(canProduce(refreshed) && refreshed.theme_navigation && renderTheme){setScene('theme');return;}
    if(BOOK_MILESTONES_ENABLED && recordingQuestion?.group==='starting_motivation'){
      await api.finishChapter(workspace.project_id);await open(workspace.project_id);setScene('mainConsent');return;
    }
    const following=refreshed.questions.find(q=>q.available && !q.answered && !q.skipped && q.id!==question && q.group===recordingQuestion.group
      && (!recordingQuestion.theme_code || q.theme_code===recordingQuestion.theme_code));
    if(!following){setScene('home');return;}
    setQuestion(following.id);setTogether(workspace.role==='supporter');setScene('record');
  };
  if(session && !inviteToken && !install && scene==='record' && recordingQuestion && renderRecording &&
    (workspace.role==='subject' || together)) return renderRecording({
      key:`${workspace.project_id}:${question}:${continuation || 'new'}`,client,api,workspace,
      question:recordingQuestion,continuation,
      onSaved:async()=>{
        const userId=identity.current;
        const refreshed=await api.workspace(workspace.project_id);
        if(identity.current!==userId)return;
        setWorkspace(refreshed);
        if(workspace.role==='subject')finishFirstStoryGuide(session.user.id,workspace.person_id);
        setGuideActive(false);refreshGuide(n=>n+1);
        if(canProduce(refreshed) && refreshed.theme_navigation && renderTheme){setScene('theme');return true;}
      },
      onBack:()=>run(async()=>{await open(workspace.project_id);setScene('home');}),
      onStories:()=>run(async()=>{await open(workspace.project_id);setScene('stories');}),
      onNext:()=>run(advanceRecording),
      onSkip:async()=>{await api.skipQuestion(workspace.project_id,question);await advanceRecording();},
      onClosing:async()=>{await open(workspace.project_id);setScene('closingComplete');},
    });
  if(session && producer && scene==='closingComplete')return <div className="fixed inset-0 bg-[#0f172a] text-white p-6"><div className="max-w-[600px] mx-auto"><JourneyClosing onBook={()=>setScene('book')} onStories={()=>setScene('stories')}/></div></div>;
  if(session && !inviteToken && !install && producer && ['theme','mainConsent'].includes(scene) && renderTheme) return renderTheme({workspace,api,
    notificationLabel:release.test?'TESTでは通知を送りません':'ご自身のペースで進められます',
    onDeliverySettings:renderDelivery ? async fresh=>{if(identity.current!==session.user.id)return;setWorkspace(fresh);setDeliveryReturn('theme');setScene(fresh.role==='subject'?'delivery':'settings');} : undefined,
    onNavigate:async(fresh,destination)=>{
      if(identity.current!==session.user.id)return;
      if(destination==='closing'){
        const {data:id,error}=await client.rpc('book_ensure_closing',{p:fresh.project_id});
        if(error)throw error;
        const updated=await api.workspace(fresh.project_id);
        if(identity.current!==session.user.id)return;
        setWorkspace(updated);setContinuation(null);
        if(!id){setScene('book');return;}
        const closing=updated.questions.find(q=>q.id===id);
        if(!closing)throw Error('Closing question unavailable');
        if(closing.answered){setScene('closingComplete');return;}
        if(updated.role==='supporter' && !window.confirm('ご本人と一緒にいて、録音の同意を確認しましたか？')){setScene('stories');return;}
        setQuestion(id);setTogether(updated.role==='supporter');setScene('record');return;
      }
      setWorkspace(fresh);setContinuation(null);
      const next=familyJourney(fresh).next;
      if(destination==='question' && next){
        if(fresh.role==='supporter' && !window.confirm('ご本人と一緒にいて、録音の同意を確認しましたか？')){setScene('home');return;}
        setTogether(fresh.role==='supporter');setQuestion(next.id);setScene('record');
      }
      else setScene(destination==='question'?'stories':destination);
    },
  });
  if(session && !inviteToken && !install && workspace?.role==='subject' && scene==='delivery' && renderDelivery) return renderDelivery({workspace,client,session,
    onBack:async()=>{const fresh=await open(workspace.project_id);if(fresh)setScene(deliveryReturn);},
  });
  if(session && producer && scene==='book' && renderBook) return renderBook({workspace,session,onBack:()=>setScene('home')});
  if(session && !inviteToken && !install && workspace?.role==='supporter' && !producer && scene==='stories' && renderSharedStories) return renderSharedStories({workspace,api,onBack:()=>setScene('home')});
  if(session && !inviteToken && !install && producer && scene==='stories' && renderSubjectStories) return renderSubjectStories({workspace,api,client,session,
    onBack:()=>run(async()=>{await open(workspace.project_id);setScene('home');}),onNext:goQuestion,
    onSaved:async()=>{const next=await api.workspace(workspace.project_id);if(identity.current===session.user.id)setWorkspace(next);},
  });
  if(session && !inviteToken && !install && workspace?.role==='supporter' && !producer && scene==='photo' && renderSupporterPhoto) return renderSupporterPhoto({workspace,api,onBack:()=>run(async()=>{setScene('home');await open(workspace.project_id);})});
  if(session && !inviteToken && !install && producer && scene==='privacy' && renderPrivacy) return renderPrivacy({workspace,api,session,onBack:()=>run(async()=>{await open(workspace.project_id);setScene('settings');})});
  if(session && !inviteToken && !install && producer && scene==='startingConsent' && renderStarting) return renderStarting({workspace,api,onReady:async(next,questionId)=>{
    if(identity.current!==session.user.id)return;
    setWorkspace(next);setQuestion(questionId);setContinuation(null);
    if(next.role==='supporter' && !window.confirm('ご本人と一緒にいて、録音の同意を確認しましたか？')){setScene('home');return;}
    setTogether(next.role==='supporter');setScene('record');
  }});
  if(session && !inviteToken && !install && producer && scene==='photo' && renderSubjectPhoto) return renderSubjectPhoto({workspace,api,client,
    onSaved:async()=>{const next=await api.workspace(workspace.project_id);if(identity.current===session.user.id)setWorkspace(next);},
    onBack:()=>run(async()=>{await open(workspace.project_id);setScene('home');}),
    onStories:()=>run(async()=>{await open(workspace.project_id);setScene('stories');}),
  });
  if (session === undefined) return <main className="family-test"><p>準備しています…</p></main>;
  return <main className={`family-test${home?' family-home':''}`}>
    {!home && <h1>{workspace ? `${workspace.name}さんの物語` : '縦糸横糸'}</h1>}
    <p role="status" aria-live="polite">{message}</p>
    {session && workspace?.role==='subject' && scene==='settings' && !inviteToken && !install && <FamilyProductionSupporters key={`${session.user.id}:${workspace.project_id}`} api={api} projectId={workspace.project_id}/>}
    {session && workspace && !inviteToken && !home && !install && !guideWelcome && scene!=='firstSaved' && <button className="secondary" disabled={recording || busy || Boolean(blob)} onClick={()=>{setScene('home');setGuideActive(false);setPlayback(null);}}>ホームへ</button>}
    {install && session && workspace && <HomeInstall userId={session.user.id} onDone={()=>{setInstall(false);setScene('home');}}/>}
    {guideWelcome && <section className="first-story-guide" aria-labelledby="first-story-title">
      <h2 id="first-story-title">まずは、ひとつ<br/>話してみましょう。</h2>
      <p>質問を見て、思い浮かんだことを話すだけ。<br/>うまくまとめなくても大丈夫です。</p>
      <button disabled={busy} onClick={()=>startGuidedQuestion(workspace)}>最初の問いを見る</button>
      <button className="entry-back" disabled={busy} onClick={()=>{finishFirstStoryGuide(session.user.id,workspace.person_id,'dismissed');refreshGuide(n=>n+1);}}>今はホームへ</button>
    </section>}
    {session && workspace?.role==='subject' && scene==='firstSaved' && <section className="first-story-guide" aria-labelledby="first-saved-title">
      <h2 id="first-saved-title">語りが残りました。</h2>
      <p>次からは、ホームの「次の問いへ」から<br/>続けられます。</p>
      <button onClick={()=>setScene('home')}>ホームへ</button>
    </section>}
    {home && workspace.role==='subject' && <HomePage model={journey.model} sky={null} onAction={homeAction}/>}
    {home && workspace.role==='supporter' && <section className="supporter-home">
      <button className="family-switch" onClick={()=>setScene('switch')}>物語を切り替える</button>
      <h1>{workspace.name}さんの物語</h1>
      <p>{journey.model.theme.label} <small>{workspace.answered===null?'':`${journey.model.theme.answered} / ${journey.model.theme.total}`}</small></p>
      {workspace.last_saved_at && <p className="family-note">最後の語り　{new Intl.DateTimeFormat('ja-JP',{month:'long',day:'numeric'}).format(new Date(workspace.last_saved_at))}</p>}
      <button onClick={goQuestion}>一緒に語る</button>
      <button className="secondary" onClick={()=>setScene('photo')}>写真を添える　〉</button>
      <button className="secondary" onClick={()=>setScene('stories')}>{producer?'語りを確認・編集する':'共有された語り'}　〉</button>
      {producer && <><button className="secondary" onClick={()=>setScene(workspace.access?.paid?'book':'purchase')}>本をつくる・仕上げる　〉</button><button className="secondary" onClick={()=>setScene('privacy')}>家族への共有設定　〉</button></>}
      {!producer && <button className="secondary" onClick={()=>{setIntent(false);setScene('delegation');}}>制作をおまかせしてもらう　〉</button>}
      {release.subjectConnection && <button className="secondary" onClick={()=>setScene('device')}>ご本人のスマホ　{workspace.connected?'接続済み':''}　〉</button>}
      {!workspace.access?.paid && <button className="secondary" onClick={()=>setScene('purchase')}>物語の続きを贈る　〉</button>}
    </section>}
    {!session && !entry && (inviteToken ? <section>
      <h2>あなたの物語を、<br/>このスマホでも。</h2>
      <button onClick={()=>setEntry('subject')}>このスマホで続ける</button>
      <button className="entry-back" onClick={()=>{sessionStorage.removeItem('family-connect-pending');setInviteToken('');setMessage('');}}>別の入口へ</button>
    </section> : <section className="family-entry" aria-label="使い方を選ぶ">
      {release.subjectConnection && <button className="entry-card" onClick={()=>setEntry('subject')}><span>ご自身の物語を語る</span><span aria-hidden="true">〉</span><small>初めての方も、続きからの方も</small></button>}
      <button className="entry-card" onClick={()=>setEntry('supporter')}><span>ご家族の物語を支える</span><span aria-hidden="true">〉</span><small>進捗を見る・写真を添える</small></button>
    </section>)}
    {!session && entry==='supporter' && <section>
      <h2>お手伝いする方のログイン</h2>
      <p>ご自身のメールアドレスで入ります。</p>
      <button onClick={()=>onOwnStory?onOwnStory():location.assign('/?app=1')}>メールでログインへ</button>
      <button className="entry-back" onClick={()=>setEntry('')}>戻る</button>
    </section>}
    {!session && entry==='subject' && <section>
      <h2>ご本人のスマホで続ける</h2>
      <label>語るご本人の携帯電話番号<input type="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} disabled={sent || busy}/></label>
      {!sent ? <button disabled={busy || retryAfter>0} onClick={()=>run(async()=>{
        const normalized = japaneseMobile(phone);
        const {error}=await client.auth.signInWithOtp({phone:normalized,options:{shouldCreateUser:Boolean(inviteToken)}});
        if(error) throw error; cooldown.current=Date.now()+60000; setRetryAfter(60); setPhone(normalized); setSent(true);
        setMessage('SMSを送信しました。最後に届いた6桁の番号を入力してください。');
      },true)}>{busy?'SMSを送信しています…':retryAfter>0?`あと${retryAfter}秒でSMSを送れます`:'SMSで確認番号を受け取る'}</button> : <>
        <label>SMSに届いた6桁の番号<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label>
        <button disabled={busy || code.length!==6} onClick={()=>run(async()=>{
          const token=code; setCode('');
          const {error}=await client.auth.verifyOtp({phone,token,type:'sms'}); if(error) throw error;
        },true)}>{busy?'確認しています…':'確認する'}</button>
        <button className="secondary" disabled={busy} onClick={()=>{setSent(false);setCode('');}}>電話番号を確認する</button>
      </>}
      <p className="family-note">ご家族が隣で操作を手伝っても大丈夫です。</p>
      {!inviteToken && !sent && <>
        <a className="entry-back" href="/?app=1&entry=trial">初めての方は、無料3問から</a>
        <button className="entry-back" onClick={()=>onOwnStory?onOwnStory():location.assign('/?app=1')}>メールで登録済みの方</button>
      </>}
      <button className="entry-back" disabled={busy} onClick={()=>{setEntry('');setCode('');setMessage('');}}>戻る</button>
    </section>}
    {session && inviteToken && <section>
      <h2>このスマホにつなぐ</h2>
      <p>制作サポーターは、家族への共有設定にかかわらず、語り・音声・写真を確認して本づくりを手伝えます。このスマホをつないでも、同じ物語と制作サポーターの関係を引き継ぎます。</p>
      <label className="check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>私本人の物語として、このスマホで続けます</label>
      <button disabled={busy || !consent} onClick={()=>run(connect)}>このスマホで続ける</button>
      <button className="secondary" disabled={busy} onClick={()=>run(async()=>{const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;})}>同じ携帯番号でSMS確認をする</button>
    </section>}
    {session && !inviteToken && !install && <>
      {(!workspace || scene==='switch' || scene==='settings') && <>
      <nav aria-label="物語を切り替える">
        {onOwnStory && <button className="secondary" onClick={onOwnStory}>わたしの物語</button>}
        {list.map(item=><button key={item.project_id} className="secondary" disabled={busy || recording} onClick={()=>run(async()=>{await open(item.project_id);setScene('home');})}>{item.role==='supporter'?'支えている物語：':''}{item.name}</button>)}
      </nav>
      {onOwnStory && <details><summary>ご家族の物語を始める</summary>
        <label>語る方のお名前<input value={subjectName} maxLength={80} onChange={e=>setSubjectName(e.target.value)}/></label>
        <p>制作サポーターとして、すべての語り・音声・写真を見て、編集・家族への共有設定・本の仕上げをお手伝いします。ご本人のスマホは必須ではありません。</p>
        <label className="check"><input type="checkbox" checked={createConsent} onChange={e=>setCreateConsent(e.target.checked)}/>記録と制作をおまかせで進めることを、ご本人に確認しました</label>
        <button disabled={busy || !createConsent || !subjectName.trim()} onClick={()=>run(async()=>{
          const p=await api.create(subjectName.trim(),true,creationKey.current);
          await api.confirmProduction(p,session.user.id,true);await reload(p);creationKey.current=crypto.randomUUID();setScene('home');
        })}>一緒に始める</button>
      </details>}
      </>}
      {!workspace && <p>{busy?'物語を開いています…':'接続済みの物語がありません。ご家族から届いた接続リンクを開いてください。'}</p>}
      {workspace && <>
        {scene==='delegation' && <section><h2>サポーターにおまかせする</h2>
          <p>{workspace.name}さんのすべての語り・音声・写真を確認し、文章編集、共有設定、本への収録、仕上げ・注文をお手伝いします。一般の家族への共有とは別の制作アクセスです。</p>
          <p>ご本人のスマホなしでも進められます。{release.subjectConnection && 'あとから同じ物語にご本人のスマホをつなげられます。'}</p>
          <label className="check"><input type="checkbox" checked={intent} onChange={e=>setIntent(e.target.checked)}/>この範囲の制作をおまかせで進めることを、ご本人に確認しました</label>
          <button disabled={busy || !intent} onClick={()=>run(async()=>{await api.confirmProduction(workspace.project_id,session.user.id,true);await open(workspace.project_id);setScene('home');})}>確認して進める</button>
        </section>}
        {scene==='questions' && <section><h2>問いを選ぶ</h2>{journey.pool.map(q=><button key={q.id} className="secondary" disabled={!q.available} onClick={()=>selectRecording(q.id)}>{q.text}</button>)}</section>}
        {scene==='inactive' && <section><h2>ご利用状況</h2><p>現在、新しい語りの保存は停止しています。設定からご利用状況を確認してください。</p><button onClick={()=>setScene('settings')}>設定へ</button></section>}
        {scene==='purchase' && <section><h2>物語の続きを残す</h2><p>無料で残した語りも、そのまま一冊へ。</p><p>49,800円（税込）</p><p className="family-note">ご家族が贈る場合の返金保証は決済後45日以内・本編開始前です。制作期間は、ご本人の意向を確認して「はじまりの章」を始めてから1年間です。</p>
          {workspace.role==='supporter' ? <button disabled={busy} onClick={()=>run(async()=>{const {data,error}=await client.functions.invoke('create-checkout-session',{body:{orderType:'self',projectId:workspace.project_id,returnContext:'family',expectedPolicyVersion:'2.0',expectedAmount:49800}});if(error || data?.success===false)throw error||Error('checkout');if(data?.checkoutUrl){const url=new URL(data.checkoutUrl);if(url.protocol!=='https:' || url.hostname!=='checkout.stripe.com')throw Error('checkout');location.assign(url.href);}else{await open(workspace.project_id);setScene('home');}})}>{release.test?'TESTの購入画面へ':'購入画面へ'}</button> : <p>ご家族の画面から、この物語の続きを購入できます。</p>}
        </section>}
        {['startingConsent','mainConsent'].includes(scene) && <section>
          <h2>{scene==='startingConsent'?'はじまりの章':'9つのテーマへ'}</h2>
          {!producer ? <button onClick={()=>{setIntent(false);setScene('delegation');}}>制作の進め方を確認する</button> : <>
            <p>{scene==='startingConsent'?'制作期間の1年間が、ここから始まります。この章だけでは返金保証は終了しません。':'本編を始めると、返金保証の対象外になります。語りたい問いから、あなたのペースで進められます。'}</p>
            <label className="check"><input type="checkbox" checked={intent} onChange={e=>setIntent(e.target.checked)}/>内容を確認し、私の意思で始めます</label>
            <button disabled={busy || !intent} onClick={()=>run(async()=>{await (scene==='startingConsent'?api.startChapter(workspace.project_id):api.startMain(workspace.project_id));const next=await open(workspace.project_id);if(next && guideActive && guidePending)startGuidedQuestion(next);else setScene('home');})}>私の物語を始める</button>
          </>}
        </section>}
        {scene==='record' && renderRecording && <p role="alert">問いを開けませんでした。ホームからもう一度お試しください。</p>}
        {scene==='record' && !renderRecording && <>
        {playback?.kind==='photo' && <img src={playback.url} alt="思い出の写真"/>}
        <h2>{workspace.questions.find(q=>q.id===question)?.text}</h2>
        <details><summary>ほかの問いを選ぶ</summary>
        <label>問い<select value={question} disabled={recording || Boolean(blob)} onChange={e=>setQuestion(e.target.value)}>{workspace.questions.map(q=><option key={q.id} value={q.id} disabled={!q.available}>{q.text}{!q.available?'（続きの利用開始後）':''}</option>)}</select></label>
        </details>
        {workspace.role==='supporter' && <label className="check"><input type="checkbox" checked={together} onChange={e=>setTogether(e.target.checked)} disabled={recording}/>ご本人と一緒にいて、録音の同意を確認しました</label>}
        {guideActive && guidePending && !recording && !blob && <p className="first-record-help">マイクを押してから、お話しください。</p>}
        {recording ? <><p role="timer">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</p><button onClick={()=>recorder.current?.stop()}>録音を終える</button></> : <button disabled={busy || !question || Boolean(blob) || (workspace.role==='supporter' && !together)} onClick={()=>run(startRecording)}>マイクを押して話す</button>}
        {fixtureUpload && <label className="file">検証用音声を選ぶ（録音の代用）<input type="file" accept="audio/mp4,audio/webm,audio/aac,.m4a" disabled={busy || recording || !question || (workspace.role==='supporter' && !together)} onChange={e=>{
          const file=e.target.files[0];e.target.value='';
          if(file){setBlob(file);uploaded.current=null;setMessage('検証用音声を選びました。保存ボタンを押すまでは送信されません。');}
        }}/></label>}
        {blob && <section><p>録音できました。</p><details><summary>言葉を添える（任意）</summary><textarea aria-label="言葉を添える" value={text} onChange={e=>setText(e.target.value)}/></details><button disabled={busy} onClick={()=>run(save)}>保存する</button><button className="secondary" disabled={busy} onClick={()=>{setBlob(null);uploaded.current=null;}}>録り直す</button></section>}
        </>}
        {scene==='photo' && <>
        <h2>{workspace.role==='subject'?'写真から、記憶を辿る':'写真を添える'}</h2>
        <label className="file">写真を添える<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const file=e.target.files[0];e.target.value='';if(file)run(async()=>{const u=await api.reserve(workspace.project_id,file,'photo');await api.commitPhoto(u);await open(workspace.project_id);setMessage('写真を届けました。');});}}/></label>
        {workspace.photos.map(photo=><button className="secondary" key={photo.id} onClick={()=>run(async()=>setPlayback({kind:'photo',url:await api.mediaUrl('photo',photo.path)}))}>写真を見る</button>)}
        {playback?.kind==='photo' && <><img src={playback.url} alt="思い出の写真"/><button onClick={goQuestion}>この写真を見ながら語る</button></>}
        </>}
        {scene==='stories' && <>
        <h2>{workspace.role==='subject'?'わたしの語り':'共有された語り'}</h2>
        {!workspace.answers.length && <p>まだ語りがありません。</p>}
        {workspace.answers.map(a=><article key={a.id}>
          <p>{a.text || '声の記録'}</p>
          {workspace.role==='subject' && <button className="secondary" disabled={busy} onClick={()=>run(async()=>{await api.share(a.id,a.private);await open(workspace.project_id);})}>{a.private?'自分だけ → 家族へ共有する':'共有中 → 自分だけにする'}</button>}
          {a.media.filter(m=>m.kind==='audio').map(m=><button className="secondary" key={m.path} onClick={()=>run(async()=>setPlayback({kind:'audio',url:await api.mediaUrl('audio',m.path)}))}>声を聴く</button>)}
          <button className="secondary" disabled={recording || Boolean(blob)} onClick={()=>selectRecording(a.question_id,a.id)}>続きを語る</button>
        </article>)}
        {playback?.kind==='audio' && <audio src={playback.url} controls autoPlay/>}
        </>}
        {release.subjectConnection && scene==='device' && workspace.role==='supporter' && <section><h2>ご本人のスマホ {workspace.connected?'接続済み':''}</h2>{!workspace.connected && <>
          <label>ご本人の携帯電話番号<input type="tel" value={phone} onChange={e=>setPhone(e.target.value)}/></label>
          <button disabled={busy} onClick={()=>run(async()=>{const invite=await api.issue(workspace.project_id,phone);setInviteUrl(familyInvitationUrl(location.origin,invite.token));})}>接続リンクを用意する</button>
          {inviteUrl && <><a href={`https://line.me/R/share?text=${encodeURIComponent('縦糸横糸の続きを、このスマホで語れます。\n'+inviteUrl)}`} target="_blank" rel="noreferrer">LINEで送る</a><button className="secondary" onClick={()=>run(()=>navigator.clipboard.writeText(inviteUrl))}>リンクをコピー</button></>}
        </>}{workspace.connected && <>
          <a href={`https://line.me/R/share?text=${encodeURIComponent('縦糸横糸の続きを、こちらから開けます。\n'+location.origin+'/?app=1&family=1')}`} target="_blank" rel="noreferrer">いつもの入口をLINEで送る</a>
          <button className="secondary" onClick={()=>run(()=>navigator.clipboard.writeText(location.origin+'/?app=1&family=1'))}>入口のリンクをコピー</button>
        </>}</section>}
        {scene==='family' && workspace.role==='subject' && <section><h2>家族とのつながり</h2><label className="check"><input type="checkbox" checked={workspace.progress_enabled} onChange={e=>run(async()=>{await api.progress(workspace.project_id,e.target.checked);await open(workspace.project_id);})}/>見守り中の支援者に件数と最後に保存した日を伝える</label><p>制作を任せたサポーターは、この設定にかかわらず制作中の語り・素材を確認できます。一般の家族への内容共有は別に設定します。</p></section>}
        {scene==='settings' && <section><h2>設定</h2>{workspace.role==='subject' && renderPrivacy && <button className="secondary" onClick={()=>setScene('privacy')}>語りごとの非公開設定</button>}{workspace.role==='subject' && renderDelivery && <button className="secondary" onClick={()=>{setDeliveryReturn('settings');setScene('delivery');}}>問いの届け方</button>}<button className="secondary" onClick={()=>setInstall(true)}>ホーム画面への追加方法</button><button className="secondary" disabled={busy} onClick={()=>run(async()=>{const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;})}>この端末からログアウト</button></section>}
        {home && producer && journey.stage==='starting' && journey.starting.filter(q=>q.group!=='starting_motivation' && q.answered).length>=3 && <button disabled={busy} onClick={()=>run(async()=>{
          const opening=workspace.questions.find(q=>q.group==='starting_motivation' && q.available && !q.answered && !q.skipped);
          if(BOOK_MILESTONES_ENABLED && opening){selectRecording(opening.id);return;}
          await api.finishChapter(workspace.project_id);await open(workspace.project_id);setScene('mainConsent');
        })}>{BOOK_MILESTONES_ENABLED?'はじまりの章の最後の問いへ':'はじまりの章を終える'}</button>}
      </>}
    </>}
  </main>;
}
