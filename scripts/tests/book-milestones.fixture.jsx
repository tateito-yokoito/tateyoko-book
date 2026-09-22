// Local component fixture only. No external API, account, microphone or camera.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import BookMilestoneFlow,{JourneyClosing} from '../../src/BookMilestoneFlow.jsx';
import {Scene1_MyPage,Scene_Recording,Scene3_5_VoiceCheck} from '../../src/App.jsx';
import {OPENING_TEXT,OPENING_HINTS,CLOSING_TEXT,CLOSING_HINT} from '../../src/lib/bookMilestones.js';
if(!navigator.mediaDevices)Object.defineProperty(navigator,'mediaDevices',{value:{}});
Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{
 const status=document.getElementById('media-request-count');
 status.textContent=String(Number(status.textContent)+1);
 return new MediaStream();
}});
window.MediaRecorder=class {
 static isTypeSupported(){return true;}
 constructor(stream,options){this.state='inactive';this.mimeType=options.mimeType;}
 start(){this.state='recording';} pause(){this.state='paused';} resume(){this.state='recording';}
 stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['SYNTHETIC TEST RECORDING'],{type:this.mimeType})});queueMicrotask(()=>this.onstop?.());}
};
const params=new URLSearchParams(location.search),which=params.get('case') || 'menu',mode=params.get('mode') || 'initial';
const closing=which==='closing';
const q={user_question_id:'question',id:closing?'TY_CLOSING01':'TY_ONB04',chapter_label:closing?'おわりの章':'はじまりの章',onboarding_group:closing?'closing_reflection':'starting_motivation',answer_formats:['audio','video'],content:closing?CLOSING_TEXT:OPENING_TEXT};
let hasVideo=params.has('video'),videoCount=hasVideo?1:0;
const audioPartCount=Number(params.get('audio') || 0);
const sampleText='今までを振り返って、支えてくれた人への感謝が浮かびました。';
const calls=[];
const client={
 rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='book_milestone_context')return {data:{revision:'revision',text:q.content,hint:closing?CLOSING_HINT:'話すヒント（すべてに答える必要はありません）\n'+OPENING_HINTS.map(x=>'・'+x).join('\n'),hasVideo,videoCount,audioPartCount,textBody:mode==='initial'?'':'前の語り'}};
  if(name==='book_milestone_reserve')return {data:{id:'upload',answer_id:'answer',audio_path:'audio/test',video_path:args.format==='video'?'video/test':null}};
  return {data:'answer'};
 },
 storage:{from:()=>({upload:async()=>({error:null})})},
 functions:{invoke:async()=>({data:{success:true,transcript_raw:'今までを振り返って、支えてくれた人への感謝が浮かびました。',transcript_readable:'今までを振り返って、支えてくれた人への感謝が浮かびました。'}})},
};
function Fixture(){
 const [done,setDone]=useState(false),[phase,setPhase]=useState('question');
 const [review,setReview]=useState(null);
 if(which==='menu')return <nav className="p-6 space-y-6"><p className="text-sm text-white/50">縦糸横糸 · 操作感プレビュー</p><h1 className="text-2xl">二つの節目と、語る体験</h1><p className="text-white/60 leading-loose">まずは下の3つをお試しください。<br/>マイク・カメラは使わず、収録と保存を模擬します。確認画面にはサンプル文章が入ります。</p>{[['normal','通常質問','「語る」→ 録音画面 → 自分で開始'],['opening','はじまりの章・第4問','質問・ヒントと、音声／動画の切替'],['closing','おわりの章','回答またはスキップ → 本を仕上げる']].map(([c,title,detail])=><a className="preview-card" key={c} href={`/?case=${c}`}><strong>{title}</strong><span>{detail}</span></a>)}<details><summary>語り直し・語り足しも確認する</summary><div className="space-y-4 mt-5"><p><a href="/?case=opening&mode=append&video=1">動画あり → 音声で語り足す</a></p><p><a href="/?case=opening&mode=replace&video=1">動画あり → 語り直す</a></p><p><a href="/?case=opening&mode=append&audio=5">音声5本 → 別枠の動画を追加する</a></p></div></details></nav>;
 if(done){
  if(closing && !['book','stories'].includes(phase))return <JourneyClosing onBook={()=>setPhase('book')} onStories={()=>setPhase('stories')}/>;
  return <section className="p-6 space-y-6"><h1 className="text-xl">{phase==='book'?'BOOK仕上げへの接続地点':phase==='stories'?'語り一覧への接続地点':'この操作の確認はここまでです'}</h1><p className="leading-loose text-white/65">{phase==='book'?'実アプリでは既存の本の仕上げ画面へ進みます。このプレビューでは注文・製本は行いません。':closing?'実アプリでは保存した語りの一覧へ戻ります。':'通常質問・はじまりの章の後も、実アプリでは次の問いへ続きます。ここでは操作感だけを確認できます。'}</p><a className="preview-card" href="/">確認メニューに戻る</a><details><summary>検証記録（サンプル）</summary><pre className="text-xs overflow-auto">{JSON.stringify(calls,null,2)}</pre></details></section>;
 }
 if(which==='normal'){
  if(phase==='question')return <Scene1_MyPage question={{content:'好きだった遊びは何ですか？',chapter_label:'幼い頃'}} progress={{currentIndex:0,total:3}} userName="テスト" onNext={()=>setPhase('capture')} onSkip={()=>setDone(true)} onEndToday={()=>setDone(true)}/>;
  if(phase==='review')return <Scene3_5_VoiceCheck data={review} onRetry={()=>setPhase('capture')} onRetryTranscription={()=>{}} onSelectStyle={selectedStyle=>setReview(d=>({...d,selectedStyle}))} onUpdateText={(selectedStyle,editedText)=>setReview(d=>({...d,selectedStyle,editedText}))} onProceed={()=>setDone(true)}/>;
  return <Scene_Recording autoStart question={{content:'好きだった遊びは何ですか？',chapter_label:'幼い頃'}} progress={{currentIndex:0,total:3}} userName="テスト" onComplete={()=>{setReview({transcript:sampleText,transcriptClean:sampleText,transcriptReadable:sampleText,transcriptEssay:sampleText,editedText:sampleText,selectedStyle:'readable',transcriptionStatus:'done',polishStatus:'done'});setPhase('review');}}/>;
 }
 return <BookMilestoneFlow client={client} projectId="test-only" question={q} userName="テスト" mode={mode} onBack={()=>location.assign('/')} onDone={()=>setDone(true)}/>;
}
createRoot(document.getElementById('root')).render(<><div className="app-container"><Fixture/></div><aside className="preview-bar"><a href="/">確認メニュー</a><span>模擬収録・保存なし</span><small>開始 <span id="media-request-count">0</span> 回</small></aside></>);
