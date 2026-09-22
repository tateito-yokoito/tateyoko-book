import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Scene1_MyPage,Scene_Recording,Scene3_5_VoiceCheck} from './App.jsx';
import {createMilestoneService,isClosing,videoAvailability,audioAvailability} from './lib/bookMilestones.js';

export function JourneyClosing({onBook,onStories}){
  return <section className="flow-scene-shell text-center flex flex-col justify-center p-6">
    <h1 className="text-narrative text-xl leading-loose">人生を辿る旅を、終えました。</h1>
    <p className="mt-8 leading-loose text-white/65">語ってきた声と言葉、写真は、<br/>ここから一冊の物語になっていきます。</p>
    <button className="btn-quiet mt-10 py-4 rounded-full bg-white/10" onClick={onBook}>本を仕上げる</button>
    <button className="mt-5 py-3 text-white/50" onClick={onStories}>語りを見る</button>
  </section>;
}

export default function BookMilestoneFlow({client,projectId,question,userName,mode='initial',onDone,onBack}){
  const qid=question.user_question_id || question.id;
  const service=useMemo(()=>createMilestoneService(client,projectId,qid,mode),[client,projectId,qid,mode]);
  const [context,setContext]=useState(null),[phase,setPhase]=useState(mode==='initial'?'question':'capture'),[data,setData]=useState({}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const part=useRef(null),live=useRef(true),lock=useRef(false);
  const release=()=>{for(const k of ['audioUrl','videoUrl'])if(part.current?.[k])URL.revokeObjectURL(part.current[k]);part.current=null;};
  useEffect(()=>{live.current=true;service.context().then(c=>{if(live.current)setContext(c);}).catch(e=>{if(live.current)setError(e.message);});return()=>{live.current=false;release();};},[service]);
  useEffect(()=>{
    if(phase!=='capture' && phase!=='review')return;
    const prevent=e=>{e.preventDefault();e.returnValue='';};
    window.addEventListener('beforeunload',prevent);
    return()=>window.removeEventListener('beforeunload',prevent);
  },[phase]);
  const process=async capture=>{
    if(lock.current)return;lock.current=true;if(capture)part.current=capture;
    setPhase('review');setError('');setData({audioUrl:part.current.audioUrl,videoUrl:part.current.videoUrl,transcriptionStatus:'processing',polishStatus:'processing',editRecordingMode:mode});
    try{const d=await service.process(part.current,context);if(live.current)setData(d);}
    catch(e){if(live.current){setError(e.message);setData(d=>({...d,transcriptionStatus:'error',polishStatus:'error'}));}}
    finally{lock.current=false;}
  };
  const finish=async skip=>{
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{if(skip)await service.skip();else await service.save(part.current,data);await onDone({skipped:skip,closing:isClosing(question),mode});}
    catch(e){if(live.current)setError(e.message);}
    finally{lock.current=false;if(live.current)setBusy(false);}
  };
  return <div className="fixed inset-0 z-[9999] bg-[#0f172a] text-white overflow-y-auto"><main className="max-w-[600px] mx-auto min-h-[100dvh] p-6" data-milestone-phase={phase}>
    {error&&<p role="alert" className="text-rose-200 p-3">{error}</p>}
    {!context?<><p>{error?'一覧から開き直してください。':'語りを開いています…'}</p><button onClick={onBack} className="mt-8 py-3">戻る</button></>:<>
      {phase==='question'&&<>{isClosing(question)&&<p className="text-center text-white/60 py-4">ここまで人生を辿ってきました。</p>}<Scene1_MyPage milestone question={{...question,progress_label:'',content:context.text,prompt_hint:context.hint,chapter_label:isClosing(question)?'おわりの章':'はじまりの章'}} progress={{currentIndex:0,total:1}} userName={userName} onNext={()=>setPhase('capture')} onSkip={()=>finish(true)} onEndToday={onBack}/></>}
      {phase==='capture'&&<Scene_Recording question={{...question,content:context.text}} userName={userName} milestoneCapture={{videoBlocked:videoAvailability(context,mode),audioBlocked:audioAvailability(context,mode),onComplete:process,onBack:()=>mode==='initial'?setPhase('question'):onBack()}}/>}
      {phase==='review'&&<><div className={busy?'pointer-events-none opacity-60':''}><Scene3_5_VoiceCheck data={data} onRetry={()=>{release();setData({});setError('');setPhase('capture');}} onRetryTranscription={()=>process()} onSelectStyle={s=>setData(d=>({...d,selectedStyle:s,editedText:d[{clean:'transcriptClean',readable:'transcriptReadable',essay:'transcriptEssay'}[s]]||d.transcript}))} onUpdateText={(s,text)=>setData(d=>({...d,selectedStyle:s,editedText:text}))} onProceed={()=>finish(false)}/></div>{busy&&<p role="status">保存しています…</p>}</>}
    </>}
  </main></div>;
}
